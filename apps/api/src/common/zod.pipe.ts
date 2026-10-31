import { HttpStatus, type PipeTransform } from '@nestjs/common';
import { type z } from 'zod';
import { ApiError } from './errors.js';

/** Validates a request body/query with a shared zod schema; errors map to per-field messages. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      'Please check the highlighted fields.',
      fields,
    );
  }
}
