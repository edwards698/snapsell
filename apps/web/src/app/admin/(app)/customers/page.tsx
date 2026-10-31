import type { Metadata } from 'next';
import { CustomersPage } from './customers-page';

export const metadata: Metadata = { title: 'Customers' };

export default function Page() {
  return <CustomersPage />;
}
