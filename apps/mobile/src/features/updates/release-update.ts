export const repositoryUrl = 'https://github.com/Asuka01124/diandao-chaoxing';
export const releaseApiUrl = 'https://api.github.com/repos/Asuka01124/diandao-chaoxing/releases/latest';
export const latestReleaseUrl = `${repositoryUrl}/releases/latest`;

export type AppVersion = { version: string; versionCode: number };
export type AppRelease = {
  version: string; versionCode: number | null; tag: string; releaseUrl: string; apkUrl: string; notes: string;
};
export type UpdateResult = { available: boolean; release: AppRelease };
type Transport = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export class UpdateError extends Error {}

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
    if (response.status === 404) throw new UpdateError('暂未发布可用版本，请稍后再检查');
    if (response.status === 403 || response.status === 429) throw new UpdateError('检查更新次数过多，请稍后重试');
    if (!response.ok) throw new UpdateError('GitHub 暂时无法访问，请稍后重试');
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
