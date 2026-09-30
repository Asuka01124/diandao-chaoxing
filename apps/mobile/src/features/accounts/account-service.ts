import { randomUUID } from 'expo-crypto';
import { api, ClientError } from '../../core/api';
import { clearStagedPhoto } from '../../core/media';
import type { VaultAccess } from '../../core/jobs';

export async function saveLogin(store: VaultAccess, identifier: string, password: string, options: { label?: string; reauthId?: string; role?: 'primary' | 'delegate' } = {}): Promise<void> {
  const normalized = identifier.trim();
  if (!normalized || !password) throw new Error('请输入学习通账号和密码');
  const session = await api.login(normalized, password, randomUUID());
  await store.update(v => {
    if (options.reauthId) {
      const item = v.accounts.find(a => a.id === options.reauthId);
      if (!item || item.session.identifier !== session.identifier || item.session.userId !== session.userId) throw new Error('重新登录的账号身份不匹配');
      item.session = session; item.state = 'VALID'; item.verifiedAt = new Date().toISOString();
    } else {
      const existing = v.accounts.find(a => a.session.identifier === session.identifier);
      const role = options.role ?? 'delegate';
      if (existing && role !== 'primary') throw new Error('该账号已添加');
      if (existing && existing.session.userId !== session.userId) throw new Error('账号身份与已有资料不匹配');
      if (role === 'primary') for (const item of v.accounts) item.role = 'delegate';
      if (existing) {
        existing.role = 'primary'; existing.session = session; existing.state = 'VALID'; existing.verifiedAt = new Date().toISOString();
      } else {
        v.accounts.push({ id: randomUUID(), label: options.label?.trim() || session.name, role, session, authorizedAt: new Date().toISOString(), verifiedAt: new Date().toISOString(), state: 'VALID' });
      }
    }
  });
}

export async function verifyAccount(store: VaultAccess, id: string): Promise<void> {
  const account = store.get().accounts.find(a => a.id === id); if (!account) return;
  try {
    const session = await api.check(account.session);
    await store.update(v => { const item = v.accounts.find(a => a.id === id); if (item) { item.session = session; item.verifiedAt = new Date().toISOString(); item.state = 'VALID'; } });
  } catch (error) {
    if (error instanceof ClientError && error.code === 'REAUTH_REQUIRED') await store.update(v => { const item = v.accounts.find(a => a.id === id); if (item) item.state = 'REAUTH_REQUIRED'; });
    throw error;
  }
}

export async function removeAccount(store: VaultAccess, id: string): Promise<void> {
  const orphanUris = store.get().jobs.filter(j => j.accountIds.length === 1 && j.accountIds[0] === id && j.photoUri).map(j => j.photoUri!);
  await store.update(v => {
    v.accounts = v.accounts.filter(a => a.id !== id);
    v.activityCache = v.activityCache.filter(a => a.cacheAccountId !== id);
    v.attempts = v.attempts.filter(a => a.accountId !== id);
    v.jobs = v.jobs.map(j => ({
      ...j,
      accountIds: j.accountIds.filter(a => a !== id),
      faceMediaIdByAccount: j.faceMediaIdByAccount ? Object.fromEntries(Object.entries(j.faceMediaIdByAccount).filter(([a]) => a !== id)) : undefined,
      input: j.input.kind === 'photo' ? { ...j.input, mediaIdByAccount: Object.fromEntries(Object.entries(j.input.mediaIdByAccount).filter(([a]) => a !== id)) } : j.input,
    })).filter(j => j.accountIds.length > 0);
  });
  for (const uri of orphanUris) clearStagedPhoto(uri);
}
