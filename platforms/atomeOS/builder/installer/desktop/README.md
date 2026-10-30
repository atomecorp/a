# Desktop boot and VM disks

External PC boot media use the same `scripts/aOS.sh flash` implementation as SBC
media; see [the builder README](../../README.md). No second desktop installer or
Tauri application is required for this command-line path.

VM Mac targets produce raw/qcow2/vmdk disks of the guest architecture. Import into
an appropriate UEFI guest after decompression and verify the manifest. Formats do
not certify an hypervisor, WebGPU, guest audio or USB/MIDI passthrough.

`--mode live` runs the system from the external support. `--mode installer` on PC
or generic UEFI targets additionally packages the built root filesystem for the
native FreeBSD `bsdinstall` tool. `live,installer` builds both artifacts. Booting
installer media opens the local `aOS-install` command; the host developer CLI
exposes the same owner with `aOS.sh install` on a booted native installer.

The install command verifies the bundled distribution, checks architecture/UEFI,
resolves GEOM labels/partitions to backing disks, and refuses the boot support,
mounted/swap/open-pool or ambiguous disks. It asks for backup readiness and an
identity-specific whole-disk erasure confirmation, rechecks identity and delegates
partitioning/extraction/EFI configuration to `bsdinstall`. No automatic disk
choice, backup, in-place update, retry on another disk or reboot is performed.
Failure may leave the destination unusable and requires explicit recovery.

Only parsing, selection, refusal and composition have executable host tests;
native payload extraction, EFI boot and physical installation are **unvalidated**.
PINE64 A64+ uses live microSD boot; this does not establish a USB-only boot path.
No one-click GUI, Windows installer or atomic disk write is claimed.
