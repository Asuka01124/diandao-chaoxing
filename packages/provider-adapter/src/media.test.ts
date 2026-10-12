import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import type { ProviderSession } from '@sign/shared';
import { uploadPhoto } from './media';

const session: ProviderSession = {
  identifier: 'test-user', encryptedPassword: 'test-only', userId: 'test-user', fid: '0', name: '测试', deviceCode: 'test-device',
  cookies: [{ name: 'sid', value: 'test-cookie', domain: 'chaoxing.com', path: '/' }],
};
const jpeg = new Uint8Array([255, 216, 0, 13, 10, 128, 255, 0, 65, 255, 217]);

test('照片 multipart 可被独立解析，字段、JPEG 原始字节和登录会话正确', async () => {
  const paths: string[] = [];
  const transport = async (address: string, init: RequestInit) => {
    const url = new URL(address);
    paths.push(url.pathname);
    if (url.pathname === '/api/token/uservalid') return Response.json({ _token: 'test-token' });
    expect(url.pathname).toBe('/upload');
    expect(url.searchParams.get('_from')).toBe('mobilelearn');
    expect(url.searchParams.get('_token')).toBe('test-token');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('cookie')).toBe('sid=test-cookie');
    expect(new Headers(init.headers).get('content-type')).toMatch(/^multipart\/form-data; boundary=.+$/);
    expect(init.body).toBeInstanceOf(Uint8Array);
    const parsed = await new Request(address, init).formData();
    expect(Array.from(parsed.keys())).toEqual(['puid', 'file']);
    expect(parsed.get('puid')).toBe(session.userId);
    const file = parsed.get('file') as File;
    expect(file.name).toBe('sign.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(jpeg);
    return Response.json({ objectId: 'uploaded-photo' });
  };
  expect(await uploadPhoto(session, Buffer.from(jpeg).toString('base64'), transport)).toEqual({ mediaId: 'uploaded-photo' });
  expect(paths).toEqual(['/api/token/uservalid', '/upload']);
});

test('手机 Blob 和 FormData 不支持文件封装时仍可完成照片上传', async () => {
  const modulePath = new URL('./media.ts', import.meta.url).href;
  const script = `
    globalThis.Blob = class { constructor() { throw new Error('Native Blob rejects ArrayBufferView'); } };
    globalThis.FormData = class { constructor() { throw new Error('Native FormData unavailable'); } };
    const { uploadPhoto } = await import(${JSON.stringify(modulePath)});
    const session = ${JSON.stringify(session)};
    const jpeg = ${JSON.stringify(Buffer.from(jpeg).toString('base64'))};
    const transport = async (url, init) => {
      if (new URL(url).pathname === '/api/token/uservalid') return Response.json({_token:'test-token'});
      if (!(init.body instanceof Uint8Array)) throw new Error('Expected binary body');
      const { normalizeBodyInitAsync } = await import(${JSON.stringify(new URL('../../../node_modules/expo/src/winter/fetch/RequestUtils.ts', import.meta.url).href)});
      const normalized = await normalizeBodyInitAsync(init.body);
      if (!normalized.body || Buffer.compare(Buffer.from(normalized.body), Buffer.from(init.body)) !== 0) throw new Error('Expo changed the binary body');
      return Response.json({objectId:'native-compatible'});
    };
    console.log(JSON.stringify(await uploadPhoto(session, jpeg, transport)));
  `;
  const probe = Bun.spawn([process.execPath, '--preload', fileURLToPath(new URL('../../../scripts/offline-test-guard.ts', import.meta.url)), '--eval', script], { stdout: 'pipe', stderr: 'pipe' });
  const output = await new Response(probe.stdout).text();
  const error = await new Response(probe.stderr).text();
  expect(await probe.exited, error).toBe(0);
  expect(JSON.parse(output)).toEqual({ mediaId: 'native-compatible' });
});

test('错误格式或超过两兆的照片在网络请求前被拒绝', async () => {
  let requests = 0;
  const transport = async () => { requests++; return Response.json({}); };
  await expect(uploadPhoto(session, Buffer.from('not-jpeg').toString('base64'), transport)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  const oversized = new Uint8Array(2_000_001);
  oversized.set([255, 216]); oversized.set([255, 217], oversized.length - 2);
  await expect(uploadPhoto(session, Buffer.from(oversized).toString('base64'), transport)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  expect(requests).toBe(0);
});
