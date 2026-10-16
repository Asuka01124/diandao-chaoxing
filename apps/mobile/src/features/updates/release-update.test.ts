import { expect, test } from 'bun:test';
import { checkForUpdates, compareVersions, createUpdateChecker, evaluateUpdate, parseRelease, releaseManifestUrl, repositoryUrl, updateCacheTtl, type UpdateCacheStorage } from './release-update';

function fixture(version = '1.6', versionCode = 290003, tag = `v${version}`) {
  return {
    tag_name: tag, draft: false, prerelease: false, html_url: `${repositoryUrl}/releases/tag/${tag}`,
    assets: [{ name: `daodian-v${version}-arm64.apk`, browser_download_url: `${repositoryUrl}/releases/download/${tag}/daodian-v${version}-arm64.apk`, size: 41000000 }],
    body: `## 更新内容\n- 支持检查版本更新\n- 新增仓库入口\n\n<!-- diandao-release: ${JSON.stringify({ version, versionCode, tag })} -->\n\n构建资料`,
  };
}

test('只读取静态更新附件，不调用 GitHub API 或携带账号与 Cookie', async () => {
  let requests = 0;
  const result = await checkForUpdates({ version: '1.5', versionCode: 280002 }, async (url, init) => {
    requests++;
    expect(url).toBe(releaseManifestUrl);
    expect(url).toBe(`${repositoryUrl}/releases/latest/download/update.json`);
    expect(init.method).toBe('GET'); expect(init.credentials).toBe('omit'); expect(init.body).toBeUndefined();
    const headers = new Headers(init.headers);
    expect(headers.has('cookie')).toBe(false); expect(headers.has('authorization')).toBe(false);
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.has('x-github-api-version')).toBe(false);
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

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    async read() { return value; },
    async write(next: string) { value = next; },
  } satisfies UpdateCacheStorage;
}

test('30 分钟内复用缓存，重建检测器仍可读取，且按当前安装版本重新比较', async () => {
  let time = Date.now(), calls = 0;
  const storage = memoryStorage();
  const transport = async () => { calls++; return Response.json(fixture()); };
  const check = createUpdateChecker(transport, storage, () => time);
  const current = { version: '1.5', versionCode: 280002 };
  expect((await check(current)).available).toBe(true);
  expect((await check(current)).available).toBe(true);
  const restarted = createUpdateChecker(transport, storage, () => time);
  expect((await restarted({ version: '1.6', versionCode: 290003 })).available).toBe(false);
  expect(calls).toBe(1);
  time += updateCacheTtl;
  await restarted(current);
  expect(calls).toBe(2);
});

test('拒绝损坏、外部下载地址、过期和未来时间的缓存', async () => {
  const time = Date.now();
  const invalid = { ...fixture(), html_url: 'https://example.com/release' };
  for (const saved of ['broken', JSON.stringify({ checkedAt: time, manifest: invalid }),
    JSON.stringify({ checkedAt: time - updateCacheTtl, manifest: fixture() }),
    JSON.stringify({ checkedAt: time + 60000, manifest: fixture() })]) {
    let calls = 0;
    const check = createUpdateChecker(async () => { calls++; return Response.json(fixture()); }, memoryStorage(saved), () => time);
    await check({ version: '1.5', versionCode: 280002 });
    expect(calls).toBe(1);
  }
});

test('存储读写失败仍能检测，内存缓存继续生效', async () => {
  let calls = 0;
  const check = createUpdateChecker(async () => { calls++; return Response.json(fixture()); }, {
    async read() { throw new Error('unreadable'); },
    async write() { throw new Error('unwritable'); },
  });
  const current = { version: '1.5', versionCode: 280002 };
  expect((await check(current)).available).toBe(true);
  await check(current);
  expect(calls).toBe(1);
});

test('并发只发送一次请求，单个调用者取消不影响其他调用者', async () => {
  let calls = 0;
  let finish!: (response: Response) => void;
  let networkSignal: AbortSignal | undefined;
  const check = createUpdateChecker(async (_url, init) => {
    calls++; networkSignal = init.signal as AbortSignal;
    return new Promise<Response>(resolve => { finish = resolve; });
  }, memoryStorage());
  const current = { version: '1.5', versionCode: 280002 };
  const controller = new AbortController();
  const first = check(current, controller.signal);
  const second = check(current);
  await Promise.resolve();
  controller.abort();
  await expect(first).rejects.toThrow('已取消');
  expect(networkSignal?.aborted).toBe(false);
  finish(Response.json(fixture()));
  expect((await second).available).toBe(true);
  expect(calls).toBe(1);
});

test('全部调用者取消会中止请求，之后可重新检测且不会缓存取消结果', async () => {
  let calls = 0;
  let networkSignal: AbortSignal | undefined;
  const check = createUpdateChecker(async (_url, init) => {
    calls++;
    if (calls > 1) return Response.json(fixture());
    networkSignal = init.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => networkSignal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  }, memoryStorage());
  const current = { version: '1.5', versionCode: 280002 };
  await expect(check(current, AbortSignal.abort())).rejects.toThrow('已取消');
  expect(calls).toBe(0);
  const controller = new AbortController();
  const pending = check(current, controller.signal);
  await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toThrow('已取消');
  expect(networkSignal?.aborted).toBe(true);
  expect((await check(current)).available).toBe(true);
  expect(calls).toBe(2);
});

test('明确限流期间不重复请求，到期后恢复；普通网络失败允许重试', async () => {
  let time = Date.now(), calls = 0;
  const current = { version: '1.5', versionCode: 280002 };
  const check = createUpdateChecker(async () => {
    calls++;
    return calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '120' } }) : Response.json(fixture());
  }, memoryStorage(), () => time);
  await expect(check(current)).rejects.toThrow('频率受限');
  await expect(check(current)).rejects.toThrow('暂受限');
  expect(calls).toBe(1);
  time += 121000;
  expect((await check(current)).available).toBe(true);
  expect(calls).toBe(2);

  let failures = 0;
  const retry = createUpdateChecker(async () => {
    if (failures++ === 0) throw new Error('offline');
    return Response.json(fixture());
  }, memoryStorage());
  await expect(retry(current)).rejects.toThrow('检查网络');
  expect((await retry(current)).available).toBe(true);
});

test('过期缓存不能把网络错误当成已是最新，缺少静态附件也不回退 GitHub API', async () => {
  let calls = 0;
  const storage = memoryStorage(JSON.stringify({ checkedAt: Date.now() - updateCacheTtl, manifest: fixture() }));
  const check = createUpdateChecker(async url => {
    calls++; expect(url).toBe(releaseManifestUrl);
    return new Response('', { status: 404 });
  }, storage);
  await expect(check({ version: '1.6', versionCode: 290003 })).rejects.toThrow('未找到');
  expect(calls).toBe(1);
});
