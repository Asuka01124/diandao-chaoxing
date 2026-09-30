import type { ProviderSession } from '@sign/shared';
import { encryptLoginValue } from './crypto';
import { ProviderError } from './errors';
import { asObject, json, str } from './response';
import { RequestSession, type Transport } from './session';

function loginBody(identifier: string, encryptedPassword: string): URLSearchParams {
  return new URLSearchParams({ fid: '-1', uname: encryptLoginValue(identifier), password: encryptedPassword, refer: 'https://i.chaoxing.com', t: 'true', forbidotherlogin: '0', validate: '', doubleFactorLogin: '0', independentId: '0', independentNameId: '0' });
}
async function identity(jar: RequestSession): Promise<{ userId: string; fid: string; name: string; uid?: string; imEncryptedPassword?: string }> {
  const body = await json(await jar.request('https://sso.chaoxing.com/apis/login/userLogin4Uname.do'));
  if (!body.msg || typeof body.msg !== 'object') throw new ProviderError('REAUTH_REQUIRED', '学习通登录状态未建立，请重新登录');
  const msg = asObject(body.msg);
  const im = msg.accountInfo && asObject(msg.accountInfo).imAccount ? asObject(asObject(msg.accountInfo).imAccount) : undefined;
  return { userId: str(msg.puid, 'puid'), fid: str(msg.fid ?? '0', 'fid'), name: str(msg.name, 'name'), uid: msg.uid === undefined ? undefined : str(msg.uid, 'uid'), imEncryptedPassword: typeof im?.password === 'string' ? im.password : undefined };
}
async function loginWithEncrypted(identifier: string, encryptedPassword: string, deviceCode: string, jar = new RequestSession()): Promise<ProviderSession> {
  const result = await json(await jar.request('https://passport2.chaoxing.com/fanyalogin', { method: 'POST', body: loginBody(identifier, encryptedPassword), headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
  if (result.status !== true && result.status !== 1 && result.status !== 'true') {
    const reason = typeof result.msg2 === 'string' ? result.msg2.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160) : '';
    throw new ProviderError('REAUTH_REQUIRED', reason || '学习通未接受登录，请检查账号和密码');
  }
  if (!jar.exportCookies().length) throw new ProviderError('REAUTH_REQUIRED', '未收到学习通登录会话，请检查网络后重试');
  const user = await identity(jar);
  return { identifier, encryptedPassword, deviceCode, ...user, cookies: jar.exportCookies() };
}
export const login = (identifier: string, password: string, deviceCode: string, transport?: Transport) => loginWithEncrypted(identifier, encryptLoginValue(password), deviceCode, new RequestSession(undefined, transport));
export async function checkSession(session: ProviderSession, transport?: Transport): Promise<ProviderSession> {
  const jar = new RequestSession(session, transport);
  try {
    const user = await identity(jar);
    if (user.userId !== session.userId) throw new ProviderError('REAUTH_REQUIRED', '会话身份不匹配');
    return { ...session, ...user, cookies: jar.exportCookies() };
  } catch (error) {
    if (error instanceof ProviderError && error.code !== 'PROVIDER_CHANGED' && error.code !== 'REAUTH_REQUIRED') throw error;
    const renewed = await loginWithEncrypted(session.identifier, session.encryptedPassword, session.deviceCode, new RequestSession(undefined, transport));
    if (renewed.userId !== session.userId) throw new ProviderError('REAUTH_REQUIRED', '重登后身份不匹配');
    return renewed;
  }
}
