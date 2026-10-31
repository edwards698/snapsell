import { CartProvider } from '@/components/store/cart';
import { CartSheet } from '@/components/store/cart-sheet';
import { StoreHeader } from '@/components/store/store-header';
import { getStoreInfo } from '@/lib/store';

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const store = await getStoreInfo();
  return (
    <CartProvider>
      <div className="flex min-h-dvh flex-col">
        <StoreHeader shopName={store.name} />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              © {new Date().getFullYear()} {store.name}
            </p>
            <p className="flex gap-4">
              <span>Secure payments · Order online or on WhatsApp</span>
              <a href="/privacy" className="underline-offset-4 hover:underline">
                Privacy
              </a>
            </p>
          </div>
        </footer>
      </div>
      <CartSheet />
    </CartProvider>
  );
}
