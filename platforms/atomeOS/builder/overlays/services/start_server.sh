#!/bin/sh
set -eu
export HOME=/home/atome
export PATH=/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin
set -a
. /usr/local/etc/aos/runtime.env
set +a
cd /opt/atome
exec /usr/local/bin/node server/server.js
