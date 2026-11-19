#!/bin/zsh
# WDA helper for the iPad. Usage: w.sh shot <file> | tap x y | hold x y secs | drag x1 y1 x2 y2 secs | type text | home | launch bundle | size
source "${0:A:h}/env.sh"
B=$WDA
S=$(cat "$WORK/.sid" 2>/dev/null)
ensure() { if [ -z "$S" ] || ! curl -sf -m 5 $B/session/$S >/dev/null; then S=$(curl -s -m 20 -X POST $B/session -H 'Content-Type: application/json' -d '{"capabilities":{"alwaysMatch":{}}}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["sessionId"])'); echo $S > "$WORK/.sid"; fi; }
case $1 in
 shot) curl -s -m 30 $B/screenshot | python3 -c 'import sys,json,base64;open(sys.argv[1],"wb").write(base64.b64decode(json.load(sys.stdin)["value"]))' $2 && sips -Z 1400 $2 >/dev/null ;;
 tap) ensure; curl -s -m 20 -X POST $B/session/$S/wda/tap -H 'Content-Type: application/json' -d "{\"x\":$2,\"y\":$3}" >/dev/null ;;
 hold) ensure; curl -s -m 30 -X POST $B/session/$S/wda/touchAndHold -H 'Content-Type: application/json' -d "{\"x\":$2,\"y\":$3,\"duration\":$4}" >/dev/null ;;
 drag) ensure; curl -s -m 30 -X POST $B/session/$S/wda/dragfromtoforduration -H 'Content-Type: application/json' -d "{\"fromX\":$2,\"fromY\":$3,\"toX\":$4,\"toY\":$5,\"duration\":$6}" >/dev/null ;;
 type) ensure; curl -s -m 20 -X POST $B/session/$S/wda/keys -H 'Content-Type: application/json' -d "{\"value\":[\"$2\"]}" >/dev/null ;;
 home) curl -s -m 10 -X POST $B/wda/homescreen >/dev/null ;;
 launch) ensure; curl -s -m 30 -X POST $B/session/$S/wda/apps/launch -H 'Content-Type: application/json' -d "{\"bundleId\":\"$2\"}" ;;
 size) ensure; curl -s $B/session/$S/window/size ;;
esac
