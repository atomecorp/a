# Framework Cleanup And UI Optimization Plan

Date: 2026-04-19
Status: audit completed, execution phased

## 1. Reality Check

The workspace is large on disk, but most of that size is not active framework source code.

Measured today:

1. Total repository size on disk: about 31.22 GiB.
2. Active source-like files (`.js`, `.mjs`, `.cjs`, `.md`, `.html`, `.css`, excluding mirrored worktrees and build targets): about 13.26 MiB across 764 files.
3. Biggest disk consumers are generated or mirrored paths, not primary source:
   - `src-tauri/target`: about 19.49 GiB
   - `.claude/worktrees`: about 8.29 GiB
   - `src-audio-wasm/target`: about 0.77 GiB
   - `logs`: about 0.22 GiB

Conclusion:

1. A safe 70% to 80% reduction of active framework source code cannot be claimed from this audit alone.
2. A 70%+ reduction of repository disk usage is only realistic if generated targets and registered worktrees are removed.
3. Registered worktrees must not be deleted automatically because they are separate Git worktrees, not disposable cache.

## 2. Safe Cleanup Scope

### 2.1 Immediate safe cleanup candidates

These are ignored or generated paths and can be cleaned without changing framework behavior:

1. `src-tauri/target`
2. `src-audio-wasm/target`
3. `logs`
4. `target`
5. `temp`
6. `tmp`

Expected disk reduction from this safe cleanup alone: about 20.47 GiB.

### 2.2 Manual-review cleanup candidates

These paths may be removable, but only after explicit confirmation:

1. `.claude/worktrees/*`
2. `database_storage`
3. `data`
4. `dist`

Reason:

1. `.claude/worktrees/*` are registered Git worktrees.
2. `database_storage` and `data` may contain runtime or user state.
3. `dist` may still be part of release or CDN workflows.

## 3. Active Source Cleanup Priorities

The largest active files or folders are not obviously dead code. They are central runtime modules or bundled third-party assets.

Priority targets:

1. `src/squirrel/spark.js`
2. `src/application/eVe/intuition/runtime/tool_genesis.js`
3. `src/squirrel/components/matrix_builder.js`
4. `src/squirrel/components/intuition_builder/index.js`
5. `src/squirrel/apis/unified/adole/core.js`

### 3.1 Source cleanup rules

1. Do not delete bundled libraries from `src/js` until import sites are audited.
2. Do not remove tests as a cleanup shortcut.
3. Remove temporary diagnostics only after the bug they serve is closed.
4. Replace duplicated exposure and registration code before attempting behavior changes.

### 3.2 Recommended cleanup phases

Phase 1: structural audit

1. Build an import and usage graph for `src/squirrel`, `src/application/eVe`, and `server`.
2. Classify files as core runtime, optional integration, examples, legacy, or generated output.
3. Produce a delete list backed by references, not guesses.

Phase 2: monolith reduction

1. Split `tool_genesis.js` into frame styling, media hydration, SVG sanitation, and project hydration modules.
2. Split `spark.js` into bootstrap, global exposure, and optional integration loaders.
3. Move example-only code out of hot runtime paths.

Phase 3: duplicate logic removal

1. Remove duplicated global exposure code.
2. Consolidate matrix sizing logic.
3. Consolidate repeated DOM scan helpers.

Phase 4: delete legacy and dead code

1. Remove legacy code only after replacement modules are validated.
2. Remove unused examples and obsolete integration code after usage search confirms no runtime references.

## 4. UI Performance Optimization Plan

### 4.1 Confirmed hotspots

1. `src/squirrel/spark.js`
   - Eager static imports load many subsystems at startup.
   - Immediate DOM cleanup scans run before the app is fully interactive.

2. `src/application/eVe/intuition/runtime/tool_genesis.js`
   - SVG sanitation and namespace scoping use `querySelectorAll('*')` style whole-subtree scans.
   - Hydration and media attach paths call `getBoundingClientRect()` and `ResizeObserver` on many nodes.
   - `loadProjectAtomes()` is monolithic and likely does too much synchronous work per project open.

3. `src/squirrel/components/matrix_builder.js`
   - Grid creation eagerly creates all cells.
   - Resize handling recalculates layout aggressively.

4. Matrix open/create flow

   - Project open currently combines project view restoration, project hydration, filtering, and layout reads in one flow.

### 4.2 Optimization phases

Phase A: startup latency

1. Convert optional subsystems in `spark.js` to lazy imports.
2. Keep only core bootstrap in the initial bundle.
3. Defer non-critical `mail`, `contacts`, `voice panel`, and AI setup until first use.

Phase B: matrix open/create path

1. Instrument `selectProject()`, matrix open, and project creation with stable timing marks.
2. Separate view restoration from atome hydration.
3. Batch DOM insertion using fragments.
4. Delay non-visible media hydration until after first paint.

Phase C: panel opening latency

1. Audit each panel entry point for eager data fetches and full DOM rebuilds.
2. Cache panel shells and reuse them instead of recreating them.
3. Remove repeated `querySelectorAll` scans from open handlers.

Phase D: layout thrash removal

1. Group all reads before writes.
2. Reduce `getBoundingClientRect()` calls inside loops.
3. Prefer cached dimensions where the parent frame is already known.
4. Throttle `ResizeObserver` work and skip observers for hidden nodes.

## 5. Next Execution Order

1. Clean safe generated artifacts only.
2. Add timing instrumentation to startup, matrix open, project creation, and panel opening.
3. Split `tool_genesis.js` by responsibility before deleting anything large.
4. Lazy-load optional subsystems from `spark.js`.
5. Re-measure before any broader deletion pass.
