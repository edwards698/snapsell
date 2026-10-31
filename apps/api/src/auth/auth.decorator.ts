import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { unauthorized } from '../common/errors.js';
import type { AuthContext } from './auth.types.js';

/** Injects the authenticated owner's context into a handler. */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<Request>().auth;
  if (!auth) throw unauthorized();
  return auth;
});
