import { defineConfig } from '@playwright/test';

// End-to-end and visual-regression tests (BUILD_PLAN §2.6). They run against their own API
// (fresh data directory) and a production build of the web app, on separate ports from `pnpm dev`.
const API_PORT = 4100;
const WEB_PORT = 3100;
const WEB_URL = `http://localhost:${WEB_PORT}`;

export const E2E_OWNER = {
  email: 'owner@example.com',
  password: 'e2e-owner-password',
  name: 'Ama Banda',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' } },
  use: { baseURL: WEB_URL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop-light',
      use: { viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
    },
    { name: 'desktop-dark', use: { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
    {
      name: 'mobile-light',
      use: {
        viewport: { width: 390, height: 844 },
        colorScheme: 'light',
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'rm -rf .e2e-data && node --enable-source-maps ../api/dist/main.js',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATA_DIR: '.e2e-data',
        PUBLIC_WEB_URL: WEB_URL,
        SESSION_SECRET: 'e2e-session-secret-0123456789abcdef',
        FILE_SIGNING_SECRET: 'e2e-file-secret-0123456789abcdefgh',
        OWNER_EMAIL: E2E_OWNER.email,
        OWNER_NAME: E2E_OWNER.name,
        OWNER_INITIAL_PASSWORD: E2E_OWNER.password,
      },
    },
    {
      command: `next build && next start --port ${WEB_PORT}`,
      url: `${WEB_URL}/admin/login`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
