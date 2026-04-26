# atome — Files to Clean or Remove

> Authoritative cleanup list for the `atome` parent framework.
> Generated 2026-04-26 from a static audit of the codebase + cross-check against `src/application/eVe/eVe_essentials.md` (canonical reference invariants §1.3, §11, §16).
>
> **Scope analyzed:** `src/shared`, `src/squirrel`, `src/tauri-plugin-fs`, `src/utils`, `src/wasm`, `server`, `platforms`, `engines`, `src-tauri`, `tools`.
> **Out of scope:** `src/application/eVe/**` (covered by the previous `Urgent_Files_to_remove.md` already executed).

---

## ⚠️ HEADLINE — TWO MAIN PROBLEMS, ONE EXPLICIT, ONE INVISIBLE

The codebase is **much cleaner than eVe** on naming: no file contains `legacy`, `deprecated`, `obsolete` markers in name or comments; only 5 `TODO/FIXME` exist in the whole scope. **Suspect-name dead code: practically zero.**

But the two architectural violations from `eVe_essentials.md` §1.3 are widespread:

| Problem | Count | Worst offender |
|---|---|---|
| **Silent catches** `catch (_) { }` / `catch () { }` (forbidden by §1.3 "no silent catches, no defensive try/catch that hides errors") | **533 occurrences across 87 files** | `src/squirrel/components/intuition_builder/index.js` (86 silent catches) |
| **Fallbacks** (forbidden except for i18n `eveT`/`ui.label_fallback`) | **86 files** | `src/squirrel/components/intuition_builder/index.js` (61 fallbacks) |

**These two are the real cleanup. Whole-file deletions in §1 below are minor housekeeping.**

---

## 0. Mission & Hard Rules

Same rules as the eVe purge — restated for clarity:

1. **No replacement file.** Delete legacy code in place; let imports fail loudly so callers are forced to migrate.
2. **No fallback** except i18n `eveT(key, fallback)` / `ui.label_fallback`.
3. **No silent catch.** A canonical backend failure must crash loud with a typed error.
4. **Delete one item at a time.** Run the verification protocol (§7) between deletions.
5. **Stop and ask** when in doubt.

---

## 1. Files to Delete Entirely (orphan / temporary)

### 1.1 Confirmed orphans — `apis/unified/v2/` ✅ DONE

| Path | LOC | Status |
|---|---|---|
| `src/squirrel/apis/unified/v2/runtime.js` | 19 | ✅ DELETED (Phase A, 2026-04-26) |
| `src/squirrel/apis/unified/v2/storage.js` | 46 | ✅ DELETED (Phase A, 2026-04-26) |

**Why DELETE:**

- **`v2/runtime.js`** — exports `isTauriRuntime()` and `nowIso()`. `grep -r 'unified/v2/runtime' .` → **zero references** anywhere in the project. Function is duplicated by the canonical `isTauri` in `src/squirrel/apis/serverUrls.js`.
- **`v2/storage.js`** — wrappers around `localStorage.getItem/setItem` with silent catches on every function (`try { … } catch (_) { }`). **Zero references.** Dead even if it were imported because the silent catches turn it into a violation of §1.3.

**Action:** `rm src/squirrel/apis/unified/v2/runtime.js src/squirrel/apis/unified/v2/storage.js` then run §7 verification.

### 1.2 Explicitly temporary probes — `tools/_tmp_*` ✅ DONE

| Path | Date | Status |
|---|---|---|
| `tools/_tmp_ui_block_probe.mjs` | 2026-04-02 (≈3 weeks old) | ✅ DELETED (Phase A, 2026-04-26) |
| `tools/_tmp_webgpu_promote_probe.mjs` | 2026-03-09 (≈7 weeks old) | ✅ DELETED (Phase A, 2026-04-26) |

**Why DELETE:** the `_tmp_` prefix declares the file as scratch. Both are Playwright probes whose output goes to `tools/headless_output/`. If the investigation is still running, the probe should have been promoted to `tools/headless_*.mjs` by now; if it is finished, it should not linger.

**Verification before delete:**
```sh
git log -- tools/_tmp_ui_block_probe.mjs tools/_tmp_webgpu_promote_probe.mjs | head
```
Confirm no recent meaningful commit; then `git rm`.

### 1.3 Optional — `apis/unified/adole.token_clear_legacy.test.mjs`

| Path | Status |
|---|---|
| `src/squirrel/apis/unified/adole.token_clear_legacy.test.mjs` | **CONDITIONAL DELETE** |

**Why CONDITIONAL:** name explicitly contains `legacy`. The test almost certainly validates the migration that copies an old `localStorage` `auth_token` to a new key — same migration that `Urgent_Files_to_remove.md` §2.4 plans to remove from `eVe/core/atome_commit.js`. Delete this test in the **same commit** that removes the migration shim, not before.

---

## 2. §SILENT-CATCH-PURGE — 533 occurrences across 87 files

This is the largest single cleanup item in the codebase. `eVe_essentials.md` §1.3 explicitly forbids:

> *"silent catches, defensive try/catch that hides errors"*

Today there are **533 instances** of `catch (_) { }` / `catch () { }` style swallowing across the scope. Every one of them turns a programming bug or runtime failure into invisible corruption.

### 2.1 Scope

| Folder | Silent catches |
|---|---|
| `src/squirrel` | **375** |
| `server` | **101** |
| `tools` | 45 |
| `src/utils` | 10 |
| `src/wasm` | 2 |
| (others) | 0 |
| **Total** | **533** |

### 2.2 Top 15 offending files

| Rank | File | Silent catches |
|---|---|---|
| 1 | `src/squirrel/components/intuition_builder/index.js` | **86** |
| 2 | `server/server.js` | 52 |
| 3 | `src/squirrel/apis/unified/v2/auth.js` | 35 |
| 4 | `src/squirrel/apis/unified/UnifiedSync.js` | 24 |
| 5 | `src/squirrel/voice/home_surface.js` | 17 |
| 6 | `src/squirrel/atome/mcp.js` | 15 |
| 7 | `src/squirrel/apis/loader.js` | 14 |
| 8 | `src/squirrel/apis/loadServerConfig.js` | 13 |
| 9 | `src/squirrel/components/draggable_builder.js` | 10 |
| 10 | `server/visio.js` | 10 |
| 11 | `server/sharing.js` | 10 |
| 12 | `src/squirrel/voice/orchestrator.js` | 9 |
| 13 | `src/squirrel/apis/svg_utils.js` | 9 |
| 14 | `src/squirrel/voice/service.js` | 8 |
| 15 | `src/squirrel/apis/unified/v2/session.js` | 8 |

**Get the full list:**
```sh
grep -rcE 'catch\s*\(\s*_+\s*\)|catch\s*\(\s*\)' src tools server platforms engines src-tauri \
  --include='*.js' --include='*.mjs' --include='*.cjs' \
  | grep -v '/node_modules/' | grep -v '/target/' \
  | awk -F: '$2>0' | sort -t: -k2 -rn
```

### 2.3 Anti-patterns to recognize and fix

#### Pattern S-A — Empty catch
```js
// VIOLATION
try { riskyOp(); } catch (_) { }
try { riskyOp(); } catch (e) { /* nothing */ }

// CORRECT
const result = riskyOp();   // let it throw; caller handles a typed error
// OR if the failure is genuinely safe to ignore, document why:
try { optionalTelemetry(); }
catch (e) { logger.warn('optionalTelemetry failed', { error: e.message }); }
```

#### Pattern S-B — catch with return-default
```js
// VIOLATION
function getProjectId() {
  try { return canonicalStore.currentProjectId(); }
  catch (_) { return null; }   // turns "store broken" into "no project" silently
}

// CORRECT
function getProjectId() {
  return canonicalStore.currentProjectId(); // throws if store broken — propagate
}
```

#### Pattern S-C — catch as a "feature detection" hack
```js
// VIOLATION
let supportsFeature;
try { supportsFeature = someApi.detect(); }
catch (_) { supportsFeature = false; }

// CORRECT
const supportsFeature = typeof someApi !== 'undefined' && typeof someApi.detect === 'function'
  ? someApi.detect()
  : false;
```

### 2.4 Triage protocol per silent catch

For each occurrence:

1. **Is the failure genuinely optional / opportunistic** (e.g. analytics ping, console probing)? → Replace `catch (_) { }` with `catch (e) { logger.warn(...) }`. Never empty.
2. **Is the failure a programming bug or canonical-store error?** → Remove the try/catch entirely. Let it throw.
3. **Is the catch hiding "feature detection"?** → Replace with explicit `typeof X === '...'` checks.
4. **Is the catch hiding "polyfill / runtime difference"?** → Use a `runtime` capability flag from `src/squirrel/apis/serverUrls.js` (or equivalent), not a try/catch.

### 2.5 Order of attack

Top of the list first, one file per commit:

```sh
# Locate every match in the file
grep -nE 'catch\s*\(\s*_+\s*\)|catch\s*\(\s*\)' src/squirrel/components/intuition_builder/index.js

# Apply §2.4 triage per occurrence.
# Run §7 verification.
# Commit: "cleanup(intuition_builder/index.js): replace 86 silent catches with typed errors / typed warns"
```

---

## 3. §FALLBACK-PURGE — 86 files contain `fallback`

Same rule as eVe: the only permitted `fallback` is `eveT(key, fallback)` / `ui.label_fallback`. Every other occurrence violates §1.3.

### 3.1 Scope

| Folder | Files with `fallback` |
|---|---|
| `src/squirrel` | 60 |
| `tools` | 18 |
| `server` | 6 |
| `src-tauri` | 2 |
| (others) | 0 |
| **Total** | **86** |

### 3.2 Top 15 offending files

| Rank | File | Occurrences |
|---|---|---|
| 1 | `src/squirrel/components/intuition_builder/index.js` | **61** |
| 2 | `src/squirrel/apis/unified/adole/core.js` | 34 |
| 3 | `server/server.js` | 19 |
| 4 | `src/squirrel/components/intuition_builder/pointer.js` | 18 |
| 5 | `src/squirrel/voice/orchestrator.js` | 16 |
| 6 | `src/squirrel/apis/unified/v2/auth.js` | 10 |
| 7 | `tools/headless_eve_ai_mcp_visual_validation.mjs` | 8 |
| 8 | `src/squirrel/mail/runtime_preferences.js` | 8 |
| 9 | `src/squirrel/mail/icloud_connector.js` | 8 |
| 10 | `src/squirrel/ai/model_catalog_registry.js` | 8 |
| 11 | `src/squirrel/voice/service.js` | 7 |
| 12 | `src/squirrel/voice/panel.js` | 7 |
| 13 | `src/squirrel/components/intuition_builder/theme_utils.js` | 7 |
| 14 | `src/squirrel/apis/loadServerConfig.js` | 7 |
| 15 | `src/squirrel/ai/model_catalog_refresh.js` | 7 |

### 3.3 Documented in-codebase architectural fallbacks (must be removed)

Some are explicitly admitted in comments — these are unambiguous violations:

| File | Line | Fallback admitted |
|---|---|---|
| `src/squirrel/apis/unified/adole/core.js` | 910 | *"WS auth failed, trying local HTTP auth fallback"* |
| `src/squirrel/apis/unified/adole/core.js` | 1605 | *"Local HTTP auth fallback for iOS/Tauri embedded server"* |
| `src/squirrel/apis/unified/adole/core.js` | 1887 | *"Step 2: Fallback to localStorage credentials"* |
| `src/squirrel/apis/unified/adole/core.js` | 3384, 3388, 3408 | *"Fallback to HTTP register in browser/Fastify if WS registration fails"*, `fastify_http_register_fallback` |
| `server/server.js` | 761 | *"Fallback to Downloads resolution below"* |

Per `eVe_essentials.md` §15 *"Communication = WebSocket only, centralized single code path. No duplication"*, the WS→HTTP fallback in `adole/core.js` is a **direct architectural violation**. It must be deleted; if WS fails, the system must surface a typed error, not switch transport.

### 3.4 Anti-patterns and triage protocol

Same five patterns and same 7-step triage as `Urgent_Files_to_remove.md` §4.2-§4.3 — re-applied to this scope. Patterns A/B/C/D/E:

- **A** — `?? / ||` default for canonical data → throw typed error instead.
- **B** — `try { canonical } catch { fallback }` → propagate the throw.
- **C** — `if (!modernPath) { legacyPath }` → delete the legacy branch.
- **D** — `fallback` in a variable / function name → rename if canonical, delete if not.
- **E** — `// fallback for X` comments → delete comment AND code under it.

### 3.5 Order of attack

Top file first, one commit per file. Note: the **same top file** (`intuition_builder/index.js`) is also the top silent-catch offender — handle silent catches and fallbacks in the same pass on each file.

---

## 4. God Objects to Split (NOT to delete)

These are not dead code. They are core runtime modules that have grown into monoliths. Splitting them won't reduce LOC, but it will dramatically reduce token cost when reading the codebase and make the §2 / §3 cleanup easier.

| Rank | File | Lines | Suggested split |
|---|---|---|---|
| 1 | `src/squirrel/components/intuition_builder/index.js` | **7,137** | `index.js` (entry only) → `frame.js` / `children.js` / `pointer_glue.js` / `theme_glue.js` (the `pointer.js` and `theme_utils.js` files already exist next to it — they're the start of a split that wasn't finished). |
| 2 | `src/squirrel/apis/unified/adole/core.js` | **6,223** | Adapter creation, WS lifecycle, HTTP fallback (to be DELETED per §3.3), token mgmt, registration flow, request retries — split each into its own file. |
| 3 | `server/server.js` | **4,855** | Bootstrap, route registration, log helpers, recording resolution, downloads — split per concern. |
| 4 | `src-tauri/src/server/mod.rs` | **4,044** | Rust HTTP server. Likely split-able by route group. |
| 5 | `src-tauri/src/server/local_atome.rs` | **3,648** | Rust local atome handlers. Likely split per atome operation. |
| 6 | `src/squirrel/atome/mcp.js` | 2,567 | MCP server adapter — split tool registration, session handling, transport. |
| 7 | `server/auth.js` | 2,265 | Auth handlers — split register/login/refresh/me. |
| 8 | `src/squirrel/voice/tool_router.js` | 2,150 | Voice → tool routing — split STT pre-processing, intent resolution, dispatch. |
| 9 | `src/squirrel/voice/orchestrator.js` | 1,897 | Voice orchestration. |
| 10 | `src/squirrel/apis/unified/UnifiedSync.js` | 1,873 | Sync engine. |

**Action:** schedule a structural refactor pass after §2 and §3 are done. Splitting before purging silent catches and fallbacks would only relocate the violations.

---

## 5. Architecture observations (not deletion targets, but review-worthy)

### 5.1 `src/squirrel/apis/unified/` v1 / v2 split

Today the folder contains two parallel surfaces:

```
unified/
├── UnifiedAtome.js       ← v1 (1 import, only from index.js)
├── UnifiedAuth.js        ← v1 (1 import, only from index.js)
├── UnifiedSync.js        ← v1 (2 imports: index.js + eVe/core/atome_events.js)
├── UnifiedUserData.js    ← v1 (1 import, only from index.js)
├── adole.js              ← canonical adapter (25 imports)
├── adole_apis.js         ← (6 imports)
├── adole/
│   ├── core.js           ← 6,223 lines — actual heavy lifting
│   ├── atomes.js
│   ├── projects.js
│   ├── sharing.js
│   └── debug.js
├── v2/
│   ├── activities.js     ← 697 lines (1 import)
│   ├── atomes.js         ← 713 lines (1 import)
│   ├── auth.js           ← 957 lines (1 import)
│   ├── projects.js       ← 214 lines (1 import)
│   ├── runtime.js        ← 19 lines (0 imports — DELETE per §1.1)
│   ├── session.js        ← 314 lines (1 import)
│   ├── sharing.js        ← 215 lines (1 import)
│   └── storage.js        ← 46 lines (0 imports — DELETE per §1.1)
└── index.js              ← barrel
```

**Recommendation:** confirm whether the `v1` Unified* files are still load-bearing or just barrel-re-exported. If only the barrel imports them, audit whether the barrel itself has external consumers — if not, the entire v1 surface can be removed.

### 5.2 `src/utils/` — runtime modules loaded via HTML script tags

All 8 files in `src/utils/` (`console_silencer.js`, `ios_runtime.js`, `module_loader_runtime.js`, `perf_runtime.js`, `session_ui_cleaner.js`, `spark_bootstrap_runtime.js`, `spark_exposure_runtime.js`, `webview_guards.js`) have **0 ES-module imports** but are **referenced from `src/index.html`** as `<script>` tags. They are NOT orphans — they are runtime bootstrappers. Do not delete.

10 of the 533 silent catches live here. Apply §2 to each.

### 5.3 `src-tauri/vendor/tauri-plugin-stt/`

A vendored Rust plugin (~942 lines in `desktop.rs` plus more). Vendored plugins are usually a sign of either (a) a fork the team maintains, or (b) a not-yet-published crate. Verify which case applies; if (b), publish or move to `Cargo.toml` as a git dependency to drop ~942 lines from this repo's review surface.

### 5.4 `src-tauri/target/`

14 GB of Rust build artifacts. Already noted in the framework cleanup audit (`todos/framework_cleanup_and_ui_optimization_plan_2026-04-19.md`). Add `src-tauri/target/` to `.gitignore` (already there?) and `cargo clean` it before any deep audit. Not a code-cleanup item, but a disk-space item.

### 5.5 `tools/` — 30 `headless_*` probes + 15 `headless_eve_*`

The 15 `headless_eve_*.mjs` probes test the `eVe` submodule from outside. They consume `src/application/eVe/tests/strangler_v2/_env.mjs` (the regression suite kept per `Urgent_Files_to_remove.md` §1.2). Keep all of them; they are CI infrastructure.

---

## 6. What is NOT a problem (audited and cleared)

To save the next reviewer time:

| Pattern | Verdict |
|---|---|
| Files named `*_v1.js` / `*_v2.js` | **None in scope.** Only `apis/unified/v2/` exists, and that is an architectural choice (see §5.1), not a legacy marker. |
| Comments containing `legacy` / `deprecated` / `obsolete` | **0 occurrences** across the whole scope. The codebase is clean on naming. |
| `TODO` / `FIXME` / `XXX` / `HACK` markers | **5 occurrences total** (3 in `server`, 1 in `src/wasm`, 1 in `src-tauri`). Address case-by-case during normal commits. |
| `.tmp` / `.bak` / `.swp` / `~` artifacts | **0 in scope.** OS junk is properly gitignored. |
| Per-domain duplicate filenames (`bootstrap.js`, `service.js`, `connector_contract.js`) in `mail/`, `calendar/`, `bank/`, `contacts/` | **Not duplicates.** This is the per-domain architecture (essentials §13). Each implements its own contract. |
| `lib.rs` files (3) | **Not duplicates.** Each is the entry point of a distinct Rust crate (`src-tauri/src/lib.rs`, `src-tauri/vendor/tauri-plugin-stt/src/lib.rs`, `platforms/web/audio-wasm/src/lib.rs`). |

---

## 7. Verification Protocol — Run After Every Deletion

After deleting any single file or fixing a batch of silent-catches/fallbacks in one file:

1. `node check-syntax.mjs` (repo root) — no syntax errors.
2. `npm test` (or the project's test script).
3. `npm run check:palette-ssot` — the V2 palette SSOT guard.
4. Run any `tools/headless_*.mjs` probe relevant to the touched subsystem.
5. Manual smoke: `npm run dev` (or equivalent), exercise the affected feature.

**If any check fails, fix the root cause.** Do not reintroduce a silent catch or fallback to keep the feature alive — that is exactly what §1.3 forbids.

---

## 8. Recommended Order of Execution

### Phase A — Quick wins ✅ DONE (zero-risk file deletions, ≈70 lines)

1. ✅ **§1.1** — `rm src/squirrel/apis/unified/v2/runtime.js` (19 lines, 0 imports).
2. ✅ **§1.1** — `rm src/squirrel/apis/unified/v2/storage.js` (46 lines, 0 imports, also has silent catches).
3. ✅ **§1.2** — `git rm tools/_tmp_ui_block_probe.mjs tools/_tmp_webgpu_promote_probe.mjs`.

### Phase B — §SILENT-CATCH-PURGE (the real cleanup, 533 occurrences)

For each file in §2.2 top-down, one commit per file:

4. `intuition_builder/index.js` — 86 silent catches (and 61 fallbacks — handle in same pass).
5. `server/server.js` — 52 silent catches (+ 19 fallbacks).
6. `apis/unified/v2/auth.js` — 35 silent catches (+ 10 fallbacks).
7. `apis/unified/UnifiedSync.js` — 24 silent catches.
8. `voice/home_surface.js` — 17 silent catches.
9. `atome/mcp.js` — 15 silent catches.
10. ... continue down the list of 87 files.

### Phase C — §FALLBACK-PURGE (cleanup the rest, ≈86 files)

For files not already cleaned in Phase B (because they had silent catches *and* fallbacks):

11. `apis/unified/adole/core.js` — 34 fallbacks (including the explicit WS→HTTP fallback violations in §3.3).
12. `intuition_builder/pointer.js` — 18 fallbacks.
13. `voice/orchestrator.js` — 16 fallbacks.
14. ... continue down the list.

### Phase D — Conditional / coordinated

15. **§1.3** — `git rm src/squirrel/apis/unified/adole.token_clear_legacy.test.mjs` together with the eVe-side migration shim (`Urgent_Files_to_remove.md` §2.4).

### Phase E — Refactor (separate workstream)

16. **§4** — Split the God Objects, top-down. Schedule as a planned refactor, not as part of the cleanup.

### Phase F — Architecture review (separate workstream)

17. **§5.1** — Decide whether the `Unified*.js` v1 surface can be retired in favor of `unified/v2/`.
18. **§5.3** — Decide whether `tauri-plugin-stt` can be moved out of vendor/.

Each step = its own commit with the `cleanup:` prefix and a one-line summary.

---

## 9. Expected Outcome

When all phases are complete:

- `grep -rcE 'catch\s*\(\s*_+\s*\)|catch\s*\(\s*\)' src tools server …` returns **0** (or only properly-logged warnings).
- `grep -rln 'fallback' src tools server …` only returns matches inside `eveT(...)` and `ui.label_fallback` calls.
- No file in the scope contains the word `legacy` / `deprecated` / `obsolete` in name, content, or comments.
- The framework is fully aligned with `eVe_essentials.md` §1.3 and §15.
- Disk surface (excluding `target/`) is reduced by ≈70 lines + the eVe-side reductions already committed.

---

*Authority: `eVe_essentials.md` §1.3, §11, §15, §16. When in doubt, stop and ask — never patch with a fallback.*

---

## 10. Progress Log

| Date | Phase | Action | Result |
|---|---|---|---|
| 2026-04-26 | A | Deleted 4 orphan/tmp files (`v2/runtime.js`, `v2/storage.js`, `_tmp_ui_block_probe.mjs`, `_tmp_webgpu_promote_probe.mjs`) | ✅ Syntax check passes (1031 files). -116 LOC. |
