#!/usr/bin/env bash
# Builds "atome keychain converter.app" (and its zip) under tools/keychain-converter/dist/.
# The app is the release binary in a minimal bundle, signed ad hoc for this Mac;
# distributing it to other Macs needs a Developer ID signature and notarization.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
name="atome keychain converter"
binary="atome-keychain-converter"
version="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$here/Cargo.toml" | head -n 1)"
dist="$here/dist"
app="$dist/$name.app"

cargo build --release --offline --locked -p atome-keychain-converter --manifest-path "$root/Cargo.toml"

rm -rf "$app"
mkdir -p "$app/Contents/MacOS"
cp "$root/target/release/$binary" "$app/Contents/MacOS/$binary"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>$binary</string>
  <key>CFBundleIdentifier</key><string>one.atome.keychain-converter</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$name</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$version</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSAppleEventsUsageDescription</key><string>Shows the converter's dialogs.</string>
</dict>
</plist>
PLIST
codesign --force --sign - --options runtime --timestamp=none "$app"
codesign --verify --strict "$app"

rm -f "$dist/$name.zip"
ditto -c -k --keepParent "$app" "$dist/$name.zip"
echo "$app"
