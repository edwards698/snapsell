import type { MetadataRoute } from 'next';

// Lets the owner install the admin on their phone's home screen (BUILD_PLAN §2.5).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SnapSell Admin',
    short_name: 'SnapSell',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#059669',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
