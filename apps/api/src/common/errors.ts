import { HttpException, HttpStatus } from '@nestjs/common';

/** An HTTP error with a stable machine-readable code, rendered as `ApiErrorBody`. */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly headers?: Record<string, string>,
    /** Extra machine-readable data, e.g. the re-priced cart when a checkout is rejected. */
    readonly details?: unknown,
  ) {
    super({ code, message, fields }, status);
  }
}

export const unauthorized = (message = 'Please sign in to continue.') =>
  new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);

export const forbidden = (code: string, message: string) =>
  new ApiError(HttpStatus.FORBIDDEN, code, message);

export const tooManyRequests = (message: string, retryAfterSeconds: number) =>
  new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', message, undefined, {
    'Retry-After': String(retryAfterSeconds),
  });
