import { beforeEach, expect, mock, test } from 'bun:test';
import { emptyVault, type Activity, type ProviderSession, type SignInput, type VaultData } from '@sign/shared';
import { demoActivities } from '../features/courses/demo-course';

let counter = 0;
mock.module('expo-crypto', () => ({ randomUUID: () => `job-${++counter}` }));
class FakeClientError extends Error { constructor(public code: string, message: string, public retryable = false) { super(message); } }
const behavior = {
  submit: async (_id: string): Promise<{ state: 'READY' | 'SIGNED'; submitted?: boolean }> => ({ state: 'READY' }),
  status: async (_id: string): Promise<{ state: 'READY' | 'SIGNED' }> => ({ state: 'READY' }),
  preflight: async (_id: string): Promise<{ state: 'READY' | 'WAITING_FACE' }> => ({ state: 'READY' }),
  upload: async (_id: string): Promise<{ mediaId: string }> => ({ mediaId: 'image' }),
};
const clearedPhotos: string[] = [];
const providerCalls: string[] = [];
mock.module('./media', () => ({ readStagedPhoto: async () => 'jpeg-base64', clearStagedPhoto: (uri: string) => { clearedPhotos.push(uri); } }));
mock.module('./api', () => ({
  ClientError: FakeClientError,
  api: {
    check: async (s: ProviderSession) => { providerCalls.push('check'); return s; },
    status: async (s: ProviderSession) => { providerCalls.push('status'); return behavior.status(s.userId); },
    preflight: async (s: ProviderSession) => { providerCalls.push('preflight'); return behavior.preflight(s.userId); },
    submit: async (s: ProviderSession) => { providerCalls.push('submit'); return behavior.submit(s.userId); },
    upload: async (s: ProviderSession) => { providerCalls.push('upload'); return behavior.upload(s.userId); },
  },
}));
const { createJob, runJob, replaceQrAndResume, provideFaceAndResume, retryAttempt } = await import('./jobs');

const activity: Activity = { id: 'act', courseId: 'course', classId: 'class', source: 'course', title: '测试签到', kind: 'click', startTime: null, endTime: null, signed: null, ext: '{}' };
const session = (id: string): ProviderSession => ({ identifier: id, encryptedPassword: 'encrypted', cookies: [], userId: id, fid: '0', name: id, deviceCode: id });
function store() {
  let data: VaultData = emptyVault();
  data.accounts = ['a', 'b'].map(id => ({ id, label: id, role: id === 'a' ? 'primary' as const : 'delegate' as const, session: session(id), authorizedAt: '', state: 'VALID' }));
  return { get: () => data, update: async (change: (value: VaultData) => void) => { const next = structuredClone(data); change(next); data = next; } };
}
beforeEach(() => { counter = 0; clearedPhotos.length = 0; providerCalls.length = 0; behavior.submit = async () => ({ state: 'READY' }); behavior.status = async () => ({ state: 'READY' }); behavior.preflight = async () => ({ state: 'READY' }); behavior.upload = async () => ({ mediaId: 'image' }); });

test('六种测试签到只生成本机结果，不调用学习通接口', async () => {
  const state = store();
  const inputs: SignInput[] = [
    { kind: 'click' },
    { kind: 'location', latitude: 34.8, longitude: 113.6, address: '测试位置' },
    { kind: 'photo', mediaIdByAccount: {} },
    { kind: 'qr', qrPayload: 'daodian://demo/qr-check-in', scannedAt: new Date().toISOString() },
    { kind: 'code', code: '1234' },
    { kind: 'gesture', sequence: '1234' },
  ];
  for (const [index, activity] of demoActivities().entries()) {
    const job = await createJob(state, activity, ['a', 'b'], inputs[index], index === 2 ? 'file:///cache/demo-photo.jpg' : undefined);
    await runJob(state, job.id);
  }
  expect(providerCalls).toEqual([]);
  expect(state.get().attempts).toHaveLength(12);
  expect(state.get().attempts.every(attempt => attempt.state === 'SUCCESS' && attempt.message?.includes('没有签到记录'))).toBe(true);
  expect(state.get().jobs.every(job => job.state === 'DONE')).toBe(true);
  expect(state.get().activityCache).toEqual([]);
  expect(clearedPhotos).toEqual(['file:///cache/demo-photo.jpg']);
});

test('一个账号失败不丢失另一个账号的结果', async () => {
  const state = store(); const submitted = new Set<string>();
  behavior.submit = async id => { if (id === 'a') throw new FakeClientError('UNKNOWN', '失败'); submitted.add(id); return { state: 'READY' }; };
  behavior.status = async id => ({ state: submitted.has(id) ? 'SIGNED' : 'READY' });
  const job = await createJob(state, activity, ['a', 'b'], { kind: 'click' }); await runJob(state, job.id);
  expect(state.get().attempts.map(a => a.state)).toEqual(['FAILED', 'SUCCESS']);
  expect(state.get().jobs[0].state).toBe('DONE');
});

test('动态码过期后只继续未完成账号', async () => {
  const state = store(); const calls: string[] = []; let fresh = false; const signed = new Set<string>();
  behavior.submit = async id => { calls.push(id); if (id === 'b' && !fresh) throw new FakeClientError('QR_EXPIRED', '二维码过期'); signed.add(id); return { state: 'READY' }; };
  behavior.status = async id => ({ state: signed.has(id) ? 'SIGNED' : 'READY' });
  const job = await createJob(state, { ...activity, kind: 'qr' }, ['a', 'b'], { kind: 'qr', qrPayload: 'old', scannedAt: new Date().toISOString() });
  await runJob(state, job.id); expect(state.get().attempts.map(a => a.state)).toEqual(['SUCCESS', 'WAITING_QR']);
  fresh = true; await replaceQrAndResume(state, job.id, 'new', new Date().toISOString());
  expect(calls).toEqual(['a', 'b', 'b']); expect(state.get().attempts.map(a => a.state)).toEqual(['SUCCESS', 'SUCCESS']);
});

test('过期扫描时间不会改变等待中的二维码任务', async () => {
  const state = store();
  const job = await createJob(state, { ...activity, kind: 'qr' }, ['a'], { kind: 'qr', qrPayload: 'old', scannedAt: new Date().toISOString() });
  await state.update(data => { data.attempts[0].state = 'WAITING_QR'; data.jobs[0].state = 'WAITING'; });
  await expect(replaceQrAndResume(state, job.id, 'late', new Date(Date.now() - 180_000).toISOString())).rejects.toThrow('过期');
  expect(state.get().jobs[0].input).toEqual(job.input);
  expect(state.get().attempts[0].state).toBe('WAITING_QR');
});

test('提交超时先查询远端状态，不重复提交', async () => {
  const state = store(); let submits = 0; let checks = 0;
  behavior.submit = async () => { submits++; throw new FakeClientError('NETWORK_TIMEOUT', '超时', true); };
  behavior.status = async () => ({ state: ++checks >= 2 ? 'SIGNED' : 'READY' });
  const job = await createJob(state, activity, ['a'], { kind: 'click' }); await runJob(state, job.id);
  expect(submits).toBe(1); expect(state.get().attempts[0].state).toBe('SUCCESS');
});
test('第三方已确认的新提交记为成功', async () => {
  const state = store(); let signed = false;
  behavior.submit = async () => { signed = true; return { state: 'SIGNED', submitted: true }; };
  behavior.status = async () => ({ state: signed ? 'SIGNED' : 'READY' });
  const job = await createJob(state, activity, ['a'], { kind: 'click' }); await runJob(state, job.id);
  expect(state.get().attempts[0].state).toBe('SUCCESS');
});
test('人脸等待状态在提供该账号照片后继续', async () => {
  const state = store(); let signed = false;
  behavior.preflight = async () => ({ state: 'WAITING_FACE' });
  behavior.submit = async () => { signed = true; return { state: 'SIGNED', submitted: true }; };
  behavior.status = async () => ({ state: signed ? 'SIGNED' : 'READY' });
  const job = await createJob(state, activity, ['a'], { kind: 'click' }); await runJob(state, job.id);
  expect(state.get().attempts[0].state).toBe('WAITING_FACE');
  await provideFaceAndResume(state, job.id, 'a', 'image-a');
  expect(state.get().attempts[0].state).toBe('SUCCESS');
});
test('一个账号等待人脸时其余账号仍执行', async () => {
  const state = store(); const signed = new Set<string>(); const checked: string[] = [];
  behavior.preflight = async id => { checked.push(id); return { state: 'WAITING_FACE' }; };
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
