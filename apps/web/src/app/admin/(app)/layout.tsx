import type { MeResponse } from '@snapsell/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · SnapSell Admin' },
  robots: { index: false },
};

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  // The proxy only checks that a cookie exists; this validates it with the API.
  const me = await serverApi<MeResponse>('/admin/auth/me');
  if (!me) redirect('/admin/login');
  return <AdminShell user={me.user}>{children}</AdminShell>;
}
