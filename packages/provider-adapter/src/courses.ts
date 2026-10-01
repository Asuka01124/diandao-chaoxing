import type { Course, ProviderSession } from '@sign/shared';
import { asArray, asObject, json, str } from './response';
import { RequestSession, type Transport } from './session';

function courseImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim().replace(/&amp;/gi, '&').replace(/^\/\//, 'https://').replace(/^http:\/\//i, 'https://'));
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch { return undefined; }
}

export async function courseCover(session: ProviderSession, imageUrl: string, transport?: Transport): Promise<{ bytes: Uint8Array; mime: string }> {
  const url = new URL(imageUrl);
  if (url.protocol !== 'https:' || !(url.hostname === 'chaoxing.com' || url.hostname.endsWith('.chaoxing.com')))
    throw new Error('无效的课程封面地址');
  const response = await new RequestSession(session, transport).request(url.toString(), { headers: { referer: 'https://mooc1-api.chaoxing.com/' } });
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('课程封面格式不受支持');
  if (Number(response.headers.get('content-length') || 0) > 3_000_000) throw new Error('课程封面过大');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 3_000_000 || !bytes.length) throw new Error('课程封面无效');
  return { bytes, mime };
}

export async function courses(session: ProviderSession, transport?: Transport): Promise<Course[]> {
  const jar = new RequestSession(session, transport);
  const body = await json(await jar.request('https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1'));
  return asArray(body.channelList).flatMap(raw => {
    const item = asObject(raw); const content = asObject(item.content);
    if (!content.course || !item.cataName) return [];
    const course = asObject(asArray(asObject(content.course).data)[0]);
    return [{ id: str(course.id, 'course.id'), classId: str(content.id, 'class.id'), name: str(course.name, 'course.name'), teacher: typeof course.teacherfactor === 'string' ? course.teacherfactor : undefined, imageUrl: courseImage(course.imageurl) }];
  });
}
