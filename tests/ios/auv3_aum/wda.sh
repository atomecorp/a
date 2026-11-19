#!/bin/zsh
# Starts WebDriverAgent on the iPad and forwards it to $WDA_URL's port (8120 by default).
# WDA_XCTESTRUN: the .xctestrun of a WebDriverAgent built for the iPad (see the memory note reference_ios_device_tools).
source "${0:A:h}/env.sh"
[ -n "$WDA_XCTESTRUN" ] || { echo "WDA_XCTESTRUN is required"; exit 1; }
PORT=${WDA##*:}
pgrep -f "iproxy $PORT 8100" >/dev/null || (iproxy $PORT 8100 -u $UDID > "$WORK/iproxy.log" 2>&1 &)
xcodebuild test-without-building -xctestrun "$WDA_XCTESTRUN" -destination id=$UDID > "$WORK/wda.log" 2>&1 &
for i in {1..60}; do curl -sf -m 2 "$WDA/status" >/dev/null && { echo ready; exit 0; }; sleep 2; done
echo "WDA did not answer (see $WORK/wda.log)"; exit 1
