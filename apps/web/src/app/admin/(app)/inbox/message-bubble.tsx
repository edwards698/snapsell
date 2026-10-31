'use client';

import type { MessageDto } from '@snapsell/shared';
import { Button, cn, Tooltip } from '@snapsell/ui';
import { Check, CheckCheck, CircleAlert, Clock3, FileText, RotateCw, Sparkles } from 'lucide-react';
import { clock } from './format';

function DeliveryTick({ state }: { state: MessageDto['deliveryState'] }) {
  switch (state) {
    case 'PENDING':
      return <Clock3 className="size-3.5" aria-label="Sending" />;
    case 'SENT':
      return <Check className="size-3.5" aria-label="Sent" />;
    case 'DELIVERED':
      return <CheckCheck className="size-3.5" aria-label="Delivered" />;
    case 'READ':
      return <CheckCheck className="size-3.5 text-info" aria-label="Read" />;
    case 'ERROR':
      return <CircleAlert className="size-3.5 text-danger" aria-label="Not sent" />;
    default:
      return null;
  }
}

function Media({ message }: { message: MessageDto }) {
  const media = message.media;
  if (!media?.url) {
    if (message.type === 'TEXT') return null;
    return (
      <p className="text-sm italic opacity-80">
        {message.type === 'OTHER'
          ? 'This message type can’t be shown here. Open WhatsApp on your phone to see it.'
          : 'Media unavailable.'}
      </p>
    );
  }
  if (message.type === 'IMAGE') {
    return (
      <a href={media.url} target="_blank" rel="noreferrer" className="-mx-1 -mt-0.5 block">
        <img
          src={media.url}
          alt={message.body ?? 'Photo from customer'}
          className="max-h-72 w-full rounded-lg object-cover"
          loading="lazy"
        />
      </a>
    );
  }
  if (message.type === 'AUDIO') {
    return <audio controls preload="none" src={media.url} className="h-10 w-60 max-w-full" />;
  }
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-sm font-medium underline-offset-2 hover:underline dark:bg-white/10"
    >
      <FileText className="size-4 shrink-0" />
      Open document
      <span className="text-xs font-normal opacity-70">({Math.ceil(media.size / 1024)} KB)</span>
    </a>
  );
}

export function MessageBubble({
  message,
  onRetry,
  retrying,
}: {
  message: MessageDto;
  onRetry: () => void;
  retrying: boolean;
}) {
  const out = message.direction === 'OUT';
  const failed = message.deliveryState === 'ERROR';
  return (
    <div className={cn('flex flex-col', out ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'grid max-w-[85%] gap-1.5 rounded-2xl px-3.5 py-2 shadow-xs sm:max-w-[70%]',
          out
            ? 'rounded-br-md bg-primary-soft text-primary-soft-foreground'
            : 'rounded-bl-md border border-border bg-surface',
          failed && 'ring-1 ring-danger/40',
        )}
      >
        {out && message.author === 'AI' && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-ai">
            <Sparkles className="size-3" /> Assistant
          </span>
        )}
        <Media message={message} />
        {message.body && (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
        )}
        <span className="flex items-center justify-end gap-1 text-[11px] tabular-nums opacity-70">
          {clock(message.createdAt)}
          {out && <DeliveryTick state={message.deliveryState} />}
        </span>
      </div>
      {failed && (
        <div className="mt-1 flex items-center gap-2 text-xs text-danger">
          Not sent
          <Tooltip content="Try sending this message again">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-danger"
              loading={retrying}
              onClick={onRetry}
            >
              <RotateCw className="size-3.5" /> Retry
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
