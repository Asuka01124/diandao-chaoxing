import type { Activity, Course, ProviderSession, SignInput, SignStatus } from '@sign/shared';
import * as provider from '@sign/provider-adapter';
import { isDemoActivity, isDemoCourse } from '../features/courses/demo-course';

export class ClientError extends Error {
  constructor(public code: string, message: string, public retryable = false) { super(message); }
}

async function direct<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof provider.ProviderError) throw new ClientError(error.code, error.message, error.retryable);
    throw new ClientError('UNKNOWN', '学习通请求失败，请稍后重试', true);
  }
}

export const api = {
  login: (identifier: string, password: string, deviceCode: string) => direct(() => provider.login(identifier, password, deviceCode)),
  check: (session: ProviderSession) => direct(() => provider.checkSession(session)),
  courses: (session: ProviderSession) => direct<Course[]>(() => provider.courses(session)),
  courseCover: (session: ProviderSession, imageUrl: string) => direct(() => provider.courseCover(session, imageUrl)),
  activities: (session: ProviderSession, courseId: string, classId: string) => isDemoCourse(courseId)
    ? Promise.reject(new ClientError('INVALID_INPUT', '本机测试课程不读取学习通活动'))
    : direct(() => provider.activities(session, courseId, classId)),
  detail: (session: ProviderSession, activity: Activity) => isDemoActivity(activity)
    ? Promise.reject(new ClientError('INVALID_INPUT', '本机测试活动不读取学习通详情'))
    : direct(() => provider.activityDetail(session, activity)),
  preflight: (session: ProviderSession, activity: Activity) => isDemoActivity(activity)
    ? Promise.reject(new ClientError('INVALID_INPUT', '本机测试活动不请求学习通签到'))
    : direct<SignStatus>(() => provider.preflight(session, activity)),
  submit: (session: ProviderSession, activity: Activity, input: SignInput, faceMediaId?: string) => isDemoActivity(activity)
    ? Promise.reject(new ClientError('INVALID_INPUT', '本机测试活动不可提交到学习通'))
    : direct<SignStatus>(() => provider.submit(session, activity, input, undefined, faceMediaId)),
  status: (session: ProviderSession, activity: Activity) => isDemoActivity(activity)
    ? Promise.reject(new ClientError('INVALID_INPUT', '本机测试活动没有学习通签到状态'))
    : direct<SignStatus>(() => provider.signStatus(session, activity)),
  upload: (session: ProviderSession, jpegBase64: string) => direct(() => provider.uploadPhoto(session, jpegBase64)),
};
