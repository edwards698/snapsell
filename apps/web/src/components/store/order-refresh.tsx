'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-renders the order page every few seconds while it waits for a payment (BUILD_PLAN §2.4). */
export function OrderAutoRefresh({
  active,
  intervalMs = 5000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
