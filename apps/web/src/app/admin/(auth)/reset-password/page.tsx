import type { Metadata } from 'next';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<'/admin/reset-password'>) {
  const { token } = await searchParams;
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Choose a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You’ll be signed out everywhere else once it’s changed.
        </p>
      </div>
      <ResetForm token={typeof token === 'string' ? token : undefined} />
    </>
  );
}
