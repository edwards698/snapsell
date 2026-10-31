'use client';

import { Alert, Button, Card, Money, Skeleton } from '@snapsell/ui';
import { FlaskConical, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiRequestError } from '@/lib/api';

interface TestLink {
  orderRef: string;
  statusUrl: string;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  shopName: string;
}

/**
 * Stand-in for DevDraft's hosted payment page while DEVDRAFT_MODE=fake. Paying here sends a
 * signed webhook through the real verification and processing code.
 */
export function TestPayment({ linkId }: { linkId: string }) {
  const [link, setLink] = useState<TestLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'completed' | 'failed' | null>(null);

  useEffect(() => {
    api<TestLink>(`/test-payments/${linkId}`)
      .then(setLink)
      .catch((e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'Not found'));
  }, [linkId]);

  async function simulate(outcome: 'completed' | 'failed') {
    setPending(outcome);
    try {
      await api(`/test-payments/${linkId}/${outcome}`, { method: 'POST' });
      // Give the webhook processor a moment, then show the order page (it refreshes itself).
      setTimeout(() => window.location.assign(link!.statusUrl), 600);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong');
      setPending(null);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Alert tone="warning" title="Test payment" className="mb-6">
        This shop is in test mode (<code className="font-mono text-xs">DEVDRAFT_MODE=fake</code>).
        No money moves.
      </Alert>
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : !link ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <Card className="p-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted">
            <FlaskConical className="size-6 text-muted-foreground" />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">
            {link.shopName} · {link.orderRef}
          </p>
          <p className="mt-1 text-3xl font-semibold">
            <Money minor={link.amountMinor} currency={link.currency} />
          </p>
          {link.status !== 'pending' ? (
            <p className="mt-6 text-sm">
              This link was already {link.status}.{' '}
              <a href={link.statusUrl} className="font-medium text-primary underline">
                View order
              </a>
            </p>
          ) : (
            <div className="mt-6 grid gap-2">
              <Button
                size="lg"
                onClick={() => void simulate('completed')}
                loading={pending === 'completed'}
                disabled={!!pending}
              >
                <Lock /> Pay <Money minor={link.amountMinor} currency={link.currency} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => void simulate('failed')}
                loading={pending === 'failed'}
                disabled={!!pending}
              >
                Simulate a failed payment
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
