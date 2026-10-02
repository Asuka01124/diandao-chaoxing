import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { prepareErrorMessage } from './prepare-error';

describe('签到准备错误', () => {
  test('无效手势显示可操作的中文提示', () => {
    const result = z.object({ sequence: z.string().regex(/^[1-9]{4,9}$/) }).safeParse({ sequence: '' });
    if (result.success) throw new Error('测试输入应当无效');
    expect(prepareErrorMessage(result.error, 'gesture')).toBe('请按顺序选择至少 4 个不同的圆点。');
  });

  test('原始 JSON 错误不会直接出现在界面', () => {
    expect(prepareErrorMessage(new Error('[{"code":"invalid_format"}]'), 'code')).toBe('请输入 4 至 12 位数字签到码。');
  });
});
