import { md5Hex } from './crypto';
import { decodeClientId } from './device';

export function buildFaceResultWithDevice(mediaId: string, device?: { cid: string; sc: string }): string {
  const cxtime = String(Date.now());
  const result: Record<string, unknown> = {
    currentFaceId: mediaId,
    LiveDetectionStatus: 1,
    collectStatus: 1,
    cxtime,
  };
  if (device) {
    const fields: Record<string, string> = {
      currentFaceId: mediaId,
      LiveDetectionStatus: '1',
      collectStatus: '1',
      cxtime,
      cxcid: device.cid,
    };
    const raw = Object.keys(fields).sort().map(key => key + fields[key]).join('') + device.sc;
    result.cxcid = device.cid;
    result.signToken = md5Hex(raw);
  }
  return JSON.stringify(result);
}

export function buildFaceResult(mediaId: string, clientId?: string): string {
  return buildFaceResultWithDevice(mediaId, clientId ? decodeClientId(clientId) : undefined);
}