import {
  signInputSchema,
  type Activity,
  type LocationInput,
  type ProviderSession,
  type SignInput,
  type SignStatus,
} from '@sign/shared';
import { readActivityDetail, readCourseActivities } from './activities';
import { attendanceState } from './attendance';
import { getOperationSignal } from './deadline';
import { ProviderError } from './errors';
import { buildFaceResult } from './face';
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
    throw new ProviderError('SESSION_EXPIRED', '学习通登录已过期，请重新登录');
  }
  if (page.includes('校验失败，未查询到活动数据')) {
    throw new ProviderError('NOT_MEMBER', '该账号不在活动班级');
  }
  const record = attendanceRecord(page);
  const marker = page.match(/\bsignstatus\b["']?\s*[:=]\s*(?:(["'])(-?\d+)\1|(-?\d+)(?![\w.]))/i);
  const value = record && 'status' in record ? record.status : marker?.[2] ?? marker?.[3];
  const state = attendanceState(record?.status) ?? attendanceState(marker?.[2] ?? marker?.[3]);
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
    throw new ProviderError('SESSION_EXPIRED', '学习通登录已过期，请重新登录');
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
      (error.code !== 'NOT_MEMBER' && error.code !== 'PROVIDER_CHANGED')) throw error;

    // 预签到 HTML 不一定携带状态；使用同一账号的课程列表，按活动 ID 精确核查。
    const list = await readCourseActivities(client, activity.courseId, activity.classId);
    const current = list.find(item => item.id === activity.id);
    if (!current) throw new ProviderError('ACTIVITY_NOT_FOUND', '当前账号的课程列表中没有该签到，请刷新活动');
    if (current.ext !== activity.ext) {
      activity.ext = current.ext;
      const refreshed = await requestStatusPage(client, account, { ...activity, ext: current.ext });
      try { return parseStatusPage(refreshed); }
      catch (next) {
        if (!(next instanceof ProviderError) || next.code !== 'PROVIDER_CHANGED') throw next;
      }
    } else if (error.code === 'NOT_MEMBER') throw error;

    if (current.status === 2) return { state: 'EXPIRED', attendanceUnconfirmed: true };
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
  // 页面是 JS 拼接 '…code=' + '<hex>'，锚定语义上的 code= 并容忍引号/空格/拼接方式漂移。
  const token = page.match(/code\s*=\s*['"]?\s*\+?\s*['"]?\s*([a-f0-9]+)/i)?.[1];
  if (!token) {
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
  if (message === '您已签到过了') return { state: 'SIGNED' };
  if (message === 'success2') return { state: 'EXPIRED' };
  if (message === '签到失败，请重新扫描。') throw new ProviderError('QR_EXPIRED', '二维码已过期');
  // 成功响应可能是 success 或中文「签到成功」，容忍首尾标点；仍交由个人结果核验，不直接判定成功。
  if (/^(?:success|签到成功)[。！!.]?$/i.test(message)) {
    return { state: 'READY', message: '第三方已接受提交，仍需核验' };
  }
  if (message.startsWith('validate')) return { state: 'WAITING_CAPTCHA' };
  const detail = responseMessage(message);
  if (message.startsWith('checkFace_') || message.startsWith('[face]') ||
      /^(?:请先(?:进行|完成)人脸验证|活体验证参数缺失)[。！!]?$/.test(detail)) {
    return { state: 'WAITING_FACE', message: '请在学习通完成人脸验证和签到' };
  }
  if (message.startsWith('errorLocation')) {
    throw new ProviderError('LOCATION_REJECTED', '位置不在允许范围');
  }
  throw new ProviderError('PROVIDER_CHANGED', `学习通返回：${detail || '空签到响应'}`);
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
  const url = apiUrl('/newsign/signDetail', {
    activePrimaryId: activityId,
    type: '1',
    msg: code,
  }).href;
  const canRetry = (error: unknown): error is ProviderError =>
    error instanceof ProviderError && error.retryable && error.code !== 'RATE_LIMITED' && !getOperationSignal()?.aborted;

  // 校验接口只为提前发现明确过期；无法确认时不拦截，交由正式提交裁决有效性。
  let reply: Response;
  try {
    reply = await client.request(url).catch((error: unknown) => {
      if (canRetry(error)) return client.request(url);
      throw error;
    });
  } catch { return; }
  const data = await json(reply).catch(() => undefined);
  if (!data) return;
  const { isOver, signCode } = data;
  const currentCode = typeof signCode === 'number' && Number.isSafeInteger(signCode) ? String(signCode) : signCode;
  if (isOver != null && Number(isOver) === 1) {
    throw new ProviderError('QR_EXPIRED', '动态二维码已过期，请重新扫描');
  }
  if (typeof currentCode === 'string' && currentCode.trim() && currentCode !== code) {
    throw new ProviderError('QR_EXPIRED', '动态二维码已过期，请重新扫描');
  }
}

async function requestFaceProof(
  client: RequestSession,
  activityId: string,
  mediaId: string,
  clientId?: string,
): Promise<string> {
  const faceResult = buildFaceResult(mediaId, clientId);
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
    case 'qr':
      query.set('vpProbability', '-1');
      query.set('vpStrategy', '');
      break;
  }

  if (faceMediaId) {
    const proof = await requestFaceProof(client, activity.id, faceMediaId, account.clientId);
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
  preparedInput: SignInput,
  transport?: Transport,
  faceMediaId?: string,
  onSubmit?: () => void | Promise<void>,
  resolvePhoto?: () => Promise<string>,
): Promise<SignStatus> {
  const parsedInput = signInputSchema.safeParse(preparedInput);
  if (!parsedInput.success) throw new ProviderError('INVALID_INPUT', '输入不符合活动要求');
  let input = parsedInput.data;
  const qr = input.kind === 'qr' ? parseQrPayload(input.qrPayload, activity.id) : undefined;

  const client = new RequestSession(account, transport);
  const context = { ...activity };
  const prior = await readStatus(client, account, context);
  if (prior.state !== 'READY') return prior;
  const current = await readActivityDetail(client, context);
  if (current.kind !== input.kind) {
    throw new ProviderError('SIGN_INPUT_CHANGED', '签到类型已更新，请重新准备');
  }
  if (current.requirements?.face && !faceMediaId) {
    return { state: 'WAITING_FACE', message: '需要人脸验证' };
  }
  if (current.requirements?.captcha) {
    return { state: 'WAITING_CAPTCHA', message: '需要人工完成验证码' };
  }
  if (current.requirements?.location && input.kind !== 'location' && !input.location) {
    throw new ProviderError('SIGN_INPUT_CHANGED', '该活动要求签到位置，请重新准备');
  }
  if (input.kind === 'photo' && !input.mediaIdByAccount[account.userId]) {
    if (!resolvePhoto) throw new ProviderError('INVALID_INPUT', '缺少当前账号上传的照片');
    input = { ...input, mediaIdByAccount: { [account.userId]: await resolvePhoto() } };
  }

  await establishSignContext(client, activity.id);
  if (qr) await assertCurrentQr(client, activity.id, qr.code);
  const url = await submissionUrl(client, account, current, input, faceMediaId);
  if (qr) url.searchParams.set('enc', qr.enc);
  const raw = (await (await client.request(url.href, {}, 0, onSubmit)).text()).trim();
  let result = parseSubmitResponse(raw);
  // checkFace_<enc2>：第三方已记录人脸，要求带 enc2 原样重提一次即可通过。
  const enc2 = raw.startsWith('checkFace_') ? raw.slice('checkFace_'.length) : '';
  if (result.state === 'WAITING_FACE' && enc2 && faceMediaId) {
    const retryUrl = await submissionUrl(client, account, current, input, faceMediaId);
    if (qr) retryUrl.searchParams.set('enc', qr.enc);
    retryUrl.searchParams.set('enc2', enc2);
    result = parseSubmitResponse(await (await client.request(retryUrl.href)).text());
  }
  if (result.state !== 'READY') return result;
  const verified = await readStatus(client, account, current).catch(() => undefined);
  return verified?.state === 'SIGNED'
    ? { ...verified, submitted: true }
    : { state: 'WAITING_CONFIRMATION', message: '已提交，签到结果待确认' };
}
