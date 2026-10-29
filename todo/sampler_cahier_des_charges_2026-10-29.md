# Sampler eVe — cahier des charges (29 oct. 2026)

Statut : **cahier à valider, rien n'est codé.** Il précise le Sampler du plan
`todo/synthe_sampler_briques_2026-10-29.md` (§10–11), dont il reprend les décisions (Q1–Q13, S1–S2 validées).
Le code commence quand le chantier effets est fini (Q13) ; tout ce qui suit est **V1**, livré en parties.

Ambition de l'utilisateur : un sampler **professionnel, du niveau de Kontakt ou mieux, plus simple et plus
efficace**, sans quitter la philosophie d'atome ; **latence minimale et performances optimales** partout.

---

## 1. Le grand écart : atome d'un côté, Kontakt de l'autre

### 1.1 Ce qu'on garde des samplers pros (Kontakt, Sampler de Logic, HALion, Falcon, SFZ)

Zones touches × vélocité, groupes avec héritage, couches et fondus enchaînés, round-robin, groupes d'étouffement,
boucles tenues + release, samples de relâché, articulations, legato, streaming disque, interpolation de qualité,
modulation riche, effets par groupe, sorties multiples, vue de jeu (macros), banques énormes.

### 1.2 Ce qu'atome fait autrement — et mieux

| Kontakt | eVe |
| --- | --- |
| Un éditeur dense, des dizaines de panneaux | **Trois niveaux** sur un seul objet : la brique, les zones, l'éditeur ; on ne voit que le niveau demandé |
| Préparer un instrument avant de jouer | **Magique** : un sample glissé sur Instruments se joue tout de suite sur le clavier ; une boucle glissée devient un kit découpé |
| Le comportement fin exige un langage de script (KSP) | **Notes composées et follow actions** : des données, pas du code ; 90 % de ce que fait KSP (legato, round-robin malin, enchaînements, aléatoire) sans écrire une ligne |
| Format fermé (.nki, .ncw) | **Atomes** synchronisés, hors ligne, partageables, vendables (boutique) ; **import SFZ / DecentSampler** ouvert |
| Rendu = fichier | **Tout est description** : slices, éditions, étirements sont des données ; les rendus sont des caches ; « Figer » seulement si on le veut |
| Un monde à part | Les **mêmes briques** que le synthé et les effets (oscillateur, filtre, modulateurs, tranche) ; un sample peut naître d'un synthé et redevenir instrument |
| Souris et molettes | **Gestes** d'eVe (toucher, glisser, pincer), **voix** et **MCP** : « fais-moi un kit avec ces 12 sons en round-robin » |

### 1.3 Là où Kontakt reste devant — et notre réponse

- **Scripts KSP** (arpégiateurs, logique sur mesure) → notes composées + modulateurs + MCP ; pour le reste, une
  brique « code neuf » (plan effets D9 : WASM hors iOS, intégrée à une build pour iOS).
- **Interfaces sur mesure des banques** → la **vue de jeu** : les réglages exposés d'un instrument (macros), en mode
  Consumer / Exécution (§9).
- **Catalogue commercial NI** (.nki chiffrés, impossibles à importer) → SFZ, DecentSampler, SF2, et nos propres
  instruments (auto-sampling §8.3).

---

## 2. Exigences de latence et de performance (transverses, non négociables)

| Exigence | Règle |
| --- | --- |
| Note jouée → son | natif : **chemin direct** (plan effets L2) ; aucune décision du JS dans la voix ; le sample démarre à la trame de la note |
| Étirement (Q2) | sans latence audible au déclenchement : l'étireur est **amorcé** à la note sur le sample connu d'avance (lecture anticipée), jamais une attente de fenêtre |
| Rendu audio | zéro allocation, zéro verrou, zéro E/S dans le rendu ; voix et lecteurs **préalloués** ; FTZ/DAZ |
| Disque | le début de chaque sample en mémoire (**tête préchargée**), la suite lue par un fil de travail dans des anneaux préalloués ; un tirage (round-robin, note composée) ne touche jamais le disque dans le rendu |
| Interpolation | sinc polyphasé à pas variable, **SIMD** (NEON / AVX / simd128) ; deux qualités : jeu en direct, rendu |
| Mémoire | un sample chargé une seule fois, partagé par toutes les voix et toutes les zones (référence, jamais copie) ; compteur de mémoire visible au besoin, jamais imposé |
| Charge | coût mesuré par voix, par zone, par instrument ; voix au repos = coût nul ; une voix finie se libère sans allocation |
| Mesures | 16 voix stéréo 48 kHz avec étirement, deux lecteurs par voix (fondu de note composée), sur le Mac puis l'iPad (Q11) ; 10 min sans décrochage ; latence note → son mesurée par boucle câblée |

---

## 3. Modèle de données (tout est atome)

```text
Instrument (atome)
 ├─ réglages hérités (gain, accord, enveloppes, modulateurs, voix)
 ├─ Groupe … (héritage ; choke, mode de voix, articulation, sortie)
 │   └─ Zone … (touches × vélocité ; contenu = Segment OU Note composée)
 └─ Vue de jeu (réglages exposés)

Sample (atome audio, immuable)  ◄── Segment = sample + région + boucle + réglages
                                ◄── Slice = un segment nommé né d'un découpage (§6)
Édition non destructive = une Molécule (piste de morceaux de la source) + rendu en cache
```

- Un réglage posé plus haut vaut pour tout ce qui est dessous ; plus bas, il le remplace (modèle SFZ).
- Le **sample source n'est jamais modifié**. Slices, éditions, étirements sont des descriptions ; leurs rendus sont
  des **caches** invalidables (cahier synthé §5.3) ; **Figer** crée un nouveau sample (nouvel atome, origine gardée).
- Le cache d'étirement existe déjà pour les clips (`stretch_render_asset_id`, rendu Rubber Band calculé d'avance) :
  même mécanisme pour les segments.
- Toutes les mutations passent par `window.Atome.commit` / `commitBatch` ; annuler / rétablir = celui du projet.

---

## 4. La brique Segment (= S3a, la base validée)

Un sample + sa région (début / fin), son décalage de départ (modulable par la vélocité), sa note racine et son accord,
son gain / pan, sa lecture (une fois, boucle, aller-retour, arrière), sa boucle (§4.1), sa hauteur, sa durée
(étirement), son tempo (suivre ou non), ses marqueurs (§7).

### 4.1 Boucles (sémantique stricte)

- Repères distincts : **Loop Start**, **Loop End**, et des **points de boucle** (marqueurs) dans la boucle.
- Début inclusif, fin **exclusive**, en trames de la source.
- Type : **continue** (jusqu'à la fin de la note) ou **tenue** (tant que la touche est enfoncée ; au relâché la
  lecture **sort de la boucle** et joue la suite : le release). Nombre de passages (infini ou N).
- **Raccord** : fondu enchaîné de longueur réglable entre la fin et le début de la boucle (puissance constante) ;
  accroche au passage par zéro ; **trouver la boucle** (le Détecteur propose le meilleur raccord par corrélation).
- Compteur de passages exposé aux follow actions (« au 3e passage… »).
- Changement de hauteur / tempo pendant la boucle : la boucle reste collée au son (Q6).

### 4.2 Release

- Release du segment : la partie après Loop End, jouée au relâché (boucle tenue).
- **Samples de relâché** : un segment (ou une liste) déclenché au note-off, atténué selon la durée tenue (étouffoir
  du piano, bruit de frette).
- Enveloppe d'amplitude : son release s'applique en plus (réglable, peut être nul).

---

## 5. Zones, groupes, couches, round-robin

- **Carte touches × vélocité** : chaque zone couvre une plage de notes et une plage de vélocité ; note racine
  (transposition automatique pour les notes voisines).
- **Couches** : plusieurs zones sur la même note et la même vélocité jouent ensemble (micro proche + salle) ;
  **fondu enchaîné** entre couches de vélocité voisines (pas de saut de timbre).
- **Round-robin** : une liste de zones jouées tour à tour — cycle, hasard, **hasard sans répétition** ; option
  « emprunter aux voisines » (quand on a peu d'échantillons, la note voisine transposée d'un demi-ton sert de
  variante).
- **Groupes d'étouffement** (choke) : une note d'un groupe coupe les autres (charleston fermé / ouvert).
- **Mode de voix** par groupe : poly (limite de voix), mono, **legato** (glissé, et enchaînement réel par note
  composée §7.3), priorité (dernière, plus haute, plus basse).
- **Articulations** : touches de commutation (keyswitch) ou contrôleur qui choisissent un groupe (pizz / arco).
- **Pédales** : sustain, sostenuto, sourdine ; bruits de pédale en samples de déclenchement.
- **MIDI** : un canal par groupe (multitimbre, sorties multiples D-S2), MPE (Q12), courbe de vélocité, plage du
  pitch bend, apprentissage des contrôleurs (service existant `midi_binding_service.js`).
- **Accord** : accord global, par zone ; **gammes et micro-accordage** (fichiers Scala `.scl`).

### 5.1 Poser les samples sur la carte (demande de l'utilisateur, 29 oct. soir)

- **Source** : le panneau d'import unique (règle 18) s'ouvre au pied, la carte restant en vue au-dessus ; on y
  **coche plusieurs sons** (cases sur le rail de gauche) et on les **glisse ensemble** sur la carte.
- **Dépôt sur une place libre** : au lâcher, le choix apparaît au pied (jamais une boîte flottante sur la carte,
  règle 13) — un son : **Ajuste** (toute la place libre autour), **Horiz.** (sur les notes libres de sa rangée de
  vélocité), **Vert.** (toutes les vélocités de sa note) ; plusieurs sons : **Notes** (un par note, à la suite),
  **Vélo** (empilés en couches de vélocité), **Altern** (une seule zone, round-robin). Un toucher applique ; on
  ajuste ensuite au doigt (bulles de la zone). Les dépôts suivants proposent la place qui reste.
- **Dépôt sur une zone occupée** : **Altern** (round-robin), **Mixer** (les sons jouent ensemble), **Couche**
  (partage de la plage de vélocité), **Rempl.** (remplacer).
- **Superposition** d'une zone (roulette **Pile** de sa fiche) : Alternance, Mélange, Couches. En Mélange, chaque
  son a son **niveau** (ligne de slider, %). Sur la carte, la pastille du bloc dit le nombre et la sorte.
- **Zoom** : pincer la carte — horizontalement les notes, verticalement la vélocité ; aucune commande visible.
- **Coupe** (choke, exclusion) : la fiche d'une zone porte la **liste des autres zones**, à cocher ; jouer la zone
  coupe celles qu'elle a cochées (charleston fermée coupe l'ouverte et la pédale, pas l'inverse). Deux coches
  réciproques font un groupe d'exclusion classique ; un seul mécanisme, sens unique par défaut (29 oct. soir,
  remplace la roulette Groupe de S3c).

---

## 6. Découpage (slices) — exigence de l'utilisateur

**Où il vit** : dans l'**éditeur de sample** (§8), qui est l'éditeur de **tout** atome audio — ouvert depuis le
Sampler, mais aussi depuis la Médiathèque ou un clip ; le découpage n'appartient donc pas qu'au Sampler.

### 6.1 Les points de découpe

Un point de découpe est un **marqueur** de sorte « slice » (un seul système de marqueurs, §7), en trames de la
source, collé au son. Trois manières d'en poser, **combinables** :

1. **Division égale** : en N parties (2, 3, 4, 8, 16, 32… ou un N tapé) ; avec un tempo connu, **à la grille**
   (mesures, temps, croches…). Les divisions musicales gardent le pas du monde (règle 19 : 4, 8, 16 restent tels).
2. **Par la dynamique** (attaques) : le Détecteur trouve les attaques ; un slider de **sensibilité** et un
   **écart minimal** ; les points apparaissent en direct pendant qu'on règle.
3. **À la main** : poser (toucher deux fois), **déplacer** (glisser, accroche au passage par zéro / aux attaques /
   à la grille), **supprimer**, **verrouiller**.

**Déplacer un point — deux modes** (demande de l'utilisateur, 29 oct. soir), roulette **Point** de l'outil Slice :

- **Couper** : le son ne bouge pas, seul l'endroit de la coupe se déplace dans le sample ;
- **Warp** : le point est un **marqueur de calage** ; le contenu le suit — la partie avant s'étire, la partie après
  se resserre (étirement de qualité calculé pendant le geste, copie temporaire en cache, source intacte).

Dans les deux modes, un **aimant** (roulette **Aimant** : Libre, Temps, 1/8, 1/16) attire le point sur les temps
du tempo connu ou détecté ; il sert surtout en Warp.

Combinaison : chaque point garde son **origine** (division, dynamique, main). Relancer une méthode ne remplace que
ses propres points ; un point déplacé ou verrouillé devient « main » et n'est plus jamais remplacé. On peut donc
diviser en 4, puis rediviser une partie en 4, puis supprimer ou déplacer des points.

### 6.2 Les opérations sur les slices (non destructives)

Écouter une slice ; la **supprimer** (la partie disparaît du résultat) ; la **déplacer** / réordonner ; la dupliquer ;
l'inverser ; son gain, ses fondus ; l'**étirer** sans toucher à la source (le rendu étiré est une **copie
temporaire** en cache, Figer pour la garder) ; **caler au tempo** chaque slice (points de calage façon « warp »).

### 6.3 Ce que devient une slice

Chaque slice devient un **sample à part entière** — un atome qui référence la source et sa région (pas une copie ;
Figer pour un fichier), et elle peut servir de :

- **zone sur une touche** (slices → clavier, un kit de batterie en un geste) ;
- **segment d'une étape** de note composée (attaque, corps, release, §7) ;
- **membre d'une liste** de round-robin ;
- **clip MIDI** qui rejoue les slices dans l'ordre d'origine (changer de tempo sans étirer, réarranger) ;
- **cellule** de la Timeline (une slice par cellule).

---

## 7. Marqueurs, follow actions et note composée

### 7.1 Marqueurs (Q6, Q7)

Collés au son (trames de la source) : l'étirement, la hauteur, le tempo, l'arrière ne les décalent pas. Ils se
déclenchent quand la lecture les **franchit** (dans un sens comme dans l'autre), jamais sur un saut. Sortes :
**slice**, **point de boucle**, **action**. Chaque marqueur porte au besoin : **Quand** (une fois, à chaque passage,
tous les N, au N-ième, une fois par voix), **Action** (toute commande, Q7), priorité, délai, identifiant stable.
Ordre documenté quand deux marqueurs tombent sur la même trame (ordre de position puis de création).

### 7.2 Follow actions dans le sample

Vocabulaire des Cellules (`kernel/scene_schema.js#FOLLOW_ACTIONS`) sorti en **module partagé** : suivante,
précédente, cible, hasard, répéter, stop, `after_passes` ; étendu de : sauter à un marqueur / une slice, tirer
dans une liste, note-off, fondu. Exécuté **dans la voix, en Rust**, à la trame.

### 7.3 Note composée

Une note = des **étapes** (Attaque, Corps, Release… autant qu'on veut) ; chaque étape = une **liste** de segments
+ une règle de tirage (un seul, cycle, hasard, hasard sans répétition, par vélocité, par note) ; entre les étapes,
des **transitions** (déclencheur → cible + fondu). Déclencheurs : fin du segment, marqueur franchi, N passages,
**note-off**, **note liée** (legato : enchaîner un sample de transition), vélocité / contrôleur au-dessus d'un
seuil, durée. Hasard **à graine** (rendu rejouable). Deux lecteurs par voix pendant un fondu ; **alignement de
phase** possible entre deux sons tenus.

Exemple de l'utilisateur : Attaque [A1 · A2 · A3, hasard] → au marqueur m1 → Corps [C1, boucle tenue] → note-off →
Release [R1 · R2 · R3, hasard] → fin.

---

## 8. L'éditeur de sample (plein écran, précision)

### 8.1 Écran

La carte forme d'onde **grandit en plein écran** (un élément s'ouvre en grandissant). Zones fixes (règle 12) :
**vue d'ensemble** en haut (tout le sample, la fenêtre visible), **vue de travail** au milieu (pincer pour zoomer
jusqu'à l'échantillon, glisser pour défiler), **outils** dans la bande du bas (règle 13), ✕ à gauche. Stéréo :
deux canaux superposés ou séparés.

### 8.2 Outils

Sélection (bulles de début / fin, accroche : passage par zéro, attaques, grille, marqueurs), écoute de la
sélection, **couper, copier, coller, silence, rogner**, fondu entrant / sortant, inverser, gain / normaliser,
supprimer la composante continue, découper (§6), boucle (§4.1), marqueurs (§7), étirer / changer la hauteur de la
sélection, **Figer**. Valeurs tapées (toucher deux fois). Les outils trop nombreux pour la bande se rangent selon la
règle de la bande (maquette).

### 8.3 Outils d'analyse et d'automatisation

- Détection d'attaques, de hauteur (note racine), de silence de fin (rognage automatique), de boucle.
  Brique existante à réutiliser pour la hauteur : `eVe/intuition/tools/audio_to_midi/` (Basic Pitch, local).
- **Rangement automatique** : glisser des samples → note racine (nom de fichier ou analyse), couche de vélocité
  (niveau mesuré), round-robin (doublons).
- **Auto-sampling** : eVe joue un instrument (synthé d'eVe ou appareil MIDI externe) note par note, vélocité par
  vélocité, enregistre par le Moissonneur, coupe, cale, range les zones.
- **Enregistrer directement** dans le Sampler (seuil de départ), ou **rééchantillonner** la sortie d'une tranche.

### 8.4 Non destructif

Le sample édité est une **petite Molécule** (une piste de morceaux de la source) ; le noyau de la Timeline sait déjà
couper, joindre, rogner, faire des fondus, étirer (`kernel/clip_join.js`, `clip_fades.js`, `stretch.js`) ; à
ajouter : inverser, gain par morceau, silence. Le moteur lit le **rendu en cache** (recalculé à chaque édition, hors
du fil audio) ; Figer en fait un sample.

---

## 9. Jeu, présentation, bibliothèque

- **Vue de jeu** (macros) : les réglages qu'on expose d'un instrument (« Brillance », « Salle ») — c'est ce qu'on voit
  en mode Consumer / Exécution et au niveau Débutant.
- **Capture › Instruments** (D23.7) : tuiles d'instruments, Mes instruments, écoute au toucher, favoris, recherche.
- **Gestion des samples** : fichiers manquants (rechercher, relier), rassembler les samples d'un projet,
  purger les inutilisés, formats WAV / AIFF / FLAC / MP3 / OGG / CAF, 16 / 24 / 32 bits flottants, toute fréquence,
  mono / stéréo / multicanal ; lecture des métadonnées **`smpl`** (boucles, note racine) et **`acid`** (tempo) des
  WAV ; stockage des banques en **FLAC** (sans perte, ≈ moitié de la taille ; décodé par Symphonia, déjà là).
- Instruments = atomes : synchronisés, hors ligne, partageables ; **vendables** dans la boutique existante
  (licences des samples respectées).

---

## 10. MCP

Toutes les opérations ci-dessus sont des commandes (une par action d'écran) : créer un instrument, glisser des
samples (rangement automatique), zones, couches, round-robin, choke, boucles, marqueurs, slices (diviser, par
dynamique, à la main), note composée, éditions non destructives, Figer, import SFZ, auto-sampling, vue de jeu ;
`validate` à blanc ; « compose » (« un piano doux et intime », « un kit lo-fi à partir de cette boucle »).
Équivalence UI = MCP testée.

---

## 11. Découpage V1 (tout en V1, dans cet ordre)

| Partie | Contenu | Preuve |
| --- | --- | --- |
| **V1.1** Segment | §4, interpolation SIMD, boucles continue / tenue + release, 16 voix + étirement amorcé | mesures Mac puis iPad ; latence note → son |
| **V1.2** Zones | §5, streaming disque, têtes préchargées | sonde : bonne zone à la trame ; banque de plusieurs Go tenue en mémoire |
| **V1.3** Découpage | §6 complet, slices → clavier / MIDI / cellules | sonde : diviser en 4, rediviser, déplacer, supprimer, rejouer |
| **V1.4** Note composée | §7, module partagé avec les Cellules, deux lecteurs par voix | tests Rust des cas limites (cahier synthé §10.6) |
| **V1.5** Éditeur | §8.1–8.2, §8.4 | sonde : éditer, annuler, Figer |
| **V1.6** Banques et automatismes | import SFZ / DecentSampler / SF2, `smpl`/`acid`, rangement automatique, auto-sampling, FLAC | une banque SFZ libre jouée telle quelle |
| **V1.7** Jeu et MCP | §9, §10 | exemple G du cahier synthé par les deux voies |

## 12. Questions ouvertes (toutes tranchées le 29 oct., voir §13)

Q14–Q18 du message du 29 oct. (modèle hiérarchique + SFZ, schéma des Cellules partagé, édition = Molécule,
streaming en V1, automatismes en V1), plus :

- **Q19** L'éditeur de sample est celui de **tout** atome audio (Médiathèque, clip), pas seulement du Sampler ?
- **Q20** Une slice = un atome qui **référence** la source (Figer pour un vrai fichier), plutôt qu'une copie ?
- **Q21** **Vue de jeu** (macros) en V1 ?
- **Q22** **Gammes / micro-accordage** (Scala) en V1 ?
- **Q23** Instruments **vendables** dans la boutique dès la V1 ?

## 13. Décisions (29 oct., réponses de l'utilisateur)

- **Q14–Q18 — A** : instrument → groupes → zones avec héritage + import SFZ / DecentSampler (puis SF2) + export SFZ ;
  note composée sur le schéma des Cellules sorti en module partagé ; édition non destructive = Molécule + rendu en
  cache ; streaming disque en V1 ; rangement automatique, slices → clavier / MIDI et auto-sampling en V1.
- **Q19 — Oui, partout** : le découpage est un **outil Slice** à part entière, utilisable sur **tout** atome audio
  (Médiathèque, clip, sampler), pas seulement dans le Sampler.
- **Q20 — A** : une slice est un atome qui référence la source et sa région ; Figer en fait un fichier.
- **Q21 — V1, prévu dès le départ** : un instrument s'ouvre sur sa **façade** (surface de contrôle minimaliste,
  l'essentiel seulement) ; un outil **Avancé** affiche le panneau complet avec tous ses outils (la tranche, S1). Dans
  le panneau complet, chaque réglage peut être **mis en façade** ou retiré (un outil le dit, maquette). Un réglage de
  façade est soit un réglage direct, soit une **macro** : un slider qui pilote plusieurs réglages avec leurs
  profondeurs — la même carte « Cibles » que le modulateur (S2, validée). Façade = niveau Débutant, mode Exécution,
  et ce que règle l'assistant (« plus doux »).
- **Q22** — compris ainsi : accord global et par zone en V1 ; **gammes / micro-accordage (Scala) plus tard**.
- **Q23 — A** (choix de l'utilisateur) : instruments **vendables dans la boutique dès la V1**, licences des samples
  respectées.

- **Retour sur S3c (29 oct. soir)** : design de la carte approuvé ; demandes ajoutées en §5.1 (glisser plusieurs
  sons depuis le panneau d'import, choix au dépôt, superposition Alternance / Mélange / Couches avec niveaux, zoom
  dans les deux sens, coupe par liste) et en §6.1 (point de découpe en Couper ou Warp, aimant). Maquettes
  S3c, S3c2a–e et S3d0a–b **validées** (« je valide le design, c'est parfait »).

**Toutes les questions sont tranchées.** Maquettes suivantes, une par une : S3c Zones, S3d Éditeur + outil Slice,
S3e Note composée, S3f Façade + Avancé, puis S4 Capture › Instruments et S5 sorties multiples + IN secondaire
(plan synthé §9).
- **S3e, S3f, S4, S5 validées sans être montrées** (« je te fais confiance pour les quatre écrans »).
- **Quand coder (Q13bis) — A** : commencer tout de suite par les briques dans leurs **propres fichiers** ; les
  brancher sur la console, `mix-graph` et le catalogue seulement quand la session effets aura fini.

## 14. Code livré (29 oct. soir) — briques à part, pas encore branchées

**Moteur** : crate `atome/engines/atome-instrument` (dépend d'`atome-dsp` seul ; aucun fichier des effets touché).

| Brique | Fichier | Ce qu'elle fait |
| --- | --- | --- |
| Événements de note | `src/event.rs` | note on/off, pédale, pitch bend, tout couper ; datés à la trame dans le bloc ; liste bornée (un débordement est compté, jamais agrandi) |
| Interpolation | `src/interp.rs` | sinc fenêtré 16 points, 512 phases, 5 bandes selon le pas (anti-repliement en montant), produit scalaire vectorisable |
| Segment | `src/segment.rs` | région (fin exclusive), décalage + décalage par vélocité, avant / arrière, boucle continue ou tenue, aller-retour, nombre de passages, raccord à puissance constante |
| Zones et pile | `src/zone.rs`, `src/keymap.rs` | touches × vélocité ; Alternance (cycle, hasard, hasard sans répétition, graine rejouable), Mélange (niveau par son, 4 au plus), Couches (fondu à chaque couture) ; emprunt aux voisines ; coupe à sens unique ; samples de relâché atténués selon la durée tenue |
| Voix | `src/voice.rs`, `src/pool.rs` | ADSR, glissé, vol de voix (la plus ancienne relâchée d'abord), coupe en 3 ms ; poly / mono / legato, pile de 16 notes tenues |
| Sampler | `src/sampler.rs` | `Processor` générateur ; le bloc est coupé à chaque événement (note à la trame exacte) ; 11 paramètres (gain, ADSR, vélocité, accord, glissé, polyphonie, mode, plage du bend) |
| Étirement (Q2) | `src/stretch.rs` | Signalsmith Stretch (MIT), natif seulement : sur le Web (wasm) un segment étiré est **refusé avec une erreur explicite** |

**Hauteur et durée séparées** : la hauteur de la note reste au lecteur sinc (exacte) ; l'étireur ne règle que la
durée (lire plus vite raccourcit, il rallonge d'autant). Mesuré : la transposition de Signalsmith elle-même tombait
8 à 14 cents trop haut sur un son pur avec la fenêtre de 2048 ; ainsi la note est juste (880 Hz à ±1 Hz) et la
durée tenue (×1,5 reste 1,5 s une octave plus haut).

**Mesures** (Mac M1, temps CPU du fil seul, `cargo test --release`, machine chargée par d'autres travaux) :

| Mesure | Résultat |
| --- | --- |
| 16 voix × 2 prises stéréo, transposées, boucles raccordées | **2,1 à 2,6 %** d'un cœur |
| 16 voix étirées × 2 prises stéréo | **13,7 à 16,9 %** d'un cœur |
| Amorçage d'une voix étirée (fenêtre 42,7 ms jamais entendue) | 0,3 à 0,6 ms |
| Accord de 16 notes étirées, bloc le plus cher | **2,2 à 3,7 ms** pour un bloc de 5,33 ms (256 trames) |
| Allocations dans le rendu (notes qui vont et viennent, pédale, étirement) | **0** (allocateur compteur ; celles du C++ de Signalsmith ne sont pas comptées) |

**Budget d'amorçage** : un bloc amorce au plus **une voix étirée par milliseconde qu'il dure** (5 à 256 trames,
48 kHz) ; les événements au-delà passent, dans l'ordre, au début du bloc suivant. Un accord de 16 notes étirées
s'étale donc sur 4 blocs (16 ms) au lieu de faire décrocher le son. Les notes non étirées ne sont jamais retardées.

**Tests** : 25 tests Rust (`tests/playing.rs`, `zones.rs`, `reading.rs`, `stretching.rs`, `realtime.rs`), en debug et
en release ; clippy propre ; la crate compile pour wasm32.

**JS** : `eVe/intuition/tools/molecule/kernel/instrument_schema.js` (description de l'instrument, mêmes contrôles que
le moteur), `instrument_operations.js` (dépôt sur place libre : Ajuste / Horiz. / Vert., Notes / Vélo / Altern ; dépôt
sur une zone : Altern / Mixer / Couche / Rempl. ; réglages de zone et de prise ; suppressions ; paramètres),
`atome/src/squirrel/audio_fx/instrument_contracts.js` (12 commandes `audio_fx.*` du Sampler). Sonde :
`temp/synth/instrument_kernel_probe.mjs`.

**Reste bloqué par la session effets** (mêmes fichiers) : l'entrée `instrument` de la tranche dans `mix-graph` et
`mix_schema.js`, le passage des événements par le contrat `Processor` d'`atome-dsp`, l'enregistrement des commandes
dans `AUDIO_FX_COMMANDS` / la famille MCP et leur exécuteur, le catalogue Rust généré. Puis l'interface (S3…S5),
le streaming disque (V1.2) et la suite de §11.

## 15. Branchement et écrans (29 oct., nuit)

**Branché** : les commandes du Sampler (`instrument_contracts.js`), de l'outil Slice et de l'éditeur
(`slice_contracts.js`, 19 commandes) et des banques (`bank_contracts.js`, 5 commandes) sont dans
`AUDIO_FX_COMMANDS` (famille MCP `audio_fx`, 69 commandes, noms uniques) ; un seul exécuteur
`audio_fx_commands.js#executeAudioFxCommand`, chaque famille échouant avec le code de son contrat et la raison.
`audio_fx.facade_set` (façade : réglages directs et macros à cibles, S3f) ; `audio_fx.slices_to_cells` (chaque slice
une Scène posée après la dernière, la slice un clip de cette Scène sur la piste, fenêtre de source = la région,
par `timeline.batch` ; `eVe/domains/sample_edit/slice_cells.js`).

**Marqueurs à action (V1.4, côté hôte)** : le moteur ne fait que mettre en file ce qui a sonné ;
`eVe/domains/audio_fx/instrument_marker_actions.js` vide la file toutes les 21 ms tant qu'un instrument porte un
marqueur à commande, et lance chaque commande par la passerelle d'outils, après son délai, dans l'ordre des
priorités (chemin direct natif et WASM, et Kira Web pour la Timeline).

**V1.2 streaming disque** : `atome-instrument` `residency.rs` (une tête de 12 288 trames en mémoire à chaque
point d'entrée : début de segment + décalages, fin en arrière, boucles entières, cibles de saut ; un son de moins de
trois têtes tenu entier), `stream.rs` (un anneau sans verrou par voix × lecteur, un fil `atome-sample-stream`),
`reading.rs` (le rendu lit une plage résidente ou l'anneau ; une trame manquante sonne muette et est comptée, jamais
d'attente). Natif seulement (audio-engine lit le WAV sur place) ; le Web garde le son entier (déjà décodé en
mémoire), même mécanisme. Preuve : banque de 24 × 444 s = 3,07 Go, mémoire 20 Mo au plus fort, 0 trame affamée,
raccord tête → flux exact à l'échantillon. **Un seul espace de trames** : les positions d'un instrument sont les
trames du fichier à son propre débit sur toutes les plateformes (`sample_source_rate.js`, décodage Web au débit du
fichier) ; la mise à l'échelle des banques est retirée.

**S5 sorties multiples + IN secondaire** : une zone a sa `output` (16 au plus) ; `mix-graph` rend une sortie par
tampon, chaque tranche lit la sienne (« Batterie › 2 ») ; module **IN** (`input`, niveau `mix_db`) dans toute chaîne,
sa source (micro, tranche, instrument › sortie) lue une seule fois par bloc (`source_bus.rs`) ; une boucle par un IN
est permise, entendue un retour plus tard. Écrans : rouleau « Sortie » à côté de Tirage / Pile ; l'IN s'ajoute par
le + de la chaîne (Dashboard et console du projet), son panneau = la ligne de choix « Source » + « Niveau » sur le
curseur d'outil. MCP : `zone_set output`, `audio_fx.add effect input from`, `set_input output | module_id from`
(`from` et non `source`, clé d'enveloppe MCP réservée). Preuve Web : sortie 2 seule sur la tranche 2 (0 / 0,746),
IN à −12 dB = 0,061 pour 0,242.

**Écrans** (dans le panneau de chaîne, après les zones) :
- **Découp.** (S3d0a/b) : `dashboard_instrument_slices.js` + `_view.js` — onde, lignes des points, numéros des
  parties, bulles du point touché glissées, rouleaux Point (Couper / Warp) et Aimant ; un toucher joue la partie,
  deux touchers posent un point ; au pied Suppr., Kit (les slices sur les touches dès C2), l'outil Slice allumé
  (« En 2 »).
- **Note composée** (S3e) : `dashboard_instrument_composed.js` — case « Composée » de la fiche de zone, étapes en
  tuiles + ajout (panneau d'import unique), Tirage, une paire Quand / Puis par transition (« Aucun » la retire), +
  pour en ajouter une, Suppr. de l'étape au pied.
- **Vendre un instrument** (V1.7) : maintien sur l'instrument › Vendre → `shop.open {sell, title, content_ids}`.

**Preuves** : sonde de la façade 7/7 ; famille 69 commandes sans doublon ; outil Slice + éditeur sur la page réelle
27/30 (slices → cellules compris), seules ratées : la grille partagée de la sonde d'accueil et `edit_undo` (voir
ci-dessous) ; banques 9/9 + 5/5 + 11/11 sur la page ; note composée 10/10 (noyau).

**Défaut trouvé hors du Sampler** : sur le Web, un `undoTransaction` envoyé avant que l'outbox du navigateur ait
téléversé la transaction répond `history_source_transaction_not_found`, et les états rendus sont lus en local avant
le retour du serveur (convergence 0,5 à 0,8 s, plus sous charge). Propriétaire : `eVe/core/atome_commit.js#executeHistoryCommand`
et `adole_api/browser_workspace.js` — à corriger à part (touche toute annulation Web).

**Reste bloqué** : l'écran complet de l'éditeur de sample (§8, au-delà des maquettes ponctuelles S3d0a/b) n'a pas de
maquette validée (règle 16) ; ses opérations sont disponibles à la voix et par MCP.
