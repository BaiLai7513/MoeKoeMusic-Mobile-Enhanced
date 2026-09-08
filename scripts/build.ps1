# Build script for MoeKoeMusic-Mobile-Enhanced (Windows PowerShell)
# Requirements: Java, apktool, Android SDK build-tools (apksigner)

param(
  [string]$ApktoolJar = $env:APKTOOL_JAR,
  [string]$Apksigner = $env:APKSIGNER,
  [string]$Keystore = $env:KEYSTORE,
  [string]$KsAlias = "moekoe",
  [string]$KsPass = $env:KS_PASS
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Src = Join-Path $Root "src/apktool"
$OutDir = Join-Path $Root "dist"
$Unsigned = Join-Path $OutDir "MoeKoeMusic-Mobile-Enhanced-unsigned.apk"
$Signed = Join-Path $OutDir "MoeKoeMusic-Mobile-Enhanced.apk"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if (-not $ApktoolJar) {
  throw "ApktoolJar is not set. Use -ApktoolJar or env APKTOOL_JAR."
}

Write-Host "[1/3] Building APK with apktool..."
java -jar $ApktoolJar b -o $Unsigned $Src

if ($Apksigner -and $Keystore) {
  Write-Host "[2/3] Signing APK..."
  & $Apksigner sign --ks $Keystore --ks-key-alias $KsAlias --ks-pass "pass:$KsPass" --out $Signed $Unsigned
  Write-Host "[3/3] Done: $Signed"
} else {
  Write-Host "[2/2] APKSIGNER/KEYSTORE not provided; leaving unsigned APK at: $Unsigned"
}
