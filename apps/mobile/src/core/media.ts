import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import type { ReservedPhoto } from '@sign/shared';

const temporaryName = /^sign-photo-[0-9a-f-]+\.jpg$/i;
const reservedName = /^reserved-photo-[0-9a-f-]+\.jpg$/i;
function reservedFile(id: string): File {
  if (!/^[0-9a-f-]+$/i.test(id)) throw new Error('无效的预留照片编号');
  return new File(Paths.document, `reserved-photo-${id}.jpg`);
}
export function reservedPhotoUri(id: string): string { return reservedFile(id).uri; }
export function reservedPhotoExists(id: string): boolean { return reservedFile(id).exists; }
export async function saveReservedPhoto(sourceUri: string): Promise<ReservedPhoto> {
  const converted = await ImageManipulator.manipulateAsync(sourceUri, [{ resize: { width: 1600 } }], { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG });
  const source = new File(converted.uri);
  const photo: ReservedPhoto = { id: randomUUID(), createdAt: new Date().toISOString() };
  const target = reservedFile(photo.id);
  try {
    if (!source.exists || source.size <= 0) throw new Error('照片处理失败，请换一张照片');
    if (source.size > 2_000_000) throw new Error('照片处理后超过 2 MB，请换一张照片');
    await source.copy(target);
    return photo;
  } catch (error) {
    if (target.exists) target.delete();
    throw error;
  } finally {
    if (converted.uri !== sourceUri && source.exists) source.delete();
    if (sourceUri.startsWith(Paths.cache.uri) && sourceUri !== converted.uri) {
      const picked = new File(sourceUri); if (picked.exists) picked.delete();
    }
  }
}
export function clearReservedPhoto(id: string): void { const file = reservedFile(id); if (file.exists) file.delete(); }
export function clearAllReservedPhotos(): void {
  for (const entry of Paths.document.list()) if (entry instanceof File && reservedName.test(entry.name)) entry.delete();
}
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
