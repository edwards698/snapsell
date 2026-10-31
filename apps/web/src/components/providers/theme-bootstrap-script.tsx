'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { useRef } from 'react';

/** Injects the anti-FOUC theme IIFE during SSR without rendering a client <script>. */
export function ThemeBootstrapScript({ script }: { script: string }) {
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return (
      <script
        id="snapsell-theme-init"
        dangerouslySetInnerHTML={{ __html: script }}
      />
    );
  });

  return null;
}
