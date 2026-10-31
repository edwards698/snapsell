import type { Metadata } from 'next';
import { TestPayment } from './test-payment';

export const metadata: Metadata = { title: 'Test payment', robots: { index: false } };

export default async function Page({ params }: PageProps<'/pay/test/[linkId]'>) {
  return <TestPayment linkId={(await params).linkId} />;
}
