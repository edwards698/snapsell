'use client';

import type {
  ConversationDetail,
  ConversationListItem,
  ConversationListQuery,
  ConversationMode,
  MessageDto,
  Paginated,
  PresetDto,
  WhatsAppStatus,
} from '@snapsell/shared';
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './api';

function qs(params: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '' && v !== 'all') s.set(k, String(v));
  return s.size ? `?${s}` : '';
}

export function useConversations(q: ConversationListQuery) {
  return useQuery({
    queryKey: ['conversations', 'list', q],
    queryFn: () => api<Paginated<ConversationListItem>>(`/admin/conversations${qs(q)}`),
    placeholderData: keepPreviousData,
    // Realtime keeps this fresh; polling is the fallback if the socket drops.
    refetchInterval: 60_000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api<ConversationDetail>(`/admin/conversations/${id}`),
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

export function useUnread() {
  return useQuery({
    queryKey: ['conversations', 'unread'],
    queryFn: () => api<{ conversations: number; messages: number }>('/admin/conversations/unread'),
    refetchInterval: 60_000,
  });
}

export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: () => api<PresetDto[]>('/admin/presets'),
    staleTime: 5 * 60_000,
  });
}

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ['whatsapp'],
    queryFn: () => api<WhatsAppStatus>('/admin/integrations/whatsapp'),
    refetchInterval: (q) => (q.state.data?.serviceReachable === false ? 15_000 : 60_000),
  });
}

/** Adds or replaces a message in a cached conversation, keeping time order. */
export function upsertMessage(qc: QueryClient, message: MessageDto) {
  qc.setQueryData<ConversationDetail>(['conversation', message.conversationId], (prev) => {
    if (!prev) return prev;
    const i = prev.messages.findIndex((m) => m.id === message.id);
    const messages =
      i >= 0
        ? prev.messages.map((m) => (m.id === message.id ? message : m))
        : [...prev.messages, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { ...prev, messages };
  });
}

export function useOlderMessages(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (before: string) =>
      api<{ messages: MessageDto[]; hasMore: boolean }>(
        `/admin/conversations/${id}/messages${qs({ before })}`,
      ),
    onSuccess: (page) =>
      qc.setQueryData<ConversationDetail>(['conversation', id], (prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.messages.map((m) => m.id));
        return {
          ...prev,
          hasMore: page.hasMore,
          messages: [...page.messages.filter((m) => !seen.has(m.id)), ...prev.messages],
        };
      }),
  });
}

export function useConversationActions(id: string) {
  const qc = useQueryClient();
  const refreshDetail = (detail: ConversationDetail) => {
    qc.setQueryData<ConversationDetail>(['conversation', id], (prev) =>
      // Keep older pages the owner already loaded.
      prev && prev.messages.length > detail.messages.length
        ? { ...detail, messages: prev.messages, hasMore: prev.hasMore }
        : detail,
    );
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  };
  return {
    send: useMutation({
      mutationFn: (body: string) =>
        api<MessageDto>(`/admin/conversations/${id}/messages`, { json: { body } }),
      onSuccess: (message) => {
        upsertMessage(qc, message);
        void qc.invalidateQueries({ queryKey: ['conversation', id] });
        void qc.invalidateQueries({ queryKey: ['conversations'] });
      },
    }),
    retry: useMutation({
      mutationFn: (messageId: string) =>
        api<MessageDto>(`/admin/messages/${messageId}/retry`, { method: 'POST' }),
      onSuccess: (message) => upsertMessage(qc, message),
    }),
    takeover: useMutation({
      mutationFn: (until: string | null) =>
        api<ConversationDetail>(`/admin/conversations/${id}/takeover`, { json: { until } }),
      onSuccess: refreshDetail,
    }),
    release: useMutation({
      mutationFn: () =>
        api<ConversationDetail>(`/admin/conversations/${id}/release`, { method: 'POST' }),
      onSuccess: refreshDetail,
    }),
    setMode: useMutation({
      mutationFn: (mode: ConversationMode) =>
        api<ConversationDetail>(`/admin/conversations/${id}/mode`, { json: { mode } }),
      onSuccess: refreshDetail,
    }),
    approveDraft: useMutation({
      mutationFn: (messageId: string) =>
        api<MessageDto>(`/admin/conversations/${id}/drafts/${messageId}/approve`, {
          method: 'POST',
        }),
      onSuccess: (message) => {
        upsertMessage(qc, message);
        void qc.invalidateQueries({ queryKey: ['conversation', id] });
      },
    }),
    editDraft: useMutation({
      mutationFn: (input: { messageId: string; body: string }) =>
        api<MessageDto>(`/admin/conversations/${id}/drafts/${input.messageId}/edit`, {
          json: { body: input.body },
        }),
      onSuccess: (message) => {
        upsertMessage(qc, message);
        void qc.invalidateQueries({ queryKey: ['conversation', id] });
        void qc.invalidateQueries({ queryKey: ['conversations'] });
      },
    }),
    discardDraft: useMutation({
      mutationFn: (messageId: string) =>
        api<MessageDto>(`/admin/conversations/${id}/drafts/${messageId}/discard`, {
          method: 'POST',
        }),
      onSuccess: (message) => upsertMessage(qc, message),
    }),
    markRead: useMutation({
      mutationFn: () => api(`/admin/conversations/${id}/read`, { method: 'POST' }),
      onSuccess: () => {
        qc.setQueryData<ConversationDetail>(['conversation', id], (prev) =>
          prev ? { ...prev, unreadCount: 0 } : prev,
        );
        void qc.invalidateQueries({ queryKey: ['conversations'] });
      },
    }),
  };
}

export function useWhatsAppActions() {
  const qc = useQueryClient();
  const done = (status: WhatsAppStatus) => {
    qc.setQueryData(['whatsapp'], status);
    void qc.invalidateQueries({ queryKey: ['system'] });
  };
  return {
    acknowledge: useMutation({
      mutationFn: () =>
        api<WhatsAppStatus>('/admin/integrations/whatsapp/acknowledge', { method: 'POST' }),
      onSuccess: done,
    }),
    command: useMutation({
      mutationFn: (command: 'connect' | 'reconnect' | 'disconnect') =>
        api<WhatsAppStatus>(`/admin/integrations/whatsapp/${command}`, { method: 'POST' }),
      onSuccess: done,
      onError: () => void qc.invalidateQueries({ queryKey: ['whatsapp'] }),
    }),
  };
}

export const MODE_LABEL: Record<
  ConversationMode,
  { label: string; tone: 'success' | 'warning' | 'ai' | 'neutral' | 'primary' }
> = {
  AI_AUTO: { label: 'AI replies', tone: 'ai' },
  AI_SUGGEST: { label: 'AI drafts', tone: 'ai' },
  HUMAN: { label: 'You’re replying', tone: 'primary' },
  PAUSED: { label: 'Paused', tone: 'neutral' },
};

export function messagePreview(m: { body: string | null; type: string } | null) {
  if (!m) return 'No messages yet';
  if (m.body) return m.body;
  return (
    { IMAGE: 'Photo', AUDIO: 'Voice note', DOCUMENT: 'Document', OTHER: 'Unsupported message' }[
      m.type
    ] ?? 'Message'
  );
}
