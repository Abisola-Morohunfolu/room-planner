import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './auth-schema';
import { sendSignInCode } from './email';
import { authOptions } from './auth-options';
export function createAuth(
  env: Env,
  sendOverride?: (email: string, code: string) => Promise<void>,
) {
  return betterAuth({
    ...authOptions(
      env.APP_ORIGIN,
      env.BETTER_AUTH_SECRET,
      sendOverride ?? ((email, code) => sendSignInCode(env, email, code)),
    ),
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
  });
}
