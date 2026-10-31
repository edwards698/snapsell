'use client';

import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@snapsell/ui';
import { ExternalLink, LogOut, Moon, Server, Settings, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { signOut, useSessionUser } from './session';

export function UserMenu() {
  const user = useSessionUser();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full p-0.5 transition-shadow hover:ring-4 hover:ring-muted data-[state=open]:ring-4 data-[state=open]:ring-muted"
        aria-label="Account menu"
      >
        <Avatar name={user.name} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="text-sm font-semibold text-foreground">{user.name}</span>
          <span className="truncate font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/admin/settings')}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/admin/system')}>
          <Server /> System status
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? <Sun /> : <Moon />} {dark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.open('/', '_blank')}>
          <ExternalLink /> View storefront
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
