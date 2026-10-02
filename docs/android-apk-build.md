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
