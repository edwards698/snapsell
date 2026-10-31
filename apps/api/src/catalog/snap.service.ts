import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { businessSettings, categories, type DatabaseHandle } from '@snapsell/db';
import { type SnapSuggestion, toMinor } from '@snapsell/shared';
import { isNull } from 'drizzle-orm';
import { type Logger } from 'pino';
import sharp from 'sharp';
import { z } from 'zod';
import {
  type AiPart,
  AI_PROVIDER,
  type AiProvider,
  AiUnavailableError,
} from '../ai/ai.provider.js';
import { ApiError, tooManyRequests } from '../common/errors.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { DATABASE } from '../database/database.module.js';
import { FileStore, IMAGE_TYPES } from '../files/file-store.js';
import { LOGGER } from '../logging/logging.module.js';

/** Detected container type → MIME type Gemini accepts (verified against its docs 2026-10-31). */
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

const SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Short product name a shopper would search for, max 60 characters.',
    },
    description: {
      type: 'string',
      description: 'One or two plain sentences for the shop page, max 40 words.',
    },
    price: {
      type: ['string', 'null'],
      description:
        'Price per item exactly as the seller stated it, digits only (e.g. "350" or "12.50"); null if not stated.',
    },
    quantity: {
      type: ['integer', 'null'],
      description: 'How many the seller has, only if stated; otherwise null.',
    },
    category: {
      type: ['string', 'null'],
      description: 'One of the listed category names, or null if none fits.',
    },
    heard: {
      type: ['string', 'null'],
      description: 'Short transcript of the voice note, or null if there was none.',
    },
  },
  required: ['name', 'description', 'price', 'quantity', 'category', 'heard'],
} as const;

const resultSchema = z.object({
  name: z.string().trim().max(120).catch(''),
  description: z.string().trim().max(2000).catch(''),
  price: z.string().nullable().catch(null),
  quantity: z.number().int().min(0).max(1_000_000).nullable().catch(null),
  category: z.string().nullable().catch(null),
  heard: z.string().trim().max(1000).nullable().catch(null),
});

/** "Snap to sell" (BUILD_PLAN §2.5): a photo and/or voice note becomes suggested product details. */
@Injectable()
export class SnapService {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly files: FileStore,
    private readonly limiter: RateLimiter,
  ) {}

  async suggest(
    input: { image?: Buffer; audio?: Buffer; note: string },
    userId: string,
  ): Promise<SnapSuggestion> {
    if (!this.ai.configured) {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'AI_NOT_CONFIGURED',
        'Snap needs a Gemini API key. Add GEMINI_API_KEY to .env and restart the API.',
      );
    }
    if (!input.image && !input.audio && !input.note) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Add a photo, a voice note or a description.',
      );
    }
    const limit = this.limiter.hit(`snap:${userId}`, 60, 60 * 60 * 1000);
    if (!limit.allowed)
      throw tooManyRequests(
        'You’ve used Snap a lot this hour. Try again shortly.',
        limit.retryAfterSeconds,
      );

    const { db } = this.handle;
    const settings = db.select().from(businessSettings).get()!;
    const categoryRows = db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(isNull(categories.archivedAt))
      .all();

    const parts: AiPart[] = [];
    if (input.image) {
      await this.files.sniff(input.image, IMAGE_TYPES);
      // A smaller JPEG is plenty for recognition and keeps requests well under the inline limit.
      const data = await sharp(input.image)
        .rotate()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      parts.push({ media: { mimeType: 'image/jpeg', data } });
    }
    if (input.audio) {
      const type = await this.files.sniff(input.audio, Object.keys(AUDIO_FOR_GEMINI));
      parts.push({ media: { mimeType: AUDIO_FOR_GEMINI[type.mime]!, data: input.audio } });
    }
    parts.push({
      text: [
        `You help the owner of "${settings.name}", a small shop in Zambia, list a product for sale.`,
        'Use the photo, the voice note and the typed note together. The voice note may be in English, Bemba or Nyanja.',
        `Prices are in ${settings.currency}. Use only a price the seller actually stated; never guess one.`,
        'Use only a quantity the seller stated. Do not invent features you cannot see or hear.',
        `Categories: ${categoryRows.map((c) => c.name).join(', ') || '(none yet)'}.`,
        input.note ? `Typed note from the seller: """${input.note}"""` : 'No typed note.',
      ].join('\n'),
    });

    let raw: unknown;
    try {
      raw = await this.ai.generateJson(parts, SCHEMA as unknown as Record<string, unknown>);
    } catch (err) {
      this.logger.warn({ err }, 'Snap suggestion failed');
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        err instanceof AiUnavailableError ? 'AI_UNAVAILABLE' : 'AI_ERROR',
        'The assistant couldn’t read that just now. Try again, or fill in the details yourself.',
      );
    }
    const r = resultSchema.parse(raw ?? {});
    let priceMinor: number | null = null;
    if (r.price) {
      try {
        priceMinor = toMinor(r.price.replace(/[^\d.]/g, ''), settings.currency);
      } catch {
        priceMinor = null;
      }
    }
    const category = r.category
      ? categoryRows.find((c) => c.name.toLowerCase() === r.category!.toLowerCase())
      : undefined;
    return {
      name: r.name,
      description: r.description,
      priceMinor,
      quantity: r.quantity,
      categoryId: category?.id ?? null,
      heard: r.heard || null,
    };
  }
}
