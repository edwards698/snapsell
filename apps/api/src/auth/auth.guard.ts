import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../common/errors.js';
import { IS_PUBLIC } from '../common/public.decorator.js';
import { readCookie } from '../common/request.js';
import { CSRF_HEADER, SESSION_COOKIE } from './auth.types.js';
import { SessionService } from './session.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global, default-deny guard. Every route needs a valid owner session unless marked `@Public()`.
 * State-changing requests must also echo the session's CSRF token in `x-csrf-token`; this is on
 * top of Nest's Fetch-Metadata cross-origin check enabled in main.ts.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? this.sessions.validate(token) : null;
    if (session)
      req.auth = { user: session.user, sessionId: session.id, csrfToken: session.csrfToken };
    if (isPublic) return true;
    if (!session) throw unauthorized();

    if (!SAFE_METHODS.has(req.method)) {
      const header = req.headers[CSRF_HEADER];
      const given = Buffer.from(typeof header === 'string' ? header : '');
      const expected = Buffer.from(session.csrfToken);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw forbidden(
          'CSRF_FAILED',
          'Your session check failed. Refresh the page and try again.',
        );
      }
    }
    return true;
  }
}
