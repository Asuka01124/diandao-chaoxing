import type { ProviderSession } from "@sign/shared";
import { getOperationSignal } from "./deadline";
import { ProviderError } from "./errors";
import { responseMessage } from './response';

type Cookie = ProviderSession["cookies"][number];
export type Transport = (url: string, init: RequestInit) => Promise<Response>;
const isChaoxingHost = (host: string) =>
  host === "chaoxing.com" || host.endsWith(".chaoxing.com");
export const allowedHost = (host: string) =>
  isChaoxingHost(host) ||
  host === "a1-vip6.easemob.com" ||
  host === "a1-vip6.easecdn.com";
const providerUserAgent =
  "Dalvik/2.1.0 (Linux; U; Android 12; SM-N9006 Build/8aba9e4.0) (schild:2d97f7b9439f21333c946878fc4d6ccb) (device:SM-N9006) Language/zh_CN com.chaoxing.mobile/ChaoXingStudy_3_6.7.5_android_phone_10941_314 (@Kalimdor)_68f184fd763546c1a04ab3a09b3deebb";

export class RequestSession {
  private cookies: Cookie[];
  constructor(
    session?: ProviderSession,
    private transport: Transport = fetch,
  ) {
    this.cookies = [...(session?.cookies ?? [])];
  }
  exportCookies(): Cookie[] {
    return this.cookies.map((c) => ({ ...c }));
  }
  private cookieHeader(url: URL): string {
    // 学习通登录 Cookie 必须在 passport2、sso、mobilelearn 等子域之间复用。
    return this.cookies
      .filter(
        (c) =>
          ((isChaoxingHost(url.hostname) && isChaoxingHost(c.domain)) ||
            ((url.hostname === c.domain ||
              url.hostname.endsWith(`.${c.domain}`)) &&
              url.pathname.startsWith(c.path))) &&
          (!c.expires || c.expires > Date.now()),
      )
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }
  private saveCookies(url: URL, response: Response): void {
    const headers = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const values = headers.getSetCookie?.();
    const lines = values?.length
      ? values
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")!]
        : [];
    for (const raw of lines.flatMap((value) =>
      value.split(/,(?=\s*[^;,\s=]+=)/),
    )) {
      const line = raw.trim();
      const [pair, ...parts] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const attrs = parts.map((p) => p.trim());
      const domain = (
        attrs.find((p) => /^domain=/i.test(p))?.slice(7) ?? url.hostname
      )
        .replace(/^\./, "")
        .toLowerCase();
      if (
        !allowedHost(domain) ||
        !(url.hostname === domain || url.hostname.endsWith(`.${domain}`))
      )
        continue;
      const path = attrs.find((p) => /^path=/i.test(p))?.slice(5) || "/";
      const maxAge = attrs.find((p) => /^max-age=/i.test(p));
      const expires = maxAge
        ? Date.now() + Number(maxAge.slice(8)) * 1000
        : undefined;
      const cookie = {
        name: pair.slice(0, eq),
        value: pair.slice(eq + 1),
        domain,
        path,
        expires,
      };
      this.cookies = this.cookies.filter(
        (c) =>
          !(
            c.name === cookie.name &&
            ((isChaoxingHost(c.domain) && isChaoxingHost(domain)) ||
              (c.domain === domain && c.path === path))
          ),
      );
      if (!maxAge || Number(maxAge.slice(8)) > 0) this.cookies.push(cookie);
    }
  }
  async request(
    url: string,
    init: RequestInit = {},
    redirects = 0,
    beforeSend?: () => void | Promise<void>,
  ): Promise<Response> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !allowedHost(parsed.hostname))
      throw new ProviderError("INVALID_INPUT", "不允许访问该地址");
    const headers = new Headers(init.headers);
    if (isChaoxingHost(parsed.hostname) && !headers.has("user-agent"))
      headers.set("user-agent", providerUserAgent);
    const cookie = this.cookieHeader(parsed);
    if (cookie) headers.set("cookie", cookie);
    let response: Response;
    const signals = [AbortSignal.timeout(12000), getOperationSignal(), init.signal]
      .filter((signal): signal is AbortSignal => Boolean(signal));
    const request = { ...init, headers, credentials: 'omit' as const, redirect: 'manual' as const,
      signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) };
    if (request.signal.aborted) throw new ProviderError('NETWORK_TIMEOUT', '第三方请求已取消', true);
    await beforeSend?.();
    try {
      response = await this.transport(url, request);
    } catch (error) {
      if (
        error instanceof Error &&
        /abort|timeout/i.test(error.name + error.message)
      )
        throw new ProviderError("NETWORK_TIMEOUT", "第三方请求超时", true);
      throw new ProviderError("UNKNOWN", "第三方网络请求失败", true);
    }
    this.saveCookies(parsed, response);
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= 3)
        throw new ProviderError("PROVIDER_CHANGED", "第三方重定向次数异常");
      const location = response.headers.get("location");
      if (!location)
        throw new ProviderError("PROVIDER_CHANGED", "第三方重定向缺少地址");
      return this.request(
        new URL(location, parsed).toString(),
        { method: "GET" },
        redirects + 1,
      );
    }
    if (!response.ok) {
      const detail = responseMessage(await response.text());
      throw new ProviderError(
        response.status === 429 ? "RATE_LIMITED" : "UNKNOWN",
        `学习通 HTTP ${response.status}${detail ? `：${detail}` : ''}`,
        response.status >= 500 || response.status === 429,
      );
    }
    return response;
  }
}
