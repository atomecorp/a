# Lecture contextuelle (Play) en mode Liste / Matrice — plan d'exécution

Date : 19 août 2026
Périmètre : outil **Lecture** de la barre contextuelle latérale, en modes **Liste** et **Matrice**, à tous les niveaux (projet → molecule → section → track → atome).

---

## 0. La documentation existe déjà — elle n'a pas été appliquée en entier

| Document | Ce qu'il verrouille |
|---|---|
| `todo/000_View Mode Correction.md` | **LE document de référence.** §8 Play contextuel (clic = contexte courant, clic long = options), §9 règles de lecture récursives (défaut / héritage / override), §10 lecture du contenu affiché, §11 tableau de cohérence List/Matrix, §15 état de navigation — qui liste explicitement `playback_rule`, §18 critères d'acceptation 16→20 |
| `todo/New work/atome_songlist_full_spec.md` | §17 sémantique par niveau (Songlist et Sections = séquentiel, Pistes d'une même Section = simultané), §22 outil contextuel Lecture, §32 Loop, §16 précision temporelle (le timing ne vient jamais des pixels), §12 preview d'une ligne (audio → lecture, texte/image → affichage) |
| `todo/New work/atome_toolbox_addons_spec.md` | Frontière toolbox fixe / zone temporelle : Lecture reste **contextuel** (rail droit), jamais un 10e outil fixe |

Le code référence déjà ce document par ses paragraphes (`project_view_navigation.js` : « §15 », `project_view_matrix_content.js` : « §11 », `project_view_footer.js` : « §2.3 »). **La correction de vue a donc été implémentée — mais elle s'est arrêtée juste avant §8 et §9.**

---

## 1. État réel du code (vérifié, pas supposé)

### Ce qui est fait
- **SSOT de navigation** : `eVe/domains/rendering/project_view_navigation.js` — pile `stack`, `current`, `parent`, `containerChildren()` récursif (projet / molecule / section / track / groupe). Conforme §15 **sauf `playback_rule`, absent**.
- **Parité Liste/Matrice** : `project_view_list_content.js` et `project_view_matrix_content.js` partagent navigation, sélection et `contextualTarget()`.
- **Bande basse** : `project_view_footer.js` — clic simple → contexte du conteneur (`{ context: true }` → `contextRuntime.openCurrentLevel()`), clic long / double-clic → renommage. Conforme §2.3 / §2.4.
- **Alimentation du rail** : `project_view_surface_context_runtime.js:71` `sync()` — si un item est sélectionné → `feedContextualRailWithRow`, sinon **retombe sur le NIVEAU courant**. C'est exactement le comportement demandé (« par défaut, ça sélectionne la liste ou la matrice complète du nom du projet »).
- **Sémantique séquentiel/simultané à l'intérieur d'une molecule** : `eVe/intuition/tools/molecule/runtime_transport.js` — `sectionOffsets()` pose les sections bout à bout, les tracks d'une même section partagent l'axe temporel. §17 est donc **déjà satisfait au niveau molecule**, au sample près.
- **Chaînage inter-molecules** : `runtime.js:396 toggleGroupTimelineListTransport` + `runtime_transport.js:176 toggleSequence` — construit une timeline unique avec offsets cumulés.
- **Lecture d'un atome média sélectionné** : `atome_edit_footer_model_runtime.js` `DEFAULT_TOOLS_BY_KIND` donne l'outil `play` aux kinds `video` / `sound` / `audio` / `group`, routé vers `domains/media/selected_project_media_playback_runtime.js`.

### Ce qui est cassé / manquant

| # | Constat | Preuve |
|---|---|---|
| **B1** | **Play ne fait rien au niveau projet.** `container_play` exige `level.ownerId`; au niveau projet `ownerId` vaut `''` (`project_view_navigation.js:34`) → retour `container_playback_unavailable`. C'est le symptôme signalé. | `project_view_surface_context_runtime.js:33-44` |
| **B2** | **Aucune règle de lecture n'existe nulle part.** `grep playback_mode / playback_rule / sequential / random` sur `eVe/` et `atome/src/` : **0 résultat**. §9 (défaut / héritage / override) n'a jamais été commencé. | grep |
| **B3** | **Pas de clic long sur les outils du rail.** `atome_contextual_edit_runtime.js:236` ne câble que `activate`; seules les palettes (`toolType: 'palette'`) s'ouvrent, et **au clic simple**. Donc §8.2 est absent. | `atome_contextual_edit_runtime.js:224-249` |
| **B4** | `toggleGroupTimelineListTransport` (le seul chaînage inter-objets existant) **n'est appelé par aucune UI** — uniquement par `intuition/tools/timeline_actions.js` et les tools IA. Et il ne chaîne que des molecules ayant **une session timeline ouverte** : il ignore les atomes simples. | grep appelants |
| **B5** | Un atome non temporel (texte, image, svg) n'a **aucun** outil de lecture, alors que §12 du spec Songlist demande « texte → affichage, image → affichage ». | `DEFAULT_TOOLS_BY_KIND` |

### Bonne nouvelle : l'infrastructure du clic long existe déjà
`eVe/domains/rendering/bevy_ui_pointer_runtime.js:126` — un nœud qui déclare un handler `long_press` arme un hold de 400 ms, et **supprime l'`activate`** au relâchement (ligne 198). `long_press` est un nom d'événement canonique (`bevy_ui_tree_normalization.js:49`). Il n'y a donc **rien à inventer côté gestes** : uniquement à câbler.

---

## 2. Architecture cible

Un seul moteur, quatre pièces, aucune duplication Liste/Matrice (les deux vues partagent déjà `containerChildren()`).

```
project_view_playback_rules.js     ← QUOI jouer et COMMENT (résolution + persistance)
project_view_playback_runtime.js   ← QUAND : file d'attente, séquentiel/layer/random/loop, stop
project_view_surface_context_runtime.js  ← câblage de container_play (existant, à corriger)
atome_contextual_edit_runtime.js   ← clic long → palette d'options (existant, à étendre)
```

### Règle de lecture — modèle
```js
{ mode: 'sequential' | 'layer' | 'random', loop: boolean }
```
- **Défauts par entité** (§17) : projet → `sequential` · molecule → `sequential` · section → `layer` (les pistes jouent ensemble) · track → `sequential` · groupe d'atomes → `sequential`.
- **Héritage** : override local, sinon override de l'ancêtre le plus proche dans `stack`, sinon défaut d'entité.
- **Persistance** — on calque le dispatch déjà en place pour le renommage (`project_view_surface_runtime.js:130 renameLevel`) :
  - projet → `Atome.commit({ kind:'set', atome_id: projectId, project_id: projectId, props: { playback_mode, playback_loop } })`. Vérifié : `sanitizeAtomeProperties` (`atome/src/shared/atome_contract.js:96`) laisse passer les propriétés inconnues par défaut.
  - atome conteneur / molecule owner → `window.eveToolBase.updateAtomeProperties(id, { playback_mode, playback_loop })`.
  - section / track → **sur le record de l'owner**, sous `playback_rules: { [section_id|track_id]: { mode, loop } }`. Choix délibéré : évite de toucher le schéma de timeline molecule et ses migrations, et garde **un seul lecteur**.

---

## 3. Lots d'exécution

### Lot 1 — Débloquer Play au niveau projet *(le bug visible)*
**Fichier** : `eVe/domains/rendering/project_view_surface_context_runtime.js`
- Supprimer la garde `if (!ownerId)` comme condition de sortie. Nouveau routage de `container_play` :
  - `level.entity ∈ {molecule, section, track}` → conserver `toggleGroupTimelineTransport` (déjà exact au sample, ne pas le réécrire) ;
  - `level.entity ∈ {project, atome-groupe}` → appeler le nouvel orchestrateur (Lot 3) ; en attendant celui-ci, chaîner via `toggleGroupTimelineListTransport` sur les molecules enfants après `openGroupTimeline` (même recette que `ensureTimelineOpen`, `project_view_list_content.js:312`).
- Critère : au niveau projet, sans sélection, Play ne renvoie plus jamais `container_playback_unavailable`.

### Lot 2 — Règles de lecture (§9)
**Nouveau** : `eVe/domains/rendering/project_view_playback_rules.js`
- `PLAYBACK_MODES`, `defaultModeFor(level)`, `resolveEffectiveRule({ level, stack, records })`, `readOverride(record, level)`, `writeOverride(level, { mode, loop })` (dispatch ci-dessus).
- Exposer la règle effective dans `readState()` de `project_view_navigation.js` (§15 demande `playback_rule` dans l'état) — en **lecture dérivée**, pas en second stockage.
- Aucune UI dans ce lot.

### Lot 3 — Orchestrateur de lecture
**Nouveau** : `eVe/domains/rendering/project_view_playback_runtime.js`
- `playLevel({ level, records, rule })` / `stop()` / `readPlaybackState()` + événement d'état (calqué sur `SELECTED_PROJECT_MEDIA_PLAYBACK_STATE_EVENT`) pour que l'outil s'allume.
- Enfants via `containerChildren(records)` — **jamais** une seconde résolution.
- Classement de chaque enfant :
  - molecule owner (`isMoleculeOwner`) → transport timeline ;
  - atome média (`audio` / `video` avec source) → `runSelectedProjectMediaPlaybackAction` ;
  - conteneur / groupe → récursion avec **sa propre** règle (§9) ;
  - autre → no-op (ou visualiseur, cf. Lot 5).
- Modes : `sequential` = chaînage sur fin réelle (durée molecule = `buildTransportTimeline().duration`, durée média = `state.durationSeconds`) · `layer` = démarrage simultané · `random` = permutation puis séquentiel (RNG **injectable**, sinon la probe n'est pas déterministe) · `loop` = relance en fin de file.
- **Raccourci exact** : si tous les enfants sont des molecules, déléguer à `transport.toggleSequence` — il fabrique une timeline unique et conserve la précision au sample (§16). Le scheduler générique ne sert qu'aux contenus mixtes.
- Second clic = stop (sémantique toggle déjà en place partout ailleurs).

### Lot 4 — Clic long → options de lecture (§8.2)
**Fichiers** : `atome_contextual_edit_runtime.js`, `project_view_surface_context_runtime.js`, `project_view_molecule_info.js`
- Ajouter aux définitions `container_play` / `molecule_play` un champ `longPressChildren` : `Séquentiel`, `Ensemble (layer)`, `Aléatoire`, `Boucle` (toggle).
- Dans la carte de handlers du rail (`atome_contextual_edit_runtime.js:236`), ajouter pour ces définitions :
  ```js
  long_press: () => { state.activePaletteKey = keyOf(definition.key); scheduleRender(); }
  ```
  et rendre `longPressChildren` par le chemin de palette **déjà existant** (`visibleDefinitions`, ligne 224).
- **Contrainte connue** : le rail n'ouvre qu'**un seul niveau** de palette → la liste d'options doit rester **plate**, pas de sous-palette.
- Le choix appelle `writeOverride` (Lot 2) sur le **niveau courant**, coche l'entrée active (`atome/src/assets/images/icons/check.svg` est déjà présent) et re-rend.
- Parité rail DOM (`atome_edit_footer_row_render_runtime.js`) : à faire ou à déclarer explicitement hors périmètre — la surface livrée est le rail Bevy.

### Lot 5 — Lecture d'un item sélectionné (§8.1, §12) *(optionnel)*
- Média audio/vidéo sélectionné : déjà couvert, **à vérifier seulement**.
- Molecule/section/track sélectionnée : `molecule_play` fonctionne déjà.
- Texte / image / svg : router `play` vers le Visualiseur (§12 Songlist : « texte → affichage »). Nécessite d'ajouter `play` dans `DEFAULT_TOOLS_BY_KIND` pour ces kinds. **À valider avant de coder** — c'est le seul point où le spec Songlist va plus loin que `000_View Mode Correction.md`.

---

## 4. Validation (probes ciblées, pas la suite de tests du repo)

Une probe par lot, écrite et exécutée dans `./temp`, **rouge d'abord** :
1. `resolveEffectiveRule` : défaut, héritage sur 3 niveaux, override local qui gagne.
2. Orchestrateur : ordre séquentiel exact ; `layer` démarre tout dans le même tick ; `random` couvre chaque enfant une fois (RNG injecté) ; `loop` relance.
3. **Non-régression B1** : `container_play` au niveau projet renvoie `ok:true` (la probe doit échouer sur le code actuel avec `container_playback_unavailable`, sinon elle ne prouve rien).
4. Clic long : la carte de handlers du rail expose bien `long_press` sur `container_play`, et la sélection d'une option persiste l'override.

Puis vérification dans l'app réelle (session anonyme, appui long sur l'en-tête Projets = nouveau projet, onglet neuf plutôt que reload).

---

## 5. Ordre et points d'attention

Lot 1 → Lot 2 → Lot 3 → Lot 4 → (Lot 5 après validation). Le Lot 1 rend l'outil vivant tout de suite ; les Lots 2-3 lui donnent sa sémantique ; le Lot 4 l'expose.

- **Tout le code touché est dans le sous-module `eVe/`** (sauf éventuellement `atome_contract.js`, qui n'a pas besoin de bouger). Ne pas faire de `git stash` depuis le parent.
- Ne pas dupliquer la logique Liste ↔ Matrice : les deux vues passent déjà par `containerChildren()` et `contextualTarget()`.
- Le timing canonique reste dans le moteur (§16) : ne jamais dériver une durée de la géométrie affichée.
- Valider une découpe par **import ESM de l'entry**, pas seulement `node --check`.

---

# Journal d'exécution — 19 août 2026

Les 6 symptômes remontés à l'usage ont été traités. Décisions retenues : double-clic
sur un atome simple → page de détail **sans** créer de molecule (remplace la règle
§5 d'enveloppement) ; Matrice → grille collée en bas ; clic simple → rail seul.

| Lot | État | Ce qui a changé |
|---|---|---|
| 1 — clic simple : rail seul | **fait** | `railOnly` traverse `boot_runtime` → `atome_edit_footer_runtime` → `atome_contextual_edit_runtime` ; `feedContextualRailWithRow` le pose. Le cadre d'édition, ses poignées et sa barre flottante ne sont plus dessinés en Liste/Matrice. |
| 2 — ancrage bas | **fait** | `projectViewBodyAnchor` dans `project_view_surface_runtime.js` : une seule implémentation, partagée par la Liste et la Matrice (§11). |
| 3 — la lecture joue | **fait** | Échecs d'outils journalisés au lieu d'être avalés par `void` ; la timeline est ouverte avant d'être jouée ; `project_view_playback_rules.js` (défaut/héritage/override, §9) ; `project_view_playback_runtime.js` (séquentiel / ensemble / aléatoire / boucle) ; appui long sur Lecture → 4 options ; `container`/`molecule` enregistrés dans `familyByPaletteKey`. |
| 4 — double-clic = détail | **fait** | Niveau de navigation `detail` + `project_view_atome_detail_content.js` (rendu par `recordPreviewNode`, propriétaire canonique). L'enveloppement en molecule est retiré des deux vues. |
| 5 — clic footer désélectionne | **fait** | `clearSelection()` sur les deux contenus, puis `contextRuntime.sync()` au lieu de `openCurrentLevel()` — `railSignature` reste cohérente. |
| 6 — footer perdu | **fait** | Un changement de CIBLE du rail ne relance plus de rendu (seuls visibilité et main comptent) ; reprise garantie si un rendu reste en attente après la libération de `renderPromise`. |

## Vérification

7 probes dans `./temp`, 44 assertions, toutes vertes ; les 16 modules touchés
s'importent en ESM (le lien, pas seulement `node --check`).

**Non vérifié en application réelle** : le workspace ne s'ouvre pas dans cet
environnement (`workspace_boot_open_timeout`, puis aucun projet actif), la file de
synchronisation attendue sur `127.0.0.1:3000` n'y tournant pas. Aucune erreur
console au démarrage, mais les six comportements n'ont pas pu être exercés à la
main. À refaire dès que l'environnement ouvre un espace de travail.

## Restes connus

- Un **atome-groupe** enfant n'est pas encore joué en propre (pas de timeline) :
  il est explicitement compté comme sauté, jamais ignoré en silence.
- L'outil Lecture ne montre pas encore visuellement qu'il joue : l'événement
  d'état existe (`eve:project-view-playback-state`), le rail ne s'y abonne pas.
- Icônes des options de lecture choisies parmi celles qui existent
  (`sequence`, `group`, `matrix2`, `redo`) ; ce sont les libellés qui portent le sens.

---

# Journal d'exécution — 2ᵉ tour : rendre la lecture VISIBLE

Décisions retenues : la lecture **éclaire** sans voler la sélection ; la bande basse
active allume aussi tout le contenu, discrètement ; l'image bouge dans le panneau
Visuel **et** sur la vignette du seul objet en cours ; le Visuel occupe le tiers
supérieur et montre la forme d'onde d'un son.

| Lot | État | Ce qui a changé |
|---|---|---|
| A — identité de lecture qui survit à la projection | **fait** | La projection d'overlay réécrivait l'identifiant du record avec celui du nœud : ni la progression audio ni le décodeur vidéo ne retrouvaient l'atome. Un aperçu déclare désormais `playback_source_atome_id`, le contrat de scène le préfère, et `bevyUiOverlayRecordId` est exporté au lieu d'être recopié. **C'est la vraie raison pour laquelle les vignettes ne bougeaient pas.** |
| B — éclairage de lecture | **fait** | La file publie `playingIds` (un seul en séquentiel/aléatoire, tous en mode ensemble) ; ligne et tuile ont un état `playing` distinct de la sélection, teintes dans `panel_skin.js`. La sélection de l'utilisateur n'est jamais touchée. |
| C — bande basse active | **fait** | Sans objet sélectionné, la bande s'allume et tout le contenu prend la teinte `scoped`. Déduit de `contextualTarget() === null` : aucun second état à tenir. |
| D — temporisation des objets fixes | **fait** | Image, texte, dessin sont classés `still` et tenus **2 s** au lieu d'être traversés ; `playback_dwell_seconds` sur l'objet l'emporte, pour que l'option à venir n'ait rien à réécrire. |
| E — outil et panneau Visuel | **fait** | `container_visual`, **actif par défaut**, dans le rail du niveau ; `project_view_visual_panel.js` occupe le tiers haut et montre ce qui joue, sinon ce qui est sélectionné. Le rail sait enfin peindre un outil à bascule enfoncé. |
| F — la vidéo joue | **fait** | Le lecteur média refusait toute vidéo (`selected_project_video_timeline_required`) faute de branchement. La file le fournit et pilote `setBevyVideoDecodePlayback` sur la surface du Visuel — le même moteur que l'outil Play principal. |
| Miroirs de tête de lecture | **fait** | `project_scene_invalidation_runtime.js` distribue la progression aux records qui déclarent montrer un autre atome, via un index reconstruit seulement quand la scène change (la progression bat 20 fois par seconde). |

## Vérification

10 probes dans `./temp`, **76 assertions vertes**, écrites contre les vrais
constructeurs de nœuds, le vrai contrat de scène et le vrai index de miroirs ;
24 modules touchés s'importent en ESM.

**Toujours pas vérifié en application réelle** : le démarrage s'arrête sur
`remote_account_not_provisioned` (compte non provisionné sur ce backend), en amont
de tout ce qui a été modifié. Aucune erreur console.

## Restes connus

- La vignette d'un objet joué anime sa forme d'onde ; une **vidéo** en vignette
  n'anime pas (le décodeur est indexé par un nœud virtualisé, qui se détruit au
  défilement). L'image vidéo bouge dans le Visuel, comme convenu.
- L'outil Lecture ne montre toujours pas qu'il joue : `eve:project-view-playback-state`
  existe, le rail ne s'y abonne pas encore.
- Un atome-groupe enfant reste compté comme sauté, jamais joué en propre.

---

# Journal d'exécution — 3ᵉ tour : corrections, glisser-déposer, Z-index

| Lot | État | Ce qui a changé |
|---|---|---|
| 1 — bande basse visible | **fait** | Jeton `footerMaterial.activeBackground` opaque, et le voile du backdrop retiré quand la bande est choisie : la teinte translucide de sélection se faisait manger par lui. La projection d'overlay ne connaît pas les bordures — le contraste ne peut venir que du fond. |
| 2 — la vidéo joue | **fait** | `setBevyVideoDecodePlayback` enregistre la demande AVANT de chercher le décodeur, et `syncBevyVideoDecodeSources` démarre une entrée déjà demandée à sa création. Une demande n'est plus perdue parce qu'elle arrive une frame trop tôt — le cas normal dès qu'une surface d'interface montre une vidéo. |
| 3 — images et textes | **fait** | Deux asymétries réelles, trouvées en poussant de vrais aperçus dans le pipeline : la reconnaissance par le FICHIER n'existait que pour le SVG (un PNG non typé n'avait aucun aperçu et n'était jamais texturé), et un texte rangé sous `content`/`value` était affichable mais déclaré sans aperçu. Les deux passent maintenant par `inferUploadAtomeType`, propriétaire canonique. En prime : une texture média qui échoue n'est plus abandonnée en silence, elle se nomme une fois dans la console. |
| 5 — outil Z-index | **fait** | Palette plate `z_order` (Devant / Monter / Descendre / Derrière) et quatre actions d'outil enregistrées. Les valeurs viennent de `project_scene_stack_runtime`, seul à savoir borner sous la bande Dashboard. « Un cran » est un ÉCHANGE de rang avec le voisin — ajouter une unité au z du voisin laissait deux objets à égalité. Le mode Naturel n'a pas été touché. |
| 4 — glisser : réordonner ou absorber | **fait** | Le glisser accepte enfin atomes et molecules. En mouvement il réordonne, et l'ordre devient durable (`hierarchy_order` sur l'objet) donc il survit au rechargement et la Matrice le suit. À l'arrêt sur une cible (500 ms) elle absorbe : molecule → la source devient une de ses pistes ; atome ordinaire → il devient une molecule et les deux s'y retrouvent. Aucune mécanique nouvelle : `wrapAtomeInGroupTimeline` faisait déjà les deux. L'aperçu change de teinte avant le lâcher. |

## Vérification

14 probes dans `./temp`, **116 assertions vertes** ; 33 modules touchés s'importent
en ESM. La forme réelle des enregistrements (image, texte, forme) a été lue dans
`database_storage/adole.db` plutôt que supposée.

**Toujours pas vérifié à l'écran** : le démarrage s'arrête sur
`remote_account_not_provisioned`, en amont de tout ce qui a été modifié.

## Restes connus

- Glisser de tuile en Matrice (elle montre l'ordre, ne le change pas).
- Une vidéo en vignette de liste n'anime pas — décodeur attaché à un nœud
  virtualisé, qui se détruit au défilement. L'image bouge dans le Visuel.
- L'outil Lecture ne s'allume pas pendant qu'il joue.
- Un atome-groupe enfant est compté comme sauté, jamais joué en propre.
- ~~**Dette** : `project_view_list_content.js` atteint 713 lignes~~ → **réglée** :
  découpé en trois, 713 → **451 lignes**. `project_view_list_drag_runtime.js` (206 L)
  porte la machine à états du geste — réordonner, absorber, déplacer une section ;
  `project_view_list_view.js` (132 L) porte le dessin. Les deux reçoivent un
  contrôleur partagé et résolvent leurs dépendances à l'APPEL, ce qui évite l'ordre
  de définition impossible entre un contenu et ses deux moitiés. Chacun refuse un
  contrôleur incomplet en nommant ce qui manque, plutôt que de casser plus loin.
  Aucun changement de comportement : les 116 assertions existantes restent vertes,
  plus 7 nouvelles sur la découpe elle-même.

---

# Journal — 4ᵉ tour : visualiseur et menu flower

| Point | État | Ce qui a changé |
|---|---|---|
| Ratio déformé | **corrigé** | Les enregistrements portent leurs tailles en chaînes CSS (`"333px"`). Le moteur les lit avec `parseFloat`, le module d'aperçu les lisait avec `Number` : il obtenait `NaN`, concluait « taille inconnue » et renonçait au cadrage proportionnel — donc étirait. Même lecture des deux côtés. Panneau, tuile et ligne s'accordent désormais sur le même rapport. |
| Rien dans le visualiseur | **piste corrigée** | Le panneau demandait son aperçu avec un `placeholder` que la tuile ne demande pas : un carré gris indiscernable d'un aperçu absent. Il demande maintenant exactement ce que demande la tuile de la Matrice, qui fonctionne. |
| Vidéo figée sur Tauri | **instrumenté, non deviné** | Aucune modification de la route vidéo native (`NATIVE_TEXTURE_KINDS`, côté Rust) : elle marche ailleurs. Trois traces nommées, une par cause, là où la demande peut mourir — demande sans décodeur, décodeur créé, lecture refusée. Le prochain lancement nommera la cause. |
| Flower hors écran | **corrigé** | `openAt` résolvait le centre avant la surface : le menu s'ouvrait tel quel, donc à moitié dehors près d'un bord. La surface est résolue d'abord, et le centre est ramené pour que toute la corolle (rayon + un pétale, 175 px) tienne. Une surface plus petite que la corolle la centre au lieu de la coller à un bord. |
| Flower sur un item du Dashboard | **fait** | Quatre verbes — information, supprimer, renommer, dupliquer — sur **appui long**, pas sur clic simple : le clic simple ouvre déjà un projet, un événement ou l'éditeur de libellé. Aucun verbe n'est réécrit : `ui.delete.selection` et `ui.duplicate` acceptent déjà une cible explicite, le panneau Info a son ouverture, et renommer passe par l'éditeur de libellé du Dashboard. Le geste réutilise la machine à états d'appui long des en-têtes plutôt qu'une seconde. |

## Vérification

167 assertions vertes, 44 modules liés en ESM. Le Lot ratio touche un module
partagé par la ligne, la tuile et le panneau : les probes existantes des trois
surfaces restent vertes.

## Vignettes vidéo : le travail pour rien

Toute vidéo cachée était créée avec `preload = 'auto'`, puis `load()`. Une vignette
de 26 px téléchargeait donc le fichier **entier** — dix vidéos dans une liste, dix
téléchargements complets pour dix carrés. La première image, elle, ne vient pas du
préchargement mais du seek fait juste après la création : `metadata` suffit.

Le défaut passe à `metadata`, et une surface dont la lecture est déjà demandée
charge d'emblée. `applyEntryPlayback` remonte à `auto` dès que la lecture démarre —
la mécanique existait, elle n'était simplement jamais le point de départ.

La trace `decoder_created` a été retirée : elle parlait du fonctionnement normal.
`play_refused` et `requested_before_decoder` restent — elles ne parlent qu'en panne.

## « métadonnées en attente », pour toujours

Une vidéo ne porte pas ses dimensions réelles dans son enregistrement : elles
n'existent qu'une fois le fichier ouvert. Le moteur les découvrait bien, et les
écrivait sur le record de **scène**. Mais un aperçu projeté est reconstruit à chaque
rendu depuis les propriétés de l'**atome** — la découverte était donc effacée au
rendu suivant, et la projection de la vidéo refusée à chaque fois
(`bevy_media_texture_video_metadata_pending`). Une boucle qui ne convergeait jamais.

La taille découverte est désormais retenue **par source** — le même fichier a les
mêmes dimensions quelle que soit la surface qui le montre — et réinjectée à chaque
reconstruction de l'aperçu. Même mécanique que la durée audio, déjà retenue ainsi.
Effet de bord bienvenu : le ratio d'un aperçu vidéo suit enfin la vidéo.

## Restes

- `bevy_video_decode_source_runtime.js` fait 511 lignes (norme 500). Il dépassait
  déjà avant l'instrumentation ; je ne l'ai pas découpé, n'y ayant ajouté que des
  traces.
- Le menu du Dashboard est sur appui long. Si le clic simple est vraiment voulu, il
  faudra décider ce que devient l'ouverture de projet, qui l'occupe aujourd'hui.

---

# Journal — 5ᵉ tour : la vidéo ne partait jamais, et Lecture ne disait pas qu'il jouait

Deux symptômes, une même famille de cause : **personne ne demandait à la vidéo de
jouer**, et **personne ne disait que ça jouait**.

## Pourquoi la vidéo ne s'affichait pas en Liste / Matrice

Une vidéo n'est jamais texturée comme une image : elle est dessinée en texture
externe depuis un `<video>` caché, et une entrée **non activée** reste en
`preload='metadata'`, en pause — donc sous `HAVE_CURRENT_DATA`, donc **rien à
dessiner**.

- En **Naturel**, `media_reader_tool_runtime` active le décodeur avec les
  **identifiants d'atome**, qui sont exactement ceux des nœuds de scène. Ça joue.
- En **Liste / Matrice**, le seul pilote demandait la surface à
  `projectViewVisualPanel.videoNodeIdsFor`, qui refuse tant que le sujet du Visuel
  n'est pas l'objet concerné. Or la file **annonçait l'objet APRÈS l'avoir
  démarré**, et le sujet n'était posé qu'au rendu suivant : au moment de la
  demande, la réponse était « nulle part ».

L'échec était **muet** : sans cible, `projectTimelineAction` répondait quand même
`ok: true`. Le lecteur média concluait que la vidéo jouait, sa piste audio partait
bel et bien — d'où l'impression que ça marchait — et son image ne démarrait
jamais. C'est aussi pourquoi rien n'est jamais remonté en console.

Preuve par l'asymétrie, mesurée : sur le code d'avant, la probe montre
`{"ids":["v1"],"targets":0}` au **démarrage** puis `targets:1` à l'**arrêt**.
L'arrêt résolvait la surface, le démarrage non.

Le 2ᵉ tour affirmait « l'image bouge dans le Visuel ». **Elle n'a jamais bougé.**

| Lot | État | Ce qui a changé |
|---|---|---|
| 1 — annoncer avant de démarrer | **fait** | `setPlayingIds` passe AVANT `startItem` (séquentiel et ensemble), et l'événement pose le sujet du Visuel **synchronement**, plus au rendu suivant. La demande porte enfin le bon identifiant ; le mécanisme d'attente (`requestedActiveIds`) fait le reste. |
| 2 — les trois surfaces, pas une | **fait** | Le résolveur combine l'identifiant **calculé** du Visuel (pur, donc utilisable avant le rendu) et `playbackMirrorsFor`, l'index déjà écrit pour la tête de lecture audio. Vignette de ligne et tuile de Matrice sont couvertes par la même règle — c'était le reste connu « une vidéo en vignette n'anime pas », attribué à tort au défilement. |
| 3 — l'échec est visible | **fait** | Zéro surface résolue pour une lecture = `ok:false` + `project_view_video_surface_unresolved`, nommé une seule fois en console. Un arrêt sans cible reste un succès : il n'y avait rien à couper. |
| 4 — clé de la taille naturelle | **fait** | Mémorisée sous la source **routée**, elle était relue sous la source **brute** : les deux ne coïncident que pour `/assets/…`. Pour un enregistrement réel (`…/api/recordings/x.mp4?media_user_id=…`) la découverte n'était jamais retrouvée — l'aperçu gardait le ratio de sa BOÎTE (mesuré : 50×200 au lieu de 200×112,5). Les deux clés sont tentées, la routée d'abord. |
| 5 — Lecture ↔ Stop | **fait** | `container_play` porte son état : `stop` + libellé Stop + outil enfoncé pendant la lecture. Le rail est réalimenté sur `eve:project-view-playback-state`. Le transport d'une molecule n'est pas réécrit, son **état** est adopté (`adoptDelegatedTransport`) pour qu'il n'y ait qu'un propriétaire. Un clic pendant la lecture arrête tout : file, transport délégué, et média lancé depuis l'outil d'un atome. |
| — commentaire trompeur | **corrigé** | « la première image vient du seek fait juste après la création » est faux : à `t=0` le seek est un no-op (écart sous 25 ms). Elle vient de `metadata` + `loadeddata`. Ce commentaire a coûté deux diagnostics. |

## Vérification

3 probes dans `./temp`, **33 assertions vertes**, et 9 modules liés en **ESM**
(le lien de l'entrée, pas `node --check`).

Chaque correctif a été mesuré **rouge d'abord**, en remettant le code d'origine :
3 échecs sur l'ordre d'annonce et l'échec masqué, 6 sur la clé de taille naturelle
et sur Lecture/Stop.

Probes existantes du domaine : 11 vertes. **4 rouges, toutes antérieures** —
`project_view_footer`, `project_view_matrix`, `project_view_list` et
`contextual_rail_views` cherchent des symboles (`releaseContainerRail`,
`syncContextualRail`, `state.railContainerId`, `ATOME_CONTEXTUAL_EDIT_CHANGED_EVENT`)
que l'extraction du 3ᵉ tour a **déplacés** dans `project_view_surface_events.js` et
`project_view_surface_context_runtime.js`. Le diff de ce tour ne touche aucune de
ces lignes. À remettre à jour, elles ne prouvent plus rien.

**Non vérifié à l'écran** : l'environnement n'ouvre pas d'espace de travail ici.
Le diagnostic à faire au premier lancement, console ouverte, Liste + Visuel
déployé, lecture lancée :

```js
const id = '__eve_bevy_ui_eve_bevy_ui_project_view_project_view_visual_preview_visual';
({ presentable: window.__EVE_BEVY_VIDEO_PRESENTABLE_FOR_ID__?.(id),
   active: window.__EVE_BEVY_VIDEO_ACTIVE_FOR_ID__?.(id) })
```

Attendu : `active: true` et `presentable: true`. Si `active` est faux, la demande
ne part toujours pas ; si `presentable` est faux alors qu'`active` est vrai, c'est
le décodeur qui ne rend pas de frame (piste `preload`, distincte).

## Restes connus (mis à jour)

- ~~Une vidéo en vignette de liste n'anime pas~~ → couvert par le résolveur de
  miroirs, **à confirmer à l'écran** (la virtualisation détruit le nœud au
  défilement : l'entrée est alors retirée puis recréée).
- ~~L'outil Lecture ne s'allume pas pendant qu'il joue~~ → **réglé**.
- Un atome-groupe enfant reste compté comme sauté, jamais joué en propre.
- L'outil Lecture d'un **atome sélectionné** (`play` du rail) dépend de
  `activeSelectionIds`, que la sélection en Liste/Matrice ne publie pas : le tour
  suivant devra vérifier que cet outil apparaît bien sur une vidéo sélectionnée.
- Glisser de tuile en Matrice (elle montre l'ordre, ne le change pas).
- Les 4 probes périmées ci-dessus.

---

# Journal — 6ᵉ tour : le texte n'apparaissait pas dans le Visualiseur

La vidéo joue désormais dans le Visualiseur, le texte n'y apparaissait pas.

## Ce que ce n'était pas

Vérifié en poussant le vrai enregistrement de texte (lu en base) dans le vrai
pipeline, pas en supposant :

- l'aperçu EST construit (`hasRecordPreview` vrai, géométrie `kind: 'text'`) ;
- le record projeté EST de type `text`, avec son contenu, sa taille remise à
  l'échelle du cadre et sa couleur ;
- la texture EST peinte : `fillText("Fixture code")` à l'intérieur du cadre, aux
  trois tailles — panneau 1000×300, tuile 104×104, vignette 26×26.

Tout était donc correct jusqu'au diff de scène.

## La cause

**Le diff de scène ne recrée jamais une entité dont le TYPE change.**
`pushUpdateOps` compare la transformation, le style, le contenu, le texte — mais
jamais `kind`. Or le Visualiseur n'a qu'UN identifiant de nœud
(`…project_view_visual_preview_visual`) et lui fait montrer tantôt une vidéo,
tantôt une image, tantôt un texte.

Le renderer, lui, branche sur le type que l'entité avait **à sa création** :
pousser un texte sur une entité image ne dessine rien. Pire, `updateResource` est
explicitement sauté quand la cible est un texte — sa texture n'était donc même pas
demandée. Mesuré, avant correctif :

```
image -> text  (kind image -> text)   ops: updateTransform, updateStyle, updateText, updateAccessibility
video -> text  (kind video -> text)   ops: updateTransform, updateStyle, updateText, updateAccessibility
image -> video (kind image -> video)  ops: updateResource
```

Aucun `despawn`/`spawn`. L'entité restait ce qu'elle était au premier affichage —
c'est pourquoi le premier type montré marchait et les suivants non.

Ce n'est pas un cas de bord du panneau : **une ligne virtualisée réemploie son
identifiant en défilant**. Une liste mêlant images, sons et textes tombait sur le
même mur.

| Lot | État | Ce qui a changé |
|---|---|---|
| Diff de scène : le type fait partie de l'identité | **fait** | `diffVirtualSceneTrees` émet `despawn` + `spawn` quand `before.kind !== after.kind`, au lieu de patcher une entité du mauvais type. Une seule règle, à l'endroit qui appartient à tout le monde — le panneau, les lignes et les tuiles en profitent sans rien savoir. |

Le décodeur vidéo n'est pas perturbé : l'identifiant ne change pas, donc
`syncBevyVideoDecodeSources` conserve son entrée sur un re-spawn, et la retire
seulement quand le nœud cesse d'être une vidéo.

## Vérification

Probe `visual_panel_kind_change_probe.mjs` : 4 transitions
(image→texte, vidéo→texte, texte→vidéo, image→vidéo), **rouges d'abord** sur les
quatre, vertes après. Deux probes d'instruction préalables gardées comme preuve
que la projection et la texture, elles, étaient saines
(`visual_panel_text_probe.mjs`, `visual_panel_text_texture_probe.mjs`).

Sweep de non-régression : **18 probes vertes, 0 rouge** (lecture, aperçus, ratio,
rails, extraction de liste, requêtes vidéo, taille naturelle), plus le lien ESM.

---

# Journal — 7ᵉ tour : rendre la panne audible

Le texte ne s'affiche toujours pas dans le Visualiseur. **Correction du 6ᵉ tour** : le
changement de `kind` dans le diff de scène était un vrai bug, **mais pas celui-ci**.
Et l'hypothèse « atome texte vide » est écartée par l'usage : le système supprime tout
atome texte sans contenu à la sortie d'édition.

## Ce qui a été exercé et éliminé

Aperçu construit · record projeté bien de type `text` avec son contenu · **texture
réellement peinte** (`fillText` du texte, dans le cadre, en 1743×270, 104×104 et
26×26, sous un canvas 2D instrumenté) · diff correct · `updateText` re-rasterise ·
le spawn texture le texte · Rust dessine le sprite. Tous ces maillons sont bons.

Le « Text » en gros sous le panneau est le **fil d'Ariane** de la liste, pas un aperçu.

## Pourquoi le diagnostic était impossible

Trois verrous, chacun un défaut en soi, mesurés rouges :

1. **`text` n'était pas rattrapable.** `canSkipTextureFailure` n'acceptait que
   `{image, video, audio_waveform}` — une étiquette illisible relançait donc l'erreur.
2. **Le filet ne couvrait que la RÉSOLUTION** (`bevy_media_texture_*`). La
   **projection** jette les siennes juste après, dans le même `try`
   (`bevy_projection_texture_rgba_length_invalid`…) : elles passaient à travers.
   Mesuré : **un seul** nœud fautif faisait rejeter le lot entier — 0 nœud appliqué
   sur 3.
3. **Le rendu mort était avalé sans un mot** (`catch(() => null)` dans
   l'ordonnanceur). L'échec était rangé dans `lastError` et personne ne le lisait.

Cumulés : une texture fautive tue tout le rendu de la vue **en silence**, la dernière
image valide reste à l'écran, et la sélection continue de s'allumer parce qu'elle passe
par le chemin de patch ciblé, qui ne remappe aucun spawn. C'est exactement le
screenshot — et c'est pourquoi deux tours ont conclu juste sur la forme et faux sur la
cause.

| Lot | État | Ce qui a changé |
|---|---|---|
| A1 — `text` rattrapable | **fait** | `MEDIA_TEXTURE_KINDS` accueille `text`. Portée vérifiée : `isMediaTextureKind` n'a qu'un appelant. `PENDING_DEFERRED_MEDIA_KINDS` n'est pas touché — différer une texture de texte la ferait apparaître en retard. |
| A2 — le filet couvre la projection | **fait** | `SKIPPABLE_TEXTURE_ERROR` = `bevy_(media_texture\|projection_texture)_*`. Le nœud fautif est sauté et **nommé**, les autres s'appliquent. |
| A3 — un rendu mort se nomme | **fait** | `reportRenderFailure` dans l'ordonnanceur, au point où l'erreur est captée — donc valable pour `schedule` comme pour `renderNow`, quels que soient les `catch(() => null)` des appelants. Une cause n'est dite qu'une fois. |

Ce lot ne corrige pas l'affichage du texte. Il fait parler la seule chose qui ne
parlait pas, et répare trois vrais défauts au passage.

## Vérification

Probe `texture_failure_is_audible_probe.mjs`, **rouge d'abord** (8 échecs sur le code
d'avant), verte ensuite — écrite contre le vrai `createBevyMediaResourceRuntime` et le
vrai ordonnanceur, avec un résolveur de textures injecté qui jette.

Sweep de non-régression : **21 probes vertes, 0 rouge**, plus le lien ESM.

## Prochaine étape — le diagnostic

Relancer, passer en Liste, sélectionner la ligne `Text`, lire la console.

- **Une cause nommée** (`[eVe] bevy_media_texture_skipped text …` ou
  `[eVe] project_scene_render_failed …`) → la cause est identifiée, le correctif suit.
- **Console muette et texte toujours absent** → le rendu n'échoue pas, donc le contenu
  n'arrive pas jusqu'à l'aperçu ; la ligne de vérification de la donnée est dans le
  plan (`window.Atome.listStateCurrent`).

---

# Journal — 8ᵉ tour : mesurer sur les VRAIES données

Le Lot A a servi : les logs sont muets sur le texte et sur les formes d'onde. Ni
texture en échec, ni rendu mort. Les deux branches « ça plante » sont closes.

## Ce qui a enfin été mesuré, et non déduit

Le store du Tauri n'est pas celui du dépôt — il est dans
`~/Library/Application Support/com.squirrel.desktop/squirrel/Data/adole.db`. En le
lisant, on obtient enfin les vrais enregistrements.

**L'atome texte** (`atome_1787139230950_f085c5ab9147f`) :
`text = "Hello jeezs"`, `rich_text = {"spans":[],"version":1}`, `width = 93`
(nombre, pas `"93px"`). Poussé tel quel dans la chaîne complète — `recordPreviewNode`
→ projection d'overlay → scène virtuelle → `drawTextTexture` — **dans un vrai
navigateur, avec un vrai canvas** : la texture du panneau fait 3486×540 et porte
**243 572 pixels encrés**. Le JS est donc juste de bout en bout, sur la vraie donnée.

**Les deux fichiers audio** se servent (HTTP 200) et se décodent tous les deux :
`riff_3.m4a` en 2574 ms, l'enregistrement en **21 ms avec 252 points non nuls**. Les
points de la forme d'onde absente sont donc calculés correctement, et vite.

Conclusion commune : pour le texte comme pour la forme d'onde, **la texture est
produite et correcte ; elle meurt entre la texture et l'écran.** Fait notable : celle
qui met 2,5 s s'affiche, celle qui met 21 ms non — une inversion qui sent la course,
pas la panne de calcul.

| Lot | État | Ce qui a changé |
|---|---|---|
| Surbrillance | **corrigé** | Un état de ligne TEINTAIT en remplaçant : `scopedBackground` est à 20 % d'opacité quand une ligne au repos est opaque. « Tout sélectionner » ne surlignait donc pas la liste, il la rendait **transparente** — elle pâlissait au lieu de s'allumer. `panelStateBackground` compose l'état sur le fond et rend une couleur opaque ; appliqué aux lignes **et** aux tuiles de Matrice. |
| Rejet différé muet | **nommé** | Une texture différée qui aboutit puis se fait jeter était le pire cas : travail fait, objet vide, silence. `bevy_media_texture_deferred_discarded` dit désormais le nœud et la raison (`noeud_absent_de_la_scene` / `contenu_change_depuis`), une fois par nœud. |
| Lisibilité d'un aperçu texte 26 px | **mesuré, non modifié** | À 6 px, « Hello jeezs » n'encre que 191 pixels sur 2704 (7 %) — indiscernable d'une vignette absente. Monter le plancher à 11 px porte l'encre à 297 px et rend le début lisible, **mais casse le contrat « le texte entier tient en largeur »** que `record_preview_probe` verrouille. C'est un arbitrage de conception, pas un correctif : la mesure est consignée dans le code, le changement n'est pas pris. |

## Vérification

Probe `list_states_and_text_legibility_probe.mjs`, **rouge d'abord** (4 échecs :
trois états translucides, un plancher), verte ensuite.

`lot7_playback_feedback_probe` a été mis à jour : il comparait la teinte de ligne à la
valeur **brute** du jeton, c'est-à-dire qu'il verrouillait précisément la version
translucide qui faisait pâlir la liste. Il vérifie maintenant l'intention — teinte du
skin, composée, opaque.

Sweep : **23 probes vertes, 0 rouge**.

## Ce qui reste, et ce qu'il faudra regarder

Le texte et la forme d'onde d'enregistrement ont une texture correcte qui n'arrive pas
à l'écran. Les deux prochaines pistes, dans l'ordre :

1. le rejet différé, désormais nommé : s'il apparaît pour la forme d'onde, la course
   est confirmée et le correctif est dans `deferredNodeIsCurrent` ;
2. l'environnement de mesure a manqué : le renderer Bevy ne démarre pas dans le
   panneau navigateur (`bevy_renderer_initial_present_timeout`), donc aucun test de
   pixels n'a pu être fait ici. Le prochain tour doit se faire dans l'app réelle.

---

# Journal — 9ᵉ tour : la route qui peint, la garde qui ne sert à rien, le bandeau en trop

La surbrillance est validée à l'usage. Trois points traités.

| Lot | État | Ce qui a changé |
|---|---|---|
| Bandeau de nom | **retiré** | C'était le **fil d'Ariane** de la liste : avec un seul niveau sélectionné il n'affichait qu'un nom, déjà donné par la ligne et par la bande basse. Retiré avec son intent devenu sans émetteur et l'import qu'il seul utilisait. |
| Aperçu de texte | **change de route** | Il empruntait `overlayRecord` — un record d'atome complet reprojeté puis rasterisé — et restait invisible alors que sa texture était **mesurée correcte** (243 572 pixels encrés sur le vrai enregistrement). Il passe maintenant par `textNode`, la primitive qui peint **chaque libellé de ligne, la bande basse et les initiales d'un contact** dans ce même arbre. |
| Garde vidéo | **levée** | `mapVideoResourceOp` exigeait la taille naturelle pour tout patch vidéo. Or elle ne sert **qu'à** convertir un rognage, et ce cas est déjà gardé en amont (`readMediaUvRect` jette `source_rect_texture_size_required`). Sans rognage, `texture_size` n'est lu par personne. La garde refusait le patch pour rien, réessayait quatre fois sur 1,8 s puis abandonnait — et cet abandon **était** le `bevy_media_texture_video_metadata_pending` en console. |
| Reconnaissance d'un texte | **alignée** | Un texte rangé sous `content`/`value` sans type déclaré était reconnu par `hasRecordPreview` et par `normalizeType` du moteur, **mais pas** par `isTextRecord` : sa géométrie repartait sur la branche média et n'était jamais mise à l'échelle. Même règle des deux côtés. |

## Pourquoi cette route-là

Les deux routes cohabitent dans le même arbre, à quelques pixels l'une de l'autre :
`textNode` → `textRecord` peint, `overlayRecord` → record d'atome rasterisé ne peint
pas. Un aperçu de texte n'a besoin ni d'une projection d'atome, ni d'une texture de
3486×540 : d'une chaîne, d'une taille, d'une couleur.

Piège évité de justesse : `colorToCss` ne convertit qu'un tableau `[r,g,b,a]` — passer
la couleur CSS de l'atome telle quelle (`'rgba(248, 252, 255, 0.98)'`) aurait rendu le
texte **transparent**. Elle passe par `parseBevyProjectionColor`, avec repli sur le
jeton du panneau si le moteur ne sait pas la lire (un nom CSS, par exemple).

Preuve de forme : le record projeté de l'aperçu est **structurellement identique** à
celui d'un libellé de ligne — même type, même `text_style`, couleur opaque ; seules les
valeurs diffèrent.

**Perdu et assumé** : le style par intervalle (`rich_text.spans`) dans les aperçus.
L'échelle continue de MESURER les intervalles à leur propre taille, donc le run le plus
gros est pris en compte et la largeur rendue à taille unique est forcément inférieure :
la garantie anti-« Hel » du 4ᵉ tour est plus forte qu'avant, pas plus faible.

## Vérification

Probe `text_preview_and_video_guard_probe.mjs`, **rouge d'abord** (7 échecs), verte
ensuite. Sweep : **24 probes vertes, 0 rouge** ; les modules touchés se lient en ESM.

Quatre probes ont été mises à jour parce qu'elles verrouillaient l'ancienne route —
`lot10_preview_pipeline`, `record_preview`, `project_view_content`,
`visual_panel_kind_change`. Chacune vérifie désormais l'intention (« la tuile MONTRE
son record », par l'une ou l'autre route) au lieu du mécanisme.

Effet de bord bienvenu : le nœud d'un aperçu texte a un identifiant distinct de celui
d'un aperçu média (`…_visual_text` contre `…_visual`), donc passer d'une image à un
texte dans le Visuel produit un despawn + spawn naturel — le risque de réemploi
d'identifiant disparaît pour ce cas.

## Ce que ce tour tranche

Si le texte apparaît, c'est réglé. S'il n'apparaît toujours pas, la faute est isolée
sans ambiguïté au rendu des **records d'overlay** — puisque la primitive voisine peint
dans le même arbre, avec la même forme de record — et il ne restera plus rien à écarter.
