import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileStore, IMAGE_TYPES } from '../src/files/file-store.js';
import { startTestApp, type TestApp } from './helpers.js';

// Smallest valid PNG (1×1 transparent pixel).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
// Windows executable header ("MZ") disguised by its name.
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]);

let t: TestApp;
let files: FileStore;
beforeEach(async () => {
  t = await startTestApp();
  files = t.app.get(FileStore);
});
afterEach(async () => {
  await t.close();
});

describe('FileStore', () => {
  it('stores by sniffed type under a random key', async () => {
    const stored = await files.savePublic(PNG, { allow: IMAGE_TYPES });
    expect(stored).toMatchObject({ mime: 'image/png', ext: 'png', size: PNG.length });
    expect(stored.key).toMatch(/^public\/\d{4}\/\d{2}\/[a-f0-9]{32}\.png$/);
    expect((await files.stat(stored.key))?.size).toBe(PNG.length);
    expect(files.publicUrl(stored.key)).toBe(`/media/${stored.key.slice(7)}`);
  });

  it('accepts streams', async () => {
    const stored = await files.savePrivate(Readable.from([PNG.subarray(0, 10), PNG.subarray(10)]), {
      allow: IMAGE_TYPES,
    });
    expect(stored.key.startsWith('private/')).toBe(true);
  });

  it('rejects disallowed or unknown content regardless of name', async () => {
    await expect(files.savePublic(EXE, { allow: IMAGE_TYPES })).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
    });
    await expect(
      files.savePublic(Buffer.from('just text'), { allow: IMAGE_TYPES }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
    await expect(files.savePublic(Buffer.alloc(0), { allow: IMAGE_TYPES })).rejects.toMatchObject({
      code: 'EMPTY_FILE',
    });
  });

  it('enforces the size limit while streaming', async () => {
    await expect(files.savePublic(PNG, { allow: IMAGE_TYPES, maxBytes: 10 })).rejects.toMatchObject(
      { code: 'FILE_TOO_LARGE' },
    );
  });

  it('rejects malformed keys and path traversal', () => {
    for (const key of [
      '../../etc/passwd',
      'public/2026/10/../../x.png',
      'private/x.png',
      '/etc/passwd',
    ]) {
      expect(() => files.pathFor(key)).toThrow();
    }
  });

  it('removes files', async () => {
    const stored = await files.savePublic(PNG, { allow: IMAGE_TYPES });
    await files.delete(stored.key);
    expect(await files.stat(stored.key)).toBeNull();
  });
});

describe('signed URLs', () => {
  it('serve private files only with a valid, unexpired signature', async () => {
    const stored = await files.savePrivate(PNG, { allow: IMAGE_TYPES });
    const url = files.signedUrl(stored.key, 60);

    const ok = await t.http().get(url).expect(200);
    expect(ok.headers['content-type']).toBe('image/png');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(ok.body as Buffer, PNG)).toBe(0);

    await t
      .http()
      .get(url.replace(/sig=[^&]+/, 'sig=forged'))
      .expect(403);
    const other = await files.savePrivate(PNG, { allow: IMAGE_TYPES });
    await t
      .http()
      .get(url.replace(encodeURIComponent(stored.key), encodeURIComponent(other.key)))
      .expect(403);

    const expired = files.signedUrl(stored.key, 60, Date.now() - 120_000);
    await t.http().get(expired).expect(403);
  });

  it('serves public media with long-lived caching', async () => {
    const stored = await files.savePublic(PNG, { allow: IMAGE_TYPES });
    const res = await t.http().get(files.publicUrl(stored.key)).expect(200);
    expect(res.headers['cache-control']).toContain('immutable');
    // express.static refuses '..' outright.
    await t.http().get('/media/../db/snapsell.db').expect(403);
  });
});
