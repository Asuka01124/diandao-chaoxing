import { expect, test } from 'bun:test';
import type { Activity } from '@sign/shared';
import { activityPhase } from './activity-phase';

const activity = (status: number | null, endTime: number | null): Activity => ({
  id: 'a', courseId: 'c', classId: 'x', source: 'course', title: '签到', kind: 'click',
  startTime: 100, endTime, status, signed: false, ext: '{}',
});

test('课程签到按远端状态和结束时间分组', () => {
  expect(activityPhase(activity(1, null), 1000)).toBe('ongoing');
  expect(activityPhase(activity(1, 2000), 1000)).toBe('ongoing');
  expect(activityPhase(activity(1, 500), 1000)).toBe('ended');
  expect(activityPhase(activity(2, null), 1000)).toBe('ended');
});
