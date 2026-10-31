import type { SessionUser } from '@snapsell/shared';

export interface AuthContext {
  user: SessionUser;
  sessionId: string;
  csrfToken: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const SESSION_COOKIE = 'ss_session';
export const CSRF_COOKIE = 'ss_csrf';
export const CSRF_HEADER = 'x-csrf-token';
