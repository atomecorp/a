# atome/eVe OS usage

The canonical FreeBSD image builder lives at `platforms/atomeOS/builder/`.
It is packaging infrastructure, not a new atome application runtime. Its public
entry point is `scripts/aOS.sh` from the framework root.

```sh
./scripts/aOS.sh list
./scripts/aOS.sh plan --target all --modules display,audio,midi
./scripts/aOS.sh preflight --target all
```

PC amd64, PINE64 A64+ 2 GB and Mac Intel/Apple Silicon VM recipes coexist.
Display, audio and MIDI are composable selections. A configuration declaration
is not proof of boot, graphical operation or native headless audio/MIDI support.
Builds require an explicitly selected source commit and a native FreeBSD backend
of matching architecture/version. The Mac can dispatch to existing backends,
retrieve/verify artifacts and safely flash explicitly selected external media.
No runtime, physical boot or peripheral qualification has yet been performed for
this builder revision. No publication, internal installer or rollback is implied.

Current commands, safeguards and limitations are maintained in the
[builder README](../../platforms/atomeOS/builder/README.md); the existing task
record is [atome OS Audit](../../todo/atome%20OS%20Audit.md).
