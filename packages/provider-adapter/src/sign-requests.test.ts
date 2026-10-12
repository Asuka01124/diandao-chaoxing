import { expect, test } from 'bun:test';
import type { Activity, ProviderSession, SignInput } from '@sign/shared';
import { submit } from './sign';

const account: ProviderSession = {
  identifier: 'fixture-account', encryptedPassword: 'fixture-only', userId: 'fixture-user', fid: 'fixture-fid',
  name: '离线测试', deviceCode: 'fixture-device',
  cookies: [{ name: 'sid', value: 'fixture-cookie', domain: 'chaoxing.com', path: '/' }],
};
const base: Activity = {
  id: 'fixture-activity', courseId: 'fixture-course', classId: 'fixture-class', source: 'course',
  title: '离线活动', kind: 'click', startTime: null, endTime: null, signed: false, ext: '{}',
};
const point = { latitude: 31.123456789, longitude: 121.987654321, address: '离线测试位置' };
const cases: { label: string; input: SignInput; detail: object; fields: Record<string, string> }[] = [
  { label: '普通', input: { kind: 'click' }, detail: { otherId: 0 }, fields: {} },
  { label: '照片', input: { kind: 'photo', mediaIdByAccount: { 'fixture-user': 'fixture-photo', other: 'other-photo' } }, detail: { otherId: 0, ifphoto: 1 }, fields: { objectId: 'fixture-photo' } },
  { label: '位置', input: { kind: 'location', ...point }, detail: { otherId: 4 }, fields: { address: point.address, ifTiJiao: '1', vpProbability: '-1', vpStrategy: '' } },
  { label: '二维码', input: { kind: 'qr', qrPayload: 'https://mobilelearn.chaoxing.com/widget/sign?aid=fixture-activity&enc=fixture-enc&c=fixture-current', scannedAt: new Date().toISOString() }, detail: { otherId: 2 }, fields: { enc: 'fixture-enc', vpProbability: '-1', vpStrategy: '' } },
  { label: '签到码', input: { kind: 'code', code: '123456' }, detail: { otherId: 5 }, fields: { signCode: '123456' } },
  { label: '手势', input: { kind: 'gesture', sequence: '12369' }, detail: { otherId: 3 }, fields: { signCode: '12369' } },
];

for (const fixture of cases) {
  test(`${fixture.label}签到离线验证请求参数、会话、提交顺序和个人结果核验`, async () => {
    let submitted = false;
    const paths: string[] = [];
    const result = await submit(account, { ...base, kind: fixture.input.kind }, fixture.input, async (address, init) => {
      const url = new URL(address);
      paths.push(url.pathname);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('mobilelearn.chaoxing.com');
      expect(new Headers(init.headers).get('cookie')).toBe('sid=fixture-cookie');
      if (url.pathname.endsWith('/preSign')) {
        expect(init.method).toBe('POST');
        expect(url.searchParams.get('activePrimaryId')).toBe(base.id);
        expect(url.searchParams.get('classId')).toBe(base.classId);
        expect(new URLSearchParams(String(init.body)).get('ext')).toBe('{}');
        return new Response(`signstatus = ${submitted ? 1 : 0}`);
      }
      if (url.pathname.endsWith('/getPPTActiveInfo')) return Response.json({ data: fixture.detail });
      if (url.pathname.endsWith('/analysis')) return new Response("code='+'abc123'");
      if (url.pathname.endsWith('/analysis2')) {
        expect(url.searchParams.get('code')).toBe('abc123');
        return new Response('ok');
      }
      if (url.pathname.endsWith('/signDetail')) {
        expect(url.searchParams.get('msg')).toBe('fixture-current');
        return Response.json({ isOver: 0, signCode: 'fixture-current' });
      }
      expect(url.pathname).toBe('/pptSign/stuSignajax');
      expect(init.method ?? 'GET').toBe('GET');
      const expected: Record<string, string> = {
        activeId: base.id, courseId: base.courseId, uid: account.userId, fid: account.fid,
        name: account.name, deviceCode: account.deviceCode, clientip: '', appType: '15',
        latitude: '-1', longitude: '-1', ...fixture.fields,
      };
      if (fixture.input.kind === 'location') {
        const location = JSON.stringify({ result: 1, latitude: 31.123457, longitude: 121.987654, address: point.address });
        Object.assign(expected, { latitude: '31.123457', longitude: '121.987654', location, locationResult: location });
      }
      expect(Object.fromEntries(url.searchParams)).toEqual(expected);
      submitted = true;
      return new Response('success');
    });
    expect(result).toEqual({ state: 'SIGNED', submitted: true });
    expect(paths).toEqual([
      '/newsign/preSign', '/v2/apis/active/getPPTActiveInfo', '/pptSign/analysis', '/pptSign/analysis2',
      ...(fixture.input.kind === 'qr' ? ['/newsign/signDetail'] : []), '/pptSign/stuSignajax', '/newsign/preSign',
    ]);
  });
}

test('测试环境禁止默认 fetch 访问真实学习通接口', async () => {
  await expect(fetch('https://mobilelearn.chaoxing.com/')).rejects.toThrow('离线测试禁止真实网络请求');
});
