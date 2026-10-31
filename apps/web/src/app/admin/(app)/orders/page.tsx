import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrdersPage } from './orders-page';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  return (
    <Suspense>
      <OrdersPage />
    </Suspense>
  );
}
