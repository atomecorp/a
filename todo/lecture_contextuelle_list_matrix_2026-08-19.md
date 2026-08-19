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
- **Dette** : `project_view_list_content.js` atteint 713 lignes (norme < 500).
