import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import type { VaultData } from '@sign/shared';
import { clearVault, readVault, writeVault } from './core/vault';
import { clearAllStagedPhotos } from './core/media';
import { setApiBaseUrl } from './core/api';
import { cleanupCompletedPhoto, type VaultAccess } from './core/jobs';

type State = VaultAccess & { data: VaultData | null; error: string | null; unlock: () => Promise<boolean>; lock: () => void; clear: () => Promise<void> };
const context = createContext<State | null>(null);
export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<VaultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<VaultData | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const unlock = useCallback(async () => {
    try {
      const auth = await LocalAuthentication.authenticateAsync({ promptMessage: '解锁签到工具', disableDeviceFallback: false });
      if (!auth.success) { setError('请先设置设备锁屏验证，再解锁工具'); return false; }
      const loaded = await readVault(); setApiBaseUrl(loaded.settings.apiUrl); current.current = loaded; setData(loaded); setError(null); return true;
    } catch (e) { setError(e instanceof Error ? e.message : '本地资料读取失败'); return false; }
  }, []);
  const update = useCallback((change: (value: VaultData) => void): Promise<void> => {
    const next = chain.current.then(async () => {
      if (!current.current) throw new Error('工具尚未解锁');
      const copy = JSON.parse(JSON.stringify(current.current)) as VaultData;
      change(copy);
      await writeVault(copy);
      setApiBaseUrl(copy.settings.apiUrl);
      current.current = copy; setData(copy);
    });
    chain.current = next.catch(() => {});
    return next;
  }, []);
  useEffect(() => {
    if (!data) return;
    const clean = () => {
      const access: VaultAccess = { get: () => { if (!current.current) throw new Error('工具尚未解锁'); return current.current; }, update };
      for (const job of current.current?.jobs ?? []) if (job.state === 'DONE' && job.photoUri) void cleanupCompletedPhoto(access, job.id).catch(() => {});
    };
    clean();
    const timer = setInterval(clean, 15 * 60_000);
    return () => clearInterval(timer);
  }, [data !== null, data?.settings.imageRetentionHours, update]);
  const clear = useCallback(async () => { await chain.current; await clearVault(); try { clearAllStagedPhotos(); } catch {} setApiBaseUrl(); current.current = null; setData(null); }, []);
  return <context.Provider value={{ data, error, unlock, lock: () => { current.current = null; setData(null); }, clear, get: () => { if (!current.current) throw new Error('工具尚未解锁'); return current.current; }, update }}>{children}</context.Provider>;
}
export function useVault(): State { const value = useContext(context); if (!value) throw new Error('缺少 VaultProvider'); return value; }
