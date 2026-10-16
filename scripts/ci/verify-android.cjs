const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { releaseNotes } = require('./release-notes.cjs');
const { releaseManifest } = require('./release-manifest.cjs');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'dist/release');
const metadata = JSON.parse(fs.readFileSync(path.join(output, 'release.json'), 'utf8'));
const apk = path.join(root, 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk');
const tools = path.join(process.env.ANDROID_HOME, 'build-tools/36.0.0');
const execute = (file, args) => execFileSync(file, args, { encoding: 'utf8' });
const badging = execute(path.join(tools, 'aapt'), ['dump', 'badging', apk]);
for (const value of [`name='${metadata.package}'`, `versionCode='${metadata.versionCode}'`, `versionName='${metadata.version}'`]) {
  if (!badging.includes(value)) throw new Error(`APK metadata mismatch: ${value}`);
}
if (!/^native-code: 'arm64-v8a'\r?$/m.test(badging)) throw new Error('APK must contain only arm64-v8a');
const signature = execute(path.join(tools, 'apksigner'), ['verify', '--verbose', '--print-certs', apk]);
const originalCertificate = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
if (!signature.toLowerCase().includes(`certificate sha-256 digest: ${originalCertificate}`)) throw new Error('APK signature differs from the existing release');
execute(path.join(tools, 'zipalign'), ['-c', '-P', '16', '4', apk]);
const bundledConfig = JSON.parse(execute('unzip', ['-p', apk, 'assets/app.config']));
if (bundledConfig.version !== metadata.version || bundledConfig.android.versionCode !== metadata.versionCode || !bundledConfig.extra?.amapAndroidConfigured) {
  throw new Error('Bundled Expo version or map configuration mismatch');
}
const target = path.join(output, metadata.apkName);
fs.copyFileSync(apk, target);
const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const notes = releaseNotes(metadata, digest, changelog);
fs.writeFileSync(path.join(output, 'RELEASE_NOTES.md'), notes);
const manifest = JSON.stringify(releaseManifest(metadata, fs.statSync(target).size, notes), null, 2) + '\n';
fs.writeFileSync(path.join(output, 'update.json'), manifest);
const manifestDigest = crypto.createHash('sha256').update(manifest).digest('hex');
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${digest}  ${metadata.apkName}\n${manifestDigest}  update.json\n`);
console.log(`Verified ${metadata.apkName}: ${digest}`);
