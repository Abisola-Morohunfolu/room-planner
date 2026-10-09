import { emailOTP } from 'better-auth/plugins';
import type { BetterAuthOptions } from 'better-auth';
export function authOptions(
  origin: string,
  secret: string,
  send: (email: string, code: string) => Promise<void>,
) {
  return {
    appName: 'Room Planner',
    baseURL: origin,
    basePath: '/api/auth',
    secret,
    trustedOrigins: [origin],
    session: { expiresIn: 7 * 86400, updateAge: 86400, cookieCache: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/sign-in/email-otp': { window: 60, max: 10 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      useSecureCookies: new URL(origin).protocol === 'https:',
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'sign-in') throw new Error('Only sign-in is supported.');
          await send(email, otp);
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}
