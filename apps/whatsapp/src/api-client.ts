import type { WaEvent, WaMediaRef } from '@snapsell/shared';
import { signedHeaders } from './hmac.js';

export class ApiCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }

  /** 4xx (except 408/429) won't succeed on retry. */
  get permanent() {
    return (
      this.status !== null &&
      this.status >= 400 &&
      this.status < 500 &&
      ![408, 429].includes(this.status)
    );
  }
}

export interface ApiClient {
  postEvent(event: WaEvent): Promise<unknown>;
  uploadMedia(bytes: Buffer): Promise<WaMediaRef>;
}

/** Signed calls to the API's internal endpoints. */
export class HttpApiClient implements ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  postEvent(event: WaEvent) {
    return this.post('/api/internal/wa/events', JSON.stringify(event), 'application/json', 10_000);
  }

  async uploadMedia(bytes: Buffer) {
    return (await this.post(
      '/api/internal/wa/media',
      bytes,
      'application/octet-stream',
      60_000,
    )) as WaMediaRef;
  }

  private async post(path: string, body: string | Buffer, type: string, timeoutMs: number) {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': type, ...signedHeaders(this.secret, body) },
        body: typeof body === 'string' ? body : new Uint8Array(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ApiCallError(`API unreachable: ${(err as Error).message}`, null);
    }
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) {
      throw new ApiCallError(json?.error?.message ?? `API returned ${res.status}`, res.status);
    }
    return json;
  }
}
