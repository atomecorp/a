# Mystic Dashboard — audit, challenge et plan de refonte (23 oct. 2026)

Statut : **audit terminé, aucune ligne de code modifiée**. Prochaine étape : réponses de l'utilisateur aux
questions bloquantes du §4, puis maquettes écran par écran (une à la fois, PNG, vrais jetons, « validé » explicite
avant tout code).

Suivi des maquettes :
- 24 oct. — **M5 navigation A/B/C** soumise : `temp/mystic_dashboard/mockups/M5_nav_rubrique.png` (rubrique réelle
  « Nouvel objectif », 16 objectifs) et `M5_nav_panneau.png` (carte d'événement réelle). Pixels réels de l'app
  déplacés (`compose.mjs` + `spec_nav_*.mjs`), aucun élément redessiné.
- 24 oct. — **Retour de l'utilisateur sur M5** : variante **C** retenue sur la rubrique (‹ bas-gauche, › bas-droit au
  pied, grande flèche actuelle). Version « panneau » de C **refusée** : l'Atom rangé ne quitte JAMAIS le coin bas-droit
  (repère pour les malvoyants), et le champ prend toute la largeur libre, jamais une largeur minimale. Ordre du pied :
  `[‹] [champ extensible] [›] [Atom]`. Q4 tranchée ; Q6 tranchée (pas de case vide réservée, le champ s'étend).
- 24 oct. — **Planche de proposition unique** soumise : `temp/mystic_dashboard/mockups/M5_nav_proposition.png`
  (`spec_nav_final.mjs`) : rubrique page 1, dernière page sans ›, carte d'événement avec l'Atom au coin et sans Retour
  dans la bande. **VALIDÉE par l'utilisateur le 24 oct.** Cas non dessiné mais entendu : Retour + Suivant + Atom =
  `[‹] [champ] [›] [Atom]` (l'Atom ne bouge jamais). Choix par défaut acceptés : Atom à droite aussi pour un gaucher,
  Envoyer collé à droite du champ, › = page suivante (‹ reprend la page précédente puis remonte).

Légende : **[C]** constat lu dans le code (fichier:ligne), **[H]** hypothèse, **[P]** proposition.

---

## 1. Ce qui existe déjà (constats)

### 1.1 Un seul accueil pour Pro et Basic — déjà vrai
- [C] Un seul gabarit `dashboard_eve` (`eVe/domains/templates/first_launch_template_catalog.js:273-298`) et un seul
  runtime (`eVe/domains/dashboard/dashboard_mystic_runtime.js`) servent les styles `eve` (Pro) et `eve_basic` (Basic).
  Chaque case porte une place Pro et une place `basic`.
- [C] Basic = mêmes cases, placées autrement, montrées selon la progression (`dashboard_progression_catalog.js:14` :
  base = Contacts, Agenda, Objectifs ; palier 2 Activité ; palier 3 Médiathèque, Capture ; palier 4 le reste).
- [P] « Mystic Dashboard » = **nom produit** de cet accueil unique. Pas de nouveau gabarit : `dashboard_eve` évolue.
  Le code s'appelle déjà `dashboard_mystic_*`. Attention : l'ancien gabarit `dashboard_mystic` (v5, 13 oct.) est
  obsolète — risque de confusion de nom (voir Q8).

### 1.2 La grille LEGO réelle
| Élément | Valeur | Source |
| --- | --- | --- |
| Unité de base | 60 px | `eVe/elements/system_ui_tokens.js:7,45-47` |
| Tuile (dalle) | 2 unités = 120 px max, jamais agrandie, réduite seulement si l'écran l'impose | `dashboard_mystic_geometry.js:70` |
| Espacement accueil | 8 px (marge 8) | `eVe/elements/skin/dashboard_skin.js:70-75` |
| Outil Mystic standard | 60 px, espacement **4 px** | `eVe/elements/skin/tool_skin.js:47,109` |
| Demi-plaque (outils de l'appui long) | moitié du **côté** = quart de la surface : `(120−4)/2 = 58 px`, 4 par tuile | `dashboard_mystic_grid.js:161-185` |
| Bandeau heure/météo | 1 unité (½ tuile), 3 colonnes (2+1) | catalog:274-275 |
| Pied (recherche) | 1 unité, 3 colonnes | catalog:295, geometry.js:105-108 |
| Titre de rubrique | `round(tuile × 0,3)` sous le bandeau | geometry.js:74 |
| Formes | portrait 3×5, paysage 5×3, paysage « une ligne » (bandeau + recherche sur la même ligne) | `dashboard_mystic_grid.js:49-86` |

- [C] iPhone 15 portrait → tuile 120 (119 avec titre) ; iPhone 14 → 117/110 ; iPhone couché → 97 (forme « une ligne ») ;
  iPad/bureau → 120 en 5×3 centré.
- [C] **Aucun module multi-cases** sur l'accueil : toutes les tuiles sont 1×1 (`dashboardHomeCell`, grid.js:37-40),
  seuls l'horloge (2 colonnes) et la recherche (3 colonnes) s'étendent. Les « listes » (sons, prises, répertoire,
  sélecteur santé) sont des **panneaux Bevy canoniques posés sur la scène** (la zone des 12 tuiles du haut), pas des
  modules de grille.
- [C] Pas de défilement dans la grille : le débordement devient des **pages**. Pas de réorganisation par glisser :
  un glisser sur une tuile ouvre sa rubrique ; l'appui long (600 ms) montre ses outils en demi-plaques.
- [C] Slider : `ToolSlider` DOM (`tool_slider_builder.js`) et Bevy (`eVe/intuition/shared/bevy_ui_tool_slider.js`,
  compact en bas, grandit vers le haut, `reverse` pour l'autre sens, longueur ×3). Le slider qui **suit la direction du
  geste** n'existe que dans la loupe linéaire du ruban/rail (`bevy_ui_linear_menu_lens_*.js`). **Aucun slider sur
  l'accueil** aujourd'hui (la cible d'un objectif passe par une saisie de valeur).

**Incohérence LEGO n°1** [C] : tuile 120 + espacement 8, mais outil 60 + espacement 4 → deux outils + un espacement =
124 ≠ 120. Les demi-plaques de l'appui long (58 px, espacement 4) ne s'alignent pas sur les joints de 8 px des tuiles.
Aujourd'hui on ne voit pas le défaut parce que tuiles et demi-plaques ne cohabitent jamais à l'écran.

### 1.3 La navigation actuelle
- [C] Entrer dans une rubrique : la tuile touchée **devient** la case Retour (`dashboardMysticGrid`, grid.js:139-159).
  À chaque sous-niveau, le Retour **se déplace** sur la plaque choisie (`anchorAt`, `bevy_ui_mystic_activation.js:68`,
  runtime:251-257). Retour = chevron nu à halo cyan, sans plaque (`bevy_ui_navigation_arrow.js`).
- [C] Pages : `TURN_CELLS = { previous: 'projects', next: 'last_project' }` (grid.js:17). **Les deux coins bas de la
  grille sont déjà les flèches « page précédente ‹ » et « page suivante › »**, avec le même chevron que Retour.
  Capture réelle : page 2 des Objectifs = deux « ‹ » identiques à deux endroits (`temp/navigation_arrow/out/objectives_p1.png`).
- [C] Pas de « Avancer » : revenir en arrière jette le niveau (`activation.js:27`). Les seules histoires « avant/arrière »
  sont les balayages latéraux de la scène (vidéos, aperçu Médiathèque, actualités, conversations —
  `dashboard_media_navigation.js`).
- [C] Gestes à garder : appui long sur Retour = accueil ; toucher le titre = accueil ; immobilité 750 ms sur Retour =
  retour (doigt tenu) ; `centerReturnArmed` empêche qu'un Retour posé sous le doigt referme au lâcher.
- [C] Panneaux sur la scène : bande d'outils d'1 unité **juste au-dessus du pied**, alignée à droite, Retour = premier
  outil à droite (`dashboard_surface_tools.js:65-68`, règle du **23 oct. 2026**). Dans l'agenda, Retour = « Annuler »
  (libellé `band_cancel`, `dashboard_calendar_surface.js:21`).
- [C] Coin bas-droit déjà occupé quand un panneau est ouvert : **Atom amarré** (bas-gauche pour un gaucher), bouton
  Envoyer, pastille de messages en attente (`dashboard_mystic_geometry.js:105-121`, `dashboard_communication_input.js:124-129`).
- [C] Le placement du Retour de l'accueil est **propre au Dashboard** (`dashboardMysticGrid`, `readCells`, `TURN_CELLS`,
  `orderDashboardSurfaceTools`). Le Mystic projet et le rail ne partagent que le moteur Mystic générique (activation,
  dwell, pointeur — derrière `state.grid`) et le dessin de la flèche. **Intuition confirmée : les outils projet ne
  bougent pas**, à condition de garder toute modification dans les fichiers dashboard ou derrière `state.grid`.

### 1.4 Retour lumineux (pistes Launchpad)
- [C] Tuiles d'accueil au repos : **aucune lumière au toucher**. L'appui long estompe l'icône (180 ms, codé en dur) puis
  compte 3-2-1.
- [C] Plaques Mystic : plaque survolée éclaircie vers le blanc (`MYSTIC_HOVER_LIFT 0,55`, **codé en dur** dans
  `intuition_mystic_menu_renderer.js:57`), instantané, couleur de **famille d'outil**, pas de rubrique.
- [C] Halo `lit` cyan qui respire (`tool_skin.js:117-149`) : animé par un `setTimeout` 40 ms tant qu'un outil est allumé
  → **Bevy tourne à ~25 images/s en continu** ; la flèche de navigation respire toujours. Aucun code JS de lumière ne
  passe par `AtomeFrameDemand`.
- [C] `prefers-reduced-motion` respecté presque partout, sauf la croissance du centre tenu (`bevy_ui_mystic_motion.js:137`).

### 1.5 Centralisation des styles — verdict
**Bien centralisé** : matière des tuiles (verre, dégradé de rubrique, liseré, glyphe, libellé) dans
`dashboard_skin.js:6-88` ; verre et ombre dérivés d'une source (`dashboard_glass_material.js`) ; palettes de base
(`eVe/elements/skin/tokens.js:28-48`) ; jetons du disque (`dashboard_eve_tokens.js`) ; jetons Mystic.

**Pas centralisé** (à corriger avant la refonte, sinon chaque écran refait ses chiffres) :
1. Typographie : 158 tailles `scalePx(N)` en dur dans 17 fichiers (Sport, création, horloge, météo en tête) ; 27 graisses
   en dur sans échelle (300 à 800) ; `labelText.font_weight: 800` jamais lu, le vrai libellé est un 700 en dur.
2. Métriques en double : taille de tuile dérivée de deux façons (`doubleUnitPx` vs `toolboxSquareSizePx × 2`) ;
   espacement 8 (accueil) / 8 (ruban) / 4 (Mystic, demi-plaques) ; 4 rayons différents ; hauteur du bandeau de libellé
   en px bruts (24/42) hors jetons.
3. Opacités « fantôme/désactivé » : 0,45 / 0,45 / 0,4 / 0,4 dans quatre fichiers.
4. Couleurs de rubrique en **deux sources** (`RUBRIC_FAMILIES` dans `dashboard_mystic_colors.js:12-20` et
   `default_values/constants.json`) ; **Boutique absente** → retombe sur la couleur système ; « création » a **trois
   couleurs** différentes selon le système (or, violet, rose `#d14d78`).
5. Littéraux répétés : `texture_scale: 2` ×26, `'rgba(0,0,0,0)'` ×16 (alors que `clear` existe), formules horloge/météo
   copiées, sous-titres en px bruts.
6. Jetons morts : `labelText.stroke_*/shadow_*/padding_*/font_weight`, `cardMutedText`, `contactPlaceholderBackground`.
7. Taille de fichiers : `dashboard_mystic_runtime.js` **602 lignes (> 500, interdit de grossir)** — or c'est lui que la
   navigation doit modifier ; `dashboard_eve_atom.js` 500 pile ; `dashboard_health_modules.js` 497.

---

## 2. Challenge du cahier des charges

1. **« Bas gauche / bas droite » désigne deux endroits possibles, et le choix de taille A/B en dépend.**
   - Option **Pied** : Retour et Avancer encadrent le champ du bas, au format **outil** (60 px = exactement la hauteur
     du pied). `[‹] [ Rechercher… ] [›]`.
   - Option **Grille** : Retour et Avancer prennent les cases `[5,0]` et `[5,2]` (aujourd'hui Projets et Dernier projet,
     c.-à-d. déjà les cases de page), au format **tuile**.
   - Format intermédiaire (C) : seulement dans l'option Pied (par ex. 1 unité de haut × 1,5 de large).
   - **Ma recommandation : Pied.** C'est le seul endroit présent sur **tous** les écrans (rubriques, panneaux sur scène,
     prises, lecteur) : la scène couvre les rangées de tuiles, jamais le pied. Un seul Retour pour tout le Dashboard, à
     la même place partout. Les 13 cases restent au contenu. 60 px > 44 px tactile. Le champ garde ~240 px sur iPhone.
   - Option Grille : plus massive et lisible, mais sur un panneau ouvert la case `[5,0]` est sous la scène → il faut
     un second Retour ailleurs, ce qui casse « même place partout ».

2. **« Avancer » n'a pas de sens défini aujourd'hui.** Il n'existe ni historique avant, ni pile gardée. Trois modèles :
   - **(a) Modèle navigateur (recommandé)** : les pages font partie du chemin. Retour = page précédente, puis niveau
     parent ; Avancer = page suivante. Il disparaît (case vide réservée) quand il n'y a rien après. Cela supprime le
     double « ‹ » et libère les cases de page.
   - (b) Vrai historique avant (revenir dans le niveau qu'on vient de quitter) : nouvelle pile à créer, et conflit
     avec « page suivante » quand les deux existent.
   - (c) Les deux selon le contexte : imprévisible, je le déconseille.

3. **La règle du 23 oct. (Retour = premier outil à droite de la bande) serait remplacée le jour même.** Si le Retour
   passe en bas à gauche du pied, la bande ne porte plus de Retour du tout. À confirmer explicitement. Dans l'agenda le
   Retour est déjà « Annuler » : je propose **Retour = Annuler partout** (une seule sortie sans enregistrer), la bande
   garde les actions (Supprimer, Garder, Envoyer…).

4. **Le coin bas-droit est déjà pris** (Atom amarré, Envoyer, pastille). Il faut leur trouver une place :
   - [P] Atom amarré → **extrémité gauche de la bande d'outils** (la bande est alignée à droite, sa gauche est libre ;
     même rangée sous le pouce) ;
   - [P] Envoyer et la pastille → **dans** le champ (icônes à ses extrémités).

5. **Gaucher.** Aujourd'hui l'Atom, Envoyer et le × des panneaux se mettent en miroir. [P] **Ne pas mettre
   Retour/Avancer en miroir** : « ‹ à gauche = arrière » est un sens spatial, pas une question de main.

6. **La sécurité du doigt est conçue pour un Retour sous le doigt.** `centerReturnArmed`, `grid.release`, le dwell
   750 ms et l'animation de niveau supposent que le Retour arrive là où on vient de toucher. Avec un Retour fixe,
   c'est une **plaque de contenu** qui arrive sous le doigt (remplissage par distance, à garder). Il faut redéfinir la
   règle : « lâcher sur la plaque qui vient d'apparaître sous le doigt ne la lance pas tant que le doigt ne l'a pas
   quittée ». Le glisser-naviguer (doigt tenu) obligera à aller jusqu'au coin : plus long, mais stable.

7. **Grille LEGO.** Pour que 2 outils + 1 joint = 1 tuile exactement, il faut `outil = (tuile − joint) / 2` =
   **56 px** à 120/8, et un seul joint (8) partout sur l'accueil. [P] Ne pas toucher l'outil Mystic de 60 px du **projet**
   (partagé) : le module « outil compact » de l'accueil devient une demi-tuile de la grille d'accueil, dérivée des
   jetons de la grille. C'est la décision « demi-tuile » demandée : **moitié du côté, quart de la surface.**

8. **Listes et modules allongés : pas de besoin actuel sur l'accueil.** Aujourd'hui ce sont des panneaux sur la scène,
   et ça marche. [P] Définir maintenant le **contrat** (cases avec `row_span`/`column_span`, collisions, pages) et les
   jetons, mais ne l'implémenter que quand un écran validé en a besoin. Ne pas réécrire des panneaux qui fonctionnent.
   Candidats naturels à discuter écran par écran : favoris Contacts en liste horizontale 3×1, Sons en liste verticale,
   moniteurs en module 2×1.

9. **Sliders directionnels** : le composant qui suit le geste existe (loupe du ruban), mais pas sur l'accueil. [P] Le
   réutiliser tel quel (jamais un contrôle générique) aux seuls endroits où une valeur se règle : cible d'objectif,
   volume du lecteur, heure d'un événement (le panneau agenda a déjà son propre slider).

10. **Launchpad et performance.** La respiration actuelle (`setTimeout` 40 ms) garde Bevy à ~25 images/s indéfiniment.
    [P] Un éclat au toucher doit être **bref et événementiel** (montée ~80 ms, décroissance ~250 ms, puis zéro image),
    jamais une respiration permanente, et nul avec réduction des animations. Décision à prendre : la lumière prend la
    couleur de la **rubrique** (cohérent avec la tuile) ou de la **famille d'outil** (comme les plaques Mystic
    aujourd'hui) — aujourd'hui les deux coexistent.

11. **Grand écran / paysage** : en paysage le « coin bas-gauche » de la grille est l'Agenda, et sur un téléphone couché le
    pied est partagé avec le bandeau. Avec l'option Pied, la règle est simple : Retour au début du pied, Avancer à sa
    fin, quelle que soit la forme. [P] Sur iPad/bureau, coins du **bloc centré** (pas de l'écran) pour rester liés au
    contenu.

12. **Non-régressions à surveiller** (règles déjà données) : un geste de l'accueil ne ramène jamais à l'accueil sauf titre
    / appui long Retour ; appui long partout = outils contextuels de l'élément, jamais le Mystic complet ; un seul
    chevron `previous.svg`/`next.svg` à halo ; aucun texte ajouté (zen).

---

## 3. Plan par lots (rien ne commence sans « validé »)

| Lot | Contenu | Écran visible changé ? | Validation |
| --- | --- | --- | --- |
| **0 — Fondations** | Bloc de jetons « grille » unique (unité, tuile, outil = (tuile−joint)/2, joint, rayons) ; échelle typographique (tailles + graisses) ; opacités ; **une seule** table de couleurs de rubrique (Boutique ajoutée, « création » tranchée) ; suppression des jetons morts ; `clear`/`texture_scale` factorisés ; **découpe de `dashboard_mystic_runtime.js`** (602 → < 500) avant d'y toucher | Non (pixels identiques) | Sondes avant/après, captures comparées pixel à pixel |
| **1 — Maquettes navigation** | M4 (plusieurs niveaux), M5 (A/B/C), état racine/pages/panneau | — | Une maquette à la fois |
| **2 — Navigation des rubriques** | Retour/Avancer fixes dans le Mystic de grille (propriétaire dashboard), modèle (a), sécurité du doigt redéfinie, Basic | Oui | Agenda, Contacts > Rencontre (3 niveaux), Objectifs (2 pages), Basic base |
| **3 — Navigation des panneaux** | Retour sort de la bande vers le pied ; Atom amarré et Envoyer replacés ; Retour = Annuler | Oui | Un design validé couvre les ~22 panneaux (même composant), chacun vérifié par sonde |
| **4 — Outils de l'appui long** | Demi-plaques alignées sur la grille LEGO + même Retour fixe | Oui | Maquette + sonde d'appui long sur tuiles, contacts, événements, projets |
| **5 — Lumière Launchpad** | Éclat au toucher, état actif, niveau choisi sur M6 | Oui | Maquette M6, mesure images/s au repos (= 0) |
| **6 — Formats LEGO** | Listes/modules allongés/sliders, uniquement écran par écran quand validé | Selon écran | Une maquette par nouveau format |
| **7 — Formes** | Paysage, iPad, bureau, téléphone couché | Oui | Maquette M7 + `temp/dashboard_responsive` |

Chaque lot : propriétaires réutilisés, sonde ciblée sous `temp/mystic_dashboard/`, captures Playwright réelles,
aucune modification des fichiers Mystic génériques hors `state.grid`, cartes mises à jour.

## Maquettes prévues (dans l'ordre)
M1 accueil iPhone portrait (état actuel + grille LEGO cotée) · M4 navigation sur 3 niveaux et 2 pages · M5 tailles A/B/C
· panneau sur scène avec le nouveau pied · M6 lumière (4 niveaux : rien / liseré / remplissage de rubrique / éclat pad)
· M2 listes horizontales/verticales (si retenues) · M3 slider compact → étendu (3 sens) · M7 paysage + iPad.

---

## 4. Questions bloquantes (voir réponse en conversation)

- **Q1** Emplacement : Pied (format outil) ou Grille (format tuile) ? Reco : Pied.
- **Q2** Sens d'« Avancer » : (a) navigateur, (b) historique avant, (c) les deux ? Reco : (a).
- **Q3** La règle du 23 oct. (Retour à droite de la bande) est-elle remplacée ? Et Retour = Annuler partout ?
- **Q4** Nouvelle place de l'Atom amarré, d'Envoyer et de la pastille ? Reco : Atom à gauche de la bande, Envoyer et
  pastille dans le champ.
- Q5 Gaucher : pas de miroir pour Retour/Avancer ? (reco : oui, pas de miroir)
- Q6 À la racine de l'accueil : cases de navigation réservées vides (champ de largeur constante) ou champ pleine
  largeur ? (reco : réservées, stabilité)
- Q7 Lumière : couleur de rubrique ou de famille d'outil ? (à trancher sur M6)
- Q8 Supprimer d'abord l'ancien gabarit `dashboard_mystic` obsolète pour éviter la confusion de nom ?

---

## 5. Tableau de suivi exhaustif (écrans recensés depuis l'accueil eVe Pro, Basic indiqué)

Décisions : **N** = navigation à adapter seulement (Retour/Avancer fixes) · **C** = conserver tel quel · **A** = adapter
(détail) · **E** = à étudier avec l'utilisateur. Statut de tous les écrans : *à valider*. Priorité = ordre des lots.

| # | Écran | Propriétaire | Sortie aujourd'hui | Décision | Détail / risque | Lot |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Accueil, disque seul (`solo`) | `dashboard_eve_atom.js` | — | C | Pas de navigation à la racine (Q6) | 2 |
| 2 | Accueil, grille 3×5 Pro | `dashboard_mystic_runtime.js`, catalog | — | A | Cases du pied réservées (Q6), lumière (lot 5) | 2/5 |
| 3 | Accueil Basic (base + paliers + moniteurs choisis) | `dashboard_mystic_grid.js:24-35` | — | A | Rangée du bas cachée tant que non gagnée : la navigation au pied l'évite | 2 |
| 4 | Assistant ouvert (`open`) + sous-titres | `dashboard_eve_atom.js`, `dashboard_eve_captions.js` | 3 touchers, à côté, glisser | E | Avancer/Retour ont-ils un sens ici ? Champ « Écrivez-moi » au pied | 2 |
| 5 | Propositions de l'Atom (Réglages / Déconnexion) | `dashboard_eve_assistant_choices.js` | Annuler au-dessus | C | Pied rouge à la déconnexion : vérifier la cohabitation avec ‹ › | 3 |
| 6 | Rubrique Agenda (+ Nouvel événement, import) | `dashboard_mystic_sources.js:288` | Retour à la place d'Agenda | N | — | 2 |
| 7 | Carte d'événement (Supprimer, Garder) | `dashboard_calendar_surface.js` | Bande, Retour = Annuler | N | Déjà Retour = Annuler | 3 |
| 8 | Rubrique Contacts (Moi, Cercle Sommeil, favoris, imports, Contacter à côté) | sources:253-265, grid.js:119-129 | Retour à la place | N/A | La case « à côté du Retour » (Contacter) n'a plus de sens si le Retour bouge : nouvelle place | 2 |
| 9 | Fiche Moi (panneau `home`) | `bevy_panel_home_runtime.js` (505 l.) | Bande Retour | N | Fichier > 500 | 3 |
| 10 | Création de contact (Annuler + Valider) | runtime:170 | Bande | N | Annuler → Retour fixe | 3 |
| 11 | Répertoire (filtre) | runtime:177 | Bande | N | — | 3 |
| 12 | Rencontre (but → thème → portée → personnes → carte) | `dashboard_meeting.js`, `_card.js` | Retour à chaque niveau | N | Meilleur test de profondeur (4 niveaux) | 2 |
| 13 | Contacter (carte d'appel) | `dashboard_first_contact.js:52-62` | Annuler + Contacter | N | — | 3 |
| 14 | Conversation (balayage d'en-tête entre discussions) | `bevy_panel_contact_conversation_*` | Bande | N/E | Avancer ≠ discussion suivante (balayage gardé) | 3 |
| 15 | Rubrique Moniteurs (+ ajouter) | sources:301-312 | Retour à la place | N | — | 2 |
| 16 | Détail santé | sources:306, `bevy_panel_health_detail_view.js` | Bande ; ‹ › internes | N/E | Flèches internes au panneau = même chevron : ambiguïté avec Avancer | 3 |
| 17 | Sélecteur de moniteurs (Annuler + Valider) | `dashboard_health_modules.js` (497 l.) | Bande | N | Fichier limite | 3 |
| 18 | Rubrique Médiathèque (Images, Vidéos, Sons ; favoris, Mes…, En ligne, Importer) | `dashboard_library*.js` | Retour à la place | N | Candidat liste (E) | 2/6 |
| 19 | Aperçu média (Insérer, Favori, Lecture) | `dashboard_library_preview.js` | Bande ; balayages | N | Balayages gardés | 3 |
| 20 | Lignes de sons | `dashboard_library_sounds.js` | Bande | N/E | Candidat liste verticale | 3/6 |
| 21 | Rubrique Activité (Sport, Spectacles, Liste de courses) | sources:411-415 | Retour à la place | N | « Spectacles » = bouchon | 2 |
| 22 | Sport : Favoris, Programme, Musculation (zones → exercices), Cardio, Semaine, Journal | `dashboard_training*.js` | Retour à chaque niveau | N | 3 niveaux | 2 |
| 23 | Carte d'exercice / séance (Journal, Stop, Pause, Passer) | `dashboard_training_card*.js`, `_session*.js` | Bande | N/E | Typo en dur la plus dense (lot 0) ; candidat slider | 3 |
| 24 | Programme, Semaine (Planifier), Journal | `dashboard_training_program/week/journal.js` | Bande | N | — | 3 |
| 25 | Liste de courses (panier, arbre produits, scan, fiche) | `dashboard_shopping*.js` | Bande | N/E | Cases propres sur la scène | 3 |
| 26 | Rubrique Objectifs (2 pages, Nouvel objectif) | `dashboard_progression_items.js` | Retour à la place ; pages | N | Cas du double « ‹ » | 2 |
| 27 | Page Sommeil (`cover: footer`) | `domains/programs/sleep_page.js`, stage.js:313 | Outils dans le pied | N/E | Seul écran dont les outils sont déjà au pied : collision directe | 3 |
| 28 | Rubrique Boutique (« Créer une boutique ») | sources:362 | Retour | E | Bouchon, couleur de rubrique manquante | 2 |
| 29 | Rubrique Divertissement (TV, YouTube, Livre, Livre audio, musique) | `dashboard_stage_media.js:94-118` | Retour | N | — | 2 |
| 30 | Lecteur TV/YouTube (J'aime, Favori, Idées, Pause) | `dashboard_stage_media.js` | Bande ; plein écran au toucher | N/E | Plein écran : où est le Retour ? | 3 |
| 31 | Liseuse livre / livre audio (Précédent/Suivant chapitre) | `dashboard_books.js` | Bande | E | « Suivant chapitre » vs Avancer : à distinguer | 3 |
| 32 | Rubrique Plan (trajets, nouveau trajet) | sources:407 | Retour | N | — | 2 |
| 33 | Scène GPS (Localiser, Rechercher, Démarrer…) | `domains/gps/gps_stage_presentation.js` | **Pas de Retour dans la bande** | A | Trou actuel : le Retour fixe le comble | 3 |
| 34 | Rubrique Projets (Pro : éditeur ; Basic : éléments) | sources:314-328 | Retour | N | Était la case « page précédente » | 2 |
| 35 | Vue d'un élément de projet (Basic) | `dashboard_project_items.js` | Bande | N | — | 3 |
| 36 | Dernier projet (Pro : ouvre ; Basic : rubrique) | runtime:126 | — / Retour | N | Était la case « page suivante » | 2 |
| 37 | Rubrique Capture (Photo, Vidéo, Audio, Texte, MIDI) | stage.js:337-341 | Retour ; la tuile devient Fermer/Stop | N/E | La tuile Capture qui ferme la scène : garder ? | 2 |
| 38 | Session de capture + liste des prises | `dashboard_capture_session.js`, `dashboard_takes_list.js` | Bande | N | Règle des prises gardées d'office inchangée | 3 |
| 39 | Choix des personnes (Envoyer) | `dashboard_people_picker.js` | Bande | N | — | 3 |
| 40 | Rubrique Créer (Texte, Dessin, Forme, Image, Générateur) | sources:345-358 | Retour | N | — | 2 |
| 41 | Surface de création (Couleur, Taille, Police/Pinceau, Annuler, Valider) | `dashboard_create_surface.js` | Bande ; sous-bandes | N/E | Sous-menus qui remplacent la bande : Retour = sortir du sous-menu ? | 3 |
| 42 | Météo (surface) | `dashboard_news_modules.js:71,173` | Bande Retour | N | — | 3 |
| 43 | Recherche (7 portées, résultats en direct, Finder) | `dashboard_mystic_search.js`, runtime:584-592 | Retour au centre | N | Clavier ouvert : pied au-dessus du clavier | 2 |
| 44 | Messages en attente (pastille) | `dashboard_pending_messages.js` | Bande | N/A | Pastille à replacer (Q4) | 3 |
| 45 | Demande de contact (Bloquer, Refuser) | `dashboard_contact_request.js` | Bande | N | — | 3 |
| 46 | Publication d'actualité (J'aime, Partager, Relayer…) | `dashboard_news_publication.js` | Bande ; balayages | N | — | 3 |
| 47 | Détail de notification | stage.js:273 | **Pas de bande** | A | Même trou que GPS | 3 |
| 48 | Réglages (10 briques → panneau `home`) | sources:96-99, 336-342 | Bande Retour | N | — | 3 |
| 49 | Outils de l'appui long (tuiles et plaques) | `dashboard_mystic_item_actions.js`, grid.js:161-185 | Pas de Retour (`anchorClear`), pages aux quarts lointains | A | Alignement LEGO + Retour fixe | 4 |
| 50 | Sélecteur de valeur (cible d'objectif) | `dashboard_progression_items.js:42` | — | E | Candidat slider directionnel | 6 |
| 51 | Connexion / invité / accueil / parcours Sommeil / programme (`first_launch_*`) | `domains/user/first_launch_runtime.js` | Retour/Valider propres | E | Hors Dashboard ; même langage ? à décider plus tard | — |

Écrans orphelins ou bouchons repérés : rubrique `notifications` jamais ouverte (source morte probable), « Spectacles »,
« Créer une boutique », capture d'écran désactivée, commentaire périmé « edits the tile » (runtime:65).
