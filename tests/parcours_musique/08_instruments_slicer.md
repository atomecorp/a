# 08 — Instruments (Sampler) et Slicer

Propriétaires : `eVe/domains/audio_fx/instrument_*.js`, `banks/`, `host_instrument_midi.js` ; noyau
`instrument_schema.js`, `instrument_operations.js` ; moteur `atome/engines/atome-instrument/` ; Slicer
`eVe/domains/rendering/project_view_timeline_slicer.js`, `_slicer_motif.js`, `audio-kernels/src/motif.rs`.
Cahiers : `todo/sampler_cahier_des_charges_2026-10-29.md`, `todo/slicer_cahier_2026-11-15.md`.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Sampler

- **IN-01** · P0 · W A — Créer un instrument (Mes instruments), y placer une prise (une zone, note 60) → une note jouée
  au clavier ou par MIDI fait entendre la prise. *Sonde* iPad `tests/ios/auv3_aum/sampler_note.js`.
- **IN-02** · P1 · W — Zones : clés, vélocités, gain ; plusieurs prises (alterné, couches) ; prises de relâchement.
- **IN-03** · P1 · W — Réglages : niveau, enveloppe ADSR, sensibilité, accord, glissé, polyphonie, mono / legato, pitch-bend.
- **IN-04** · P1 · W — Façade : macros dans l'ordre choisi, visibles à l'ouverture.
- **IN-05** · P1 · W — Renommer, favori, supprimer (les chaînes qui le jouaient cessent, les sons restent dans les médias).
- **IN-06** · P2 · W — Export SFZ ; banque ; auto-échantillonnage.
- **IN-07** · P0 · A — Atome comme instrument AUv3 dans AUM (`aumu`) : le MIDI de l'hôte le fait jouer.

Sondes Rust : `cargo test -p atome-instrument` (zones, playing, realtime, streaming, stretching…).

## B. Slicer (R-181)

- **SL-01** · P0 · W — Clip son, Vue › Découpe (piste de 4 outils de haut ou plus) : onde, traits des tranches, numéros.
  *Sonde* `tests/probes/music/slicer_ui.probe.mjs`.
- **SL-02** · P0 · W — Seuil (Niveau, Écart), Diviser (Parts, Grille), Main (double toucher = un point, glisser = le
  déplacer, jamais aimanté) → les tranches suivent.
- **SL-03** · P1 · W — Toucher une tranche = l'écouter ; Suppr. retire le point choisi.
- **SL-04** · P1 · W — Warp : marqueurs posés librement, Tempo.
- **SL-05** · P0 · W — Kit → un instrument Sampler, une tranche par touche dès Do2 ; Cellules → chaque tranche une
  cellule jouable, lien vivant (changer la découpe change les cellules).
- **SL-06** · P1 · W — Motif : toucher un pas puis une tranche la lui donne ; Force, Chance, Hauteur, Roulé par pas ;
  Ordre (Libre, Original, Inverse, Hasard…), Swing, Div., Mélanger (nouveau tirage), Dupl., Cellule.
  *Sonde* `tests/probes/music/slicer_motif.probe.mjs` ; `cargo test -p atome-audio-kernels` (motif).
- **SL-07** · P1 · W — La rangée du Slicer se pose au-dessus de la rangée Vues / Transport ; la bande du bas ne change pas.
- **SL-08** · P1 · W — Warp (rail M10) : Suivre le tempo, Repères (traits sur les attaques, glisser = caler sur le
  temps), Hauteur sans changer la durée, Caler, Effacer. *Mise à jour 2026-11-25* : Caler est devenu le rouleau Quantif.
  commun à l'audio et au MIDI (TN-04). *Origine* R-178 (30, 18 nov. ; `project_view_timeline_warp.js`,
  `mix-graph/src/warp_voice.rs`).

## C. Synthé modulaire (R-186)

- **IN-08** · P0 · W — IN d'une tranche › Nouveau (ou tuile Analogique) : un synthé joué par la tranche, son rack
  ouvert, chaîne de gauche à droite toujours en vue, liste des modules par familles sous elle. *Origine* R-186 D1, D2, M5.
- **IN-09** · P1 · W — Glisser-déposer un module dans le rack : une case s'ouvre, il se branche seul, la chaîne défile
  de côté ; un module retiré est ponté (le son continue). *Origine* R-186 D3 (`synth_rack.js`).
- **IN-10** · P1 · W — Réglage tenu = mode connexion : les sources possibles s'allument ; choisir la source puis la
  profondeur, « Entrée » ; la modulation s'entend. *Origine* R-186 D4, D5.
- **IN-11** · P1 · W — Briques entendues pendant le glissé : oscillateur (impulsion + largeur, sync, unisson 1–7),
  LFO (scie, hasard, tempo, retard), filtre 12/24 dB modulé (plage balayée au pied), AD à courbe, Drive, Hasard, Pente,
  Pression, VCA. *Origine* R-186 M2–M4.
- **IN-12** · P1 · W — LFO au tempo : changer le tempo du projet → le LFO suit. *Origine* R-186 (`tempo`).

## D. Clavier d'une piste : split, layer, multitimbral (25 nov.)

- **KB-01** · P0 · W — Timeline, Édition allumée, une piste choisie : « Clavier » dans le rail ouvre sa carte en plein
  écran (clavier en bas, une rangée par couche, nom de la piste à droite) ; Retour ou Édition éteinte la ferme. *Origine*
  maquettes `temp/clavier_combine_2026-11-25/mockups/` 1–8 (`project_view_keyboard_map.js`).
- **KB-02** · P0 · W — Prises › Instr. porté sur le Clavier : vide, il prend toutes les touches ; à côté d'une barre, les
  touches libres (split) ; sur une barre, ses touches (layer). Touché dans Prises › Instr. pendant que le Clavier est
  ouvert, il se pose par-dessus le Do4 (la touche 60).
- **KB-03** · P0 · W — Le bout d'une barre glissé touche par touche, jamais au-delà de sa voisine.
- **KB-04** · P0 · W — Une touche du clavier fait entendre la piste telle qu'elle jouera (split + layer, transpositions).
- **KB-05** · P1 · W — Barre touchée : rail Niveau, Transp., Canal (multitimbral), Fondu (fondu à la jointure), Vélocité
  (couches de force), Réglages (panneau du son), Suppr.
- **KB-06** · P1 · W — Voix/MCP : `keyboard.bar.add|edge|set|remove` (`commandes_vocales.md` §12a).
  *Sondes* `temp/clavier_combine_2026-11-25/probes/kernel.probe.mjs`, `controller.probe.mjs`.

## E. Notes d'un clip audio, quantise commune, vibrato (R-372, 25 nov.)

- **TN-01** · P0 · W — Clip audio chanté › Vue « Notes » : ses notes en rectangles du piano roll (option B), la ligne de
  hauteur chantée par-dessus ; dans une piste basse, les notes en petits traits lavande sur le clip. *Sonde*
  `temp/audio_tune_2026-11-25/probes/tune_ui.probe.mjs`.
- **TN-02** · P0 · W — Glisser une note verticalement → elle change de hauteur, entendue (formants gardés) ; la rangée
  suit la note portée au-delà du bord ; horizontalement → son attaque est calée par un repère warp.
- **TN-03** · P0 · W — Rail : Notes › Tout, Rétabl. ; Hauteur › Transp., Corriger (sur la Gamme), Gamme, Dérive (part du
  vibrato chanté gardée), Formant. Une note déjà juste (moins d'un demi-cent) n'est jamais recalculée.
- **TN-04** · P0 · W — Rythme › Quantif. : un seul rouleau pour l'audio (repères warp) et le MIDI ; Caler et Force retirés ;
  les attaques tombent sur la grille à l'échantillon près. *Test* `cargo test -p atome-mix-graph --test warp_quantize`.
- **TN-05** · P1 · W — Module Pitch : Vibrato (vitesse, profondeur en cents, délai d'entrée) ; une rampe = l'automation de
  Hauteur, suivie sans marches. *Test* `cargo test -p atome-dsp --test pitch_vibrato`.
- **TN-06** · P1 · W — Voix/MCP : `clip.tune` (`commandes_vocales.md` §15).

## À compléter

- ~~Synthé modulaire (R-186) : en attente de la validation des maquettes ; ajouter ses tests quand il sera codé.~~
  Validé et codé le 16 nov., relevé du 2026-11-25 → section C.
- Écoute réelle du Slicer, Tauri, iOS : non vérifiés.

*Relevé du 2026-11-25 (demandes du 17 au 25 nov.), non codé ou partiel :*

- R-178 (30) : warp entendu sur le Web après la build audio-wasm partagée.
- R-186 : P2 téléphone à l'image et écoute à l'oreille non vérifiées.
- R-181 : écoute réelle, Tauri, iOS du Slicer non vérifiés (rien de nouveau après le 17 nov.).
