'use client';

import { cn, Logo, LogoMark, Tooltip } from '@snapsell/ui';
import { ChevronsLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive, NAV } from '@/lib/nav';
import { UnreadBadge } from './unread-badge';

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className={cn('flex h-16 items-center', collapsed ? 'justify-center' : 'px-5')}>
        <Link href="/admin" className="rounded-lg" aria-label="Dashboard">
          {collapsed ? <LogoMark /> : <Logo />}
        </Link>
      </div>

      <nav
        aria-label="Main navigation"
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4"
      >
        {NAV.map((group) => (
          <div key={group.label} className="mt-4 first:mt-1">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden />
            ) : (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </p>
            )}
            <ul className="grid gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const link = (
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex h-10 items-center gap-3 rounded-xl text-sm font-medium transition-colors',
                      collapsed ? 'justify-center' : 'px-3',
                      active
                        ? 'bg-primary-soft text-primary-soft-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <item.icon
                      className={cn('size-[18px] shrink-0', active ? 'text-primary' : '')}
                      aria-hidden
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {item.href === '/admin/inbox' && (
                      <UnreadBadge
                        className={collapsed ? 'absolute -top-0.5 right-1 scale-90' : 'ml-auto'}
                      />
                    )}
                    {!collapsed && item.phase && (
                      <span className="ml-auto rounded-md px-1.5 text-[10px] font-medium text-muted-foreground/70 group-hover:text-muted-foreground">
                        Soon
                      </span>
                    )}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip content={item.label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          'flex items-center gap-1 border-t border-border p-3',
          collapsed && 'flex-col',
        )}
      >
        <Tooltip content="View storefront" side="right">
          <Link
            href="/"
            target="_blank"
            className={cn(
              'flex h-9 items-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              collapsed ? 'w-9 justify-center' : 'flex-1 px-3',
            )}
          >
            <ExternalLink className="size-4" />
            {!collapsed && 'View storefront'}
          </Link>
        </Tooltip>
        <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
          <button
            type="button"
            onClick={onToggle}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
          >
            <ChevronsLeft
              className={cn('size-4 transition-transform', collapsed && 'rotate-180')}
            />
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
