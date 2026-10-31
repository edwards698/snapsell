import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InboxPage } from './inbox-page';

export const metadata: Metadata = { title: 'Inbox' };

export default function Page() {
  return (
    <Suspense>
      <InboxPage />
    </Suspense>
  );
}
