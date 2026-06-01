Repair the current eVe regressions introduced during the large code cleanup.

Mandatory instruction before any action:

Read AGENTS.md completely and treat it as absolute authority for every code change, refactor, validation step, and architectural decision.
Apply the strictest applicable rule from AGENTS.md. If any requested action conflicts with it, stop and report the exact conflict instead of silently bypassing it.
Follow these repo constraints during the fix:
JS only.
No HTML or CSS file creation/modification.
No fallbacks, no compatibility shims, no “temporary” bypasses.
No direct DOM-owned business state.
No direct mutation outside the canonical mutation pipeline.
All comments, logs, messages, and documentation in English only.
Git is read-only for this task: no commit, no reset, no checkout, no stash, no branch write operations.
Mission:

Fix these regressions at the root cause, not with isolated patches:

Media import is broken.
Audio and video recordings no longer create an Atome on the current project.
Text entered on the project disappears immediately.
Molecule cannot be opened.
Required architecture constraints:

Canonical truth must stay outside the DOM.
The DOM is projection only and must remain disposable.
Business decisions must not depend on dataset/custom attributes/inline style state.
User-facing mutations must go through window.Atome.commit or window.Atome.commitBatch.
Fix the real owner/control path instead of patching symptoms in view code.
If several regressions share one broken pipeline, unify the fix there instead of patching each symptom separately.
Start from these active code paths first, not from legacy examples unless runtime usage is proven:

Media import and project-visible media creation:
project_drop.js
asset_box.js
tool_genesis.js

Recording to Atome creation:
audio_api.js
video_api.js
record_capture_runtime.js

Molecule open path:
molecule.api.js
molecule.js

Project text edit / commit / projection path:
project_layer_runtime.js
text_edit_runtime.js
text_edit_ui_runtime.js
project_scene_runtime.js

Use these references to avoid redoing prior cartography:

import_and_record_debug.md
import_and_record_debug_progress.md
!molecule_debug.md
API_MAP.md
ARCHITECTURE_MAP.md
CODEMAP.md
Execution requirements:

Reproduce each regression first with the narrowest available probe or targeted runtime validation.
Prefer existing probes first:
media_import_probe.test.mjs
molecule_open_raw_media_request_probe.test.mjs
If text disappearance lacks a focused probe, add one targeted regression test for the touched slice before or alongside the fix.
Do not begin with broad repo exploration. Find the owning control path for each failure and work locally from there.
After the first substantive edit, immediately run the narrowest validation that can falsify the hypothesis.
If the first validation fails, repair the same slice and rerun before widening scope.
Do not edit legacy demo/example files under atome/src/application/examples unless you prove they are on the active eVe runtime path for these regressions.
Required outcomes:

Importing media into a project creates exactly one canonical Atome, with valid media source metadata, correct project ownership, and visible projection.
Stopping an audio or video recording creates exactly one source Atome on the current project instead of only persisting media or only creating a clip.
Text entered on the project survives commit, blur, redraw, and refresh; it must not disappear because of DOM/view-state loss or scene reprojection.
Opening a molecule from a relevant media Atome or MTraX request must create or reuse exactly one valid session/panel, with no ghost session, no duplicate open, and no silent failure.
Final behavior must respect the DOM projection contract from AGENTS.md.
Deliverables:

Implement the fixes.
Add or update focused regression coverage for the repaired slices.
Run the narrowest relevant validations and report exact results.
Summarize the root cause for each regression and identify any shared root cause if one exists.
List residual risks only if they remain after validation.
Important:

Do not patch around missing canonical state with dataset attributes, local DOM caches, or fallback rendering. If import, record, text edit, and molecule open are currently split across conflicting creation paths, consolidate the authority instead of layering another route on top.
