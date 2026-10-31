import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WaCommand, waSendSchema } from '@snapsell/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import { verify } from './hmac.js';
import { SendError, type WhatsAppService } from './service.js';

const MAX_BODY = 64 * 1024;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, status: number, message: string, retryable = false) {
  json(res, status, { error: { message, retryable } });
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

const commandSchema = z.object({ command: WaCommand });

/** Internal HTTP API for the API process only: signed, and bound to localhost by default. */
export function createHttpServer(service: WhatsAppService, secret: string, logger: Logger) {
  return createServer((req, res) => {
    void (async () => {
      const path = (req.url ?? '/').split('?')[0];
      if (req.method === 'GET' && path === '/health') {
        return json(res, 200, { ok: true, state: service.state });
      }
      if (req.method !== 'POST' || !path?.startsWith('/internal/')) {
        return fail(res, 404, 'Not found.');
      }
      let body: Buffer;
      try {
        body = await readBody(req);
      } catch {
        return fail(res, 413, 'Too large.');
      }
      if (!verify(secret, req.socket.remoteAddress, req.headers, body)) {
        return fail(res, 401, 'Signature did not verify.');
      }
      let payload: unknown;
      try {
        payload = body.length ? JSON.parse(body.toString('utf8')) : {};
      } catch {
        return fail(res, 400, 'Invalid JSON.');
      }

      switch (path) {
        case '/internal/status':
          return json(res, 200, service.snapshot());
        case '/internal/send': {
          const parsed = waSendSchema.safeParse(payload);
          if (!parsed.success) return fail(res, 400, 'Invalid message.');
          try {
            return json(res, 200, await service.send(parsed.data));
          } catch (err) {
            if (err instanceof SendError) return fail(res, err.status, err.message, err.retryable);
            throw err;
          }
        }
        case '/internal/command': {
          const parsed = commandSchema.safeParse(payload);
          if (!parsed.success) return fail(res, 400, 'Unknown command.');
          await service.command(parsed.data.command);
          return json(res, 200, { ok: true });
        }
        default:
          return fail(res, 404, 'Not found.');
      }
    })().catch((err: Error) => {
      logger.error({ err: err.message }, 'Request failed');
      if (!res.headersSent) fail(res, 500, 'Internal error.', true);
    });
  });
}
