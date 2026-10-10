import { expect, test } from 'bun:test';
import { jobResult } from './job-result';

test('执行结束但全部失败时显示签到未完成，不能统计成已签到', () => {
  const result = jobResult({ state: 'DONE', accountIds: ['a'] }, [{ accountId: 'a', state: 'FAILED' }]);
  expect(result).toMatchObject({ title: '签到未完成', label: '存在失败', success: false, needsAttention: true });
});
test('部分失败、全部成功和已截止有独立的结果文案', () => {
  const job = { state: 'DONE' as const, accountIds: ['a', 'b'] };
  expect(jobResult(job, [{ accountId: 'a', state: 'SUCCESS' }, { accountId: 'b', state: 'FAILED' }]).title).toBe('部分账号签到失败');
  expect(jobResult(job, [{ accountId: 'a', state: 'SUCCESS' }, { accountId: 'b', state: 'ALREADY_SIGNED' }]).success).toBe(true);
  expect(jobResult(job, [{ accountId: 'a', state: 'EXPIRED' }, { accountId: 'b', state: 'EXPIRED' }])).toMatchObject({ title: '签到已结束', success: false, needsAttention: false });
});
test('等待输入或缺少账号结果时不能报告全部已签到', () => {
  expect(jobResult({ state: 'WAITING', accountIds: ['a'] }, [{ accountId: 'a', state: 'WAITING_FACE' }]).title).toBe('等待你的输入');
  expect(jobResult({ state: 'DONE', accountIds: ['a', 'b'] }, [{ accountId: 'a', state: 'SUCCESS' }]).success).toBe(false);
});
