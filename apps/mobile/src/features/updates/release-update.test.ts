import { expect, test } from 'bun:test';
import { checkForUpdates, compareVersions, evaluateUpdate, parseRelease, releaseApiUrl, repositoryUrl } from './release-update';

function fixture(version = '1.6', versionCode = 290003, tag = `v${version}`) {
  return {
    tag_name: tag, draft: false, prerelease: false, html_url: `${repositoryUrl}/releases/tag/${tag}`,
    assets: [{ name: `daodian-v${version}-arm64.apk`, browser_download_url: `${repositoryUrl}/releases/download/${tag}/daodian-v${version}-arm64.apk`, size: 41000000 }],
    body: `## 更新内容\n- 支持检查版本更新\n- 新增仓库入口\n\n<!-- diandao-release: ${JSON.stringify({ version, versionCode, tag })} -->\n\n构建资料`,
  };
}

test('公开 GitHub 检查只发送无认证 GET，不携带学习通账号或 Cookie', async () => {
  let requests = 0;
  const result = await checkForUpdates({ version: '1.5', versionCode: 280002 }, async (url, init) => {
    requests++;
    expect(url).toBe(releaseApiUrl);
    expect(init.method).toBe('GET'); expect(init.credentials).toBe('omit'); expect(init.body).toBeUndefined();
    const headers = new Headers(init.headers);
    expect(headers.has('cookie')).toBe(false); expect(headers.has('authorization')).toBe(false);
    expect(headers.get('accept')).toBe('application/vnd.github+json');
    return Response.json(fixture());
  });
  expect(requests).toBe(1); expect(result.available).toBe(true);
  expect(result.release.notes).toBe('• 支持检查版本更新\n• 新增仓库入口');
});

test('按数值比较版本，兼容两段版本号且不会误把 1.10 判为旧版', () => {
  expect(compareVersions('1.10', '1.9')).toBe(1); expect(compareVersions('1.6', '1.6.0')).toBe(0);
  expect(compareVersions('1.6.1', '1.6')).toBe(1); expect(compareVersions('1.5', '1.6')).toBe(-1);
  expect(() => compareVersions('unexpected', '1.6')).toThrow();
});

test('相同版本名通过 Android 版本码识别新构建，避免重复提示或降级', () => {
  const current = { version: '1.6', versionCode: 290003 };
  expect(evaluateUpdate(current, parseRelease(fixture('1.6', 290004, 'v1.6-build.4'))).available).toBe(true);
  expect(evaluateUpdate(current, parseRelease(fixture())).available).toBe(false);
  expect(evaluateUpdate(current, parseRelease(fixture('1.6', 290002))).available).toBe(false);
  expect(evaluateUpdate(current, parseRelease(fixture('1.5', 280002))).available).toBe(false);
});

test('兼容旧 Release 的版本码说明，没有构建资料时不谎报已是最新', () => {
  const old = fixture('1.5', 280002); old.body = '- 版本：1.5，Android 版本码：280002';
  expect(parseRelease(old).versionCode).toBe(280002);
  const unknown = fixture(); unknown.body = '手动发布说明';
  const release = parseRelease(unknown);
  expect(evaluateUpdate({ version: '1.5', versionCode: 280002 }, release).available).toBe(true);
  expect(() => evaluateUpdate({ version: '1.6', versionCode: 290003 }, release)).toThrow('无法确认');
});

test('只接收本仓库的正式 Release 与 APK，不打开外部替换下载地址', () => {
  const variants = [
    { ...fixture(), draft: true }, { ...fixture(), prerelease: true }, { ...fixture(), tag_name: 'v1.6-beta' },
    { ...fixture(), html_url: 'https://example.com/release' }, { ...fixture(), assets: [] },
    { ...fixture(), assets: [{ ...fixture().assets[0], browser_download_url: 'https://example.com/app.apk' }] },
    { ...fixture(), body: '<!-- diandao-release: {"version":"1.6","versionCode":1,"tag":"other"} -->' },
    { ...fixture(), body: '<!-- diandao-release: {invalid} -->' },
  ];
  for (const data of variants) expect(() => parseRelease(data)).toThrow();
});

test('GitHub 未发布、限流、服务错误和损坏响应分别返回可操作提示', async () => {
  for (const [status, text] of [[400, '请求被拒绝'], [401, '身份验证'], [403, '拒绝访问'], [404, '未找到'],
    [408, '请求超时'], [429, '频率受限'], [451, '地区或法律限制'], [500, '服务异常'],
    [502, '网关异常'], [503, '暂不可用'], [504, '网关超时'], [418, 'HTTP 418']] as const) {
    await expect(checkForUpdates({ version: '1.6', versionCode: 290003 }, async () => new Response('', { status }))).rejects.toThrow(text);
  }
  await expect(checkForUpdates({ version: '1.6', versionCode: 290003 }, async () => new Response('broken-json'))).rejects.toThrow('更新信息格式异常');
  await expect(checkForUpdates({ version: '1.6', versionCode: 290003 }, async () => { throw new Error('network'); })).rejects.toThrow('检查网络');
});

test('403 仅在有证据时识别为限流，等待时间来自服务器响应', async () => {
  const current = { version: '1.6', versionCode: 290003 };
  await expect(checkForUpdates(current, async () => Response.json({ message: 'API rate limit exceeded' }, { status: 403 })))
    .rejects.toThrow('频率受限（HTTP 403）');
  await expect(checkForUpdates(current, async () => Response.json({ message: 'Forbidden' }, { status: 403 })))
    .rejects.toThrow('拒绝访问');
  await expect(checkForUpdates(current, async () => new Response('', { status: 403, headers: { 'retry-after': '45' } })))
    .rejects.toThrow('约 45 秒后重试');
  await expect(checkForUpdates(current, async () => new Response('', { status: 429, headers: { 'retry-after': 'invalid' } })))
    .rejects.toThrow('请稍后重试');
  await expect(checkForUpdates(current, async () => new Response('', { status: 403, headers: {
    'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120),
  } }))).rejects.toThrow(/约 1[12]\d 秒后重试/);
  await expect(checkForUpdates(current, async () => new Response('', { status: 429, headers: {
    'retry-after': new Date(Date.now() + 60000).toUTCString(),
  } }))).rejects.toThrow(/约 (59|60) 秒后重试/);
});

test('离开设置页可以取消检查，已经取消时不会发请求', async () => {
  let calls = 0;
  await expect(checkForUpdates({ version: '1.6', versionCode: 290003 }, async () => { calls++; return Response.json(fixture()); }, AbortSignal.abort())).rejects.toThrow('已取消');
  expect(calls).toBe(0);
  const controller = new AbortController();
  const pending = checkForUpdates({ version: '1.6', versionCode: 290003 }, async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
  }), controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow('已取消检查更新');
});
