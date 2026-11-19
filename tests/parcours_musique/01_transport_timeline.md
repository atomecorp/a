# 01 — Transport, vues et Timeline

Propriétaires : `eVe/domains/rendering/project_view_timeline_*.js`, `project_view_transport_*.js`,
`project_view_views_row.js`, `project_view_multitrack_tool.js`, `project_view_mode_state.js` ;
`eVe/intuition/tools/molecule/runtime_transport.js`, `runtime_metronome.js`, `kernel/time_model.js`.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Vues du projet

- **VUE-01** · P0 · W I A Ph — Ouvrir un projet, toucher tour à tour Timeline, Cellules, Scènes, Console dans la
  rangée des vues → chaque vue s'affiche aussitôt, sans écran vide ni flash de l'accueil. *Sonde* `tests/probes/molecule_timeline_activity.probe.mjs`.
- **VUE-02** · P0 · W I — Choisir Console, quitter le projet, le rouvrir → il rouvre sur Console (le mode est gardé,
  une restauration en retard n'écrase jamais un choix récent). *Origine* mémoire « PROJECT_VIEW_MODE_CHANGED ».
- **VUE-03** · P0 · W I — Projet enregistré en disposition Cellules avec 0 scène → la Timeline repasse par le rail et
  montre ses pistes ; jamais une grille vide sans ligne. *Origine* R-177 (2).
- **VUE-04** · P1 · Ph — Téléphone : la rangée tient en une ligne Vue · Édition · Réglages · Enr. · Début · Lecture ;
  Vue se déplie au-dessus avec Timeline, Cellules, Scènes, Console, Aperçu, Inspecteur ; un choix replie. *Origine* R-182 (P1/P2).
- **VUE-05** · P1 · W — Aperçu : l'outil plie et déplie l'aperçu ; plié, la Timeline monte jusqu'en haut. Inspecteur :
  interrupteur ; allumé, il s'ouvre partagé avec la sélection. *Origine* R-182.
- **VUE-06** · P1 · W — Côte à côte (Multipiste) puis retour ; retoucher la vue courante ramène à la vue naturelle.
  *Sonde* `tests/eve/project_view_multitrack_tool.test.mjs`.
- **VUE-07** · P0 · W — Mix / Timeline d'une Molécule choisie montrent cette Molécule, pas le projet entier.
  *Origine* bug connu `molecule-activity-shows-project`.

## B. Transport

- **CHN-01** · P0 · W T I A — Song chaining : dans la vue Liste, une liste (séquentielle) qui contient trois chansons
  multipistes de longueurs différentes ; Lecture → les chansons s'enchaînent dans l'ordre de la liste, chacune démarre
  exactement à la fin de la précédente (sa plus longue piste), sans trou ni chevauchement, l'horloge audio continue
  sans à-coup ; la liste s'arrête après la dernière. *Sonde* `node tests/probes/song_chaining_plan.probe.mjs`,
  `node tests/probes/song_chaining_midi_web.probe.mjs`. *Origine* toi, 16 nov.
- **CHN-02** · P0 · W T I A — Une liaison MIDI par chanson de la liste (Program Change 0, Program Change 1, note 60) →
  chaque message lance sa chanson depuis sa rangée, la suite s'enchaîne ensuite ; une liaison faite dans le panneau
  MIDI Binding en choisissant l'outil « Project playback » lance aussi sa chanson. *Sonde*
  `node tests/probes/song_chaining_midi_web.probe.mjs`. *Origine* toi, 16 nov.
- **TR-01** · P0 · W T I A — Lecture depuis 0 sur un projet avec 2 clips son → le son sort, la tête avance, l'aperçu
  suit. Stop → tout s'arrête net (pas de queue de son). *Sonde* `tests/probes/molecule_audio_mix_transport.probe.mjs`.
- **TR-02** · P0 · W I — Lecture jusqu'au bout → la lecture **s'arrête à la fin du dernier clip** ; la Lecture suivante
  repart du début (jamais une lecture muette sans fin qui fait sortir les clips de l'écran). *Origine* R-177 (choix A),
  bug connu `timeline-transport-stops-at-content-end` (à relire : la règle a changé le 15 nov.).
- **TR-03** · P0 · W I — Début : la tête revient à 0, l'aperçu montre l'image / l'onde à 0.
- **TR-04** · P0 · W — Stop pendant la préparation de la lecture (toucher Lecture puis Stop très vite) → rien ne joue
  ensuite. *Sonde* `tests/eve/project_view_transport_runtime.test.mjs`.
- **TR-05** · P0 · W — Pendant la lecture, le rail ne se redessine pas à chaque tic (aucun clignotement des outils).
  *Origine* bug connu `rail-rerender-each-transport-tick`.
- **TR-06** · P1 · W I — Boucle : tracer la boucle sur la règle (glisser tenu), la redimensionner par ses poignées, Lecture
  → la tête reboucle exactement aux bornes, sans trou ni clic. *Sonde* `tests/eve/timeline_ruler_gestures.test.mjs`.
- **TR-07** · P1 · W — Tempo changé (120 → 90) pendant l'arrêt puis Lecture → grille, métronome et clips MIDI suivent.
- **TR-08** · P1 · W — Signature 3/4 sur une mesure, marqueur nommé, section : la règle les montre ; déplacer une section
  déplace son contenu. *Origine* R-178 G33–G34.
- **TR-09** · P0 · W I — Scrub : tête glissée à l'arrêt → un grain de son par mouvement, la position reste au lâcher ;
  en lecture, la tête saute. *Origine* R-170.
- **TR-10** · P1 · W — Aperçu sous la tête : à l'arrêt, l'image de la vidéo sous la tête, sinon l'onde du son. *Origine* R-170.
- **TR-11** · P0 · W I — Une vidéo importée rejouée trois fois de suite garde son son à chaque lecture.
  *Origine* bug connu `media-video-audio-replay`.
- **TR-12** · P0 · W — Liste en mode Simultané ou Timeline : la vidéo s'affiche avec son son ; les pistes ne s'arrêtent
  pas après le premier clip. *Origine* bug connu `multitrack-preview-without-video`.

## C. Métronome

- **MET-01** · P0 · W I A — Métronome allumé, Lecture → clic au temps, accent au premier temps, calé (120 et 133 BPM).
  *Sonde* `tests/probes/molecule_audio_finalize.probe.mjs`.
- **MET-02** · P1 · W — Appui long sur Métronome → son panneau : Volume (60 % par défaut), Décompte 0–8 mesures,
  sortie (une piste ou une sortie physique). Changer la sortie → le clic sort là. *Origine* R-182 (1), M8.
- **MET-03** · P1 · W — Décompte 2 mesures puis prise : le clic seul pendant le décompte, la prise démarre au bon temps.

## D. Affichage de la Timeline

- **TL-01** · P0 · W I Ph — Les pistes font une case de la grille de l'écran, alignées sur les outils du rail ; Hauteur
  agrandit par outils entiers ; pincer verticalement sur les en-têtes change la hauteur. *Origine* R-170.
- **TL-02** · P1 · W Ph — Glisser vertical sur les en-têtes = défilement posé sur une piste entière ; glisser de côté =
  les touches dépliées (M S FX) glissent. *Origine* R-170.
- **TL-03** · P1 · W — Pincer horizontalement = zoom ; la tête reste suivie en lecture.
- **TL-04** · P1 · W — Aimant (outil de la règle, à droite) : allumé, un clip déplacé se cale sur la grille ; éteint, libre.
- **TL-05** · P0 · W — Une palette ouverte garde tout le rail ; jamais de bandeau vide ou décalé dans le rail, jamais
  d'outils superposés. *Origine* R-170 (trou du rail, `scroll_area.rs`).
- **TL-06** · P0 · W — Toujours exactement une piste vide en fin de section (on y dépose un clip → une nouvelle piste
  vide apparaît). *Sonde* `tests/probes/molecule_v2_structure.probe.mjs`.
- **TL-07** · P1 · W — Piste choisie : toute la rangée (en-tête + couloir) prend l'aspect sélectionné, sans bordure.
- **TL-08** · P1 · W I — Compositing : 3 vidéos + son + photo + formes + 2 textes empilés → chaque couche à sa place
  dans l'aperçu, dans l'ordre des pistes, rien d'étiré, pas de saccade. *Origine* R-170 points 8/11.
- **TL-09** · P1 · W — Séparateur aperçu / Timeline : glissé, il se pose sur des cases entières. *Origine* R-170.

## À compléter

- Piste de tempo à rampes (M8 de R-178) quand elle sera codée.
- Aucune sonde n'automatise encore TL-04, TL-01/02 (hauteur, défilement des en-têtes), ni le suivi de l'hôte (voir 09).
