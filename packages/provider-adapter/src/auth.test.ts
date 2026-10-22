import { expect, test } from "bun:test";
import { login } from "./auth";
import { courseCover, courses } from "./courses";
import { RequestSession } from "./session";

test("登录 Cookie 跨学习通子域传递给身份查询", async () => {
  let identityCookie = "";
  const session = await login(
    "13800000000",
    "password123",
    "device",
    async (url, init) => {
      if (url.includes("/fanyalogin"))
        return Response.json(
          { status: true },
          { headers: { "set-cookie": "sid=abc; Path=/; HttpOnly" } },
        );
      identityCookie = new Headers(init.headers).get("cookie") ?? "";
      return Response.json({ msg: { puid: 123, fid: 0, name: "测试用户" } });
    },
  );
  expect(identityCookie).toContain("sid=abc");
  expect(session.userId).toBe("123");
  expect(session.name).toBe("测试用户");
});

test("身份查询返回未登录时给出可操作的错误", async () => {
  await expect(
    login("13800000000", "password123", "device", async (url) =>
      url.includes("/fanyalogin")
        ? Response.json(
            { status: true },
            { headers: { "set-cookie": "sid=abc; Path=/" } },
          )
        : Response.json({ result: 0, errorMsg: "非法请求,请重新登录(>_<)" }),
    ),
  ).rejects.toMatchObject({
    code: "REAUTH_REQUIRED",
    message: "学习通登录状态未建立，请重新登录",
  });
});

test("登录失败时显示学习通返回的原因", async () => {
  await expect(
    login("13800000000", "bad-password", "device", async () =>
      Response.json({ status: false, msg2: "账号或密码错误" }),
    ),
  ).rejects.toMatchObject({
    code: "REAUTH_REQUIRED",
    message: "账号或密码错误",
  });
});

test("登录及身份查询的服务器异常只显示易懂提示", async () => {
  const errorPage = '<html><h1>Apache Tomcat/7.0.37 - HTTP Status 500</h1>' +
    '<p>java.lang.IllegalArgumentException: Model has no value for key &quot;result&quot; ' +
    '服务异常，请重试[805001]</p></html>';
  for (const failedStep of ['login', 'identity']) {
    await expect(
      login('13800000000', 'password123', 'device', async (url) => {
        if (failedStep === 'identity' && url.includes('/fanyalogin')) {
          return Response.json({ status: true }, { headers: { 'set-cookie': 'sid=abc; Path=/' } });
        }
        return new Response(errorPage, { status: 500 });
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: '学习通暂时无法提供服务，请稍后再试',
      retryable: true,
    });
  }
});

test("HTTP 登录错误根据原因给出操作提示，不展示响应原文", async () => {
  const cases = [
    [429, '操作太频繁了，请稍等一会儿再试', 'RATE_LIMITED', true],
    [401, '学习通登录已过期，请重新登录', 'UNKNOWN', false],
    [403, '学习通暂时不允许访问，请稍后再试', 'UNKNOWN', false],
    [408, '连接学习通超时，请检查网络后重试', 'UNKNOWN', false],
    [400, '学习通未能处理这次请求，请稍后再试', 'UNKNOWN', false],
  ] as const;
  for (const [status, message, code, retryable] of cases) {
    await expect(
      login('13800000000', 'password123', 'device', async () =>
        new Response('<html>Exception report: internal error</html>', { status })),
    ).rejects.toMatchObject({ code, message, retryable });
  }
});

test("登录会话可继续读取课程", async () => {
  const session = await login(
    "13800000000",
    "password123",
    "device",
    async (url) =>
      url.includes("/fanyalogin")
        ? Response.json(
            { status: true },
            { headers: { "set-cookie": "sid=abc; Path=/; HttpOnly" } },
          )
        : Response.json({ msg: { puid: 123, fid: 0, name: "测试用户" } }),
  );
  let courseCookie = "";
  const list = await courses(session, async (_url, init) => {
    courseCookie = new Headers(init.headers).get("cookie") ?? "";
    return Response.json({
      channelList: [
        {
          cataName: "课程",
          content: { id: 7, course: { data: [{ id: 8, name: "示例课程", imageurl: "http://example.com/course.png" }] } },
        },
      ],
    });
  });
  expect(courseCookie).toContain("sid=abc");
  expect(list).toEqual([
    { id: "8", classId: "7", name: "示例课程", teacher: undefined, imageUrl: "https://example.com/course.png" },
  ]);
});

test("课程封面使用学习通会话下载真实图片", async () => {
  const session = {
    identifier: "13800000000", encryptedPassword: "secret", userId: "123", fid: "0", name: "测试用户", deviceCode: "device",
    cookies: [{ name: "sid", value: "abc", domain: "chaoxing.com", path: "/" }],
  };
  let sentCookie = "";
  const cover = await courseCover(session, "https://p.ananas.chaoxing.com/course.jpg", async (_url, init) => {
    sentCookie = new Headers(init.headers).get("cookie") ?? "";
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "content-type": "image/jpeg" } });
  });
  expect(sentCookie).toContain("sid=abc");
  expect([...cover.bytes]).toEqual([0xff, 0xd8, 0xff]);
  expect(cover.mime).toBe("image/jpeg");
  await expect(courseCover(session, "https://example.com/image.jpg")).rejects.toThrow("无效的课程封面地址");
});

test("登录响应缺少会话 Cookie 时明确提示", async () => {
  await expect(
    login("13800000000", "password123", "device", async () =>
      Response.json({ status: true }),
    ),
  ).rejects.toMatchObject({
    code: "REAUTH_REQUIRED",
    message: "未能完成登录，请检查网络后重试",
  });
});

test("移动端合并的多个 Set-Cookie 仍能分别保存", async () => {
  const jar = new RequestSession(
    undefined,
    async () =>
      new Response("ok", {
        headers: {
          "set-cookie":
            "sid=abc; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/, fid=9; Path=/",
        },
      }),
  );
  await jar.request("https://passport2.chaoxing.com/fanyalogin");
  expect(
    jar
      .exportCookies()
      .map((c) => c.name)
      .sort(),
  ).toEqual(["fid", "sid"]);
});
