import { describe, expect, test } from 'bun:test';
import { signInputSchema } from './index';

describe('六类签到输入', () => {
  test.each([
    { kind: 'click' },
    { kind: 'location', latitude: 31.2, longitude: 121.5, address: '教学楼' },
    { kind: 'photo', mediaIdByAccount: { a: 'object-1' } },
    { kind: 'qr', qrPayload: 'https://mobilelearn.chaoxing.com/x?aid=1&enc=e', scannedAt: '2026-09-30T00:00:00.000Z' },
    { kind: 'code', code: '123456' },
    { kind: 'gesture', sequence: '12369' },
  ])('接受有效输入 %o', value => { expect(signInputSchema.safeParse(value).success).toBe(true); });
  test.each([
    { kind: 'location', latitude: 91, longitude: 0, address: 'x' },
    { kind: 'photo', mediaIdByAccount: { a: '' } },
    { kind: 'qr', qrPayload: '', scannedAt: 'bad' },
    { kind: 'code', code: '12ab' },
    { kind: 'gesture', sequence: '1123' },
  ])('拒绝无效输入 %o', value => { expect(signInputSchema.safeParse(value).success).toBe(false); });
});
