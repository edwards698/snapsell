import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { HttpStatus } from '@nestjs/common';
import {
  INTERNAL_MAX_SKEW_MS,
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
} from '@snapsell/shared';
import type { Request } from 'express';
import { ApiError } from '../common/errors.js';

/** HMAC-SHA256 (hex) of `${timestamp}.${body}`; the WhatsApp service signs the same way. */
export function signInternal(secret: string, timestamp: string, body: Buffer | string) {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
}

export function internalHeaders(secret: string, body: Buffer | string, now = Date.now()) {
  const timestamp = String(now);
  return {
    [INTERNAL_TIMESTAMP_HEADER]: timestamp,
    [INTERNAL_SIGNATURE_HEADER]: signInternal(secret, timestamp, body),
  };
}

/** Loopback or private-network addresses only (the WhatsApp service runs next to the API). */
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

export type InternalCheck = 'ok' | 'forbidden_peer' | 'missing' | 'stale' | 'bad_signature';

export function checkInternalRequest(
  secret: string,
  peer: string | undefined,
  headers: Request['headers'],
  body: Buffer,
  now = Date.now(),
): InternalCheck {
  if (!isPrivateAddress(peer)) return 'forbidden_peer';
  const ts = headers[INTERNAL_TIMESTAMP_HEADER];
  const sig = headers[INTERNAL_SIGNATURE_HEADER];
  if (typeof ts !== 'string' || typeof sig !== 'string') return 'missing';
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > INTERNAL_MAX_SKEW_MS) return 'stale';
  const expected = Buffer.from(signInternal(secret, ts, body));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given)
    ? 'ok'
    : 'bad_signature';
}

/**
 * Throws unless the request comes from a private address and carries a fresh, valid signature.
 * `req.ip` honours `trust proxy` (loopback only), so a request relayed by Caddy or Next.js is
 * judged by the original client address.
 */
export function assertInternalRequest(secret: string, req: Request, body: Buffer) {
  const result = checkInternalRequest(secret, req.ip, req.headers, body);
  if (result === 'ok') return;
  if (result === 'forbidden_peer') {
    throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Internal endpoint.');
  }
  throw new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_SIGNATURE', 'Signature did not verify.');
}
