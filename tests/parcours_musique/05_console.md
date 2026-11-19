# 05 — Console (Mixage)

Propriétaires : `eVe/domains/rendering/project_view_molecule_mix_content.js`, `molecule_mix_*.js` (strip_tree,
interactions, open_panel, welded_tools / choices / actions, groups, meters, catalog) ; noyau `mix_modules.js`,
`mix_routing.js`, `mix_projection.js` ; moteur `eVe/core/media_engine/molecule_mix_engine.js`, `atome/engines/mix-graph/`.
Design : AGENTS.md règles 12–15, exceptions de la console (R-183, R-171, R-187).

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Tranches

- **MX-01** · P0 · W I A Ph — Ouvrir la Console : une colonne par piste (audio, vidéo, MIDI) et par bus, posée sur la
  grille, son fond plus large que les outils, outils posés dessus sans ombre ; IN en haut, + et OUT en bas, nom au pied.
  *Sonde* `tests/probes/music/console_strip_ground.probe.mjs`. *Origine* R-171 D1–D2, R-187.
- **MX-02** · P0 · W — Chaînes par défaut : audio = REC, VOL, PAN ; vidéo = REC, Opacité ; MIDI = vide.
- **MX-03** · P0 · W I — Avec 16 pistes, un glisser latéral fait défiler la rangée, même commencé sur un outil.
  *Origine* R-171 B2, bug connu `mixer-strips-never-drag-scroll`.
- **MX-04** · P1 · I — Vidéo en lecture dans la vue Console : rien ne scintille, aucune colonne ne bouge. *Origine* R-171 B1 (à voir sur iPad).
- **MX-05** · P1 · W — Nom touché → colonne sélectionnée (fond « un peu plus clair ») ; piste tenue par son nom puis
  glissée → la colonne suit le doigt, les autres s'écartent.
- **MX-06** · P1 · W — Bande « Projet ▲ » : le ▲ plie / déplie l'aperçu.

## B. VOL, PAN et curseurs

- **MX-10** · P0 · W A — VOL glissé : le niveau change en direct, la valeur est enregistrée au lâcher ; la jauge reste
  dans la console, toute la course atteignable. *Origine* R-171 D6.
- **MX-11** · P0 · W — **Tenir puis déplacer** VOL, PAN, Opacité, un effet, REC, un Aux → l'outil se soulève et change de
  place dans la chaîne ; le son suit le nouvel ordre. *Origine* R-183 (défaut : les outils-curseurs ne bougeaient pas).
- **MX-12** · P0 · W — Un seul panneau ou une seule jauge ouvert dans toute la console ; en ouvrir un autre replie le premier.
- **MX-13** · P1 · W — Balayer un effet → by-pass (son direct), rebalayer → actif.

## C. Panneaux soudés, sans ✕ (R-183)

- **MX-20** · P0 · W Ph — Toucher +, OUT, IN, un Aux, un effet → son panneau part de l'outil, même fond, sans coupure ;
  les tranches voisines s'écartent ; **aucun ✕** ; retoucher l'outil (ou un choix du + / OUT) replie.
  *Sonde* `tests/probes/music/console_routing_ui.probe.mjs`.
- **MX-21** · P0 · W — + : Aux en tête, puis les familles d'effets ; la famille choisie montre ses effets ; VOL, PAN,
  MONO (Opacité en vidéo) en dernière rangée ; Mes effets après.
- **MX-22** · P1 · W — Pied d'un panneau d'effet : nom centré, interrupteur dans le coin opposé à l'assistant
  (inversé pour une main gauche).

## D. IN, OUT, Aux, bus

- **MX-30** · P0 · W A — OUT ne propose que les sorties physiques (paires stéréo, voies mono, « Aucune ») ; choisir la
  voie 1 seule (mono) → le son ne sort que là. *Sonde* iPad `tests/ios/auv3_aum/out_mono.js`.
- **MX-31** · P0 · W A — Aux d'une piste vers un bus (Envoi 100 %) → le bus reçoit le signal ; Passage règle ce qui
  continue vers la sortie de la piste. *Sonde* `tests/probes/music/console_aux_destinations.probe.mjs`, iPad `aux_to_bus.js`.
- **MX-32** · P0 · W A — Piste **coupée** (mute) dont un Aux envoie vers un bus → la piste se tait, le bus reçoit
  toujours. *Origine* R-179 défaut 8 (test Rust `a_muted_strip_still_feeds_its_sends`).
- **MX-33** · P1 · W — L'outil Aux montre le dernier curseur touché (Envoi ou Passage) et se règle au glisser comme VOL.
- **MX-34** · P1 · W — Panneau Aux : destinations posées directement (bus, pistes, « Nv. bus ») ; « Nv. bus » crée un bus.
- **MX-35** · P0 · W — Aux vers une piste → arrive dans son IN ; IN liste les entrées physiques, les Clips, les Aux reçus,
  plusieurs à la fois ; une boucle se fait entendre un retour plus tard (jamais de blocage). *Sonde* `tests/probes/molecule_mix_model.probe.mjs`.
- **MX-36** · P1 · W — IN d'une piste : choisir un instrument (et sa sortie 0–15) → la piste joue l'instrument.

## E. Mute, solo, groupes, mesures

- **MX-40** · P0 · W — Mute et Solo des en-têtes : M coupe, S isole ; les pistes MIDI coupées se taisent.
  *Sonde* `tests/probes/molecule_mix_midi.probe.mjs`, `tests/probes/project_mute_acceptance.mjs`.
- **MX-41** · P1 · W — Grouper / Tout dégrouper ; glisser une bande pour rejoindre ou quitter un groupe.
- **MX-42** · P1 · W I A — Jauges vivantes (~30 Hz) sur les tranches pendant la lecture.
- **MX-43** · P1 · W — Un module touché dans la Console montre son couloir dans la Timeline, et inversement.

## À compléter

- Les groupes et les jauges n'ont pas encore de sonde.
- `console_routing_ui.probe.mjs` (ordre par tenir-déplacer, panneaux soudés, Aux, OUT, IN du bus) : 14/15 le 16 nov. ;
  le 15e contrôle (IN du bus) a manqué un toucher, la sonde retouche désormais une fois ; sa relance était bloquée par
  un démarrage de l'accueil en échec (`dashboard_domain_unknown`) pendant que d'autres sessions modifiaient le Dashboard.
- Questions R-179 (2) et (3) en attente : la règle du mute (MX-32) reste à confirmer par toi.
