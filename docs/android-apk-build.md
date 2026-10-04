# Android APK 构建记录（Windows）

此页记录 2026-10-02 在 `codex/test-course-beta` 构建 v0.5.15-beta.1 时实际遇到、已解决的问题。下次打包先使用仓库脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-apk.ps1
```

脚本从 `apps/mobile/app.json` 读取版本号，构建 arm64 release，验证包名、版本码、版本名、架构和既有签名证书，再将 APK 复制到仓库根目录。构建日志保存在被忽略的 `.tooling/build-apk-*.log`。它不会提交或上传代码、APK。

## 已确认的故障与处理

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 改名后 CMake / autolinking 仍引用 `D:\chaoxing` | `android/app/.cxx` 等生成缓存含旧绝对路径 | 脚本使用独立 CMake staging 和短路径重写，避免复用旧配置。若仍失败，先检查日志中是否仍有旧路径，再针对出错的生成目录清理；不要直接对整个项目运行 `gradle clean`。 |
| Ninja 报 `Filename longer than 260 characters` | Bun 安装的原生模块路径加上 CMake 输出路径超出 Windows 限制 | 脚本临时建立短盘符，并把 CMake staging 与自动链接的原生源码指向短路径；构建后撤销盘符与原生 `build.gradle` 的临时改动。 |
| 从短盘符运行 Gradle 出现 `this and base files have different roots` 或 Metro 入口解析失败 | Gradle 使用短盘符，Node/Expo 又返回原始 `D:` 路径，形成跨盘符混用 | **Gradle 必须从原始 `D:\diandao-chaoxing\apps\mobile\android` 路径运行**；短盘符仅供 CMake 使用。 |
| Gradle wrapper 下载失败，或 `--offline` 报缺少 AndroidX / 高德依赖 | 项目 `.tooling/gradle` 与用户目录 `.gradle` 是两份不同缓存；所需依赖在后者 | 脚本直接调用本机 Gradle 9.3.1，并令 `GRADLE_USER_HOME=$env:USERPROFILE\.gradle`。如依赖从未下载，需先联网补齐一次。 |
| Windows PowerShell 5.1 在脚本开头报 `Unexpected token`，中文显示乱码 | 中文 `.ps1` 被保存为不带 BOM 的 UTF-8，PowerShell 5.1 按系统编码解码，部分字节被误识别为引号 | 保留 `scripts/build-android-apk.ps1` 的 UTF-8 BOM；恢复 BOM 后语法解析和构建启动均通过。 |
| `AMAP_ANDROID_KEY` 缺失 | 地图原生配置依赖 `apps/mobile/.env` | 确认本机 `.env` 中有非空 `AMAP_ANDROID_KEY`；此文件被 Git 忽略，不要写进文档或提交。 |

## 构建约束

- 本机使用项目内 `.tooling/jdk17`、`.tooling/android-sdk` 和 Gradle 9.3.1；脚本会在缺失时明确报错。
- 当前 release 仍由 `apps/mobile/android/app/debug.keystore` 签名，以保持已有测试版可覆盖安装。若变更签名，旧版无法直接覆盖，须单独规划迁移。
- 原生 `apps/mobile/android` 是生成目录，已被 Git 忽略；不要把一次性的 `build.gradle` 修改当作持久修复。脚本临时注入已验证的 CMake 配置，并在成功或失败后恢复原文件字节。
- 路径映射会优先选空闲的 `X:`，其次 `W:` 到 `T:`；若被其他软件占用，脚本不会改动已有映射。
- 不自动删除旧 `.cxx` 缓存：曾在当前 Windows 环境遇到缓存文件拒绝访问；脚本优先绕开旧缓存，避免清理动作本身中断打包。
- 当前只构建 `arm64-v8a`。发布其他架构前需调整脚本及验证步骤。

## 上次成功构建的证据

- Gradle：`BUILD SUCCESSFUL in 4m 41s`，命令为 `:app:assembleRelease -PreactNativeArchitectures=arm64-v8a --offline --no-daemon --max-workers=2`。
- APK：`daodian-v0.5.15-beta.1-05170cd-arm64.apk`，包名 `dev.local.sign.tool`，版本码 21，版本名 `0.5.15-beta.1`，仅含 `arm64-v8a`。
- 签名 SHA-256：`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`，与此前 beta 版一致。

若再次失败，先查看脚本末尾输出和对应 `.tooling/build-apk-*.log`，按最早出现的 `FAILURE` / `Caused by` 定位，不要把后续连锁错误当作根因。

## APK 无损压缩（2026-10-04）

`codex/shrink-apk` 保持现有 arm64 架构、Hermes、所有原生模块、图片和业务代码，仅改变 APK 内的压缩方式：

- `expo.useLegacyPackaging=true`：将 `.so` 原生库压缩保存，Android 安装时解压加载。
- `android.enableBundleCompression=true`：压缩 Hermes JavaScript 包。
- 不开启 R8/资源裁剪，不移除地图、扫码、照片等依赖，不修改 UI。

两项参数统一存放于 `apps/mobile/config/android-packaging.json`。本地构建脚本通过 Gradle `-P` 参数覆盖已生成工程中的旧设置；`apps/mobile/plugins/with-android-packaging.js` 在 Expo prebuild 时写入相同属性。持久修复无需提交被忽略的原生目录。

压缩减少下载/分发 APK 的大小。安装后的原生库仍需完整解压，安装占用不会同比缩小；安装及首次加载可能增加解压时间。保持旧签名、包名和版本号，可覆盖安装当前 1.0.1 测试版。

参数说明见 [Android 原生库打包文档](https://developer.android.com/reference/tools/gradle-api/8.3/com/android/build/api/dsl/JniLibsPackaging) 和 [React Native Gradle 插件文档](https://reactnative.dev/docs/react-native-gradle-plugin#enablebundlecompression)。

### 实测结果与验证

- 原有 `daodian-v1.0.1-22b3e6a-arm64.apk`：91,361,600 字节（91.36 MB / 87.13 MiB）。
- 优化 `daodian-v1.0.1-compact-arm64.apk`：53,452,457 字节（53.45 MB / 50.98 MiB）。减少 37,909,143 字节，即 **41.49%**。
- 原生库压缩存储合计由 53.60 MB 降至 19.20 MB；Hermes 包由 5.48 MB 降至 2.19 MB。
- 优化构建日志 `.tooling/build-apk-20261004-171306.log`：`BUILD SUCCESSFUL in 5m 56s`。
- 使用同一源码临时关闭上述两项压缩，构建对照 APK `.tooling/daodian-v1.0.1-control-arm64.apk`，结束后恢复 JSON 配置。对照包为 91,381,205 字节，日志 `.tooling/build-apk-20261004-171956.log`：`BUILD SUCCESSFUL in 2m 54s`。
- 同源码对照：没有添加或移除文件；1,538 个 ZIP 条目解压后的 SHA-256 完全一致（涵盖所有 29 个原生库、Hermes 包、6 个 DEX、全部资源和资源表）。唯一不同的条目为 `AndroidManifest.xml`；`aapt dump xmltree` 确认仅 `android:extractNativeLibs` 由 false 变成 true。旧发布包因重编译产物不同，不能用它直接要求所有文件哈希一致。
- 两个新包均通过脚本内签名验证，包名 `dev.local.sign.tool`、版本 `1.0.1`、版本码 `23`、仅 `arm64-v8a`，证书与旧版一致。优化包通过 `zipalign -c -P 16 -v 4`。
- Expo `config --type introspect --json` 确认两项 Gradle 属性均为 true；插件覆盖旧值、去重、保留其他属性、重复执行稳定的检查通过。
- `bun run test`：57 项通过、0 项失败。未连接 Android 设备，未执行真机安装、启动、地图/相机操作或 UI 截图对比。
- 优化包 SHA-256：`fe4bdb5efddb5966834a7d741d123fb5b4b45252aa3cdd8126c367e9805fe6a8`。

APK、对照包、日志和临时对比脚本均被 Git 忽略，不纳入提交。