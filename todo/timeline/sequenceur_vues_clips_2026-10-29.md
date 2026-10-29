# Séquenceur — pistes agnostiques et vues des clips
## Cahier des charges minimal — 29 octobre 2026

**Statut :** tout est tranché (Q1–Q18, O1–O4, B, A-Q) et codé le 29 oct., C1–C5 corrigés, vérifié sur le Web (`temp/sequencer_build/`, FRAMEWORK_STATE §5 du 29 oct., deux entrées). Reste hors de ce cahier : reconstruire le WASM audio Web quand le crate partagé recompile (les courbes du moteur ne sont pas encore entendues sur le Web).
**Base :** `timeline_cellules_cahier_des_charges_v1.6.md` (fait autorité sur tout ce qui n'est pas repris ici) et `todo/mixer/mixer.md`.
**Suite prévue :** réponses → maquettes aux vrais jetons, une par une → code en une passe.

## 1. Ce qui existe (vérifié dans le code le 29 oct.)

| Sujet | État | Où |
| --- | --- | --- |
| Piste agnostique | **Existe.** Toute piste créée par l'UI est `mixed` : elle accepte audio, vidéo, image, texte, forme, groupe, MIDI. Les types `audio`, `video`, `midi`… existent aussi mais ne sont pas créés par l'UI. | `molecule/track_types/index.js`, `kernel/structure.js` |
| Chevauchement | Refusé : un seul clip à un instant donné sur une piste ; un geste se pose sur la place libre la plus proche. | `kernel/collisions.js` |
| Clip audio | Forme d'onde de sa fenêtre de source. | `bevy_panel_record_timeline_preview.js#recordTimelineStripNodes` |
| Clip vidéo | Images échantillonnées (1 à 5 selon la largeur). **Son non dessiné.** | idem |
| Clip MIDI | Aperçu par la texture piano roll. | `bevy_midi_piano_roll_texture.js` |
| Piano roll éditable | **Existe, mais sur le canevas (vue Page) seulement**, pas dans la Timeline. Chaque geste réécrit le fichier SMF (`midi.notes.set`). | `intuition/tools/midi_piano_roll_editor.js` |
| Grille de boîte à rythme | **N'existe pas.** | — |
| Clip texte (prompteur) | Un trait par ligne. | `project_view_timeline_tree.js#prompterTicks` |
| Clip projet | **Existe dans le noyau** : source `molecule` / `molecule_ref`, cycles refusés, aperçu imbriqué. Pas de geste pour en poser un. | `molecule/nested/index.js`, `kernel/schemas.js` |
| Clip outil / action | **N'existe pas** (aucun type de clip ; v1.6 §1 bis.18 resté OUVERT). | — |
| Outil déposé sur la timeline | **Existe pour Record audio/vidéo seulement** : déposé sur une piste, il arme une zone d'enregistrement (durée, déclenchée par la tête). Tout autre outil est refusé (`timeline_drop_unsupported`). | `project_view_timeline_gestures.js#drop`, `kernel/structure.js` (record_region) |
| Calendrier → lancer | Une alarme d'événement lance : sonnerie, musique, média (joué), outil (exécuté, par MCP), **projet = ouvert seulement**, jamais joué. Ce qui dure s'arrête à la fin de l'événement. | `intuition/tools/calendar_alarm_launch.js` |
| Enchaîner des timelines | Rien de dédié. Les Scènes s'enchaînent dans une timeline (Follow Actions) ; un clip projet imbriqué est possible dans le noyau. | v1.6 §1 bis |
| Vidéo avec son | **Tranché côté mixeur :** une seule piste, un seul clip ; le mixeur en tire deux tranches (image + son) en groupe natif, détachables (`mix.detached_strip_ids`). Rien n'est prévu côté Timeline pour séparer le son dans le temps. | `kernel/mix_projection.js`, `mixer.md` V7 |
| Hauteur de piste | Fixe : un outil (60 px). v1.6 §11.6.2 : « pas de zoom vertical pour l'instant ». | `project_view_timeline_layout.js` |
| Inspecteur (zone du bas) | Contextuel, 2 outils de haut, apparaît à la sélection d'un clip ; **affichage seul**, aucune édition. | `project_view_timeline_tree.js` (`detail`) |

## 2. Exigences

**S1 — Pistes agnostiques (inchangé).** Une piste reçoit des clips de toute nature, l'un après l'autre. La nature d'un clip se lit à son contenu (onde, images, notes, glyphe), jamais à une icône ni à une étiquette ajoutée (charte, règle 10). La couleur reste celle de la piste.

**S2 — Chaque nature de clip a sa ou ses vues.** Une vue est une projection de l'atome du clip ; elle ne crée jamais de copie.

| Nature | Vue(s) | Nouveau ? |
| --- | --- | --- |
| Audio | forme d'onde | non |
| Vidéo | images, plus son onde si elle a du son (Q2) | onde : oui |
| MIDI | piano roll **ou** grille de boîte à rythme (Q6) | grille : oui |
| Image, texte, forme | rendu actuel | non |
| Outil / action | glyphe de l'outil (Q7) | oui |
| Projet | aperçu de ses pistes (Q8) | geste de pose : oui |

**S3 — Deux façons d'agir sur un clip, avec un seul éditeur.**
- (a) Sélectionner le clip : sa vue détaillée s'ouvre dans l'inspecteur du bas.
- (b) Agrandir la piste en hauteur : on agit directement dans le clip.
- Les deux hébergent **la même brique d'édition** par nature (piano roll, grille, onde…). On ne fait jamais deux éditeurs.

**S4 — Hauteur des pistes.** Elle est variable à la demande et commune à toutes les pistes (Q3), plus un plein écran pour la piste courante. C'est toujours un multiple d'un demi-outil (charte, règle 12), jamais un redimensionnement automatique pour faire tenir le contenu. La hauteur choisie est persistée dans la timeline.

**S5 — Vidéo avec son.** Par défaut, une seule piste et un seul clip. On sépare le son à la demande (Q1). Séparer le son ne touche jamais la source. Le mixeur suit : le son séparé devient la tranche audio de sa nouvelle piste.

**S6 — Tout geste a sa commande.** Chaque nouveau geste a son outil `ui.timeline.*` / MCP. Il est annulable en une fois et applicable en lot (v1.6 §7.16).

**S7 — Lecture.** La tête de lecture déclenche chaque clip selon sa nature : audio et vidéo jouent, MIDI sort, un outil s'exécute, un projet joue sa propre timeline. Un scrub ne déclenche jamais d'outil.

**S8 — Pistes d'outils.** N'importe quel outil (ou script, qui est un outil) se pose dans une piste. Il s'exécute au temps de la timeline par sa commande canonique (MCP). Le Record déposé est le premier cas qui existe déjà ; il devient un outil parmi les autres, sans perdre son comportement.

**S9 — Enchaînement.** Une timeline mène à une autre : on enchaîne des chansons, des projets. Un projet se pose comme n'importe quel objet : dans une timeline, dans un calendrier.

**S10 — Afficher ou exécuter : une règle pour tout objet posé.** Tout objet posé dans une timeline ou un calendrier (projet, vidéo, son, outil, atome) porte son mode : **Afficher / Ouvrir** ou **Exécuter / Lancer**. Ouvrir un projet n'est pas le lancer. Un seul propriétaire décide et exécute ce mode, pour le calendrier comme pour la timeline. On ne fait jamais deux logiques.

## 3. Décisions (utilisateur, 29 oct. 2026)

Unité : **1 outil = 60 px** (`SYSTEM_UI_METRICS.unitPx`). Une piste mesure aujourd'hui 1 outil de haut.

- **Q1 — VALIDÉ A.** Vidéo avec son : une piste, un clip. L'outil « Séparer le son » pose le son sur la piste juste en dessous. Il reste lié (il bouge avec l'image) jusqu'à « Délier ». Rien n'est détruit ; le mixeur suit.
- **Q3 — VALIDÉ, toutes les pistes ensemble.**
  - Le pincement vertical agrandit ou réduit **toutes** les pistes à la fois, par demi-outil.
  - Un **outil** de hauteur est indispensable.
  - Un mode **plein écran** donne toute la hauteur à la piste courante.
  - Proposition de l'utilisateur, à régler (point ouvert O2) : passer par l'en-tête de piste ; un appui long met la piste en plein écran ; un glisser sur l'en-tête agrandit toutes les pistes, jusqu'au plein écran de la piste courante.
- **Q4 — VALIDÉ, 4 outils minimum.** À partir de 4 outils de haut (240 px), on agit sur le contenu du clip directement dans la piste : notes MIDI, pas de batterie, fondus. En dessous, on déplace et on rogne le clip entier, comme aujourd'hui. Les pistes voisines restent visibles pour garder le contexte.
- **Q5 — VALIDÉ A.**
  - L'inspecteur est éditable, avec le même éditeur que la piste.
  - S'il y a la place, l'écran se partage en deux : timeline au-dessus, inspecteur dessous.
  - Sinon, toucher le clip ouvre l'inspecteur en plein écran, avec une petite zone pour réafficher la timeline (forme à régler : point ouvert O3).
- **Q6 — VALIDÉ A.** La vue MIDI est choisie automatiquement (batterie → grille, sinon piano roll). L'outil « Vue » du rail permet de changer, et le choix reste sur le clip.
- **Q7 — VALIDÉ C.** Un outil-action agit à un instant ; un outil qui dure (Record, lecture, prompteur, tout outil marche/arrêt) a une durée : il démarre au début du clip et s'arrête à sa fin. On pose un outil en le glissant depuis le rail, et un scrub ne déclenche rien.
- **Q8 — VALIDÉ C.** Un projet dans une timeline peut être imbriqué (par défaut) ou basculé (il s'ouvre et se lance). Le choix se fait sur le clip.
- **Q9 — VALIDÉ A.** On enchaîne une timeline à une autre en posant le projet suivant en clip à la fin. En mode non linéaire, la vue Cellules et ses Follow Actions jouent ce rôle (v1.6).
- **Q10 — VALIDÉ A.** Le mode a un défaut selon la nature : projet, son et vidéo → Lancer ; image et texte → Afficher ; outil → Exécuter. Il reste modifiable après coup : outil sur le clip, option sur l'événement du calendrier.
- **Q11 — VALIDÉ A.** Lancer un projet, c'est l'ouvrir et jouer sa timeline depuis le début, automatiquement.
- **Q12 — VALIDÉ A.** Un seul clip à la fois par piste. Pour superposer, on prend une autre piste.

## 3 bis. Points ouverts puis tranchés (29 oct.)

- **O1 (ex-Q2) — À trancher sur maquette.** Faut-il dessiner le son d'une vidéo dans son clip ? Deux variantes seront montrées sur M3 :
  - B : toujours, images en moitié haute et onde en moitié basse ;
  - C : seulement quand les pistes sont agrandies.
  
  L'utilisateur penche pour C, parce qu'en B tout est petit.
- **O2 — VALIDÉ A.** Les gestes validés en v1.6 sont gardés : toucher l'en-tête sélectionne la piste ; un appui long ouvre ou replie les en-têtes. L'en-tête ouvert gagne une 3e touche « plein écran » après M et S. Un glisser vertical sur les noms des pistes agrandit toutes les pistes, jusqu'au plein écran de la piste courante.
- **O3 — VALIDÉ A.** La hauteur se règle avec le curseur d'outil canonique « Hauteur » (`bevy_ui_tool_slider.js`), dans le rail, sans − ni +. Il marque un léger arrêt sur 1, 2, 3 et 5 outils, puis sur le plein écran.
- **O4 — VALIDÉ, avec Retour.**
  - L'inspecteur plein écran n'est pas un panneau : c'est un niveau sous la Timeline. On en sort par **Retour**, à gauche de la bande du bas (sa place fixe, règle 13), qui ramène à la Timeline d'où l'on vient. Pas de ✕.
  - Pas de bande de contexte.
  - L'écran se partage en deux dès qu'il reste au moins 3 outils de pistes au-dessus d'un inspecteur de 4 outils ; sinon, toucher le clip ouvre l'inspecteur en plein écran.

## 3 ter. Ajouts du 29 oct. (après les premières maquettes)

**Rayon.** Les notes du piano roll, les pas de la grille et les rangées de prises suivent la règle du 27 oct. : un dixième du plus petit côté, 12 px au plus (`SYSTEM_UI_METRICS.radiusFor`). Une note d'un demi-outil a donc des coins presque droits.

**En-têtes ouverts.** Un appui long ouvre tous les en-têtes, comme aujourd'hui. Chaque en-tête montre le nom, M, S, puis la nouvelle touche **plein écran**, sur une seule ligne ; la colonne passe de 4 à 5 outils de large. Si la piste est haute, les touches restent sur la ligne du haut (règle 11). La touche plein écran donne toute la hauteur à la piste ; elle reste allumée (glyphe lavande) tant que c'est le cas.

**Comping (existe, 15 oct.).**
- Ce qui existe déjà : une zone de Record à N prises boucle pendant l'enregistrement, le clip garde toutes ses prises (`kernel/takes.js`), et on choisit une prise par morceau en coupant le clip (`molecule.clip.take`, palette « Prise » du rail). Rien n'est copié ni perdu.
- Ce qui manque : les **couloirs de prises visibles** (décision Q10 du 15 oct., restée ouverte).
- Proposition (M10) : l'outil « Prises » déplie un couloir par prise sous la piste, avec le même mécanisme que l'automation. Le morceau choisi de chaque prise est allumé. Glisser le long d'une prise choisit ce passage ; c'est la coupe et le choix en un seul geste.

**Automation (concept proposé, à valider).**
- **Existe** : le modèle (`kernel/automation.js`) avec un couloir par paramètre `{target_id, param, keyframes {time_seconds, value, curve: linear | hold | smooth}}` et les commandes MCP `automation.lane.*` / `automation.keyframe.*`. Les points-clés sont dessinés en points sur la piste.
- **Manque** : la lecture (le transport ignore l'automation), toute interface, et l'enregistrement.
- **A1 — Cible agnostique** : tout réglage qui a une valeur (celle du curseur d'outil). Cela vaut pour une piste (volume, pan), une tranche ou un effet du mixeur, un clip ou un atome (opacité, position, taille, couleur, hauteur…).
- **A2 — Créer un couloir** : avec l'outil « Auto » allumé sur une piste, toucher un de ses réglages lui donne son couloir. Il n'y a pas de liste à parcourir.
- **A3 — Écrire à la main** : on reprend les gestes du piano roll. Appui sur le vide = un point, appui sur un point = le déplacer, toucher un point = le retirer. La courbe du segment qui suit le point sélectionné (linéaire, palier, douce) se choisit avec un rouleau du rail.
- **A4 — Écrire en jouant** : pendant la lecture, avec Auto allumé, bouger le curseur d'un réglage écrit sa courbe (mode à choisir, question A-Q3).
- **A5 — Lire** : au Play, chaque paramètre suit sa courbe : à l'échantillon pour l'audio (rampe du graphe de mixage), à l'image pour la vidéo et les atomes. Le curseur du réglage montre la valeur qui bouge.
- **A6 — Lot** : le lasso sélectionne des points de plusieurs couloirs ; les réglages s'appliquent en lot (v1.6 §7.16).

## 3 quater. Réponses du 29 oct. (après M7–M10)

**Validé.**
- **Comping A (M10)** : couloirs de prises ; glisser le long d'une prise choisit ce passage, et les passages choisis s'accumulent. Le noyau le permet déjà : couper au début et à la fin du glisser, puis choisir la prise du morceau du milieu (`molecule.clip.take`).
- **Boucle d'un clip : existe.** `clip.block_loop` (`kernel/block_loop.js`) est joué par le transport ; l'outil « Bloc… » du rail du clip (`timeline_clip_loop`) l'allume, et le clip s'allonge en répétant sa matière. Rien à créer.
- **Noms de 6 lettres** : validés.
- **Boîte à rythme** : rangées sans nom, comme dessiné.
- **A-Q3 écriture en jouant** : au toucher.

**Automation : remplace A2 et A4 (proposition de l'utilisateur).**
- **B1 — Touche FX** dans l'en-tête ouvert : M, S, **FX**, plein écran. FX allumée déplie la tranche de console de la piste sous son nom : ses modules l'un sous l'autre, avec le rail d'imbrication (`combo_rail`). Les modules sont ceux du mixeur (`molecule_mix_*`), jamais une copie.
- **B2 — Choisir un module** montre son couloir en face, à sa hauteur ; le couloir peut être plus haut que le module.
- **B3 — Accumuler** : un appui long ajoute le couloir d'un autre module à ceux qui sont déjà montrés.
- **B4 — Fermer FX** : tout se replie (couloirs, tranche) et l'en-tête redevient petit.
- **B5 — Réglages du module** : dans l'inspecteur du bas, par la brique `molecule_mix_module_controls.js`. On y trouve les curseurs, un outil **Rec** (il écrit les mouvements en jouant, au toucher), et la bande du pied : ✕ à gauche, nom au centre, interrupteur de l'effet à droite (règle 13). Le couloir montre le paramètre choisi dans ces réglages.
- **B6 — Lier (rail)** : liaison automatique. Allumé, le dernier paramètre touché prend le prochain contrôle bougé sur la surface de contrôle. Il s'appuie sur le binding MIDI existant (`midi_binding_service.js`, apprentissage « Learn » ; actions continues min/max).
- **Gestes de la tranche : à trancher (question).** Dans le mixeur aujourd'hui : toucher = choisir le module (ses réglages s'affichent), balayer à gauche = le contourner, à droite = le réactiver, appui long + glisser = le déplacer ou le supprimer.
- **A-Q4** : la courbe suit le clip. Les couloirs restent par paramètre, mais les points posés sous un clip bougent avec lui quand on le déplace ou le copie. On fait les deux (réglage de piste ou de média) sans complexité de plus.

**Pas à pas (boîte à rythme) — M12.**
- Chaque rangée a sa propre longueur en pas (polyrythme) et son mode : **Boucle**, ou **1 coup** (elle joue une fois puis se tait).
- **Ratchet** (« Roulé ») : un pas est rejoué N fois dans sa durée ; il se dessine coupé en N.
- Chaque rangée a ses lignes **Force** (vélocité), **Roulé** et une ligne de contrôleur (ex. Pan). Elles se déplient vers le haut, au-dessus de la rangée (règle 14, accordéon vers le haut), avec le rail d'imbrication.
- Gestes : un appui long sur une rangée la déplie. Sa longueur (« Pas », curseur d'outil) et son mode (rouleau Boucle / 1 coup) sont dans le rail ; glisser la fin de la rangée change aussi sa longueur.
- **N'existe pas** : aucune grille de rythme dans le code. Il faut une description de motif (rangées : note, longueur, mode, pas {force, roulé, contrôleur}) qui produit les notes du fichier MIDI, lequel reste la seule vérité jouée. C'est un nouveau contrat interne, couvert par l'autorisation permanente.

**Dernières réponses (29 oct., design complet validé).**
- **Q6 vidéo → C** : à un outil de haut, la piste ne montre que les images ; dès qu'elle dépasse un outil, le son s'affiche sous les images.
- **Q7 gestes de la tranche → A**, comme dans le mixeur : toucher = choisir le module (couloir en face + réglages en bas), appui long immobile = ajouter son couloir, balayer = contourner ou réactiver, appui long + glisser = déplacer.
- **Q8 noms** : FX, Rec, Lier, Pas, Force, Roulé, Boucle / 1 coup sont validés.
- **Q9** : le nom du projet est en haut d'un clip projet, s'il y a la place.
- **M7 calendrier** : c'est le même rouleau Ouvrir / Lancer que M6 (même motif, validé d'office).

## 4. Maquettes

Faites le 29 oct. sur la vraie Timeline capturée : `temp/sequencer_views/mockups/` (générateur `gen.mjs`, capture `capture.probe.mjs`).
- M1 à M6 sont envoyées pour validation (M3 en trois images : variantes B et C, puis son isolé).
- M7 n'est pas encore faite : il faut une capture réelle du panneau de lancement du calendrier.

Liste prévue :

- M1 : piste MIDI agrandie, piano roll éditable.
- M2 : grille de boîte à rythme (nouvelle brique, à valider avant tout code).
- M3 : vidéo avec son, dans sa piste puis séparée.
- M4 : inspecteur éditable.
- M5 : clip outil.
- M6 : clip projet.
- M7 : choix Ouvrir / Lancer sur un événement du calendrier et sur un clip (à faire).
- M7 bis (fait) : en-têtes ouverts. M8 : piste plein écran. M9a/b : abandonnées pour M11.
- M10 : comping, validé.
- M11a : automation par FX (tranche dépliée, couloirs en face). M11b : réglages de l'effet dans l'inspecteur avec Rec, et Lier allumé.
- M12 : pas à pas, polyrythme, roulés, lignes dépliées.


## Questions du 29 oct. au soir — tranchées et codées le 29 oct.

Réponses : Q13 A + B (toucher = posé à la tête de lecture, appui long + glisser = posé où l'on veut) et par la voix ; Q14 B (la vidéo reste muette) ; Q15 B (le son part avec la vidéo) ; Q16 B (une paire copiée reste liée, un seul copié est libre) ; Q17 A (l'outil démarre à cet endroit) ; Q18 A (le moteur audio calcule la courbe). C1–C5 et le 1er dépôt immédiat : faits.

- **Q13 — Prendre un projet (M13)** : outil « Projet » du rail → panneau au pied, liste des projets (sans le projet ouvert ni ceux qui le contiennent) ; toucher = posé à la tête de lecture sur la piste choisie ; appui long + glisser = emporté sur une piste.
- **Q14 — Supprimer le son séparé** d'une vidéo liée : la vidéo reprend son propre son, ou reste muette.
- **Q15 — Supprimer la vidéo** liée : son son reste seul, ou part avec elle.
- **Q16 — Copier / coller** une vidéo et son son ensemble : la copie reste liée, ou non.
- **Q17 — Lecture lancée au milieu** d'un clip d'outil qui dure : l'outil démarre à cet endroit, ou seulement quand la tête franchit le début du clip.
- **Q18 — Automation** : rampes calculées par le moteur audio (lisses), ou valeurs envoyées à chaque image (petits paliers audibles sur un fondu court).

Écarts du code aux maquettes validées, corrigés sans question : C1 libellé « Isoler » et glyphe de M3a/b (pas « Séparer le son » / waveform) ; C2 glyphe « Délier » de M3c (chaîne brisée, à créer dans les icônes) ; C3 piste du son nommée comme la piste vidéo (M3c), pas « Piste N » ; C4 « Mode » en rouleau dans le rail (M6), pas un curseur à légende ; C5 un projet inclus joue aussi son MIDI ; plus le 1er dépôt d'outil sans les ≈ 11 s d'attente du registre.
