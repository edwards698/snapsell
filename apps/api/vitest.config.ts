import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC (unlike esbuild) emits decorator metadata, which Nest needs for dependency injection.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
