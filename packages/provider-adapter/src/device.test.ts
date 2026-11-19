import { expect, setSystemTime, test } from 'bun:test';
import { createHash, createPublicKey, generateKeyPairSync, privateEncrypt, constants } from 'node:crypto';
import { DEVICE_INFO_PUBLIC_KEY, buildDeviceInfo, decodeClientId, decodeClientIdWithKey, encryptDeviceInfo, parseDeviceInfoPublicKey } from './device';
import { buildFaceResult, buildFaceResultWithDevice } from './face';
import { md5Hex as nativeMd5, sha256Hex as nativeSha256 } from './crypto.native';
import { md5Hex, sha256Hex } from './crypto';

// 测试密钥对模拟服务器：clientId 由私钥操作生成，客户端用公钥还原。
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
const testKey = {
  modulus: BigInt('0x' + Buffer.from(jwk.n!, 'base64url').toString('hex')),
  exponent: BigInt('0x' + Buffer.from(jwk.e!, 'base64url').toString('hex')),
};
const serverClientId = (payload: string) => {
  const plain = Buffer.from(payload);
  const blocks: Buffer[] = [];
  for (let offset = 0; offset < plain.length; offset += 117) {
    blocks.push(privateEncrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, plain.subarray(offset, offset + 117)));
  }
  return Buffer.concat(blocks).toString('base64');
};

test('设备信息按 117 字节分块加密为 128 字节密文块', () => {
  const info = buildDeviceInfo('fixture-device');
  const plainLength = Buffer.byteLength(JSON.stringify(info));
  const encrypted = Buffer.from(encryptDeviceInfo(info), 'base64');
  expect(encrypted.length).toBe(Math.ceil(plainLength / 117) * 128);
});

test('内置公钥解析与 node:crypto 的模数指数一致', () => {
  const protocolKey = createPublicKey({ key: Buffer.from(DEVICE_INFO_PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' });
  const protocolJwk = protocolKey.export({ format: 'jwk' });
  const parsed = parseDeviceInfoPublicKey();
  expect(parsed.modulus).toBe(BigInt('0x' + Buffer.from(protocolJwk.n!, 'base64url').toString('hex')));
  expect(parsed.exponent).toBe(BigInt('0x' + Buffer.from(protocolJwk.e!, 'base64url').toString('hex')));
});

test('clientId 用公钥还原出 cid 与 sc', () => {
  const blob = serverClientId(JSON.stringify({ cid: 'device-cid', sc: 'device-secret', extra: 1 }));
  expect(decodeClientIdWithKey(blob, testKey)).toEqual({ cid: 'device-cid', sc: 'device-secret' });
});

test('多块 clientId 也能完整还原', () => {
  const long = { cid: 'c'.repeat(200), sc: 's'.repeat(200) };
  expect(decodeClientIdWithKey(serverClientId(JSON.stringify(long)), testKey)).toEqual(long);
});

test('异常 clientId 输入返回 undefined', () => {
  expect(decodeClientIdWithKey('', testKey)).toBeUndefined();
  expect(decodeClientIdWithKey('not-base64!!', testKey)).toBeUndefined();
  expect(decodeClientIdWithKey(Buffer.from('short').toString('base64'), testKey)).toBeUndefined();
  expect(decodeClientIdWithKey(serverClientId(JSON.stringify({ cid: 'only-cid' })), testKey)).toBeUndefined();
  expect(decodeClientIdWithKey(serverClientId('not-json'), testKey)).toBeUndefined();
  expect(decodeClientId('garbage')).toBeUndefined();
});

test('signToken 按排序字段拼接密钥后取 MD5，缺少设备信息时不附带签名', () => {
  setSystemTime(new Date('2026-11-18T00:00:00Z'));
  try {
    const result = JSON.parse(buildFaceResultWithDevice('face-image', { cid: 'cid-1', sc: 'sc-1' }));
    expect(result.currentFaceId).toBe('face-image');
    expect(result.LiveDetectionStatus).toBe(1);
    expect(result.collectStatus).toBe(1);
    expect(result.cxcid).toBe('cid-1');
    const raw = `LiveDetectionStatus1collectStatus1currentFaceIdface-imagecxcidcid-1cxtime${result.cxtime}sc-1`;
    expect(result.signToken).toBe(createHash('md5').update(raw).digest('hex'));
    const unsigned = JSON.parse(buildFaceResultWithDevice('face-image'));
    expect(unsigned.signToken).toBeUndefined();
    expect(unsigned.cxcid).toBeUndefined();
    expect(JSON.parse(buildFaceResult('face-image', 'garbage')).signToken).toBeUndefined();
  } finally {
    setSystemTime();
  }
});

test('手机端哈希与 Node 实现一致', () => {
  expect(nativeMd5('人脸签到+123')).toBe(md5Hex('人脸签到+123'));
  expect(nativeSha256('com.chaoxing.mobile:device:android')).toBe(sha256Hex('com.chaoxing.mobile:device:android'));
});