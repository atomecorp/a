# External boot media

The shared implementation is `flash.mjs`, invoked by the framework's
`scripts/aOS.sh devices|verify|flash`. PC USB and SBC microSD use this same owner.
See the [builder README](../../README.md) for exact safeguards and commands.

PINE64 A64+ uses the official PINE64 image and its microSD ROM/SPL/U-Boot chain.
No generic ARM image, USB-only boot, LTS image or ROCK64 image is substituted.
Raw writes can fail partially and are not atomic. Readback compares exactly the
manifest's decompressed byte count; archive hashes are checked separately.
Physical media/boot acceptance remains unperformed.
