import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { parseRelease, repositoryUrl } from '../../apps/mobile/src/features/updates/release-update';
const { releaseNotes } = createRequire(import.meta.url)('./release-notes.cjs');

test('CI 发布说明与手机更新检查互通，构建信息不混入用户更新内容', () => {
  const metadata = { version: '1.6', versionCode: 290003, tag: 'v1.6', commit: 'a'.repeat(40) };
  const body = releaseNotes(metadata, 'b'.repeat(64), '# 更新记录\n\n## 1.6\n\n- 新增版本更新\n\n## 1.5\n\n- 旧版修改\n');
  const parsed = parseRelease({ tag_name: metadata.tag, draft: false, prerelease: false,
    html_url: `${repositoryUrl}/releases/tag/v1.6`, body,
    assets: [{ name: 'daodian-v1.6-arm64.apk', size: 1, browser_download_url: `${repositoryUrl}/releases/download/v1.6/daodian-v1.6-arm64.apk` }],
  });
  expect(parsed.versionCode).toBe(290003);
  expect(parsed.notes).toBe('• 新增版本更新');
  expect(body).toContain(metadata.commit);
  expect(parsed.notes).not.toContain('旧版修改');
  expect(parsed.notes).not.toContain('构建信息');
});

test('没有当前版本的更新记录时仍产生有效发布说明', () => {
  expect(releaseNotes({ version: '1.7', versionCode: 300001, tag: 'v1.7', commit: 'a'.repeat(40) }, 'b'.repeat(64), '## 1.6\n- 旧版'))
    .toContain('本次更新详情请参阅项目仓库。');
});
