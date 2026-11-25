# Mode Scène « instrument » — cahier d'analyse (R-353, 2026-11-25)

Demande (utilisateur, 25 nov.) : dans le mode Scène des Cellules seulement, (1) sélectionner au lasso tout ou partie
des cellules et les disposer par blocs (Launchpad 8 × 8, pads 4 × 4, clavier mini), cellules agrandies si la place le
permet, jamais réduites ; (2) auto-assignation MIDI d'une sélection (Note ou CC, début → fin, canal), valable sur toute
sélection et dans toutes les vues ; (3) Geste en enregistrement pendant la lecture : une nouvelle piste qui enregistre
les lancements des cellules, au toucher comme au MIDI, et les rejoue ; priorité sur la Timeline ; (4) un mode qui joue
une cellule chromatiquement (poly, mono, legato), time stretch synchro, pitch bend ; (5) faire du mode Scène une vue à
part entière (« le mode Zen » de la dictée = le mode Scène) ; (6) le jeu polyphonique aussi en Cellules ?

Statut : analyse faite, aucun code de la fonction. Étapes suivantes : réponses aux questions §7 → maquettes (règle 16)
→ code par lots §6.

## 1. Ce qui existe (relevé du code, 25 nov.)

| Brique | Owner | État |
| --- | --- | --- |
| Filtre Scène | `project_view_cells_scene_filter.js#filteredCells`, outil `timeline_scene_filter` dans la palette Affichage du rail (`project_view_multitrack_tool.js:22`, `project_view_timeline_rail_groups.js`) | état `timeline.view.scene_filter` + `scene_id` (liste blanche de `kernel/timeline_view.js#setTimelineView`) ; cellules pleines de la Scène, dans l'ordre des pistes, en lignes, une case = un outil (`projectViewToolSize`), aucune position gardée |
| Lasso et sélection | `bevy_panel_lasso.js`, `project_view_timeline_cell_gestures.js:211-268` | Édition seulement ; `state.selectedCells` = `Set` de `scene|track`, non persisté ; blocs `project_view_cells_groups.js#expandCellKeys` |
| Cellule | `kernel/scene_schema.js` | `{cell_id, scene_id, track_id, settings}` : sa place est toujours le croisement Scène × piste |
| MIDI binding (R-293) | `project_view_midi_binding_tool.js`, `bevy_panel_timeline_midi_binding_runtime.js`, `midi_binding_service.js` | un atome `midi_binding` par cible, une seule cible à la fois ; lance `ui.timeline.cells.trigger` à l'appui |
| MIDI d'une cellule (ancien) | `project_view_timeline_cells_midi.js` | `settings.midi {note, channel}` par cellule ; appui ET relâche, vélocité ; son « Apprendre » met une sélection entière sur UNE note |
| Contrôles (R-347) | `control_action_cases.js`, `interaction_model.js` | troisième système à l'écoute du même moniteur MIDI ; cible `project` sans effet (R-352) |
| Lancement | `runtime_cells.js`, `molecule_cell_player.js` | quantification (premier tempo seul), Follow Actions, choke groups ; **pas d'exclusivité par piste** |
| Cellules ↔ Timeline | `runtime_api_transport.js:176-193` | un lancement de cellule **arrête tout le transport linéaire** ; la Lecture arrête les cellules : « qui démarre prend la main » |
| Geste | `natural_action_journal.js`, `recording/action_take.js`, `runtime_action_clips.js` | journalise les commits d'atomes et les trames de geste ; un lancement ne commit rien ⇒ **un Geste ne capte aucun lancement** |
| Prise MIDI | `recording/midi_take.js`, `midi_capture_runtime.js` | horodatée à l'arrivée (`performance.now()`), pas sur l'horloge audio |
| Sampler | `atome/engines/atome-instrument` (`sampler.rs`, `voice.rs`, `sampler/notes.rs`) | poly / mono / legato, glissé, bend (plage 0–48), vélocité, ADSR, 1–128 voix ; une zone = n'importe quel atome son avec sa racine (`kernel/instrument_operations.js:66-98`) |
| Étirement temps réel | `atome-instrument/src/stretch.rs` + `stretch/` (portage Rust de Signalsmith, natif et wasm32) | hauteur au lecteur sinc, durée à l'étireur ; ~1,9 % d'un cœur M1 par voix stéréo ; **utilisé seulement si `stretch != 1.0`** (`segment.rs:81`) ; le Sampler ignore le tempo |
| MIDI en direct → instrument | `midi_instrument_route.js` → `host_instrument_midi.js#hostInstrumentEvent` → rack → AudioWorklet (Web, quanta de 128) / graphe natif (64 trames) | une note part au bloc suivant, sans trame datée |

## 2. Défauts trouvés pendant l'audit

1. **Pitch bend à mi-course** — `host_instrument_midi.js` envoyait ±2 demi-tons, que `sampler.rs:289` et
   `synth/mod.rs:138` bornent à ±1 puis multiplient par leur propre plage : la molette atteignait le maximum à
   mi-course, puis plus rien. **Corrigé le 25 nov.** : la course −1..1 est envoyée, l'instrument applique sa plage
   (un seul traducteur, aussi pour les pistes MIDI). Sonde `temp/scene_perf_2026-11-25/bend.probe.mjs` 4/4, Biome
   propre. Le commentaire de `atome-instrument/src/event.rs:10` est corrigé aussi (couloir accordé).
2. **Binding de cellule sans vélocité** — `triggerGroupTimelineCells` ignore `midi_value`. → lot 2.
3. **Binding de cellule sans relâche** — seul `note_on` correspond ; une cellule Momentary liée par le panneau ne
   s'arrête jamais au relâché ; seuil forcé à 64 (`withRange`) : une note jouée doucement (vélocité < 64) ne lance
   pas. → lot 2.
4. **Deux chemins MIDI de cellule** (`settings.midi` et l'atome `midi_binding`) : une même note peut lancer deux
   fois. → lot 2 (un seul owner).
5. **Lecture de tous les bindings à chaque message MIDI** (`listStateCurrent`, limite 5000) : à mesurer sous un
   jeu rapide avant toute décision (pas de cache sans goulot mesuré). → lot 2.
6. **Horodatage MIDI ignoré** — trois origines différentes (Web MIDI, midir, AUv3), aucune conversion vers
   l'horloge audio. → lot 4.
7. **Écart possible** : `filterRows` (`project_view_timeline_layout.js:219`) n'exclut pas les pistes `laneOwnerOf`
   que `filteredCells` exclut (rangée de défilement en trop ?). À prouver par la sonde du lot 1.
8. `project_view_surface_runtime.js` a 502 lignes : à réduire avant d'y ajouter quoi que ce soit.
9. Cahier du sampler : la ligne « étirement natif seulement, refusé sur le Web » était périmée. **Corrigée le 25 nov.**

## 3. Analyse et recommandations

### 3.1 Vue Scène à part entière — oui

Le filtre Scène devient une vue avec sa disposition gardée, ses gestes (des pads) et son jeu : ce n'est plus un
affichage. Recommandation : `view.layout = 'scene'` (dans `TIMELINE_LAYOUTS`), proposée par Vue, et le filtre retiré
d'Affichage. Deux limites : (a) le 21 nov. (R-258) tu avais supprimé la vue Scène au profit du filtre, c'est donc ta
décision de revenir dessus ; (b) la règle 13 d'AGENTS.md liste les six vues de Vue : il faut y ajouter la septième.

### 3.2 Disposition par blocs

- **La disposition est une description, pas une vue** (règle 1) : `scenes[].layout = { blocks: [{ template,
  col, row, slots: [cell_id…] }] }`, validée par `scene_schema.js#validateScenes`, écrite par une opération noyau
  (`molecule.scene.layout`) en un seul pas d'historique, élaguée quand une piste ou une Scène disparaît (comme
  `withoutCellGroupMembers`). Plusieurs blocs peuvent cohabiter dans une Scène (un 4 × 4 et un clavier).
- **Gabarits** : Pads 4 × 4 (16), Launchpad 8 × 8 (64), Clavier (une octave = 7 blanches + 5 noires sur deux
  rangées, octaves empilées), Libre (l'ordre actuel). Les cellules sont posées dans l'ordre de la sélection (ordre de
  lecture de la vue), le reste du bloc en cases vides ; une sélection plus grande que le bloc ouvre un second bloc.
- **Taille** : la charte (règle 12) interdit « une unité grandie par une plus grande place ». Seules deux tailles
  standard sont possibles : l'outil (60) et la tuile (120 = 2 × 2 outils). Proposition : la tuile quand le bloc entier
  tient en tuiles, sinon l'outil, jamais entre les deux. C'est une exception à la règle 12, à valider (Q2).
- **Place** : un 8 × 8 en outils fait 480 px. Il ne tient pas sur un iPhone debout (environ 6 cases de large) ; il
  tient sur un iPad, et sur un iPhone couché. Un clavier de 37 touches (22 blanches) ne tient sur aucun écran d'un
  seul tenant, d'où les octaves empilées (Q3).

### 3.3 Auto-assignation MIDI (toute sélection, toutes les vues)

- **Un seul owner** : l'atome `midi_binding` (générique par cible, persisté, avec contrôle de conflit). Les
  `settings.midi` des cellules y migrent, puis `project_view_timeline_cells_midi.js` est retiré. Le binding porte la
  vélocité et la relâche (défauts 2 à 4).
- **Panneau MIDI avec une sélection de N objets** : Type (Note / CC / Prog.), Canal, Début (ou Apprendre : la
  première touche jouée), Pas (1 par défaut) ; Fin = Début + (N − 1) × Pas, affichée. L'ordre suit la disposition
  (le bloc case par case) ou, hors Scène, l'ordre de lecture de la vue. Si la fin dépasse 127, c'est une erreur
  explicite. Les bindings en conflit sont remplacés dans le même pas d'historique, pour qu'une seule annulation
  suffise.
- **Préréglages matériels** (proposition) : un bloc Launchpad propose la carte de notes du Launchpad (11–88, origine en
  bas à gauche), un 4 × 4 celle des pads MPC (36–51), un Clavier la suite chromatique depuis Do. Sinon, c'est
  Début/Pas.
- Pour une piste ou une tranche, l'auto-assignation donne des CC successifs (volumes), avec le même panneau.

### 3.4 Enregistrer le jeu des cellules — recommandation : une piste MIDI « Lancements »

- **Le jeu enregistré est une prise MIDI**, pas un Geste. Le Geste journalise des changements d'objets ; un
  lancement n'en est pas un. La Scène disposée devient un instrument : chaque case a sa note (celle de son binding,
  sinon celle de sa place dans le bloc). Toucher une case à l'écran émet exactement l'évènement qu'émettrait la touche
  MIDI, donc le toucher et le clavier MIDI suivent un seul chemin. La prise est un clip MIDI ordinaire (notes,
  vélocités, durée tenue pour les Momentary), routé vers « Cellules de la Scène X ». Elle réutilise la prise MIDI
  (`midi_take.js`), les notes en direct de R-343, le piano roll, la quantification et l'annulation. À la relecture, le
  clip envoie ses notes au lanceur, qui lance les cellules avec leur propre quantification.
- **Priorité, en remplaçant sans effacer** : je te propose de ne jamais effacer de piste (l'historique ne se réécrit
  pas). La règle devient structurelle : une cellule qui joue, quelle que soit la cause (toucher, MIDI, piste
  Lancements), prend sa piste. Les clips de la Timeline de cette piste se taisent tant qu'elle joue, puis reprennent
  à son arrêt (le « Back to Arrangement » d'Ableton, mais automatique et par piste). Ta crainte (« en MIDI on ne saura
  pas que ça remplace ») disparaît : il n'y a rien à détecter, c'est la cellule qui joue qui gagne. Un « Aplatir »
  pourra plus tard convertir la piste Lancements en vrais clips sur les pistes.
- **Changement moteur nécessaire** : aujourd'hui un lancement arrête toute la Timeline. Il faut qu'un lancement
  pendant la Lecture se cale sur l'horloge du transport (la même grille que la tête de lecture) et ne coupe que sa
  piste. **C'est le plus gros risque technique** : le lecteur de cellules a sa propre ancre de grille et ne lit que le
  premier tempo.
- **Exclusivité par piste** : aujourd'hui deux cellules d'une même piste jouent ensemble (seuls les choke groups les
  séparent). Avec « la cellule prend sa piste », il faut trancher : une cellule par piste à la fois, comme Ableton
  (Q5).

### 3.5 Jeu chromatique d'une cellule (Poly / Mono / Legato)

- **Le moteur l'a presque entièrement** : le Sampler joue une zone faite du clip de la cellule (sa racine = hauteur
  détectée, sinon Do 3), avec poly/mono/legato, glissé, bend (corrigé), ADSR, et l'étireur temps réel sur le Web comme
  en natif.
- **Il manque :**
  1. Une durée tenue quand la hauteur change (l'étireur est contourné à ×1, donc une note plus haute est plus courte).
  2. La synchro au tempo : facteur = durée du clip en temps au tempo du projet / durée réelle, recalculé à chaque
     changement de tempo ; le Sampler doit lire `Tempo`.
  3. Le départ d'une note sur une cellule rythmique : au début du clip (comme un sampler), ou à la phase de la mesure
     en cours (comme une boucle lancée) ? (Q6).
  4. Un réglage par cellule, `settings.play = 'launch' | 'poly' | 'mono' | 'legato'`, plus une plage de bend (2 par
     défaut, 12, 24).
- **Mise en œuvre** : une cellule passée en Poly reçoit un instrument Sampler canonique (pas de copie : une zone
  pointant vers son clip). Ses notes MIDI vont à cet instrument au lieu du lanceur. En vue Scène, un bloc Clavier
  « sur une cellule » joue cette cellule à toutes les hauteurs : c'est le « mode focus ».
- **Coûts et limites mesurés :**
  - ~1,9 % d'un cœur M1 par voix étirée. Un accord de 16 notes s'étale sur ~16 ms (une voix amorcée par
    milliseconde).
  - Sur le Web, une note part au quantum suivant, après un passage par le fil principal (quelques ms).
  - Rien n'est mesuré en wasm. À mesurer avant de fixer une polyphonie par défaut avec l'étirement (proposition :
    8 voix sur iPhone, 21 ailleurs).
  - L'étireur ajoute ~43 ms de fenêtre, masquée par l'amorçage puisque l'échantillon est connu.
- **En Cellules aussi** : oui, et sans travail en plus. Le mode est un réglage de la cellule, donc il vaut dans toute
  vue qui la montre ; la piste Lancements enregistre alors aussi la hauteur. La seule limite est qu'en Cellules la
  case est un seul pad : on joue la hauteur au clavier MIDI, et à l'écran seulement en vue Scène (bloc Clavier).

## 4. Problèmes d'interface et d'usage à anticiper

- Le lasso n'existe qu'en Édition : en vue Scène, un toucher lance, donc disposer passe par Édition (cohérent avec
  R-275).
- Le bloc disposé devient un instrument : glisser sur les pads doit jouer (multitouch R-243), pas faire défiler. Le
  défilement doit être réservé à un glisser hors des blocs, ou à deux doigts.
- Une cellule lancée en Poly reste-t-elle visible comme « en lecture » ? Il faut un retour par note (case allumée par
  touche du bloc Clavier).
- Enregistrer, puis relire alors que le musicien rejoue par-dessus : la piste Lancements fusionne (comme le Merge
  MIDI) ou remplace sa zone (comme l'Overdub off). Je propose de reprendre le comportement des prises MIDI existantes.
- Zen (règle 10) : aucun libellé sur les pads en plus du nom de la cellule (règle 11, en haut).

## 5. Fichiers partagés et couloirs à prévoir

`atome/engines/atome-instrument/*` (tempo, durée tenue), `mix-graph` (instrument), `eVe/intuition/tools/molecule/*`
(noyau `scene_schema`, `timeline_view`, `runtime_cells`, `runtime_api_transport`), `project_view_timeline_*`
(couloir R-178, aujourd'hui bloqué), WASM. Couloirs à demander à l'orchestrateur à chaque lot.

## 6. Lots proposés (après validation)

1. Vue Scène (layout `scene`), disposition par blocs gardée dans la Scène, outil « Disposer » sous Édition, tailles
   outil/tuile. Sonde Playwright.
2. Un seul binding MIDI (migration, vélocité, relâche, seuil, mesure de la lecture par message) + auto-assignation de
   toute sélection, avec préréglages matériels.
3. Lanceur calé sur le transport, la cellule qui prend sa piste, exclusivité par piste.
4. Piste « Lancements » : prise MIDI vers les cellules, horodatage converti sur l'horloge audio, relecture.
5. Jeu chromatique : `settings.play`, instrument Sampler de la cellule, durée tenue + tempo dans
   `atome-instrument`, bloc Clavier focus, mesure wasm.

## 7. Questions ouvertes (posées le 25 nov.)

Voir R-353 au registre : Q1 vue Scène dans Vue ; Q2 tailles outil/tuile seulement ; Q3 téléphone debout ; Q4 piste
« Lancements » MIDI au lieu d'un Geste ; Q5 « la cellule prend sa piste » sans effacer + une cellule par piste ;
Q6 départ d'une note chromatique sur une cellule rythmique ; Q7 « clavier 35 touches » = 25, 32 ou 37 ?

## 8. Réponses (utilisateur, 25 nov.)

Q1 oui (vue Scène dans Vue) ; Q2 outil ou tuile selon la place ; Q3 le 8 × 8 défile sur iPhone debout ; Q4 piste MIDI ;
Q5 oui, comme Ableton ; Q6 depuis le début du clip, ses réglages (départ, boucle) respectés ; Q7 25 et 37 touches,
aussi 49 / 61 / 76 : défilement ou découpe, à proposer en maquette.

## 9. Deuxième tour (utilisateur, 25 nov.) : 8B validé ; création, déplacement, départ avec la Scène

- Aujourd'hui : lancer une Scène joue d'un bloc la plage de la Scène sur toutes les pistes (`runtime_cells.js#cellWindow`,
  `trackIds: null`), sans les réglages propres de chaque cellule ; un double toucher en vue Scène ne fait rien (il
  n'ouvre une cellule que sous Édition, `project_view_timeline_cell_gestures.js#double`) ; une cellule = Scène × piste.
- Proposition : (1) double toucher sur le fond = une cellule vide à cette case, sur une piste sans cellule dans cette
  Scène, sinon une piste créée (invisible ici) ; (2) maintenir-glisser = déplacer, la case visée s'ouvre, les suivantes
  se décalent ; (3) départ avec la Scène = `settings.scene_start` (vrai par défaut), interrupteur « En Scène » du rail
  sous Édition, sur toute la sélection ; (4) la séquence de lancement est une cellule MIDI de la Scène (piste
  « Lancements »), lancée avec la Scène ; une cellule qu'elle joue ne part pas seule (règle déduite, rien à
  synchroniser : supprimer la séquence rend le départ) ; départ effectif = En Scène allumé ET non jouée par une
  séquence de la Scène ; (5) lancer une Scène lance chacune de ses cellules qui partent, avec ses propres réglages
  (comme Ableton) au lieu d'un bloc.
- Questions R1–R4 : R1 marque 16A, 16B ou 16C ; R2 la règle déduite pour la séquence (oui/non) ; R3 la séquence en
  cellule MIDI de la Scène (la piste « Lancements » de la maquette 10 a une cellule par Scène, posable dans la
  Timeline) ; R4 lancer une Scène = lancer chaque cellule avec ses propres réglages.

## 10. Avancement du codage (25 nov.)

- [x] L1 — vue Scène dans Vue, disposition par blocs (`kernel/scene_layout.js`), outil Disposer, tailles outil/tuile.
- [x] L2 — un seul binding MIDI, auto-assignation de toute sélection (`midi_binding_batch.js`, `midi_assign_map.js`).
- [x] L3 — lancer une Scène = chaque cellule avec ses réglages, En Scène (`kernel/scene_start.js`).
- [x] L4 — double toucher = nouvelle cellule, maintenir-glisser = déplacer (les suivantes se décalent).
- [x] L5 — la cellule qui joue prend sa piste pendant la Lecture.
- [x] L6 — piste « Lancements » (Sortie « Cellules ») : écho des touchers dans la prise MIDI, relecture qui lance les
  cellules, R2, marque 16A. Sondes `l6_logic.probe.mjs` 18/18, `probe/l6.probe.mjs` 6/6.
- [x] L7 — jeu chromatique : Son › Jeu (Lancer, Poly, Mono, Legato), Bend (2, 12, 24), Glissé ; Sampler de la cellule
  (`kernel/cell_instrument.js`, `runtime_cell_instrument.js`), note depuis le début du clip avec ses réglages (Q6),
  durée tenue au tempo (`Segment.hold` dans `atome-instrument`) ; Clavier d'une seule cellule (`focus`) ; clavier MIDI
  dans les Cellules (`project_view_cells_midi_keys.js`). Sondes `l7_logic.probe.mjs`, `probe/l7.probe.mjs`.
