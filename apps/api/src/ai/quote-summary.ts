import { createHash } from 'node:crypto';
import { formatMoney } from '@snapsell/shared';

export interface QuoteLine {
  variantId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface QuoteSnapshot {
  items: QuoteLine[];
  fees: Record<string, number>;
  totalMinor: number;
  currency: string;
  fulfilment: 'DELIVERY' | 'COLLECTION';
}

/** Stable hash so confirm can detect price or stock changes (BUILD_PLAN D7). */
export function quoteHash(snapshot: QuoteSnapshot): string {
  const payload = JSON.stringify({
    items: snapshot.items.map((i) => ({
      v: i.variantId,
      q: i.quantity,
      u: i.unitPriceMinor,
      t: i.lineTotalMinor,
    })),
    fees: snapshot.fees,
    total: snapshot.totalMinor,
    currency: snapshot.currency,
    fulfilment: snapshot.fulfilment,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * WhatsApp-safe order summary (D6, D13). Bold markers and line lists — never markdown tables.
 * The sending gate requires this exact block in the outbound reply.
 */
export function renderQuoteSummary(snapshot: QuoteSnapshot, shopName: string): string {
  const money = (n: number) => formatMoney(n, snapshot.currency, { trimZeros: true });
  const lines = snapshot.items.map(
    (i) => `• ${i.name} × ${i.quantity} — ${money(i.lineTotalMinor)}`,
  );
  const feeLines = Object.entries(snapshot.fees)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `• ${labelFee(k)} — ${money(v)}`);
  const method = snapshot.fulfilment === 'DELIVERY' ? 'Delivery' : 'Collection';
  return [
    `*Order summary — ${shopName}*`,
    ...lines,
    ...feeLines,
    `• Fulfilment — ${method}`,
    `*Total — ${money(snapshot.totalMinor)}*`,
  ].join('\n');
}

function labelFee(key: string) {
  if (key === 'delivery') return 'Delivery';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** True when the assistant reply still contains the exact summary block. */
export function replyContainsSummary(reply: string, summary: string): boolean {
  return reply.includes(summary);
}
