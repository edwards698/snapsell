import { Inject, Injectable } from '@nestjs/common';
import {
  type WaCommand,
  type WaSendRequest,
  type WaSendResult,
  type WaStatusSnapshot,
  waStatusSnapshotSchema,
} from '@snapsell/shared';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { internalHeaders } from './internal-auth.js';

export class WaServiceError extends Error {
  constructor(
    message: string,
    /** False for errors the service reports as final (e.g. not linked); true for network errors. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Signed HTTP client for the WhatsApp service (apps/whatsapp). The API never imports whatsapp-web.js. */
@Injectable()
export class WaServiceClient {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  send(req: WaSendRequest) {
    return this.call<WaSendResult>('/internal/send', req, 30_000);
  }

  command(command: WaCommand) {
    return this.call<{ ok: true }>('/internal/command', { command }, 15_000);
  }

  async status(): Promise<WaStatusSnapshot> {
    const body = await this.call<unknown>('/internal/status', {}, 2_000);
    return waStatusSnapshotSchema.parse(body);
  }

  private async call<T>(path: string, payload: unknown, timeoutMs: number): Promise<T> {
    const body = JSON.stringify(payload);
    let res: Response;
    try {
      res = await fetch(`${this.config.whatsapp.serviceUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...internalHeaders(this.config.secrets.internalHmac, body),
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new WaServiceError('The WhatsApp service is not running.', true);
    }
    const json = (await res.json().catch(() => null)) as
      (T & { error?: { message?: string; retryable?: boolean } }) | null;
    if (!res.ok) {
      const message = json?.error?.message ?? `WhatsApp service returned ${res.status}.`;
      throw new WaServiceError(message, json?.error?.retryable ?? res.status >= 500);
    }
    return json as T;
  }
}
