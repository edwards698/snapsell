import type { Metadata } from 'next';
import { CheckoutForm } from './checkout-form';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default function CheckoutPage() {
  return <CheckoutForm />;
}
