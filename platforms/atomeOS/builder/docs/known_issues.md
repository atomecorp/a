# Qualification matrix and limits — 2026-10-29

All current target entries are recipes inspected/tested on macOS, not boot claims.

| Target | RAM / model | Boot recipe | VM proof | Physical proof | Display / GPU | Audio / MIDI |
| --- | --- | --- | --- | --- | --- | --- |
| PC amd64 UEFI | actual model/GPU/RAM not supplied | official UFS VM base, external disk | none | none | WebGPU and input unverified | interfaces/latency/reconnect unverified |
| PINE64 A64+ | A64-DB-V1.1 2 GB, Allwinner A64 | official PINE64 microSD, SPL/U-Boot | none | none | HDMI/framebuffer/DRM/Mali unverified | USB/OSS/MIDI unverified |
| Mac VM Intel | host/guest resources unrecorded | amd64 UEFI, raw/qcow2/vmdk | none | not applicable to guest boot proof | virtual GPU/WebGPU unverified | guest audio/USB passthrough unverified |
| Mac VM Apple Silicon | control host arm64 macOS 27.0.1; guest resources unrecorded | aarch64 UEFI, raw/qcow2/vmdk | none | not bare-metal Mac support | virtual GPU/WebGPU unverified | guest audio/USB passthrough unverified |
| Generic ARM64 UEFI | actual machine unknown | aarch64 UFS image | none | none | unverified per model | unverified per model |

For each actual run append date, exact model/revision/firmware, RAM, medium,
FreeBSD/kernel/package/source identities, commands and trace paths. Qualify
network, USB, storage, input, stability and recovery independently. No adapters
or peripherals have yet been identified/tested. Do not extrapolate a PC result
to ARM or a VM result to physical hardware.

## Observed limits

- Native FreeBSD backend unavailable in this session. macOS cannot execute the
  native image mount/pkg pipeline. No hypervisor/QEMU was found in PATH or the
  common UTM/Fusion/Parallels app locations inspected. No dependencies installed.
- About 22 GiB free on the control host at audit time, below default assembly's
  conservative working-space requirement. No storage was erased/freed for builds.
- macOS external physical-media discovery succeeded with no devices attached.
  Flash identity/readback tests are simulations, not physical-media acceptance.
- No second local OS image generator was found in the scoped repository searches.
  `install_server.sh`/setup FreeBSD cases deploy services/dependencies, not boot disks;
  they are preserved. App-thread listing is limited to 50 recent entries, so it
  does not prove that no older/archived task exists.
- eVe requires `navigator.gpu` and its real Bevy/WASM renderer. Cage/Cog was only
  declared in the previous builder. Cog package resolution and WebGPU must be
  established; the upstream ports `www/cog/Makefile` query returned 404. No browser
  substitution, Tauri FreeBSD bundle or GPU acceleration is asserted.
- Fastify serves browser audio; it does not make a headless audio/MIDI appliance.
  Existing MIDI ports are Web MIDI or native Tauri contracts. Autonomous audio/MIDI
  builds are explicitly blocked pending a real canonical native execution path.
- Kernel USB drivers and JACK installation do not prove browser MIDI or real-time
  performance. No latency, xrun, capture, drawing or video benchmark has been run.
- Only explicit development builds are traceable. Package versions are recorded,
  but pkg repositories are not frozen; rebuild identity and bit reproducibility
  are not established. All artifacts are unsigned.
- No secure remote pairing/discovery UI, internal installer, CI, publisher,
  boot-verified update, rollback, A/B, automatic log-rotation validation or
  production-maintenance chain is delivered by this builder change.

## Acceptance procedure

1. Build and verify under native FreeBSD of matching architecture/version.
2. VM: serial console, UEFI, disk/network, service startup and shutdown; record
   host/hypervisor/version/resources. Test matching architecture and do not label
   emulation as hardware acceleration.
3. Physical PC and PINE64: record boot trace and exact media; PINE64 tests include
   microSD/ROM/SPL/U-Boot, serial or Ethernet access, USB and HDMI. Never presume
   standalone USB boot, Wi-Fi dongle support or Mali acceleration.
4. Display: follow the canonical UI debug procedure, real WebGPU pixels and input;
   test reload/persistence and inspect browser/server logs. No desktop replacement.
5. Audio/MIDI: actual devices, capture/output, sample rate/buffer, notes/control,
   hotplug, load/stability and measured round-trip latency if possible. Remote
   client peripherals and local appliance peripherals are separate evidence rows.
6. Measure boot/first use, disk usage/raw/compressed size, RAM, CPU and interaction
   response before optimizing. Publish observations without invented thresholds.
