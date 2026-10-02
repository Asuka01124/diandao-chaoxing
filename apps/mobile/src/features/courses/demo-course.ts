import type { Activity, Course } from '@sign/shared';

export const DEMO_COURSE_ID = '_daodian_demo_course_';
export const DEMO_CLASS_ID = '_daodian_demo_class_';
export const DEMO_QR_PAYLOAD = 'daodian://demo/qr-check-in';

export const demoCourse: Course = {
  id: DEMO_COURSE_ID,
  classId: DEMO_CLASS_ID,
  name: '签到测试课程',
  teacher: '本机演练 · 不会提交学习通',
};

export function isDemoCourse(courseId: string): boolean {
  return courseId === DEMO_COURSE_ID;
}

export function isDemoActivity(activity: Pick<Activity, 'courseId'>): boolean {
  return isDemoCourse(activity.courseId);
}

export function demoActivities(now = Date.now()): Activity[] {
  const base = { courseId: DEMO_COURSE_ID, classId: DEMO_CLASS_ID, source: 'course' as const,
    startTime: now - 60_000, endTime: null, status: 1, signed: false, ext: '{}', phase: 'sign-in' as const };
  return [
    { ...base, id: '_daodian_demo_click_', title: '普通签到 · 演练', kind: 'click' },
    { ...base, id: '_daodian_demo_location_', title: '位置签到 · 演练', kind: 'location',
      requirements: { captcha: false, face: false, location: true, photo: false } },
    { ...base, id: '_daodian_demo_photo_', title: '拍照签到 · 演练', kind: 'photo',
      requirements: { captcha: false, face: false, location: false, photo: true } },
    { ...base, id: '_daodian_demo_qr_', title: '二维码签到 · 演练', kind: 'qr' },
    { ...base, id: '_daodian_demo_code_', title: '签到码签到 · 演练', kind: 'code' },
    { ...base, id: '_daodian_demo_gesture_', title: '手势签到 · 演练', kind: 'gesture' },
  ];
}
