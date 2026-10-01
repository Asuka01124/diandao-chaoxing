import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { emptyVault, type VaultData } from '@sign/shared';
import { clearVault, readVault, writeVault } from './core/vault';
import { clearAllReservedPhotos, clearAllStagedPhotos } from './core/media';
import { cleanupCompletedPhoto, type VaultAccess } from './core/jobs';

type State = VaultAccess & { data: VaultData | null; ready: boolean; error: string | null; reload: () => Promise<void>; clear: () => Promise<void> };
const context = createContext<State | null>(null);
export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<VaultData | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<VaultData | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const reload = useCallback(async () => {
    try {
      const loaded = await readVault(); current.current = loaded; setData(loaded); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : '本地资料读取失败'); }
    finally { setReady(true); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const update = useCallback((change: (value: VaultData) => void): Promise<void> => {
    const next = chain.current.then(async () => {
      if (!current.current) throw new Error('本地资料尚未读取');
      const copy = JSON.parse(JSON.stringify(current.current)) as VaultData;
      change(copy);
      await writeVault(copy);
      current.current = copy; setData(copy);
    });
    chain.current = next.catch(() => {});
    return next;
  }, []);
  useEffect(() => {
    if (!data) return;
    const clean = () => {
      const access: VaultAccess = { get: () => { if (!current.current) throw new Error('本地资料尚未读取'); return current.current; }, update };
      for (const job of current.current?.jobs ?? []) if (job.state === 'DONE' && job.photoUri) void cleanupCompletedPhoto(access, job.id).catch(() => {});
    };
    clean();
    const timer = setInterval(clean, 15 * 60_000);
    return () => clearInterval(timer);
  }, [data !== null, data?.settings.imageRetentionHours, update]);
  const clear = useCallback(async () => { await chain.current; await clearVault(); try { clearAllStagedPhotos(); } catch {} try { clearAllReservedPhotos(); } catch {} const next = emptyVault(); current.current = next; setData(next); }, []);
  return <context.Provider value={{ data, ready, error, reload, clear, get: () => { if (!current.current) throw new Error('本地资料尚未读取'); return current.current; }, update }}>{children}</context.Provider>;
}
export function useVault(): State { const value = useContext(context); if (!value) throw new Error('缺少 VaultProvider'); return value; }
