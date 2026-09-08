#!/usr/bin/env bash
set -euo pipefail

# Build script for MoeKoeMusic-Mobile-Enhanced
# Requirements: Java, apktool, Android SDK build-tools (apksigner)
# If keystore variables are omitted, an unsigned APK is produced.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src/apktool"
OUT_DIR="$ROOT/dist"
UNSIGNED="$OUT_DIR/MoeKoeMusic-Mobile-Enhanced-unsigned.apk"
SIGNED="$OUT_DIR/MoeKoeMusic-Mobile-Enhanced.apk"

APKTOOL_JAR="${APKTOOL_JAR:-}"
APKSIGNER="${APKSIGNER:-}"
KEYSTORE="${KEYSTORE:-}"
KS_ALIAS="${KS_ALIAS:-moekoe}"
KS_PASS="${KS_PASS:-}"

mkdir -p "$OUT_DIR"

if [ -z "$APKTOOL_JAR" ]; then
  echo "ERROR: APKTOOL_JAR is not set" >&2
  exit 1
fi

echo "[1/3] Building APK with apktool..."
java -jar "$APKTOOL_JAR" b -o "$UNSIGNED" "$SRC"

if [ -n "$APKSIGNER" ] && [ -n "$KEYSTORE" ]; then
  echo "[2/3] Signing APK..."
  "$APKSIGNER" sign \
    --ks "$KEYSTORE" \
    --ks-key-alias "$KS_ALIAS" \
    --ks-pass "pass:${KS_PASS}" \
    --out "$SIGNED" \
    "$UNSIGNED"
  echo "[3/3] Done: $SIGNED"
else
  echo "[2/2] APKSIGNER/KEYSTORE not provided; leaving unsigned APK at: $UNSIGNED"
fi
