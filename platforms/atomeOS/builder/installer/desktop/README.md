# Desktop boot and VM disks

External PC boot media use the same `scripts/aOS.sh flash` implementation as SBC
media; see [the builder README](../../README.md). No second desktop installer or
Tauri application is required for this command-line path.

VM Mac targets produce raw/qcow2/vmdk disks of the guest architecture. Import into
an appropriate UEFI guest after decompression and verify the manifest. Formats do
not certify an hypervisor, WebGPU, guest audio or USB/MIDI passthrough.

Internal-disk installation remains separate and unimplemented. Booting USB does
not authorize or validate erasing/installing an internal disk. No one-click GUI,
Windows installer or atomic disk write is claimed.
