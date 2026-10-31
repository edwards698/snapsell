import type { Metadata } from 'next';
import { SystemPage } from './system';

export const metadata: Metadata = { title: 'System' };

export default function Page() {
  return <SystemPage />;
}
