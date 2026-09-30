import { validateActivityInput, type Activity, type ApiErrorCode, type Course, type LocationInput, type ProviderSession, type SignInput, type SignStatus } from '@sign/shared';
import { decodeBase64 } from './base64';
import { encryptLoginValue } from './crypto';
import { getOperationSignal } from './deadline';
export { withProviderDeadline } from './deadline';

export class ProviderError extends Error {
  constructor(public code: ApiErrorCode, message: string, public retryable = false) { super(message); }
}

type Cookie = ProviderSession['cookies'][number];
type Transport = (url: string, init: RequestInit) => Promise<Response>;
const allowedHost = (host: string) => host === 'chaoxing.com' || host.endsWith('.chaoxing.com') || host === 'a1-vip6.easemob.com' || host === 'a1-vip6.easecdn.com';

export class RequestSession {
  private cookies: Cookie[];
  constructor(session?: ProviderSession, private transport: Transport = fetch) { this.cookies = [...(session?.cookies ?? [])]; }
  exportCookies(): Cookie[] { return this.cookies.map(c => ({ ...c })); }
  private cookieHeader(url: URL): string {
    return this.cookies.filter(c => (url.hostname === c.domain || url.hostname.endsWith(`.${c.domain}`)) && url.pathname.startsWith(c.path) && (!c.expires || c.expires > Date.now()))
      .map(c => `${c.name}=${c.value}`).join('; ');
  }
  private saveCookies(url: URL, response: Response): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    for (const line of headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : [])) {
      const [pair, ...parts] = line.split(';');
      const eq = pair.indexOf('='); if (eq < 1) continue;
      const attrs = parts.map(p => p.trim());
      const domain = (attrs.find(p => /^domain=/i.test(p))?.slice(7) ?? url.hostname).replace(/^\./, '').toLowerCase();
      if (!allowedHost(domain) || !(url.hostname === domain || url.hostname.endsWith(`.${domain}`))) continue;
      const path = attrs.find(p => /^path=/i.test(p))?.slice(5) || '/';
      const maxAge = attrs.find(p => /^max-age=/i.test(p));
      const expires = maxAge ? Date.now() + Number(maxAge.slice(8)) * 1000 : undefined;
      const cookie = { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain, path, expires };
      this.cookies = this.cookies.filter(c => !(c.name === cookie.name && c.domain === domain && c.path === path));
      if (!maxAge || Number(maxAge.slice(8)) > 0) this.cookies.push(cookie);
    }
  }
  async request(url: string, init: RequestInit = {}, redirects = 0): Promise<Response> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !allowedHost(parsed.hostname)) throw new ProviderError('INVALID_INPUT', '不允许访问该地址');
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader(parsed); if (cookie) headers.set('cookie', cookie);
    let response: Response;
    try {
      const signals = [AbortSignal.timeout(12000), getOperationSignal(), init.signal].filter((signal): signal is AbortSignal => Boolean(signal));
      response = await this.transport(url, { ...init, headers, credentials: 'omit', redirect: 'manual', signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) });
    } catch (error) {
      if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) throw new ProviderError('NETWORK_TIMEOUT', '第三方请求超时', true);
      throw new ProviderError('UNKNOWN', '第三方网络请求失败', true);
    }
    this.saveCookies(parsed, response);
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= 3) throw new ProviderError('PROVIDER_CHANGED', '第三方重定向次数异常');
      const location = response.headers.get('location');
      if (!location) throw new ProviderError('PROVIDER_CHANGED', '第三方重定向缺少地址');
      return this.request(new URL(location, parsed).toString(), { method: 'GET' }, redirects + 1);
    }
    if (!response.ok) throw new ProviderError(response.status === 429 ? 'RATE_LIMITED' : 'UNKNOWN', `第三方 HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    return response;
  }
}

function asObject(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ProviderError('PROVIDER_CHANGED', '第三方响应格式已变化');
  return data as Record<string, unknown>;
}
function asArray(data: unknown): unknown[] {
  if (!Array.isArray(data)) throw new ProviderError('PROVIDER_CHANGED', '第三方列表格式已变化');
  return data;
}
async function json(response: Response): Promise<Record<string, unknown>> {
  try { return asObject(await response.json()); } catch { throw new ProviderError('PROVIDER_CHANGED', '第三方返回了无法解析的数据'); }
}
function str(v: unknown, field: string): string {
  if (typeof v !== 'string' && typeof v !== 'number') throw new ProviderError('PROVIDER_CHANGED', `第三方缺少 ${field}`);
  return String(v);
}
function stamp(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }
function loginBody(identifier: string, encryptedPassword: string): URLSearchParams {
  return new URLSearchParams({ fid: '-1', uname: encryptLoginValue(identifier), password: encryptedPassword, refer: 'https://i.chaoxing.com', t: 'true', forbidotherlogin: '0', validate: '', doubleFactorLogin: '0', independentId: '0', independentNameId: '0' });
}
async function identity(jar: RequestSession): Promise<{ userId: string; fid: string; name: string; uid?: string; imEncryptedPassword?: string }> {
  const body = await json(await jar.request('https://sso.chaoxing.com/apis/login/userLogin4Uname.do'));
  const msg = asObject(body.msg);
  const im = msg.accountInfo && asObject(msg.accountInfo).imAccount ? asObject(asObject(msg.accountInfo).imAccount) : undefined;
  return { userId: str(msg.puid, 'puid'), fid: str(msg.fid ?? '0', 'fid'), name: str(msg.name, 'name'), uid: msg.uid === undefined ? undefined : str(msg.uid, 'uid'), imEncryptedPassword: typeof im?.password === 'string' ? im.password : undefined };
}
async function loginWithEncrypted(identifier: string, encryptedPassword: string, deviceCode: string, jar = new RequestSession()): Promise<ProviderSession> {
  const result = await json(await jar.request('https://passport2.chaoxing.com/fanyalogin', { method: 'POST', body: loginBody(identifier, encryptedPassword), headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
  if (result.status !== true) throw new ProviderError('REAUTH_REQUIRED', '账号或密码未被第三方接受');
  const user = await identity(jar);
  return { identifier, encryptedPassword, deviceCode, ...user, cookies: jar.exportCookies() };
}
export const login = (identifier: string, password: string, deviceCode: string, transport?: Transport) => loginWithEncrypted(identifier, encryptLoginValue(password), deviceCode, new RequestSession(undefined, transport));
export async function checkSession(session: ProviderSession, transport?: Transport): Promise<ProviderSession> {
  const jar = new RequestSession(session, transport);
  try {
    const user = await identity(jar);
    if (user.userId !== session.userId) throw new ProviderError('REAUTH_REQUIRED', '会话身份不匹配');
    return { ...session, ...user, cookies: jar.exportCookies() };
  } catch (error) {
    if (error instanceof ProviderError && error.code !== 'PROVIDER_CHANGED' && error.code !== 'REAUTH_REQUIRED') throw error;
    const renewed = await loginWithEncrypted(session.identifier, session.encryptedPassword, session.deviceCode, new RequestSession(undefined, transport));
    if (renewed.userId !== session.userId) throw new ProviderError('REAUTH_REQUIRED', '重登后身份不匹配');
    return renewed;
  }
}

export async function courses(session: ProviderSession, transport?: Transport): Promise<Course[]> {
  const jar = new RequestSession(session, transport);
  const body = await json(await jar.request('https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1'));
  return asArray(body.channelList).flatMap(raw => {
    const item = asObject(raw); const content = asObject(item.content);
    if (!content.course || !item.cataName) return [];
    const course = asObject(asArray(asObject(content.course).data)[0]);
    return [{ id: str(course.id, 'course.id'), classId: str(content.id, 'class.id'), name: str(course.name, 'course.name'), teacher: typeof course.teacherfactor === 'string' ? course.teacherfactor : undefined }];
  });
}
function kindFrom(raw: Record<string, unknown>): Activity['kind'] {
  const other = String(raw.otherId ?? '');
  if (other === '0') return 'click';
  if (other === '2') return 'qr';
  if (other === '3') return 'gesture';
  if (other === '4') return 'location';
  if (other === '5') return 'code';
  return 'unknown';
}
export async function activities(session: ProviderSession, courseId: string, classId: string, transport?: Transport): Promise<Activity[]> {
  const jar = new RequestSession(session, transport);
  const url = new URL('https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist');
  url.search = new URLSearchParams({ fid: '0', showNotStartedActive: '0', courseId, classId }).toString();
  const data = asObject((await json(await jar.request(url.toString()))).data);
  const ext = JSON.stringify(data.ext ?? {});
  return asArray(data.activeList).map(raw => asObject(raw)).filter(item => item.type === 2 || item.type === 74).map(item => ({
    id: str(item.id, 'activity.id'), courseId, classId, source: 'course', title: str(item.nameOne ?? '签到', 'activity.title'), kind: kindFrom(item),
    startTime: stamp(item.startTime), endTime: stamp(item.endTime), signed: item.userStatus === undefined ? null : [1, 2, 3, 9].includes(Number(item.userStatus)), ext, cachedAt: Date.now(),
  }));
}
export async function activityDetail(session: ProviderSession, activity: Activity, transport?: Transport): Promise<Activity> {
  const jar = new RequestSession(session, transport);
  const url = new URL('https://mobilelearn.chaoxing.com/v2/apis/active/getPPTActiveInfo'); url.searchParams.set('activeId', activity.id);
  const result = await json(await jar.request(url.toString()));
  const info = asObject(result.data);
  const requirements = { captcha: Number(info.ifNeedVCode) === 1, face: Number(info.openCheckFaceFlag) === 1, location: Number(info.ifopenAddress) === 1, photo: Number(info.ifphoto) === 1 };
  const detected = info.otherId === undefined ? activity.kind : kindFrom(info);
  const relation = {
    signInId: info.signInId == null ? undefined : str(info.signInId, 'signInId'),
    signOutId: info.signOutId == null || String(info.signOutId) === '4999' || String(info.signOutId) === activity.id ? undefined : str(info.signOutId, 'signOutId'),
    signOutPublishTime: stamp(info.signOutPublishTimeStamp),
  };
  return { ...activity, kind: detected === 'click' && requirements.photo ? 'photo' : detected, requirements, relation,
    startTime: stamp(info.starttime) ?? activity.startTime, endTime: stamp(info.endTime) ?? activity.endTime };
}
export function parseStatusPage(body: string): SignStatus {
  if (body.includes('校验失败，未查询到活动数据')) throw new ProviderError('NOT_MEMBER', '该账号不在活动班级');
  if (body.includes('下次早点哦')) return { state: 'EXPIRED' };
  const match = body.match(/"primaryAttend"\s*:\s*\{[^{}]*?"status"\s*:\s*(\d+)/) ?? body.match(/signstatus\s*=\s*(\d+)/);
  if (!match) throw new ProviderError('PROVIDER_CHANGED', '无法确认远端签到状态');
  return { state: [1, 2, 3, 9].includes(Number(match[1])) ? 'SIGNED' : 'READY' };
}
async function presign(jar: RequestSession, session: ProviderSession, activity: Activity): Promise<SignStatus> {
  const url = new URL('https://mobilelearn.chaoxing.com/newsign/preSign');
  url.search = new URLSearchParams({ courseId: activity.courseId, classId: activity.classId, activePrimaryId: activity.id, general: '1', sys: '1', ls: '1', appType: '15', uid: session.userId, isTeacherViewOpen: '0' }).toString();
  const body = await (await jar.request(url.toString(), { method: 'POST', body: new URLSearchParams({ ext: activity.ext }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })).text();
  return parseStatusPage(body);
}
async function analysis(jar: RequestSession, activity: Activity): Promise<void> {
  const first = new URL('https://mobilelearn.chaoxing.com/pptSign/analysis');
  first.search = new URLSearchParams({ vs: '1', DB_STRATEGY: 'RANDOM', aid: activity.id }).toString();
  const html = await (await jar.request(first.toString())).text();
  const code = html.match(/code='\+'([a-f0-9]+)'/)?.[1];
  if (!code) throw new ProviderError('PROVIDER_CHANGED', '第三方预签到确认参数已变化');
  const second = new URL('https://mobilelearn.chaoxing.com/pptSign/analysis2');
  second.search = new URLSearchParams({ DB_STRATEGY: 'RANDOM', code }).toString();
  await jar.request(second.toString());
}
export async function signStatus(session: ProviderSession, activity: Activity, transport?: Transport): Promise<SignStatus> {
  return presign(new RequestSession(session, transport), session, activity);
}
export async function preflight(session: ProviderSession, activity: Activity, transport?: Transport): Promise<SignStatus> {
  const detail = await activityDetail(session, activity, transport);
  const jar = new RequestSession(session, transport);
  const status = await presign(jar, session, detail);
  if (status.state !== 'READY') return status;
  if (detail.requirements?.captcha) return { state: 'WAITING_CAPTCHA', message: '需要人工完成验证码' };
  if (detail.requirements?.face) return { state: 'WAITING_FACE', message: '需要人脸验证' };
  await analysis(jar, activity);
  return status;
}
export function parseSubmitResponse(body: string): SignStatus {
  const value = body.trim();
  if (value === 'success') return { state: 'READY', message: '第三方已接受提交，仍需核验' };
  if (value === '您已签到过了') return { state: 'SIGNED' };
  if (value === 'success2') return { state: 'EXPIRED' };
  if (value === '签到失败，请重新扫描。') throw new ProviderError('QR_EXPIRED', '二维码已过期');
  if (value.startsWith('validate')) return { state: 'WAITING_CAPTCHA' };
  if (value.startsWith('checkFace_') || value.startsWith('[face]')) return { state: 'WAITING_FACE' };
  if (value.startsWith('errorLocation')) throw new ProviderError('LOCATION_REJECTED', '位置不在允许范围');
  throw new ProviderError('PROVIDER_CHANGED', '第三方返回未知签到结果');
}
function locationParams(url: URL, location?: LocationInput) {
  if (!location) { url.searchParams.set('latitude', '-1'); url.searchParams.set('longitude', '-1'); return; }
  url.searchParams.set('latitude', location.latitude.toFixed(6)); url.searchParams.set('longitude', location.longitude.toFixed(6));
  const value = JSON.stringify({ result: 1, latitude: Number(location.latitude.toFixed(6)), longitude: Number(location.longitude.toFixed(6)), address: location.address });
  url.searchParams.set('location', value); url.searchParams.set('locationResult', value);
}
export function parseQrPayload(payload: string, expectedId: string): { enc: string; code?: string } {
  let params: URLSearchParams;
  if (payload.startsWith('SIGNIN:')) params = new URLSearchParams(payload.slice(7).split('-')[0]);
  else {
    const url = new URL(payload);
    if (url.protocol !== 'https:' || !allowedHost(url.hostname)) throw new ProviderError('INVALID_INPUT', '二维码地址不可信');
    params = url.searchParams;
  }
  const id = params.get('id') ?? params.get('aid');
  if (id !== expectedId) throw new ProviderError('INVALID_INPUT', '二维码与当前活动不匹配或缺少活动编号');
  const enc = params.get('enc'); if (!enc) throw new ProviderError('INVALID_INPUT', '二维码缺少签到参数');
  return { enc, code: params.get('c') ?? undefined };
}
async function verifyDynamicQr(jar: RequestSession, activityId: string, code?: string): Promise<void> {
  if (!code) return;
  const url = new URL('https://mobilelearn.chaoxing.com/newsign/signDetail');
  url.search = new URLSearchParams({ activePrimaryId: activityId, type: '1', msg: code }).toString();
  const result = await json(await jar.request(url.toString()));
  if (result.isOver === undefined || typeof result.signCode !== 'string') throw new ProviderError('PROVIDER_CHANGED', '动态二维码校验结果格式已变化');
  if (Number(result.isOver) === 1 || result.signCode !== code) throw new ProviderError('QR_EXPIRED', '动态二维码已过期，请重新扫描');
}
export async function uploadPhoto(session: ProviderSession, jpegBase64: string, transport?: Transport): Promise<{ mediaId: string }> {
  const bytes = decodeBase64(jpegBase64);
  if (bytes.length > 2_000_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9)
    throw new ProviderError('INVALID_INPUT', '仅支持不超过 2 MB 的 JPEG 照片');
  const jar = new RequestSession(session, transport);
  const tokenBody = await json(await jar.request('https://pan-yz.chaoxing.com/api/token/uservalid'));
  const token = str(tokenBody._token, 'cloud token');
  const fileBytes = new Uint8Array(bytes.length); fileBytes.set(bytes);
  const form = new FormData(); form.set('puid', session.userId); form.set('file', new Blob([fileBytes], { type: 'image/jpeg' }), 'sign.jpg');
  const url = new URL('https://pan-yz.chaoxing.com/upload'); url.searchParams.set('_from', 'mobilelearn'); url.searchParams.set('_token', token);
  const result = await json(await jar.request(url.toString(), { method: 'POST', body: form }));
  return { mediaId: str(result.objectId, 'objectId') };
}
async function faceEnc(jar: RequestSession, activity: Activity, mediaId: string): Promise<string> {
  const url = new URL('https://mobilelearn.chaoxing.com/pptSign/check-face-result');
  url.search = new URLSearchParams({ DB_STRATEGY: 'PRIMARY_KEY', STRATEGY_PARA: 'activeId', activeId: activity.id,
    faceResult: JSON.stringify({ currentFaceId: mediaId, LiveDetectionStatus: 1, collectStatus: 1, cxtime: String(Date.now()) }) }).toString();
  const result = await json(await jar.request(url.toString()));
  if (typeof result.enc !== 'string' || !result.enc) throw new ProviderError('VALIDATION_FAILED', typeof result.msg === 'string' ? result.msg.slice(0, 160) : '第三方人脸校验未通过');
  return result.enc;
}
export async function submit(session: ProviderSession, activity: Activity, input: SignInput, transport?: Transport, faceMediaId?: string): Promise<SignStatus> {
  try { validateActivityInput(activity, input); } catch { throw new ProviderError('INVALID_INPUT', '输入不符合活动要求'); }
  const jar = new RequestSession(session, transport);
  const detail = await activityDetail(session, activity, transport);
  if (detail.kind !== activity.kind) throw new ProviderError('PROVIDER_CHANGED', '活动类型已变化，请刷新活动');
  if (detail.requirements?.face && !faceMediaId) return { state: 'WAITING_FACE', message: '需要人脸验证' };
  if (detail.requirements?.captcha) return { state: 'WAITING_CAPTCHA', message: '需要人工完成验证码' };
  if (detail.requirements?.location && !('location' in input || input.kind === 'location')) throw new ProviderError('INVALID_INPUT', '该活动要求位置输入');
  const before = await presign(jar, session, activity);
  if (before.state !== 'READY') return before;
  await analysis(jar, activity);
  const url = new URL('https://mobilelearn.chaoxing.com/pptSign/stuSignajax');
  url.searchParams.set('activeId', activity.id); url.searchParams.set('courseId', activity.courseId);
  url.searchParams.set('uid', session.userId); url.searchParams.set('fid', session.fid);
  url.searchParams.set('name', session.name); url.searchParams.set('deviceCode', session.deviceCode);
  url.searchParams.set('clientip', ''); url.searchParams.set('appType', '15');
  const loc = input.kind === 'location' ? input : 'location' in input ? input.location : undefined;
  locationParams(url, loc);
  if (input.kind === 'location') { url.searchParams.set('address', input.address); url.searchParams.set('ifTiJiao', '1'); url.searchParams.set('vpProbability', '-1'); url.searchParams.set('vpStrategy', ''); }
  if (input.kind === 'code') url.searchParams.set('signCode', input.code);
  if (input.kind === 'gesture') url.searchParams.set('signCode', input.sequence);
  if (input.kind === 'photo') {
    const mediaId = input.mediaIdByAccount[session.userId];
    if (!mediaId) throw new ProviderError('INVALID_INPUT', '缺少当前账号上传的照片');
    url.searchParams.set('objectId', mediaId);
  }
  if (input.kind === 'qr') {
    const age = Date.now() - Date.parse(input.scannedAt);
    if (!Number.isFinite(age) || age > 120000 || age < -30000) throw new ProviderError('QR_EXPIRED', '二维码扫描时间无效或已过期');
    const qr = parseQrPayload(input.qrPayload, activity.id);
    await verifyDynamicQr(jar, activity.id, qr.code);
    url.searchParams.set('enc', qr.enc);
    url.searchParams.set('vpProbability', '-1'); url.searchParams.set('vpStrategy', '');
  }
  if (faceMediaId) {
    const enc = await faceEnc(jar, activity, faceMediaId);
    url.searchParams.set('currentFaceId', faceMediaId);
    url.searchParams.set('ifCFP', '0');
    url.searchParams.set('faceEnc', enc);
    url.searchParams.set('faceCode', '');
    url.searchParams.set('faceEncAid', '');
  }
  const result = parseSubmitResponse(await (await jar.request(url.toString())).text());
  if (result.state !== 'READY') return result;
  // 接受提交不等于成功；再读第三方状态确认。
  const verified = await presign(jar, session, activity);
  return verified.state === 'SIGNED' ? { ...verified, submitted: true } : verified;
}
