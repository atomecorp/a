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
- **FX-18** · P1 · W — + › Rythme : Stutter, Hachoir, Chaos, Vitesse, sur toute tranche (piste, bus, entrée en direct,
  master). *Origine* R-367 (`molecule_mix_catalog.js` famille `rhythm`, `atome-dsp/src/rhythm/`).
- **FX-19** · P1 · W — Stutter allumé (Actif sur Marche) : la tranche répète la division choisie, calée sur le temps
  du transport ; Répét. (0 = tant qu'il est allumé), Accél., Hauteur, Chute, Envers (Arrêt, Marche, Altern.), Durée,
  Départ (Grille, Aussitôt), Mix entendus. *Mise à jour 2026-11-25* (libellés réels). *Origine* R-367.
- **FX-20** · P1 · W — Hachoir allumé : le son est coupé en rythme, au tempo du projet, selon son Motif (Plein, Moitié,
  Contret., Galop, Pointé, Tresillo, Montée, Escalier), sa Longueur, sa Profondeur et sa Douceur. *Sonde*
  `temp/r367_2026-11-25/listen.probe.mjs` (Moitié : temps 2 et 4 coupés). *Origine* R-367.
- **FX-21** · P1 · W — Chaos : même graine → même résultat à chaque lecture et à l'export ; changer la graine → un
  autre chaos ; Densité règle combien de tranches sont touchées, Répéter, Envers, Couper, Octave, Sauter comment.
  *Sonde* `temp/r367_2026-11-25/listen.probe.mjs`. *Origine* R-367 Q4.
- **FX-22** · P1 · W — Vitesse allumée : le son ralentit vers Cible (0 à ×2) le long de sa Rampe (ms) ou d'une durée
  en temps (Synchro), Courbe Linéaire / Expon. / En S ; Mode Bande (la hauteur suit, Cible 0 = tape stop) ou Stretch
  (hauteur gardée) ; éteinte : Retour Rampe (par défaut, il rattrape le direct en accélérant), Saut ou Arrêt. Sur un
  signal en direct, il ne passe jamais devant le direct. *Sonde* `listen.probe.mjs` (×0 : le son s'arrête).
  *Origine* R-367 Q2. Accélérer une prise au-delà de ×1 : FX-25.
- **FX-25** · P1 · W — Vitesse d'une prise : bloc d'automation d'une piste de prises (touche Auto), rangée « Vitesse »
  (×0,25 à ×4, ×1 sans point) ; un toucher pose un point, un point se déplace ; Lasso, Échelle, Forme › Rampe / Sinus /
  Carré, Copier / Coller, Suppr., Courbe Linéaire / Palier / Douce ; un point touché, le rail offre « Mode » : Bande (la
  hauteur suit la vitesse) ou Stretch (hauteur gardée). La prise se lit à la vitesse de la courbe : accélérée, elle finit
  plus tôt ; ralentie, la fin du clip la coupe ; l'export donne le même son. Une prise déplacée sur une autre piste
  emporte ses points. *Sondes* `temp/r367_2026-11-25/take_speed.probe.mjs`, `take_speed_listen.probe.mjs`.
  *Origine* R-367 (accord de l'utilisateur le 25 nov.).
- **FX-23** · P1 · W — Effet rythmique ou Écho synchro sur un projet à plusieurs tempos : pendant la lecture, l'effet
  suit le tempo de l'endroit joué (carte des tempos). *Origine* R-367 (`atome-dsp/src/transport.rs` ; l'Écho ne
  recevait que le premier tempo, corrigé : `delay.rs#set_transport`).
- **FX-24** · P1 · W — Un effet du + › Rythme seulement réactivé par son contournement reste muet tant qu'Actif est
  sur Arrêt : c'est Actif qui le fait sonner. *Origine* R-367.

## C. Effets vidéo (piste vidéo, aperçu)

- **FXV-01** · P0 · W — Ajouter Primaire, régler exposition → l'aperçu change. *Origine* R-184 (panneaux vidéo qui ne
  s'ouvraient pas, corrigé).
- **FXV-02** · P1 · W — Roues et Courbes dessinées ; Teinte/Sat ; LUT `.cube` importée par le panneau d'import unique.
- **FXV-03** · P1 · W — Fond vert : Pipette allumée, toucher l'aperçu → la couleur est retirée, Masque montre la découpe.
- **FXV-04** · P1 · W — Flou (5 modes + zone), Netteté, Vignette, Grain, Halo, Pixels, N&B.
- **FXV-05** · P2 · W — 12 effets vidéo au plus par chaîne : le 13e est refusé proprement.
- **FXV-06** · P1 · W — + d'une tranche vidéo : Scope en tête ; au pied Opacité et Transformer (Pos. X, Pos. Y, Taille,
  Rotation) ; régler le Transformer déplace / tourne l'image de la piste. *Origine* R-290, R-178 (24).
- **FXV-07** · P1 · W — Fond vert › Fond : Transparent, une autre piste vidéo, l'image choisie, « Choisir une image »
  (panneau d'import unique) ; l'image se pose sous le média détouré à son cadre. *Origine* R-184 (16 nov., absent du
  fichier).

## D. Automation

- **AU-01** · P0 · W — Touche FX d'un en-tête → couloirs d'automation ; ajouter des points sur Volume, Lecture → le
  volume suit la courbe. *Sonde* `tests/probes/molecule_automation.probe.mjs`.
  *Mise à jour 2026-11-25 (24 nov., R-312 ; règle 13)* : la touche s'appelle « Auto » (en-têtes M, S, Auto), plus « FX » ; ouverte, un toucher dans les couloirs ne la referme plus.
- **AU-02** · P1 · W — Courbes linéaire / palier / douce ; Rec écrit en jouant ; modes Lecture, Toucher, Verrou.
- **AU-03** · P1 · W — Déplacer le clip déplace son automation (portée par le clip).
- **AU-04** · P1 · W — Opacité d'une piste vidéo suit sa courbe.
- **AU-05** · P0 · W — Touche Auto d'un en-tête : les couloirs d'automation s'ouvrent ; trois touchers dans la zone
  dépliée ne la referment pas ; replier les en-têtes laisse les couloirs ; seul Auto retouché les replie. *Sonde*
  `tests/eve/timeline_fx_block.test.mjs`, `timeline_track_header.test.mjs`. *Origine* R-312.
- **AU-06** · P1 · W Ph — Piste qui a de l'automation : bandeau d'une demi-case sous la piste, ▾ couloirs dépliés,
  ▸ repliés ; un toucher sur le triangle = la touche Auto ; replier les en-têtes ne le replie pas. *Origine* R-312
  (maquette 3, `project_view_timeline_auto_strip.js`).
- **AU-07** · P1 · W — Quitter puis revenir dans la vue : la piste aux couloirs ouverts est la même. *Origine* R-312
  (`fx_track_id`).
- **AU-08** · P1 · W — Mode Écriture : en lecture avec Rec, la courbe est réécrite sur tout le passage (plus comme
  Verrou). *Origine* R-178 (23).
- **AU-09** · P1 · W — Couloirs d'effets : Lasso, Échelle, Forme, Copier, Coller, Suppr. sur un groupe de points.
  *Origine* R-178 (25).
- **AU-10** · P1 · W — Automation vidéo : Pos. X / Pos. Y / Taille / Rotation du Transformer et les réglages d'un effet
  vidéo suivent leur courbe en lecture (carte Couloirs vidéo). *Origine* R-178 (24).

## E. Panneau d'effets d'un clip

- **FX-24** · P1 · W — Édition d'un clip, rail « Effets » touché : panneau standard attaché à l'outil, sans « FX » ni
  ✕, « Effets » allumé tant qu'il est ouvert et qui le referme ; une rangée Volume · effets · + · Sortie.
  *Origine* R-314 (`project_view_cell_fx_rail_panel.js`).
- **FX-25** · P1 · W — Dans ce panneau, un effet ajouté ou ouvert : ses réglages en cartes de deux, posés par le
  contenu même de la console, Suppr. et interrupteur au pied ; une famille du + choisie redessine le panneau aussitôt ;
  une rangée de choix ne laisse aucune case vide sous elle (console comprise). *Origine* R-314 (`layMixOpenContent`).

## F. Prises › Effets et Instr. : effets peints, pistes instrument, pistes en direct

- **PZ-01** · P0 · W — Timeline, Prises touché : la palette montre Instr. et Effets après les prises ; touchés, chacun
  ouvre son panneau contre le rail, deux colonnes (Effets : Son · Image, par familles ; Instr. : eVe · Les miens), la
  palette restant ouverte ; Prises replié ferme le panneau. *Sonde* `temp/prises_paint_2026-11-25/probes/ui.probe.mjs`.
  *Origine* R-368 (`project_view_timeline_prises_panel.js`).
- **PZ-02** · P0 · W — Un effet tenu puis porté sur une piste et glissé le long d'elle : sa zone se peint de l'entrée du
  doigt à son lever, calée sur la grille, dans la demi-case sous la piste (son bleu, image pêche) ; l'effet est un module
  normal de la piste, actif seulement dans ses zones, sa queue sonnant après. *Origine* R-368
  (`project_view_timeline_prise_drop.js`, `project_view_timeline_fx_zones.js`, mix-graph `engaged`).
- **PZ-03** · P1 · W — Un effet touché sans le porter : peint à la tête de lecture sur la piste choisie, la longueur d'une
  prise ; le même effet peint deux fois = un seul module, deux zones. Tête arrêtée dans une zone : l'effet est actif.
  *Origine* R-368 (Q6, Q9).
- **PZ-04** · P0 · W — Instr. › Analog (ou un des miens) porté sur les pistes ou touché : une piste instrument, sa tranche
  MIDI recevant tous les ports MIDI et jouant l'instrument, aussitôt jouable (au clavier MIDI ou au Clavier de la piste,
  KB-01). *Origine* R-368.
- **PZ-05** · P0 · W — Audio, Vidéo ou MIDI de Prises posés SOUS les pistes : une piste en direct (entrée ouverte, rien
  enregistré), le glyphe de son entrée allumé sur l'en-tête ; posés SUR une piste, ils y arment une région Record comme
  avant. *Origine* R-368 (maquette 6).
- **PZ-06** · P0 · W — Piste en direct Vidéo : la caméra s'affiche en direct dans le Visuel, à travers les effets de sa
  tranche (une zone d'image peinte n'agit que dedans) ; plus de piste en direct = caméra fermée. *Origine* R-368
  (`project_view_live_video.js`, entrée `live_video`).
- **PZ-07** · P1 · W — Pendant l'enregistrement de la première prise, sur la piste choisie : la tête entre dans une zone →
  le panneau de son effet s'ouvre seul ; ce qu'on y bouge s'écrit dans la zone seulement ; la zone quittée le ferme ;
  jamais en simple lecture. *Origine* R-368 (Q7, `project_view_timeline_fx.js#followZones`).
- **PZ-08** · P1 · W — Une piste vide sous les pistes recevant un effet : une piste est créée d'abord, l'effet peint
  dessus. *Origine* R-368.

## À compléter

- Non codé : « Avance » du compresseur (R-178). ~~Mode Écriture réel ; automation vidéo de Position, Taille,
  Rotation, Couleur et des effets vidéo ; lasso / formes dans les couloirs d'effets (R-178 E23–E25).~~ Faits (R-178,
  2e passe du 16 nov.), relevé du 2026-11-25.
- Recette iPad / AUv3 des effets (R-184 : toi).

*Relevé du 2026-11-25 (demandes du 17 au 25 nov.), non codé ou partiel :*

- R-368 : Prises › Instr. et Effets (déposer un synthé / effet sur une piste, le peindre sur une zone,
  automation écrite sur la zone) : rien codé, ATTENTE UTILISATEUR (Q1–Q9).
- R-367 : EN COURS — modules Rust `stutter`, `chop`, `glitch`, `speed`, catalogue JS, famille Rythme du +,
  libellés et op `effect` présents ; le WASM installé (14:16) est plus ancien que `stutter.rs` (15:14) : pas encore
  audible sur le Web ; rampes de vitesse sur une prise déjà enregistrée (Q1, 2e partie) : aucun code trouvé ; liaison
  MIDI « tenue » (note enfoncée = effet actif) : seulement par le relâché `gesture` des widgets, pas vérifiée.
- R-312 : une seule piste à la fois garde ses couloirs dépliés (`fx_track_id` unique).
- R-314 : essai appareil non fait.
- R-178 (22) : courbes d'effets audio entendues sur le Web seulement après reconstruction d'audio-wasm (indiqué
  « reste ») ; Avance (lookahead) du compresseur toujours non codée (`dynamics.rs` « no lookahead »).
