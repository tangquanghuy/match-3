import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@session': fileURLToPath(new URL('./src/session', import.meta.url)),
      '@assets': fileURLToPath(new URL('./game-assets/bundled', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    // 排除 Playwright 端到端用例（由 playwright 单独运行，非 vitest）
    exclude: ['tests/e2e/**', 'tests/cover/**', 'node_modules/**'],
  },
});
