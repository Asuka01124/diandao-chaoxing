const { withGradleProperties } = require('expo/config-plugins');
const packagingProperties = require('../config/android-packaging.json');

// 与本地 APK 构建脚本共用配置；重新 prebuild 后仍启用无损压缩。
module.exports = function withAndroidPackaging(config) {
  return withGradleProperties(config, (config) => {
    const keys = new Set(Object.keys(packagingProperties));
    config.modResults = config.modResults.filter(
      (entry) => entry.type !== 'property' || !keys.has(entry.key),
    );
    for (const [key, value] of Object.entries(packagingProperties)) {
      config.modResults.push({ type: 'property', key, value });
    }
    return config;
  });
};
