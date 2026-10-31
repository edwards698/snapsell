import type { Metadata } from 'next';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata: Metadata = { title: 'Reports' };

export default function Page() {
  return <ComingSoon href="/admin/reports" />;
}
