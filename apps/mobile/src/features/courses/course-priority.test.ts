import { expect, test } from 'bun:test';
import type { Activity, Course } from '@sign/shared';
import { prioritizeOngoingCourses } from './course-priority';

const courses: Course[] = [
  { id: '1', classId: 'a', name: '第一门' },
  { id: '2', classId: 'b', name: '第二门' },
  { id: '3', classId: 'c', name: '第三门' },
  { id: '4', classId: 'd', name: '第四门' },
];
const activity = (course: Course, overrides: Partial<Activity> = {}): Activity => ({
  id: course.id, courseId: course.id, classId: course.classId, source: 'course', title: '签到', kind: 'click',
  startTime: 100, endTime: null, status: 1, signed: false, ext: '{}', cacheAccountId: 'me', cachedAt: 1000,
  ...overrides,
});

test('进行中的课程置顶，其余课程与置顶课程各自保留原顺序', () => {
  const result = prioritizeOngoingCourses(courses, [activity(courses[2]), activity(courses[0])], 'me', 2000);
  expect(result.map(course => course.id)).toEqual(['1', '3', '2', '4']);
});

test('忽略其他账号、已结束和过期缓存', () => {
  const result = prioritizeOngoingCourses(courses, [
    activity(courses[1], { cacheAccountId: 'other' }),
    activity(courses[2], { endTime: 1500 }),
    activity(courses[3], { cachedAt: -400_000 }),
  ], 'me', 2000);
  expect(result.map(course => course.id)).toEqual(['1', '2', '3', '4']);
});
