# 12 — Objets « Contrôles » (sliders, rotatifs, pads…) et leurs actions

Propriétaires : contrat `atome/src/shared/control_contract.js` (type `control`, 13 sortes) ; face et rendu
`eVe/domains/rendering/control_face.js`, `control_projection.js` ; `eVe/domains/controls/` (create_panel,
action_panel / view / cases / pick, reaction_choices, condition_*, batch, rename, presence, automation, follow,
zone_roaming, gesture_layer, commands) ; réactions `eVe/intuition/runtime/interaction_reaction_model.js`,
`interaction_message_runtime.js` ; cibles projet `eVe/domains/rendering/project_view_object_action.js`,
`project_view_object_pick.js` ; Molécule `runtime_cells_command.js`, `transport_jump.js`, `runtime_api_commands.js` ;
réseau `atome-server/src/network/`. Cahier : `todo/controles_cahier_2026-11-24.md` (R-347).

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Poser un contrôle

- **CT-01** · P0 · W Ph — Créer › Contrôles : un panneau contre la case, ses 13 outils cinq par rangée ; un outil
  touché s'arme ; un toucher dans l'aperçu, la Timeline ou une cellule pose le contrôle sur la grille ; retouché, il se
  désarme. *Origine* R-347 A2 (`control_create_panel.js`).
- **CT-02** · P1 · W — Les 13 sortes à leur taille par défaut : Slider 1 × 3, Rotatif 1 × 1, Bouton 1 × 1,
  Interrupteur 1 × 1, Pad XY 3 × 3, Champ 3 × 1, Menu 2 × 1, Pads 2 × 2, Clavier 4 × 1,5, Afficheur 1 × 2,
  Sélecteur n × 1, Condition 1 × 1, Zone sur un objet. *Origine* R-347 A1.
- **CT-03** · P1 · W — Aspect : verre des outils, accent du slider, thème suivi, aucun libellé ; Nom du rail → bande
  en haut, 9 caractères puis « … » ; couleur, taille et image propre se changent comme pour un objet. *Origine* R-347 A1, Q5.
- **CT-04** · P0 · W — Durée de vie : posé dans l'aperçu = un clip du début à la fin du projet (il suit la fin) ; posé
  dans la Timeline = 4 mesures ; dans une cellule = actif tant qu'elle joue ; hors de son clip ni visible ni actif ;
  à l'arrêt, actif si la tête est sur son clip ; apparition en fondu ou sèche, au choix ; couper / effacer / déplacer
  comme un clip. *Origine* R-347 A9, L7 (`control_presence.js`, `control_presence_model.js`).

## B. Jouer et éditer

- **CT-05** · P0 · W I Ph — Lecture (Consultation, Performance) : les gestes vont au contrôle, il ne bouge pas, son
  maintien est un déclencheur (pas de Mystic) ; la Condition ne se voit plus ; la Zone se touche sans se voir.
  *Origine* R-347 A3, L2–L3.
- **CT-06** · P0 · W — Édition : un toucher choisit le contrôle (déplacer, redimensionner sur la grille), le rail
  montre ses outils, Action en premier ; un double toucher ouvre Action. *Origine* R-347 A3.
- **CT-07** · P1 · W — Chaque sorte réagit à son geste : Slider et Rotatif (valeur, plage, pas), Bouton momentané
  (allumé / éteint), Interrupteur (glyphe allumé), Pad XY (deux valeurs), Champ (saisie au service de texte caché),
  Menu (liste au gabarit d'eVe), Pads (grille, notes 36…51 en série), Clavier (octave, transposition), Afficheur (reçoit
  seulement, zones vert / jaune / rouge), Sélecteur (le choisi enfoncé). *Origine* R-347 A1.

## C. Panneau Action

- **CT-08** · P0 · W — Action : une rangée par réaction Quand · Cible (2 cases) · Message · Valeur ; « + » ajoute ;
  une case touchée ouvre ses choix dans le panneau (← pour revenir). *Origine* R-347 A4 (maquette q7_A).
- **CT-09** · P1 · W — Maintien sur une rangée : Suppr., Copier, Coller, Bypass dans la bande du pied ; Coller marche
  sur plusieurs contrôles ; une réaction en Bypass ne part plus. *Origine* R-347 A4.
- **CT-10** · P1 · W — Quand : chaque sorte ne montre que ses déclencheurs (Toucher, Relâcher, Double touche, Maintien,
  Glisser, Entrer / Sortir, Valeur changée, Seuil haut / bas / les deux, La lecture arrive, La lecture quitte, À chaque
  temps / mesure, MIDI reçu, À l'ouverture, Minuteur). *Origine* R-347 A5.
- **CT-11** · P1 · W — La lecture arrive / quitte : départ ou saut dans le clip du contrôle = arrive, arrêt ou saut
  dehors = quitte ; en Cellules, départ et arrêt de sa cellule ; rien ne part au passage de la tête tant qu'aucune
  réaction ne les utilise. *Origine* R-347 A5, Q13.
- **CT-12** · P1 · W — Message : un outil d'atome, un message MIDI (note, CC, programme, pitch bend, aftertouch,
  start / stop / horloge), une valeur fixe, Mémoriser / Restaurer ; Valeur : plage de sortie, courbe linéaire /
  exponentielle / logarithmique, inverser, absolu / relatif, tout au curseur d'outil. *Origine* R-347 A7.

## D. Cibles du projet : clips, Scènes, pistes, transport

- **CT-13** · P0 · W — Cible Clips (ou Scènes) › Lancer : un toucher du contrôle lance (ou arrête) la cellule ou la
  Scène, calée sur sa quantification ; la case Cible dit son nom (« B ») ; une cible absente donne une erreur nommée,
  jamais un « ok » muet. *Origine* R-352.
- **CT-14** · P0 · W — Message d'un clip : Lire, Du début, Arrêter, Pause (la suivante reprend où il s'était arrêté),
  Vitesse ×0,25–×4 (entendue aussitôt, gardée au repos), Pitch −24…+24 demi-tons. *Origine* R-363.
- **CT-15** · P1 · W — Message d'une Scène : Lancer, Lire, Du début, Arrêter ; d'une piste ou d'un instrument :
  Niveau, qui suit la valeur du contrôle. *Origine* R-352, R-363.
- **CT-16** · P0 · W — Cible Projets : Lecture, Stop, Lect / Stop, Pause, Aller à (Début, Mesure n, Valeur du contrôle,
  un Repère, une Scène), calé sur l'Aimant du projet, la mesure, le temps ou Aussitôt ; en lecture le saut tombe au pas
  suivant de la grille. *Origine* R-363 (`transport_jump.js`, `ui.timeline.transport.command`).
- **CT-17** · P0 · W — Cible › Clips : Ce clip (par défaut) · Par scène · Toucher en bas ; Par scène → Rangée 1…N ;
  le même pad lance la rangée N de la Scène qui joue (sinon la choisie, sinon la première) : Scène A puis B, la rangée
  de chacune. *Origine* R-352 (maquettes v3).
- **CT-18** · P1 · W Ph — Toucher : le panneau se replie, la vue passe aux Cellules, la case touchée donne son clip ou
  sa rangée, le panneau revient sur la case Cible ; tant que Cible est ouverte, la rangée s'allume dans chaque Scène
  (`cell_glow`), le reste voilé ; la case dit « Rangée N » avec son glyphe. *Origine* R-352.
- **CT-19** · P1 · W — Message « Preset » d'une piste ou d'un instrument : la liste des presets de tranche ; déclenché,
  la tranche prend le preset (passage net, queues coupées) ; un message MIDI passe par le déclencheur MIDI du contrôle.
  *Origine* R-365.
- **CT-20** · P1 · W — (pour 04_cellules_scenes si préféré) Follow Action « Preset {nom} » dans Fin clip : à la fin du
  clip, sa piste prend le preset et le clip continue, calé. *Origine* R-365 (`runtime_cells_follow_preset.js`).
- **CT-21** · P1 · W — Message « Effet » d'une piste : ses réglages listent les effets à interrupteur de la piste
  (Stutter, Hachoir, Chaos, Vitesse), puis Tenu (par défaut) ou Basculé. Tenu : le pad appuyé allume l'effet, relâché
  l'éteint ; Basculé : chaque déclenchement l'inverse (aussi par un déclencheur MIDI). *Sonde*
  `temp/r367_2026-11-25/effect_hold_path.probe.mjs`. *Mise à jour 2026-11-25* (codé). *Origine* R-367 (op `effect`,
  modes `hold` / `toggle`).

## E. Retour, automation, lot, condition

- **CT-22** · P1 · W — Le contrôle suit sa cible (première réaction) ; renvoi MIDI externe par réaction, éteint par
  défaut. *Origine* R-347 A8, L6 (`control_follow.js`).
- **CT-23** · P0 · W — Enr. armé : les gestes sur le contrôle s'écrivent en automation dans la bande de son clip ; doigt
  posé = reprise en main ; seule la valeur au lâcher passe par le pipeline. *Origine* R-347 A8, L6 (`control_automation.js`).
- **CT-24** · P1 · W — Plusieurs contrôles choisis : un panneau commun, « ≠ » sur une case qui diffère ; Série numérote
  (notes, rangées qui montent) ; Nom en lot ; une réaction collée en lot. *Origine* R-347 A10, L10 (`control_batch.js`,
  `control_rename.js`).
- **CT-25** · P1 · W — Condition : rangées Quand · Si (Cible · État · comparaison · Valeur ; Et / ou ; +) · Alors ·
  Sinon ; Script au pied (non actif tant que non Activé) ; la même étape « si… sinon » dans la suite d'un autre
  contrôle. *Origine* R-347 A11, L8.

## F. Tout objet, Zone, réseau, voix

- **CT-26** · P1 · W — Outil Action dans le rail de tout objet (image, texte, forme, vidéo) : mêmes réactions qu'un
  contrôle. *Origine* R-347 L11.
- **CT-27** · P1 · W Ph — Zone : voile lavande sans bord en édition ; un doigt venu d'ailleurs qui y glisse déclenche
  Entrer, qui en sort Sortir. *Origine* R-347 L11 (`control_zone_roaming.js`).
- **CT-28** · P1 · W T I — Réseau : une adresse web part par le serveur (adresses publiques seulement depuis le serveur
  central, 600 / min par compte) ; OSC depuis Tauri et l'iPad ; sur le Web l'OSC est refusé avec le message discret.
  *Origine* R-347 L12 (`atome-server/src/network/`, `cargo test -p atome-server --lib network`).
- **CT-30** · P1 · W — Message « Preset » d'un widget, le preset choisi contenant plusieurs parties : ses interrupteurs
  Effets, Routage, E/S sous la liste (tous allumés par défaut, un au moins reste allumé) ; déclenché, seules les parties
  allumées se chargent. *Origine* R-366 (`control_action_cases.js`, `interaction_reaction_model.js` `parts`).
- **CT-29** · P1 · W — Par la voix / MCP (`controls.create|update|list`, `interactions.*`, `ui.control.rename`,
  `ui.timeline.cells.command`, `ui.timeline.transport.command`, jumeaux `eve.timeline.*`) : l'assistant crée, règle et
  déclenche aussitôt, sans écran de confirmation. *Origine* R-347 A13, R-363, règle 22.

## À compléter

- Aucune sonde versée sous `tests/probes/` : les preuves sont sous `temp/widgets_spec_2026-11-24/`,
  `temp/control_target_scene_2026-11-25/`, `temp/control_clip_actions_2026-11-25/`, `temp/strip_preset_live_2026-11-25/`
  — à verser dans `tests/probes/controls/`.
- Essai iPad (OSC vers le réseau local) : toi. `control` accepté par le serveur 3001 seulement après le build partagé
  d'atome-server.
- R-365 : Program Change → N-ième preset, choix Volume / Preset dans Pilotage, fondu entre chaînes : non codés
  (proposés seulement).
- R-347 : essai appareil (OSC LAN) non fait.
