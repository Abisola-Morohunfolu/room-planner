import { useEffect, useMemo, type ReactNode } from 'react';
import { useAccount } from '../auth/AccountContext';
import { SyncContext } from './SyncContext';
import { SyncEngine } from './engine';

// Deferred to Phase 2; the browser-only entry point does not import this provider.
export function SyncProvider({ children }: { children: ReactNode }) {
  const { partition } = useAccount(),
    engine = useMemo(() => (partition === 'guest' ? null : new SyncEngine(partition)), [partition]);
  useEffect(() => {
    if (!engine) return;
    engine.activate();
    const resume = () => void engine.resume();
    window.addEventListener('online', resume);
    resume();
    return () => {
      window.removeEventListener('online', resume);
      engine.dispose();
    };
  }, [engine]);
  return <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>;
}
