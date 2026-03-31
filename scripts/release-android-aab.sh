#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

echo "[1/3] Building web app"
npm run build

echo "[2/3] Syncing Capacitor Android"
npx cap sync android

echo "[3/3] Building signed Android App Bundle"
cd android
./gradlew bundleRelease

echo "Release AAB generated at:"
echo "$ROOT_DIR/android/app/build/outputs/bundle/release/app-release.aab"
