import { expect, test } from 'bun:test';
import type { Activity, Course } from '@sign/shared';
import { ongoingCourseActivities, prioritizeOngoingCourses } from './course-priority';

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

test('独立签到组件按课程顺序显示每个进行中的活动，支持同课多个活动', () => {
  const cached = [activity(courses[2], { id: 'first' }), activity(courses[0], { id: 'second' }), activity(courses[2], { id: 'third' })];
  const result = ongoingCourseActivities(courses, cached, 'me', 2000);
  expect(result.map(item => [item.course.id, item.activity.id])).toEqual([['1', 'second'], ['3', 'first'], ['3', 'third']]);
  expect(courses.map(course => course.id)).toEqual(['1', '2', '3', '4']);
});

test('没有当前账号的新鲜进行中签到时返回空列表，忽略已结束、其他班级和不存在的课程', () => {
  const cached = [
    activity(courses[0], { cacheAccountId: 'other' }),
    activity(courses[0], { status: 2 }),
    activity(courses[1], { endTime: 2000 }),
    activity(courses[1], { cachedAt: undefined }),
    activity(courses[2], { cachedAt: -298_000 }),
    activity(courses[3], { classId: 'other-class' }),
    activity({ id: 'removed', classId: 'a', name: '已移除课程' }),
  ];
  expect(ongoingCourseActivities(courses, cached, 'me', 2000)).toEqual([]);
  expect(ongoingCourseActivities(courses, [], 'me', 2000)).toEqual([]);
});

test('截止时间和五分钟缓存有效期到达后，独立组件不再显示该活动', () => {
  const ending = [activity(courses[0], { endTime: 2000 })];
  expect(ongoingCourseActivities(courses, ending, 'me', 1999)).toHaveLength(1);
  expect(ongoingCourseActivities(courses, ending, 'me', 2000)).toHaveLength(0);
  const fresh = [activity(courses[0])];
  expect(ongoingCourseActivities(courses, fresh, 'me', 300_999)).toHaveLength(1);
  expect(ongoingCourseActivities(courses, fresh, 'me', 301_000)).toHaveLength(0);
});
