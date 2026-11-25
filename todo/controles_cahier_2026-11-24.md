# Cahier des charges — objets « Contrôles » (sliders, rotatifs, champs, menus) placés dans un projet

Source : demande de l'utilisateur, 24 nov. 2026 (session « cahier des charges widgets »). Registre : R-347.
Méthode demandée : point par point, une question à la fois, maquette quand il y en a une. Ce fichier ne garde que
ce qui est validé ; les questions ouvertes sont listées en bas.

## Ce qui existe déjà (relevé du code, 24 nov.)

- Créer (`eVe/intuition/runtime/eve_intuition/main_menu_create_content_runtime.js:292-300`) : 10 choix — Texte,
  Dessin, Code, Page, Menu (menu de site), QR, Placeholder, Forme, Générateur, Matrice (seule sous-palette).
- Aucun atome « contrôle » : ni slider, ni rotatif, ni bouton, ni champ, ni pad XY plaçable (`genesis.js`,
  `app_atome_types.js`). Le plus proche : `site.form` (formulaire du site public).
- Déclencheur → action existe : les Interactions (`interaction_model.js`, `interaction_runtime.js`, panneau
  `ui.interaction.panel`) : déclencheurs `activate`, `hold`, `input`, `changed`, `transport`, `source`…, cible fixe /
  dynamique / soi-même, cascade d'outils réels, actives en consultation et performance. Pas de double touche,
  pas de « la lecture atteint », pas de « MIDI reçu ».
- MIDI : liaisons MIDI (`midi_binding_runtime.js`, apprentissage, plage min/max, actions = outils) ; sorties
  MIDI externes (Web MIDI, Tauri, AUv3) ; tranches MIDI avec envoi. **Pas de bus MIDI** (un bus = piste `group`
  audio, `mix_routing.js`).
- Modes de projet : `edit`, `consultation`, `performance` (`project_work_mode_state.js`).
- Timeline : un objet non temporel posé prend 2 s par défaut, dans la Timeline comme dans l'aperçu.

## Validé

- Q1 (24 nov.) : la famille s’appelle **Contrôles** (outil de Créer, 9 caractères).
- Q2 (24 nov.) : Contrôles est une palette de **11 contrôles**, rien enlevé, aucun regroupement : Slider (vertical ou horizontal), Rotatif, Bouton (momentané), Interrupteur, Pad XY, Champ (texte ou nombre), Menu, Pads (grille), Clavier, Afficheur (reçoit seulement), Sélecteur (un choix parmi des boutons). Complété le même jour : un **12e, Condition** (si : lit l’état d’un objet et, selon lui, route vers une cible ou une autre).
- Q2 bis (24 nov.) : Slider et Rotatif ont une plage (début, fin), lue en % ou en valeur, et un pas (ex. 127 crans, tous les 10…). Le Bouton peut **capturer** une valeur et la **restaurer**.
- Q3 (24 nov.) : rien n’est regroupé ni enlevé dans Créer. Contrôles ouvre un **panneau** (pas une palette du rail) ; règle générale : plus de 5-6 choix ⇒ un panneau, sans demander. Maquette du panneau Créer › Contrôles à montrer (règle 16) avec la question 5.
- Q4 (24 nov.) : **tout objet** (image, texte, forme, vidéo…) reçoit le même panneau Déclencheur · Cible · Message que les contrôles ; plus un **13e contrôle, Zone** : rectangle invisible en lecture, visible en édition, pour rendre interactive une partie d’un objet. Condition : visible et réglée en édition, invisible en lecture, déclenchée par un autre contrôle ou la lecture ; la même brique sert d’étape « si… sinon » dans la suite d’actions de tout contrôle.
- Q5 (24 nov.) : maquette 1 **validée** (`temp/widgets_spec_2026-11-24/mockups/q5_1_panneau_controles.png`) : Créer › Contrôles ouvre le panneau standard contre son outil du rail, 13 outils 5 par rangée, nom au pied, pas de ✕ attaché ; un outil s’arme, un toucher pose. Aspect **option 1** : aspect eVe par défaut (verre des outils, accent du slider, thème suivi, grille, aucun libellé par défaut — maquette `q5_2_controles_aspect_eve.png`), et chaque contrôle se personnalise comme un objet : couleur, taille, et sa propre image (rotatif dessiné, bouton-photo).
- Q6 (24 nov.) : **lecture** (Consultation, Performance) : les gestes appartiennent au contrôle, il ne se déplace pas, son maintien est l’un de ses déclencheurs (pas de Mystic). **Édition** option 1 : un toucher sélectionne (déplacer, redimensionner sur la grille), le rail contextuel montre ses outils, le premier étant **Action** qui ouvre le panneau Déclencheur · Cible · Message ; une double touche ouvre ce panneau directement.
- Q7 (24 nov.) : panneau Action **option A** (`temp/widgets_spec_2026-11-24/mockups/q7_A_reactions_en_rangees.png`) : plusieurs **réactions** par contrôle, une rangée chacune : Quand (déclencheur, 1 outil) · Cible (2 outils) · Message (1) · Valeur (la plage, curseur d’outil, tapable) ; « + » ajoute une réaction ; une case touchée ouvre ses choix dans le panneau (← pour revenir) ; pied : Suppr. (la réaction choisie), le nom « Action · <contrôle> ». Chaque réaction peut être **supprimée, copiée, collée** (dans le même contrôle ou un autre) et **contournée** (bypass : gardée mais muette) — demande du 24 nov. ; proposé : un maintien sur la rangée met ces outils dans la bande du pied (Suppr., Copier, Coller, Bypass, rangée contournée au repos atténué par son interrupteur éteint).
- Q8 (24 nov.) : **14 déclencheurs**, tous gardés ; chaque contrôle ne montre que ceux qui ont un sens pour lui. Gestes : 1 Toucher, 2 Relâcher, 3 Double touche, 4 Maintien, 5 Glisser, 6 Entrer/sortir (Zone, Pad). Valeur : 7 Valeur changée (geste, MIDI, automation), 8 Seuil franchi. Lecture : 9 **La lecture arrive** sur le clip du contrôle, 10 **La lecture quitte** son clip, 11 À chaque temps/mesure tant qu’il est actif. MIDI : 12 MIDI reçu (appris, port externe ou bus MIDI). Autres : 13 À l’ouverture du projet/de la Scène, 14 Minuteur. Précisé par l’utilisateur : 9 se déclenche aussi quand la lecture **démarre à l’intérieur** du clip ou y **saute** (relance au démarrage) ; 10 aussi à l’arrêt ou au saut hors du clip ; dans les Cellules, quand sa cellule part et s’arrête.
- Q9 (24 nov.) : **14 catégories de cibles**. Dans le projet : 1 Objets, 2 Médias, 3 Clips (et cellules), 4 Scènes, 5 Pistes et tranches, 6 Instruments, 7 Bus MIDI, 8 Contrôles (enchaîner), 9 **Projets** (le courant : lecture, arrêt, tempo, position, vue ; et **ouvrir un autre projet**), 10 Soi-même, 11 Plusieurs par règle, 14 **Capture** (ajoutée par l’utilisateur) : la caméra (photo, vidéo, changer de caméra) et le magnéto (enregistrer, arrêter). Dehors : 12 MIDI externe, 13 Réseau (OSC, adresse web — à créer).
- Q10 (24 nov.) : **4 sortes de message** : 1 un outil d’atome (le catalogue des vrais outils, celui du MIDI appris et des alarmes, enrichi tout seul), 2 un message MIDI (note + vélocité, CC, programme, pitch bend, aftertouch, start/stop/horloge), 3 une valeur fixe (couleur, taille, X/Y, texte), 4 Mémoriser / Restaurer. **Valeur** : plage de sortie, courbe (linéaire, exponentielle, logarithmique), inverser, absolu ou relatif, valeurs « allumé » / « éteint » pour Bouton et Interrupteur ; tout au curseur d’outil, tapable.
- Q11 (24 nov.) : bus MIDI, 3 maquettes **validées** (`temp/widgets_spec_2026-11-24/mockups/q11_1_tranche_bus_midi.png`, `q11_2_panneau_bus.png`, `q11_3_plage_clavier.png`) : une tranche **Bus MIDI** dans la console, ses entrées en haut (port externe, contrôle, autre tranche MIDI ; « + »), ses sorties en bas (port externe, instrument d’eVe, tranche MIDI ; « + »), chaque message reçu partant vers toutes ; module actif = glyphe allumé ; les tranches MIDI des pistes ont les mêmes listes. Panneau d’une entrée/sortie soudé à son module (pas de ✕) : Canal (filtre Tous/1–16), Dest. (Orig./1–16), Transp. (demi-tons) en curseurs d’outil tapables ; Plage = ligne, deux bornes en cases tapables (C-2, 36…) ; pressée, elle devient un clavier de 128 notes aussi large que la console (précédent du Pan R-272), poignées, hors plage assombri, repli au lever ; pied : Suppr., nom, interrupteur Activé dans le coin.
- Q12 (24 nov.) : 1 le contrôle **suit sa cible** (automation, autre contrôle, MIDI reçu, objet changé à la main) ; plusieurs cibles : il suit la première réaction. 2 **renvoi MIDI externe** (faders motorisés, voyants), un interrupteur par réaction, éteint par défaut. 3 **gestes enregistrés en automation** dans la bande de son clip quand Enr. est armé ; relu seul ; doigt posé = reprend la main et réécrit tant qu’il touche, levé = l’automation reprend. 4 **valeur persistée** par le pipeline : direct pendant le glissé, seule la valeur au lâcher est écrite (serveur, tous appareils).
- Q13 (24 nov.) : 1 posé dans l’aperçu : sa propre piste, clip du début à la fin du projet, qui suit la fin tant qu’il n’est pas raccourci à la main ; 2 posé dans la Timeline : 4 mesures au dépôt, sur la piste visée (nouvelle piste sur une rangée vide), au centre de l’aperçu sur des cases libres ; 3 dans une cellule : actif tant qu’elle joue ; 4 hors de son clip : ni visible ni actif (lecture et édition) ; 5 à l’arrêt : actif si la tête est sur son clip. **Précision de l’utilisateur** : le clip ne fait que la **présence** (visible et touchable pendant son laps, apparition et disparition **en fondu ou sec**, au choix par contrôle) ; « la lecture arrive / quitte » ne fait rien tant qu’aucune réaction ne les utilise. Exemple : bouton A, Toucher → PC ; il apparaît, on le touche, il disparaît. Bouton B : La lecture arrive → PC 3, La lecture quitte → PC 5, Toucher → PC 6.
- Q14 (24 nov.) : réglage en lot validé : 1 un seul panneau Action pour la sélection, « ≠ » sur une case qui diffère, un changement s’applique à tous ; 2 **numérotation en série** (interrupteur) : un nombre monte d’un cran par contrôle, de gauche à droite puis de haut en bas (CC 20…27, notes, canaux, cibles piste 1…8) ; 3 aspect, plage, pas, fondu, coller une réaction : en lot aussi ; 4 sélection par le geste existant des pistes/cellules en lot (lasso, maintien puis touchers).
- Q15 (24 nov., ajoutée par l’utilisateur) : **Condition** a son panneau (maquettes `q15_1_condition_simple.png`, `q15_2_condition_script.png`, posées) — rangées Quand · Si (Cible · État · comparaison · Valeur, Et/ou, +) · Alors · Sinon (réactions) ; outil **Script** au pied qui bascule en code par le moteur de scripts existant (`eVe/domains/script/`, Ruby/Opal ou JavaScript, à part, non approuvé tant que pas Activé) ; l’assistant remplit les rangées ou écrit le script. **Nom** sur les contrôles (`q15_3_libelles.png`) : outil Nom du rail, en haut sur une bande qui suit ses coins, 9 caractères puis « … », Rotatif nommé une demi-case plus haut, rien sans nom, aussi en lot.

- Q16 (24 nov., avant L3–L12) : **Réseau** : l'OSC part du serveur local des apps (Mac/PC Tauri, iPad), qui sont sur le réseau de la personne ; sur le Web une réaction OSC est refusée avec le message discret ; l'adresse web (HTTP) marche partout, envoyée par le serveur.
- Q17 (24 nov., avant L3–L12) : **vélocité** du Clavier et des Pads selon la place du toucher : le haut d'une touche ou d'un pad doux, le bas fort ; la pression en plus là où l'appareil la mesure.

## Questions (15)

1. Nom de la famille. — **validé : Contrôles**
2. Contenu de la famille (quels contrôles). — **validé : 13 (les 11 + Condition + Zone)**
3. Regroupement de Créer. — **validé : rien regroupé, Contrôles = un panneau** (maquettes écartées : `temp/widgets_spec_2026-11-24/mockups/q3_1_neuf_cases.png`, `q3_2_sept_cases.png`)
4. Image interactive : tout objet peut-il devenir un contrôle ? — **validé : oui, + Zone**
5. Aspect des contrôles (+ maquette du panneau Contrôles). — **validé : maquette 1, aspect option 1**
6. Comportement en édition / en lecture. — **validé**
7. Structure du panneau Déclencheur · Cible · Message (maquette). — **validé : A**
8. Liste des déclencheurs. — **validé : les 14**
9. Catégories de cibles (internes, externes). — **validé : 14 catégories**
10. Messages et correspondance des valeurs. — **validé**
11. Bus MIDI. — **validé (3 maquettes)** — demande reçue par l’orchestrateur (24 nov., session baa2241a) : sur une tranche, des bus MIDI en entrée et en sortie (+ pour en ajouter) ; chaque bus : interrupteur au pied du panneau, Suppr. (outil d’action), filtre de canal, plage de notes (clavier plus grand, agrandissable), transposition, canal de destination ; toutes les valeurs tapables en chiffres ; look atome (charte), pas celui des captures `temp/midi_bus_2026-11-24/reference/`. Maquette à faire à cette question.
12. Retour de valeur et enregistrement des gestes en automation. — **validé**
13. Placement dans la Timeline, les Cellules, l'aperçu.
14. Réglage en lot (plusieurs contrôles sélectionnés). — **validé**
15. Panneau de Condition (rangées et script) et nom des contrôles. — **validé (3 maquettes)**

**Q15 validée (24 nov.)** : les 3 maquettes (Condition en rangées, Condition en script, nom sur les contrôles).

---

# Cahier des charges complet (toutes les réponses validées le 24 nov. 2026)

## A. Ce que l'on construit

Une famille d'objets **Contrôles**, posés par la personne dans un projet, qui agissent sur le reste : objets,
médias, clips, Scènes, pistes, instruments, bus MIDI, autres contrôles, projets, capture, MIDI externe, réseau.
Et **tout objet** (image, texte, forme, vidéo…) reçoit la même faculté d'agir (Q4).

### A1. Les 13 contrôles (Q2, Q4, Q15)

| Contrôle | Taille par défaut (grille) | Valeur | Notes |
| --- | --- | --- | --- |
| Slider | 1 × 3 (ou 3 × 1, horizontal) | nombre | plage début/fin, en % ou en valeur, pas (127 crans, tous les 10…) |
| Rotatif | 1 × 1 (1 × 1,5 nommé) | nombre | même plage et pas que le Slider |
| Bouton | 1 × 1 | momentané | valeurs « allumé » / « éteint » ; Mémoriser / Restaurer |
| Interrupteur | 1 × 1 | marche/arrêt | glyphe allumé quand marche |
| Pad XY | 3 × 3 | deux nombres | deux plages, deux pas |
| Champ | 3 × 1 | texte ou nombre | saisi au service de texte caché |
| Menu | 2 × 1 | un choix dans une liste | sa liste ouverte suit le gabarit des listes d'eVe |
| Pads | 2 × 2 (4 × 4 demi-cases) | grille de boutons | chaque pad : sa réaction (notes 36…51 en série) |
| Clavier | 4 × 1,5 | notes + vélocité | octave et transposition réglables |
| Afficheur | 1 × 2 | reçoit seulement | niveau, nombre ; zones standard vert/jaune/rouge |
| Sélecteur | n × 1 | un choix parmi des boutons | le choisi enfoncé |
| Condition | 1 × 1 | — | visible en édition, invisible en lecture |
| Zone | libre (sur un objet) | entrée/sortie du doigt | visible en édition (voile lavande, sans bord), invisible en lecture |

Aspect (Q5, option 1) : l'aspect eVe par défaut (verre des outils, accent du slider, thème suivi, tailles sur la
grille, aucun libellé) ; chaque contrôle se personnalise comme un objet : couleur, taille, **sa propre image**.
Nom (Q15) : outil Nom du rail ; en haut sur une bande suivant ses coins, 9 caractères puis « … ».

### A2. Créer › Contrôles (Q3, Q5)

Rien regroupé ni enlevé dans Créer ; Contrôles est une case du rail de Créer (Créer passe à 12) qui ouvre **un
panneau** contre elle (maquette `q5_1`). Un outil s'arme ; un toucher dans l'aperçu, la Timeline ou une cellule pose.
Règle générale retenue : plus de 5-6 choix ⇒ un panneau, sans demander.

### A3. Édition et lecture (Q6)

- Lecture (Consultation, Performance) : les gestes vont au contrôle ; il ne bouge pas ; son maintien est un
  déclencheur (pas de Mystic).
- Édition : un toucher sélectionne (déplacer, redimensionner sur la grille) ; le rail montre ses outils, le premier
  **Action** ; une double touche ouvre Action directement.

### A4. Le panneau Action (Q7)

Une **rangée par réaction** : Quand · Cible (2 cases) · Message · Valeur ; « + » ajoute ; une case touchée ouvre
ses choix dans le panneau (← pour revenir). Un maintien sur une rangée : Suppr., Copier, Coller, **Bypass** dans la
bande du pied. Coller marche sur plusieurs contrôles.

### A5. Déclencheurs (Q8) — 14

Toucher · Relâcher · Double touche · Maintien · Glisser · Entrer/sortir (Zone, Pad) · Valeur changée · Seuil
franchi · **La lecture arrive** · **La lecture quitte** · À chaque temps/mesure · MIDI reçu · À l'ouverture ·
Minuteur. Chaque contrôle ne montre que ceux qui ont un sens pour lui. « Arrive » vaut aussi pour un départ ou un
saut à l'intérieur du clip ; « quitte » pour un arrêt ou un saut dehors ; en Cellules, départ et arrêt de sa cellule.
**Rien ne part au passage de la tête tant qu'aucune réaction n'utilise ces déclencheurs** (Q13).

### A6. Cibles (Q9) — 14 catégories

Dans le projet : Objets · Médias · Clips/cellules · Scènes · Pistes et tranches · Instruments · Bus MIDI ·
Contrôles · Projets (le courant, et ouvrir un autre) · Soi-même · Plusieurs par règle · Capture (caméra, magnéto).
Dehors : MIDI externe · Réseau (OSC, adresse web — à créer).

### A7. Messages et valeurs (Q10)

Messages : un outil d'atome (le catalogue des vrais outils) · un message MIDI (note, CC, programme, pitch bend,
aftertouch, start/stop/horloge) · une valeur fixe (couleur, taille, X/Y, texte) · Mémoriser / Restaurer.
Valeur : plage de sortie, courbe (linéaire, exponentielle, logarithmique), inverser, absolu/relatif,
« allumé »/« éteint » ; tout au curseur d'outil, tapable.

### A8. Retour et automation (Q12)

Le contrôle suit sa cible (première réaction) ; renvoi MIDI externe par réaction (éteint par défaut) ; gestes
enregistrés en automation dans la bande de son clip quand Enr. est armé (doigt posé = reprise en main) ; seule la
valeur au lâcher est écrite par le pipeline.

### A9. Temps : Timeline, Cellules, aperçu (Q13)

Posé dans l'aperçu : sa piste, clip du début à la fin du projet (suit la fin tant qu'il n'est pas raccourci).
Posé dans la Timeline : 4 mesures au dépôt. Dans une cellule : actif tant qu'elle joue. Hors de son clip : ni
visible ni actif. À l'arrêt : actif si la tête est sur son clip. Apparition/disparition **en fondu ou sèche**, au choix.
Couper, effacer une partie, déplacer : comme tout clip.

### A10. Lot (Q14)

Un panneau pour la sélection (« ≠ » sur une case qui diffère) ; numérotation en série (interrupteur) ; aspect,
plage, pas, fondu, nom, coller une réaction en lot ; sélection par le geste de lot existant.

### A11. Condition (Q15)

Rangées Quand · Si (Cible · État · comparaison · Valeur ; Et/ou ; +) · Alors · Sinon. Outil Script au pied :
le moteur de scripts existant (Ruby/Opal ou JavaScript, à part, non approuvé tant que pas Activé). La même brique
« si… sinon » sert d'étape dans la suite d'actions de tout contrôle. L'assistant remplit les rangées ou écrit le script.

### A12. Bus MIDI (Q11)

Tranche **Bus MIDI** : entrées (port, contrôle, tranche MIDI ; « + ») et sorties (port, instrument, tranche ; « + »),
répartition vers toutes ; les tranches MIDI des pistes ont les mêmes listes. Panneau d'une entrée/sortie soudé :
Canal, Dest., Transp., Plage (clavier de 128 notes aussi large que la console quand pressée), Suppr., Activé.

### A13. Voix et MCP (règles 21, 22, mémoire « toute action d'écran = commande »)

Chaque action du panneau a sa commande (créer un contrôle, ajouter/changer/supprimer/contourner une réaction,
nommer, lot, condition, bus) ; l'assistant l'exécute aussitôt, sans écran de confirmation.

## B. Briques existantes à réutiliser (jamais copier)

- Déclencheur → action : `eVe/intuition/runtime/interaction_model.js`, `interaction_runtime.js`, commandes
  `atome/src/squirrel/interactions/contracts.js`, panneau `bevy_panel_interaction_runtime.js`, catalogue d'outils
  `eVe/intuition/shared/main_menu_tool_catalog.js` → à **étendre** (déclencheurs, cibles, messages, valeurs,
  bypass, copier/coller), pas à doubler.
- MIDI appris : `eVe/intuition/runtime/midi_binding_runtime.js`, `midi_binding_service.js` (déclencheur MIDI reçu).
- Sorties MIDI : `eVe/domains/midi/midi_output_routing.js`, `midi_output_runtime.js`, `midi_instrument_route.js`.
- Console : `eVe/intuition/tools/molecule/kernel/mix_schema.js`, `mix_routing.js`, `mix_modules.js` (nouveau rôle
  bus MIDI) ; panneaux soudés `molecule_mix_open_panel.js`, `molecule_mix_welded_tools.js`.
- Curseur d'outil, rouleau, case de valeur : `bevy_ui_tool_slider.js`, `bevy_ui_slider_gauge.js`.
- Modes de projet : `eVe/domains/rendering/project_work_mode_state.js`.
- Timeline : `runtime_creation.js` (durée posée), bandes d'automation (R-312).
- Scripts : `eVe/domains/script/` (sandbox, confiance, éditeur).
- Lot : le geste de lot des pistes et cellules (`temp/track_batch_2026-11-24/` pour sa conception).
- Rendu : un seul renderer Bevy, BevyUI sur le canevas ; aucun bouton DOM (règle 1, module 01).

## C. Lots de code (dans l'ordre)

1. **L1 Modèle** : type d'atome `control` (+ `kind` pour les 13), ses propriétés (plage, pas, valeur, nom,
   aspect, fondu), schéma Rust source des types JS ; extension du modèle d'Interactions (réactions : déclencheur,
   cible, message, valeur, bypass) ; commandes MCP.
   **FAIT (24 nov.)** : `atome/src/shared/control_contract.js` (type `control`, 13 sortes, plage, pas, valeur, nom,
   aspect, présence/fondu, Zone, Condition ; `controlBirthProps`, `controlValueFor`) déclaré dans
   `core_atome_types.js` et régénéré dans `eVe/registry/generated/atome_types.json` (lu par `type_gate.rs`) ;
   réactions `eVe/intuition/runtime/interaction_reaction_model.js` (12 déclencheurs ajoutés et leurs réglages,
   cibles MIDI port / bus MIDI / réseau, messages outil · MIDI · valeur fixe · mémoire, `value_map`,
   `feedback_midi`) dans `interaction_model.js` ; `interactions.*` élargi ; nouvelle famille `controls.list` /
   `create` / `update` (`atome/src/squirrel/controls/contracts.js`, `eVe/domains/controls/control_commands.js`).
   Les messages non-outil sont refusés explicitement (`interaction_message_runtime_missing`) jusqu'à L5.
   Preuves : `temp/widgets_spec_2026-11-24/l1_model_probe.mjs` (80 vérifications) et `l1_interactions_probe.mjs`.
   Le serveur 3001 n'accepte `control` qu'une fois atome-server recompilé (au prochain build partagé).
2. **L2 Rendu** — FAIT le 24 nov. : les 13 contrôles dans Bevy (aspect eVe, image propre, nom en haut). Le contrôle
   reste l'objet de la scène, dessiné transparent. Sa face (`eVe/domains/rendering/control_face.js`, briques
   canoniques : outil, fader de la console, barre de niveau, anneau GPU, fond enfoncé du slider) est projetée en
   records juste après lui (`control_projection.js`). Les pièces sont dans son plan et sa page, tournent et
   grandissent avec lui, suivent le chemin rapide des gestes et laissent passer le toucher. En Consultation, la
   Condition disparaît et la Zone se touche sans se voir. Le thème et le mode relancent le rendu. Trois icônes ont
   été ajoutées : `control_button`, `control_toggle`, `control_condition`.
   **La présence par le clip et le fondu passent en L7**, qui crée le clip du contrôle.
   Preuves : `temp/widgets_spec_2026-11-24/l2_face_probe.mjs` (272 vérifications, ordre d'empilement) et
   `l2_pixels.probe.mjs` (vrai renderer, serveur isolé, images `l2_out/1_edit.png`, `2_consultation.png`,
   `3_turned.png`).
3. **L3 Gestes** en lecture et en édition ; Créer › Contrôles (panneau `q5_1`) ; outil Action du rail.
4. **L4 Panneau Action** (`q7_A`) : rangées, choix des déclencheurs, cibles, messages, valeurs ; maintien
   (Suppr., Copier, Coller, Bypass).
5. **L5 Exécution** : les 14 déclencheurs (dont lecture arrive/quitte, temps, seuil, minuteur, MIDI reçu), les
   14 cibles, les 4 messages, la correspondance des valeurs, Mémoriser/Restaurer.
6. **L6 Retour et automation** : suivi de la cible, renvoi MIDI, écriture d'automation, persistance au lâcher.
7. **L7 Timeline et Cellules** : dépôt (fin du projet / 4 mesures / cellule), coupe et effacement ; présence du
   contrôle par son clip et fondu (`presence.fade`, `fade_ms`), venus de L2.
8. **L8 Condition** : rangées, script (moteur existant), étape « si… sinon ».
9. **L9 Bus MIDI** : rôle de tranche, entrées/sorties, panneau soudé, clavier de Plage.
10. **L10 Lot** : panneau commun, « ≠ », numérotation en série.
11. **L11 Tout objet interactif + Zone**.
12. **L12 Réseau** (OSC, adresse web) : à créer ; les envois vers dehors suivent la règle 22 (redemande dans la
    conversation seulement pour ce qui part vers d'autres personnes).

**L3–L12 FAITS (24 nov.)** — preuves sous `temp/widgets_spec_2026-11-24/` :
- L3 gestes (`l3_gesture_probe.mjs`), L4–L5 panneau Action et exécution (`l5_reactions_probe.mjs`), L6 retour et
  automation (`l6_automation_probe.mjs`), L7 présence par le clip (`l7_presence_probe.mjs`), L8 Condition
  (`l8_condition_probe.mjs`, pixels `l10_out/04_condition.png`).
- L9 bus MIDI : `kernel/mix_midi_endpoints.js` (listes d'entrées/sorties dans IN/OUT de la tranche, filtre canal, plage,
  transposition, canal de destination), `eVe/domains/midi/midi_bus_runtime.js` (routage, boucle coupée à 8 sauts), colonne
  et panneau soudé `molecule_mix_midi_lists.js` / `_actions.js` / `_range.js` (clavier de 128 notes sur la dalle, bornes
  dans leurs cases) ; sondes `l9_midi_bus_probe.mjs` (33), pixels `l9_pixels.probe.mjs` → `l9_out/`.
- L10 lot : `control_batch.js` (ordre de lecture, « ≠ », Série), Action et Réglages en lot, Nom en lot
  (`control_rename.js`, outil `ui.control.rename`, rail « Nom ») ; sonde `l10_l11_probe.mjs`, pixels `l10_pixels.probe.mjs`.
- L11 : l'outil Action dans le rail de tout objet (`context_menus.json`) ; un doigt qui glisse sur une Zone depuis
  ailleurs déclenche Entrer/Sortir (`control_zone_roaming.js`).
- L12 réseau : `atome-server/src/network/` (OSC UDP, HTTP), `ws_api/network_ops.rs` (central : OSC refusé, adresses
  publiques, 600/min par compte), `AdoleAPI.network.send` (`adole_api/network.js`) ; message discret si l'OSC est
  refusé sur le Web ; sonde `r347_l12_network_probe.mjs`, tests Rust `cargo test -p atome-server --lib network`.

Chaque lot : `npm run check:rust` / `npm run check:js`, sonde ciblée sous `temp/`, pixels Playwright pour l'UI.
Fichiers partagés (console, Molecule, `Cargo.toml`, moteurs) : couloir demandé à l'orchestrateur avant d'y toucher.
