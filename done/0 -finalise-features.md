# Atome / eVe — MVP Functional Completion

> **Archivé le 20 août 2026.** Ce fichier ne conserve que les tâches réellement
> accomplies. Les tâches non accomplies ont été retirées sur décision du
> propriétaire du produit. La numérotation d'origine est conservée pour que les
> renvois de `todo/0-finalise-features_AUDIT_PLAN.md` (§4, §7.1, §15…) résolvent
> encore.

## Objective

Finalize the **functional MVP of Atome/eVe** before starting the dedicated debugging, optimization, cleanup and security phases.

This file contains only the work required to make the essential product features complete and usable.

Priority:

> **Finish the product functionality first. Hardening comes after.**

---

# 1. Repository-first audit

Before changing anything:

1. Search the repository.
2. Identify what already works.
3. Identify partial implementations.
4. Identify disconnected UI controls.
5. Identify placeholders.
6. Locate TODO/FIXME markers.
7. Locate existing object/property definitions.
8. Locate existing tests.
9. Reuse existing implementations before creating new ones.
10. Avoid duplicate systems.

Do not redesign Atome/eVe.
Do not introduce a new frontend framework.
Do not start a large refactor in this phase.

> ✅ Livré — audit complet dans `todo/0-finalise-features_AUDIT_PLAN.md` §A.

---

# 4. Vector drawing tools

Finalize the vector drawing functionality already planned or partially implemented.

Required baseline:

- create vector elements;
- select;
- move;
- resize;
- edit geometry where supported;
- change basic properties;
- delete;
- duplicate where already supported by the editing model;
- undo/redo integration when available globally;
- save;
- reopen;
- preserve editable vector data.

Verify existing UI tools such as, where applicable:

- line;
- rectangle;
- ellipse;
- path;
- polygon;
- shapes;
- vector selection/editing.

Do not build a complete Illustrator-like system. Finish the MVP tools already expected by the product.

> ✅ Livré — `temp/vector_freehand_roundtrip_probe.mjs`, 47 checks.
> `rect` / `ellipse` / `circle` rendus éditables (ils ne l'étaient pas : les
> poignées n'apparaissaient que sur `path, polygon, polyline, line`).

---

# 5. Freehand drawing tools

Finalize freehand drawing.

Required baseline:

- mouse;
- pointer;
- touch;
- stylus;
- continuous stroke creation;
- stroke width;
- basic stroke appearance;
- erase/remove;
- select/edit where supported;
- save;
- reload;
- undo/redo where supported globally.

Complete existing tools such as, where present:

- pencil;
- brush;
- pen;
- eraser.

Do not invent an unrelated second drawing architecture.

> ✅ Livré — mouse/pointer/touch/stylus couverts par construction (Pointer
> Events), trait continu, largeur bornée, persistance `svg_markup`, fusion
> multi-traits.
> `pencil`, `pen`, `eraser` : **Post-MVP — volontairement absents**. Aucun des
> trois n'existe dans `DRAW_MODE_SET` ; les créer serait la seconde architecture
> de dessin que §5 interdit. Le « erase/remove » du baseline passe par l'outil
> `delete` générique.

---

# 6. Crop / cut / visual editing tools

Finalize the visual editing tools related to:

- crop;
- trim;
- mask;
- cut;
- split;

according to the current Atome object/property model.

Required baseline:

- tool can be triggered;
- manipulation is understandable;
- result persists;
- save/reload works;
- undo works where supported globally;
- no silent destructive behavior unless explicitly intended.

> ✅ Livré — mêmes reducers que §7.1/§7.2 (`resizeClip`, `splitClip`), couverts
> par `temp/audio_edit_probe.mjs`.

---

# 7. Audio editing — complete the MVP toolset

Audit all audio editing controls currently visible, partially implemented or planned.

The goal is to complete the basic audio-editing workflow before optimization.

Couche de liaison livrée : `eVe/intuition/tools/audio_edit/` (`context.js`,
`commands.js`, `runtime.js`), palette racine **`sound`** — verbes momentanés,
pas de panneau, pas de modale.

## 7.1 Trim

Finalize:

- trim start;
- trim end;
- visible trim boundaries;
- expected non-destructive behavior;
- correct playback;
- persistence after save/reload.

> ✅ Livré — non-destructif vérifié : `source_in` avance avec le bord au lieu que
> le média soit coupé.

## 7.2 Cut / Split

Finalize:

- split at a chosen position;
- preserve resulting regions where appropriate;
- correct timing;
- correct media references;
- correct object relationships;
- save/reload persistence.

> ✅ Livré — deux régions contiguës, durée totale conservée, **même référence
> média** des deux côtés, fenêtre source découpée et non dupliquée
> (`left.source_out === right.source_in`).

## 7.4 Roll

Finalize the existing/planned audio **roll/repeat** function.

Determine its intended behavior from the current repository and UI.

Expected MVP possibilities:

- select a region/time interval;
- repeat it;
- define repetition interval where supported;
- stay synchronized with the timeline;
- exit/disable roll cleanly.

> ✅ Livré — activation, portée ≥ durée du clip, désactivation laissant le clip
> intact.

## 7.5 Loop

Finalize looping:

- enable/disable;
- loop start;
- loop end;
- visible loop region;
- editable boundaries;
- correct transport behavior;
- persistence;
- correct behavior after reopening.

> ✅ Livré — la boucle fonctionne **sans clip** (c'est du transport, pas du
> clip) ; désactiver conserve la région pour la prochaine activation.

## 7.6 Loop points

Finalize explicit loop points/markers where part of the current design:

- start marker;
- end marker;
- drag/edit;
- snapping where already supported;
- relation with ruler;
- relation with playhead;
- relation with trim boundaries;
- relation with crop boundaries.

Keep clear distinctions between:

- clip boundaries;
- trim boundaries;
- loop boundaries;
- project playback boundaries.

> ✅ Livré — déplacer un marqueur ne déplace pas l'autre ; un marqueur qui
> croiserait l'autre est **refusé plutôt que permuté**.

---

# 8. Audio editing consistency

Verify that all audio editing operations remain coherent with the existing Atome/eVe hierarchy and timeline.

Check:

- media stays linked to the correct object;
- source media is not unexpectedly destroyed;
- playback uses the edited state;
- waveform matches the effective region;
- timeline position stays correct;
- undo/redo behaves coherently where supported;
- save/reload preserves edits;
- reopening the project reproduces the same state;
- edits remain compatible with the Atome object/property model.

Do not optimize DSP performance yet unless a minimal fix is required to make the functionality work.

> ✅ Livré — chaque édition durable est journalisée, undo/redo rétablit le nombre
> de clips, la référence média survit à toute la chaîne.

---

# 14. Respect the existing eVe design

Do not redesign the global interface.

Respect:

- minimal visual language;
- direct interaction;
- low visual clutter;
- contextual controls;
- consistent toolbox behavior;
- no unnecessary permanent panels;
- no unnecessary modal dialogs;
- existing navigation;
- established object hierarchy.

Any new UI must look and behave as a native extension of eVe.

> ✅ Respecté — aucune modale, aucun panneau permanent ajouté ; les nouveaux
> verbes audio sont des entrées de menu momentanées, à l'image de
> `draw_freehand` / `draw_rectangle`.

---

# 15. Functional audit of the toolbox

After completing the items above, audit every visible toolbox entry.

For each tool:

1. Trigger it.
2. Confirm that a meaningful action occurs.
3. Complete the interaction.
4. Manipulate the result.
5. Save.
6. Reopen.
7. Confirm persistence.
8. Confirm the application remains usable.

Final report table:

| Tool | Status before | Action taken | Status after | Remaining issue |
|---|---|---|---|---|
| 35 entrées (home, find, capture+7, time+2, communicate, mode+3, view+3, create) | complet | aucune | complet | — |
| `import` → `audio` | déconnecté (résolvait vers la capture `ui.capture.audio` : « import > audio » déclenchait un enregistrement) | `children` supprimés | complet | — |
| `import` → `modules` | placeholder mort (clé absente de la SSOT → entrée synthétique sans `tool_id` ni handler) | `children` supprimés | supprimé | — |
| `import` → `projects` | placeholder mort (idem) | `children` supprimés | supprimé | — |
| `load`, `save` | placeholder | marqués Post-MVP + refs pendantes retirées | Post-MVP — volontairement inertes | — |

No essential MVP control should remain an unexplained dead button.

An intentionally postponed non-MVP tool should be explicitly marked:

> Post-MVP — intentionally disabled/hidden

> ✅ Livré — script rejouable `temp/toolbox_visible_audit.mjs`, rapport
> `todo/audits/toolbox_visible_audit_2026-08-15.md`. Toutes les entrées visibles
> ont au moins une des quatre routes de réponse ; **0 référence d'enfant
> pendante** dans la SSOT. Le script sort en erreur si l'un des deux repasse au
> rouge.

---

# 16. Validation scenarios

Run at least:

## Vector
- create;
- edit;
- move;
- resize;
- save;
- reopen.

## Freehand
- draw;
- erase/edit;
- save;
- reopen.

## Crop/Cut
- create/import media;
- edit;
- save;
- reopen.

## Audio Trim
- import audio;
- trim;
- play;
- save;
- reopen.

## Audio Split
- split;
- manipulate both regions;
- play;
- save;
- reopen.

## Roll
- configure;
- play;
- stop;
- restart;
- verify state.

## Loop
- set start/end;
- enable;
- play across the boundary;
- edit points;
- save/reopen.

> ✅ Livré — runner `temp/run_all_probes.sh`, exit 0 seulement si tout passe.
>
> ```
> contextual_rail_views_probe.mjs      OK   (rouge d'abord : 13 échecs)
> audio_edit_probe.mjs                 OK   106 checks
> vector_freehand_roundtrip_probe.mjs  OK    47 checks
> toolbox_visible_audit.mjs            OK    28 entrées visibles, 28 saines
> check:component-reuse-guardrails     ok   (4 rules)
> check:no-fallbacks                   ok   (39 fichiers)
> ```

---

# 16bis. Exigence ajoutée le 17 août 2026 — livrée

Le menu contextuel latéral est **ouvert et alimenté** en modes liste et matrice —
le niveau courant par défaut, l'élément dès qu'il est sélectionné, retour au
niveau à la désélection — et garde en mode naturel son comportement actuel
(double-clic sur un atome ou une molécule).

Quatre manques réels corrigés (probe `temp/contextual_rail_views_probe.mjs`,
rouge d'abord — 13 échecs) :

| Manque | Correctif |
|---|---|
| le rail ne prévenait personne quand il s'ouvrait ou se fermait, donc la vue ne rebâtissait jamais son arbre et le contenu s'étendait **sous** le rail | `ATOME_CONTEXTUAL_EDIT_CHANGED_EVENT` émis depuis `syncLegacyState()`, seul point par lequel passe toute mutation de cible ; la surface s'y abonne |
| rien n'ouvrait le rail à l'entrée dans une vue | `syncContextualRail()` appelée après chaque rendu réussi |
| rien ne le réalimentait au changement de niveau | même fonction : signature `level:` / `item:` comparée, elle n'agit que si la cible a changé — c'est aussi ce qui empêche la notification de boucler |
| un atome simple sélectionné n'alimentait pas le rail | `project_view_contextual_rail.js`, propriétaire unique du routage ligne → rail |

Réutilisation plutôt que création : un atome réel prend `enter` — *exactement* la
route du double-clic en mode naturel, donc les mêmes outils, le même rail.
`resolveAtomeContextualRecordKind` / `normalizeAtomeContextualKind` sortent de
`boot_runtime.js` vers `atome_contextual_kind.js` pour éviter deux copies qui
auraient fini par diverger sur le nom d'un atome audio.

---

# 17. Definition of Done — critères atteints

- all essential toolbox entries work;
- vector drawing is usable;
- freehand drawing is usable;
- crop/cut tools are usable;
- audio trim works;
- audio cut/split works;
- audio roll works where part of the design;
- loop and loop points work;
- no essential MVP control remains a dead placeholder.

Only after this state is reached should the project move to the second file:

> debugging → optimization → cleanup/refactoring → security → production hardening.
