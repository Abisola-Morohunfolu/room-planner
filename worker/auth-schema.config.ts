import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import { authOptions } from './auth-options';
// Schema generation only; the CLI reads metadata and never accesses this driver.
export const auth = betterAuth({
  ...authOptions(
    'http://127.0.0.1:5173',
    'schema-generation-only-not-a-runtime-secret',
    async () => {
      throw new Error('Schema generation cannot send email.');
    },
  ),
  database: drizzleAdapter(drizzle({} as D1Database), { provider: 'sqlite', transaction: false }),
});
