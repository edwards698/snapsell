import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import {
  INTERNAL_MAX_SKEW_MS,
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
} from '@snapsell/shared';

// Same scheme as apps/api/src/messaging/internal-auth.ts.

export function sign(secret: string, timestamp: string, body: Buffer | string) {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
}

export function signedHeaders(secret: string, body: Buffer | string, now = Date.now()) {
  const timestamp = String(now);
  return {
    [INTERNAL_TIMESTAMP_HEADER]: timestamp,
    [INTERNAL_SIGNATURE_HEADER]: sign(secret, timestamp, body),
  };
}

export function isPrivateAddress(ip: string | undefined) {
  if (!ip) return false;
  const addr = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(addr) === 4) {
    const [a, b] = addr.split('.').map(Number) as [number, number];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (isIP(addr) === 6) {
    const lower = addr.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd');
  }
  return false;
}

export function verify(
  secret: string,
  peer: string | undefined,
  headers: IncomingHttpHeaders,
  body: Buffer,
  now = Date.now(),
) {
  if (!isPrivateAddress(peer)) return false;
  const ts = headers[INTERNAL_TIMESTAMP_HEADER];
  const sig = headers[INTERNAL_SIGNATURE_HEADER];
  if (typeof ts !== 'string' || typeof sig !== 'string') return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > INTERNAL_MAX_SKEW_MS) return false;
  const expected = Buffer.from(sign(secret, ts, body));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
