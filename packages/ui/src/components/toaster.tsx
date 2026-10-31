'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

export { toast } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      offset={16}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-xl !border !border-border !bg-surface-raised !text-foreground !shadow-lg !font-sans !text-sm',
          description: '!text-muted-foreground',
          actionButton: '!rounded-md !bg-primary !text-primary-foreground !font-medium',
          cancelButton: '!rounded-md !bg-muted !text-foreground',
        },
      }}
      {...props}
    />
  );
}
