# Image-builder ownership

The existing builder owns all OS image assembly. The new public
`scripts/aOS.sh` delegates to its CLI; no second FreeBSD generator is introduced.
The pre-existing audit `todo/atome OS Audit.md` remains the task record.

- `core/config.yml`, `profiles/`, `packages/`: one target/module/profile recipe.
  Targets determine architecture, official boot image and formats; modules compose.
- `core/recipe.mjs`: strict YAML through the existing root `yaml` dependency,
  source/submodule identity, builder-input hash, recipe and preflight.
- `core/build.sh`, `core/lib/common.sh`, `scripts/`: native FreeBSD pipeline.
  Only the orchestrator owns mounts/detachment, in reverse order. Failure retains
  evidence and never force-unmounts unrelated resources.
- `core/source.mjs`: explicit committed payload allowlist; no working data, secrets,
  host dependencies, research symlinks or second application runtime.
- `core/artifacts.mjs`: official checksum parsing, payload/archive integrity,
  conversion verification, provenance and machine-readable manifest.
- `core/remote.mjs`: optional SSH dispatch to already-provisioned FreeBSD backends,
  recipe comparison and bounded artifact retrieval. Not a host installer.
- `core/download.mjs`: explicit public-HTTPS manifest/artifact retrieval, bounded
  size, redirect safety and archive/payload verification. `prepare` composes this
  or a build/local manifest with the existing shared flash owner, including
  interactive support selection. No release URL or published image is assumed.
- `installer/sbc/flash.mjs`: shared macOS USB/SD discovery, confirmation, write,
  exact-length readback and ejection. Desktop boot media use this same owner.
- `overlays/services/` and `overlays/ui/`: rc.d, unique first-boot identities,
  independently supervised real Fastify service and existing Cage/Cog candidate.
- `scripts/configure_installer.sh`, `installer/desktop/install.mjs`: optional UEFI
  installer-media packaging and one native installer entry point. Reuse
  FreeBSD `bsdinstall` for destructive disk operations, preserving the same real
  built application payload. The shared recipe records live/installer mode;
  unsupported mode/target combinations fail explicitly. Native execution is not
  validated by host tests.

Fastify still serves atome/eVe through its canonical APIs. Bevy/WebGPU, Kira WASM,
MIDI owners, persistence and commands remain in their existing framework owners.
A native autonomous FreeBSD audio/MIDI runtime has not been found/validated.
WebSDL was not found after repository searches; it is not invented or packaged.

Removed after caller inspection: heuristic YAML reader, moving-version resolver,
unsafe pkg/Git updater, silent-boot overlay and unmeasured JACK tuning/autostart.
Makefile shortcuts now call the same public CLI. Historical upstream builder is
reference material, not another local executable lane. See the README for current
commands and the qualification matrix for precise evidence limits.
