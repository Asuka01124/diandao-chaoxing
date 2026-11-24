import { randomUUID } from 'expo-crypto';
import { signInputSchema, validateActivityInput, type Account, type Activity, type AttemptState, type Job, type ProviderSession, type SignInput, type VaultData } from '@sign/shared';
import { api, ClientError } from './api';
import { isDemoActivity } from '../features/courses/demo-course';

export type VaultAccess = { get: () => VaultData; update: (change: (data: VaultData) => void) => Promise<void> };
const terminal: AttemptState[] = ['SUCCESS', 'ALREADY_SIGNED', 'REAUTH_REQUIRED', 'EXPIRED', 'FAILED'];
const confirmationMessage = '提交状态待确认，请检查签到结果';

export async function createJob(store: VaultAccess, activity: Activity, accountIds: string[], input: SignInput, photoUri?: string): Promise<Job> {
  validateActivityInput(activity, input);
  if (input.kind === 'photo' && !photoUri && accountIds.some(id => !input.mediaIdByAccount[id])) throw new Error('缺少签到照片');
  if (!accountIds.length || new Set(accountIds).size !== accountIds.length) throw new Error('请选择至少一个有效账号');
  if (accountIds.some(id => !store.get().accounts.some(account => account.id === id))) throw new Error('账号列表已更新，请重新选择');
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

async function refreshSession(store: VaultAccess, account: Account): Promise<ProviderSession> {
  const session = await api.check(account.session);
  await store.update(data => {
    const saved = data.accounts.find(item => item.id === account.id);
    if (saved) { saved.session = session; saved.state = 'VALID'; saved.verifiedAt = new Date().toISOString(); }
  });
  return session;
}

async function sessionForSign(store: VaultAccess, account: Account, activity: Activity): Promise<ProviderSession> {
  try {
    return await refreshSession(store, account);
  } catch (error) {
    const transient = error instanceof ClientError &&
      (error.code === 'NETWORK_TIMEOUT' || error.code === 'RATE_LIMITED' || (error.code === 'UNKNOWN' && error.retryable));
    if (!transient) throw error;
    // 身份接口暂时不可用，但会话可能仍有效：用已有同账号会话查一次活动状态，由学习通响应决定是否续登。
    await api.status(account.session, activity);
    return account.session;
  }
}

async function verifySubmission(store: VaultAccess, job: Job, accountId: string, session: ProviderSession): Promise<void> {
  const remote = await api.status(session, job.activity).catch(() => undefined);
  if (remote?.state === 'SIGNED') await setAttempt(store, job.id, accountId, 'SUCCESS');
  else await setAttempt(store, job.id, accountId, 'WAITING_CONFIRMATION', confirmationMessage);
}

async function uploadSignPhoto(store: VaultAccess, jobId: string, accountId: string, session: ProviderSession): Promise<string> {
  const job = store.get().jobs.find(item => item.id === jobId);
  const uri = job?.photoUriByAccount?.[accountId] ?? job?.photoUri;
  if (!uri) throw new ClientError('INVALID_INPUT', '照片已丢失，请重新选择');
  const { readStagedPhoto } = await import('./media');
  const photo = await readStagedPhoto(uri).catch(error => {
    throw new ClientError('INVALID_INPUT', error instanceof Error ? error.message : '无法读取照片，请重新选择');
  });
  const { mediaId } = await api.upload(session, photo);
  await store.update(data => {
    const saved = data.jobs.find(item => item.id === jobId);
    if (saved?.input.kind === 'photo') saved.input.mediaIdByAccount[accountId] = mediaId;
  });
  return mediaId;
}
async function executeAccount(store: VaultAccess, job: Job, accountId: string): Promise<'continue' | 'wait'> {
  const account = accountFor(store, accountId);
  if (!account) { await setAttempt(store, job.id, accountId, 'FAILED', '账号已删除', 'INVALID_INPUT'); return 'continue'; }
  const previousAttempt = store.get().attempts.find(a => a.jobId === job.id && a.accountId === accountId);
  const recovering = previousAttempt?.state === 'SUBMITTING' || previousAttempt?.state === 'VERIFYING';
  let requestStarted = false;
  try {
    if (isDemoActivity(job.activity)) {
      await setAttempt(store, job.id, accountId, 'FAILED', '旧测试课程已移除，未向学习通提交', 'INVALID_INPUT');
      return 'continue';
    }
    await setAttempt(store, job.id, accountId, recovering ? 'VERIFYING' : 'PREFLIGHT');
    const session = await sessionForSign(store, account, job.activity);
    if (recovering) {
      await verifySubmission(store, job, accountId, session);
      return 'continue';
    }
    if (!accountFor(store, accountId)) return 'continue';
    const savedMediaId = job.input.kind === 'photo' ? job.input.mediaIdByAccount[accountId] : undefined;
    const input = job.input.kind === 'photo'
      ? { ...job.input, mediaIdByAccount: savedMediaId ? { [session.userId]: savedMediaId } : {} }
      : job.input;
    const resolvePhoto = input.kind === 'photo' ? () => uploadSignPhoto(store, job.id, accountId, session) : undefined;
    let result;
    try {
      result = await api.submit(session, job.activity, input, job.faceMediaIdByAccount?.[accountId], async () => {
        if (!accountFor(store, accountId)) throw new ClientError('INVALID_INPUT', '账号已删除');
        await setAttempt(store, job.id, accountId, 'SUBMITTING');
        requestStarted = true;
      }, resolvePhoto);
    } catch (error) {
      if (requestStarted && error instanceof ClientError && (error.code === 'NETWORK_TIMEOUT' || (error.code === 'UNKNOWN' && error.retryable))) {
        await setAttempt(store, job.id, accountId, 'VERIFYING', confirmationMessage);
        await verifySubmission(store, job, accountId, session);
        return 'continue';
      }
      throw error;
    }
    if (result.state === 'WAITING_CAPTCHA' || result.state === 'WAITING_FACE' || result.state === 'WAITING_QR') {
      await setAttempt(store, job.id, accountId, result.state, result.message);
      return result.state === 'WAITING_QR' ? 'wait' : 'continue';
    }
    if (result.state === 'EXPIRED') { await setAttempt(store, job.id, accountId, 'EXPIRED'); return 'continue'; }
    if (result.state === 'SIGNED') {
      await setAttempt(store, job.id, accountId, result.submitted || (previousAttempt?.count ?? 0) > 0 ? 'SUCCESS' : 'ALREADY_SIGNED');
      return 'continue';
    }
    if (result.state === 'WAITING_CONFIRMATION' || (result.state === 'READY' && requestStarted)) {
      await setAttempt(store, job.id, accountId, 'WAITING_CONFIRMATION', result.message ?? confirmationMessage);
    } else {
      await setAttempt(store, job.id, accountId, 'FAILED', '学习通仍显示未签到，请检查活动要求后重试', 'PROVIDER_CHANGED');
    }
  } catch (error) {
    if (recovering) {
      await setAttempt(store, job.id, accountId, 'WAITING_CONFIRMATION', confirmationMessage);
      return 'continue';
    }
    const client = error instanceof ClientError ? error : undefined;
    const state: AttemptState = client?.code === 'REAUTH_REQUIRED' || client?.code === 'SESSION_EXPIRED' ? 'REAUTH_REQUIRED'
      : client?.code === 'QR_EXPIRED' ? 'WAITING_QR' : client?.code === 'VALIDATION_FAILED' && job.faceMediaIdByAccount?.[accountId] ? 'WAITING_FACE' : 'FAILED';
    if (state === 'REAUTH_REQUIRED') await store.update(data => { const item = data.accounts.find(a => a.id === accountId); if (item) item.state = 'REAUTH_REQUIRED'; });
    const phase = store.get().attempts.find(a => a.jobId === job.id && a.accountId === accountId)?.state;
    const message = client?.message ?? '执行失败';
    await setAttempt(store, job.id, accountId, state,
      state === 'FAILED' && phase === 'PREFLIGHT' ? `签到前检查未通过：${message}` : message,
      client?.code ?? 'UNKNOWN');
    return state === 'WAITING_QR' ? 'wait' : 'continue';
  }
  return 'continue';
}
const running = new Set<string>();
const runnerListeners = new Set<() => void>();
export function subscribeJobRunner(listener: () => void) {
  runnerListeners.add(listener);
  return () => { runnerListeners.delete(listener); };
}
export function isJobRunning(jobId: string) { return running.has(jobId); }
function notifyRunnerListeners() { for (const listener of runnerListeners) listener(); }

export async function runJob(store: VaultAccess, jobId: string): Promise<void> {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    notifyRunnerListeners();
    if (!store.get().jobs.some(j => j.id === jobId)) return;
    await store.update(data => { const item = data.jobs.find(j => j.id === jobId); if (item) item.state = 'RUNNING'; });
    for (;;) {
      const job = store.get().jobs.find(j => j.id === jobId); if (!job) break;
      const attempts = store.get().attempts.filter(a => a.jobId === jobId);
      let next: string | undefined; let waitingQr = false;
      for (const accountId of job.accountIds) {
        const attempt = attempts.find(a => a.accountId === accountId);
        if (!attempt || terminal.includes(attempt.state)) continue;
        if (attempt.state === 'WAITING_QR') { waitingQr = true; break; }
        if (attempt.state.startsWith('WAITING_')) continue;
        next = accountId; break;
      }
      if (waitingQr) { await store.update(data => { const item = data.jobs.find(j => j.id === jobId); if (item) item.state = 'WAITING'; }); break; }
      if (!next) {
        // 队列清空才结束；判断与落库在同一同步回调内，避免重试刚排入就被判结束。
        let idle = true;
        await store.update(data => {
          const item = data.jobs.find(j => j.id === jobId);
          const pending = data.attempts.some(a => a.jobId === jobId && !terminal.includes(a.state) && !a.state.startsWith('WAITING_'));
          if (pending) { idle = false; if (item) item.state = 'RUNNING'; }
          else if (item) item.state = data.attempts.some(a => a.jobId === jobId && a.state.startsWith('WAITING_')) ? 'WAITING' : 'DONE';
        });
        if (idle) break;
        continue;
      }
      if (await executeAccount(store, job, next) === 'wait') { await store.update(data => { const item = data.jobs.find(j => j.id === jobId); if (item) item.state = 'WAITING'; }); break; }
    }
  } finally { running.delete(jobId); notifyRunnerListeners(); }
  await cleanupCompletedPhoto(store, jobId).catch(() => {});
  // 释放执行器后再复查：落库间隙排入的重试由此接住，不会随任务结束而丢失。
  if (store.get().attempts.some(a => a.jobId === jobId && !terminal.includes(a.state) && !a.state.startsWith('WAITING_'))) await runJob(store, jobId);
}
export async function cleanupCompletedPhoto(store: VaultAccess, jobId: string): Promise<void> {
  const job = store.get().jobs.find(j => j.id === jobId);
  if (!job || job.state !== 'DONE') return;
  const uris = new Set<string>();
  if (job.photoUri) uris.add(job.photoUri);
  for (const uri of Object.values(job.photoUriByAccount ?? {})) uris.add(uri);
  if (!uris.size) return;
  const photoInput = job.input.kind === 'photo' ? job.input : null;
  const retryNeedsFile = !isDemoActivity(job.activity) && photoInput !== null && job.accountIds.some(id =>
    !photoInput.mediaIdByAccount[id] && store.get().attempts.some(a => a.jobId === jobId && a.accountId === id && (a.state === 'FAILED' || a.state === 'REAUTH_REQUIRED')));
  // 需要重试的临时照片固定保留 24 小时。
  if (retryNeedsFile && Date.now() - Date.parse(job.createdAt) < 24 * 60 * 60_000) return;
  const { clearStagedPhoto } = await import('./media');
  for (const uri of uris) clearStagedPhoto(uri);
  await store.update(data => { const item = data.jobs.find(j => j.id === jobId); if (item) { item.photoUri = undefined; item.photoUriByAccount = undefined; } });
}
export async function replaceQrAndResume(store: VaultAccess, jobId: string, qrPayload: string, scannedAt: string): Promise<void> {
  if (!signInputSchema.safeParse({ kind: 'qr', qrPayload, scannedAt }).success) throw new Error('二维码扫描信息无效，请重新扫描');
  await store.update(data => {
    const job = data.jobs.find(j => j.id === jobId);
    if (!job || job.input.kind !== 'qr' || !data.attempts.some(a => a.jobId === jobId && a.state === 'WAITING_QR')) throw new Error('当前任务无需重新扫码');
    job.input = { ...job.input, qrPayload, scannedAt };
    for (const attempt of data.attempts) if (attempt.jobId === jobId && attempt.state === 'WAITING_QR') attempt.state = 'QUEUED';
    job.state = 'RUNNING';
  });
  await runJob(store, jobId);
}
export async function retryAttempt(store: VaultAccess, jobId: string, accountId: string): Promise<void> {
  const attempt = store.get().attempts.find(a => a.jobId === jobId && a.accountId === accountId);
  if (!attempt || !['FAILED', 'REAUTH_REQUIRED'].includes(attempt.state)) throw new Error('该账号当前不能重试');
  if (attempt.state === 'REAUTH_REQUIRED' && accountFor(store, accountId)?.state !== 'VALID') throw new Error('请先重新登录该账号');
  if (attempt.code === 'SIGN_INPUT_CHANGED') throw new Error('请重新准备签到');
  await setAttempt(store, jobId, accountId, 'QUEUED');
  await runJob(store, jobId);
}
export async function replacePhotoAndRetry(store: VaultAccess, jobId: string, accountId: string, photoUri: string): Promise<void> {
  let oldReplacement: string | undefined;
  await store.update(data => {
    const job = data.jobs.find(j => j.id === jobId);
    const attempt = data.attempts.find(a => a.jobId === jobId && a.accountId === accountId);
    if (!job || job.input.kind !== 'photo' || !attempt || attempt.state !== 'FAILED') throw new Error('当前账号不能替换照片');
    oldReplacement = job.photoUriByAccount?.[accountId];
    job.photoUriByAccount = { ...job.photoUriByAccount, [accountId]: photoUri };
    attempt.state = 'QUEUED'; job.state = 'RUNNING';
    delete job.input.mediaIdByAccount[accountId];
  });
  // 只清理该账号上一张替换图，共用原图留给尚未上传的其他账号。
  if (oldReplacement && oldReplacement !== photoUri) { const { clearStagedPhoto } = await import('./media'); clearStagedPhoto(oldReplacement); }
  await runJob(store, jobId);
}
export async function checkChallenge(store: VaultAccess, jobId: string, accountId: string): Promise<void> {
  const job = store.get().jobs.find(j => j.id === jobId);
  const account = accountFor(store, accountId);
  const attempt = store.get().attempts.find(a => a.jobId === jobId && a.accountId === accountId);
  if (!job || !account || !attempt || !['WAITING_CAPTCHA', 'WAITING_FACE', 'WAITING_CONFIRMATION'].includes(attempt.state)) {
    throw new Error('当前账号没有待核查的签到');
  }
  const confirming = attempt.state === 'WAITING_CONFIRMATION';
  const result = await api.status(account.session, job.activity).catch(async error => {
    if (!(error instanceof ClientError) || error.code !== 'SESSION_EXPIRED') throw error;
    return api.status(await refreshSession(store, account), job.activity);
  });
  if (result.state === 'SIGNED') {
    await setAttempt(store, jobId, accountId, 'SUCCESS', confirming ? undefined : '已在学习通完成验证');
    await runJob(store, jobId);
  } else if (result.state === 'EXPIRED') {
    await setAttempt(store, jobId, accountId, 'EXPIRED', confirming ? '活动已结束，个人签到结果仍未知（已提交）' : undefined);
    await runJob(store, jobId);
  } else if (confirming) {
    throw new Error('学习通暂未确认签到，请稍后再检查');
  } else {
    throw new Error('学习通仍显示未签到，请完成验证和签到');
  }
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
