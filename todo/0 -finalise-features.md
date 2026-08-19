# Atome / eVe — MVP Functional Completion

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

---

# 2. Theme framework integration

Finalize the integration of the theme framework currently referred to as **Elastic**.

First verify the exact internal name/module in the repository.

This concerns the **application theme / visual system**, not audio.

Verify integration with:

- main application surface;
- main toolbox;
- contextual toolbox;
- Creation palette;
- project/browser views;
- list views;
- matrix views;
- panels;
- assistant UI;
- drawing tools;
- audio tools;
- timeline;
- dialogs;
- overlays;
- selection states;
- hover/focus/pressed/disabled states where relevant.

Audit:

- theme engine;
- theme definitions;
- colors;
- typography;
- spacing;
- icons;
- UI density;
- appearance modes;
- hardcoded visual values that should come from the theme.

Do not redesign the visual identity. Complete the integration.

---

# 3. Main toolbox — complete all MVP tools

Audit every tool currently visible or planned in the Atome/eVe toolbox.

Classify each as:

- complete;
- partially implemented;
- placeholder;
- broken;
- disconnected;
- missing.

A visible MVP tool must perform a meaningful and complete action.

Complete all MVP-critical tools before moving to hardening.

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

---

# 7. Audio editing — complete the MVP toolset

Audit all audio editing controls currently visible, partially implemented or planned.

The goal is to complete the basic audio-editing workflow before optimization.

## 7.1 Trim

Finalize:

- trim start;
- trim end;
- visible trim boundaries;
- expected non-destructive behavior;
- correct playback;
- persistence after save/reload.

## 7.2 Cut / Split

Finalize:

- split at a chosen position;
- preserve resulting regions where appropriate;
- correct timing;
- correct media references;
- correct object relationships;
- save/reload persistence.

## 7.3 Time Stretch — zplane élastique

Finalize and integrate **time stretch using the zplane élastique library**.

The time-stretch implementation for Atome/eVe must use **zplane élastique** as the designated stretching engine. Do not replace it with another generic time-stretch solution unless a separate architectural decision explicitly changes this requirement.

Required work:

- integrate the zplane élastique library into the existing Atome/eVe audio architecture;
- connect it to the existing audio editing/toolbox workflow;
- expose the time-stretch control through the appropriate existing UI;
- modify audio duration accurately;
- preserve expected temporal placement on the timeline;
- preserve pitch when using the appropriate élastique mode/API;
- preserve acceptable/high-quality audio output according to the capabilities of zplane élastique;
- persist all stretch parameters required to reproduce the edit;
- restore the exact stretched state after save/reload and project reopening;
- ensure waveform/timeline representation remains coherent with the effective stretched duration;
- ensure the stretched audio remains compatible with trim, cut/split, roll, loop and other existing audio operations.

The implementation must wrap/integrate **zplane élastique** cleanly into the existing audio engine and Atome object/property model rather than creating a parallel audio-editing architecture.

Do not implement a separate custom DSP time-stretch engine for this feature.

## 7.4 Roll

Finalize the existing/planned audio **roll/repeat** function.

Determine its intended behavior from the current repository and UI.

Expected MVP possibilities:

- select a region/time interval;
- repeat it;
- define repetition interval where supported;
- stay synchronized with the timeline;
- exit/disable roll cleanly.

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

---

# 9. Creation palette — add Generator to the main toolbox

In the **Creation palette of the main toolbox**, add a new top-level entry:

# Generator

This is a container/category for generators, not a single generator.

It must follow the same interaction and visual rules as the existing creation tools.

Existing creation entries may include:

- Text;
- Drawing / Graphics;
- Code;
- Page.

Add:

- **Generator**.

Do not duplicate existing tools.

---

# 10. Generator container

The Generator entry must be extensible.

It should be able to contain generator families such as:

- audio generation;
- video generation;
- image/graphic generation;
- texture generation;
- text generation;
- future generator types.

The MVP does not require every possible generator to be implemented.

The required work is to create the correct **container, registration point and UI integration**.

---

# 11. Reuse existing generation features

Before implementing new generator logic, search the repository for already existing generation features.

Check for:

- video generation;
- audio generation;
- media generation;
- AI generation;
- procedural generation;
- texture generation;
- assistant-based generation;
- external-service generation;
- local-engine generation.

Existing implementations must be connected to the new **Generator** category where possible.

Do not duplicate working code.

---

# 12. Generator UX

Expected flow:

1. User opens Creation from the main toolbox.
2. User selects Generator.
3. Available generator types appear.
4. User selects a generator.
5. Relevant parameters appear.
6. User launches generation.
7. Generated content becomes a normal Atome object/media element.
8. The result can be manipulated with standard Atome tools.

The Generator must not become a disconnected application inside eVe.

---

# 13. Generated content integration

Generated results must integrate with the normal Atome lifecycle.

Where applicable they must:

- become Atome-compatible objects;
- receive normal metadata;
- have the correct parent/context;
- be selectable;
- be movable;
- be editable with compatible tools;
- be saveable;
- be reloadable;
- be exportable where export already exists;
- appear in normal project structure;
- integrate with the timeline when temporal;
- integrate with project/media storage.

Examples:

- generated audio → audio object / track-compatible media;
- generated video → video object / timeline-compatible media;
- generated image → graphic/media object;
- generated texture → visual resource;
- generated text → editable text object where appropriate.

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

No essential MVP control should remain an unexplained dead button.

An intentionally postponed non-MVP tool should be explicitly marked:

> Post-MVP — intentionally disabled/hidden

---

# 16. Validation scenarios

Run at least:

## Theme
- open application;
- navigate main areas;
- verify theme consistency;
- verify newly completed tools use the theme system.

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

## Time Stretch
- stretch audio;
- verify duration;
- play;
- save;
- reopen;
- confirm the stretched state is preserved.

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

## Generator
- open Creation;
- open Generator;
- choose an existing generator;
- generate content;
- insert into project;
- manipulate;
- save;
- reopen.

---

# 16bis. Périmètre reporté — décision du 17 août 2026

Le **menu principal** est hors périmètre jusqu'à nouvel ordre. Tout ce qui s'y
rapporte est reporté, notamment :

- §3 — l'audit et la complétion des outils de la **toolbox principale** ;
- §9/§10 — l'entrée **Generator** dans la palette Create : elle est déclarée et
  son registre est extensible, mais le bouton reste inerte parce que le ruban
  n'ouvre qu'un seul niveau de palette. Le corriger = toucher au menu ;
- §2 — la surface `eVe/intuition/ribbon` de l'intégration du thème (22 valeurs
  visuelles en dur, non traitées).

En contrepartie, exigence ajoutée le même jour et **livrée** : le menu
contextuel latéral doit être **ouvert et alimenté** en modes liste et matrice —
le niveau courant par défaut, l'élément dès qu'il est sélectionné — et garder en
mode naturel son comportement actuel (double-clic sur un atome ou une molécule).

Reste également **Post-MVP, bloqué par une dépendance externe** :

- §7.3 — **zplane élastique** : SDK commercial sous licence, absent du dépôt. Le
  slot reste déclaré `available: false`. Le stretch est désormais audible et
  préserve la hauteur via **Rubber Band** (GPL — voir `THIRD_PARTY_LICENSES.md`),
  enregistré derrière la même interface : basculer sur élastique reste un seul
  appel `registerStretchEngine`.

# 17. Definition of Done

This file is complete when:

- the theme system is integrated consistently;
- all essential toolbox entries work;
- vector drawing is usable;
- freehand drawing is usable;
- crop/cut tools are usable;
- audio trim works;
- audio cut/split works;
- audio **time stretch** works;
- audio roll works where part of the design;
- loop and loop points work;
- **Generator** exists in the Creation palette of the main toolbox;
- existing generator functionality is connected through Generator;
- generated content becomes normal Atome content;
- all completed features persist after save/reload;
- no essential MVP control remains a dead placeholder.

Only after this state is reached should the project move to the second file:

> debugging → optimization → cleanup/refactoring → security → production hardening.
