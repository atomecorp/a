#!/bin/sh
# Launch the existing real web runtime; no browser or renderer substitution.
set -eu
. /usr/local/etc/aos/ui.conf
export HOME=/home/atome
export XDG_RUNTIME_DIR=/var/run/atome/wayland
export PATH=/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
count=0
until curl -fsS -o /dev/null "$ATOME_BACKEND_URL"; do
    count=$((count + 1))
    [ "$count" -lt "$ATOME_WAIT_TIMEOUT" ] || { printf '%s\n' 'Fastify is not ready; display startup failed.' >&2; exit 1; }
    sleep 1
done
exec cage -- cog --platform=wl "$ATOME_BACKEND_URL"
