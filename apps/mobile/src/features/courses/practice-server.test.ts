import { beforeEach, expect, mock, test } from 'bun:test';
import type { Activity, ProviderSession } from '@sign/shared';
import { PRACTICE_CLASS_ID, PRACTICE_COURSE_ID, PRACTICE_FACE_ACTIVITY_ID, PRACTICE_QR_FACE_ACTIVITY_ID } from './demo-course';

// 用测试设备模拟 clientId 解码：客户端签名与演练服务端校验走同一份设备密钥。
const testDevice = { cid: 'practice-cid', sc: 'practice-sc' };
mock.module('../../../../../packages/provider-adapter/src/device', () => ({
  DEVICE_INFO_PUBLIC_KEY: 'test-key',
  parseDeviceInfoPublicKey: () => ({ modulus: 0n, exponent: 0n }),
  buildDeviceInfo: () => ({}),
  encryptDeviceInfo: () => '',
  decodeClientIdWithKey: () => undefined,
  decodeClientId: (clientId: string) => clientId === 'practice-client-id' ? testDevice : undefined,
}));
const provider = await import('@sign/provider-adapter');
const { createPracticeTransport, practiceQrPayload, resetPracticeServer, verifyFaceResult } = await import('./practice-server');
const { buildFaceResultWithDevice } = await import('../../../../../packages/provider-adapter/src/face');

const jpeg = '/9j/2Q==';
const session = (clientId?: string): ProviderSession => ({
  identifier: 'practice-user', encryptedPassword: 'encrypted', cookies: [],
  userId: 'u1', fid: '0', name: '演练用户', deviceCode: 'practice-device', clientId,
});
const activity = (id: string, kind: Activity['kind']): Activity => ({
  id, courseId: PRACTICE_COURSE_ID, classId: PRACTICE_CLASS_ID, source: 'course',
  title: '演练签到', kind, startTime: null, endTime: null, signed: null, ext: '{}',
});
const faceActivity = activity(PRACTICE_FACE_ACTIVITY_ID, 'click');
const qrActivity = activity(PRACTICE_QR_FACE_ACTIVITY_ID, 'qr');
const qrInput = () => ({ kind: 'qr' as const, qrPayload: practiceQrPayload(PRACTICE_QR_FACE_ACTIVITY_ID), scannedAt: new Date().toISOString() });

beforeEach(() => resetPracticeServer());

test('演练会话检查与课程活动列表完全离线', async () => {
  const account = session('practice-client-id');
  const checked = await provider.checkSession(account, createPracticeTransport(account));
  expect(checked.userId).toBe('u1');
  expect(checked.clientId).toBe('practice-client-id');
  const list = await provider.activities(account, PRACTICE_COURSE_ID, PRACTICE_CLASS_ID, createPracticeTransport(account));
  expect(list.map(item => item.id)).toEqual([PRACTICE_FACE_ACTIVITY_ID, PRACTICE_QR_FACE_ACTIVITY_ID]);
  expect(list.every(item => item.signed === false)).toBe(true);
  const detail = await provider.activityDetail(account, list[0], createPracticeTransport(account));
  expect(detail.requirements?.face).toBe(true);
});

test('人脸签到全流程：等待人脸 → 上传照片 → 签名校验 → 签到成功', async () => {
  const account = session('practice-client-id');
  const transport = createPracticeTransport(account);
  const waiting = await provider.submit(account, faceActivity, { kind: 'click' }, transport);
  expect(waiting.state).toBe('WAITING_FACE');
  const { mediaId } = await provider.uploadPhoto(account, jpeg, transport);
  let seenFaceResult: Record<string, unknown> | undefined;
  const recording: typeof transport = async (url, init) => {
    const target = new URL(url);
    if (target.pathname === '/pptSign/check-face-result') seenFaceResult = JSON.parse(target.searchParams.get('faceResult')!);
    return transport(url, init);
  };
  const result = await provider.submit(account, faceActivity, { kind: 'click' }, recording, mediaId);
  expect(result).toEqual({ state: 'SIGNED', submitted: true });
  expect(seenFaceResult?.currentFaceId).toBe(mediaId);
  expect(seenFaceResult?.LiveDetectionStatus).toBe(1);
  expect(seenFaceResult?.cxcid).toBe(testDevice.cid);
  expect(typeof seenFaceResult?.signToken).toBe('string');
  const again = await provider.submit(account, faceActivity, { kind: 'click' }, transport, mediaId);
  expect(again.state).toBe('SIGNED');
  expect(again.submitted).toBeUndefined();
  expect((await provider.signStatus(account, faceActivity, transport)).state).toBe('SIGNED');
});

test('二维码 + 人脸全流程：演练二维码 → 等待人脸 → 签到成功', async () => {
  const account = session('practice-client-id');
  const transport = createPracticeTransport(account);
  const waiting = await provider.submit(account, qrActivity, qrInput(), transport);
  expect(waiting.state).toBe('WAITING_FACE');
  const { mediaId } = await provider.uploadPhoto(account, jpeg, transport);
  const result = await provider.submit(account, qrActivity, qrInput(), transport, mediaId);
  expect(result).toEqual({ state: 'SIGNED', submitted: true });
});

test('二维码与活动不匹配或 enc 错误时拒绝', async () => {
  const account = session('practice-client-id');
  const transport = createPracticeTransport(account);
  const { mediaId } = await provider.uploadPhoto(account, jpeg, transport);
  const wrongEnc = { kind: 'qr' as const, qrPayload: `https://mobilelearn.chaoxing.com/x?aid=${PRACTICE_QR_FACE_ACTIVITY_ID}&enc=wrong`, scannedAt: new Date().toISOString() };
  await expect(provider.submit(account, qrActivity, wrongEnc, transport, mediaId)).rejects.toMatchObject({ code: 'QR_EXPIRED' });
  const wrongActivity = { kind: 'qr' as const, qrPayload: practiceQrPayload(PRACTICE_FACE_ACTIVITY_ID), scannedAt: new Date().toISOString() };
  await expect(provider.submit(account, qrActivity, wrongActivity, transport, mediaId)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

test('会话缺少 clientId 时人脸校验被拒绝并给出可操作提示', async () => {
  const account = session();
  const transport = createPracticeTransport(account);
  const { mediaId } = await provider.uploadPhoto(account, jpeg, transport);
  await expect(provider.submit(account, faceActivity, { kind: 'click' }, transport, mediaId))
    .rejects.toMatchObject({ code: 'VALIDATION_FAILED', message: expect.stringContaining('重新登录') });
  expect((await provider.signStatus(account, faceActivity, transport)).state).toBe('READY');
});

test('signToken 被篡改时演练服务端拒绝', async () => {
  const account = session('practice-client-id');
  const base = createPracticeTransport(account);
  const tampered: typeof base = async (url, init) => {
    const target = new URL(url);
    if (target.pathname === '/pptSign/check-face-result') {
      const faceResult = JSON.parse(target.searchParams.get('faceResult')!);
      faceResult.signToken = '0'.repeat(32);
      target.searchParams.set('faceResult', JSON.stringify(faceResult));
      return base(target.toString(), init);
    }
    return base(url, init);
  };
  const { mediaId } = await provider.uploadPhoto(account, jpeg, base);
  await expect(provider.submit(account, faceActivity, { kind: 'click' }, tampered, mediaId))
    .rejects.toMatchObject({ code: 'VALIDATION_FAILED', message: '人脸校验签名无效' });
});

test('verifyFaceResult 逐项校验人脸材料', async () => {
  const account = session('practice-client-id');
  const { mediaId } = await provider.uploadPhoto(account, jpeg, createPracticeTransport(account));
  const valid = () => JSON.parse(buildFaceResultWithDevice(mediaId, testDevice));
  expect(verifyFaceResult(valid(), undefined)).toContain('clientId');
  expect(verifyFaceResult(valid(), testDevice)).toBeNull();
  expect(verifyFaceResult({ ...valid(), LiveDetectionStatus: 0 }, testDevice)).toBe('活体验证参数缺失');
  expect(verifyFaceResult({ ...valid(), cxcid: 'other-cid' }, testDevice)).toBe('活体验证参数缺失');
  expect(verifyFaceResult({ ...valid(), signToken: undefined }, testDevice)).toBe('活体验证参数缺失');
  expect(verifyFaceResult({ ...valid(), currentFaceId: 'practice-photo-999' }, testDevice)).toContain('未上传');
});