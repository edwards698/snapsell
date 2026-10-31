'use client';

import type {
  CategoryDto,
  ImageDto,
  Paginated,
  ProductDetail,
  ProductInput,
  ProductListItem,
  ProductListQuery,
  SnapSuggestion,
  StockAdjustment,
  StockMovementDto,
  StockRow,
  StockSummary,
} from '@snapsell/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';

function qs(params: Record<string, string | number | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '' && v !== 'all') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// --- queries ---------------------------------------------------------------

export const catalogKeys = {
  categories: ['categories'] as const,
  products: (q: ProductListQuery) => ['products', q] as const,
  product: (id: string) => ['product', id] as const,
  stock: (q: object) => ['stock', q] as const,
  stockSummary: ['stock', 'summary'] as const,
  movements: (variantId: string) => ['stock', 'movements', variantId] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: () => api<CategoryDto[]>('/admin/categories'),
  });
}

export function useProducts(q: ProductListQuery) {
  return useQuery({
    queryKey: catalogKeys.products(q),
    queryFn: () =>
      api<Paginated<ProductListItem>>(`/admin/products${qs(q as Record<string, string>)}`),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.product(id ?? ''),
    queryFn: () => api<ProductDetail>(`/admin/products/${id}`),
    enabled: !!id,
  });
}

export function useStock(q: { q?: string; stock?: string; page?: number }) {
  return useQuery({
    queryKey: catalogKeys.stock(q),
    queryFn: () => api<Paginated<StockRow>>(`/admin/inventory${qs(q)}`),
    placeholderData: keepPreviousData,
  });
}

export function useStockSummary() {
  return useQuery({
    queryKey: catalogKeys.stockSummary,
    queryFn: () => api<StockSummary>('/admin/inventory/summary'),
  });
}

export function useMovements(variantId: string | null) {
  return useQuery({
    queryKey: catalogKeys.movements(variantId ?? ''),
    queryFn: () => api<Paginated<StockMovementDto>>(`/admin/inventory/${variantId}/movements`),
    enabled: !!variantId,
  });
}

// --- mutations -------------------------------------------------------------

/** After any catalogue change, refresh every list that might show it. */
function useInvalidateCatalog() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['products'] }),
      qc.invalidateQueries({ queryKey: ['product'] }),
      qc.invalidateQueries({ queryKey: ['stock'] }),
      qc.invalidateQueries({ queryKey: catalogKeys.categories }),
      qc.invalidateQueries({ queryKey: ['overview'] }),
    ]);
}

export function useSaveProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ProductInput }) =>
      id
        ? api<ProductDetail>(`/admin/products/${id}`, { method: 'PUT', json: input })
        : api<ProductDetail>('/admin/products', { json: input }),
    onSuccess: () => invalidate(),
  });
}

export function useProductAction() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: 'archive' | 'restore' | 'delete';
    }): Promise<ProductDetail | null> => {
      if (action === 'delete') {
        await api<void>(`/admin/products/${id}`, { method: 'DELETE' });
        return null;
      }
      return api<ProductDetail>(`/admin/products/${id}/${action}`, { method: 'POST' });
    },
    onSuccess: () => invalidate(),
  });
}

export async function uploadImages(productId: string, files: File[]) {
  const body = new FormData();
  for (const f of files) body.append('files', f);
  return api<ImageDto[]>(`/admin/products/${productId}/images`, { method: 'POST', body });
}

export function useImageActions(productId: string | undefined) {
  const invalidate = useInvalidateCatalog();
  const opts = { onSuccess: () => invalidate() };
  return {
    upload: useMutation({
      mutationFn: (files: File[]) => uploadImages(productId!, files),
      ...opts,
    }),
    remove: useMutation({
      mutationFn: (imageId: string) =>
        api<ImageDto[]>(`/admin/products/${productId}/images/${imageId}`, { method: 'DELETE' }),
      ...opts,
    }),
    reorder: useMutation({
      mutationFn: (ids: string[]) =>
        api<ImageDto[]>(`/admin/products/${productId}/images/order`, {
          method: 'PUT',
          json: { ids },
        }),
      ...opts,
    }),
  };
}

export function useAdjustStock() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: StockAdjustment }) =>
      api<StockRow>(`/admin/inventory/${variantId}/adjust`, { json: input }),
    onSuccess: () => invalidate(),
  });
}

export function useSetThreshold() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({
      variantId,
      lowStockThreshold,
    }: {
      variantId: string;
      lowStockThreshold: number;
    }) =>
      api<StockRow>(`/admin/inventory/${variantId}`, {
        method: 'PATCH',
        json: { lowStockThreshold },
      }),
    onSuccess: () => invalidate(),
  });
}

export function useCategoryActions() {
  const invalidate = useInvalidateCatalog();
  const opts = { onSuccess: () => invalidate() };
  return {
    create: useMutation({
      mutationFn: (name: string) => api<CategoryDto>('/admin/categories', { json: { name } }),
      ...opts,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        api<CategoryDto>(`/admin/categories/${id}`, { method: 'PATCH', json: { name } }),
      ...opts,
    }),
    archive: useMutation({
      mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
        api<CategoryDto>(`/admin/categories/${id}/${archived ? 'archive' : 'restore'}`, {
          method: 'POST',
        }),
      ...opts,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`/admin/categories/${id}`, { method: 'DELETE' }),
      ...opts,
    }),
    reorder: useMutation({
      mutationFn: (ids: string[]) =>
        api<CategoryDto[]>('/admin/categories/order', { method: 'PUT', json: { ids } }),
      ...opts,
    }),
  };
}

export function snap(input: { image?: Blob | null; audio?: Blob | null; note: string }) {
  const body = new FormData();
  if (input.image) body.append('image', input.image, 'snap.jpg');
  if (input.audio) body.append('audio', input.audio, 'voice-note');
  body.append('note', input.note);
  return api<SnapSuggestion>('/admin/products/snap', { method: 'POST', body });
}
