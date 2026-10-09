import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
          BETTER_AUTH_SECRET: 'test-only-authentication-secret-at-least-32-characters',
          RESEND_API_KEY: '',
        },
      },
    }),
  ],
  test: { include: ['tests/worker/**/*.test.ts'] },
});
