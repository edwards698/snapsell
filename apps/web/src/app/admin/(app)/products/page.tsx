import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductsPage } from './products-page';

export const metadata: Metadata = { title: 'Products' };

export default function Page() {
  return (
    <Suspense>
      <ProductsPage />
    </Suspense>
  );
}
