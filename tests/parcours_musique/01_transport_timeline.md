# 01 — Transport, vues et Timeline

Propriétaires : `eVe/domains/rendering/project_view_timeline_*.js`, `project_view_transport_*.js`,
`project_view_views_row.js`, `project_view_multitrack_tool.js`, `project_view_mode_state.js` ;
`eVe/intuition/tools/molecule/runtime_transport.js`, `runtime_metronome.js`, `kernel/time_model.js`.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Vues du projet

- **VUE-01** · P0 · W I A Ph — Ouvrir un projet, toucher tour à tour Timeline, Cellules, Scènes, Console dans la
  rangée des vues → chaque vue s'affiche aussitôt, sans écran vide ni flash de l'accueil. *Sonde* `tests/probes/molecule_timeline_activity.probe.mjs`.
  *Mise à jour 2026-11-25 (23 nov. 2026, R-302 / R-294 / R-353)* : les vues ne se choisissent plus « dans la rangée des vues » mais par Vue dans la bande du bas (choix dans le rail) ; noms actuels Timeline, Cellules, Scène, Mixage (plus « Console »).
- **VUE-02** · P0 · W I — Choisir Console, quitter le projet, le rouvrir → il rouvre sur Console (le mode est gardé,
  une restauration en retard n'écrase jamais un choix récent). *Origine* mémoire « PROJECT_VIEW_MODE_CHANGED ».
- **VUE-03** · P0 · W I — Projet enregistré en disposition Cellules avec 0 scène → la Timeline repasse par le rail et
  montre ses pistes ; jamais une grille vide sans ligne. *Origine* R-177 (2).
- **VUE-04** · P1 · Ph — Téléphone : la rangée tient en une ligne Vue · Édition · Réglages · Enr. · Début · Lecture ;
  Vue se déplie au-dessus avec Timeline, Cellules, Scènes, Console, Aperçu, Inspecteur ; un choix replie. *Origine* R-182 (P1/P2).
  *Mise à jour 2026-11-25 (22–23 nov. 2026, R-270, R-284, R-293, R-294, R-302)* : la rangée du téléphone n'est plus « Vue · Édition · Réglages · Enr. · Début · Lecture » : Vue est dans la bande, Réglages dans le rail, Enr. dans la bande ; Aperçu et Inspecteur sont dans Affichage (rail) ; les palettes ne se déplient plus au-dessus de la rangée mais dans le rail.
- **VUE-05** · P1 · W — Aperçu : l'outil plie et déplie l'aperçu ; plié, la Timeline monte jusqu'en haut. Inspecteur :
  interrupteur ; allumé, il s'ouvre partagé avec la sélection. *Origine* R-182.
  *Mise à jour 2026-11-25 (23 nov. 2026, R-284)* : Aperçu et Inspecteur ne sont plus des outils à part : ce sont des choix de la palette Affichage du rail (Timeline, Cellules) ; le Mixage n'a plus d'Aperçu dans le rail. Remplacée par VUE-12.
- **VUE-06** · P1 · W — Côte à côte (Multipiste) puis retour ; retoucher la vue courante ramène à la vue naturelle.
  *Sonde* `tests/eve/project_view_multitrack_tool.test.mjs`.
  *Mise à jour 2026-11-25 (23 nov. 2026, R-284)* : Côte à côte (Multipiste) a été supprimé (`timeline_split` retiré) ; et retoucher la vue montrée ne ramène plus à la vue naturelle (elle reste choisie, `invokeMultitrackTool`).
- **VUE-07** · P0 · W — Mix / Timeline d'une Molécule choisie montrent cette Molécule, pas le projet entier.
  *Origine* bug connu `molecule-activity-shows-project`.
- **VUE-08** · P0 · W I A Ph — Dans un projet, toucher Vue dans la bande du bas → ses choix seuls dans le rail de droite :
  Liste, Matrice, Disposition, Timeline, Cellules, Scène, Mixage ; toucher tour à tour Timeline, Cellules, Scène, Mixage →
  chaque vue s'affiche aussitôt, sans écran vide, Vue reste dans la bande et le rail redevient celui de la vue.
  *Sonde* `tests/probes/music/views_stability.probe.mjs`. *Origine* R-302, R-294, R-353.
- **VUE-09** · P0 · W I — Depuis la Timeline, les Cellules ou le Mixage : Vue › Liste, puis Vue › Matrice, puis Vue ›
  Disposition → on quitte la vue multipiste à chaque fois ; Vue › Timeline y revient. Toucher la vue déjà montrée ne change
  rien (elle reste choisie). *Origine* R-296, R-302.
- **VUE-10** · P1 · W — Mystique › Utilitaires : l'outil Vue (à la place de l'ancien Niveau) propose les mêmes vues ; un
  choix change la vue ; aucun outil Niveau n'y est plus. *Origine* R-255, R-296.
- **VUE-11** · P2 · W — Palette Vue : l'icône de Cellules (cases de clips et barre de Scène) n'est pas celle de Matrice.
  *Origine* R-309.
- **VUE-12** · P1 · W I Ph — Timeline ou Cellules sans rien de choisi : le rail porte Affichage ; touché, le rail ne montre
  plus qu'Affichage et ses choix : Plein écran, Aperçu, Grille (seulement Aperçu allumé), Inspecteur (absent quand une
  cellule est éditée seule) ; chaque choix bascule (Aperçu plie / déplie l'aperçu, Grille pose ses lignes sur l'aperçu et y
  aimante les objets déplacés). *Origine* R-270 (lot 1), R-284 (A, E), R-302 (grille de l'aperçu).
- **VUE-13** · P0 · W I — Inspecteur allumé, choisir un clip dans la Timeline, passer aux Cellules → le rail n'est plus
  celui du clip ; le clip, la région, la Scène, la boucle, le tempo choisis et l'Inspecteur plein écran sont lâchés.
  Retour à la Timeline : rien n'est resté choisi. *Origine* R-294 (1).

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
  *Mise à jour 2026-11-25 (25 nov. 2026, R-361)* : dans la Timeline, toucher Lecture en lecture fait une Pause (la tête reste) ; le Stop avec retour est l'appui long. « Stop → tout s'arrête net » vaut encore pour le son, mais la manipulation est à réécrire. Idem **TR-04** (« Lecture puis Stop très vite » : c'est désormais Lecture puis Pause).
- **TR-02** · P0 · W I — Lecture jusqu'au bout → la lecture **s'arrête à la fin du dernier clip** ; la Lecture suivante
  repart du début (jamais une lecture muette sans fin qui fait sortir les clips de l'écran). *Origine* R-177 (choix A),
  bug connu `timeline-transport-stops-at-content-end` (à relire : la règle a changé le 15 nov.).
- **TR-03** · P0 · W I — Début : la tête revient à 0, l'aperçu montre l'image / l'onde à 0.
  *Mise à jour 2026-11-25 (24 nov. 2026, R-318, AGENTS.md r.13)* : vrai dans la Timeline et le Mixage seulement ; dans les Cellules, Début montre la première Scène et la choisit (la tête ne « revient à 0 » pas).
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
- **TR-13** · P0 · W T I A — Timeline : toucher Lecture (rangée des vues, au bout, avant Replier) → lecture, Lecture
  allumée montre Pause (⏸, « Pause ») ; toucher → pause, la tête reste où elle est ; toucher encore → la lecture reprend au
  même endroit. *Origine* R-361, R-284.
- **TR-14** · P0 · W I — Timeline (et Mixage) en lecture : tenir Lecture → Stop, la tête revient là où cette lecture avait
  commencé (à 0,0 s près), rien ne repart au lâcher. Un toucher bref reste la Pause. *Origine* R-361 (« clic long = stop »).
- **TR-15** · P0 · W I A — Cellules : toucher Lecture → les Scènes s'enchaînent depuis celle choisie (sinon la première) ;
  pendant que des cellules jouent, Lecture montre Stop (■) ; toucher → tout s'arrête. Des cellules qui jouent, vues depuis la
  Timeline ou le Mixage : Lecture y est aussi leur Stop, jamais une seconde lecture par-dessus. *Origine* R-284 (reste 1),
  R-361.
- **TR-16** · P1 · W I — Cellules : tenir Lecture (ou appuyer puis glisser) → Suite, Scène, Boucle, Toutes ; relâcher sur un
  choix le joue tout de suite ; un toucher sur Lecture dépliée la replie sans jouer. *Origine* R-284, R-308.
- **TR-17** · P0 · W — Lancer la lecture hors de la rangée (Espace, un message MIDI lié, la Lecture du projet) → la Lecture
  de la rangée s'allume aussitôt et montre Pause ; sa Pause arrête bien cette lecture. *Origine* R-361 (cause réparée).
- **TR-18** · P1 · W I — Timeline : appuyer sur Début puis glisser → une bande s'ouvre sur la rangée des vues, de la case
  après Prises jusqu'à Début (Édition retirée tant qu'elle est ouverte), entourée du contour lavande avec Début ; le glisser
  déplace la tête de lecture à l'échelle de la Timeline (traits qui suivent le doigt), la bande reste ouverte au lâcher, on
  peut reglisser (0 → 2,25 → 3,75 → 2,6 s) ; un toucher sur la bande, sur Début ou ailleurs la referme sans saut de la tête.
  Bande fermée, un toucher sur Début ramène à 0. *Origine* R-361 (option 1).
- **TR-19** · P0 · W I — Mixage : Lecture lance la lecture (son entendu, niveaux des bords des tranches qui bougent),
  montre Pause pendant la lecture, la met en pause ; Début ramène la tête à 0 (saut en lecture, gardé à l'arrêt) ; une
  lecture lancée dans la Timeline s'arrête depuis le Mixage et inversement. *Origine* R-309, R-284 (4).
- **TR-20** · P1 · W — Mixage avec des Scènes : Scènes (case de Prises) déplie la liste des Scènes ; un choix la choisit
  seulement (allumée), sans jouer ; Lecture joue ensuite depuis elle. Sans Scène, la case reste vide. *Origine* R-284 (4).
- **TR-21** · P0 · W T — Clavier, dans la Timeline, les Cellules et le Mixage : Espace lit puis arrête, R arme puis désarme
  Enr., ← et Origine ramènent au début (2 s → 0) ; aucune touche n'agit pendant une saisie de texte ni avec Cmd, Ctrl ou
  Alt ; taper sur le fond puis Espace ou R ne crée jamais de texte. *Origine* R-354.
- **TR-22** · P1 · W T I — Pilotage allumé (rail), toucher Lecture, Début ou Enr. → panneau « Pilotage · Lecture » (etc.) ;
  Apprendre puis jouer une note MIDI → cette note lance et arrête la lecture (resp. le retour au début, l'enregistrement).
  *Origine* R-354.
- **TR-23** · P1 · W — Une touche liée à Lecture par Pilotage (ex. P) → P lit, et Espace ne lit plus ; Pilotage tenu ›
  Rétablir → Espace, R et ← reviennent. *Origine* R-354.
- **TR-24** · P0 · W I Ph — Vue Liste : toucher le film d'une ligne → elle joue, un second toucher l'arrête ; toucher la
  rangée du niveau (« Concert ») joue tout le niveau. Vue Matrice : toucher une tuile la joue, un second toucher l'arrête.
  Aucune Lecture dans le rail de ces vues ; la zone de gauche d'une ligne sélectionne. *Origine* R-273.

## C. Métronome

- **MET-01** · P0 · W I A — Métronome allumé, Lecture → clic au temps, accent au premier temps, calé (120 et 133 BPM).
  *Sonde* `tests/probes/molecule_audio_finalize.probe.mjs`.
- **MET-02** · P1 · W — Appui long sur Métronome → son panneau : Volume (60 % par défaut), Décompte 0–8 mesures,
  sortie (une piste ou une sortie physique). Changer la sortie → le clic sort là. *Origine* R-182 (1), M8.
  *Mise à jour 2026-11-25 (23 nov. 2026, R-293)* : le Métronome est dans Réglages (rail) ; son panneau (appui long) porte Volume, Décompte, Son du clic et la sortie — « Son du clic » manque à la ligne ; le Décompte des Cellules a aussi son outil propre dans Réglages (panneau expliqué).
- **MET-03** · P1 · W — Décompte 2 mesures puis prise : le clic seul pendant le décompte, la prise démarre au bon temps.
- **MET-04** · P1 · W I A — Réglages (rail) ouvert : toucher Métronome → allumé / éteint (son glyphe allumé), le clic suit
  à la Lecture ; tenir Métronome → son panneau posé contre l'outil, sans ✕ : Volume, Décompte, Son du clic, et la sortie
  (sortie principale, une piste, un bus, une paire de la carte son). *Origine* R-293, R-354 (panneau d'un appui long posé
  contre son outil).
- **MET-05** · P1 · W I — Cellules, Réglages › Décompte → un panneau qui nomme le réglage et l'explique en quelques mots ;
  la valeur (en temps, « Aucun » par défaut) se lit ensuite dans la case de l'outil. *Origine* R-293, R-271.

## D. Affichage de la Timeline

- **TL-01** · P0 · W I Ph — Les pistes font une case de la grille de l'écran, alignées sur les outils du rail ; Hauteur
  agrandit par outils entiers ; pincer verticalement sur les en-têtes change la hauteur. *Origine* R-170.
- **TL-02** · P1 · W Ph — Glisser vertical sur les en-têtes = défilement posé sur une piste entière ; glisser de côté =
  les touches dépliées (M S FX) glissent. *Origine* R-170.
- **TL-03** · P1 · W — Pincer horizontalement = zoom ; la tête reste suivie en lecture.
- **TL-04** · P1 · W — Aimant (outil de la règle, à droite) : allumé, un clip déplacé se cale sur la grille ; éteint, libre.
  *Mise à jour 2026-11-25 (21–23 nov. 2026, R-253, R-293, R-284)* : l'Aimant n'est plus « l'outil de la règle, à droite » : c'est un rouleau compact de Réglages (rail) ; la case à droite de la règle tient le Tempo.
- **TL-05** · P0 · W — Une palette ouverte garde tout le rail ; jamais de bandeau vide ou décalé dans le rail, jamais
  d'outils superposés. *Origine* R-170 (trou du rail, `scroll_area.rs`).
- **TL-06** · P0 · W — Toujours exactement une piste vide en fin de section (on y dépose un clip → une nouvelle piste
  vide apparaît). *Sonde* `tests/probes/molecule_v2_structure.probe.mjs`.
- **TL-07** · P1 · W — Piste choisie : toute la rangée (en-tête + couloir) prend l'aspect sélectionné, sans bordure.
- **TL-08** · P1 · W I — Compositing : 3 vidéos + son + photo + formes + 2 textes empilés → chaque couche à sa place
  dans l'aperçu, dans l'ordre des pistes, rien d'étiré, pas de saccade. *Origine* R-170 points 8/11.
- **TL-09** · P1 · W — Séparateur aperçu / Timeline : glissé, il se pose sur des cases entières. *Origine* R-170.
- **TL-10** · P1 · W I Ph — La case sous la colonne des pistes, à droite de la règle, montre le tempo ; touchée → le premier
  changement de tempo est choisi, le rail ne porte plus que Tempo et Rampe (il se déplie s'il était replié) ; touchée encore
  → relâché, le rail revient. *Origine* R-284 (reprise : Tempo dans le trou à droite de la règle).
- **TL-11** · P1 · W I — Piste choisie (Timeline, Cellules, Mixage) : la case « Niveau » est au-dessus de Replier, repliée
  par défaut (une case, son nom) ; touchée → trois cases, deux barres gauche / droite de l'entrée de la piste, lue sans être
  entendue ni enregistrée ; repliée → plus lue. *Origine* R-360 (et R-285).
- **TL-12** · P1 · W — Réglages › Signature sans Scène choisie : le rouleau compact règle la signature du morceau ; la règle
  la montre. *Origine* R-293 (`signatureRollerDefinition`).

## E. Bande du bas, rangée des vues et rail contextuel

- **RL-01** · P0 · W I A Ph — Projet ouvert, dans chaque vue : la bande du bas est l'assistante (coin), Enr., Créer,
  Activité, Vue, puis Projets dans le coin opposé ; ni Commu., ni Calendrier, ni Lecture, ni Trouver, ni Utilisateur, ni Aide.
  *Origine* R-302, R-255, R-284 (reprise).
- **RL-02** · P0 · W I Ph — Toucher Enr., Créer ou Vue → l'outil reste choisi dans sa case et ses choix se posent seuls dans
  le rail de droite, jamais sur les objets ni au-dessus de la bande ; un choix, un second toucher ou une autre palette rend le
  rail. *Origine* R-294 (2), R-308.
- **RL-03** · P0 · W I — Appuyer sur Enr. puis glisser vers le haut → l'éventail se déplie sous le doigt ; relâcher sur Photo
  prend la photo tout de suite ; relâcher sur rien replie, rien de choisi. Même geste : Créer → Texte, Affichage → Inspecteur,
  Prises → Vidéo. *Origine* R-308, R-274.
- **RL-04** · P0 · W I — Ouvrir les Cellules (ou la Timeline, le Mixage, la Liste), revenir en Disposition, toucher Vue,
  Enr., Créer → leurs choix arrivent bien dans le rail à chaque fois (jamais un outil qui s'allume sans rien montrer).
  *Origine* R-341 (régression iPad).
- **RL-05** · P0 · I — Machine chargée (iPad pendant un dessin) : un toucher bref sur un outil du bas est pris comme un
  toucher, jamais perdu comme un appui long. *Origine* R-341.
- **RL-06** · P0 · W I Ph — Rangée des vues (au-dessus de la bande) : passer Timeline → Cellules → Mixage → chaque outil
  garde sa case : depuis le côté de l'assistante deux cases vides, Prises (Scènes en Mixage) juste au-dessus d'Enr., puis au
  bout Édition (case vide en Mixage sans lot), Début, Lecture, puis Replier ; un outil absent laisse son trou, jamais un
  décalage. *Sonde* `tests/probes/music/views_stability.probe.mjs`. *Origine* R-309, R-275, R-270 (lot 2).
- **RL-07** · P1 · W I — Toucher Prises → ses choix (les médias à prendre, Reprendre) dans le rail ; appuyer puis glisser →
  les mêmes choix dans les cases au-dessus de Prises le temps du geste, relâcher sur un choix le prend. Prises est absent
  (son trou reste) quand une cellule est éditée seule. *Origine* R-270, R-275, R-308.
- **RL-08** · P1 · W I — Timeline : toucher Édition (rangée) → allumée, son glyphe respire ; Couper, Ciseau, Joindre, Lasso
  en tête du rail ; Édition reste visible pour l'éteindre ; même case que l'Édition des Cellules. *Origine* R-275 (L2, L5),
  R-253.
- **RL-09** · P0 · W I Ph — Timeline, Cellules ou Mixage : toucher Replier (case de base du rail) → seul Déplier reste, la
  vue prend toute la largeur ; changer de vue, toucher des objets → le rail reste replié ; Déplier le rouvre. Ouvert par
  défaut. En Disposition, pas de Replier. *Origine* R-273, R-302.
- **RL-10** · P1 · W I — Ouvrir une palette (Vue, Affichage, Prises) → un seul contour lavande d'1 px épouse l'outil et ses
  choix, fond un peu plus clair, sans séparateur entre l'outil et ses choix ; replié, le contour disparaît. *Origine* R-274.
- **RL-11** · P1 · W — Panneau ouvert depuis un outil (Métronome tenu, Réglages › Longueur) : posé contre l'outil, sans ✕ ;
  le toucher de l'outil le referme ; tiré par sa bande de pied → il se détache (chacun son contour, le panneau prend un ✕) et
  se pose sur des cases entières ; ramené lentement à moins d'une case → il se raccroche ; l'outil fermé ou disparu ferme le
  panneau, détaché ou non. Téléphone : le panneau reste en travers du pied, sans contour. *Origine* R-274.
- **RL-12** · P0 · W I Ph — Timeline, Cellules et Mixage : Réglages est dans le rail, au plus près de sa base (Pilotage
  juste au-dessus) ; touché → allumé, le rail ne porte plus que ses outils, depuis la base : Entrée (piste ou cellule
  choisie), Sortie (piste MIDI), Métronome, Décompte (Cellules), Longueur, Aimant, Signature, Avancé, Cellule (Cellules) ; la
  rangée des vues ne bouge pas. Retouché → le rail revient. *Origine* R-293, R-253.
- **RL-13** · P1 · W I — Réglages › Longueur, Avancé, Cellule › Calage / MIDI / Prises → chacun ouvre un panneau qui nomme ce
  qu'il règle et l'explique ; Avancé porte Calibrer ; Calage porte Départ, Fin, Groupe. *Origine* R-293.
- **RL-14** · P1 · W I Ph — Réglages › Aimant : une case avec sa valeur ; touchée → elle grandit d'une case vers le haut (les
  autres remontent), glissée elle tourne, une valeur choisie la replie et l'aimant suit (¼, ½ temps… Libre). Signature
  pareil. *Origine* R-293, R-253 (Aimant en barillet).
- **RL-15** · P1 · W — Tout slider (rail, panneaux, console) : la valeur est dans sa case à part, demi-outil de haut, de la
  largeur de sa jauge ; double toucher → saisie au clavier. *Origine* R-293.
- **RL-16** · P1 · W T I — Pilotage allumé (rail, Timeline, Cellules, Mixage), toucher une cellule, une Scène, un en-tête de
  piste ou une tranche → panneau « Pilotage · <objet> » au lieu de son toucher : Apprendre (prend le premier venu, message
  MIDI ou touche), Type sur un rouleau (Note, CC, Prog.), Canal, Numéro, Touche (double toucher = écoute), Suppr. (enlève les
  deux) ; une cellule ou une Scène liée se lance, une piste ou une tranche liée pilote son Volume. *Origine* R-293, R-354.
- **RL-17** · P1 · W — Tenir Pilotage → la liste de tout ce qui est piloté (objet, MIDI, touche) ; une ligne touchée ouvre
  son panneau à sa place ; Rétablir au pied rend les touches par défaut. *Origine* R-354.
- **RL-18** · P0 · W I Ph — Annuler est toujours dans le rail d'un projet, juste au-dessus de Replier : piste choisie, lot,
  clip, Édition, Réglages ouvert, palette Vue ouverte, tempo choisi, éditeur plein écran, Cellules, Mixage ; un toucher annule
  (ex. un renommage), avant tout toucher de palette. *Origine* R-358.
- **RL-19** · P1 · W I — Thème « Nuit » : le verre du rail tire vers le bleu pastel, celui de la rangée des vues vers la
  pêche, la bande fixe inchangée. Thème « Ambre » : fonds inchangés, noms et glyphes du rail en turquoise doux, ceux de la
  rangée en bleu pastel, la bande dans l'orange. *Origine* R-359.
- **RL-20** · P1 · W I — Piste ou clip MIDI choisi : tout rouleau du rail (Quantif., Gamme, Canal, Vue du clip, Bord…) est
  replié en une case ; touché → il s'ouvre ; plusieurs ouverts à la fois ; une valeur choisie ou un second toucher le replie.
  *Origine* R-360.
- **RL-21** · P1 · W I — Clip MIDI choisi, éditeur fermé : 9 cases — Couper, Temps, Son, Affichage, Sortie, Supprimer, puis
  Pilotage, Réglages, Annuler ; éditeur de notes ouvert : Notes, Hauteur, Rythme, Dynamique, Instrument, Affichage, puis la
  base ; aucun outil d'avant perdu. Temps (Étirer, Boucle, Rogner) ; en Rogner, tirer le bord de fin au-delà crée de la
  matière. *Origine* R-360. (À recouper avec le fichier 07.)
- **RL-22** · P1 · W — Mixage sans rien de choisi : ni Aperçu, ni Plein écran, ni Média, ni Cumul dans le rail ; seulement
  Réglages, Pilotage, Annuler, Replier. *Origine* R-275, R-284 (5).
- **RL-23** · P1 · W I Ph — Cellules : toucher le « + » du coin (sous les pistes, à droite des Scènes) → il s'allume, le rail
  ne porte que « Nv. piste » et « Nv. scène » (déplié s'il était replié) ; un choix crée la piste ou la Scène en un pas
  d'annulation, amenée dans la vue, et rend le rail ; un second toucher rend le rail sans rien créer. Pas de « + » quand une
  cellule est éditée seule. *Origine* R-270.
- **RL-24** · P2 · W Ph — Un slider ouvert sans trois cases libres à sa droite s'ouvre en colonne. *Origine* R-275.

## À compléter

- Piste de tempo à rampes (M8 de R-178) quand elle sera codée.
- Aucune sonde n'automatise encore TL-04, TL-01/02 (hauteur, défilement des en-têtes), ni le suivi de l'hôte (voir 09).

*Relevé du 2026-11-25 (demandes du 17 au 25 nov.), non codé ou partiel :*

- R-361 : les Cellules n'ont pas de Pause (le moteur n'a pas de pause de Scène) : Stop seulement, voulu. Appui long du
  Mixage (Stop + retour) non sondé. Bande de Début glissé : Timeline seulement — ni dans le Mixage (son Début n'a pas de
  `palette_slide_open`) ni dans les Cellules (Début y montre la première Scène). Non vérifié sur iPad ni en « Ambre ».
- R-360 : en Rogner, le bord de début d'un clip MIDI ne peut pas être tiré avant le début de la source (à rouvrir si un vide
  avant le clip est voulu).
- R-354 : non vérifié à la main dans les Cellules et le Mixage, ni sur Tauri, ni sur iPad avec clavier ; proposés mais non
  codés : → = Scène suivante, Entrée = Stop et retour au début.
- R-293 : écarts assumés — Entrée seulement avec une piste ou une cellule choisie ; la valeur d'un slider se tape dans le
  panneau de saisie existant ; une cellule liée se lance à l'appui (pas au relâcher). Le code ajoute « Sortie » (piste MIDI,
  `timeline_track_midi_output`) dans Réglages, que la règle 13 d'AGENTS.md ne nomme pas (texte à compléter).
- R-284 reste (3) : contextes piste, Scène et boucle du rail jamais capturés à l'écran.
- R-270 : essai iPad jamais fait.
- R-275 : palettes de la rangée dessinées légèrement grisées (236 au lieu de 255) — confié au propriétaire du renderer ;
  aucune preuve de correction dans l'entrée (à revérifier ; R-270 dit le contenu remis sur sa couche « contenu »).
- R-255 : jamais vérifié à l'écran (Chromium non lancé) ; sa bande (capture, create, find, communicate, calendar) est
  remplacée par R-302 et R-264.
- R-308 : Enr. › Photo par glissé non prouvé avec une vraie caméra (« Not supported » en headless) ; appareil non essayé.
- R-302 : aucun outil de rotation dans le rail (Géométrie = Taille, Plan, Matrice) — note de l'entrée, sans suite.
- R-273 : Lecture d'une multi-sélection depuis le rail retirée (accepté) ; « Lecture dans la bande après Enr. » remplacé par
  R-284 / R-302 (Lecture sur la rangée des vues, plus dans la bande).
- R-296 : l'outil « Multipiste » qui rouvrait la vue multipiste telle qu'on l'avait quittée n'existe plus : Vue propose
  Timeline, Cellules, Scène, Mixage séparément (`handleViewModeTouch` force la disposition choisie) ; la Vue de la rangée
  des vues a disparu (R-302).
- R-253 : « sélecteur des vues dans le rail au-dessus de Lecture » remplacé (R-270 puis R-302) ; « Gestes seulement avec un
  objet choisi dans l'aperçu » remplacé par Geste dans la palette Enr. (R-295 USR-02, R-302) ; Aimant en barillet devenu
  rouleau compact (R-293).
- R-270 : « Réglages sur la rangée » et « sélecteur des vues contre Lecture » remplacés par R-293 et R-302 (trous gardés).
- R-284 C : Tempo entre Début et Lecture remplacé par la case à droite de la règle (même entrée, reprise de 15 h).
