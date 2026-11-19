# 04 — Cellules et Scènes

Propriétaires : `eVe/domains/rendering/project_view_timeline_cells*.js`, `project_view_timeline_cell_gestures.js`,
`project_view_cells_take_gestures.js`, `project_view_timeline_cell_inspector.js`, `project_view_timeline_scenes.js`,
`project_view_scene_view*.js` ; `molecule/runtime_cells.js`, `runtime_cell_recording.js` ; noyau `scenes.js`,
`scene_matrix.js`, `cell_content.js`, `cell_defaults.js` ; `eVe/core/media_engine/molecule_cell_player.js`.
Cahier : `todo/timeline/timeline_cellules_cahier_des_charges_v1.6.md`.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Lancer

- **CE-01** · P0 · W I A — Édition éteinte : toucher une cellule pleine → elle part au prochain point de quantification ;
  la retoucher → elle s'arrête. *Sonde* `tests/probes/molecule_cell_player.probe.mjs`.
- **CE-02** · P0 · W — Deux cellules de la même piste lancées l'une après l'autre jouent ensemble (B n'arrête pas A).
- **CE-03** · P0 · W — Passes : 2 passes = exactement deux, même doigt tenu ; 0 = infini. One-shot = une fois.
- **CE-04** · P1 · W — Momentary : joue tant qu'on tient, s'arrête au relâchement avec son fondu de fin.
- **CE-05** · P1 · W — Follow Action : à la fin, la cellule suivante part (et Record Action ne l'enregistre pas).
- **CE-06** · P1 · W — Attaque / Release en ms exactes (1 ms) : pas de clic.
- **CE-07** · P1 · W — Une même liaison MIDI sur trois cellules : un événement les lance toutes, chacune à sa quantification.

## B. Enregistrer dans une cellule (R-182)

- **CE-10** · P0 · W — Toucher une cellule vide (transport en marche) → elle enregistre, calée sur la quantification ;
  retoucher → la prise s'arrête à la frontière de fin et boucle proprement. *Sonde* `tests/probes/molecule_cell_recording.probe.mjs`, `tests/probes/music/cells_record_ui.probe.mjs`.
- **CE-11** · P0 · W — Transport arrêté : toucher une cellule vide → décompte, puis transport et prise ensemble.
- **CE-12** · P0 · W — Toucher une zone vide de la vue Cellules → une nouvelle cellule (nouvelle Scène) qui enregistre
  avec le dernier mode (Audio, Vidéo, MIDI) sur la Longueur de Réglages (défaut 1 mesure).
- **CE-13** · P1 · W — Appui long sur une zone vide : prise tant qu'on tient ; glisser sur « Verrou » la garde.
- **CE-14** · P1 · W — Longueurs : 1/16, 1/8, 1/4, 1/2, 1 temps, 1, 2, 3, 4, 8, 16 mesures, Libre ; double toucher =
  valeur tapée.
- **CE-15** · P0 · W — La prise d'une cellule existe une seule fois : la Timeline et la cellule montrent le même
  contenu (lien vivant, pas de copie). *Sonde* `tests/probes/molecule_scenes_cells.probe.mjs`.
- **CE-16** · P1 · W — Capture immédiate : ce qui précède la frontière est gardé dans la prise (récupérable en édition)
  mais pas rejoué.

## C. Édition, Réglages, inspecteur

- **CE-20** · P0 · W — Édition allumée : toucher sélectionne sans lancer ; lasso depuis le vide ; glisser déplace le
  contenu (Alt copie) ; glisser une colonne de Scène.
- **CE-21** · P1 · W — Réglages sans sélection = valeurs par défaut dans le rail ; avec sélection = réglages de la
  sélection, appliqués en lot à toutes les cellules choisies (un seul pas d'annulation).
- **CE-22** · P1 · W — Cellule vide choisie, Inspecteur allumé : sa règle vide à la Longueur ; la prise s'y dessine en direct.
- **CE-23** · P1 · W — Vider plusieurs cellules en lot.

## D. Scènes

- **SC-01** · P0 · W — Tracer une Scène dans la bande des Scènes (glisser tenu), la déplacer, la redimensionner, la
  renommer. *Sonde* `tests/eve/timeline_ruler_gestures.test.mjs`.
- **SC-02** · P1 · W — Lancer une Scène (cellule de la rangée de la règle) → toutes ses cellules partent ensemble.
- **SC-03** · P1 · W I — Vue Scène : tuiles d'une Scène sur la grille, Scènes en bas, outils Mixage / Pistes / Timeline ;
  même rangée Édition / Réglages qu'en Cellules.
- **SC-04** · P2 · W — Tranche « Master de Scène » dans la Console.

### Scènes dans la Timeline, geste par geste (16 nov. 2026)

*Sonde* (tous, clics et glisser réels sur le canevas) `tests/probes/music/scenes_ui.probe.mjs [largeur hauteur tag]`,
rapport et captures `temp/probe_reports/music/scenes_ui/<tag>/`. *Origine* demande du 16 nov. 2026 (R-188).

- **SC-10** · P0 · W I — Bande des Scènes (moitié haute de la règle), zone vide : appui tenu (~¼ s) puis glisser à
  droite → une Scène naît sous le doigt, de la largeur glissée (± un pas de grille), de toute la hauteur de la bande,
  nommée « Scène N ».
- **SC-11** · P0 · W — Une deuxième Scène tracée à côté : les deux se suivent, aucune ne couvre l'autre.
- **SC-12** · P0 · W — Tracer une Scène en partant d'un vide entre deux Scènes et en glissant par-dessus sa voisine →
  elle s'arrête au bord de la voisine (jamais de chevauchement).
- **SC-13** · P0 · W I — Glisser vite (sans tenir) sur la bande → l'axe défile, aucune Scène n'est créée ; glisser vite
  sur une Scène → défile aussi, ne la sélectionne pas.
- **SC-14** · P0 · W I — Poignée DROITE d'une Scène tirée à droite → la Scène s'allonge (sa fin bouge, son début non) ;
  tirée à gauche → elle raccourcit, jamais sous la longueur minimale, jamais au-delà de sa voisine.
- **SC-15** · P0 · W I — Poignée GAUCHE tirée → son début bouge, sa fin reste ; jamais avant la fin de la voisine.
- **SC-16** · P0 · W — Redimensionner, déplacer ou supprimer une Scène ne déplace ni ne modifie AUCUN clip (une Scène
  est une fenêtre sur la Timeline).
- **SC-17** · P0 · W I — Appui tenu sur une Scène puis glisser → elle se déplace, sa longueur gardée, calée sur la
  grille, arrêtée par ses voisines.
- **SC-18** · P0 · W I — Double clic (double toucher) sur une Scène → son nom devient le champ de texte, à sa place, tout
  sélectionné ; taper « Couplet », Entrée → renommée ; le champ disparaît, le nom est peint.
- **SC-19** · P1 · W — Renommer avec un nom vide (tout effacé, Entrée) → le nom d'avant est gardé.
- **SC-20** · P1 · W Ph — Nom très long sur une Scène étroite → le nom ne déborde jamais de sa Scène (coupé « … »).
  Et une Scène étroite reste atteignable entre ses deux poignées (au téléphone, une Scène tracée dans un petit vide
  peut faire 3,5 px : ses poignées la couvrent, on ne peut plus la renommer ni la toucher sans zoomer — constaté le 16 nov. 2026).
  Depuis le 17 nov. 2026 (toi : « Oui, code-le ») : une Scène tracée ou redimensionnée fait au moins une demi-case d'outil à
  l'écran ; une poignée tirée loin s'arrête là ; un vide trop étroit pour elle n'en trace aucune. Le nom trop long de la bande
  des Scènes finit par « … ». *Sonde* `scenes_ui` (téléphone 390×844 et iPad).
- **SC-21** · P0 · W — Le nouveau nom est le même dans la vue Cellules (case de la Scène dans la rangée de la règle).
- **SC-22** · P1 · W I — Mode Édition allumé : double toucher sur une Scène dans la vue Cellules → le champ de la Timeline à la
  place de son nom, renommée à l'Entrée ; en mode Jeu, aucun champ ne s'ouvre (le toucher lance). Un nom trop long pour sa case
  finit par « … ». *Sonde* `scenes_ui` (toi, 17 nov. 2026 : « Oui, code-le », maquette `temp/rename_mockup_2026-11-17/mockups/A_cellules.png`).
- **SC-23** · P0 · W I — Vue Scène : la Scène renommée montre son nouveau nom (tuiles et rangée des Scènes en bas).
- **SC-24** · P1 · W I — Renommer une Scène depuis la vue Scène elle-même (rangée des Scènes) → même champ, même
  résultat partout, en mode Édition. *Sonde* `scenes_ui` (maquette `B_vue_scene.png`).
- **SC-25** · P0 · W Ph — La bande des Scènes garde sa hauteur à travers tous les gestes et quand la fenêtre change de
  taille ; revenue à sa taille, la Timeline est exactement comme avant (règle 12 : les tailles ne changent jamais).
- **SC-26** · P0 · W — Réactivité : tracer, redimensionner, déplacer, renommer, supprimer → le résultat est peint en
  ≤ 400 ms après le relâchement (la sonde mesure et écrit chaque temps dans `timings`).
- **SC-27** · P0 · W I — Toucher une Scène la sélectionne ; le rail propose « Supprimer la Scène » ; touché → la Scène
  disparaît (région et cellules de sa colonne), les clips restent.
- **SC-28** · P0 · W — Annuler juste après une suppression, un tracé, un redimensionnement ou un renommage → l'état
  d'avant revient exactement ; Rétablir → refait. *Sonde* `scenes_ui` (suppression, par Cmd/Ctrl+Z et ⇧Cmd/Ctrl+Z).
  Défaut trouvé le 16 nov. 2026 : Cmd+Z et « Annul. » annulaient l'historique du projet (ex. le passage en vue Timeline),
  jamais les gestes de la Timeline. Corrigé le jour même (toi : « Oui, corrige-le ») : une vue de la Timeline devant
  (Timeline, Cellules, Scène, Console), Annuler et Rétablir agissent sur l'historique de sa Timeline ; ailleurs, sur
  celui du projet (`eVe/intuition/runtime/front_timeline_history.js`).
- **SC-29** · P0 · W I A — Fermer puis rouvrir le projet → Scènes, noms, débuts et longueurs identiques.
- **SC-30** · P0 · W — Aucune erreur de page pendant tout le parcours des Scènes.
- **SC-31** · P0 · W I — Durées vues dans les Cellules : après avoir allongé une Scène à droite puis à gauche dans la
  Timeline, la vue Cellules et l'Inspecteur de sa cellule suivent la nouvelle longueur (règle de l'Inspecteur = la
  Scène). *À la main*.
- **SC-32** · P1 · W — Zoom de l'axe (pincer / molette) puis tracer et redimensionner : la Scène suit le doigt au même
  endroit à tout zoom ; les poignées restent attrapables (jamais plus étroites que leur zone).
- **SC-33** · P1 · W — Lancer la transport sur une Scène renommée et déplacée : la lecture de la Scène joue sa nouvelle
  plage.
- **SC-34** · P1 · Ph — Téléphone (390×844) : SC-10 à SC-27 au doigt ; la poignée est attrapable, le champ du nom
  visible au-dessus du clavier. *Sonde* `node tests/probes/music/scenes_ui.probe.mjs 390 844 phone`.

## E. Tenue du design et fluidité (toute la création musicale)

- **DS-01** · P0 · W Ph — Chaque vue (Timeline, Cellules, Scène, Console) à 1180×820, 1440×900, 390×844 debout et
  844×390 couché : aucun élément hors de l'écran, aucun texte qui déborde de sa boîte, aucune boîte entre deux cases
  de la grille (règle 12) ; captures comparées au passage précédent.
- **DS-02** · P0 · W — Passer 20 fois d'une vue à l'autre (Timeline ↔ Cellules ↔ Scène ↔ Console) → rien ne grandit, ne
  rétrécit ni ne glisse ; la page répond toujours (`waitForResponsivePage` : retard < 50 ms, image < 100 ms).
- **DS-03** · P0 · W — Projet chargé (16 pistes, 200 clips, 12 Scènes) : défiler, zoomer, tracer une Scène restent
  fluides (aucune image > 100 ms pendant le geste).
- **DS-04** · P1 · W — Après 30 gestes sur les Scènes, les tailles des pistes, de la règle et du rail sont exactement
  celles du début.
- **DS-05** · P1 · W I — Mode sombre / clair, main gauche / droite : la bande des Scènes, les poignées et le champ du nom
  gardent leur place (miroir pour la main gauche).

## À compléter

- Sonde de SC-31 (Inspecteur), DS-03 (projet chargé), DS-05 (sombre/clair, main gauche) ; SC-28 pour le tracé, le redimensionnement et le renommage (la sonde ne couvre que la suppression).
- Pas de sonde UI pour Verrou, la vue Scène ni l'apprentissage MIDI d'une cellule.
- Cas ouverts du cahier (§5.8–5.9, §6.7–6.9) : à ajouter quand ils seront tranchés.
