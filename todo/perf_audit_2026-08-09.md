# Audit performance complet — atome / eVe (09 août 2026)

Statut : **audit terminé, aucun correctif appliqué**.
Ce fichier est un **prompt d'exécution** : à coller tel quel dans l'agent de dev.

Journal existant à ne pas dupliquer : [`todo/perf_parity_html.md`](perf_parity_html.md)
(lots 1.A, 2, 3, 4a, 5 déjà faits). Ce document couvre ce qui **reste**, plus tout ce
que l'audit a trouvé en dehors de ce périmètre.

---

## Rôle

Tu es un agent de développement senior sur une base JavaScript / Rust / Bevy / WebGPU / WASM.

Ta tâche : **supprimer les causes racines des coûts listés ci-dessous**, pas masquer les
symptômes. Chaque lot est indépendant et livrable seul.

### Règles impératives

1. Lire `./.codex/AGENTS.md` avant toute écriture.
2. Travailler dans `/Users/jean-ericgodard/RubymineProjects/a/`, **jamais** dans un worktree.
3. `eVe/` est un **sous-module git** : pas de `git stash` depuis le parent.
4. **Ne jamais commiter ni pusher.** Annoncer « prêt » et s'arrêter.
5. **Ne pas lancer la suite de tests du repo.** Pour chaque modification : écrire une
   **probe ciblée dans `./temp/`** qui importe le **vrai module** (pas une
   réimplémentation), la faire échouer d'abord (rouge), puis passer au vert.
6. Une découpe/extraction se valide par **import ESM de l'entrée**, pas par `node --check`.
7. Cocher les cases au fil de l'eau dans ce fichier. Quand tout est coché → déplacer
   vers `./done/`.
8. Autonomie totale : enchaîner les lots sans demander confirmation.

### Méthode de mesure

Les chiffres ci-dessous sont **mesurés**, pas estimés. Les probes de mesure sont
reproductibles :

```bash
node temp/_probe_overlay_diagnostics_cost.mjs
```

```bash
node temp/_probe_scroll_frame_cost.mjs
```

Dans l'app : `?perf=1` → `window.__squirrelPerf`. Attention : une mesure prise avec
`document.hidden === true` suspend rAF et fausse les verdicts `ok:false` (pas les durées).

---

## Tableau de bord

| # | Lot | Domaine | Gravité | Coût mesuré |
|---|---|---|---|---|
| P0-1 | Diagnostics overlay quadratiques **dans le chemin d'ouverture de panel** | panels, transitions | 🔴 | **bloquant, ~19 → ~190 ms** par ouverture, croît avec le nb de panels |
| P0-2 | `renderNow` court-circuite la coalescence rAF | tout le rendu | 🔴 | N projections O(scène) par frame |
| P0-3 | Frame de scroll = 2 arbres + projection totale | scroll | 🔴 | **0,7 → 4,9 ms/frame** (plancher) |
| P0-4 | Ouverture de panel : polling 24 ms + 10 repositionnements sur 2,2 s | panels | 🔴 | latence quantifiée 24 ms + reflows |
| P1-1 | 815 modules ES / 6,6 Mo non bundlés au boot | boot | 🟠 | 815 requêtes, 0 JS pré-compressé |
| P1-2 | `elementsFromPoint` par `pointermove` pendant le drag | drag | 🟠 | 1 layout complet/événement ×2 |
| P1-3 | `clearTreeOverlayOutsideProject` : O(tous projets × tous records) | rendu | 🟠 | par mise à jour d'overlay |
| P1-4 | Fuites : `lastSurfacePoints`, `overlayRecoveryKeys`, interval non annulé | mémoire | 🟠 | croissance monotone |
| P1-5 | Historique DB sans rétention (`particles_versions`, `events`) | DB | 🟠 | croissance illimitée |
| P2-1 | Fast paths qui échouent en silence | rendu | 🟡 | invisible sans instrumentation |
| P2-2 | 75 modules orphelins + 2,1 Mo d'Opal mort | poids | 🟡 | 13 185 lignes |
| P2-3 | `getBoundingClientRect` + `JSON.stringify` par sync d'overlay | rendu | 🟡 | 1 reflow forcé |
| P2-4 | Index SQLite redondant sur `particles` | DB | 🟡 | amplification d'écriture |
| P2-5 | 514 `console.*` en chemin chaud | divers | 🟡 | |

---

# P0 — Corriger en premier

## [ ] P0-1 — `readBevyUiOverlayDiagnostics` est quadratique et **bloque chaque ouverture de panel**

**Fichier** : [`eVe/domains/rendering/bevy_ui_runtime_state.js:26-50`](../eVe/domains/rendering/bevy_ui_runtime_state.js:26)

```js
const visit = (node) => {
    const prefix = `${treeId}:${node.id}:`;
    const actions = Array.from(state.handlers.keys())   // ← matérialise TOUTES les clés
        .filter((key) => key.startsWith(prefix))         // ← pour CHAQUE nœud
        …
    (node.children || []).forEach(visit);
};
```

`Array.from(state.handlers.keys())` alloue un tableau de **toutes** les clés de handlers
du runtime **à chaque nœud visité**, pour chaque arbre. Coût = O(nœuds × handlers), avec
une allocation de tableau complète par nœud.

Ce n'est pas du code de debug isolé : il est appelé en production par
[`workspace_main_menu_visibility.js:21`](../eVe/intuition/tools/workspace_main_menu_visibility.js:21)
via `readMainMenuOverlayState`, elle-même appelée **jusqu'à 3 fois** dans un seul
`ensureWorkspaceMainMenuVisible` (lignes 112, 117 via `isMainMenuRendered`, et 124-125).

### Le point décisif : c'est dans le chemin d'ouverture de panel, en `await`

[`bevy_panel_runtime.js:428-429`](../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js:428) :

```js
await runtime.mountTree({ id: tree.id, surface, tree });
await ensureWorkspaceMainMenuVisible();       // ← bloque l'ouverture
emitSurfaceState({ definition, kind: 'opened' });
```

Deux conséquences :

1. Le coût est **bloquant** : le panel n'est annoncé `opened` qu'après.
2. L'appel se fait **après** `mountTree`, donc l'arbre du nouveau panel est déjà dans
   `state.trees` et ses handlers dans `state.handlers`. **Chaque panel ouvert alourdit
   l'ouverture du suivant** — le coût est quadratique en nœuds × handlers *et* croît avec
   le nombre de panels vivants.

Autres appelants (mêmes conséquences) : `user_workspace_surface_runtime.js:76/101/185`
(ouverture et bascule de surface workspace), `matrix/core/project_data.js:271`
(chargement de projet), `dashboard/dashboard_actions.js:16`.

**Mesuré** (`temp/_probe_overlay_diagnostics_cost.mjs`, vrai module) :

| nœuds/arbre | arbres | handlers | 1 appel | coût bloquant par ouverture (×3) |
|---|---|---|---|---|
| 130 | 1 | 260 | 6,25 ms | ~19 ms |
| 130 | 3 | 780 | 8,90 ms | ~27 ms |
| 130 | 6 | 1 560 | **63,88 ms** | **~190 ms** |
| 300 | 6 | 3 600 | **350,63 ms** | **>1 s** |

C'est la **première** cause de la latence d'ouverture de panel, avant le polling 24 ms et
les 10 passes de repositionnement de P0-4. Les deux lots attaquent la même latence par
deux bouts.

Ceci explique aussi une partie des « ~1,5 s d'orchestration workspace » relevés comme
levier restant non attribué dans l'audit de juillet
([`done/dashboard_performance.md`](../done/dashboard_performance.md)).

**Correctif**

1. Construire **un index inversé** `handlersByNodeKey: Map<"treeId:nodeId", string[]>`
   maintenu au moment où `state.handlers` est écrit/purgé (mount, unmount, update).
   `interactiveNodesForTree` devient O(nœuds).
2. Séparer les deux usages : `readMainMenuOverlayState` n'a besoin que du **compte**
   de nœuds interactifs et de nœuds `activate` d'**un seul** arbre
   (`BEVY_MAIN_MENU_TREE_ID`). Exposer un `readTreeInteractivitySummary(treeId)` ciblé,
   et réserver `readOverlayDiagnostics()` (tous les arbres, `overlayRecordIds.slice()`
   inclus) au debug.
3. Mémoïser le résultat par `renderVersion` de l'arbre.

**Validation** — probe `temp/_probe_overlay_diagnostics_cost.mjs` (déjà écrite) : rejouer
la même grille, exiger un profil **linéaire** et `< 2 ms` à 300 nœuds × 6 arbres. Puis
vérifier dans l'app que le menu principal est toujours détecté correctement après une
transition (`ensureWorkspaceMainMenuVisible` ne doit pas lever
`workspace_main_menu_overlay_missing`).

---

## [ ] P0-2 — La coalescence rAF du scheduler de rendu est morte

**Fichiers** : [`eVe/domains/rendering/project_scene_render_scheduler.js`](../eVe/domains/rendering/project_scene_render_scheduler.js),
[`project_scene_engine.js:105-188`](../eVe/domains/rendering/project_scene_engine.js:105)

`createProjectSceneRenderScheduler` expose deux entrées :
- `schedule(runtime)` → coalesce sur `requestAnimationFrame` ;
- `renderNow(runtime)` (= `drain`) → **exécute immédiatement**, sans coalescence.

Relevé des appels dans `eVe/` :

```
renderNow( : 10 sites
schedule(  :  1 site   (project_scene_text_runtime.js:93, et seulement si !immediate)
```

Donc **le chemin coalescé n'est quasiment jamais emprunté**. Chaque mutation
(`project_scene_mutation_runtime.js:105` et `:136`, `project_scene_runtime.js:99/115/427`,
`project_scene_invalidation_runtime.js:40/85`, `project_scene_engine.js:251`) déclenche une
projection **complète** `renderRuntimeProjection`, qui est en O(tous les records du projet) :

```js
const records = Array.from(runtime.records.values());       // copie complète
normalizeRenderAtoms(records, …)                            // O(records)
createVirtualSceneTree(recordsForBevyProjection(records),…) // O(records)
createRenderScene(renderAtoms, …)                           // O(records)
indexProjectSceneAtoms(runtime);                            // O(records)
```

Trois mutations dans la même frame → trois projections complètes.

> ⚠️ **Ce qui n'est PAS mesuré ici.** Que le chemin coalescé soit mort est un fait de code
> (10 appels contre 1). Le **taux réel de projections redondantes par frame dans l'app**
> ne l'est pas : ça peut être 1,2× comme 4× selon le geste. À mesurer avec `?perf=1` en
> comptant `render_scheduler.render` par frame **avant** d'engager le lot — c'est le lot
> le plus structurant mais aussi le plus risqué (plusieurs des 10 `renderNow()` consomment
> le résultat de façon synchrone et ne peuvent pas être basculés à l'aveugle).

Aggravant : [`project_scene_invalidation_runtime.js:91-97`](../eVe/domains/rendering/project_scene_invalidation_runtime.js:91)
branche `PROJECT_AUDIO_PLAYBACK_PROGRESS_EVENT` sur `applyTargeted`, qui retombe sur
`renderNow` complet dès que le patch direct échoue — pendant une lecture audio, à la
cadence de l'événement de progression.

**Correctif**

1. Faire de `schedule()` le **défaut**. Ne garder `renderNow()` que là où le résultat de
   la projection est consommé de façon synchrone dans la même tâche — et le prouver site
   par site (les 10 sont listés ci-dessus).
2. Dans `drain`, dédupliquer aussi par `project_revision` : si la révision n'a pas bougé
   depuis la dernière projection réussie, ne rien recalculer.
3. `project_scene_engine.js` appelle `updateRenderSurfaceScene(runtime.surface, runtime.scene)`
   **deux fois** avec le même objet (lignes 137-139 « before » et 168-170 « after ») ;
   `runtime.scene` n'est pas réassigné entre les deux. Supprimer le doublon après avoir
   vérifié qu'aucun chemin intermédiaire ne le mute.
4. `videoSourceSignature` (lignes 54-68) recalcule un `JSON.stringify` + `sort()` + `join()`
   sur les nœuds vidéo de l'**ancienne et** de la nouvelle scène à chaque projection.
   Mémoïser la signature sur `runtime.virtualScene` au lieu de la recalculer.

**Validation** — probe `temp/_probe_render_coalescing.mjs` : instancier le vrai scheduler,
émettre 5 mutations dans la même frame, compter les appels à `renderProjection`.
Attendu **1** (aujourd'hui : 5). Puis, dans l'app, vérifier qu'un drag reste fluide et
qu'aucun rendu n'est perdu (dernier état toujours affiché).

---

## [ ] P0-3 — Une frame de scroll reconstruit deux arbres et reprojette tous les records

**Fichiers** : [`bevy_ui_scroll_runtime.js:284-301`](../eVe/domains/rendering/bevy_ui_scroll_runtime.js:284),
[`bevy_ui_tree_motion_runtime.js:89-107`](../eVe/domains/rendering/bevy_ui_tree_motion_runtime.js:89),
[`bevy_ui_runtime.js:130-154`](../eVe/domains/rendering/bevy_ui_runtime.js:130)

Chaîne réelle pour **un pixel de scroll** :

```
updateOffset()                       → scheduleRefresh(treeId)
  → refreshTree(treeId)              → updateBevyUiTreeScroll()
      → scrollRuntime.applyTree(source)   // parcours récursif complet + layout
      → scrollRuntime.applyTree(hit)      // …une deuxième fois, autre objet
      → projectBevyUiTreeOverlay()        // projection COMPLÈTE des records
          → updateProjectSceneOverlay() / reconcileProjectSceneRecordsByPrefix()
          → clearTreeOverlayOutsideProject()   // voir P1-3
```

`projectBevyUiTreeRecords` ([`bevy_ui_overlay_record_projection.js:107-189`](../eVe/domains/rendering/bevy_ui_overlay_record_projection.js:107))
reconstruit **tous** les records de l'arbre à chaque frame — 1 à 3 objets par nœud, avec
`transformProperties`, `colorToCss`, `normalizeWorkspaceSceneRecord` sur chacun. Rien n'est
réutilisé entre deux frames alors que **seul `scroll[1]` a changé**.

Et l'inertie (`startInertia` → `tick`, lignes 433-459) rejoue ça à chaque rAF jusqu'à
l'arrêt.

**Mesuré** (`temp/_probe_scroll_frame_cost.mjs`, vrais modules — **plancher**, hors diff
de scène et hors `clearTreeOverlayOutsideProject`) :

| lignes | records projetés | ms / frame | CPU / seconde de scroll |
|---|---|---|---|
| 50 | 151 | 0,70 ms | 42 ms |
| 200 | 601 | 2,08 ms | 125 ms |
| 500 | 1 501 | 4,85 ms | **291 ms** |

> Le chiffre réel est **supérieur** : la probe passe le même objet d'arbre aux deux
> `applyTree`, donc le `WeakMap` `LAYOUT_CACHE` est partagé. En production les arbres
> source et hit sont deux objets distincts → aucun partage de cache.

> ⚠️ **Ne pas extrapoler les 4,85 ms.** C'est le **pire cas** (500 lignes). Un panel `home`
> fait ~130 nœuds, soit plutôt **~1,5 ms/frame**. Donc : gain majeur sur les listes longues
> (Finder, bibliothèques), gain modéré sur les panels courants. Prioriser en conséquence.

**Correctif** — c'est le « Lot 1.B1 — scroll par delta ciblé » resté ouvert dans
`perf_parity_html.md`.

1. Un scroll ne change que `position[1]` des records descendants du `scroll_area`.
   Émettre un **patch de translation** (`updateProjectSceneRecordMotion` / le chemin
   `direct_motion` existant) au lieu d'une reprojection.
2. Ne recalculer `contentHeight` / `maxY` que quand l'**arbre** change, pas quand
   l'**offset** change. Aujourd'hui `applyNodeScrollLayout` refait
   `visibleDescendantBottom` à chaque passe ; la clé du `CONTENT_BOTTOM_CACHE` inclut la
   box mais l'entrée est indexée sur `children`, qui est recréé dès qu'un ancêtre change.
3. Ne reconstruire l'arbre **hit-test** que si la géométrie visible a réellement bougé —
   ou mieux : appliquer l'offset au moment du hit-test (`locateNode` connaît déjà les
   `scrollAncestors`) plutôt que de matérialiser un second arbre.
4. Virtualiser le contenu au-delà d'un seuil. Le mécanisme existe déjà
   (`bevy_panel_selectable_list.js:397` `virtualizedHierarchicalSelectableListNode`) ; il
   n'est pas utilisé par tous les panels.

**Validation** — étendre `temp/_probe_scroll_frame_cost.mjs` : exiger **< 0,3 ms/frame à
500 lignes** et **0 record réalloué** quand seul l'offset change (compter les identités
d'objet conservées). Rouge d'abord. Puis à l'œil dans l'app : liste Finder longue,
scroll inertiel, aucun saut.

---

## [ ] P0-4 — Ouverture de panel : polling 24 ms puis 10 repositionnements étalés sur 2,2 s

**Fichiers** : [`panel_open_settle_runtime.js`](../eVe/intuition/runtime/panel_open_settle_runtime.js),
[`panel_layout_runtime.js:276-362`](../eVe/intuition/runtime/eve_intuition/panel_layout_runtime.js:276)

> Ce lot est le **deuxième** contributeur à la latence d'ouverture. Le premier est P0-1
> (`ensureWorkspaceMainMenuVisible` awaité dans `bevy_panel_runtime.js:429`). Faire P0-1
> d'abord : il est plus simple, sans compromis, et il retire la part bloquante.

### a) Boucle d'attente en `setTimeout(24)`

```js
// panel_open_settle_runtime.js:26-31 et :96-100
const deadline = Date.now() + timeoutMs;          // 1200 ou 1400 ms
while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 24));
    const panel = resolvePreparedPanelElement({ panelId, beforeVisibility });
    if (panel) return panel;
}
```

Deux conséquences :
- **plancher de latence de 24 ms** ajouté à toute ouverture où le panel n'est pas déjà
  dans le DOM au premier essai — quantifié par pas de 24 ms ;
- chaque itération appelle `resolvePreparedPanelElement` (lignes 62-85) qui fait
  `document.querySelectorAll('[data-eve-panel="true"]')` puis, **par panel trouvé**,
  `window.getComputedStyle(panel)` + `panel.getClientRects()` (lignes 43-51). Soit un
  **reflow forcé par panel, toutes les 24 ms, pendant jusqu'à 1,4 s**.

`capturePanelVisibilitySnapshot` (lignes 53-60) fait la même chose une fois de plus avant
l'ouverture.

### b) Dix repositionnements après l'ouverture

`settleOpenedPanelSurface` positionne le panel **puis** enchaîne :

- `verifyPanelPlacementAfterOpen` (`panel_layout_runtime.js:276-296`) → **4 passes rAF**
  récursives ; chaque passe appelle `panelNeedsOpenPlacementVerification` (lecture de
  `getBoundingClientRect` + `getComputedStyle`) et éventuellement `positionPanelNearTool`.
- `startPanelOpenPlacementObserver` (lignes 314-362) → un `ResizeObserver` **plus**
  `[80, 220, 420].map(delayMs => setTimeout(flush, delayMs))` **plus** un `flush()`
  immédiat, le tout maintenu vivant `lifetimeMs = 2200`.

Au total, l'ouverture d'un panel déclenche **jusqu'à ~10 recalculs de placement complets
étalés sur 2,2 secondes**, chacun lisant la géométrie du DOM. C'est ce qui se voit à
l'écran comme un panel qui « se réajuste » après être apparu.

**Correctif**

1. Remplacer les deux boucles de polling par un `MutationObserver` sur le conteneur de
   panels (ou, mieux, faire **retourner l'élément** par le chemin qui le crée — c'est le
   même code, il n'y a aucune raison de le redécouvrir par le DOM).
2. `resolvePreparedPanelElement` : quand `panelId` est fourni et que `getElementById`
   répond, ne **jamais** balayer `querySelectorAll` + `getClientRects` sur tous les
   panels. Le balayage n'est qu'un filet de secours pour le cas « id inconnu ».
3. Batcher toutes les lectures de géométrie d'une passe de placement (lire d'abord,
   écrire ensuite) pour supprimer le layout-thrashing lecture/écriture alterné.
4. `verifyPanelPlacementAfterOpen` : sortir dès la **première** passe stable
   (`panelNeedsOpenPlacementVerification === false`) au lieu de toujours consommer les
   4 passes. Le code re-planifie inconditionnellement (ligne 289).
5. `startPanelOpenPlacementObserver` : le `ResizeObserver` couvre déjà le cas « le contenu
   arrive tard ». Les trois `setTimeout(80/220/420)` sont redondants avec lui —
   les supprimer et réduire `lifetimeMs`.
6. Le journal note aussi que `window.open_home_panel({})` **ne résout jamais** (>30 s)
   alors que le panel est monté (130 nœuds) : promesse suspendue dans `onOpen`. À traiter
   ici, c'est le même chemin.

**Validation** — probe `temp/_probe_panel_open_cost.mjs` : instrumenter
`getComputedStyle` / `getClientRects` / `getBoundingClientRect` sur un DOM simulé, ouvrir
un panel, compter les lectures de géométrie et les passes de placement.
Attendu : **≤ 2 passes** et **≤ 5 lectures**, contre ~10 passes aujourd'hui. Rouge d'abord.
Puis mesurer dans l'app avec `?perf=1` le délai entre l'intention d'ouverture et la
dernière écriture de placement.

---

# P1 — Ensuite

## [ ] P1-1 — 815 modules ES / 6,6 Mo servis bruts au boot, aucun JS pré-compressé

**Mesuré** (fermeture transitive des imports **statiques** depuis
`atome/src/squirrel/spark.js` + `atome/src/application/index.js` + `eVe/eVe.js`) :

```
EAGER : 815 modules, 6 589 KB
  212 mod  1710KB  atome/src/squirrel
  146 mod  1394KB  eVe/intuition/tools
  111 mod  1020KB  eVe/intuition/runtime
   91 mod   669KB  eVe/domains/rendering
   29 mod   253KB  eVe/domains/media
```

En incluant les `import()` dynamiques : **1 148 modules atteignables**.

- Aucun bundler pour l'app. `npm run build` → `rollup -c scripts/rollup.config.npm.js`
  qui ne bundle que `scripts/bundle.js` → `dist/squirrel.js` (la lib npm), **pas
  l'application**.
- `server/server.js:674-700` enregistre `@fastify/static` avec `preCompressed: true`, mais
  `find atome/src eVe -name "*.js.br" -o -name "*.js.gz"` → **0 fichier**. Seul le WASM est
  pré-compressé. Il faut **vérifier par la mesure** si `@fastify/compress` compresse
  effectivement les réponses de `@fastify/static` :
  ```bash
  curl -sI -H 'Accept-Encoding: br,gzip' http://localhost:3000/eVe/eVe.js | grep -i 'content-encoding\|cache-control\|etag'
  ```
- Aucun `maxAge` / `immutable` sur les enregistrements statiques → au mieux 815 requêtes
  conditionnelles (304) par rechargement.
- `atome/src/sw.js` ne cache **que** le WASM (choix documenté et défendable) ; le JS
  repasse intégralement par le réseau.
- `scripts/static_file_server.mjs` (65 lignes, utilisé par `npm run serve`) n'écrit
  **ni `Cache-Control`, ni `ETag`, ni compression** — il fait `writeHead(200, {content-type})`
  puis `createReadStream().pipe()`.

Le boot est aussi **sériel** : `eVe/eVe.js` charge 4 modules en parallèle puis **13 modules
strictement séquentiels** (`loadModulesSequentially`), chacun tirant sa propre sous-arborescence.
Le journal relève `kickstart_ready` à 342 ms → dernier `eve.boot_module` à 1 002 ms **en local
à chaud**.

**Correctif**

1. Produire un **bundle de production** (esbuild est déjà en dépendance) : un chunk d'entrée
   + des chunks lazy alignés sur les `import()` de `panel_definitions.js`. Garder le mode
   modules bruts en dev.
2. Générer les `.br`/`.gz` au build pour que `preCompressed: true` serve à quelque chose.
3. Ajouter `maxAge` + `immutable` sur les assets versionnés, `max-age=0` uniquement sur
   `index.html`.
4. Ajouter `Cache-Control`/`ETag`/compression à `scripts/static_file_server.mjs`.
5. Réexaminer la liste séquentielle de `eVe/eVe.js:19-33` : `eve.voice_assistant`,
   `eve.design`, `eve.shortcut_config` bloquent le premier rendu. Vérifier lesquels ont
   réellement une dépendance d'ordre à l'import et déplacer les autres dans le lot
   concurrent, ou en `import()` différé.

**Validation** — script de mesure `temp/_probe_boot_graph.mjs` (réutiliser la logique
d'analyse d'imports décrite ici) : exiger **< 300 modules** et **< 2 Mo** dans le graphe
statique de boot. Puis `?perf=1` dans un onglet **visible** : comparer `kickstart_ready`
et le dernier `eve.boot_module` avant/après.

---

## [ ] P1-2 — `document.elementsFromPoint()` à chaque `pointermove` de drag

**Fichier** : [`project_drop_toolbox_row_insertion_runtime.js:198-213`](../eVe/intuition/tools/project_drop_toolbox_row_insertion_runtime.js:198)

```js
const stack = document.elementsFromPoint(Number(x), Number(y));
for (const node of stack) {
    const container = node?.closest?.(`[data-…="true"]`) || null;
    …
}
```

`elementsFromPoint` force un **layout complet du document** puis un hit-test de toute la
pile. Il est appelé depuis `resolveProjectionToolboxContainerAtPoint`, elle-même appelée
**deux fois par mouvement** : une fois par `updateProjectionToolboxDropHover`
([`project_drop_projection_drag_rebalance_runtime.js:132`](../eVe/intuition/tools/project_drop_projection_drag_rebalance_runtime.js:132))
et une fois par `updateProjectionToolboxInsertionPreview` (ligne 99), toutes deux
invoquées depuis `onMove`
([`project_drop_projection_move_runtime.js:297-320`](../eVe/intuition/tools/project_drop_projection_move_runtime.js:297)).

Le chemin de repli (lignes 214-230) est pire encore : `querySelectorAll` + un
`getBoundingClientRect` par conteneur.

Dans le même `onMove` : `clampProjectionHostDragPosition({ hostEl, rootEl })` relit
la géométrie de l'hôte et de la racine.

**Correctif**

1. **Mettre en cache les rects des conteneurs de toolbox au `pointerdown`**, pas par
   mouvement : ils ne bougent pas pendant le geste (et s'ils bougent, c'est le code de
   preview qui le sait). Invalider sur `resize`, sur insertion/retrait de conteneur et sur
   changement d'état déplié.
2. Résoudre le conteneur par **test de rect en mémoire** (le fallback des lignes 214-230,
   mais sur des rects cachés) au lieu de `elementsFromPoint`.
3. N'appeler `resolveProjectionToolboxContainerAtPoint` **qu'une fois** par mouvement et
   passer le résultat aux deux consommateurs.
4. Coalescer `onMove` sur rAF : plusieurs `pointermove` par frame ne doivent produire
   qu'une mise à jour.

**Validation** — probe `temp/_probe_toolbox_drag_layout_reads.mjs` : DOM simulé,
instrumenter `elementsFromPoint` / `getBoundingClientRect` / `querySelectorAll`, rejouer
60 `pointermove`. Attendu **0 `elementsFromPoint`** et **≤ 1 lecture de rect par frame**
(aujourd'hui : ≥ 120 `elementsFromPoint`). Rouge d'abord.

Voir aussi : [`bevy_ui_pointer_runtime.js:299-303`](../eVe/domains/rendering/bevy_ui_pointer_runtime.js:299) —
le handler `dragover` appelle `targetFor()` (→ `getBoundingClientRect` + hit-test complet
de l'arbre UI) à chaque événement `dragover` natif, sans coalescence.

---

## [ ] P1-3 — `clearTreeOverlayOutsideProject` balaie tous les records de tous les projets

**Fichier** : [`bevy_ui_project_overlay_runtime.js:57-82`](../eVe/domains/rendering/bevy_ui_project_overlay_runtime.js:57)

```js
const overlayIdsByProjectForTree = (treeId = '') => {
    const prefix = treeOverlayPrefix(treeId);
    PROJECT_SCENES.forEach((runtime, projectId) => {
        runtime.records?.forEach?.((_record, id) => {
            if (toKey(id).startsWith(prefix)) ids.push(toKey(id));   // O(tous les records)
        });
    });
};
```

Appelé par `clearTreeOverlayOutsideProject`, lui-même appelé **à chaque
`updateOverlayRecords`** (lignes 104 et 113) — donc à chaque rafraîchissement de panel
**et à chaque frame de scroll** (via P0-3). Coût = O(projets chargés × records par projet),
avec un `String()` + `trim()` + `startsWith` par record.

**Correctif** — maintenir un **index `Map<treeOverlayPrefix, Map<projectId, Set<id>>>`**
mis à jour aux points d'écriture des records d'overlay, au lieu de rebalayer. Ou, plus
simple : ne déclencher le nettoyage que quand `activeOverlayProjectId()` **change**, pas à
chaque mise à jour.

**Validation** — probe `temp/_probe_overlay_cross_project_scan.mjs` : peupler 5
`PROJECT_SCENES` × 500 records, compter les itérations de record par appel à
`updateOverlayRecords`. Attendu **0** quand le projet actif n'a pas changé.

---

## [ ] P1-4 — Trois fuites confirmées

### a) `lastSurfacePoints` : `Map` clefée par élément canvas, jamais purgée

[`bevy_ui_runtime_state.js:20`](../eVe/domains/rendering/bevy_ui_runtime_state.js:20) —
écrite à [`bevy_ui_pointer_runtime.js:89`](../eVe/domains/rendering/bevy_ui_pointer_runtime.js:89)
(`state.lastSurfacePoints.set(canvas, point)`), lue ligne 254, **jamais `delete`**
(`unmountTree` ne la touche pas). Chaque canvas jamais survolé reste retenu vivant, avec
son document et son arbre.
→ **`WeakMap`.**

### b) `overlayRecoveryKeys` : `Set` de chaînes, croissance monotone

[`bevy_ui_runtime_state.js:10`](../eVe/domains/rendering/bevy_ui_runtime_state.js:10),
ajout à [`bevy_ui_overlay_reconciliation.js:45`](../eVe/domains/rendering/bevy_ui_overlay_reconciliation.js:45),
suppression **uniquement** ligne 93, et seulement si une sync ultérieure réussit avec
**exactement la même signature géométrique**. La signature contient la taille du canvas :
tout redimensionnement produit une clé neuve. `unmountTree`
([`bevy_ui_runtime.js:432-469`](../eVe/domains/rendering/bevy_ui_runtime.js:432)) purge
`overlaySignatures` mais **pas** `overlayRecoveryKeys`.
→ purger le préfixe `${treeId}:` dans `unmountTree` et borner le `Set`.

### c) `setInterval` sans identifiant

[`eVe/domains/media/api/audio_api.js:117`](../eVe/domains/media/api/audio_api.js:117) :

```js
setInterval(() => { ctx.syncQueuedUploads().catch(() => { }); }, SYNC_INTERVAL_MS); // 15 s
```

Aucun id conservé → jamais `clearInterval`, tourne aussi quand l'onglet est masqué.
Le helper `eVe/shared/visibility_aware_interval.js` existe déjà et n'est utilisé qu'à
**3 endroits** (`perform_preference_runtime.js`, `user/background.js`, `tools/background.js`).
→ router ce timer et les autres pollings récurrents à travers lui.

**Validation** — probe `temp/_probe_runtime_state_leaks.mjs` : monter/démonter 200 arbres
sur 3 canvas, vérifier que `state.lastSurfacePoints` est une `WeakMap`, que
`state.overlayRecoveryKeys.size` retombe à 0 après démontage, et qu'aucun intervalle ne
survit à un `teardown`. Rouge d'abord.

---

## [ ] P1-5 — Aucune rétention sur l'historique en base

**Fichiers** : [`database/schema.sql:97-113`](../database/schema.sql:97),
[`database/adole.js:986`](../database/adole.js:986) et `:1093`

`particles_versions` reçoit une ligne **par changement de particle** et `events` une ligne
par événement. Recherche exhaustive des suppressions :

```
DELETE FROM particles_versions → 1 seul site (server/auth_routes_account.js:430, suppression de compte)
DELETE FROM events             → 0 site
```

Pas de purge, pas de fenêtre de rétention, pas de `VACUUM` planifié. Un geste de drag
persistant, une session d'édition de texte, une lecture avec progression : chacun écrit
des versions. La base grossit indéfiniment → chargement de projet, snapshots et sync
ralentissent de façon monotone.

Le garde-fou d'idempotence de `setParticle` (Lot 2 du journal) réduit le débit mais ne
plafonne pas le total.

**Correctif**

1. Politique de rétention explicite : garder les N dernières versions par
   `(atome_id, particle_key)` **ou** une fenêtre temporelle, selon ce dont l'undo a besoin
   (voir `eVe/intuition/runtime/history_policy.js`).
2. Purge incrémentale en tâche de fond, pas un gros `DELETE` bloquant.
3. Idem pour `events` : agréger ou archiver au-delà de la fenêtre utile.
4. `PRAGMA optimize` / `VACUUM` périodique.

**Validation** — probe `temp/_probe_history_retention.mjs` sur une base temporaire :
écrire 10 000 versions, appliquer la purge, vérifier que l'undo sur la fenêtre conservée
fonctionne toujours et que le nombre de lignes est borné.

---

# P2 — Nettoyage et instrumentation

## [ ] P2-1 — Les fast paths échouent en silence

Trois chemins rapides existent et retombent sur la projection complète **sans trace** :

- [`project_scene_direct_motion_runtime.js:46-53`](../eVe/domains/rendering/project_scene_direct_motion_runtime.js:46) —
  `direct_motion_scene_busy` dès que `scheduler.rendering || scheduled || pending`. Or
  P0-2 fait que le scheduler est presque toujours occupé : **le fast path de drag est
  désarmé exactement quand il servirait**.
- `tryApplyProjectScenePrefixRecords` — le journal note qu'il n'a été pris **aucune fois
  sur 10 cycles**, bloqué par `runtime.projection.ok === false`, `virtualScene.byId`
  absent, `sceneState.surfaceOwnerProjectId === null`, `virtualScene.nodes.length === 0`.
- `tryApplyDirectEphemeralStyles` — repli silencieux vers `renderNow`
  ([`project_scene_invalidation_runtime.js:38-40`](../eVe/domains/rendering/project_scene_invalidation_runtime.js:38)).

**Correctif** : un compteur par `reason` de repli, exposé dans `window.__squirrelPerf`
(les `reason` sont déjà des chaînes stables : `direct_motion_scene_busy`,
`direct_motion_record_missing:*`, …). Un fast path qui n'est jamais pris est du code mort
coûteux ; il faut le voir avant de l'optimiser.

## [ ] P2-2 — 75 modules orphelins, dont 2,1 Mo d'Opal mort

Fermeture transitive depuis les 5 entrées réelles (`spark.js`, `application/index.js`,
`eVe.js`, `early-init.js`, `sw.js`), imports statiques **et** dynamiques **et** manifestes
`path:` du module loader : **1 148 atteignables / 1 221 fichiers → 75 orphelins,
13 185 lignes, 2 604 Ko**.

Les plus gros :

```
1641KB  atome/src/js/opal-parser.min.js
 434KB  atome/src/js/opal.min.js
 125KB  atome/src/wasm/squirrel_bevy_renderer.js     ← faux positif : chargé par URL
                                                     (bevy_web_renderer_module_loader.js:8)
  71KB  atome/src/js/gsap.min.js                     ← chargé par <script defer> dans index.html
  33KB  eVe/R&D/ATG.js
  17KB  atome/src/squirrel/calendar/node_protocol_clients.js
  15KB  eVe/intuition/tools/imports_exports/index.js
  14KB  atome/src/application/examples/leaflet.js    ← Leaflet est retiré (cf. index.html)
```

**Attention** : `gsap.min.js` et `squirrel_bevy_renderer.js` sont chargés hors graphe ESM
(`<script defer>` / URL WASM) — **ce sont des faux positifs, ne pas les supprimer**.
Les autres sont à vérifier un par un. Rappel : **ne pas exclure le fichier de définition
de la recherche d'appelants** (un appel intra-fichier compte), et **booter après chaque
suppression**.

Poids d'assets par ailleurs : `atome/src/assets/videos` 64 Mo (dont `superman.mp4` 58 Mo),
`assets/voice` 60 Mo (modèle ONNX 63 Mo), `assets/images` 28 Mo (PNG de 3 à 6,5 Mo non
optimisés). À sortir du bundle servi ou à charger à la demande.

## [ ] P2-3 — Reflow forcé + `JSON.stringify` par synchronisation d'overlay

[`bevy_ui_overlay_reconciliation.js:8-24`](../eVe/domains/rendering/bevy_ui_overlay_reconciliation.js:8) :

```js
export const overlayGeometrySignature = (surface, tree) => {
    const rect = surface?.getBoundingClientRect?.() || {};   // ← reflow forcé
    …
    return JSON.stringify({ … });                            // ← allocation de chaîne
};
```

Appelé au début de chaque `syncBevyUiTreeOverlay` (ligne 75). La taille du canvas est déjà
suivie par `surface_size_runtime.js` / `surface_runtime.js` (qui écoutent `resize` et
`visualViewport.resize`) — lire cette valeur au lieu de remesurer, et remplacer le
`JSON.stringify` par une clé de chaîne concaténée.

## [ ] P2-4 — Index SQLite redondant sur `particles`

[`database/schema.sql:85-88`](../database/schema.sql:85) :

```sql
UNIQUE(atome_id, particle_key)                                   -- index implicite
CREATE INDEX IF NOT EXISTS idx_particles_atome ON particles(atome_id);   -- préfixe du précédent
```

`idx_particles_atome` est un **préfixe strict** de l'index UNIQUE : il n'apporte rien en
lecture et coûte une écriture d'index de plus à chaque `INSERT`/`UPDATE` de particle —
c'est-à-dire à chaque frame persistée d'un geste. À supprimer après avoir confirmé les
plans avec `EXPLAIN QUERY PLAN` sur les requêtes de `database/adole.js` (`:706`, `:940`,
`:978`, `:1026`, `:1076`).

## [ ] P2-5 — 514 `console.*` hors bundles

Concentrés dans `atome/src/application/examples/` (42 dans `messages.js`, 39 dans
`audio_swift.js`, 35 dans `tables.js`…). Sur Safari/iOS, un `console.log` dans une boucle
d'événements est loin d'être gratuit. Router derrière le flag de debug déjà installé par
`squirrel/early-init.js` plutôt que de les laisser inconditionnels.

Voir aussi `atome/src/application/examples/audio_swift.js:422` :
`setInterval(processSendQueue, 10)` — un timer **100 Hz** jamais annulé.

---

---

## Fiabilité des mesures — à lire avant de chiffrer un gain

Les probes tournent **sous Node**, pas dans le navigateur avec le renderer WASM attaché.

- **La forme est fiable** : le caractère quadratique de P0-1, la reprojection intégrale par
  frame de P0-3, le polling de P0-4, les fuites de P1-4 sont tous **lisibles dans le code**.
  Ils ne dépendent pas de la mesure.
- **Les millisecondes absolues sont indicatives.** Le JIT navigateur, le GC et la pression
  mémoire réelle peuvent les déplacer dans les deux sens.
- Toute mesure dans l'app doit se faire dans un onglet **visible**. L'audit de juillet a
  été faussé une fois par `document.hidden === true` : rAF suspendu → `projection.ok:false`
  artefactuel. Les *durées*, elles, restaient valides.

**Ne pas annoncer un « X % plus rapide » avant d'avoir une mesure `?perf=1` avant/après sur
le même scénario, onglet visible.**

## Hors périmètre de cet audit

Ces coûts sont réels et **ne seront pas touchés** par les lots ci-dessus. Ils sont déjà
documentés ailleurs — ne pas les recompter dans le gain attendu :

| Coût | Où c'est traité |
|---|---|
| Upload GPU / transport JS→WASM des textures octet par octet (~1,8 s au cold start) | [`done/dashboard_performance.md`](../done/dashboard_performance.md) |
| Compile WASM (~0,82 s, déjà warmée) | audit juillet, `done/optimisations.md` |
| Taille du WASM Bevy (13,4 Mo brut / 3,4 Mo br) | déjà réduit 19,7 → 10,45 Mo en juillet |
| Ombres SDF re-rasterisées CPU côté Rust | [`done/dashboard_performance.md`](../done/dashboard_performance.md) |

Décomposition du cold start mesurée en juillet, pour situer les lots de ce document :
boot 0,9 s + eVe 0,64 s + **orchestration workspace ~1,5 s** + compile WASM 0,82 s +
projection Bevy 1,1 s. P0-1 et P1-1 attaquent les deux premiers postes et une partie du
troisième ; le reste est hors périmètre.

## Ordre d'exécution recommandé

```
P0-1  (aucune dépendance, aucun compromis de design, gain bloquant retiré
       à chaque ouverture de panel — commencer par là pour valider la méthode)
P0-4  (même latence que P0-1, l'autre bout : polling + repositionnements)
P0-2  (MESURER d'abord le taux de projections redondantes ; débloque P0-3 et P2-1 :
       tant que le scheduler est saturé, les fast paths restent désarmés)
P0-3  (dépend de P0-2 ; prioriser les panels à listes longues)
P1-3  (petit, sur le chemin de P0-3 — peut être fait avec)
P1-4  (isolé, petit)
P1-2  (isolé)
P1-1  (chantier de build, à part)
P1-5  (chantier DB, à part)
P2-*  (nettoyage, en dernier)
```

## Critères d'acceptation globaux

- [ ] Chaque lot a sa probe dans `./temp/`, rouge avant / verte après, contre le **vrai** module.
- [ ] Le boot passe sans erreur console après chaque lot (`?perf=1`, onglet **visible**).
- [ ] Panel `home` toujours monté à 130 nœuds ; menu principal toujours détecté après transition.
- [ ] Scroll inertiel sans saut sur une liste de 500 lignes.
- [ ] Drag d'outil et drag d'atome fluides, position finale correcte.
- [ ] Aucun commit, aucun push.
