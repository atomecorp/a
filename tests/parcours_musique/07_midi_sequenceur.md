# 07 — MIDI et séquenceur

Propriétaires : `eVe/domains/rendering/project_view_timeline_midi_roll.js`, `_midi_lanes.js`, `_midi_rail.js`,
`_step_grid.js`, `_step_rail.js`, `_midi_instrument.js` ; `eVe/domains/midi/` ; `molecule/runtime_midi.js`.
Cahier : `todo/timeline/sequenceur_pro_2026-11-15.md` (R-178).

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Piano roll (piste MIDI de 4 outils de haut ou plus)

- **MI-01** · P0 · W — Toucher le vide = une note ; glisser = sa longueur ; glisser une note = la déplacer ; son bord =
  la longueur ; toucher = la supprimer. *Sonde* `tests/probes/midi_take_routing_piano_roll.probe.mjs`, `tests/probes/music/sequencer_ui.probe.mjs`.
  *Mise à jour 2026-11-25* : toujours juste (un toucher sur une note la supprime, `project_view_timeline_midi_roll.js` `tap: 'remove'`, confirmé par R-343) — à noter car le cahier R-178 disait « toucher = choisir, Suppr. efface ».
- **MI-02** · P0 · W — Lecture → les notes sortent vers la sortie MIDI choisie, aux bons temps.
- **MI-03** · P1 · W — Clavier côté en-têtes : seuls les Do nommés, toucher une touche fait entendre la note ; défilement
  0–127 ; pincement vertical = hauteur des rangées.
- **MI-04** · P1 · W — Sélection : toucher, Lasso, ajout, tout, toutes les notes d'une hauteur (appui long sur la touche).
- **MI-05** · P1 · W — Groupe : déplacer, allonger, copier / coller à la tête, dupliquer, supprimer — un pas d'annulation.
- **MI-06** · P1 · W — Transposer (demi-ton, octave), inverser, rétrograde, quantifier (1/4 à 1/32, triolets, force %),
  swing, humaniser, gamme, legato, découper, coller.
- **MI-35** · P0 · W — Enregistrer du MIDI dans la Timeline : les notes de la prise apparaissent pendant
  l'enregistrement. *Origine* R-343.
- **MI-36** · P0 · W — Éditeur de la prise : déplacer, étirer, créer, supprimer (un toucher) une note ; chaque geste
  réécrit le fichier, aucune note ne revient en arrière. *Sonde* `tests/probes/midi_take_routing_piano_roll.probe.mjs`
  (à étendre). *Origine* R-343.
- **MI-37** · P1 · W I — Pincer dans l'éditeur zoome le temps ; une piste MIDI dépliée prend toute la hauteur. *Origine* R-343.
- **MI-38** · P1 · W — Proba. d'une note (0–100 %) : à chaque lecture, la note sonne ou non selon sa probabilité.
  *Origine* R-178 (16).
- **MI-39** · P1 · W — Couloirs MIDI : Échelle et Forme sur une sélection de points. *Origine* R-178 (25).

## B. Force et contrôleurs

- **MI-10** · P1 · W — Couloir Force : une barre par note, glisser la règle, tracer une courbe sur plusieurs.
- **MI-11** · P1 · W — Couloirs CC (Modul., Pitch, Sustain, Expr., Aftert.) : points, lasso, copier-coller, crayon.

## C. Batterie et pas à pas

- **MI-20** · P0 · W — Grille de batterie : poser des pas, Lecture → les sons jouent au bon pas.
- **MI-21** · P1 · W — Longueur propre par rangée (polyrythme), Boucle / 1 coup, Force, Roulé (nombre, courbe, décalage),
  swing par rangée, Proba. d'un pas.
- **MI-22** · P1 · W — Pas à pas mélodique : chaque pas porte hauteur, longueur, liaison.
- **MI-23** · P1 · W — Motifs A, B, C chaînés ; remplissage.
- **MI-24** · P2 · W — Panneau Son (appui long sur une rangée) : choisir le son de la rangée.

## D. Routage et export

- **MI-30** · P0 · W A — Choix de la sortie MIDI et du canal 1–16 ; « Comme enregistré » rejoue vers l'origine.
- **MI-31** · P0 · A — Dans AUM : le MIDI envoyé par Atome atteint le synthé de l'hôte. *Origine* R-179 défaut 7.
- **MI-32** · P0 · A — Le MIDI de l'hôte (séquenceur d'AUM) est reçu par Atome. *Sonde* iPad `tests/ios/auv3_aum/host_midi_capture.js`.
- **MI-33** · P1 · W — Export .mid d'un clip, réimport → mêmes notes.
- **MI-34** · P1 · I — Entrées CoreMIDI natives listées sur iOS. *Sonde* `tests/eve/midi_ios_native_inputs.test.mjs`.
- **MI-40** · P0 · W — Réglages d'une piste MIDI › Sortie (juste au-dessus d'Entrée) : Comme enreg., ports,
  instruments, Canal, Nv. synthé, Nv. sampler ; « Nv. synthé » crée un synthé et y relie la piste, la lecture le fait
  sonner. *Origine* R-343 (`project_view_timeline_midi_output_rail.js`).
- **MI-41** · P0 · W — OUT d'une tranche MIDI du Mixage : les mêmes choix (ports, canal gardé, instruments) ; la
  lecture suit ce OUT. *Origine* R-343 (`runtime_midi.js#midiStripRoute`).
- **MI-42** · P0 · W — Piste MIDI qui joue un instrument d'eVe (Sampler, synthé) : Lecture → l'instrument sonne ;
  Figer → la piste devient audio, même son. *Origine* R-178 (37, 38).
- **MI-43** · P1 · W — Panneau Son (appui long sur une rangée de batterie) : deux cartes, le son choisi marqué ✓.
  *Origine* R-178 M4.

## À compléter

- ~~Non codé : probabilité par note (16) ; Figer une piste MIDI en audio (37) ; une piste MIDI qui joue un instrument
  interne d'eVe (38).~~ Faits (R-178), relevé du 2026-11-25 → MI-38, MI-42.
- ~~Le panneau Son ne suit pas encore la maquette M4 (deux cartes, ✓).~~ Fait, relevé du 2026-11-25 → MI-43.

*Relevé du 2026-11-25 (demandes du 17 au 25 nov.), non codé ou partiel :*

- R-343 : non essayé sur l'iPad.
