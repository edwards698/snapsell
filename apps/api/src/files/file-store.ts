import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { ApiError } from '../common/errors.js';

export type Visibility = 'public' | 'private';

export interface StoredFile {
  key: string;
  mime: string;
  ext: string;
  size: number;
}

export interface SaveOptions {
  /** Allowed MIME types, detected from the file's bytes (never from its name). */
  allow: readonly string[];
  maxBytes?: number;
}

export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;
export const AUDIO_TYPES = [
  'audio/ogg',
  'audio/opus',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/webm',
] as const;
export const DOCUMENT_TYPES = ['application/pdf'] as const;

/**
 * `public/2026/10/<32 hex>.webp`, or `<stem>-640.webp` for a rendition – the only shapes a key can
 * take (prevents path traversal).
 */
const KEY_PATTERN = /^(public|private)\/\d{4}\/\d{2}\/[a-f0-9]{32}(-\d{2,4})?\.[a-z0-9]{2,5}$/;
const STEM_PATTERN = /^(public|private)\/\d{4}\/\d{2}\/[a-f0-9]{32}$/;
const SNIFF_BYTES = 4100;

/**
 * Stores uploads on the server disk (BUILD_PLAN D16). Public files are served as static assets;
 * private files are only reachable through short-lived signed URLs.
 */
@Injectable()
export class FileStore {
  readonly root: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.root = config.paths.uploads;
  }

  savePublic(input: Buffer | Readable, opts: SaveOptions) {
    return this.save('public', input, opts);
  }

  savePrivate(input: Buffer | Readable, opts: SaveOptions) {
    return this.save('private', input, opts);
  }

  async save(
    visibility: Visibility,
    input: Buffer | Readable,
    opts: SaveOptions,
  ): Promise<StoredFile> {
    const maxBytes = opts.maxBytes ?? this.config.uploads.maxBytes;
    const tmpDir = join(this.root, 'tmp');
    await mkdir(tmpDir, { recursive: true });
    const tmp = join(tmpDir, randomBytes(16).toString('hex'));

    try {
      let size = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          size += chunk.length;
          if (size > maxBytes) cb(tooLarge(maxBytes));
          else cb(null, chunk);
        },
      });
      const source = Buffer.isBuffer(input) ? Readable.from([input]) : input;
      await pipeline(source, limiter, createWriteStream(tmp, { mode: 0o600 }));
      if (size === 0)
        throw new ApiError(HttpStatus.BAD_REQUEST, 'EMPTY_FILE', 'The file is empty.');

      const type = await fileTypeFromBuffer(await readHead(tmp));
      if (!type || !opts.allow.includes(type.mime)) {
        throw new ApiError(
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          'UNSUPPORTED_FILE_TYPE',
          'This file type is not supported.',
        );
      }

      const now = new Date();
      const yyyy = String(now.getUTCFullYear());
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const key = `${visibility}/${yyyy}/${mm}/${randomBytes(16).toString('hex')}.${type.ext}`;
      const dest = this.pathFor(key);
      await mkdir(dirname(dest), {
        recursive: true,
        mode: visibility === 'private' ? 0o700 : 0o755,
      });
      await rename(tmp, dest);
      return { key, mime: type.mime, ext: type.ext, size };
    } finally {
      await rm(tmp, { force: true });
    }
  }

  /** Checks bytes against an allow-list and returns the detected type. */
  async sniff(buffer: Buffer, allow: readonly string[]) {
    const type = await fileTypeFromBuffer(buffer.subarray(0, SNIFF_BYTES));
    if (!type || !allow.includes(type.mime)) {
      throw new ApiError(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'UNSUPPORTED_FILE_TYPE',
        'This file type is not supported.',
      );
    }
    return type;
  }

  /** A fresh key stem for a set of renditions, e.g. `public/2026/10/<hex>`. */
  newStem(visibility: Visibility, now = new Date()) {
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${visibility}/${yyyy}/${mm}/${randomBytes(16).toString('hex')}`;
  }

  /** Writes a file the server generated itself (e.g. a resized image) under a valid key. */
  async writeGenerated(key: string, data: Buffer) {
    const dest = this.pathFor(key);
    await mkdir(dirname(dest), {
      recursive: true,
      mode: key.startsWith('private/') ? 0o700 : 0o755,
    });
    const tmp = `${dest}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, data, { mode: 0o644 });
    await rename(tmp, dest);
  }

  /** Removes every rendition of a stem (`<stem>-<w>.<ext>`). */
  async deleteStem(stem: string) {
    if (!STEM_PATTERN.test(stem)) return;
    const dir = dirname(this.pathFor(`${stem}.webp`));
    const prefix = `${stem.slice(stem.lastIndexOf('/') + 1)}-`;
    const names = await readdir(dir).catch(() => [] as string[]);
    await Promise.all(
      names.filter((n) => n.startsWith(prefix)).map((n) => rm(join(dir, n), { force: true })),
    );
  }

  isValidKey(key: string) {
    return KEY_PATTERN.test(key);
  }

  /** Absolute path for a key. Throws for anything that isn't a well-formed key. */
  pathFor(key: string): string {
    if (!this.isValidKey(key))
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'File not found.');
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep))
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'File not found.');
    return full;
  }

  /** URL path for a public file (served by Caddy in production, by the API in development). */
  publicUrl(key: string) {
    if (!key.startsWith('public/')) throw new Error('Not a public file');
    return `/media/${key.slice('public/'.length)}`;
  }

  /** Signed, expiring URL for a private file. */
  signedUrl(key: string, ttlSeconds = 300, now = Date.now()) {
    this.pathFor(key);
    const exp = Math.floor(now / 1000) + ttlSeconds;
    const params = new URLSearchParams({ key, exp: String(exp), sig: this.sign(key, exp) });
    return `/api/files?${params.toString()}`;
  }

  verifySignature(key: string, exp: string, sig: string, now = Date.now()): boolean {
    const expNum = Number(exp);
    if (!this.isValidKey(key) || !Number.isInteger(expNum) || expNum * 1000 < now) return false;
    const expected = Buffer.from(this.sign(key, expNum));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  open(key: string) {
    return createReadStream(this.pathFor(key));
  }

  async stat(key: string) {
    try {
      return await stat(this.pathFor(key));
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.pathFor(key), { force: true });
  }

  async usage() {
    const [publicBytes, privateBytes] = await Promise.all([
      dirSize(join(this.root, 'public')),
      dirSize(join(this.root, 'private')),
    ]);
    return { publicBytes, privateBytes };
  }

  async disk() {
    await mkdir(this.root, { recursive: true });
    const s = await statfs(this.root);
    const totalBytes = s.blocks * s.bsize;
    const freeBytes = s.bavail * s.bsize;
    const usedPercent = totalBytes
      ? Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10
      : 0;
    return { totalBytes, freeBytes, usedPercent };
  }

  private sign(key: string, exp: number) {
    return createHmac('sha256', this.config.secrets.fileSigning)
      .update(`${key}.${exp}`)
      .digest('base64url');
  }
}

function tooLarge(maxBytes: number) {
  const mb = Math.round((maxBytes / 1024 / 1024) * 10) / 10;
  return new ApiError(
    HttpStatus.PAYLOAD_TOO_LARGE,
    'FILE_TOO_LARGE',
    `Files must be ${mb} MB or smaller.`,
  );
}

async function readHead(file: string) {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await fh.read(buf, 0, SNIFF_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    total += (await stat(join(entry.parentPath, entry.name))).size;
  }
  return total;
}
