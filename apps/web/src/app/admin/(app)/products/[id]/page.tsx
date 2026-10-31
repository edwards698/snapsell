import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductEditor } from '../product-editor';

export const metadata: Metadata = { title: 'Edit product' };

export default async function Page({ params }: PageProps<'/admin/products/[id]'>) {
  const { id } = await params;
  return (
    <Suspense>
      <ProductEditor productId={id} />
    </Suspense>
  );
}
