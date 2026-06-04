#!/bin/sh
set -eu

REPO_ROOT="$SRCROOT/../../.."
CRATE_MANIFEST="$REPO_ROOT/platforms/ios/bevy-renderer/Cargo.toml"
PROFILE_DIR=debug
CARGO_PROFILE_FLAG=

export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export CARGO_TARGET_DIR="$PROJECT_TEMP_DIR/ios-bevy-renderer-target"
if [ -n "${RUSTFLAGS:-}" ]; then
  export RUSTFLAGS="$RUSTFLAGS -C force-unwind-tables=no"
else
  export RUSTFLAGS="-C force-unwind-tables=no"
fi

if [ "${CONFIGURATION:-Debug}" = "Release" ]; then
  CARGO_PROFILE_FLAG=--release
  PROFILE_DIR=release
fi

echo "[IOS_BEVY_BUILD] env sdk=${SDK_NAME:-unknown} archs=${ARCHS:-arm64} configuration=${CONFIGURATION:-Debug}"
echo "[IOS_BEVY_BUILD] target_dir=$CARGO_TARGET_DIR"

if [ ! -f "$CRATE_MANIFEST" ]; then
  echo "[IOS_BEVY_BUILD] fatal missing crate manifest: $CRATE_MANIFEST" >&2
  exit 1
fi

CARGO_BIN="${CARGO:-}"
if [ -z "$CARGO_BIN" ]; then
  CARGO_BIN="$(command -v cargo || true)"
fi
if [ -z "$CARGO_BIN" ] && [ -x "$HOME/.cargo/bin/cargo" ]; then
  CARGO_BIN="$HOME/.cargo/bin/cargo"
fi
if [ -z "$CARGO_BIN" ] || [ ! -x "$CARGO_BIN" ]; then
  echo "[IOS_BEVY_BUILD] fatal cargo not found. Xcode GUI may not inherit shell PATH." >&2
  echo "[IOS_BEVY_BUILD] fatal expected cargo in PATH or at $HOME/.cargo/bin/cargo" >&2
  exit 1
fi

echo "[IOS_BEVY_BUILD] cargo=$CARGO_BIN"
echo "[IOS_BEVY_BUILD] rustflags=$RUSTFLAGS"
"$CARGO_BIN" --version

mkdir -p "$TARGET_TEMP_DIR"
rm -f "$TARGET_TEMP_DIR/libatome_ios_bevy_renderer.a"

BUILT_LIBS=
for ARCH in ${ARCHS:-arm64}; do
  case "${SDK_NAME:-}" in
    iphoneos*)
      if [ "$ARCH" != "arm64" ]; then
        echo "[IOS_BEVY_BUILD] skip unsupported device arch=$ARCH"
        continue
      fi
      RUST_TARGET="aarch64-apple-ios"
      ;;
    iphonesimulator*)
      if [ "$ARCH" = "x86_64" ]; then
        RUST_TARGET="x86_64-apple-ios"
      else
        RUST_TARGET="aarch64-apple-ios-sim"
      fi
      ;;
    *)
      echo "[IOS_BEVY_BUILD] fatal unsupported SDK_NAME=${SDK_NAME:-unknown}" >&2
      exit 1
      ;;
  esac

  echo "[IOS_BEVY_BUILD] cargo build target=$RUST_TARGET arch=$ARCH"
  "$CARGO_BIN" build --manifest-path "$CRATE_MANIFEST" --target "$RUST_TARGET" $CARGO_PROFILE_FLAG

  BUILT_LIB="$CARGO_TARGET_DIR/$RUST_TARGET/$PROFILE_DIR/libatome_ios_bevy_renderer.a"
  if [ ! -f "$BUILT_LIB" ]; then
    echo "[IOS_BEVY_BUILD] fatal cargo succeeded but staticlib is missing: $BUILT_LIB" >&2
    exit 1
  fi
  BUILT_LIBS="$BUILT_LIBS $BUILT_LIB"
done

set -- $BUILT_LIBS
if [ "$#" -eq 0 ]; then
  echo "[IOS_BEVY_BUILD] fatal no Rust staticlib was built for sdk=${SDK_NAME:-unknown} archs=${ARCHS:-arm64}" >&2
  exit 1
fi

if [ "$#" -eq 1 ]; then
  cp "$1" "$TARGET_TEMP_DIR/libatome_ios_bevy_renderer.a"
else
  xcrun lipo -create "$@" -output "$TARGET_TEMP_DIR/libatome_ios_bevy_renderer.a"
fi

echo "[IOS_BEVY_BUILD] linked staticlib=$TARGET_TEMP_DIR/libatome_ios_bevy_renderer.a"
