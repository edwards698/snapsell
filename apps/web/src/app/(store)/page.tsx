import { Badge, Card } from '@snapsell/ui';
import { CreditCard, MessageCircle, ShoppingBag, Truck } from 'lucide-react';
import { getStoreInfo } from '@/lib/store';

const FEATURES = [
  {
    icon: ShoppingBag,
    title: 'Shop without an account',
    text: 'Just your name and phone number at checkout.',
  },
  {
    icon: MessageCircle,
    title: 'Order on WhatsApp',
    text: 'Send a message, a photo or a voice note.',
  },
  {
    icon: CreditCard,
    title: 'Secure payment links',
    text: 'Pay safely; we confirm as soon as it clears.',
  },
  { icon: Truck, title: 'Delivery or collection', text: 'Choose what suits you at checkout.' },
];

export default async function StoreHome() {
  const store = await getStoreInfo();
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(50% 60% at 15% 0%, var(--primary-soft), transparent 70%), radial-gradient(40% 50% at 95% 30%, var(--accent-soft), transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <Badge tone="primary" dot pulse>
            Opening soon
          </Badge>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {store.name} is getting ready for you.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground text-pretty">
            Our products are on their way to this page. Soon you’ll be able to browse, add to cart
            and pay securely in a few taps.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16" aria-label="How it works">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <Card className="h-full p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <f.icon className="size-5" />
                </span>
                <h2 className="mt-4 text-sm font-semibold">{f.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
