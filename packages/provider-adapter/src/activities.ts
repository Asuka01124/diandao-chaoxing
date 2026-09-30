import type { Activity, ProviderSession } from "@sign/shared";
import { asArray, asObject, json, stamp, str } from "./response";
import { RequestSession, type Transport } from "./session";

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
  const ext = JSON.stringify(data.ext ?? {});
  return asArray(data.activeList)
    .map((raw) => asObject(raw))
    .filter((item) => item.type === 2 || item.type === 74)
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
      signed:
        item.userStatus === undefined
          ? null
          : [1, 2, 3, 9].includes(Number(item.userStatus)),
      ext,
      cachedAt: Date.now(),
    }));
}
export async function activityDetail(
  session: ProviderSession,
  activity: Activity,
  transport?: Transport,
): Promise<Activity> {
  const jar = new RequestSession(session, transport);
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
