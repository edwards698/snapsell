import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WaAck, WaInboundMessage, WaMediaRef } from '@snapsell/shared';

export type JournalEntry =
  | {
      id: string;
      kind: 'message';
      message: WaInboundMessage;
      /** Media bytes waiting to be uploaded (`<id>.bin` next to the entry). */
      pendingMedia: { mime: string } | null;
    }
  | { id: string; kind: 'ack'; ack: WaAck };

export type NewJournalEntry =
  | { kind: 'message'; message: WaInboundMessage; pendingMedia: { mime: string } | null }
  | { kind: 'ack'; ack: WaAck };

/**
 * Durable buffer between WhatsApp and the API (BUILD_PLAN D9). Each entry is its own file,
 * written atomically, and removed only after the API acknowledged it – so neither an API
 * restart nor a crash of this service loses an inbound message.
 */
export class Journal {
  private seq = 0;

  constructor(readonly dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await mkdir(join(this.dir, 'dead'), { recursive: true, mode: 0o700 });
  }

  /** Appends an entry; `media` is written first so an entry never points at missing bytes. */
  async append(entry: NewJournalEntry, media?: Buffer): Promise<JournalEntry> {
    const id = `${Date.now().toString().padStart(15, '0')}-${String(this.seq++ % 1_000_000).padStart(6, '0')}-${randomBytes(4).toString('hex')}`;
    const full = { id, ...entry } as JournalEntry;
    if (media) await this.writeAtomic(this.mediaPath(id), media);
    await this.writeAtomic(this.entryPath(id), JSON.stringify(full));
    return full;
  }

  /** Entries in the order they were written. */
  async list(): Promise<JournalEntry[]> {
    const names = (await readdir(this.dir).catch(() => [] as string[]))
      .filter((n) => n.endsWith('.json'))
      .sort();
    const out: JournalEntry[] = [];
    for (const name of names) {
      try {
        out.push(JSON.parse(await readFile(join(this.dir, name), 'utf8')) as JournalEntry);
      } catch {
        // A half-written file can't exist (atomic rename), but be safe: move it aside.
        await rename(join(this.dir, name), join(this.dir, 'dead', name)).catch(() => {});
      }
    }
    return out;
  }

  readMedia(id: string) {
    return readFile(this.mediaPath(id));
  }

  /** Records that the media was uploaded, then drops the local copy. */
  async attachMedia(
    entry: JournalEntry & { kind: 'message' },
    ref: WaMediaRef | null,
    error?: string,
  ) {
    const next: JournalEntry = {
      ...entry,
      pendingMedia: null,
      message: { ...entry.message, media: ref, mediaError: ref ? null : (error ?? null) },
    };
    await this.writeAtomic(this.entryPath(entry.id), JSON.stringify(next));
    await rm(this.mediaPath(entry.id), { force: true });
    return next;
  }

  async remove(id: string) {
    await rm(this.entryPath(id), { force: true });
    await rm(this.mediaPath(id), { force: true });
  }

  /** Keeps entries the API rejected as invalid for inspection instead of retrying forever. */
  async bury(id: string) {
    await rename(this.entryPath(id), join(this.dir, 'dead', `${id}.json`)).catch(() => {});
    await rm(this.mediaPath(id), { force: true });
  }

  async size() {
    return (await this.list()).length;
  }

  private entryPath(id: string) {
    return join(this.dir, `${id}.json`);
  }

  private mediaPath(id: string) {
    return join(this.dir, `${id}.bin`);
  }

  private async writeAtomic(path: string, data: string | Buffer) {
    const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, data, { mode: 0o600 });
    await rename(tmp, path);
  }
}
