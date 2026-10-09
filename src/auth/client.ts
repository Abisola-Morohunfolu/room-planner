import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';
export const authClient = createAuthClient({ plugins: [emailOTPClient()] });
export function safeReturnPath(path: string | null) {
  return path &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('\\') &&
    !Array.from(path).some((character) => character.charCodeAt(0) <= 32)
    ? path
    : '/projects';
}
