# atome/eVe OS builder

The existing FreeBSD image builder is the single image-construction owner.
`../../../scripts/aOS.sh` is its public entry point. This is development
infrastructure: no image from this revision has been built or booted on FreeBSD.
A recipe, a converted disk and a booted interactive eVe session are different results.

## Cumulative targets and modules

| Target | Guest/system architecture | Default output | Boot |
| --- | --- | --- | --- |
| `pc-amd64-uefi` | amd64 | `.img.xz` | external USB, UEFI candidate |
| `pine64-a64` | arm64/aarch64 | `.img.xz` | PINE64 A64+ 2 GB microSD ROM/SPL/U-Boot |
| `mac-vm-intel` | amd64 | `.qcow2.xz` | FreeBSD guest, UEFI |
| `mac-vm-apple-silicon` | arm64/aarch64 | `.qcow2.xz` | FreeBSD guest, UEFI |
| `arm64-uefi` | arm64/aarch64 | `.img.xz` | candidate standard-firmware machines |

`--mode live` boots the system directly from its external support. It is a persistent
UFS system, not a RAM-only session. `--mode installer` creates separate installation
media for PC/generic UEFI targets; it packages the already-built system as a local
distribution for the existing FreeBSD `bsdinstall`. Its boot console asks for a
destination disk, backup acknowledgement and an exact erasure confirmation.
The boot support, active/mounted/swap/open-pool disks and ambiguous disks are refused.
No automatic reboot, in-place upgrade or automatic backup is performed.
`--mode live,installer` builds both on a suitable target; `--target all --mode all`
builds only the modes declared for each target. PINE64 and Mac VM targets currently
accept live images only. Installer images default to 34 GiB and need more build,
download/staging and media capacity. Installation code is source/unit-tested only;
it has not been executed on FreeBSD or a physical disk.

Each target has a separate disk. No image is claimed to boot all architectures.
Mac VM targets additionally accept `raw,qcow2,vmdk`; PC/generic ARM accept `img,qcow2`.
A disk format does not certify an hypervisor or GPU. Import the decompressed disk
into a matching-architecture UEFI guest; qualify QEMU/UTM first where available.
Parallels/Fusion/VirtualBox compatibility is not implied by the format.

`desktop`, `audio` and `dev` select `display,audio,midi`. `minimal` selects no
optional module and still runs the real Fastify server. An explicit `--modules`
list replaces the preset; repeated module/target options accumulate. Audio and
MIDI are independent of display in the configuration. Autonomous audio/MIDI is
currently blocked because the existing Fastify server does not own device audio
or MIDI; the browser normally owns them. A remote client's audio device is not
the appliance's audio device. No fake native engine is installed.

From the framework root (all commands below are examples, not evidence of a build):

```sh
./scripts/aOS.sh list
./scripts/aOS.sh plan --target all --modules display,audio --modules midi
./scripts/aOS.sh plan --target mac-vm-intel,mac-vm-apple-silicon --format raw,qcow2,vmdk
./scripts/aOS.sh preflight --target all --modules display,audio,midi
./scripts/aOS.sh plan --target pine64-a64 --modules audio,midi
```

## Construct on a native FreeBSD backend

Use a dedicated FreeBSD backend of the target architecture and the selected
release. A build resolves the current official production release automatically;
`--freebsd-version` pins an explicit version. `plan` and `preflight` without a
version display the configured baseline, not a fresh online lookup. Each build
records its resolved version. macOS is a control/flash host, not a FreeBSD
chroot or a supported bare-metal Mac target. Linux qemu-user is not accepted as
evidence of FreeBSD binary execution. Preflight never installs tools or changes
the host's services/configuration. It checks native tooling and build capacity;
13 GiB is a disk capacity, not an optimization promise. Default assembly needs
at least 42 GiB free for image copies and compression, plus one image capacity
per additional requested format. A separate output filesystem is checked separately.

```sh
# On the provisioned FreeBSD amd64 backend, with Node and this project's YAML dependency:
sudo ./scripts/aOS.sh build --target pc-amd64-uefi,mac-vm-intel --modules display,audio,midi --source-commit HEAD
# On a provisioned FreeBSD arm64 backend:
sudo ./scripts/aOS.sh build --target pine64-a64,mac-vm-apple-silicon --modules display,audio,midi --source-commit HEAD
```

`--source-commit` is mandatory for builds. It explicitly selects committed
sources and the parent-pinned eVe commit; uncommitted/untracked local work is
neither copied nor discarded. Archives are made from an allowlist. No `private/`,
Git metadata, host node_modules or user databases are copied. Work records and
failed outputs stay under `temp/aos/work` with `.retain`; inspect them before
explicitly removing them. Completed artifact sets are under `temp/aos/output`.

The existing `core/build.sh` invokes the existing stage scripts: preflight,
verified official image, UFS mount/resize, signed upstream pkg installation,
source payload/npm ci, boot/services, display/audio/network, unmount, artifacts.
The official GENERIC kernel, drivers, firmware, DTBs and board boot bytes are
preserved. Production driver pruning is not performed. All indispensable
installation failures stop the build. Current experimental images retain native
npm build tools, explicitly recorded in the manifest; they are not production images.

The existing Cage/Cog session is still a **candidate**. The package repository
must actually resolve it. Reading `www/cog/Makefile` in the current upstream
ports tree returned 404 during this audit; installed package availability and
WebGPU are unverified. There is no Epiphany/DOM/Canvas fallback or automatic
change of engine. eVe needs its real Bevy/WebGPU path; a browser window or
successful server healthcheck alone does not validate graphical operation.

## Control from macOS

Existing SSH backends must already contain this same builder, Node/YAML and the
chosen source/submodule commits. No checkout, credential change, host bootstrap
or dependency installation is performed by the control command. The account must
already have the privileges necessary for image assembly; no implicit remote sudo.
Backend names below are placeholders, not discovered hosts:

```sh
./scripts/aOS.sh build --target all --modules display,audio,midi --source-commit HEAD \
  --backend amd64=build-amd64 --backend arm64=build-arm64 --remote-root /path/to/a
```

Before dispatch, compare the source/target/modules/packages and hash of the actual
builder inputs. Retrieve only that job's artifact directory and verify it locally.
Failure of one target is recorded while independent targets continue; aggregate
failure is nonzero. No backend or hypervisor has been provisioned or tested here.
`--offline` fails explicitly until all pkg/npm dependencies and metadata have a
verified, complete offline closure.

## Automated preparation from macOS

The single `prepare` command accepts exactly one source: a local completed
`--manifest`, a public HTTPS `--manifest-url`, or an explicit `--source-commit`
to build using the selected FreeBSD/SSH backend. It verifies the selected image,
then opens the external-support list (no default choice), requests administrative
privileges through the normal terminal if needed, confirms the identity, writes,
synchronizes, reads back and ejects. It uses the existing shared flash owner.

`download` downloads an explicit release manifest and a single selected artifact,
checks declared lengths and hashes, refuses credential-bearing/non-HTTPS URLs and
HTTP downgrade redirects, and verifies the decompressed payload. There is no
automatic discovery of a latest release: **no atome/eVe OS image has been published**
and no functional public release URL is assumed. Tests use fixture responses,
not a claim that an external release/download endpoint exists.

```sh
# Already built local image; prompts to select an external support:
./scripts/aOS.sh prepare --manifest /path/to/result/manifest.json
# Build on a provisioned backend, then choose and flash on the Mac:
./scripts/aOS.sh prepare --target pine64-a64 --mode live --modules display,audio,midi \
  --source-commit HEAD --backend arm64=build-arm64 --remote-root /path/to/a
# Construct PC live and installation media on a matching FreeBSD backend:
sudo ./scripts/aOS.sh build --target pc-amd64-uefi --mode live,installer --source-commit HEAD
```

A separate FAT/exFAT pre-format is unnecessary: writing the complete verified
image installs its partition table and filesystems. No support is automatically
chosen or erased. For the PINE64 A64+ 2 GB, use a microSD in a USB reader on the
Mac, then insert the card in the board. The manufacturer's [board layout and
storage specifications](https://pine64.org/documentation/Pine_A64/_full/) show the
bootable microSD slot (12); [the official getting-started guide](https://pine64.org/documentation/Introduction/Getting_started/)
requires a microSD reader and distinguishes A64+ from eMMC-capable LTS models.
A plain USB-only boot chain is not established for this board.

## Verify and flash from macOS

```sh
./scripts/aOS.sh verify --manifest /path/to/result/manifest.json
./scripts/aOS.sh devices
sudo ./scripts/aOS.sh flash --manifest /path/to/result/manifest.json \
  --image /path/to/result/image.img.xz --device disk7
```

Replace paths/device with an actual verified result and explicitly selected USB/SD.
There is no automatic disk selection and no `--yes`. Omit `--device` to select from the external-support list without a preselected entry. Discovery shows media and
volumes. Flash refuses internal/system/virtual/ambiguous disks; it requires an
I/O Registry identity and sufficient capacity, stages the payload, asks for the
exact device/capacity/connection identity, then rechecks before/after unmount and
before writing. It synchronizes and reads exactly the declared payload byte count
from offset zero, compares SHA256, and ejects only after success. Remaining bytes
beyond the image are not compared. Disconnect/reconnect changes the registry identity.
Interruption can leave an unusable support; reflash is required. Write/readback and
physical media replacement remain untested on actual media. Internal installation is separate: an installer-mode image boots the native
installation command described above; disk execution and recovery remain unvalidated. Never flash qcow2/vmdk as raw media.

Manifests distinguish archive hash/size from decompressed payload hash/size,
record provenance, packages and **unverified** VM/physical status. Verification
establishes integrity against that manifest, not authenticity: these artifacts are
unsigned. Upstream checksums are obtained by official HTTPS; upstream signatures
are not yet verified. Never publish a stable release from this development path.

## Security, diagnostics and status

No user/provider secrets or pre-generated device identities are included. Images
lock the root/default FreeBSD/service passwords, disable SSH, bind Fastify to
loopback and block unsolicited inbound network access. First boot creates unique
runtime secrets/server identity and SSH host keys. The server and optional UI
run as the unprivileged `atome` user with at most three restart attempts. Native
server storage paths are linked to `/var/db/atome`; no second application database
or writable view state is introduced. Those paths and permissions require runtime
validation. The official boot console is retained. Local physical recovery uses
the FreeBSD loader/single-user console; qualify it before exposing an appliance.

Service diagnostics: `service atome_server status`, `service atome status`,
`/var/log/atome/server.log`, `/var/log/atome/ui.log`. Steady-state log rotation,
remote authenticated pairing/discovery and unattended headless recovery are not
yet qualified. No automatic updater is installed. Rebuild, verify and reflash is
the initial manual system-update path; preserve user data separately before it.

- Existing task/evidence: [atome OS Audit](../../../todo/atome%20OS%20Audit.md).
- Architecture: [docs/architecture.md](docs/architecture.md).
- Target qualification and blockers: [docs/known_issues.md](docs/known_issues.md).
- System choice: [docs/os_decision.md](docs/os_decision.md).
- Regression command: `node --test tests/governance/aos_builder.test.mjs tests/governance/aos_installation.test.mjs` from root.
