export const repositoryUrl = 'https://github.com/Asuka01124/diandao-chaoxing';
export const releaseApiUrl = 'https://api.github.com/repos/Asuka01124/diandao-chaoxing/releases/latest';
export const latestReleaseUrl = `${repositoryUrl}/releases/latest`;

export type AppVersion = { version: string; versionCode: number };
export type AppRelease = {
  version: string; versionCode: number | null; tag: string; releaseUrl: string; apkUrl: string; notes: string;
};
export type UpdateResult = { available: boolean; release: AppRelease };
type UpdateResponse = { ok: boolean; status: number; headers?: Pick<Headers, 'get'>; json(): Promise<unknown> };
type Transport = (url: string, init: RequestInit) => Promise<UpdateResponse>;
export class UpdateError extends Error {}

async function responseError(response: UpdateResponse): Promise<UpdateError> {
  const { status, headers } = response;
  if (status === 403 || status === 429) {
    let message = '';
    try {
      const body = await response.json();
      if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') message = body.message;
    } catch { /* 错误响应可能是 HTML 或空内容，不向用户展示原始响应。 */ }
    const retryAfter = headers?.get('retry-after');
    const remaining = headers?.get('x-ratelimit-remaining');
    if (status === 429 || remaining === '0' || retryAfter != null || /\brate limit\b/i.test(message)) {
      let seconds = NaN;
      if (retryAfter?.trim()) {
        seconds = /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) : (Date.parse(retryAfter) - Date.now()) / 1000;
      }
      if (!Number.isFinite(seconds) && remaining === '0') {
        const reset = headers?.get('x-ratelimit-reset');
        if (reset && /^\d+$/.test(reset)) seconds = Number(reset) - Date.now() / 1000;
      }
      const retry = Number.isFinite(seconds) && seconds > 0 ? `请约 ${Math.ceil(seconds)} 秒后重试` : '请稍后重试';
      return new UpdateError(`GitHub 请求频率受限（HTTP ${status}），${retry}`);
    }
    return new UpdateError('GitHub 拒绝访问更新接口（HTTP 403），请尝试更换网络或前往发布页查看');
  }
  const messages: Record<number, string> = {
    400: '更新请求被拒绝（HTTP 400），请前往 GitHub 发布页查看',
    401: '更新接口要求身份验证（HTTP 401），请前往 GitHub 发布页查看',
    404: '未找到可访问的正式版本（HTTP 404），请前往 GitHub 发布页查看',
    408: '更新请求超时（HTTP 408），请稍后重试',
    451: '更新接口因地区或法律限制不可访问（HTTP 451），请前往 GitHub 发布页查看',
    502: '更新服务网关异常（HTTP 502），请稍后重试',
    503: 'GitHub 更新服务暂不可用（HTTP 503），请稍后重试',
    504: '更新服务网关超时（HTTP 504），请稍后重试',
  };
  return new UpdateError(messages[status] ?? (status >= 500 && status < 600
    ? `GitHub 更新服务异常（HTTP ${status}），请稍后重试`
    : `检查更新失败（HTTP ${status}），请前往 GitHub 发布页查看`));
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UpdateError('更新信息格式异常，请前往 GitHub 发布页查看');
  return value as Record<string, unknown>;
}

function versionParts(version: string): number[] {
  if (!/^\d{1,6}\.\d{1,6}(?:\.\d{1,6})?$/.test(version)) throw new UpdateError('无法识别版本号，请前往 GitHub 发布页查看');
  const values = version.split('.').map(Number);
  return [values[0], values[1], values[2] ?? 0];
}

export function compareVersions(left: string, right: string): number {
  const a = versionParts(left), b = versionParts(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

export function parseRelease(value: unknown): AppRelease {
  const data = record(value);
  if (data.draft !== false || data.prerelease !== false || typeof data.tag_name !== 'string') {
    throw new UpdateError('暂未找到可用的正式版本，请前往 GitHub 发布页查看');
  }
  const match = data.tag_name.match(/^v?(\d{1,6}\.\d{1,6}(?:\.\d{1,6})?)(?:-build\.\d+)?$/);
  if (!match) throw new UpdateError('无法识别发布版本，请前往 GitHub 发布页查看');
  const version = match[1];
  versionParts(version);
  const tag = data.tag_name;
  const releaseUrl = `${repositoryUrl}/releases/tag/${encodeURIComponent(tag)}`;
  if (data.html_url !== releaseUrl || !Array.isArray(data.assets)) throw new UpdateError('发布链接异常，请前往 GitHub 仓库查看');
  const apkName = `daodian-v${version}-arm64.apk`;
  const apkUrl = `${repositoryUrl}/releases/download/${encodeURIComponent(tag)}/${apkName}`;
  const apk = data.assets.find(item => item && typeof item === 'object' && item.name === apkName);
  if (!apk || apk.browser_download_url !== apkUrl || (typeof apk.size !== 'number' || !Number.isSafeInteger(apk.size) || apk.size <= 0)) {
    throw new UpdateError('该版本暂无可用的 Android 安装包，请稍后重试');
  }
  const body = typeof data.body === 'string' ? data.body : '';
  const marker = body.match(/<!--\s*diandao-release:\s*(\{[^\n]*\})\s*-->/);
  let versionCode: number | null = null;
  if (marker) {
    let metadata: Record<string, unknown>;
    try { metadata = record(JSON.parse(marker[1])); }
    catch { throw new UpdateError('发布版本资料异常，请前往 GitHub 发布页查看'); }
    if (metadata.version !== version || metadata.tag !== tag || !Number.isSafeInteger(metadata.versionCode)) {
      throw new UpdateError('发布版本资料不一致，请前往 GitHub 发布页查看');
    }
    versionCode = metadata.versionCode as number;
  } else {
    // 兼容 1.4.1、1.5 等已发布版本的说明格式。
    const legacy = body.match(/Android 版本码[：:]\s*(\d+)/);
    if (legacy) versionCode = Number(legacy[1]);
  }
  if (versionCode !== null && (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000)) {
    throw new UpdateError('发布版本码异常，请前往 GitHub 发布页查看');
  }
  const content = body.match(/(?:^|\n)## 更新内容\s*\n([\s\S]*?)(?=\n<!--|\n## |$)/)?.[1]?.trim();
  const notes = content?.replace(/^[-*]\s+/gm, '• ').slice(0, 2000) || '请在 GitHub 发布页查看本次更新说明。';
  return { version, versionCode, tag, releaseUrl, apkUrl, notes };
}

export function evaluateUpdate(current: AppVersion, release: AppRelease): UpdateResult {
  const order = compareVersions(release.version, current.version);
  if (order < 0) return { available: false, release };
  if (release.versionCode !== null) return { available: release.versionCode > current.versionCode, release };
  if (order > 0) return { available: true, release };
  throw new UpdateError('无法确认该版本的构建信息，请前往 GitHub 发布页查看');
}

export async function checkForUpdates(current: AppVersion, transport: Transport = fetch, signal?: AbortSignal): Promise<UpdateResult> {
  if (signal?.aborted) throw new UpdateError('已取消检查更新');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await transport(releaseApiUrl, {
      method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) throw await responseError(response);
    if (controller.signal.aborted) throw new UpdateError('检查更新超时，请稍后重试');
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new UpdateError(controller.signal.aborted ? '检查更新超时，请稍后重试' : '更新信息格式异常，请前往 GitHub 发布页查看'); }
    return evaluateUpdate(current, parseRelease(body));
  } catch (error) {
    if (error instanceof UpdateError) throw error;
    throw new UpdateError(signal?.aborted ? '已取消检查更新' : controller.signal.aborted ? '检查更新超时，请稍后重试' : '无法检查更新，请检查网络后重试');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
