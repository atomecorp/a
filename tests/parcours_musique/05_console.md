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
  *Mise à jour 2026-11-25 (23 nov., R-290 S3)* : une tranche audio sans Aux montre aussi un Aux vide en fin de colonne (virtuel, écrit au premier toucher) ; la chaîne stockée reste REC, VOL, PAN.
- **MX-03** · P0 · W I — Avec 16 pistes, un glisser latéral fait défiler la rangée, même commencé sur un outil.
  *Origine* R-171 B2, bug connu `mixer-strips-never-drag-scroll`.
- **MX-04** · P1 · I — Vidéo en lecture dans la vue Console : rien ne scintille, aucune colonne ne bouge. *Origine* R-171 B1 (à voir sur iPad).
- **MX-05** · P1 · W — Nom touché → colonne sélectionnée (fond « un peu plus clair ») ; piste tenue par son nom puis
  glissée → la colonne suit le doigt, les autres s'écartent.
  *Mise à jour 2026-11-25 (23 nov., R-283 ; 22 nov., R-272)* : en « Ambre » la tranche choisie est voilée d'orange 16 % et son nom rempli, plus « un peu plus clair » ; fond de tranche sombre du style R-272.
- **MX-06** · P1 · W — Bande « Projet ▲ » : le ▲ plie / déplie l'aperçu.
- **MX-44** · P0 · W Ph — Lecture d'une piste qui sonne : sur les deux bords du fond de sa tranche, une barre de 2 px
  monte avec le niveau de sortie (canal gauche à gauche, droit à droite), verte, jaune dès −12 dBFS, rouge dès −3 ;
  rien en silence ; visible aussi VOL ouvert. *Origine* R-285 (`level_edge`, `molecule_mix_strip_tree.js`,
  `bevy_ui_level_meter.js`, `project_view_level_meters.js`).
- **MX-45** · P1 · W — Toute tranche audio sans Aux montre un Aux vide en fin de colonne ; le premier toucher le crée
  (rien n'est écrit à l'ouverture). *Sonde* `tests/probes/molecule_mix_view.probe.mjs`. *Origine* R-290 S3 (`aux_home`).
- **MX-46** · P1 · W Ph — Thème « Ambre » : tranches gris chaud, outils plus sombres ; tranche choisie voilée d'orange
  16 % et son nom rempli d'orange ; en « Nuit » rien ne change. *Origine* R-283 (jetons `console` de `system_ui_themes.js`,
  `chosenGround`).
- **MX-47** · P1 · W — Une tranche choisie : le rail offre Sauver, Charger, Réinitialiser ; Sauver et Charger par
  parties (MX-71 à MX-75) ; un preset d'avant R-366 contient toutes les parties ; Réinitialiser
  rend la tranche d'une piste neuve ; un pas d'annulation chacun. *Origine* presets de tranche du 23 nov.
  (`mix_strip_presets.js`, `molecule_mix_groups.js`).
- **MX-71** · P0 · W — Sauver (R-366) : son panneau s'ouvre contre l'outil, sans ✕ ; le nom proposé est celui de la piste,
  tout sélectionné ; les interrupteurs Effets, Routage, E/S et Tout sont allumés ; OK (ou Entrée) garde seulement les
  parties allumées sous ce nom et replie le panneau. *Sonde* `temp/strip_preset_parts_2026-11-25/probe/ui.probe.mjs`.
  *Origine* R-366 (`molecule_mix_preset_panel.js`, `mix_strip_presets.js#stripPresetContent`).
- **MX-72** · P0 · W — Sauver sous un nom qui existe déjà dans la voie : le premier OK clignote dans le rouge du danger,
  le second remplace ce preset (même identifiant : un widget ou une Follow Action qui le charge le charge encore) ;
  toucher ailleurs ou changer le nom désarme. *Origine* R-366.
- **MX-73** · P0 · W — Charger (R-366) : interrupteurs en tête, retenus d'une ouverture à l'autre, puis les presets de
  la voie en liste (rangées d'une demi-case, nom entier) ; un toucher charge les parties allumées que le preset contient,
  en un pas d'annulation ; VOL, PAN et Opacité ne changent jamais ; les modules gardés (effets si on ne charge que le
  routage, le REC, les niveaux) restent les mêmes, avec leur automation et leurs liaisons MIDI. *Origine* R-366
  (`mix_strip_presets.js#presetLoadOperations`, sonde `temp/strip_preset_parts_2026-11-25/probe/parts.probe.mjs`).
- **MX-74** · P1 · W — Charger seulement les effets : les Aux, IN et REC de la tranche gardent leur place comptée en
  effets ; un module qui était après le dernier effet reste après le dernier. Routage seul : les effets de la tranche
  restent. E/S seules : seules l'entrée et la sortie changent. *Origine* R-366.
- **MX-75** · P1 · W — Un preset dont l'Aux vise un bus absent du projet : l'Aux arrive sans destination et sa tuile
  dit « → choisir » (comme un envoi MIDI non relié) ; rien n'est créé ; le lot n'échoue pas. *Origine* R-366
  (élagage `pruneMixReferences`, `molecule_mix_module_controls.js#mixColumnSlider`).
- **MX-48** · P0 · I Ph — Projet ouvert directement en vue Mixage : l'aperçu montre l'image à la tête de lecture
  (jamais « Conteneur vide »). *Origine* R-306 (`project_view_molecule_mix_content.js#cueOnce`).

## B. VOL, PAN et curseurs

- **MX-10** · P0 · W A — VOL glissé : le niveau change en direct, la valeur est enregistrée au lâcher ; la jauge reste
  dans la console, toute la course atteignable. *Origine* R-171 D6.
- **MX-11** · P0 · W — **Tenir puis déplacer** VOL, PAN, Opacité, un effet, REC, un Aux → l'outil se soulève et change de
  place dans la chaîne ; le son suit le nouvel ordre. *Origine* R-183 (défaut : les outils-curseurs ne bougeaient pas).
  *Mise à jour 2026-11-25 (23 nov., R-287)* : l'outil porté grossit ×1,12 ; lâché au-delà de la console il est supprimé (rail poubelle) ; la zone « Supprimer » du bout de rangée n'existe plus ; posé de côté → bypass.
- **MX-12** · P0 · W — Un seul panneau ou une seule jauge ouvert dans toute la console ; en ouvrir un autre replie le premier.
- **MX-13** · P1 · W — Balayer un effet → by-pass (son direct), rebalayer → actif.
  *Mise à jour 2026-11-25 (23 nov., R-287 ; règle 20)* : FAUX — un glisser sur un outil ouvre (ou replie) son panneau (`molecule_mix_interactions.js`, `swipe`) ; le bypass se fait en posant l'outil de côté, par Bypass du rail (tenu sans bouger) ou par l'interrupteur du pied.
- **MX-49** · P0 · W Ph — VOL (et Opacité) ouvert : une colonne graduée sur toute la hauteur de la tranche, son
  capuchon `fader_cap` (petit rectangle sombre, contour et trait à l'accent du thème : orange en Ambre), la valeur
  seule en haut, l'unité à côté du nom seulement si elle tient ; le niveau de la tranche lu à côté de la rainure.
  *Origine* R-272, R-283.
- **MX-50** · P0 · W Ph — PAN : une ligne ; pressé ou glissé, il s'ouvre aussitôt en barre aussi large que la console,
  recalée pour ne jamais sortir de l'écran, et règle au même glisser (le glisser ne fait plus défiler les tranches).
  *Origine* R-272 (PAN A), R-283.
- **MX-51** · P1 · W — Une jauge ouverte (VOL, PAN) se replie à un appui ailleurs dans la console. *Origine* R-283.

## C. Panneaux soudés, sans ✕ (R-183)

- **MX-20** · P0 · W Ph — Toucher +, OUT, IN, un Aux, un effet → son panneau part de l'outil, même fond, sans coupure ;
  les tranches voisines s'écartent ; **aucun ✕** ; retoucher l'outil (ou un choix du + / OUT) replie.
  *Sonde* `tests/probes/music/console_routing_ui.probe.mjs`.
- **MX-21** · P0 · W — + : Aux en tête, puis les familles d'effets ; la famille choisie montre ses effets ; VOL, PAN,
  MONO (Opacité en vidéo) en dernière rangée ; Mes effets après.
  *Mise à jour 2026-11-25 (23 nov., R-290 ; 16 nov., R-178 ; 25 nov., R-367)* : + audio = Aux puis Scope en tête, familles dont Rythme ; + vidéo = Scope en tête, pied Opacité et Transformer ; + MIDI = Envoi en tête.
- **MX-22** · P1 · W — Pied d'un panneau d'effet : nom centré, interrupteur dans le coin opposé à l'assistant
  (inversé pour une main gauche).
- **MX-52** · P1 · W Ph — Ambre : l'outil ouvert est rempli d'orange ; lui et son panneau (le +, un effet) reposent sur
  la bande orange foncée, le panneau sur sa dalle opaque, entier dans l'écran ; les choix du + au gris des outils.
  *Origine* R-283 (`mixOpenTether`, `openedLook`).
- **MX-53** · P0 · W — + : un module choisi est ajouté ET son panneau s'ouvre aussitôt. *Origine* R-309
  (`molecule_mix_welded_actions.js`).
- **MX-54** · P0 · W — Ajouter ou ouvrir un effet dans la console ne déplie ni ne change aucune piste de la Timeline
  (elle reste compacte). *Origine* R-309 (`mix_module_focus.js`).

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
  *Mise à jour 2026-11-25 (23 nov., R-285)* : les jauges sont les bords `level_edge` de chaque tranche (et le niveau à côté d'un VOL ouvert) ; l'ancien « Niveau » de la liste Entrée et `molecule_mix_fader_meter.js` sont retirés.
- **MX-43** · P1 · W — Un module touché dans la Console montre son couloir dans la Timeline, et inversement.
  *Mise à jour 2026-11-25 (24 nov., R-309)* : FAUX dans le sens console → Timeline (retiré : la console ne touche plus la Timeline) ; seul Timeline → console reste.

## F. Réordonner, contourner, supprimer

- **MX-55** · P0 · W Ph — Outil tenu : il grossit un peu (×1,12, ombre) et suit le doigt ; pendant le port, le rail
  porte la poubelle ; lâché au-delà de la console → l'outil est supprimé. *Sonde* `tests/probes/molecule_mix_view.probe.mjs`.
  *Origine* R-287 (maquettes 1–3 ; zone « Supprimer » du bout de rangée retirée).
- **MX-56** · P1 · W — Outil tenu puis posé de côté (sur aucune tranche) → il passe en bypass (ou en sort). *Sonde*
  `tests/probes/molecule_mix_view.probe.mjs`. *Origine* R-287.
- **MX-57** · P1 · W — Outil tenu puis lâché sans bouger → le rail montre Supprimer et Bypass pour lui. *Origine* R-287
  (`moduleRail`, `moduleHold`).
- **MX-58** · P1 · W — Module en bypass : sans fond ni ombre, glyphe et nom gris ; le son passe direct. *Sonde*
  `tests/probes/molecule_mix_view.probe.mjs`. *Origine* R-287 (`ghost`, `bypassInk`).

## G. Scope

- **MX-59** · P1 · W — + d'une tranche audio : Aux puis Scope en tête ; d'une tranche vidéo : Scope en tête ; Scope
  ajouté → son panneau : trois vues Onde, Vecto, Histo, changeables en direct, et la prise Entrée / Sortie. *Sonde*
  `tests/probes/molecule_mix_view.probe.mjs`. *Origine* R-290.
- **MX-60** · P1 · W I Ph — Scope d'une piste vidéo en lecture : il dessine l'image de la piste (calque du moniteur) ;
  pendant une prise, la caméra. *Origine* R-290, R-306 (`molecule_mix_scope_source.js`).
- **MX-61** · P1 · W — Scope d'une piste audio : forme d'onde, vectoscope, histogrammes vivants ; le son n'est pas
  changé (copie transparente). *Origine* R-290 (`atome-dsp/src/scope.rs`, `placeMixScopes`).

## H. Transport et rail du Mixage

- **MX-62** · P0 · W — Lecture et Début dans le Mixage : ils lisent la Timeline ; pendant la lecture, Lecture montre
  Pause ; une lecture lancée dans le Mixage s'arrête depuis la Timeline et inversement ; les bords des tranches bougent.
  *Origine* R-309 (`project_view_mix_transport_row.js`), R-361.
- **MX-63** · P1 · W — Rangée des vues du Mixage : les mêmes cases que Timeline et Cellules (deux cases vides, Scènes à
  la place de Prises, une case vide à la place d'Édition, Début, Lecture) ; rien ne bouge en changeant de vue.
  *Origine* R-309.
- **MX-64** · P1 · W — Rail du Mixage › Réglages › Entrée : « Entrées » et « Monitoring » s'affichent et s'allument.
  *Origine* R-309 (`project_view_mix_settings_rail.js`).
- **MX-65** · P1 · W — Une piste choisie (Mixage, Timeline, Cellules) : la case « Niveau », trois cases de haut, juste
  au-dessus de Replier, repliée par défaut ; ouverte, deux barres (G, D) du niveau d'entrée, sans l'entendre ni
  l'enregistrer ; repliée, elle ne lit plus. *Origine* R-285, R-360 (`atome_contextual_rail_meter.js`,
  `project_view_track_input_meter.js`).
- **MX-70** · P1 · W — Rail du Mixage › Pilotage allumé, toucher un effet à interrupteur d'une tranche (Stutter,
  Hachoir, Chaos, Vitesse) : son panneau MIDI (« Pilotage · Piste N · Stutter ») ; Apprendre, puis la note tenue
  allume l'effet et relâchée l'éteint (un CC : allumé sauf à 0). Le reste de la tranche garde son Volume. *Sonde*
  `temp/r367_2026-11-25/effect_hold_path.probe.mjs`. *Origine* R-367.

## I. Bus MIDI

- **MX-66** · P1 · W — Tranche MIDI : IN liste les entrées (ports, contrôles, tranches MIDI), OUT les sorties (ports,
  instruments, tranches), plusieurs à la fois ; « Nv. bus » crée une tranche « Bus MIDI n ». *Origine* R-347 L9
  (`mix_midi_endpoints.js`, `molecule_mix_midi_lists.js`).
- **MX-67** · P1 · W — Une entrée ou sortie MIDI touchée : panneau soudé Canal (Tous), Dest. (Orig.), Transp., Plage,
  Suppr., Activé ; le MIDI suit le filtre, la transposition et le canal choisis. *Origine* R-347 L9.
- **MX-68** · P1 · W Ph — Plage pressée : un clavier de 128 notes aussi large que la console, deux poignées, notes hors
  plage assombries, bornes dans leurs cases (double toucher = saisie) ; doigt levé, il se replie. *Origine* R-347 L9
  (`molecule_mix_midi_range.js`, maquettes q11_2, q11_3).
- **MX-69** · P1 · W — Deux bus MIDI branchés l'un sur l'autre : la boucle est coupée (8 sauts), rien ne se bloque.
  *Origine* R-347 L9 (`midi_bus_runtime.js`).

## J. Rack d'effets et potards (R-373)

- **MX-76** · P0 · W — Toucher un effet d'une tranche : son rack s'ouvre à sa droite (9 cases), chaque effet de la tranche
  une unité empilée dans l'ordre du signal, l'effet touché déplié ; le fil de la couleur de la tranche le long du bord
  gauche ; l'outil de l'effet dans la tranche reste choisi. *Origine* R-373 (`molecule_mix_rack.js`).
  *Sonde* `temp/console_design_2026-11-25/rack.probe.mjs` (captures `real_rack/07_rack.png`, `12_eq_unfolded.png`).
- **MX-77** · P0 · W — Unité dépliée : en-tête (outil, nom, préréglage, interrupteur), l'écran sur 4 cases (courbe de
  l'EQ, courbe de transfert du Comp qui suit Seuil, Ratio, Genou, Gain), les valeurs en potards, les choix (le choisi
  plus clair, enfoncé), les mesures (Réduc.), puis Préréglage et Clé ; toucher l'outil d'une unité la replie ou la
  déplie, plusieurs ouvertes à la fois ; trop haut, le rack défile au doigt. *Origine* R-373.
- **MX-78** · P1 · W — Unité repliée : une ligne, son nom et son préréglage, la courbe de son écran en petit (EQ, Comp),
  son interrupteur. *Origine* R-373 (`face`).
- **MX-79** · P0 · W — Potard au repos : outil, nom en haut, potard petit d'une seule couleur (arc de trois quarts de
  tour à l'accent des réglettes, chapeau et repère) ; glissé vers le haut il monte, vers le bas il descend ; tourné, le
  fond de l'outil disparaît, le cercle prend la case, le nombre seul au centre, sans unité. *Origine* R-373
  (`bevy_ui_knob.js`, capture `real_rack/09_knob_turned.png`).
- **MX-80** · P1 · W — Ambre : potards et courbes à l'orange, un effet actif rempli d'orange. *Origine* R-373
  (capture `real_rack/21_knob_amber.png`).

## À compléter

- Les groupes et les jauges n'ont pas encore de sonde.
- `console_routing_ui.probe.mjs` (ordre par tenir-déplacer, panneaux soudés, Aux, OUT, IN du bus) : 14/15 le 16 nov. ;
  le 15e contrôle (IN du bus) a manqué un toucher, la sonde retouche désormais une fois ; sa relance était bloquée par
  un démarrage de l'accueil en échec (`dashboard_domain_unknown`) pendant que d'autres sessions modifiaient le Dashboard.
- Questions R-179 (2) et (3) en attente : la règle du mute (MX-32) reste à confirmer par toi.

*Relevé du 2026-11-25 (demandes du 17 au 25 nov.), non codé ou partiel :*

- R-290 : Aux vidéo (image d'une piste composée dans une autre) non codé ; Scope vidéo en Sortie vide dès qu'un
  effet vidéo est actif (lecture GPU à créer) ; Scope audio dans le navigateur non vérifié.
- R-287 : rail porté / fantôme non vérifiés à l'écran (Playwright).
- R-283 / R-272 : essai iPad non fait (Web seulement).
