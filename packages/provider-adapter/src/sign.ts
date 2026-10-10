import {
  validateActivityInput,
  type Activity,
  type LocationInput,
  type ProviderSession,
  type SignInput,
  type SignStatus,
} from '@sign/shared';
import { readActivityDetail, readCourseActivities } from './activities';
import { attendanceState } from './attendance';
import { ProviderError } from './errors';
import { json, responseMessage } from './response';
import { allowedHost, RequestSession, type Transport } from './session';

const apiRoot = 'https://mobilelearn.chaoxing.com';

function apiUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(path, apiRoot);
  if (query) url.search = new URLSearchParams(query).toString();
  return url;
}

function attendanceRecord(page: string): Record<string, unknown> | undefined {
  const marker = /\bprimaryAttend\b["']?\s*[:=]\s*\{/g;
  for (const match of page.matchAll(marker)) {
    const start = match.index! + match[0].length - 1;
    let depth = 0, inString = false, escaped = false;
    for (let end = start; end < page.length; end++) {
      const char = page[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try { return JSON.parse(page.slice(start, end + 1)); }
        catch { break; }
      }
    }
  }
  return undefined;
}

export function parseStatusPage(page: string): SignStatus {
  if (/passport2\.chaoxing\.com/i.test(page) && /<input\b[^>]*\btype\s*=\s*["']?password/i.test(page)) {
    throw new ProviderError('SESSION_EXPIRED', '学习通登录已过期，请重新授权');
  }
  if (page.includes('校验失败，未查询到活动数据')) {
    throw new ProviderError('NOT_MEMBER', '该账号不在活动班级');
  }
  const record = attendanceRecord(page);
  const marker = page.match(/\bsignstatus\b["']?\s*[:=]\s*(?:(["'])(-?\d+)\1|(-?\d+)(?![\w.]))/i);
  const value = record && 'status' in record ? record.status : marker?.[2] ?? marker?.[3];
  const state = attendanceState(value);
  if (state === 'SIGNED') return { state };
  if (page.includes('下次早点哦')) return { state: 'EXPIRED' };
  if (value === undefined) {
    throw new ProviderError('PROVIDER_CHANGED', '无法确认远端签到状态');
  }
  if (!state) throw new ProviderError('PROVIDER_CHANGED', '远端签到状态未知，请刷新活动后重试');
  return { state };
}

async function requestStatusPage(
  client: RequestSession,
  account: ProviderSession,
  activity: Activity,
): Promise<string> {
  const url = apiUrl('/newsign/preSign', {
    courseId: activity.courseId,
    classId: activity.classId,
    activePrimaryId: activity.id,
    general: '1',
    sys: '1',
    ls: '1',
    appType: '15',
    uid: account.userId,
    isTeacherViewOpen: '0',
  });
  const response = await client.request(url.href, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ext: activity.ext }),
  });
  if (response.url && new URL(response.url).hostname === 'passport2.chaoxing.com') {
    throw new ProviderError('SESSION_EXPIRED', '学习通登录已过期，请重新授权');
  }
  return response.text();
}

async function readStatus(
  client: RequestSession,
  account: ProviderSession,
  activity: Activity,
): Promise<SignStatus> {
  const page = await requestStatusPage(client, account, activity);
  try { return parseStatusPage(page); }
  catch (error) {
    if (!(error instanceof ProviderError) || activity.source !== 'course' ||
      !(error.code === 'NOT_MEMBER' || (error.code === 'PROVIDER_CHANGED' && error.message === '无法确认远端签到状态'))) throw error;

    // 预签到 HTML 不一定携带状态；使用同一账号的课程列表，按活动 ID 精确核查。
    const list = await readCourseActivities(client, activity.courseId, activity.classId);
    const current = list.find(item => item.id === activity.id);
    if (!current) throw new ProviderError('ACTIVITY_NOT_FOUND', '当前账号的课程列表中没有该签到，请刷新活动');
    if (current.ext !== activity.ext) {
      activity.ext = current.ext;
      const refreshed = await requestStatusPage(client, account, { ...activity, ext: current.ext });
      try { return parseStatusPage(refreshed); }
      catch (next) {
        if (!(next instanceof ProviderError) || next.code !== 'PROVIDER_CHANGED' || next.message !== '无法确认远端签到状态') throw next;
      }
    } else if (error.code === 'NOT_MEMBER') throw error;

    if ((current.status != null && current.status !== 1) || (current.endTime != null && current.endTime <= Date.now())) return { state: 'EXPIRED' };
    if (current.status === 1) return { state: 'READY' };
    throw new ProviderError('PROVIDER_CHANGED', '课程活动列表未提供可确认的签到状态，请刷新活动');
  }
}

async function establishSignContext(client: RequestSession, activityId: string): Promise<void> {
  const first = apiUrl('/pptSign/analysis', {
    vs: '1',
    DB_STRATEGY: 'RANDOM',
    aid: activityId,
  });
  const page = await (await client.request(first.href)).text();
  const token = page.split("code='+'", 2)[1]?.split("'", 1)[0];
  if (!token || !/^[a-f0-9]+$/i.test(token)) {
    throw new ProviderError('PROVIDER_CHANGED', '第三方预签到确认参数已变化');
  }
  await client.request(apiUrl('/pptSign/analysis2', {
    DB_STRATEGY: 'RANDOM',
    code: token,
  }).href);
}

export function signStatus(
  account: ProviderSession,
  activity: Activity,
  transport?: Transport,
): Promise<SignStatus> {
  return readStatus(new RequestSession(account, transport), account, { ...activity });
}

export function parseSubmitResponse(response: string): SignStatus {
  const message = response.trim();
  switch (message) {
    case 'success':
      return { state: 'READY', message: '第三方已接受提交，仍需核验' };
    case '您已签到过了':
      return { state: 'SIGNED' };
    case 'success2':
      return { state: 'EXPIRED' };
    case '签到失败，请重新扫描。':
      throw new ProviderError('QR_EXPIRED', '二维码已过期');
  }
  if (message.startsWith('validate')) return { state: 'WAITING_CAPTCHA' };
  if (message.startsWith('checkFace_') || message.startsWith('[face]')) {
    return { state: 'WAITING_FACE' };
  }
  if (message.startsWith('errorLocation')) {
    throw new ProviderError('LOCATION_REJECTED', '位置不在允许范围');
  }
  throw new ProviderError('PROVIDER_CHANGED', `学习通返回：${responseMessage(response) || '空签到响应'}`);
}

export function parseQrPayload(payload: string, expectedId: string): { enc: string; code?: string } {
  let query: URLSearchParams;
  if (payload.startsWith('SIGNIN:')) {
    query = new URLSearchParams(payload.slice('SIGNIN:'.length).split('-', 1)[0]);
  } else {
    let url: URL;
    try {
      url = new URL(payload);
    } catch {
      throw new ProviderError('INVALID_INPUT', '二维码地址无效');
    }
    if (url.protocol !== 'https:' || !allowedHost(url.hostname)) {
      throw new ProviderError('INVALID_INPUT', '二维码地址不可信');
    }
    query = url.searchParams;
  }
  if ((query.get('id') ?? query.get('aid')) !== expectedId) {
    throw new ProviderError('INVALID_INPUT', '二维码与当前活动不匹配或缺少活动编号');
  }
  const enc = query.get('enc');
  if (!enc) throw new ProviderError('INVALID_INPUT', '二维码缺少签到参数');
  return { enc, code: query.get('c') ?? undefined };
}

async function assertCurrentQr(client: RequestSession, activityId: string, code?: string): Promise<void> {
  if (!code) return;
  const response = await json(await client.request(apiUrl('/newsign/signDetail', {
    activePrimaryId: activityId,
    type: '1',
    msg: code,
  }).href));
  if (response.isOver === undefined || typeof response.signCode !== 'string') {
    throw new ProviderError('PROVIDER_CHANGED', '动态二维码校验结果格式已变化');
  }
  if (Number(response.isOver) === 1 || response.signCode !== code) {
    throw new ProviderError('QR_EXPIRED', '动态二维码已过期，请重新扫描');
  }
}

async function requestFaceProof(
  client: RequestSession,
  activityId: string,
  mediaId: string,
): Promise<string> {
  const faceResult = JSON.stringify({
    currentFaceId: mediaId,
    LiveDetectionStatus: 1,
    collectStatus: 1,
    cxtime: String(Date.now()),
  });
  const response = await json(await client.request(apiUrl('/pptSign/check-face-result', {
    DB_STRATEGY: 'PRIMARY_KEY',
    STRATEGY_PARA: 'activeId',
    activeId: activityId,
    faceResult,
  }).href));
  if (typeof response.enc !== 'string' || !response.enc) {
    throw new ProviderError(
      'VALIDATION_FAILED',
      typeof response.msg === 'string' ? response.msg.slice(0, 160) : '第三方人脸校验未通过',
    );
  }
  return response.enc;
}

function addLocation(query: URLSearchParams, point?: LocationInput): void {
  if (!point) {
    query.set('latitude', '-1');
    query.set('longitude', '-1');
    return;
  }
  const latitude = Number(point.latitude.toFixed(6));
  const longitude = Number(point.longitude.toFixed(6));
  const serialized = JSON.stringify({
    result: 1,
    latitude,
    longitude,
    address: point.address,
  });
  query.set('latitude', latitude.toFixed(6));
  query.set('longitude', longitude.toFixed(6));
  query.set('location', serialized);
  query.set('locationResult', serialized);
}

async function submissionUrl(
  client: RequestSession,
  account: ProviderSession,
  activity: Activity,
  input: SignInput,
  faceMediaId?: string,
): Promise<URL> {
  const url = apiUrl('/pptSign/stuSignajax', {
    activeId: activity.id,
    courseId: activity.courseId,
    uid: account.userId,
    fid: account.fid,
    name: account.name,
    deviceCode: account.deviceCode,
    clientip: '',
    appType: '15',
  });
  const query = url.searchParams;
  const point = input.kind === 'location' ? input : 'location' in input ? input.location : undefined;
  addLocation(query, point);

  switch (input.kind) {
    case 'location':
      query.set('address', input.address);
      query.set('ifTiJiao', '1');
      query.set('vpProbability', '-1');
      query.set('vpStrategy', '');
      break;
    case 'code':
      query.set('signCode', input.code);
      break;
    case 'gesture':
      query.set('signCode', input.sequence);
      break;
    case 'photo': {
      const mediaId = input.mediaIdByAccount[account.userId];
      if (!mediaId) throw new ProviderError('INVALID_INPUT', '缺少当前账号上传的照片');
      query.set('objectId', mediaId);
      break;
    }
    case 'qr': {
      const elapsed = Date.now() - Date.parse(input.scannedAt);
      if (!Number.isFinite(elapsed) || elapsed > 120_000 || elapsed < -30_000) {
        throw new ProviderError('QR_EXPIRED', '二维码扫描时间无效或已过期');
      }
      const parsed = parseQrPayload(input.qrPayload, activity.id);
      await assertCurrentQr(client, activity.id, parsed.code);
      query.set('enc', parsed.enc);
      query.set('vpProbability', '-1');
      query.set('vpStrategy', '');
      break;
    }
  }

  if (faceMediaId) {
    const proof = await requestFaceProof(client, activity.id, faceMediaId);
    query.set('currentFaceId', faceMediaId);
    query.set('ifCFP', '0');
    query.set('faceEnc', proof);
    query.set('faceCode', '');
    query.set('faceEncAid', '');
  }
  return url;
}

export async function submit(
  account: ProviderSession,
  activity: Activity,
  input: SignInput,
  transport?: Transport,
  faceMediaId?: string,
  onSubmit?: () => void | Promise<void>,
): Promise<SignStatus> {
  try {
    validateActivityInput(activity, input);
  } catch {
    throw new ProviderError('INVALID_INPUT', '输入不符合活动要求');
  }

  const client = new RequestSession(account, transport);
  const context = { ...activity };
  const prior = await readStatus(client, account, context);
  if (prior.state !== 'READY') return prior;
  const current = await readActivityDetail(client, context);
  if (current.kind !== activity.kind) {
    throw new ProviderError('PROVIDER_CHANGED', '活动类型已变化，请刷新活动');
  }
  if (current.requirements?.face && !faceMediaId) {
    return { state: 'WAITING_FACE', message: '需要人脸验证' };
  }
  if (current.requirements?.captcha) {
    return { state: 'WAITING_CAPTCHA', message: '需要人工完成验证码' };
  }
  if (current.requirements?.location && !('location' in input || input.kind === 'location')) {
    throw new ProviderError('INVALID_INPUT', '该活动要求位置输入');
  }

  await establishSignContext(client, activity.id);
  const url = await submissionUrl(client, account, current, input, faceMediaId);
  const result = parseSubmitResponse(await (await client.request(url.href, {}, 0, onSubmit)).text());
  if (result.state !== 'READY') return result;
  const verified = await readStatus(client, account, current);
  return verified.state === 'SIGNED' ? { ...verified, submitted: true } : verified;
}
