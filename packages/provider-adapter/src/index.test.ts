import { describe, expect, test } from 'bun:test';
import type { Activity, ProviderSession } from '@sign/shared';
import { ProviderError, RequestSession, activities, activityDetail, checkSession, parseQrPayload, parseStatusPage, parseSubmitResponse, submit, uploadPhoto, withProviderDeadline } from './index';

const session = (name: string): ProviderSession => ({ identifier: name, encryptedPassword: 'secret', cookies: [{ name: 'fid', value: name, domain: 'chaoxing.com', path: '/' }], userId: name, fid: '0', name, deviceCode: 'device' });
const activity: Activity = { id: '123', courseId: '1', classId: '2', source: 'course', title: '签到', kind: 'click', startTime: null, endTime: null, signed: null, ext: '{}' };

describe('第三方响应解析', () => {
  test('只有已知的远端状态被确认为成功', () => {
    expect(parseStatusPage('signstatus = 1').state).toBe('SIGNED');
    expect(parseStatusPage('signstatus = 0').state).toBe('READY');
    expect(() => parseStatusPage('<html>未知页面</html>')).toThrow(ProviderError);
    expect(parseSubmitResponse('success').state).toBe('READY');
    expect(parseSubmitResponse('您已签到过了').state).toBe('SIGNED');
    expect(() => parseSubmitResponse('unexpected')).toThrow(ProviderError);
  });
  test('二维码必须对应当前活动', () => {
    expect(parseQrPayload('https://mobilelearn.chaoxing.com/x?aid=123&enc=abc', activity.id).enc).toBe('abc');
    expect(() => parseQrPayload('https://mobilelearn.chaoxing.com/x?aid=999&enc=abc', activity.id)).toThrow();
    expect(() => parseQrPayload('https://mobilelearn.chaoxing.com/x?enc=abc', activity.id)).toThrow();
    expect(() => parseQrPayload('https://evil.example/x?aid=123&enc=abc', activity.id)).toThrow();
  });
  test('动态二维码失效时不发送签到提交', async () => {
    const paths: string[] = [];
    const transport = async (url: string) => {
      const path = new URL(url).pathname; paths.push(path);
      if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 2, ifNeedVCode: 0, openCheckFaceFlag: 0, ifopenAddress: 0 } });
      if (path.endsWith('/preSign')) return new Response('signstatus = 0');
      if (path.endsWith('/analysis')) return new Response("code='+'abc'");
      if (path.endsWith('/analysis2')) return new Response('ok');
      if (path.endsWith('/signDetail')) return Response.json({ isOver: 1, signCode: 'old' });
      throw new Error('不应提交');
    };
    await expect(submit(session('a'), { ...activity, kind: 'qr' }, { kind: 'qr', qrPayload: 'https://mobilelearn.chaoxing.com/x?aid=123&enc=abc&c=old', scannedAt: new Date().toISOString() }, transport)).rejects.toMatchObject({ code: 'QR_EXPIRED' });
    expect(paths).not.toContain('/pptSign/stuSignajax');
  });
  test('课程活动解析不把缺字段误认为空列表', async () => {
    const transport = async () => Response.json({ data: { activeList: [{ id: 123, type: 2, otherId: '5', nameOne: '密码签到', startTime: 123456, userStatus: 0 }], ext: {} } });
    const list = await activities(session('a'), '1', '2', transport);
    expect(list[0].kind).toBe('code'); expect(list[0].signed).toBe(false);
    await expect(activities(session('a'), '1', '2', async () => Response.json({ data: {} }))).rejects.toMatchObject({ code: 'PROVIDER_CHANGED' });
  });
  test('单击签到经过预签到、分析和结果核验', async () => {
    const calls: string[] = []; let signed = false;
    const transport = async (url: string) => {
      calls.push(new URL(url).pathname);
      if (url.includes('getPPTActiveInfo')) return Response.json({ data: { ifNeedVCode: 0, openCheckFaceFlag: 0, ifopenAddress: 0, ifphoto: 0 } });
      if (url.includes('/newsign/preSign')) return new Response(`signstatus = ${signed ? 1 : 0}`);
      if (url.includes('/pptSign/analysis2')) return new Response('ok');
      if (url.includes('/pptSign/analysis')) return new Response("code='+'abc'");
      if (url.includes('/pptSign/stuSignajax')) { signed = true; return new Response('success'); }
      throw new Error('unexpected request');
    };
    expect(await submit(session('a'), activity, { kind: 'click' }, transport)).toMatchObject({ state: 'SIGNED', submitted: true });
    expect(calls).toEqual(['/v2/apis/active/getPPTActiveInfo', '/newsign/preSign', '/pptSign/analysis', '/pptSign/analysis2', '/pptSign/stuSignajax', '/newsign/preSign']);
  });
  test('活动详情区分照片要求和关联签退', async () => {
    const detail = await activityDetail(session('a'), activity, async () => Response.json({ data: { otherId: 0, ifphoto: 1, signInId: 123, signOutId: 456, signOutPublishTimeStamp: 1790740000000 } }));
    expect(detail.kind).toBe('photo');
    expect(detail.relation?.signOutId).toBe('456');
  });
  test('人脸要求必须取得第三方校验参数后才提交', async () => {
    let signed = false; const paths: string[] = [];
    const transport = async (url: string) => {
      paths.push(new URL(url).pathname);
      if (url.includes('getPPTActiveInfo')) return Response.json({ data: { ifNeedVCode: 0, openCheckFaceFlag: 1, ifopenAddress: 0, ifphoto: 0 } });
      if (url.includes('/newsign/preSign')) return new Response(`signstatus = ${signed ? 1 : 0}`);
      if (url.includes('/pptSign/analysis2')) return new Response('ok');
      if (url.includes('/pptSign/analysis')) return new Response("code='+'abc'");
      if (url.includes('check-face-result')) return Response.json({ enc: 'face-ok' });
      if (url.includes('stuSignajax')) { expect(new URL(url).searchParams.get('faceEnc')).toBe('face-ok'); signed = true; return new Response('success'); }
      throw new Error('unexpected request');
    };
    expect((await submit(session('a'), activity, { kind: 'click' }, transport)).state).toBe('WAITING_FACE');
    expect(paths).not.toContain('/pptSign/stuSignajax');
    expect((await submit(session('a'), activity, { kind: 'click' }, transport, 'face-image')).state).toBe('SIGNED');
  });
});

describe('账号隔离与上传', () => {
  test('整次操作截止时间会取消正在进行的第三方请求', async () => {
    const transport = async (_url: string, init: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
    await expect(withProviderDeadline(() => new RequestSession(session('a'), transport).request('https://mobilelearn.chaoxing.com/x'), 10)).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
  });
  test('每次请求只携带当前账号 Cookie', async () => {
    const seen: string[] = [];
    const transport = async (_url: string, init: RequestInit) => { seen.push(new Headers(init.headers).get('cookie') ?? ''); return new Response('ok'); };
    await Promise.all([new RequestSession(session('alice'), transport).request('https://mobilelearn.chaoxing.com/x'), new RequestSession(session('bob'), transport).request('https://mobilelearn.chaoxing.com/x')]);
    expect(seen.sort()).toEqual(['fid=alice', 'fid=bob']);
  });
  test('照片按会话上传，返回媒体 ID', async () => {
    const jpg = Buffer.from([0xff, 0xd8, ...Array(120).fill(0), 0xff, 0xd9]).toString('base64');
    const seen: string[] = [];
    const transport = async (url: string) => { seen.push(url); return Response.json(url.includes('/api/token/') ? { _token: 'test-token' } : { objectId: 'image-1' }); };
    expect((await uploadPhoto(session('a'), jpg, transport)).mediaId).toBe('image-1');
    expect(seen[1]).toContain('_token=test-token');
  });
  test('过期会话只为当前账号重登并返回新 Cookie', async () => {
    let identityCalls = 0;
    const transport = async (url: string) => {
      if (url.includes('userLogin4Uname')) return Response.json(++identityCalls === 1 ? { msg: null } : { msg: { puid: 'a', fid: '0', name: 'Alice' } });
      if (url.includes('fanyalogin')) return Response.json({ status: true }, { headers: { 'set-cookie': 'sid=fresh; Domain=.chaoxing.com; Path=/' } });
      throw new Error('unexpected request');
    };
    const original = session('a'); const next = await checkSession(original, transport);
    expect(next.cookies.some(c => c.name === 'sid' && c.value === 'fresh')).toBe(true);
    expect(original.cookies.some(c => c.name === 'sid')).toBe(false);
  });
});
