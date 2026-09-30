import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { beforeEach, expect, test } from 'bun:test';
import { emptyVault, type Account, type VaultData } from '@sign/shared';
import { EncryptedVault, type VaultPorts } from './vault-core';

const files = new Map<string, Uint8Array>();
let key: string | null = null;
let failStagingMove = false;
const ports: VaultPorts = {
  key: { get: async () => key, set: async value => { key = value; }, delete: async () => { key = null; } },
  crypto: {
    generateKey: async () => randomBytes(32).toString('hex'),
    encrypt: async (plain, hex) => {
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
      return Uint8Array.from(Buffer.concat([iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]));
    },
    decrypt: async (sealed, hex) => {
      const bytes = Buffer.from(sealed); const decipher = createDecipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(-16)); return Uint8Array.from(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]));
    },
  },
  files: {
    exists: name => files.has(name),
    read: async name => { const value = files.get(name); if (!value) throw new Error('missing file'); return Uint8Array.from(value); },
    write: async (name, bytes) => { files.set(name, Uint8Array.from(bytes)); },
    delete: async name => { files.delete(name); },
    move: async (from, to) => {
      if (failStagingMove && from === 'vault.bin.tmp' && to === 'vault.bin') { failStagingMove = false; throw new Error('interrupted move'); }
      const value = files.get(from); if (!value) throw new Error('missing file');
      files.set(to, value); files.delete(from);
    },
  },
};
const account = (id: string): Account => ({ id, label: id, authorizedAt: '', state: 'VALID', session: { identifier: id, encryptedPassword: `credential-${id}`, cookies: [], userId: id, fid: '0', name: id, deviceCode: id } });
beforeEach(() => { files.clear(); key = null; failStagingMove = false; });

test('两个账号加密保存、重读与单独删除', async () => {
  const vault = new EncryptedVault(ports); const data = emptyVault(); data.accounts = [account('alice'), account('bob')];
  await vault.write(data);
  expect(new TextDecoder().decode(files.get('vault.bin'))).not.toContain('credential-alice');
  expect((await vault.read()).accounts.map(a => a.id)).toEqual(['alice', 'bob']);
  const updated = await vault.read(); updated.accounts = updated.accounts.filter(a => a.id !== 'alice');
  await vault.write(updated);
  expect((await vault.read()).accounts.map(a => a.id)).toEqual(['bob']);
});

test('只剩备份文件时替换中断仍可恢复原资料', async () => {
  const vault = new EncryptedVault(ports); const first = emptyVault(); first.accounts = [account('alice')]; await vault.write(first);
  files.set('vault.bin.bak', files.get('vault.bin')!); files.delete('vault.bin');
  expect((await vault.read()).accounts[0].id).toBe('alice');
  const updated: VaultData = { ...(await vault.read()), accounts: [account('bob')] };
  failStagingMove = true;
  await expect(vault.write(updated)).rejects.toThrow('interrupted move');
  expect((await vault.read()).accounts[0].id).toBe('alice');
});

test('认证标签损坏或密钥丢失时拒绝部分读取', async () => {
  const vault = new EncryptedVault(ports); const data = emptyVault(); data.accounts = [account('alice')]; await vault.write(data);
  const bytes = files.get('vault.bin')!; bytes[20] ^= 1;
  await expect(vault.read()).rejects.toThrow('加密文件校验失败');
  await vault.write(data); key = null;
  await expect(vault.read()).rejects.toThrow('本地密钥缺失');
});
