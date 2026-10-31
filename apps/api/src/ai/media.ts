import type { AiFeatures } from '@snapsell/shared';
import sharp from 'sharp';
import type { AiPart } from './ai.provider.js';
import type { FileStore } from '../files/file-store.js';

/** Container type → MIME type Gemini accepts. Matches Snap to sell. */
const AUDIO_FOR_GEMINI: Record<string, string> = {
  'audio/webm': 'audio/webm',
  'video/webm': 'audio/webm',
  'audio/ogg': 'audio/ogg',
  'audio/opus': 'audio/opus',
  'audio/mpeg': 'audio/mp3',
  'audio/mp4': 'audio/m4a',
  'video/mp4': 'audio/m4a',
  'audio/x-m4a': 'audio/m4a',
  'audio/aac': 'audio/aac',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/flac': 'audio/flac',
  'audio/x-flac': 'audio/flac',
};

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

export interface InboundMedia {
  type: string;
  body: string | null;
  media: { mime: string; fileKey: string | null } | null;
}

/** Turns the current customer messages into model parts. Unsupported media becomes a note. */
export async function partsForTurn(
  messages: InboundMedia[],
  features: Pick<AiFeatures, 'voiceNotes' | 'imageUnderstanding'>,
  files: FileStore,
): Promise<AiPart[]> {
  const parts: AiPart[] = [];
  for (const m of messages) {
    const note = await mediaNote(m, features, files);
    if (note.part) parts.push(note.part);
    const text = [m.body, note.note].filter(Boolean).join('\n');
    if (text) parts.push({ text });
  }
  if (parts.length === 0) parts.push({ text: '(no text)' });
  return parts;
}

async function mediaNote(
  m: InboundMedia,
  features: Pick<AiFeatures, 'voiceNotes' | 'imageUnderstanding'>,
  files: FileStore,
): Promise<{ part?: AiPart; note?: string }> {
  const mime = m.media?.mime ?? '';
  const key = m.media?.fileKey;
  if (!key || !files.isValidKey(key)) {
    if (m.type === 'IMAGE' || m.type === 'AUDIO' || m.type === 'DOCUMENT') {
      return { note: 'The customer sent media that could not be loaded.' };
    }
    return {};
  }
  if (m.type === 'IMAGE' || IMAGE_TYPES.has(mime)) {
    if (!features.imageUnderstanding) {
      return { note: 'The customer sent a photo. Image understanding is turned off, so you cannot see it. Ask them to describe it.' };
    }
    try {
      const bytes = await files.read(key);
      const data = await sharp(bytes)
        .rotate()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      return { part: { media: { mimeType: 'image/jpeg', data } } };
    } catch {
      return { note: 'The customer sent a photo that could not be read.' };
    }
  }
  const audioMime = AUDIO_FOR_GEMINI[mime];
  if (m.type === 'AUDIO' || audioMime) {
    if (!features.voiceNotes) {
      return { note: 'The customer sent a voice note. Voice notes are turned off. Ask them to type their message.' };
    }
    if (!audioMime) return { note: 'The customer sent audio in a format the assistant cannot hear.' };
    try {
      const data = await files.read(key);
      return { part: { media: { mimeType: audioMime, data } } };
    } catch {
      return { note: 'The customer sent a voice note that could not be loaded.' };
    }
  }
  if (m.type === 'DOCUMENT' || m.type === 'OTHER') {
    return { note: 'The customer sent a file the assistant cannot read. Ask them to describe it.' };
  }
  return {};
}
