#!/bin/sh
set -eu
. "$(dirname -- "$0")/../core/lib/common.sh"
# Keep upstream pkg fingerprint verification; do not replace host or target repos.
chroot "$WORK_MNT" env ASSUME_ALWAYS_YES=yes /usr/sbin/pkg bootstrap -f
chroot "$WORK_MNT" pkg update -f
PACKAGES=$(aos_field packages)
# Names are checked in the recipe; splitting only supplies individual pkg arguments.
# Build tools stay explicitly recorded in development images until dependency
# closure and runtime measurements permit removing them safely.
chroot "$WORK_MNT" pkg install -y $PACKAGES python311 gmake cmake ninja pkgconf
chroot "$WORK_MNT" pkg query -a '%n-%v %o' > "${WORK_DIR}/installed-packages.txt"
