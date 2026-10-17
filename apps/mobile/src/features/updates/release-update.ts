export const repositoryUrl = 'https://github.com/Asuka01124/diandao-chaoxing';
export const latestReleaseUrl = `${repositoryUrl}/releases/latest`;
export const releaseManifestUrl = `${latestReleaseUrl}/download/update.json`;

export type AppVersion = { version: string; versionCode: number };
export type AppRelease = {
  version: string; versionCode: number | null; tag: string; releaseUrl: string; apkUrl: string; notes: string;
};
export type UpdateResult = { available: boolean; release: AppRelease };
type UpdateResponse = { ok: boolean; status: number; headers?: Pick<Headers, 'get'>; json(): Promise<unknown> };
export type Transport = (url: string, init: RequestInit) => Promise<UpdateResponse>;
export class UpdateError extends Error {
  constructor(message: string, readonly retryAt?: number) { super(message); }
}

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
      return new UpdateError(`检查更新太频繁，${retry}`,
        Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) * 1000 : 60000));
    }
    return new UpdateError('无法访问更新服务，请更换网络或到项目主页查看');
  }
  const messages: Record<number, string> = {
    400: '无法检查更新，请到项目主页查看',
    401: '无法访问更新服务，请到项目主页查看',
    404: '未找到正式版本，请到项目主页查看',
    408: '检查更新超时，请稍后重试',
    451: '当前地区无法访问更新服务，请到项目主页查看',
    502: '更新服务暂不可用，请稍后重试',
    503: '更新服务暂不可用，请稍后重试',
    504: '检查更新超时，请稍后重试',
  };
  return new UpdateError(messages[status] ?? (status >= 500 && status < 600
    ? `更新服务暂不可用，请稍后重试`
    : `无法检查更新，请到项目主页查看`));
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UpdateError('无法读取更新信息，请到项目主页查看');
  return value as Record<string, unknown>;
}

function versionParts(version: string): number[] {
  if (!/^\d{1,6}\.\d{1,6}(?:\.\d{1,6})?$/.test(version)) throw new UpdateError('无法识别版本号，请到项目主页查看');
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
    throw new UpdateError('暂未找到正式版本，请到项目主页查看');
  }
  const match = data.tag_name.match(/^v?(\d{1,6}\.\d{1,6}(?:\.\d{1,6})?)(?:-build\.\d+)?$/);
  if (!match) throw new UpdateError('无法识别发布版本，请到项目主页查看');
  const version = match[1];
  versionParts(version);
  const tag = data.tag_name;
  const releaseUrl = `${repositoryUrl}/releases/tag/${encodeURIComponent(tag)}`;
  if (data.html_url !== releaseUrl || !Array.isArray(data.assets)) throw new UpdateError('发布链接异常，请到项目主页查看');
  const apkName = `daodian-v${version}-arm64.apk`;
  const apkUrl = `${repositoryUrl}/releases/download/${encodeURIComponent(tag)}/${apkName}`;
  const apk = data.assets.find(item => item && typeof item === 'object' && item.name === apkName);
  if (!apk || apk.browser_download_url !== apkUrl || (typeof apk.size !== 'number' || !Number.isSafeInteger(apk.size) || apk.size <= 0)) {
    throw new UpdateError('该版本暂无 Android 安装包，请稍后重试');
  }
  const body = typeof data.body === 'string' ? data.body : '';
  const marker = body.match(/<!--\s*diandao-release:\s*(\{[^\n]*\})\s*-->/);
  let versionCode: number | null = null;
  if (marker) {
    let metadata: Record<string, unknown>;
    try { metadata = record(JSON.parse(marker[1])); }
    catch { throw new UpdateError('版本信息不完整，请到项目主页查看'); }
    if (metadata.version !== version || metadata.tag !== tag || !Number.isSafeInteger(metadata.versionCode)) {
      throw new UpdateError('版本信息不一致，请到项目主页查看');
    }
    versionCode = metadata.versionCode as number;
  } else {
    // 兼容 1.4.1、1.5 等已发布版本的说明格式。
    const legacy = body.match(/Android 版本码[：:]\s*(\d+)/);
    if (legacy) versionCode = Number(legacy[1]);
  }
  if (versionCode !== null && (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000)) {
    throw new UpdateError('版本信息有误，请到项目主页查看');
  }
  const content = body.match(/(?:^|\n)## 更新内容\s*\n([\s\S]*?)(?=\n<!--|\n## |$)/)?.[1]?.trim();
  const notes = content?.replace(/^[-*]\s+/gm, '• ').slice(0, 2000) || '请到项目主页查看更新说明。';
  return { version, versionCode, tag, releaseUrl, apkUrl, notes };
}

export function evaluateUpdate(current: AppVersion, release: AppRelease): UpdateResult {
  const order = compareVersions(release.version, current.version);
  if (order < 0) return { available: false, release };
  if (release.versionCode !== null) return { available: release.versionCode > current.versionCode, release };
  if (order > 0) return { available: true, release };
  throw new UpdateError('无法确认是否需要更新，请到项目主页查看');
}

async function fetchManifest(transport: Transport, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw new UpdateError('已取消检查更新');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await transport(releaseManifestUrl, {
      method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await responseError(response);
    if (controller.signal.aborted) throw new UpdateError('检查更新超时，请稍后重试');
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new UpdateError(controller.signal.aborted ? '检查更新超时，请稍后重试' : '无法读取更新信息，请到项目主页查看'); }
    parseRelease(body);
    return body;
  } catch (error) {
    if (error instanceof UpdateError) throw error;
    throw new UpdateError(signal?.aborted ? '已取消检查更新' : controller.signal.aborted ? '检查更新超时，请稍后重试' : '无法检查更新，请检查网络后重试');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function checkForUpdates(current: AppVersion, transport: Transport = fetch, signal?: AbortSignal): Promise<UpdateResult> {
  return evaluateUpdate(current, parseRelease(await fetchManifest(transport, signal)));
}

export const updateCacheTtl = 30 * 60 * 1000;
type UpdateCache = { checkedAt: number; manifest: unknown };
export type UpdateCacheStorage = { read(): Promise<string | null>; write(value: string): Promise<void> };

// 同一实例跨页面复用；每位调用者独立取消，最后一位退出时中止网络请求。
export function createUpdateChecker(transport: Transport, storage: UpdateCacheStorage, now = Date.now) {
  let cache: UpdateCache | null = null;
  let loaded = false;
  let limited: UpdateError | null = null;
  let pending: { controller: AbortController; promise: Promise<AppRelease>; users: number } | null = null;

  async function load(signal: AbortSignal): Promise<AppRelease> {
    if (!loaded) {
      try {
        const value = await storage.read();
        if (value) {
          const saved = record(JSON.parse(value));
          if (typeof saved.checkedAt === 'number' && Number.isFinite(saved.checkedAt)) {
            parseRelease(saved.manifest);
            cache = { checkedAt: saved.checkedAt, manifest: saved.manifest };
          }
        }
      } catch { /* 缓存损坏或不可读时重新检测。 */ }
      loaded = true;
    }
    if (signal.aborted) throw new UpdateError('已取消检查更新');
    if (cache && now() >= cache.checkedAt && now() - cache.checkedAt < updateCacheTtl) return parseRelease(cache.manifest);
    if (limited?.retryAt && now() < limited.retryAt) {
      throw new UpdateError(`检查更新太频繁，请约 ${Math.ceil((limited.retryAt - now()) / 1000)} 秒后重试`, limited.retryAt);
    }
    let manifest: unknown;
    try { manifest = await fetchManifest(transport, signal); }
    catch (error) {
      if (error instanceof UpdateError && error.retryAt) limited = error;
      throw error;
    }
    if (signal.aborted) throw new UpdateError('已取消检查更新');
    cache = { checkedAt: now(), manifest };
    limited = null;
    try { await storage.write(JSON.stringify(cache)); }
    catch { /* 写入失败仍保留本次结果与内存缓存。 */ }
    return parseRelease(manifest);
  }

  return async function check(current: AppVersion, signal?: AbortSignal): Promise<UpdateResult> {
    if (signal?.aborted) throw new UpdateError('已取消检查更新');
    if (!pending) {
      const controller = new AbortController();
      pending = { controller, promise: load(controller.signal), users: 0 };
    }
    const operation = pending;
    operation.users++;
    let cancel: (() => void) | undefined;
    try {
      const release = await new Promise<AppRelease>((resolve, reject) => {
        cancel = () => reject(new UpdateError('已取消检查更新'));
        signal?.addEventListener('abort', cancel, { once: true });
        operation.promise.then(resolve, reject);
      });
      return evaluateUpdate(current, release);
    } finally {
      if (cancel) signal?.removeEventListener('abort', cancel);
      operation.users--;
      if (operation.users === 0) {
        operation.controller.abort();
        if (pending === operation) pending = null;
      }
    }
  };
}
