function releaseNotes(metadata, digest, changelog) {
  const entry = changelog.split(/^## /m).find(section => section.split(/\r?\n/, 1)[0].trim() === metadata.version);
  const updates = entry?.slice(entry.indexOf('\n') + 1).trim() || '本次更新详情请参阅项目仓库。';
  const marker = JSON.stringify({ version: metadata.version, versionCode: metadata.versionCode, tag: metadata.tag });
  return `## 更新内容\n${updates}\n\n<!-- diandao-release: ${marker} -->\n\n## 构建信息\n由主分支 CI 自动构建。\n\n- 源码提交：${metadata.commit}\n- 版本：${metadata.version}，Android 版本码：${metadata.versionCode}\n- Android arm64 APK，沿用现有签名，可覆盖升级。\n- 发布前通过离线测试、TypeScript 检查、APK 版本/架构/签名及 16 KB ZIP 对齐校验。\n- 测试使用模拟数据，不登录学习通，不向学习通提交签到。\n- SHA-256：\`${digest}\`\n`;
}
module.exports = { releaseNotes };
