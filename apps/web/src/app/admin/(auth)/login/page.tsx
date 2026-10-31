import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/admin/login'>) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : undefined;
  const notice = typeof params.notice === 'string' ? params.notice : undefined;
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to manage your shop, orders and chats.
        </p>
      </div>
      <LoginForm next={next} notice={notice} />
    </>
  );
}
