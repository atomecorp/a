#!/bin/sh
set -eu
. "$(dirname -- "$0")/../core/lib/common.sh"
# Ethernet DHCP does not require connectivity before the offline-capable service starts.
printf '%s\n' 'ifconfig_DEFAULT="DHCP"' >> "${WORK_MNT}/etc/rc.conf"
install -m 600 "${BUILDER_ROOT}/overlays/network/pf.conf" "${WORK_MNT}/etc/pf.conf"
# SSH is opt-in via local recovery configuration and user-provisioned public keys.
# No Wi-Fi credentials, pairing shortcuts or implicit remote API exposure.
