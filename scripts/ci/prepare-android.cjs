const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function releaseVersion(baseVersion, baseCode, runNumber) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(baseVersion) || !Number.isSafeInteger(baseCode) || baseCode < 1 ||
      !Number.isSafeInteger(runNumber) || runNumber < 1 || runNumber >= 10000) throw new Error('Invalid release version configuration');
  const version = `${baseVersion.split('.').slice(0, 2).join('.')}.${runNumber}`;
  const versionCode = baseCode * 10000 + runNumber;
  if (versionCode > 2100000000) throw new Error('Android versionCode exceeds its limit');
  return { version, versionCode, tag: `v${version}`, apkName: `daodian-v${version}-arm64.apk` };
}
module.exports = { releaseVersion };

if (require.main === module) {
  const appPath = path.join(root, 'apps/mobile/app.json');
  const config = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  const metadata = releaseVersion(config.expo.version, config.expo.android.versionCode, Number(process.env.GITHUB_RUN_NUMBER));
  if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('Missing release commit');
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
