import { expect, test } from 'bun:test';
import type { Activity, ProviderSession } from '@sign/shared';
import { activities, readCourseActivities } from './activities';
import { RequestSession } from './session';
import { parseStatusPage, parseSubmitResponse, signStatus, submit } from './sign';

const account: ProviderSession = { identifier: 'synthetic', encryptedPassword: 'synthetic', cookies: [], userId: 'student', fid: '0', name: '测试账号', deviceCode: 'test' };
const activity: Activity = { id: 'fifth', courseId: 'team-course', classId: 'team-class', source: 'course', title: '第五次签到', kind: 'click', startTime: null, endTime: null, signed: null, ext: '{}' };
const list = (userStatus: unknown, extra: Record<string, unknown> = {}) => ({ data: { ext: {} as Record<string, unknown> | string, activeList: [
  { id: 'fourth', nameOne: '第四次签到', type: 2, otherId: 0, status: 1, userStatus: 1 },
  { id: 'fifth', nameOne: '第五次签到', type: 2, otherId: 0, status: 1, userStatus, ...extra },
] } });

test('状态对象支持嵌套字段、转义引号及字符串中的括号', () => {
  const record = { status: 1, extra: { text: '带有 {括号} 和 "引号"' } };
  expect(parseStatusPage(JSON.stringify({ primaryAttend: record })).state).toBe('SIGNED');
  expect(parseStatusPage(`var primaryAttend = ${JSON.stringify(record)};`).state).toBe('SIGNED');
  expect(parseStatusPage('var signstatus = "0";').state).toBe('READY');
  expect(parseStatusPage('{"signstatus":"1"}').state).toBe('SIGNED');
});

test('未知状态、null 和空字符串不能当成允许提交', () => {
  for (const status of [999, -1, null, '', false, 1.5]) {
    expect(() => parseStatusPage(JSON.stringify({ primaryAttend: { status } }))).toThrow();
  }
  expect(() => parseStatusPage('signstatus = 999')).toThrow();
  expect(() => parseStatusPage('signstatus = -1')).toThrow();
});

test('活动列表保留未知签到状态，不把字符串 ext 再次编码', async () => {
  const response = list(999);
  response.data.ext = '{"token":"synthetic"}';
  const result = await readCourseActivities(new RequestSession(account, async () => Response.json(response)), activity.courseId, activity.classId);
  expect(result[1].signed).toBeNull();
  expect(result[1].ext).toBe('{"token":"synthetic"}');
});

test('没有状态字段的预签到页通过同一账号活动列表确认第五次未签到', async () => {
  const paths: string[] = [];
  const result = await signStatus(account, activity, async (url, init) => {
    const target = new URL(url); paths.push(target.pathname);
    if (target.pathname.endsWith('/preSign')) return new Response('<html>签到页面</html>', { headers: { 'set-cookie': 'ctx=current; Domain=.chaoxing.com; Path=/' } });
    expect(new Headers(init.headers).get('cookie')).toBe('ctx=current');
    expect(target.searchParams.get('courseId')).toBe('team-course');
    expect(target.searchParams.get('classId')).toBe('team-class');
    return Response.json(list(0));
  });
  expect(result.state).toBe('READY');
  expect(paths).toEqual(['/newsign/preSign', '/v2/apis/active/student/activelist']);
});

test('列表中其他签到成功不代表第五次成功，缺少目标活动时不放行', async () => {
  await expect(signStatus(account, activity, async url => new URL(url).pathname.endsWith('/preSign')
    ? new Response('<html>未知页面</html>')
    : Response.json({ data: { activeList: [list(0).data.activeList[0]], ext: {} } })))
    .rejects.toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });
});

test('列表 userStatus=1 不能代表个人签到成功，截止单独判断', async () => {
  for (const [userStatus, extra, expected] of [
    [1, {}, 'READY'], [0, { status: 2 }, 'EXPIRED'], [0, { endTime: Date.now() - 1 }, 'EXPIRED'],
  ] as const) {
    expect((await signStatus(account, activity, async url => new URL(url).pathname.endsWith('/preSign')
      ? new Response('<html>签到页面</html>') : Response.json(list(userStatus, extra)))).state).toBe(expected);
  }
  expect((await signStatus(account, activity, async url => new URL(url).pathname.endsWith('/preSign')
    ? new Response('<html>签到页面</html>') : Response.json(list(999)))).state).toBe('READY');
});

test('过期预签到参数会按当前账号的列表刷新后重新建立上下文', async () => {
  const response = list(0);
  response.data.ext = '{"context":"fresh"}';
  let reads = 0;
  const result = await signStatus(account, activity, async (url, init) => {
    if (new URL(url).pathname.endsWith('/preSign')) {
      if (++reads === 1) return new Response('校验失败，未查询到活动数据');
      expect(new URLSearchParams(String(init.body)).get('ext')).toBe('{"context":"fresh"}');
      return new Response('signstatus = 0');
    }
    return Response.json(response);
  });
  expect(reads).toBe(2); expect(result.state).toBe('READY');
});

test('登录页面明确要求重新授权，不通过活动列表掩盖会话过期', async () => {
  const paths: string[] = [];
  await expect(signStatus(account, activity, async url => {
    paths.push(new URL(url).pathname);
    return new Response('<form action="https://passport2.chaoxing.com/fanyalogin"><input type="password"></form>');
  })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  expect(paths).toEqual(['/newsign/preSign']);
});

test('提交后必须由个人结果确认成功，列表 userStatus 不作为提交结果', async () => {
  for (const actuallySigned of [true, false]) {
    let sent = false;
    const result = await submit(account, activity, { kind: 'click' }, async url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 0 } });
      if (path.endsWith('/preSign')) return new Response(sent && actuallySigned ? 'var signstatus = 1;' : '<html>签到页面</html>');
      if (path.endsWith('/activelist')) return Response.json(list(1));
      if (path.endsWith('/analysis')) return new Response("code='+'abc'");
      if (path.endsWith('/analysis2')) return new Response('ok');
      if (path.endsWith('/stuSignajax')) { sent = true; return new Response('success'); }
      throw new Error('不应请求其他接口');
    });
    expect(sent).toBe(true);
    expect(result.state).toBe(actuallySigned ? 'SIGNED' : 'READY');
    expect(Boolean(result.submitted)).toBe(actuallySigned);
  }
});

test('真实响应回归：四次列表标记都为 1，第五次未签到，其余三次已签到', async () => {
  const ids = ['fifth', 'fourth', 'third', 'second'];
  let submissions = 0;
  const result = await activities(account, activity.courseId, activity.classId, async url => {
    const target = new URL(url);
    if (target.pathname.endsWith('/activelist')) return Response.json({ data: { ext: {}, activeList: ids.map(id => ({ id, nameOne: id, type: 2, otherId: 0, status: 2, userStatus: 1 })) } });
    if (target.pathname.endsWith('/preSign')) return new Response(target.searchParams.get('activePrimaryId') === 'fifth'
      ? '<html>提示 已过教师设置的截止时间 下次早点哦</html>'
      : '<script>var signstatus = 1;</script><div>签到成功</div>');
    submissions++; throw new Error('读取列表不应发送提交');
  });
  expect(result.map(a => [a.id, a.signed])).toEqual([['fifth', false], ['fourth', true], ['third', true], ['second', true]]);
  expect(submissions).toBe(0);
});

test('活动结束不会覆盖已确认的个人签到记录', () => {
  expect(parseStatusPage('var signstatus = 1; 已过教师设置的截止时间 下次早点哦').state).toBe('SIGNED');
  expect(parseStatusPage('已过教师设置的截止时间 下次早点哦').state).toBe('EXPIRED');
});

test('计数通知紧邻实际提交，普通签到只建立一次上下文并复用 Cookie', async () => {
  const events: string[] = []; let signed = false; let count = 0;
  const result = await submit(account, activity, { kind: 'click' }, async (url, init) => {
    const path = new URL(url).pathname; events.push(path);
    if (path.endsWith('/preSign')) return new Response(`signstatus = ${signed ? 1 : 0}`, { headers: { 'set-cookie': 'signContext=ready; Domain=.chaoxing.com; Path=/' } });
    if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 0 } }, { headers: { 'set-cookie': 'detailContext=live; Domain=.chaoxing.com; Path=/' } });
    expect(new Headers(init.headers).get('cookie')).toContain('signContext=ready');
    expect(new Headers(init.headers).get('cookie')).toContain('detailContext=live');
    if (path.endsWith('/analysis')) return new Response("code='+'abc'");
    if (path.endsWith('/analysis2')) return new Response('ok');
    if (path.endsWith('/stuSignajax')) { expect(count).toBe(1); signed = true; return new Response('success'); }
    throw new Error('未知请求');
  }, undefined, async () => { await Promise.resolve(); events.push('记录提交'); count++; });
  expect(result).toMatchObject({ state: 'SIGNED', submitted: true });
  expect(events).toEqual(['/newsign/preSign', '/v2/apis/active/getPPTActiveInfo', '/pptSign/analysis', '/pptSign/analysis2', '记录提交', '/pptSign/stuSignajax', '/newsign/preSign']);
  expect(account.cookies).toEqual([]);
});

test('已签到、截止、等待验证和准备失败均不增加提交次数', async () => {
  for (const mode of ['signed', 'expired', 'captcha', 'face', 'analysis', 'qr'] as const) {
    let count = 0; let sent = 0;
    const target = mode === 'qr' ? { ...activity, kind: 'qr' as const } : activity;
    const input = mode === 'qr' ? { kind: 'qr' as const, qrPayload: `https://mobilelearn.chaoxing.com/x?aid=${activity.id}&enc=test&c=current`, scannedAt: new Date().toISOString() } : { kind: 'click' as const };
    const outcome = submit(account, target, input, async url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/preSign')) return new Response(mode === 'signed' ? 'signstatus = 1' : mode === 'expired' ? '下次早点哦' : 'signstatus = 0');
      if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: mode === 'qr' ? 2 : 0, ifNeedVCode: mode === 'captcha' ? 1 : 0, openCheckFaceFlag: mode === 'face' ? 1 : 0 } });
      if (path.endsWith('/analysis')) return new Response(mode === 'analysis' ? '参数获取失败' : "code='+'abc'");
      if (path.endsWith('/analysis2')) return new Response('ok');
      if (path.endsWith('/signDetail')) return Response.json({ isOver: 1, signCode: 'old' });
      sent++; throw new Error('不应发送签到提交');
    }, undefined, () => { count++; });
    if (mode === 'analysis' || mode === 'qr') await expect(outcome).rejects.toBeInstanceOf(Error);
    else expect((await outcome).state).toBe(({ signed: 'SIGNED', expired: 'EXPIRED', captcha: 'WAITING_CAPTCHA', face: 'WAITING_FACE' } as const)[mode]);
    expect(count).toBe(0); expect(sent).toBe(0);
  }
});

test('保留学习通文本、JSON 和 HTTP 失败原因，已发请求仍计数', async () => {
  expect(() => parseSubmitResponse('教师已结束本次活动')).toThrow('教师已结束本次活动');
  expect(() => parseSubmitResponse('{"result":false,"msg":"签到码错误"}')).toThrow('签到码错误');
  for (const status of [200, 403]) {
    let count = 0;
    await expect(submit(account, activity, { kind: 'click' }, async url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/preSign')) return new Response('signstatus = 0');
      if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 0 } });
      if (path.endsWith('/analysis')) return new Response("code='+'abc'");
      if (path.endsWith('/analysis2')) return new Response('ok');
      return new Response('{"msg":"当前账号没有签到权限"}', { status });
    }, undefined, () => { count++; })).rejects.toThrow('当前账号没有签到权限');
    expect(count).toBe(1);
  }
});

test('过期 ext 刷新一次，提交后的核验复用新上下文而不修改缓存对象', async () => {
  let signed = false; let listReads = 0; const contexts: string[] = [];
  const result = await submit(account, activity, { kind: 'click' }, async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/preSign')) {
      const ext = new URLSearchParams(String(init.body)).get('ext')!; contexts.push(ext);
      return new Response(ext === '{}' ? '校验失败，未查询到活动数据' : `signstatus = ${signed ? 1 : 0}`);
    }
    if (path.endsWith('/activelist')) { listReads++; const response = list(1); response.data.ext = '{"context":"fresh"}'; return Response.json(response); }
    if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 0 } });
    if (path.endsWith('/analysis')) return new Response("code='+'abc'");
    if (path.endsWith('/analysis2')) return new Response('ok');
    signed = true; return new Response('success');
  });
  expect(result.state).toBe('SIGNED'); expect(listReads).toBe(1);
  expect(contexts).toEqual(['{}', '{"context":"fresh"}', '{"context":"fresh"}']);
  expect(activity.ext).toBe('{}');
});

test('请求在发送前取消时不通知计数，也不调用网络传输', async () => {
  let sent = 0; let count = 0;
  const jar = new RequestSession(account, async () => { sent++; return new Response('success'); });
  await expect(jar.request('https://mobilelearn.chaoxing.com/pptSign/stuSignajax', { signal: AbortSignal.abort() }, 0, () => { count++; })).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
  expect(count).toBe(0); expect(sent).toBe(0);
});
