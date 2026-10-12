import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testDir: './tests/sharing',
  outputDir: './test-results/sharing',
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command:
            'pnpm build && pnpm exec wrangler d1 migrations apply room-planner-local --local --persist-to .wrangler/sharing-tests && pnpm exec wrangler dev --ip 127.0.0.1 --port 8787 --persist-to .wrangler/sharing-tests',
          url: 'http://127.0.0.1:8787/api/health',
          timeout: 120000,
          reuseExistingServer: false,
          env: { WRANGLER_LOG_PATH: '/tmp/room-planner-sharing-wrangler.log' },
        },
        {
          command: 'pnpm dev --strictPort',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: !process.env.CI,
        },
      ],
});
