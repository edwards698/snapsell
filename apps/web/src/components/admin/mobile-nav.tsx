'use client';

import {
  cn,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@snapsell/ui';
import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { isActive, MOBILE_TABS, NAV, navItem } from '@/lib/nav';

/** Bottom tab bar for phones (BUILD_PLAN §2.5): Home · Orders · Inbox · Products · More. */
export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = MOBILE_TABS.map((href) => navItem(href)!);
  const moreActive = !tabs.some((t) => isActive(pathname, t.href));

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {tabs.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                      active && 'bg-primary-soft',
                    )}
                  >
                    <tab.icon className="size-5" aria-hidden />
                  </span>
                  {tab.href === '/admin' ? 'Home' : tab.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                'flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                moreActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full',
                  moreActive && 'bg-primary-soft',
                )}
              >
                <Ellipsis className="size-5" aria-hidden />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Menu</DrawerTitle>
            <DrawerDescription className="sr-only">All sections of the admin</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-3 pb-6">
            {NAV.map((group) => {
              const items = group.items.filter((i) => !MOBILE_TABS.includes(i.href));
              if (!items.length) return null;
              return (
                <div key={group.label} className="mt-3">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {group.label}
                  </p>
                  <ul className="grid grid-cols-2 gap-2">
                    {items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            'flex h-14 items-center gap-3 rounded-2xl border border-border px-3.5 text-sm font-medium transition-colors active:bg-muted',
                            isActive(pathname, item.href) &&
                              'border-primary/30 bg-primary-soft text-primary-soft-foreground',
                          )}
                        >
                          <item.icon className="size-5 text-muted-foreground" aria-hidden />
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
