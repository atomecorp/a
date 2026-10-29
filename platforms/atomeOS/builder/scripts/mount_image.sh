#!/bin/sh
# Identify UFS from partition metadata, never by trying arbitrary partitions.
set -eu
. "$(dirname -- "$0")/../core/lib/common.sh"
mkdir -p "$WORK_MNT"
MD_UNIT=$(mdconfig -a -t vnode -f "$WORK_IMG")
printf '%s\n' "$MD_UNIT" > "${WORK_DIR}/md-unit"
gpart show -p "$MD_UNIT" > "${WORK_DIR}/partitions.txt"
ROOT_PARTS=$(awk '$4 == "freebsd-ufs" { print $3 }' "${WORK_DIR}/partitions.txt")
COUNT=$(printf '%s\n' "$ROOT_PARTS" | awk 'NF { n++ } END { print n+0 }')
[ "$COUNT" -eq 1 ] || { log_error 'Expected exactly one UFS root partition; unsupported layout'; exit 1; }
ROOT_PART=$ROOT_PARTS
case "$ROOT_PART" in "${MD_UNIT}"p[0-9]*|"${MD_UNIT}"s[0-9]*[a-h]) ;; *) log_error 'Invalid UFS provider'; exit 1 ;; esac
# Grow GPT only if the UFS root is the last data partition. Other layouts retain
# the official board boot bytes and filesystem size; capacity is checked below.
case "$ROOT_PART" in "${MD_UNIT}"p*)
    LAST_PART=$(awk '$3 ~ /^md[0-9]+p[0-9]+$/ { part=$3 } END { print part }' "${WORK_DIR}/partitions.txt")
    if [ "$ROOT_PART" = "$LAST_PART" ]; then
        gpart recover "$MD_UNIT"
        gpart resize -i "${ROOT_PART##*p}" "$MD_UNIT"
        fsck_ufs -p "/dev/${ROOT_PART}"
        growfs -y "/dev/${ROOT_PART}"
    fi ;;
esac
mount -t ufs "/dev/${ROOT_PART}" "$WORK_MNT"
: > "${WORK_DIR}/root-mounted"
[ -x "${WORK_MNT}/bin/sh" ] && [ -f "${WORK_MNT}/etc/master.passwd" ] || { log_error 'Mounted partition is not a FreeBSD root'; exit 1; }
mount -t devfs devfs "${WORK_MNT}/dev"
: > "${WORK_DIR}/devfs-mounted"
cp /etc/resolv.conf "${WORK_MNT}/etc/resolv.conf"
# Fail before package installation if a board root partition has insufficient space.
AVAILABLE=$(df -Pk "$WORK_MNT" | awk 'NR == 2 { print $4 }')
[ "$AVAILABLE" -ge 3145728 ] || { log_error 'UFS root has less than 3 GiB free; expand its actual partition/filesystem before building'; exit 1; }
