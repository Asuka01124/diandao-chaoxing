import type { Activity } from '@sign/shared';

export const DEMO_COURSE_ID = '_daodian_demo_course_';

export function isDemoCourse(courseId: string): boolean {
  return courseId === DEMO_COURSE_ID;
}

export function isDemoActivity(activity: Pick<Activity, 'courseId'>): boolean {
  return isDemoCourse(activity.courseId);
}

// 旧测试版演练课程 ID，仅用于升级时隐藏本机旧记录。
export const PRACTICE_COURSE_ID = '_daodian_practice_course_';

export function isPracticeCourse(courseId: string): boolean {
  return courseId === PRACTICE_COURSE_ID;
}