'use client';

import type { ConversationDetail } from '@snapsell/shared';
import {
  Avatar,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  toast,
} from '@snapsell/ui';
import {
  ArrowLeft,
  ChevronDown,
  Hand,
  Info,
  Pause,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { ApiRequestError } from '@/lib/api';
import {
  MODE_LABEL,
  useConversationActions,
  useOlderMessages,
  usePresets,
  useWhatsAppStatus,
} from '@/lib/inbox';
import { Composer, type ComposerHandle } from './composer';
import { DraftCard } from './draft-card';
import { clock, dayLabel, sameDay } from './format';
import { MessageBubble } from './message-bubble';

function errorToast(err: unknown) {
  toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
}

function inMinutes(m: number) {
  return new Date(Date.now() + m * 60_000).toISOString();
}

function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

/** True when the keyboard event comes from somewhere the owner is typing. */
export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) ||
      !!t.closest('[role="dialog"],[role="menu"]'))
  );
}

export function Thread({
  conversation,
  isPending,
  onBack,
  onShowCustomer,
}: {
  conversation: ConversationDetail | undefined;
  isPending: boolean;
  onBack: () => void;
  onShowCustomer: () => void;
}) {
  if (isPending || !conversation) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid flex-1 content-end gap-3 p-4">
          <Skeleton className="h-12 w-2/3 rounded-2xl" />
          <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
          <Skeleton className="h-16 w-3/5 rounded-2xl" />
        </div>
      </div>
    );
  }
  return (
    <LoadedThread
      key={conversation.id}
      conversation={conversation}
      onBack={onBack}
      onShowCustomer={onShowCustomer}
    />
  );
}

function LoadedThread({
  conversation,
  onBack,
  onShowCustomer,
}: {
  conversation: ConversationDetail;
  onBack: () => void;
  onShowCustomer: () => void;
}) {
  const actions = useConversationActions(conversation.id);
  const older = useOlderMessages(conversation.id);
  const { data: presets = [] } = usePresets();
  const { data: wa } = useWhatsAppStatus();
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const prevHeight = useRef<number | null>(null);
  const firstId = conversation.messages[0]?.id;
  const lastId = conversation.messages.at(-1)?.id;
  const human = conversation.mode === 'HUMAN';
  const mode = MODE_LABEL[conversation.mode];
  const draft = [...conversation.messages].reverse().find((m) => m.aiDraftStatus === 'DRAFT');
  const visible = conversation.messages.filter(
    (m) => m.aiDraftStatus !== 'DRAFT' && m.aiDraftStatus !== 'REJECTED',
  );

  // Open at the newest message; keep position when older pages load above.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    }
  }, [firstId]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    const mine = conversation.messages.at(-1)?.direction === 'OUT';
    if (nearBottom || mine || el.dataset.ready !== '1') {
      el.scrollTop = el.scrollHeight;
      el.dataset.ready = '1';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  // Reading the thread clears its unread count.
  const markRead = actions.markRead;
  useEffect(() => {
    if (conversation.unreadCount > 0 && !markRead.isPending && !document.hidden) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.unreadCount]);

  function takeOver(until: string | null) {
    actions.takeover.mutate(until, {
      onError: errorToast,
      onSuccess: () => toast.success('You’ve taken over this chat'),
    });
  }
  function handBack() {
    actions.release.mutate(undefined, {
      onError: errorToast,
      onSuccess: () => toast.success('Handed back to the assistant'),
    });
  }

  // r = reply, t = take over / hand back.
  const shortcuts = useRef({ takeOver, handBack, human });
  shortcuts.current = { takeOver, handBack, human };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      if (e.key === 'r') {
        e.preventDefault();
        composer.current?.focus();
      } else if (e.key === 't') {
        e.preventDefault();
        const s = shortcuts.current;
        if (s.human) s.handBack();
        else s.takeOver(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const offline = wa && wa.status !== 'CONNECTED';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-2 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft />
        </Button>
        <button
          type="button"
          onClick={onShowCustomer}
          className="flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 text-left xl:pointer-events-none"
        >
          <Avatar name={conversation.customer.name} className="size-10 text-sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {conversation.customer.name}
            </span>
            <span className="block truncate text-xs tabular-nums text-muted-foreground">
              {conversation.customer.phone}
            </span>
          </span>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={human ? 'soft' : 'outline'}
                size="sm"
                loading={
                  actions.takeover.isPending ||
                  actions.release.isPending ||
                  actions.setMode.isPending
                }
              >
                {human ? <Hand /> : conversation.mode === 'PAUSED' ? <Pause /> : <Sparkles />}
                <span className="hidden sm:inline">
                  {mode.label}
                  {human && conversation.takeoverUntil && ` · until ${clock(conversation.takeoverUntil)}`}
                </span>
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {human ? (
                <>
                  <DropdownMenuLabel>
                    {conversation.takeoverUntil
                      ? `You’re replying until ${clock(conversation.takeoverUntil)}`
                      : 'You’re replying until you hand back'}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onSelect={handBack}>
                    <Sparkles /> Hand back to assistant
                    <kbd className="ml-auto text-xs text-muted-foreground">T</kbd>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Change how long</DropdownMenuLabel>
                </>
              ) : (
                <DropdownMenuLabel>Take over from the assistant</DropdownMenuLabel>
              )}
              <DropdownMenuItem onSelect={() => takeOver(inMinutes(30))}>
                <Hand /> For 30 minutes
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => takeOver(inMinutes(120))}>
                <Hand /> For 2 hours
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => takeOver(tomorrowMorning())}>
                <Hand /> Until tomorrow 08:00
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => takeOver(null)}>
                <Hand /> Until I hand back
                {!human && <kbd className="ml-auto text-xs text-muted-foreground">T</kbd>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {conversation.mode === 'PAUSED' ? (
                <DropdownMenuItem onSelect={handBack}>
                  <Sparkles /> Resume assistant
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() => actions.setMode.mutate('PAUSED', { onError: errorToast })}
                >
                  <Pause /> Pause assistant for this chat
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
            onClick={onShowCustomer}
            aria-label="Customer details"
          >
            <Info />
          </Button>
        </div>
      </header>

      {offline && (
        <div className="flex shrink-0 items-start gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning-soft-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            WhatsApp isn’t connected. Replies wait and send once it reconnects.{' '}
            <Link href="/admin/integrations" className="font-medium underline underline-offset-2">
              Check connection
            </Link>
          </span>
        </div>
      )}

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto bg-muted/40 px-3 py-4 sm:px-6"
        aria-live="polite"
      >
        {conversation.hasMore && (
          <div className="mb-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              loading={older.isPending}
              onClick={() => {
                prevHeight.current = scroller.current?.scrollHeight ?? null;
                older.mutate(conversation.messages[0]!.createdAt, { onError: errorToast });
              }}
            >
              Load earlier messages
            </Button>
          </div>
        )}
        {visible.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No messages yet.</p>
        )}
        <div className="grid gap-2">
          {visible.map((m, i) => {
            const prev = visible[i - 1];
            return (
              <Fragment key={m.id}>
                {(!prev || !sameDay(prev.createdAt, m.createdAt)) && (
                  <div className="my-2 flex justify-center">
                    <Badge tone="neutral" className="bg-surface shadow-xs">
                      {dayLabel(m.createdAt)}
                    </Badge>
                  </div>
                )}
                <MessageBubble
                  message={m}
                  retrying={actions.retry.isPending && actions.retry.variables === m.id}
                  onRetry={() => actions.retry.mutate(m.id, { onError: errorToast })}
                />
              </Fragment>
            );
          })}
        </div>
      </div>

      {draft && (
        <DraftCard
          draft={draft}
          approving={actions.approveDraft.isPending || actions.editDraft.isPending}
          discarding={actions.discardDraft.isPending}
          onApprove={() => actions.approveDraft.mutate(draft.id, { onError: errorToast })}
          onEdit={(body) =>
            actions.editDraft.mutate({ messageId: draft.id, body }, { onError: errorToast })
          }
          onDiscard={() => actions.discardDraft.mutate(draft.id, { onError: errorToast })}
        />
      )}
      <Composer
        ref={composer}
        presets={presets}
        sending={actions.send.isPending}
        disabledReason={
          offline ? 'WhatsApp isn’t connected: replies are queued until it reconnects.' : null
        }
        onSend={(body) => actions.send.mutateAsync(body).catch((err) => {
          errorToast(err);
          throw err;
        })}
      />
    </div>
  );
}
