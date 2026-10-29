#!/bin/sh
set -eu
. "$(dirname -- "$0")/../core/lib/common.sh"
# USB class drivers are kept with the official kernel; never install Linux drivers.
if has_module audio || has_module midi; then
    if [ -f "${WORK_MNT}/boot/kernel/snd_uaudio.ko" ]; then
        printf '%s\n' 'snd_uaudio_load="YES"' >> "${WORK_MNT}/boot/loader.conf"
    fi
fi
# No claimed low-latency tuning, automatic JACK or synthetic headless engine.
