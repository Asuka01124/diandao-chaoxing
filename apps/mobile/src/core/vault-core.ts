import { emptyVault, type VaultData } from '@sign/shared';

export type VaultPorts = {
  key: { get: () => Promise<string | null>; set: (hex: string) => Promise<void>; delete: () => Promise<void> };
  crypto: { generateKey: () => Promise<string>; encrypt: (plain: Uint8Array, hex: string) => Promise<Uint8Array>; decrypt: (sealed: Uint8Array, hex: string) => Promise<Uint8Array> };
  files: { exists: (name: string) => boolean; read: (name: string) => Promise<Uint8Array>; write: (name: string, bytes: Uint8Array) => Promise<void>; move: (from: string, to: string) => Promise<void>; delete: (name: string) => Promise<void> };
};
const main = 'vault.bin', staging = 'vault.bin.tmp', backup = 'vault.bin.bak';

export class EncryptedVault {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private ports: VaultPorts) {}
  private async keyForWrite(): Promise<string> {
    const stored = await this.ports.key.get();
    if (stored) return stored;
    if (this.ports.files.exists(main) || this.ports.files.exists(backup)) throw new Error('本地密钥缺失，不能覆盖现有资料');
    const generated = await this.ports.crypto.generateKey();
    await this.ports.key.set(generated);
    return generated;
  }
  async read(): Promise<VaultData> {
    const name = this.ports.files.exists(main) ? main : this.ports.files.exists(backup) ? backup : null;
    if (!name) {
      if (await this.ports.key.get()) throw new Error('加密文件缺失，请检查设备存储');
      return emptyVault();
    }
    const hex = await this.ports.key.get();
    if (!hex) throw new Error('本地密钥缺失，现有账号资料无法恢复');
    try {
      const plain = await this.ports.crypto.decrypt(await this.ports.files.read(name), hex);
      const data = JSON.parse(new TextDecoder().decode(plain)) as VaultData;
      if (data.schemaVersion !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.jobs) || !Array.isArray(data.attempts)) throw new Error('版本不受支持');
      return data;
    } catch { throw new Error('加密文件校验失败，无法读取任何账号资料'); }
  }
  private async writeNow(data: VaultData): Promise<void> {
    const hex = await this.keyForWrite();
    const sealed = await this.ports.crypto.encrypt(new TextEncoder().encode(JSON.stringify(data)), hex);
    if (this.ports.files.exists(staging)) await this.ports.files.delete(staging);
    await this.ports.files.write(staging, sealed);
    if (this.ports.files.exists(main)) {
      if (this.ports.files.exists(backup)) await this.ports.files.delete(backup);
      await this.ports.files.move(main, backup);
    }
    try {
      await this.ports.files.move(staging, main);
      if (this.ports.files.exists(backup)) await this.ports.files.delete(backup);
    } catch (error) {
      if (!this.ports.files.exists(main) && this.ports.files.exists(backup)) await this.ports.files.move(backup, main);
      throw error;
    }
  }
  write(data: VaultData): Promise<void> {
    const next = this.chain.then(() => this.writeNow(data));
    this.chain = next.catch(() => {});
    return next;
  }
  async clear(): Promise<void> {
    await this.chain;
    for (const name of [main, backup, staging]) if (this.ports.files.exists(name)) await this.ports.files.delete(name);
    await this.ports.key.delete();
  }
}
