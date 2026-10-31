'use client';

import type { RealtimeEvents } from '@snapsell/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { messagePreview, upsertMessage } from './inbox';

type Listener<K extends keyof RealtimeEvents> = (payload: RealtimeEvents[K]) => void;

interface Realtime {
  connected: boolean;
  on<K extends keyof RealtimeEvents>(event: K, listener: Listener<K>): () => void;
}

const RealtimeContext = createContext<Realtime>({ connected: false, on: () => () => {} });

/**
 * One owner-authenticated Socket.IO connection for the admin. Events update or invalidate
 * TanStack Query caches; polling on the queries stays as the fallback.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io({ path: '/socket.io', addTrailingSlash: false, withCredentials: true });
    setSocket(s);
    s.on('connect', () => {
      setConnected(true);
      // Anything may have changed while we were offline.
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['conversation'] });
      void qc.invalidateQueries({ queryKey: ['whatsapp'] });
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      setConnected(false);
      // Session gone: let the next query's 401 redirect to login instead of retrying forever.
      if (err.message === 'UNAUTHORIZED') {
        s.disconnect();
        void qc.invalidateQueries({ queryKey: ['system'] });
      }
    });

    s.on('message.new', (p: RealtimeEvents['message.new']) => {
      upsertMessage(qc, p.message);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      if (p.message.direction === 'IN') notify(p);
    });
    s.on('message.updated', (p: RealtimeEvents['message.updated']) => upsertMessage(qc, p.message));
    s.on('conversation.updated', (p: RealtimeEvents['conversation.updated']) => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['conversation', p.conversationId] });
    });
    s.on('whatsapp.status', (p: RealtimeEvents['whatsapp.status']) => {
      qc.setQueryData(['whatsapp'], p);
      void qc.invalidateQueries({ queryKey: ['system'] });
    });
    s.on('stock.changed', () => {
      void qc.invalidateQueries({ queryKey: ['stock'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['product'] });
    });
    s.on('catalog.changed', () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['product'] });
    });

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [qc]);

  const value: Realtime = {
    connected,
    on(event, listener) {
      if (!socket) return () => {};
      socket.on(event, listener as never);
      return () => void socket.off(event, listener as never);
    },
  };
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

function notify(p: RealtimeEvents['message.new']) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  const n = new Notification(p.customerName, {
    body: messagePreview(p.message),
    tag: p.conversationId,
  });
  n.onclick = () => {
    window.focus();
    window.location.assign(`/admin/inbox?c=${p.conversationId}`);
  };
}
