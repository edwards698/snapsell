'use client';

import { changePasswordSchema } from '@snapsell/shared';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  PasswordInput,
  SegmentedControl,
  toast,
} from '@snapsell/ui';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { signOut, useSessionUser } from '@/components/admin/session';
import { PasswordStrength } from '@/components/auth/password-strength';
import { useFormErrors } from '@/components/auth/use-form-errors';
import { api } from '@/lib/api';

function AccountCard() {
  const user = useSessionUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>The owner account for this shop.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <Avatar name={user.name} className="size-12 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => void signOut()}>
          <LogOut /> Sign out
        </Button>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const errors = useFormErrors();
  const form = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [next, setNext] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = errors.validate(
      changePasswordSchema,
      Object.fromEntries(new FormData(e.currentTarget)),
    );
    if (!input) return;
    setPending(true);
    try {
      await api('/admin/auth/change-password', { json: input });
      form.current?.reset();
      setNext('');
      toast.success('Password updated', { description: 'Other devices have been signed out.' });
    } catch (err) {
      errors.fromError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form ref={form} onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing it signs you out on every other device.</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-md gap-5">
          {errors.form && <p className="text-sm text-danger">{errors.form.message}</p>}
          <Field label="Current password" error={errors.fields.currentPassword}>
            <PasswordInput
              name="currentPassword"
              autoComplete="current-password"
              onChange={() => errors.clear('currentPassword')}
            />
          </Field>
          <Field label="New password" error={errors.fields.newPassword}>
            <PasswordInput
              name="newPassword"
              autoComplete="new-password"
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                errors.clear('newPassword');
              }}
            />
          </Field>
          <PasswordStrength value={next} />
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={pending}>
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Dark mode follows your device unless you choose otherwise.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SegmentedControl
          aria-label="Theme"
          value={mounted ? ((theme as 'system' | 'light' | 'dark') ?? 'system') : 'system'}
          onValueChange={setTheme}
          className="w-full sm:w-auto"
          options={[
            { value: 'system', label: 'System', icon: <Monitor /> },
            { value: 'light', label: 'Light', icon: <Sun /> },
            { value: 'dark', label: 'Dark', icon: <Moon /> },
          ]}
        />
      </CardContent>
    </Card>
  );
}

export function Settings() {
  return (
    <>
      <PageHeader title="Settings" description="Your account, password and how the admin looks." />
      <div className="grid gap-4 sm:gap-6">
        <AccountCard />
        <PasswordCard />
        <AppearanceCard />
      </div>
    </>
  );
}
