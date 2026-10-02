import { expect, test } from 'bun:test';
import { cleanPhotoName, photoName } from './photo-name';

test('旧版预留照片没有名称时仍显示可识别的默认名称', () => {
  expect(photoName({ id: 'old', createdAt: '2026-10-02T00:00:00.000Z' }, 2)).toBe('预留照片 3');
  expect(photoName({ id: 'new', createdAt: '2026-10-02T00:00:00.000Z', name: '东门' }, 0)).toBe('东门');
});

test('自定义名称去除首尾空格并拒绝空名称', () => {
  expect(cleanPhotoName('  教学楼门口  ')).toBe('教学楼门口');
  expect(() => cleanPhotoName('  ')).toThrow('请输入照片名称');
});
