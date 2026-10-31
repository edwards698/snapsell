import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, newId, productImages } from '@snapsell/db';
import { type ImageDto, MAX_IMAGES_PER_PRODUCT } from '@snapsell/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import sharp, { type OutputInfo } from 'sharp';
import { ApiError } from '../common/errors.js';
import { DATABASE } from '../database/database.module.js';
import { FileStore, IMAGE_TYPES } from '../files/file-store.js';

/** Rendition widths (BUILD_PLAN Phase 2). Never upscaled; the original width is added if smaller. */
export const IMAGE_WIDTHS = [320, 640, 1024, 1600] as const;
const MAX_SOURCE_EDGE = 2400;

type ImageRow = typeof productImages.$inferSelect;

@Injectable()
export class ProductImageService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly files: FileStore,
  ) {}

  /**
   * Validates an uploaded photo, then stores AVIF + WebP renditions. Re-encoding drops all
   * metadata, including EXIF GPS location, after the orientation has been applied.
   */
  async render(input: Buffer) {
    await this.files.sniff(input, IMAGE_TYPES);
    let normalized: { data: Buffer; info: OutputInfo };
    try {
      normalized = await sharp(input, { failOn: 'error', animated: false })
        .rotate()
        .resize({
          width: MAX_SOURCE_EDGE,
          height: MAX_SOURCE_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ApiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'IMAGE_UNREADABLE',
        'This image couldn’t be read. Try another photo.',
      );
    }
    const { width, height } = normalized.info;
    const widths: number[] = IMAGE_WIDTHS.filter((w) => w < width);
    if (width <= IMAGE_WIDTHS.at(-1)! && !widths.includes(width)) widths.push(width);
    if (widths.length === 0) widths.push(IMAGE_WIDTHS.at(-1)!);

    const stem = this.files.newStem('public');
    await Promise.all(
      widths.map(async (w) => {
        const resized = sharp(normalized.data).resize({ width: w, withoutEnlargement: true });
        const [webp, avif] = await Promise.all([
          resized.clone().webp({ quality: 80 }).toBuffer(),
          resized.clone().avif({ quality: 55, effort: 2 }).toBuffer(),
        ]);
        await this.files.writeGenerated(`${stem}-${w}.webp`, webp);
        await this.files.writeGenerated(`${stem}-${w}.avif`, avif);
      }),
    );
    const blur = await sharp(normalized.data)
      .resize({ width: 16 })
      .webp({ quality: 40 })
      .toBuffer();
    return {
      fileKey: stem,
      widths,
      width,
      height,
      blurDataUrl: `data:image/webp;base64,${blur.toString('base64')}`,
    };
  }

  async add(productId: string, uploads: Buffer[]) {
    const { db } = this.handle;
    const existing = db
      .select({ n: count() })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .get()!.n;
    if (existing + uploads.length > MAX_IMAGES_PER_PRODUCT) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'TOO_MANY_IMAGES',
        `A product can have up to ${MAX_IMAGES_PER_PRODUCT} photos.`,
      );
    }
    const rendered: Awaited<ReturnType<ProductImageService['render']>>[] = [];
    try {
      // One at a time keeps memory use flat on a small server.
      for (const upload of uploads) rendered.push(await this.render(upload));
    } catch (err) {
      await Promise.all(rendered.map((r) => this.files.deleteStem(r.fileKey)));
      throw err;
    }
    db.insert(productImages)
      .values(rendered.map((r, i) => ({ id: newId(), productId, sortOrder: existing + i, ...r })))
      .run();
    return this.list(productId);
  }

  list(productId: string): ImageDto[] {
    return this.handle.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt))
      .all()
      .map((row) => this.toDto(row));
  }

  async remove(productId: string, imageId: string) {
    const { db } = this.handle;
    const row = db
      .select()
      .from(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
      .get();
    if (!row) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Photo not found.');
    db.delete(productImages).where(eq(productImages.id, imageId)).run();
    await this.files.deleteStem(row.fileKey);
    return this.list(productId);
  }

  async removeAll(productId: string) {
    const rows = this.handle.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .all();
    await Promise.all(rows.map((r) => this.files.deleteStem(r.fileKey)));
  }

  reorder(productId: string, ids: string[]) {
    const { db } = this.handle;
    db.transaction((tx) => {
      const own = tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(and(eq(productImages.productId, productId), inArray(productImages.id, ids)))
        .all();
      if (own.length !== ids.length)
        throw new ApiError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Unknown photo.');
      ids.forEach((id, i) =>
        tx.update(productImages).set({ sortOrder: i }).where(eq(productImages.id, id)).run(),
      );
    });
    return this.list(productId);
  }

  setAlt(productId: string, imageId: string, alt: string) {
    const changed = this.handle.db
      .update(productImages)
      .set({ alt })
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
      .run().changes;
    if (!changed) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Photo not found.');
    return this.list(productId);
  }

  toDto(
    row: Pick<ImageRow, 'id' | 'alt' | 'fileKey' | 'widths' | 'width' | 'height' | 'blurDataUrl'>,
  ): ImageDto {
    const url = (w: number, ext: string) => this.files.publicUrl(`${row.fileKey}-${w}.${ext}`);
    const widths = row.widths.length ? row.widths : [640];
    const mid = widths.filter((w) => w <= 640).at(-1) ?? widths[0]!;
    return {
      id: row.id,
      alt: row.alt,
      width: row.width ?? 0,
      height: row.height ?? 0,
      blurDataUrl: row.blurDataUrl,
      src: url(mid, 'webp'),
      srcSet: {
        webp: widths.map((w) => `${url(w, 'webp')} ${w}w`).join(', '),
        avif: widths.map((w) => `${url(w, 'avif')} ${w}w`).join(', '),
      },
    };
  }
}
