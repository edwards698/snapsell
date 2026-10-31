'use client';

import { CommandDialog, CommandGroup, CommandItem, CommandSeparator, Kbd } from '@snapsell/ui';
import { ExternalLink, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import { NAV } from '@/lib/nav';
import { signOut } from './session';

/** ⌘K / Ctrl+K: jump anywhere (BUILD_PLAN §2.5). Orders, products and customers join in later phases. */
export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {NAV.map((group) => (
        <CommandGroup key={group.label} heading={group.label}>
          {group.items.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
              onSelect={() => run(() => router.push(item.href))}
            >
              <item.icon />
              <span className="flex-1">{item.label}</span>
              {item.phase && <span className="text-xs text-muted-foreground">Coming soon</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
      <CommandSeparator />
      <CommandGroup heading="Actions">
        <CommandItem value="theme light mode" onSelect={() => run(() => setTheme('light'))}>
          <Sun /> Light mode
        </CommandItem>
        <CommandItem value="theme dark mode" onSelect={() => run(() => setTheme('dark'))}>
          <Moon /> Dark mode
        </CommandItem>
        <CommandItem value="theme system appearance" onSelect={() => run(() => setTheme('system'))}>
          <Monitor /> Match system appearance
        </CommandItem>
        <CommandItem
          value="view storefront shop"
          onSelect={() => run(() => window.open('/', '_blank'))}
        >
          <ExternalLink /> View storefront
        </CommandItem>
        <CommandItem value="sign out log out" onSelect={() => run(() => void signOut())}>
          <LogOut /> Sign out
        </CommandItem>
      </CommandGroup>
      <div className="mt-2 hidden items-center justify-end gap-3 border-t border-border px-2 pt-2 text-xs text-muted-foreground sm:flex">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> to open
        </span>
        <span className="flex items-center gap-1">
          <Kbd>esc</Kbd> to close
        </span>
      </div>
    </CommandDialog>
  );
}
