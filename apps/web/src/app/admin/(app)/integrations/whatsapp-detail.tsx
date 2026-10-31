'use client';

import type { WhatsAppStatus } from '@snapsell/shared';
import { Button, ConfirmDialog, Spinner, toast } from '@snapsell/ui';
import { RefreshCw, Smartphone, TriangleAlert, Unlink } from 'lucide-react';
import { useState } from 'react';
import { ApiRequestError } from '@/lib/api';
import { useWhatsAppActions } from '@/lib/inbox';

function errorToast(err: unknown) {
  toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
}

/** Risk gate, live QR and connection controls for the WhatsApp card. */
export function WhatsAppDetail({ status }: { status: WhatsAppStatus }) {
  const { acknowledge, command } = useWhatsAppActions();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const run = (c: 'connect' | 'reconnect' | 'disconnect') =>
    command.mutate(c, {
      onError: errorToast,
      onSuccess: () => {
        setConfirmDisconnect(false);
        if (c === 'disconnect') toast.success('WhatsApp unlinked');
      },
    });

  if (!status.riskAcknowledgedAt) {
    return (
      <div className="grid gap-3">
        <p className="flex gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            This uses an unofficial WhatsApp Web connection. WhatsApp may restrict or ban numbers
            that use it, especially for bulk or unsolicited messages. Use a dedicated business
            number and only reply to customers who message you first.
          </span>
        </p>
        <div>
          <Button
            size="sm"
            loading={acknowledge.isPending}
            onClick={() => acknowledge.mutate(undefined, { onError: errorToast })}
          >
            I understand the risk
          </Button>
        </div>
      </div>
    );
  }

  const offline = !status.serviceReachable;
  const linked = status.status === 'CONNECTED' || status.status === 'DISCONNECTED';
  const state = status.state;

  return (
    <div className="grid gap-3">
      {offline ? (
        <p className="flex gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            The WhatsApp service isn’t running, so messages can’t be sent or received. Start it with{' '}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-foreground">
              pnpm dev
            </code>{' '}
            (or{' '}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-foreground">
              pnpm --filter @snapsell/whatsapp start
            </code>{' '}
            in production). Customer messages wait on the service and arrive once it’s back.
          </span>
        </p>
      ) : state === 'QR' && status.qr ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <img
            src={status.qr}
            alt="WhatsApp link QR code"
            className="size-52 shrink-0 rounded-xl bg-white p-2"
          />
          <ol className="grid list-decimal gap-1.5 pl-5 text-foreground">
            <li>Open WhatsApp on the shop’s phone.</li>
            <li>
              Go to <span className="font-medium">Settings → Linked devices</span>.
            </li>
            <li>
              Tap <span className="font-medium">Link a device</span> and scan this code.
            </li>
            <li className="text-muted-foreground">The code refreshes by itself every few seconds.</li>
          </ol>
        </div>
      ) : state === 'STARTING' || state === 'AUTHENTICATED' || (state === 'QR' && !status.qr) ? (
        <p className="flex items-center gap-2">
          <Spinner />
          {state === 'AUTHENTICATED'
            ? 'Linked. Loading your chats…'
            : 'Starting WhatsApp Web. This can take up to a minute…'}
        </p>
      ) : status.status === 'CONNECTED' ? (
        <p className="flex items-center gap-2">
          <Smartphone className="size-4 shrink-0 text-success" />
          <span>
            Linked to{' '}
            <span className="font-medium text-foreground">{status.number ?? 'your number'}</span>.
            Customer messages appear in the inbox as they arrive.
          </span>
        </p>
      ) : (
        <p>
          {linked
            ? 'WhatsApp is disconnected. Reconnect to resume messages.'
            : 'Link the shop’s WhatsApp number to receive and reply to customer messages here.'}
        </p>
      )}

      {status.lastError && !offline && status.status !== 'CONNECTED' && (
        <p className="text-danger">Last error: {status.lastError}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!linked && state !== 'QR' && state !== 'STARTING' && state !== 'AUTHENTICATED' && (
          <Button
            size="sm"
            disabled={offline}
            loading={command.isPending && command.variables === 'connect'}
            onClick={() => run('connect')}
          >
            <Smartphone /> Link WhatsApp
          </Button>
        )}
        {(linked || state === 'QR' || state === 'STARTING') && (
          <Button
            size="sm"
            variant="outline"
            disabled={offline}
            loading={command.isPending && command.variables === 'reconnect'}
            onClick={() => run('reconnect')}
          >
            <RefreshCw /> Reconnect
          </Button>
        )}
        {(linked || state === 'QR' || state === 'AUTHENTICATED') && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            disabled={offline}
            onClick={() => setConfirmDisconnect(true)}
          >
            <Unlink /> Unlink
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Unlink WhatsApp?"
        description="SnapSell stops receiving and sending messages until you scan a new QR code. Chats already in the inbox are kept."
        confirmLabel="Unlink"
        loading={command.isPending}
        onConfirm={() => run('disconnect')}
      />
    </div>
  );
}
