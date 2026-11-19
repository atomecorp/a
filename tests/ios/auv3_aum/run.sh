#!/bin/zsh
# run.sh <probe.js> → evaluates lib.js + wav_lib.js (+ fxlib.js with FXLIB=1) + the probe in the AUv3's page and prints
# its JSON result. Each probe declares `const probe = async () => { … }`; the body ends with `return probe();`. Chunk names come from the installed build. STANDALONE=1: the app itself instead of the extension.
source "${0:A:h}/env.sh"
APPDIR="$DD/Build/Products/Debug-iphoneos/atome.app"; SH=$APPDIR/PlugIns/atomeAudioUnit.appex/atome_runtime/chunks/shared
[ -n "$STANDALONE" ] && SH=$APPDIR/atome_runtime/chunks/shared
TG=$(ls $SH | grep '^tool_gateway-'); PV=$(ls $SH | grep '^project_view_surface_runtime-'); FX=$(ls $SH | grep '^fx_rack_runtime-')
# The upload's media probes (asset_box_media.js) live in an anonymous chunk: found by a string of theirs.
AB=$(grep -l 'probeAudioDuration' $SH/*.js | head -1); AB=${AB:t}
PROBE="${1:A}"
sed "s#__TG__#$TG#; s#__PV__#$PV#; s#__GID__#${AUM_PROJECT:-}#" "$HERE/lib.js" | cat - "$HERE/wav_lib.js" $([ -n "$FXLIB" ] && echo "$HERE/fxlib.js") "$PROBE" <(print -r -- 'return probe();') | sed "s#__FX__#$FX#; s#__AB__#$AB#" > "$WORK/.run_body.js"
BUNDLE=${BUNDLE:-one.atome.app.atome} UDID=$UDID EVAL_TIMEOUT_MS=${T:-60000} timeout 200 node "$HERE/ev.mjs" "$WORK/.run_body.js" 2>&1 | grep '^@@' | cut -c3-
