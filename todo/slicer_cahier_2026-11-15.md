# Découpe et lecture de tranches (« Slicer ») — proposition du 15 nov. 2026

Statut : **M1–M5, Q1 et Q2 validés le 15 nov.** (« Je valide tout ») ; noyau codé (§8 points 2–5) ; écrans en cours
(disposition A choisie le 15 nov., registre R-181).
Complète le cahier du Sampler `todo/sampler_cahier_des_charges_2026-10-29.md` §6 (découpage, validé et codé le 29 oct.).

## 1. Ce que dit déjà le cahier, et ce qui est codé

| Demande (toi, 15 nov.) | Cahier | Code (vérifié le 15 nov.) |
| --- | --- | --- |
| Découper au seuil (attaques) | §6.1-2 : sensibilité + écart minimal, points en direct | `audio_fx.slice_detect` (`eVe/domains/sample_edit/slice_points.js`) |
| Diviser en N, en mesures | §6.1-1 : N parties ou grille (mesure, temps, 1/8…) | `audio_fx.slice_divide` (`parts`, `step`, rediviser une tranche) |
| À la main | §6.1-3 : poser, déplacer, supprimer, verrouiller | `slice_point_add/move/remove/lock` |
| Warp | §6.1 : point déplacé en Couper ou Warp, aimant Libre/Temps/1/8/1/16 | `slice_point_move mode warp` (`warp_map.js`, rendu en cache) |
| Réordonner, volume, sens | §6.2 : déplacer, gain, inverser (édition non destructive) | `edit_from_slices` + `edit_apply piece_move / gain / reverse` |
| Chaque tranche → cellule jouable | §6.3 : « cellule de la Timeline (une slice par cellule) » | `audio_fx.slices_to_cells` (`slice_cells.js`) : une Scène par tranche, un clip dont la fenêtre de source = la région ; le toucher d'une cellule lance sa Scène (`runtime_cells.js`) ; capture réelle §5 |
| Tranche → Timeline | §6.3 : clip MIDI qui rejoue les tranches, cellules | `slices_to_midi`, et les cellules sont la Timeline (une cellule = sa Scène sur sa piste) |
| **Lecture aléatoire** | absent (seulement round-robin d'une zone) | absent |
| **Hauteur par tranche** | absent (hauteur d'une sélection d'édition seulement) | `zone tune` existe par zone du Sampler (après `slices_to_keys`) |
| **Ratchet par tranche** | absent ici ; « Roulé » existe dans la grille de batterie | `eVe/domains/midi/step_pattern.js` (Force, Roulé, Pan, longueur par rangée) |
| **Warp de jeu (déformer)** | partiel : Warp = calage d'un point | absent pour la lecture |

Écran : l'écran « Découp. » du 29 oct. vit dans la chaîne d'un instrument du Dashboard
(`dashboard_instrument_slices.js`) ; **rien dans la vue d'un clip audio d'un projet**. C'est la place que proposent M1–M4.

## 2. Le concept (en quelques lignes)

Le Slicer n'est pas un module de plus : c'est **une vue du clip audio**, comme le piano roll est une vue du clip MIDI.
L'outil **Vue** du rail fait passer le clip en plein écran de **Onde → Découpe → Motif**. La Découpe pose des
**points** sur le son (description, la source n'est jamais touchée). Le **Motif** dit comment les tranches se jouent :
une rangée de pas où chaque pas joue une tranche, avec ses lignes Chance, Hauteur, Roulé, Force, Sens. Sous le capot,
il n'y a **aucun moteur nouveau** : les tranches deviennent un kit du Sampler (`slices_to_keys`, moteur Rust
`atome-instrument`, hauteur exacte au lecteur sinc, étirement Signalsmith) et le Motif est **la grille de pas
existante** (`step_pattern.js`), qui écrit les notes du fichier MIDI — seule vérité jouée. Un clip découpé devient donc
un instrument + un motif, tous deux des atomes, tous deux rejouables à la trame, hors ligne, synchronisés.

Intégration avec les autres modules :

- **Cellules** : l'outil **Cellules** envoie chaque tranche dans sa cellule (une Scène par tranche) ; un toucher la
  joue (Lancer, Boucle / 1 coup, follow actions des Cellules) ; la Scène se pose ensuite sur la Timeline.
- **Timeline** : le Motif est un clip MIDI de la piste ; on l'étire, le copie, l'automatise comme tout clip.
- **Console** : le kit a ses sorties (S5 : une tranche peut aller sur sa propre voie de console, effets par tranche).
- **Sampler / Dashboard** : le même kit s'ouvre dans Instruments ; l'écran « Découp. » du Dashboard et la vue
  Découpe du projet sont deux places du même propriétaire (`sample_edit`), jamais deux codes.
- **Assistant / MCP** : chaque geste est une commande `audio_fx.*` (« coupe aux attaques », « joue les tranches au
  hasard », « roulé de 3 sur le pas 4 »).

## 3. Ce qui est innovant (et que les Slicers du marché n'ont pas ensemble)

1. **Trois méthodes combinables qui se respectent** (déjà codé) : relancer le seuil ne remplace que ses propres
   points ; un point touché à la main devient « main » et n'est plus jamais remplacé.
2. **Seuil visible sur l'onde** (M1) : deux traits cyan au niveau du seuil ; ce qui les dépasse devient un point, en
   direct pendant que la jauge est tenue.
3. **Warp libre, hors grille** (M3) : un point de calage se pose n'importe où, à la trame (la grille d'outils d'eVe
   ne vaut que pour l'interface, jamais pour une position dans un son) ; l'aimant ne s'applique que s'il est choisi.
4. **Un seul motif pour tout** (M4) : ordre libre, hasard, hauteur, roulé, chance et sens par pas, sur la grille de
   pas du séquenceur — pas un éditeur de plus.
5. **Ordre génératif** (rail « Ordre ») : Libre (le motif), Original, Inverse, Hasard, Hasard sans répétition,
   **Suivre** (chaque tranche porte une follow action des Cellules : « après la 3, une au hasard parmi 5–8 »). Le
   hasard est **à graine** : rejouable à l'identique, figeable, et **Mélanger** tire une nouvelle graine.
6. **Lien vivant** (à ajouter) : une cellule née d'une tranche référence la tranche (`audio_slice`, déjà créé par
   `slices_make`) ; déplacer un point plus tard met à jour la cellule. Aujourd'hui `slices_to_cells` copie la région.
7. **Tranche → partout en un geste** : cellule, touche du kit, round-robin, étape de note composée, motif.

## 4. Préconisations pour un module professionnel

- **Précision** : points à la trame, accroche au passage par zéro, fondus de raccord de 1 à 5 ms par tranche (pas de
  clic), détection d'attaques par flux spectral (pas seulement l'enveloppe), sensibilité + écart minimal.
- **Temps** : tempo détecté ou donné, origine du premier temps ; **Warp en deux niveaux** : points de calage (élastique,
  libre ou aimanté) et **swing / groove** global du motif ; étirement de qualité en cache (Rubber Band hors ligne,
  Signalsmith en direct, déjà en place) ; sur le Web, un segment étiré est refusé explicitement (règle « pas de repli »).
- **Lecture** : une voix par pas, **choke** réglable (une tranche coupe la précédente ou se superpose), mode
  Gate / 1 coup, roulé jusqu'à 8 avec courbe de force (montant, descendant) et décalage, hauteur ±24 demi-tons
  **sans changer la durée** (option « vitesse » pour le son vinyle), sens, chance 0–100 %, longueur par pas.
- **Performance** : aucune décision du JS dans la voix ; motif → événements datés à la trame (chemin direct natif) ;
  zéro allocation dans le rendu ; tête de chaque tranche préchargée (streaming V1.2 déjà fait).
- **Sorties** : chaque tranche peut sortir sur sa voie (S5) ; export : Figer une tranche, Figer le motif en audio,
  exporter les tranches en fichiers, export SFZ du kit, export .mid du motif.
- **Contrôle** : jouer les tranches au clavier MIDI / pads (kit sur C2…), apprentissage MIDI des lignes, MCP et voix
  pour toutes les opérations.
- **Non destructif partout** : source intacte, annuler / rétablir du projet, Figer seulement à la demande.

## 5. Vérification réelle « une tranche = une cellule jouable »

Sonde `temp/slicer_2026-11-15/capture.probe.mjs` (page eVe réelle, compte neuf) : clip audio « Voix » divisé en 8
(`slice_divide`), `slices_to_cells`, vue Cellules, toucher (lancement) de la cellule 3, état du transport des
cellules lu. Résultat (15 nov.) : 7 points, 8 tranches ; 8 Scènes « 1 »…« 8 » posées après le clip d'origine, une
cellule par tranche sur la piste « Voix » (vignette = la région de la tranche) ; lancement de la cellule 3 : `ok`,
`exact: true`, transport des cellules `playing`, progression 0,25 après 0,9 s ; aucune erreur de page. Captures
`temp/slicer_2026-11-15/shots/` (`02_cells.png`, `03_cell_playing.png`). Non vérifié : le niveau audio entendu
(crête) et le ruban de progression de la cellule jouée, pas visible sur la capture prise 0,9 s après le lancement.

## 6. Maquettes (à valider, une par phase)

Dossier `temp/slicer_2026-11-15/mockups/`, générateur `build.mjs`, sur la vraie Timeline iPad capturée le 15 nov.
(cellule 73 px, outil 68, joint 5, rayon 3, verre #304063, couleur A #5770a8, glyphe allumé #ddd9ff, cyan #59c7d3).

- **M1 Découper au seuil** (`m1_decoupe_seuil.png`) : la jauge « Seuil » tenue au-dessus de son outil, les traits du
  seuil sur l'onde, les points et les numéros en direct.
- **M2 Diviser à la grille** (`m2_diviser_grille.png`) : grille ½ mesure (12 tranches sur 6 mesures), la tranche 7
  choisie redivisée en 4 (« Diviser ÷ 4 » allumé).
- **M3 À la main, Warp libre** (`m3_main_warp.png`) : le point tenu hors grille (Aimant Libre), le contenu étiré
  avant, resserré après, la zone d'effet plus foncée ; pendant le geste, seul le contenu (règle 17).
- **M4 Lecture — Motif** (`m4_lecture_motif.png`) : les 8 tranches en haut ; le motif de 16 pas en bas (contre le
  doigt), chaque pas sa tranche (numéro en haut, son dessiné, inversé si Sens, coupé en N si Roulé) ; au-dessus, les
  lignes Chance, Hauteur (±), Roulé, Force, ouvertes vers le haut avec le rail d'imbrication ; rail : Vue, Ordre,
  Mélanger, Pas, Swing, Sens, Dupl., Kit, Cellules.
- **M5 Tranches → Cellules** (`m5_cellules.png`) : capture réelle de la vue Cellules après `slices_to_cells`, la
  cellule 3 en lecture.

## 7. Questions (2)

- **Q1** Le Motif réutilise la grille de pas du séquenceur (une rangée de pas, chaque pas choisit sa tranche) plutôt
  qu'une rangée par tranche façon boîte à rythme ? (Les deux se déduisent : « Kit » ouvre la vue batterie.)
- **Q2** Le lien vivant (§3.6) : une cellule née d'une tranche suit les points déplacés après coup ?

## 8. À coder (validé le 15 nov.)

1. [x] Écrans Découpe et Motif (faits le 15 nov.). Place des outils **choisie le 15 nov. : A**
   (`mockups/o_a_rangee_dessus_bande.png`) — la rangée juste au-dessus de la bande du bas ; la bande du bas ne change
   jamais (toi : « elle est fixe, elle doit jamais changer ») ; B et C refusées.
   - Un clip son garde sa vue `clip.view` : Onde, Découpe, Motif (noyau `clip_presentation.js#CLIP_VIEWS_BY_KIND` ; une
     vue MIDI est refusée sur un son) ; choisie par « Vue » du rail et en tête de la rangée.
   - Découpe (`project_view_timeline_slicer.js`), dès quatre outils de hauteur (piste plein écran) : onde, trait par point,
     numéros des tranches en haut, traits du Niveau en Seuil ; toucher = écouter la tranche, double toucher = un point,
     un trait porté = point déplacé (coupe, ou marqueur Warp en Warp), jamais aimanté (placement libre).
   - Rangée Découpe : Vue, Seuil, Diviser, Main, Warp (le mode en couleur A ; Seuil ou Diviser touché de nouveau
     recoupe), puis Niveau + Écart (Seuil), Parts + Grille (Diviser : Parts redivise la tranche touchée, sinon tout le
     son ; Grille sur le tempo du son), Tempo (Warp), Écouter, Suppr. (point choisi), Kit (un instrument Sampler, une
     tranche par touche dès Do2), Cellules.
   - Motif (`project_view_timeline_slicer_motif.js`) : tranches en haut, pas en bas (chaque pas sa tranche) ; toucher un
     pas le choisit, toucher une tranche la lui donne (Q1) ; appui sur un pas = lignes Force, Chance, Hauteur, Roulé
     dépliées vers le haut avec le rail d'imbrication, un glissé le long d'une ligne règle les pas.
   - Rangée Motif : Vue, Ordre, Pas, Swing, Div., Tempo, Mélanger, Sens + Suppr. (pas choisi), Dupl. (nouvelle commande
     `audio_fx.motif_duplicate`), Écouter, Kit, Cellule.
   - Un son sans tempo prend celui du projet avant sa première modification de Motif ou de Grille (Tempo le montre).
   - Écart aux maquettes : « Qualité » du Warp n'est pas proposée (aucun réglage de qualité n'existe pour les marqueurs).
   - Sonde Playwright, vrais clics sur le canevas : `temp/slicer_2026-11-15/ui.probe.mjs` 21/21, captures dans `ui_out/`.
   - Non vérifié : l'écoute réelle, Tauri, iOS au doigt.
2. [x] Motif (fait le 15 nov.) : description `motif` sur l'édition du son, compilée en Rust
   (`atome/engines/audio-kernels/src/motif.rs`, 9 tests) en morceaux de l'édition, rendue par le rendu hors ligne existant
   (`edit_render.js`, hauteur par Rubber Band). Écart à la proposition : le Motif ne passe pas par la grille de pas MIDI
   (`step_pattern.js`) parce que les clips MIDI de la Timeline ne jouent pas encore les instruments internes (seulement des
   ports MIDI, `runtime_midi.js`) ; le rendu en morceaux joue partout aujourd'hui et reste une description (hasard à graine,
   rejouable). Le hasard est donc tiré au rendu (Mélanger = nouveau tirage), pas à chaque passage de boucle. La vue Motif
   (écran) : point 1.
3. [x] Ordre génératif (fait) : Libre, Original, Inverse, Hasard, Hasard sans répétition, Suivre (follow action par tranche,
   vocabulaire des Cellules), graine SplitMix64, chance, roulé 1–8, swing 0–75 %, coupe au pas, fondus de 3 ms.
4. [x] Lien vivant (fait) : `slices_to_cells` garde le lien sur l'édition (`cells_links`) ; chaque changement de points repose
   les mêmes Scènes et clips (réglages des cellules gardés), en ajoute ou en retire ; refus explicite (`cells_link.failures`) si
   le bloc déborderait sur une Scène qui n'est pas la sienne.
5. [x] Commandes `audio_fx.motif_*` + `motif_to_cell` ; sonde Web réelle `temp/slicer_2026-11-15/motif.probe.mjs` 16/16 (cellules
   qui suivent un point déplacé et une redivision, Motif hasard + roulé + hauteur, rendu de 4 s exact, même graine = même son,
   Motif → cellule lancée et jouée). Non vérifié : l'écoute réelle, Tauri et iOS.
