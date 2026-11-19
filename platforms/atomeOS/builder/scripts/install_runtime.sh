#!/bin/sh
# Export a committed allowlisted payload and its pinned eVe; never copy private/.
set -eu
. "$(dirname -- "$0")/../core/lib/common.sh"
aos_job sources
INSTALL_DIR="${WORK_MNT}/opt/atome"
mkdir -p "$INSTALL_DIR" "${INSTALL_DIR}/eVe" "${WORK_MNT}/var/db/atome"
tar -xf "${WORK_DIR}/framework.tar" -C "$INSTALL_DIR"
tar -xf "${WORK_DIR}/eve.tar" -C "${INSTALL_DIR}/eVe"
chroot "$WORK_MNT" pw useradd atome -m -d /home/atome -s /bin/sh -w no
chroot "$WORK_MNT" pw usermod root -w no
# Official SD images may ship the known freebsd account; lock it before networking.
if chroot "$WORK_MNT" pw usershow freebsd >/dev/null 2>&1; then
    chroot "$WORK_MNT" pw usermod freebsd -w no
fi
chroot "$WORK_MNT" chown -R atome:atome /opt/atome /var/db/atome
# No install_full/run.sh: those provision other platforms. The client's vendored modules, then the one server
# (atome-server and its per-person atome-vault), built here from the pinned workspace.
chroot "$WORK_MNT" su - atome -c 'cd /opt/atome && npm ci --omit=dev --foreground-scripts --no-audit --no-fund'
chroot "$WORK_MNT" su - atome -c 'cd /opt/atome && cargo build --release --locked -p atome-server -p atome-vault'
chroot "$WORK_MNT" su - atome -c 'test -x /opt/atome/target/release/atome-server && test -x /opt/atome/target/release/atome-vault'
# Source is immutable to the service. Writable user data stays at native server paths
# redirected to the dedicated data directory, not in the executable payload.
for data in database_storage data uploads; do
    mkdir -p "${WORK_MNT}/var/db/atome/${data}"
    ln -s "/var/db/atome/${data}" "${INSTALL_DIR}/${data}"
done
chroot "$WORK_MNT" chown -R atome:atome /var/db/atome
chroot "$WORK_MNT" chown -R root:wheel /opt/atome
