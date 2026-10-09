import { createContext, useContext } from 'react';
// Phase 1 uses the existing device partition without starting an auth session request.
export const AccountContext = createContext<{
  partition: string;
  email: string | null;
  pending: boolean;
}>({ partition: 'guest', email: null, pending: false });
export const useAccount = () => useContext(AccountContext);
