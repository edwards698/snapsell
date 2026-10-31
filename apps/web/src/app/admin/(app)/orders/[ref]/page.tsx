import type { Metadata } from 'next';
import { OrderDetailView } from './order-detail';

export async function generateMetadata({
  params,
}: PageProps<'/admin/orders/[ref]'>): Promise<Metadata> {
  return { title: (await params).ref };
}

export default async function Page({ params }: PageProps<'/admin/orders/[ref]'>) {
  return <OrderDetailView orderRef={(await params).ref} />;
}
