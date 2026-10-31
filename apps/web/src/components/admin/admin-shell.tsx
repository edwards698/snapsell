'use client';

import type { SessionUser } from '@snapsell/shared';
import { Kbd, LogoMark } from '@snapsell/ui';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { QueryProvider } from '@/components/providers/query-provider';
import { CommandMenu } from './command-menu';
import { MobileNav } from './mobile-nav';
import { SessionProvider } from './session';
import { Sidebar } from './sidebar';
import { StatusPills } from './status-pills';
import { UserMenu } from './user-menu';

const SIDEBAR_KEY = 'snapsell:sidebar-collapsed';

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1');
    } catch {
      // Storage unavailable (private mode) – keep the default.
    }
  }, []);

  function toggleSidebar() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1');
      } catch {
        // ignore
      }
      return !c;
    });
  }

  return (
    <QueryProvider>
      <SessionProvider user={user}>
        <div className="flex min-h-dvh">
          <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-lg sm:px-6">
              <Link href="/admin" className="rounded-lg lg:hidden" aria-label="Dashboard">
                <LogoMark />
              </Link>
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 text-sm text-muted-foreground shadow-xs transition-colors hover:border-border-strong sm:max-w-sm"
              >
                <Search className="size-4" aria-hidden />
                <span className="flex-1 text-left">Search or jump to…</span>
                <span className="hidden items-center gap-0.5 sm:flex">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
              <div className="ml-auto flex items-center gap-3">
                <StatusPills />
                <UserMenu />
              </div>
            </header>
            <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
          </div>
        </div>
        <MobileNav />
        <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      </SessionProvider>
    </QueryProvider>
  );
}
