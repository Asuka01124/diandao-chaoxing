const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');

function releaseVersion(baseVersion, baseCode, runNumber, useBaseTag = true) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(baseVersion) || !Number.isSafeInteger(baseCode) || baseCode < 1 ||
      !Number.isSafeInteger(runNumber) || runNumber < 1 || runNumber >= 10000) throw new Error('Invalid release version configuration');
  const version = baseVersion;
  const versionCode = baseCode * 10000 + runNumber;
  if (versionCode > 2100000000) throw new Error('Android versionCode exceeds its limit');
  return { version, versionCode, tag: useBaseTag ? `v${version}` : `v${version}-build.${runNumber}`, apkName: `daodian-v${version}-arm64.apk` };
}
module.exports = { releaseVersion };

if (require.main === module) {
  const appPath = path.join(root, 'apps/mobile/app.json');
  const config = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('Missing release commit');
  // checkout 完整读取远程 tag；同一次运行重试继续使用已创建的基础 tag。
  const baseTag = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/v${config.expo.version}^{commit}`], { cwd: root, encoding: 'utf8' });
  if (baseTag.error || ![0, 1].includes(baseTag.status)) throw new Error('Cannot inspect release tags');
  const useBaseTag = baseTag.status === 1 || baseTag.stdout.trim() === process.env.GITHUB_SHA;
  const metadata = releaseVersion(config.expo.version, config.expo.android.versionCode, Number(process.env.GITHUB_RUN_NUMBER), useBaseTag);
  Object.assign(metadata, { commit: process.env.GITHUB_SHA, package: config.expo.android.package });
  config.expo.version = metadata.version;
  config.expo.android.versionCode = metadata.versionCode;
  fs.writeFileSync(appPath, JSON.stringify(config, null, 2) + '\n');
  fs.mkdirSync(path.join(root, 'dist/release'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/release/release.json'), JSON.stringify(metadata, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
    `version=${metadata.version}\nversion_code=${metadata.versionCode}\ntag=${metadata.tag}\napk_name=${metadata.apkName}\n`);
  console.log(`CI version: ${metadata.version} (${metadata.versionCode})`);
}
