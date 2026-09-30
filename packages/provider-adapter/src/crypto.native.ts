import CryptoJS from 'crypto-js';

export function encryptLoginValue(value: string): string {
  const key = CryptoJS.enc.Utf8.parse('u2oh6Vu^HWe4_AES');
  return CryptoJS.AES.encrypt(value, key, { iv: key, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).ciphertext.toString(CryptoJS.enc.Base64);
}

export function decryptImPassword(hex: string): string {
  const key = CryptoJS.enc.Utf8.parse('SL2(M/eDSL2(M/eDSL2(M/eD');
  const ciphertext = CryptoJS.enc.Hex.parse(hex);
  return CryptoJS.TripleDES.decrypt({ ciphertext } as CryptoJS.lib.CipherParams, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);
}
