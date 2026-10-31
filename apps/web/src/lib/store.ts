import 'server-only';
import type { StoreInfo } from '@snapsell/shared';
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
