'use client';

import { cn, EmptyState, Kbd, Sheet, SheetContent, SheetDescription, SheetTitle } from '@snapsell/ui';
import { MessagesSquare } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useDebounced } from '@/lib/catalog';
import { useConversation, useConversations } from '@/lib/inbox';
import { useRealtime } from '@/lib/realtime';
import { ConversationList, type ListFilter } from './conversation-list';
import { CustomerPanel } from './customer-panel';
import { isTyping, Thread } from './thread';

/** WhatsApp inbox: list · thread · customer on desktop; list → thread → sheet on phones. */
export function InboxPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get('c');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [filter, setFilter] = useState<ListFilter>('all');
  const [customerOpen, setCustomerOpen] = useState(false);
  const { connected } = useRealtime();

  const list = useConversations({ q: q || undefined, filter, pageSize: 100 });
  const detail = useConversation(selectedId);
  const items = list.data?.items ?? [];

  function select(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('c', id);
    else next.delete('c');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  // j / k move through the list.
  const nav = useRef({ items, selectedId, select });
  nav.current = { items, selectedId, select };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      if (e.key !== 'j' && e.key !== 'k') return;
      const { items, selectedId, select } = nav.current;
      if (!items.length) return;
      e.preventDefault();
      const i = items.findIndex((c) => c.id === selectedId);
      const next =
        i < 0 ? 0 : Math.max(0, Math.min(items.length - 1, i + (e.key === 'j' ? 1 : -1)));
      const id = items[next]!.id;
      select(id);
      document
        .querySelector(`[data-conversation="${id}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const notFound = detail.isError && !!selectedId;

  return (
    <div className="flex h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] min-h-0 lg:h-[calc(100dvh-4rem)]">
      <section
        aria-label="Conversation list"
        className={cn(
          'w-full min-w-0 border-r border-border bg-surface md:w-80 md:shrink-0 lg:w-96',
          selectedId ? 'hidden md:block' : 'block',
        )}
      >
        <ConversationList
          items={items}
          isPending={list.isPending}
          selectedId={selectedId}
          onSelect={select}
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
        />
      </section>

      <section
        aria-label="Conversation"
        className={cn('min-w-0 flex-1 bg-background', selectedId ? 'block' : 'hidden md:block')}
      >
        {!selectedId || notFound ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessagesSquare}
              title={notFound ? 'Conversation not found' : 'Pick a conversation'}
              description={
                notFound ? (
                  'It may have been removed. Choose another chat from the list.'
                ) : (
                  <>
                    Customer chats from WhatsApp show up here as they arrive.
                    <span className="mt-3 hidden items-center justify-center gap-1.5 text-xs lg:flex">
                      <Kbd>J</Kbd>/<Kbd>K</Kbd> move · <Kbd>R</Kbd> reply · <Kbd>T</Kbd> take over
                    </span>
                  </>
                )
              }
            />
          </div>
        ) : (
          <Thread
            conversation={detail.data}
            isPending={detail.isPending}
            onBack={() => select(null)}
            onShowCustomer={() => setCustomerOpen(true)}
          />
        )}
      </section>

      {selectedId && detail.data && (
        <>
          <aside
            aria-label="Customer"
            className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-surface xl:block"
          >
            <CustomerPanel conversation={detail.data} />
          </aside>
          <Sheet open={customerOpen} onOpenChange={setCustomerOpen}>
            <SheetContent className="overflow-y-auto xl:hidden">
              <SheetTitle className="sr-only">Customer details</SheetTitle>
              <SheetDescription className="sr-only">
                Contact details and recent orders for {detail.data.customer.name}
              </SheetDescription>
              <CustomerPanel conversation={detail.data} />
            </SheetContent>
          </Sheet>
        </>
      )}

      <span className="sr-only" aria-live="polite">
        {connected ? '' : 'Live updates paused, reconnecting'}
      </span>
    </div>
  );
}
