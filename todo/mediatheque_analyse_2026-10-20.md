# Médiathèque — analyse (20 oct. 2026)

Phase d'analyse seulement : aucun code n'est écrit. Ce document décrit ce qui existe,
ce qui manque, l'organisation proposée et les décisions à prendre.

## Réalisé (20 oct. 2026)

Depuis le 20 oct., une autre session a ramené le Dashboard à deux styles, eVe Basique et eVe Pro
(gabarit unique `dashboard_eve`). Le Mystique et le « Pro » intégré n'existent plus. Le §1 ci-dessous
décrit l'état d'avant.

**Accueil eVe Pro.** La Médiathèque prend la case centrale de la rangée des moniteurs. Les deux moniteurs
qui restent sont `monitor_0` (à gauche) et `monitor_1` (à droite) ; la Boutique est gardée.
- Gabarit `dashboard_eve` en v5.
- `DASHBOARD_HOME_LAYOUT.monitors = 2`.
- Couleur de rubrique : orange.
- Nouveau glyphe `library`.
- En eVe Basique, la brique `tile_library` (palier 3) remplace `tile_monitor_2`.

**Rubrique** (`eVe/domains/dashboard/dashboard_library.js`). Elle s'ouvre sur Images, Vidéos et Sons.
Chaque type contient :
- ses favoris, affichés directement ;
- « Mes … » : tous les médias de l'utilisateur de ce type, les plus récents d'abord ;
- « En ligne » : on tape dans le champ du bas puis Entrée ;
- « Importer », posé sur la case Créer : la fenêtre système, puis le stockage de compte.

Le champ du bas filtre chaque niveau par nom. Une tuile montre le média lui-même.

**Aperçu** (`dashboard_library_preview.js`). Le média occupe toute la surface.
- Glisser de haut en bas passe au suivant ; gauche et droite reculent ou avancent.
- Outils dessous : **Insérer** dans le projet courant (le dernier quitté), **Favori**, **Lecture/Pause**
  (vidéo et son), **Fermer**.

**Favoris.** Ils sont réservés aux médias : `preferences.media.favorites`
(`intuition/tools/media_favorites_preference.js`).

**En ligne.** Uniquement domaine public et CC0, donc aucune source n'est affichée.
- Trames `/ws/api` `media-library-search` et `media-library-fetch` (`server/ws_media_library.js`).
- Sources : Openverse (images, sons), NASA (images, vidéos, sons), Internet Archive (vidéos).
- Le client ne reçoit que des identifiants, jamais d'URL.
- Un résultat devient un média de l'utilisateur au premier Insérer, Favori ou Lecture. Sa provenance
  reste dans `properties.media_library_source`.
- Relais Mac (`public_relay.rs`) et iOS (`FastifySyncPublicRelay.swift`) ajoutés. Ils ne sont pas
  recompilés ici.

**Brique partagée avec les Livres.** La lecture sûre d'un fichier chez un fournisseur public a été extraite
vers `server/public_source_fetch.js` et `eVe/domains/media/public_source_client.js`. `ws_book_sources.js`
et `book_source_client.js` l'appellent. Le résultat de la sonde serveur des Livres est identique avant et
après l'extraction.

**Fond d'écran.** Son bouton Import ouvre le panneau Média, qui liste les mêmes médias (« Mes images »).
« Télécharger » n'a pas été modifié. Les résultats en ligne ne sont pas encore proposés dans ce sélecteur :
le panneau Média fait 686 lignes et doit d'abord être allégé.

**Limites connues.**
- Openverse anonyme répond parfois au-delà de 20 s. Une recherche ne montre alors que les autres sources.
- Les métadonnées des sources sont surtout en anglais : « moon » trouve plus que « lune ».
- Un même média en ligne peut être téléchargé de nouveau d'une session à l'autre.
- Les vidéos NASA sont lourdes : 70 Mo pour la version moyenne.

## Décisions de l'utilisateur (20 oct. 2026)

- **Dashboard concerné : eVe Pro** (gabarit `dashboard_eve`). Le Générateur y est déjà dans Créer
  (sous-palette) : rien à déplacer.
- **Nom : Médiathèque** (EN « Library »).
- **Toucher un média = aperçu** sur la scène du Dashboard.
- **Outils sous l'aperçu**, comme pour la vidéo (J'aime, Favori, Idées, Pause, Fermer de
  `dashboard_stage_media.js`). Pour un média de la Médiathèque :
  - **Insérer dans le projet courant** ;
  - **Favori** ;
  - Lecture / Pause (vidéo et son) ;
  - Fermer.
- **Favoris : uniquement sur les médias** (images, vidéos, sons), jamais sur les News ni sur les autres
  rubriques.
- **« Télécharger » du fond d'écran : on n'y touche pas pour l'instant.**
- **Fond d'écran : la Médiathèque devient sa source d'image.** Le choix d'image du fond passe par la
  Médiathèque. Le bouton « Télécharger » (picsum) reste tel quel.

Points encore ouverts (§8) :
- la case exacte dans eVe Pro ;
- le périmètre des licences ;
- la Médiathèque en eVe Basique.

### Conséquences techniques des décisions

- **Place dans eVe Pro** : il n'y a pas de Générateur à remplacer. La case naturelle est **Boutique**
  (`shop`, `[4,0]` en Pro, `[1,1]` en Basique) :
  - c'est une rubrique vide (`EMPTY_RUBRICS`) ;
  - sa brique de progression est `available: false` (`dashboard_progression_catalog.js:44`) ;
  - c'est une cellule de scène (`stageCells`), donc l'aperçu s'y affiche déjà.

  À confirmer, car la Boutique disparaîtrait.
- **Aperçu** : la scène sait jouer `tv`, `youtube`, `panel`, `notification`, `gps` et la prise de
  Capture. Le **bon propriétaire existe** : `dashboard_mystic_take_review.js` (63 lignes). Il pose un atome
  audio ou vidéo sur la scène comme record éphémère de l'accueil, le joue par `ui.media.reader` et
  n'écrit rien dans l'accueil. Il faut l'étendre de « la prise » à « tout atome média », image comprise.
  Il ne faut pas créer un second lecteur. Pour un résultat en ligne pas encore téléchargé, l'aperçu joue
  l'URL d'aperçu du fournisseur, dans le même record éphémère.
- **Navigation** : `dashboard_media_navigation.js` (glisser haut → bas = suivant, gauche / droite =
  retour / avant) sert tel quel, pour parcourir une liste de médias sans revenir à la grille.
- **Insérer dans le projet courant** :
  - Sous le Dashboard, le projet courant est le dernier projet quitté (courant ≠ présenté,
    `isWorkspaceProjectPresented`). Capture vise déjà ce projet par `readLastProjectId`
    (`dashboard_mystic_capture.js:90`) : on réutilise ce même résolveur.
  - Média local : l'insertion passe par `importPreuploadedMediaIntoProject` (sans re-téléversement,
    `autoPlace: true`).
  - Résultat en ligne : téléchargement, puis le même chemin.
  - Piège connu : écrire dans un projet hors écran ne doit pas recréer la couche
    `project_view_<autre>` qui volait les touches (`known-bug-solutions/offscreen-project-layer-steals-pointer`).
- **Favori** :
  - Outil `star` allumé (`lit`), comme Favori TV / YouTube. Propriétaire : `profile_preference_list.js`,
    nouvelle liste `preferences.media.favorites`, réservée aux médias.
  - « J'aime » (`preferences.media.likes`) reste la préférence privée qui sert aux Idées : ce n'est pas
    la même chose, on n'y touche pas.
  - Un résultat en ligne mis en favori est téléchargé d'abord.
- **Fond d'écran** :
  - Le bouton Import (`open_background_import` → `requestMediaSelection({ kinds: ['image', 'video'] })`,
    `tools/background.js:34-41`) passe déjà par la porte unique. Rendre la Médiathèque source d'image
    revient donc à donner à cette porte (le panneau Média en mode choix) le contenu de la Médiathèque :
    favoris, mes médias, et en ligne si la v1 l'inclut.
  - Les autres appelants (photo de profil, emplacement, assistant) en profitent sans code de plus.
  - `download_random_background_image` n'est pas modifié.

## 0. Résumé

- Les briques nécessaires existent presque toutes :
  - le listage local (`record_audio_list_media`) ;
  - la porte d'import unique (panneau Média, `requestMediaSelection`) ;
  - le patron « recherche en ligne côté serveur + relais natifs » (YouTube, TV) ;
  - la liste de favoris du profil (`profile_preference_list.js`, déjà utilisée par « J'aime ») ;
  - les tuiles du Dashboard mystique, qui savent porter une image ou une vignette vidéo.
- Ce qui manque :
  1. une rubrique de Dashboard ;
  2. une trame serveur de recherche multi-sources ;
  3. un téléchargement distant générique, qui remplace celui du fond d'écran (picsum seul) ;
  4. un mode « ranger dans ma médiathèque sans projet » ;
  5. un téléchargement natif en flux pour les vidéos.
- Nom proposé : **Médiathèque** (EN « Library »), voir §5.
- Contrainte majeure : « on ne montre pas les sources » n'est compatible qu'avec des médias
  **CC0 / domaine public**. Les licences CC-BY et le contrat Pixabay exigent d'afficher la provenance (§4.3).

## 1. Point de départ : quel Dashboard ?

Il existe cinq styles (`preferences.visual.dashboardStyle`, `user_visual_preferences_model.js:21`) :

| Style | Gabarit | Tuile Générateur ? |
|---|---|---|
| Basique | `dashboard_basic` | non |
| Pro (intégré) | aucun : couloirs `calendar, news, contacts, monitor, projects` de `default_values/constants.json` | non |
| Mystique | `dashboard_mystic` (v5) | **oui, deux fois** : `[1,2]` et `generator_bottom` `[5,2]` (`slot: 1`) |
| eVe Basique / eVe Pro | `dashboard_eve` (v4) | non ; à sa place, `shop` (« Boutique », rubrique vide, `EMPTY_RUBRICS`) en `[4,0]` |

Source : `eVe/domains/templates/first_launch_template_catalog.js:271-325`.

**Tranché : eVe Pro.** On ne touche pas au Mystique. Créer contient **déjà** le Générateur, en
sous-palette (`dashboard_mystic_sources.js:211-219` : Texte, Dessin, Forme, puis Générateur avec ses cas).
La Médiathèque prend la case de la Boutique (vide), sous réserve de confirmation.

## 2. L'existant, brique par brique

### 2.1 Dashboard mystique / eVe

Une tuile, ce sont **quatre déclarations**. Il faut les modifier ensemble :
1. la cellule du gabarit (`cell(...)`), en montant la `version`. La mise à niveau des accueils installés
   est automatique (`project_template_runtime.js:103-108`) ;
2. la variante géométrique `DASHBOARD_HOME_VARIANTS` (`dashboard_mystic_grid.js:23-32`) :
   `contentOrder`, `stageCells`, `turnCells`, `replayRef` ;
3. la source `sources.<valeur>` (`dashboard_mystic_sources.js`, 280 lignes). Une valeur inconnue
   lève `dashboard_mystic_source_unknown` ;
4. la clé i18n `eve.dashboard.mystic.<valeur>` (`languages_dashboard_mystic.js`), la couleur de rubrique
   (`dashboard_mystic_colors.js:13-16`) et la liste de préchargement (`dashboard_mystic_runtime.js:72-74`).

Dans le Mystique, le Générateur ne fait pas que s'afficher : `turnCells.next = 'generator_1'` (page
suivante) et `replayRef = 'generator_1'` (rejouer une prise). Retirer la seconde occurrence oblige à
réattribuer ces deux rôles. On peut les donner à la seconde occurrence de la Médiathèque, `library_1`.

Sous-niveaux : un élément `{ type: 'palette', children | loadChildren }` ouvre une grille imbriquée
(exemple : Musique › Ma bibliothèque, `domains/music/music_mystic_items.js:92-103`, chargé à la demande).
Un élément peut porter `image` (logo) ou `cover` (vignette plein cadre), comme les vidéos YouTube
de Divertissement. Les résultats peuvent donc être des tuiles-vignettes **sans nouveau composant**.

La recherche permanente du bas a déjà des portées (`SEARCH_SCOPES`, dont `videos` et `music`) servies
par le Finder (`dashboard_mystic_sources.js` › `search`). Il n'y a **pas de portée Images**.

### 2.2 Listage local (déjà unique)

`window.record_audio_list_media({ types, onProgress })` dans `eVe/domains/media/api/audio_core_media.js`
est le seul propriétaire du listage :
- Web : session Fastify ;
- Tauri / iOS : `GET /api/uploads` du serveur local ;
- les atomes de prise sont lus par `Atome.listStateCurrent`.

Il rend images, vidéos et sons, par vagues progressives. Le Finder a déjà les portées
Images / Vidéos / Sons (`bevy_panel_finder_model.js:37-43`).

### 2.3 Import depuis l'ordinateur hôte (porte unique)

Depuis le 1er oct., **tout choix de fichier passe par le panneau Média** (`todo/import_panel.md` §8) :
- `requestMediaSelection({ kinds, multiple })` rend des éléments `library` ou `external` ;
- la fenêtre système n'est appelée que par le bouton « Ajouter des fichiers externes » ;
- garde : `temp/media_import_single_door.probe.mjs`.

Il y a deux modes aujourd'hui : **projet** (écrit dans le projet) et **choix** (rend un élément à un appelant).
**Il manque un troisième mode**, « ranger dans ma médiathèque » : téléverser sans projet.

Le stockage, lui, existe déjà : `sendFileToServer(file, { scope: 'global' })`
(`eVe/domains/media/asset_box_file_upload.js:92`) crée l'atome média global sur toutes les plateformes.
- Web invité : IndexedDB `squirrel_guest_workspace_v1`, servi par le service worker.
- Web connecté, Tauri, iOS : `POST /api/uploads`, rangé dans `data/users/<id>/Downloads`.
- L'atome est créé par `createUploadAtome` (`asset_box_atome_store.js:22-95`).

Il ne manque donc qu'un chemin d'UI par la même porte, pas un nouveau stockage.

Le panneau Média n'a **pas de champ de recherche**. Le fichier fait déjà **686 lignes**, au-delà du seuil
« ne pas faire grossir » : tout ajout passe par une extraction préalable ou par un module voisin.

### 2.4 « Télécharger » des préférences

La section Fond d'écran (`bevy_panel_home_settings_view.js:199-217`) a quatre boutons : Générateur,
sélection, import, télécharger. Elle déplie le panneau ouvert dans la section elle-même
(`buildEmbeddedPanelSections`, `bevy_panel_embedded_surface.js`). Une Médiathèque en mode choix
pourrait s'y déplier de la même façon.

« Télécharger » appelle `downloadRandomBackgroundImage` (`eVe/intuition/tools/background_image.js:130`),
qui passe par :
- `POST /api/uploads/remote-wallpaper` (`server/http_wallpaper_routes.js`) ;
- le fournisseur **unique** `https://picsum.photos/1920/1080` (image aléatoire), avec 3 tentatives ;
- le mode `?inline=1` pour les invités (1 appel / 2 s par IP) ;
- puis le même stockage qu'un import.

Il n'y a **ni recherche, ni catalogue, ni vidéo, ni son**. C'est la brique à généraliser : un
téléchargement distant vers le stockage de l'utilisateur, déjà robuste aux 401, aux invités et aux reprises
(`todo/fond_ecran_telechargement_2026-08-22.md`).

### 2.5 Patron de recherche en ligne (à copier en usage, pas en code)

YouTube et TV montrent le chemin canonique :
- le client envoie `adapter.ws.send({ type: 'youtube-search', query })` (`bevy_panel_finder_data.js:39-48`) ;
- `/ws/api` le transmet au handler serveur (`server/ws_youtube_search.js`, `server/ws_tv_catalog.js`).
  La clé reste sur le serveur ; le cache est côté serveur (12 h pour la TV) ;
- Tauri et iOS **relaient** vers atome.one. Les listes blanches sont
  `platforms/desktop-tauri/src/server/public_relay.rs:11` (`PUBLIC_TYPES`) et
  `platforms/ios/atome-auv3/Common/FastifySyncPublicRelay.swift:9` (`publicTypes`). Toute nouvelle trame
  doit y être ajoutée ;
- répartition serveur : `server/wsExternalResourceOperations.js:8-15`. Les clés sont lues dans `.env`
  (`server_boot_config.js:38-39`). Quotas par IP et par jour, et la clé n'est jamais journalisée ;
- côté UI, le Finder accepte une **source d'outil** injectable `{ scopes, load, activate, toggleFavorite,
  longPress, onClose }` (`bevy_panel_finder_runtime.js:132-140`, exemple `tools/tv.js:107-128`), avec un
  vrai champ de saisie (`textInputNode`). La Médiathèque peut s'en servir pour sa vue liste ;
- Musique : Deezer, Spotify et Apple Music ont une recherche de catalogue (métadonnées seulement, aucun
  fichier). Ce ne sont pas des sources de samples ;
- piège connu : un serveur sans la trame **l'ignore en silence** (délai dépassé). Il faut déployer
  atome.one avant de tester sur iPhone ou Tauri (`project_ws_pitfalls`).

### 2.6 Favoris

`createProfilePreferenceList` (`eVe/intuition/tools/profile_preference_list.js`) est la liste courte
du profil : publication immédiate, sauvegarde sérialisée, fusion multi-appareil. Elle a déjà
5 consommateurs, dont `media_likes_preference.js` (« J'aime », `preferences.media.likes`,
types `youtube | tv`, 500 éléments).

Les favoris de la Médiathèque sont une **instance de ce même propriétaire** :
`preferences.media.favorites`, réf = id de l'atome fichier, médias seulement. On ne crée pas un nouveau
mécanisme. On n'étend pas non plus « J'aime », qui sert aux Idées. L'outil est l'étoile `star` sous
l'aperçu, comme Favori TV / YouTube.

## 3. Organisation proposée

```
Médiathèque
├── [favoris directement en tuiles, tous types, les plus récents d'abord]
├── Images ─┬── Mes images       (listage local, favoris en tête)
│           ├── Importer         (panneau Média, mode « médiathèque » → fenêtre système)
│           └── En ligne         (résultats sans nom de source ; la recherche du bas filtre)
├── Vidéos ─┬── idem
└── Sons ───┴── idem (samples)
```

- Les **favoris** s'affichent directement au premier niveau, comme demandé. Les trois types suivent.
  On pourrait aussi les mettre dans chaque type ; c'est une variante à trancher.
- **Recherche** : la recherche permanente du Dashboard, active dans la rubrique ouverte.
  - En local, filtrage par nom, par le même pliage `foldText`.
  - En ligne, une seule requête serveur multi-sources ; les résultats arrivent en tuiles-vignettes.
  - Il faut ajouter la portée `images` à `SEARCH_SCOPES`, et `library` si l'on veut chercher
    partout à la fois.
- **Geste sur une tuile média** : à décider (§6).
  - Tranché : toucher = aperçu sur la scène. Les outils sous l'aperçu sont Insérer dans le projet
    courant, Favori, Lecture / Pause et Fermer.
  - Un résultat en ligne mis en favori est **téléchargé d'abord**. Un favori est ainsi toujours local,
    disponible hors ligne et synchronisable.
- Le panneau Média (dans le projet) et les appelants de `requestMediaSelection` (fond d'écran, photo de
  profil, emplacement, assistant) profitent du même contenu. Il suffit d'une source de plus dans le
  panneau existant.
  - Tranché : la Médiathèque est la source d'image du fond d'écran.
  - « Télécharger » (picsum) reste inchangé pour l'instant.

## 4. Sources en ligne

### 4.1 Candidats

| Source | Types | Clé | Licence | Remarques |
|---|---|---|---|---|
| **Openverse** (WordPress) | images, sons | facultative (OAuth2 client pour un quota plus élevé) | CC + domaine public, **filtrable `cc0,pdm`** | Agrège Wikimedia Commons, Flickr, musées, Freesound, Jamendo… ; quotas anonymes bas ; scraping interdit |
| **Freesound** | samples | clé (jeton) | CC0 / CC-BY / CC-BY-NC, filtrable | La recherche marche avec le jeton ; l'original exige **OAuth2 par utilisateur** → seulement les aperçus MP3/OGG HQ (avec perte) |
| **NASA Image & Video Library** | images, vidéos, sons | aucune | domaine public (quelques exceptions à vérifier) | Contenu thématique (espace) |
| **Internet Archive** | vidéos, sons | aucune | filtrable par `licenseurl` | Fichiers lourds, qualité inégale |
| **Wikimedia Commons** | images, vidéo (WebM), sons (OGG) | aucune (User-Agent exigé) | mixte, à filtrer | WebM/OGG mal lus sur iOS → transcodage ou exclusion |
| **Pixabay** | images, **vidéos** | clé | Pixabay License (pas d'attribution sur le média) | Images et vidéos seulement, **pas d'API son** ; 100 req / 60 s par clé ; cache 24 h ; **exige d'indiquer la provenance là où les résultats sont affichés** |
| Pexels | images, vidéos | clé | attribution attendue | **Interdit explicitement les applis de fonds d'écran** → exclu |
| Unsplash | images | clé | attribution obligatoire + hotlink imposé | Incompatible avec « stocker localement, sans source » → exclu |

### 4.2 Choix recommandé pour la v1

- Images : Openverse (`cc0,pdm`) + NASA.
- Vidéos : NASA + Internet Archive (PD/CC0). Pixabay seulement si une mention de provenance est acceptée.
- Sons : Freesound (filtre CC0, aperçus HQ) + Openverse audio (`cc0,pdm`).

Les clés (Freesound, Pixabay éventuellement, Openverse enregistré) vivent dans `/etc/squirrel/squirrel.env`
et dans le `.env` local, **jamais côté client**. Leur ajout est une action du propriétaire.

### 4.3 Licences et « on ne donne pas les sources »

- **CC0 / domaine public** : aucune obligation d'attribution. Le résultat peut s'afficher seul, en mode zen.
- **CC-BY** : l'attribution est une condition de la licence, en particulier à la publication (partage réseaux,
  News). Le média seul ne suffit pas.
- **NC / ND** : incompatibles avec un usage libre dans des projets édités et partagés. À exclure.
- **Pixabay** : sans attribution sur le média, mais l'API demande d'indiquer la provenance dans l'écran
  de résultats.

Proposition : la v1 ne retient **que CC0 / domaine public**. Chaque média téléchargé garde sa provenance
`{ provider, remote_id, license, author, source_url }` dans ses propriétés. On suit le modèle existant
`buildGenerationProvenance` (`eVe/intuition/tools/ai_generators/media_import.js:31-40`), qui sert aux
médias générés par IA : on ne crée pas un format parallèle. La provenance est invisible par défaut et
lisible dans Info.

Le seul affichage d'attribution qui existe aujourd'hui est celui d'OpenStreetMap (`bevy_panel_map.js:22-27`). Le même `provider + remote_id` permet de **dédoublonner** : un média déjà
téléchargé ne l'est pas deux fois.

### 4.4 Langue des requêtes

Les métadonnées sont surtout en anglais : « chat » donnera peu de résultats. Deux possibilités :
- accepter cette limite ;
- traduire la requête côté serveur avant la recherche.

La traduction est une brique de plus, à décider ; elle ne fait pas partie de la v1 proposée.

## 5. Nom

En français, « librairie » désigne un magasin de livres ; *library* se traduit par « bibliothèque ».
Pour un fonds d'images, de sons et de vidéos, le mot exact est **Médiathèque** :
- il est court ;
- il n'entre pas en conflit avec « Ma bibliothèque » de Musique, ni avec « Média » (le panneau d'import
  du projet) ;
- il ne laisse pas penser qu'il s'agit de livres.

EN : « Library ».

Alternatives : « Bibliothèque », qui ferait doublon avec Musique ; « Médias », proche de « Média » et ambigu.

## 6. Briques à créer ou à étendre (propriétaires visés)

| # | Brique | Propriétaire | Nature |
|---|---|---|---|
| 1 | Rubrique `library` | gabarit (`version` +1), variante, `sources.library` dans un **module à part** (comme `music_mystic_items.js`), i18n, couleur, préchargement | extension |
| 2 | Aperçu d'un média sur la scène | étendre `dashboard_mystic_take_review.js` de « la prise » à tout atome média (image comprise) et à une URL d'aperçu distante ; outils de scène dans un module voisin de `dashboard_stage_media.js` ; navigation `dashboard_media_navigation.js` | extension |
| 2b | Insérer dans le projet courant | `readLastProjectId` (Capture) + `importPreuploadedMediaIntoProject` | composition |
| 3 | Trame `media-library-search` | nouveau `server/ws_media_library_search.js` (agrégation, filtre de licence, entrelacement, dédoublonnage, cache 24 h exigé par les CGU, délai par source) + listes `PUBLIC_TYPES` / `publicTypes` | création |
| 4 | Téléchargement distant générique | généraliser `http_wallpaper_routes.js` en route de récupération : **liste blanche d'hôtes** (anti-SSRF), plafond de taille, type MIME vérifié, mode `inline` invité. Le fond d'écran en devient un consommateur | extension |
| 5 | Téléchargement natif en flux | Tauri (Axum, accès FS) et iOS (URLSession). Le relais iOS plafonne à **8 Mo** en base64 : une vidéo ne passe pas | extension |
| 6 | Mode « médiathèque » du panneau Média | `tools/media.js` appelle `sendFileToServer(…, { scope: 'global' })` (existant). Le panneau (686 lignes) est d'abord réduit, puis reçoit le mode. La garde de porte unique reste verte | extension |
| 7 | Favoris de médias | nouvelle instance `createProfilePreferenceList({ section: 'media', key: 'favorites' })`, médias seulement | composition |
| 8 | Portée de recherche Images | `SEARCH_SCOPES` + Finder | extension |
| 9 | Outils assistant / MCP | `library.search`, `library.import` dans le registre d'outils, capacité dans `DEFAULT_ACTOR_CAPABILITIES` (comme `tv.*` / `youtube.*`) | extension, facultatif v1 |

Tout atome média naît par le pipeline canonique (`createAtome` → `Atome.commit`). Aucun fichier n'est
référencé par un **chemin local** : c'est la cause de l'écran gris du fond d'écran venu d'un autre appareil
(`project_wallpaper`).

## 7. Risques et points à vérifier

- **Synchronisation des fichiers entre appareils** : à vérifier avant de promettre « mes médias partout ».
  L'atome se synchronise, mais il faut confirmer que les octets suivent.
- **Formats** : WebM et OGG sur iOS (Commons, Freesound OGG) ; prévoir MP3 / MP4 seulement, ou transcoder.
- **Hors ligne** : Tauri doit rester utilisable. La tuile En ligne est vide ou absente sans réseau ; aucun repli.
- **Quotas** : Openverse anonyme est très bas ; il faut un client enregistré côté serveur.
  Pixabay est limité à 100 req / min par clé, partagées par tous les utilisateurs d'atome.one.
- **Fichier `dashboard_mystic_sources.js`** : 280 lignes. La rubrique va dans son propre module pour ne pas
  le faire grossir.
- **Niveau d'expertise** : le Créer du Dashboard ignore le niveau (`resolveMysticToolItems` sans
  `accessContext`). Le Générateur y reste visible même en débutant, alors qu'il est `intermediate` dans
  le menu principal. C'est un écart existant, à trancher si on y touche.
- **eVe Basique** : la Médiathèque doit-elle être une brique gagnée (`dashboard_progression_catalog.js`)
  ou visible d'emblée ?

## 8. Décisions

Tranché le 20 oct. : eVe Pro, le nom Médiathèque, toucher = aperçu, outils Insérer + Favori, favoris
réservés aux médias, « Télécharger » inchangé, Médiathèque = source d'image du fond d'écran.

Reste à trancher :
1. Case dans eVe Pro : remplacer **Boutique** (proposé) ou une autre case ?
2. Licences : CC0 / domaine public seulement (zen, sans source), ou CC-BY / Pixabay avec une mention ?
3. eVe Basique : la Médiathèque visible d'emblée, ou brique gagnée (progression) ?
4. Favoris : au premier niveau de la Médiathèque (tous types), ou dans chaque type ?
