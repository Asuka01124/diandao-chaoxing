import { createCipheriv, createDecipheriv } from 'node:crypto';

export function encryptLoginValue(value: string): string {
  const key = Buffer.from('u2oh6Vu^HWe4_AES', 'utf8');
  const cipher = createCipheriv('aes-128-cbc', key, key);
  return Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64');
}

export function decryptImPassword(hex: string): string {
  const key = Buffer.from('SL2(M/eD', 'utf8');
  const cipher = createDecipheriv('des-ede3', Buffer.concat([key, key, key]), null);
  return Buffer.concat([cipher.update(Buffer.from(hex, 'hex')), cipher.final()]).toString('utf8');
}
