# Plan de découpage d'eVeIntuition.js (P3.1)

> Jalon 1 livré le 2026-06-11. Frontières mesurées sur le fichier réel (17 485 l., 507 défs top-level).
> Règle d'exécution : une tranche à la fois, comportement identique, validation complète entre chaque tranche, jamais de big-bang.

## Structure mesurée

| Région | Lignes | Thème | Portée | Extractibilité |
|---|---|---|---|---|
| 1 – 1750 | ~1 750 | cycle de vie panneaux (settle/placement/reveal) | **module** (col. 0) | FACILE |
| 1751 – 2000 | ~250 | applyMtrackPanelOpen/Close | module | moyenne (couplée au bridge) |
| 6751 – 10500 | ~3 500 | **footer d'édition d'atome** (~108 défs) | **module** | FACILE-MOYENNE |
| 11623 – 17418 | **5 795** | closure `registerUiTools` (outils UI + bridge mtrack 14482-15730 + transport groupe) | **closure à état partagé** | DIFFICILE (injection ~50 deps) |

## Ordre des tranches (du plus sûr au plus dur)

1. **Tranche A — runtime settle/placement des panneaux** (~700 l., module-level)
   → `eVe/intuition/runtime/panel_open_settle_runtime.js`
   Fonctions : `waitForPanelElement`, `isPanelElementRendered/Visible`, `capturePanelVisibilitySnapshot`, `resolvePreparedPanelElement`, `waitForPreparedPanelElement`, `hidePanelUntilPrepared`, `revealPreparedPanel`, `settleOpenedPanelSurface`, `preparePanelSurfaceDuringOpen`, `scheduleFloatingPanelPlacementAfterOpen`, `scheduleAnchoredPanelPlacementAfterOpen`.
   Dépendances à injecter (factory) : `ensurePanelAttachedToIntuitionLayer`, `applyPanelPlacementForTool`, `positionPanelNearTool`, `positionPanelBelowAnchor`, `startPanelOpenPlacementObserver`, `verifyPanelPlacementAfterOpen`, `isDockedMtrackPanelElement`, constantes `PANEL_MOUNT_LAYER_ID`/`PANEL_MOUNT_PARENT_ID`.
   Validation : contrat molecule 32/32 (le settle est sur son chemin), probes flower, m0/m1.

2. **Tranche B — footer d'édition d'atome** (~2 900 l. utiles, module-level, le plus gros gain)
   → `eVe/intuition/runtime/atome_edit_footer_runtime.js`
   MESURÉ (post-tranche A) : cluster footer 6216 → 9324, avec 4 défs étrangères intercalées à contourner :
   `placeAtomeEditor` (7452), `primeAtomeEditorPlacement` (7532), `clearMtrackInteractionSession` (7744), `updateMtrackInteractionSession` (7752).
   Méthode : extraction multi-segments concaténés dans le même module — segments ≈ [6216-7451], [7553-7743], [7753-9324] (vérifier chaque frontière sur limite de déf avant coupe) ; splices appliqués en ordre décroissant. Les 4 intruses restent en place.
   Au-delà de 9325 (invokeUnifiedContextTool, runtime flower 10301-10542…) : HORS tranche B (tranches ultérieures).
   État module associé : `atomeEditFooterState` & co — migre avec. Consommé par la closure registerUiTools (bridge mtrack : show/hide/reveal/setExpanded) → API explicite retournée par la factory.
   Validation : contrat molecule 32/32 (footer couplé), m0/m1, vitest baseline, probes flower.

3. **Tranche C — bridge mtrack/Molecule** (~1 250 l., DANS la closure)
   → `eVe/intuition/runtime/mtrack_group_open_bridge.js`
   `closeMtrackPanelWithDockAnimation` (14482) → `bindGroupTimelineMtrackBridge` (15634-15730).
   Pattern : `createMtrackGroupOpenBridge(deps)` — injection de ~50 dépendances (liste préparée : applyMtrackPanelOpen/Close, isMtrackPanelVisibleNow, dockMtrackPanelToGroupHost, resolveGroupHostById, ensureCanvasGroupDockHost, normalize/rememberGroupTimelineTargetId, buildMtrackGroupTimelinePayload(ByGroupId), syncMtrackToolLatchedState, logs mtrax, API footer (tranche B), sélection, mtraxGroupOpenLock, …).
   Validation : contrat molecule 32/32 + test:molecule 9/9 + probe import média (z-order) — couvrent ce chemin de bout en bout.

4. **Tranche D — transport groupe** (~200 l. : waitForGroupNodeEnd, pause/playGroupTransport, runSelectedGroupTimelineAction) — avec ou après C.

5. **Itérations suivantes** : aspirer le reste de `registerUiTools` par familles d'outils, puis les régions 1751-2000 et 4251-4500.

## Pattern d'extraction (idiome du repo)

- Module factory : `export const createXxxRuntime = (deps) => { ...; return { api }; }` — déjà standard (`createMoleculeDockController`, `createProjectSceneGestureRuntime`, …).
- Aucune logique modifiée pendant le déplacement : diff = déplacement + injection + imports.
- Chaque tranche = un commit dédié possible, revert trivial.

## Validation par tranche (obligatoire)

`node --check` ; `npm run check:syntax` ; `check:m0` ; `check:m1` ; contrat molecule 32/32 ; `test:molecule` ; probes flower (long-press) ; `npx vitest run` (baseline : 13 échecs préexistants zone rendering, ne doit pas croître) ; probe live de la zone touchée.

## Risques

- Co-activité d'une autre IA (zone rendering) : re-lire les fichiers avant chaque édition ; le découpage reste dans intuition/*.
- `eVeIntuition.js` importé par index : vérifier qu'aucun consommateur externe n'importe les défs déplacées directement (grep avant chaque tranche).
