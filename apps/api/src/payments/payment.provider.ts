export interface PaymentLinkRequest {
  orderRef: string;
  /** Integer minor units; providers convert to their own format. */
  amountMinor: number;
  currency: string;
  title: string;
  description: string;
  expiresAt: Date | null;
  idempotencyKey: string;
}

export interface CreatedPaymentLink {
  providerLinkId: string;
  paymentUrl: string;
  raw: unknown;
}

export type PaymentEventType = 'payment.completed' | 'payment.failed' | 'other';

/** A provider webhook, reduced to what we act on. */
export interface PaymentEvent {
  eventId: string;
  type: PaymentEventType;
  rawType: string;
  providerLinkId: string | null;
  providerPaymentId: string | null;
  amountMinor: number | null;
  currency: string | null;
}

/** BUILD_PLAN D10: payments sit behind this interface so the provider can be replaced. */
export interface PaymentProvider {
  readonly name: 'DEVDRAFT';
  readonly mode: 'fake' | 'sandbox' | 'live';
  supportsCurrency(currency: string): boolean;
  createLink(req: PaymentLinkRequest): Promise<CreatedPaymentLink>;
  /** Checks the signature over the exact raw bytes received. */
  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseEvent(rawBody: Buffer): PaymentEvent;
  /** Present only when the provider offers a status lookup (used by reconciliation). */
  fetchLinkStatus?(providerLinkId: string): Promise<'paid' | 'pending' | 'failed' | 'unknown'>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly raw?: unknown,
  ) {
    super(message);
  }
}
