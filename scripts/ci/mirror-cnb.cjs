const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { releaseManifest } = require('./release-manifest.cjs');

const repoUrl = 'https://cnb.cool/diandao-app/diandao-chaoxing';
const apiOrigin = 'https://api.cnb.cool';
const releases = '/diandao-app/diandao-chaoxing/-/releases';
const token = process.env.CNB_RELEASE_TOKEN;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://cnb.cool/.extraHeader',
      GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + Buffer.from('cnb:' + token).toString('base64'),
    },
  }).trim();
}

async function cnb(method, endpoint, body, allowMissing = false) {
  const url = new URL(endpoint, apiOrigin);
  if (url.origin !== apiOrigin || !url.pathname.startsWith(releases)) throw new Error('Unexpected CNB API URL');
  const response = await fetch(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.cnb.api+json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error('CNB Release API ' + method + ' failed: HTTP ' + response.status);
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : null;
}

async function uploadApk(releaseId, apkName, apk) {
  const releasePath = releases + '/' + encodeURIComponent(releaseId);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { upload_url, verify_url } = await cnb('POST', releasePath + '/asset-upload-url', {
        asset_name: apkName, size: apk.length, ttl: 0, overwrite: true,
      });
      if (new URL(upload_url).protocol !== 'https:') throw new Error('Unexpected CNB upload protocol');
      const upload = await fetch(upload_url, {
        method: 'PUT', body: apk, redirect: 'error', signal: AbortSignal.timeout(120_000),
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(apk.length) },
      });
      if (!upload.ok) throw new Error('CNB APK upload failed: HTTP ' + upload.status);
      await cnb('POST', verify_url);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.log('Retrying CNB APK upload (' + attempt + '/3)');
    }
  }
}

async function publicApkMatches(url, size, expected) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) return false;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length === size && sha256(bytes) === expected;
  } catch {
    return false;
  }
}

function publishManifest(manifest) {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'diandao-cnb-'));
  try {
    git(directory, 'init', '--quiet');
    if (git(directory, 'ls-remote', repoUrl, 'refs/heads/updates')) {
      git(directory, 'fetch', '--quiet', '--depth=1', repoUrl, 'refs/heads/updates');
      git(directory, 'switch', '--quiet', '-c', 'updates', 'FETCH_HEAD');
    } else {
      git(directory, 'symbolic-ref', 'HEAD', 'refs/heads/updates');
    }
    fs.writeFileSync(path.join(directory, 'update.json'), JSON.stringify(manifest, null, 2) + '\n');
    git(directory, 'add', '--', 'update.json');
    if (!git(directory, 'diff', '--cached', '--name-only')) return;
    git(directory, '-c', 'user.name=diandao-release', '-c', 'user.email=diandao-release@users.noreply.github.com',
      'commit', '--quiet', '-m', 'Publish update metadata for ' + manifest.tag_name);
    git(directory, 'push', repoUrl, 'HEAD:refs/heads/updates');
  } finally {
    if (path.dirname(directory) === temporaryRoot && path.basename(directory).startsWith('diandao-cnb-')) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
}

async function main() {
  if (!token) throw new Error('Missing CNB_RELEASE_TOKEN');
  const directory = path.resolve(process.argv[2] ?? 'dist/release');
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'));
  if (!/^\d{1,6}\.\d{1,6}(?:\.\d{1,6})?$/.test(metadata.version)
    || !/^[a-f0-9]{40}$/.test(metadata.commit) || metadata.commit !== process.env.GITHUB_SHA
    || !/^v\d{1,6}\.\d{1,6}(?:\.\d{1,6})?(?:-build\.\d+)?$/.test(metadata.tag)
    || metadata.apkName !== 'daodian-v' + metadata.version + '-arm64.apk') {
    throw new Error('Unexpected release metadata');
  }
  const apk = fs.readFileSync(path.join(directory, metadata.apkName));
  const digest = sha256(apk);
  const sums = fs.readFileSync(path.join(directory, 'SHA256SUMS'), 'utf8');
  if (!sums.split(/\r?\n/).includes(digest + '  ' + metadata.apkName)) throw new Error('APK checksum mismatch');
  const body = fs.readFileSync(path.join(directory, 'RELEASE_NOTES.md'), 'utf8');
  const manifest = releaseManifest(metadata, apk.length, body, 'cnb');
  const apkUrl = manifest.assets[0].browser_download_url;

  git(process.cwd(), 'push', repoUrl, metadata.commit + ':refs/heads/main', metadata.commit + ':refs/tags/' + metadata.tag);
  let release = await cnb('GET', releases + '/tags/' + encodeURIComponent(metadata.tag), undefined, true);
  const description = { name: '到点 ' + metadata.version, body, prerelease: false };
  if (!release) release = await cnb('POST', releases, {
    ...description, tag_name: metadata.tag, target_commitish: metadata.commit, draft: true, make_latest: 'false',
  });
  if (!release?.id || release.tag_name !== metadata.tag) throw new Error('CNB release does not match the requested tag');
  const releasePath = releases + '/' + encodeURIComponent(release.id);
  const samePublicApk = !release.draft && release.assets?.some(asset => asset.name === metadata.apkName && asset.size === apk.length)
    && await publicApkMatches(apkUrl, apk.length, digest);
  if (!samePublicApk) await uploadApk(release.id, metadata.apkName, apk);
  await cnb('PATCH', releasePath, { ...description, draft: false, make_latest: 'true' });
  if (!samePublicApk && !await publicApkMatches(apkUrl, apk.length, digest)) throw new Error('CNB public APK differs from the GitHub build');
  publishManifest(manifest);
  console.log('Published CNB mirror for ' + metadata.tag);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
