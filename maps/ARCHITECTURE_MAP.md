# Atome / eVe Architecture Map

iOS WebContent capacity repair (2026-09-04): state-current remains the single
read boundary, but it now enforces requested atome type and particle exclusions
before serialization, pages broad consumers, and coalesces identical concurrent
reads. Dynamic activity-selection tools remain derived UI projections and are
quarantined from durable tool-catalogue hydration in both native and shared
client paths. Historical rows are preserved; no second store, migration, state
owner, sync route, renderer, or DOM authority was introduced.

iOS cold-boot latency repair (2026-09-03): native boot telemetry starts before
the shared file manager is constructed, while directory preparation and the
single canonical `FileSyncCoordinator` reconciliation run off the launch path
on one idempotent serial queue. `WKWebView` navigation starts immediately when
its visible controller is ready; the old fixed delay and duplicated legacy
file-copy passes are removed. One progress-aware watchdog allows 20 seconds for
cold WebKit process creation, then detects only eight seconds without a native
or JavaScript milestone instead of failing a progressing launch at a fixed
elapsed time. Retry stops the prior navigation before starting exactly one new
attempt. Runtime packaging shares the canonical workspace-main-menu owner with
deferred Home/panel chunks and bundles the project-preview capture frame at its
requested `atome://` URL. This adds no state, sync, menu, renderer, or DOM owner.

iOS boot architecture (2026-09-02): Xcode no longer copies the source trees as
resources. Both app and AUv3 invoke the same deterministic esbuild manifest and
receive one `atome_runtime` root each; compatibility URLs still resolve through
`atome://` without adding another runtime. The critical entry is bundled and
split, while voice/ONNX, AI, bank, calendar, contacts, mail, Communication, and
panel domains stay behind their existing dynamic owners and start only after
presentation or first use. Canonical project bootstrap reads the existing
startup preference/current project and presents local `staleFirst` state before
background synchronization. Native Swift owns only launch presentation,
resource transport, measurements, and recovery; Atome state and WebGPU remain
the sole model and renderer authorities.
Normal Xcode Debug launches keep Panel Lab, Web Inspector, and verbose text
tracing disabled unless their explicit launch opt-in is set. The custom-scheme
root resolves to the packaged product entry and normal MIDI startup schedules
no smoke-test callback. The linked iOS Rust probe uses its optimized archive in
both Debug and Release; `ATOME_IOS_RUST_DEV=1` is the explicit native-debug
exception.

Physical iOS renderer readiness (2026-09-03): browser Bevy startup completes
only after the WASM `run()` call and two presented animation frames. A captured
renderer panic is terminal even when WebAssembly also reports `unreachable`,
and a failed project projection cannot publish `projection.bevy_ready` or
release the native launch surface. The experimental virtual-function-
elimination build is removed; packaging accepts the stable release renderer.
Two consecutive signed Debug launches on an 11-inch iPad Pro (M5) visibly
presented the saved project and final Main Toolbar in about 1.25 seconds native
elapsed. The 20+20 P95 campaign, physical touch journey, and the 100-request
budget remain separate acceptance gates.
The app and AUv3 build phases share one configuration-scoped Cargo target
directory, avoiding a second compilation of the identical native Bevy graph
while retaining one linked library per target.

Project drag performance (2026-08-29): the shared scene gesture owner keeps only
the latest visual update per gesture/Atome until the next display frame, then
patches the existing Bevy transform and spatial index once. Persistence remains
the canonical coalesced `gesture_frame` lane and release synchronously applies
the final visual position before the durable `set` batch. A locally committed
frame marked by realtime self-patch dedup is not projected back into the same
project scene; remote clients still consume the broadcast normally. This adds
no renderer, mutation route, DOM authority or parallel gesture state.

Contextual tools/text repair (2026-08-28): bootstrap remains the sole execution
owner for MIDI Binding and Line Splitter; generic menu registration no longer
replaces declarative commands. Line splitting reuses canonical Molecule batch
publication, including its project refresh. Record Action owns one canonical
state in `record_action_state.js`; both menu projections read it and tint the
existing icon. Visual interaction is synchronously available before selection
and rail awaits. Text creation and scene editing reuse the same hidden textarea;
editor ownership transfers without DOM removal, redundant value assignment or
selection reset. Old asynchronous commits cannot finalize a newer edit session.
Native composition state is transient input-service state, not Atome authority.

Molecule/APNG image ownership (2026-08-29): structural Molecules use member-derived bounds and a transparent body fill, not zero subtree opacity. The scene hit-test excludes the envelope except selected resize handles; existing parent ascent and commitBatch movement remain authoritative. APNG source bytes travel through the existing image resource contract to the shared Bevy image. Logical node size remains independent from its raster resource size; the browser resolver reduces only oversized APNG raster dimensions according to frame count so cached decoded frames cannot exceed 32 MiB. The main-thread PngAnimations resource advances the same precomposed Image handle at frame deadlines and releases decoding state on completion, source replacement or despawn. No DOM player, public playback command or parallel renderer is introduced.
Fitted preview records in bevy_ui_overlay_record_projection.js inherit their UI slot's layer and clip, not the source Atome's depth; this keeps image previews above the Visual panel background.

Urgent campaign architecture (2026-08-28): canonical Atome state remains outside
the DOM and every new mutation uses the existing commit batch or Tool Gateway.
Visualizer fullscreen is disposable projection state over the one scene/canvas;
composite editing resolves child identity before emitting the existing scene
intent, and a long press exits without changing WebView/window fullscreen.
Structural Molecules retain union geometry and selection with a fully transparent
body fill (the later Molecule correction supersedes zero opacity). A Natural drag expands the structural owner to every descendant and
serializes/coalesces frame commits before one final atomic set batch. Line
Splitter creates one sequential Molecule beside the source
and recursive simultaneous/sequential transport remains the only Prompter clock.
MIDI bindings are nonvisual child Atomes. Learn and Manual normalize to one
contract; capture listens only after successful final Gateway invocation; Finder
supplies Search data; continuous CC execution suppresses recorder micro-samples.
Web MIDI, desktop `midir` and iOS/CoreMIDI only adapt bytes and ports to the same
resolver, monitor and send boundary. AUv3 host output remains to verify.

Boot ownership repair (2026-08-27): concurrent tool registrations share the
canonical registry's pending refresh instead of launching repeated catalogue
queries that block SQLite and static module delivery. There is no TTL cache or
alternate catalogue. The same Bevy surface owns CSS/backing reconciliation from
before Winit invocation; its initial opacity is disposable presentation state.
Workspace readiness controls the one reveal, not a fixed boot delay. The WASM
loader is warmed early without starting an extra event loop or creating a canvas.

Tauri panel startup (2026-09-02): Home, Communication, and the other panels use
the same `panel_definitions.js` -> `panel_surface_runtime.js` -> Bevy panel
runtime in Web, Tauri, and iOS. Built-in execution resolves from the canonical
bootstrap definitions and registered handlers before persistent registry
reconciliation, so restoring a native identity and synchronizing it to Fastify
cannot gate the first panel. Shared animation-frame waits have one bounded
watchdog, and the reactive WASM renderer's 500 ms idle heartbeat bounds a lost
first WKWebView wake without introducing a continuous loop. The desktop binary is a thin `squirrel_lib::run()`
entrypoint; `lib.rs` is the single Tauri bootstrap owner. Native Vosk model
loading is demand-driven by the first listening action. Neither the vendored
plugin nor `createVoiceService` may preload it during page/application boot,
because the CPU/disk-heavy native load competes with the already-visible WebView.

Tauri static revalidation (2026-09-02): the local Axum server keeps bundled
runtime modules eligible for the browser cache with `public, max-age=0`, so
WKWebView revalidates unchanged Home, Communication, eVe, Atome, source, vendor,
HTML, JavaScript and CSS resources through the existing `Last-Modified`/304
path after refresh or restart. `static_asset_cache.rs` is the only policy owner;
`server/mod.rs` only composes it. API, file, text and WebSocket paths are excluded
so private/dynamic responses cannot inherit public caching. This changes no panel
owner, module loader, service worker, product state, renderer or DOM projection.

Prepared UI publication (2026-08-27): geometry/hydration use the existing tree
owner, image cache and render queue. State publication follows successful
projection; no alternate DOM, renderer, persistence, timer or domain cache is
introduced. Scene replacement carries only presented workspace chrome from
the shared surface owner, never outgoing project media or its structured view.
The project-data lifecycle is factored into `project_workspace_activation_runtime.js`;
data mutations remain on the existing commit APIs. Full-screen handoff and native
latency acceptance remain separate from passing owner-level tests.

Transport/render separation (2026-08-27): recursive position ticks use the
existing bounded progress projection; they must not force the rail's
clear/re-enter lifecycle, which emits layout changes and rebuilds the view.
The shared decoder publishes new frames through its existing frame callbacks,
not every transport tick. This removes repeated work on the shared Web/iOS/
Tauri JS route without adding state, caches, clocks, renderers or DOM owners.
Native frame-pacing acceptance remains separate from the executable contract.

Temporal sample isolation (2026-08-27): a projected playback-source association
means a live mirror, not merely shared asset identity. Fixed List filmstrip
samples retain their asset and source window but opt out of that association
at the shared preview boundary. The existing mirror index therefore excludes
them from Play/Pause/seek and source playback-event routing. This removes
unnecessary video starts/seeks without an ID-pattern filter, additional clock,
decoder, transport path, DOM surface or persistent state.

Video seek presentation (2026-08-27): hidden media decoding owns at most one
retained decoded `VideoFrame` per seeking source. That disposable resource
bridges temporary loss of the HTML video backing frame through the existing
Bevy/wgpu external-texture import and sorted draw, without another renderer,
CPU readback, poster, canvas, clock, or canonical state. New decoded data,
source replacement and disposal release the frame. Camera source ownership
and its first-frame readiness guard are unchanged.

Status: Initial architecture map after the Atome open / eVe closed boundary validation.

Current layered Molecule playback contract (2026-08-25): a schema-v2 Molecule
has one durable owner, direct members identified only by canonical `parent_id`,
and one timeline clip at `t=0` per member. Repeated overlap absorption reuses the
owner and one `commitBatch`; no floating member or secondary timeline authority
is permitted. Ensemble playback starts all prepared media atomically and uses
the longest member as transport duration. Kira is the only audio authority:
independent audio plus audio extracted from video each receive one voice, while
the WebGPU video decoder is muted. A failed voice start tears down every voice,
decoder, timer, clip state, `playingIds`, and published transport state; manual
Stop and natural completion use the same complete release contract. Selection
and visual-depth changes neither stop nor restart transport.

Current native Molecule source contract (2026-08-26): protected media keeps two
distinct playback identities at the shared record boundary. `url` is the
canonical Web/API source used for browser loading and video-audio extraction;
`path` is the canonical local `data/users/<owner>/recordings|Downloads/...`
source required by strict native Kira. `runtime_transport.js` publishes the
local path only in a strict native runtime, and `molecule_support.js` preserves
it while deriving the extracted-audio URL. Standalone and Molecule playback
consume the same resolver and the same Kira executor. Neither platform owns a
parallel timeline, voice registry, media classifier, or fallback player.

Historical media records use a conservative audio contract: absent video-audio
metadata means unknown, not silent. Only explicit `has_audio: false` or zero
audio tracks authorizes visual-only playback. Web Kira returns its decoded clip
duration through the shared audio executor so a durationless List item has a
finite natural boundary and cannot trap the sequential queue.
Container duration never overrides the decoded audio-frame boundary inside Web
Kira. A requested playback window longer than the remaining decoded audio uses
the audio's natural end instead of an out-of-range slice; only a strictly
shorter explicit crop slices the sound. This keeps the audio engine alive
across sequential Molécule-to-video transitions without stretching media or
changing the longest-member transport rule.

Visual stacking is independent from Track/time order. Absorbed members append
above the current canonical `z_index`/`order`; Plan front/back actions mutate
that canonical scene depth through the existing intent path and survive reload.
The visible hierarchy is deliberately `Molecule -> direct Atomes`: List and
Matrix never expose Section, Track or clip implementation records. Reordering a
direct member in List atomically persists both `hierarchy_order` and its visual
depth aliases; Matrix and Natural are disposable projections of that same
order. Dropping a direct member on footer Retour removes its internal clip and
`parent_id` in one canonical extraction batch without duplicating the Atome or
changing the remaining transport.
Natural presentation completes a forced canonical reconcile before announcing
the mode, and stale events from retired video decoders cannot affect the active
projection. When the active project changes, the shared project-view window
state is reset with an invalidated revision before any List, Matrix, Mix,
Timeline, or detail read can publish; Import also refuses an insertion level
belonging to the previous project. These rules preserve one disposable WebGPU
projection and prevent cross-project or stale-read resurrection.

Current structured playback and reorder contract (2026-08-22): contextual
List/Matrix item playback separates the persistent `armed` mode from the live
transport (`playing`/`playingIds`). Natural completion and refused starts clear
only the transport; manual Stop, project exit, or leaving List/Matrix clears the
arm. Selection follow consumes the arm and never changes container playback
queues. Structured drag has one shared `insert | overlap | none` intent:
List quarters and Matrix center geometry decide the intent, insertion owns an
exact slot, and overlap alone may arm after the shared 500 ms delay. Order is written by one
canonical `Atome.commitBatch`; a shared project/container transaction projection
protects the accepted order from stale reads until canonical confirmation.
Molecule membership remains solely owned by `absorbCanonicalMolecule`. Its
public mutation facade delegates shared state/commit plumbing to
`tool_runtime_atome_mutation_shared.js` and duplication/remapping to
`tool_runtime_atome_duplicate.js`; neither extracted module is a second
membership authority.

Current Molecule member-mutation contract (2026-08-26):
`tool_runtime_atome_mutation.js` is a stable public facade;
`tool_runtime_molecule_mutation.js` owns absorb, extract, member Delete and
survivor reindexing, `tool_runtime_molecule_timeline.js` owns derived clip
normalization, and `tool_runtime_molecule_structure.js` owns backfill, ungroup,
whole-owner Delete and transforms. Every reorder set carries the member's
canonical `parent_id` envelope together with `hierarchy_order` and visual depth,
so an order-only batch cannot detach a member. `deleteCanonicalMoleculeMember`
removes one member and its clip atomically, then deletes the owner in the same
logical batch when no live member remains.

Current project-view stabilization contract (2026-08-24):
`project_view_mode_state.js` is the sole per-project List/Matrix/Natural
preference and surface-transition owner. Workspace activation reads that
canonical preference before changing the current project, applies it through
`setProjectViewMode` immediately after `AdoleAPI.projects.setCurrent`, and marks
the following scene load as already prepared so no second restoration races the
first paint. `project_data.js` owns one global latest-wins activation generation;
a superseded activation cannot reclaim the shared surface, current project, or
WebGPU foreground, and repairs the latest foreground if its already-running
loader touched the shared canvas. Natural restoration uses the same surface
owner and therefore unmounts an older structured tree instead of only changing
an in-memory value. Canonical project records remain the durable preference;
the DOM and Bevy tree remain disposable projections.

Canonical Molecule Delete remains one `deleteCanonicalMolecule` transaction for
the owner and direct `parent_id` members. After a successful commit, that owner
closes the existing group-timeline API so transport and timeline projections are
disposed. Structured project records reject canonical deletion tombstones, and
the contextual rail only lazy-loads the existing `ui.delete.selection` action;
none of these steps introduces another delete or membership authority.

Current structured-text contract (2026-08-26): activating Create Text does not
import or toggle an inactive lazy sibling such as Code. The single hidden text
service owns Return while its canonical session is active, so Return inserts
`\n` into the same Atome and never reaches background creation. Interactive
Visual previews are hit-testable `pointer_capture` BevyUI nodes. Their
double-click selects the source and starts the existing text session in
`rail_only` mode without Natural chrome; Escape cancels, while a pointer on
another project-view node commits and closes. Visual long press opens the
canonical Atome Flower context, preserving the existing Couleur/Font tools and
their `rich_text` range pipeline.

Current Tauri property-security and collaboration flow (2026-08-14): local
event and batch commits authorize every touched `particle_key` inside the same
SQLite transaction as events, particles, versions, current state and queue
insertion. Exact property ACL rows precede global rows, malformed native
conditions fail closed, read/history/capability responses are projected per
principal, and a denied mixed batch leaves no durable or queued side effect.
Structural `parent_id` remains event-envelope metadata: Axum applies it to the
canonical `atomes.parent_id` column and returns it at the root of each
`state_current` response, never as a durable business property. This preserves
Molecule membership identically in Web and Tauri batch commits.
`local_atome_sync_worker.rs` consumes each local principal's ordered queue with
that principal's in-memory Fastify credential, normalizes local-only identity
fields at the boundary, and retries transport failures with capped backoff.
`local_atome_sync_bootstrap.rs` republishes locally authored current state after
remote identity provisioning; `local_atome_sync_media.rs` uploads local media
bytes idempotently before the owning event. On startup the worker returns
interrupted deliveries to `pending`; remote echoes never re-enter the outbound
queue. It also pulls durable remote state/events back into a recipient-scoped
projection. `remote_projection_access` and
`remote_projection_scopes` own exact/global visibility so revocation removes
stale values; remote delete/restore updates the local lifecycle. Fastify remains
the collaboration authority and the native projection is not a second shared
state authority.

Current Conditions/security flow (2026-08-14): one Squirrel Conditions authority
discovers readable schema, runtime, nested/custom, computed and live properties;
no domain owns a parallel catalogue or evaluator. Queries compile dependencies,
reevaluate only affected candidates, and subscribe only while consumed. Static
lists retain identifiers; dynamic lists retain a live ConditionSet reference and
restart on its revision changes. Browser requests without local candidates run
through `server/conditionsQueryAuthority.js`, which applies ACL before evaluation
and returns only allowed projections. Canonical commits are authorized per touched property inside the
same database transaction before append. ADOLE permission conditions receive
actor, Atome, operation and property context and fail closed on unknown or
malformed input. Current state, history and realtime events are then projected
per recipient/property, with empty payloads suppressed and permissions
re-evaluated before live delivery. Saved security bindings pin an authorized
condition-set revision. Conditions select or authorize; actions and realtime
transport remain owned by their existing command and sync pipelines.
Time conditions schedule only their next semantic deadline; presence/session
reuse browser connectivity and canonical Squirrel authentication events, while
location and health use expiring live samples. None installs a permanent poller.

Current project-state reliability contract (2026-08-11): project listing has a raw read phase and a serialized per-user reconciliation phase. Creation/insertion reads the complete authoritative list under that lock, deduplicates by ID, assigns collision-free slots deterministically by creation time then ID, and writes one `commitBatch`; Dashboard opening repairs historical collisions without deleting projects or previews. Dashboard `projects` data is account-global and uses one global cache invalidated by create/rename/delete, while project-scoped categories retain per-project caches. Shared record identity accessors in `atome_record_utils.js` are the sole root/`properties`/`meta` authority used by scene loading, structured project views, and Infos.

Current playback transition contract (2026-08-11): media playback state lives in `selected_project_media_playback_runtime.js`, never in DOM state. A selection with at least one stopped playable medium exposes Play; when all playable media are active it exposes Stop. Play resets the selected media and restarts all at zero; Stop resets all. Flower and contextual footer reproject from the single playback-state event. Decoder control remains owned by `media_reader_tool_runtime.js`; changing project stops only outgoing-project media and does not touch assistant/TTS/global streams.

Current viewport reanchor contract (updated 2026-09-01): `surface_runtime.js` is the shared Web/WebView/Tauri/iOS resize lifecycle owner and `surface_size_runtime.js` is its size authority. Initial and observer-only sizing remain host-based. Window, visual-viewport, orientation, and Tauri native-viewport signals carry their source into the immediate resolver; a native Tauri size is published in logical CSS units by `platforms/desktop-tauri/src/viewport_runtime.rs` at startup and on host resize. One frame-coalesced update plus one source-neutral trailing consensus keeps the canvas, Bevy logical surface, menu and panels in the same resize generation even when a late native/WebKit event carries the preceding size. A width-stable contracted visual viewport remains authoritative for the iOS keyboard. Only distinct stabilized surface sizes are published, and Dashboard, main menu, and structured views consume that publication without adding competing viewport listeners; the panel runtime retains its specialized keyboard-contraction lifecycle. Browser Winit events only reconcile its window to the canonical Atome surface config and cannot replace that config from an uncapped native DPR. `project_layer_geometry_runtime.js` owns fixed `inset: 0` shells, and platform code must not inject DOM height writers or another renderer/state owner.

Current workspace-entry ordering (2026-07-22): after a valid authenticated session, the neutral Dashboard scene is mounted before resolution, creation, selection, or loading of a user project. `project_bootstrap.js` remains the canonical project owner and performs that work behind the Dashboard without forcing the project surface foreground. On readiness, the Dashboard refreshes its data context while retaining the neutral shared canvas; a failure is phase-qualified as `dashboard_open`, `project_bootstrap`, or `dashboard_refresh` and must not be collapsed into an authentication failure.

Current boot resilience contract (2026-07-23): `boot_runtime.js` may retry the canonical Dashboard/main-menu open only while its bounded boot window is active. It must regard the boot as successful only once the shared surface, mounted BevyUI tree, and interactive main-menu records are present in the foreground scene. A transient renderer/menu absence is not a permanent boot failure; expiry records the terminal error, while a subsequent real workspace signal starts a fresh bounded attempt.

Current mobile resource/lifecycle contract (2026-07-17; supersedes older warmup, preview, and fixed-cadence details below wherever they conflict):

- Boot and workspace restoration are demand-driven. No delayed cascade may preload Dashboard, capture, panels, activities, voice/TTS, or renderer WASM before the first presentation. Existing non-critical owners may warm only after the presentation signal; camera/microphone permission still belongs to the explicit capture gesture.
- Tauri STT follows the same rule: Vosk is prepared by the first explicit listening action, not by plugin setup or voice-service construction.
- Project listing excludes `preview_url` at the Tauri, iOS, and Fastify storage-query boundaries; canonical `meta.owner_id` participates in security projection and failures cannot masquerade as an empty project list. Preview capture is ephemeral, WebP, DPR 1, and limited to an explicit current project.
- One shared surface interceptor owns input. Dashboard render backpressure keeps only current plus latest state, and data hydration is restricted to lanes currently visible in the viewport; newly revealed lanes hydrate on scroll. Dashboard mode suspends hidden media decode and its frame callbacks. The Web renderer is strictly event-driven with explicit wakeups and no idle update cadence; surface DPR is capped at 1.5 and decoded texture retention at 16 MiB.
- iOS file propagation is event-driven. `FileSyncCoordinator.syncAll()` runs after initialization, confirmed explicit file mutations/imports/captures, explicit sync, or list freshness; `FileSystemDeletionTransaction` forbids success, tombstones, and sync when coordination, removal, or absence confirmation fails, and a partial batch marks only confirmed deletions. No repeating directory-scanning timer exists, and the local HTTP server never synchronizes all roots for ordinary static GET requests.

Current inter-runtime identity contract (2026-07-30): Fastify ADOLE owns remote principals and authorizes only provisioned `user` Atomes. A local principal cannot authenticate Fastify; the only creation/link route is the explicit `/ws/api` provision operation guarded by a verified remote fingerprint, credentials, expiry, and idempotency journal. Guest principals are local UUID v4 workspace identities with no Fastify account or remote sync/share/message authority. Browser guest data is persisted in IndexedDB as projected records plus append-only events, snapshots, queue entries, and blobs. Confirmed adoption is owned by the Fastify `guest-adoption` journal; it atomically moves active ADOLE references, retains immutable guest actors in events/snapshots, stages files before finalization, and leaves a rejected workspace untouched.

Current production signing-identity lifecycle (2026-08-10): the account-provision fingerprint is backed by one persistent RSA key pair outside the Git checkout, not by repository state. During update preflight, `scripts/server_secure_config.js` validates existing configured keys or creates the missing pair under `/etc/squirrel/identity`, persists stable identity metadata and paths in the root-only service environment, and fails before service mutation when paths are incomplete or keys mismatch. The backup phase copies the validated pair. Fastify loads and validates the same pair through `server/serverIdentity.js`; deployment tooling, the manual generator, the identity endpoint, challenge signatures, and `/ws/api` account provisioning therefore share one fingerprint authority.

Current Jarvis assistant flow (2026-08-09): `Atome long hold -> eVe assistant -> shared voice service -> LLM planner -> MCP toolchain -> AtomeAI policy -> Runtime V2 -> canonical commit/history/sync`. The assistant does not use the runtime-direct bridge when configured for MCP and never writes an Atome directly. Browser and native STT share silence/final-silence endpoint parameters; assistant and Home reuse the same pause thresholds and transcript classifiers. During TTS, a second interruptible STT turn is armed after the echo guard window; actionable non-echo speech stops TTS and becomes the next turn. Home stores one explicit active provider as non-secret profile metadata and keeps provider tokens exclusively in the encrypted vault.

Tauri mobile status (2026-08-09): `platforms/desktop-tauri/gen/apple` and `platforms/desktop-tauri/gen/android` are the generated mobile applications, and the vendored STT plugin supplies their native speech-recognition implementations. The iOS Rust target compiles successfully. The Android ARM64 debug APK builds successfully with API 26 minimum, API 36 target, and verified `INTERNET` plus `RECORD_AUDIO` permissions. Reqwest uses Rustls rather than a host OpenSSL dependency, and the Android minimum matches CPAL's AAudio link requirement. Bundle resources include only `atome/src` plus `eVe`, excluding renderer build outputs; a bounded lightweight Tauri bootstrap waits for the native static server instead of duplicating the product frontend as the initial asset route. Physical-device voice acceptance remains required.

Purpose:

- Define the cross-layer architecture contract used before future implementation work.
- Make dependency direction, lifecycle, runtime modes, source-of-truth rules, and open/closed boundaries explicit.
- Prevent duplicated systems, hidden mutation paths, fallback transports, and product-specific code leaking into the open framework.

Mandatory Use:

- Before changing structure, runtime behavior, persistence, sync, MCP, tools, UI, or APIs, consult this file together with `maps/CODEMAP.md`, `maps/API_MAP.md`, and `maps/DESIGN_MAP.md`.
- Verify the referenced source module directly before relying on this map for a code change.
- Update this map in the same task when cross-layer ownership, dependency direction, lifecycle, source-of-truth rules, or runtime modes change.

## Mandatory Pre-Implementation Gate

No structural, runtime, persistence, sync, MCP, tool, UI, API, security, platform, or cross-layer change may start until the relevant maps have been consulted:

- Use `maps/CODEMAP.md` to establish file ownership, source placement, existing modules, and reusable implementation boundaries.
- Use `maps/API_MAP.md` to establish API visibility, runtime exposure, effectful operation paths, MCP compatibility, and public/semi-public/internal classification.
- Use `maps/DESIGN_MAP.md` to establish design ownership, JavaScript token/factory reuse, generated style exceptions, and product visual boundaries.
- Use this file to establish dependency direction, lifecycle, command/history flow, source-of-truth rules, runtime modes, and Atome open / eVe closed architecture constraints.

Implementation may proceed only after the architectural owner, dependency direction, mutation path, validation expectation, and required map updates are known.

## Global Vision

BevyUI panel architecture:

- Migrated eVe panels render as disposable BevyUI trees on the shared `eve_surface_project` canvas through `eVe/intuition/runtime/bevy_panel/` and `window.eveBevyUiRuntime`.
- `openPanelSurface(surfaceKey, context)` and `closePanelSurface(surfaceKey, context)` remain the single panel entry points. `panel_surface_runtime.js` routes only registered Bevy panel surfaces to the BevyUI panel runtime; non-migrated surfaces stay on the old path until their migration is complete and verified.
- Size and Font are lazy registered Bevy product surfaces on that same route. Their controls project into the shared `panel_layer` on `eve_surface_project`; no visible HTML panel or second renderer remains. Disposable component state belongs to their Bevy runtimes, panel intentions re-enter the preserved public apply ids through `invokeToolGateway`, selection-style truth remains outside the view, and every business write converges on the existing canonical selection-style mutation owners.
- The panel structure is fixed as `PanelRoot -> BodyScroll -> FooterControls`. BodyScroll is the only scroll owner; FooterControls owns the title, close, drag, and resize controls. A generic tools dock and a redundant passive header are forbidden on migrated panels.
- Every registered Bevy panel opening geometry is bottom-anchored to the top edge of the active main-menu reserved band on desktop and mobile. The shared panel layout resolver derives that boundary from the canonical main-menu reserved height; only an explicit runtime drag may move an already opened panel away from its initial anchor. Font opts into `openBesideContextualRail`: its surface resolves a canonical non-DOM rail inset only while the rail is visible, the runtime forwards it, and the layout places Font in the adjacent remaining surface rather than underneath the rail.
- Contextual Atome editing follows the same exterior-depth rule: its disposable exact-bounds composed shell owns the shared shadow around the Atome plus footer, while its selection-outline projection is shadow-free and cannot alter the shell geometry.
- During the migration only, the development/test-gated `panel_lab` surface is opened through the same Bevy panel router from a temporary trailing main-ribbon tool. A short activation toggles the Lab; a 520 ms long press is suppressed from normal activation and invokes only the development-view reload. It renders only the shared panel foundation, keeps drag/resize geometry and its opt-in footer double-activation fullscreen/restoration state in `bevy_panel_runtime.js`, shares the one canonical canvas BevyUI runtime with Dashboard and the ribbon so footer hit-testing remains active above Dashboard, and reuses the contextual Atome-edit footer order (left resize, close, drag, right resize) from the existing Bevy ribbon contract. Panel Lab alone opts into floating geometry on mobile so its footer drag and resize specimens remain testable on a physical iPhone; product panels retain the existing mobile fullscreen policy. The runtime retains the full-viewport geometry as its base, projects only a clamped copy while the iOS keyboard contracts `visualViewport`, and reapplies the base after the viewport settles on dismissal. Panel refreshes are coalesced to one animation frame and viewport resize bursts to one settled update, so text/caret updates and keyboard animation cannot repeatedly rebuild the panel backdrop. Its internal fullscreen fills the canvas above the main-menu reserved band and restores its prior geometry. Native iOS builds enable the gate only through the explicit `-AtomePanelLab` launch argument or `ATOME_IOS_PANEL_LAB=1` Debug environment opt-in; normal Xcode launches and every Release build keep the tool unavailable. Panel Lab must be deleted completely after its permanent component tests replace it.
- Shared BevyUI overflow is owned below panels: `bevy_ui_layout_runtime.js` is
  the single geometry/content/clip calculator used by overlay projection and
  hit-testing; `bevy_ui_scroll_runtime.js` owns ephemeral bounded offsets,
  wheel normalization, the 8 px drag takeover, tokenized release inertia,
  animation cancellation, and the tokenized thumb; and
  `bevy_ui_pointer_runtime.js` arbitrates press/cancel/release without
  panel-specific branches. The BevyUI runtime retains one hydrated unscrolled
  source tree and derives both the clipped overlay and hit-test tree for each
  scroll frame, so deep scrolling cannot promote a viewport projection into
  the next frame's source. A refresh may name one internal `preserveNodeId`;
  the scroll runtime captures that node's viewport Y before rebuilding and
  compensates its nearest scroll owner afterward. Infos selection and the
  single drag-preview rebuild use this anchor, while later drag motion remains
  GPU-only and does not rebuild the panel. Virtual Scene `clip` maps to renderer `clip_rect`;
  the shared Bevy core crops visible sprite/UV/shadow geometry. The footer
  stays a fixed sibling and reuses the common system-surface background and
  backdrop while omitting its external shadow; it owns no DOM mask, renderer,
  or persistent state. This architecture passed explicit product-owner
  approval on 2026-07-24.
- Panel Lab introduces exactly one new primitive component type at a time after
  the panel shell and FooterControls are reviewed, while retaining every
  previously approved specimen in chronological body flow. The approved
  specimens are static `textNode`, horizontal `dividerNode`, the validated
  icon action button composed through the shared `buildBevyIconButtonNode`
  widget path, and the in-review canonical `text_input`.
  Its opaque 30 px role-tinted no-backdrop rest surface, hue-preserving
  rest-derived pressed luminance, accent-mixed active surface, shared centered
  material depth, focus ring, standard radius, pressed translation, and 8 px
  divider/label spacing are owned by `EVE_BUTTON_SKIN_TOKENS`. Labeled panel
  actions and standard/palette menu tools consume the same contract; Flower
  overrides only the standard radius with its circular petal geometry. Its label is a vertically centered right-side
  sibling rather than button content. Bevy 0.19 has no native inner-shadow
  style, so no synthetic overlay or second route is added. Its selected state is isolated to the Panel Lab surface runtime,
  resets when that surface closes, and is projected only through the shared
  WebGPU tree; it never creates a product mutation or DOM-owned state.
  Product-surface
  compositions are reviewed only after all required primitives are approved.
  Every new primitive begins with a recorded BevyUI integration decision:
  existing widget kinds, actual native/WASM availability, the canonical
  Atome/Squirrel system-control contract, direct-widget suitability, and any
  justified composition. Lab builders configure or compose the selected
  primitive but never reimplement its graphics, interaction, geometry, styling,
  or state. Panel Lab is never a second renderer, product state owner, or
  compatibility route.
- Visual configuration remains a three-layer projection, not three competing theme systems: `system_ui_tokens.js` owns shared CSS primitives, `elements/skin/` owns immutable Squirrel/Bevy domain projections, and `elements/look/` owns the still-active DOM compatibility translation. Repeated preset declarations may be composed inside their current owner, but feature geometry and semantic paint remain local exceptions. Flower therefore shares the button/system material while retaining its circular radius; Matrix and Dashboard keep their own semantic palettes. Generated CSS must consume these owners and factor selector lists without creating another renderer, stylesheet authority, or runtime state source.
- Package 1 keeps all shared-control interaction state local to its Lab
  runtimes: selectable-list value, multiline draft/caret/scroll, and scope-chip
  selected values reset on close or reload and emit only closed Lab intents.
  Contact and Calendar surfaces remain the canonical owners of any
  durable selection, draft, filter, or command mapping.
- Panel trees place one exact-geometry `pointer_capture` boundary behind their
  contents. The shared surface interceptor owns pointer/click/double-click/
  wheel arbitration before project hit-testing, so panel gaps cannot select,
  edit, drag, lasso, or create an Atome behind the panel. The full-canvas root
  remains non-blocking.
- `text_editing_session.js` is the single active text-entry owner for BevyUI
  Input and project text. It delegates only keyboard/IME/clipboard capture to
  `hidden_text_service_runtime.js`. That service keeps its focused textarea
  fixed inside the layout viewport with a zoom-safe 16 px native font. It does
  not lock pre-keyboard geometry: the native iOS shell, project render surface,
  Bevy panel geometry, and main menu must all follow the same live
  `visualViewport` contraction while the keyboard is present.
  `text_editing_layout.js` owns glyph-index,
  caret, selection-range, canonical line-height, and measured-size geometry.
  Panel Lab keeps only its focused-placeholder visibility and Return-as-blur
  policy; it never clears user-entered values. Surface routing distinguishes a text session synchronously opened by
  the current double-click from one active before that gesture: only the latter
  routes through `text.selection.all`. Unitless line-height values up to `4`
  are font multipliers, and contextual chrome reschedules from hidden-editor
  input so its footer follows measured multiline height. Durable project text
  still commits only through `text.commit`.
- Project-background double-tap classification has priority over lasso
  activation for the bounded second press. `project_layer_tap_classifier.js`
  recognizes the existing 520 ms / 32 px gesture before the 8 px lasso
  threshold is evaluated, while motion beyond the double-tap bound still
  becomes a normal lasso. A successful background double-tap therefore enters
  the single compact `132 × 24 px` project-text creation path exactly once.
  The active hidden editor mirrors document-level native `selectionchange`
  events into the canonical text session, allowing the iOS space-bar trackpad
  to move the WebGPU caret without changing the text value.
- Mobile panel geometry occupies the available shared canvas area above the toolbox-reserved band so the main toolbox remains accessible. A floating panel keeps its pre-keyboard geometry as the stable position: keyboard contraction may clamp its projected copy upward, but dismissal restores the exact original position.
- Panel trees emit UI intentions such as close, resize, field, list, and command activation. Durable business mutations remain in their existing owners and must still pass through the canonical APIs or `Atome.commit` / `commitBatch` where canonical state changes.
- Timeline is the final product-panel migration. `eVe/intuition/tools/timeline.js` is compatibility glue only and must not recreate the old HTML dialog. Its existing Bevy route is not completion evidence; Timeline controls retain their own product ownership and must not be counted, specified, or validated as generic Panel components.

Dashboard Bevy architecture:

- The active workspace is a single Bevy/WebGPU canvas with a logical scene hierarchy, not independent overlay stacks. `eVe/domains/rendering/workspace_scene_layers.js` defines the stable closed eVe roots `workspace_root`, `project_layer`, `dashboard_layer`, `panel_layer`, `main_menu_layer`, and `flower_layer`. Project Atomes, Dashboard records, BevyUI menu nodes, Bevy panels, and future Flower records must project as children of those logical layers with normalized render ordering and accessibility metadata. These roots are used for diagnostics/accessibility and hierarchy validation; they are not extra visible canvases, DOM layers, duplicated state stores, or public Atome entities.
- Shared BevyUI canvas hit-testing follows the workspace layer order before each tree's local z-index. Dashboard skin layers are already absolute values inside the canonical Dashboard band; `dashboard_record_primitives.js` marks that ownership before workspace normalization so the Dashboard base is never added twice. A Dashboard-local drawing order must never render above or consume a pointer intended for a visible Panel, the main menu, or Flower.
- Shared canvas and registered DOM gestures use Pointer Events as their single physical-input family. `surface_interaction_runtime.js` translates one pointer press lifecycle into at most one BevyUI activation and retains BevyUI ownership from `pointerdown` through move, release/cancel, and the bounded derived click even when iOS changes the DOM target while presenting its keyboard. `bevy_ui_pointer_runtime.js` admits only a primary pointer action to that activation lifecycle; secondary and auxiliary buttons remain available to their contextual/system command owner and can never activate the BevyUI control beneath them. The derived-click guard compares stable client coordinates rather than logical surface coordinates, because the latter change when the iOS keyboard contracts the canvas. For a `text_input`, `bevy_ui_pointer_runtime.js` verifies the same-target release but defers native focus and activation to that gesture's consumed terminal `click`: focusing during `pointerup` lets WKWebView's still-pending tap default action immediately move focus back to `body`. An already active field still receives its press for caret/selection anchoring. `input_event_runtime.js` owns the equivalent bounded document lifecycle for DOM gesture consumers. Browser compatibility mouse or raw touch sequences are not registered as parallel gesture owners; native `click`, `dblclick`, and `contextmenu` remain semantic commands where their owning interaction requires them. Flower blocking resolves BevyUI at the actual canvas point even when iOS reports the project shell as the event target, and its capture-phase long-press candidate aborts when the later BevyUI route marks that same `pointerdown` prevented, except for a Dashboard item explicitly resolved by the Dashboard arbiter because its card press ownership must preserve the contextual hold. This boundary prevents one iOS tap from toggling Dashboard, selecting an Atome beneath a panel, closing a newly focused editor, or opening Flower through panel geometry.
- The BevyUI main-menu Atome tool is the dashboard entry point for authenticated or anonymous active workspaces. It toggles through `toggleWorkspaceDashboardAndMainMenu({ source: "bevy_ui_main_menu_atome" })`, so a presentable neutral Dashboard closes normally, while a logically active Dashboard with missing records/surface is repaired through the canonical neutral workspace opener instead of calling the low-level dashboard runtime toggle. It opens the eVe dashboard rendered into the neutral `__eve_dashboard_workspace__` Bevy scene by default and no longer hides the toolbox to reveal dashboard content. The Home main tool remains the user/Home panel route, including before workspace activation. The fixed-size BevyUI menu never shrinks tools to fit a narrow surface: `bevy_ui_main_menu_model.js` computes `scrollLeftPx` / `maxScrollLeft`, right-handed overflow starts at the terminal scroll position with Atome flush to the edge, `bevy_ui_main_menu_scroll_runtime.js` owns normalized wheel/pointer horizontal scrolling, snap, and activation suppression after drag, and `bevy_ui_main_menu_runtime.js` coalesces scroll renders so hover-wheel bursts cannot backlog stale BevyUI tree updates.
- BevyUI overlay rendering is versioned per tree before asynchronous texture hydration starts, then applied through a per-tree queue whose cleanup promise resolves on both success and failure while the returned operation preserves the original error for its caller. Standalone ImageNode hydration uses the same exported `DEFERRED_TEXTURE_BATCH_SIZE` as deferred media texture resolution and yields between batches. Dashboard card-media nodes are explicitly marked to defer generic ImageNode hydration; their forwarded overlay records enter the shared WebGPU deferred-media path, so project thumbnails cannot block the structural Dashboard mount while icons, shadows, and label backdrops retain normal prehydration. When a Bevy UI node carries a canonical `overlayRecord`, the overlay projector forwards that record exactly under the `__eve_bevy_ui_` prefix instead of reconstructing a simplified shape/text/image record, so the visible WebGPU overlay keeps the canonical dashboard visual contract. Large overlay trees are applied in 20-record batches separated by animation frames; this keeps static dashboard mount below the T3.5 no-frame-over-32ms budget while preserving a complete mount under 100ms. The BevyUI main-menu tree is the exception: its fixed icon/label set is reconciled atomically by prefix, not split into batches, so resize/hover/update races cannot leave only part of the menu committed as the stable overlay. BevyUI overlays are projected into the current foreground workspace scene, not a fixed Dashboard scene: project mode writes menu records into the active project, Dashboard mode writes them into `__eve_dashboard_workspace__`, and a tree projection clears stale records for that same tree from inactive scenes so project switches cannot keep a ghost menu baseline. Geometry remounts clear the old overlay and immediately mark the overlay baseline empty; if projection fails, `bevy_ui_overlay_reconciliation.js` keeps the error observable and queues one reconciliation through the existing per-tree queue rather than leaving a partial batch as the stable record baseline. Native BevyUI WASM submission remains opt-in and must not double-render over overlay-backed static dashboard surfaces. Stale menu renders caused by pointer focus/activate transitions must return without updating overlay records, so Dashboard opening cannot be followed by an older tool texture projection.
- The renderer owns several cameras, but UI sizing has exactly one authority: the camera marked `IsDefaultUiCamera`. The workspace capture and both Gaussian passes render to quarter-resolution images and must never participate in BevyUI viewport diagnostics or JavaScript render scaling. Before the default camera is initialized the published viewport is zero/neutral; after initialization it equals the presentation target backing size.
- Dashboard opening progressively projects one canonical tree: shape records mount first and establish workspace readiness, then the existing post-open task hydrates data and adds the complete text/image details in one projection. This transition preserves mounted shape ids and submits only new overlay records, preventing a redundant structural replacement while resources spawn. Texture resolution therefore cannot keep the preceding project visible; no alternate tree builder, renderer, canvas, or fallback state is introduced.
- `eveBevyUiRuntime.prewarmTreeImages({ surface, tree })` remains a hydration-only primitive. After its first stable mount, the main menu uses it one palette per idle frame to populate the existing bounded texture cache; closed palette nodes remain absent from trees, hit-testing, and projection. The cache shares concurrent resolutions by key, stores final tinted payloads as typed RGBA bytes, and advances a generation on clear so obsolete in-flight work cannot repopulate it. Hide, content replacement, destruction, or palette activation cancels pending work.
- Non-atomic BevyUI trees force scene projection only on their first mount. Later geometry updates, including Dashboard wheel/inertia/snap frames, retain normal `project_scene_direct_transform_runtime.js` eligibility so existing GPU entities move incrementally instead of being rebuilt; the fixed main-menu tree forces the full set only on its fresh mount and submits compatible hot structural changes through `project_scene_direct_prefix_runtime.js`. Palette activation therefore projects one complete opaque structural set at the expansion origin, including background, accents, tools, icons, and labels; direct motion begins on the first rAF and carries that whole set through the 180/70/120 ms curve without faded or delayed content.
- Direct prefix and motion operations normalize through the workspace-layer contract, reuse resident resources, and serialize through the shared direct-mutation queue in `project_scene_state.js`; full scene projection waits for that queue so no stale direct sample can overwrite newer structure. `project_scene_direct_motion_runtime.js` patches transforms/styles without re-normalizing render nodes or hashing unchanged RGBA payloads. Its rAF producer permits one renderer submission in flight and coalesces all pressure to one latest pending sample, never a FIFO. Dashboard vertical projection keeps all category ids resident, places non-visible lanes outside the canvas, and uses width/height-aware direct transform patches; wheel input lands on a whole-lane snap point in one coalesced render, while visible-lane hit-testing remains bounded.
- Web palette motion uses the existing batched `apply_atome_bevy_ops` route, never one WASM crossing per node. The Web Bevy runner drains that batch on its 16 ms reactive update; last-tick/last-wake throttling prevents redundant `WakeUp` events from postponing the update. Renderer artifacts are loaded as one content-addressed glue/WASM pair after a page-scoped refresh of the tiny version manifest, preventing hot-build cache mismatches without disabling immutable caching of the large binary.
- The dashboard reserves the registered active BevyUI main-menu height as an excluded bottom band. No legacy DOM toolbox measurement fallback is authorized; an unavailable or unmounted canonical menu is an explicit readiness error that must be repaired by the owning workspace/menu lifecycle. Dashboard hit-testing stops above the registered reserved rectangle. Dashboard rendering must not place a visual mask in the reserved band; the foreground menu remains the unchanged BevyUI main menu. This must not add a DOM overlay, CSS canvas filter, second canvas, or alternate renderer.
- Session entry into an authenticated or anonymous workspace uses `eVe/intuition/tools/user_workspace_surface_runtime.js` to ensure the canonical shared project canvas is attached to `project_view___eve_dashboard_workspace__`, run data-only dashboard warmup for the neutral Dashboard scene before the automatic open, call the shared workspace menu visibility helper so reserved-band geometry is stable, open `window.eveDashboardBevyUiRuntime` for `__eve_dashboard_workspace__`, repair the neutral host/canvas attachment through `dashboard_workspace_mode.js` if readiness detects an unavailable surface, and verify readiness directly after `dashboard.open()`. After auth/workspace entry, the main-menu invariant is centralized in `workspace_main_menu_visibility.js` and is reasserted after Dashboard open/repair, project-card activation, Dashboard-to-project restoration, Bevy panel opening, and project activation; the helper requires both an active BevyUI menu tree and main-menu overlay records in the current foreground scene before it accepts the menu as visible. The login/unauthenticated surface remains the only allowed pre-workspace exception. Authenticated dashboard entry also calls `dashboard_project_record_bootstrap.js` to ensure the user has at least one durable project record; that path lists authorized projects and may create `untitled`, but it must not call `activateProjectWorkspace()`, set a current project for the neutral Dashboard, or call `loadProjectAtomes()`. `eVe/domains/dashboard/dashboard_bevy_ui_runtime.js` is the only Dashboard runtime: it builds a Bevy UI tree from the same dashboard constants/data/layout/tokens and canonical dashboard records, mounts it through the shared `eve_surface_project` Bevy UI runtime, and verifies readiness from Bevy UI runtime diagnostics backed by mounted overlay records. It must not fall back to a deleted legacy runtime, create Dashboard DOM, or submit a second native UI visual layer during the static phase. Authenticated and anonymous Fastify entries must first prove a usable token/session and clear stale invalid-token state through the Atome auth token owner; a user identity without an installed token is not enough to open the neutral Dashboard. When auth restoration turns the workspace active after the initial login sequence has already mounted, the shared login sequence is closed from its singleton owner before authenticated toolbox content is exposed, so no stale login shell can mask the Dashboard or intercept the BevyUI menu. Default boot must not start `loadProjectAtomes(...)`, publish a user project surface, or hydrate project previews by loading projects in the background. A single neutral in-flight open lock prevents the boot and anonymous/authenticated entry paths from issuing duplicate dashboard opens, and failed Bevy projections must never become the virtual-scene diff baseline for later Dashboard reconciliation. Dashboard runtime diagnostics are transaction-scoped: `open()`, `refresh()`, and `warmup()` clear older async errors before the current attempt. This is lifecycle orchestration over the existing menu/dashboard/render APIs, not a separate dashboard DOM, background project loader, or DOM menu state owner.
- A Dashboard project-card gesture delegates activation completely to `activateProjectWorkspace()`. That canonical owner alone publishes the current project, restores its per-project view mode, loads and foregrounds its WebGPU surface, and reasserts main-menu readiness. `dashboard_actions.js` must not repeat the menu-visibility pass after activation; doing so validated the menu against an already-transitioned scene and emitted `workspace_main_menu_overlay_missing` after an otherwise successful project switch.
- The delayed post-auth Dashboard bootstrap is subordinate to explicit project activation. If `window.__eveWorkspaceMode.mode` is already `project` when the delayed Dashboard bootstrap resumes, it may mark bootstrap complete but must not clear the active project host, detach the shared canvas, delete `window.__currentProject`, or overwrite the active scene with Dashboard cleanup.
- Dashboard category defaults are seeded from `eVe/default_values/constants.json` and normalized by `eVe/domains/dashboard/dashboard_model.js`; `eVe/domains/dashboard/dashboard_preferences.js` applies user profile rubrique visibility before hydration, layout, hit-testing, tool activation, and Bevy projection. Runtime state is limited to active category, scroll, gesture, label-edit, and projection lifecycle state; there is no generic fullscreen item editor.
- Dashboard item listing is cached in `dashboard_bevy_ui_runtime.js` by scene/data project context plus category; generic record categories are batch-loaded by `dashboard_data_adapters.js` through a single canonical `state_current` read per grouped dashboard load. Calendar dashboard items come from `CalendarAPI.listEvents()` through the read-only `calendar_api.js` facade, not the panel-building `calendar.js` module, and only dated, non-deleted, unique events are projected; reopening the Calendar panel refreshes its initialized cache from `CalendarAPI` so dashboard-side title/date commits are visible after close/reopen and app reload. Contacts dashboard items combine the Contacts panel directory source with local `eve_contacts_local` payloads, order local payloads first so editable contacts occupy the first visible cells, prefer display/name-like fields before phone or email labels, and keep non-matching directory contacts visible after them while matching local payloads remain the canonical editable item. Contact profile photos flow only as disposable `metadata.user_face` into Dashboard Bevy image records. The Contacts service binds its local source to the runtime environment storage and can synchronously rehydrate `list({ source_id: 'eve_contacts_local' })` after service recreation; local contacts are writable/read-write, while non-local contacts stay non-editable and never receive local aliases. Project items use persisted renderer-produced preview descriptors as `metadata.project_preview_source` plus natural dimensions during default Dashboard boot; first paint and neutral hydration request project/contact items with preview hydration disabled so cold capture or missing previews cannot load user projects in the background. Explicit project-to-Dashboard close and Matrix preview refresh paths may capture the preview source at default logical `640x400` with physical dimensions derived from DPR, persist the captured `preview_url`/dimensions/timestamp through `Atome.commit`, and rerender only after a persisted source is available; capture or commit failure keeps the preceding durable descriptor visible. After the initial critical neutral Dashboard projection, the close path targets only the Projects category through the existing hydration controller and reuses retained current-scene records; this asynchronous task is observable in runtime diagnostics and does not introduce a background loader or alternate renderer. Wallpaper/background/dashboard records and the workspace surface descriptor are excluded from project miniatures. The reusable Bevy preview capture iframe/canvas is hidden behind the app, kept paintable, retained across serial captures, and uses an explicit transparent preview surface. It waits for deferred texture resources, revalidates stable-id content after every asynchronous resolution so an obsolete texture cannot overwrite a newer card, rejects skipped or pending resources, and treats transparent/nearly empty captures as explicit renderer errors rather than valid Dashboard previews. Dashboard item normalization deduplicates by normalized item id before focused rendering. Opens clear stale focused category state, invalidate any in-flight warmup, guard only the opening pointer sequence from also activating a lane, render immediate critical project/contact data without waiting for capture, then hydrate other visible categories and rerender only when projection-relevant content changes. Warmup must abort while the runtime is active/opening/closing or serial-invalidated and must remain data-only so it cannot create hidden Dashboard records in the project scene. The cache is invalidated by explicit refresh, project-change lifecycle, logout, `eve:people-directory-updated`, `eve:user-profile-updated`, any non-Dashboard Atome mutation carrying a project id for project preview refresh, and explicit invalidation; every explicit forced capture invalidates its derived preview cache, while header clicks do not force a synchronous reload.
- Dashboard rendering keeps an internal disposable record cache and diffs records by id with a targeted structured comparison before calling `updateProjectSceneOverlay(...)`, which merges record removals, record updates, and scene effects into one Bevy projection render per logical dashboard render. `dashboard_bevy_ui_runtime.js` reuses the current watcher snapshot and `dashboard_environment.js` memoizes the active-category item projection, so hot render frames no longer repeat toolbox DOM measurement or item dedupe work. Dashboard records are non-selectable decorative/runtime records. Layout hit-testing commits header/item actions only after pointer release on the same target without drag movement; vertical drags over headers scroll the rubrique stack and suppress opening. Project, Calendar, and Contact card actions delegate to their canonical owners; unsupported item categories remain inert. The toolbox-reserved canvas band is inert while the Dashboard is open, and high-frequency wheel, pointermove, and inertia ticks remain animation-frame-driven over the existing Dashboard runtime path.
- Dashboard item label editing is a runtime interaction over the existing project canvas. `dashboard_bevy_ui_runtime.js` owns long-press detection, editable field hit resolution, and prevents the release click from opening an item; `dashboard_item_text_fields.js` is the single source for project/contact title fields and calendar title/start-date fields; `dashboard_label_edit_runtime.js` owns hidden text capture, Enter/Escape ownership, and Bevy-projected draft/caret/selection state; `dashboard_label_persistence.js` commits labels only through Matrix project rename, CalendarAPI event title/start update, or local Contacts update. Active project rename also persists the current-project name used by reload bootstrap. Only local `eve_contacts_local` contacts arm label editing; non-local contacts remain click-openable and direct persistence calls reject explicitly. The flower context resolver must allow Dashboard item hit zones to open the radial context menu by right-click or long press, while the toolbox-reserved band and non-item Dashboard chrome remain blocked. A Flower Rename invokes that existing label editor; a Dashboard project Flower Delete invokes `project_data.js` and refreshes only the `projects` category. If the flower takes the pointer, Dashboard label-edit long press must yield to that flower pointer ownership.
- Calendar and Dashboard share `resolveWorkspaceDataProjectId()` from `dashboard_workspace_mode.js`. The neutral Dashboard scene is never a Calendar data project: during login or user handoff, `dashboard_bevy_ui_runtime.js` limits hydration to the existing account-global critical categories (`projects`, `contacts`) until project bootstrap retargets the resident tree with the next canonical data project. Calendar cards then bypass Dashboard item caching so every presentation derives from `CalendarAPI.listEvents({ projectId })`.
- While open, the dashboard watches its environment through `dashboard_environment_watcher.js`: project surface size, surface parent size, toolbox candidate geometry, window resize, Intuition handedness state, and profile preference updates. The watcher compares a compact environment signature before rerendering, so resize/toolbox/latéralité changes update the Bevy records without timers, DOM dashboard state, or close/reopen. Profile category visibility changes are handled by the dashboard lifecycle event path so hidden rubriques are removed from the canonical runtime category list before render instead of being hidden by DOM or CSS.
- Dashboard layout precomputes lane item starts and uses bounded lookup for visible item records. Cells keep their logical square/double width even when partially visible; clipping is represented by layout metadata and visible-range filtering, not by shrinking durable item geometry or adding DOM. Visible card, media, backdrop, and label record ids are tied to stable category+item identities rather than visual slot numbers, so scroll and focused-category changes move existing items through transform/style diffs and only spawn/despawn records as they enter or leave the bounded visible window. The bottom reserved band uses the measured top of painted maintoolbox controls/surfaces when they are visible; the generic minimum band is used only when no toolbox surface is measurable.
- Initial dashboard open has no active category so each lane shows its own category color/data. Header activation starts the focused mode where the active category color fills the dashboard background, table, lanes, and entêtes as one uniform backdrop; cached/current active-category items are reused immediately through stable category+item records, and the active category's unique items are distributed once across the lanes instead of being mirrored into every lane. Clicking the already active header clears focus and restores the base dashboard overview. Missing focused-category data hydrates into the same item identities instead of forcing an empty intermediate projection. Focused item hit-testing preserves the item category as the action owner even when the item is displayed on another visual lane.
- Dashboard no longer owns `+` creation actions from focused entêtes. There is no full-height plus strip, no plus hit-test route, and no no-op plus branch. Header long press is the only Dashboard header creation gesture and is limited to `projects`, `calendar`, and `contacts`; it creates through the existing Matrix/Adole, CalendarAPI, or Contacts API owners, invalidates only the matching Dashboard category, and suppresses the following normal header activation after creation. Project header creation must not activate or load the project. Calendar/contact header creation opens only registered BevyUI panel surfaces and must preserve the workspace main menu. Project item clicks still follow the same transition rule: Dashboard and project must never be visible simultaneously, and `loadProjectAtomes`/project activation happens only after the explicit project-item click path begins. Project activation owns the recovery of active project layer visibility, `eve_surface_project` pointer interactivity, workspace `project` mode, and menu visibility through the existing project/render/Flower routing, not through Dashboard DOM cleanup.
- Default Dashboard mode owns a neutral project scene id, `__eve_dashboard_workspace__`, whose host is a fixed full-viewport shell. Its Bevy projection must claim the shared project canvas foreground instead of rendering as a project overlay; project bootstrap cleanup may remove user project hosts and project scene visuals, but when `startup_view` resolves to Dashboard it must preserve that neutral host, its shared canvas, its foreground ownership, and its active Dashboard scene records; otherwise the Dashboard runtime can remain logically active while the visible surface has been removed or cleared.
- The open Atome `record` type is the v1 storage contract for dashboard generic data. Dashboard category membership is stored as generic `category_id` plus `source_domain: "eve.dashboard"` so the Atome type remains product-neutral.
- Rounded dashboard geometry is not dashboard-specific renderer code: `corner_radius` is a product-neutral render style carried from Atome records through the virtual scene and Bevy projection adapter into Bevy core shape sprite masks. Bevy core also preserves that radius on spawned shape entities so the canonical `material.shadow` GPU drop shadow can generate a disposable exterior silhouette texture with a transparent interior from the same rounded-rectangle geometry, without falling back to square-corner shadows, leaving a clear gap at the contour, darkening the owner, or sampling the backdrop.
- Drop-shadow overlays are Bevy-owned transparent sprites under the source shape and explicitly opt out of automatic 2D batching. This keeps Safari/WebGPU presentation deterministic for Dashboard card shadows without changing Dashboard records, adding DOM, adding a renderer, or depending on a resize to repair the first frame.
- Flower glass surfaces use the same compositor-owned workspace capture as assistant optics: `backdrop_surface` samples the shared two-pass Gaussian target through a rounded SDF mask and renders the petal plus its content on the presentation layer, so the captured project remains below Flower rather than being recursively blurred. `workspace_blur.wgsl` is the attributed Bevy 0.19 separable Gaussian kernel, evaluated from physical fragment coordinates; Atome's `12 px` token maps to a Gaussian support radius after DPR conversion instead of a five-tap image-copy approximation. Shape shadows remain a separate cached Gaussian silhouette operation. Dashboard header side and bottom shadows remain dedicated external gradient textures and do not consume `material.backdrop` or `material.shadow`.
- Dashboard label outlines are not dashboard-specific renderer code: label weight, alignment, baseline, padding, lighter stroke, diffuse text shadow, optional texture scale, and opt-in `text_fit: "shrink"` use one structured `text_style` consumed by the Bevy text texture resolver. Dashboard card labels shrink deterministically inside their Bevy texture before clipping; image-backed card labels may receive a disposable `card_label_backdrop_*` Bevy image record underneath them, bottom-aligned to the card content rect with only the bottom corners rounded, to preserve readability without DOM/CSS overlays. Calendar cards may project a compact display date while retaining the full editable start value. Dashboard text/SVG/header/icon/media textures are cached by content, rich-text edit/selection state, style, dimensions, DPR, and scale through the shared Bevy media texture resolver cache, so repeated category switches do not rerasterize unchanged labels, icons, previews, or faces while caret and selection changes still invalidate the edited text texture; text and image cache keys are content-based and do not include the node id. Header SVG icons and detailed labels request higher texture density through the product-neutral media `texture_scale` field carried by `render_atom.js`, while project/contact card media uses `max(2, devicePixelRatio)` instead of the header/detail density to keep thumbnail upload cost bounded. Dashboard code must not add a renderer-local raster cache or compensate by scaling logical geometry. Dashboard cards use the product-neutral centered `material.shadow` shape contract and a slight same-hue lift from their visual lane entête color; lane bodies are derived from the same entête with `laneShadePercent: -10`. Entête rectangles are pixel-snapped to the handedness edge. The lateral entête shadow is a single external `header_side_shadow` image record that uses the existing Bevy image/texture path and is placed outside the entête block, so no shape-shadow blur can intersect the color block. Handedness determines whether the gradient sits on the left-side tracks for right-handed headers or on the right-side tracks for left-handed headers. Dashboard foreground depth is represented by a disposable project veil record below the dashboard and a single external vertical `bottom_shadow` texture-gradient record at the dashboard bottom; `backdrop_blur` remains dormant until a real renderer blur is accepted.
- Dashboard keeps layout, hit-testing, and disposable render records in the same logical project coordinate space as active Atomes. Dashboard code must not pre-scale or offset records for DPR, backing-buffer size, camera presentation, or WebGPU pixels; browser/WASM Bevy receives unscaled Virtual Scene nodes plus explicit DPR-aware surface metrics, and `atome/renderers/bevy-core/src/render_math.rs` owns the fixed logical orthographic camera projection plus the explicit camera depth volume needed for high Dashboard layers before any browser resize event. Dashboard text/image sharpness is handled by the DPR-sized WebGPU backing plus snapped record bounds and high-density texture rasterization before Bevy projection, not by changing logical geometry.
- Dashboard item activation has no generic detail projection. Projects keep the canonical workspace transition, Calendar and Contact delegate stable identities to their existing panels, and unsupported categories remain inert without changing persisted Atome data.
- Late full-project Bevy renders may request preservation of explicit ephemeral scene records (`__eve_dashboard_`, `mol:lane:`, `mol:clip:`, `mol:kf:`, `mol:playhead`) so dashboard and Molecule overlays are not removed by project-load reconciliation. `__eve_dashboard_` records are preserved only while the dashboard runtime is active; closed dashboard fragments must not be revived by refresh/startup reconciliation. Ephemeral records do not participate in durable project z-index allocation: project media/drop placement reads durable project bounds through `project_scene_stack_runtime.js`, persists `zIndex` plus all three order aliases, and the Virtual Scene derives unique dense project layers from `(zIndex, order, id)` while system bands retain explicit layers. Bevy direct translations retain video meshes and selection entities/textures; resource replacement is limited to dimension or UV changes. Visible Dashboard records reserve the active upper band and force new durable records to remain below them.
- Left/right handedness is a persistent runtime preference read by the dashboard layout and live Intuition state. It mirrors header side, clipping/content direction, hit-test zones, shadow direction, and horizontal scroll sign, and an open dashboard rerenders when profile visual preferences publish a handedness change.
- Dashboard acceptance is split between deterministic Node contracts for data/layout/mockup/record-geometry/data-adapter invariants and real Playwright probes for startup-only Dashboard state, main Atom handle toggling, record-opacity fade start under the interaction budget, canvas hit-testing, persistence, media import/drag, toolbox exclusion, canonical Project/Calendar/Contact item routing, absence of generic fullscreen detail records, screenshot-visible entêtes/cards, logical-coordinate records, handedness mirroring, and 1680px+ no-resize reload readiness where header records must also produce visible pixels.
- `setRenderSurfaceInteractionInterceptor()` is the product-neutral surface hook used by dashboard to intercept canvas pointer/wheel events. It must not become a second project event system or a DOM authority layer.

Atome is the open framework layer. It owns product-neutral runtime contracts, Squirrel APIs, security, synchronization primitives, server-facing contracts, audio and AV runtime boundaries, AI/MCP orchestration, voice contracts, and reusable assets.

eVe is the closed product layer. It owns product UI, private tools, visual composition, panels, Matrix, ribbon, flower, Finder-facing product workflows, Molecule/MTraX product behavior, branding, product stores, and closed runtime composition.

The server and database layers are open infrastructure when they remain product-neutral. They own authenticated event intake, state projection, sync transport, database adapters, user data routes, and operational services. Product-named route families that already exist must be verified before being promoted as stable open contracts.

The core invariant is deterministic, tool-driven, append-only state:

- User, AI, voice, MCP, script, and automation actions converge on the same tool/runtime path.
- Communication contract: all Atome application and business operations use the canonical `/ws/api` WebSocket transport on every supported runtime. HTTP is forbidden as an Atome CRUD, event, state, history, snapshot, restore, authentication, sharing, synchronization, or user-data fallback. Static/bootstrap resources, health/configuration discovery, and explicit file/media/archive byte transfers remain separate HTTP-capable infrastructure concerns and must not mutate or query canonical Atome business state outside `/ws/api`.
- Identity boundary: Fastify ADOLE plus `/ws/api` is the canonical account owner. Principals are immutable CSPRNG UUID v4 values; phone credentials live only in the private `principal_phone_credentials` registry. Active references migrate transactionally to the new principal, while append-only events and snapshots remain byte-for-byte immutable and resolve former actors through protected `principal_identity_aliases` rather than rewritten history.
- Deployment identity boundary: production JWT/cookie secrets and the server signing identity are persistent host configuration, never generated inside the Git checkout. Updates validate and back up this state before dependency or service phases; a failed or mismatched identity is terminal rather than permission to disable fingerprint verification or provision through another route.
- The login choice voice-guidance prompt is a pre-auth UI side effect routed through the existing global voice API only. It does not create a second TTS provider, does not mutate profile state, and does not decide accessibility preferences until a later explicit user choice is implemented.
- Durable mutation flows through `window.Atome.commit` or `window.Atome.commitBatch` on the client boundary.
- Server writes flow through the event commit helpers and database persistence boundary.
- `state_current` is a projection, not the source of truth.
- Snapshots and validation states are acceleration or approval anchors, not an alternate write path.
- Atome envelope normalization and property sanitization are centralized in `atome/shared/atome_contract.js` for server/database boundaries; envelope fields such as id, type, owner, parent, and timestamps must not become durable Atome properties.
- eVe client mutations apply the same property/envelope separation at `eVe/core/atome_commit.js`: raw `props`/`properties`/`patch`/`delta` are collapsed into sanitized `payload.props`, while project, parent, actor, transaction, and gesture ids stay top-level event metadata.
- Selection, lasso focus, SVG layer focus, tool latch state, and editor/session state are transient UI/runtime state unless explicitly modeled as schema-owned Atome properties. They must not be persisted as generic `selected`, `selection`, or DOM-derived properties.
- Media and MTraX creation paths use `kind`, `media_kind`, `media_source`, `media_url`, and schema-owned timeline/poster fields. Legacy render aliases such as `media_type` and `visualType` are adapter read inputs only, not durable write fields.
- Transitional Atome aliases are adapter inputs only. Normalized records must leave boundaries as `{ id, type, kind, renderer, meta, traits, properties }`.
- The shared `AtomGraph` contract in `atome/src/shared/atom_graph.js` derives a disposable structural graph from canonical state rows or append-only event rows. It owns roots, parent-child links, separate visual/semantic/focus ordering, deletion filtering, and graph diagnostics only; it does not own renderer payloads, product UI traversal, accessibility bridge DOM, or durable mutation writes.
- The shared `AccessibleAtomNode` contract in `atome/src/shared/accessible_atom_node.js` defines schema-governed accessibility semantics derived from Atome data: role, label, description, alt text, focusability, visibility, actions, and relations. It is not a DOM/ARIA mirror, native bridge, renderer payload, or product assistant runtime.
- The shared `AccessibilityGraph` contract in `atome/src/shared/accessibility_graph.js` derives a semantic graph from `AtomGraph` and `AccessibleAtomNode`. It owns accessible nodes, reading order, focus order, structural accessibility relations, and inaccessible-node filtering only; it is not the browser/WebView/native bridge and does not read visible DOM state.
- The shared `AccessibilityBridgeProjection` contract in `atome/src/shared/accessibility_bridge_contract.js` is the disposable semantic payload boundary for future browser/WebView/native accessibility bridges. It mirrors AccessibilityGraph data but does not create DOM nodes, ARIA attributes, selectors, renderer state, or product assistant behavior.
- Accessibility ownership is layered and non-overlapping: Atome state/events own durable semantic fields; `AtomGraph` owns structure and visual/semantic/focus ordering; `AccessibleAtomNode` owns node schema normalization; `AccessibilityGraph` owns graph-level accessible order, relations, and filtering; `AccessibilityBridgeProjection` owns disposable cross-runtime projection data; eVe interaction runtimes may consume these contracts but must not store accessible truth in DOM, Bevy ECS, hidden editors, or product panel state.
- User handicap preferences are closed eVe profile preferences under `eve_profile.preferences.accessibility`. The user panel may edit the durable `{ auditory, visual }` preference through the existing profile cache and autosave path, but runtime accessibility graph semantics remain owned by the Atome accessibility contracts above and must not be inferred from DOM controls.
- Core Atome type definitions in `atome/src/shared/core_atome_types.js` populate the existing shared type registry with strict schemas for text, shape, image, video, audio, waveform, group, project, tool instance, and generic `record` Atomes. A record is a `data_model` kind; all registered kinds remain constrained by the universal contract. These definitions do not replace renderer adapters or mutate visible projection behavior.
- The shared `SemanticRename` contract in `atome/src/shared/semantic_rename_contract.js` owns product-neutral rename semantics for all core Atomes. Rename writes use `properties.label`, synchronize `properties.accessibility.label`, require explicit `tx_id` for durable `set` events, and feed AccessibilityGraph labels without reading DOM state.
- Browser-side Adole Atome projection is centralized in `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js`; network/storage aliases may be consumed there but must not become the public record shape returned by framework APIs.
- Adole compatibility methods may keep historical names such as `atomes.create` and `atomes.alter`, but framework writes behind those methods must enter the append-only event pipeline through `adapter.atome.commit` / `adapter.atome.commitBatch`.
- Final Atome DOM is a disposable projection and must expose only `id="eve-atome_<atome_id>"`, CSS classes, necessary style, and visual children. Atome identity, kind, selection, grouping, media renderer state, binding flags, project ownership, replay state, sync state, and action routing facts belong in canonical Atome/runtime/domain registries outside the DOM.
- Browser events such as left click, double click, drag, resize, keyboard routing, flower menu routing, media transport, and MTRAX opening must recover only the `atome_id` from the DOM id and then consult the owning registry/correspondence table to decide behavior.

## Explicit Atome Open / eVe Closed Boundary Contract

The boundary is architectural, not cosmetic:

- Atome is open only for product-neutral contracts, framework runtime, API surfaces, security, sync, server/database infrastructure, AI/MCP orchestration, voice orchestration, audio/AV boundaries, and reusable assets.
- eVe is closed for product experience, product UI, private tools, panel chrome, Matrix/ribbon/flower/Finder workflows, product stores, branding, Molecule/MTraX behavior, and closed composition.
- Server and database are open infrastructure when they do not depend on product UI or product-only workflows.
- Tests may bridge layers to prove integration; source dependencies must still respect the owning layer.

Allowed dependency direction:

- eVe may depend on Atome open contracts.
- Generic system UI controls such as Button, Slider, Input, and Console belong to Atome when the control contract is product-neutral; eVe may compose them for ribbon, projection, flower, footer, toolbox, and panel surfaces but must not keep a parallel control source of truth.
- Atome must not depend on eVe closed implementation details.
- Atome may reach eVe capabilities only through injection, registered tools, runtime globals installed by product bootstrap, or explicit boundary modules with documented ownership.
- Cross-boundary calls must preserve command bus, policy checks, capability validation, audit logging, idempotency, and deterministic history semantics where the operation is effectful.

Forbidden boundary violations:

- Closed product UI, tools, stores, branding, Molecule/MTraX workflows, or panel behavior inside Atome open modules.
- eVe-local clones of open Atome security, sync, database, server, communication, audio, voice, AI, or MCP contracts.
- Direct durable state mutation from UI, panels, stores, imports, scripts, or MCP tools outside the canonical command/history path.
- Promotion of an eVe API, global, visual factory, or store to open framework status without an explicit Atome contract, tests, and synchronized map updates.
- Gesture, resize, and placement code reading canonical Atome geometry from DOM style or DOM offsets instead of described Atome state or an explicit description-derived cache.

Boundary debt:

- Product bootstrap references from Atome into eVe remain documented exceptions requiring targeted verification before structural changes.
- Project media persistence and projection are owned by `eVe/domains/media/api/media_persistence_service.js` and `eVe/domains/media/rendering/project_media_atome_renderer.js`; application examples must not recreate recording-path or media-source ownership.
- Legacy record-video bootstrap files still contain product media atome creation paths; they must preserve owner-scoped recording URLs until that ownership moves behind the shared media persistence boundary.
- Product-named server routes and closed product globals must be reviewed before they are treated as stable open APIs.
- Existing boundary debt is not permission for new cross-layer imports or duplicate service paths.
- Atome HTTP route ownership is split by responsibility: `server/atomeRoutes.orm.js` orchestrates registration and event commit helpers, `server/atomeCrudRoutes.js` owns CRUD handlers, `server/atomeEventRoutes.js` owns event/state/snapshot handlers, `server/atomeRouteContract.js` owns route-boundary formatting, and `server/atomeSyncRuntime.js` owns sync side effects.

## Main Layers

### Atome Open Framework

Primary paths:

- `atome/`
- `atome/src/squirrel/`
- `atome/src/application/audio_runtime/`
- `atome/security/`
- `atome/shared/`

Responsibilities:

- Squirrel framework APIs and product-neutral components.
- Audio, AV, STT, and backend runtime contracts.
- AI, MCP, voice, mail, contacts, calendar, and bank service contracts when product-neutral.
- Security, trusted server metadata, server verification, cloud sync, and sync queue primitives.
- Product-neutral Atome structure contracts such as `AtomGraph`, which may derive graph projections from canonical state/events but must stay independent from eVe UI and renderer-specific scene adapters.
- Generic assets and framework browser shell assets.

Dependency direction:

- Atome may depend on open server/database contracts, product-neutral utilities, and runtime adapters.
- Atome must not import closed eVe product UI, product workflows, private tools, or branding.
- When Atome needs a closed product capability, it must receive it through injection, runtime globals, registered capabilities, or an explicit boundary module.

Canonical extension points:

- `atome/src/squirrel/apis/` for Squirrel APIs.
- `atome/src/squirrel/apis/unified/` for Adole-style data APIs.
- `atome/src/squirrel/ai/` for AI/MCP orchestration.
- `atome/src/squirrel/voice/` for open voice orchestration and semantic contracts.
- `atome/src/squirrel/{mail,contacts,calendar,bank}/` for open communication service facades.
- `atome/src/application/audio_runtime/` for open audio and AV runtime contracts.
- `atome/src/application/audio_runtime/auv3_host_playback.js` for AUv3 host-routed media playback commands; eVe and MTraX consumers import this owner directly instead of mixing AUv3 playback command ownership into backend detection.
- `atome/security/` for product-neutral security and sync primitives.

Must not be duplicated by:

- eVe product-local security, sync, audio, communication, or AI orchestration bypasses.
- Product UI code embedded in Atome modules.
- Parallel service facades that do not reuse the open contracts listed in `maps/API_MAP.md`.

Status: Verified for ownership and major entry points through current maps and targeted source inspection.

### eVe Closed Product

Primary paths:

- `eVe/`
- `eVe/intuition/`
- `eVe/elements/`
- `eVe/domains/`
- `eVe/core/`
- `eVe/voice/`
- `eVe/i18n/`

Responsibilities:

- Product bootstrap and closed composition.
- Product UI shell, panels, tools, matrix, menu, ribbon, flower, projection, and Finder-facing workflows.
- Product design tokens, JavaScript visual factories, panel chrome, and i18n.
- Product stores for events, projects, media, browser, Tauri, and iOS adapters.
- Molecule/MTraX workflow, timeline, media editing, panel, preview, and product media runtime.
- Closed product voice surfaces that consume Atome voice contracts.
- Panel source-of-truth ownership: `eVe/intuition/panel_definitions.js` owns panel surface metadata, `eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js` owns eVeIntuition surface registration/open-close bridging, and `PanelCreatorV2` owns lifecycle execution. Tool runtime and menu surfaces must consume those contracts instead of declaring independent panel routing tables.
- Project media import intent is centralized in `eVe/intuition/runtime/project_media_import_runtime.js`; flower menu import and capture import must consume that runtime and must let `project_drop.importFilesToProjectViaCreator` remain the canonical media upload/project creation path.
- Flower contextual routing is owned by `eVe/intuition/flower/`: project-canvas Atome targeting reads the active project scene through lazy hit testing at menu-open time, active selection compatibility is computed outside the DOM, and mixed-kind multi-selection intentionally exposes only the `info` tool until a complete compatible batch-tool strategy is defined. A completed Flower long press owns bounded terminal-event guards: its native `pointercancel` is stopped before the captured BevyUI root can interpret it as `cancel`, and its derived `contextmenu` plus short compatibility-click window are consumed. Its pointer lock ends synchronously once that terminal event has crossed the earlier Bevy capture listener, so a subsequent press/release on a visible petal can always dispatch `activate`. Any subsequent primary `pointerdown`, including at the release point, is a new user gesture and uses the ordinary Flower close path. The Flower’s full-surface BevyUI root owns blank-space dismissal directly: `press` closes, while `release` stays passive unless the hit-test resolves a visible tool. During the opening animation, each petal’s center-origin hit is also dismissal rather than an invisible activation; only settled visible petals receive their normal activation handler. A genuine right-click is distinguished by its preceding secondary `pointerdown`, so it retains the close contract when Flower is already open and otherwise opens Flower on a valid target. Dashboard exposes its item/label arbitration through `readFlowerTargetAtPoint`, while the global Flower gesture runtime owns both the secondary click and the item hold across every painted card child; the bounded label hold remains reserved for rename. The Flower lock is a single shared contract in `context_pointer_lock.js`: `surface_runtime.js` cancels an active scene drag, while `bevy_ui_runtime.js` discards the pending `release`/`activate` of the control that received the initial primary press. This prevents that underlying control from closing a Flower opened by the same long press. Visible Flower interaction is owned by `eVe/intuition/ribbon/bevy_ui_flower_runtime.js` and `bevy_ui_flower_model.js`; it uses the shared BevyUI tree, captured pointer sessions, and the `flower` workspace layer. `bevy_ui_flower_motion.js` is the only opening/closing choreography owner: one interruption-safe animation-frame loop projects all petal transforms and content opacity through `updateTreeMotion` with a shared straight radial progress. It mounts no temporary procedural record, so the tree contains only actionable petals. The four phases are `closed`, `opening`, `open`, and `closing`; reopening or closing samples the current frame instead of restarting or spawning another loop. `Back` is a submenu-only control, so root pointer movement over the center cannot trigger navigation or close the menu. The retired DOM Flower renderer is not an alternate path.
- Atome contextual editing is owned by `atome_contextual_edit_runtime.js` and `atome_contextual_edit_model.js`. Its registry is project-session runtime state outside Atomes and DOM; several Atomes may remain edited, one is active, and all visible chrome is one BevyUI projection on the shared project canvas. `dashboard_workspace_mode.js` notifies normalized mode changes: Dashboard and transition modes suspend and unmount the contextual projection without erasing its project session, return to the same project remounts it, and activation of another project clears that previous session. The fixed lateral rail, footers, fullscreen and slider expansion must reuse canonical scene gestures, tool definitions and mutation routes; the retired DOM footer lifecycle is not an alternate path.
- Tool latched-state ownership inside eVeIntuition is isolated in `eVe/intuition/runtime/eve_intuition/tool_latched_state_runtime.js`; menu state, panel surface events, and dialog-close synchronization must route through that runtime instead of local event listeners.
- Main menu content ownership stays in `eVe/intuition/eVeIntuition.js`; visible menu membership is product UI composition, while `tool_runtime.js` owns the executable tool ids. The normal visible main menu remains the existing ribbon API while BevyUI is introduced as a renderer foundation for panels and the later menu replacement. The visible sequence remains `home`, `find`, `capture`, `time`, `communicate`, `mode`, and `view`; `ai` remains an inline prompt route but is not exposed in the visible toolbox, `capture` is the product capture palette entry, the `time` palette exposes the calendar panel route without the old visible timeline child, the `mode` palette exposes perform/edit/consume intentions, and the `view` palette exposes list/table/natural view-mode intentions without creating DOM-owned view state.
- Intuition layer ordering is centralized in `eVe/intuition/runtime/layer_contract.js`: project tools, floating project palettes, Molecules, component/docked palettes, panels/dialogs, main ribbon, active drag.
- Palette child projection ownership is centralized in `eVe/intuition/shared/tool_children_projection_state.js`: renderers keep transient child lists in a WeakMap bound to the host element, while durable tool persistence remains in the tool instance store. DOM `data-*` attributes must not carry serialized palette child arrays.
- MTraX diagnostics are runtime-owned: `eVe/intuition/runtime/eve_intuition/mtrax_bridge_runtime.js` owns diagnostic flags and stack capture, while `eVe/intuition/runtime/mtrack_debug_snapshot.js` owns debug snapshot DOM cloning.
- MTraX hidden playback media elements remain detached runtime resources, not model projection nodes. Structured Molecule playback owns no parallel raster-pool or hidden video element: its visual command is projected only through the shared muted Bevy decoder, while the shared media audio executor sends extracted video audio and independent audio to Kira. Upload URLs, local server origins, and `media_user_id` query state therefore remain outside persisted or audited DOM snapshots.
- eVeIntuition app diagnostics are runtime-owned by `eVe/intuition/runtime/eve_intuition/debug_runtime.js`; `eVeIntuition.js` injects footer, media, selection, and Atome footer dependencies but must not own the `window.__DEBUG__` implementation or deterministic test-mode style rules.
- Atome DOM projection identity is centralized in `eVe/core/atome_dom_id.js`. eVe renderers, selection, event, media, and MTRAX runtimes must use this boundary for `eve-atome_<atome_id>` lookup and WeakMap/runtime metadata instead of writing Atome `data-*` attributes into final DOM.
- Runtime facts must not be reintroduced as class names or inline styles. `system.layer` stays in runtime state, selected visual state uses only `is-selected`, media/SVG categories use generic visual classes, and final media/SVG Atome hosts keep inline styles limited to dynamic geometry.
- Project-view and Matrix-tile projection metadata is centralized in `eVe/intuition/matrix/core/project_dom_state.js`. Project-scoped runtimes may derive the project id from `project_view_<id>` or this WeakMap registry, never from `data-project-id`.
- Unified Atome rendering projection is centralized in `eVe/domains/rendering/`: canonical Atome records are normalized into disposable `RenderAtom` values, scenes are hit-tested outside the DOM, project/matrix rendering zones use bounded WebGPU canvas surfaces, and text uses one hidden synchronized service root plus at most one active editor. SVGs remain canonical editable `shape` Atomes, but SVG source/MIME and inline markup normalize to disposable image content and enter the same Bevy RGBA texture path as every other SVG projection; generic shapes never infer image projection from their label alone.
- `bevy_ui_native_event_bridge.js` owns the bounded native BevyUI event queue/drain handoff. Browser and native UI events are dispatched to their existing JavaScript handlers in the same turn when their canonical renderer export has already queued them; polling remains only for renderer-originated later events.
- Project wallpaper/background rendering is also centralized in `eVe/domains/rendering/`. `eVe/user/background.js` owns user preference loading, protected media authorization, stale-profile protection for local background preference updates, and consumption of `eve:profile-preferences-updated` for immediate background projection, but it must remain importable without starting the runtime; `eVe/eVe.js` explicitly calls `startUserBackgroundRuntime()` after `eve.user_background` imports, and a missing shell `#view` is an explicit startup error. Protected background reads select their authorization token from the resolved media owner: local Axum URLs use the local token and absolute Fastify URLs use the cloud token. Generated background parameters are owned by the Background panel modules, generated pixels come from `user_background_pattern_renderer.js`, preference-to-surface dispatch comes from `user_surface_background_texture_runtime.js`, and `bevy_surface_background_runtime.js` forwards a non-Atome surface-background patch to Bevy. Applied-background identity is scoped to the canvas plus its current WASM renderer instance, so renderer replacement on a reused Browser, Tauri, or iOS surface reapplies the latest background while duplicate updates to the same renderer remain suppressed. `surface_background_defaults.js` and the CSS custom property `--eve-default-surface-background` define the shared fallback project background color for the HTML shell and Bevy color-only surface patch; the default solid/no-pattern route must not manufacture a transparent texture. The explicit user wallpaper `download` action delegates remote image retrieval to the Fastify-owned `downloadRemoteWallpaper` upload/protected URL path before projection; local Axum/Tauri uploads must not own that remote-download route. The active project route uses an opaque Bevy canvas and must not depend on the removed `eve_background_visual_layer` DOM image layer.
- Universal Atome format ownership is split across `atome/src/shared/atome_contract.js` for canonical normalization/property sanitation, `atome/src/shared/atome_universal_contract.js` for universal schema defaults/type registry/capability-policy-lifecycle validation, `database/adole_storage_projection.js` for SQL storage row projection, `database/adole_schema_migrations.js` for additive schema migration ownership, and `database/adole_permissions.js` for SQL-backed ACL mutation/check ownership. SQL names such as `atome_id`, `atome_type`, `owner_id`, and `particles` are storage-boundary facts only and must not become a public Atome format or a legacy adapter API.
- Bevy integration is represented in JavaScript by `eVe/domains/rendering/render_atom.js`, `eVe/domains/rendering/virtual_scene_contract.js`, `eVe/domains/rendering/bevy_projection_adapter.js`, `eVe/domains/rendering/bevy_pending_media_contract.js`, `eVe/domains/rendering/bevy_media_texture_resolver.js`, `eVe/domains/rendering/bevy_media_resource_runtime.js`, `eVe/domains/rendering/bevy_web_presentation_runtime.js`, `eVe/domains/rendering/bevy_web_renderer_runtime.js`, `eVe/domains/rendering/bevy_web_applied_scene_runtime.js`, `eVe/domains/rendering/bevy_wasm_diagnostics_runtime.js`, `eVe/domains/rendering/bevy_ui_runtime.js`, `eVe/domains/rendering/bevy_native_renderer_runtime.js`, and `eVe/domains/rendering/project_scene_bevy_projection_runtime.js`; in shared open Atome Rust by `atome/renderers/bevy-core/`; in native Rust by the optional `platforms/desktop-tauri/src/bevy_backend/mod.rs` wrapper, `platforms/desktop-tauri/src/bevy_backend/bridge.rs`, and the iOS C ABI staticlib wrapper in `platforms/ios/bevy-renderer/`; and in browser/WASM Rust by `platforms/web/bevy-renderer/`. Browser Winit ownership is single-shot at both boundaries: JavaScript retains a terminal page/canvas claim after the runner is invoked, and the Rust Web renderer rejects any later start before constructing a second Bevy app or logger. The JavaScript visual contract remains the renderer-agnostic `AtomeRenderNode` tree/diff/dirty-flag source derived from canonical Atome records, while the browser applied-scene baseline records only nodes already accepted by Bevy so skipped texture spawns/updates cannot make a disposable UI/tool image appear present before it is renderable. Bevy render DTOs/ops live in `atome/renderers/bevy-core/src/types.rs`, disposable Bevy ECS components/resources live in `atome/renderers/bevy-core/src/components.rs`, BevyUI tree ops/components/events live in `atome/renderers/bevy-core/src/ui/mod.rs`, and render operations, texture handling, live external-video components, render math, selection overlays, UI diagnostics, and video diagnostics live in Atome, not in platform-specific crates. Browser mode maps projection into the generated WASM renderer and exposes separate UI exports for BevyUI tree ops/events so Squirrel UI can target the same canvas without becoming a second source of truth; browser canvas pointer/mouse/wheel input for BevyUI is normalized by `bevy_ui_runtime.js` against the disposable UI tree and queued into the WASM event drain, preserving `drain_atome_bevy_ui_events()` as the browser BevyUI event surface. Presentation priming retains its four deliberate redraw attempts for first paint, but `bevy_web_presentation_runtime.js` coalesces overlapping sequences for the same canvas and emits one summary diagnostic rather than per-attempt console noise. BevyUI overlay projection is scene-bound: during Dashboard/project workspace transitions, the target project scene is the active overlay destination before old-scene overlay cleanup runs, so the visible main menu is preserved by records rather than by DOM fallback, opacity changes, or visual compensation. Tauri project surfaces use the visible Bevy/WebGPU canvas unless the host explicitly declares a presentable native renderer through `window.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true`; iOS/AUv3 project surfaces dispatch the disposable Bevy scene and render-op contract through the native Swift bridge whenever `window.__ATOME_IOS_NATIVE_INVOKE` is available, while the WebView remains the application shell and host surface. These surfaces are not a full Virtual DOM and never own canonical Atome state.
- Browser surface-background registration is intentionally delayed until after `bevy_web_renderer_runtime.js` stores the canvas runtime state with `started: true`; this keeps wallpaper projection on the existing live Bevy canvas path and avoids a parallel background renderer.
- Browser Bevy/WASM startup resolves generated assets through same-origin `/wasm/...` URLs owned by the current page origin. The project renderer must not fetch `squirrel_bevy_renderer_bg.wasm` through a cross-port generated-module `import.meta.url`, because Safari rejects that CORS path and prevents the canonical Bevy/WebGPU surface from starting. On iOS/AUv3, `AudioSchemeHandler` resolves the path after removing query components but serves the original `atome://` request directly; versioned ES-module and WASM requests must never be redirected because WebKit rejects custom-scheme module redirects before the renderer can request its binary.
- iOS application and AUv3 resource packaging copies the Atome runtime with one filtered `rsync` boundary that excludes Rust `target` trees and `.git` metadata before data enters the product bundle. Packaging must not copy build artifacts first and prune them afterward, because the intermediate bundle can exhaust disk space and cannot represent a deterministic runtime resource set.
- Live project video must not be solved by copying the preview WebGPU renderer or adding a JavaScript side compositor beside Bevy. The direct JavaScript WebGPU probe proved browser `GPUExternalTexture` import/draw support, and `temp/c1_wgpu_external_texture_backend_probe/` proved the same concept through an isolated Bevy `RenderDevice` path. The maintained fork in `atome/renderers/wgpu-web-external-texture/` now provides the missing Web `wgpu` source descriptor, `GPUDevice.importExternalTexture`, and `BindingResource::ExternalTexture` resource mapping for the web renderer Cargo graph. `atome/renderers/bevy-core/src/video_external_texture.rs`, `atome/renderers/bevy-core/src/video_external_web.rs`, and `atome/renderers/bevy-core/assets/shaders/video_external.wgsl` integrate that support into the existing browser/WASM Bevy renderer without a JavaScript side compositor, visible DOM video overlay, live RGBA payload, or duplicate renderer. The external-video route carries the current compositor layer, opacity, color filters, transition parameters, and normalized crop `uv_rect` in the extracted video component and disables automatic batching on video meshes so each `ExternalTexture` bind group remains per-track while z-index ordering, local transform, crop/UV sampling, filters, and transitions stay inside Bevy's sorted 2D phase. Browser hidden-source timeline control is owned by `eVe/domains/rendering/bevy_video_decode_source_runtime.js`, which keeps the `HTMLVideoElement` resources fully transparent (`opacity:0`) and non-authoritative while applying trim, offset, speed, and loop before the frame is sampled; active playback uses `requestVideoFrameCallback` first and falls back to RAF only where RVFC is unavailable. `bevy_web_presentation_runtime.js` coalesces same-tick hidden-video frame notifications before the WASM boundary, and the web renderer applies video-frame redraw requests without adding a second wake after the queued notification already woke the reactive loop. High-frequency external render and video-frame event logging is opt-in in `bevy_perf_diagnostics_runtime.js`; the maintained fluency probe therefore measures the production-default path unless `BEVY_FLUENCY_EXTERNAL_RENDER_EVENTS=1` or `BEVY_FLUENCY_VIDEO_FRAME_EVENTS=1` is explicitly set. `temp/bevy_canvas_fluency_probe.mjs` records maintained JSON metrics plus stable-playback frame windows, project-canvas PNG/DPR evidence for 1/2/4/10 stream scenarios, and repeated 10-stream Google Chrome system acceptance attempts without adding a product renderer; the later focused 10-stream reports validate each expected visible video region in the centered `0.5` visual mapping and show wake pressure reduced from `6433` baseline wake calls to `731` in the opacity-zero hidden decode run. The latest stable-window visual recheck remains visually `ok:true` with 10 detected video regions, zero visible project media DOM nodes, zero readbacks/copies, global frame `p95 18.2 ms`, stable playback after pointer +1500 ms `p95 18.1 ms`, last 6000 ms `p95 18.2 ms`, and zero frames over 24/34/50 ms; `temp/browser_raf_floor_probe.mjs` shows blank RAF floor `p95 18.2-18.3 ms` across system Chrome default, no-Vulkan/Skia, Metal-angle, bundled Chromium, and headless launch variants without eVe, Bevy, or WebGPU scene code. Local transform and crop projection now flow through the standard Virtual Scene node/resource/transform/style operation path; the old direct `AtomeVideoTrack` / `VideoTrack*` mutation API and its WASM exports are deleted and guarded against reintroduction. A crates.io source check found the same upstream implementation gap in `wgpu 29.0.3`, which is the renderer dependency used by `bevy_render 0.19.0-rc.3`; a trunk source check on 2026-06-13 still showed web `create_external_texture` and `BindingResource::ExternalTexture` unimplemented, so a direct Bevy/wgpu version bump was not a compliant completion path at that date. `platforms/web/bevy-renderer/` exposes diagnostics-only `read_atome_bevy_video_backend_capabilities()` schema `atome.bevy.web.video_backend.v7`, reporting target/live backend `gpu_external_texture_texture_external`, Web `wgpu` external-texture create/source/resource support available through the maintained fork, and blocker `none`, without exposing a dead video-track capability. It also exposes diagnostics-only video copy counters from `atome/renderers/bevy-core/src/video_diagnostics.rs` for legacy/copy-pressure measurement, not as the active source-backed live video route. The browser route is delivered under the accepted browser-floor p95 validation, and future work must keep the fluency evidence green without reopening a second renderer path.
- Ephemeral browser camera frames reuse that same Bevy external-texture path. `bevy_video_hidden_dom_runtime.js` owns the one hidden media root contract; `bevy_video_stream_source_runtime.js` binds an existing controller-owned `MediaStream` to an overlay id, takes lookup priority over URL decode, and forwards at most 15 frame notifications per second through the shared Bevy redraw dispatcher. The binding is renderer-derived state only. Its cleanup cancels RVFC and detaches the hidden source without stopping tracks, mutating an Atome, creating a visible media element, or introducing another compositor.
- Renderer adapter registration is now an explicit JavaScript rendering-domain boundary. `eVe/domains/rendering/renderer_adapter_registry.js` owns immutable adapter metadata operations, while `eVe/domains/rendering/bevy_renderer_adapter_registry.js` declares the default Bevy support matrix and kind-specific node/resource mapping callbacks for `shape`, `text`, `image`, `video`, and `audio_waveform`. `bevy_projection_adapter.js` validates kinds through that registry, owns common payload validation/base fields, and delegates kind-specific projection to registered adapters.
- Render-surface sizing is centralized in `eVe/domains/rendering/surface_size_runtime.js` and consumed by `surface_runtime.js`. Host CSS size, raw device-pixel size, DPR, and optional GPU texture clamping are separate from logical Atome geometry; WebView resize must not mutate Atome positions or sizes. On browser/WASM, `surface_runtime.js` keeps the shared canvas CSS size in logical host units and synchronizes the backing-store only to physical dimensions that match the page DPR, while `bevy_web_renderer_runtime.js` forwards `width`, `height`, `pixel_width`, `pixel_height`, and `device_pixel_ratio` to Bevy startup and surface patches. Browser Bevy consumes the browser scale factor instead of forcing one, configures the window at the physical backing size, keeps the camera/projection and Atome records in logical coordinates, converges winit `WindowResized` events through the same shared `apply_surface` path as JavaScript surface patches, and `atome/renderers/bevy-core/` updates the camera projection on `apply_surface`. Scene diffs cross the JS/WASM boundary through `apply_atome_bevy_ops` batches; only direct async/resource/text/surface/background, transform, and opacity-style paths keep unit exports. `bevy_surface_backing_sync.js` keeps immediate backing sync plus strict attribute drift detection and must not reintroduce delayed repair timers that hide an incorrect surface contract. Browser image/SVG textures are rasterized at DPR-bounded physical density by `bevy_media_texture_resolver.js`; text textures keep the same route and may request a higher per-node texture scale through structured text style.
- Active project Atome visual rendering enters `eVe/domains/rendering/project_scene_runtime.js`. `project_scene_record_projection.js` owns project-record normalization and Bevy renderability filtering, `project_scene_record_preservation.js` owns ephemeral preservation gates, and `project_scene_hit_testing.js` owns client-coordinate point/rect queries against the disposable scene. `project_scene_spatial_index.js` owns the runtime-only uniform-grid index derived from the disposable RenderAtom scene; it accelerates canvas hit-testing and lasso queries and must never become Atome state. Project-load ephemeral preservation is limited to non-dashboard overlays unless `window.eveDashboardBevyUiRuntime` is active for the same scene. Dashboard overlays are owned by `dashboard_bevy_ui_runtime.js`, and project visual clearing must diff the previous Virtual Scene against an empty scene before resetting projection state so Bevy receives despawns for old canvas entities. Foreground project rendering must resolve and claim `project_view_<projectId>` when the caller omits `host`; a project scene may not leave the shared `eve_surface_project` canvas attached to `#view` or to another workspace host after activation, reload, import, or switch. Transform-only updates use `project_scene_direct_transform_runtime.js`; `project_scene_incremental_update_runtime.js` owns compatible isolated record diffs for resource/text/style updates without rebuilding the resident scene; structural and ordering changes still use canonical full projection. Dashboard tree fade uses the Bevy UI runtime tree opacity path and keeps runtime records/virtual-scene caches aligned without creating a renderer branch. `surface_runtime.js` supports priority interaction layers ahead of the legacy singleton interceptor so canvas-owned UI overlays can intercept pointer/wheel input before Dashboard/project handlers without replacing them. `tool_genesis.js` may keep bounded project shell creation, but project Atome records must update the project scene and render through the Bevy web runtime instead of the removed `renderProjectAtTime()` / `project_scene_webgpu_adapter.js` legacy path or one visible `eve-atome_*` host with per-Atome interaction bindings.
- The legacy active project renderer family was removed after Bevy became the active project route: `render_at_time.js`, `project_scene_webgpu_adapter.js`, `image_adapter.js`, `video_adapter.js`, `waveform_adapter.js`, `text_adapter.js`, and `project_scene_selection_overlay.js` must not be reintroduced as fallbacks or parallel project renderers.
- Active project selection visuals are rendered inside the same project canvas through Bevy projection diffs. `project_scene_selection_state.js` derives selected ids from the existing selection runtime and `project_scene_runtime.js` marks disposable projection records; the browser Bevy adapter forwards `selected` and dense paint-order layer values in style patches; `atome/shared/render_visual_tokens.js` owns the cross-platform design values; and `atome/renderers/bevy-core/src/selection_overlay.rs` renders the visible dotted light-gray contour and progressively faded 12 px shadow blur as disposable Bevy entities above the selected object but below the next object already in front. No per-Atome DOM outline, host class, selection property, or legacy WebGPU selection overlay is allowed on the cleaned project route.
- Project drag, resize, and text editing are scene intents on the active project path. `surface_runtime.js` owns client-to-logical coordinate conversion before hit-testing so browser/device-pixel canvas scaling does not offset drag, resize, caret, or selection targets, and it handles native `dblclick` separately from `pointerdown` so browser click-count differences cannot block text edit re-entry. `surface_text_pointer_runtime.js` detects text edit re-entry, routes active text pointer sessions, gives active text caret/selection priority over resize except on the bottom-right corner, and marks active text targets from `project_scene_text_edit_state.js` without using DOM state. `surface_pointer_runtime.js` owns homothetic resize target calculation for active project single-selection and multi-selection gestures, deriving one uniform scale from canonical scene bounds before emitting `resize.move` or `resize.end` props; inactive text resize emits a recalculated `text_style.font_size` for crisp Bevy redraws, while active text resize emits only geometry. `project_scene_gesture_runtime.js` coalesces `drag.move` and `resize.move` bursts to animation-frame cadence, updates only disposable project scene records for live feedback, and batches realtime `gesture_frame` events for sharing. Its visual batch targets the resident Web renderer directly or the presentable native renderer through `bevy_native_renderer_runtime.js`; native IPC keeps only the latest transform per entity while a batch is in flight, and full projection waits for the queue before diffing. `inline_edit_session.js` owns the pure InlineEditSession mode contract for session id, project id, atom id, mode, activation source, initial/draft value, focus origin, overlay anchor, `tx_id`, optional gesture id, selection snapshot, and open/committed/cancelled transitions; it rejects DOM-bearing metadata and has no visible UI side effects. `inline_edit_close_overlay.js` owns the pure close-overlay action model for close, Escape, Enter, touch, and accessibility activation; it derives disposable overlay metadata from the session and returns commit/cancel/focus-restoration data without persisting overlay UI as Atomes. `project_scene_text_runtime.js` consumes that contract for active project text editing: it routes hidden keyboard input through `hidden_text_service_runtime.js`, records live draft changes in the active InlineEditSession, exposes that session through project scene text state, projects live multi-line text/cursor/selection feedback into disposable Bevy scene records, applies selected-range `rich_text.spans` formatting for bold and color, maps canvas pointer coordinates back to text indices, and commits clean text, rich spans, measured size, plus session `tx_id` through `text.commit`. `project_scene_invalidation_runtime.js` owns selection, video natural-size, and project-audio progress invalidation listeners, while `project_scene_direct_transform_runtime.js` owns direct Bevy transform patch construction for live gesture feedback and preserves canonical scale/rotation/origin during pointermove without durable commits. `drag.end`, `resize.end`, and `text.commit` persist through `set`/commit via `window.Atome.commit` or `window.Atome.commitBatch`; visible DOM text/edit hosts are not part of the active project route.
- Project range formatting extends that text-edit route without adding a second editor or mutation owner. `project_scene_text_edit_state.js` remembers the latest non-empty style range with its project and Atome ids as bounded session state so a panel-focus transition does not lose the target. Canonical `rich_text.spans` accept `bold`, `color`, `font_family`, and numeric `font_size`; text layout, texture rasterization, caret, and selection geometry use the same per-span metrics before `text.commit` persists the normalized spans.
- Project lasso and click selection on the cleaned canvas route must consult `project_scene_runtime.js` scene hit-testing, not per-Atome DOM hosts. Lasso can start only when the scene hit-test reports empty space, then selected scene Atome ids flow through the existing selection runtime.
- Project-visible media Atomes on the cleaned canvas route may be opened in Molecule from canonical Atome state and `project_scene_runtime` records without requiring a visible Atome DOM host. Recording Atomes must use canonical recording kinds (`audio_recording` / `video_recording`) for project projection even when browser-local recording storage returns an IDB-local id first; audio recordings persist waveform peaks on the Atome so Bevy can draw the waveform after refresh without source re-decoding. Recording Atomes that already exist before final project projection must still be associated to the active project through the canonical commit path before scene rendering, otherwise refresh and project-list reconstruction can diverge. The Molecule timeline payload is derived from Atome properties and remains outside DOM attributes.
- T24 cleanup boundary: legacy DOM renderers, footer chrome, tool docks, and docked MTraX/Molecule UI remain product chrome or non-project presentation domains. They must not become active-project inline-edit owners, accessibility graph owners, focus-restoration stores, or substitutes for `project_scene_runtime` records. Any future dock/footer removal or split must preserve Molecule open behavior through canonical Atome state and explicit MTraX/Molecule APIs, not through `[data-atome-id]` host recovery.
- Active project resize gestures are resolved centrally in `surface_runtime.js` from scene hit-test bounds and logical canvas edge handles, with final resize geometry computed homothetically by `surface_pointer_runtime.js`. The resize edge band includes 5 logical px of additional inward tolerance so near-edge interior pointer starts choose resize before drag or lasso; this tolerance remains runtime hit-testing data and does not alter canonical Atome geometry. Legacy per-host resize listeners remain only for non-project DOM-rendered UI until those owners are separately migrated.
- `eVe/intuition/runtime/project_scene_render_bridge.js` is the extraction point that keeps `tool_genesis.js` from owning project-scene dispatch directly. Further `tool_genesis.js` reductions should move cohesive non-project responsibilities behind similarly explicit owners.
- `eVe/intuition/runtime/tool_genesis_spec_runtime.js`, `tool_genesis_mount_runtime.js`, `tool_genesis_properties_runtime.js`, `tool_genesis_create_runtime.js`, `tool_genesis_record_runtime.js`, `tool_genesis_host_runtime.js`, `tool_genesis_render_state_runtime.js`, `tool_genesis_project_load_runtime.js`, `tool_genesis_realtime_patch_runtime.js`, `tool_genesis_media_runtime.js`, `tool_genesis_group_runtime.js`, `tool_genesis_mutation_runtime.js`, `tool_genesis_projection_support_runtime.js`, `tool_genesis_lifecycle_runtime.js`, `tool_genesis_host_lifecycle_runtime.js`, `tool_genesis_core_services_runtime.js`, `tool_genesis_public_runtime.js`, and `tool_genesis_bootstrap_runtime.js` now own the creation/spec/mount/record/legacy-host/project-load/realtime/media/group/mutation/projection-support/lifecycle/public-bootstrap pipeline behind `tool_genesis.js`: spec presets and sizing, disposable root/layer mount resolution, sanitized property construction, commit -> state refresh -> optional render orchestration, record-to-spec conversion, legacy host creation, render-state reconciliation, project Atome load/filter/Bevy scene dispatch orchestration, realtime projection patching, media helper runtime wiring, group visual wiring, canonical mutation dispatch, projection normalization, project/user/shared-override lifecycle, host registry/index/diagnostic composition, cross-service setup, and public runtime installation. Project scene rendering stays in `project_scene_runtime.js` / `project_scene_render_bridge.js`; `tool_genesis_render_state_runtime.js` must route project parents to that bridge before any legacy host creation, and `tool_genesis_project_load_runtime.js` must render loaded project records through `renderProjectScene()`.
- `eVe/intuition/runtime/atome_description_frame_runtime.js` owns description-frame memory formerly embedded in `tool_genesis.js`, keeping frame lookup separate from Atome host creation.
- `eVe/intuition/runtime/media_integrity_runtime.js` owns legacy non-project media-host integrity registries and repair observers. This keeps media text-patch sanitization and host repair state out of `tool_genesis.js` while preserving the existing non-project media path until that path has its own full scene-render replacement.
- `eVe/intuition/runtime/shape_svg_runtime.js` owns legacy non-project SVG shape projection: SVG shape detection, data-url decoding, protected SVG fetch, mounting, and fetched-markup persistence through the canonical Atome commit API. The active project scene path must keep using RenderAtom/WebGPU instead of this DOM mounting path.
- `eVe/intuition/runtime/group_visual_runtime.js` owns legacy non-project group visual orchestration and runtime-only membership bookkeeping. `eVe/intuition/runtime/group_visual_preview_runtime.js` owns the disposable preview DOM mounted for non-project group hosts only. Neither module may store canonical group state in DOM attributes or render active project group Atomes outside `project_scene_runtime.js`.
- `eVe/intuition/runtime/media_source_runtime.js` owns legacy media source normalization behind `tool_genesis.js`. It classifies upload versus recording sources, resolves bundled assets, normalizes protected API media routes, preserves owner-scoped media query data, and injects local/Tauri credential policy without owning media mounting, hydration side effects, or canonical media state.
- `eVe/intuition/runtime/media_hydration_runtime.js` owns protected media hydration side effects behind the legacy projection path: local availability checks, authenticated fetches, Tauri streaming URLs, blob attachment/revocation, and projection-source updates. It must not own canonical media state, media source classification, or active project scene rendering.
- `eVe/intuition/runtime/media_mount_runtime.js` owns legacy media visual mounting side effects through the Molecule media runtime: media child cleanup, `mountVisual()` dispatch, projection error updates, video poster application, and preview scrub. It must remain projection plumbing and must not replace active project media rendering in `project_scene_runtime.js`.
- `eVe/intuition/runtime/atome_host_registry_runtime.js` owns legacy non-project host projection lifecycle state formerly embedded in `tool_genesis.js`: rendered-host caches, rebinding, rendered checks, host removal, and media resource cleanup. It is not a canonical Atome registry and must not decide active project rendering or durable state ownership.
- `eVe/intuition/runtime/project_atome_index_runtime.js` owns project Atome load/index lifecycle state formerly embedded in `tool_genesis.js`: remembered renderable IDs, project snapshots, in-flight load de-duplication, recent-load cache reads, and scoped cache clearing. It is not durable Atome state and must not replace `project_scene_runtime.js` as the active project rendering owner.
- `eVe/intuition/runtime/tool_genesis_project_view_restore_runtime.js` owns the non-blocking handoff from a completed canonical project load to the already-prefetched project-view restoration. It emits projection diagnostics only, does not own durable view-mode state, and cannot delay `loadProjectAtomes()`.
- `eVe/intuition/runtime/shared_project_override_runtime.js` owns shared Atome project override cache/persistence/fetch/pruning behind `tool_genesis.js`. It may hydrate fetched shared records with the target project id before scene invalidation, but canonical sharing, ownership, and project membership remain outside this bridge.
- Server sharing ownership is split so `server/sharing.js` orchestrates share message workflows, `server/sharingPermissionService.js` owns permission primitives and ACL listing, and `server/sharingAtomeAccessors.js` owns canonical Atome field reads. Sharing code must consume canonical Atome accessors instead of assuming SQL row shapes as Atome records.
- `eVe/intuition/runtime/implicit_gesture_commit_runtime.js` owns implicit gesture commit routing behind `tool_genesis.js`. It translates canonical gesture event batches into tool-gateway actions, marks self patches for realtime dedupe, suppresses duplicate gesture phases briefly, and delegates non-gesture batches to `window.Atome.commitBatch`; durable mutation ownership remains the canonical Atome/tool pipeline.
- `eVe/intuition/runtime/realtime_atome_events_runtime.js` owns legacy realtime binding behind `tool_genesis.js`: event bus listeners, DOM Atome event listeners, realtime update/delete routing, and media textual patch sanitation. `eVe/intuition/runtime/tool_genesis_realtime_patch_runtime.js` owns the paired realtime projection patch applicator for legacy non-project hosts and active project scene records; active project visual updates must enter `project_scene_runtime.js`, while legacy host patching remains disposable projection only. Canonical mutation ordering and durable Atome state remain outside DOM and outside both runtimes.
- `eVe/intuition/runtime/persistence_diag_runtime.js` owns temporary persistence diagnostics and compact record summaries for `tool_genesis.js` load/render tracing. It is observability-only and must not become a persistence policy owner, state source, or rendering decision point.
- Infos no longer consumes legacy host position/resize projection callbacks. Its Bevy surface subscribes to canonical selection and `atome:changed` events; `tool_genesis.js` and host registries must not restore `notifyInfoPanel*` plumbing.
- Legacy project-adjacent tools that restore, share, or replay project Atomes must treat project-visible updates as scene invalidations through `project_scene_runtime.js`. `delete.js`, `communication.js`, and project-scoped timeline replay are not allowed to resurrect `renderAtomeRecord()` as an active project visual path. Infos is inspection/editing UI only and has no project-render assignment path.
- Matrix and Dashboard project preview rendering use `eVe/domains/rendering/project_preview_runtime.js`, which delegates to `matrix_preview_renderer.js` and the shared WebGPU compositor after filtering dashboard/background/wallpaper records. Matrix DOM tile application remains inside `eVe/intuition/matrix/core/preview.js`, while preview capture and canonical persistence (`preview_url`, `preview_width`, `preview_height`, `preview_updated_at` through `Atome.commit`) are reusable renderer responsibilities for Dashboard projects. Browser Dashboard previews use `bevy_project_preview_capture_adapter.js` to keep one hidden `/eve_preview_capture.html` iframe ready from project activation; its isolated document declares the required `#squirrel/`, `#shared/`, and `#utils/` import aliases before loading the capture module. The adapter then fits the complete active-project viewport homothetically inside the DPR-scaled `640x400` maximum output box on one reusable Bevy/WebGPU preview canvas. The capture frame publishes an explicit transparent surface descriptor through `bevy_surface_background_runtime.js`, never the workspace wallpaper or default project colour; only filtered project Atomes contribute pixels, and nearly empty output remains a capture error. Atome content bounds never become capture bounds. Warmup stays non-blocking for project activation, but a failure is observable through the canonical runtime-error ring as `eve:project-preview:warmup` with project/capture details. Default Dashboard boot must consume persisted preview descriptors only and must not force current-project preview hydration or call a project loader before a project-card click; explicit project close resolves the active project through `AdoleAPI.projects`, starts Projects preview hydration before non-critical categories, and capture or persistence failure keeps the last durable preview while surfacing the error. Dashboard card images then pass through the product-neutral image texture path: `render_atom.js` carries disposable `media_fit` / `object_fit`, `bevy_media_texture_image_fit.js` computes contain/cover draw rectangles and rounded alpha clipping, and `bevy_media_texture_resolver.js` rasterizes the fitted texture for Bevy. Active previews must come from current project scene records or merged project-loader records and shared render targets, not live embedded projects in cards, `html2canvas`, SVG `foreignObject`, cloned DOM, DOM screenshots, CSS clipping, per-item canvases, or symbolic DOM scans.

Rubber Band uses the same `/vendor/rubberband-wasm/` asset contract in every browser host. Fastify exposes the package `dist` directory directly; Axum serves it from the bundled `node_modules/rubberband-wasm/dist` resource; iOS copies that directory into `atome_open/vendor/rubberband-wasm` during each target resource build and its custom scheme maps the public path there. The audio stretch runtime therefore has one import-map/module/WASM path, not a platform-local loader or fallback.
- Matrix tile interactions are centralized in `eVe/intuition/matrix/ui/matrix_interaction_runtime.js`. Tile open, menu, create, and label-edit intents must be resolved by one scroll-surface gesture binding and scene hit testing rather than per-project preview/tile listeners.
- The shared render-at-time entry point in `eVe/domains/rendering/webgpu_compositor.js` is the architectural entry for interactive display, previews, animation, and export targets. It must consume the existing WebGPU adapter infrastructure and must not grow separate UI, preview, and export renderers.
- Global visual tiers must use distinct HTML layer nodes under `#intuition`; z-index values alone are not sufficient when tools, Molecules, docked palettes, panels, and drag items coexist.
- Shared product-tool slider ownership now lives in the open Atome/Squirrel component layer at `atome/src/squirrel/components/tool_slider_builder.js`; eVe consumers must use that owner through the shared wrapper/re-export surfaces instead of keeping feature-local slider DOM or gesture logic.
- Background text creation has one geometry owner per phase: `text_creation_session.js` owns the synchronous focusable provisional surface, `ui.text.create` owns the canonical Atome frame written through creation, and `text_fit_runtime.js` owns later content-driven growth without moving the original click coordinate.
- IntuitionX projection tools keep static visual constants class-owned in `eVe/elements/eVe_look.js`; projection runtimes may expose active/hover/kind state through data attributes and may keep slider width inline only while the slider control is dynamically resized.

Dependency direction:

- eVe may consume Atome open contracts.
- eVe may own closed adapters around product workflows.
- eVe must not reimplement generic Atome security, server, sync, persistence, communication, or audio contracts.
- eVe closed APIs must not be promoted to Atome without an explicit open contract, tests, and map updates.

Canonical extension points:

- `eVe/intuition/runtime/` for closed UI/tool runtime surfaces.
- `eVe/intuition/tools/core/` for tool registry, runtime, interaction, and tool definition SSOT.
- `eVe/intuition/tools/` for product tools.
- `eVe/intuition/tools/clipboard/` for shared closed copy/paste state, clipboard payload normalization, system clipboard bridge behavior, and paste event generation behind the copy/paste product tools.
- Project cards do not own a second Flower or clipboard: their `surface_item` context delegates Delete, Duplicate, Copy and Paste to `matrix/core/project_data.js`. Delete removes the card only after the authoritative project-list confirmation; duplicate and paste create a sibling through the existing project-order owner and clone captured content through `executeBootstrapDuplicateOperation`, which remaps internal parent and structural references.
- `eVe/elements/` for product design factories, tokens, and i18n-bound UI construction.
- `eVe/domains/*/api/` for closed domain APIs.
- `eVe/core/*_store/` for closed product store adapters.
- `eVe/domains/mtrax/` and `eVe/intuition/tools/molecule/` for closed Molecule/MTraX workflows.
- Linked audio for dropped video files is owned inside `eVe/domains/mtrax/clips/` and must consume the existing MTraX descriptor media resolver and extraction/conversion path instead of introducing a parallel audio import pipeline.

Must not be duplicated by:

- Atome open product-specific UI.
- New product stores outside the existing store families without a documented ownership reason.
- Panel-local styling or tool behavior that bypasses the shared eVe visual and tool runtime contracts.
- Application example files that bypass the closed Intuition BevyUI registry to replace product menu content or theme.
- Feature-local slider interaction readers keyed only to legacy toolbox/projection class names when the canonical shared slider data-role contract already exists.

Status: Verified for major layer responsibilities through current maps and targeted source inspection.

### Server and Database Infrastructure

Primary paths:

- `server/`
- `database/`

Responsibilities:

- Fastify server bootstrap, auth, routes, WebSocket endpoints, file/user/sharing services, mail gateway, visio, operational logging, and sync.
- Database driver selection and Atome persistence over `atomes`, `particles`, `particles_versions`, `events`, `state_current`, `snapshots`, `permissions`, and `sync_queue`.
- Durable event commit and current-state projection.
- Deferred owner or parent references stored through `_pending_owner_id` or `_pending_parent_id` must resolve both the identity row in `atomes` and the matching `state_current` projection metadata, so runtime current-state reads do not diverge from persistence identity reads.

Dependency direction:

- Server/database may depend on Atome product-neutral shared helpers and open service contracts.
- Server/database must not depend on eVe product UI.
- Product-specific routes or names must be treated as boundary debt until explicitly reviewed.

Canonical extension points:

- `server/atomeRoutes.orm.js` for server-side Atome event commit helpers.
- `database/adole.js` and `database/driver.js` for SQL persistence and database driver concerns.
- `server/wsApiState.js`, `server/wsSend.js`, `server/wsApiIdentity.js`, `server/wsAtomeOperations.js`, and `server/wsSyncSecurity.js` for WebSocket runtime state, identity, operations, and notification authorization.
- Existing route modules for their own families only, with size reduction required before feature growth in oversized files.
- Login pre-auth account lookup and phone verification belong to the existing auth/WebSocket boundary: the eVe login shell first calls `AdoleAPI.auth.lookupPhone(...)` on the active auth backend. A found local account skips OTP and moves directly to password; an explicit `User not found` launches `AdoleAPI.auth.requestPhoneVerification(...)`, then `AdoleAPI.auth.verifyPhoneVerification(...)`, and only after a successful check may it call `AdoleAPI.auth.bootstrap(...)`. Lookup failures other than explicit absence are hard failures and must not request OTP. The OTP secret is a transient auth artifact and must not become Atome state, DOM-owned canonical state, or durable project state. Test/demo mode may project it in the login instruction band. Until a production SMS provider exists, a deployment may explicitly set `SQUIRREL_AUTH_ENROLLMENT_OTP_DISPLAY=1`; only the `enrollment` purpose may then return the generated code through the existing WebSocket response for that same transient projection. Change, removal, and recovery flows never expose it. Fastify binds successful enrollment verification to the active WebSocket connection for five minutes and consumes that proof before creating an unknown principal; direct bootstrap without proof fails closed. The explicit local test launcher `./run.sh --test` may set `SQUIRREL_AUTH_OTP_BYPASS=1`; Fastify and Tauri/Axum may then return `otpBypassed: true` only outside production, after request validation and rate limiting, so the login shell skips the OTP entry step without bypassing password/bootstrap. After local password validation, `user_home_panel_runtime.js` calls the login shell's internal `onAuthenticating` callback before `bootstrap`; after successful `bootstrap`, it calls `onAuthenticated`, closes the login owner, and starts the canonical workspace open asynchronously. Dashboard/project readiness failure is reported separately and must not turn an installed authenticated session into a login loop. These callbacks and stage events are disposable UI acknowledgements only and must not become auth/session authority.
- The login shell owns only a transient visual choreography. Its persistent logo may dock to the Bevy main-menu Atome item during final reveal; the deleted DOM ribbon auth-dock path must not be reintroduced as a second competing post-auth movement.

Must not be duplicated by:

- Direct SQL from UI or product modules.
- Independent persistence code outside database and server commit boundaries.
- HTTP polling or non-WebSocket communication paths for framework communication.

Status: Verified for route families and persistence boundary through `maps/API_MAP.md`, `eVe/documentations/atome_persistence_contract.md`, and targeted search. Oversized server files require reduction before feature growth.

### Tests, Probes, and Temporary Artifacts

Primary paths:

- `tests/`
- colocated `*.test.mjs` files under owning modules
- `temp/`

Responsibilities:

- Persistent tests live under `tests/` or colocated where the project already owns targeted module tests.
- Temporary probes, reports, generated diagnostics, and transient scripts live only under `temp/`.
- Recording boundary coverage is owned by `tests/probes/capture_tool_recording_boundary_probe.test.mjs`, `tests/probes/molecule_audio_capture_adapter.test.mjs`, `tests/probes/molecule_recording_session.test.mjs`, `tests/probes/molecule_recording_runtime.test.mjs`, `tests/probes/audio_browser_recording_flush_contract.test.mjs`, `tests/atome/audio_sample_accurate_recording.test.mjs`, `tests/atome/record_audio_auv3_clock_contract.test.mjs`, `tests/probes/video_recording_stop_contract.test.mjs`, `tests/probes/video_recording_failure_lifecycle.test.mjs`, `tests/probes/native_video_recording_recovery_contract.test.mjs`, `tests/probes/native_video_public_commit_ack_contract.test.mjs`, `tests/probes/filesystem_deletion_transaction_contract.test.mjs`, and `tests/native/recorder_core_frame_contract.cpp`.

Dependency direction:

- Tests may exercise Atome, eVe, server, and database boundaries.
- Temporary probes must not become maintained source or documentation.

Status: Verified by repository tree inspection and existing scripts.

## Runtime Modes

The architecture targets these runtime modes with the same Atome contract, command/history policy, sharing model, and synchronization rules:

- Web browser: Fastify, WebGPU, Kira WASM, Symphonia WASM. The Kira/WASM module may prewarm at boot, but its one output is initialized only through the ephemeral `Squirrel.av.audio.unlockPlayback()` capability invoked by the real user play action; this keeps browser autoplay policy at the platform boundary without adding a second audio engine or mutating Atome state.
- Tauri desktop: local Axum, WebGPU, native Kira, native Symphonia, and feature-gated native Bevy command routing for the main project surface through the shared Atome Bevy core instead of the browser/WASM renderer.
- iOS AiS companion app: AIS server, native SQLite iOS, WebGPU, native Kira, native Symphonia, and a native Bevy command boundary backed by a linked Rust Bevy staticlib; successful Rust scene validation is accepted by the import flow, and the native Metal/Bevy presenter still must be connected before the iOS main project surface can visually render.
- AUv3: AIS server, native SQLite iOS, WebGPU, native Kira, native Symphonia, no blocking or allocation-prone realtime audio work.
- FreeBSD Pure OS: native FreeBSD runtime, Fastify server, auto-launched WebView, native Kira, native Symphonia.

Runtime parity rule:

- A feature shipped in one mode must either keep the same Atome, tool, history, sharing, and sync semantics in all supported modes, or return an explicit typed unsupported-mode error.
- Platform differences belong in adapters, not in duplicated business logic.

Connection rules:

- Tauri UI may initiate to local Axum, then sync outward to Fastify.
- Browser targets Fastify only.
- AiS targets Fastify.
- AUv3 coordinates with the companion app and approved local channels.
- Cloud Fastify must not initiate to client-local Tauri or Axum services.
- Communication must be centralized and WebSocket-based for framework communication.

Status: Derived from `.codex/AGENTS.md` and `eVe/eVe_essentials.md`; specific adapter implementations must be verified before mutation.

## Recording Control and Sample-Clock Boundary

- The visible audio, video, and detail-record controls are BevyUI tool projections, not recorder implementations. Their actions traverse `eVe/intuition/tools/core/tool_runtime_recording_handlers.js` into the registered `capture.js` handlers, then reach the real product controllers in `eVe/domains/media/api/audio_api.js` and `eVe/domains/media/api/video_recording_controller.js`. Latch state reflects controller results; it cannot substitute for start/stop side effects.
- Generic audio and video recording remains available through the existing runtime-specific controllers. A successful generic capture does not imply a sample-accurate overdub guarantee.
- Exact overdub is a narrower typed capability owned by `atome/src/application/audio_runtime/sample_accurate_recording.js`. It is enabled only by the explicit native `requireSampleAccurate` flag and supported only for AUv3 `plugin_input`. Capture uses `clock_id: "auv3.render"` / `clock_reference: "record_start_render_quantum"`; placement uses `timeline_clock_id: "auv3.host_transport"`, with the native `clock_epoch` and `timeline_origin_frame` returned by `record_started`. The `plugin` source remains generic plugin-output/mix capture. Browser, desktop/Tauri, ordinary iOS app, microphone/plugin-output exact capture, and exact video capture return `av_sample_accurate_overdub_unsupported` until they expose a measured common duplex clock or audio-sample PTS mapping.
- Exact timing crosses boundaries only as safe integer frames: host-transport origin/sample rate at start; recording start, real earlier playback start, same-quantum playback observation, frame count, strictly positive `input_latency_frames`, `output_latency_frames`, `roundtrip_latency_frames`, `record_offset_frames_applied`, overrun count, and discontinuity count at stop. The invariants are `playback_start_frame < recording_start_frame`, `playback_observed_frame == recording_start_frame`, `roundtrip_latency_frames == input_latency_frames + output_latency_frames`, and `record_offset_frames_applied == roundtrip_latency_frames`. Timeline placement is `timeline_origin_frame - roundtrip_latency_frames`, with negative placement represented by `source_in_frame`; the playback-start delta is validation evidence and is not applied again. Any mismatch, missing/non-positive latency evidence, overrun, or discontinuity rejects the exact take instead of silently degrading to seconds or wall-clock time.
- Molecule consumes the installed `createMoleculeRecordingCaptureAdapter` from `audio_api.js`; it does not own another audio engine. `eVe/intuition/tools/molecule/recording/index.js` validates the armed track/capability, builds the frame-exact clip, and commits only through the active session. `eVe/intuition/tools/molecule/runtime.js` exposes read/start/stop/cancel and disposes active capture on close. The persisted timeline keeps integer frame fields and recording-clock metadata; seconds are derived projections for existing render/edit consumers.
- Exact capture finalization and clip commit are two explicit phases. Once capture, timing validation, and media-Atome persistence succeed, the Molecule coordinator caches the immutable finalized result. If `session.apply("molecule.clip.add", clip)` fails, state becomes `commit_failed`; a later `stop()` retries only the canonical clip commit with the same media Atome and never stops or persists the backend a second time.
- Generic video recording stays on the existing controllers and owns no visible DOM `<video>`/`<img>` renderer or native preview overlay. During a Flower-initiated capture, `capture_recording_feedback_runtime.js` binds the controller-owned browser/Tauri stream to the initiating stationary Flower petal, samples its bounded 96 x 96 Bevy texture, or polls the latest bounded iOS `AVCaptureVideoDataOutput` frame; the preview inherits the exact Flower radius and never sends an internal stream id through the WebView URL loader. The main menu is not a feedback owner and remains unchanged. The feedback consumer never owns recorder tracks, is capped at 15 fps and is cleared before persistence completion can expose a stale frame. Exact video remains a typed refusal rather than an approximate timing path.
- Audio recording feedback is derived from the same recorded PCM: browser worklet chunks, Tauri's lock-free fixed 64-bin metering snapshot, and iOS/AUv3 fixed native scope buffers publish bounded min/max pairs outside canonical state. `record_audio_scope_transport.js` owns the session-bound latest-frame registry and subscriptions, including early-frame replay, strict sequence rejection, terminal cleanup, and one bounded first-error diagnostic; native events are compatibility notifications rather than the required transport. Tauri's `audio-engine` capability explicitly authorizes `audio_get_scope`. The terminal recorder contract owns `size_bytes`: Rust rejects a zero-byte file after writer shutdown, `audio_record_stop` returns it, and `record_audio_api.js` forwards it to the shared viability gate before persistence. For `web_capture`, Flower begins the recorder before awaiting visual projection so Safari retains the user activation required for microphone and AudioContext startup; Tauri keeps its unchanged native branch. The Bevy menu derives a disposable rolling 64-column history from those real frames. UI polling and changed-history projection are capped at 30 Hz; zero input remains motionless, and the real-time callbacks allocate no scope containers, take no locks, log nothing, and perform no scope disk writes.
- Browser video finalization freezes the terminal MediaRecorder payload, validates non-empty bytes, positive duration, and a video MIME result, then retries persistence/project association with stable recording and upload identities when a durable write fails. Retryable stop or project-association failures retain the controller and capture-tool feedback; only confirmed discard, terminal resource failure, or durable project association clears it.
- Audio capture allocates one `audio_recording_*` project Atome ID before backend start, exposes it in recording state, and reuses it for every stop, retry, persistence, and Molecule association. A different stop-only ID fails with `audio_recording_project_identity_mismatch`. AUv3 `record_error` carries relative/absolute paths, `discarded`, and `discard_error`; an unconfirmed deletion retains the controller and path so physical cleanup can be retried without a second native `recordStop`.
- Native iOS video uses one serialized recovery protocol: `media_video_record_state` discovers active or cached terminal work after WebView reload; `media_video_record_stop` coalesces callers and validates the encoded file; `media_video_record_cancel` physically discards it; and `media_video_record_ack` releases the cached successful terminal result only after the project media Atome is durable. Swift start/stop watchdogs bound missing delegate callbacks, cleanup failures remain recoverable, and a new start is rejected while unacknowledged terminal work exists.
- `WebViewManager.swift` remains the sole shared WebView/native-bridge composition owner. Its script-message, audio/transport, navigation/permission, and IPC responsibilities live in `WebViewManagerScriptMessages.swift`, `WebViewManagerAudioTransport.swift`, `WebViewManagerNavigation.swift`, and `WebViewManagerIPC.swift`; this structural split preserves one invoke and transport boundary rather than introducing parallel bridges.
- Native audio stop first closes producer admission, waits until every in-flight realtime push leaves the producer boundary, marks the producer drained, and lets the writer empty the ring before the final WAV header and frame count are emitted. A timing/protocol failure after file creation is terminal but recoverable through explicit physical deletion; failure to delete remains retryable and cannot be reported as successful discard.

## Canonical Data and Mutation Flow

Durable mutation flow:

```text
Human / AI / Voice / MCP / Script / Automation
  -> tool or runtime capability
  -> command / policy / capability / idempotency checks
  -> window.Atome.commit or window.Atome.commitBatch
  -> server event commit helper
  -> database/adole.js
  -> append-only events and property versions
  -> state_current projection
  -> WebSocket sync and deterministic replay
```

Rules:

- Tools are the canonical mutation entry point.
- Tool execution emits intentions and property-level diffs; history must not depend on re-executing arbitrary tool code to rebuild state.
- Runtime state is derived and rebuildable.
- Event history and property versions are authoritative.
- Molecule session history is timeline-scoped: durable Molecule commands append history events, undo/redo restore deterministic timeline snapshots, and keyboard handling inside a Molecule must not fall through to global Atome selection undo.
- Validation states and snapshots are explicit and immutable anchors.
- Direct UI, panel, import handler, store, or domain mutation of durable Atome state is forbidden.
- Soft-delete is the durable deletion model for canonical Atome history.

Primary sources:

- `todo/ai_voice/history_and_ai.md`
- `eVe/documentations/atome_persistence_contract.md`
- `eVe/eVe_essentials.md`
- `maps/API_MAP.md`

Status: Documented as the target architecture. Individual legacy code paths must be verified during relevant implementation phases.

## UI, Design, and Rendering Separation

UI ownership:

- Atome owns product-neutral Squirrel components and framework shell assets.
- eVe owns product UI, panels, tools, design tokens, JavaScript visual factories, and product styling behavior.

Design source of truth:

- Product design is JavaScript-driven and documented in `maps/DESIGN_MAP.md`.
- Product styling must use structured JavaScript objects, token modules, approved visual factories, and documented CSS variable installation points.
- Static CSS files are framework, vendor, or generated exceptions, not the eVe product design source of truth.

Rendering and identity:

- UI elements must have stable, traceable identity.
- Product UI should route through Squirrel/eVe factories and layer contracts.
- Panel UI must respect the header/body/tools/footer panel contract.
- Panel body remains the scrollable region when the panel contract applies.
- DOM projection attributes must stay limited to short references, renderer hints, roles, and transient interaction flags. Group timelines, group steps, members, media sources, media identifiers, local paths, previews, caches, and serialized Atome state must stay in Atome properties, timeline persistence, media stores, or disposable non-serialized renderer state, never in `data-*` attributes such as `data-media-src` or `data-eve-media-source`.
- Persisted project media Atomes must pass an explicit integrity contract before commit/render: stable source ref, renderable media kind, duration for audio/video, visual ref, and visual status. Generated waveform/thumbnail refs are model properties, not DOM attributes.
- Durable media cache artifacts must be lightweight canonical properties or media-store refs only: SVG source/markup, video poster data URLs or poster refs, and waveform peak arrays or waveform refs. Full RGBA payloads, GPU textures, Bevy `Image` assets, canvas snapshots, decoded media elements, and WebGPU buffers are disposable renderer resources derived from those canonical artifacts and must not be persisted as Atome truth.
- Import and recording restoration coverage must include every maintained audio/video fixture and must validate reconstruction from serialized canonical properties after DOM teardown. Browser media probes can validate playback, but local Node contract tests must continue to guard the persistence boundary without requiring auth or a running server.
- Project DOM teardown tests must include mixed project content: normal Atomes, grouped Atomes, media Atomes, timeline tracks, clips, waveform refs, and thumbnail refs. The pass condition is reconstruction from canonical serialized properties only; stale DOM attributes are never accepted as restoration input.
- Media diagnostics inspect canonical media/runtime state and lightweight projection evidence only. A visible renderer-owned project host is acceptable evidence for imports whose minimal DOM projection intentionally has no native `<img>`, `<video>`, `<audio>`, or inline `<svg>` child.
- Audio/video recording stop flows must create and project a project-visible source Atome through the existing media Atome creation path and active project id. Direct audio/video recording facades that already commit the recording Atome must call the project media renderer after commit; timeline clips remain derived Molecule content and must not replace the canonical project Atome created for the recording.
- Matrix slot state is logical state, not a permanent DOM grid. The Matrix DOM may expose project tiles and the first actionable empty creation tile; repeated empty slots are represented by layout math and CSS grid positioning through `matrix_virtual_slots.js`.
- MTraX timeline ticks are dense renderer output. Interactive loop and marker zones remain
  bounded UI controls, while repeated ruler ticks and labels use the single canonical
  canvas/Bevy rendering route. A missing renderer is an explicit unsupported/error state;
  no DOM tick fallback is retained.
- MTraX close orchestration must complete canonical teardown before the public close API resolves. Close may preserve dormant metadata for desktop restoration, but stale runtime clips, queued prewarm, close-time preview export, and post-commit verification must not block or repopulate a closed panel.
- Mutation ownership is enforced by `scripts/check_mutation_ownership_guardrails.mjs`: `state_current` is a projection read surface outside server route owners, runtime durable writes must enter through the canonical event commit owner rather than ad hoc HTTP calls, timeline replay baselines must never be recovered from DOM projection state before backend apply, and timeline preview/replay code must never produce backend commits from DOM projection reads.
- WebSocket-only transport ownership is enforced by `scripts/check_websocket_only_transport.mjs` through `npm run check:websocket-only-transport`. It rejects maintained HTTP Atome business calls, HTTP remote-control commands, generic WebSocket-to-HTTP tunnels, and unauthenticated `/ws/sync` composition.
- New project Atomes created through `toolBase.createAtome` follow the command sequence `buildCreateAtomeCommand -> validateCreateAtomeCommand -> commitCreateAtome -> refreshCreatedAtomeState -> renderCreatedAtome`. DOM hosts and `renderedAtomes` / `renderedAtomeHosts` are render caches only and are populated after commit; `{ render: false }` keeps creation canonical without dispatching projection events.
- Create uses one canonical context across Natural, List and Matrix: project id, current container from `project_view_navigation.js`/`project_view_insertion_target.js`, presentation mode and scene coordinates. The active Create latch is UI state only. Structured activation creates one canonical draft immediately (`text`, `shape` or `group`) and retains only its id/lifecycle metadata; an empty draft is deleted through the existing BlackHole path. Structured Visual interaction transforms coordinates then emits the existing natural scene intents; it never owns Atome geometry or a mutation path. Natural Draw still delays creation until a real gesture, Page persists as `group`, and Text reuses the sole hidden text editor. The shared container stack survives presentation switches, including Natural, and leaving Page returns to its parent without changing project framing.
- Molecule Visual composition is derived only from canonical member records. The shared record-preview renderer fits each child from its persisted bounds, preserves canonical z order, and feeds the existing WebGPU overlay path; project-view playback state carries identities and records only as disposable projection input. Video members resolve the same Visual overlay ids used by ordinary playback and are started/stopped through the existing Bevy decoder driver.
- The List/Matrix contextual rail reuses the shared Atome footer model. Its Record entry is the existing live action recorder projected as one toggle; audio/video/key capture choices remain owned by the global capture palette and cannot appear as structured-cell children. The V2 gateway explicitly owns `ui.code.editor` registration and delegates to the unique Code editor runtime, including Create-driven `state.off` transitions.
- Shared-canvas pointer ownership is resolved before project background routing: `project_layer_runtime.js` asks the canonical BevyUI runtime whether the pointer hits application chrome, then only an unclaimed point may arm Text or lasso. No DOM proxy or test-only hit surface is involved.
- Event projection invariants are enforced at `database/adole.js`: append-only events update `particles` and `state_current` in one transaction, duplicate event ids do not advance projection version, and reserved envelope fields are stripped from projected properties.
- Durable undo/redo grouping is defined by `database/adole_history_transactions.js`: event rows are sorted deterministically, grouped by `tx_id`, continuous `gesture_start`/`gesture_frame` events stay replay-visible but not undo-visible, `gesture_end` closes an undo-visible transaction, audit/history-control events do not become undo targets, missing `tx_id` values become isolated `event:<id>` transactions, and redo is selected from append-only transactions after a durable cursor rather than client memory.
- State snapshots are restoration accelerators, not superior truth: controlled snapshot restore uses `restoreStateSnapshot` to normalize snapshot records into append-only `set` events before projection; legacy `restoreSnapshot` is contained as a single-atome migration adapter that appends a `set` event through `appendEvent` and must not delete particles or write projections directly.
- The current `state_current` rebuild safely replays the full scoped event stream. Snapshot-accelerated reconstruction is active work and must use a cross-database deterministic event cursor, integrity-checked snapshot state, subsequent-event replay, and equivalence comparison with full replay before atomic projection replacement. Event compaction, archival deletion, or retention-based removal is forbidden until a separate validated policy proves reconstruction, history availability, offline/sync continuity, and recovery safety.
- Time Machine historical branching is an active product requirement, not a current runtime capability. Implementation must wait for explicit validation of a versioned branch model covering identity, divergence, forward recomputation, conflicts, merge, abandonment, permissions, sharing, offline sync, snapshots, APIs, MCP, AI, and Bevy UI presentation. Original event rows remain immutable; branches must be represented through the canonical append-only state/history architecture and must not introduce a parallel source of truth.
- Legacy Squirrel Atome instances may keep `this.element` only as a DOM projection adapter. Canonical Atome business state, media refs, waveform/thumbnail refs, and group timeline/member state must not be stored on HTMLElement properties or serialized model-shaped `data-*` attributes; `scripts/check_squirrel_dom_adapter_guardrails.mjs` enforces that containment boundary.
- MTraX preview render payloads are derived cache data owned by `eVe/domains/mtrax/preview/preview_registry_runtime.js`; timeline DOM projections must reference them through short `data-preview-id` values and must not serialize preview signatures, thumbnail pixels, waveform peaks, local media URLs, or cache payloads.
- `scripts/check_dom_projection_guardrails.mjs` is the persistent validation and audit-report entry point for maintained DOM snapshots and debug captures that need measurable minimal-projection evidence, repeated `data-atome-id` projection context documentation, duplicate-id/root-shape checks, `.dom` subtree rejection of `html/head/body` roots, full-document nested-root checks, local source leak checks, durable media-error attribute checks, repeated Atome model-data duplication checks, named canvas renderer surface checks, and density thresholds for nodes, inline styles, canvas, and video elements.
- `scripts/export_dom_subtrees.mjs` owns offline extraction of matrix, project, timeline, and media-host subtree exports from a captured DOM/HTML file. It writes only under `temp/`; maintained subtree files contain one canonical root per matrix/project/timeline export, media-host exports deduplicate repeated captured projections by `data-atome-id`, and full-app captures are `.snapshot` diagnostics rather than audited `.dom` fixtures.

Status: Verified in `maps/DESIGN_MAP.md`; source modules must be inspected before visual changes.

## API and MCP Separation

API ownership:

- Open APIs live in Atome, server, and database when product-neutral.
- Closed APIs live in eVe when they control product UI, tools, stores, Molecule/MTraX, or branding.
- The exhaustive public, semi-public, and internal API inventory is a separate Phase 2 task; this map defines architectural placement and direction.

MCP/AI ownership:

- Atome owns AI/MCP orchestration, trace stores, provider client boundaries, default tool registration, and MCP protocol runtime.
- eVe owns closed runtime tools and product capabilities exposed through explicit runtime registration and capability checks.

Canonical MCP path:

```text
MCP / AI / Voice
  -> AtomeAI policy, proposal, audit, and idempotency layer
  -> runtime tool resolution
  -> eVe toolRuntimeV2 or open Atome service contract
  -> command / commit path for mutations
```

Rules:

- MCP tools must connect to existing runtime capabilities or open service contracts before direct domain APIs.
- Direct domain API use is allowed only when no runtime V2 surface exists yet and the reason is documented.
- Tools return intentions, not hidden side effects.
- Sensitive operations require policy, capability validation, audit, and confirmation flow where applicable.
- New APIs must be declared and documented in the relevant map and future registry once the registry exists.

Status: Verified at map level through `maps/API_MAP.md`, `todo/ai_voice/eVe_MCP_APIS_Tools.md`, and `eVe/eVe_essentials.md`.

## Storage, Sync, and Communication Separation

Storage:

- Durable Atome persistence belongs to `database/adole.js` and the server commit helpers.
- eVe product stores own closed product state and adapters, but durable Atome writes still route through the canonical commit flow.
- Detached profile, sharing, and sync adapters use the Adole WebSocket event commit surface for Atome mutations. Direct WebSocket `atome.create` / `atome.alter` actions remain legacy protocol edges, not framework mutation owners.
- Raw SQL outside the database layer is forbidden for Atome persistence.

Sync:

- Sync is event-based, append-only, and replayable.
- `/ws/api` is the sole command bus for commits, batches, sharing, directory
  queries, and offline `sync:push`.
- Authenticated `/ws/sync` accepts only `auth`, `register`, `subscribe`,
  `unsubscribe`, `ack`, and `ping`, then transports permission-scoped events and
  ordered replay. Ordinary streams exclude account records and private
  filesystem metadata; `directory.public` carries redacted invalidations only.
- `registered` announces the verified principal's authorized opaque streams;
  `stream-available` and `revoked` update live subscriptions. Each subscribe and
  replay batch is independently reauthorized, so discovery is never permission.
- `wsSyncRuntime.js` serializes control frames in arrival order per WebSocket
  connection. A registration followed by a large subscription burst therefore
  opens at most one replay request at a time for that connection instead of
  exhausting the principal vault socket backlog. A processing rejection is
  contained by closing only that sync connection with
  `sync_processing_failed`; it must never become an unhandled server rejection.
- Offline writes queue in `sync_queue` and submit in order with idempotent event
  ids. LWW is per property using valid timestamp then lexical event id; invalid
  timestamps rank below valid ones. Interactive stale versions reject atomically.
- Fastify is the identity/session/routing/socket orchestrator. A supervised
  private vault process, SQLite database, file root, and IPC socket per principal
  owns cloud business state on macOS/Debian until the provider becomes a FreeBSD
  jail implementation.
- Web uses `SyncEngine`; Tauri and iOS persist inbound envelopes in local SQLite
  before notifying their WebView and ACKing. Home owns the device-local
  Local/Production/Custom selector and Debug sync flag; tokens, queues, streams,
  cursors, and caches are isolated by environment fingerprint and principal.

Communication:

- Framework communication must stay centralized and WebSocket-based.
- HTTP remains a resource and operational boundary only; communication architecture must not add polling, hidden REST fallbacks, or scattered duplicate transports for application operations.
- New login pre-auth OTP communication uses `/ws/api` auth actions only; adding matching REST endpoints would violate the current communication direction.

Status: Verified and guarded for the WebSocket-only application boundary. Product-named route families and unrelated debug surfaces remain separate review areas.

## Code Placement Rules

Place new or changed code according to ownership:

- Product-neutral Squirrel API: `atome/src/squirrel/apis/`.
- Product-neutral communication service: `atome/src/squirrel/{mail,contacts,calendar,bank}/`.
- Product-neutral AI/MCP/voice contract: `atome/src/squirrel/{ai,voice}/`.
- Product-neutral audio or AV runtime: `atome/src/application/audio_runtime/`.
- Product-neutral security or sync primitive: `atome/security/`.
- Server route, WebSocket, auth, or operational infrastructure: `server/`.
- Database adapter or persistence primitive: `database/`.
- eVe product UI, panels, tools, menu, Matrix, ribbon, flower, Finder workflow: `eVe/intuition/`.
- eVe product design tokens or factories: `eVe/elements/` and `eVe/i18n/`.
- eVe product domain workflow: `eVe/domains/`.
- eVe product store or media engine: `eVe/core/`.
- Molecule/MTraX product workflow: `eVe/domains/mtrax/`, `eVe/core/media_engine/`, or `eVe/intuition/tools/molecule/` according to the existing owner.
- Persistent tests: `tests/` or colocated with existing owner tests.
- Temporary probes and transient diagnostics: `temp/`.

Before creating a new file:

- Consult the maps.
- Search for an equivalent or partial owner.
- Reuse, extend, or factorize the existing owner when possible.
- Create a new file only when the responsibility is stable and cannot be cleanly hosted by an existing module.

## Reuse Rules

Reuse first:

- Squirrel APIs for product-neutral framework behavior.
- Adole unified APIs for authenticated data and sync semantics.
- In Tauri, local loopback state/mutation paths are authoritative during bootstrap and media opening; optional Fastify mirrors or secondary state reads must not race through cross-origin loopback HTTP.
- Tauri/WebKit reload restoration keeps the current project as authenticated model state, not DOM state: `squirrel_current_project_v2` is durable only with an owning `userId`, and pre-auth workspace migration is owned by `auth_workspace.js`, which must pass through the guarded local `transferOwner` path before the authenticated user reuses that project or clear the cache when no recoverable source exists.
- Atome security and sync primitives for trust, verification, cloud sync, and queue behavior.
- Communication service facades for mail, contacts, calendar, and bank.
- Atome audio/AV runtime facade for playback, recording, STT, device, codec, and graph behavior.
- eVe tool registry/runtime for product tools.
- eVe panel APIs and design factories for product panels.
- eVe visual tokens and factories for product styling.
- eVe stores for product event, project, media, browser, Tauri, and iOS storage adapters.

Do not create:

- Parallel security checks.
- Parallel sync queues.
- Parallel tool registries.
- Parallel audio engines for the same product path.
- Parallel product design token systems.
- Product-specific open Atome modules.
- Closed eVe clones of open framework services.

## Anti-Duplication Rules

The following are architectural violations unless explicitly documented as a deliberate replacement and completed in the same task:

- Runtime fallbacks, compatibility shims, temporary adapters, hidden proxies, or silent bypasses.
- Direct durable state mutation outside the command/commit path.
- New HTTP polling or REST fallback channels for framework communication.
- Direct SQL for Atome persistence outside `database/`.
- UI mutations that bypass tool/runtime contracts for durable behavior.
- Product CSS or HTML source-of-truth layers outside the documented JavaScript design system.
- New MCP tools that bypass existing runtime tools or service contracts.
- New platform-specific business logic that should be an adapter around shared semantics.

Known duplication or legacy risks:

- Oversized server, database, tool runtime, media, and design files listed in `maps/CODEMAP.md` require reduction ownership before feature growth.
- Product bootstrap references from Atome into eVe remain documented boundary points and require targeted verification before structural changes.
- Product-named server route families such as mail routes require review before becoming stable open API names.
- Molecule/MTraX naming remains transitional and belongs to later execution phases.

Recent rendering/persistence contracts:

- Recording media files live under the user `recordings` storage root, but durable project ownership is the Atome commit/reload contract, not a DOM projection side effect.
- Project-scene WebGPU projection is the render authority. It must reject stale media records with no source before Bevy startup so legacy `audio_recording_*` entries cannot blank the whole canvas.
- A media record whose immediately required image texture input fails decoding is not allowed to reject the full initial Bevy scene; the node is skipped and tracked by the Bevy web runtime while valid nodes render. Uncached source-backed video and waveform media enter the deferred queue with transparent pending material, then receive textures through the same Bevy resource update path; video frame failures and blank transparent/black readbacks are retried with bounded backoff before being skipped so slow Safari/WKWebView readiness cannot empty a video-only project on reload or leave refresh-time videos permanently transparent after the first failed frame read.
- Bevy receives normalized virtual-scene nodes only; layer values may preserve Atome ordering metadata but render depth must remain inside the camera-visible range.

## Maintenance Rules

Before implementation:

- Read the relevant maps.
- Inspect the owning source modules.
- Identify the existing owner, API, helper, visual factory, or runtime capability.
- State whether the change reuses, extends, refactors, or creates code.

During implementation:

- Keep changes inside the owning layer.
- Preserve dependency direction.
- Remove dead, duplicated, deprecated, unreachable, fallback, or temporary code encountered inside touched files.
- Avoid growing oversized files; reduce or split along real ownership boundaries when a touched file violates size rules.
- Keep temporary probes under `temp/`.

After implementation:

- Run the narrowest relevant validation.
- Verify modified file boundaries, line counts, and absence of temporary logs or probes.
- Update `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/DESIGN_MAP.md`, and this file when their covered contracts change.
- Record unclear areas as `Status: To verify` instead of inventing architecture.

## Voice Assistant Pipeline

1. The canonical BevyUI Atome tool emits `press`, `drag`, `release`, and `activate`; the focused hold runtime claims the gesture at 520 ms and suppresses its short activation.
2. `eveAssistantApi` traces the toggle command, installs the project interaction interceptor, and delegates the DOM-free session lifecycle to Squirrel Voice.
3. The local worker converts French text to model phoneme ids and runs the bundled `fr_FR-siwis-medium` ONNX model off the UI/audio render threads. ONNX Runtime Web is MIT; the specified Siwis model card records its training dataset as CC-BY 4.0 and is shipped beside the model for attribution. Creating that worker/session is a post-workspace non-critical warmup owned by `boot_runtime.js`, delayed beyond initial WebGPU/UI stabilization; importing the assistant remains allocation-free so physical iOS devices do not combine the Bevy and ONNX memory peaks.
4. PCM is encoded once for the existing Kira playback authority through an ephemeral transient-asset contract. Twenty-millisecond analysis windows publish only ephemeral TTS frames.
5. eVe coalesces the latest frame into one ephemeral full-workspace assistant record whose layout uniforms preserve the bounded centered shell. The shared compositor capture/blur/presentation path remains unchanged; stretching and directional ejection run inside that full surface, eliminating internal clipping without another renderer or canvas.
6. While active, the assistant interceptor at priority 1100 precedes Dashboard BevyUI at 1000 and owns one ephemeral pointer session outside the main toolbox. Canonical main-toolbox hit-tests are yielded and latched by pointer id through release, allowing short Atome Dashboard toggles, long Atome assistant closure and every other tool while Dashboard cards and project content remain protected. The single assistant record migrates to the current foreground WebGPU scene and stale scene prefixes are removed; there is no dim record. One browser-to-SDF conversion feeds organic contact and ejection, preventing vertical direction drift. Pointer movement only updates organic deformation; destructive classification runs once on `pointerup`. A release inside the shell responds and returns to rest, while a release outside after shell entry ejects along the normalized start-to-release vector. The Atome hold bridge bootstraps the singleton assistant on demand and invokes one toggle: closed opens, active closes. Scene cleanup returns the visual runtime to closed without awaiting native farewell completion, preventing voice latency from blocking a later opening.

The removed `aVa_panel` and main-handle DOM bridge are not architectural fallbacks. Browser `speechSynthesis`, extra canvases, visible assistant DOM, durable audio-frame commits, and renderer-private state are forbidden on this path.

## Current To-Verify Areas

- Exact product bootstrap boundaries still present from Atome browser shell into eVe product startup.
- Server open/closed naming and route ownership for product-named route families.
- Product-named and operational HTTP surfaces outside the canonical Atome application boundary.
- Runtime parity of all modes outside the documented contract.
- Full public, semi-public, and internal API classification, which is the next Phase 2 task.
- Complete MCP registry and automatic discovery system, which remains future architecture work.

## Source References

Primary maps:

- `maps/CODEMAP.md`
- `maps/API_MAP.md`
- `maps/DESIGN_MAP.md`

Primary architecture sources:

- `.codex/AGENTS.md`
- `todo/ai_voice/eVe_MCP_APIS_Tools.md`
- `todo/ai_voice/history_and_ai.md`
- `eVe/eVe_essentials.md`
- `eVe/documentations/atome_persistence_contract.md`
- `atome/documentations/security_architecture.md`
- `atome/documentations/sync_protocol.md`
# Dashboard residency boundary (2026-07-17, authoritative)

The current project scene remains the WebGPU owner across Dashboard toggles. Workspace mode identifies the projection scene with the real project id; `__eve_dashboard_workspace__` is only the no-project scene. The Dashboard runtime owns one resident BevyUI tree per current scene and the shared BevyUI runtime owns suspension. Suspension is projection state, not canonical Atome or DOM state. The same-project return path is forbidden from crossing the project activation/data boundary. A real project change destroys the old Dashboard tree before entering `activateProjectWorkspace()`. The main toolbox is invariant and is neither unmounted nor force-refreshed during a toggle. Existing workspace-mode subscribers suspend contextual editing and video decode work without releasing the last GPU texture.

# Resident overlay hot path (2026-07-18, authoritative)

The shared scene is not a reason to rebuild static Dashboard records when a toolbox palette changes. Closed palette subtrees are absent. Activation uses `project_scene_direct_prefix_runtime.js` to present every opaque palette record atomically at the expansion origin, then `project_scene_direct_motion_runtime.js` moves those resident records through the complete 180 ms expansion, 6–14 px / 70 ms outward overshoot, and exact 120 ms settlement without texture re-resolution or RGBA signature hashing. Prefix and motion share one serialized direct-mutation queue with canonical full rendering. The rAF loop is independent of renderer completion, allows one batch in flight, and replaces any queued sample with the latest position; backpressure therefore cannot produce a trail or replay stale motion. Completion does not trigger another structural render. Dashboard data hydration has no autonomous retry loop, and Dashboard headers own vertical input before any adjacent lane ownership is considered.
# Contact panel migration update — 2026-08-02

- Contact has one visible route: one registered BevyUI tree on the shared
  canvas. Canonical profile and Contacts data remain outside the DOM; expansion,
  selection, rail gesture, one draft, field projection, confirmation, chooser,
  permission notice, and busy state are disposable runtime-only values.
- The runtime separates stable responsibilities: orchestration in
  `bevy_panel_contact_runtime.js`, projection in
  `bevy_panel_contact_view.js`, hidden-text editing in
  `bevy_panel_contact_editing.js`, and fixed effects/actions in
  `bevy_panel_contact_actions.js`. All four consume existing shared builders;
  none owns canonical Contact storage or a parallel renderer.
- Stable explicit identifiers are the sole reconciliation and authority keys.
  The authenticated profile is moved to the first projection position and
  removed from its prior position by exact id only. Local deletability is
  source-based and cannot be inferred from name, phone, email, or visual state.
- One accordion owns each person header and body. Opening another first
  persists the prior draft; failure leaves that accordion and draft intact.
  Checkbox rail gestures are bounded to the shared pointer route, and ordinary
  scroll outside the rail remains owned by the panel scroll area. The rail and
  custom-field add action both consume the existing canonical 30 px icon-button
  surface; choice owns only its semantic glyph geometry.
- Contact actions live in the existing fixed surface above the footer. The
  shared panel tree sizes that surface from its tallest fixed child, including
  the responsive two-line deletion confirmation. The
  shared footer retains close, desktop docking, and mobile float/resize
  ownership. Neither Contact nor the fixed surface creates a second geometry
  owner.
- Interactive source discovery is capability-based. Apple Contacts is a
  read-only import source backed by `CNContactStore`; the native bridge returns
  snapshots and permission state only, while `Squirrel.contacts` remains the
  sole import persistence owner. CardDAV/iCloud stays headless and cannot
  appear through label or provider-name inference.
- The Dashboard Contacts-header long press is an interaction-only bridge into
  this existing surface: it reads Bevy panel open state and calls the registered
  panel open/close API. It cannot load Contacts data, create a contact, or
  invalidate directory state; Contact creation remains owned by `Ajouter`.

# Home panel architecture update — 2026-08-02

- Review status: Contact and Home are product-owner `validated` panels
  (**2/16**). Calendar is technically migrated and awaits native/product-owner
  acceptance before the count changes; Timeline remains final.
- Home has one active product-panel route:
  `tool.main.home` → `ui.home.panel` → session-aware window owner → registered
  Bevy surface `home` → `eve_bevy_panel_home` on the shared project canvas.
  The generic panel bootstrap does not bypass this session owner. Before its
  first window-owner call, Runtime V2 resolves the definition's existing lazy
  `home` module, so direct authenticated or Guest workspace boot cannot race a
  missing `open_home_panel` function.
- Authenticated and Guest sessions compose Home in Bevy. Unauthenticated login
  and registration remain the existing authorized application-shell surface;
  that shell is not a Home fallback, second panel renderer, or state owner.
- Canonical profile/session/preference state remains outside the DOM. Home tree
  state is disposable; durable profile writes cross the existing profile API
  and Atome commit boundary, while auth/security decisions remain in AdoleAPI.
  Secrets are transient and cannot be inferred from display identity or DOM.
- Guest registry persistence is local when no remote account is provisioned.
  `remote_account_not_provisioned` is treated as an access-denied remote write,
  preserving the local canonical tool registry without manufacturing a remote
  account, fallback store, or second persistence path.
- The legacy `eve_user_dialog` route and its panel-only owners are removed. The
  shared shell/footer/docking/drag/resize/scroll and shared component pipeline
  are the sole visible Home composition path.
- Home opts into the shared shell's handedness-edge opening mode. Every open
  resolves bottom/right or bottom/left from canonical handedness; mobile uses
  full available width. Drag and resize remain transient during that opening.
- Blank custom-row drafts remain in disposable Home state until persistence or
  close, so reprojection cannot delete the row created above a list's `+`.
  Dashboard category changes force the existing controller to refilter without
  making geometry the invalidation authority.
- Generic credentials, Mail authentication, and AI provider keys remain
  exclusively in Squirrel's encrypted token vault. Home establishes its
  device-local encryption key internally and never projects a vault-secret or
  unlock interaction. Provider/model metadata may remain in the sanitized
  profile; AI consumers resolve vault credentials asynchronously. Neither the
  Bevy tree nor the DOM owns secrets.
- Preferences delegates Mail, Background, Dashboard, language, and Server to
  their existing owners. Account/security contains remote control, account
  password, logout, and deletion only; it is not an AI-settings owner.

# Shared Bevy panel lifecycle/performance update — 2026-08-03

- The common registry remains limited to permanently declared lightweight
  surfaces. Home, Contact, and the development Panel Lab are imported and
  registered only by their canonical loaders when requested. A closed panel is
  fully unmounted: source/interaction trees, overlay records, handlers, scroll
  and inertia state, caret/timers, hidden editors, render queues, resize
  watchers, drop listeners, and section-owned subscriptions are released.
- Home builds only the opened top-level accordion and opened nested subsection.
  Select options exist only while that Select is open. Profile is the sole
  initial Home data dependency; vault/provider, Mail, Background, Dashboard,
  and Server owners initialize at their owning subsection and release their
  active listeners when it closes. Guests do not initialize private owners.
- `bevy_panel_runtime.js` is the single interaction and geometry owner. Scroll
  is frame-coalesced and patches offsets, descendants, hit-test geometry, and
  the scrollbar; drag translates the mounted record/hit tree; resize previews
  shell/footer/clip geometry and performs one complete reflow on release; text
  editing patches only text, selection, caret, and caret opacity. Each path
  allows one active projection and one latest pending value.
- Structural WebView resize recomputes every open Bevy panel against the top of
  the canonical main-menu reserved band. Horizontal placement is preserved and
  clamped; docked geometry is recomputed; Home projects full-width on mobile
  and restores its saved desktop geometry afterwards. A temporary mobile
  keyboard contraction does not replace that canonical desktop geometry.
- The runtime emits `eve:surface-state` from actual surface lifecycle. The
  Home tool alias family reads that state, so footer close clears its latch and
  the next real tool click opens once. Login/Guest shell synchronization remains
  separate and cannot become connected-Home surface authority.
- `identityMediaFrameNode` is the shared Bevy media target used by editable Home
  identity and Contact identity. Its empty state is a tokenized, unlabeled
  visual frame; click uses the disposable picker service and canvas drop uses
  Bevy hit testing before project import routing. Home and Contact retain their
  existing profile/contact persistence and authorization owners.

# Calendar Bevy architecture update — 2026-08-03

- One path exists: time palette → registered `calendar` panel → lazy `tools/calendar.js` bridge → `calendarSurface` → shared BevyUI/project-canvas compositor.
- Canonical records and mutations remain outside the DOM in CalendarAPI/Atome. Squirrel resolves multi-source reads and owning-source writes. The renderer-neutral projection is derived and bounded; the Bevy runtime owns only disposable view/editor/gesture state.
- The Squirrel primary Calendar source resolves only canonical direct `CalendarAPI` (installed direct global or module) and must never resolve the global Squirrel facade as its own source. Calendar panel project scope follows the active Dashboard data project before the canonical current-project fallback, so panel reload and Dashboard projection read the same Atomes.
- The neutral Dashboard workspace id is renderer scene context only and is rejected as Calendar data scope. Calendar Atome type is trusted mutation-envelope metadata, not a particle; ADOLE list projection must join and restore `atomes.atome_type`, while `kind: event|todo` stays business state. A failed optional `default` calendar ensure is normalized by the built-in source and cannot block event creation.
- Motion previews patch the existing Bevy source/overlay/hit tree; drag and resize emit one Calendar service mutation on release. Text/IME/clipboard reuse the single hidden editor service. Close releases subscriptions, timers, gestures, editors, hit trees, overlay records, and renderer resources through existing lifecycle owners.
- Explicit descendant drag handlers outrank ancestor panel scrolling. Editor-open Calendar composition geometry covers its complete descendant extent, while the shared scroll source remains canonical and unscrolled; deep clipping may not prune visible late-hour descendants or desynchronize their hit tree.
- The legacy DOM/vendor/example route is deleted. No fallback, second renderer, public persistence surface, or platform-specific Calendar UI exists.
- Focused technical contracts pass and Calendar is product-owner validated, so the programme count is 3/16 before Infos review.

# Info panel migration update — 2026-08-04

- `eVe/intuition/tools/infos.js` is compatibility glue only. It registers and
  opens `eve_bevy_panel_info`; it must not recreate a dialog, native control,
  DOM picker, project drop target, polling loop, or local projection updater.
- `bevy_panel_info_runtime.js` owns disposable orchestration only. Canonical
  data comes from `listStateCurrent` / `getStateCurrent`, selection from
  `selection.js`, and edits from one `commitBatch` followed by
  `atome:changed`. Envelope type, parent, project, owner, and timestamps are
  read-only; Infos cannot mutate relationships as arbitrary properties.
- Selection events update derived selected IDs immediately and fetch only
  selected records missing from the current snapshot. Project-list checkboxes
  still delegate to `selection.js`; the DOM never stores selection or drag
  payloads.
- The only clone flow is `project drag_handle` → BevyUI pointer intents →
  `bevy_panel_info_runtime` drop validation → Tool Gateway `ui.duplicate` →
  `tool_runtime_atome_mutation` preflight/remap → one `Atome.commitBatch` →
  existing scene invalidation/compositor. Copies retain type-specific data and
  relative layout; external parents rebase to the current project, and no text,
  HTML, Finder, renderer, or persistence fallback is permitted.
- Product projection is split between the runtime, pure record/hierarchy model,
  hidden text-input owner, and Bevy view. The view reuses shared accordions,
  selection summary, property table, text/number/switch inputs, actions, panel
  chrome, scrolling, and skin tokens. The selectable-list owner absorbs the
  first hierarchical tree-row composition and selection summary accepts the
  panel-owner-provided fluid width.
- Selected-Atome preview reuses `project_preview_runtime.js` and the unified
  WebGPU compositor with a derived, rebased record copy. Preview data is never
  persisted and never becomes canonical Atome state. The visible result stays
  in the existing shared project canvas; no renderer or per-item canvas exists.
- The 3,033-line historical HTML/synchronization implementation is exhaustively
  classified in `todo/ui_bevy/info_html_line_migration_registry.md`. Persistent
  tests enforce line coverage, canonical mutation, DOM-free routing, file-size
  ceilings, lifecycle subscriptions, hierarchy, and shared preview ownership.

# Infos virtual-window and Finder contextual-drop ownership — 2026-08-05

- Each Infos accordion owns one continuous virtual scroll with one
  replace-in-place 200-record window. Closed accordions build no hierarchy;
  crossing a virtual boundary replaces, rather than appends, rendered records.
  Selection snapshots missing from the window are fetched by ID into the
  disposable selection cache only.
- The reusable `bevy_panel_selectable_list.js` layer owns window/spacer math,
  scroll intent and synchronous list-drag arming. It owns no record query or
  mutation and is the required reuse point for Finder and future panel lists.
- Project membership starts from the project-scoped canonical list and excludes
  tool, panel and other system identities at the backend boundary plus a client
  defence. Global Infos applies no type filter. Window-local hierarchy promotes
  an absent parent to a window root, so no canonical record disappears.
- Finder owns only gesture/payload lifetime. `atome_contextual_tool_drop_runtime`
  owns contextual Bevy hit validation and insertion preview; the existing
  footer model resolves Tool Registry compatibility and owns `footer_tools`
  reload/commit. The preview index is derived and never persisted.
- Atome copying remains `ui.duplicate → drag.end → Atome.commitBatch`; contextual
  tool placement changes only the target Atome's ordered tool references. A
  successful duplicate batch performs one forced reload through the existing
  `loadProjectAtomes` owner so newly durable `state_current` rows enter the
  shared project scene immediately; no second creation or rendering path exists.

# Canonical Molecule v2 ownership — 2026-08-12

- `todo/molecule/NewMolecules.md` is the canonical product contract. Historical Marker/Cell and MTraX compatibility requirements are retired; `Section × Track` is derived and has no persistent identity.
- One owner Atome persists one strict `molecule_timeline` schema-v2 snapshot. Ordered Sections, Section-local content/group Tracks, clips, Record regions, transport, tempo, meter, quantization and automation remain internal snapshot data and mutate only through the Molecule session and canonical Atome commit path.
- `eVe/intuition/tools/molecule/kernel/structure.js` owns Section/Track/group/Record-region invariants, including exactly one stable trailing empty content Track per Section. `reducers.js` owns clips, crop and atomic Record-range replacement. There is no v1 reader, converter, alias, shim or fallback.
- `timeline_scene.js` derives an opaque hit-test-occluding Timeline surface, Section offsets, non-draggable Track lanes, clips, previews, crop handles, Record regions, the Section band, the ruler and playhead into ordinary project-scene records. `molecule_timeline_scene_bridge.js` translates clip/crop/Section-boundary drags, Ctrl/Command-wheel zoom, and Alt-double-click split back into timeline operations. The single `#eve_surface_project` Bevy/WebGPU surface remains the only visible renderer.
- Track `gain` and `pan` are canonical schema-v2 fields. Mix projects both through identifiable BevyUI slider ids and `bevyPanel.moleculeMix` skin tokens; transport forwards them to the shared audio engine, whose Web/Tauri Kira and iOS AVAudioEngine paths own actual panning.
- The shared project List derives `Molecule → Section → Track` rows from the owner snapshot without creating Section or Track Atomes. The shared selectable-list owner supplies virtualization and handed mirroring; the time axis always remains left-to-right.
- Derived Molecule selections reuse the existing Atome contextual Bevy rail through its rail-only virtual projection contract. The transient record and tool definitions remain disposable UI state; Info edits still commit through the Molecule session, Delete routes through the canonical `ui.delete.selection` transaction, and selected-Molecule playback resolves sequential/random through the shared project-view runtime while Ensemble remains in the native Molecule transport. No second rail, footer, project-record, or playback authority is created.
- List transport projects ordered open Molecules into one ephemeral Kira sequence. Its per-Molecule offsets arm the existing Record scheduler at natural boundaries; it creates no durable sequence snapshot and no second media engine.
- The obsolete DOM Molecule panel and its orphan footer-tool contract are deleted and may not return.
- The acceptance owner is `scripts/molecule_acceptance_manifest.json` plus the composable `quality:*` package commands. UI/visual coverage stays on the official server and the shared canvas; endurance reuses that same real journey for 30 minutes and records heap, overlay, scene, canvas, transport and Record evidence without a test-only product seam.
- Desktop navigation waits for an actual TCP listener through `platforms/desktop-tauri/src/local_http_navigation.rs` before loading the local URL. The former fixed 250 ms sleep is retired, so native startup readiness belongs to the local HTTP boundary rather than machine timing.

# Canonical Atome/Molecule List architecture — 2026-08-27, authoritative

This section supersedes the earlier statement that the shared List derives visible Molecule, Section, and Track rows. The List now projects only persisted Atomes and Molecules. `parent_id` is the sole membership authority, `hierarchy_order` is the sibling-order authority, and every Molecule reads only its own normalized `playback_mode`; `layer` migrates to `simultaneous` and mode inheritance is forbidden.

The technical Timeline is a derived projection. A versioned idempotent migration converts legacy Clips to Atome occurrences, parallel Tracks to nested simultaneous Molecules, and ordered clips or Sections to sequential Molecules in one canonical batch. Multiple occurrences share the source asset but retain distinct Atome identity and non-destructive source windows.

One recursive compiler maps the canonical tree to an ephemeral transport plan. Sequential nodes concatenate unmuted children, simultaneous nodes align child offsets against one global time, random nodes freeze an order for the current cycle, performance nodes replay persisted action timing, and nested Molecules recursively contribute their compiled duration. One runtime clock publishes global position, duration, active path, active leaves, and local positions; no row owns a timer or transport state.

Visual projection consumes the same snapshot's root record and active leaf records, independently of selection and visible expansion. The surface synchronously resolves Visual before decoder ids are requested; it rebuilds only for a branch/status transition, not position ticks. The existing decoder request registry owns pending active/paused positions until projection or release. Playback advances with bounded drift correction; explicit seek/scrub requests and completed paused seeks update the shared WebGPU frame. Timeline normalization is shared with the media projection contract rather than duplicated in the decoder.

The shared Squirrel selectable-list components remain the UI authority. Footer progress and visible-row local progress are disposable WebGPU/BevyUI projections. Previews reuse canonical media caches and decoders, and editing writes only Atome occurrence properties through the mutation pipeline. Drag/drop uses the canonical Molecule mutation facade and preserves nested envelopes. No DOM proxy, second canvas, renderer fallback, or parallel List state owner is permitted.

Visualizer media remains synchronized but displays no transport head. The
shared preview's progress-visibility option affects only derived render
records, including incremental audio-waveform updates. Video mirror identity
is unchanged. The BevyUI motion owner preserves nested layout offsets when
converting parent-local positions into projected screen-space motion.

# Public account directory architecture — 2026-08-30

- Home profile commits remain canonical Atome events. The server refreshes `directory_public_profiles` after inserted self-profile events and emits redacted `directory.invalidate` events containing only principal, action, and revision.
- `directory.public` stores only resolved display identity plus the candidate photo. Reads apply the `user_face` property privacy rule for the authenticated reader before projection. SQLite startup adds the photo column before directory queries, including legacy databases.
- Contacts, Dashboard, Finder/Comptes, and Communication consume the same `AdoleAPI.directory` population. Contacts adds `Squirrel.contacts` local records and the current canonical Home profile separately; no raw Tauri/Fastify user merge or browser cache participates.

# Home and current Contact profile ownership — 2026-08-30

- Home and the editable current-user Contact card project the same canonical `eve_profile`; Contact has no independent account-profile persistence owner.
- Contact identity edits load the complete profile, overlay the latest confirmed same-user update, replace only identity fields, and commit once through the profile API.
- Home applies confirmed profile events directly and overlays the latest event when opening. It performs neither a stale immediate reload nor a second visibility write.
# Tauri remote identity and directory invalidation — 2026-08-30

- The Tauri outbound sync worker maps `atome_id` from the local principal to the authenticated Fastify principal only for the current user's profile Atome. Other Atome identifiers remain unchanged; the authenticated remote principal remains the event actor. After credential mapping it enqueues deterministic snapshots only for locally authored canonical state (project roots before descendants), so historical projects and media converge without echoing records that originated on Fastify. Local media references remain local in Axum while the outbound projection carries the corresponding Fastify upload URL.
- Remote sync credential configuration enqueues the complete current profile under that remote principal with a deterministic event id. Fastify rebuilds and refreshes `directory.public` from the principal vault, using the authentication database only to enumerate/bootstrap accounts.
- `SyncEngine` connects to the configured Fastify `/ws/sync` endpoint even when Tauri owns local persistence. `squirrel:directory-invalidated` is the single client refresh contract; active Contact, Dashboard Contacts, Finder Contacts, and Communication surfaces subscribe through `public_directory_events.js` and release their listeners with their surface lifecycle.
- Credential Login reopening cancels retained transient WAAPI animations on the surface, bands, instructions, mirrored text, and opening message. The permanent caret blink is not cancelled. A surface generation prevents an earlier final transition from hiding a reopened session.
- Profile persistence resolves the backend and its authenticated principal as one indivisible context. A Fastify session id is never used for a Tauri profile read/write, and a Tauri session id is never used for a Fastify profile read/write; Home reboot reconstruction reads through that same context before normalization.
- Existing split profiles receive one bounded repair: an authorized remote profile carrying a photo and custom identity is copied once, in full, only when the local canonical profile has no photo and still carries the authentication bootstrap identity. These combined migration markers avoid resurrecting an intentionally removed photo; after the commit every read returns to the configured single owner and no merge/cache remains active.
- A valid Tauri session that predates its Fastify identity is repaired through the signed-server `account-provision` contract before `directory.public` is read. The client verifies the RSA-PSS challenge and fingerprint, configures the opaque local/remote mapping, and republishes the current profile; raw registration and OTP bypasses are not used.
- Fastify opens its listener after the mandatory identity migration but before the directory rebuild. Credentialless legacy principals are classified with two set-based SQLite statements, and the persisted directory is reconciled asynchronously with bounded per-principal refreshes. It never empties the live table, preventing both the availability race and a transient disappearance during concurrent logins.
