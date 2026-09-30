import { expect, test } from 'bun:test';
import { createCipheriv } from 'node:crypto';
import { encryptLoginValue as nativeEncrypt, decryptImPassword as nativeDecrypt } from './crypto.native';
import { encryptLoginValue as nodeEncrypt } from './crypto';
import { decodeBase64 } from './base64';
import { RequestSession } from './index';

test('手机端加密与网关协议一致', () => {
  expect(nativeEncrypt('用户+123')).toBe(nodeEncrypt('用户+123'));
  const key = Buffer.from('SL2(M/eD');
  const cipher = createCipheriv('des-ede3', Buffer.concat([key, key, key]), null);
  const encrypted = Buffer.concat([cipher.update('im-secret'), cipher.final()]).toString('hex');
  expect(nativeDecrypt(encrypted)).toBe('im-secret');
  expect([...decodeBase64(Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]).toString('base64'))]).toEqual([0xff, 0xd8, 1, 2, 0xff, 0xd9]);
});

test('直连请求关闭系统共享 Cookie', async () => {
  let credentials: RequestCredentials | undefined;
  const transport = async (_url: string, init: RequestInit) => {
    credentials = init.credentials;
    return new Response('ok');
  };
  await new RequestSession(undefined, transport).request('https://mobilelearn.chaoxing.com/x');
  expect(credentials).toBe('omit');
});
