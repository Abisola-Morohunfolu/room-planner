import type { ReactNode } from 'react';
import { AccountContext } from './AccountContext';
import { authClient } from './client';

// Deferred to Phase 2; the browser-only entry point does not import this provider.
export function AccountProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  return (
    <AccountContext.Provider
      value={{
        partition: data?.user.id ?? 'guest',
        email: data?.user.email ?? null,
        pending: isPending,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}
