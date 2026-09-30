import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/cover',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/cover',
  use: { baseURL: 'http://127.0.0.1:5175', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode remote --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175/cover.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
