import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { evaluateUpdate, parseRelease } from '../../apps/mobile/src/features/updates/release-update';
const { releaseManifest } = createRequire(import.meta.url)('./release-manifest.cjs');
const { releaseNotes } = createRequire(import.meta.url)('./release-notes.cjs');

test('CI 静态附件可直接被应用读取，识别同版本的新构建并保留正确下载地址', () => {
  const metadata = { version: '1.7.3', versionCode: 330002, tag: 'v1.7.3-build.2', apkName: 'daodian-v1.7.3-arm64.apk', commit: 'a'.repeat(40) };
  const notes = releaseNotes(metadata, 'b'.repeat(64), '## 1.7.3\n- 修复更新限流\n');
  const manifest = JSON.parse(JSON.stringify(releaseManifest(metadata, 42000000, notes)));
  const parsed = parseRelease(manifest);
  expect(parsed.versionCode).toBe(metadata.versionCode);
  expect(parsed.notes).toBe('• 修复更新限流');
  expect(parsed.apkUrl).toBe('https://github.com/Asuka01124/diandao-chaoxing/releases/download/v1.7.3-build.2/daodian-v1.7.3-arm64.apk');
  expect(evaluateUpdate({ version: '1.7.3', versionCode: 330001 }, parsed).available).toBe(true);
  expect(evaluateUpdate({ version: '1.7.3', versionCode: 330002 }, parsed).available).toBe(false);
});
