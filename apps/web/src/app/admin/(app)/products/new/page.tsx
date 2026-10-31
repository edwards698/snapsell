import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductEditor } from '../product-editor';

export const metadata: Metadata = { title: 'New product' };

export default function Page() {
  return (
    <Suspense>
      <ProductEditor />
    </Suspense>
  );
}
