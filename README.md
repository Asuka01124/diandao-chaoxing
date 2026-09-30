# 多账号签到工具

单设备 React Native + TypeScript 工具。Android 应用默认从手机直接调用学习通 HTTPS 接口，无需配置服务器地址；移动端持有加密账号资料并逐账号执行任务。仓库保留可选的 Fastify 网关。

## 运行

要求 Node.js 22.13+、Bun 1.3+，以及用于运行 development build 的 Android SDK 或 iOS 开发环境。

```powershell
bun install
bun run typecheck
bun test
```

安装 APK 后即可使用自动直连模式。若需要自建网关，可选运行：

```powershell
$env:TLS_KEY_FILE='C:\path\to\server.key'
$env:TLS_CERT_FILE='C:\path\to\server.crt'
$env:HOST='0.0.0.0'
bun run --cwd apps/api start
```

本机回环地址可不用 TLS 运行网关；手机连接自建网关时仍要求可信 HTTPS。可以将 `apps/mobile/.env.example` 复制为 `apps/mobile/.env` 并填写 `EXPO_PUBLIC_API_URL`，也可以安装后在“设置 → 高级选项”输入网关地址。清空该地址即可恢复自动直连。证书必须被设备信任，域名须与证书匹配。

`D:\ChaoxingSignFaker` 中的 `chaoxing.com` HTTPS 地址是第三方协议端点。`packages/provider-adapter` 按该项目源码实现协议调用，移动端默认直接使用该适配层；`apps/api` 只作为可选网关。每次直连请求关闭系统共享 Cookie，并按账号手动附加会话 Cookie。动态二维码含有 `c` 参数时，提交前会调用第三方 `signDetail` 检查是否过期。

启动移动端：

```powershell
bun run --cwd apps/mobile android
bun run --cwd apps/mobile start
```

`ios` 脚本需要 macOS。项目采用 Expo development build；增加原生依赖后需重新构建客户端。

## 已实现

- 系统锁屏验证、本地 AES-GCM 加密文件与 SecureStore 密钥；账号增删、重新授权、会话恢复。
- 独立 Cookie 会话、课程与课程签到活动读取、活动详情及登录过期重登。
- 单击、位置、照片、二维码、数字签到码、手势的输入校验及逐账号任务。照片从相册或相机选择后压缩为 JPEG，任务队列按账号分别上传；上传失败的账号可单独重试，临时照片按设置的期限清理。照片活动要求位置时可一并填写。
- 任务状态持久化，单账号失败不阻断其他账号；提交超时和重启恢复时先查远端状态。动态二维码保存相机实际扫描时间，过期可重新扫码续签。
- 课程与群聊分别读取活动；群聊消息在请求内解析，活动详情展示签到与签退关系，可打开已发布的关联签退。
- 验证码与人脸要求进入等待状态。人脸可为当前账号单独拍摄或选择授权照片，由第三方接口校验后提交；也可在官方客户端人工完成并返回任务页核查。验证码通过官方客户端人工完成后核查。
- 活动缓存按账号隔离；Tamagui 支持系统、亮色、暗色主题切换。
- 严格的第三方响应解析、HTTPS 限制、请求体与频率限制、整次操作超时取消、默认关闭敏感日志。

## 当前边界

- 第三方接口并非官方稳定 API。本实现基于 `D:/ChaoxingSignFaker` 的静态源码分析和脱敏夹具，尚未使用真实授权账号、真实活动验证。接口变化会返回 `PROVIDER_CHANGED`，不会把未知响应当作成功。
- 应用内验证码提交尚未接入，需在官方客户端人工完成。人脸材料上传、群聊与签退协议尚待真实授权账号验证。
- 已完成 Android arm64 APK 本地构建和签名验证；本环境没有连接真机，真实账号与真实活动的端到端流程尚未验证。
- 单设备模式没有数据库、后台任务或跨设备同步。默认从手机直连第三方 HTTPS 接口；自建网关是可选功能。

## 目录

- `apps/mobile`：Expo Router 页面、Tamagui UI、本地加密仓库和逐账号任务队列。
- `apps/api`：可选的无状态 Fastify 网关。
- `packages/provider-adapter`：第三方请求、Cookie 管理和严格解析。
- `packages/shared`：共享模型与输入校验。
