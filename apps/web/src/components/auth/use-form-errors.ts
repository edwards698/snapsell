'use client';

import { useState } from 'react';
import type { z } from 'zod';
import { ApiRequestError } from '@/lib/api';

/** Field + form-level error state, fed by client-side zod validation and API responses. */
export function useFormErrors() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [form, setForm] = useState<{ message: string; code: string } | null>(null);

  function validate<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> | null {
    const result = schema.safeParse(data);
    if (result.success) {
      setFields({});
      return result.data;
    }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) next[issue.path.join('.')] ??= issue.message;
    setFields(next);
    setForm(null);
    return null;
  }

  function fromError(err: unknown) {
    if (err instanceof ApiRequestError) {
      setFields(err.fields);
      setForm(Object.keys(err.fields).length ? null : { message: err.message, code: err.code });
    } else {
      setForm({ message: 'Something went wrong. Please try again.', code: 'UNKNOWN' });
    }
  }

  function clear(name?: string) {
    if (name) setFields(({ [name]: _removed, ...rest }) => rest);
    else setFields({});
    setForm(null);
  }

  return { fields, form, validate, fromError, clear };
}
