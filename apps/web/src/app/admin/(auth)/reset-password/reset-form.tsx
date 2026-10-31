'use client';

import { resetPasswordSchema } from '@snapsell/shared';
import { Alert, Button, Field, PasswordInput } from '@snapsell/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PasswordStrength } from '@/components/auth/password-strength';
import { useFormErrors } from '@/components/auth/use-form-errors';
import { api } from '@/lib/api';

export function ResetForm({ token }: { token: string | undefined }) {
  const router = useRouter();
  const errors = useFormErrors();
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState('');
  const [mismatch, setMismatch] = useState(false);

  if (!token) {
    return (
      <div className="grid gap-5">
        <Alert tone="warning" title="This link is incomplete">
          Open the link from your email again, or request a new one.
        </Alert>
        <Button asChild>
          <Link href="/admin/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const input = errors.validate(resetPasswordSchema, { token, password: data.password });
    setMismatch(data.password !== data.confirm);
    if (!input || data.password !== data.confirm) return;
    setPending(true);
    try {
      await api('/admin/auth/reset-password', { json: input });
      router.replace('/admin/login?notice=reset');
    } catch (err) {
      errors.fromError(err);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {errors.form && (
        <Alert tone="danger">
          {errors.form.message}{' '}
          {errors.form.code === 'INVALID_RESET_TOKEN' && (
            <Link href="/admin/forgot-password" className="font-semibold underline">
              Request a new link
            </Link>
          )}
        </Alert>
      )}
      <Field label="New password" error={errors.fields.password}>
        <PasswordInput
          name="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            errors.clear('password');
          }}
        />
      </Field>
      <PasswordStrength value={password} />
      <Field label="Confirm new password" error={mismatch ? 'Passwords don’t match' : undefined}>
        <PasswordInput
          name="confirm"
          autoComplete="new-password"
          onChange={() => setMismatch(false)}
        />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Update password
      </Button>
    </form>
  );
}
