import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'sqlite',
  schema: ['./worker/auth-schema.ts', './worker/schema.ts'],
  out: './migrations',
});
