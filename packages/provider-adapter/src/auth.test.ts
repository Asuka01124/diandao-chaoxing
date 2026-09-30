import { expect, test } from 'bun:test';
import { login } from './auth';
import { RequestSession } from './session';

test('登录 Cookie 跨学习通子域传递给身份查询', async () => {
  let identityCookie = '';
  const session = await login('13800000000', 'password123', 'device', async (url, init) => {
    if (url.includes('/fanyalogin')) return Response.json({ status: true }, { headers: { 'set-cookie': 'sid=abc; Path=/; HttpOnly' } });
    identityCookie = new Headers(init.headers).get('cookie') ?? '';
    return Response.json({ msg: { puid: 123, fid: 0, name: '测试用户' } });
  });
  expect(identityCookie).toContain('sid=abc');
  expect(session.userId).toBe('123');
  expect(session.name).toBe('测试用户');
});

test('身份查询返回未登录时给出可操作的错误', async () => {
  await expect(login('13800000000', 'password123', 'device', async url =>
    url.includes('/fanyalogin')
      ? Response.json({ status: true }, { headers: { 'set-cookie': 'sid=abc; Path=/' } })
      : Response.json({ result: 0, errorMsg: '非法请求,请重新登录(>_<)' })
  )).rejects.toMatchObject({ code: 'REAUTH_REQUIRED', message: '学习通登录状态未建立，请重新登录' });
});

test('登录响应缺少会话 Cookie 时明确提示', async () => {
  await expect(login('13800000000', 'password123', 'device', async () => Response.json({ status: true })))
    .rejects.toMatchObject({ code: 'REAUTH_REQUIRED', message: '未收到学习通登录会话，请检查网络后重试' });
});

test('移动端合并的多个 Set-Cookie 仍能分别保存', async () => {
  const jar = new RequestSession(undefined, async () => new Response('ok', { headers: {
    'set-cookie': 'sid=abc; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/, fid=9; Path=/'
  } }));
  await jar.request('https://passport2.chaoxing.com/fanyalogin');
  expect(jar.exportCookies().map(c => c.name).sort()).toEqual(['fid', 'sid']);
});
