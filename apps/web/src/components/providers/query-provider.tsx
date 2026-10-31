'use client';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiRequestError } from '@/lib/api';

function redirectToLogin() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/admin/login?next=${next}`);
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (err) => {
            if (err instanceof ApiRequestError && err.status === 401) redirectToLogin();
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (count, err) =>
              !(err instanceof ApiRequestError && err.status < 500) && count < 2,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
