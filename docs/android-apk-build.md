# Android APK 构建记录（Windows）

## 2026-11-24 签到流程修复验证

- 离线导出 Android bundle 时，Metro 报 `Failed to get the SHA-1`，最早缺失的是 Bun 依赖目录中 React Native `js-polyfills/console.js` 的索引。文件存在。按既有方案从仓库真实路径启动 Expo，并临时预加载仓库内文件的 SHA-1 计算脚本，Android bundle 和 Hermes 字节码均成功导出。

## 2026-11-21 高德定位鉴权修复包

- 预览包与正式包使用同一份高德 Key 和 Android 签名，包名分别为 `dev.local.sign.demo` 与 `dev.local.sign.tool`。预览包被高德定位拒绝时，地图页显示可手动选点的短提示。
- 首次重封装定位验证包报 `no arsc mapping`。Windows 的 Bun 隔离依赖布局给资源名加了路径前缀，正式 APK 来自扁平依赖布局。诊断入口只用原生控件并复用正式包资源。完整修复包按正式包命名校验 30 个导出资源，签名与 16 KB 对齐检查均通过。
- 临时定位入口首次运行报 `Missing theme`，独立入口未加载应用完整主题上下文。改用 React Native 原生控件直接验证定位和地址查询。

## 2026-11-21 课程同步与资料恢复修复包

- 首次导出在 Metro 读取 Bun 依赖中的 React Native `console.js` 时失败，报 `Failed to get the SHA-1`。文件已存在，Metro 的文件映射缺少该路径。导出进程用临时预加载脚本为仓库内已存在的文件补算 SHA-1，Expo 导出和 Hermes 编译均成功。
- 以手机上已安装的预览 APK 为基包，复用包名和签名。30 个导出资源均有映射，26 个非 XML 资源逐字节一致。新包通过 v2/v3 签名验证和 16 KB 对齐检查。

## 2026-11-20 新签到结果页预览包（含演练课程）

- 预览脚手架 `.tooling/ui-preview-qslho5xk` 用 Metro transformer 覆盖：结果页用工作树新版，演练全套文件取自 `ae9cda6`（1.8.2）的 api/jobs/vault-core/demo-course/practice-server/courses/prepare/activity/course；正式代码未改。
- 最早失败一：`expo export:embed --transformer` 被 CLI 忽略（`loadMetroConfigAsync` 只传 resetCache/maxWorkers），覆盖不生效且导出"成功"。已验证修复：临时创建 `apps/mobile/metro.config.js` 指向 `preview.metro.js`，导出后删除；用字节码是否含演练串判断覆盖生效，不能只看退出码。
- 最早失败二：preview-transformer 报 `ENOENT …/apps/mobile/undefined`，根因是漏传 `PREVIEW_MOBILE_DIR` 环境变量（preview.metro.js 只设置 PREVIEW_ORIGINAL_TRANSFORMER）。
- 最早失败三：`Unable to resolve …/practice-server`——正式树已删除该文件，transformer 只换源码不换解析。已验证修复：preview.metro.js 加回落解析——脚手架副本内的相对导入回正式树解析（内容由 transformer 按正式树路径替换，保证单份模块），正式树缺失时按扩展名回落脚手架副本。
- 重打包不走 Gradle：以上一轮 `preview-signed.apk`（dev.local.sign.demo、arm64、原签名）为基包，仅替换 `assets/index.android.bundle`。资源经 `aapt2 dump resources` 的名字→短路径映射逐字节核对：21 个一致、5 个图标类 PNG 用导出版替换、2 个 XML 是 aapt2 二进制编译产物保留基包条目。`out/res` 必须先清掉旧导出残留（混入非 bun 命名资源时基包 arsc 无映射）。
- 坑：PowerShell 5.1 按 GBK 解析无 BOM 的中文 ps1 报 UnexpectedToken（与下文既有条目同源），脚本需补 UTF-8 BOM；.NET 相对路径不跟随 Push-Location，读 APK 条目直接用 ZipFile。
- 产物 `daodian-preview-jobpage-arm64.apk`：54,270,232 字节，包名 `dev.local.sign.demo`、版本 `1.8.1`/`42`（沿用基包）、仅 `arm64-v8a`、原签名证书 v2/v3、16 KB 对齐通过。字节码含「签到对象」「选择授权照片」「最近状态」「签到演练」「使用演练二维码」及 `_daodian_practice_course_`/`practice-enc-`。
- SHA-256：`e96fe083528732536d115c27ca7a5f071ab3db0577aeab494c36803db6200a40`。真机验收待用户。
- 登录闪退根因（真机 logcat 实锤）：基包 manifest 自始缺 `android.permission.INTERNET`，登录是首个网络请求，OkHttp 在 native 线程 DNS 解析抛 `SecurityException: Permission denied (missing INTERNET permission?)` 直接杀进程，JS 层无报错。与结果页/演练代码无关，历轮预览包均带此缺陷。
- 已验证修复：`patch-manifest-internet.cjs` 对二进制 AndroidManifest.xml 做插入手术——字符串池追加 `android.permission.INTERNET`（UTF-16 池：偏移项 +4、stringsStart +4、chunk/XML size 同步），克隆现有 `uses-permission` 的 START/END 节点块（80 字节）仅改属性 rawValue/typedValue.data 为新串索引。注意 AXML 节点头 16 字节：元素名在 +20、attributeCount 在 +28、attributeStart 在 +24（按 +28 读名会误中属性串）。修复后 aapt2 badging/xmltree 见 INTERNET、`dumpsys package` granted=true、装机启动存活；真机登录复测待用户。基包备份 `out/preview-signed-nointernet.bak.apk`。
- 诊断钩子教训：本 RN 版本 `ErrorUtils` 不是 `react-native` 的命名导出（import 得 undefined，钩子自身启动即崩）；要用 `globalThis.ErrorUtils`。且 release 包 JS 致命错误本就会进 logcat（AndroidRuntime/ReactNativeJS 带栈），弹窗钩子非必需。
- 补权限后重打包产物 SHA-256：`ff6678ffe46bbc704701309b28ce6d5b61f9c4199af6e447b7a036976ed083e4`（54,270,232 字节，其余校验同上）。
- 「连接不到学习通」根因二（真机 logcat + PREVIEW_API_ERROR 实锤）：预览 api（ae9cda6）调 `provider.activities`，而 read-only-activities.ts 覆盖副本漏了该包装函数 → TypeError 被 direct() 兜底文案「学习通请求失败」伪装成网络失败；登录走 auth.ts 不受影响。已补函数（照 HEAD 含 signStatus enrich）。教训：覆盖导出面必须与调用面逐名核对（diff export 列表），不能只核对 core 三件。
- 根因三（正式版 1.8.3 同患，待用户确认修）：preSign 页 `var signstatus = 5`（页面自身 JS：1/2 灰=已签、5 红=结束未签、7/8/12 绿=疑似请假/豁免），attendanceState 只映射 0/1/2/3/9 → parseStatusPage 抛「远端签到状态未知」→ activities enrich 整表 reject。预览侧容错：单活动 PROVIDER_CHANGED 记 PREVIEW_STATUS_SKIP 后置 signed=null 不拖垮列表；sign-logged.ts 覆盖副本输出 PREVIEW_STATUS_RAW 原始值与页面片段取证。建议正式修复方向：readStatus 的列表回落 catch 扩到「远端签到状态未知」，按课程列表 status/endTime 判定 READY/EXPIRED，不猜新状态码语义。
- 含上述修复产物 SHA-256：`5e30df8337d4b611ba84f817f4251f89431f936581675485b628d61262c30610`。真机已验证：登录成功、真实课程列表加载、演练活动页可达；演练签到→新结果页待用户截图验收。
- 验收与收尾：用户真机确认新结果页效果后要求移除测试课程。已删脚手架内全部演练覆盖副本与覆盖机制（preview-transformer/preview.metro/read-only-activities/sign-logged/演练模块与 api/jobs/vault-core 旧副本），干净预览直接从正式树导出（正式树已含新结果页、无演练）；repack 脚本改为反向断言字节码不含 `practice-enc-`/「签到演练」/「使用演练二维码」（`_daodian_practice_course_` 常量正式保留于 vault-core，仅用于升级时隐藏旧测试记录，属合法残留）。脚手架仅保留重打包与 manifest 修补工具。

## 2026-11-20 1.8.3 CI 发布与 CNB 同步排障

- run 44736511752：mirror 三次 120s PUT 超时（跨境整段停滞），`rerun --failed` 换时段后成功。
- run 44740691094（v1.8.3-build.27）：同样超时 → 上传放宽 600s、校验 300s（4fb01d7）。
- run 44744452429：android 首试遇 Maven Central/Google 瞬时缺依赖（kotlin-gradle-plugins-bom 2.1.20、java-diff-utils 4.15、kotlin-stdlib 2.2.21），`rerun --failed` 通过，未改代码。
- 同 run mirror 被 job 12 分钟上限杀死 → job 上限 30 分钟；单次尝试先改 240s+30s 退避，再改为 90s 无进度看门狗 + 420s 封顶（ddbc7e4）。
- run 44750329534：mirror 报 `duplex option is required when sending a body`——undici 流式 body 必须 `duplex: 'half'`（883a83e）；推送前用本地 node http 服务验证流式 PUT 收满字节。
- run 44753211986（v1.8.3-build.30）：mirror 三次尝试均跑满 420s 封顶——看门狗未触发，说明链路在动但晚高峰跨境带宽不足 7 分钟传完 41 MB；`rerun --failed` 重试（不产生新提交/新 tag）于当晚稍后成功，两源 update.json 均为 v1.8.3-build.30、APK 41,344,139 字节且 CNB HEAD 200。工作树已将单次封顶放宽到 900s、job 上限 55 分钟，随下一批提交。
- 全程 CNB `updates` 分支保持上一次成功版本、GitHub Release 先行发布，用户侧无空窗。重跑/运行期间不推 main（并发取消 + head 校验）。

## 2026-11-20 首屏稳定性与真实登录测试 APK

- 首轮类型检查报 TS2741，登录跳转占位页省略了必填的 children。补上空内容后，移动端类型检查和 158 项离线测试通过。
- 首次封装在 raw/keep.xml 的字节比较处停止。Metro 改变了保留规则的顺序。改为校验资源引用集合覆盖关系，同时继续逐个比较实际资源文件的字节，随后成功封装。
- daodian-v1.8.1-ui-account-test-arm64.apk 使用 dev.local.sign.test 包名，包含真实账号登录、只读课程和本机签到演练。APK 通过 v2/v3 签名、16 KB 对齐和完整性检查。SHA-256 为 78ed1bd6db3c8cd55894f08f809759956e92e408c7edba1b092e5c26d4fa07bc。

## 2026-11-20 极简 UI 离线演练 APK

- 在独立临时目录导出时，最早的产物检查因 JSX 中文被转义而误判入口缺失。核对转义后的文字和入口函数后，又发现该目录解析了两份 React。给临时 Metro 手工指定搜索路径还出现依赖文件 SHA-1 无法读取。
- 已验证的构建从原移动端目录启动 Expo，通过临时 Metro transformer 仅替换演练数据和入口。导出包含单份 React，Hermes 编译成功。复用 r3 的原生库及已核对的 30 个资源，将演练包单独命名为 dev.local.sign.demo。
- daodian-v1.8.1-ui-preview-arm64.apk 通过 v2/v3 签名验证、16 KB 对齐与压缩包完整性检查。仅包含 arm64-v8a。SHA-256 为 3eafe7ed6588183926d21eed2234a746116e88cd559bf1764a7ef4e2f2aa8659。

## 2026-11-19 UI 去冗余清理包（r3）

- 八项 UI 清理：任务页错误只显示横幅（去重复浮层）、活动页移除「刷新状态」及自动查询、任务页副标题解释与底部说明段删除（`job-result` 的 `detail` 字段移除）、活动页副标题删除、已签到隐藏「去准备签到」且「进行中的签到」卡片过滤已签到、任务页瞬时 toast 全部移除、账号行小字仅保留失败原因、课程页活动行小「签到 ›」胶囊移除且行小字只留阶段。157 项测试与类型检查通过。
- 复用已验证流程（`cliFile` 绝对路径、`.bun` 真实路径短盘符 staging、临时关闭 R8/资源裁剪）。`BUILD SUCCESSFUL in 4m 8s`，日志 `.tooling/build-apk-20261119-235151.log`。
- 产物 `daodian-v1.8.1-practice-r3-arm64.apk`：53,580,837 字节，包名 `dev.local.sign.tool`、版本 `1.8.1`/`42`、仅 `arm64-v8a`、原签名证书，16 KB ZIP 对齐通过。字节码确认含「用预留照片验证」、不含「刷新状态」，演练代码在包内。
- SHA-256：`7c7610100b7a5eb15fd980b4b41deede5a0bdd91a6cd0e72179881327732f943`。构建后全部临时修改已按备份恢复。真机验收待用户。

## 2026-11-19 预留照片人脸验证入口重建（r2）

- 任务页 `WAITING_FACE` 增加「用预留照片验证」入口（复用 `ReservedPhotoRow`，新增 `provideFaceFromUri`），补齐人脸步骤原先只有拍照/相册的缺口。157 项测试与类型检查通过。
- 复用上一轮已验证流程：`cliFile` 绝对路径指向 `.tooling/practice-course/copy-bundle.js`、两个 `.bun` 真实路径短盘符 staging、临时关闭 R8 与资源裁剪。`BUILD SUCCESSFUL in 3m 50s`，日志 `.tooling/build-apk-20261119-221929.log`。
- 产物 `daodian-v1.8.1-practice-r2-arm64.apk`：53,583,261 字节，包名 `dev.local.sign.tool`、版本 `1.8.1`/`42`、仅 `arm64-v8a`、原签名证书，16 KB ZIP 对齐通过。Hermes 字节码确认含 UTF-16 的「用预留照片验证」及演练代码。
- SHA-256：`0c2b2abfc570ce6bb0afd345bc103be7d6d0e097f6737727fd47a577f26c80e9`。构建后全部临时修改已按备份恢复。真机验证待用户。

## 2026-11-19 签到演练课程测试包

- 源码新增内置演练课程（`PRACTICE_COURSE_ID`、`practice-server.ts` 内存模拟服务），走真实 `provider.submit`/`signToken` 协议路径，不发真实请求。157 项离线测试与类型检查通过。
- 第一轮最早失败在 `react-native-screens:buildCMakeRelWithDebInfo[arm64-v8a]`：ninja 在长路径 `.cxx/RelWithDebInfo/573o4g4c` 里反复 `Re-running CMake`。根因：Bun 的 `node_modules/react-native-screens` 是独立副本，Gradle 实际读取 `node_modules/.bun/react-native-screens@4.26.2+…` 下的真实文件；短路径 staging 补丁打在副本上不生效。已验证修复：把条件式 `buildStagingDirectory`（按 `DIANDAO_CMAKE_SHORT_ROOT`）补丁打到两个 `.bun` 真实路径（screens 与 gesture-handler），复用 `.tooling/qr-face-device/rns-cxx`、`rngh-cxx` 缓存，原生编译通过。原件备份于 `.tooling/practice-course/*-bun-build.gradle.orig`。
- 第二轮最早失败在 `:app:createBundleReleaseJsAndAssets`，报 `react-native depends on @react-native-community/cli`，且 `copy-bundle.js` 未被调用（无 `wrapper-invoked.log`）。根因：`cliFile = new File(rootDir, '../../.tooling/…')` 少算一层目录——`rootDir` 是 `apps/mobile/android`，`../../` 解析到不存在的 `apps/.tooling`，插件因文件不存在回退 `react-native/cli.js`。本轮注入内容全为 ASCII，与 GBK 中文注释吞行无关。已验证修复：`cliFile` 改用绝对路径。
- 第三轮 `BUILD SUCCESSFUL in 5m 13s`，日志 `.tooling/build-apk-20261119-000335.log`。JS 用 `bunx expo export:embed --platform android --dev false --reset-cache --entry-file node_modules/expo-router/entry.js --minify false` 独立导出到 `.tooling/practice-course/`，经 `copy-bundle.js` 交接、Gradle 自带 hermesc 编译字节码。本次测试包临时关闭 R8 与资源裁剪。
- 产物 `daodian-v1.8.1-practice-arm64.apk`：53,583,433 字节，包名 `dev.local.sign.tool`、版本 `1.8.1`/`42`、仅 `arm64-v8a`、原签名证书，16 KB ZIP 对齐通过。Hermes 字节码确认含 `_daodian_practice_course_`/`practice-enc-`/`signToken`/`cxcid` 及 UTF-16 的「签到演练」。
- SHA-256：`4aa981a167e96ded71e956d7406cb860c8577b2dacd55151a8dc92d4a60965de`。构建后 `app/build.gradle`、两个 `.bun` 依赖 Gradle 文件与 `config/android-packaging.json` 均已按备份恢复。演练课程真机测试待用户进行。

## 2026-11-18 人脸 clientId/signToken 移植测试包

- 本次源码新增 `device.ts`/`face.ts`（clientId 获取与公钥解码、signToken 签名）并打通二维码+人脸。145 项离线测试与类型检查通过。
- 首轮标准脚本最早失败仍在 `react-native-screens:buildCMakeRelWithDebInfo[arm64-v8a]`：Ninja `manifest 'build.ninja' still dirty after 100 tries`，对象目录 200 字符加上对象文件名超出 250 上限。根因：标准脚本的短盘符 CMake staging 只覆盖 `:app`，库模块自身的 `.cxx` 仍在长 `node_modules` 路径。已验证修复：在 `react-native-screens` 与 `react-native-gesture-handler` 的 `android/build.gradle` 的 `externalNativeBuild.cmake` 里按 `DIANDAO_CMAKE_SHORT_ROOT` 环境变量条件式设置 `buildStagingDirectory` 到短盘符目录（复用 `.tooling/qr-face-device/rns-cxx`、`rngh-cxx`），原生编译通过；构建后按备份恢复两份依赖 Gradle 文件。
- 第二轮最早失败在 `:app:createBundleReleaseJsAndAssets`，报 `react-native depends on @react-native-community/cli`。根因：往生成的 `app/build.gradle` 注入的**中文注释**在 Windows GBK 解码下吞掉行尾换行，使紧随其后的 `cliFile` 赋值并入注释，`detectCliFile` 因预设 cliFile 未生效回退到 `react-native/cli.js`（与本文档 PowerShell UTF-8 BOM 条目同源）。已验证修复：生成目录里的临时注释一律用 ASCII；`cliFile` 指向独立导出复制脚本后 bundle 任务正常。
- JS  bundle 交接：在 `apps/mobile` 用 `bunx expo export:embed --platform android --dev false --minify false` 独立导出到 `.tooling/face-port/`（含 `index.android.js`、`res/`、源映射），临时把 `cliFile` 指向 `copy-bundle.js` 将产物复制到 Gradle 的 bundle 输出目录，再由 `BundleHermesCTask` 自带 hermesc 编译字节码。本次测试包临时关闭 R8 与资源裁剪，构建后恢复 `config/android-packaging.json`。
- 产物 `daodian-v1.8.1-face-port-arm64.apk`：53,578,445 字节，包名 `dev.local.sign.tool`、版本 `1.8.1`/`42`、仅 `arm64-v8a`、原签名证书，16 KB ZIP 对齐通过。APK 内 Hermes 字节码确认含 `signToken`/`cxcid`/`LiveDetectionStatus`/`currentFaceId`。日志 `.tooling/build-apk-20261118-172803.log` 为 `BUILD SUCCESSFUL`。
- SHA-256：`0f1052ffaed213cf380aa368a85b77c4212c27ce731c7f90bc0afcfe1079d8a4`。人脸验证与现场扫码仍待用户真机测试。

## 2026-11-18 人脸二维码签到真机验证

- 首轮标准脚本最早失败在 `react-native-screens:buildCMakeRelWithDebInfo[arm64-v8a]`，Ninja 报 `manifest 'build.ninja' still dirty after 100 tries`，并提示对象文件路径过长。备份该模块的生成缓存后仍复现。
- 临时把 `react-native-screens` 和 `react-native-gesture-handler` 的 CMake 生成目录移到标准脚本建立的短盘符下，两者均通过原生编译。后者在原路径明确报错 `Filename longer than 260 characters`。Gradle 仍在原始仓库路径运行，构建后恢复依赖 Gradle 文件。
- Gradle 内 Metro 未能索引本机 Bun 依赖中的 `console.js`。在独立导出进程对已存在且位于仓库内的源文件直接计算 SHA-1，成功导出资源并由 Hermes 编译字节码。
- 将新字节码换入 1.7.9 原生包后覆盖安装成功，但启动报 `Cannot find native module 'ExpoLocalization'`。已用原版同版本 APK 覆盖恢复，并在手机上确认原版重新打开。当前源码需要一起重建原生模块。
- 将独立导出的字节码和资源交给 Gradle，禁用本次测试包的 R8 和资源裁剪，完整原生构建通过。1.8.1（版本码 42，arm64）保留原签名，内置本次签到改动和 `ExpoLocalization`，通过 16 KB ZIP 对齐。真机从 1.7.9 覆盖安装后冷启动通过，课程、任务和设置标签正常显示。人脸验证与现场扫码仍待进行中的真实活动验证。

## 2026-11-16 真机验证构建

- 最早的 Gradle 错误为 `Configuring project ':react-native-worklets' without an existing directory`。仓库移动到 `D:\Projects\diandao-chaoxing` 后，`apps/mobile/android/build/generated/autolinking/autolinking.json` 仍缓存旧路径 `D:\diandao-chaoxing`。
- 将这份生成的 JSON 改名备份后重跑标准脚本。新生成的自动链接缓存指向当前项目目录，Gradle 通过配置并进入原生模块构建。
- Gradle 子进程的 Metro 无法从工作区链接解析 `expo-router/entry`，改用本地入口后仍遇到 `@sign/shared` 解析和 Expo 文件 SHA-1 索引错误。用忽略目录中的临时入口导入 `expo-router/entry`，在 `apps/mobile` 单独执行 Expo Android 导出，再用仓库安装的 Hermes 编译。将生成的字节码和资源交给 Gradle 后，`:app:createBundleReleaseJsAndAssets` 任务通过。原生生成文件中的临时配置在构建结束时恢复。
- 原生编译随后报告离线缓存缺少 `androidx.collection:collection:1.0.0` 和 `androidx.annotation:annotation-jvm:1.8.1`。本次临时允许构建从官方 Maven 仓库下载两项依赖，缓存文件和 Expo Constants 编译均已核实。
- 2026-11-17 使用同签名本地验证构建，临时跳过 R8、资源裁剪和发布 lint。Gradle 在 2m 53s 内构建成功，APK 签名、包名、版本、arm64 架构及内置 Hermes 字节码校验通过。

## 1.7.1 CI 构建（2026-10-14）

- 首次运行 [38581253904](https://github.com/Asuka01124/diandao-chaoxing/actions/runs/38581253904) 的离线测试与类型检查通过，Android 构建在安装 `ndk;27.0.12077973` 时失败。
- 最早实际错误为 `Error on ZipFile unknown archive`，底层为 `java.util.zip.ZipException: Archive is not a ZIP archive`：SDK 安装器读到的 NDK 安装归档无效。后续 `expo-autolinking` 配置失败和 `SoftwareComponent with name 'release' not found` 均为连锁报错。
- 对同一源码提交 `cfaba534546d8ea1bd2648bd4bb479d98d91a253` 重新运行失败任务后，NDK 安装成功，Gradle 为 `BUILD SUCCESSFUL in 14m 3s`；没有修改应用代码或 NDK 配置。尚不能确认首轮无效归档产生于下载、缓存还是上游分发，遇到相同错误可先重试失败任务。
- 正式发布 [v1.7.1](https://github.com/Asuka01124/diandao-chaoxing/releases/tag/v1.7.1)，Android 版本码 `310006`；`daodian-v1.7.1-arm64.apk` 为 41,330,809 字节。离线测试、类型检查以及 APK 版本、原签名、架构、地图配置和 16 KB ZIP 对齐校验全部通过，未进行真机运行验收。
- APK SHA-256：`b8bfe844b8a85982130dffdaa84b72c137c9839f8af78bf2b1b1139588aa5980`。

## 1.4 版本验证（2026-10-12）

- 版本名 `1.4`、Android 版本码 `27`；本次包含底部柔和胶囊滑块和网格课程卡片圆角按压蒙层修复。
- 标准脚本构建 `daodian-v1.4-arm64.apk` 成功，日志 `.tooling/build-apk-20261012-140429.log` 为 `BUILD SUCCESSFUL in 7m`。
- APK：41,342,857 字节；包名 `dev.local.sign.tool`、版本 `1.4`/`27`、原签名证书和仅含 `arm64-v8a` 的校验通过。16 KB ZIP 对齐和 APK 内置 `assets/app.config` 的版本检查通过。
- 90 项测试、类型检查通过。当前没有连接 Android 设备，本次发布包未进行真机运行验收。
- SHA-256：`cc6b46eb1c3adc0b31d519b36acf21b4db933695f703a797f335bcfca841e383`。

## 2026-10-10 签到状态修复构建

- 测试包日志 `.tooling/build-apk-20261010-132308.log` 首个失败为 Expo 原生模块的 `JavaScriptObject.cpp.o` 编译任务。Clang 未输出进一步错误，不能把末尾 `ninja: build stopped` 作为根因；具体原因尚未确认。
- 保持构建配置与原生源码不变，使用标准脚本重跑后，`.tooling/build-apk-20261010-132659.log` 构建成功（3m 3s）。不保留任何生成目录临时修改，也未清除应用数据。

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
| 库模块短路径补丁已打但仍在长 `.cxx` 路径编译 | Bun 的 `node_modules/<pkg>` 是独立副本，Gradle 实际用 `node_modules/.bun/<pkg>@…` 真实路径 | 补丁打到 `.bun` 真实路径的 `android/build.gradle` 并备份原件；构建后恢复。 |
| `cliFile` 指向复制脚本却仍回退 `react-native/cli.js` | `new File(rootDir, '../../.tooling/…')` 少一层目录（`rootDir` 为 `apps/mobile/android`），文件不存在 | `cliFile` 用绝对路径；以导出目录出现 `wrapper-invoked.log` 确认交接生效。 |
| 从短盘符运行 Gradle 出现 `this and base files have different roots` 或 Metro 入口解析失败 | Gradle 使用短盘符，Node/Expo 又返回原始 `D:` 路径，形成跨盘符混用 | **Gradle 必须从原始 `D:\diandao-chaoxing\apps\mobile\android` 路径运行**；短盘符仅供 CMake 使用。 |
| Gradle wrapper 下载失败，或 `--offline` 报缺少 AndroidX / 高德依赖 | 项目 `.tooling/gradle` 与用户目录 `.gradle` 是两份不同缓存；所需依赖在后者 | 脚本直接调用本机 Gradle 9.3.1，并令 `GRADLE_USER_HOME=$env:USERPROFILE\.gradle`。如依赖从未下载，需先联网补齐一次。 |
| Windows PowerShell 5.1 在脚本开头报 `Unexpected token`，中文显示乱码 | 中文 `.ps1` 被保存为不带 BOM 的 UTF-8，PowerShell 5.1 按系统编码解码，部分字节被误识别为引号 | 保留 `scripts/build-android-apk.ps1` 的 UTF-8 BOM；恢复 BOM 后语法解析和构建启动均通过。 |
| 高德定位返回 `INVALID_USER_SCODE` | APK 的包名或证书 SHA-1 与高德 Key 绑定的信息不匹配 | 正式包使用 `dev.local.sign.tool` 及其签名。改用 `dev.local.sign.demo` 等预览包名时，须在高德开放平台为实际包名和证书 SHA-1 配置独立的 Android Key，并重新构建。 |
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

## R8 与资源裁剪（第二轮，2026-10-04）

第二轮在第一轮无损压缩基础上启用 `android.enableMinifyInReleaseBuilds` 与 `android.enableShrinkResourcesInReleaseBuilds`，替换默认规则为 `proguard-android-optimize.txt`。业务/界面源码和依赖版本未修改。`android-r8.pro` 禁止类/方法改名，并保留高德（含新版 `com.amap.location`）、Expo、Fabric UI、SVG、安全区与动画模块，保留动态调用需要的注解和泛型信息。各依赖自己的 consumer 规则仍正常参与 R8。

`plugins/android-r8-gradle.js` 为本地 PowerShell 构建和 Expo 插件提供同一份 Gradle 转换，挂载版本管理内的规则及资源目录；生成工程仍在脚本退出时按原字节恢复。`config/android-resources/raw/diandao_visual_keep.xml` 保留 drawable、mipmap、font、raw 资源，保护 JS/高德按名字动态加载的图片和字体。

### 实际诊断与修复

| 最早实际问题 | 根因与证据 | 修复 |
| --- | --- | --- |
| `minifyReleaseWithR8` 报缺少 `com.amap.ams.gnss.GnssSoftLocator`、`net.jafama.FastMath`；日志 `.tooling/build-apk-20261004-173050.log` | 现有高德组合 SDK 引用了未随包提供的可选类；DEX 检查确认上一轮 53.45 MB APK 中也没有这两个类，非本轮误裁剪。 | 仅采用 `missing_rules.txt` 建议的两个精确 `-dontwarn`，并扩大保留范围至 `com.amap.**`，保护新版定位 JNI 类。随后 `.tooling/build-apk-20261004-173632.log` 构建通过（4m 23s）；没有使用全局 `-ignorewarnings`。 |
| 首次通过的 R8 包在资源名称比对时缺少 20 个 drawable/raw 名称 | 自建 `raw/keep.xml` 与 Metro 生成的同名文件冲突，资源合并时后者覆盖了前者。唯一图片/字体内容哈希均未丢失，但 24 份重复文件以及若干动态资源名称被裁剪，不能据此宣称完整保留。 | 将自建文件改为唯一名 `raw/diandao_visual_keep.xml`，重新构建并复核全部视觉资源名称和文件内容。 |

规则依据：[Android R8 文档](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)、[动态资源保留与唯一文件名](https://developer.android.com/topic/performance/app-optimization/customize-which-resources-to-keep)、[高德保留规则](https://lbs.amap.com/api/android-location-sdk/guide/create-project/dev-attention)。

### 最终结果与回滚

- 最终 APK：`daodian-v1.0.1-r8-arm64.apk`，41,232,749 字节（41.23 MB / 39.32 MiB）。相较上一轮 53,452,457 字节，再减少 12,219,708 字节（22.86%）；相较最初 91,361,600 字节，共减少 50,128,851 字节（54.87%）。上一轮 `daodian-v1.0.1-compact-arm64.apk` 保留，可直接用于覆盖回退。
- 日志 `.tooling/build-apk-20261004-174339.log`：`BUILD SUCCESSFUL in 3m 51s`。DEX 压缩存储从约 19.90 MB 降为 7.91 MB，DEX 类数由 44,566 降为 19,359。
- 与上一轮 APK 对比：全部 29 个 `.so`、Hermes JavaScript 包、应用 assets（排除会随 DEX 重建的基线 profile）内容逐字节一致，没有删除业务资产。
- drawable/mipmap/font/raw 名称去重后为 265 个，前后完全保留；排除构建用的 `raw/keep`、`raw/diandao_visual_keep` 控制文件。273 份 PNG/WebP/JPEG/TTF/OTF 文件的 SHA-256 多重集合完全一致，包含重复副本。
- DEX 校验：上述保留命名空间中的所有非合成类均保留原名；旧 D8 编译器合成辅助类按 DEX `ACC_SYNTHETIC` 标志排除。最终 `configuration.txt` 确认持久化自定义规则和各依赖 consumer 规则均被加载。
- 包名、版本名、版本码、arm64 架构和旧签名验证通过；16 KB ZIP 对齐验证通过。SHA-256：`a23fb7ac25d0fd1fbd87af606a2fba61a3d8729945fd5714edc289e491f5e19c`。
- `bun run test`：57 项通过、0 项失败。Expo introspect 验证 4 项 Gradle 开关；appBuildGradle 模块回调验证自定义规则/资源路径，转换重复执行稳定。注意 Expo introspect 不会输出 appBuildGradle 内容，不能用缺少该输出判定插件无效。
- 未连接 Android 设备，未进行 release 真机安装、启动、地图/定位、扫码、相机/照片以及页面截图回归。上述静态校验和 JS 测试不能替代原生运行时验证；本轮为待真机验收的优化包。
- R8 mapping、seeds、usage、configuration、resources 报告备份于被忽略的 `.tooling/r8-release-20261004/`，用于诊断运行时问题；APK 和报告不提交。

关闭本轮裁剪：将 `config/android-packaging.json` 中 `android.enableMinifyInReleaseBuilds` 和 `android.enableShrinkResourcesInReleaseBuilds` 都设为 `"false"` 后重新运行标准打包脚本。保留第一轮两个压缩开关即可恢复无损压缩策略。也可回滚本轮独立 Git 提交，上一轮稳定提交为 `8ec6888`。不要用清空应用数据来回退。

## 1.1 版本验证（2026-10-04）

- `apps/mobile/app.json` 中版本名更新为 `1.1`，Android 版本码由 23 递增至 24；README 同步仓库版本说明，下载链接仍指向 GitHub 最新已发布版本。
- 安装包 `daodian-v1.1-arm64.apk`：41,232,749 字节（41.23 MB），日志 `.tooling/build-apk-20261004-175643.log` 为 `BUILD SUCCESSFUL in 4m 20s`。
- 脚本验证包名 `dev.local.sign.tool`、实际版本 `1.1`/`24`、arm64 架构和原签名证书均通过；16 KB ZIP 对齐验证通过。可覆盖升级现有版本，未做真机运行回归。
- 与上轮 1.0.1 R8 APK 对照：19,359 个 DEX 类保持，29 个原生库和 Hermes 包逐字节一致，应用 assets 仅 `app.config` 变化；JSON 对比确认只变更版本名与 Android 版本码。
- SHA-256：`2395cfc229e60614a8401d96391336f15620597ff34f267241f259507f6067c2`。R8 报告备份于 `.tooling/r8-v1.1/`。
- 升级至版本码 24 后，旧 1.0.1 APK（版本码 23）不能普通覆盖降级。若要回退 R8 策略，应保留当前版本码，关闭两项裁剪开关后重新打包，以保留应用数据。
