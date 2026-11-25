# 04 — Cellules et Scènes

Propriétaires : `eVe/domains/rendering/project_view_timeline_cells*.js`, `project_view_timeline_cell_gestures.js`,
`project_view_cells_take_gestures.js`, `project_view_timeline_cell_inspector.js`, `project_view_timeline_scenes.js`,
`project_view_cells_*.js`, vue Scène `project_view_scene_layout.js`, `_scene_arrange.js`, `_scene_gestures.js`,
`_scene_new_cell.js` ; `molecule/runtime_cells.js`, `runtime_cell_recording.js` ; noyau `scenes.js`,
`scene_matrix.js`, `cell_content.js`, `cell_defaults.js`, `scene_layout.js`, `scene_start.js`, `cell_follow.js`,
`cell_progress.js`, `cell_instrument.js`, `runtime_cells_sequence.js` ; `eVe/core/media_engine/molecule_cell_player.js`.
Cahier : `todo/timeline/timeline_cellules_cahier_des_charges_v1.6.md`.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Lancer

- **CE-01** · P0 · W I A — Édition éteinte : toucher une cellule pleine → elle part au prochain point de quantification ;
  la retoucher → elle s'arrête. *Sonde* `tests/probes/molecule_cell_player.probe.mjs`.
  *Mise à jour 2026-11-25* : Incomplète depuis le 17–18 nov. (R-231) : la retouche dépend de Répét. (Aucune = arrêt, Retrig = relance) et du Lancement (One-shot : la retouche ne l'arrête pas). Préciser « Lancement Latch, Répét. Aucune ».
- **CE-02** · P0 · W — Deux cellules de la même piste lancées l'une après l'autre jouent ensemble (B n'arrête pas A).
  *Mise à jour 2026-11-25 (« deux cellules de la même piste jouent ensemble »)* : FAUX depuis le 25 nov. 2026 (R-353 L5, Q5 « comme Ableton ») : une seule cellule par piste joue ; lancer B arrête A. Remplacée par CE-36.
- **CE-03** · P0 · W — Passes : 2 passes = exactement deux, même doigt tenu ; 0 = infini. One-shot = une fois.
  *Mise à jour 2026-11-25* : « One-shot = une fois » : depuis R-231 One-shot joue jusqu'au bout même retouché (déclencheur `once`) ; les Passes sont dans la palette Lancement.
- **CE-04** · P1 · W — Momentary : joue tant qu'on tient, s'arrête au relâchement avec son fondu de fin.
- **CE-05** · P1 · W — Follow Action : à la fin, la cellule suivante part (et Record Action ne l'enregistre pas).
- **CE-06** · P1 · W — Attaque / Release en ms exactes (1 ms) : pas de clic.
- **CE-07** · P1 · W — Une même liaison MIDI sur trois cellules : un événement les lance toutes, chacune à sa quantification.
- **CE-24** · P0 · W I A — Édition éteinte : toucher une cellule audio pleine → on l'entend ; une cellule vidéo → son
  image avance dans l'aperçu et le son joue ; une cellule MIDI → ses notes partent vers sa sortie, plus rien après l'arrêt.
  *Sonde* `tests/probes/molecule_cell_player.probe.mjs`. *Origine* R-231, R-346.
- **CE-25** · P0 · W I — Cellule vidéo touchée sur l'iPad : l'aperçu n'est jamais noir, il montre l'image dès que le son
  part (même avec la latence de sortie de l'iPad). *Origine* R-346 (`project_view_visual_program.js` `announced`).
- **CE-26** · P0 · W I — Une piste en Solo coupe le son ET l'image des autres pistes, en Timeline comme en Cellules ; Solo
  retiré, toutes les cellules rejouent. *Origine* R-346 (cause du « clip muet »).
- **CE-27** · P1 · W — Une vidéo sans piste son lisible se lance quand même (son image joue, aucune erreur de lecture).
  *Origine* R-346 (`molecule_session_clips.js#_ensureVideoAudioAsset`).
- **CE-28** · P0 · W I — Rangée Réglages, palette « Lancement » : One-shot (joue jusqu'au bout, un toucher pendant ne
  l'arrête pas), Latch, Boucle, Tenu, B. tenue ; Passes ; Chance (une cellule à 50 % ne part qu'une fois sur deux environ).
  *Sonde* `tests/probes/molecule_cell_launch_settings.probe.mjs`. *Origine* R-231.
- **CE-29** · P1 · W — Palette « Reprise » : Début (repart du début), Où arrêté (repart où elle s'est arrêtée), Repère
  (repart d'un repère de la Timeline dans sa fenêtre). *Sonde* `molecule_cell_launch_settings`. *Origine* R-231.
- **CE-30** · P1 · W — Palette « Répét. » : Aucune (un 2ᵉ toucher arrête), Retrig (un 2ᵉ toucher relance du début),
  Ratchet + Nombre + Cadence (le début est répété N fois à la cadence avant la cellule). *Sonde* `molecule_cell_launch_settings`.
  *Origine* R-231.
- **CE-31** · P1 · W — Palette « Son » : Envel. ouvre le panneau ADSR (courbe + Attaque, Déclin, Maintien, Relâche, nom au
  pied, sans ✕) ; Vitesse 0,25–4 ; Pitch (demi-tons, par le module `pitch_shift` de la tranche, ajouté au 1ᵉʳ usage) ;
  Inverse (le clip joue de sa fin à son début) ; Vélocité 0–100 %. On entend chaque changement. *Sonde*
  `molecule_cell_launch_settings`. *Origine* R-231 (moteur `atome-mix-graph/src/voice.rs`).
- **CE-32** · P1 · W — Palette « Calage » : Départ, Fin, Groupe (deux cellules d'un même groupe d'exclusion : lancer l'une
  arrête l'autre). *Origine* R-231.
- **CE-33** · P1 · W — Une note MIDI frappe ses cellules à sa vélocité (note douce = cellule plus douce). *Origine* R-231
  (`project_view_timeline_cells_midi.js`).
- **CE-34** · P0 · W I — Mitrailleuse : une cellule (clap) en mode Tenu touchée très vite 20 fois → 20 départs, chacun du
  début, monophonique, un léger fondu entre deux (fondu de sortie ou 5 ms), aucun coup perdu, aucun clic, son entendu
  ≈ 20 ms après le toucher sur l'iPhone ; après 8 s de silence le 1ᵉʳ toucher part aussi vite. *Sonde*
  `tests/probes/molecule_cell_gesture_order.probe.mjs`, `molecule_cell_player.probe.mjs`. *Origine* R-307.
- **CE-35** · P0 · W I — Multitouch : 2 ou 3 cellules touchées ensemble partent ensemble. *Origine* R-243
  (`bevy_ui_pointer_multi_touch.js`).
- **CE-36** · P0 · W I — Une seule cellule par piste joue (comme Ableton) : lancer une cellule d'une piste arrête l'autre
  cellule de cette piste. *Origine* R-353 L5 (Q5). *Remplace* CE-02, voir § 3.
- **CE-37** · P0 · W — Pendant la Lecture de la Timeline, lancer une cellule : seule sa piste passe à la cellule (son et
  MIDI), calée sur les mesures de la Lecture ; les autres pistes de la Timeline continuent ; la cellule arrêtée, sa piste
  reprend la Timeline. *Origine* R-353 L5 (`runtime_playback_pair.js`, `runtime_api_transport.js`).
- **CE-38** · P1 · W I — Chaque cellule d'une Scène qui joue montre sa propre barre de progression, qui repart à chaque
  boucle (on voit la vitesse de lecture et le nombre de passes). *Origine* R-346 (`kernel/cell_progress.js`).
- **CE-39** · P1 · W — Follow Action d'une cellule « Preset {nom} » (rouleau Fin clip) : à la fin du clip, la tranche de sa
  piste prend le preset choisi, le clip continue sans décalage ; les queues de réverb / délai sont coupées net.
  *Origine* R-365 (`runtime_cells_follow_preset.js` ; preuve `temp/strip_preset_live_2026-11-25/probe.mjs`).
- **CE-40** · P1 · W — « Preset » n'apparaît pas dans le rouleau Fin Scène (seulement Fin clip). *Origine* R-365.
- **CE-41** · P1 · W — Toucher une cellule pendant son fondu de fin la relance (ce n'est pas un arrêt).
  *Sonde* `molecule_cell_player`. *Origine* R-307.

## B. Enregistrer dans une cellule (R-182)

- **CE-10** · P0 · W — Toucher une cellule vide (transport en marche) → elle enregistre, calée sur la quantification ;
  retoucher → la prise s'arrête à la frontière de fin et boucle proprement. *Sonde* `tests/probes/molecule_cell_recording.probe.mjs`, `tests/probes/music/cells_record_ui.probe.mjs`.
- **CE-11** · P0 · W — Transport arrêté : toucher une cellule vide → décompte, puis transport et prise ensemble.
- **CE-12** · P0 · W — Toucher une zone vide de la vue Cellules → une nouvelle cellule (nouvelle Scène) qui enregistre
  avec le dernier mode (Audio, Vidéo, MIDI) sur la Longueur de Réglages (défaut 1 mesure).
  *Mise à jour 2026-11-25* : « nouvelle cellule (nouvelle Scène) » : FAUX depuis le 19 nov. (R-243) : une case vide ou la zone sous une cellule enregistre DANS la Scène touchée, sur la longueur de la Scène ; seule une zone hors Scène en crée une. Et depuis R-277 (22 nov.) la Scène grandit à la Longueur avant la prise.
- **CE-13** · P1 · W — Appui long sur une zone vide : prise tant qu'on tient ; glisser sur « Verrou » la garde.
- **CE-14** · P1 · W — Longueurs : 1/16, 1/8, 1/4, 1/2, 1 temps, 1, 2, 3, 4, 8, 16 mesures, Libre ; double toucher =
  valeur tapée.
  *Mise à jour 2026-11-25* : Liste des longueurs : 32 et 64 mesures ajoutées le 22 nov. (R-277).
- **CE-15** · P0 · W — La prise d'une cellule existe une seule fois : la Timeline et la cellule montrent le même
  contenu (lien vivant, pas de copie). *Sonde* `tests/probes/molecule_scenes_cells.probe.mjs`.
- **CE-16** · P1 · W — Capture immédiate : ce qui précède la frontière est gardé dans la prise (récupérable en édition)
  mais pas rejoué.
- **CE-42** · P0 · W I — Projet neuf (aucune piste, aucune Scène), Édition éteinte : toucher le vide des Cellules → « Piste 1 »
  + « Scène 1 » + une prise dans la cellule, un seul pas d'annulation. *Sonde* `tests/probes/music/cells_record_ui.probe.mjs`.
  *Origine* R-203.
- **CE-43** · P0 · W — Toucher la rangée des Scènes (vide) → une Scène vide naît ; aucune piste créée. *Origine* R-203.
- **CE-44** · P0 · W I — Toucher une case vide (ou sous une cellule) de la Scène 1 → la prise va DANS la Scène 1, jamais dans
  une nouvelle Scène ; elle dure la Scène (Scène de 8 mesures = prise de 8 mesures). *Sonde* `cells_record_ui`.
  *Origine* R-243.
- **CE-45** · P0 · W — Enregistrer une cellule pendant que d'autres jouent : la prise part à son propre pas de grille,
  sans attendre la fin des autres. *Origine* R-243.
- **CE-46** · P0 · W — Longueur à 4 mesures, Scène de 1 mesure : toucher une case vide → la Scène grandit à 4 mesures avant
  la prise, la prise fait 4 mesures. *Origine* R-277 (`growSceneOperations`).
- **CE-47** · P1 · W — Longueur : 32 et 64 mesures proposées en plus ; le curseur Longueur est plus long. *Origine* R-277.
- **CE-48** · P1 · W I — La forme d'onde de la prise se dessine dans la cellule et dans l'Inspecteur, gris clair
  (#bfbfbf) sur le fond assombri de la famille de la piste. *Origine* R-243, R-278 (`cellWaveInk`).
- **CE-49** · P1 · W — Comping : Édition + case vide → curseur « Prises » (nombre de cycles) ; Lecture → une prise par
  cycle, la dernière joue ; Édition + cellule pleine → palette « Prises » Prise 1…N, une autre choisie joue. *Origine* R-243
  (`kernel/takes.js#splitIntoTakes`).
- **CE-50** · P1 · W I — Appui long sur une cellule VIDE → les sources de prise (Audio, Vidéo, MIDI…) et « Importer » sur
  place ; Importer → le panneau média, le son choisi va dans la cellule tenue et y joue. *Origine* R-299 (preuve
  `temp/cells_import_2026-11-23/import.probe.mjs`).
- **CE-51** · P1 · W I — Un son illisible dans une cellule ne rend pas muettes les autres ; son erreur est dite
  (`molecule_clip_audio_unreadable`). ALAC, CAF, Opus, WebM importés jouent. *Origine* R-299.
- **CE-52** · P1 · W — Édition, une cellule choisie : Média (ou un dépôt de fichiers sur une cellule) importe dans cette
  cellule (vidée d'abord si pleine) ; plusieurs médias remplissent les cellules libres suivantes de la même piste, vers la
  droite, en créant les Scènes manquantes (8A). *Origine* R-258 (`project_view_cells_import.js`).
- **CE-53** · P1 · W I — Coin des Cellules : « + » touché → s'allume, le rail montre seuls « Nv. piste » et « Nv. scène » ;
  un choix crée la piste ou la Scène, l'amène dans la vue et rend le rail ; un 2ᵉ toucher sur « + » rend le rail.
  *Origine* R-291 (`project_view_cells_corner_add.js`).

## C. Édition, Réglages, inspecteur

- **CE-20** · P0 · W — Édition allumée : toucher sélectionne sans lancer ; lasso depuis le vide ; glisser déplace le
  contenu (Alt copie) ; glisser une colonne de Scène.
  *Mise à jour 2026-11-25* : « Édition allumée : toucher sélectionne » toujours vrai ; « glisser une colonne de Scène » se fait maintenant par appui long puis glisser, la colonne grossit ×1,12 (R-287, 23 nov.).
- **CE-21** · P1 · W — Réglages sans sélection = valeurs par défaut dans le rail ; avec sélection = réglages de la
  sélection, appliqués en lot à toutes les cellules choisies (un seul pas d'annulation).
  *Mise à jour 2026-11-25* : « Réglages … dans le rail » : depuis R-231 (18 nov.) les réglages sont la rangée de six palettes au-dessus de la bande (Lancement, Reprise, Répét., Son, Calage, MIDI), plus Jeu (R-353), Prises (R-243) et les Follow Actions ; le rail des Cellules ne garde qu'Effacer + Longueur.
- **CE-22** · P1 · W — Cellule vide choisie, Inspecteur allumé : sa règle vide à la Longueur ; la prise s'y dessine en direct.
- **CE-23** · P1 · W — Vider plusieurs cellules en lot.
- **CE-54** · P0 · W I — Édition allumée : toucher une cellule la choisit SANS la jouer ni l'agrandir ; la rangée montre les
  réglages de CE clip ; sans choix, Réglages montre les défauts d'une nouvelle cellule ; un double toucher l'agrandit.
  *Origine* R-243, R-258.
- **CE-55** · P1 · W I — Édition : les cellules choisies ont un contour lavande 2 px avec sa lueur (`cell_glow`), les autres
  sont voilées aux ¾ ; en thème Ambre, pas de contour : les choisies sont remplies d'orange, onde et nom en gris.
  *Origine* R-277 (A4), R-279.
- **CE-56** · P1 · W I — Édition, appui long sur une cellule pleine → plaques sur place (pas en bas) : Nom, Suppr., Piste,
  Effets (Effets absent sur une piste sans son, ex. image). *Origine* R-203 (`project_view_cells_hold_menu.js`).
- **CE-57** · P1 · W — Plaque Nom : champ sur place, le nom tapé s'affiche en haut de la cellule à la place du nom de piste.
  *Origine* R-203.
- **CE-58** · P1 · W — Plaque Piste : la liste des pistes + « Nv. piste » ; vers une piste dont la cellule est occupée →
  les deux cellules s'échangent ; Nv. piste → une piste créée juste dessous. *Origine* R-203, R-258 (option A).
- **CE-59** · P1 · W — Plaque Effets : la tranche de la cellule (seule, soudée à sa colonne) avec toute la console (+, panneaux
  d'effet, interrupteur, réglage en direct) ; l'effet ne touche QUE ce clip (cellule à −6 dB = moitié du niveau, le reste
  de la piste inchangé) ; fermée au changement de Scène ou de vue. *Origine* R-203, R-243.
- **CE-60** · P1 · W — « Sortie » d'une cellule vers une autre piste ou un bus : son son y va, la cellule reste sur sa piste.
  *Origine* R-243.
- **CE-61** · P1 · W — Édition, des cellules choisies, outil « Piste » du rail : elles sont routées vers la piste choisie ;
  deux clips d'une même Scène vers une même piste → le 1ᵉʳ dans la cellule, chaque suivant sur une nouvelle piste.
  *Origine* R-258 (Q2 A, `project_view_cells_route.js`).
- **CE-62** · P1 · W I — Rangées : une rangée de cellules sur deux sur le fond alterné (`laneAltFill`), jusqu'au socle des
  en-têtes, comme les pistes de la Timeline ; la rangée choisie garde son voile. *Origine* R-345.
- **CE-63** · P1 · W I — Cases des Cellules à la taille des outils de la Console, écart = joint de la grille ; la bande de
  sélection d'une ligne ou d'une Scène, à la taille standard, déborde autour des cases ; un séparateur vertical seul (plus
  de trait horizontal au-dessus des Scènes). *Origine* R-272 (option 2, v3).
- **CE-64** · P1 · W I — Zone pleine des Cellules : un doigt posé sur une cellule puis glissé fait défiler (doux, fondu de
  bord) ; la cellule ne se lance qu'au relâcher sans mouvement ; la molette au-dessus d'une cellule fait défiler.
  *Origine* R-277.
- **CE-65** · P1 · W Ph — Téléphone : la dernière colonne compte dès qu'une cellule y tient (5 cellules par rangée en vue
  Scène au lieu de 4, 4ᵉ Scène visible). *Origine* R-277.
- **CE-67** · P1 · W — Rouleau Fin clip : un preset de plusieurs parties y figure aussi partie par partie
  (« Crunch · Effets », « Crunch · Routage », « Crunch · E/S ») ; à la fin du clip seule cette partie se charge.
  *Origine* R-366 (`project_view_cells_settings_row.js`, `scene_schema.js#validateFollowAction` `parts`).
- **CE-66** · P1 · W — Le clavier MIDI joue la cellule choisie (Son › Jeu Poly, Mono ou Legato) à sa hauteur et sa vélocité,
  le pitch bend la tord sur sa plage Bend ; une autre sélection lâche le clavier. *Origine* R-353 L7
  (`project_view_cells_midi_keys.js`).

## D. Scènes

- **SC-01** · P0 · W — Tracer une Scène dans la bande des Scènes (glisser tenu), la déplacer, la redimensionner, la
  renommer. *Sonde* `tests/eve/timeline_ruler_gestures.test.mjs`.
  *Mise à jour 2026-11-25* (vaut aussi pour SC-10 et toute mention de couleur par Scène) : R-258 (21 nov.) avait donné une couleur par Scène, R-282 (23 nov.) un gris #3c3c3c, R-304 (24 nov.) un seul vert pomme #6cc24a partout. Voir SC-39.
- **SC-02** · P1 · W — Lancer une Scène (cellule de la rangée de la règle) → toutes ses cellules partent ensemble.
  *Mise à jour 2026-11-25* : « Lancer une Scène (cellule de la rangée de la règle) → toutes ses cellules partent ensemble » : depuis le 25 nov. (R-353 L3, R4) chaque cellule part avec ses propres réglages, et seulement si « En Scène » est allumé et qu'aucune séquence Lancements ne la joue.
- **SC-03** · P1 · W I — Vue Scène : tuiles d'une Scène sur la grille, Scènes en bas, outils Mixage / Pistes / Timeline ;
  même rangée Édition / Réglages qu'en Cellules.
  *Mise à jour 2026-11-25* : Vue Scène « tuiles … outils Mixage / Pistes / Timeline » : SUPPRIMÉE le 21 nov. (R-258, remplacée par le filtre Vue › Scène des Cellules, fichiers `project_view_scene_view*.js` retirés), puis REVENUE le 25 nov. (R-353) comme vue de Vue (les Cellules sur une seule Scène, blocs Disposer). Les outils Mixage / Pistes / Timeline n'existent plus : récrire selon VS-01 à VS-18.
- **SC-04** · P2 · W — Tranche « Master de Scène » dans la Console.
  *Mise à jour 2026-11-25* : Tranche « Master de Scène » dans la Console : FAUX depuis le 21 nov. (R-258 : le maître de Scène supprimé). Le Volume et les Effets d'une Scène passent par son appui long (R-203, SC-42).

### Scènes dans la Timeline, geste par geste (16 nov. 2026)

*Sonde* (tous, clics et glisser réels sur le canevas) `tests/probes/music/scenes_ui.probe.mjs [largeur hauteur tag]`,
rapport et captures `temp/probe_reports/music/scenes_ui/<tag>/`. *Origine* demande du 16 nov. 2026 (R-188).

- **SC-10** · P0 · W I — Bande des Scènes (moitié haute de la règle), zone vide : appui tenu (~¼ s) puis glisser à
  droite → une Scène naît sous le doigt, de la largeur glissée (± un pas de grille), de toute la hauteur de la bande,
  nommée « Scène N ».
- **SC-11** · P0 · W — Une deuxième Scène tracée à côté : les deux se suivent, aucune ne couvre l'autre.
- **SC-12** · P0 · W — Tracer une Scène en partant d'un vide entre deux Scènes et en glissant par-dessus sa voisine →
  elle s'arrête au bord de la voisine (jamais de chevauchement).
- **SC-13** · P0 · W I — Glisser vite (sans tenir) sur la bande → l'axe défile, aucune Scène n'est créée ; glisser vite
  sur une Scène → défile aussi, ne la sélectionne pas.
- **SC-14** · P0 · W I — Poignée DROITE d'une Scène tirée à droite → la Scène s'allonge (sa fin bouge, son début non) ;
  tirée à gauche → elle raccourcit, jamais sous la longueur minimale, jamais au-delà de sa voisine.
- **SC-15** · P0 · W I — Poignée GAUCHE tirée → son début bouge, sa fin reste ; jamais avant la fin de la voisine.
- **SC-16** · P0 · W — Redimensionner, déplacer ou supprimer une Scène ne déplace ni ne modifie AUCUN clip (une Scène
  est une fenêtre sur la Timeline).
- **SC-17** · P0 · W I — Appui tenu sur une Scène puis glisser → elle se déplace, sa longueur gardée, calée sur la
  grille, arrêtée par ses voisines.
- **SC-18** · P0 · W I — Double clic (double toucher) sur une Scène → son nom devient le champ de texte, à sa place, tout
  sélectionné ; taper « Couplet », Entrée → renommée ; le champ disparaît, le nom est peint.
- **SC-19** · P1 · W — Renommer avec un nom vide (tout effacé, Entrée) → le nom d'avant est gardé.
- **SC-20** · P1 · W Ph — Nom très long sur une Scène étroite → le nom ne déborde jamais de sa Scène (coupé « … »).
  Et une Scène étroite reste atteignable entre ses deux poignées (au téléphone, une Scène tracée dans un petit vide
  peut faire 3,5 px : ses poignées la couvrent, on ne peut plus la renommer ni la toucher sans zoomer — constaté le 16 nov. 2026).
  Depuis le 17 nov. 2026 (toi : « Oui, code-le ») : une Scène tracée ou redimensionnée fait au moins une demi-case d'outil à
  l'écran ; une poignée tirée loin s'arrête là ; un vide trop étroit pour elle n'en trace aucune. Le nom trop long de la bande
  des Scènes finit par « … ». *Sonde* `scenes_ui` (téléphone 390×844 et iPad).
- **SC-21** · P0 · W — Le nouveau nom est le même dans la vue Cellules (case de la Scène dans la rangée de la règle).
- **SC-22** · P1 · W I — Mode Édition allumé : double toucher sur une Scène dans la vue Cellules → le champ de la Timeline à la
  place de son nom, renommée à l'Entrée ; en mode Jeu, aucun champ ne s'ouvre (le toucher lance). Un nom trop long pour sa case
  finit par « … ». *Sonde* `scenes_ui` (toi, 17 nov. 2026 : « Oui, code-le », maquette `temp/rename_mockup_2026-11-17/mockups/A_cellules.png`).
- **SC-23** · P0 · W I — Vue Scène : la Scène renommée montre son nouveau nom (tuiles et rangée des Scènes en bas).
  *Mise à jour 2026-11-25* (vaut aussi pour SC-24) : « Vue Scène … rangée des Scènes en bas » : la vue Scène du 17 nov. n'existe plus (R-258) ; dans la vue Scène de R-353 le nom se voit sur la tuile de Scène des Cellules. À revérifier avec `scenes_ui` (passée 52/52 le 21 nov. sur le filtre).
- **SC-24** · P1 · W I — Renommer une Scène depuis la vue Scène elle-même (rangée des Scènes) → même champ, même
  résultat partout, en mode Édition. *Sonde* `scenes_ui` (maquette `B_vue_scene.png`).
- **SC-25** · P0 · W Ph — La bande des Scènes garde sa hauteur à travers tous les gestes et quand la fenêtre change de
  taille ; revenue à sa taille, la Timeline est exactement comme avant (règle 12 : les tailles ne changent jamais).
- **SC-26** · P0 · W — Réactivité : tracer, redimensionner, déplacer, renommer, supprimer → le résultat est peint en
  ≤ 400 ms après le relâchement (la sonde mesure et écrit chaque temps dans `timings`).
- **SC-27** · P0 · W I — Toucher une Scène la sélectionne ; le rail propose « Supprimer la Scène » ; touché → la Scène
  disparaît (région et cellules de sa colonne), les clips restent.
- **SC-28** · P0 · W — Annuler juste après une suppression, un tracé, un redimensionnement ou un renommage → l'état
  d'avant revient exactement ; Rétablir → refait. *Sonde* `scenes_ui` (suppression, par Cmd/Ctrl+Z et ⇧Cmd/Ctrl+Z).
  Défaut trouvé le 16 nov. 2026 : Cmd+Z et « Annul. » annulaient l'historique du projet (ex. le passage en vue Timeline),
  jamais les gestes de la Timeline. Corrigé le jour même (toi : « Oui, corrige-le ») : une vue de la Timeline devant
  (Timeline, Cellules, Scène, Console), Annuler et Rétablir agissent sur l'historique de sa Timeline ; ailleurs, sur
  celui du projet (`eVe/intuition/runtime/front_timeline_history.js`).
- **SC-29** · P0 · W I A — Fermer puis rouvrir le projet → Scènes, noms, débuts et longueurs identiques.
- **SC-30** · P0 · W — Aucune erreur de page pendant tout le parcours des Scènes.
- **SC-31** · P0 · W I — Durées vues dans les Cellules : après avoir allongé une Scène à droite puis à gauche dans la
  Timeline, la vue Cellules et l'Inspecteur de sa cellule suivent la nouvelle longueur (règle de l'Inspecteur = la
  Scène). *À la main*.
  *Mise à jour 2026-11-25* : « Durées vues dans les Cellules … Inspecteur » : reste vrai ; s'y ajoute la progression par cellule (R-346, CE-38).
- **SC-32** · P1 · W — Zoom de l'axe (pincer / molette) puis tracer et redimensionner : la Scène suit le doigt au même
  endroit à tout zoom ; les poignées restent attrapables (jamais plus étroites que leur zone).
- **SC-33** · P1 · W — Lancer la transport sur une Scène renommée et déplacée : la lecture de la Scène joue sa nouvelle
  plage.
- **SC-34** · P1 · Ph — Téléphone (390×844) : SC-10 à SC-27 au doigt ; la poignée est attrapable, le champ du nom
  visible au-dessus du clavier. *Sonde* `node tests/probes/music/scenes_ui.probe.mjs 390 844 phone`.
- **SC-35** · P0 · W I — Lecture des Cellules : un toucher enchaîne les Scènes depuis la Scène choisie et devient Stop
  (■) ; un toucher sur Stop arrête. *Origine* R-277, R-361.
- **SC-36** · P1 · W I — Lecture tenue (ou appuyée puis glissée) dans les Cellules → le rail montre Suite · Scène · Boucle
  · Toutes ; un choix lance la lecture (Suite = Follow Action de chaque Scène ; Scène = elle seule ; Boucle = elle en
  boucle ; Toutes = toutes, en rond) ; cette palette n'existe pas hors Cellules. *Origine* R-277 (B, `chainTarget`).
- **SC-37** · P0 · W I — Lancer une Scène lance chacune de ses cellules AVEC SES PROPRES réglages (passes, lancement,
  quantification), pas un bloc de toute la plage. *Origine* R-353 L3 (R4, `kernel/scene_start.js`).
- **SC-38** · P1 · W I — Réglages › Lancement › « En Scène » éteint sur une cellule : lancer sa Scène ne la lance pas ; la
  toucher elle-même la lance ; rallumé, elle repart avec la Scène. Elle porte la marque 16A. *Origine* R-353 L3.
- **SC-39** · P0 · W I — Couleur des Scènes : un seul vert pomme (#6cc24a, nom #231f19) pour toutes les Scènes, en Timeline
  (poignées #bee8aa) et en Cellules, dans les thèmes Nuit et Ambre ; la progression est d'un vert plus sombre (#4a8f30).
  *Origine* R-304 (remplace R-258 couleur par Scène, R-282 gris).
- **SC-40** · P1 · W I — Tuile de Scène (rangée du bas des Cellules) : rectangle d'une demi-cellule de haut, calé en haut de
  sa rangée, nom centré un cran plus gros ; en lecture, la progression remplit tout le rectangle. *Origine* R-289.
- **SC-41** · P1 · W I — Toucher une Scène la choisit : sa colonne (ou toute la zone en vue Scène) prend un voile très léger
  de sa couleur, relié à sa tuile en une seule forme (opacité colonne 0,05). *Origine* R-258, R-277 (D1/D3), R-304.
- **SC-42** · P1 · W I — Édition, appui long sur une Scène → plaques : Nom, Suppr., Volume (curseur, gain de la Scène),
  Effets (tranche de la Scène, appliquée à chacune de ses cellules) ; pas de « Piste ». Un passe-bas de Scène s'entend sur
  toutes ses cellules. *Origine* R-203.
- **SC-43** · P1 · W I — Appui long sur une Scène puis glisser (Cellules) : elle grossit un peu (×1,12, ombre), toute sa
  colonne suit, les autres font la place ; au relâcher l'ordre de lecture change et ses clips et réglages de cellule
  suivent. *Origine* R-287 (« Réordonner par appui long », `sceneGrab`, preuve `temp/scene_reorder/grab.probe.mjs`).
- **SC-44** · P1 · W I Ph — Plus de Scènes que de colonnes : une barre d'une demi-cellule sous les tuiles des Scènes, avec
  des traits verticaux ; glissée de côté elle fait défiler les colonnes (doigt à gauche = les suivantes), les traits suivent
  le doigt. *Origine* R-291.
- **SC-45** · P1 · W I — La barre des Scènes bute à la première et à la dernière Scène : jamais de retour en rond.
  *Origine* R-318 (remplace la boucle de R-291 ; preuve `temp/cells_scene_stops_2026-11-24/probe.mjs`).
- **SC-46** · P1 · W I — Une Scène (ou une piste) créée par le « + » du coin hors de la vue est amenée dans la vue.
  *Origine* R-291.
- **SC-47** · P1 · W I — Début dans les Cellules (à gauche de Lecture) : montre la première Scène et la choisit ; Lecture
  part alors d'elle. *Origine* R-318 (`showFirstScene`).
- **SC-48** · P1 · W — Supprimer une Scène depuis le rail (Suppr. remonté) ; renommer par double toucher ou appui long sur
  son nom. *Origine* R-243 (10).

## E. Tenue du design et fluidité (toute la création musicale)

- **DS-01** · P0 · W Ph — Chaque vue (Timeline, Cellules, Scène, Console) à 1180×820, 1440×900, 390×844 debout et
  844×390 couché : aucun élément hors de l'écran, aucun texte qui déborde de sa boîte, aucune boîte entre deux cases
  de la grille (règle 12) ; captures comparées au passage précédent.
- **DS-02** · P0 · W — Passer 20 fois d'une vue à l'autre (Timeline ↔ Cellules ↔ Scène ↔ Console) → rien ne grandit, ne
  rétrécit ni ne glisse ; la page répond toujours (`waitForResponsivePage` : retard < 50 ms, image < 100 ms).
- **DS-03** · P0 · W — Projet chargé (16 pistes, 200 clips, 12 Scènes) : défiler, zoomer, tracer une Scène restent
  fluides (aucune image > 100 ms pendant le geste).
- **DS-04** · P1 · W — Après 30 gestes sur les Scènes, les tailles des pistes, de la règle et du rail sont exactement
  celles du début.
- **DS-05** · P1 · W I — Mode sombre / clair, main gauche / droite : la bande des Scènes, les poignées et le champ du nom
  gardent leur place (miroir pour la main gauche).
- **DS-06** · P0 · W Ph — Vue Scène (R-353) ajoutée au passage de DS-01 / DS-02 : Timeline ↔ Cellules ↔ Scène ↔ Console,
  rien ne bouge ni ne change de taille. *Sonde* `tests/probes/music/views_stability.probe.mjs` (à étendre si elle ne passe
  plus par Vue › Scène). *Origine* R-353, R-258.
- **DS-07** · P1 · W I — Thème Ambre : cellules et Scène choisies remplies d'orange (onde et nom en gris des outils), voile
  orange à 16 % sur la ligne de la piste choisie ; Nuit : contour `cell_glow`. *Origine* R-277, R-279.
- **DS-08** · P1 · W I — Style sombre des vues (Cellules, Scène, Timeline) : en-têtes sombres, barre de couleur de piste de
  4 px côté intérieur, solo jaune / muet gris clair en barre du côté opposé, RIEN sur les clips ni les cellules.
  *Origine* R-272.
- **DS-09** · P1 · W I — Timeline et Cellules gardent la sortie audio éveillée tant qu'elles sont à l'écran (pas de délai au
  1ᵉʳ toucher après un silence) ; un échec de ce bail est écrit `[eVe] timeline_output_hold_failed`. *Sonde*
  `tests/probes/molecule_timeline_activity.probe.mjs`. *Origine* R-307.

## F. Vue Scène « instrument » (R-353)

Propriétaires : `kernel/scene_layout.js`, `scene_start.js`, `cell_launch_notes.js`, `cell_instrument.js` ;
`runtime_cells_sequence.js`, `runtime_cell_instrument.js`, `runtime_playback_pair.js` ; `project_view_scene_layout.js`,
`project_view_scene_arrange.js`, `project_view_scene_gestures.js`, `project_view_scene_new_cell.js`,
`project_view_cells_midi_learn.js`, `project_view_cells_sequenced.js`, `bevy_panel_midi_assign_runtime.js`.
Cahier `todo/scene_performance_cahier_2026-11-25.md` §10. Preuves `temp/scene_perf_2026-11-25/` (aucune sous `tests/probes`).

- **VS-01** · P0 · W I — Vue (bande du bas) › Scène : la vue Scène s'ouvre (les Cellules montrant une seule Scène, sans
  colonne des pistes), un choix gardé ; Vue › Cellules revient. *Origine* R-353 (Q1, AGENTS.md r. 13).
- **VS-02** · P1 · W I — Édition, cellules choisies au lasso, rail › « Disposer » : Libre, Pads 4×4, Grille 8×8, Clavier et
  son rouleau Touches (25, 37, 49, 61, 76) ; un choix pose les cellules choisies dans l'ordre de lecture, en un pas
  d'annulation, et rend le rail. *Origine* R-353 L1.
- **VS-03** · P1 · W I — Un bloc qui tient entier en tuiles (120) est posé en tuiles, sinon en outils (60), jamais entre les
  deux ; ce qui ne tient pas défile dans les deux sens (8×8 sur iPhone debout). *Origine* R-353 L1 (Q2, Q3).
- **VS-04** · P1 · W I — Clavier : touches blanches sur une rangée, noires au-dessus (aucune sur Do et Fa), octaves côte à
  côte puis empilées, la plus grave en bas à gauche ; un clavier de 25 touches ne renvoie pas son Do aigu seul sur une
  rangée. *Origine* R-353 L1 / L7 (8B).
- **VS-05** · P1 · W I — Plusieurs blocs dans une Scène (un 4×4 et un clavier) : un rang d'écart entre eux, puis les cellules
  libres ; la disposition est gardée à la réouverture du projet. *Origine* R-353 L1.
- **VS-06** · P0 · W I — Vue Scène, double toucher sur le fond → une cellule vide naît à cette case, sur la dernière piste
  choisie (sinon une piste libre), choisie et armée au dernier type d'Enr. ; Lecture enregistre dedans ; aucune piste n'est
  créée tant qu'il en existe une. *Origine* R-353 L4, R-362.
- **VS-07** · P1 · W I — Toutes les pistes ont déjà une cellule dans cette Scène : le double toucher ne crée rien (« Piste »
  en Édition route vers une nouvelle piste). *Origine* R-362.
- **VS-08** · P1 · W I — Édition, maintenir-glisser une cellule : elle se pose où le doigt la lâche, la case visée s'ouvre et
  les suivantes se décalent. *Origine* R-353 L4.
- **VS-09** · P1 · W I — Édition, cellules choisies (toute vue), rail › Pilotage → panneau d'auto-assignation contre l'outil
  (sans ✕) : Type (Note, CC, Prog.), Carte (Suite, MPC, Launchpad), Apprendre, Canal, Début, Pas, Fin calculée ; chaque
  changement donne à chaque cellule son message en un pas ; une fin > 127 n'assigne rien et le message discret le dit.
  *Origine* R-353 L2.
- **VS-10** · P1 · W — Carte MPC : pad 1 en bas à gauche = 36, les 16 suivants une banque plus haut ; Launchpad : 11 en bas
  à gauche, +10 par rangée ; jouer la note lance la bonne cellule. *Origine* R-353 L2 (`midi_assign_map.js`).
- **VS-11** · P1 · W — Une note MIDI apprise ne lance plus une cellule deux fois (un seul binding) ; un projet ancien
  (`settings.midi` dans les cellules) est migré une fois en bindings. *Origine* R-353 L2 (`migrateCellMidiSettings`).
- **VS-12** · P1 · W — Piste MIDI « Lancements » (Sortie « Cellules ») : pendant sa prise, toucher des cellules (ou jouer
  leurs touches MIDI) écrit leurs notes ; relue (Timeline ou cellule de la Scène), elle relance les cellules aux mêmes
  instants avec leur quantification. *Origine* R-353 L6 (R3).
- **VS-13** · P1 · W I — Une cellule jouée par la séquence « Lancements » de sa Scène ne part pas seule avec la Scène (marque
  MIDI 16A) ; supprimer la séquence lui rend son départ. *Origine* R-353 L6 (R2).
- **VS-14** · P1 · W — Réglages › Son › Jeu : Lancer (défaut), Poly, Mono, Legato ; en Poly, une note joue le clip de la
  cellule à sa hauteur, depuis le début du clip, avec ses réglages (départ, boucle, inverse, enveloppe) ; un accord =
  plusieurs voix ; Mono / Legato = une voix (Legato sans réattaque) ; Glissé règle le glissement. *Origine* R-353 L7.
- **VS-15** · P1 · W — Bend : 2, 12 ou 24 demi-tons ; la molette au bout de sa course atteint la plage entière (pas à
  mi-course). *Origine* R-353 (défaut réparé, `host_instrument_midi.js`).
- **VS-16** · P1 · W — Une note plus haute dure autant qu'une plus grave (durée tenue) et suit le tempo du projet : un clip de
  2 mesures garde 2 mesures après un changement de tempo. *Origine* R-353 L7 (`Segment.hold`, `atome-instrument`).
- **VS-17** · P1 · W I — Disposer › Clavier sur UNE seule cellule en Poly/Mono/Legato : chaque touche du clavier à l'écran la
  joue à sa hauteur, la touche jouée s'allume. *Origine* R-353 L7 (`focus`).
- **VS-18** · P1 · W I — Tailles : en vue Scène chaque case est un outil ou une tuile de la grille, jamais une taille entre
  deux (règle 12) ; tourner l'écran ne change pas la taille d'une case. *Origine* R-353 (Q2).

## À compléter

- Sonde de SC-31 (Inspecteur), DS-03 (projet chargé), DS-05 (sombre/clair, main gauche) ; SC-28 pour le tracé, le redimensionnement et le renommage (la sonde ne couvre que la suppression).
- Pas de sonde UI pour Verrou, la vue Scène ni l'apprentissage MIDI d'une cellule.
- Cas ouverts du cahier (§5.8–5.9, §6.7–6.9) : à ajouter quand ils seront tranchés.

*Relevé du 2026-11-25 (demandes du 17 au 25 nov.), non codé ou partiel :*

- R-231 — Vélocité d'une cellule avec minimum, maximum et aléatoire (demande du 18 nov.) : NON CODÉ, pas de maquette ; le code
  n'a qu'un curseur Vélocité 0–100 % (`project_view_cells_settings_row.js` `cells_sound_velocity`), aucun réglage min/max/
  hasard dans `scene_schema.js`.
- R-231 — `desktop-tauri` non compilé avec `reverse` à l'époque (une ligne `bridge.rs`) ; à vérifier sur Tauri.
- R-203 — Limites écrites : vumètres des modules d'une tranche de Scène parfois absents ; clé de port non suffixée dans une
  tranche de Scène ; en natif une voix garde la tranche de la Scène où elle a commencé ; le nom d'une cellule reste à sa
  case lors d'un échange (les effets suivent le contenu). Non vérifié téléphone, Tauri, iOS.
- R-203 — Écart à la maquette C : le panneau d'effets de cellule est la tranche verticale soudée, pas la rangée horizontale
  de la maquette.
- R-243 — Essai iPad à faire par l'utilisateur (Web seul prouvé).
- R-272 (cellules) — Essai iPad à faire ; le pad qui sonne prend le « pressé » de la charte, pas le halo de la maquette.
- R-287 — Réordonner les Scènes : non vérifié à l'écran par Playwright (sonde `temp/` seulement).
- R-289 — Vu seulement par sonde structurelle, pas regardé à l'écran.
- R-291 — Le défilement en boucle a été remplacé par les butées (R-318) : la ligne de R-291 « fait défiler en boucle » n'est
  plus vraie.
- R-299 — `ATTENTE UTILISATEUR` : le son déposé sur l'iPhone qui ne jouait pas n'est pas revérifié sur l'iPhone (build iOS à
  refaire par l'utilisateur).
- R-307 — Le fondu croisé n'est pas vérifié à l'oreille ; un natif iOS antérieur refuse `audio_output_hold` (build iOS à jour
  nécessaire).
- R-318 — Pas de capture Playwright.
- R-346 — Clos ; le Solo d'une piste de texte qui coupait tout reste la décision de l'utilisateur.
- R-353 — Rail de la vue Scène sous Édition : 14 cases, « Piste » et « Disposer » sortent par le haut sur 820 px de haut ;
  BLOQUÉ, maquette à valider (noté sous R-362).
- R-353 — Un projet reçu d'une autre personne recrée l'instrument de la cellule dans sa propre bibliothèque.
- R-353 — Auto-assignation de CC successifs pour des pistes / tranches (cahier §3.3) : non trouvé dans le code (le panneau
  sert les cellules choisies).
- R-353 — « Aplatir » la piste Lancements en vrais clips (cahier §3.4) : non codé (proposé « plus tard »).
- R-353 — Rejouer par-dessus une piste Lancements (fusion ou remplacement) : comportement non vérifié.
- R-353 — Polyphonie par défaut avec l'étirement (8 voix iPhone, 21 ailleurs) et mesure wasm : non fixées.
- R-365 — Program Change N → N-ième preset : non codé ; choix Volume / Preset dans Pilotage : non codé (maquette d'abord) ;
  fondu entre deux chaînes (moteur Rust) : non codé. Non vu dans l'app réelle.
