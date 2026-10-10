import type { Activity } from '@sign/shared';
import { activityPhase } from './activity-phase';

export function courseAttendanceGroups(cache: Activity[], accountId: string, courseId: string, classId: string) {
  const activities = cache.filter(activity => activity.cacheAccountId === accountId && activity.courseId === courseId && activity.classId === classId);
  return {
    unsigned: activities.filter(activity => activity.signed === false),
    signed: activities.filter(activity => activity.signed === true),
    unknown: activities.filter(activity => activity.signed == null),
  };
}

export function attendanceRow(activity: Activity) {
  const label = activity.signed === true ? '已签到' : activity.signed === false ? '未签到' : '待核查';
  const phase = activityPhase(activity) === 'ended' ? '已结束' : '进行中';
  return { detail: `${label} · ${phase}`, symbol: activity.signed === true ? '✓' : activity.signed === false ? '–' : '?' };
}
