# 06 — Effets audio et vidéo, automation

Propriétaires : catalogue Rust `atome/engines/atome-dsp/src/catalog.rs` (généré vers
`molecule/kernel/mix_dsp_catalog.js`) ; panneaux `eVe/domains/rendering/molecule_mix_effect_panel.js`,
`_effect_cards.js`, `_eq_curve.js`, `_color_wheels.js`, `_pipette.js` ; `eVe/domains/audio_fx/` ; vidéo bevy-core
`media_fx/`, shaders `media_fx_*.wgsl`. Cahier : `todo/effets_pro_2026-11-15.md` (R-184).

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Pour chaque effet audio (balayage du catalogue)

À faire **pour chaque effet** du + (Comp, Limiteur, Gate, Ducker, filtres, Égal. 8 bandes, Écho, Réverb, Convolution,
Ampli NAM, Maximis., Multib., De-ess, Transit., Expand., Largeur, Vocodeur, Hauteur, Harmo, Accordeur, Doubleur,
Débruit, Chorus, Flanger, Phaser, Trémolo, Satur, Lo-fi, Soft/Hard clip, Mid-Side, bandes 2/3/4) :

- **FX-01** · P0 · W — Ajouter par le + → l'outil apparaît dans la chaîne, le son change (audible), aucune erreur.
- **FX-02** · P0 · W — Toucher → le panneau s'ouvre (rangée de caractère si l'effet en a, deux cartes de réglages,
  curseurs d'outil deux par rangée) ; régler un curseur → effet entendu en direct.
- **FX-03** · P0 · W — Interrupteur du pied : éteint = son direct, allumé = effet ; l'outil allumé a son glyphe en lavande.
- **FX-04** · P1 · W — Préréglage enregistré puis rappelé ; fermer / rouvrir le projet → réglages gardés.
- **FX-05** · P1 · W I — Supprimer l'effet → plus de trace, le son revient.

Sonde Rust du catalogue : `cargo test -p atome-dsp` (catalog, catalog_js, ports_and_keys, dynamics_master, eq, rooms…).

## B. Effets à cas particuliers

- **FX-10** · P0 · W — Compresseur à caractères (Propre, VCA, FET, Opto, Lampe) + clé de sidechain d'une autre piste :
  la clé fait pomper la piste.
- **FX-11** · P1 · W — Réverb : espaces Pièce, Salle, Plaque, Chambre, Ressort ; Gel tient la queue.
- **FX-12** · P1 · W — Écho synchro au tempo du projet (changer le tempo → l'écho suit), bande, ping-pong.
- **FX-13** · P0 · W — Égaliseur : courbe dessinée avec le spectre en direct. *Origine* R-184 (courbe absente, corrigé).
- **FX-14** · P1 · W — Maximiseur : mesure LUFS et crête vraie affichées dans une case d'outil.
- **FX-15** · P1 · W I A — Ampli NAM : son en direct sur l'entrée ; la latence est compensée (aucun décalage entre pistes).
- **FX-16** · P0 · W A — Limiteur de sortie du chemin direct toujours actif ; le premier effet allumé sur une entrée micro
  ouvre son panneau une fois (entrée, casque). *Origine* AGENTS.md règle 20.
- **FX-17** · P2 · W — Accordeur : la note jouée est lue juste.

## C. Effets vidéo (piste vidéo, aperçu)

- **FXV-01** · P0 · W — Ajouter Primaire, régler exposition → l'aperçu change. *Origine* R-184 (panneaux vidéo qui ne
  s'ouvraient pas, corrigé).
- **FXV-02** · P1 · W — Roues et Courbes dessinées ; Teinte/Sat ; LUT `.cube` importée par le panneau d'import unique.
- **FXV-03** · P1 · W — Fond vert : Pipette allumée, toucher l'aperçu → la couleur est retirée, Masque montre la découpe.
- **FXV-04** · P1 · W — Flou (5 modes + zone), Netteté, Vignette, Grain, Halo, Pixels, N&B.
- **FXV-05** · P2 · W — 12 effets vidéo au plus par chaîne : le 13e est refusé proprement.

## D. Automation

- **AU-01** · P0 · W — Touche FX d'un en-tête → couloirs d'automation ; ajouter des points sur Volume, Lecture → le
  volume suit la courbe. *Sonde* `tests/probes/molecule_automation.probe.mjs`.
- **AU-02** · P1 · W — Courbes linéaire / palier / douce ; Rec écrit en jouant ; modes Lecture, Toucher, Verrou.
- **AU-03** · P1 · W — Déplacer le clip déplace son automation (portée par le clip).
- **AU-04** · P1 · W — Opacité d'une piste vidéo suit sa courbe.

## À compléter

- Non codé : « Avance » du compresseur ; mode Écriture réel (se comporte comme Verrou) ; automation vidéo de Position,
  Taille, Rotation, Couleur et des effets vidéo ; lasso / formes dans les couloirs d'effets (R-178 E23–E25).
- Recette iPad / AUv3 des effets (R-184 : toi).
