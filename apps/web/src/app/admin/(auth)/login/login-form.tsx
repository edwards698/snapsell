'use client';

import { loginSchema, type MeResponse } from '@snapsell/shared';
import { Alert, Button, Field, Input, PasswordInput } from '@snapsell/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFormErrors } from '@/components/auth/use-form-errors';
import { api } from '@/lib/api';

/** Only allow redirects back into the admin, never to another site. */
function safeNext(next: string | undefined) {
  return next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const router = useRouter();
  const errors = useFormErrors();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const input = errors.validate(loginSchema, data);
    if (!input) return;
    setPending(true);
    try {
      await api<MeResponse>('/admin/auth/login', { json: input });
      router.replace(safeNext(next));
      router.refresh();
    } catch (err) {
      errors.fromError(err);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {notice === 'reset' && (
        <Alert tone="success" title="Password updated">
          Sign in with your new password.
        </Alert>
      )}
      {notice === 'signed-out' && <Alert tone="info">You’ve been signed out.</Alert>}
      {errors.form && (
        <Alert tone={errors.form.code === 'INVALID_CREDENTIALS' ? 'danger' : 'warning'}>
          {errors.form.message}
        </Alert>
      )}

      <Field label="Email" error={errors.fields.email}>
        <Input
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="you@yourshop.com"
          autoFocus
          onChange={() => errors.clear('email')}
        />
      </Field>
      <Field
        label="Password"
        error={errors.fields.password}
        action={
          <Link
            href="/admin/forgot-password"
            className="text-sm font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        }
      >
        <PasswordInput
          name="password"
          autoComplete="current-password"
          onChange={() => errors.clear('password')}
        />
      </Field>

      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Sign in <ArrowRight />
      </Button>
    </form>
  );
}
