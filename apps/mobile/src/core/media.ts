import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';

const temporaryName = /^sign-photo-[0-9a-f-]+\.jpg$/i;
function stagedFile(uri: string): File {
  const prefix = Paths.cache.uri.endsWith('/') ? Paths.cache.uri : `${Paths.cache.uri}/`;
  const name = uri.slice(prefix.length);
  if (!uri.startsWith(prefix) || !temporaryName.test(name)) throw new Error('无效的临时照片路径');
  return new File(uri);
}
export async function stagePhoto(sourceUri: string): Promise<string> {
  const converted = await ImageManipulator.manipulateAsync(sourceUri, [], { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG });
  const target = new File(Paths.cache, `sign-photo-${randomUUID()}.jpg`);
  const source = new File(converted.uri);
  try { await source.copy(target); return target.uri; }
  finally {
    if (source.exists && source.uri !== target.uri) source.delete();
    if (sourceUri.startsWith(Paths.cache.uri) && sourceUri !== converted.uri) {
      const picked = new File(sourceUri); if (picked.exists) picked.delete();
    }
  }
}
export async function readStagedPhoto(uri: string): Promise<string> {
  const file = stagedFile(uri);
  if (!file.exists) throw new Error('临时照片已被系统清理，请重新选择');
  if (file.size > 2_000_000) throw new Error('照片超过 2 MB，请重新选择');
  return file.base64();
}
export function clearStagedPhoto(uri: string): void {
  const file = stagedFile(uri); if (file.exists) file.delete();
}
export function clearAllStagedPhotos(): void {
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && temporaryName.test(entry.name)) entry.delete();
  }
}
