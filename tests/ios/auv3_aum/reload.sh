#!/bin/zsh
# Installs the build and reloads the AUM session (installing kills the plugin). The taps open AUM's session menu and
# its first saved session: positions of an iPad in landscape, AUM's session list as it was on 15 Nov. 2026.
source "${0:A:h}/env.sh"
xcrun devicectl device install app --device $UDID "$DD/Build/Products/Debug-iphoneos/atome.app" >/dev/null 2>&1 || { echo install-failed; exit 1; }
sleep 2
"$HERE/w.sh" tap 1374 33; sleep 1; "$HERE/w.sh" tap 1185 145; sleep 1.5; "$HERE/w.sh" tap 1130 258; sleep 4
"$HERE/w.sh" shot "$WORK/reload.png"
echo reloaded
