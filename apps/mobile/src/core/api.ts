import type { Activity, ApiError, ProviderSession, SignInput, SignStatus, Course, ChatGroup } from '@sign/shared';
import * as provider from '@sign/provider-adapter';
import { groups as fetchGroups, groupActivities as fetchGroupActivities } from '@sign/provider-adapter/groups';

let baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
export function setApiBaseUrl(value?: string): void {
  baseUrl = (value || process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
}
export function getApiBaseUrl(): string { return baseUrl; }
export async function testApiConnection(url = baseUrl): Promise<boolean> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new ClientError('INVALID_INPUT', '请输入 HTTPS 服务地址');
  try {
    const response = await fetch(`${parsed.toString().replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    return response.ok && data?.ok === true;
  } catch { return false; }
}
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
async function call<T>(path: string, body: object): Promise<T> {
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new ClientError('INVALID_INPUT', '请在设置中配置 HTTPS API 地址');
  let response: Response;
  try { response = await fetch(`${baseUrl}/v1/provider/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) }); }
  catch { throw new ClientError('NETWORK_TIMEOUT', 'API 请求超时或连接失败', true); }
  const data = await response.json();
  if (!response.ok) { const error = data as ApiError; throw new ClientError(error.code, error.message, error.retryable); }
  return data as T;
}
export const api = {
  login: (identifier: string, password: string, deviceCode: string) => baseUrl ? call<ProviderSession>('login', { identifier, password, deviceCode }) : direct(() => provider.login(identifier, password, deviceCode)),
  check: (session: ProviderSession) => baseUrl ? call<ProviderSession>('session/check', { session }) : direct(() => provider.checkSession(session)),
  courses: (session: ProviderSession) => baseUrl ? call<Course[]>('courses', { session }) : direct(() => provider.courses(session)),
  activities: (session: ProviderSession, courseId: string, classId: string) => baseUrl ? call<Activity[]>('activities', { session, courseId, classId }) : direct(() => provider.activities(session, courseId, classId)),
  groups: (session: ProviderSession) => baseUrl ? call<ChatGroup[]>('groups', { session }) : direct(() => fetchGroups(session)),
  groupActivities: (session: ProviderSession, groupId: string) => baseUrl ? call<Activity[]>('group-activities', { session, groupId }) : direct(() => fetchGroupActivities(session, groupId)),
  detail: (session: ProviderSession, activity: Activity) => baseUrl ? call<Activity>('activity-detail', { session, activity }) : direct(() => provider.activityDetail(session, activity)),
  preflight: (session: ProviderSession, activity: Activity) => baseUrl ? call<SignStatus>('sign/preflight', { session, activity }) : direct(() => provider.preflight(session, activity)),
  submit: (session: ProviderSession, activity: Activity, input: SignInput, faceMediaId?: string) => baseUrl ? call<SignStatus>('sign/submit', { session, activity, input, faceMediaId }) : direct(() => provider.submit(session, activity, input, undefined, faceMediaId)),
  status: (session: ProviderSession, activity: Activity) => baseUrl ? call<SignStatus>('sign/status', { session, activity }) : direct(() => provider.signStatus(session, activity)),
  upload: (session: ProviderSession, jpegBase64: string) => baseUrl ? call<{ mediaId: string }>('media', { session, jpegBase64 }) : direct(() => provider.uploadPhoto(session, jpegBase64)),
};
