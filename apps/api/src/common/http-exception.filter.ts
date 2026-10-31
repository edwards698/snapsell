import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { ApiErrorBody } from '@snapsell/shared';
import type { Response } from 'express';
import { type Logger } from 'pino';
import { LOGGER } from '../logging/logging.module.js';
import { ApiError } from './errors.js';

const DEFAULT_CODES: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

/** Renders every error as `{ error: { code, message, fields? } }` and hides internals on 5xx. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody['error'] = {
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again.',
    };

    if (exception instanceof ApiError) {
      status = exception.getStatus();
      body = {
        code: exception.code,
        message: exception.message,
        fields: exception.fields,
        details: exception.details,
      };
      for (const [k, v] of Object.entries(exception.headers ?? {})) res.setHeader(k, v);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response && 'message' in response
          ? [response.message].flat().join(', ')
          : exception.message;
      body = { code: DEFAULT_CODES[status] ?? `HTTP_${status}`, message };
    } else {
      this.logger.error({ err: exception }, 'Unhandled error');
    }

    if (status >= 500 && exception instanceof HttpException) {
      this.logger.error({ err: exception }, 'Server error');
    }
    res.status(status).json({ error: body } satisfies ApiErrorBody);
  }
}
