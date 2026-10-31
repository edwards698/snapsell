import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StockPage } from './stock-page';

export const metadata: Metadata = { title: 'Stock' };

export default function Page() {
  return (
    <Suspense>
      <StockPage />
    </Suspense>
  );
}
