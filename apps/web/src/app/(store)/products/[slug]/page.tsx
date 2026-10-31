import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/store';
import { ProductView } from './product-view';

export async function generateMetadata({
  params,
}: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  return product
    ? { title: product.name, description: product.description.slice(0, 160) }
    : { title: 'Not found' };
}

export default async function ProductPage({ params }: PageProps<'/products/[slug]'>) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-4 sm:px-6 sm:pt-8 lg:pb-16">
      <nav aria-label="Breadcrumb" className="mb-4 flex gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Shop
        </Link>
        {product.category && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/?category=${product.category.slug}`} className="hover:text-foreground">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>
      <ProductView product={product} />
    </div>
  );
}
