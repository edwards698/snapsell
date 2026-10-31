import { Logo } from '@snapsell/ui';
import Link from 'next/link';
import { BrandPanel } from '@/components/auth/brand-panel';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="w-fit rounded-lg" aria-label="SnapSell home">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-slide-up">{children}</div>
        </main>
        <p className="text-center text-xs text-muted-foreground lg:text-left">
          Secure owner sign-in · Sessions expire after 12 hours of inactivity
        </p>
      </div>
      <BrandPanel />
    </div>
  );
}
