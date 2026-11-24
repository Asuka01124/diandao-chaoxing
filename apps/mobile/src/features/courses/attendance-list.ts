import type { Activity } from '@sign/shared';
import { activityPhaseLabel } from './activity-phase';

export function courseAttendanceGroups(cache: Activity[], accountId: string, courseId: string, classId: string) {
  const activities = cache.filter(activity => activity.cacheAccountId === accountId && activity.courseId === courseId && activity.classId === classId);
  return {
    unsigned: activities.filter(activity => activity.signed === false),
    signed: activities.filter(activity => activity.signed === true),
    unknown: activities.filter(activity => activity.signed == null),
  };
}

export function attendanceRow(activity: Activity) {
  return { detail: activityPhaseLabel(activity), symbol: activity.signed === true ? '✓' : activity.signed === false ? '–' : '?' };
}
