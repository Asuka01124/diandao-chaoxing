import { validateActivityInput, type Activity, type LocationInput, type ProviderSession, type SignInput, type SignStatus } from '@sign/shared';
import { activityDetail } from './activities';
import { ProviderError } from './errors';
import { json } from './response';
import { allowedHost, RequestSession, type Transport } from './session';

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
