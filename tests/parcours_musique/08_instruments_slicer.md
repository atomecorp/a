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

## À compléter

- Synthé modulaire (R-186) : en attente de la validation des maquettes ; ajouter ses tests quand il sera codé.
- Écoute réelle du Slicer, Tauri, iOS : non vérifiés.
