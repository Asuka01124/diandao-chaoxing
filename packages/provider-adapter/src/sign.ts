import {
  validateActivityInput,
  type Activity,
  type LocationInput,
  type ProviderSession,
  type SignInput,
  type SignStatus,
} from '@sign/shared';
import { activityDetail } from './activities';
import { ProviderError } from './errors';
import { json } from './response';
import { allowedHost, RequestSession, type Transport } from './session';

const apiRoot = 'https://mobilelearn.chaoxing.com';
const confirmedStatuses = new Set([1, 2, 3, 9]);

function apiUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(path, apiRoot);
  if (query) url.search = new URLSearchParams(query).toString();
  return url;
}

export function parseStatusPage(page: string): SignStatus {
  if (page.includes('校验失败，未查询到活动数据')) {
    throw new ProviderError('NOT_MEMBER', '该账号不在活动班级');
  }
  if (page.includes('下次早点哦')) return { state: 'EXPIRED' };

  const attendance = page.match(/"primaryAttend"\s*:\s*(\{[^{}]*\})/);
  let status: number | undefined;
  if (attendance) {
    try {
      const record: unknown = JSON.parse(attendance[1]);
      if (record && typeof record === 'object' && 'status' in record) {
        status = Number(record.status);
      }
    } catch {
      // Some responses contain a partial script; the simple status marker is still usable.
    }
  }
  if (!Number.isInteger(status)) {
    const marker = page.match(/\bsignstatus\s*=\s*(\d+)/i);
    status = marker ? Number(marker[1]) : undefined;
  }
  if (!Number.isInteger(status)) {
    throw new ProviderError('PROVIDER_CHANGED', '无法确认远端签到状态');
  }
  return { state: confirmedStatuses.has(status!) ? 'SIGNED' : 'READY' };
}

async function readStatus(
  client: RequestSession,
  account: ProviderSession,
  activity: Activity,
): Promise<SignStatus> {
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
  return parseStatusPage(await response.text());
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
  return readStatus(new RequestSession(account, transport), account, activity);
}

export async function preflight(
  account: ProviderSession,
  activity: Activity,
  transport?: Transport,
): Promise<SignStatus> {
  const current = await activityDetail(account, activity, transport);
  const client = new RequestSession(account, transport);
  const status = await readStatus(client, account, current);
  if (status.state !== 'READY') return status;
  if (current.requirements?.captcha) {
    return { state: 'WAITING_CAPTCHA', message: '需要人工完成验证码' };
  }
  if (current.requirements?.face) {
    return { state: 'WAITING_FACE', message: '需要人脸验证' };
  }
  await establishSignContext(client, activity.id);
  return status;
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
  throw new ProviderError('PROVIDER_CHANGED', '第三方返回未知签到结果');
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
): Promise<SignStatus> {
  try {
    validateActivityInput(activity, input);
  } catch {
    throw new ProviderError('INVALID_INPUT', '输入不符合活动要求');
  }

  const current = await activityDetail(account, activity, transport);
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

  const client = new RequestSession(account, transport);
  const prior = await readStatus(client, account, activity);
  if (prior.state !== 'READY') return prior;
  await establishSignContext(client, activity.id);
  const url = await submissionUrl(client, account, activity, input, faceMediaId);
  const result = parseSubmitResponse(await (await client.request(url.href)).text());
  if (result.state !== 'READY') return result;
  const verified = await readStatus(client, account, activity);
  return verified.state === 'SIGNED' ? { ...verified, submitted: true } : verified;
}