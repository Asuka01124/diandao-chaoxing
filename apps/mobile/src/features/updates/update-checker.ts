import { fetch as nativeFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { getLocales } from 'expo-localization';
import { checkRegionalUpdates, createUpdateChecker, type AppVersion, type ReleaseSource } from './release-update';

function checker(source: ReleaseSource, cacheFile: string) {
  return createUpdateChecker((url, init) => nativeFetch(url, init), {
    async read() {
      const file = new File(Paths.cache, cacheFile);
      return file.exists ? await file.text() : null;
    },
    async write(value) {
      new File(Paths.cache, cacheFile).write(value);
    },
  }, Date.now, source);
}

const checks = {
  github: checker('github', 'release-update-v1.json'),
  cnb: checker('cnb', 'release-update-cnb-v1.json'),
};

export function checkCachedUpdates(current: AppVersion, signal?: AbortSignal) {
  return checkRegionalUpdates(checks, getLocales()[0]?.regionCode, current, signal);
}
