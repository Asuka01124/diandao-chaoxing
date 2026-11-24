import type { ProviderSession } from '@sign/shared';
import { md5Hex } from './crypto';
import { decodeClientId } from './device';
import { ProviderError } from './errors';
import { json } from './response';
import { RequestSession, type Transport } from './session';

export async function profileFaceId(account: ProviderSession, transport?: Transport): Promise<string> {
  const client = new RequestSession(account, transport);
  const response = await json(await client.request(
    'https://mobilelearn.chaoxing.com/v2/apis/sign/collectionfilephotoEnc?DB_STRATEGY=DEFAULT'));
  const data = response.data;
  const objectId = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>).oldObjectId : undefined;
  if (typeof objectId === 'string' && objectId) return objectId;
  throw new ProviderError('VALIDATION_FAILED', '该账号没有已录入的人脸照片');
}

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