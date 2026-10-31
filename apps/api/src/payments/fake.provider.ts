import { randomUUID } from 'node:crypto';
import { type AppConfig } from '../config/config.js';
import { parseDevDraftEvent, toProviderAmount, verifyHmac } from './devdraft.provider.js';
import {
  type CreatedPaymentLink,
  type PaymentLinkRequest,
  type PaymentProvider,
} from './payment.provider.js';

type FakeLink = {
  amountMinor: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
};

/**
 * Development stand-in for DevDraft (BUILD_PLAN D20). Links point at the local /pay/test page;
 * "paying" there sends a webhook signed exactly like DevDraft's to our own endpoint, so the real
 * verification and processing code runs end to end. Refused in production by the config loader.
 *
 * The in-memory map is a cache; after an API restart, PaymentsService rehydrates from the
 * `payments` table so open demo links keep working.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'DEVDRAFT' as const;
  readonly mode = 'fake' as const;
  readonly links = new Map<string, FakeLink>();

  constructor(
    private readonly config: AppConfig['devdraft'],
    private readonly publicWebUrl: string,
  ) {}

  supportsCurrency() {
    return true;
  }

  async createLink(req: PaymentLinkRequest): Promise<CreatedPaymentLink> {
    const id = randomUUID();
    this.links.set(id, {
      amountMinor: req.amountMinor,
      currency: req.currency,
      status: 'pending',
    });
    const raw = {
      id,
      title: req.title,
      url: `${req.orderRef.toLowerCase()}-${req.idempotencyKey.slice(0, 8)}`,
      linkType: this.config.linkType,
      status: 'ACTIVE',
      amount: toProviderAmount(req.amountMinor, req.currency),
      currency: req.currency.toLowerCase(),
      recurringType: 'ONE_TIME',
      createdAt: new Date().toISOString(),
      simulated: true,
    };
    return { providerLinkId: id, paymentUrl: `${this.publicWebUrl}/pay/test/${id}`, raw };
  }

  /** Restore a link after process restart (or in tests that clear the map). */
  remember(
    providerLinkId: string,
    amountMinor: number,
    currency: string,
    status: FakeLink['status'] = 'pending',
  ) {
    if (!this.links.has(providerLinkId)) {
      this.links.set(providerLinkId, { amountMinor, currency, status });
    }
  }

  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    return verifyHmac(this.config.webhookSecret, rawBody, headers[this.config.signatureHeader]);
  }

  parseEvent(rawBody: Buffer) {
    return parseDevDraftEvent(rawBody);
  }

  async fetchLinkStatus(providerLinkId: string) {
    const link = this.links.get(providerLinkId);
    return link ? (link.status === 'pending' ? 'pending' : link.status) : 'unknown';
  }

  /** The webhook body DevDraft is assumed to send (see test/fixtures/devdraft). */
  eventBody(providerLinkId: string, outcome: 'completed' | 'failed') {
    const link = this.links.get(providerLinkId);
    if (!link) return null;
    return JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: `payment.${outcome}`,
      createdAt: new Date().toISOString(),
      data: {
        id: `pay_${randomUUID()}`,
        paymentLinkId: providerLinkId,
        amount: toProviderAmount(link.amountMinor, link.currency),
        currency: link.currency.toLowerCase(),
        status: outcome === 'completed' ? 'COMPLETED' : 'FAILED',
      },
    });
  }
}
