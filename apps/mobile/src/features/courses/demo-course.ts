import type { Activity } from '@sign/shared';

export const DEMO_COURSE_ID = '_daodian_demo_course_';

export function isDemoCourse(courseId: string): boolean {
  return courseId === DEMO_COURSE_ID;
}

export function isDemoActivity(activity: Pick<Activity, 'courseId'>): boolean {
  return isDemoCourse(activity.courseId);
}

export const PRACTICE_COURSE_ID = '_daodian_practice_course_';
export const PRACTICE_CLASS_ID = '_daodian_practice_class_';

export function isPracticeCourse(courseId: string): boolean {
  return courseId === PRACTICE_COURSE_ID;
}

export function isPracticeActivity(activity: Pick<Activity, 'courseId'>): boolean {
  return isPracticeCourse(activity.courseId);
}

export const PRACTICE_FACE_ACTIVITY_ID = '_daodian_practice_face_';
export const PRACTICE_QR_FACE_ACTIVITY_ID = '_daodian_practice_qr_face_';

export const practiceActivities: Pick<Activity, 'id' | 'title' | 'kind'>[] = [
  { id: PRACTICE_FACE_ACTIVITY_ID, title: '人脸签到演练', kind: 'click' },
  { id: PRACTICE_QR_FACE_ACTIVITY_ID, title: '二维码 + 人脸演练', kind: 'qr' },
];
