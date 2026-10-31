import type { Metadata } from 'next';
import { AiPage } from './ai-page';

export const metadata: Metadata = { title: 'AI Assistant' };

export default function Page() {
  return <AiPage />;
}
