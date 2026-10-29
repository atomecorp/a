#!/bin/sh
# Bound retries and forward shutdown to the owned process, including the UI.
set -eu
case "${1:-}" in
    /usr/local/libexec/aos/start_server.sh) log=/var/log/atome/server.log ;;
    /usr/local/libexec/aos/start_atome.sh) log=/var/log/atome/ui.log ;;
    *) printf '%s\n' 'Unknown supervised service' >&2; exit 1 ;;
esac
child=''
stop() {
    trap - INT TERM
    if [ -n "$child" ]; then kill -TERM "$child"; wait "$child" || :; fi
    exit 0
}
trap stop INT TERM
attempt=0
while [ "$attempt" -lt 3 ]; do
    attempt=$((attempt + 1))
    "$1" >> "$log" 2>&1 &
    child=$!
    status=0
    wait "$child" || status=$?
    child=''
    printf 'Service stopped (attempt %s/3, status %s)\n' "$attempt" "$status" >> "$log"
    [ "$attempt" -ge 3 ] || sleep 3
done
printf '%s\n' 'Restart budget exhausted; inspect logs and restart the service explicitly.' >> "$log"
exit 1
