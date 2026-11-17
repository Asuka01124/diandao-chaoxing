// 两个发布源均使用静态清单，保留现有版本和下载路径校验格式。
function releaseManifest(metadata, apkSize, body, source = 'github') {
  const releases = source === 'cnb'
    ? 'https://cnb.cool/diandao-app/diandao-chaoxing/-/releases'
    : 'https://github.com/Asuka01124/diandao-chaoxing/releases';
  const tag = encodeURIComponent(metadata.tag);
  return {
    tag_name: metadata.tag,
    draft: false,
    prerelease: false,
    html_url: `${releases}/tag/${tag}`,
    assets: [{
      name: metadata.apkName,
      browser_download_url: `${releases}/download/${tag}/${metadata.apkName}`,
      size: apkSize,
    }],
    body,
  };
}
module.exports = { releaseManifest };
