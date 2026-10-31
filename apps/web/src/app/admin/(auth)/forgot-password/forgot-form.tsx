'use client';

import { forgotPasswordSchema } from '@snapsell/shared';
import { Alert, Button, Field, Input } from '@snapsell/ui';
import { ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useFormErrors } from '@/components/auth/use-form-errors';
import { api } from '@/lib/api';

export function ForgotForm() {
  const errors = useFormErrors();
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = errors.validate(
      forgotPasswordSchema,
      Object.fromEntries(new FormData(e.currentTarget)),
    );
    if (!input) return;
    setPending(true);
    try {
      await api('/admin/auth/forgot-password', { json: input });
      setSentTo(input.email);
    } catch (err) {
      errors.fromError(err);
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="grid gap-6 animate-slide-up">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-foreground">
          <MailCheck className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If <span className="font-medium text-foreground">{sentTo}</span> belongs to the shop
            owner, a reset link is on its way. It expires in 30 minutes.
          </p>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <Alert tone="info" title="Email not set up?">
            Without a Resend API key, emails are saved on the server in{' '}
            <code className="font-mono text-xs">data/logs/emails</code>.
          </Alert>
        )}
        <Button variant="outline" asChild>
          <Link href="/admin/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Forgot your password?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email and we’ll send you a link to choose a new one.
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        {errors.form && <Alert tone="warning">{errors.form.message}</Alert>}
        <Field label="Email" error={errors.fields.email}>
          <Input
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoFocus
            onChange={() => errors.clear('email')}
          />
        </Field>
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Send reset link
        </Button>
        <Button variant="ghost" asChild className="justify-self-center">
          <Link href="/admin/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </form>
    </>
  );
}
