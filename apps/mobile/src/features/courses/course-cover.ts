import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import type { ProviderSession } from '@sign/shared';
import { api } from '../../core/api';

const pending = new Map<string, Promise<string>>();

export function cachedCourseCover(session: ProviderSession, imageUrl: string): Promise<string> {
  const cacheKey = `${session.userId}:${imageUrl}`;
  const existing = pending.get(cacheKey);
  if (existing) return existing;
  const task = (async () => {
    const name = await digestStringAsync(CryptoDigestAlgorithm.SHA256, cacheKey);
    for (const extension of ['jpg', 'png', 'webp']) {
      const cached = new File(Paths.cache, `course-cover-${name}.${extension}`);
      if (cached.exists && cached.size > 0) return cached.uri;
    }
    const cover = await api.courseCover(session, imageUrl);
    const extension = cover.mime === 'image/png' ? 'png' : cover.mime === 'image/webp' ? 'webp' : 'jpg';
    const file = new File(Paths.cache, `course-cover-${name}.${extension}`);
    file.write(cover.bytes);
    return file.uri;
  })();
  pending.set(cacheKey, task);
  void task.finally(() => pending.delete(cacheKey)).catch(() => {});
  return task;
}
