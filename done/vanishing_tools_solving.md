# Vanishing tools — icônes/labels du menu BevyUI qui disparaissent (resize + toggles Atome)

Statut : investigation code complète (2026-07-07), cause circonscrite à 5 branches vérifiables.
Aucun code modifié. Ce document est la marche à suivre exacte, étape par étape.

## 1. Symptôme

Après plusieurs resizes de la webview puis plusieurs clics sur l'outil « Atome »
(masque/révèle le dashboard) : certains outils du menu du bas perdent leur icône
et/ou leur label, leurs fonds (rectangles) restent, le dashboard reste
partiellement rendu. Pas de crash renderer. Le reset de l'état transitoire
dashboard (`activeCategoryId`, `scrollByLane`, etc.) n'a rien changé — normal :
la perte est dans la couche records/canvas, pas dans l'état métier.

## 2. Faits vérifiés dans le code (à ne pas re-déduire)

1. **Une seule scène partagée.** Le menu (`eve_bevy_ui_main_menu`) et le dashboard
   (`dashboard_bevy_ui`) sont deux arbres BevyUI projetés en *records atomes* dans
   la même scène projet `__eve_dashboard_workspace__`
   (`OVERLAY_PROJECT_ID`, `eVe/domains/rendering/bevy_ui_project_overlay_runtime.js:4`).
   `updateProjectSceneOverlay` **merge** par id dans `runtime.records` (pas de wipe),
   donc une op dashboard ne peut pas retirer des ids menu directement
   (`eVe/domains/rendering/project_scene_runtime.js:273-326`).

2. **Anatomie des records menu.** Chaque item produit jusqu'à 3 records
   (`bevy_ui_project_overlay_runtime.js:162-191`) :
   - fond : `__eve_bevy_ui_eve_bevy_ui_main_menu_<itemId>` (shape) ;
   - icône : `..._<itemId>_icon_image` (image, texture rgba inline `bevyTexture`
     hydratée par `hydrateImageTree`) ;
   - label : `..._<itemId>_label_text` (text, texture rasterisée côté canvas par
     le résolveur au moment du spawn/updateText).
   → « fonds présents, icônes/labels absents » = perte sélective des records
   suffixés `_image`/`_text` OU de leurs textures. C'est le discriminant central.

3. **Resize = remount overlay étalé en batches.** Quand la signature géométrique
   change (`overlayGeometrySignature`), `mountOrUpdate` fait :
   `clearBevyUiTreeOverlay(previousIds)` (supprime TOUS les records du menu de la
   scène + render) puis re-projection « fresh mount » avec `previousIds: []`, donc
   `spreadAcrossFrames = true` : **batches de 20 records séparés par des rAF**,
   chaque batch étant un render complet indépendant
   (`bevy_ui_runtime.js:340-358`, `bevy_ui_project_overlay_runtime.js:202-256`).

4. **Toutes les erreurs de cette chaîne sont avalées.**
   - `mountOrUpdate` : `catch → state.lastOverlayError` (`bevy_ui_runtime.js:359-361`) ;
   - scheduler : `lastError` (`project_scene_render_scheduler.js:41-43`) ;
   - appelants menu : `void render()` / `.catch(() => null)`.
   → Si le batch k jette, les batches 1..k-1 sont appliqués, k..n jamais :
   **état partiel permanent**, exactement le symptôme (menu ET dashboard partiels).
   De plus `state.overlayRecordIds`/`overlaySignatures` ne sont mis à jour qu'après
   succès complet → la bookkeeping reste sur les ids d'avant le clear.

5. **Échecs déterministes possibles dans un render :**
   - spawn/updateText d'un nœud `text` : un échec du résolveur de texture texte
     n'est PAS skippable (`canSkipTextureFailure` ne couvre que image/video/
     audio_waveform, `bevy_media_resource_runtime.js:93-95`) → le
     `applyBevyWebRendererDiffs` entier THROW (`bevy_web_renderer_runtime.js:310-317`) ;
   - `updateTransform` avec `sizeChanged` sur un nœud text (labels menu, ids
     `__eve_bevy_ui_*` non exclus par le filtre `__eve_dashboard_`) → re-raster
     `mapTextTexturePatch` awaité en plein diff (`bevy_web_renderer_runtime.js:356-361`).

6. **Fantômes canvas.** Un spawn `deferred`/`skipped` n'empêche PAS
   `state.virtual_scene` (baseline canvas, `SURFACE_RUNTIME`) d'enregistrer le
   nœud comme présent (`bevy_web_renderer_runtime.js:448-453`) → les diffs suivants
   ne le respawnent jamais. Côté wasm, `apply_render_ops` ignore les erreurs par
   op (`atome/renderers/bevy-core/src/plugin.rs:106-123`, seul
   `AtomeRendererDiagnostics.last_error` — non exporté vers JS — les retient) :
   un spawn en échec = nœud silencieusement absent alors que JS le croit appliqué.

7. **Course version-abort.** Entre `clearBevyUiTreeOverlay` et
   `projectBevyUiTreeOverlay` il y a un check de version qui peut abandonner APRÈS
   le clear (`bevy_ui_runtime.js:346-347`) sans mettre à jour
   `overlayRecordIds`/`overlaySignatures`. Auto-guérison normalement (merge), mais
   à confirmer par la probe.

8. **Changements Rust récents non commités** (git status) : throttling des wakes
   winit + fusion des style patches en file (`platforms/web/bevy-renderer/src/lib.rs`),
   cache de masques rounded-rect (`bevy-core/src/texture.rs`), gros ajouts UI natif
   (`ui/mod.rs`, inertes ici car `nativeUiEnabled=false` partout). Le mode winit est
   `reactive(16ms)` : si le self-tick s'arrête, les ops en file (spawns d'icônes)
   ne drainent plus. Régression fraîche possible → prévoir un test en revert local.

## 3. Marche à suivre

### Phase 0 — préalables obligatoires

1. Travailler dans `/Users/jean-ericgodard/RubymineProjects/a/` (jamais de worktree).
2. Lire `.codex/AGENTS.md`, puis modules `01`, `02`, `03`, `07`, et
   `atome/documentations/how_debug_UI.md` (procédure UI canonique).
3. Pas de `git stash` depuis le parent (eVe est un sous-module).
4. Probes uniquement sous `./temp`, supprimées à la fin. Aucun fallback, aucun
   DOM proxy, aucun synthetic event comme solution produit.

### Phase 1 — reproduction instrumentée (rouge d'abord)

But : reproduire l'état cassé avec de VRAIS clics et capturer chaque couche du
pipeline pour désigner la couche fautive. Chromium **visible** (WebGPU).

1. Créer `./temp/vanishing_tools_probe.mjs` (Playwright) :
   - boot l'app ; readiness = `window.__DEBUG__` / `window.new_menu_v2` /
     `#intuition` (PAS `domcontentloaded`/`networkidle`) ;
   - séquence de stress : `page.setViewportSize` × 3-4 tailles différentes
     (avec ~300 ms entre chaque), puis clic réel sur l'outil Atome (coordonnées du
     centre de l'item dans la barre : les items font `itemSize` px, ancrés selon
     `handedness` — lire `window.new_menu_v2.state.itemSize` et
     `resolveBevyMainMenuLayout` pour calculer ; clic Playwright réel sur le canvas
     `#eve_surface_project`), attendre la fin du fade (~600 ms), re-clic, ×3-5,
     en intercalant des resizes entre les toggles ;
   - **capture après chaque étape** (fonction `snapshot(label)`) via
     `page.evaluate` — importer les modules ESM de l'app par la même URL (même
     instance de module) :
     ```js
     const rt = window.eveBevyUiRuntime;
     const scene = window.eveToolBase.getProjectSceneState('__eve_dashboard_workspace__');
     const { readBevyWebRendererState } = await import('/eVe/domains/rendering/bevy_web_renderer_runtime.js');
     const canvasState = readBevyWebRendererState(document.getElementById('eve_surface_project'));
     const PREFIX = '__eve_bevy_ui_eve_bevy_ui_main_menu_';
     return {
       label,
       menuMeasure: window.new_menu_v2.measure(),
       lastOverlayError: rt.state.lastOverlayError || null,
       renderLastError: scene?.render?.last_error || null,
       projectionOk: scene?.projection?.ok,
       expectedIds: rt.state.overlayRecordIds.get('eve_bevy_ui_main_menu') || [],
       overlaySignature: rt.state.overlaySignatures.get('eve_bevy_ui_main_menu') || null,
       // couche 1 : records de la scène
       sceneMenuIds: (scene?.records || []).map(r => r.id).filter(id => id.startsWith(PREFIX)),
       // couche 2 : virtual scene du runtime projet
       runtimeVsMenuIds: [...(scene?.projection?.virtual_scene?.byId?.keys?.() || [])].filter(id => id.startsWith(PREFIX)),
       // couche 3 : baseline canvas (vérité de ce que Bevy est censé afficher)
       canvasVsMenuIds: [...(canvasState?.virtual_scene?.byId?.keys?.() || [])].filter(id => id.startsWith(PREFIX)),
       skipped: canvasState?.skipped_nodes || [],
       deferred: (canvasState?.deferred_nodes || []).map(n => n.id),
       nodeCount: canvasState?.node_count,
       // couche 4 : file d'ops wasm
       wasmDiag: canvasState?.wasmModule?.read_atome_bevy_web_diagnostics?.() || null
     };
     ```
   - classer chaque id menu en `rect` / `_image` / `_text` et compter par couche ;
   - screenshot à chaque étape pour corréler visuellement ;
   - le probe est ROUGE quand : un id attendu (`_image`/`_text` d'un item) manque
     dans une couche OU l'écart visuel est constaté alors que toutes les couches
     sont pleines.
2. Lancer, itérer la séquence de stress jusqu'à reproduction. Si la repro est
   difficile : augmenter le nombre de resizes rapprochés (c'est le déclencheur du
   chemin « fresh mount batché »), et resizer PENDANT le fade du dashboard.
3. Archiver la sortie JSON du probe (dans `./temp/`) : c'est la preuve.

### Phase 2 — arbre de décision (désigner la branche avec les captures)

Comparer, pour les ids manquants à l'écran, leur présence par couche :

| Branche | Observation | Cause désignée |
|---|---|---|
| **A** | id absent de `sceneMenuIds` (couche records) | perte niveau records : course clear/abort de `mountOrUpdate` ou `removeAtomeIds` calculé sur `previousIds` périmés |
| **B** | id présent en couche 1 mais `lastOverlayError` et/ou `render.last_error` non vide | **exception déterministe pendant un render batché** (candidat n°1) — l'erreur contient l'id/le motif du record fautif |
| **C** | id présent couches 1-2, absent de `canvasVsMenuIds` | baseline canvas désynchronisée (diff calculé contre un `virtual_scene` divergent) |
| **D** | id présent partout MAIS listé dans `skipped`/`deferred` durablement | fantôme : nœud enregistré dans `virtual_scene` sans avoir été réellement spawné (`bevy_web_renderer_runtime.js:328-341, 405-428`) |
| **E** | id présent partout, `skipped/deferred` vides, mais `wasmDiag.queued_ops > drained_ops` stagnant entre deux snapshots | starvation de l'event loop wasm (throttling des wakes, `lib.rs`) ou erreur d'op silencieuse côté monde Bevy |

Si branche E avec queued==drained : l'op a été appliquée et a échoué dans
`apply_render_op` → exposer temporairement `AtomeRendererDiagnostics.last_error`
via un export wasm de diagnostic (voir Phase 3-E) et re-capturer.

Note bisection rapide (branche E soupçonnée) : rebuilder le wasm avec le
throttling de `wake_web_renderer` neutralisé localement et rejouer le probe.
Si le bug disparaît, la régression est dans les changements Rust non commités.

### Phase 3 — correctif source par branche (minimal, factorisé, sans fallback)

**Commun à toutes les branches (à faire quoi qu'il arrive) :**
- Les échecs de projection overlay ne doivent plus être invisibles NI laisser un
  état partiel : dans `mountOrUpdate` (`bevy_ui_runtime.js:340-361`), un échec de
  `projectBevyUiTreeOverlay` après un `clearBevyUiTreeOverlay` doit déclencher une
  re-projection de réconciliation (re-render du tree complet au prochain frame via
  la queue existante `enqueueMountOrUpdate`), pas juste `lastOverlayError`.
  C'est une réparation de cohérence interne du pipeline propriétaire, pas un fallback.

**Branche A — perte niveau records :**
- Dans `mountOrUpdate`, mettre à jour `state.overlayRecordIds.set(id, [])` et
  invalider `overlaySignatures` **immédiatement après** le
  `clearBevyUiTreeOverlay` réussi (`bevy_ui_runtime.js:346`), pour que tout abort
  de version ultérieur reparte d'une bookkeeping exacte (le prochain update fera
  un fresh mount complet au lieu d'un merge sur ids périmés).

**Branche B — exception déterministe en render batché (candidat n°1) :**
1. L'erreur capturée désigne le record fautif (id + message, ex.
   `bevy_media_texture_required:<id>` ou `bevy_ui_font_*`). Corriger la CAUSE à la
   source (ex. taille dégénérée après resize/clamp dans le record text, texture
   rasterisée à 0×N, hydratation qui rapplique une version périmée post-resize).
2. Corriger le mode de défaillance structurel : dans
   `updateOverlayRecords` (`bevy_ui_project_overlay_runtime.js:202-226`), un échec
   d'un batch ne doit pas abandonner silencieusement les batches restants du même
   arbre — propager l'erreur ET garantir la réconciliation du point « Commun ».
3. Ne PAS mettre un try/catch d'étouffement autour du record fautif (fallback interdit).

**Branche C — baseline canvas désynchronisée :**
- Le lieu du fix est la mise à jour de `state.virtual_scene` dans
  `applyBevyWebRendererDiffs` (`bevy_web_renderer_runtime.js:448-453`) : elle doit
  refléter uniquement ce qui a été réellement appliqué. Si l'apply jette à mi-
  mapping, vérifier qu'aucun état partiel n'a été écrit (états `deferred_nodes`
  écrits pendant la boucle AVANT le throw, `bevy_web_renderer_runtime.js:328-341`) ;
  déplacer ces écritures après le succès du batch.

**Branche D — fantômes skip/defer :**
- Un nœud `skipped` au spawn ne doit pas rester enregistré comme présent : soit
  l'exclure du `virtual_scene` mémorisé (pour que le prochain diff le respawne),
  soit le re-tenter via la file différée y compris pour les kinds non-video
  (décision selon la nature de l'échec observé). Fix dans
  `applyBevyWebRendererDiffs` (spawn skipped) + `resolveDeferredInitialNodeResource`.

**Branche E — starvation event loop / erreur d'op wasm :**
- Si bisection positive sur le throttling : corriger `wake_web_renderer`
  (`platforms/web/bevy-renderer/src/lib.rs`) pour garantir qu'un op en file finit
  toujours par être drainé (ex. wake différé programmé quand un wake est supprimé,
  au lieu d'un drop pur).
- Si erreur d'op monde-Bevy : exposer `AtomeRendererDiagnostics`
  (`applied_ops`, `last_error`) via un export `read_atome_bevy_renderer_diagnostics`
  dans `platforms/web/bevy-renderer/src/exports.rs`, identifier l'op fautive, fixer
  sa cause dans `bevy-core` (spawn/texture). Rebuild wasm + resynchroniser les
  artefacts `atome/src/wasm/*` et `renderer_version.js` comme d'habitude.

### Phase 4 — test de régression (obligatoire avant de clore)

1. Test contractuel (style `tests/eve/*.test.mjs`, mais l'exécuter en direct via
   `node`, pas via la suite du repo) qui reproduit le mécanisme réel — pas une
   probe verte par construction :
   - monter le runtime BevyUI overlay avec un arbre menu réel
     (`buildBevyMainMenuTree`), simuler le changement de signature géométrique
     (resize) → vérifier qu'après le remount batché, l'ensemble EXACT des ids
     `rect/_image/_text` attendus est présent dans
     `getProjectSceneState('__eve_dashboard_workspace__').records` ;
   - injecter un échec transitoire au batch k (selon la branche corrigée) →
     vérifier que l'état converge quand même (réconciliation) et que l'erreur est
     observable (pas de silence) ;
   - séquence toggle : mount menu → mount dashboard → fade → unmount dashboard →
     re-render menu → mêmes assertions d'intégrité des ids menu.
2. Le test doit être ROUGE sur le code d'avant le fix (le vérifier en le lançant
   une fois sur l'arbre non corrigé si faisable), VERT après.

### Phase 5 — validation réelle + nettoyage

1. Rejouer `./temp/vanishing_tools_probe.mjs` (Chromium visible, WebGPU, vrais
   clics) : la séquence resize×N + toggle×N ne doit plus perdre aucun id, ni
   visuellement (screenshots), ni dans aucune des 4 couches capturées.
2. Vérifier la route réelle complète (pas seulement le boot) : cliquer chaque
   outil du menu après le stress pour confirmer que les handlers répondent encore.
3. Supprimer tous les fichiers de `./temp` créés pour cette investigation.
4. Si un export/API a changé (ex. export diagnostics wasm) : mettre à jour les
   maps (`maps/API_MAP.md`, etc.) conformément au module 04.
5. Déplacer ce fichier vers `./done/` une fois toutes les étapes terminées.

## 4. Ce qu'il ne faut PAS refaire

- Re-patcher l'état métier dashboard (déjà tenté, sans effet).
- Ajouter un fallback/re-render périodique qui masquerait la perte.
- Conclure « focused mode » sans passer par l'arbre de décision.
- Valider avec une probe qui mocke la géométrie ou saute le chemin batché
  (`spreadAcrossFrames`) : c'est précisément ce chemin qui est suspect.
