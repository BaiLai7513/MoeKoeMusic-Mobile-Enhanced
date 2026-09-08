# 构建说明

## 环境要求

- JDK 17+（建议）
- Android SDK Build-Tools（包含 `apksigner`）
- [Apktool](https://apktool.org/)（本项目使用 Apktool 3.x 测试）
- 本机 Android 调试桥（`adb`），用于安装测试

## 准备

```bash
# 在项目根目录执行

# Linux / macOS / Git Bash
export APKTOOL_JAR=/absolute/path/to/apktool.jar
export APKSIGNER=/absolute/path/to/android-sdk/build-tools/35.0.0/apksigner
export KEYSTORE=/absolute/path/to/your.keystore
export KS_ALIAS=moekoe
export KS_PASS=your-password

bash scripts/build.sh
```

PowerShell:

```powershell
$env:APKTOOL_JAR = "C:\path\to\apktool.jar"
$env:APKSIGNER = "C:\path\to\Android\Sdk\build-tools\35.0.0\apksigner.bat"
$env:KEYSTORE = "C:\path\to\your.keystore"
$env:KS_PASS = "your-password"
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
```

## 生成签名密钥（如无）

```bash
keytool -genkeypair -v -keystore moekoe.keystore -alias moekoe \
  -keyalg RSA -keysize 2048 -validity 10000
```

> 请勿将私钥提交到 git。仓库中的 `.gitignore` 已忽略 `*.keystore` / `*.jks`。

## 安装测试

```bash
adb install -r dist/MoeKoeMusic-Mobile-Enhanced.apk
```

## 注意

- `src/apktool` 是完整解码工程；用 Apktool 直接重建即可得到 APK。
- 仓库根目录 `apk/` 里的 APK 是当前发布的签名版本，仅供直接安装/对照。
- 安装覆盖旧版本时，签名必须一致；不同签名需要先卸载旧应用。
