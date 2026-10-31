import 'server-only';
import type {
  PublicOrder,
  StoreCategory,
  StoreInfo,
  StoreListQuery,
  StoreProduct,
  StoreProductList,
} from '@snapsell/shared';
import { serverApi } from './server-api';

export async function getStoreInfo(): Promise<StoreInfo> {
  return (
    (await serverApi<StoreInfo>('/store/info', { revalidate: 60 }).catch(() => null)) ?? {
      name: 'SnapSell',
      currency: 'ZMW',
      deliveryEnabled: true,
      collectionEnabled: true,
    }
  );
}

export function getCategories() {
  return serverApi<StoreCategory[]>('/store/categories', { revalidate: 60 }).then((c) => c ?? []);
}

export function getProducts(q: StoreListQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
  return serverApi<StoreProductList>(`/store/products?${params}`, { revalidate: 30 });
}

/** Null when the product doesn't exist or isn't for sale. */
export async function getProduct(slug: string) {
  return serverApi<StoreProduct>(`/store/products/${encodeURIComponent(slug)}`, {
    revalidate: 30,
  }).catch(() => null);
}

export async function getOrder(ref: string, token: string) {
  return serverApi<PublicOrder>(
    `/store/orders/${encodeURIComponent(ref)}?t=${encodeURIComponent(token)}`,
  ).catch(() => null);
}
