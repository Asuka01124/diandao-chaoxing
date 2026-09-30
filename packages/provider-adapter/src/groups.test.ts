import { createCipheriv } from 'node:crypto';
import { expect, test } from 'bun:test';
import type { ProviderSession } from '@sign/shared';
import { groupActivities, groups, parseGroupMessage } from './groups';

const varint = (n: number): number[] => { const out: number[] = []; while (n > 127) { out.push((n & 127) | 128); n >>>= 7; } out.push(n); return out; };
const field = (id: number, value: Uint8Array): Uint8Array => Uint8Array.from([...varint(id * 8 + 2), ...varint(value.length), ...value]);
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(p => [...p]));
const utf8 = (v: string) => new TextEncoder().encode(v);
function message() {
  const attachment = JSON.stringify({ attachmentType: 15, att_chat_course: { aid: 42, atype: 2, atypeName: '密码签到', title: '课堂签到', courseInfo: { courseid: 7, classid: 8 } } });
  const kv = concat(field(1, utf8('attachment')), field(6, utf8(attachment)));
  const body = field(5, kv); return Buffer.from(field(6, body)).toString('base64');
}
function session(): ProviderSession {
  const key = Buffer.from('SL2(M/eD'); const cipher = createCipheriv('des-ede3', Buffer.concat([key, key, key]), null);
  const password = Buffer.concat([cipher.update('im-secret'), cipher.final()]).toString('hex');
  return { identifier: 'a', encryptedPassword: 'secret', cookies: [], userId: 'a', fid: '0', name: 'A', deviceCode: 'd', uid: 'uid-a', imEncryptedPassword: password };
}
test('群聊 protobuf 附件归一化为独立活动', () => {
  const activity = parseGroupMessage(message(), 'group-1');
  expect(activity).toMatchObject({ id: '42', groupId: 'group-1', courseId: '7', classId: '8', kind: 'code', source: 'group' });
});
test('群聊令牌仅用于当前请求，不返回给客户端', async () => {
  const seen: string[] = [];
  const transport = async (url: string, init: RequestInit) => {
    seen.push(url);
    if (url.endsWith('/token')) { expect(String(init.body)).toContain('im-secret'); return Response.json({ access_token: 'bearer-secret', user: { username: 'im-a' } }); }
    if (url.includes('joined_chatgroups')) { expect(new Headers(init.headers).get('authorization')).toBe('Bearer bearer-secret'); return Response.json({ data: [{ id: 'group-1', name: '课程群' }] }); }
    if (url.includes('messageroaming')) return Response.json({ data: { msgs: [{ msg: message() }] } });
    throw new Error('unexpected request');
  };
  expect(await groups(session(), transport)).toEqual([{ id: 'group-1', name: '课程群' }]);
  expect((await groupActivities(session(), 'group-1', transport))[0].id).toBe('42');
  expect(seen.length).toBe(4);
});
