import type { ApiErrorBody } from '@snapsell/shared';

/** An error response from the SnapSell API, with per-field messages when validation failed. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Browser-side API client. Same-origin, so the session cookie rides along automatically. */
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const method = (init.method ?? (init.json !== undefined ? 'POST' : 'GET')).toUpperCase();
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('content-type', 'application/json');
  if (!SAFE.has(method)) {
    const csrf = readCookie('ss_csrf');
    if (csrf) headers.set('x-csrf-token', csrf);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      method,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiRequestError(
      0,
      'NETWORK',
      'Can’t reach the server. Check your connection and try again.',
    );
  }

  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? 'Something went wrong. Please try again.',
      err?.fields,
      err?.details,
    );
  }
  return body as T;
}
