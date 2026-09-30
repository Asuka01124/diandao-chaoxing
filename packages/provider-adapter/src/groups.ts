import type { Activity, ChatGroup, ProviderSession } from '@sign/shared';
import { ProviderError, RequestSession } from './index';
import { decodeBase64 } from './base64';
import { decryptImPassword as decryptImPasswordRaw } from './crypto';

type Transport = (url: string, init: RequestInit) => Promise<Response>;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderError('PROVIDER_CHANGED', '群聊响应格式已变化');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') throw new ProviderError('PROVIDER_CHANGED', '群聊数据缺少标识');
  return String(value);
}
function decryptImPassword(hex: string): string {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new ProviderError('PROVIDER_CHANGED', '群聊凭据格式无效');
  try {
    return decryptImPasswordRaw(hex);
  } catch { throw new ProviderError('PROVIDER_CHANGED', '群聊凭据无法解密'); }
}
async function imAccess(session: ProviderSession, jar: RequestSession): Promise<{ token: string; username: string }> {
  if (!session.uid || !session.imEncryptedPassword) throw new ProviderError('UNSUPPORTED', '当前会话缺少群聊登录资料，请重新授权账号');
  const response = await jar.request('https://a1-vip6.easemob.com/cx-dev/cxstudy/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Easemob-SDK(Android) 4.9.0.1' },
    body: JSON.stringify({ grant_type: 'password', username: session.uid, password: decryptImPassword(session.imEncryptedPassword) }),
  });
  let result: Record<string, unknown>;
  try { result = object(await response.json()); } catch { throw new ProviderError('PROVIDER_CHANGED', '群聊令牌响应格式已变化'); }
  return { token: text(result.access_token), username: text(object(result.user).username) };
}
function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0, shift = 0;
  while (offset < bytes.length && shift < 56) {
    const byte = bytes[offset++]; value += (byte & 127) * 2 ** shift;
    if (!(byte & 128)) return [value, offset];
    shift += 7;
  }
  throw new ProviderError('PROVIDER_CHANGED', '群聊消息编码无效');
}
function fields(bytes: Uint8Array): Map<number, Uint8Array[]> {
  const result = new Map<number, Uint8Array[]>(); let offset = 0;
  while (offset < bytes.length) {
    const [tag, afterTag] = readVarint(bytes, offset); offset = afterTag;
    const field = Math.floor(tag / 8), wire = tag % 8;
    if (field < 1) throw new ProviderError('PROVIDER_CHANGED', '群聊消息字段无效');
    if (wire === 0) { [, offset] = readVarint(bytes, offset); continue; }
    if (wire === 1) { offset += 8; continue; }
    if (wire === 5) { offset += 4; continue; }
    if (wire !== 2) throw new ProviderError('PROVIDER_CHANGED', '群聊消息类型无效');
    const [length, start] = readVarint(bytes, offset); offset = start + length;
    if (offset > bytes.length) throw new ProviderError('PROVIDER_CHANGED', '群聊消息长度无效');
    const values = result.get(field) ?? []; values.push(bytes.subarray(start, offset)); result.set(field, values);
  }
  return result;
}
const decode = (bytes?: Uint8Array) => bytes ? new TextDecoder().decode(bytes) : undefined;
function kind(name: string): Activity['kind'] {
  return ({ '普通签到': 'click', '拍照签到': 'photo', '位置签到': 'location', '二维码签到': 'qr', '密码签到': 'code', '手势签到': 'gesture' } as Record<string, Activity['kind']>)[name] ?? 'unknown';
}
export function parseGroupMessage(base64: string, groupId: string): Activity | null {
  try {
    const meta = fields(decodeBase64(base64));
    const body = meta.get(6)?.[0]; if (!body) return null;
    const message = fields(body);
    for (const ext of message.get(5) ?? []) {
      const keyValue = fields(ext);
      if (decode(keyValue.get(1)?.[0]) !== 'attachment') continue;
      const attachment = object(JSON.parse(decode(keyValue.get(6)?.[0]) ?? ''));
      if (Number(attachment.attachmentType) !== 15) return null;
      const info = object(attachment.att_chat_course); const course = object(info.courseInfo);
      if (![2, 74].includes(Number(info.atype))) return null;
      const id = text(info.aid); if (id === '0') return null;
      return { id, groupId, source: 'group', courseId: text(course.courseid), classId: text(course.classid), title: text(info.title ?? '群聊签到'), kind: kind(text(info.atypeName ?? '')), startTime: null, endTime: null, signed: null, ext: '', cachedAt: Date.now() };
    }
    return null;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('PROVIDER_CHANGED', '群聊消息格式已变化');
  }
}
export async function groups(session: ProviderSession, transport?: Transport): Promise<ChatGroup[]> {
  const jar = new RequestSession(session, transport); const access = await imAccess(session, jar);
  const url = `https://a1-vip6.easemob.com/cx-dev/cxstudy/users/${encodeURIComponent(access.username)}/joined_chatgroups?detail=true&version=v3&pagenum=1&pagesize=200`;
  let result: Record<string, unknown>;
  try { result = object(await (await jar.request(url, { headers: { authorization: `Bearer ${access.token}`, 'user-agent': 'Easemob-SDK(Android) 4.9.0.1' } })).json()); }
  catch { throw new ProviderError('PROVIDER_CHANGED', '群聊列表格式已变化'); }
  if (!Array.isArray(result.data)) throw new ProviderError('PROVIDER_CHANGED', '群聊列表缺失');
  return result.data.map(raw => object(raw)).map(item => {
    let fallback = '';
    try { fallback = String(object(object(JSON.parse(text(item.description))).courseInfo).coursename ?? ''); } catch { /* 普通群聊可能没有课程信息 */ }
    return { id: text(item.id), name: typeof item.name === 'string' && item.name ? item.name : fallback || text(item.id) };
  });
}
export async function groupActivities(session: ProviderSession, groupId: string, transport?: Transport): Promise<Activity[]> {
  const jar = new RequestSession(session, transport); const access = await imAccess(session, jar);
  const url = `https://a1-vip6.easecdn.com/cx-dev/cxstudy/users/${encodeURIComponent(access.username)}/messageroaming`;
  const response = await jar.request(url, { method: 'POST', headers: { authorization: `Bearer ${access.token}`, 'user-agent': 'Easemob-SDK(Android) 4.9.0.1', 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ start: '-1', end: '-1', queue: `${groupId}@conference.easemob.com` }) });
  let result: Record<string, unknown>;
  try { result = object(await response.json()); } catch { throw new ProviderError('PROVIDER_CHANGED', '群聊消息响应格式已变化'); }
  const messages = object(result.data).msgs;
  if (!Array.isArray(messages)) throw new ProviderError('PROVIDER_CHANGED', '群聊消息列表缺失');
  const activities = messages.map(item => parseGroupMessage(text(object(item).msg), groupId)).filter((item): item is Activity => item !== null);
  return [...new Map(activities.map(item => [item.id, item])).values()];
}
