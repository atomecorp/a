# Perfs — parité HTML (journal)

Plan: ~/.claude/plans/dans-l-application-on-a-stateless-ocean.md

## Constat structurel (mesuré dans l'app, `?perf=1`)

Le rendu final passe bien par WebGPU. Le coût est **avant** le GPU.

Mesure du cycle overlay d'un refresh de panel `home` (130 nœuds, 87 records),
projet dashboard quasi vide (**120 records au total**) :

| étape | moy. | max |
|---|---|---|
| `projection.virtual_scene`   | 2,21 ms | 4,2 ms |
| `projection.normalize_atoms` | 1,07 ms | 2,4 ms |
| `projection.runtime.total`   | 3,94 ms | 7,3 ms |
| cycle overlay complet mesuré | **6,81 ms** | |

Ces étapes sont en **O(scène projet entière)**, pas en O(panel).
`tryApplyProjectScenePrefixRecords` existe pour les éviter mais **n'a pas été pris
une seule fois sur 10 cycles**. Gardes qui bloquaient (relevé direct) :
`runtime.projection.ok === false`, `virtualScene.byId` absent,
`sceneState.surfaceOwnerProjectId === null`, `virtualScene.nodes.length === 0`.
`projection.result` = `{ ok:false, presentable:true, diff_ops:0 }`.

⚠️ À reconfirmer dans un onglet **visible** : la mesure a été prise avec
`document.hidden === true` (rAF suspendu), donc `ok:false` peut être un artefact
du panneau masqué. Les *durées* ci-dessus, elles, ne sont pas un artefact.

Boot (local, à chaud) : `kickstart_ready` 342 ms → dernier `eve.boot_module` 1002 ms.
`ready_for_application` à 346 ms (les 2 fetch série coûtent peu en local, mais
gatent quand même l'import de l'app).

Autre trouvaille : `window.open_home_panel({})` **ne résout jamais** (>30 s) alors
que le panel est bien monté (130 nœuds) → promesse suspendue dans `onOpen`.

## Fait

- [x] **Lot 2 — streaming DB des gestes coupé en navigateur**
      `tool_runtime_gesture.js` `shouldSuppressGestureFrameStreaming` → `true`.
      Probe `temp/_probe_gesture_stream.mjs` : 31 commits → **1**, position finale
      conservée. Les 3 `__EVE_FORCE_*_STREAMING__` restent comme bascule A/B.
- [x] **Lot 2 — garde de non-changement `setParticle` + chemin batch**
      `database/adole.js`. Probe `temp/_probe_setparticle_idempotence.mjs` 7/7 :
      50 écritures identiques → 1 version (au lieu de 50), 50 écritures distinctes
      → 50 versions (historique intact), idem sur le chemin batch >3 clés.
      Fusion des 2 SELECT redondants + suppression du ternaire mort.
- [x] **Lot 1.A — layout de scroll**
      `withoutGeneratedScrollbar` n'alloue plus quand il n'y a pas de pouce (le
      fast path d'identité était **mort** → clone intégral de l'arbre à chaque
      passe) ; `applyNodeScrollLayout` rend le nœud d'origine quand rien n'a
      changé ; `visibleDescendantBottom` mesure à scroll 0 (exact + mémoïsable) ;
      `layoutForNodeCached` (WeakMap) partagé par scroll + hit-test + projection.
      Probes : `_probe_scroll_layout.mjs` (0 % → **100 %** de nœuds préservés),
      `_probe_scroll_ab.mjs` (avant/après sur le code réel tiré de git) :

      items |  avant  |  après  | gain
        50  | 0.350ms | 0.207ms | 1.7x
       200  | 0.680ms | 0.461ms | 1.5x
       500  | 1.471ms | 0.837ms | 1.8x
      1000  | 2.976ms | 1.764ms | 1.7x

- [x] **Lot 3 — ancrage central des panels** (un seul endroit, tous les panels)
      Nouveau `bevy_panel_placement.js` : l'état stocké est l'**intention**
      `{left, bottomGap, width, height}`, jamais une boîte clampée. `bottomGap` =
      écart entre le bas du panel et le sommet du menu (0 = collé). Le clamp se
      fait **en sortie**, donc la fenêtre regrandit → le panel reprend sa taille,
      sans code de restauration. `resolveBevyPanelGeometry` reste l'autorité
      unique ; le patch manuel `geometry.y` et toute la notion de resize
      « structurel » ont disparu (c'est elle qui laissait un y périmé sur
      `visualViewport`). Les branches mobile/docked font suivre l'intention
      desktop au lieu de l'effacer.
      Probe `temp/_probe_panel_anchor.mjs` **8/8** (rouge d'abord : 400 px de
      dérive + hauteur jamais restaurée) — couvre aussi drag, resize (bord haut
      fixe) et aller-retour de taille de fenêtre.
- [x] **Lot 5 — saisie de texte**
      • `autocorrect`/`autocapitalize`/`spellcheck` → **off** (paramètre
        `textAssist`, off par défaut) : les substitutions WebKit arrivaient comme
        de vrais `input`, indiscernables d'une frappe → **c'est la source des
        espaces parasites**.
      • handler `keyup` retiré (doublon exact des deux `selectionchange`).
      • `publishProjection` coalescé en rAF → **4 projections/frappe → 1**.
      • clignotement du caret routé vers `onCaretBlink` (patch ciblé) au lieu
        d'une projection complète → **2 rendus/s au repos → 0**, caret toujours
        animé.
      • arbitrage `ownerKey`/`onEvicted` du `<textarea>` partagé par ses **3**
        propriétaires (session panel, label dashboard, création de texte) :
        leurs jeux de handlers cohabitaient sur le même élément.
      • `text_editing_layout` : canvas de mesure mis en cache par document et
        `positions` rendu paresseux → **202 → 1** `measureText` par construction,
        **4040 → 20** pour 20 constructions, **0 canvas** créé au lieu de 20 ;
        caret toujours exact (mesure par préfixes, à la demande).
      Probes `_probe_text_session_passes.mjs` 6/6 et `_probe_text_layout_cost.mjs` 4/4.

## Vérifié dans l'app réelle

Boot OK, panel `home` monté à **130 nœuds** (identique à avant les correctifs),
`placement` bien présent en production avec `gap = 0` (bas collé au menu),
aucune erreur console.

⚠️ **Non validé end-to-end** : le redimensionnement visuel de la webview. Le
panneau navigateur de cette session a `document.hidden === true`, donc rAF est
suspendu et `syncCanvasSize` ne redimensionne jamais le canvas — impossible d'y
observer un vrai resize. La logique est prouvée par la probe 8/8 contre le vrai
résolveur, mais **à confirmer à l'œil** dans une fenêtre normale.

- [x] **Lot 4a — coût amont par `pointermove`**
      `surfacePointFromEvent` transporte désormais le rect ; `localEventForTarget`
      ne le relit plus → **3 reflows forcés par événement pointeur → 1**.
      `hitTestTrees` ne refait plus `Array.from+filter+sort` à chaque événement :
      seul **l'ordre** (les ids) est mémoïsé, jamais les objets d'entrée — car
      `updateBevyUiTreeMotion` les remplace pendant un drag et une entrée en
      cache ferait du hit-test sur les boîtes de la frame précédente.
      Invalidation aux 3 seuls points de mutation (mount/unmount/suspend, via un
      nouveau `onSuspensionChanged`).
      Probe `temp/_probe_pointer_reflows.mjs` 2/2 (1.00 rect/événement).

## Reste à faire
- [ ] Lot 4b — projection du resize pendant le geste
- [ ] Lot 1.B1 — scroll par delta ciblé (**justifié par la mesure ci-dessus**)
- [ ] Lot 6 — boot ; Lot 7 — debounce `atome:changed`
- [ ] Re-mesurer dans un onglet visible pour confirmer/infirmer `projection.ok:false`
