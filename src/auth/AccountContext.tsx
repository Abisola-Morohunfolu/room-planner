import { createContext, useContext, type ReactNode } from 'react';
import { authClient } from './client';
const AccountContext = createContext<{ partition: string; email: string | null; pending: boolean }>(
  { partition: 'guest', email: null, pending: true },
);
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
export const useAccount = () => useContext(AccountContext);
