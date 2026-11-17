#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Toolchain portable yang dipakai di mesin ini. Override lewat env jika perlu.
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  export JAVA_HOME="$HOME/android-tools/jdk"
fi
if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME/platforms" ]; then
  export ANDROID_HOME="$HOME/Android/Sdk"
fi
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

if ! "$JAVA_HOME/bin/java" -version >/dev/null 2>&1; then
  echo "JDK tidak ditemukan di $JAVA_HOME" >&2
  echo "Set JAVA_HOME ke instalasi JDK 21." >&2
  exit 1
fi

if [ ! -d "$ANDROID_HOME/platforms" ]; then
  echo "Android SDK tidak ditemukan di $ANDROID_HOME" >&2
  echo "Set ANDROID_HOME ke Android SDK yang punya platforms & build-tools." >&2
  exit 1
fi

SERVER_URL="${CAPACITOR_SERVER_URL:-http://10.0.2.2:3000}"
echo "==> Capacitor server URL: $SERVER_URL"
echo "==> Sync web assets & plugin"
bunx cap sync android

echo "==> Build debug APK"
(
  cd android
  ./gradlew assembleDebug --no-daemon
)

mkdir -p dist
cp android/app/build/outputs/apk/debug/app-debug.apk dist/PeppyCell-debug.apk
echo
echo "APK siap: $ROOT/dist/PeppyCell-debug.apk"
ls -lh dist/PeppyCell-debug.apk
