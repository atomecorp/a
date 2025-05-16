#!/bin/bash

set -e

APP_NAME="MonApp"  # Nom de ton app (change-le)
BUNDLE_DIR="src-tauri/target/release/bundle"
APPLE_ID="ton@mail.com"
TEAM_ID="XXXXXXXXXX"
PFX_PASSWORD="motdepasse"

sign_mac() {
  echo "🔐 Signing macOS app…"
  codesign --deep --force --verbose \
    --sign "Developer ID Application: $APPLE_ID ($TEAM_ID)" \
    --entitlements cert/mac/entitlements.plist \
    --options runtime \
    "$BUNDLE_DIR/macos/$APP_NAME.app"

  echo "📤 Submitting for notarization…"
  xcrun notarytool submit "$BUNDLE_DIR/macos/$APP_NAME.app" \
    --apple-id "$APPLE_ID" \
    --team-id "$TEAM_ID" \
    --password "$APP_SPECIFIC_PASSWORD" \
    --wait

  echo "📎 Stapling ticket…"
  xcrun stapler staple "$BUNDLE_DIR/macos/$APP_NAME.app"
  echo "✅ macOS App signed and notarized!"
}

sign_windows() {
  echo "🔐 Signing Windows executable…"
  signtool sign /f "cert/windows/certificate.pfx" \
    /p "$PFX_PASSWORD" \
    /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 \
    "$BUNDLE_DIR/windows/$APP_NAME.exe"
  echo "✅ Windows app signed!"
}

case "$OSTYPE" in
  darwin*)  sign_mac ;;
  msys*|cygwin*|win32*) sign_windows ;;
  *) echo "Unsupported OS: $OSTYPE" && exit 1 ;;
esac