import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import type { VaultData } from '@sign/shared';
import { EncryptedVault } from './vault-core';

const keyName = 'sign-tool.vault-key.v1';
const file = (name: string) => new File(Paths.document, name);
const repository = new EncryptedVault({
  key: {
    get: () => SecureStore.getItemAsync(keyName),
    set: value => SecureStore.setItemAsync(keyName, value),
    delete: () => SecureStore.deleteItemAsync(keyName),
  },
  crypto: {
    generateKey: async () => (await AESEncryptionKey.generate(256)).encoded('hex'),
    encrypt: async (plain, hex) => (await aesEncryptAsync(plain, await AESEncryptionKey.import(hex, 'hex'))).combined(),
    decrypt: async (sealed, hex) => aesDecryptAsync(AESSealedData.fromCombined(sealed), await AESEncryptionKey.import(hex, 'hex'), { output: 'bytes' }) as Promise<Uint8Array>,
  },
  files: {
    exists: name => file(name).exists,
    read: name => file(name).bytes(),
    write: (name, bytes) => { const target = file(name); target.create({ overwrite: true }); target.write(bytes); return Promise.resolve(); },
    move: (from, to) => file(from).move(file(to)),
    delete: name => { if (file(name).exists) file(name).delete(); return Promise.resolve(); },
  },
});

export const readVault = (): Promise<VaultData> => repository.read();
export const writeVault = (data: VaultData): Promise<void> => repository.write(data);
export const clearVault = (): Promise<void> => repository.clear();
