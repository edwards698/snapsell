'use client';

import type { SessionUser } from '@snapsell/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import type { Overview, SystemStatus } from '@snapsell/shared';
import { api } from '@/lib/api';

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser() {
  const user = useContext(SessionContext);
  if (!user) throw new Error('useSessionUser must be used inside the admin layout');
  return user;
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ['system'],
    queryFn: () => api<SystemStatus>('/admin/system'),
    refetchInterval: 30_000,
  });
}

export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/admin/overview') });
}

export async function signOut() {
  await api('/admin/auth/logout', { method: 'POST' }).catch(() => undefined);
  window.location.assign('/admin/login?notice=signed-out');
}
