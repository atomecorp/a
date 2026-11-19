# Séquenceur professionnel : déroulé complet
## 15 novembre 2026, registre R-178

**Demande (toi, 15 nov.) :** ajouter MIDI à la capture (menu rec. latéral, enregistreur) ; un éditeur MIDI complet en piano roll à trois modes (batterie, piano roll, pas à pas ; batterie seule si le pas à pas n'en vaut pas la peine) ; sélection simple et multiple, déplacement en groupe ; vélocité ; automation commune (audio, vidéo, effets, avec la console) ; pour la boîte à rythme, les ratchets ; la liste de tout ce qu'il faut pour un séquenceur pro, puis une maquette à la fois, à valider.
**Base :** `sequenceur_vues_clips_2026-10-29.md` (Q1–Q18, M1–M13 validés et codés le 29 oct.) et `timeline_cellules_cahier_des_charges_v1.6.md`.
**Méthode :** maquettes une par une sur la vraie Timeline (`temp/sequencer_pro_2026-11-15/`), puis toutes les questions, puis tout le code en une passe.

Légende : ✅ existe (vérifié dans le code le 15 nov.) · 🟡 existe en partie · ⬜ manque · ⛔ bloqué (dépendance externe). Marques mises à jour à la fin de la passe de code du 15 nov. (détail : « État après la passe de code » en fin de fichier).

## A. Prendre du MIDI

1. ✅ **MIDI dans la capture.** `ui.capture.midi` existe dans rec. (rail du projet) et dans Capture du Dashboard. Manque : poser MIDI sur une piste comme audio et vidéo (une zone d'enregistrement MIDI armée par la tête). Aujourd'hui seuls audio et vidéo portent un `drop_payload` (`main_menu_capture_content.js`) et le noyau ne connaît que ces deux zones.
2. ✅ **Prise MIDI dans la Timeline** : décompte (1 ou 2 mesures), enregistrement en boucle (une prise par tour, avec les couloirs de prises qui existent pour l'audio), overdub (fusion dans le clip), remplacement, punch in/out.
3. ✅ **Quantification à l'entrée** (option) et capture rétrospective : ce qui a été joué sans Rec reste récupérable.
4. ✅ Choix de l'entrée (appui long sur MIDI), étiquette du périphérique, sortie d'origine.

## B. Éditeur de notes : piano roll

5. ✅ **Gestes de base** (existent) : appui sur le vide = une note, glisser = sa longueur, appui sur une note = la déplacer, sur son bord = sa longueur, toucher = la supprimer.
6. ✅ **Clavier** au bord de la piste, côté des en-têtes ; seuls les Do nommés ; toucher une touche fait entendre la note.
7. ✅ **Défilement vertical** de toute la tessiture (0–127), pincement vertical pour la hauteur des rangées (par demi-outil).
8. ✅ **Sélection** : toucher, Lasso, ajouter à la sélection, tout sélectionner, toutes les notes d'une hauteur (appui long sur une touche du clavier).
9. ✅ **Groupe** : déplacer, allonger, raccourcir ensemble ; copier, coller à la tête de lecture, dupliquer à la suite, supprimer.
10. ✅ **Transposer** (demi-ton, octave), inverser, rétrograde.
11. ✅ **Quantifier** la sélection (1/4 à 1/32, triolets), force de quantification (%), swing ; humaniser.
12. ✅ **Gamme** : n'afficher ou n'autoriser que les notes d'une gamme (option).
13. ✅ **Notes liées / legato**, découper une note, coller deux notes.

## C. Force (vélocité) et contrôleurs

14. ✅ **Couloir Force** sous les notes : une barre par note, glisser pour la régler, tracer une courbe sur plusieurs.
15. ✅ **Couloirs de contrôleurs MIDI** : CC (modulation, expression, sustain…), pitch bend, aftertouch, avec les gestes de l'automation.
16. ✅ Probabilité et variation par note (une note joue à N %) : Proba. dans le rail des notes choisies, tirée à chaque lecture et au Figer (`midi_note_probability.js`).

## D. Batterie et pas à pas

17. ✅ **Grille de batterie** (M2/M12) : rangées, longueur propre à chaque rangée (polyrythme), Boucle / 1 coup, Force, Roulé (ratchet), ligne de contrôleur.
18. ✅ **Nom et son des rangées** : choisir l'instrument d'une rangée (kit, échantillon du sampler), entendre la rangée au toucher.
19. ✅ **Ratchet complet** : nombre, courbe de force du roulé (montant, descendant), décalage (« nudge »), swing par rangée.
20. ✅ **Pas à pas mélodique** (le 3e mode) : la grille de batterie dont chaque pas porte aussi une hauteur, une longueur (gate) et une liaison ; tranché : il partage la brique de la grille, ce n'est pas un 3e éditeur.
21. ✅ **Motifs** : plusieurs motifs par clip (A, B, C…), chaînés ; remplissages (« fill »).

## E. Automation (audio, vidéo, atomes, console)

22. 🟡 **Modèle et lecture** : couloirs par paramètre, points, courbes linéaire / palier / douce, rampes calculées par le moteur audio, touche FX de l'en-tête, Rec (écrire en jouant), Lier (surface de contrôle). Reste : le WASM audio Web à reconstruire pour entendre les courbes sur le Web.
23. ✅ **Modes d'écriture** : Lecture, Toucher (écrit tant qu'on tient), Verrou (garde la dernière valeur), Écriture.
24. ✅ **Automation vidéo** : opacité, position, taille, rotation, couleur, effets vidéo, et le volume du son de la vidéo, avec les mêmes couloirs.
25. ✅ **Édition de courbe** : lasso de points, déplacer en groupe, mise à l'échelle, formes dessinées (rampe, sinus, carré), copier-coller de courbes.
26. ✅ **Console liée** : un module touché dans la console montre son couloir dans la Timeline et inversement.

## F. Pistes audio et vidéo

27. ✅ Couper, rogner, boucler un clip (Bloc), comping par prises, fondus (noyau), son de la vidéo isolé ou lié.
28. ✅ **Fondus visibles et réglables** sur le clip (poignées aux coins), fondu enchaîné entre deux clips.
29. ✅ **Gain du clip**, inverser, normaliser.
30. ✅ **Étirement temporel et hauteur** (warp) : suivre le tempo, changer la hauteur sans la durée. Codé le 18 nov. 2026 : `kernel/warp.js` (`molecule.clip.warp`), moteur `mix-graph/src/warp_voice.rs`, rail `project_view_timeline_warp.js` (M10), étirement Signalsmith porté en Rust (`atome-instrument/src/stretch/`), donc Web compris.
31. ✅ **Transitions vidéo** entre deux clips, titres, vitesse du clip (ralenti, accéléré).

## G. Transport, tempo, structure

32. ✅ Tempo, métronome, boucle de transport, aimant : existent.
33. ✅ **Piste de tempo** (tempo qui change) et **signature** (3/4, 7/8…) par mesure.
34. ✅ **Marqueurs** et sections nommées (couplet, refrain), déplacer une section entière.
35. ✅ **Zoom horizontal** au pincement et suivi de la tête de lecture.

## H. Commun, export, sécurité

36. ✅ Une commande `ui.timeline.*` / MCP par geste, annulable en une fois (S6).
37. ✅ **Exporter** un clip ou la piste en .mid ; rendre une piste MIDI en audio (figer).
38. ✅ **Instruments** : une piste MIDI joue un instrument d'eVe (sampler, synthé) ou une sortie MIDI ; montrer lequel.

## Ce que tu n'avais pas cité (proposé)

Couloir Force et contrôleurs, prise en boucle et overdub, quantification et swing, gamme, motifs et remplissages, piste de tempo et signature, marqueurs et sections, warp, transitions vidéo, export .mid et figer, choix de l'instrument de la piste.

## Maquettes

| N° | Sujet | État |
| --- | --- | --- |
| M1 | Piano roll : clavier, défilement, lasso, sélection multiple, outils du rail (Vue, Lasso, Quantif., Transp., Copier, Coller, Dupl., Suppr., Force) | **VALIDÉE** (toi, 15 nov.), avec le déroulé ; `temp/sequencer_pro_2026-11-15/mockups/m1_piano_selection.png` |
| M2 | Couloir Force (sélection en rampe) ; M2b couloirs empilés Force + Modul. | **VALIDÉES** (toi, 15 nov.) ; `mockups/m2_force.png`, `mockups/m2b_controllers.png` |
| M2c | Outils d'un couloir sélectionné (rail : Couloirs, Lasso, Crayon, Courbe, Valeur, Copier, Coller, Suppr., Masquer) | **VALIDÉE** (toi, 15 nov.) ; `mockups/m2c_lane_tools.png` |
| M2d | Panneau Couloirs : Effets de la tranche + MIDI (Force, Modul., Pitch, Sustain, Expr., CC n°) | **VALIDÉE** (toi, 15 nov.) ; `mockups/m2d_lanes_panel.png` |
| M3 | MIDI dans la capture : MIDI dans la palette Rec., zone d'enregistrement MIDI posée sur une piste (m3) ; prise en boucle, décompte, Fusion / Remplacer, quantification à l'entrée (m3b) | **VALIDÉE** (toi, 15 nov.), Enr. corrigé : dans la rangée sous la Timeline de R-182, plus dans le rail ; `mockups/m3_midi_capture.png`, `mockups/m3b_midi_take_loop.png` |
| M4 | Batterie : pastilles nom/son des rangées, outils de rangée (Pas, Mode, Swing, Son) et panneau Son (m4) ; ratchet complet, outils des pas (m4b) | m4b refusée (toi, 15 nov. : sélectionner un pas puis changer sa valeur est trop compliqué) ; remplacée par m4c (peindre) **VALIDÉE** (toi, 15 nov., « c'est ce que je voulais, beaucoup plus simple ») ; m4 (pastilles, Son) **VALIDÉE** (toi, 15 nov., « Oui je valide ») ; `mockups/m4_drum_rows.png`, `mockups/m4c_paint.png` |
| M5 | Pas à pas mélodique (Vue = Pas), même brique et mêmes pinceaux que la batterie | **VALIDÉE** (toi, 15 nov.) ; `mockups/m5_melodic_steps.png` |
| M6 | Automation vidéo (couloirs Opacité, Taille… sous le clip) + outil Mode (Lecture / Toucher / Verrou / Écriture) | **VALIDÉE** (toi, 15 nov.) ; `mockups/m6_video_automation.png` |
| M7 | Fondus visibles avec poignée, transition entre deux clips, outils Gain, Vitesse, Transition | **VALIDÉE** (toi, 15 nov.) avec la transition **C** (« le plus visible, le plus habituel ») ; croix d'abord refusée (« trop laid, ça fait barré ») ; 3 variantes : A barre lavande en haut, B pastille sur la jointure, C deux courbes fines ; montrées sur l'audio (Voix) et la vidéo à la demande (toi, 15 nov.) ; dans les trois, la zone mélange vraiment les deux images ou les deux ondes et le fondu est un dégradé doux avec une courbe fine ; `mockups/m7_transition_choices.png` (+ `m7a/b/c_transition.png`) |
| M9 | Motifs A/B/C et remplissages : lettre en haut de chaque mesure du clip, outil Motif, Nouveau, Rempl. | **VALIDÉE** (toi, 15 nov.) ; `mockups/m9_motifs.png` |
| M10 | Warp d'un clip audio : Suivre (le tempo), Repères (lignes fines sur les attaques, glisser = caler sur le temps), Hauteur, Caler, Effacer | **VALIDÉE** (toi, 15 nov.) ; `mockups/m10_warp.png` |
| M11 | Instrument d'une piste MIDI : outil Instrument, panneau eVe (Sampler, Synthé, Batterie) / Sortie MIDI / Canal ; Exporter (.mid) et Figer dans le même rail | **VALIDÉE** (toi, 15 nov.) ; `mockups/m11_instrument.png` |
| M8 | Couloirs Structure (sections) et Tempo au-dessus de la règle, marqueur et signature sur la règle, outils de la structure | **VALIDÉE** (toi, 15 nov.) ; `mockups/m8_structure_tempo.png` |

## M2 (validé le 15 nov.)

- Force allumée (rail) déplie le couloir Force sous les notes, contre la règle : une tige par note, son disque est la poignée.
- Glisser un disque règle une note ; glisser en travers des notes sélectionnées trace une rampe (trait lavande) qui les règle toutes.
- Appui long sur Force : son panneau liste les couloirs (Force, Modul., Pitch, Sustain, Expr., Aftert.) avec la case à gauche ; chaque couloir coché s'empile au-dessus du précédent, trois demi-outils de haut.
- Un couloir de contrôleur se dessine et s'édite comme l'automation (mêmes points, mêmes courbes linéaire / palier / douce, même brique).

## M2c / M2d (validées le 15 nov. ; demandées : « où rajouter un point, manipuler un point, tirer une ligne, sélectionner, afficher, supprimer, masquer, ajouter un CC ou un effet »)

- Toucher le nom d'un couloir le sélectionne (aspect sélectionné) ; le rail prend ses outils.
- Ajouter un point : toucher le vide du couloir. Déplacer : appui sur un point puis glisser. Choisir : toucher un point (il grossit, plus clair). Retirer : Suppr. (le toucher seul ne supprime plus, pour ne pas perdre un point par erreur ; écart à A3 du 29 oct.).
- Lasso allumé : un cadre choisit plusieurs points ; glissés ensemble ; Copier / Coller à la tête de lecture.
- Crayon allumé : glisser dessine (main levée) ; appui long puis glisser tire une ligne droite.
- Courbe (rouleau Linéaire / Palier / Douce) : la forme du segment qui suit chaque point choisi. Valeur : le curseur d'outil, touché deux fois pour taper.
- Masquer : replie le couloir sans rien effacer (il revient coché dans Couloirs).
- Couloirs : panneau standard, deux accordéons ouverts vers le haut : Effets (les modules de la tranche de la piste, un réglage par ligne : Volume, Pan, Écho · Retour…) et MIDI (Force, Modul., Pitch, Sustain, Expr., CC avec son numéro). Cocher affiche, décocher masque. Supprimer un couloir (et ses points) : appui long sur sa ligne → Suppr. dans la bande du pied.

## M3 (validée le 15 nov.)

- Enr. est celui de la rangée sous la Timeline (R-182, validée : vues, Aperçu, Inspecteur … Enr. · Début · Lecture), PAS le rail : erreur de ma 1re maquette, corrigée le 15 nov. Touché, Enr. déplie Audio · Vidéo · MIDI dans les cases libres à sa gauche (teinte Création) ; il montre le dernier mode. Toucher MIDI enregistre à la tête de lecture sur la piste choisie ; MIDI glissé hors de la palette sur une piste y arme une zone d'enregistrement MIDI (quatre mesures par défaut, calée par l'aimant), comme audio et vidéo aujourd'hui. Posé sur la piste vide, il crée une piste MIDI.
- La zone armée a le rouge d'enregistrement actuel ; ses bords se tirent (punch in / out = la zone elle-même).
- Zone sélectionnée, le rail prend ses outils : Prises (N ×, existe : enregistrement en boucle, une prise par tour), Décompte (rouleau 0 / 1 / 2 mesures), Mode (rouleau Fusion = les tours s'ajoutent dans le même clip / Remplacer = une prise par tour, dans les couloirs de prises), Quantif. (rouleau Non / 1/8 / 1/16 / 1/32, à l'entrée), Entrée (le périphérique MIDI, son panneau existant).
- Pendant la prise : les notes jouées s'inscrivent dans la zone au fur et à mesure ; la mesure du décompte se teinte sur la règle avant la zone ; Enr. du ruban s'allume en rouge d'enregistrement (exception de la règle 15).
- Rétrospectif (A3) : ce qui a été joué sans Rec reste récupérable (outil à placer en M3 si tu le veux).

## M4 (m4 validée le 15 nov. ; m4b remplacée par m4c, validée)

- Chaque rangée de la grille a une pastille côté en-têtes (un outil de large, la hauteur de la rangée) : le nom de son son (Kick, Caisse, Charl., Ch. ouv.). Toucher la pastille fait entendre le son et sélectionne la rangée. Écart au 29 oct. (« rangées sans nom ») : c'est ta demande du 15 nov. (« nom et son des rangées »).
- Rangée sélectionnée, le rail : Pas (curseur, existe), Mode (Boucle / 1 coup, existe), Swing (curseur, nouveau, par rangée), Son.
- Son (ou un appui long sur la pastille) ouvre le panneau Son : carte Kit (les sons du kit, toucher = entendre et choisir, ✓ sur le choisi ; « Média… » ouvre le panneau d'import unique, règle 18, pour un échantillon) ; carte Réglages (Hauteur, Volume, Durée en curseurs d'outil) ; pied « Kick » + ✕.
- Ratchet complet (m4b, zoom 200 %, rangées d'un outil) : un pas roulé est coupé en N ; la hauteur de chaque coup suit la Courbe (Montant, Descendant, Plat) ; Décalage déplace le pas hors grille (le Kick décalé sur la maquette).
- Pas choisis au Lasso, le rail : Lasso, Roulé (N ×), Courbe (rouleau), Décalage (ms), Force, Proba. (le pas joue N % des fois), Copier, Suppr. Toucher un pas l'allume ou l'éteint (existe).
- **Retour (toi, 15 nov.) sur m4b :** trop compliqué (choisir un pas, puis changer sa valeur). Voulu : un outil (Roulé, Force, Volume, Filtre… toutes les options) qu'on active, on fixe sa valeur, puis on se balade sur la piste pour la propager aux pas. → m4c : rail Roulé (allumé, 3 ×), Force, Volume, Filtre, Décalage, Proba. ; la valeur se règle sur le curseur de l'outil, un toucher l'allume (le pinceau) ; le doigt glissé sur une rangée pose la valeur sur chaque pas qu'il traverse ; un toucher sur un pas la pose sur ce seul pas.

## M5 (validée le 15 nov.)

- Vue = Pas (le rouleau de l'outil Vue : Piano / Batterie / Pas) : une rangée de pas sur la piste MIDI ; chaque pas montre sa note en haut et sa longueur (gate) en barre ; deux pas liés forment une seule note.
- Mêmes pinceaux que M4c : Note (Sol4, allumée), Longueur (50 %), Liaison (interrupteur), Force, Roulé, Proba. ; la valeur sur le curseur de l'outil, le doigt glissé pose la valeur sur les pas traversés (4 pas peints en Sol4 sur la maquette) ; Pas = la longueur de la rangée.

## M6 (validée le 15 nov.)

- Une piste vidéo a les mêmes couloirs que l'audio et le MIDI (M2b–M2d), avec les mêmes outils : dans Couloirs, une carte Vidéo (Opacité, Position, Taille, Rotation, Couleur, effets vidéo) et une carte Son (Volume, Pan du son de la vidéo).
- Nouvel outil Mode dans le rail d'un couloir (rouleau) : Lecture (lit la courbe), Toucher (écrit tant qu'on tient Valeur pendant la lecture), Verrou (garde la dernière valeur), Écriture (écrit tout le passage).

## M7 (validée le 15 nov., transition C : deux courbes fines qui se croisent, la zone mélange les deux images ou les deux ondes, poignée au milieu en haut ; fondus en dégradé doux avec courbe fine)

- Un clip sélectionné montre ses fondus dessinés sur lui (rampe sombre), chacun avec une poignée au coin du haut : glisser la poignée règle la durée (les curseurs Fondu ent. / sort. existent déjà dans le rail).
- Deux clips qui se touchent : glisser la poignée de leur jointure crée une transition (fondu enchaîné pour la vidéo et le son) ; sa forme dans l'outil Transition (rouleau : Aucune, Fondu, Noir, Glissé).
- Rail d'un clip : Couper, Fondus, Isoler, Suppr. (existent) + Gain (curseur, dB), Vitesse (curseur, %, ralenti/accéléré), Transition.

## M8 (validée le 15 nov.)

- Au plus près du doigt, juste au-dessus de la règle : le couloir Structure (un demi-outil : les sections Intro, Couplet, Refrain, Pont, nommées en haut) et le couloir Tempo (un outil : la courbe du tempo, même brique que l'automation ; rampe de 120 à 128 sur la maquette).
- Sur la règle : un marqueur (un point nommé, « Solo ») ; un changement de signature écrit à côté du numéro de sa mesure (3/4 à la mesure 6).
- Une section touchée est sélectionnée ; le rail : Section (ajouter à la tête), Marqueur (ajouter à la tête), Tempo (curseur), Signature (rouleau 4/4, 3/4, 6/8, 7/8…), Nom, Dupl. (la section et tous ses clips à la suite), Copier, Suppr. Appui long + glisser une section déplace toute la section avec ses clips.

## Dernières questions avant le code (posées le 15 nov.) — RÉPONSES : toutes mes recommandations retenues (toi, 15 nov., « Oui, tout recommandé »)

1. Périmètre : les points du déroulé sans maquette (gamme ; découper, coller, legato ; inverser, rétrograde ; humaniser ; motifs A/B/C et remplissages ; warp ; zoom au pincement et suivi de la tête ; console liée ; export .mid et figer ; instrument de la piste) : dans cette passe (maquettes d'abord pour les seuls qui ont un nouveau look : motifs, warp, instrument) ou plus tard ?
2. Piano roll : toucher une note la supprime aujourd'hui ; l'aligner sur M2c (toucher = choisir, Suppr. efface) ?
3. Capture rétrospective : un choix « Reprendre » dans Enr. déplié, ou pas maintenant ?
4. Prise MIDI en boucle : Mode par défaut Fusion (MIDI) et Remplacer (audio, comme aujourd'hui) ?
5. Pinceaux (M4c, M5) : peindre sur un pas éteint ne change que les pas allumés (Force, Roulé…), sauf Note en mode Pas qui allume le pas ?

Réponses retenues : (1) tout le déroulé dans cette passe ; maquettes d'abord pour motifs (M9), warp (M10), instrument (M11) ; les autres en outils standard du rail. (2) toucher une note = la choisir, Suppr. efface. (3) « Reprendre » dans Enr. déplié. (4) Fusion par défaut en MIDI, Remplacer en audio. (5) les pinceaux ne changent que les pas allumés, sauf Note en mode Pas qui allume le pas.

## État après la passe de code (15 nov. 2026, « Valider, coder tout »)

Codé et prouvé par sondes (`temp/sequencer_pro_2026-11-15/probes/`, navigateur réel `sequencer_ui.probe.mjs` 11/11, `clip_normalize.probe.mjs`) : A1–A4, B5–B13, C14–C15, D17–D21, E26, F27–F28, G32, G34–G35, H36 ; en partie E22–E25, F29, F31, G33, H37–H38.

Deuxième passe (16 nov. 2026, « Yes, continue ») : tout le reste est codé et prouvé par sondes, sauf le warp.
- 16 : Proba. (1–100 %) dans le rail des notes choisies du piano roll ; gardée sur l'atome MIDI (`note_probability`, le fichier SMF reste la vérité), tirée à chaque lecture (`runtime_midi.js`) et au Figer. Sonde `note_probability.probe.mjs`.
- 23 : Écriture écrit tout le passage joué tant que Rec est allumé, la valeur vivante sinon la dernière écrite sinon la courbe (`project_view_timeline_fx_settings.js#armWrite`). Sonde `write_mode.probe.mjs`.
- 24 : un module vidéo Transformer (Pos. X, Pos. Y, Taille, Rotation ; `mix_modules.js`, + de la console au pied avec Opacité) ; la carte Couloirs d'un clip vidéo l'offre toujours (cochée, elle l'ajoute) ; chaque paramètre automatisé d'un effet vidéo ou d'un Transformer suit sa courbe pendant la lecture (`runtime_clip_tone.js#trackVideoKeys` → `molecule_video_program.js` `overrides` → `molecule_mix_video.js#projectMoleculeMixVideoRecord`), sans recaler le décodeur. Le volume et le pan du son de la vidéo passaient déjà par la bande audio. Sondes `video_automation.probe.mjs`, navigateur `transform_ui.probe.mjs`.
- 25 : couloirs d'effets : Lasso, Échelle, Forme (Rampe, Sinus, Carré, un cycle par temps), Copier, Coller (à la tête), Suppr. ; un point touché est choisi (plus effacé), un point porté entraîne les points choisis. Échelle et Forme aussi dans les couloirs MIDI (`kernel/curve_shapes.js`). Sonde `curve_tools.probe.mjs`.
- 29 : Inverser (clip audio) : la fenêtre du clip rendue à l'envers, rangée dans les médias (source gardée), le clip pointé dessus par l'opération noyau `clip.source`. Navigateur `clip_reverse.probe.mjs`.
- 31 : Titre (clip vidéo) : un texte écrit sur le tiers bas de l'image, son clip aussi long que la vidéo, sur sa propre piste juste au-dessus (dessinée par-dessus), par le créateur canonique du texte. Sonde `video_title.probe.mjs`.
- 33 : couloir Tempo (M8) au-dessus de la règle dès que le tempo change ; toucher pose un changement à la mesure, porter le déplace, toucher un point le choisit : Tempo, Rampe, Suppr. au rail ; rampes calculées par le modèle de temps (`time_model.js#tempoBpmAt`), le métronome suit. Sonde `tempo_ramp.probe.mjs`.
- 37, 38 : Instrument offre les instruments d'eVe (Mes instruments) ; la piste MIDI les joue par le rack (`midi_instrument_route.js`) ; Figer joue le clip dans l'instrument, garde la prise en WAV et la pose sur la piste libre en coupant la piste MIDI, en un lot (moteur Web seulement). Sonde `midi_instrument.probe.mjs`.
- M4 : panneau Son en deux cartes (accordéons vers le haut) : Kit (le son choisi sélectionné avec son ✓, Média…) et Réglages (Hauteur, Volume, Durée) ; brique de liste `chosenMark`. Sonde `sound_panel.probe.mjs`.

Reste :
- 30 ✅ warp (18 nov. 2026) : zplane abandonné (pas de réponse), Signalsmith validé puis porté en Rust par l'utilisateur. Preuves : sonde kernel `temp/warp_2026-11-18/warp_kernel.probe.mjs` (8/8), tests moteur `warp_voice_tests.rs` (5/5), banc Rust ↔ C++ `temp/warp_2026-11-18/compare` (×1 à 128 dB ; étiré : même dérive que le C++ contre lui-même), 181 tests atome-instrument + mix-graph. Reste : la build audio-wasm partagée (file de l'orchestrateur) pour l'entendre sur le Web.
- 22 : le WASM audio Web reste à reconstruire pour entendre les courbes d'effets audio sur le Web (inchangé depuis le 15 nov.).
- Limites connues : une valeur vidéo automatisée relaie le programme de l'Aperçu à chaque image (à mesurer en ticks Bevy sur appareil) ; la probabilité d'une note est rangée par début et hauteur ; le départ d'un instrument interne attend son audition (léger décalage au premier coup) ; Figer : moteur Web seulement.
