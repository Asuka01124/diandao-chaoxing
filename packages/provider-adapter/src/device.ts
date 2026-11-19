import { decodeBase64 } from './base64';
import { sha256Hex } from './crypto';

// 学习通设备信息 RSA 公钥：clientId 由服务器私钥生成，用公钥即可还原。
export const DEVICE_INFO_PUBLIC_KEY =
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC79d8Ot0hCbxxSISC6x8SCwTBspFSzlLKHJUYqoFNu1TSRaw4hEYkOnvEaL1VyoxV6HXcDrzwYvaFZaZaPQPFnfCHZy5dQwxcmifgSHqS+oKXw40Ys4cVIqnU5d90S7EWSRdBglX489jlqVaNcQSkDx2TYmC+DbAq9FV/BU09ISQIDAQAB';
const RSA_PLAIN_BLOCK_SIZE = 117;

export function parseDeviceInfoPublicKey(): { modulus: bigint; exponent: bigint } {
  const der = decodeBase64(DEVICE_INFO_PUBLIC_KEY);
  let cursor = 0;
  const readLength = (): number => {
    const first = der[cursor++];
    if (first < 0x80) return first;
    let length = 0;
    for (let i = 0; i < (first & 0x7f); i++) length = (length << 8) | der[cursor++];
    return length;
  };
  const expect = (tag: number): number => {
    if (der[cursor++] !== tag) throw new Error('设备公钥格式已变化');
    return readLength();
  };
  const readInteger = (): bigint => {
    const length = expect(0x02);
    let value = 0n;
    for (let i = 0; i < length; i++) value = (value << 8n) | BigInt(der[cursor++]);
    return value;
  };
  expect(0x30); // SubjectPublicKeyInfo
  const algorithmLength = expect(0x30); // AlgorithmIdentifier
  cursor += algorithmLength;
  expect(0x03); // BIT STRING
  if (der[cursor++] !== 0x00) throw new Error('设备公钥格式已变化');
  expect(0x30); // RSAPublicKey
  const modulus = readInteger();
  const exponent = readInteger();
  return { modulus, exponent };
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let power = base % modulus;
  let bits = exponent;
  while (bits > 0n) {
    if (bits & 1n) result = (result * power) % modulus;
    power = (power * power) % modulus;
    bits >>= 1n;
  }
  return result;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function bigIntToFixedBytes(value: bigint, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let rest = value;
  for (let i = size - 1; i >= 0; i--) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += alphabet[(chunk >> 18) & 63] + alphabet[(chunk >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(chunk >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? alphabet[chunk & 63] : '=';
  }
  return out;
}

export function buildDeviceInfo(deviceCode: string): Record<string, unknown> {
  const seed = sha256Hex(`com.chaoxing.mobile:${deviceCode}:android`);
  const hex = (start: number, length: number) => seed.slice(start, start + length);
  const drmBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) drmBytes[i] = parseInt(hex(i * 2, 2), 16);
  return {
    deviceUniqueId: seed,
    cdid: seed,
    device_id: seed,
    android_id: hex(0, 16),
    mediaDrmId: encodeBase64(drmBytes),
    oaid: '',
    platform: 'android',
    os_name: 'android',
    os_ver: '12',
    os_lang: 'zh-CN',
    brand: 'samsung',
    board: 'msm8998',
    hardware: 'qcom',
    model: 'SM-N9006',
    cpu_ar: 'arm64-v8a,armeabi-v7a,armeabi',
    app_name: 'com.chaoxing.mobile',
    app_ver: '6.7.5',
    versionCode: '10941',
    signatures: '1e27068798b6697821abbeb44a17da5483c4fb7fad7b9ce7890465ed04d0cbe0',
    resolution: '1080*2340',
    dpi: '3.0',
    time_stamp: Date.now(),
  };
}

export function encryptDeviceInfo(info: Record<string, unknown>): string {
  const { modulus, exponent } = parseDeviceInfoPublicKey();
  const plain = new TextEncoder().encode(JSON.stringify(info));
  const blockSize = (modulus.toString(2).length + 7) >> 3;
  const out = new Uint8Array(Math.ceil(plain.length / RSA_PLAIN_BLOCK_SIZE) * blockSize);
  for (let offset = 0, block = 0; offset < plain.length; offset += RSA_PLAIN_BLOCK_SIZE, block++) {
    const size = Math.min(RSA_PLAIN_BLOCK_SIZE, plain.length - offset);
    const padded = new Uint8Array(blockSize);
    padded[0] = 0x00;
    padded[1] = 0x02;
    for (let i = 2; i < blockSize - size - 1; i++) padded[i] = 1 + Math.floor(Math.random() * 255);
    padded[blockSize - size - 1] = 0x00;
    padded.set(plain.subarray(offset, offset + size), blockSize - size);
    out.set(bigIntToFixedBytes(modPow(bytesToBigInt(padded), exponent, modulus), blockSize), block * blockSize);
  }
  return encodeBase64(out);
}

export function decodeClientIdWithKey(
  clientId: string,
  key: { modulus: bigint; exponent: bigint },
): { cid: string; sc: string } | undefined {
  try {
    const { modulus, exponent } = key;
    const encrypted = decodeBase64(clientId);
    const blockSize = (modulus.toString(2).length + 7) >> 3;
    if (!encrypted.length || encrypted.length % blockSize !== 0) return undefined;
    const parts: Uint8Array[] = [];
    for (let offset = 0; offset < encrypted.length; offset += blockSize) {
      const block = bigIntToFixedBytes(
        modPow(bytesToBigInt(encrypted.subarray(offset, offset + blockSize)), exponent, modulus),
        blockSize,
      );
      if (block[0] !== 0x00 || block[1] !== 0x01) return undefined;
      let separator = 2;
      while (separator < block.length && block[separator] === 0xff) separator++;
      if (separator >= block.length || block[separator] !== 0x00 || separator === 2) return undefined;
      parts.push(block.subarray(separator + 1));
    }
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const merged = new Uint8Array(total);
    let at = 0;
    for (const part of parts) { merged.set(part, at); at += part.length; }
    const info = JSON.parse(new TextDecoder().decode(merged)) as Record<string, unknown>;
    if (typeof info.cid !== 'string' || !info.cid || typeof info.sc !== 'string' || !info.sc) return undefined;
    return { cid: info.cid, sc: info.sc };
  } catch {
    return undefined;
  }
}

export function decodeClientId(clientId: string): { cid: string; sc: string } | undefined {
  return decodeClientIdWithKey(clientId, parseDeviceInfoPublicKey());
}