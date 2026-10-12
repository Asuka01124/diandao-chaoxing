// 密钥只存在于 runner 临时目录；生成的 Gradle 从环境读取签名配置。
module.exports = function applyCiSigning(contents) {
  const marker = '// diandao-ci-signing';
  if (contents.includes(marker)) return contents;
  return `${contents}\n${marker}
def ciKeystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
if (ciKeystorePath) {
    ["ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"].each { key ->
        if (!System.getenv(key)) throw new GradleException("Missing CI signing variable: " + key)
    }
    android.signingConfigs.create("ciRelease") {
        storeFile file(ciKeystorePath)
        storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
        keyAlias System.getenv("ANDROID_KEY_ALIAS")
        keyPassword System.getenv("ANDROID_KEY_PASSWORD")
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.ciRelease
}
`;
};
