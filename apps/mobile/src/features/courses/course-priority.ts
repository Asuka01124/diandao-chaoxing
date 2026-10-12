import type { Activity, Course } from '@sign/shared';
import { activityPhase } from './activity-phase';

export function courseKey(course: Pick<Course, 'id' | 'classId'>): string {
  return `${course.id}:${course.classId}`;
}

export function ongoingCourseKeys(activities: Activity[], accountId: string, now = Date.now()): Set<string> {
  return new Set(activities.filter(activity => isOngoingCachedActivity(activity, accountId, now))
    .map(activity => courseKey({ id: activity.courseId, classId: activity.classId })));
}

export function prioritizeOngoingCourses(courses: Course[], activities: Activity[], accountId: string, now = Date.now()): Course[] {
  const active = ongoingCourseKeys(activities, accountId, now);
  return [...courses.filter(course => active.has(courseKey(course))), ...courses.filter(course => !active.has(courseKey(course)))];
}

function isOngoingCachedActivity(activity: Activity, accountId: string, now: number): boolean {
  return activity.cacheAccountId === accountId && activity.cachedAt != null &&
    now - activity.cachedAt < 5 * 60_000 && activityPhase(activity, now) === 'ongoing';
}

export type OngoingCourseActivity = { course: Course; activity: Activity };

export function ongoingCourseActivities(courses: Course[], activities: Activity[], accountId: string, now = Date.now()): OngoingCourseActivity[] {
  const byCourse = new Map<string, Activity[]>();
  for (const activity of activities) {
    if (!isOngoingCachedActivity(activity, accountId, now)) continue;
    const key = courseKey({ id: activity.courseId, classId: activity.classId });
    const items = byCourse.get(key) ?? [];
    items.push(activity);
    byCourse.set(key, items);
  }
  return courses.flatMap(course => (byCourse.get(courseKey(course)) ?? []).map(activity => ({ course, activity })));
}
