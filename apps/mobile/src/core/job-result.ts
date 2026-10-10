import type { Attempt, Job } from '@sign/shared';

export function jobResult(job: Pick<Job, 'state' | 'accountIds'>, attempts: Pick<Attempt, 'accountId' | 'state'>[]) {
  const rows = job.accountIds.map(id => attempts.find(attempt => attempt.accountId === id));
  const signed = rows.filter(row => row?.state === 'SUCCESS' || row?.state === 'ALREADY_SIGNED').length;
  const failed = rows.filter(row => row?.state === 'FAILED' || row?.state === 'REAUTH_REQUIRED').length;
  const expired = rows.filter(row => row?.state === 'EXPIRED').length;
  const success = job.state === 'DONE' && rows.length > 0 && signed === rows.length;
  const needsAttention = job.state === 'WAITING' || (job.state === 'DONE' && !success && (rows.length === 0 || expired !== rows.length));
  if (job.state === 'RUNNING') return { title: '正在逐账号执行', label: '执行中', detail: '下方显示每个账号的实际结果。', success, needsAttention };
  if (job.state === 'WAITING') return { title: '等待你的输入', label: '等待输入', detail: '完成下方账号所需的验证后，可以继续核查。', success, needsAttention };
  const title = success ? '全部账号已签到' : failed ? signed ? '部分账号签到失败' : '签到未完成'
    : expired === rows.length && rows.length > 0 ? '签到已结束' : '执行已结束';
  return { title, label: success ? '已签到' : failed ? '存在失败' : expired ? '已结束' : '待核查',
    detail: `已签到 ${signed} 个账号，失败 ${failed} 个，已结束 ${expired} 个。${failed ? '失败的账号可以单独核查和重试。' : ''}`, success, needsAttention };
}
