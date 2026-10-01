import type { Activity, Course, ProviderSession, SignInput, SignStatus } from '@sign/shared';
import * as provider from '@sign/provider-adapter';

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
  activities: (session: ProviderSession, courseId: string, classId: string) => direct(() => provider.activities(session, courseId, classId)),
  detail: (session: ProviderSession, activity: Activity) => direct(() => provider.activityDetail(session, activity)),
  preflight: (session: ProviderSession, activity: Activity) => direct<SignStatus>(() => provider.preflight(session, activity)),
  submit: (session: ProviderSession, activity: Activity, input: SignInput, faceMediaId?: string) => direct<SignStatus>(() => provider.submit(session, activity, input, undefined, faceMediaId)),
  status: (session: ProviderSession, activity: Activity) => direct<SignStatus>(() => provider.signStatus(session, activity)),
  upload: (session: ProviderSession, jpegBase64: string) => direct(() => provider.uploadPhoto(session, jpegBase64)),
};
