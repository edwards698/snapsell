'use client';

import type { SetupStep } from '@snapsell/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Money,
  ProgressRing,
  Skeleton,
} from '@snapsell/ui';
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  ChartColumn,
  CircleCheck,
  Circle,
  CreditCard,
  Mail,
  MessageCircle,
  PartyPopper,
  Receipt,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/admin/page-header';
import { ProductImage } from '@/components/catalog/product-image';
import { StockBadge } from '@/components/catalog/stock-badge';
import { useStockSummary } from '@/lib/catalog';
import { useOverview, useSessionUser } from '@/components/admin/session';

function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const STEP_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  products: Camera,
  payments: CreditCard,
  whatsapp: MessageCircle,
};

function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 border-b border-border bg-gradient-to-r from-primary-soft/70 to-transparent p-5 sm:p-6">
        <ProgressRing
          value={done}
          max={steps.length}
          size={52}
          label={`${done} of ${steps.length} setup steps done`}
        />
        <div>
          <CardTitle>Get your shop ready</CardTitle>
          <CardDescription>
            A few steps and you can start selling on your website and WhatsApp.
          </CardDescription>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {steps.map((step) => {
          const Icon = STEP_ICONS[step.id] ?? Circle;
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/60 sm:px-6"
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl',
                    step.done
                      ? 'bg-success-soft text-success-soft-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {step.done ? <CircleCheck className="size-5" /> : <Icon className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      step.done && 'text-muted-foreground line-through',
                    )}
                  >
                    {step.title}
                  </span>
                  <span className="block text-sm text-muted-foreground">{step.description}</span>
                </span>
                {!step.done && (
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: typeof Receipt;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

/** Faint placeholder bars so the empty chart still reads as a chart. */
function ChartPlaceholder() {
  const heights = [32, 48, 40, 64, 52, 76, 60, 88, 70, 58, 80, 66];
  return (
    <div className="relative">
      <div className="flex h-44 items-end gap-2 px-1 opacity-60" aria-hidden>
        {heights.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md bg-gradient-to-t from-muted to-subtle"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center rounded-2xl bg-surface/85 px-6 py-4 text-center backdrop-blur-sm">
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface shadow-sm">
            <ChartColumn className="size-5 text-muted-foreground" />
          </span>
          <p className="mt-3 text-sm font-medium">Sales will appear here</p>
          <p className="text-xs text-muted-foreground">Only verified payments count as sales.</p>
        </div>
      </div>
    </div>
  );
}

/** Low-stock widget (BUILD_PLAN Phase 2). */
function LowStockCard() {
  const { data, isPending } = useStockSummary();
  if (isPending) return <Skeleton className="h-48 rounded-2xl" />;
  if (!data || data.variants === 0) return null;
  const count = data.low + data.out;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Stock</CardTitle>
          <CardDescription>
            {count
              ? `${count} ${count === 1 ? 'item needs' : 'items need'} restocking`
              : `${data.unitsAvailable} units available`}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={count ? '/admin/stock?stock=low' : '/admin/stock'}>
            View <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardHeader>
      {count === 0 ? (
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <CircleCheck className="size-5 text-success" /> Everything is well stocked.
        </CardContent>
      ) : (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {data.attention.slice(0, 4).map((r) => (
            <li key={r.variantId}>
              <Link
                href={`/admin/stock?q=${encodeURIComponent(r.productName)}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60 sm:px-6"
              >
                <ProductImage
                  image={r.image}
                  sizes="40px"
                  className="size-10 shrink-0 rounded-lg"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {r.productName}
                  {r.label !== 'Default' && (
                    <span className="text-muted-foreground"> · {r.label}</span>
                  )}
                </span>
                <StockBadge state={r.state} available={r.available} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Dashboard() {
  const user = useSessionUser();
  const { data, isPending } = useOverview();
  const firstName = user.name.split(' ')[0];
  const currency = data?.currency ?? 'ZMW';
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          <>
            {today}
            {data && (
              <>
                {' '}
                · <span className="text-foreground">{data.shopName}</span>
              </>
            )}
          </>
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/" target="_blank">
              <ShoppingBag /> Storefront <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:gap-6">
        {isPending ? (
          <Skeleton className="h-80 rounded-2xl" />
        ) : (
          data && <SetupChecklist steps={data.setup} />
        )}

        <section
          aria-label="Key numbers"
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          <Kpi
            label="Paid sales"
            value={<Money minor={0} currency={currency} />}
            hint="Last 30 days"
            icon={TrendingUp}
          />
          <Kpi
            label="Orders"
            value={isPending ? '—' : (data?.counts.orders ?? 0)}
            hint="Website and WhatsApp"
            icon={Receipt}
          />
          <Kpi
            label="Avg. order"
            value="—"
            hint="Appears after your first sale"
            icon={ShoppingBag}
          />
          <Kpi label="Chats to orders" value="—" hint="WhatsApp conversion" icon={MessageCircle} />
        </section>

        <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Sales</CardTitle>
                <CardDescription>Website vs WhatsApp, last 30 days</CardDescription>
              </div>
              <Badge tone="outline">Phase 8</Badge>
            </CardHeader>
            <CardContent>
              <ChartPlaceholder />
            </CardContent>
          </Card>

          <div className="grid content-start gap-4 sm:gap-6">
            <LowStockCard />
            <Card>
              <CardHeader>
                <CardTitle>Needs attention</CardTitle>
                <CardDescription>AI drafts, escalations and flagged orders</CardDescription>
              </CardHeader>
              <EmptyState
                icon={PartyPopper}
                tone="neutral"
                title="You’re all caught up"
                description="Anything that needs a decision from you will show up here."
                className="py-8 sm:py-10"
              />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
