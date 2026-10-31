import type { Metadata } from 'next';
import { Integrations } from './integrations';

export const metadata: Metadata = { title: 'Integrations' };

export default function Page() {
  return <Integrations />;
}
