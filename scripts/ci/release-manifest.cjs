// 保持与应用现有的正式 Release 校验格式兼容，静态文件无需调用 GitHub API。
function releaseManifest(metadata, apkSize, body) {
  const repositoryUrl = 'https://github.com/Asuka01124/diandao-chaoxing';
  const tag = encodeURIComponent(metadata.tag);
  return {
    tag_name: metadata.tag,
    draft: false,
    prerelease: false,
    html_url: `${repositoryUrl}/releases/tag/${tag}`,
    assets: [{
      name: metadata.apkName,
      browser_download_url: `${repositoryUrl}/releases/download/${tag}/${metadata.apkName}`,
      size: apkSize,
    }],
    body,
  };
}
module.exports = { releaseManifest };
