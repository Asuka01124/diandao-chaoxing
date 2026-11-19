import type { ProviderSession } from '@sign/shared';
import { decodeClientId, md5Hex, type Transport } from '@sign/provider-adapter';
import { PRACTICE_CLASS_ID, PRACTICE_COURSE_ID, practiceActivities } from './demo-course';

// 本机演练服务：在学习通协议层面模拟服务端，请求不出设备。
// 人脸材料按真实规则校验 signToken，签名密钥同样从会话 clientId 还原。
// 状态只保存在内存中，应用重启后演练进度重置。

type Device = { cid: string; sc: string };

const signed = new Set<string>();
const uploads = new Set<string>();
const faceProofs = new Map<string, { enc: string; mediaId: string }>();
let photoCounter = 0;
let proofCounter = 0;

export function resetPracticeServer(): void {
  signed.clear();
  uploads.clear();
  faceProofs.clear();
  photoCounter = 0;
  proofCounter = 0;
}

export function practiceQrEnc(activityId: string): string {
  return `practice-enc-${activityId}`;
}

export function practiceQrPayload(activityId: string): string {
  return `https://mobilelearn.chaoxing.com/x?aid=${activityId}&enc=${practiceQrEnc(activityId)}`;
}

export function verifyFaceResult(faceResult: Record<string, unknown>, device: Device | undefined): string | null {
  if (!device) return '缺少设备签名（会话没有 clientId），请重新登录账号后再演练';
  if (faceResult.LiveDetectionStatus !== 1 || faceResult.collectStatus !== 1) return '活体验证参数缺失';
  const mediaId = faceResult.currentFaceId;
  if (typeof mediaId !== 'string' || !uploads.has(mediaId)) return '人脸照片未上传到演练云盘';
  if (faceResult.cxcid !== device.cid || typeof faceResult.signToken !== 'string') return '活体验证参数缺失';
  const fields: Record<string, string> = {
    currentFaceId: mediaId,
    LiveDetectionStatus: '1',
    collectStatus: '1',
    cxtime: String(faceResult.cxtime),
    cxcid: device.cid,
  };
  const raw = Object.keys(fields).sort().map(key => key + fields[key]).join('') + device.sc;
  if (md5Hex(raw) !== faceResult.signToken) return '人脸校验签名无效';
  return null;
}

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const htmlResponse = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/html' } });

function statusPage(activityId: string): string {
  const status = signed.has(activityId) ? 1 : 0;
  return `<html><body><script>var primaryAttend = {"status":${status}};</script></body></html>`;
}

function activityInfo(activityId: string) {
  const activity = practiceActivities.find(item => item.id === activityId);
  if (!activity) return undefined;
  return {
    otherId: activity.kind === 'qr' ? '2' : '0',
    ifNeedVCode: 0,
    openCheckFaceFlag: 1,
    ifopenAddress: 0,
    ifphoto: 0,
    starttime: Date.now() - 60_000,
    endTime: null,
  };
}

export function createPracticeTransport(session: ProviderSession): Transport {
  const device = session.clientId ? decodeClientId(session.clientId) : undefined;
  return async (url, init) => {
    const target = new URL(url);
    const query = target.searchParams;
    const path = target.pathname;
    if (target.hostname === 'sso.chaoxing.com' && path === '/apis/login/userLogin4Uname.do') {
      return jsonResponse({ msg: { puid: session.userId, fid: session.fid, name: session.name, clientId: session.clientId } });
    }
    if (target.hostname === 'pan-yz.chaoxing.com') {
      if (path === '/api/token/uservalid') return jsonResponse({ _token: 'practice-cloud-token' });
      if (path === '/upload') {
        const mediaId = `practice-photo-${++photoCounter}`;
        uploads.add(mediaId);
        return jsonResponse({ result: true, objectId: mediaId });
      }
    }
    if (target.hostname === 'mobilelearn.chaoxing.com') {
      if (path === '/v2/apis/active/student/activelist') {
        if (query.get('courseId') !== PRACTICE_COURSE_ID || query.get('classId') !== PRACTICE_CLASS_ID) {
          return jsonResponse({ data: { ext: '{}', activeList: [] } });
        }
        return jsonResponse({
          data: {
            ext: '{}',
            activeList: practiceActivities.map(activity => ({
              id: activity.id, nameOne: activity.title, type: 2,
              otherId: activity.kind === 'qr' ? '2' : '0',
              startTime: Date.now() - 60_000, endTime: null, status: 1,
            })),
          },
        });
      }
      if (path === '/v2/apis/active/getPPTActiveInfo') {
        const info = activityInfo(query.get('activeId') ?? '');
        return info ? jsonResponse({ data: info }) : jsonResponse({ data: {} });
      }
      if (path === '/newsign/preSign') {
        return htmlResponse(statusPage(query.get('activePrimaryId') ?? ''));
      }
      if (path === '/pptSign/analysis') {
        return htmlResponse(`<html><script>var code='+'0123456789abcdef0123';</script></html>`);
      }
      if (path === '/pptSign/analysis2') return htmlResponse('ok');
      if (path === '/pptSign/check-face-result') {
        const activityId = query.get('activeId') ?? '';
        let faceResult: Record<string, unknown>;
        try { faceResult = JSON.parse(query.get('faceResult') ?? ''); }
        catch { return jsonResponse({ msg: '人脸校验材料无法解析' }); }
        const problem = verifyFaceResult(faceResult, device);
        if (problem) return jsonResponse({ msg: problem });
        const enc = `practice-face-${++proofCounter}`;
        faceProofs.set(activityId, { enc, mediaId: String(faceResult.currentFaceId) });
        return jsonResponse({ result: true, enc });
      }
      if (path === '/pptSign/stuSignajax') {
        const activityId = query.get('activeId') ?? '';
        const activity = practiceActivities.find(item => item.id === activityId);
        if (!activity) return new Response('校验失败，未查询到活动数据');
        if (signed.has(activityId)) return new Response('您已签到过了');
        const faceEnc = query.get('faceEnc');
        if (faceEnc) {
          const proof = faceProofs.get(activityId);
          if (!proof || proof.enc !== faceEnc || proof.mediaId !== query.get('currentFaceId')) {
            return new Response('[face]人脸校验未通过');
          }
        } else {
          return new Response('[face]请先完成人脸验证');
        }
        if (activity.kind === 'qr' && query.get('enc') !== practiceQrEnc(activityId)) {
          return new Response('签到失败，请重新扫描。');
        }
        signed.add(activityId);
        return new Response('success');
      }
    }
    return jsonResponse({ msg: `演练服务未实现该接口：${target.hostname}${path}` });
  };
}