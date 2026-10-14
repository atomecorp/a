# Timeline multipiste — cahier des charges

**État : REMPLACÉ** par [`timeline_cellules_cahier_des_charges_v1.6.md`](timeline_cellules_cahier_des_charges_v1.6.md) (v1.6, 14 oct. 2026), qui fait foi. Ce brouillon v0 reste comme trace des sources consultées (documents, historique git, ancien code des cellules).

### Décisions du 14 oct. 2026 pour la première ébauche (à lire avec la v1.6)

- **Projet = Molécule racine** : la timeline multipiste vit sur le projet lui-même, sans Molécule à créer.
- **Première ébauche = Timeline + enregistrement.** Les Cellules (vue Matrice, Scènes, Échantillons) forment le lot suivant. Le modèle doit prévoir des **Follow Actions assignables à n'importe quelle cellule**.
- **Synchro calée sur Web et Tauri**, par une horloge de rendu partagée entre lecture et capture. Aujourd'hui seul l'AUv3 est exact.
- **La Timeline est un arbre BevyUI** construit depuis les pistes, comme la vue Mixage. L'ancienne scène `mol:*` sera retirée après parité.
- **Briques autorisées** : Record déposé, règle en mesures, métronome audible, timeline du projet, outil Quantize, outil Input, outil Volume de piste, Solo effectif.
- **Bande des Scènes** réservée et vide dans l'ébauche.
- **Prompteur** raccordé en dernier : il est développé par une autre tâche.

Ce document consolide les sources existantes et les demandes de l'utilisateur. Une fois validé, la Timeline sera réalisée en **une seule tâche** qui le suit à la lettre.

## Comment lire ce document

Chaque exigence porte un identifiant `TL-xx`, une **source** et un **état dans le code**.

**Sources** :

| Code | Document |
|---|---|
| `[DAW]` | Brief visuel `todo/prompt_daw_sequenceur_html_ameliore.md`. Supprimé le 13 juil. 2026, lisible par `git show e1321d60:todo/prompt_daw_sequenceur_html_ameliore.md`. Désigné par l'utilisateur comme **la** référence de la timeline. |
| `[MOL]` | `todo/molecule/NewMolecules.md` (spec Molécule v2, « active et faisant autorité »). |
| `[SONG]` | `todo/New work/atome_songlist_full_spec.md`. |
| `[TBX]` | `todo/New work/atome_toolbox_addons_spec.md`. |
| `[REC-A]` | `todo/0_record_actions.md` (Record d'actions). |
| `[MIDI]` | `todo/midi/atome_midi_binding_system.md`. |
| `[OLD]` | `done/molecule_architecture_and_rebuild_plan.md` §4.4 et §4.9 (liste de capacités, titres seulement). |
| `[MOL-07]` | **Ancienne version** de `NewMolecules.md` (commit `44cb22f3`, 20 juil. 2026), §3H « Marker-defined sections and track Cells (restored product invariant) » et tâche V2.13. Lisible par `git show 44cb22f3:todo/molecule/NewMolecules.md` (lignes 122-157 et 189). **Supprimée par la réécriture du 13 août**, qui interdit désormais Marker/Cell. |
| `[CELLS]` | Ancien code des cellules MTrax, supprimé le 20 juin 2026 (commit eVe `8c547164`). Fichiers `domains/mtrax/timeline/loop_cells_{model,sections,runtime,preview}.js`, `shared/loop_cell_keys.js`, `timeline/play_runtime.js:400-470`, lisibles par `git show 8c547164^:<fichier>`. Audit du 30 avril : `todo/molecule/PROJET_MOLECULE_DEBUG.md` L348-389. |
| `[U]` | Demande de l'utilisateur dans la conversation du 13-14 oct. 2026. |
| `[U-1014]` | Explication des régions et cellules par l'utilisateur, 14 oct. 2026. **Fait foi** sur ce sujet, avant tout document. |
| `[CROQUIS-1014]` | Croquis de l'utilisateur, 14 oct. 2026 : timeline, grille de cellules, bande compteur, rangée d'outils (décrit au §7.0). Maquettes non contractuelles : `maquette_daw_2026-10-14.webp` et `maquette_sobriete_2026-10-14.webp`, dans ce dossier. |

**États dans le code** : **EXISTE**, **PARTIEL**, **ABSENT**. Les chemins sont relatifs à `eVe/`.

Les points marqués **❓** sont des questions ouvertes. Ils sont rassemblés au §14.

### Contraintes du projet (non négociables, `AGENTS.md`)

Le brief `[DAW]` demandait une maquette **HTML/CSS/SVG en DOM**. Ici, il ne sert que de **référence visuelle**.

La Timeline réelle est rendue :
- par le compositeur Bevy/WebGPU partagé, sur `#eve_surface_project` ;
- sans DOM visible ni canvas par élément.

Tout passe par les outils canoniques, l'historique et la persistance. Toute brique manquante doit être autorisée individuellement avant d'être créée.

---

## 1. Principe

- **TL-01** — La Timeline est **une manière de voir** le projet, pas un objet à part. Un projet se mixe et se monte comme une Molécule. Liste, Matrice, Mixage et Timeline sont des projections du même état canonique. `[U]` `[MOL L247]`
  - État : **PARTIEL**. Timeline et Mixage n'existent aujourd'hui que pour une Molécule (`domains/rendering/project_view_molecule_timeline_content.js`). Un projet sans Molécule affiche « Aucune Molécule ».
- **TL-02** — La Timeline part de la **vue Liste actuelle**. Elle reprend les mêmes rangées, groupes et accordéons, mais avec un vrai axe temporel, des blocs déplaçables et plus d'outils. `[U]`
  - État : **PARTIEL**. Chaque rangée de la Liste a déjà un aperçu placé sur un axe de temps commun (`intuition/runtime/bevy_panel/bevy_panel_record_timeline_preview.js`). Il n'y a ni règle, ni tête de lecture commune, ni zoom.
- **TL-03** — Le Record d'actions utilisateur produit aussi une timeline : on est dans le même environnement. `[U]` `[REC-A]`
  - État : **EXISTE** en Liste/Matrice (`domains/rendering/project_view_capture_to_timeline.js`). Le mode Naturel tient un journal à part, qui ne produit pas de clips.
- **TL-04** — La Timeline est déjà prévue comme « Phase 2 » de la Molécule : une 3ᵉ activité qui déroule toutes les sections de gauche à droite. `[MOL L240-247]`
  - État : **PARTIEL** (`intuition/tools/molecule/render/timeline_scene.js`). Défaut connu : en mode timeline, l'état vide n'est jamais monté (`domains/rendering/project_view_surface_runtime.js:43`), et l'écran ressemble alors à la Disposition.

## 2. Disposition de l'écran (référence `[DAW]`)

- **TL-09 — Sobriété absolue** `[U]` (maquettes du 14 oct. 2026, non contractuelles, qui donnent l'esprit). Le design doit rester **le plus sobre possible**, pour paraître simple à l'usage alors qu'il y aura beaucoup de fonctions :
  - aucun texte qui guide, très peu de libellés ;
  - aucun élément graphique superflu ;
  - rangées nettes : couleur, S, M, nom, contenu.
  
  Même esprit que `[SONG §36]` : rien sans justification, aucune décoration.

L'ordre vertical est strict `[DAW]` :
1. preview ;
2. pistes ;
3. règle ;
4. zones de section (marqueurs) ;
5. waveform détaillée ;
6. barre d'outils.

| ID | Exigence | Source | État |
|---|---|---|---|
| TL-10 | **Preview en haut**, large, sans aucun contrôle ni label. Elle montre ce qui joue (vidéo, image, texte). | `[DAW §1]` `[SONG §24]` | **EXISTE** : panneau Visuel (`domains/rendering/project_view_visual_panel.js`), tiers supérieur des vues structurées. |
| TL-11 | **En-têtes de piste** étroits, avec seulement un carré de couleur et le nom. Pas d'œil, de mute/solo, de type ni d'extension. | `[DAW §2]` | **ABSENT** dans la scène timeline (aucun texte). La Liste a des noms. ❓ Q8 : où placer mute, solo et le groupe. |
| TL-12 | **Groupes repliables** : un groupe contient des sous-pistes (exemple : Group 1 › Layer 1, Layer 2). | `[U]` `[DAW §2]` `[SONG §5-6]` | **PARTIEL** : accordéon de la Liste (`project_view_list_content.js` `toggleEntry`). Les groupes de Molécule ne sont que des bus de mixage `[MOL §6]`. ❓ Q3 |
| TL-13 | **Blocs (clips)** à coins arrondis, avec une poignée visible (trait de 3 px) à gauche et à droite et un contenu selon le type : vidéo = miniatures, audio = waveform, groupe = segments, sampler = ticks, FX = hachures. | `[DAW §2]` | **PARTIEL** : blocs, poignées de crop et aperçus (waveform, vidéo) existent dans `timeline_scene.js` et `render/timeline_previews.js`. Les couleurs par type et les ticks/hachures sont absents. |
| TL-14 | **Règle** sous les pistes, alignée au même X que les blocs, avec ticks mineurs/majeurs et quelques labels. À gauche, le timecode courant `00:00:00:00`. | `[DAW §4]` | **PARTIEL** : la règle existe, en **secondes**, sans label ni timecode (`timeline_scene.js:356`). |
| TL-15 | **Sélection verte** redimensionnable dans la règle, avec deux poignées. Elle sert d'intervalle de travail (boucle, punch, sélection). | `[DAW §4]` `[SONG §18]` `[U-1014]` | **ABSENT**. **Résolu** : c'est la zone de **sélection et boucle**, sous les régions (TL-7Q). |
| TL-16 | **Bande des zones de section**, sous la règle : blocs nommés et colorés (Intro, Part A, Part B, Breakdown, Part C, Outro), de longueurs différentes, avec deux poignées. | `[DAW §5]` `[U]` | **PARTIEL** : la bande des sections de Molécule existe (`timeline_scene.js:345`) avec des frontières déplaçables, mais sans nom ni couleur, et les sections y sont contiguës. ❓ Q1 |
| TL-17 | **Waveform détaillée** en bas, de la sélection ou de la piste courante, sans aucun contrôle. | `[DAW §6]` `[U-1014]` | **ABSENT**. **Visualisation seulement** pour l'instant ; slices plus tard. ❓ Q9 : de quel contenu. |
| TL-18 | **Tête de lecture** unique, qui traverse pistes, règle, zones et waveform. Son triangle est en bas, pointé vers le haut. | `[DAW §3]` `[MOL §7]` | **PARTIEL** : une tête de lecture existe (`timeline_scene.js:431`), mais pas son triangle en bas. |
| TL-19 | **Outils** : Play, Stop, Record, Rewind, Fast Forward, Loop, Metronome, Mute, Solo, Cut, Delete, Split, Join, Zoom In, Zoom Out. | `[DAW §7]` `[U-1014]` | **Résolu** : pas de barre d'outils permanente. Les outils vont dans la **barre latérale droite** (rail contextuel), comme le veulent `[SONG §20]` et `[TBX]`. |
| TL-20 | Le temps va toujours de gauche à droite, quelle que soit la main dominante. | `[MOL §4]` | **EXISTE**. |

## 3. Temps

| ID | Exigence | Source | État |
|---|---|---|---|
| TL-30 | Tempo, signature, carte de tempo ; une section peut changer de tempo ou de signature. | `[MOL §7]` | **EXISTE** dans le noyau (`intuition/tools/molecule/kernel/time_model.js`, `secondsToMusical`). |
| TL-31 | **Quantisation** : Off, mesure, temps, subdivisions. Globale ou par piste. Elle s'applique au placement, au déplacement, au redimensionnement, au Record, au crop et aux boucles. | `[MOL §7]` | **EXISTE** dans le noyau (`kernel/quantization.js`). Réglage dans le panneau Info de la Molécule. |
| TL-32 | **Unité de la règle** : mesures/temps, min:s, échantillons ou SMPTE (selon la cadence du projet), une seule à la fois. | `[SONG §18]` `[TBX]` | **ABSENT** (secondes seulement). ❓ Q5 |
| TL-33 | **Métronome audible et décompte**. | `[SONG §23]` `[DAW §7]` | **ABSENT** : seul un réglage `metronome_enabled` existe, sans aucun son. |
| TL-34 | **Pré-roll** réglable dans un **outil de réglage de la timeline**. | `[U]` `[MOL L191]` | **PARTIEL** : `pre_roll_bars` existe (noyau et panneau Info), mais pas d'outil de réglage dédié. |
| TL-35 | Précision à l'échantillon pour l'audio. Les pixels ne sont jamais la source du timing. | `[SONG §16]` `[MOL §2]` | **EXISTE** dans le modèle (trames entières). Les captures Web, Tauri et iOS sont marquées « non exactes ». Seul l'AUv3 `plugin_input` est exact `[MOL §8]`. |

## 4. Outils sur les blocs

Tous les outils audio et vidéo doivent fonctionner sur les blocs de la timeline : **audio, vidéo, MIDI, texte**. `[U]`

| ID | Outil | Source | État (noyau `intuition/tools/molecule/kernel/`) |
|---|---|---|---|
| TL-40 | Déplacer (dans le temps et **vers une autre piste**) | `[SONG §31]` `[DAW]` | **PARTIEL** : `moveClip` accepte `track_id`, mais le geste ne déplace que dans le temps (`runtime/molecule_timeline_scene_bridge.js:108`). |
| TL-41 | Crop non destructif | `[MOL §9]` `[SONG §27]` | **EXISTE** (`resizeClip`, poignées). |
| TL-42 | **Split** (couper en deux) | `[U]` `[SONG §28]` `[DAW]` | **PARTIEL** : `splitClip` existe ; le geste est alt + double-clic. Pas d'outil visible. |
| TL-43 | **Join** (rejoindre deux blocs) | `[U]` `[SONG §29]` `[DAW]` | **ABSENT** du noyau. |
| TL-44 | **Stretch** | `[U]` | **EXISTE** dans le noyau (`stretch.js`, de 0,25× à 4×). Le geste est à vérifier. |
| TL-45 | Boucle de bloc (en tirant le bord) et boucle de piste (Loop In/Out, répétitions, polyrythmie) | `[MOL §9-10]` `[SONG §32]` | **EXISTE** (`block_loop.js`, `track.loop`). |
| TL-46 | Supprimer une zone temporelle | `[SONG §30]` | **PARTIEL** : `deleteClip` existe, mais pas la suppression d'une portion. |
| TL-47 | Copier, couper, coller, dupliquer | `[DAW]` | **EXISTE** (opérations `clip.copy`, `clip.cut`, `clip.paste`, `clip.duplicate`). |
| TL-48 | Mute, Solo | `[DAW]` `[MOL §6]` | **PARTIEL** : mute existe ; solo existe dans le modèle (`track.solo`), mais n'est pas lu par le transport. |
| TL-49 | FX : appliqué à une piste entière ou peint sur une portion | `[SONG §26]` | **ABSENT**. Interface non spécifiée dans la source. |
| TL-4A | Zoom horizontal | `[DAW]` | **PARTIEL** : ctrl + molette (`view.set`). |
| TL-4B | Les **blocs MIDI** se comportent comme les autres blocs | `[U]` | **ABSENT** : pas de type de piste ni de clip MIDI dans la Molécule (`intuition/tools/molecule/track_types/index.js`). |

## 5. Enregistrement

| ID | Exigence | Source | État |
|---|---|---|---|
| TL-50 | **Record déposé** : on attrape l'outil Record (audio ou vidéo), on le dépose sur **une ou plusieurs pistes** et on tire pour définir une zone. Le type d'enregistrement (audio, vidéo) suit celui du recorder. | `[U]` `[MOL L186]` | **PARTIEL** : le modèle « zone Record armée » existe (`kernel/structure.js:299`, typée, persistante, quantisée). Le **geste de dépôt est absent**, et une zone ne vise qu'**une** piste. |
| TL-51 | Valeurs par défaut : audio = 4 mesures ; vidéo = remplir l'espace vide ; pré-roll = 1 mesure. | `[MOL §8]` | **EXISTE** (`kernel/timeline_factory.js` `record_defaults`). |
| TL-52 | Au Play, les zones armées se déclenchent quand la tête de lecture les atteint. Elles enregistrent en synchro, et chacune s'arrête à sa propre fin. Un scrub ne déclenche jamais. Démarrer à l'intérieur d'une zone enregistre à partir de ce point. | `[MOL §8]` `[U]` | **EXISTE** dans le moteur (`intuition/tools/molecule/runtime_record_scheduler.js`). |
| TL-53 | Pendant la prise, les autres pistes continuent de jouer. La piste cible est muette sous la zone. | `[MOL §8]` | **PARTIEL** : l'atténuation sous la zone est à vérifier. |
| TL-54 | **Record à la volée** : sans zone, on enregistre au timecode courant (« pas pile », non exact). | `[U]` `[MOL §8]` | **EXISTE** (Record dans une Molécule). |
| TL-55 | **Se positionner puis Record** : on place la tête de lecture, puis on lance Record. | `[U]` | **EXISTE** (`timeline_start_frame` = tête de lecture). |
| TL-56 | **Punch In / Punch Out**. | `[U]` `[SONG §18]` | ❓ Q2 : est-ce la même chose qu'une zone Record (TL-50) ou des repères à part ? |
| TL-57 | **Enregistrement MIDI** sur une piste. | `[U]` | **PARTIEL** : `ui.capture.midi` crée un fichier MIDI, mais il n'existe pas de piste MIDI dans la Molécule (voir TL-4B). |
| TL-58 | Record au niveau Projet/Liste crée automatiquement Chanson › Section › Piste. Record sur une section crée une nouvelle piste parallèle. | `[SONG §10]` `[MOL §8]` | **PARTIEL** : c'est le cas dans une Molécule (`runtime_creation.js` `prepareRecording`). La palette « rec. » du mode Naturel crée des objets flottants. ❓ Q4 |

## 6. Prises et comping

Aucune source écrite ne couvre cette partie, en dehors du titre « Takes / Overdub » dans `[OLD]`. Tout ce qui suit vient de `[U]`.

- **TL-60** — **Double-clic sur une zone Record encore vide** → réglage du **nombre de prises**. **ABSENT**.
- **TL-61** — **Une boucle posée au-dessus d'une zone Record** enregistre plusieurs fois, ce qui donne un **comping automatique**. **ABSENT**. Une zone est aujourd'hui consommée à la première prise (`kernel/reducers.js:118`).
- **TL-62** — **Plusieurs zones Record à la suite sur la même piste** : seule la première enregistre. Les suivantes **relisent** la première prise. **ABSENT**.
- **TL-63** — **Sur plusieurs pistes**, chaque zone enregistre. **PARTIEL** : le moteur lance les zones de toutes les pistes, mais une seule capture audio à la fois (`recording/generic.js`, `source_busy`).
- **TL-64** — Choisir et assembler les meilleurs morceaux des prises (comping) : interface **non spécifiée**. ❓ Q10

## 7. Régions et cellules

**Source qui fait foi : l'explication de l'utilisateur du 14 oct. 2026 `[U-1014]`.** Elle prime sur tous les documents. `[MOL-07 §3H]` et `[CELLS]` ne servent que de contexte : leurs règles ne s'appliquent que si elles ne contredisent pas `[U-1014]`. La version du 13 août de `[MOL]`, qui interdit Marker/Cell, est **remplacée sur ce point**.

C'est la partie la plus importante de la tâche.

### 7.0 Croquis de référence `[CROQUIS-1014]`

Croquis à main levée de l'utilisateur, 14 oct. 2026. Il donne la structure, pas le rendu final. Il n'est pas enregistré dans le dépôt ; à y ajouter s'il est fourni en fichier. Description :

- **En haut, deux zones côte à côte.**
  - **À gauche, la timeline.** En-têtes de piste TR1 à TR4 ; TR4 porte un bouton **Rec** rouge, l'armement de la piste. Les blocs audio sont placés librement dans le temps.
  - **À droite, la grille des cellules.** Quatre colonnes environ. Ses lignes sont **alignées sur les pistes** de la timeline.
- **Sous les pistes, une bande « counter »** (en-tête « counter », le compteur), qui porte deux choses :
  - les **zones marqueurs** en violet : les régions, de longueurs différentes, avec des espaces entre elles ;
  - juste en dessous, une **zone de boucle** en vert, la loop zone.
  
  Côté grille, cette bande porte la **cellule du bas** de chaque colonne, qui joue toute la région. Sur le croquis elle est aplatie parce que la bande est coupée en deux (régions et boucle). **Correction de l'utilisateur : elle est carrée, comme toutes les cellules.**
- **En dessous, la waveform détaillée.** **Visualisation seulement pour l'instant** `[U-1014]`. Les traits bleus pointillés sont les **slices**, reportées (TL-7S).
- **Tout en bas, une rangée d'outils.** **Correction de l'utilisateur : ne pas tenir compte de leur place.** Ces outils vont dans la **barre latérale droite** (rail contextuel), pas dans une rangée sous la waveform. Ils ne servent ici qu'à expliquer le concept :
  - **Play**, avec deux cibles : **cellules** ou **timeline** ;
  - **Follow Action** ;
  - **Slice** ;
  - **One shot** ;
  - **Loop** ;
  - **Latch** ;
  - **Cells** ;
  - **Source**, en rouge, avec quatre choix : **Audio**, **Vidéo**, **Cells**, **Slice**. Une flèche relie « cells » à une petite icône au bord droit de la grille.

### 7.1 Disposition

- **TL-70** — **Timeline à gauche, panneau des cellules à droite.** Pour un gaucher, l'ordre s'inverse, par le réglage de latéralité existant. `[U-1014]` `[CROQUIS-1014]`
  - Les lignes de la grille sont alignées sur les pistes.
  - La bande compteur (régions et zone de boucle) prolonge la grille par la rangée des cellules du bas.

### 7.2 Régions

- **TL-71** — On crée une **région** avec l'outil Zone de section. On l'utilise dans la **bande des régions** (en rose sur le dessin), sous la règle : on y **sélectionne une partie de la timeline**, un intervalle de temps.
  - Une région a un **début et une fin propres**.
  - Elle peut laisser des espaces avant ou après la région voisine (TL-16).
- **TL-72** — Tout ce qui se trouve **au-dessus** de la région, sur toutes les pistes et dans son intervalle, est **découpé**. Ce découpage **donne naissance à une colonne** dans le panneau des cellules.
  - Une région = une colonne.
  - Première région créée = première colonne.

### 7.3 Cellules d'une colonne

- **TL-73** — **La cellule du bas** de la colonne représente **toute la région**. Toucher cette cellule joue **toute la colonne**, donc toutes les pistes sur l'intervalle de la région.
  - Elle est **carrée, comme toutes les cellules** `[U-1014]`. Elle se distingue par sa place, dans la rangée de la bande des régions.
- **TL-74** — **Au-dessus, une cellule par piste.** La cellule de la piste N, dans la colonne de la région R, joue **uniquement la partie de la piste N comprise dans la région R**.
- **TL-75** — **Lancement** : toucher une cellule joue son contenu, et seulement lui. On peut aussi **assigner un contrôle MIDI** à n'importe quelle cellule, y compris celle du bas.
  - La liaison MIDI vers un outil existe déjà : `intuition/runtime/midi_binding_service.js` (MIDI Learn), à brancher sur l'outil de lancement de cellule.
- **TL-76** — Une cellule **ne copie rien**. Elle est la vue d'une région sur une piste et joue le vrai contenu de la timeline. Cette règle reprend `[MOL-07]`, compatible avec `[U-1014]`.

- **TL-7P** — **Modes de lancement**, outils de la **barre latérale droite** `[U-1014]` : **One shot** (joue une fois), **Loop** (en boucle), **Latch** et **Follow Action** (enchaînement vers une autre cellule ou colonne).
  - **Play** lance au choix les **cellules** ou la **timeline**.
  - Le détail de chaque mode : ❓ Q17.
- **TL-7Q** — **Zone de boucle** : petit intervalle vert sous les régions, distinct de celles-ci. Il sert de **sélection et de boucle** `[U-1014]` : il boucle une partie de la lecture et, d'après §6, sert au comping en boucle. C'est la « sélection verte » de TL-15.
- **TL-7R** — **Armement d'une piste** (bouton Rec dans l'en-tête de piste). ❓ Q8

### 7.4 Organisation

- **TL-77** — Les **colonnes peuvent être réordonnées**.
- **TL-78** — Les **cellules peuvent être copiées, collées et déplacées**.
- **TL-79** — **Réordonner des colonnes, ou copier/coller/déplacer des cellules, réorganise la timeline derrière.** La grille et la timeline restent ainsi toujours deux vues du même contenu.
  - L'utilisateur penche pour cette option, sinon « on ne comprendra plus rien », et m'en laisse juger. Je la recommande : c'est la seule qui garde une seule vérité.
  - ❓ Q15 : règles exactes, voir §14.

### 7.5 Reporté (hors périmètre pour l'instant)

- **TL-7S** — **Slices** de la waveform détaillée : chaque slice pourra donner naissance à une cellule. **Abandonné pour l'instant** par l'utilisateur, à traiter après les régions.

### 7.6 Ce que le code contient aujourd'hui

**ABSENT** : pas de région, de panneau de cellules ni de lancement de cellule. Ce qui est réutilisable :
- le transport qui joue un intervalle, et une seule piste (`intuition/tools/molecule/runtime_transport.js`, `play({ trackId, startFrame })`) ;
- les liaisons MIDI ;
- les opérations du noyau sur les clips : split, déplacement, copier/coller (`kernel/reducers.js`).

L'ancien code DOM des cellules `[CELLS]` ne doit pas revenir. Il reste seulement la preuve de comportements utiles (enchaînement, répétitions, Record déposé sur une cellule), qu'on retiendra si l'utilisateur les confirme (Q12).

## 8. Mixage

- **TL-80** — La vue Mixage s'applique aussi au projet (TL-01). `[U]`
- **TL-81** — Contenu actuel : par piste, mute, volume, pan et bus de groupe (`domains/rendering/project_view_molecule_mix_content.js`). `[SONG §21]` dit de ne pas inventer le reste de la vue Mixage tant qu'il n'est pas spécifié. ❓ Q13

## 9. Prompteur

- **TL-90** — Le texte synchronisé (paroles) se pose comme un bloc texte de la timeline. `[U]`
  - Le prompteur est développé par une **autre tâche**. Son lot 1 est livré : un texte avec une propriété `prompter`, voir `intuition/tools/prompter/`.
  - **Raccordement en dernier**. Ne pas modifier ses fichiers avant.

## 10. API, historique, persistance

- **TL-100** — Chaque geste a un outil `ui.timeline.*` / `eve.timeline.*` équivalent (IA/MCP). Il est groupable en lot, tracé, et annulable en un seul point. `[MOL §11]` **EXISTE** pour les opérations du noyau (`intuition/tools/timeline_actions.js`). À étendre pour chaque nouveauté.
- **TL-101** — `molecule_timeline` (sur l'atome propriétaire) reste le seul instantané durable. Les vues, le transport et les caches sont jetables. `[MOL §2]` ❓ Q4 : où vit la timeline d'un projet ?
- **TL-102** — Plateformes : Web, Tauri, iOS. AUv3 pour l'overdub exact.

## 11. Critères d'acceptation

Chaque point est prouvé dans l'app réelle par des gestes réels sur le canevas, avec captures d'écran et une console propre :

1. Un projet avec 3 enregistrements s'ouvre en Timeline et en Mixage, sans « Aucune Molécule ».
2. **Scénario multipiste** `[U]` :
   - 120 BPM, 4/4, quantisation à la mesure ;
   - 4 pistes enregistrées depuis la mesure 1, chacune pendant que les précédentes jouent ;
   - une 5ᵉ piste enregistrée à partir de la **mesure 2** (zone déposée, pré-roll 1 mesure) ;
   - on vérifie que son clip commence à mesure 2, temps 1.
3. Split, join, stretch, crop et déplacement entre pistes fonctionnent sur un bloc audio, un bloc vidéo, un bloc MIDI et un bloc texte.
4. Régions et cellules :
   - créer une région crée une colonne ;
   - la cellule du bas joue toute la région ;
   - une cellule de piste joue seulement sa piste dans la région ;
   - lancement par MIDI ;
   - modes One shot, Loop, Latch et Follow Action ;
   - réordonner des colonnes et copier/déplacer des cellules réorganise la timeline.
5. Prises : nombre de prises, comping en boucle, relecture sur la même piste.

## 12. Hors périmètre de cette tâche (sauf décision contraire)

- FX peints, sauf validation de TL-49.
- Follow actions et chaînes `[OLD §4.4]`, sauf si Q12 les retient.

## 13. Briques manquantes (à autoriser une par une avant de coder)

1. Geste « Record déposé et tiré », avec une zone sur une ou plusieurs pistes (TL-50).
2. Prises multiples et comping, avec la règle de relecture sur la même piste (TL-60 à TL-64).
3. Régions, panneau de cellules, lancement des cellules et leurs modes, réorganisation de la timeline depuis la grille (TL-70 à TL-7R).
4. Join (TL-43) et suppression d'une portion (TL-46).
5. Pistes et blocs MIDI dans la Molécule (TL-4B, TL-57).
6. Métronome audible et décompte (TL-33).
7. Règle en mesures, min:s, échantillons et SMPTE (TL-32), et sélection verte (TL-15).
8. En-têtes de piste avec nom et couleur, waveform détaillée (TL-11, TL-17).
9. Timeline et Mixage au niveau du projet (TL-01, selon Q4).

## 14. Questions ouvertes

**Résolues par `[U-1014]`** :
- **Q0** : les cellules font partie du produit, l'interdiction Marker/Cell est levée.
- **Q1** : une région est un intervalle libre, avec un début et une fin, et des espaces possibles entre régions.
- **Q11** : les cellules sont un panneau à droite de la timeline (à gauche pour un gaucher).
- **Q6** : la bande verte sous les régions sert de sélection et de boucle.
- **Q7** : les outils vont dans la barre latérale droite, pas de barre permanente.
- Les cellules du bas sont carrées.

**Doutes sur les régions et cellules (à lever en priorité)** :
- **Q15** — **Réorganisation** (TL-79) :
  - Réordonner deux colonnes = échanger la place des deux régions dans la timeline, leur contenu de toutes les pistes se déplaçant avec elles ?
  - Que deviennent alors les espaces entre régions et le contenu situé hors de toute région ?
  - Proposition : les régions se suivent dans l'ordre des colonnes, les espaces et le contenu hors région restent en place.
- **Q16** — **Copier/coller une cellule** (piste N, région R) dans une autre cellule (piste M, région S) : le contenu de la piste N dans R **remplace**-t-il celui de la piste M dans S ? Et si les deux régions n'ont pas la même durée : on coupe, on boucle, ou on étire la région ?
- **Q17** — **Lancement**. Le croquis donne les modes One shot, Loop, Latch et Follow Action. Reste à préciser :
  - **Latch** : la cellule continue après qu'on a relâché, et un 2ᵉ toucher l'arrête ? Sans Latch, joue-t-elle seulement tant qu'on appuie ?
  - Ces modes se règlent-ils par cellule, par colonne, ou pour toute la grille ?
  - Lancer une autre cellule de la **même piste** arrête-t-il la première, comme dans Ableton (une cellule active par piste) ?
  - Le départ est-il **quantisé** sur la mesure ?
  - **Follow Action** : se contente-t-il de « suivante, après N répétitions » comme dans `[CELLS]`, ou faut-il d'autres choix (précédente, aléatoire, arrêt) ?
- **Q22** — **Outil Source** (Audio, Vidéo, Cells, Slice) : que choisit-il ?
  - ce que montre la waveform détaillée du bas ;
  - ou ce qu'on enregistre ou découpe ;
  - ou la source qui alimente les cellules ?
  
  Et à quoi sert la petite icône au bord droit de la grille, reliée par la flèche ?
- **Q23** — **Outil Cells** de la barre latérale : afficher ou masquer le panneau des cellules, ou autre chose ?
- **Q18** — Deux régions peuvent-elles **se chevaucher** ?
- **Q19** — Que deviennent les **Sections** actuelles de la Molécule, qui sont contiguës et ont leur propre tempo ?
  - Proposition : elles restent la structure (couplet ou refrain avec leur tempo).
  - Les régions sont un calque libre posé par-dessus.
- **Q20** — **Cellule vide** (la piste n'a rien dans la région) : affichée vide, ou masquée ?
- **Q21** — **Enregistrer dans une cellule** (déposer Record sur une cellule, comme dans `[CELLS]`) : oui ?
- **Q12** — **Enchaînement des colonnes** (suivante après N répétitions, comme dans `[CELLS]`), scènes, one-shot : lesquels font partie de cette tâche ?

**Autres questions** :
- **Q2** — **Punch In/Out** : est-ce simplement les bornes d'une zone Record (TL-50), ou une paire de repères globaux dans la règle ?
- **Q3** — **Groupes de pistes** : est-ce un regroupement visuel repliable, un bus de mixage, ou les deux ?
- **Q4** — **Timeline d'un projet** : le projet porte-t-il lui-même une timeline multipiste (le projet = la Molécule racine) ? Ou bien chaque enregistrement entre-t-il dans une Molécule, comme le dit `[SONG §10]` ?
- **Q5** — **Unité de la règle** par défaut : mesures/temps, ou timecode `00:00:00:00` comme dans `[DAW]` ?
- **Q8** — Où placer **mute, solo, armement** d'une piste ? La 2ᵉ maquette les place sur la rangée (S, M), ce qui contredit `[DAW]`.
- **Q9** — **Waveform détaillée** : de quoi (piste sélectionnée, bloc sélectionné, mixage complet) ? Elle servira aux slices, qui sont reportées.
- **Q10** — **Comping** : comment choisit-on et assemble-t-on les morceaux des différentes prises ?
- **Q13** — **Contenu de la vue Mixage** au-delà de mute, volume, pan et bus.
- **Q14** — Dessins à venir : régions, cellules et liaisons, prises, Record déposé.
