import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

// `pnpm demo` serves the dev app through ngrok. Next.js otherwise blocks those hosts.
const tunnelDevOrigins = ['*.ngrok-free.app', '*.ngrok-free.dev', '*.ngrok.app', '*.ngrok.io', '*.ngrok.dev'];

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: tunnelDevOrigins,
  transpilePackages: ['@snapsell/ui'],
  // In production Caddy routes /api and /media to the API; these rewrites do the same in development.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/media/:path*', destination: `${apiUrl}/media/:path*` },
      // Admin realtime (Socket.IO). Long-polling works through this rewrite; Caddy also
      // proxies the websocket upgrade in production.
      { source: '/socket.io', destination: `${apiUrl}/socket.io` },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
