import type { Course, ProviderSession } from '@sign/shared';
import { asArray, asObject, json, str } from './response';
import { RequestSession, type Transport } from './session';

export async function courses(session: ProviderSession, transport?: Transport): Promise<Course[]> {
  const jar = new RequestSession(session, transport);
  const body = await json(await jar.request('https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1'));
  return asArray(body.channelList).flatMap(raw => {
    const item = asObject(raw); const content = asObject(item.content);
    if (!content.course || !item.cataName) return [];
    const course = asObject(asArray(asObject(content.course).data)[0]);
    return [{ id: str(course.id, 'course.id'), classId: str(content.id, 'class.id'), name: str(course.name, 'course.name'), teacher: typeof course.teacherfactor === 'string' ? course.teacherfactor : undefined }];
  });
}
