import { expect, test } from 'bun:test';
import type { Activity, ProviderSession } from '@sign/shared';
import { activities, activityDetail, readCourseActivities } from './activities';
import { RequestSession } from './session';
import { parseStatusPage, parseSubmitResponse, signStatus, submit } from './sign';

const account: ProviderSession = { identifier: 'synthetic', encryptedPassword: 'synthetic', cookies: [], userId: 'student', fid: '0', name: '测试账号', deviceCode: 'test' };
const activity: Activity = { id: 'fifth', courseId: 'team-course', classId: 'team-class', source: 'course', title: '第五次签到', kind: 'click', startTime: null, endTime: null, signed: null, ext: '{}' };
const list = (userStatus: unknown, extra: Record<string, unknown> = {}) => ({ data: { ext: {} as Record<string, unknown> | string, activeList: [
  { id: 'fourth', nameOne: '第四次签到', type: 2, otherId: 0, status: 1, userStatus: 1 },
  { id: 'fifth', nameOne: '第五次签到', type: 2, otherId: 0, status: 1, userStatus, ...extra },
] } });

test('活动列表和详情都能识别拍照要求，详情可补齐列表的类型', async () => {
  for (const ifphoto of [1, undefined]) {
    const response = list(0, { ifphoto });
    const [, cached] = await readCourseActivities(new RequestSession(account, async () => Response.json(response)), activity.courseId, activity.classId);
    expect(cached.kind).toBe(ifphoto ? 'photo' : 'click');
    const actual = await activityDetail(account, cached, async () => Response.json({ data: { otherId: 0, ifphoto: 1 } }));
    expect(actual).toMatchObject({ kind: 'photo', requirements: { photo: true } });
  }
});

test('状态对象支持嵌套字段、转义引号及字符串中的括号', () => {
  const record = { status: 1, extra: { text: '带有 {括号} 和 "引号"' } };
  expect(parseStatusPage(JSON.stringify({ primaryAttend: record })).state).toBe('SIGNED');
  expect(parseStatusPage(`var primaryAttend = ${JSON.stringify(record)};`).state).toBe('SIGNED');
  expect(parseStatusPage('var signstatus = "0";').state).toBe('READY');
  expect(parseStatusPage('{"signstatus":"1"}').state).toBe('SIGNED');
  expect(parseStatusPage('var primaryAttend = {"status":null}; var signstatus = 1;').state).toBe('SIGNED');
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

test('未知个人状态通过课程列表核查，未知的活动状态不会假定已结束', async () => {
  for (const status of [1, 0, 7]) {
    const calls: string[] = [];
    const result = signStatus(account, activity, async url => {
      const path = new URL(url).pathname;
      calls.push(path);
      return path.endsWith('/preSign') ? new Response('signstatus = 7') : Response.json(list(0, { status }));
    });
    if (status === 1) expect((await result).state).toBe('READY');
    else await expect(result).rejects.toMatchObject({ code: 'PROVIDER_CHANGED' });
    expect(calls).toEqual(['/newsign/preSign', '/v2/apis/active/student/activelist']);
  }
});

test('列表中其他签到成功不代表第五次成功，缺少目标活动时不放行', async () => {
  await expect(signStatus(account, activity, async url => new URL(url).pathname.endsWith('/preSign')
    ? new Response('<html>未知页面</html>')
    : Response.json({ data: { activeList: [list(0).data.activeList[0]], ext: {} } })))
    .rejects.toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });
});

test('列表 userStatus=1 不能代表个人签到成功，截止单独判断', async () => {
  for (const [userStatus, extra, expected] of [
    [1, {}, 'READY'], [0, { status: 2 }, 'EXPIRED'], [0, { endTime: Date.now() - 1 }, 'READY'],
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
    expect(result.state).toBe(actuallySigned ? 'SIGNED' : 'WAITING_CONFIRMATION');
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

test('单个活动状态未知时继续同步同课程的其他活动', async () => {
  const ids = ['fifth', 'fourth', 'third'];
  const result = await activities(account, activity.courseId, activity.classId, async url => {
    const target = new URL(url);
    if (target.pathname.endsWith('/activelist')) {
      return Response.json({ data: { activeList: ids.map(id => ({ id, type: 2, otherId: 0, status: 2, userStatus: 1 })) } });
    }
    if (target.pathname.endsWith('/preSign')) {
      const id = target.searchParams.get('activePrimaryId');
      return new Response(id === 'fifth' ? 'var signstatus = 5;' : id === 'fourth' ? 'var signstatus = 1;' : '下次早点哦');
    }
    throw new Error('读取列表不应请求其他接口');
  });
  expect(result.map(item => [item.id, item.signed])).toEqual([['fifth', null], ['fourth', true], ['third', false]]);
});

test('单条活动无权限不会丢弃同课程其它活动', async () => {
  const result = await activities(account, activity.courseId, activity.classId, async url => {
    const target = new URL(url);
    if (target.pathname.endsWith('/activelist')) return Response.json(list(0));
    return new Response(target.searchParams.get('activePrimaryId') === 'fifth' ? '校验失败，未查询到活动数据' : 'signstatus = 1');
  });
  expect(result.map(item => [item.id, item.signed])).toEqual([['fourth', true], ['fifth', null]]);
});

test('活动列表仍会报告会话过期', async () => {
  await expect(activities(account, activity.courseId, activity.classId, async url =>
    new URL(url).pathname.endsWith('/activelist')
      ? Response.json(list(0))
      : new Response('<form action="https://passport2.chaoxing.com/fanyalogin"><input type="password"></form>')
  )).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
});

test('已被服务端接受的提交在个人结果查询失败时保持待确认', async () => {
  let sent = false;
  const result = await submit(account, activity, { kind: 'click' }, async url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 0 } });
    if (path.endsWith('/preSign')) return sent ? new Response('', { status: 503 }) : new Response('signstatus = 0');
    if (path.endsWith('/analysis')) return new Response("code='+'abc'");
    if (path.endsWith('/analysis2')) return new Response('ok');
    if (path.endsWith('/stuSignajax')) { sent = true; return new Response('success'); }
    throw new Error('未知请求');
  });
  expect(sent).toBe(true);
  expect(result.state).toBe('WAITING_CONFIRMATION');
});

test('照片和新出现的位置要求返回可补填错误，在发现要求之前不会上传或提交', async () => {
  for (const details of [{ otherId: 0, ifphoto: 1 }, { otherId: 0, ifopenAddress: 1 }]) {
    const paths: string[] = [];
    await expect(submit(account, activity, { kind: 'click' }, async url => {
      const path = new URL(url).pathname;
      paths.push(path);
      if (path.endsWith('/preSign')) return new Response('signstatus = 0');
      return Response.json({ data: details });
    })).rejects.toMatchObject({ code: 'SIGN_INPUT_CHANGED' });
    expect(paths).toEqual(['/newsign/preSign', '/v2/apis/active/getPPTActiveInfo']);
  }
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

test('预签到确认 token 容忍页面拼接格式漂移', async () => {
  const variants: [string, string][] = [
    ["code='+'abc'", 'abc'],
    ["code = '+'abc'", 'abc'],
    ['code="+"abc"', 'abc'],
    ["code=' + 'abc'", 'abc'],
    ['code=abc', 'abc'],
    ["&amp;code='+'abc'", 'abc'],
    ["$.ajax({url:'/pptSign/analysis2?DB_STRATEGY=RANDOM&amp;code='+'76e7e8b6ab86ccfd7e71de0495bbe3fb'});", '76e7e8b6ab86ccfd7e71de0495bbe3fb'],
  ];
  for (const [page, expected] of variants) {
    let sent = false; let confirmed = '';
    const result = await submit(account, activity, { kind: 'click' }, async url => {
      const target = new URL(url); const path = target.pathname;
      if (path.endsWith('/preSign')) return new Response(`signstatus = ${sent ? 1 : 0}`);
      if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 0 } });
      if (path.endsWith('/analysis')) return new Response(page);
      if (path.endsWith('/analysis2')) { confirmed = target.searchParams.get('code') ?? ''; return new Response('ok'); }
      if (path.endsWith('/stuSignajax')) { sent = true; return new Response('success'); }
      throw new Error('未知请求');
    });
    expect(confirmed).toBe(expected);
    expect(sent).toBe(true);
    expect(result.state).toBe('SIGNED');
  }
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

test('二维码校验无法确认时放行给提交，明确过期才拦截', async () => {
  const target: Activity = { ...activity, kind: 'qr' };
  const input = { kind: 'qr' as const, qrPayload: `https://mobilelearn.chaoxing.com/x?aid=${target.id}&enc=test&c=current`, scannedAt: new Date().toISOString() };
  for (const detail of ['{}', 'not-json', 'network']) {
    let sent = false;
    const result = await submit(account, target, input, async url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/preSign')) return new Response(`signstatus = ${sent ? 1 : 0}`);
      if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 2 } });
      if (path.endsWith('/analysis')) return new Response("code='+'abc'");
      if (path.endsWith('/analysis2')) return new Response('ok');
      if (path.endsWith('/signDetail')) return detail === 'network' ? new Response('err', { status: 503 }) : new Response(detail);
      if (path.endsWith('/stuSignajax')) { sent = true; return new Response('success'); }
      throw new Error('未知请求');
    });
    expect(sent).toBe(true);
    expect(result.state).toBe('SIGNED');
  }
  let sent = false;
  await expect(submit(account, target, input, async url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/preSign')) return new Response('signstatus = 0');
    if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 2 } });
    if (path.endsWith('/analysis')) return new Response("code='+'abc'");
    if (path.endsWith('/analysis2')) return new Response('ok');
    if (path.endsWith('/signDetail')) return Response.json({ isOver: 0, signCode: 'changed' });
    sent = true; throw new Error('明确换码不应提交');
  })).rejects.toMatchObject({ code: 'QR_EXPIRED' });
  expect(sent).toBe(false);
});

test('二维码人脸签到：未提供照片时等待，提供照片后携带 faceEnc 提交', async () => {
  const target: Activity = { ...activity, kind: 'qr' };
  const input = {
    kind: 'qr' as const,
    qrPayload: `https://mobilelearn.chaoxing.com/x?aid=${target.id}&enc=test`,
    scannedAt: new Date().toISOString(),
  };
  const waitingCalls: string[] = [];
  const waiting = await submit(account, target, input, async url => {
    const path = new URL(url).pathname;
    waitingCalls.push(path);
    if (path.endsWith('/preSign')) return new Response('signstatus = 0');
    if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 2, openCheckFaceFlag: 1 } });
    throw new Error('缺少人脸照片时不应提交');
  });
  expect(waiting.state).toBe('WAITING_FACE');
  expect(waitingCalls).toEqual(['/newsign/preSign', '/v2/apis/active/getPPTActiveInfo']);

  let signed = false;
  const result = await submit(account, target, { ...input, scannedAt: new Date().toISOString() }, async url => {
    const targetUrl = new URL(url);
    const path = targetUrl.pathname;
    if (path.endsWith('/preSign')) return new Response(`signstatus = ${signed ? 1 : 0}`);
    if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 2, openCheckFaceFlag: 1 } });
    if (path.endsWith('/analysis')) return new Response("code='+'abc'");
    if (path.endsWith('/analysis2')) return new Response('ok');
    if (path.endsWith('/check-face-result')) {
      const faceResult = JSON.parse(targetUrl.searchParams.get('faceResult')!);
      expect(faceResult.currentFaceId).toBe('face-photo');
      expect(faceResult.LiveDetectionStatus).toBe(1);
      return Response.json({ enc: 'face-ok' });
    }
    if (path.endsWith('/stuSignajax')) {
      expect(targetUrl.searchParams.get('faceEnc')).toBe('face-ok');
      expect(targetUrl.searchParams.get('currentFaceId')).toBe('face-photo');
      expect(targetUrl.searchParams.get('enc')).toBe('test');
      signed = true;
      return new Response('success');
    }
    throw new Error('遇到未知请求');
  }, 'face-photo');
  expect(result).toMatchObject({ state: 'SIGNED', submitted: true });
});

test('会话 clientId 透传到人脸材料，无法解码时仍按无签名提交', async () => {
  let signed = false;
  const result = await submit({ ...account, clientId: 'undecodable-client-id' }, activity, { kind: 'click' }, async url => {
    const target = new URL(url);
    const path = target.pathname;
    if (path.endsWith('/preSign')) return new Response(`signstatus = ${signed ? 1 : 0}`);
    if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 0, openCheckFaceFlag: 1 } });
    if (path.endsWith('/analysis')) return new Response("code='+'abc'");
    if (path.endsWith('/analysis2')) return new Response('ok');
    if (path.endsWith('/check-face-result')) {
      const faceResult = JSON.parse(target.searchParams.get('faceResult')!);
      expect(faceResult.currentFaceId).toBe('face-photo');
      expect(faceResult.LiveDetectionStatus).toBe(1);
      expect(faceResult.signToken).toBeUndefined();
      return Response.json({ enc: 'face-ok' });
    }
    if (path.endsWith('/stuSignajax')) { signed = true; return new Response('success'); }
    throw new Error('遇到未知请求');
  }, 'face-photo');
  expect(result).toMatchObject({ state: 'SIGNED', submitted: true });
});

test('checkFace_ 返回 enc2 时自动带 enc2 重提一次', async () => {
  let submissions = 0; let proofs = 0;
  const result = await submit(account, activity, { kind: 'click' }, async url => {
    const target = new URL(url);
    const path = target.pathname;
    if (path.endsWith('/preSign')) return new Response(`signstatus = ${submissions ? 1 : 0}`);
    if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 0, openCheckFaceFlag: 1 } });
    if (path.endsWith('/analysis')) return new Response("code='+'abc'");
    if (path.endsWith('/analysis2')) return new Response('ok');
    if (path.endsWith('/check-face-result')) { proofs++; return Response.json({ enc: 'face-ok' }); }
    if (path.endsWith('/stuSignajax')) {
      submissions++;
      if (submissions === 1) {
        expect(target.searchParams.get('enc2')).toBeNull();
        return new Response('checkFace_retry-enc');
      }
      expect(target.searchParams.get('enc2')).toBe('retry-enc');
      expect(target.searchParams.get('faceEnc')).toBe('face-ok');
      return new Response('success');
    }
    throw new Error('遇到未知请求');
  }, 'face-photo');
  expect(result).toMatchObject({ state: 'SIGNED', submitted: true });
  expect(submissions).toBe(2);
  expect(proofs).toBe(2);
});

test('checkFace_ 无 enc2 或重提仍要求人脸时回到等待验证', async () => {
  for (const reply of ['checkFace_', 'checkFace_retry-enc']) {
    let submissions = 0;
    const result = await submit(account, activity, { kind: 'click' }, async url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/preSign')) return new Response('signstatus = 0');
      if (path.endsWith('/getPPTActiveInfo')) return Response.json({ data: { otherId: 0, openCheckFaceFlag: 1 } });
      if (path.endsWith('/analysis')) return new Response("code='+'abc'");
      if (path.endsWith('/analysis2')) return new Response('ok');
      if (path.endsWith('/check-face-result')) return Response.json({ enc: 'face-ok' });
      if (path.endsWith('/stuSignajax')) { submissions++; return new Response(reply); }
      throw new Error('遇到未知请求');
    }, 'face-photo');
    expect(result.state).toBe('WAITING_FACE');
    expect(submissions).toBe(reply === 'checkFace_' ? 1 : 2);
  }
});

test('成功响应容忍中文与首尾标点，仍归入待核验而非直接成功', () => {
  for (const ok of ['success', '签到成功', 'success。', '签到成功！', 'SUCCESS']) {
    expect(parseSubmitResponse(ok).state).toBe('READY');
  }
  expect(parseSubmitResponse('success2').state).toBe('EXPIRED');
  expect(parseSubmitResponse('您已签到过了').state).toBe('SIGNED');
});

test('明确的人脸和活体提示归入等待验证', () => {
  expect(parseSubmitResponse('请先完成人脸验证。').state).toBe('WAITING_FACE');
  expect(parseSubmitResponse('{"result":false,"msg":"活体验证参数缺失"}').state).toBe('WAITING_FACE');
  expect(() => parseSubmitResponse('人脸模块暂时不可用')).toThrow('人脸模块暂时不可用');
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
