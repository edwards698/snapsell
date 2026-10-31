'use client';

import type {
  CancelOrderInput,
  CustomerListItem,
  DashboardStats,
  FulfilmentStatus,
  OrderDetail,
  OrderListItem,
  OrderListQuery,
  Paginated,
  PaymentDto,
  WebhookEventDto,
} from '@snapsell/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

function qs(params: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '' && v !== 'all') s.set(k, String(v));
  return s.size ? `?${s}` : '';
}

export function useOrders(q: OrderListQuery) {
  return useQuery({
    queryKey: ['orders', q],
    queryFn: () => api<Paginated<OrderListItem>>(`/admin/orders${qs(q)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });
}

export function useOrder(ref: string) {
  return useQuery({
    queryKey: ['order', ref],
    queryFn: () => api<OrderDetail>(`/admin/orders/${ref}`),
    // Waiting for a payment: poll so a webhook shows up without a reload.
    refetchInterval: (q) => (q.state.data?.status === 'PENDING_PAYMENT' ? 5_000 : false),
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['orders', 'stats'],
    queryFn: () => api<DashboardStats>('/admin/orders/stats'),
    refetchInterval: 30_000,
  });
}

export function usePayments(page: number) {
  return useQuery({
    queryKey: ['payments', page],
    queryFn: () => api<Paginated<PaymentDto>>(`/admin/payments${qs({ page })}`),
    placeholderData: keepPreviousData,
  });
}

export function useWebhookEvents(page: number) {
  return useQuery({
    queryKey: ['webhooks', page],
    queryFn: () => api<Paginated<WebhookEventDto>>(`/admin/payments/webhooks${qs({ page })}`),
    placeholderData: keepPreviousData,
  });
}

export function useCustomers(q: { q?: string; page: number }) {
  return useQuery({
    queryKey: ['customers', q],
    queryFn: () => api<Paginated<CustomerListItem>>(`/admin/customers${qs(q)}`),
    placeholderData: keepPreviousData,
  });
}

export function useOrderActions(ref: string) {
  const qc = useQueryClient();
  const done = (order: OrderDetail) => {
    qc.setQueryData(['order', ref], order);
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['stock'] });
    void qc.invalidateQueries({ queryKey: ['payments'] });
  };
  return {
    fulfil: useMutation({
      mutationFn: (status: FulfilmentStatus) =>
        api<OrderDetail>(`/admin/orders/${ref}/fulfilment`, { json: { status } }),
      onSuccess: done,
    }),
    cancel: useMutation({
      mutationFn: (input: CancelOrderInput) =>
        api<OrderDetail>(`/admin/orders/${ref}/cancel`, { json: input }),
      onSuccess: done,
    }),
    resolve: useMutation({
      mutationFn: () => api<OrderDetail>(`/admin/orders/${ref}/resolve`, { method: 'POST' }),
      onSuccess: done,
    }),
    paymentLink: useMutation({
      mutationFn: () => api<OrderDetail>(`/admin/orders/${ref}/payment-link`, { method: 'POST' }),
      onSuccess: done,
    }),
    checkPayment: useMutation({
      mutationFn: () =>
        api<{ result: string; order: OrderDetail }>(`/admin/orders/${ref}/check-payment`, {
          method: 'POST',
        }),
      onSuccess: (r) => done(r.order),
    }),
  };
}
