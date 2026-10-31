'use client';

import { type AiSettingsDto, type WhatsAppStatus } from '@snapsell/shared';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  Tooltip,
  toast,
} from '@snapsell/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { api, ApiRequestError } from '@/lib/api';
import { useWhatsAppStatus } from '@/lib/inbox';

function useAiMode() {
  return useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => api<AiSettingsDto>('/admin/ai-settings'),
    staleTime: 30_000,
  });
}

export function aiModeLabel(settings: AiSettingsDto | undefined) {
  if (!settings?.enabled || settings.mode === 'MANUAL') {
    return { label: 'Off', tone: 'neutral' as const };
  }
  if (settings.mode === 'AUTO') return { label: 'Auto', tone: 'ai' as const };
  return { label: 'Suggest', tone: 'ai' as const };
}

type GlobalMode = AiSettingsDto['mode'] | 'OFF';

function applyMode(settings: AiSettingsDto, mode: GlobalMode): AiSettingsDto {
  if (mode === 'OFF') return { ...settings, enabled: false, mode: 'MANUAL' };
  return { ...settings, enabled: true, mode };
}

const WHATSAPP_LABEL: Record<
  string,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  CONNECTED: { label: 'Connected', tone: 'success' },
  CONNECTING: { label: 'Connecting', tone: 'warning' },
  DISCONNECTED: { label: 'Disconnected', tone: 'danger' },
  NOT_CONFIGURED: { label: 'Not linked', tone: 'neutral' },
};

export function whatsappLabel(wa: WhatsAppStatus | undefined) {
  if (wa && !wa.serviceReachable && wa.status !== 'NOT_CONFIGURED') {
    return { label: 'Service offline', tone: 'danger' as const };
  }
  if (wa?.state === 'QR') return { label: 'Scan QR code', tone: 'warning' as const };
  return WHATSAPP_LABEL[wa?.status ?? 'NOT_CONFIGURED'] ?? WHATSAPP_LABEL.NOT_CONFIGURED!;
}

/** Always-visible WhatsApp and AI state (BUILD_PLAN §2.1 principle 4). */
export function StatusPills() {
  const qc = useQueryClient();
  const { data: wa, isPending } = useWhatsAppStatus();
  const { data: ai, isPending: aiPending } = useAiMode();
  const setMode = useMutation({
    mutationFn: async (mode: GlobalMode) => {
      if (!ai) throw new Error('Settings not loaded');
      const next = applyMode(ai, mode);
      const { configured: _c, ...body } = next;
      return api<AiSettingsDto>('/admin/ai-settings', { method: 'PATCH', json: body });
    },
    onSuccess: (saved) => {
      qc.setQueryData(['ai-settings'], saved);
      toast.success('Assistant mode updated');
    },
    onError: (err) =>
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not update AI mode.'),
  });
  if (isPending || aiPending) {
    return (
      <div className="hidden items-center gap-2 md:flex">
        <Skeleton className="h-7 w-36 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
    );
  }
  const state = whatsappLabel(wa);
  const aiState = aiModeLabel(ai);
  return (
    <div className="hidden items-center gap-2 md:flex">
      <Tooltip content={wa?.number ? `WhatsApp · ${wa.number}` : 'WhatsApp connection'}>
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
      <DropdownMenu>
        <Tooltip content="AI assistant mode — click to change">
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded-full" aria-label="Change AI mode">
              <Badge tone={aiState.tone} className="h-7 px-3 hover:opacity-80">
                <Sparkles className="size-3.5" /> AI · {aiState.label}
              </Badge>
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMode.mutate('OFF')}>Off</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMode.mutate('SUGGEST')}>Suggest</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMode.mutate('AUTO')}>Auto</DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/admin/ai">More settings…</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
