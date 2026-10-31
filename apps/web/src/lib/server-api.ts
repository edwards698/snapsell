import 'server-only';
import { cookies } from 'next/headers';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

/** Turbo starts web before the API finishes compiling; retry briefly on connection failure. */
const REACHABILITY_ATTEMPTS = process.env.NODE_ENV === 'development' ? 24 : 1;
const REACHABILITY_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Server-side API call from a Server Component, forwarding the visitor's cookies.
 * Returns null on 401 (so layouts can redirect to login) and on 404.
 */
export async function serverApi<T>(
  path: string,
  opts: { revalidate?: number } = {},
): Promise<T | null> {
  const cookieHeader = (await cookies()).toString();
  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    ...(opts.revalidate !== undefined && !cookieHeader
      ? { next: { revalidate: opts.revalidate } }
      : { cache: 'no-store' }),
  };

  let res: Response | null = null;
  for (let attempt = 0; attempt < REACHABILITY_ATTEMPTS; attempt++) {
    res = await fetch(`${API_URL}/api${path}`, init).catch(() => null);
    if (res) break;
    if (attempt < REACHABILITY_ATTEMPTS - 1) await sleep(REACHABILITY_DELAY_MS);
  }

  if (!res) throw new Error('The SnapSell API is not reachable. Is it running?');
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}
