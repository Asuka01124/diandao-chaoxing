import { fetch as nativeFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { createUpdateChecker } from './release-update';

export const checkCachedUpdates = createUpdateChecker((url, init) => nativeFetch(url, init), {
  async read() {
    const file = new File(Paths.cache, 'release-update-v1.json');
    return file.exists ? await file.text() : null;
  },
  async write(value) {
    new File(Paths.cache, 'release-update-v1.json').write(value);
  },
});
