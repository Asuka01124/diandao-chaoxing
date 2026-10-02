# 项目协作说明

- 对用户用简体中文回复。
- 在 Windows 打包 Android APK 前，先读 `docs/android-apk-build.md`，并优先使用 `scripts/build-android-apk.ps1`。不要从 `subst` 的短盘符运行整个 Gradle 构建；短盘符只供 CMake 使用。
- `apps/mobile/android` 和 `.tooling` 是本机生成目录。不要把对生成的 `build.gradle` 的临时修改当成持久修复，也不要提交 `.env`、密钥或 APK。
- 若构建失败，记录最早的实际错误、根因与已验证的修复到 `docs/android-apk-build.md`；避免仅重复最后一条连锁报错。
