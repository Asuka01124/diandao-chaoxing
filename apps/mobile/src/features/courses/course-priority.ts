import type { Activity, Course } from '@sign/shared';
import { activityPhase } from './activity-phase';

export function courseKey(course: Pick<Course, 'id' | 'classId'>): string {
  return `${course.id}:${course.classId}`;
}

export function ongoingCourseKeys(activities: Activity[], accountId: string, now = Date.now()): Set<string> {
  return new Set(activities.filter(activity =>
    activity.cacheAccountId === accountId &&
    activity.cachedAt != null && now - activity.cachedAt < 5 * 60_000 &&
    activityPhase(activity, now) === 'ongoing',
  ).map(activity => courseKey({ id: activity.courseId, classId: activity.classId })));
}

export function prioritizeOngoingCourses(courses: Course[], activities: Activity[], accountId: string, now = Date.now()): Course[] {
  const active = ongoingCourseKeys(activities, accountId, now);
  return [...courses.filter(course => active.has(courseKey(course))), ...courses.filter(course => !active.has(courseKey(course)))];
}
