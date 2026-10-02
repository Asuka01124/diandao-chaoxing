import type { Activity } from '@sign/shared';

export const DEMO_COURSE_ID = '_daodian_demo_course_';

export function isDemoCourse(courseId: string): boolean {
  return courseId === DEMO_COURSE_ID;
}

export function isDemoActivity(activity: Pick<Activity, 'courseId'>): boolean {
  return isDemoCourse(activity.courseId);
}
