import { createContext, useContext } from 'react';
import type { SyncEngine } from './engine';
export const SyncContext = createContext<SyncEngine | null>(null);
export const useSync = () => useContext(SyncContext);
