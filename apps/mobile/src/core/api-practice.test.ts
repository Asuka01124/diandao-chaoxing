// 文件名按字母序排在 jobs.test.ts 之前：bun 的模块 mock 会泄漏到后续文件，
// 本文件必须在 jobs.test.ts 注册 api mock 之前使用真实的 api/jobs。
import { beforeEach, expect, mock, test } from 'bun:test';
import { emptyVault, type Activity, type ProviderSession, type VaultData } from '@sign/shared';
import { DEMO_COURSE_ID, PRACTICE_CLASS_ID, PRACTICE_COURSE_ID, PRACTICE_FACE_ACTIVITY_ID, PRACTICE_QR_FACE_ACTIVITY_ID } from '../features/courses/demo-course';
import { practiceQrPayload, resetPracticeServer } from '../features/courses/practice-server';

const testDevice = { cid: 'practice-cid', sc: 'practice-sc' };
mock.module('../../../../packages/provider-adapter/src/device', () => ({
  DEVICE_INFO_PUBLIC_KEY: 'test-key',
  parseDeviceInfoPublicKey: () => ({ modulus: 0n, exponent: 0n }),
  buildDeviceInfo: () => ({}),
  encryptDeviceInfo: () => '',
  decodeClientIdWithKey: () => undefined,
  decodeClientId: (clientId: string) => clientId === 'practice-client-id' ? testDevice : undefined,
}));
let counter = 0;
mock.module('expo-crypto', () => ({ randomUUID: () => `practice-job-${++counter}` }));
const { api } = await import('./api');
const { createJob, runJob, provideFaceAndResume } = await import('./jobs');

const jpeg = '/9j/2Q==';
const session: ProviderSession = {
  identifier: 'practice-user', encryptedPassword: 'encrypted', cookies: [],
  userId: 'u1', fid: '0', name: '演练用户', deviceCode: 'practice-device', clientId: 'practice-client-id',
};
const activity = (id: string, kind: Activity['kind']): Activity => ({
  id, courseId: PRACTICE_COURSE_ID, classId: PRACTICE_CLASS_ID, source: 'course',
  title: '演练签到', kind, startTime: null, endTime: null, signed: null, ext: '{}',
});
function store() {
  let data: VaultData = emptyVault();
  data.accounts = [{ id: 'a', label: '演练账号', role: 'primary', session, authorizedAt: '', state: 'VALID' }];
  return { get: () => data, update: async (change: (value: VaultData) => void) => { const next = structuredClone(data); change(next); data = next; } };
}
beforeEach(() => { counter = 0; resetPracticeServer(); });

test('演练 api 路由全程离线：会话、活动、详情、上传、提交与状态', async () => {
  const checked = await api.check(session, true);
  expect(checked.userId).toBe('u1');
  expect(checked.clientId).toBe('practice-client-id');
  const list = await api.activities(session, PRACTICE_COURSE_ID, PRACTICE_CLASS_ID);
  expect(list.map(item => item.id)).toEqual([PRACTICE_FACE_ACTIVITY_ID, PRACTICE_QR_FACE_ACTIVITY_ID]);
  const detail = await api.detail(session, list[0]);
  expect(detail.requirements?.face).toBe(true);
  expect((await api.status(session, detail)).state).toBe('READY');
  const { mediaId } = await api.upload(session, jpeg, true);
  expect(mediaId).toContain('practice-photo');
  expect((await api.submit(session, detail, { kind: 'click' })).state).toBe('WAITING_FACE');
  const result = await api.submit(session, detail, { kind: 'click' }, mediaId);
  expect(result.state).toBe('SIGNED');
  expect(result.submitted).toBe(true);
  expect((await api.status(session, detail)).state).toBe('SIGNED');
});

test('旧演练活动仍被 api 拒绝，不进入演练服务', async () => {
  const legacy = { ...activity('_daodian_demo_click_', 'click'), courseId: DEMO_COURSE_ID };
  await expect(api.status(session, legacy)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(api.submit(session, legacy, { kind: 'click' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

test('演练人脸任务走真实提交链路：等待人脸 → 提供照片 → 成功', async () => {
  const state = store();
  const job = await createJob(state, activity(PRACTICE_FACE_ACTIVITY_ID, 'click'), ['a'], { kind: 'click' });
  await runJob(state, job.id);
  expect(state.get().attempts[0].state).toBe('WAITING_FACE');
  expect(state.get().attempts[0].count).toBe(0);
  const { mediaId } = await api.upload(session, jpeg, true);
  await provideFaceAndResume(state, job.id, 'a', mediaId);
  expect(state.get().attempts[0].state).toBe('SUCCESS');
  expect(state.get().attempts[0].count).toBe(1);
  expect(state.get().jobs[0].state).toBe('DONE');
});

test('演练二维码+人脸任务：演练二维码提交后等待人脸，提供照片后成功', async () => {
  const state = store();
  const job = await createJob(state, activity(PRACTICE_QR_FACE_ACTIVITY_ID, 'qr'), ['a'], {
    kind: 'qr', qrPayload: practiceQrPayload(PRACTICE_QR_FACE_ACTIVITY_ID), scannedAt: new Date().toISOString(),
  });
  await runJob(state, job.id);
  expect(state.get().attempts[0].state).toBe('WAITING_FACE');
  const { mediaId } = await api.upload(session, jpeg, true);
  await provideFaceAndResume(state, job.id, 'a', mediaId);
  expect(state.get().attempts[0].state).toBe('SUCCESS');
  expect(state.get().jobs[0].state).toBe('DONE');
});

test('演练会话缺少 clientId 时任务停在等待人脸并提示重新登录', async () => {
  const state = store();
  await state.update(data => { data.accounts[0].session = { ...session, clientId: undefined }; });
  const job = await createJob(state, activity(PRACTICE_FACE_ACTIVITY_ID, 'click'), ['a'], { kind: 'click' });
  await runJob(state, job.id);
  const { mediaId } = await api.upload(session, jpeg, true);
  await provideFaceAndResume(state, job.id, 'a', mediaId);
  const attempt = state.get().attempts[0];
  expect(attempt.state).toBe('WAITING_FACE');
  expect(attempt.message).toContain('重新登录');
});