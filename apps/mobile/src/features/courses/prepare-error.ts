import type { Activity } from '@sign/shared';
import { ZodError } from 'zod';

const inputHint: Partial<Record<Activity['kind'], string>> = {
  code: '请输入 4 至 12 位数字签到码。',
  gesture: '请按顺序选择至少 4 个不同的圆点。',
  location: '请先选择有效的签到位置。',
  photo: '请先选择一张签到照片。',
  qr: '请重新扫描当前活动的二维码。',
};

export function prepareErrorMessage(error: unknown, kind: Activity['kind']): string {
  if (error instanceof ZodError) return inputHint[kind] ?? '签到信息不完整，请检查后重试。';
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && !/^[\[{]/.test(message)) return message;
  }
  return inputHint[kind] ?? '准备签到失败，请检查输入后重试。';
}
