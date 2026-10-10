import type { Activity, ProviderSession } from "@sign/shared";
import { asArray, asObject, json, stamp, str } from "./response";
import { RequestSession, type Transport } from "./session";
import { signStatus } from './sign';

function kindFrom(raw: Record<string, unknown>): Activity["kind"] {
  const other = String(raw.otherId ?? "");
  if (other === "0") return "click";
  if (other === "2") return "qr";
  if (other === "3") return "gesture";
  if (other === "4") return "location";
  if (other === "5") return "code";
  return "unknown";
}
export async function activities(
  session: ProviderSession,
  courseId: string,
  classId: string,
  transport?: Transport,
): Promise<Activity[]> {
  const jar = new RequestSession(session, transport);
  const list = await readCourseActivities(jar, courseId, classId);
  let index = 0;
  // activelist.userStatus 是活动列表标记，个人签到结果由 preSign 返回。
  await Promise.all(Array.from({ length: Math.min(2, list.length) }, async () => {
    while (index < list.length) {
      const activity = list[index++];
      const status = await signStatus(session, activity, transport);
      activity.signed = status.state === 'SIGNED' ? true : status.state === 'READY' || status.state === 'EXPIRED' ? false : null;
    }
  }));
  return list;
}

export async function readCourseActivities(
  jar: RequestSession,
  courseId: string,
  classId: string,
): Promise<Activity[]> {
  const url = new URL(
    "https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist",
  );
  url.search = new URLSearchParams({
    fid: "0",
    showNotStartedActive: "0",
    courseId,
    classId,
  }).toString();
  const data = asObject((await json(await jar.request(url.toString()))).data);
  const ext = typeof data.ext === 'string' ? data.ext : JSON.stringify(data.ext ?? {});
  return asArray(data.activeList)
    .map((raw) => asObject(raw))
    .filter((item) => [2, 74].includes(Number(item.type)))
    .map((item) => ({
      id: str(item.id, "activity.id"),
      courseId,
      classId,
      source: "course",
      title: str(item.nameOne ?? "签到", "activity.title"),
      kind: kindFrom(item),
      startTime: stamp(item.startTime),
      endTime: stamp(item.endTime),
      status: item.status == null || !Number.isInteger(Number(item.status)) ? null : Number(item.status),
      signed: null,
      ext,
      cachedAt: Date.now(),
    }));
}
export async function activityDetail(
  session: ProviderSession,
  activity: Activity,
  transport?: Transport,
): Promise<Activity> {
  return readActivityDetail(new RequestSession(session, transport), activity);
}

export async function readActivityDetail(jar: RequestSession, activity: Activity): Promise<Activity> {
  const url = new URL(
    "https://mobilelearn.chaoxing.com/v2/apis/active/getPPTActiveInfo",
  );
  url.searchParams.set("activeId", activity.id);
  const result = await json(await jar.request(url.toString()));
  const info = asObject(result.data);
  const requirements = {
    captcha: Number(info.ifNeedVCode) === 1,
    face: Number(info.openCheckFaceFlag) === 1,
    location: Number(info.ifopenAddress) === 1,
    photo: Number(info.ifphoto) === 1,
  };
  const detected = info.otherId === undefined ? activity.kind : kindFrom(info);
  const relation = {
    signInId:
      info.signInId == null ? undefined : str(info.signInId, "signInId"),
    signOutId:
      info.signOutId == null ||
      String(info.signOutId) === "4999" ||
      String(info.signOutId) === activity.id
        ? undefined
        : str(info.signOutId, "signOutId"),
    signOutPublishTime: stamp(info.signOutPublishTimeStamp),
  };
  return {
    ...activity,
    kind: detected === "click" && requirements.photo ? "photo" : detected,
    requirements,
    relation,
    startTime: stamp(info.starttime) ?? activity.startTime,
    endTime: stamp(info.endTime) ?? activity.endTime,
  };
}
