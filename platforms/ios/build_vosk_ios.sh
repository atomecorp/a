#!/bin/sh
# libvosk for arm64 iOS devices, built from pinned sources (alphacephei publishes no iOS build):
# OpenFST compiled straight from its sources (no autotools), Kaldi configured for Darwin then
# compiled with the iOS SDK and Accelerate, vosk-api on top, merged into one static archive.
# Prints the directory holding libvosk_ios.a. The result is cached per pinned version.
# Measured and validated on an iPad A12Z: todo/refonte_assistant_vocal.md §10.5.
set -eu

KALDI_COMMIT=bc5baf14231660bd50b7d05788865b4ac6c34481    # github.com/alphacep/kaldi, branch vosk
OPENFST_COMMIT=18e94e63870ebcf79ebb42b7035cd3cb626ec090  # github.com/alphacep/openfst
VOSK_COMMIT=4ab9821510b488efb7740094714a130bd3545e90     # github.com/alphacep/vosk-api
MIN_IOS=15.0

CACHE="${ATOME_VOSK_IOS_CACHE:-$HOME/Library/Caches/atome/vosk-ios}/$VOSK_COMMIT-$KALDI_COMMIT"
OUT="$CACHE/lib"
if [ -f "$OUT/libvosk_ios.a" ]; then echo "$OUT"; exit 0; fi

log() { echo "[VOSK_IOS_BUILD] $*" >&2; }
fetch() { # repository commit directory
  if [ ! -d "$3/.git" ]; then git init -q "$3" && git -C "$3" remote add origin "$1"; fi
  git -C "$3" fetch -q --depth 1 origin "$2" && git -C "$3" checkout -q FETCH_HEAD
}
mkdir -p "$CACHE/src" "$OUT"
SRC="$CACHE/src"
log "sources in $SRC"
fetch https://github.com/alphacep/kaldi "$KALDI_COMMIT" "$SRC/kaldi"
fetch https://github.com/alphacep/openfst "$OPENFST_COMMIT" "$SRC/openfst"
fetch https://github.com/alphacep/vosk-api "$VOSK_COMMIT" "$SRC/vosk-api"

SDK=$(xcrun --sdk iphoneos --show-sdk-path)
CXX=$(xcrun --sdk iphoneos -f clang++)
AR=$(xcrun --sdk iphoneos -f ar)
IOS_FLAGS="-arch arm64 -isysroot $SDK -miphoneos-version-min=$MIN_IOS"
JOBS=$(sysctl -n hw.ncpu)

log "OpenFST"
FST="$SRC/kaldi/tools/openfst"
rm -rf "$FST" "$CACHE/obj" && mkdir -p "$FST/lib" "$CACHE/obj/fst" "$CACHE/obj/ngram" "$CACHE/obj/vosk"
cp -R "$SRC/openfst/src/include" "$FST/include"
for f in "$SRC"/openfst/src/lib/*.cc; do
  $CXX $IOS_FLAGS -O3 -std=c++17 -fPIC -DFST_NO_DYNAMIC_LINKING -Wno-deprecated-declarations -I"$FST/include" -c "$f" -o "$CACHE/obj/fst/$(basename "$f" .cc).o"
done
for f in "$SRC"/openfst/src/extensions/ngram/*.cc; do
  $CXX $IOS_FLAGS -O3 -std=c++17 -fPIC -DFST_NO_DYNAMIC_LINKING -Wno-deprecated-declarations -I"$FST/include" -c "$f" -o "$CACHE/obj/ngram/$(basename "$f" .cc).o"
done
$AR rcs "$FST/lib/libfst.a" "$CACHE"/obj/fst/*.o
$AR rcs "$FST/lib/libfstngram.a" "$CACHE"/obj/ngram/*.o

log "Kaldi"
cd "$SRC/kaldi/src"
# Configured as Darwin (Accelerate), then compiled with the iOS SDK; its host test programs
# cannot run, which configure reports without failing.
./configure --static --use-cuda=no --fst-root="$FST" --fst-version=1.8.0 >&2
sed -i '' "s|^CXX = c++|CXX = $CXX $IOS_FLAGS|; s|^AR = ar|AR = $AR|; s|-msse -msse2||; s|-O1 |-O3 -DNDEBUG |; s| -g | |" kaldi.mk
KALDI_LIBS="online2 decoder ivector gmm tree feat lat lm rnnlm hmm nnet3 transform cudamatrix matrix fstext util base"
make -j"$JOBS" $KALDI_LIBS >&2

log "vosk-api"
for f in language_model model postprocessor recognizer spk_model vosk_api; do
  $CXX $IOS_FLAGS -O3 -DNDEBUG -std=c++17 -fPIC -Wno-deprecated-declarations -DFST_NO_DYNAMIC_LINKING -DKALDI_DOUBLEPRECISION=0 -DHAVE_CLAPACK \
    -I"$SRC/vosk-api/src" -I"$SRC/kaldi/src" -I"$FST/include" -c "$SRC/vosk-api/src/$f.cc" -o "$CACHE/obj/vosk/$f.o"
done
set --
for lib in $KALDI_LIBS; do set -- "$@" "$SRC/kaldi/src/$lib/kaldi-$lib.a"; done
libtool -static -o "$OUT/libvosk_ios.a" "$CACHE"/obj/vosk/*.o "$@" "$FST/lib/libfst.a" "$FST/lib/libfstngram.a" 2>/dev/null
log "built $OUT/libvosk_ios.a"
echo "$OUT"
