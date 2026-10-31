'use client';

import { Badge, Card, CardContent, CardDescription, CardTitle, Skeleton } from '@snapsell/ui';
import { CreditCard, Mail, MessageCircle, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { useSystemStatus } from '@/components/admin/session';

interface Row {
  icon: typeof Mail;
  name: string;
  description: string;
  badge: React.ReactNode;
  detail: React.ReactNode;
}

function IntegrationCard({ icon: Icon, name, description, badge, detail }: Row) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted">
          <Icon className="size-5 text-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{name}</CardTitle>
            {badge}
          </div>
          <CardDescription className="mt-1">{description}</CardDescription>
          <div className="mt-4 rounded-xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
            {detail}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Integrations() {
  const { data, isPending } = useSystemStatus();
  const resend = data?.email.provider === 'resend';

  return (
    <>
      <PageHeader
        title="Integrations"
        description="The outside services SnapSell uses. Everything else runs on your own server."
      />
      {isPending ? (
        <div className="grid gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6">
          <IntegrationCard
            icon={Mail}
            name="Resend email"
            description="Password resets and alerts for you, the owner."
            badge={
              resend ? (
                <Badge tone="success" dot>
                  Configured
                </Badge>
              ) : (
                <Badge tone="warning" dot>
                  Not configured
                </Badge>
              )
            }
            detail={
              resend ? (
                <>
                  Sending from{' '}
                  <span className="font-medium text-foreground">{data?.email.from}</span>.
                </>
              ) : (
                <>
                  Emails are saved on the server in{' '}
                  <code className="font-mono text-xs">data/logs/emails</code>. Add{' '}
                  <code className="font-mono text-xs">RESEND_API_KEY</code> and a verified{' '}
                  <code className="font-mono text-xs">EMAIL_FROM</code> to{' '}
                  <code className="font-mono text-xs">.env</code>, then restart the API.
                </>
              )
            }
          />
          <IntegrationCard
            icon={CreditCard}
            name="DevDraft payments"
            description="Secure payment links for website and WhatsApp orders, confirmed by verified webhooks."
            badge={<Badge tone="outline">Phase 4</Badge>}
            detail="Connection test, webhook status and payment history will appear here."
          />
          <IntegrationCard
            icon={MessageCircle}
            name="WhatsApp"
            description="Link the shop's number by scanning a QR code, like WhatsApp Web."
            badge={<Badge tone="outline">Phase 5</Badge>}
            detail={
              <span className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  This uses an unofficial WhatsApp Web connection. WhatsApp may restrict numbers
                  that use it, so a dedicated business number is recommended. You’ll be asked to
                  accept this before linking.
                </span>
              </span>
            }
          />
        </div>
      )}
    </>
  );
}
