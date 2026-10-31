import type { Metadata } from 'next';
import { getStoreInfo } from '@/lib/store';

export const metadata: Metadata = { title: 'Privacy notice' };

export default async function PrivacyPage() {
  const store = await getStoreInfo();
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy notice</h1>
      <p>
        How {store.name} uses the information you share when you order from us on this website or on
        WhatsApp.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name and phone number, to process your order and send you updates.</li>
        <li>Your delivery address, only if you choose delivery.</li>
        <li>
          What you ordered and your payment status. Card or wallet details are handled by our
          payment provider and never reach us.
        </li>
        <li>Messages, photos and voice notes you send us on WhatsApp.</li>
      </ul>

      <h2>Our assistant</h2>
      <p>
        On WhatsApp, an AI assistant (Google Gemini) may help answer your questions and prepare your
        order. It reads your messages, photos and voice notes to understand what you need. It can’t
        change prices, mark payments as received or see payment details, and the shop owner can take
        over the conversation at any time. Photos and voice notes are deleted after they’ve been
        processed unless they’re needed for your order.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li>Our payment provider, to take your payment.</li>
        <li>Google, to run the assistant on your WhatsApp messages.</li>
        <li>Nobody else, unless the law requires it. We don’t sell your information.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Order records are kept for as long as we need them for accounting and the law. You can ask
        us to delete your other details at any time.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask to see, correct or delete your information, or ask for a person instead of the
        assistant on WhatsApp. Just message us.
      </p>
    </article>
  );
}
