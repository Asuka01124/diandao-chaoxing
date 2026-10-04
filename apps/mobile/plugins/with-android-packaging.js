const { withGradleProperties, withAppBuildGradle } = require('expo/config-plugins');
const applyAndroidR8 = require('./android-r8-gradle');
const packagingProperties = require('../config/android-packaging.json');

// 与本地 APK 构建脚本共用配置；重新 prebuild 后仍启用无损压缩。
module.exports = function withAndroidPackaging(config) {
  config = withGradleProperties(config, (config) => {
    const keys = new Set(Object.keys(packagingProperties));
    config.modResults = config.modResults.filter(
      (entry) => entry.type !== 'property' || !keys.has(entry.key),
    );
    for (const [key, value] of Object.entries(packagingProperties)) {
      config.modResults.push({ type: 'property', key, value });
    }
    return config;
  });
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') throw new Error('Expected Groovy app/build.gradle');
    config.modResults.contents = applyAndroidR8(config.modResults.contents);
    return config;
  });
};
