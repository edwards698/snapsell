'use client';

import type { ConversationListItem } from '@snapsell/shared';
import { Avatar, Button, cn, EmptyState, Input, SegmentedControl, Skeleton } from '@snapsell/ui';
import { Bell, Hand, Inbox, Search, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { messagePreview } from '@/lib/inbox';
import { listTime } from './format';

export type ListFilter = 'all' | 'unread' | 'human';

export function ConversationList({
  items,
  isPending,
  selectedId,
  onSelect,
  search,
  onSearch,
  filter,
  onFilter,
}: {
  items: ConversationListItem[];
  isPending: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (q: string) => void;
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
}) {
  const filtered = !!search || filter !== 'all';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-3 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search name, number or message"
            aria-label="Search conversations"
            className="pl-9"
          />
        </div>
        <SegmentedControl
          aria-label="Filter conversations"
          size="sm"
          value={filter}
          onValueChange={onFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread' },
            { value: 'human', label: 'Taken over' },
          ]}
        />
        <NotificationPrompt />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <div className="grid gap-1 p-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              tone="neutral"
              title="No matching conversations"
              description="Try a different name, number or filter."
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No conversations yet"
              description="When customers message your WhatsApp number, their chats appear here."
            />
          )
        ) : (
          <ul className="grid gap-0.5 p-2" aria-label="Conversations">
            {items.map((c) => (
              <li key={c.id}>
                <ConversationRow
                  item={c}
                  active={c.id === selectedId}
                  onSelect={() => onSelect(c.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  item,
  active,
  onSelect,
}: {
  item: ConversationListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const unread = item.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      data-conversation={item.id}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
        active ? 'bg-primary-soft' : 'hover:bg-muted',
      )}
    >
      <Avatar name={item.customer.name} className="size-10 text-sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
            {item.customer.name}
          </span>
          {item.mode === 'HUMAN' && (
            <Hand className="size-3.5 shrink-0 text-primary" aria-label="Taken over" />
          )}
          {item.lastMessageAt && (
            <span
              className={cn(
                'ml-auto shrink-0 text-xs tabular-nums',
                unread ? 'font-medium text-primary' : 'text-muted-foreground',
              )}
            >
              {listTime(item.lastMessageAt)}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              'truncate text-sm',
              unread ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {item.lastMessage?.direction === 'OUT' && 'You: '}
            {messagePreview(item.lastMessage)}
          </span>
          {unread && (
            <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
              {item.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function NotificationPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    'unsupported',
  );
  useEffect(() => {
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);
  if (permission !== 'default') return null;
  return (
    <Button
      variant="soft"
      size="sm"
      onClick={() => void Notification.requestPermission().then(setPermission)}
    >
      <Bell /> Notify me about new messages
    </Button>
  );
}
