import { beforeEach, expect, mock, test } from 'bun:test';
import { emptyVault, type Activity, type ProviderSession, type SignInput, type SignStatus, type VaultData } from '@sign/shared';
import { DEMO_COURSE_ID } from '../features/courses/demo-course';

let counter = 0;
mock.module('expo-crypto', () => ({ randomUUID: () => `job-${++counter}` }));
class FakeClientError extends Error { constructor(public code: string, message: string, public retryable = false) { super(message); } }
const behavior = {
  submit: async (_id: string): Promise<SignStatus> => ({ state: 'READY' }),
  status: async (_id: string): Promise<{ state: 'READY' | 'SIGNED' }> => ({ state: 'READY' }),
  prepare: async (_id: string, _faceMediaId?: string): Promise<SignStatus | undefined> => undefined,
  upload: async (_id: string): Promise<{ mediaId: string }> => ({ mediaId: 'image' }),
};
const clearedPhotos: string[] = [];
const readPhotos: string[] = [];
const providerCalls: string[] = [];
mock.module('./media', () => ({ readStagedPhoto: async (uri: string) => { readPhotos.push(uri); return 'jpeg-base64'; }, clearStagedPhoto: (uri: string) => { clearedPhotos.push(uri); } }));
mock.module('./api', () => ({
  ClientError: FakeClientError,
  api: {
    check: async (s: ProviderSession) => { providerCalls.push('check'); return s; },
    status: async (s: ProviderSession) => { providerCalls.push('status'); return behavior.status(s.userId); },
    submit: async (s: ProviderSession, _activity: Activity, input: SignInput, faceMediaId?: string, onSubmit?: () => void | Promise<void>, resolvePhoto?: () => Promise<string>) => {
      providerCalls.push('submit');
      const stopped = await behavior.prepare(s.userId, faceMediaId);
      if (stopped) return stopped;
      if (input.kind === 'photo' && !input.mediaIdByAccount[s.userId]) await resolvePhoto?.();
      await onSubmit?.();
      return behavior.submit(s.userId);
    },
    upload: async (s: ProviderSession) => { providerCalls.push('upload'); return behavior.upload(s.userId); },
  },
}));
const { createJob, runJob, isJobRunning, subscribeJobRunner, cleanupCompletedPhoto, replaceQrAndResume, replacePhotoAndRetry, provideFaceAndResume, retryAttempt, checkChallenge } = await import('./jobs');

const activity: Activity = { id: 'act', courseId: 'course', classId: 'class', source: 'course', title: '测试签到', kind: 'click', startTime: null, endTime: null, signed: null, ext: '{}' };
const legacyActivities = (): Activity[] => (['click', 'location', 'photo', 'qr', 'code', 'gesture'] as const)
  .map(kind => ({ ...activity, id: `_daodian_demo_${kind}_`, courseId: DEMO_COURSE_ID, classId: '_daodian_demo_class_', kind }));
const session = (id: string): ProviderSession => ({ identifier: id, encryptedPassword: 'encrypted', cookies: [], userId: id, fid: '0', name: id, deviceCode: id });
function store() {
  let data: VaultData = emptyVault();
  data.accounts = ['a', 'b'].map(id => ({ id, label: id, role: id === 'a' ? 'primary' as const : 'delegate' as const, session: session(id), authorizedAt: '', state: 'VALID' }));
  return { get: () => data, update: async (change: (value: VaultData) => void) => { const next = structuredClone(data); change(next); data = next; } };
}
beforeEach(() => { counter = 0; clearedPhotos.length = 0; readPhotos.length = 0; providerCalls.length = 0; behavior.submit = async () => ({ state: 'READY' }); behavior.status = async () => ({ state: 'READY' }); behavior.prepare = async () => undefined; behavior.upload = async () => ({ mediaId: 'image' }); });

test('旧测试课程的六种任务不会调用学习通接口', async () => {
  const state = store();
  const inputs: SignInput[] = [
    { kind: 'click' },
    { kind: 'location', latitude: 34.8, longitude: 113.6, address: '测试位置' },
    { kind: 'photo', mediaIdByAccount: {} },
    { kind: 'qr', qrPayload: 'daodian://demo/qr-check-in', scannedAt: new Date().toISOString() },
    { kind: 'code', code: '1234' },
    { kind: 'gesture', sequence: '1234' },
  ];
  for (const [index, activity] of legacyActivities().entries()) {
    const job = await createJob(state, activity, ['a', 'b'], inputs[index], index === 2 ? 'file:///cache/demo-photo.jpg' : undefined);
    await runJob(state, job.id);
  }
  expect(providerCalls).toEqual([]);
  expect(state.get().attempts).toHaveLength(12);
  expect(state.get().attempts.every(attempt => attempt.state === 'FAILED' && attempt.message?.includes('未向学习通提交') && attempt.count === 0)).toBe(true);
  expect(state.get().jobs.every(job => job.state === 'DONE')).toBe(true);
  expect(state.get().activityCache).toEqual([]);
  expect(clearedPhotos).toEqual(['file:///cache/demo-photo.jpg']);
});

test('一个账号失败不丢失另一个账号的结果', async () => {
  const state = store(); const submitted = new Set<string>();
  behavior.submit = async id => { if (id === 'a') throw new FakeClientError('UNKNOWN', '失败'); submitted.add(id); return { state: 'SIGNED', submitted: true }; };
  behavior.status = async id => ({ state: submitted.has(id) ? 'SIGNED' : 'READY' });
  const job = await createJob(state, activity, ['a', 'b'], { kind: 'click' }); await runJob(state, job.id);
  expect(state.get().attempts.map(a => a.state)).toEqual(['FAILED', 'SUCCESS']);
  expect(state.get().jobs[0].state).toBe('DONE');
});

test('动态码过期后只继续未完成账号', async () => {
  const state = store(); const calls: string[] = []; let fresh = false; const signed = new Set<string>();
  behavior.submit = async id => { calls.push(id); if (id === 'b' && !fresh) throw new FakeClientError('QR_EXPIRED', '二维码过期'); signed.add(id); return { state: 'SIGNED', submitted: true }; };
  behavior.status = async id => ({ state: signed.has(id) ? 'SIGNED' : 'READY' });
  const job = await createJob(state, { ...activity, kind: 'qr' }, ['a', 'b'], { kind: 'qr', qrPayload: 'old', scannedAt: new Date().toISOString() });
  await runJob(state, job.id); expect(state.get().attempts.map(a => a.state)).toEqual(['SUCCESS', 'WAITING_QR']);
  fresh = true; await replaceQrAndResume(state, job.id, 'new', new Date(Date.now() - 180_000).toISOString());
  expect(calls).toEqual(['a', 'b', 'b']); expect(state.get().attempts.map(a => a.state)).toEqual(['SUCCESS', 'SUCCESS']);
});

test('无效扫码信息不会改变等待中的二维码任务', async () => {
  const state = store();
  const job = await createJob(state, { ...activity, kind: 'qr' }, ['a'], { kind: 'qr', qrPayload: 'old', scannedAt: new Date().toISOString() });
  await state.update(data => { data.attempts[0].state = 'WAITING_QR'; data.jobs[0].state = 'WAITING'; });
  await expect(replaceQrAndResume(state, job.id, 'late', 'invalid time')).rejects.toThrow('无效');
  expect(state.get().jobs[0].input).toEqual(job.input);
  expect(state.get().attempts[0].state).toBe('WAITING_QR');
});

test('提交超时先查询远端状态，不重复提交', async () => {
  const state = store(); let submits = 0; let checks = 0;
  behavior.submit = async () => { submits++; throw new FakeClientError('NETWORK_TIMEOUT', '超时', true); };
  behavior.status = async () => ({ state: ++checks >= 1 ? 'SIGNED' : 'READY' });
  const job = await createJob(state, activity, ['a'], { kind: 'click' }); await runJob(state, job.id);
  expect(submits).toBe(1); expect(state.get().attempts[0].state).toBe('SUCCESS');
  expect(state.get().attempts[0].count).toBe(1);
});
test('第三方已确认的新提交记为成功', async () => {
  const state = store(); let signed = false;
  behavior.submit = async () => { signed = true; return { state: 'SIGNED', submitted: true }; };
  behavior.status = async () => ({ state: signed ? 'SIGNED' : 'READY' });
  const job = await createJob(state, activity, ['a'], { kind: 'click' }); await runJob(state, job.id);
  expect(state.get().attempts[0].state).toBe('SUCCESS');
});

test('已核验的新提交不再发起会覆盖成功的额外查询', async () => {
  const state = store(); let checks = 0;
  behavior.status = async () => {
    if (++checks > 1) throw new FakeClientError('PROVIDER_CHANGED', '无法确认远端签到状态');
    return { state: 'READY' };
  };
  behavior.submit = async () => ({ state: 'SIGNED', submitted: true });
  const job = await createJob(state, activity, ['a'], { kind: 'click' }); await runJob(state, job.id);
  expect(checks).toBe(0);
  expect(providerCalls).toEqual(['check', 'submit']);
  expect(state.get().attempts[0].count).toBe(1);
  expect(state.get().attempts[0].state).toBe('SUCCESS');
});

test('结果待确认的任务只核查原提交，不允许重新提交', async () => {
  const state = store();
  const job = await createJob(state, { ...activity, title: '第五次签到' }, ['a'], { kind: 'click' });
  behavior.submit = async () => ({ state: 'WAITING_CONFIRMATION', message: '已提交，签到结果待确认' });
  await runJob(state, job.id);
  expect(state.get().attempts[0]).toMatchObject({ state: 'WAITING_CONFIRMATION', count: 1 });
  expect(state.get().jobs[0].state).toBe('WAITING');

  providerCalls.length = 0;
  await runJob(state, job.id);
  await expect(retryAttempt(state, job.id, 'a')).rejects.toThrow('不能重试');
  await expect(checkChallenge(state, job.id, 'a')).rejects.toThrow('暂未确认');
  expect(state.get().attempts[0].state).toBe('WAITING_CONFIRMATION');
  behavior.status = async () => ({ state: 'SIGNED' });
  await checkChallenge(state, job.id, 'a');

  expect(providerCalls).toEqual(['status', 'status']);
  expect(state.get().attempts[0]).toMatchObject({ state: 'SUCCESS', count: 1 });
  expect(state.get().jobs[0].state).toBe('DONE');
});

test('签到前解析失败明确说明未提交，重试不会绕过核查', async () => {
  const state = store();
  behavior.prepare = async () => { throw new FakeClientError('PROVIDER_CHANGED', '无法确认远端签到状态'); };
  const job = await createJob(state, activity, ['a'], { kind: 'click' });
  await runJob(state, job.id);
  expect(state.get().attempts[0]).toMatchObject({ state: 'FAILED', count: 0, message: '签到前检查未通过：无法确认远端签到状态' });
  await retryAttempt(state, job.id, 'a');
  expect(state.get().attempts[0].count).toBe(0);
  expect(providerCalls).not.toContain('status');
});
test('二维码等待验证时只核查结果，学习通确认已签后才记为成功', async () => {
  const state = store();
  const job = await createJob(state, { ...activity, kind: 'qr' }, ['a'], {
    kind: 'qr', qrPayload: 'https://mobilelearn.chaoxing.com/x?aid=act&enc=test', scannedAt: new Date().toISOString(),
  });
  behavior.prepare = async () => ({ state: 'WAITING_FACE' });
  await runJob(state, job.id);
  providerCalls.length = 0;

  await expect(checkChallenge(state, job.id, 'a')).rejects.toThrow('学习通仍显示未签到，请完成验证和签到');
  expect(state.get().attempts[0]).toMatchObject({ state: 'WAITING_FACE', count: 0 });
  behavior.status = async () => ({ state: 'SIGNED' });
  await checkChallenge(state, job.id, 'a');

  expect(providerCalls).toEqual(['status', 'status']);
  expect(state.get().attempts[0]).toMatchObject({ state: 'SUCCESS', count: 0 });
  expect(state.get().jobs[0].state).toBe('DONE');
});

test('人脸等待状态在提供该账号照片后继续', async () => {
  const state = store(); let signed = false;
  behavior.prepare = async (_id, faceMediaId) => faceMediaId ? undefined : { state: 'WAITING_FACE' };
  behavior.submit = async () => { signed = true; return { state: 'SIGNED', submitted: true }; };
  behavior.status = async () => ({ state: signed ? 'SIGNED' : 'READY' });
  const job = await createJob(state, activity, ['a'], { kind: 'click' }); await runJob(state, job.id);
  expect(state.get().attempts[0].state).toBe('WAITING_FACE');
  expect(state.get().attempts[0].count).toBe(0);
  await provideFaceAndResume(state, job.id, 'a', 'image-a');
  expect(state.get().attempts[0].state).toBe('SUCCESS');
  expect(state.get().attempts[0].count).toBe(1);
});

test('二维码人脸等待在提供照片后携带照片继续提交', async () => {
  const state = store(); let signed = false; const seenFace: (string | undefined)[] = [];
  behavior.prepare = async (_id, faceMediaId) => { seenFace.push(faceMediaId); return faceMediaId ? undefined : { state: 'WAITING_FACE' }; };
  behavior.submit = async () => { signed = true; return { state: 'SIGNED', submitted: true }; };
  behavior.status = async () => ({ state: signed ? 'SIGNED' : 'READY' });
  const job = await createJob(state, { ...activity, kind: 'qr' }, ['a'], {
    kind: 'qr', qrPayload: 'https://mobilelearn.chaoxing.com/x?aid=act&enc=test', scannedAt: new Date().toISOString(),
  });
  await runJob(state, job.id);
  expect(state.get().attempts[0].state).toBe('WAITING_FACE');
  seenFace.length = 0;
  await provideFaceAndResume(state, job.id, 'a', 'image-a');
  expect(seenFace).toEqual(['image-a']);
  expect(state.get().attempts[0].state).toBe('SUCCESS');
});

test('准备阶段超时不进入提交核验，也不增加次数', async () => {
  const state = store();
  behavior.prepare = async () => { throw new FakeClientError('NETWORK_TIMEOUT', '预签到请求超时'); };
  const job = await createJob(state, activity, ['a'], { kind: 'click' }); await runJob(state, job.id);
  expect(state.get().attempts[0]).toMatchObject({ state: 'FAILED', count: 0, message: '签到前检查未通过：预签到请求超时' });
  expect(providerCalls).toEqual(['check', 'submit']);
});

test('活动要求变化时保留补填原因，点击普通重试也不会发送同一份输入', async () => {
  const state = store();
  behavior.prepare = async () => { throw new FakeClientError('SIGN_INPUT_CHANGED', '签到类型已更新，请重新准备'); };
  const job = await createJob(state, activity, ['a'], { kind: 'click' });
  await runJob(state, job.id);
  expect(state.get().attempts[0]).toMatchObject({ state: 'FAILED', count: 0, code: 'SIGN_INPUT_CHANGED' });
  await expect(retryAttempt(state, job.id, 'a')).rejects.toThrow('重新准备');
  expect(providerCalls).toEqual(['check', 'submit']);
});

test('学习通具体拒绝原因保存在账号结果中，次数反映实际提交', async () => {
  const state = store();
  behavior.submit = async () => { throw new FakeClientError('PROVIDER_CHANGED', '学习通返回：教师已结束本次活动'); };
  const job = await createJob(state, activity, ['a'], { kind: 'click' }); await runJob(state, job.id);
  expect(state.get().attempts[0]).toMatchObject({ state: 'FAILED', count: 1, message: '学习通返回：教师已结束本次活动' });
});
test('一个账号等待人脸时其余账号仍执行', async () => {
  const state = store(); const signed = new Set<string>(); const checked: string[] = [];
  behavior.prepare = async (id, faceMediaId) => { checked.push(id); return faceMediaId ? undefined : { state: 'WAITING_FACE' }; };
  behavior.submit = async id => { signed.add(id); return { state: 'SIGNED', submitted: true }; };
  behavior.status = async id => ({ state: signed.has(id) ? 'SIGNED' : 'READY' });
  const job = await createJob(state, activity, ['a', 'b'], { kind: 'click' });
  await runJob(state, job.id);
  expect(checked).toEqual(['a', 'b']);
  expect(state.get().attempts.map(a => a.state)).toEqual(['WAITING_FACE', 'WAITING_FACE']);
  expect(state.get().jobs[0].state).toBe('WAITING');
  await provideFaceAndResume(state, job.id, 'a', 'image-a');
  expect(state.get().attempts.map(a => a.state)).toEqual(['SUCCESS', 'WAITING_FACE']);
});
test('照片按账号上传，单个上传失败不阻断其他账号', async () => {
  const state = store(); const uploaded: string[] = []; const signed = new Set<string>();
  behavior.upload = async id => { uploaded.push(id); if (id === 'a') throw new FakeClientError('UNKNOWN', '上传失败'); return { mediaId: 'image-b' }; };
  behavior.submit = async id => { signed.add(id); return { state: 'SIGNED', submitted: true }; };
  behavior.status = async id => ({ state: signed.has(id) ? 'SIGNED' : 'READY' });
  const job = await createJob(state, { ...activity, kind: 'photo' }, ['a', 'b'], { kind: 'photo', mediaIdByAccount: {} }, 'file:///cache/sign-photo-test.jpg');
  await runJob(state, job.id);
  expect(uploaded).toEqual(['a', 'b']);
  expect(state.get().attempts.map(a => a.state)).toEqual(['FAILED', 'SUCCESS']);
  expect(clearedPhotos).toEqual([]);
  behavior.upload = async id => { uploaded.push(id); return { mediaId: 'image-a' }; };
  await retryAttempt(state, job.id, 'a');
  expect(state.get().attempts.map(a => a.state)).toEqual(['SUCCESS', 'SUCCESS']);
  expect(clearedPhotos).toEqual(['file:///cache/sign-photo-test.jpg']);
});
test('重启恢复先查远端，已提交账号不重签且记为成功', async () => {
  const state = store(); let submits = 0;
  behavior.status = async () => ({ state: 'SIGNED' });
  behavior.submit = async () => { submits++; return { state: 'SIGNED', submitted: true }; };
  const job = await createJob(state, activity, ['a'], { kind: 'click' });
  await state.update(data => { data.attempts[0].state = 'SUBMITTING'; });
  await runJob(state, job.id);
  expect(submits).toBe(0);
  expect(state.get().attempts[0].state).toBe('SUCCESS');
});

test('重启后无法确认提交时保持待确认，后续任务执行也不会重发', async () => {
  const state = store();
  const job = await createJob(state, activity, ['a'], { kind: 'click' });
  await state.update(data => {
    data.attempts[0].state = 'SUBMITTING';
    data.attempts[0].count = 1;
  });
  behavior.status = async () => { throw new FakeClientError('NETWORK_TIMEOUT', '超时'); };
  await runJob(state, job.id);
  await runJob(state, job.id);
  expect(state.get().attempts[0]).toMatchObject({ state: 'WAITING_CONFIRMATION', count: 1 });
  expect(providerCalls).toEqual(['check', 'status']);
});

test('预签到已确认成功时不用再上传照片', async () => {
  const state = store();
  behavior.prepare = async () => ({ state: 'SIGNED' });
  const job = await createJob(state, { ...activity, kind: 'photo' }, ['a'], { kind: 'photo', mediaIdByAccount: {} }, 'file:///cache/sign-photo-unused.jpg');
  await runJob(state, job.id);
  expect(state.get().attempts[0]).toMatchObject({ state: 'ALREADY_SIGNED', count: 0 });
  expect(providerCalls).toEqual(['check', 'submit']);
});

test('上传失败的临时照片固定保留 24 小时，到期清理且预留照片不受影响', async () => {
  const state = store();
  const reserved = { id: 'reserved-1', createdAt: '2026-10-02T00:00:00.000Z', name: '门口' };
  await state.update(data => { data.settings.reservedPhotos.push(reserved); });
  behavior.upload = async () => { throw new FakeClientError('UNKNOWN', '上传失败'); };
  const uri = 'file:///cache/sign-photo-expiry.jpg';
  const job = await createJob(state, { ...activity, kind: 'photo' }, ['a'], { kind: 'photo', mediaIdByAccount: {} }, uri);
  await state.update(data => { data.jobs[0].createdAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString(); });
  await runJob(state, job.id);
  expect(state.get().attempts[0].state).toBe('FAILED');
  expect(state.get().jobs[0].photoUri).toBe(uri);
  expect(clearedPhotos).toEqual([]);
  await state.update(data => { data.jobs[0].createdAt = new Date(Date.now() - 25 * 60 * 60_000).toISOString(); });
  await cleanupCompletedPhoto(state, job.id);
  expect(clearedPhotos).toEqual([uri]);
  expect(state.get().jobs[0].photoUri).toBeUndefined();
  expect(state.get().settings.reservedPhotos).toEqual([reserved]);
  await retryAttempt(state, job.id, 'a');
  expect(state.get().attempts[0]).toMatchObject({
    state: 'FAILED', count: 0, message: '签到前检查未通过：照片已丢失，请重新选择',
  });
});

test('结果页区分正在执行和需要恢复的任务', async () => {
  const state = store();
  const job = await createJob(state, activity, ['a'], { kind: 'click' });
  expect(isJobRunning(job.id)).toBe(false);
  const changes: boolean[] = [];
  const unsubscribe = subscribeJobRunner(() => changes.push(isJobRunning(job.id)));
  try {
    behavior.prepare = async () => ({ state: 'WAITING_FACE' });
    await runJob(state, job.id);
    expect(changes).toEqual([true, false]);
    expect(state.get().jobs[0].state).toBe('WAITING');
    expect(state.get().attempts[0].state).toBe('WAITING_FACE');
  } finally { unsubscribe(); }
});

test('替换照片按账号隔离，其他账号重试仍用共用原图', async () => {
  const state = store();
  behavior.upload = async () => { throw new FakeClientError('UNKNOWN', '上传失败'); };
  const orig = 'file:///cache/sign-photo-orig.jpg';
  const job = await createJob(state, { ...activity, kind: 'photo' }, ['a', 'b'], { kind: 'photo', mediaIdByAccount: {} }, orig);
  await runJob(state, job.id);
  expect(state.get().attempts.map(a => a.state)).toEqual(['FAILED', 'FAILED']);
  expect(readPhotos).toEqual([orig, orig]);
  readPhotos.length = 0;
  const replacement = 'file:///cache/sign-photo-new.jpg';
  await replacePhotoAndRetry(state, job.id, 'a', replacement);
  expect(readPhotos).toEqual([replacement]);
  expect(state.get().jobs[0].photoUri).toBe(orig);
  expect(state.get().jobs[0].photoUriByAccount).toEqual({ a: replacement });
  expect(clearedPhotos).toEqual([]);
  readPhotos.length = 0;
  behavior.upload = async id => ({ mediaId: `image-${id}` });
  behavior.submit = async () => ({ state: 'SIGNED', submitted: true });
  await retryAttempt(state, job.id, 'b');
  expect(readPhotos).toEqual([orig]);
  expect(state.get().attempts.find(a => a.accountId === 'b')?.state).toBe('SUCCESS');
});

test('执行中重试失败账号会被执行器接住，队列清空才结束任务', async () => {
  const state = store();
  const job = await createJob(state, activity, ['a', 'b'], { kind: 'click' });
  const submitted: string[] = [];
  let retried = false;
  behavior.submit = async id => {
    submitted.push(id);
    if (id === 'a' && !retried) throw new FakeClientError('UNKNOWN', '失败');
    if (id === 'b' && !retried) { retried = true; await retryAttempt(state, job.id, 'a'); }
    return { state: 'SIGNED', submitted: true };
  };
  behavior.status = async () => ({ state: 'SIGNED' });
  await runJob(state, job.id);
  expect(submitted).toEqual(['a', 'b', 'a']);
  expect(state.get().attempts.map(a => a.state)).toEqual(['SUCCESS', 'SUCCESS']);
  expect(state.get().jobs[0].state).toBe('DONE');
});
