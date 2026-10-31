import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from '../common/errors.js';
import { Public } from '../common/public.decorator.js';
import { FileStore } from './file-store.js';

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  webm: 'audio/webm',
  pdf: 'application/pdf',
};

@Controller('files')
export class FilesController {
  constructor(private readonly files: FileStore) {}

  /** Serves a private file to whoever holds a valid signed URL (see FileStore.signedUrl). */
  @Public()
  @Get()
  async download(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!key || !exp || !sig || !this.files.verifySignature(key, exp, sig)) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'INVALID_SIGNATURE',
        'This link is invalid or has expired.',
      );
    }
    const info = await this.files.stat(key);
    if (!info?.isFile()) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'File not found.');

    const ext = key.slice(key.lastIndexOf('.') + 1);
    const maxAge = Math.max(0, Number(exp) - Math.floor(Date.now() / 1000));
    res.setHeader('Content-Type', MIME_BY_EXT[ext] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    this.files.open(key).pipe(res);
  }
}
