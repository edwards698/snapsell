import type { Metadata } from 'next';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  return <ComingSoon href="/admin/orders" />;
}
