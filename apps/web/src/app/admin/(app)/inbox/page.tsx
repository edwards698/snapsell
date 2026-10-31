import type { Metadata } from 'next';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata: Metadata = { title: 'Inbox' };

export default function Page() {
  return (
    <ComingSoon href="/admin/inbox">
      Every WhatsApp conversation in one place: customer details alongside the chat, AI drafts to
      approve, and a single button to take over from the assistant.
    </ComingSoon>
  );
}
