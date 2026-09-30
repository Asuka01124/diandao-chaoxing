import { randomUUID } from 'expo-crypto';
import { validateActivityInput, type Account, type Activity, type AttemptState, type Job, type SignInput, type VaultData } from '@sign/shared';
import { api, ClientError } from './api';

export type VaultAccess = { get: () => VaultData; update: (change: (data: VaultData) => void) => Promise<void> };
const terminal: AttemptState[] = ['SUCCESS', 'ALREADY_SIGNED', 'REAUTH_REQUIRED', 'EXPIRED', 'FAILED'];

export async function createJob(store: VaultAccess, activity: Activity, accountIds: string[], input: SignInput, photoUri?: string): Promise<Job> {
  validateActivityInput(activity, input);
  if (input.kind === 'photo' && !photoUri && accountIds.some(id => !input.mediaIdByAccount[id])) throw new Error('缺少签到照片');
  if (!accountIds.length || new Set(accountIds).size !== accountIds.length) throw new Error('请选择至少一个有效账号');
  if (accountIds.some(id => !store.get().accounts.some(account => account.id === id))) throw new Error('账号列表已变化');
  const job: Job = { id: randomUUID(), activity, accountIds, input, photoUri, createdAt: new Date().toISOString(), state: 'RUNNING' };
  await store.update(data => {
    data.jobs.push(job);
    data.attempts.push(...accountIds.map(accountId => ({ jobId: job.id, accountId, state: 'QUEUED' as const, count: 0, updatedAt: job.createdAt })));
  });
  return job;
}
async function setAttempt(store: VaultAccess, jobId: string, accountId: string, state: AttemptState, message?: string, code?: string): Promise<void> {
  await store.update(data => {
    const attempt = data.attempts.find(a => a.jobId === jobId && a.accountId === accountId);
    if (!attempt) return;
    attempt.state = state; attempt.updatedAt = new Date().toISOString(); attempt.message = message; attempt.code = code;
    if (state === 'SUBMITTING') attempt.count += 1;
  });
}
function accountFor(store: VaultAccess, id: string): Account | undefined { return store.get().accounts.find(a => a.id === id); }
async function executeAccount(store: VaultAccess, job: Job, accountId: string): Promise<'continue' | 'wait'> {
  const account = accountFor(store, accountId);
  if (!account) { await setAttempt(store, job.id, accountId, 'FAILED', '账号已删除', 'INVALID_INPUT'); return 'continue'; }
  const previous = store.get().attempts.find(a => a.jobId === job.id && a.accountId === accountId)?.state;
  try {
    await setAttempt(store, job.id, accountId, 'PREFLIGHT');
    const session = await api.check(account.session);
    await store.update(data => { const item = data.accounts.find(a => a.id === accountId); if (item) { item.session = session; item.state = 'VALID'; item.verifiedAt = new Date().toISOString(); } });
    // 恢复中或提交超时后，先查远端，避免重复提交。
    const before = await api.status(session, job.activity);
    if (before.state === 'SIGNED') { await setAttempt(store, job.id, accountId, previous === 'SUBMITTING' || previous === 'VERIFYING' ? 'SUCCESS' : 'ALREADY_SIGNED'); return 'continue'; }
    if (before.state === 'EXPIRED') { await setAttempt(store, job.id, accountId, 'EXPIRED'); return 'continue'; }
    const check = await api.preflight(session, job.activity);
    if (check.state === 'WAITING_CAPTCHA' || (check.state === 'WAITING_FACE' && !job.faceMediaIdByAccount?.[accountId])) {
      await setAttempt(store, job.id, accountId, check.state, check.message);
      return 'continue';
    }
    if (check.state === 'SIGNED') { await setAttempt(store, job.id, accountId, 'ALREADY_SIGNED'); return 'continue'; }
    if (check.state === 'EXPIRED') { await setAttempt(store, job.id, accountId, 'EXPIRED'); return 'continue'; }
    if (!accountFor(store, accountId)) return 'continue';
    let photoMediaId: string | undefined;
    if (job.input.kind === 'photo') {
      const current = store.get().jobs.find(j => j.id === job.id);
      photoMediaId = current?.input.kind === 'photo' ? current.input.mediaIdByAccount[accountId] : undefined;
      if (!photoMediaId) {
        if (!job.photoUri) throw new Error('临时照片缺失');
        const { readStagedPhoto } = await import('./media');
        photoMediaId = (await api.upload(session, await readStagedPhoto(job.photoUri))).mediaId;
        const savedId = photoMediaId;
        await store.update(data => { const item = data.jobs.find(j => j.id === job.id); if (item?.input.kind === 'photo') item.input.mediaIdByAccount[accountId] = savedId; });
      }
    }
    if (!accountFor(store, accountId)) return 'continue';
    await setAttempt(store, job.id, accountId, 'SUBMITTING');
    let result;
    try {
      const input = job.input.kind === 'photo' ? { ...job.input, mediaIdByAccount: { [session.userId]: photoMediaId! } } : job.input;
      result = await api.submit(session, job.activity, input, job.faceMediaIdByAccount?.[accountId]);
    }
    catch (error) {
      if (error instanceof ClientError && error.code === 'NETWORK_TIMEOUT') {
        await setAttempt(store, job.id, accountId, 'VERIFYING', '提交超时，正在核查远端状态');
        const remote = await api.status(session, job.activity);
        if (remote.state === 'SIGNED') { await setAttempt(store, job.id, accountId, 'SUCCESS'); return 'continue'; }
      }
      throw error;
    }
    if (result.state === 'WAITING_CAPTCHA' || result.state === 'WAITING_FACE' || result.state === 'WAITING_QR') {
      await setAttempt(store, job.id, accountId, result.state, result.message);
      return result.state === 'WAITING_QR' ? 'wait' : 'continue';
    }
    if (result.state === 'EXPIRED') { await setAttempt(store, job.id, accountId, 'EXPIRED'); return 'continue'; }
    await setAttempt(store, job.id, accountId, 'VERIFYING');
    const verified = await api.status(session, job.activity);
    if (verified.state === 'SIGNED') await setAttempt(store, job.id, accountId, result.state === 'SIGNED' && !result.submitted ? 'ALREADY_SIGNED' : 'SUCCESS');
    else await setAttempt(store, job.id, accountId, 'FAILED', '无法确认签到成功', 'PROVIDER_CHANGED');
  } catch (error) {
    const client = error instanceof ClientError ? error : undefined;
    const state: AttemptState = client?.code === 'REAUTH_REQUIRED' || client?.code === 'SESSION_EXPIRED' ? 'REAUTH_REQUIRED'
      : client?.code === 'QR_EXPIRED' ? 'WAITING_QR' : client?.code === 'VALIDATION_FAILED' && job.faceMediaIdByAccount?.[accountId] ? 'WAITING_FACE' : client?.code === 'ACTIVITY_NOT_FOUND' ? 'EXPIRED' : 'FAILED';
    if (state === 'REAUTH_REQUIRED') await store.update(data => { const item = data.accounts.find(a => a.id === accountId); if (item) item.state = 'REAUTH_REQUIRED'; });
    await setAttempt(store, job.id, accountId, state, client?.message ?? '执行失败', client?.code ?? 'UNKNOWN');
    return state === 'WAITING_QR' ? 'wait' : 'continue';
  }
  return 'continue';
}
const running = new Set<string>();
export async function runJob(store: VaultAccess, jobId: string): Promise<void> {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    const job = store.get().jobs.find(j => j.id === jobId); if (!job) return;
    await store.update(data => { const item = data.jobs.find(j => j.id === jobId); if (item) item.state = 'RUNNING'; });
    for (const accountId of job.accountIds) {
      const attempt = store.get().attempts.find(a => a.jobId === jobId && a.accountId === accountId);
      if (!attempt || terminal.includes(attempt.state)) continue;
      if (attempt.state === 'WAITING_QR') { await store.update(data => { const item = data.jobs.find(j => j.id === jobId); if (item) item.state = 'WAITING'; }); return; }
      if (attempt.state === 'WAITING_CAPTCHA' || attempt.state === 'WAITING_FACE') continue;
      if (await executeAccount(store, job, accountId) === 'wait') { await store.update(data => { const item = data.jobs.find(j => j.id === jobId); if (item) item.state = 'WAITING'; }); return; }
    }
    await store.update(data => {
      const item = data.jobs.find(j => j.id === jobId);
      if (item) item.state = data.attempts.some(a => a.jobId === jobId && a.state.startsWith('WAITING_')) ? 'WAITING' : 'DONE';
    });
    await cleanupCompletedPhoto(store, jobId).catch(() => {});
  } finally { running.delete(jobId); }
}
export async function cleanupCompletedPhoto(store: VaultAccess, jobId: string): Promise<void> {
  const job = store.get().jobs.find(j => j.id === jobId);
  if (!job?.photoUri || job.state !== 'DONE') return;
  const photoInput = job.input.kind === 'photo' ? job.input : null;
  const retryNeedsFile = photoInput !== null && job.accountIds.some(id =>
    !photoInput.mediaIdByAccount[id] && store.get().attempts.some(a => a.jobId === jobId && a.accountId === id && (a.state === 'FAILED' || a.state === 'REAUTH_REQUIRED')));
  const retention = store.get().settings.imageRetentionHours * 60 * 60_000;
  if (retryNeedsFile && Date.now() - Date.parse(job.createdAt) < retention) return;
  const { clearStagedPhoto } = await import('./media');
  clearStagedPhoto(job.photoUri);
  await store.update(data => { const item = data.jobs.find(j => j.id === jobId); if (item) item.photoUri = undefined; });
}
export async function replaceQrAndResume(store: VaultAccess, jobId: string, qrPayload: string, scannedAt: string): Promise<void> {
  const age = Date.now() - Date.parse(scannedAt);
  if (!Number.isFinite(age) || age > 120_000 || age < -30_000) throw new Error('二维码扫描时间无效或已过期，请重新扫描');
  await store.update(data => {
    const job = data.jobs.find(j => j.id === jobId);
    if (!job || job.input.kind !== 'qr' || !data.attempts.some(a => a.jobId === jobId && a.state === 'WAITING_QR')) throw new Error('任务当前不在等待二维码');
    job.input = { ...job.input, qrPayload, scannedAt };
    for (const attempt of data.attempts) if (attempt.jobId === jobId && attempt.state === 'WAITING_QR') attempt.state = 'QUEUED';
    job.state = 'RUNNING';
  });
  await runJob(store, jobId);
}
export async function retryAttempt(store: VaultAccess, jobId: string, accountId: string): Promise<void> {
  const attempt = store.get().attempts.find(a => a.jobId === jobId && a.accountId === accountId);
  if (!attempt || !['FAILED', 'REAUTH_REQUIRED'].includes(attempt.state)) throw new Error('该账号当前不能重试');
  if (attempt.state === 'REAUTH_REQUIRED' && accountFor(store, accountId)?.state !== 'VALID') throw new Error('请先在账号页重新授权');
  const job = store.get().jobs.find(j => j.id === jobId);
  if (job?.input.kind === 'photo' && !job.input.mediaIdByAccount[accountId] && !job.photoUri) throw new Error('临时照片已清理，请重新选择');
  await setAttempt(store, jobId, accountId, 'QUEUED');
  await runJob(store, jobId);
}
export async function replacePhotoAndRetry(store: VaultAccess, jobId: string, accountId: string, photoUri: string): Promise<void> {
  let oldUri: string | undefined;
  await store.update(data => {
    const job = data.jobs.find(j => j.id === jobId);
    const attempt = data.attempts.find(a => a.jobId === jobId && a.accountId === accountId);
    if (!job || job.input.kind !== 'photo' || !attempt || attempt.state !== 'FAILED') throw new Error('当前账号不能替换照片');
    oldUri = job.photoUri; job.photoUri = photoUri; attempt.state = 'QUEUED'; job.state = 'RUNNING';
    delete job.input.mediaIdByAccount[accountId];
  });
  if (oldUri && oldUri !== photoUri) { const { clearStagedPhoto } = await import('./media'); clearStagedPhoto(oldUri); }
  await runJob(store, jobId);
}
export async function checkChallenge(store: VaultAccess, jobId: string, accountId: string): Promise<void> {
  const job = store.get().jobs.find(j => j.id === jobId);
  const account = accountFor(store, accountId);
  const attempt = store.get().attempts.find(a => a.jobId === jobId && a.accountId === accountId);
  if (!job || !account || !attempt || !['WAITING_CAPTCHA', 'WAITING_FACE'].includes(attempt.state)) throw new Error('没有待核查的验证');
  const result = await api.status(account.session, job.activity);
  if (result.state === 'SIGNED') { await setAttempt(store, jobId, accountId, 'SUCCESS', '已在第三方完成验证'); await runJob(store, jobId); }
  else if (result.state === 'EXPIRED') { await setAttempt(store, jobId, accountId, 'EXPIRED'); await runJob(store, jobId); }
  else throw new Error('远端仍未显示签到成功，请先完成验证');
}
export async function provideFaceAndResume(store: VaultAccess, jobId: string, accountId: string, mediaId: string): Promise<void> {
  await store.update(data => {
    const job = data.jobs.find(j => j.id === jobId);
    const attempt = data.attempts.find(a => a.jobId === jobId && a.accountId === accountId);
    if (!job || !attempt || attempt.state !== 'WAITING_FACE') throw new Error('没有待处理的人脸验证');
    job.faceMediaIdByAccount = { ...job.faceMediaIdByAccount, [accountId]: mediaId };
    attempt.state = 'QUEUED'; job.state = 'RUNNING';
  });
  await runJob(store, jobId);
}
