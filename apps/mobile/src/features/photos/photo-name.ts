import type { ReservedPhoto } from '@sign/shared';

export function photoName(photo: ReservedPhoto, index: number): string {
  return photo.name?.trim() || `预留照片 ${index + 1}`;
}

export function cleanPhotoName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('请输入照片名称');
  if (name.length > 30) throw new Error('照片名称最多 30 个字');
  return name;
}
