'use client';

import { Badge, Skeleton, Tooltip } from '@snapsell/ui';
import { MessageCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSystemStatus } from './session';

const WHATSAPP_LABEL: Record<
  string,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  CONNECTED: { label: 'Connected', tone: 'success' },
  CONNECTING: { label: 'Connecting', tone: 'warning' },
  DISCONNECTED: { label: 'Disconnected', tone: 'danger' },
  NOT_CONFIGURED: { label: 'Not linked', tone: 'neutral' },
};

/** Always-visible WhatsApp and AI state (BUILD_PLAN §2.1 principle 4). */
export function StatusPills() {
  const { data, isPending } = useSystemStatus();
  if (isPending) {
    return (
      <div className="hidden items-center gap-2 md:flex">
        <Skeleton className="h-7 w-36 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
    );
  }
  const wa = data?.integrations.find((i) => i.kind === 'WHATSAPP');
  const state = WHATSAPP_LABEL[wa?.status ?? 'NOT_CONFIGURED'] ?? WHATSAPP_LABEL.NOT_CONFIGURED!;
  return (
    <div className="hidden items-center gap-2 md:flex">
      <Tooltip content="WhatsApp connection · linking arrives in Phase 5">
        <Link href="/admin/integrations" className="rounded-full">
          <Badge
            tone={state.tone}
            dot
            pulse={state.tone === 'warning'}
            className="h-7 px-3 hover:opacity-80"
          >
            <MessageCircle className="size-3.5" /> WhatsApp · {state.label}
          </Badge>
        </Link>
      </Tooltip>
      <Tooltip content="AI assistant mode · configurable in Phase 6">
        <Link href="/admin/ai" className="rounded-full">
          <Badge tone="neutral" className="h-7 px-3 hover:opacity-80">
            <Sparkles className="size-3.5" /> AI · Off
          </Badge>
        </Link>
      </Tooltip>
    </div>
  );
}
