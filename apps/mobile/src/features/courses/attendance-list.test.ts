import { expect, test } from 'bun:test';
import type { Activity } from '@sign/shared';
import { attendanceRow, courseAttendanceGroups } from './attendance-list';

const activity = (id: string, signed: boolean | null, extra: Partial<Activity> = {}): Activity => ({
  id, signed, courseId: 'course', classId: 'class', cacheAccountId: 'me', source: 'course', title: id,
  kind: 'click', startTime: null, endTime: null, status: 1, ext: '{}', ...extra,
});

test('按个人签到结果分组，已结束的未签到活动仍归入未签到', () => {
  const groups = courseAttendanceGroups([
    activity('fifth', false, { status: 2 }), activity('fourth', true, { status: 2 }), activity('third', null),
    activity('other-account', true, { cacheAccountId: 'other' }), activity('other-class', false, { classId: 'other' }),
    activity('other-course', false, { courseId: 'other' }),
  ], 'me', 'course', 'class');
  expect(groups.unsigned.map(item => item.id)).toEqual(['fifth']);
  expect(groups.signed.map(item => item.id)).toEqual(['fourth']);
  expect(groups.unknown.map(item => item.id)).toEqual(['third']);
});

test('未签到和未知状态没有成功勾号，签到结果与活动时间分开展示', () => {
  expect(attendanceRow(activity('fifth', false, { status: 2 }))).toEqual({ detail: '未签到 · 已结束', symbol: '–' });
  expect(attendanceRow(activity('fourth', true))).toEqual({ detail: '已签到 · 进行中', symbol: '✓' });
  expect(attendanceRow(activity('third', null))).toEqual({ detail: '待核查 · 进行中', symbol: '?' });
});
