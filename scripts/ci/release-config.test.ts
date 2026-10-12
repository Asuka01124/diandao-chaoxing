import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { releaseVersion } = require('./prepare-android.cjs');
const signing = require('../../apps/mobile/plugins/android-ci-signing.js');

test('自动发布版本随运行编号递增，提升基础版本码后仍可升级', () => {
  expect(releaseVersion('1.4', 27, 1)).toMatchObject({ version: '1.4.1', versionCode: 270001, tag: 'v1.4.1' });
  expect(releaseVersion('1.4', 27, 2).versionCode).toBeGreaterThan(releaseVersion('1.4', 27, 1).versionCode);
  expect(releaseVersion('1.5', 28, 1).versionCode).toBeGreaterThan(releaseVersion('1.4', 27, 9999).versionCode);
  for (const run of [0, -1, 10000, NaN]) expect(() => releaseVersion('1.4', 27, run)).toThrow();
});

test('CI 签名注入可重复执行，不把密钥写入 Gradle', () => {
  const original = 'android { buildTypes { release { signingConfig signingConfigs.debug } } }';
  const generated = signing(original);
  expect(signing(generated)).toBe(generated);
  expect(generated).toContain('System.getenv("ANDROID_KEYSTORE_PATH")');
  expect(generated).toContain('android.buildTypes.release.signingConfig = android.signingConfigs.ciRelease');
  expect(generated).toStartWith(original);
});
