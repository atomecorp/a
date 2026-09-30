# Panneau Média — cahier des charges de la liste de médias (ex-outil « import »)

Ce document rassemble **tout ce qui a été demandé et réalisé** sur l'outil d'import, devenu le panneau **Média**. Il sert de référence pour la suite.

**État de la reprise du 30 septembre 2026 : voir §7.** Le bootstrap avant dépôt est supprimé ;
la fusion des références au même fichier est corrigée et testée. Les validations UI restantes
sont explicitement distinguées des contrats automatisés.

---

## 1. Contexte et origine de la demande

L'outil `import` ouvrait jusqu'ici une **fenêtre système** (sélecteur de fichiers). Il ne doit plus l'ouvrir directement : il doit d'abord montrer **ce que l'utilisateur possède déjà**.

- La **clé d'outil `import` ne change pas**, son **emplacement ne change pas** (menu Mystic, ruban, rails). Seuls changent **son libellé** (désormais « Média ») et **son comportement**.
- Le tool de capture (`ui.capture.import`) et son i18n restent **inchangés**.
- Le panneau liste les médias de l'utilisateur : **audio, vidéo, image**. Les autres types (`other`) sont exclus de la liste.
- Le bouton **fixe en bas du panneau** rend la **fenêtre système d'origine** : c'est le « vrai import » (pellicule photo / bibliothèque sur iOS, fichiers locaux sur la machine).

## 2. Cahier des charges fonctionnel

### 2.1 Présentation — liste standard, aucune liste maison

- Les médias s'affichent sous forme de **liste standard d'Atom**, la même que partout ailleurs (Contact, Coller, Supprimés, Info) : **lignes de taille standard**, **nom à gauche**, **vignette à droite**, en fin de ligne.
- Aucune nouvelle liste, aucun nouveau style : on réutilise le composant de liste existant (gabarit `tall`), le rail de sélection existant, l'aperçu existant, les chips existantes, l'en-tête triable existant et les états de panneau existants.
- **En haut** du panneau : les filtres par type — **Tous, Images, Vidéos, Sons** — et l'**en-tête de tri** : **Nom, Date, Type**.
- Tri par défaut : **date d'import, du plus récent au plus ancien**.
- L'ordre du corps du panneau **respecte la préférence visuelle** de l'utilisateur (`Contact > Réglages > préférences > visuelle`, sens d'affichage des éléments de liste) : dans l'ordre de lecture **importer (bas), filtre, résultats**, le filtre étant posé contre le bord d'ouverture.
- **En bas**, en position **fixe**, **deux** boutons de largeur égale (une seule rangée, comme le pied du panneau Coller) :
  - à gauche, **« Ajouter des fichiers externes »** : la fenêtre système d'origine (pellicule photo / fichiers locaux), comportement inchangé ;
  - à droite, **« Importer »** / **« Importer (N) »** : la validation de la **sélection cochée**, grisée tant que rien n'est coché.

Les deux libellés sont distincts parce que les deux gestes le sont : le premier ne touche pas au panneau (il part d'ailleurs), le second écrit dans le projet la sélection du panneau.

### 2.2 Clic sur une ligne = import dans le projet

- Un **clic sur une ligne** importe automatiquement le média dans le projet.
- L'import suit les **règles de positionnement déjà établies** (`autoPlace: true`), c'est-à-dire exactement les mêmes cibles et les mêmes règles que l'import existant, y compris le contexte conteneur quand le panneau est ouvert depuis un rail.
- Si la ligne est **cochée**, le clic n'importe **que la ligne cliquée** — jamais la sélection. Le lot ne part que par glisser-déposer.

### 2.3 Glisser-déposer = dépôt au point exact

- **Seule la vignette est la poignée** : on ne glisse pas la ligne entière (c'est laid et imprécis). La ligne reste un clic d'import.
- Glisser la vignette sur le **canevas nu** dépose le média **à l'endroit exact du lâcher**, en respectant les **règles de positionnement du projet** déjà en place (point et annulation fournis par le propriétaire canonique client → projet).
- Lâcher **hors du canevas nu** (sur un panneau, un menu, le Dashboard) **annule** : rien n'est importé.
- L'**aperçu de drag est la vignette agrandie** (deux fois la vignette de ligne, taille déclarée comme jeton d'habillage — aucun nombre écrit dans le panneau), et non plus une fausse ligne entière.
- Quand **plusieurs** lignes partent ensemble, l'aperçu est une **pile** : jusqu'à **3 vignettes décalées en escalier** (vers le bas-droite, décalage arrondi au pixel déclaré par les jetons `dragStackOffsetPx` et `dragStackMaxPx`), la carte de devant portant le **badge du compte réel**. Au-delà de 3, c'est le badge seul qui porte le nombre.
- La boîte de l'aperçu **grandit avec la pile** : elle vaut `vignette + (cartes visibles − 1) × décalage`, sinon son propre `overflow` rognerait le paquet qu'elle vient d'assembler.

### 2.4 Sélection multiple et export groupé

- La **case de sélection** standard est présente sur chaque ligne, avec le geste partagé par toutes les listes : presser la case, glisser le long du rail, relâcher pour garder la série. On peut donc **sélectionner plusieurs lignes**.
- Quand plusieurs lignes sont cochées, **glisser la vignette d'une seule d'entre elles emporte tout le lot**.
- Les vignettes du lot sont **regroupées visuellement** : l'aperçu affiche la vignette agrandie **avec un badge indiquant le nombre d'éléments** qui partent.
- Le lot est déposé **au point du lâcher**, **groupé et organisé comme le reste** : les éléments sont **empilés avec un décalage de 24 px** les uns par rapport aux autres, de sorte qu'ils restent **positionnés correctement** au lieu de se superposer au même point.
- Un lot = **un seul appel d'import**, **aucun second téléversement** (le média est déjà stocké côté serveur : le créateur reçoit le résultat prêt).
- Le **bouton « Importer (N) »** du pied est la seconde porte du lot : il écrit les lignes cochées **comme un clic de ligne** (`autoPlace: true`, mêmes règles de positionnement, même fermeture du panneau après succès). Sans rien de coché, il est **grisé** et l'intent répond `media_selection_empty` — c'est la garde, pas le chemin normal.

### 2.5 Fermeture du panneau

- Le panneau **se referme dès qu'une importation est terminée, quelle qu'elle soit** : clic d'une ligne, dépôt d'une ligne ou d'un lot, import via la fenêtre système, ou validation du bouton « Importer (N) ».
- **Restent ouverts** : une fenêtre système **annulée**, un lâcher **hors du canevas**, ou un **échec** d'import (l'utilisateur peut réessayer).
- Un échec d'import **ne remplace pas la liste** : il s'affiche comme une notice sous la liste, les médias restent visibles et utilisables.
- La sélection ne survit pas à la fermeture : geste, série cochée et aperçu repartent ensemble, donc le bouton « Importer » est de nouveau grisé à la réouverture.

### 2.6 Performance du premier import (latence du premier dépôt)

Constat : la **première fois** qu'on déposait une vignette, le dépôt mettait beaucoup de temps à apparaître (les fois suivantes étaient normales).

- Le premier dépôt payait **deux démarrages** : l'import **paresseux du module de drop** et le **bootstrap du runtime d'outils**.
- **L'échauffement à l'ouverture du panneau a été retiré** (voir §4) : appeler `warmupToolGatewayRuntime` depuis un panneau déclenche le **bootstrap du runtime d'outils v2**, qui **réconcilie tout le registre** (`toolRegistryV2.refresh()` + `updateTool` sur chaque définition) et repartit les instances du projet — la liste d'atomes se vidait. Le module de drop, lui, est déjà chargé au démarrage de l'espace de travail : l'importer « pour échauffer » n'apportait rien.
- Le gain de latence **reste à reprendre autrement** : uniquement par un travail qui ne touche pas le registre d'outils (et de préférence au démarrage de l'app, pas à l'ouverture d'un panneau).
- La **sonde de dimensions** d'un média (obligatoire pour les médias que le listing ne documente pas) est **mémoïsée par source** (`resolveCreatorMediaIntrinsicSize`, cache des succès seulement + table des sondes en vol) : deux entrées qui visent la même source **partagent une seule sonde**.
- Les dimensions intrinsèques d'un **lot** sont résolues **en parallèle** avant l'appel au créateur, puis attachées à chaque entrée (`entry.width` / `entry.height`) ; l'attente cesse d'être N × sonde pour devenir 1 × sonde.
- La **création reste séquentielle** : c'est elle qui réserve les places au fil des arrivées, et le placement `autoPlace` doit voir le projet à jour à chaque étape.

## 3. Où c'est réalisé

- Panneau : `eVe/intuition/runtime/bevy_panel/bevy_panel_media_runtime.js` (liste `tall`, chips, en-tête triable, sélection standard, aperçu en vignette **ou en pile**, pied à deux boutons, import en lot, fermeture) ; surface déclarée dans `eVe/intuition/panel_definitions.js` (`media`, `eve_bevy_panel_media`, `ui.media.panel`, `open_media_panel` / `close_media_panel`).
- Pont d'écriture : `eVe/intuition/tools/media.js` (import d'un lot, rappel de la fenêtre système, fermeture de la surface après un import abouti). L'ouverture du panneau ne fait plus que lire la liste : aucun échauffement de runtime d'outils.
- Import sans re-téléversement : `eVe/intuition/runtime/project_media_import_runtime.js` (`importPreuploadedMediaIntoProject`, qui accepte un lot, sonde les dimensions en parallèle, et `preuploadedMediaEntry`).
- Sizing du créateur : `eVe/intuition/tools/core/tool_runtime_creator_media.js` (`resolveCreatorMediaIntrinsicSize`, exporté et mémoïsé) et `eVe/intuition/tools/project_drop_external_runtime.js` (`width` / `height` / `duration` portés par l'entrée).
- Framework partagé : `bevy_panel_selectable_list.js`, `bevy_panel_selectable_list_drag.js`, `bevy_panel_selectable_list_preview.js` (piles d'aperçu), `bevy_panel_tokens.js`, `eVe/elements/skin/panel_skin.js` (jetons `dragThumbnailSizePx`, `dragStackOffsetPx`, `dragStackMaxPx`).
- Déplacement des découpes : `eVe/domains/rendering/bevy_ui_tree_motion_runtime.js` et `bevy_ui_project_overlay_runtime.js` — une surface qui découpe emporte la découpe projetée sur sa descendance, donc une vignette glissée n'est plus rognée à sa position d'origine.
- Historique du listing local (Tauri / iOS / web) : `eVe/domains/media/api/audio_core_media.js` — le dossier utilisateur n'est pas au même niveau selon la plateforme (web = session device Fastify, natif = serveur local `GET /api/uploads`).
- Contrats de test : `tests/eve/bevy_panel_media_contract.test.mjs`, `tests/eve/bevy_panel_selectable_list_contract.test.mjs`.
- Trace d'état : `eVe/documentations/FRAMEWORK_STATE.md` (entrées du 30 septembre 2026).

---

## 4. Régression corrigée le 30 septembre 2026

Constat utilisateur : après l'ajout de la pile d'aperçu, du pied à deux boutons et de l'échauffement du premier dépôt, **la liste d'atomes du projet a disparu** (liste vide) alors qu'elle fonctionnait juste avant, et le bouton du pied devait être renommé.

### 4.1 Cause racine — l'échauffement bootstrapait le registre d'outils

- `eVe/intuition/tools/media.js` appelait `warmupToolGatewayRuntime({ reason: 'media_panel_open' })` à **chaque** `loadFiles()`, donc à **l'ouverture du panneau**.
- `warmupToolGatewayRuntime` route vers `ToolRuntimeV2.bootstrap()` ; quand le bootstrap a été différé pour l'authentification (`bootstrapFlags.deferredForAuth`), l'appel devient **forcé** (`force: true`) et **rejoue toute la réconciliation** : `toolRegistryV2.refresh()`, puis `createTool` / `updateTool` pour chaque définition, en republiant les correspondances d'outils.
- Ce bootstrap est une opération de **démarrage d'application**, pas d'ouverture de panneau : le rejouer pendant que le projet est ouvert **repartit les instances d'outils** et vide la liste d'atomes.
- L'autre moitié de l'échauffement, `import('./project_drop.js')`, était **sans effet** : ce module est déjà évalué au démarrage (import statique de `user_workspace_runtime.js`, plus les imports paresseux du chemin de drop).

### 4.2 Correctif

- L'échauffement est **supprimé** : `loadFiles()` ne fait plus que lire la liste (`window.record_audio_list_media`). L'ouverture du panneau Média n'a plus **aucun** effet sur le registre d'outils.
- L'échauffement **du chemin de drop** reste, lui, à sa place historique : `importFilesToProjectViaCreator` (`tools/project_drop_external_runtime.js`) appelle `warmupGateway({ reason: 'project_drop_creator' })` juste avant le créateur, et ce depuis toujours. Rien n'a été déplacé côté import : seul l'appel **à l'ouverture du panneau** a disparu.
- La fermeture du panneau est déclarée par des **fonctions hissées** (`openMediaPanel` / `closeMediaPanel`) : `closePanel: () => closeMediaPanel()` ne peut plus dépendre de l'ordre d'évaluation du module.
- Le bouton du pied devient **« Ajouter des fichiers externes »** (anglais : « Add external files ») — pluriel, parce que la fenêtre système accepte plusieurs fichiers. La clé `eve.media.import.system` reste la même ; seul son libellé change.

### 4.3 Vérifications

- `tests/eve/bevy_panel_media_contract.test.mjs` : 17/17 (dont le libellé du bouton système).
- Grappe `tests/eve/bevy_panel_*` : **16 échecs / 183 réussites (199)** contre **17 échecs / 167 réussites (184)** sur `HEAD` pristine monté en `/private/tmp/a-head` — aucun échec nouveau, un échec préexistant en moins.
- `tests/governance/vitest_manifest_guard.test.mjs` 3/3 ; `bevy_ui_main_menu_overlay_atomic` et `bevy_panel_section_order_contract` verts ; `npm run check:syntax` (2299 fichiers) et `npm run check:component-reuse-guardrails` (9 règles) verts.
- **À confirmer visuellement** : la liste d'atomes doit revenir après redémarrage de l'app (le bootstrap déclenché à l'ouverture avait reparti les instances de la session), et l'ouverture du panneau Média ne doit plus jamais la vider.

### 4.4 Reste ouvert

- **Latence du premier dépôt** (§2.6) : à reprendre sans toucher au registre d'outils.
- **Annexe A** (instances dupliquées) et **Annexe B** (crop au glisser) : voir ci-dessous.

---

## 5. Trois défauts corrigés le 30 septembre 2026 (listage lent, vignettes répétées, drag mixte mort)

Constat utilisateur, après le correctif §4 : le dépôt est enfin rapide, mais (1) la **liste met très
longtemps à s'afficher**, arrive **d'un bloc à la fin**, parfois **pas du tout** (2 fois sur 3, ou
peinte à moitié puis 2–3 s à la réouverture) ; (2) cochée sur 3–4 lignes, l'aperçu de drag montre
**plusieurs fois la même vignette** au lieu d'une vignette par élément ; (3) un lot **mixte
vidéo + image** ne peut **pas être glissé** du tout.

### 5.1 Listage lent et en bloc — cause et correctif

- **Cause 1 — l'état complet relu une fois par type.** `listRecordingAtomes`
  (`domains/media/api/audio_core_media.js`) bouclait sur chaque type demandé et appelait
  `listStateCurrent(null, { limit: 2000 })` **à chaque itération** : pour `audio_recording` **et**
  `video_recording` (l'appel réel du panneau), l'état complet était donc lu **deux fois** et chaque
  lecture reparcourait les 2000 atomes. Correctif : **une seule** lecture `listStateCurrent(null,
  { limit: 2000 })`, puis filtrage local par l'ensemble des types voulus.
- **Cause 2 — un seul résultat publié à la fin.** Le listage rendait la main une fois les vagues
  `/api/uploads` **et** les prises terminées ; aucune ligne n'était peinte avant. Correctif : le
  propriétaire du listage (`list_user_media_files`) accepte un `options.onProgress`, appelé via
  `noteProgress()` après la vague des `/api/uploads`, puis après la lecture des prises (chaque appel
  publie `{ ok: true, partial: true, files: [...combined] }`, les erreurs d'abonné étant avalées).
  Le panneau relaie ce rappel (`tools/media.js` → `loadFiles({ onProgress })`) et `publishFiles`
  peint **chaque vague dès qu'elle arrive**.
- **Résilience** : `readState()` ne masque plus les lignes déjà connues par l'état `loading` quand
  `entries.length > 0`, et une vague en échec ne vide plus ce qui est déjà affiché — `noteListFailure`
  le signale sous la liste (`eve.media.list.failed`) et ne remplace les résultats que s'il n'y a
  rien d'autre à montrer. Une réouverture **conserve** donc les lignes précédentes au lieu de
  repartir d'une liste vide.

### 5.2 Vignettes répétées au drag d'un lot — cause et correctif

- **Cause** : l'aperçu de drag empilait `min(count, stackMax)` cartes, mais chacune recevait le
  **même** `preview.visualRecord` (celui du premier fichier). Trois lignes cochées affichaient donc
  trois fois la première vignette.
- **Correctif** : `resolvePayload` (`bevy_panel_media_runtime.js`) construit désormais `visualRecords`
  = le visuel de **chaque** ligne emportée, dans l'ordre du dépôt, et
  `createSelectableListDragPreviewNode` (`bevy_panel_selectable_list_preview.js`) lit
  `records[index] || record` pour la carte d'index `index`. La carte retombe sur l'ancre si la source
  ne fournit qu'un visuel.

### 5.3 Drag mixte vidéo + image impossible — cause et correctif

- **Cause** : avant l'appel au créateur, `importPreuploadedMediaIntoProject` sonde la taille
  intrinsèque de chaque image/vidéo. La sonde **vidéo** (`tool_runtime_creator_media.js`) attendait
  jusqu'à `CREATOR_MEDIA_PROBE_TIMEOUT_MS = 7000` ms (mesure : **7,26 s**) et, si le démontage du
  `<video>` levait (`video.load()` sur un élément détaché), la promesse **ne se réglait jamais** :
  le `Promise.all` restait pendu et le dépôt ne faisait plus rien. Les lots image + image passaient
  (sonde image immédiate), les lots contenant une vidéo semblaient morts.
- **Correctif** : (a) le `cleanup()` des deux `done()` (image et vidéo) est enveloppé d'un `try/catch`
  pour que la promesse **se règle toujours** ; (b) le délai passe de 7000 à **2500 ms** ; (c) la
  résolution des dimensions du lot se fait désormais **en parallèle** (`Promise.all`) avant l'appel
  au créateur, chaque entrée portant `entry.width` / `entry.height`, lus par
  `importFilesToProjectViaCreator` (`entry.width`/`entry.height`/`entry.duration` → créateur), ce qui
  supprime l'attente N × sonde. Mesure du lot vidéo + image : **7264 ms → 2693 ms**.

### 5.4 Vérifications

- `tests/eve/bevy_panel_media_contract.test.mjs` : **21/21** (cartes de pile distinctes
  `['bande','montage','affiche']` ; listage par vagues et lignes conservées ; lot partiellement créé ;
  sonde vidéo qui se règle malgré un démontage en échec ; un seul listage d'état pour audio + vidéo
  et une vague publiée).
- Grappe ciblée `bevy_panel_media_contract` + `bevy_panel_selectable_list_contract` +
  `bevy_panel_paste_contract` + `bevy_panel_section_order_contract` + `bevy_ui_runtime_contract` :
  **71/71**. Grappe `tests/eve/bevy_panel_*` : **16 échecs / 187 réussites**, exactement les échecs
  préexistants connus (aucun nouveau). `npm run check:syntax` (2299 fichiers) et
  `npm run check:component-reuse-guardrails` (9 règles) verts.

### 5.5 Reste ouvert

- **Annexe A** (instances dupliquées) et **Annexe B** (crop au glisser) : voir ci-dessous.
- **À confirmer visuellement** après redémarrage de l'app : listage au fur et à mesure, vignettes
  distinctes au drag d'un lot, drag mixte vidéo + image.

---

## 6. Reprise technique — comment le panneau est ouvert, et quelles API il consomme

Cette section est le **point d'entrée pour reprendre la tâche** : elle relie le panneau à la surface
d'outils (ce que MCP liste et appelle), à chaque point d'ouverture de l'UI, et à l'inventaire des API.

### 6.1 Surface d'outils (MCP) — le panneau est un outil v2

- Le panneau est déclaré **une fois** comme surface : `eVe/intuition/panel_definitions.js` →
  `PANEL_SURFACE_DEFINITIONS.media = { surface_key: 'media', surface_id: 'eve_bevy_panel_media',
  tool_id: 'ui.media.panel', module_key: 'media', open_fn: 'open_media_panel',
  close_fn: 'close_media_panel' }`. Ce fichier alimente à la fois le bootstrap des panneaux et la
  règle de bascule (`buildPanelRuntimeConfigByToolId()`).
- L'outil est enregistré dans le registre v2 : `eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js:270`
  → `buildDefaultToolDef({ tool_id: 'ui.media.panel', tool_key: 'media_panel', label: 'Media Panel',
  execution_mode: V2_REGISTERED_HANDLER_EXECUTION_MODE })`. C'est **cette fiche que MCP liste**
  (`runtime.tools.list` / `runtime.tools.call` / `runtime.tools.batch_call`).
  **À noter** : la fiche **ne porte pas d'`input_schema`** — MCP liste donc l'outil **sans paramètre**
  (contrairement à `ui.couleur.apply`, qui déclare ses propriétés avec le commentaire « MCP lists them
  with the parameters an agent has to pass »). Si un jour on veut ouvrir le panneau Média depuis MCP
  avec une portée (par ex. `scope`), c'est **ici** qu'on ajoute le schéma.
- Le handler v2 est routé par `eVe/intuition/tools/core/tool_runtime_bootstrap.js:112` :
  `'ui.media.panel': (payload = {}) => executeBootstrapPanelHandler(payload,
  PANEL_RUNTIME_CONFIG_BY_TOOL_ID['ui.media.panel'])` — la même fabrique que tous les panneaux
  (`ui.home.panel`, `ui.contact.panel`, `ui.paste.panel`, …).
- Le **pont** qui expose les fonctions attendues par la surface est `eVe/intuition/tools/media.js` :
  `registerBevyPanelSurface(mediaRuntime.surface)`, plus `registerPanelGlobals('media_panel',
  { open: openMediaPanel, close: closeMediaPanel })` (voir `panel_globals.js`) pour les surfaces qui
  ouvrent par leurs propres fonctions.

### 6.2 Les quatre points d'ouverture (tous passent par la même bascule)

La règle unique est `eVe/intuition/tools/core/panel_toggle_rule.js` : un outil à panneau est un bouton
ON/OFF, l'état allumé est **lu dans le runtime de panneau** (jamais gardé par la surface), et la surface
qu'une commande ouvre est déclarée **une fois** dans la taxonomie (`commands.<clé>.panel`).

1. **Mystic** — `eVe/intuition/menu/context_menus.json` : `commands.import.panel = "media"` et
   `vocabulary.panels += "media"`. Le clic résout `resolvePanelCommandPress('import')` →
   `{ surfaceKey:'media', open, gatewayAction: open ? 'state.off' : 'state.on' }` : le toggle générique
   ouvre/ferme, sans cas spécial `toolKey === 'import'`.
2. **Ruban (barre principale)** — `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js:472` :
   `import: { labelKey:'eve.menu.import', type:'tool', icon:'import', action:'toggle', atome_tool:true,
   tool_id:'ui.media.panel', active: openMediaPanel, inactive: closeMediaPanel }`.
3. **Rails** — `togglePanel({ surfaceKey:'media', open: openMediaPanel, close: closeMediaPanel })`
   (patron des rails virtuels), en transmettant le contexte conteneur existant (`container_id`,
   `container_entity`, `project_id`).
4. **Globals de débogage** — `window.__eveMedia = { readState: () => mediaRuntime.readState(),
   repaint: repaintMediaPanel }` (posé par `tools/media.js`) : lecture d'état et repeinture sans passer
   par l'UI.

### 6.3 Inventaire des API consommées

- **Listage** : `window.record_audio_list_media({ types:['audio','video','image'], onProgress })` —
  propriétaire unique du listage, appelé par `eVe/intuition/tools/media.js` (`loadFiles`). C'est le
  **seul** point de lecture du panneau ; l'ouverture ne déclenche aucun autre effet.
- **Source du listage, selon la plateforme** (`eVe/domains/media/api/audio_core_media.js`) : côté web,
  la session device Fastify ; côté natif (Tauri/iOS), le serveur local **`GET /api/uploads`** (le dossier
  utilisateur n'est donc pas au même niveau selon la plateforme). Les atomes de prise sont lus par
  `window.Atome.listStateCurrent(null, { limit: 2000 })` — **une seule** lecture, puis filtrage local
  par l'ensemble des types. `options.onProgress` publie chaque vague
  (`{ ok:true, partial:true, files:[...] }`).
- **Import sans re-téléversement** : `importPreuploadedMediaIntoProject({ context, files, placement })`
  (`eVe/intuition/runtime/project_media_import_runtime.js`) — cible projet par
  `resolveCurrentProjectImportTarget(context)`, insertion par `resolveImportInsertion`, dimensions
  sondées en parallèle par `resolveCreatorMediaIntrinsicSize` (`entry.width`/`entry.height`), écriture
  par `importFilesToProjectViaCreator` (`eVe/intuition/tools/project_drop.js` →
  `project_drop_external_runtime.js`, qui porte `width`/`height`/`duration` jusqu'au créateur), puis
  rattachement par `attachImportedAtomesToTrack`.
- **Fenêtre système** : `invokeProjectMediaImport({ context, autoPlace:true })` — le bouton
  « Ajouter des fichiers externes » ; c'est l'import d'origine (`requestProjectImportFiles`), inchangé.
- **Point de dépôt** : `resolvePanelProjectDropPoint({ event })` — propriétaire canonique client →
  projet ; `null` (hors canevas nu) annule le lâcher.

### 6.4 Contrats et traces

- Contrat de comportement : `tests/eve/bevy_panel_media_contract.test.mjs` (21 assertions).
- Contrats partagés consommés : `tests/eve/bevy_panel_selectable_list_contract.test.mjs`,
  `bevy_panel_paste_contract.test.mjs`, `bevy_panel_section_order_contract.test.mjs`,
  `bevy_ui_runtime_contract.test.mjs`.
- Trace d'état : `eVe/documentations/FRAMEWORK_STATE.md` (entrées du 30 septembre 2026).

---

## 7. Reprise — identité des médias et premier dépôt (30 septembre 2026)

### 7.1 Instances multiples : origine et correction

Le catalogue Fastify (`server/server_uploads.js` → `getAccessibleFiles`) parcourt tous les
atomes de types fichiers, y compris les objets de projet et leurs copies. Plusieurs identifiants
peuvent donc décrire **le même fichier physique**. Une prise peut aussi apparaître dans
`/api/uploads` et dans `listRecordingAtomes`, sous des identifiants différents.
Le runtime de duplication copie les propriétés et les références média, sans téléverser de
nouveaux octets. Confondre l'identité d'une occurrence dans le projet avec celle du fichier
produisait plusieurs lignes dans la bibliothèque.

La déduplication locale déjà présente a été renforcée dans `audio_core_media.js` : identité
par **source média canonique et propriétaire du fichier**, plus alias d'identifiant. Tous les
alias sont enregistrés même lorsqu'une ligne est exclue ; l'ancien `some(noteSeen)` pouvait
s'arrêter avant de mémoriser le second alias. Les chemins sont conservés, ainsi que
`media_user_id` pour une référence partagée. Deux fichiers homonymes de propriétaires
différents restent distincts. Les lignes sans identifiant utilisent aussi une clé de source
avec propriétaire dans le panneau, pour garder des sélections indépendantes.

Cette correction retire les doublons du **listing**, y compris les vagues partielles. Elle ne
supprime pas les occurrences de projet en base : celles-ci portent leur position et leurs
relations. L'import du panneau réutilise les octets existants ; une nouvelle occurrence de
projet reste créée lorsqu'un fichier sans identifiant d'atome est déposé à nouveau. Transformer
toutes ces occurrences en rendus d'un unique atome serait une évolution du modèle de scène,
non réalisée par cette correction de bibliothèque.

### 7.2 Premier dépôt sans bootstrap du registre

- `invokeCreatorOnProjectDrop` appelle directement la passerelle. `ui.creator` est résolu par
  la définition intégrée de `ToolRuntimeV2.resolveTool`, avant toute réconciliation du registre.
  L'appel historique à `warmupToolGatewayRuntime` décrit au §4.2 est désormais supprimé.
- Un lot entièrement `preuploaded` ne charge plus `ensureABoxApi` : aucun upload n'est requis.
- Les dimensions et la durée connues du listing sont transmises à l'entrée. Si la taille est
  connue, aucune sonde n'est lancée. Sinon les sondes restent parallèles ; `media_size_probed`
  indique au créateur que l'attente a déjà été payée, même en cas d'échec, pour éviter une
  seconde sonde séquentielle. Le cache global continue de ne mémoriser que les succès.
- Une taille absente n'est plus convertie en zéro (`Number(null)`), et le placement automatique
  utilise aussi les dimensions de l'entrée préchargée.

Aucun échauffement n'est ajouté à l'ouverture du panneau. Le test du premier dépôt utilise
la **vraie passerelle** avec un stockage de registre qui ne répond jamais et un bootstrap
qui lève : une seule création aboutit, sans bootstrap ni API d'upload. Le gain en millisecondes
sur une session native fraîche n'a pas été instrumenté.

### 7.3 Vérification et limites UI

La grappe média, listes partagées, collage, ordre des sections, BevyUI, résolution intégrée,
asset box et garde du manifest passe : **86/86**. Syntaxe : **2302 fichiers** ; règles de
réutilisation : **9/9**. Les tests couvrent aussi les fichiers homonymes de deux propriétaires,
les références partagées, la déduplication des vagues et l'absence de seconde sonde.

Essai réel dans l'app Tauri, session invitée locale, avec deux fixtures générées dans
`temp/import-panel-validation` (`red.png`, `blue.mp4`) :

| Vérification | Résultat observé |
| --- | --- |
| Liste d'atomes | Visible avant et après plusieurs ouvertures de Média et un dépôt mixte |
| Bibliothèque après dépôt | Toujours **2 résultats**, sans nouvelle ligne pour les occurrences déposées |
| Vignettes des lignes | Image rouge et vidéo bleue distinctes ; sélection affiche `Importer (2)` |
| Drag vidéo + image | Dépôt réussi, deux médias affichés, fermeture du panneau |
| Lâcher sur le panneau | Annulé, panneau et sélection conservés |
| Listing progressif | Contrat automatisé vert ; non discernable visuellement avec seulement deux uploads locaux |
| Pile distincte et crop pendant le mouvement | Contrats automatisés verts ; observation native non concluante, le pilotage disponible réalise un drag complet sans maintien du pointeur |

La session native avait commencé avant les dernières éditions : ces observations valident
les gestes et le rendu disponibles, sans constituer une mesure du nouveau premier dépôt
après redémarrage. Les validations visuelles du listing par vagues et du preview en mouvement
restent à faire sur une bibliothèque représentative, puis sur iOS/web si ces plateformes sont visées.

---

## Annexe — constats d'origine (reprise au §7)

### Annexe A — instances dupliquées / multipliées dans le panneau d'import

Constat : dans le panneau d'import, **beaucoup d'éléments graphiques apparaissent dupliqués / multipliés**, et ce n'est pas normal.

- **À chaque import, on ne doit pas créer une nouvelle instance** : il doit y avoir **une seule instance créée**.
- Si plusieurs instances existent, il y a un **problème de conception** : soit du panneau lui-même, soit une **redondance des objets lors de la duplication**.
- Les objets **ne doivent pas être dupliqués** : la duplication doit rester **fictive** (un seul objet réel, un rendu qui en montre plusieurs).
- Dans le dossier d'import, il doit y avoir **une seule instance du même objet**.

→ Demande : **enquête** pour comprendre d'où viennent ces instances multiples, puis **réparation**.

### Annexe B — comportement visuel du glisser-déposer (vidéo à joindre)

Constat : lors du **drag and drop**, le comportement visuel est incorrect — il y a **du crop (recadrage) sur la vignette glissée**, c'est-à-dire sur ce qui est en cours d'export.

→ Une **vidéo** sera jointe pour montrer le défaut ; le problème se voit **au moment du glisser** (et non au moment de l'import).

Diagnostic retenu (deux causes, toutes deux traitées) :

1. la découpe projetée sur les descendants d'une surface qui découpe était un rectangle **absolu figé** : elle ne suivait pas le déplacement du paquet, donc la vignette se faisait rogner à sa position d'origine et le badge de compte restait derrière. La découpe suit désormais le mouvement total du nœud qui découpe (`bevy_ui_tree_motion_runtime.js`), et le déplacement de record la translate aussi (`bevy_ui_project_overlay_runtime.js`) ;
2. la boîte de l'aperçu restait à la taille d'**une** vignette : une pile débordait de son propre `overflow` et se faisait couper. La boîte grandit maintenant avec le nombre de cartes visibles.

Témoin : le test `BevyUI moved clipping surface carries its descendant clip and text badge` (`tests/eve/bevy_ui_runtime_contract.test.mjs`) monte la vignette réelle du panneau Média, la déplace et vérifie que les découpes **et** le texte du badge suivent le mouvement — sans qu'aucune valeur du test soit propre au panneau.
