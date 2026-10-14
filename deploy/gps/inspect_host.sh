#!/bin/sh
# Read-only capacity inspection through an already trusted SSH destination.
set -eu
host=${1:?Usage: sh deploy/gps/inspect_host.sh trusted-ssh-destination}
case "$host" in -*|*[!a-zA-Z0-9_.@:-]*) printf '%s\n' 'Invalid SSH destination' >&2; exit 2 ;; esac
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 "$host" sh -s <<'REMOTE'
set -eu
uname -sr
getconf _NPROCESSORS_ONLN
uptime
df -Pk /
if [ -d /srv ]; then df -Pk /srv; fi
if command -v free >/dev/null 2>&1; then free -m; fi
if command -v vmstat >/dev/null 2>&1; then vmstat 1 5; fi
if command -v ss >/dev/null 2>&1; then ss -lnt; fi
if command -v systemctl >/dev/null 2>&1; then systemctl is-system-running; fi
REMOTE
