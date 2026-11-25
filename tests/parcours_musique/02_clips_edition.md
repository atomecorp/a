# 02 — Clips : poser, éditer, annuler

Propriétaires : `eVe/domains/rendering/project_view_timeline_gestures.js`, `_clip_rail.js`, `_fade.js`, `_lasso.js` ;
noyau `eVe/intuition/tools/molecule/kernel/` (`reducers.js`, `collisions.js`, `clip_join.js`, `clip_fades.js`,
`clip_tone.js`, `stretch.js`, `block_loop.js`) ; historique `molecule/session/`.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Poser et importer

- **CL-01** · P0 · W I — Importer un son par le panneau d'import unique (règle 18) sur une piste → le clip apparaît à la
  tête, avec son onde, et joue. *Sonde* `tests/probes/media_fixture_import_playback_probe.probe.mjs`.
  *Mise à jour 2026-11-25 (R-249, 22 nov.)* : l'import ne pose plus « à la tête » : avec une piste choisie, le média va sur elle, après son contenu ; sans sélection, une nouvelle piste. Remplacer par CL-35.
- **CL-02** · P0 · W — Première visite Web : importer un son crée bien le clip et il n'est pas muet.
  *Origine* bug connu `web-import-first-visit-and-duration`.
- **CL-03** · P1 · W — Glisser un média depuis Médias sur une piste, sur la piste vide de fin, entre deux pistes → il se
  pose là où on le lâche. *Sonde* `tests/probes/molecule_ui_drop_*.mjs`.
  *Mise à jour 2026-11-25 (R-344, 24 nov.)* : un dépôt de plusieurs fichiers sur une piste les pose bout à bout ; ajouter le renvoi à CL-39 (le « là où on le lâche » reste vrai pour le premier).
- **CL-04** · P1 · W — Inclure dans une Molécule ajoute à la Molécule, ne l'enveloppe pas. *Origine* bug connu `include-wraps-target-molecule`.
- **CL-35** · P0 · W I — Timeline, une piste choisie (toucher son en-tête), importer un média par le panneau unique → il
  se pose sur CETTE piste, après ce qu'elle contient ; sans piste choisie → une nouvelle piste est créée (jamais une
  nouvelle section, jamais tout à 0 s). La sélection survit à un rechargement de la vue. *Origine* R-249
  (`molecule/runtime_creation.js#attach`, `project_view_timeline_content.js#publishSelection`).
- **CL-36** · P1 · W — Une piste accueille tous les types : poser un son, puis une vidéo, puis une image sur la même
  piste choisie → les trois clips y sont, à la suite. *Origine* R-249.
- **CL-37** · P0 · W I — Importer 3 fichiers d'un coup (3 claps) visés sur une cellule pleine → la cellule tenue reçoit
  le 1er, les suivants vont dans les cellules LIBRES suivantes (une cellule pleine est sautée, jamais vidée) ; jamais
  un dossier-projet ; rouvrir le panneau d'import une 2e fois marche. *Origine* R-344
  (`project_view_cells_import.js#createCellsPlacer`, `intoTimeline`).
- **CL-38** · P0 · W — Timeline : appui long sur la partie vide d'une piste → plaque « Importer » (la même que la
  cellule) ; choisir 3 médias → 3 clips posés bout à bout sur cette piste. *Origine* R-344
  (`project_view_timeline_lane_import.js`).
- **CL-39** · P0 · W — Déposer 2 fichiers (glisser du Finder) sur une piste de la Timeline → posés bout à bout à
  l'endroit visé ; déposés sur le projet en Timeline → une piste, bout à bout. Aucun média posé deux fois (pas de
  doublon à 0 s sur une piste à son nom). *Origine* R-344 (`project_view_timeline_file_drop.js#dropFilesOnTimeline`,
  `project_view_timeline_import_lay.js`).
- **CL-40** · P0 · W — Disposition : poser un dessin, une image, une vidéo et un son, PUIS passer en Multipiste (Timeline
  déjà existante) → chaque objet a sa piste, nommée comme lui (bout à bout en séquentiel, ensemble depuis 0 en
  simultané) ; rien ne manque, même au-delà de 200 objets. *Origine* R-297
  (`project_view_timeline_owner.js`).
- **CL-41** · P1 · W — Supprimer un clip venu d'un objet de Disposition, changer de vue et revenir → il ne revient pas
  (mémoire `timeline_laid_atome_ids`). *Origine* R-297.
- **CL-42** · P1 · W — Timeline / Cellules / Mixage, tête à 5 s : Créer › Texte, Dessin (tracé DANS l'aperçu), Forme,
  Placeholder, Générateur › aplat, Matrice › Nouv. → chaque création devient un clip à 5 s, visible dans l'aperçu ; le
  rail de l'outil armé (options du Dessin, du Texte…) est là. *Origine* R-310 (`project_view_timeline_owner.js#newObjectsPlan`,
  `runtime_creation.js#timelinePlayheadSeconds`, `surface_interceptor_layers.js`).
- **CL-43** · P1 · W — Vue multipiste : double toucher ou appui long dans le vide HORS de l'aperçu → rien (ni texte, ni
  Mystic) ; double toucher dans le vide de l'aperçu → un texte à la tête de lecture ; appui long dans le vide de
  l'aperçu → Mystic du projet. *Origine* R-310 (`mystic/context_target.js#isMysticOpeningBlocked`,
  `project_layer_routing.js#backgroundCreationAllowed`).
- **CL-44** · P1 · W — Créer › Page en multipiste → un clip de 2 s (page vide = image fixe) ; plusieurs Pages : la Page
  de la piste du dessus fait le cadre de l'aperçu (ce qui déborde est coupé) ; sans Page active, cadre = vue
  Disposition ; un fondu sur la timeline = fondu enchaîné du cadre. *Origine* R-310 (`project_view_visual_frame.js`).

## B. Déplacer, rogner, couper

- **CL-10** · P0 · W I — Glisser un clip → il suit le doigt et se pose ; contre un voisin il passe au-delà (placement
  libre), un bord s'arrête au voisin. *Sonde* `tests/eve/molecule_kernel_free_placement.test.mjs`, `tests/probes/molecule_ui_timeline_acceptance.mjs`.
- **CL-11** · P0 · W — Deux clips bord à bord : le second se déplace **sans** avoir été rogné d'abord.
  *Origine* bug connu `timeline-clip-moves-only-after-crop`.
- **CL-12** · P0 · W — Rétrécir un clip par sa fin le **rogne** (jamais une boucle). *Origine* bug connu `timeline-crop-becomes-loop`.
  *Mise à jour 2026-11-25 (R-364, 25 nov. ; R-348, 24 nov.)* : rogner dépend du mode Bord (Temps › Bord : Rogner / Boucle / Étirer) ; « rétrécir la fin = rogne » n'est vrai qu'en Rogner. En Boucle, tirer la fin répète le clip tout de suite.
- **CL-13** · P0 · W — Rogner le début, puis rallonger : la matière cachée revient (non destructif).
- **CL-14** · P0 · W — Couper à la tête (Avant / Après), puis Joindre → le clip redevient exactement l'original.
  *Sonde* `tests/probes/molecule_clip_join.probe.mjs`.
  *Mise à jour 2026-11-25 (R-348, 24 nov. ; R-364)* : Avant / Après / Joindre sont dans la case « Couper » du rail du clip (et Couper › Scinder) ; ils marchent aussi sur une partie bouclée.
- **CL-15** · P1 · W — Dupliquer, copier, coller à la tête, effacer. Chaque verbe = un seul pas d'annulation.
- **CL-16** · P1 · W — Boucler un clip (Bloc) : il se répète sur la durée tirée, chaque tour calé.
  *Mise à jour 2026-11-25 (R-364, 25 nov.)* : « Bloc » → Bord sur Boucle ; tirer la fin répète tout de suite le clip tel qu'il est (avant : il s'étendait d'abord jusqu'à la fin du média) ; l'extension appartient à Rogner.
- **CL-45** · P0 · W I — Rail d'un clip › Temps › Bord sur Rogner : tirer la fin vers la gauche puis la droite → le
  clip se rogne puis s'étend jusqu'à la fin du média, jamais plus loin ; l'aperçu tenu = le résultat au lâcher (l'onde
  n'est jamais écrasée). *Sonde* `tests/eve/timeline_clip_edges.test.mjs` · *Origine* R-364
  (`project_view_timeline_clip_edge.js`).
- **CL-46** · P0 · W — Bord sur Boucle : tirer la fin → le clip se répète tout de suite tel qu'il est (sans s'étendre
  d'abord à la fin du média) ; Bord sur Étirer : tirer la fin → le son est étiré, aussi sur un clip déjà bouclé.
  *Sonde* `tests/eve/timeline_clip_edges.test.mjs` · *Origine* R-364 (`block_loop.js`, `stretch.js` `anchor: 'end'`).
- **CL-47** · P0 · W — Enchaînement : étirer, boucler, étendre, reboucler le tout, Couper › Scinder le tout, reboucler
  le résultat → à chaque pas son = image, chaque morceau scindé d'une partie bouclée joue la bonne matière.
  *Sonde* `tests/eve/timeline_clip_edges.test.mjs` · *Origine* R-364 (`splitLoopedClip`, `audio_edit/runtime.js`).
- **CL-48** · P0 · W — Rogner un clip étiré (vitesse ≠ 1) → la fenêtre source reste calée (son et onde identiques),
  l'extension s'arrête à la fin du média. *Origine* R-364 (`reducers.js`, crop à la vitesse du clip).
- **CL-49** · P0 · W — Souris : clic sur un clip puis glisser rapide → le clip se déplace, jamais d'inspecteur plein écran
  (le clip ne « disparaît » pas). *Origine* R-364 (`bevy_ui_pointer_runtime.js`).
- **CL-50** · P0 · W — Saisir le bord d'un clip sur ses deux tiers hauts → c'est un rognage, pas un fondu ; seule la
  poignée demi-cercle fait le fondu. *Origine* R-364 (`project_view_timeline_fade.js`).
- **CL-51** · P1 · W — Rail d'un clip MIDI › Temps (Étirer / Boucle / Rogner) ; en Rogner, tirer la fin au-delà des
  notes → de la matière vide est créée. *Origine* R-360 (lié à R-364 ; `project_view_timeline_rail_groups.js`).
- **CL-52** · P1 · W — Rail d'un clip choisi rangé en cases : Couper (Couper, Avant, Après, Joindre) · Temps (Bord,
  Vitesse, Inverser, Enchaînement) · Son · Affichage · Sortie · Supprimer, les mêmes cases quel que soit le clip ;
  chaque outil d'une case fait ce qu'il faisait seul. *Origine* R-348 (`project_view_timeline_rail_groups.js`).
- **CL-53** · P1 · W — Temps › Inverser sur un clip audio → le clip joue à l'envers (copie inversée stockée), Annuler
  rend l'original. *Origine* R-178 F29 / R-348 (`project_view_timeline_clip_rail.js` `timeline_clip_reverse`).

## C. Son du clip

- **CL-20** · P0 · W — Fondu d'entrée et de sortie par la poignée demi-cercle → voile visible au-dessus des vignettes,
  rampe audible sans clic. *Origine* R-170 point 13.
  *Mise à jour 2026-11-25 (R-348, 24 nov.)* : les fondus ne s'appliquent plus aux clips MIDI (leur Son = Vélocité) ; la ligne vaut pour l'audio (et la vidéo) seulement.
- **CL-21** · P1 · W — Fondu enchaîné entre deux clips qui se recouvrent (deux courbes qui se croisent). *Origine* R-178 M7.
- **CL-22** · P1 · W — Gain du clip (+ / −) et Normal. (+6,0 dB sur un son à −6 dB crête). *Origine* R-178 F29.
  *Mise à jour 2026-11-25 (R-348)* : Gain / Normal. sont dans la case « Son » du rail du clip.
- **CL-23** · P1 · W — Vitesse du clip (la hauteur suit) ; Transition vidéo entre deux clips.
  *Mise à jour 2026-11-25 (R-348)* : Vitesse est dans la case « Temps » ; Transition = Enchaînement de Temps.
- **CL-24** · P1 · W — Son d'une vidéo : Isoler (piste à part) puis Délier ; le son reste calé sur l'image.
  *Mise à jour 2026-11-25 (R-348)* : Isoler / Délier sont dans la case « Affichage » d'un clip vidéo ; depuis R-315 une portion supprimée dans l'éditeur coupe aussi le son isolé (CL-65).
- **CL-54** · P0 · W I — Timeline SANS Scène, Édition allumée (rangée des vues) : toucher un clip → il s'ouvre dans
  l'éditeur des Cellules, sur sa propre étendue ; aucune Scène n'est créée ; « Retour » rend la Timeline. *Origine* R-313
  (`kernel/clip_span.js`, `project_view_timeline_cell_inspector.js#clipCellKey`).
- **CL-55** · P0 · W — Dans cet éditeur : choisir une portion puis Suppr. → la portion part et le reste se recolle ;
  Écoute joue l'étendue du clip ; Effets = ceux de la piste. *Origine* R-313, R-288.
- **CL-56** · P0 · W — Éditeur d'une cellule audio : pleine largeur, règle en bas ; appui tenu puis glisser (ou sur la
  règle) = portion choisie, calée sur la grille si l'Aimant est allumé ; la portion se voit (bande de la couleur active
  à 35 % sous l'onde, onde blanche dedans) ; l'onde non jouée reste visible pâle. *Origine* R-288
  (`project_view_cell_audio_view.js`, `project_view_cell_audio_editor.js`).
- **CL-57** · P0 · W — Portion choisie → le rail montre ses outils seuls (Couper, Copier, Coller, Insérer, Suppr.,
  Silence, Désilence) + Annuler ; Couper puis Coller ailleurs, Insérer (mesures vides ou collage), Silence puis
  Désilence (la partie revient : 2 morceaux → 1) ; un toucher simple lâche la portion. Chaque geste = un pas d'annulation.
  *Origine* R-288 (`cell.carve`, `cell.remove`, `cell.insert`, `cell.restore`).
- **CL-58** · P1 · W — Pincer dans l'éditeur → zoom de l'onde ; défilement au doigt. *Origine* R-288.
- **CL-59** · P1 · W — Plein écran de l'éditeur (double toucher) : le rail ne garde que Offset, Roll, Boucle, Aimant,
  Sélection, Effets, Son, Réglages, Annuler (plus de Lancer, Reprise, Répétition, Calage, Suite, Vider, MIDI) ; un simple
  toucher garde tout. *Origine* R-288 (`SOLO_EDIT_KEYS`).
- **CL-60** · P1 · W — Début / Fin d'une cellule dont le son remplit le cadre → poignées entières dans le cadre,
  glissables ; le clip ne bouge pas. *Origine* R-288, R-199 (`project_view_cell_sample_view.js#windowEdgeNodes`).
- **CL-61** · P0 · W — Boucle (commutateur en haut du rail) : ruban + deux poignées sur la règle (poignée = un bout,
  ruban = toute la boucle, sur l'Aimant) → lecture : du Début à la fin de la boucle, puis la boucle seule, calée.
  *Origine* R-288 (`loop_points`, `runtime_cells.js#launchCell`).
- **CL-62** · P1 · W — Roll (⇄) allumé : glisser l'onde → elle tourne comme un cylindre (aperçu en direct), le début
  d'origine marqué orange ; ramenée sur l'origine à 12 px près ; une seule annulation. *Origine* R-288 (`cell.roll`).
- **CL-63** · P1 · W — Offset (|→) allumé : glisser le son entier sur sa bande verte → il avance ou recule dans sa Scène
  (silence avant, ce qui dépasse n'est plus joué) ; Offset négatif permis ; une seule annulation. *Origine* R-288 (`cell.offset`).
- **CL-64** · P0 · W — Éditeur sur un clip VIDÉO (Cellules ou Timeline, Édition) : la pellicule dans le temps de la
  cellule ; Sélection, Boucle, Roll, Offset, Aimant, Début/Fin ; « Masquer »/« Montrer » au lieu de Silence/Désilence
  (la partie masquée est voilée) ; « Fx image » et « Fx son ». *Origine* R-315 (`EDITED_CLIP_KINDS`, `filmSlice`).
- **CL-65** · P0 · W — Vidéo au son séparé (Isoler) : Suppr. d'une portion dans l'éditeur coupe l'image ET le son, les
  morceaux restent liés et calés. *Origine* R-315 (`kernel/cell_sound_link.js`).
- **CL-66** · P1 · W — Éditeur sur un clip image ou texte : mêmes outils de temps, Effets = bande image, pas de palette
  « Son ». Hors édition, le rail d'un clip / d'une piste vidéo a « Fx image » et « Fx son ». *Origine* R-315
  (`project_view_timeline_effects_tool.js`).
- **CL-67** · P1 · W — Édition allumée, clip choisi › Sortie : MIDI → port + canal ; audio → sortie, bus ou autre
  piste ; vidéo → « Écran 2 » ; par défaut le clip suit sa piste, une sortie à lui la remplace (entendu sur la nouvelle
  destination). Une piste en Édition a aussi « Sortie ». *Origine* R-348 (`kernel/clip_output.js`,
  `clip_output_routing.js`, `project_view_timeline_output_rail.js`).
- **CL-68** · P1 · W — Clip MIDI : Son = Vélocité (pas de fondus) ; changer la vélocité du clip → les notes jouent plus
  fort / plus doux. *Origine* R-348 (`clip.velocity`, `runtime_midi.js`).

## D. Sélection et historique

- **CL-30** · P0 · W — Lasso (tenir puis glisser) sélectionne plusieurs clips ; toucher le vide désélectionne ; un
  glisser rapide fait défiler, ne sélectionne pas.
- **CL-31** · P0 · W I — Annuler / Rétablir après chacune des manipulations B et C → retour exact, un pas par geste ;
  une opération groupée s'annule en une fois. *Sonde* `tests/probes/molecule_session_history.probe.mjs`.
  *Mise à jour 2026-11-25 (R-317, 24 nov.)* : l'annulation n'était en fait qu'à un pas sur le Web ; elle est profonde désormais, Rétablir survit au rechargement, et l'appui long d'Annuler donne Rétablir puis Historique (CL-69 à CL-71).
- **CL-32** · P0 · W — Supprimer une Molécule par Suppr. passe par la Molécule (pas de membre orphelin).
  *Origine* bug connu `project-view-molecule-text-regressions`.
- **CL-33** · P1 · W — Clip texte : toucher = prompteur, double toucher = édition, appui long = menu Mystic.
- **CL-34** · P0 · W — Aucun objet fantôme (cadre de sélection autour de rien) après suppression, annulation, prise.
  *Origine* R-169.
- **CL-69** · P0 · W I — Faire 10 modifications puis toucher Annuler 10 fois de suite → 10 pas en arrière, chacun
  juste (plus bloqué à un seul pas), 40–300 ms par pas ; Rétablir les refait, et survit à un rechargement ; une
  nouvelle modification efface Rétablir. *Sonde* `tests/eve/timeline_undo_source.test.mjs` · *Origine* R-317
  (`browser_workspace.js#recordServerHistoryEvents`, `atome_timeline.js#applyJournalHistory`).
- **CL-70** · P0 · W — Annuler présent dans le rail de TOUTES les vues projet (Liste, Matrice, Timeline, Cellules,
  Console), y compris Réglages ouvert, palette du bas ouverte, tempo choisi, éditeur plein écran ; il annule vraiment.
  *Origine* R-288, R-358 (`project_view_surface_context_runtime.js#withUndo`).
- **CL-71** · P1 · W — Appui long sur Annuler → Rétablir puis Historique ; Historique ouvre la ligne d'étapes (« nom ·
  hh:mm ») ; glisser = aperçu en direct de l'étape ; relâcher sur une étape passée → elle revient comme une NOUVELLE
  étape (tout reste annulable), panneau refermé ; relâcher sur l'état actuel → rien. Portée objet (rail d'objet) ou
  projet (rail du fond). *Origine* R-317 (`core/atome_timeline_step.js`, `bevy_panel_history_runtime.js`,
  `project_view_undo_tool.js`).
- **CL-72** · P1 · W — Historique : ramener une étape où un objet supprimé existait, puis Annuler → l'objet disparaît de
  nouveau (pas d'erreur `history_source_transaction_not_invertible`). *Sonde* `tests/atome_vault/history_restore.rs` ·
  *Origine* R-317.

## E. Pistes : en-têtes, groupes, lot

- **PI-01** · P0 · W I — Toucher net l'en-tête d'une piste → seules SES touches M / S / Auto se déplient ; glisser sur
  l'en-tête = défiler. *Sonde* `tests/probes/molecule_timeline_activity.probe.mjs` · *Origine* R-199 (G1).
- **PI-02** · P0 · W — Glisser depuis une touche M vers le bas → Mute peint sur chaque piste traversée (leurs touches
  s'ouvrent) ; partir de S peint des Solo ; déraper sur l'autre touche ne change pas le type peint. *Origine* R-199
  (`project_view_timeline_mix_paint.js`).
- **PI-03** · P0 · W — Mute et Solo s'excluent : S touché sur une piste en Mute → Solo sans Mute ; M sur une piste en
  Solo → Mute sans Solo. *Origine* R-199.
- **PI-04** · P1 · W — Toucher un clip ou une piste → la piste se déplie sur place (ex. notes éditables), l'inspecteur
  reste caché par défaut. *Origine* R-199.
- **PI-05** · P0 · W — Ouvrir les en-têtes, déplier une piste, mettre un Solo, ouvrir une tranche / un effet / une jauge
  dans la Console ; changer de vue puis fermer et rouvrir le projet → tout revient (en-têtes et leur hauteur, piste
  dépliée, Solo, tranche, effet déplié, dernière jauge ouverte — une seule à la fois). *Origine* R-199
  (`project_view_timeline_view_store.js`, `project_view_mix_memory.js`).
- **PI-06** · P1 · W — Couleurs : tête de piste dans sa couleur d'origine pleine, clips voilés (55 %), onde et notes
  dans la couleur vive de la piste, couloir teinté (10 %). *Origine* R-199 (`trackClipAlpha`, `trackLaneTintAlpha`).
- **PI-07** · P1 · W — Vue Cellules / Scène, Réglages allumé : toucher une cellule la choisit sans la jouer ;
  l'inspecteur montre son sample (part jouée entre Début et Fin, « Où arrêté », pièce du Ratchet) ; en vue Scène, sous
  les tuiles, pleine largeur. Envel. (palette de la rangée, 4 curseurs A-D-S-R) → la courbe se règle sur l'onde,
  aucun panneau par-dessus. *Origine* R-199 (`project_view_cell_sample_view.js`, `project_view_cell_sample_edit.js`).
- **PI-08** · P1 · W — En-tête ouvert (appui long) : M, S, Auto à la taille de texte des panneaux (13 px) dans leurs
  cases, aucune touche plein écran ; piste ouverte et choisie = bande pleine sur toute la hauteur de sa ligne, le nom
  garde sa dalle sombre et sa barre de couleur ; double toucher sur la piste = agrandie en place. *Sonde*
  `tests/eve/timeline_track_header.test.mjs` · *Origine* R-303.
- **PI-09** · P0 · W — Édition allumée, toucher plusieurs en-têtes → lot de pistes ; le rail du lot (sans Niveau) :
  Volume (décalage relatif, 0/−6/−3 → −9/−15/−12), Effets ajouté sur toutes, M/S sur toutes, Suppr. de toutes →
  UNE annulation les rend. Timeline et Cellules. *Origine* R-311 (`project_view_timeline_track_lot.js`, `mix_lot_gain.js`,
  `project_view_cell_fx_lot.js`).
- **PI-10** · P1 · W — Console, Édition (rangée des vues) : lasso sur des tranches → rail Grouper / Effets / Suppr. ;
  effet ajouté et allumé sur tout le lot ; jauges VOL ouvertes ensemble, −3 dB pour toutes. *Origine* R-311
  (`molecule_mix_lot.js`).
- **PI-11** · P0 · W — En-têtes dépliés : un trait vertical sur les NOMS de pistes → ces pistes entrent dans le lot
  (un trait parti d'une piste du lot les retire) ; aussi sans Édition ; puis Suppr. au rail du lot → toutes supprimées,
  une annulation ; un glisser de côté fait toujours défiler ; la peinture des Mute reste intacte. *Origine* R-355
  (`project_view_timeline_header_stroke.js`).
- **PI-12** · P1 · W — Lot de pistes › Grouper → un en-tête de groupe avec triangle ▾ / ▸ ; un toucher plie (ligne du
  groupe = clips en réduit) ou déplie vers le bas ; liseré `combo_rail` ; le groupe est un groupe de la Console (bus
  `role: 'group'`). *Origine* R-330 (`project_view_timeline_track_groups.js`, `_track_group_lanes.js`).
- **PI-13** · P1 · W — Cellules, plusieurs cellules choisies › Grouper → une cellule-bloc (cellules en réduit, coin
  plié) ; un toucher lance toutes ses cellules ; glisser l'emporte, Alt = copie en nouveau bloc ; double toucher sous
  Édition = entrer (seules ses pistes et Scènes), « Retour » sur la rangée des vues ; blocs dans les blocs ; Dégrouper.
  *Origine* R-330 (`project_view_cells_groups.js`, `kernel/cell_groups.js`).
- **PI-14** · P1 · W — Supprimer une piste ou une Scène qui porte des membres d'une cellule-bloc → les membres sont
  retirés ; un bloc d'un seul membre est dissous. *Origine* R-330.
- **PI-15** · P1 · W — Cellules : une tuile de Scène tenue puis portée sur une cellule → la cellule contient cette Scène
  (sa face : le fond de la cellule vide, une barre par piste dans son temps, le coin plié) ; ce que la cellule tenait est
  vidé d'abord ; une seule entrée d'historique. Portée sur une cellule de sa propre colonne (ou d'une Scène qui la
  contient) → refusé, et la colonne des Scènes ne bouge pas ; lâchée dans la rangée des Scènes, la Scène se déplace comme
  avant. *Origine* R-369 maquette 1 (`project_view_scene_nest_gestures.js#sceneNestCellDrop`, `kernel/scene_nest.js`).
- **PI-16** · P1 · W — Timeline : une Scène tenue dans la règle puis portée sur une piste → un fantôme sur la piste, puis
  un clip de Scène à la place libre la plus proche du doigt, aussi long que la Scène. *Origine* R-369 maquette 2
  (`sceneNestLaneDraft`, `project_view_timeline_scenes.js`, `project_view_timeline_placed.js`).
- **PI-17** · P1 · W — Référence vivante : changer la Scène incluse change tous ses clips ; une Scène qui se contiendrait
  (directement ou par un détour) est refusée. Elle joue par la tranche de la piste qui l'accueille (son et MIDI).
  *Origine* R-369 Q2, Q3 (`runtime_nested_playback.js#sceneNestVoices`, `runtime_midi.js`).
- **PI-18** · P1 · W — Édition allumée, double toucher sur une cellule ou un clip de Scène → on entre dans la Scène incluse
  (seule elle se voit) ; « Retour » sur la rangée des vues ramène la vue d'avant. *Origine* R-369 maquette 3
  (`project_view_scene_nest.js#enterIncludedSceneView`, vue `cells_scene_path`).
- **PI-19** · P1 · W — Clip ou cellule de Scène choisi › « Indépendante » au rail → il cesse de suivre sa Scène : une copie
  de la Scène, nommée « Scène N », est posée après tout, et le clip la tient. Outils d'un clip de Scène : Couper, Bord
  sans étirement, Indépendante ; ni fondus ni gain. Voix / MCP `clip.scene.detach`. *Origine* R-369 Q2
  (`kernel/scene_nest_detach.js`, `SCENE_DETACH_KEY`).
- **PI-20** · P1 · W — Timeline, Édition allumée, deux clips libres choisis ou plus › « Grouper » → un clip-bloc sur la piste
  du premier clip, sur tout leur temps (coin plié) ; touché, il est choisi entier ; glissé, ses clips bougent ensemble
  sur leurs pistes (une opération) ; Alt = copie en nouveau bloc ; double toucher = entrer (seuls ses clips), « Retour » ;
  « Dégrouper » rend ses clips. Un bloc ne recouvre jamais un autre clip de la piste de son premier clip : « Grouper »
  n'est pas proposé, et porté, il s'arrête à la place libre la plus proche. Voix / MCP `clip.group`, `clip.ungroup`,
  `clip.group.move`. *Origine* R-369 maquette 4 (`project_view_timeline_clip_blocks.js`, `kernel/clip_groups.js`).

## F. Médias du projet

- **ME-01** · P1 · W — Timeline, Cellules ou Scène, hors édition, rien de choisi : « Médias » en haut du rail du fond ;
  touché → le rail ne montre que ses types (Audio, Vidéo, Images, MIDI…), Médias reste dans sa case ; plusieurs types
  allumés à la fois, un panneau par type (case, aperçu, nom, durée · nombre de clips). *Origine* R-357
  (`project_view_media_rail.js`, `bevy_panel_project_media_runtime.js`).
- **ME-02** · P1 · W — Panneau Médias › Ajout → le média rejoint le projet SANS poser de clip (même après réaffichage
  des vues). *Origine* R-357 (`project_media_assets.js`, `joinWithoutClip`).
- **ME-03** · P1 · W — Rempl. sur un média utilisé par 2 clips → les 2 clips gardent place et durée et jouent le
  nouveau média ; l'ancien est retiré. *Origine* R-357.
- **ME-04** · P1 · W — Cocher une ou plusieurs lignes › Suppr. → le média et ses clips partent ; Annuler les rend.
  *Origine* R-357.
- **ME-05** · P2 · W — Voix / MCP `eve.timeline.media.list|add|replace|delete` → mêmes effets que le panneau ; une piste
  choisie → pas de Médias au rail, panneau fermé. *Origine* R-357 (`timeline_media_actions.js`).

## À compléter

- ~~Inverser un clip audio (non codé, R-178 F29).~~ Faux le 2026-11-25 : Temps › Inverser existe (`timeline_clip_reverse`) → CL-53.
- Warp / étirement sans changer la hauteur : bloqué (moteur sous licence absent, R-178 F30) ; des outils Warp existent pourtant dans Temps pour un clip warpé (`WARP_ORDER`) : leur usage reste à décrire.

*Relevé du 2026-11-25 (demandes du 17 au 25 nov.), non codé ou partiel :*

- R-288 : Annuler dans les PANNEAUX eux-mêmes (pied de bande) — question ouverte, lesquels ; statut EN COURS.
- R-288 : un glisser de fader de la Console laisse 2 entrées d'historique (constaté, non traité dans R-288).
- R-288 / R-313 : écoute réelle sur l'iPhone / l'iPad non vérifiée ; le blocage de l'interface au toucher d'un clip
  (R-313, 2e message) non reproduit sur le Web, à confirmer sur l'appareil.
- R-344 : plantage du 2e panneau d'import sur iPhone/iPad non reproduit sur le Web ; aucun essai appareil.
- R-360 (lié R-364) : en Rogner, le bord de DÉBUT d'un clip tiré avant le début de sa source reste bloqué (pas de vide
  créé avant un clip MIDI).
- R-364 : non vérifié sur iPad (Web seulement).
- R-317 : une annulation juste après un glisser attend l'envoi de ses images au serveur (~4 s pour 60 images) ; essai
  appareil non fait.
- R-315 : non vérifié sur l'appareil.
- R-357 : Vidéo / Images / MIDI réels à la main, sélecteur d'import réel, Tauri, iPad non vérifiés.
- R-348 : écoute réelle sur une carte son et « Écran 2 » avec un vrai écran non vérifiés.
- R-310 : Code (éditeur), QR, Menu ne créent pas d'objet du projet ; les modèles (Éditorial…) s'appliquent à un texte
  touché, ne créent rien sur le vide (par conception, pas un manque).
- R-199 : un projet ancien qui avait écrit `inspector: true` le garde (limite assumée).
