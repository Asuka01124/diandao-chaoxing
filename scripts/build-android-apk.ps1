param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mobile = Join-Path $repo 'apps/mobile'
$android = Join-Path $mobile 'android'
$appGradle = Join-Path $android 'app/build.gradle'
$sourceApk = Join-Path $android 'app/build/outputs/apk/release/app-release.apk'
$envFile = Join-Path $mobile '.env'
$sdk = Join-Path $repo '.tooling/android-sdk'
$jdk = Get-ChildItem (Join-Path $repo '.tooling/jdk17') -Directory -ErrorAction Stop |
    Where-Object { Test-Path (Join-Path $_.FullName 'bin/java.exe') } |
    Select-Object -First 1
$gradle = Get-ChildItem (Join-Path $repo '.tooling/gradle/wrapper/dists/gradle-9.3.1-bin') -Recurse -Filter gradle.bat -File -ErrorAction Stop |
    Select-Object -First 1

if (-not $jdk -or -not $gradle -or -not (Test-Path $sdk) -or -not (Test-Path $appGradle)) {
    throw '缺少项目内的 JDK 17、Gradle 9.3.1、Android SDK 或原生工程。请先按 docs/android-apk-build.md 准备环境。'
}

$gradleCache = Join-Path $env:USERPROFILE '.gradle'
if (-not (Test-Path $gradleCache)) { throw "Gradle 依赖缓存不存在：$gradleCache" }
if (-not (Test-Path $envFile)) { throw "缺少高德地图配置：$envFile" }
$amapLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*AMAP_ANDROID_KEY\s*=' } | Select-Object -Last 1
if (-not $amapLine) { throw 'apps/mobile/.env 中缺少 AMAP_ANDROID_KEY。' }
$amapKey = ($amapLine -replace '^\s*AMAP_ANDROID_KEY\s*=\s*', '').Trim().Trim('"', "'")
if (-not $amapKey) { throw 'AMAP_ANDROID_KEY 为空。' }

$drive = @('X', 'W', 'V', 'U', 'T') |
    Where-Object { -not (Test-Path "${_}:\") } |
    Select-Object -First 1
if (-not $drive) { throw 'X: 到 T: 均已占用，无法为 CMake 建立短路径。' }

$config = Get-Content -LiteralPath (Join-Path $mobile 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $config.expo.version
$commit = (& git -C $repo rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw '无法读取 Git 提交号。' }
if (-not $OutputPath) { $OutputPath = Join-Path $repo "daodian-v$version-$commit-arm64.apk" }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)

$logDir = Join-Path $repo '.tooling'
$log = Join-Path $logDir ("build-apk-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
$originalBytes = [IO.File]::ReadAllBytes($appGradle)
$originalText = [Text.Encoding]::UTF8.GetString($originalBytes)
$anchor = '    compileSdk rootProject.ext.compileSdkVersion'
if ($originalText.Split(@($anchor), [StringSplitOptions]::None).Length -ne 2) {
    throw '原生 build.gradle 结构与脚本预期不同，已停止以免错误修改。'
}

$cmakeConfig = @'
    // Temporary Windows short-path workaround; restored after the build.
    externalNativeBuild {
        cmake {
            def shortStaging = System.getenv('DIANDAO_CMAKE_STAGING')
            if (shortStaging) buildStagingDirectory shortStaging
        }
    }
'@
$cmakeHook = @'

// Temporary Windows short-path workaround; restored after the build.
tasks.configureEach { task ->
    if (task.name.startsWith('configureCMakeRelWithDebInfo')) {
        task.doFirst {
            def longRoot = System.getenv('DIANDAO_LONG_ROOT')?.replace('\\', '/')
            def shortRoot = System.getenv('DIANDAO_CMAKE_SHORT_ROOT')?.replace('\\', '/')
            def nativeLinks = file("$buildDir/generated/autolinking/src/main/jni/Android-autolinking.cmake")
            if (longRoot && shortRoot && nativeLinks.exists()) {
                def before = nativeLinks.getText('UTF-8')
                def after = before.replace(longRoot + '/', shortRoot + '/')
                if (after != before) {
                    nativeLinks.write(after, 'UTF-8')
                    println 'Using short CMake source paths for Windows'
                }
            }
        }
    }
}
'@

$savedEnv = @{}
foreach ($name in @('JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'GRADLE_USER_HOME', 'AMAP_ANDROID_KEY', 'DIANDAO_LONG_ROOT', 'DIANDAO_CMAKE_SHORT_ROOT', 'DIANDAO_CMAKE_STAGING', 'PATH')) {
    $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$mapped = $false
$modified = $false
try {
    & subst "${drive}:" $repo
    if ($LASTEXITCODE -ne 0) { throw "无法建立 ${drive}: 短路径映射。" }
    $mapped = $true

    $patched = $originalText.Replace($anchor, $anchor + "`r`n" + $cmakeConfig.TrimEnd()) + "`r`n" + $cmakeHook
    $modified = $true
    [IO.File]::WriteAllText($appGradle, $patched, (New-Object Text.UTF8Encoding($false)))

    $env:JAVA_HOME = $jdk.FullName
    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk
    $env:GRADLE_USER_HOME = $gradleCache
    $env:AMAP_ANDROID_KEY = $amapKey
    $env:DIANDAO_LONG_ROOT = $repo
    $env:DIANDAO_CMAKE_SHORT_ROOT = "${drive}:"
    $env:DIANDAO_CMAKE_STAGING = "${drive}:\.tooling\cxx-app-$drive"
    $env:PATH = (Join-Path $jdk.FullName 'bin') + ';' + (Join-Path $sdk 'platform-tools') + ';' + $env:PATH

    Write-Host "构建 Android arm64 release，日志：$log"
    Push-Location $android
    try {
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            & $gradle.FullName ':app:assembleRelease' '-PreactNativeArchitectures=arm64-v8a' '--offline' '--no-daemon' '--max-workers=2' *> $log
            $buildExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousPreference
        }
    } finally {
        Pop-Location
    }
    if ($buildExit -ne 0) {
        Get-Content -LiteralPath $log -Tail 35 | Write-Host
        throw "Gradle 构建失败（退出码 $buildExit），完整日志：$log"
    }
    if (-not (Test-Path -LiteralPath $sourceApk)) { throw "构建成功但找不到 APK：$sourceApk" }

    $buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $buildTools) { throw '找不到 Android build-tools，无法验证 APK。' }
    $apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
    $aapt = Join-Path $buildTools.FullName 'aapt.exe'
    & $apksigner verify --verbose $sourceApk *> $null
    if ($LASTEXITCODE -ne 0) { throw 'APK 签名验证失败。' }
    $certificate = & $apksigner verify --print-certs $sourceApk |
        Where-Object { $_ -like 'Signer #1 certificate SHA-256 digest:*' } |
        Select-Object -First 1
    $expectedCertificate = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'
    if (-not $certificate -or -not $certificate.EndsWith($expectedCertificate)) {
        throw 'APK 签名证书与已有版本不一致，无法覆盖安装。'
    }
    $badging = & $aapt dump badging $sourceApk
    if ($LASTEXITCODE -ne 0 -or -not ($badging -match "versionName='$([regex]::Escape($version))'")) {
        throw 'APK 版本验证失败。'
    }
    if (-not ($badging -match "package: name='$([regex]::Escape($config.expo.android.package))'")) {
        throw 'APK 包名验证失败。'
    }
    if (-not ($badging -match "versionCode='$([regex]::Escape([string]$config.expo.android.versionCode))'")) {
        throw 'APK 版本码与 app.json 不一致；请检查生成的原生工程是否需要更新。'
    }
    $native = & $aapt dump badging $sourceApk | Where-Object { $_ -like 'native-code:*' }
    if ($native -ne "native-code: 'arm64-v8a'") { throw "APK 架构不符合预期：$native" }

    $destination = Split-Path $OutputPath -Parent
    if (-not (Test-Path -LiteralPath $destination)) { New-Item -ItemType Directory -Path $destination -Force | Out-Null }
    Copy-Item -LiteralPath $sourceApk -Destination $OutputPath -Force
    Write-Host "APK：$OutputPath"
    Write-Host "SHA256：$((Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash)"
} finally {
    if ($modified) { [IO.File]::WriteAllBytes($appGradle, $originalBytes) }
    if ($mapped) { & subst "${drive}:" /D | Out-Null }
    foreach ($name in $savedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], 'Process')
    }
}
