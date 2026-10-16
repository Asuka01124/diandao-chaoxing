# 自动测试与 Android 发布

`.github/workflows/ci-release.yml` 在每次分支 push、PR 和手动触发时运行离线测试与 TypeScript 检查。main 通过检查后，在 Ubuntu runner 上使用 Expo prebuild 生成原生工程，构建 arm64 APK，校验后自动发布 GitHub Release。新 push 会取消同分支旧运行；发布前再确认提交仍是 main 最新版本。

## 测试数据与网络

`bun run test` 预加载 `scripts/offline-test-guard.ts`，默认 fetch 直接报错。协议测试全部注入模拟 Transport，包含普通、照片、位置、二维码、签到码、手势六类请求，动态二维码核查、个人结果确认、照片 multipart 字节及 Expo 原生请求体兼容性。

这些测试不登录学习通、不上传照片到学习通、不提交真实签到；不需要学习通账号、密码、Cookie 或测试活动。CI 构建下载依赖、上传构建产物和发布 Release 仍需要网络。离线测试能验证代码与请求格式，但不能证明学习通目前一定接受这些请求。

## 构建配置

GitHub 仓库 Actions Secrets 使用以下构建配置；它们均不是学习通账号资料：

| 名称 | 用途 |
| --- | --- |
| `AMAP_ANDROID_KEY` | 沿用本机地图配置，写入 Android 应用 |
| `ANDROID_KEYSTORE_BASE64` | 现有 APK 签名 keystore 的 Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 签名别名 |
| `ANDROID_KEY_PASSWORD` | 签名条目密码 |

测试和 PR 不读取上述 Secrets。密钥只解码到 runner 临时目录，构建后清理，不放进源码、APK 附件或构建产物。发布使用 GitHub 自动提供的 `GITHUB_TOKEN`；只有独立的发布 job 获得 `contents: write`。

CI 签名由版本管理内的 Expo 插件注入，沿用现有签名证书。校验脚本硬性核对证书 SHA-256、包名、arm64 架构、版本、地图配置和 16 KB ZIP 对齐，不匹配就停止发布。本地 Windows 仍按 `docs/android-apk-build.md` 使用原打包脚本。

## 版本与产物

APK 版本名保持 app.json 中的配置，例如 `1.5`。新版本首次发布使用 `v1.5` tag；后续 push 保持应用版本名为 `1.5`，使用唯一 tag（例如 `v1.5-build.3`）发布新的构建，避免覆盖其他提交。同一提交重试保留基础 tag。Android 版本码为 `基础 versionCode × 10000 + 运行编号`，例如基础 28 的第二次运行是 280002，可升级已发布的 1.4.1（270001）。CI 版本码修改只存在于 runner，不回写源码。

运行编号必须在 1–9999 内；提升基础版本时，也要提升 app.json 的基础 versionCode，确保可升级。CI 版本安装后，本地若要覆盖安装，应使用不低于已安装 CI 版本的 Android 版本码。重新运行同一工作流保留版本和 tag，核对源码提交后更新同一 Release；不会为重试创建新版本。

发布附件为 `daodian-v<版本>-arm64.apk`、`update.json` 和 `SHA256SUMS`。静态更新文件在 APK 校验完成后生成，记录同一构建的版本、版本码、下载地址及发布说明；校验和覆盖 APK 与更新文件。两者上传完成后才将 Release 公开并设为最新。Actions 同时保留包含 APK、更新文件、校验和、版本元数据和发布说明的构建产物 14 天。构建或校验失败时不发布；可在 Actions 查看失败步骤。

## 应用内版本更新

应用向 `https://github.com/Asuka01124/diandao-chaoxing/releases/latest/download/update.json` 发起匿名 GET，并关闭 Cookie；不调用 GitHub REST API、不读取或发送学习通账号资料，避免共享出口 IP 的匿名 API 额度影响版本检测。静态下载仍受网络可达性和 GitHub 自身防护影响。Android 更新同时比较版本名和版本码，继续校验正式版本、本仓库下载地址及安装包信息；后续同名构建通过版本码提示更新。iOS 入口打开发布页，不尝试安装 Android APK。

成功检测的原始更新文件在本地缓存 30 分钟，重启应用可复用，读取时重新校验并与当前安装版本比较；过期、损坏或时间异常的缓存会重新获取，网络错误不会伪装成已是最新。并发检测合并为一次请求，每个调用者独立取消；全部取消才中止请求。运行期间收到明确限流响应会遵守服务器等待时间，无有效等待时间时暂停一分钟。缓存不可读写不会阻止正常检测。

首次启用此方案时，必须通过新流程发布包含 `update.json` 的 Release；已安装的旧 APK 仍使用原有 API 检测，需要手动安装新 APK 后生效。最新 Release 缺失更新文件时显示检测失败，用户可从仓库进入发布页查看，不回退请求 API。

发布说明从 CHANGELOG.md 提取当前版本的更新内容，并写入含版本名、版本码和 tag 的结构化标记，供应用识别构建。应用弹窗只展示更新内容；构建资料保留在 GitHub Release 页面。
