'use client';

import type { SystemStatus } from '@snapsell/shared';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, cn, Skeleton } from '@snapsell/ui';
import { Archive, Database, HardDrive, ImageIcon, Layers, Mail, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { useSystemStatus } from '@/components/admin/session';

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function duration(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular">{value}</span>
    </div>
  );
}

function Tile({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon: typeof Database;
  title: string;
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <CardTitle className="flex-1">{title}</CardTitle>
        {status}
      </CardHeader>
      <CardContent className="divide-y divide-border pt-3">{children}</CardContent>
    </Card>
  );
}

function DiskBar({ pct }: { pct: number }) {
  const tone = pct >= 90 ? 'bg-danger' : pct >= 85 ? 'bg-warning' : 'bg-primary';
  return (
    <div className="py-3">
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Disk used"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Content({ s }: { s: SystemStatus }) {
  const failed = s.jobs.counts.FAILED;
  const diskHigh = s.disk.usedPercent >= 85;
  const diskCritical = s.disk.usedPercent >= 90;
  return (
    <div className="grid gap-4 sm:gap-6">
      {diskHigh && (
        <Alert
          tone={diskCritical ? 'danger' : 'warning'}
          title={`Disk is ${s.disk.usedPercent}% full`}
        >
          Free up space soon. Uploads and backups need room to be written.
        </Alert>
      )}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        <Tile
          icon={Database}
          title="Database"
          status={
            <Badge tone="success" dot>
              Healthy
            </Badge>
          }
        >
          <Stat label="Size" value={bytes(s.database.sizeBytes)} />
          <Stat label="Journal mode" value={s.database.journalMode.toUpperCase()} />
          <Stat label="Engine" value="SQLite" />
        </Tile>
        <Tile
          icon={HardDrive}
          title="Disk"
          status={
            <Badge tone={diskCritical ? 'danger' : diskHigh ? 'warning' : 'success'} dot>
              {s.disk.usedPercent}% used
            </Badge>
          }
        >
          <DiskBar pct={s.disk.usedPercent} />
          <Stat label="Free" value={bytes(s.disk.freeBytes)} />
          <Stat label="Total" value={bytes(s.disk.totalBytes)} />
        </Tile>
        <Tile
          icon={Layers}
          title="Background jobs"
          status={
            failed ? (
              <Badge tone="danger" dot>
                {failed} failed
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Running
              </Badge>
            )
          }
        >
          <Stat label="Queued" value={s.jobs.counts.QUEUED} />
          <Stat label="Running" value={s.jobs.counts.RUNNING} />
          <Stat label="Completed (7 days)" value={s.jobs.counts.DONE} />
          <Stat
            label="Oldest waiting"
            value={s.jobs.oldestQueuedSeconds === null ? '—' : `${s.jobs.oldestQueuedSeconds}s`}
          />
        </Tile>
        <Tile
          icon={ImageIcon}
          title="Uploads"
          status={<Badge tone="outline">On this server</Badge>}
        >
          <Stat label="Product images" value={bytes(s.uploads.publicBytes)} />
          <Stat label="Private media" value={bytes(s.uploads.privateBytes)} />
        </Tile>
        <Tile
          icon={Mail}
          title="Email"
          status={
            s.email.provider === 'resend' ? (
              <Badge tone="success" dot>
                Resend
              </Badge>
            ) : (
              <Badge tone="warning" dot>
                Local log
              </Badge>
            )
          }
        >
          <Stat label="From" value={<span className="truncate">{s.email.from}</span>} />
          <Stat
            label="Delivery"
            value={s.email.provider === 'resend' ? 'Sent via Resend' : 'Saved to data/logs/emails'}
          />
        </Tile>
        <Tile icon={Archive} title="Backups" status={<Badge tone="outline">Phase 8</Badge>}>
          <Stat
            label="Last backup"
            value={s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString() : 'Not set up yet'}
          />
          <Stat label="Schedule" value="Every 6 hours (planned)" />
        </Tile>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className="size-3.5" /> Version {s.version} · {s.environment} · up{' '}
        {duration(s.uptimeSeconds)} · refreshes every 30 seconds
      </p>
    </div>
  );
}

export function SystemPage() {
  const { data, isPending, isError } = useSystemStatus();
  return (
    <>
      <PageHeader
        title="System"
        description="Health of this server: database, disk, background jobs, email and backups."
      />
      {isError ? (
        <Alert tone="danger" title="Couldn’t load system status">
          The API may be restarting. This page will retry shortly.
        </Alert>
      ) : isPending ? (
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : (
        <Content s={data} />
      )}
    </>
  );
}
