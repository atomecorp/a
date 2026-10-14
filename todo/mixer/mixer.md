# eVe — Table de mixage (`mixer.md`)

**État : cahier des charges évolutif — décisions consolidées, questions ouvertes distinctes**  
**Création : 14 octobre 2026**  
**Dernière mise à jour : 14 octobre 2026**  
**Référence visuelle :** croquis fourni dans la conversation (`IMG_1358.jpeg`).

> **Portée de la référence AUM :** AUM sert uniquement de référence pour la liberté de **routage audio / mixage**. Ses autres fonctionnalités, son ergonomie ou son organisation générale ne constituent **pas** un cahier des charges pour eVe.
>
> **Méthode de validation :** distinguer les décisions **validées** des points **à préciser** et des **propositions**. Ajouter chaque réponse validée au document et consigner les changements sans transformer les hypothèses en exigences.

## 1. Objectif et périmètre — validé

La table de mixage d'eVe doit pouvoir traiter et router les éléments **audio, vidéo et MIDI** de la timeline ainsi que d'autres sources, au moyen d'une architecture modulaire. Une entrée vidéo peut apporter simultanément un flux image et un flux son, traités séparément au sein d'un **groupe** commun. L'interface propre à eVe doit rester simple et adaptable ; on ne copie pas l'interface d'AUM.

## 2. Structure d'une tranche — validé

Chaque tranche est organisée en deux parties :

- **À gauche :** une colonne de nœuds ou modules qui représente le chemin du signal de haut en bas. Le bloc **IN** est situé en haut et le bloc **OUT** en bas. Des éléments intermédiaires sont insérés dans l'ordre voulu.
- **À droite :** une zone de contrôle contextuel, initialement occupée par un **fader vertical**. Quand un module de gauche est sélectionné, cette zone affiche les paramètres ou l'interface native du module, à la place du contrôle initial ; elle peut **s'élargir** si nécessaire.
- **Proposition ergonomique à tester, non validée :** lorsqu'aucun module n'est sélectionné, cette zone pourrait aussi présenter les contrôles essentiels de la tranche, par exemple niveau, envois et panoramique. La lisibilité de cette combinaison reste à vérifier avec le design.

**Exemple issu du croquis (illustration, pas liste fixe de modules) :**

```text
Colonne des modules         Zone de contrôle
┌───────────────┬─────────────────┐
│ IN            │                 │
│ FX1           │                 │
│ FX2           │  Fader /        │
│ AUX           │  contrôles       │
│ SEND          │  contextuels    │
│ PAN           │                 │
│               │                 │
│ +             │                 │
│ OUT           │                 │
└───────────────┴─────────────────┘
```

Les étiquettes « configuration », « sidechain », « multi-out » et « groupe » apparaissent également sur le croquis : leurs comportements détaillés ne sont **pas encore spécifiés**.

## 3. Nœud d'entrée IN — validé

Un nœud **IN** apparaît en haut de chaque tranche. Il peut représenter diverses sources, par exemple :

- élément ou objet de la timeline contenant de l'audio ;
- élément vidéo de la timeline, avec ou sans composante audio ;
- synthétiseur, instrument ou autre objet générateur ;
- source ou signal MIDI ;
- entrée audio externe ou toute autre source compatible.

**Validé :** une vidéo contenant du son possède deux voies de traitement distinctes — **image** et **audio** — présentées comme un groupe (voir § 9). Une vidéo silencieuse ne nécessite pas automatiquement une voie audio ni un groupe audio/vidéo.

**À préciser :** compatibilité des types de signaux (audio, vidéo, MIDI), lien entre cellule, piste de timeline et tranche de mixage, et traitement de l'audio/vidéo d'une source dans la timeline.

## 4. Modules intermédiaires et traitement séquentiel — validé

La colonne de gauche accueille des **modules de traitement et de routage**, notamment :

- **FX** : effets insérés et exécutés dans l'ordre de la chaîne ;
- **PAN** : panoramique ;
- **AUX** et **SEND** : départs vers d'autres circuits ;
- **sorties / départs intermédiaires** : dérivations du signal à l'endroit choisi ;
- **GAIN** : module de gain insérable à un point précis de la chaîne (voir § 7).

Les départs peuvent être placés **avant les effets, entre eux ou après**, selon le routage recherché. Les destinations possibles incluent une **autre tranche**, un **bus** ou une **sortie** compatible. Les effets agissent dans leur ordre d'insertion.

**Validé :** les effets audio et les effets vidéo d'une même source vidéo doivent appartenir à **deux chaînes de traitement distinctes** ; le concept de modules séquentiels s'applique à la voie concernée.

**À préciser :** modalités exactes de déplacement/réordonnancement des modules, distinctions fonctionnelles et visuelles entre AUX, SEND et autres sorties intermédiaires, et gestion des connexions MIDI et sidechain.

## 5. Ajout de modules — validé

Deux interactions sont prévues :

1. Un petit bouton **« + »**, placé dans la colonne gauche **juste au-dessus de OUT**, sert à ajouter un composant.
2. Un **double-clic dans une zone vide** de la chaîne permet aussi d'ajouter un composant.

Le composant ajouté peut être un effet, un panoramique, un auxiliaire, un send ou un autre module compatible. L'interface de choix devra utiliser les outils réels existants d'eVe lorsque ceux-ci sont disponibles ; elle reste à définir précisément.

## 6. Routage et sorties — validé

- Le **routage est libre** : un signal peut être envoyé à différentes destinations depuis des points distincts de la chaîne.
- Les destinations peuvent notamment être une **autre tranche**, un **bus** ou l'une des **sorties d'une interface audio multicanal**.
- Quand l'utilisateur configure un départ ou une sortie, eVe doit présenter les **destinations réellement disponibles**, pour permettre de choisir la cible.
- Le nœud **OUT** en bas de tranche contrôle la sortie principale de cette tranche.
- **Cliquer sur OUT active/désactive cette sortie.** Quand OUT est désactivé, la sortie principale ne reçoit plus le signal, **mais les départs SEND et les autres routages configurés restent opérationnels**.

**À préciser :** visibilité et organisation du sélecteur de destination, comportement des configurations multi-out, prévention des boucles de rétroaction, et règle exacte des dérivations pré/post traitements.

## 7. Fader, sélection et module GAIN — validé

**Décision retenue après discussion :** le fader général et les paramètres affichés ne doivent **pas** modifier la structure du chemin du signal à chaque sélection.

1. **Aucun module sélectionné :** la zone de droite affiche le **fader général de tranche** ; pour une **tranche audio**, son gain est appliqué **en fin de chaîne**, à sa position fixe.
2. **Un effet ou un autre module est sélectionné :** la zone de droite affiche les **paramètres réels** de ce module, éventuellement en s'élargissant. **La sélection ne déplace pas le fader général et ne modifie pas le routage audio.**
3. **Besoin d'un réglage de niveau à un autre endroit :** insérer un **module GAIN** à l'endroit souhaité. En sélectionnant GAIN, la zone de droite montre **son propre fader** ; le traitement de gain intervient à sa position dans la chaîne.

**Exemple :** `IN → FX1 → GAIN → FX2 → SEND → OUT` : GAIN modifie le signal transmis à FX2 et aux modules suivants, sans déplacer le fader général de fin de chaîne.

**Raison de cette règle :** éviter qu'un simple clic de sélection sur un module change involontairement le son, particulièrement pendant une performance.

**Distinction vidéo :** lorsqu'une vidéo possède du son, sa voie audio et sa voie image ont chacune leur **contrôle/fader propre** et leurs effets distincts, au sein d'un groupe commun. La fonction précise du « fader vidéo » (opacité, intensité, autre paramètre) **n'est pas encore validée** ; ne pas lui appliquer par défaut la sémantique du gain audio.

## 8. Principes d'interface eVe — validé pour l'orientation

- Conserver l'architecture **modulaire**, minimaliste et **contextuelle** propre à eVe.
- La colonne de gauche correspond aux **modules réels** du circuit ; la droite affiche leurs **commandes natives / réelles**, pas une interface parallèle inventée.
- Partir du croquis et de l'ébauche existante pour les proportions, dispositions et interactions. Le croquis fixe la **structure de principe**, pas les dimensions ou le rendu définitifs.
- L'interface doit pouvoir s'adapter à la largeur nécessaire lorsqu'un module est sélectionné.
- **Règle impérative de réutilisation :** rechercher et réutiliser les **composants, outils, modules, API et comportements réellement existants d'eVe** avant toute proposition d'UI ou d'implémentation. Ne pas réinventer la logique de sélection, de regroupement, de routage ou de paramétrage si elle existe déjà. Vérifier leur existence dans le projet avant de la présumer ; une capacité non vérifiée reste à examiner.
- Le croquis fourni représente la structure de base d'une tranche et **ne couvre pas encore** l'apparence ni les interactions des groupes repliés/déployés.

## 9. Tranches audio / vidéo / MIDI et groupes — validé pour le principe

- Le mixeur d'eVe n'est **pas uniquement audio** : il peut accueillir des sources et traitements **audio, vidéo et MIDI**, selon la compatibilité des outils existants.
- Une **vidéo avec son** est **un groupe dès sa création**, réunissant au moins une **voie vidéo** (image et effets vidéo) et une **voie audio** (son, effets audio et niveau). Ces deux voies se traitent séparément, tout en appartenant à un même objet/groupe logique.
- Une **vidéo sans son** n'impose pas la création d'une voie audio fictive ni d'un groupe audio/vidéo par défaut.
- Le système général de **groupement de mixeurs** doit permettre de rassembler **plusieurs tranches audio, plusieurs tranches vidéo ou un mélange des deux**. La vidéo avec son réutilise **exactement ce même principe de groupement**, sans mécanisme parallèle inventé spécifiquement pour la vidéo.
- Plusieurs tranches groupées peuvent être **représentées de manière compacte par une seule tranche / un seul mixeur** ; une interaction permet d'accéder aux **tranches constitutives**. Les détails du déploiement, du contrôle commun et du dégroupement réel sont **à définir**.
- Le principe de **deux contrôles/faders distincts** (voie audio et voie vidéo) pour une vidéo avec son est **validé** ; la présentation en mode compact (un ou plusieurs contrôles visibles) **reste à préciser**.
- Chaque voie conserve les traitements et connexions appropriés à son type de signal. Les modalités de synchronisation entre audio et vidéo devront être cohérentes avec la compensation de latence (voir § 10).

**Décision architecturale :** un « groupe » doit être une même abstraction fonctionnelle, qu'il représente une vidéo avec son ou un ensemble de pistes/tranches audio, vidéo ou mixtes. Ne pas confondre provisoirement **ouvrir/déployer l'affichage d'un groupe** et **rompre le lien de groupe** : la signification exacte du clic reste à valider.

## 10. Fonctions transversales obligatoires — à spécifier

Ces sujets doivent **rester dans le cahier des charges** même si leur comportement détaillé n'est pas encore arrêté :

1. **Compensation de latence** : à prendre en compte dans les chaînes d'effets, départs et bus, y compris dans les relations entre audio et vidéo. Champ d'application, calcul et interactions avec les routages parallèles à définir.
2. **Sidechain** : connexions entre tranches ou modules servant à piloter des traitements ; sources, destinations, compatibilité des flux et interface à définir.
3. **Multi-out** : utilisation des sorties multiples d'une source, d'un instrument, d'un effet ou d'une interface lorsque disponibles ; sélection et représentation à définir.
4. **Groupes de mixeurs** : groupes de pistes audio, vidéo ou mixtes, affichage compact, ouverture, éventuel fader commun et interactions. La vidéo avec son est le premier cas natif du système (§ 9).

Le croquis de référence mentionne certains de ces sujets, mais **n'en fixe pas le design**. La conception doit d'abord identifier les composants déjà présents dans eVe (§ 8).

## 11. Points encore à valider

| ID | Question | Statut |
|---|---|---|
| Q1 | Le routage se configure-t-il par **cellule de timeline**, par **piste**, ou aux deux niveaux ? | À préciser |
| Q2 | Comment représente-t-on les types de flux et connexions **audio, vidéo, MIDI** dans le même mixeur ? | À préciser |
| Q3 | Quelle est la règle d'**insertion, de déplacement et de suppression** des modules ? | À préciser |
| Q4 | Comment apparaît le **choix de destination** (tranches, bus, sorties physiques, multi-out) sans alourdir l'interface ? | À préciser |
| Q5 | Quelles règles exactes pour **AUX, SEND et sidechain** ? | À préciser |
| Q6 | Comment gère-t-on les **boucles de routage**, les incompatibilités de connexions et la **compensation de latence** ? | À préciser |
| Q7 | Lorsque le fader général audio est en fin de chaîne, quelle est sa position précise par rapport à **OUT** et aux sends situés en fin de chaîne ? | À préciser |
| Q8 | **Ouvrir un groupe** conserve-t-il son lien logique (simple déploiement), ou ce clic **dégroupe-t-il réellement** ses tranches ? | À préciser — **prochaine question** |
| Q9 | Dans un **groupe replié**, quels contrôles apparaissent : contrôles audio/vidéo distincts, fader collectif, autre commande ? Comment les éventuelles commandes communes agissent-elles sur des médias différents ? | À préciser |
| Q10 | Quelle fonction exacte remplit le **fader vidéo** ? Quels sont les contrôles natifs correspondants dans eVe ? | À préciser |
| Q11 | Quelle interaction et quel rendu pour le groupement **plusieurs pistes audio/vidéo** (absent du croquis) ? | À préciser |
| Q12 | La zone de droite au repos doit-elle montrer uniquement le fader ou aussi **volume, sends et pan** ? | Proposition à tester visuellement |
| Q13 | Quels composants/outils de **groupement, sélection, mixage et routage** sont déjà réellement présents dans le projet eVe ? | Vérification du projet nécessaire |

## 12. Scénarios de validation fonctionnelle — propositions, non encore approuvées

- **V1 — OUT OFF :** désactiver OUT coupe la sortie principale, mais un SEND configuré continue d'alimenter sa destination.
- **V2 — Sélection neutre :** sélectionner FX1 n'altère ni son emplacement ni le point d'application du fader général ; seules les commandes affichées à droite changent.
- **V3 — GAIN intermédiaire :** insérer un module GAIN entre deux effets permet d'ajuster le niveau reçu par les traitements suivants sans déplacer le fader général.
- **V4 — Départ pré-effet :** un départ placé avant un effet ne reçoit pas le résultat de cet effet.
- **V5 — Routage externe :** une interface audio offrant plusieurs sorties permet de choisir la sortie cible parmi celles effectivement disponibles.
- **V6 — Interface contextuelle :** choisir PAN affiche son contrôle réel à droite ; choisir FX affiche ses paramètres ; retirer la sélection restitue le fader général.
- **V7 — Vidéo avec son :** une source vidéo avec piste audio apparaît comme un groupe de voies audio/vidéo, avec effets indépendants ; la source reste un objet logique commun.
- **V8 — Vidéo sans son :** aucun fader audio superflu n'est généré pour une source vidéo muette.
- **V9 — Groupe hétérogène :** plusieurs tranches audio et vidéo peuvent former un groupe affichable de façon compacte et consultable tranche par tranche.
- **V10 — Synchronisation :** les différences de latence des chaînes de traitement ne désynchronisent pas involontairement le son et l'image ; règle technique et critères mesurables à définir.

## 13. Journal des décisions

- **14/10/2026 — Version initiale :** formalisation du schéma d'une tranche (IN, FX, AUX, SEND, PAN, +, OUT), du routage libre, de l'activation d'OUT indépendamment des sends et des contrôles contextuels.
- **14/10/2026 — Décision sur le fader :** fader général fixe en fin de chaîne ; sélection d'un module sans effet sur le circuit ; ajout libre de modules GAIN pour régler des niveaux intermédiaires. **Approche retenue.**
- **14/10/2026 — Exigences transversales :** compensation de latence, sidechain, multi-out et groupement/dégroupement de tranches à intégrer obligatoirement. **Principe retenu, modalités à définir.**
- **14/10/2026 — Réutilisation des outils eVe :** obligation de partir des modules, composants, comportements et API réellement existants. **Validé.**
- **14/10/2026 — Extension audiovisuelle :** mixage audio, vidéo et MIDI ; vidéo avec son = groupe natif de voies audio/vidéo distinctes, avec deux contrôles propres ; vidéo sans son = pas de groupe audio/vidéo imposé ; même système de groupes réutilisé pour plusieurs pistes audio/vidéo. **Validé pour le principe.**
- **14/10/2026 — Bandeau contextuel :** idée d'afficher volume, envois et pan en l'absence de module sélectionné. **Proposition soumise à l'épreuve du design, non validée.**

---

**Règle de maintenance :** à chaque nouvelle réponse dans la discussion, mettre à jour les sections concernées, faire passer les décisions confirmées en « validé », laisser les hypothèses ouvertes à part et ajouter une entrée courte au journal.

## Groupes de tranches — décisions validées (14 octobre 2026)

- Un groupe reste constitué lorsqu'on l'ouvre : le contrôle de déploiement/repliement est placé dans la partie inférieure de sa tranche représentative.
- Déplier révèle toutes les tranches membres et repousse les tranches voisines ; replier restaure l'affichage compact sans modifier le groupe.
- Glisser-déposer une tranche dans un groupe la groupe automatiquement ; extraire une tranche du groupe par glisser-déposer la dégroupe individuellement.
- Une vidéo avec audio forme par défaut un groupe audio/vidéo ; l'utilisateur peut cependant extraire l'une des voies si nécessaire.
- Lorsqu'un groupe est sélectionné, la barre latérale contextuelle propose l'outil « Tout dégrouper ». Ne pas détourner le clic long du contrôle de déploiement pour cette action.
- Une sélection multiple de tranches au lasso, selon le mécanisme déjà employé pour les cellules d'eVe, expose dans la barre latérale contextuelle l'outil « Grouper ».
- Réutiliser impérativement les composants, outils de sélection, lasso, barre latérale et comportements existants d'eVe ; vérifier leur implémentation avant toute modification.

À préciser : règles de réorganisation des groupes imbriqués et comportement exact du routage lors d'une extraction ; ne pas les considérer comme validés.

## Contrôles contextuels, bypass et queues d'effets — décisions validées (14 octobre 2026)

- **SEND :** chaque envoi dispose d'un niveau indépendant du volume principal. La sélection d'un module SEND affiche dans la colonne droite le **grand fader contextuel de niveau d'envoi**, à la place du fader principal ; ne pas afficher deux grands faders simultanément. Le libellé « SEND » et une correspondance visuelle avec le module sélectionné doivent rendre la fonction du fader immédiatement identifiable. À la désélection, retour au fader principal. La réalisation visuelle exacte reste à vérifier sur l'interface réelle d'eVe.
- **Effets :** sélectionner un effet affiche ses réglages natifs dans la colonne droite à la place du fader. La désélection restaure le fader principal. Ne pas inventer de panneau de réglages parallèle.
- **Bypass de chaque nœud :** geste de glissement court vers la gauche pour désactiver, vers la droite pour réactiver. Le nœud reste visible avec un état désactivé identifiable. La sélection d'un nœud désactivé conserve l'accès à ses réglages.
- **Drag-and-drop :** la manipulation pour déplacer/grouper une tranche se fait exclusivement par sa base / zone de sortie, pas par les modules, afin d'éviter les conflits gestuels avec le bypass et la sélection.
- **Arrêt réel des effets :** le bypass doit libérer le traitement après extinction de sa queue sonore, plutôt que laisser le traitement fonctionner inutilement en arrière-plan. La règle est **globale**, sans configuration individuelle obligatoire.
- **Queue d'effet :** au premier glissement vers la gauche, arrêter l'alimentation de l'effet et laisser se terminer naturellement la queue audible (par exemple une réverbération), puis arrêter réellement son traitement. Un **second glissement vers la gauche pendant la queue** provoque son arrêt immédiat.
- **Clic pendant le bypass :** un clic sur le module désactivé ouvre toujours ses réglages ; il **ne coupe pas** la queue. Cette règle remplace l'idée précédente d'un clic d'arrêt immédiat.
- **Limite technique à vérifier :** certains effets hébergés peuvent ne pas exposer de signal fiable de fin de queue ; définir une stratégie robuste de détection ou de temporisation avant implémentation. Ne pas promettre l'arrêt réel sans vérification des capacités des moteurs et plugins existants.

Ces règles sont **validées fonctionnellement**. Les détails de gestuelle, d'affichage et de gestion de queue doivent être testés avec les composants eVe existants sur appareils tactiles et souris.

## Routage par type de signal et base des tranches — décisions validées (14 octobre 2026)

- Un groupe replié n'affiche ni compteur ni résumé : seul le pictogramme de déploiement en bas signale le groupe. Son activation déplie les tranches en repoussant les voisines ; une nouvelle activation les replie.
- L'appui long sur la zone inférieure de la tranche permet de la déplacer, de l'intercaler ou de la grouper par glisser-déposer. Le déplacement ne démarre pas depuis les modules.
- Un clic simple sur la base / zone de sortie ouvre le sélecteur de destination. Il propose notamment « aucune sortie », une autre tranche, un bus ou une sortie matérielle compatible. Le choix « aucune sortie » supprime uniquement cette sortie ; les SEND indépendants restent fonctionnels.
- La base affiche le nom de la destination lorsqu'une sortie est affectée ; elle ne montre rien lorsqu'il n'y en a pas. Aucun pictogramme supplémentaire d'absence de sortie.
- **Audio :** destination par défaut = Main Out. L'utilisateur peut la changer ou la retirer.
- **MIDI brut :** le routage concerne le MIDI (sortie MIDI externe ou autre piste MIDI compatible), et non une sortie audio fictive. La destination par défaut MIDI reste à définir selon les périphériques et outils existants.
- **Vidéo :** destination par défaut = écran principal ; choix possible d'un autre écran, ou d'une autre piste/chaîne vidéo pour traitement, selon les possibilités réelles d'eVe.
- **Vidéo avec son :** deux voies liées dans le groupe natif, avec **routages et sorties indépendants** : la voie vidéo vers l'écran principal par défaut, la voie audio vers Main Out par défaut. Chaque sortie peut être redirigée ou désactivée séparément.
- Le glissement latéral de bypass concerne les modules de traitement, **pas la base de sortie** : éviter les conflits avec la sélection de destination et le glisser-déposer de tranche.
- Réutiliser les composants réels d'eVe ; vérifier les sorties et capacités existantes avant d'implémenter les choix proposés.

**À préciser ensuite :** les règles de sortie MIDI par défaut et la prévention des boucles de routage entre tranches et bus.

## Mise à jour consolidée — modules et gestes (validée, 14/10/2026)

### Architecture des modules (prioritaire sur les anciennes appellations)
- Un seul module **Envoi** remplace les catégories distinctes AUX / SEND / BUS dans la chaîne. Son rôle découle de sa destination (Bus A, autre tranche, sortie compatible), avec un niveau d'envoi indépendant. Un bus de réception reste identifiable par son entrée ; OUT est distinct de l'Envoi.
- Le **Volume** est un module explicite de la chaîne, insérable et déplaçable à n'importe quel rang avant ou après FX et Envoi. Il n'existe pas de second fader de volume caché, fixe en fin de chaîne. Sa position définit le point d'application du gain ; sélectionner un module ne change jamais le chemin du signal.
- Le contrôle contextuel à droite affiche le grand fader lorsque Volume est sélectionné, le niveau d'envoi lorsque Envoi est sélectionné, ou les paramètres natifs lorsque FX est sélectionné. Un **contour continu** englobe visuellement le module sélectionné à gauche et ses contrôles à droite, comme un bloc fonctionnel unique. Pas de double fader ni de panneau parallèle.
- Toutes les tranches, isolées ou dans un groupe, conservent exactement la même géométrie et les mêmes composants. Un groupe est un conteneur de tranches normales avec fader maître ; vidéo avec son = groupe natif vidéo + audio. Groupe ouvert = toutes les tranches complètes visibles, contour commun ; groupe fermé = tranche compacte standard. Commande en bas, chevron haut fermé / droite ouvert en mode droitier.
- Le chemin reste IN en haut, modules libres à gauche, zone contextuelle à droite, + puis OUT en bas. Le routage d'un Envoi est inséré à l'endroit choisi, jamais ajouté comme rangée sous le fader. La base OUT affiche seulement le nom de destination, ou rien. Les noms de bus doivent correspondre à des entrées identifiables. Pas de transport ni d'outils décoratifs inventés.

### Gestuelle des modules (validée)
- **Clic/tap simple** sur un module : le sélectionner et afficher ses réglages contextuels, même s'il est bypassé.
- **Swipe court à gauche sans maintien préalable** : bypass du module, qui reste visible. Pour un effet à queue, arrêter son alimentation, laisser finir sa queue, puis arrêter réellement le traitement ; un second swipe à gauche pendant la queue la coupe immédiatement.
- **Swipe court à droite sans maintien préalable** : réactiver le module.
- **Appui maintenu puis glissement vertical** : saisir et réordonner le module dans la chaîne, en conservant son identité, ses paramètres et ses connexions compatibles.
- **Appui maintenu puis glissement horizontal vers la droite, hors de la tranche** : amorcer la suppression. La suppression n'a lieu **qu'au relâchement dans une zone clairement identifiable** ; annuler si relâchement ailleurs. Jamais de suppression par swipe court.
- L'appui maintenu fait entrer explicitement en mode déplacement avant interprétation des glissements. Il faut distinguer la manipulation d'un **module** de celle de la **tranche entière**, qui se fait uniquement par sa base.
- Ne pas inventer de composant de suppression : réutiliser les gestes, outils et retours visuels d'eVe déjà existants. Tester les conflits de gestes sur tactile et souris et préserver le fonctionnement du clic de sélection.

### Démonstration visuelle et contrôle
- Commencer par **une seule tranche** avec Volume sélectionné et son contour unifié, puis montrer le même module déplacé avant/après FX, sans modifier le gabarit de la tranche.
- Illustrer ensuite FX sélectionné avec son interface native dans le même contour ; Envoi sélectionné avec sa destination et son niveau.
- Le dessin n'est pas une preuve d'implémentation ; vérifier les composants eVe existants avant développement.

**Journal :** validation de l'appui maintenu + glissement vertical pour réordonner ; appui maintenu + glissement horizontal vers l'extérieur pour supprimer au relâchement ; swipes courts réservés au bypass/réactivation. Règles d'Envoi unique, de Volume positionnable et de contour commun reconfirmées. Cette section prévaut sur toute formulation historique contradictoire.

## Recette obligatoire avant livraison — validé (14/10/2026)

**Règle bloquante :** avant de rendre une implémentation du mixeur, vérifier réellement chaque exigence applicable du présent cahier des charges. Ne pas assimiler un rendu visuel ou une compilation réussie à une validation fonctionnelle. Consigner pour chaque test : scénario, résultat attendu, résultat observé, environnement, statut PASS/FAIL/NON TESTÉ et preuve reproductible. Tout FAIL ou NON TESTÉ doit être déclaré explicitement ; ne pas annoncer une livraison entièrement validée dans ce cas.

1. **Mixage et signal réel :** tester les chaînes audio, vidéo et MIDI pertinentes, l'ordre séquentiel des modules, le niveau et le chemin effectif du signal, la position variable de Volume avant/après les FX et les Envois, et l'indépendance des sorties des voies audio/vidéo.
2. **Cycle de vie des modules :** tester ajout via « + » et double-clic, sélection et affichage natif à droite, réordonnancement par appui maintenu + déplacement vertical, suppression par appui maintenu + glissement horizontal extérieur et relâchement en zone de suppression, annulation de suppression, maintien des paramètres et connexions après déplacement.
3. **Activation et bypass :** tester swipe gauche pour désactiver, swipe droite pour réactiver, maintien du module visible et éditable, absence de suppression involontaire ; vérifier la queue d'effet au premier bypass, l'arrêt réel après extinction et l'arrêt immédiat au second swipe gauche.
4. **Entrées et sorties :** tester le clic sur chaque nœud IN et OUT, l'affichage des entrées/sorties réellement disponibles et compatibles, leur sélection, changement et retrait, l'affichage du nom choisi, les valeurs par défaut (Main Out audio, écran principal vidéo), et les sorties MIDI compatibles. Vérifier que l'absence de sortie principale ne coupe pas les Envois indépendants.
5. **Bus et Envoi unique :** tester l'énumération des bus existants, le choix d'un bus comme destination, la correspondance exacte entre nom de destination et nœud IN du bus, ainsi que **la création d'un nouveau bus depuis le parcours de routage lorsque nécessaire**, puis sa disponibilité immédiate comme destination et son fonctionnement effectif. Réutiliser le mécanisme de création et de routage existant dans eVe ; s'il manque, le signaler et définir l'implémentation avant validation, sans inventer une interface parallèle.
6. **Routage libre :** tester les Envois à différents rangs de chaîne, le niveau indépendant de chaque Envoi, les sorties vers autres tranches, bus et périphériques, le multi-out, le sidechain et la gestion des connexions incompatibles ou des boucles.
7. **Groupes :** tester groupement par glisser-déposer et lasso + outil contextuel, dépliage/repliage, déplacement des tranches voisines, extraction individuelle, dégroupement contextuel, conservation des tranches natives et de leurs paramètres, fader maître, ainsi que les groupes vidéo avec voie image et voie audio distinctes.
8. **Latence et synchronisation :** vérifier la compensation des latences des effets, des bus et des routes parallèles et la synchronisation audio/vidéo ; définir des mesures et seuils avant de déclarer ces fonctions validées.
9. **Gestes et UI :** tester tactile et souris, absence de conflits entre clic, swipe court et appui maintenu, contour unifié du module sélectionné et de ses paramètres, tailles invariantes des tranches, contrôle de groupe en bas et absence de commandes décoratives inventées.
10. **Régression :** exécuter les scénarios sur les configurations et plateformes effectivement prises en charge par eVe ; vérifier que les outils, modules, API et comportements déjà existants ne sont pas cassés. Documenter les limites de l'environnement de test.

**Livrable de recette :** matrice de traçabilité reliant chaque exigence aux tests, résultats et preuves ; liste des anomalies et limitations restantes. Ne pas supprimer les questions techniques encore ouvertes du cahier des charges : les résoudre ou les marquer NON TESTÉ / À SPÉCIFIER. La création de bus est une exigence fonctionnelle explicite ; son interface exacte doit réutiliser les outils existants et reste à vérifier dans le projet.

## Contrat visuel final — précisions issues des maquettes approuvées (14/10/2026)

**Statut : validé pour les règles ci-dessous. Cette section prévaut sur toute illustration ou formulation historique contradictoire ; ne pas considérer les images de démonstration comme une liste obligatoire de modules.**

- **Gabarit immuable :** chaque tranche isolée, maître ou membre d'un groupe ouvert reprend strictement la même géométrie et le même module de base, sans réduction. Les tranches d'un groupe ouvert s'affichent **horizontalement côte à côte** sous un **seul contour extérieur** de groupe ; les voisines sont repoussées. Le groupe conserve une tranche maître complète avec son fader, et chaque enfant son propre fader indépendant.
- **Couleurs :** le groupe maître peut être violet et ses tranches membres utiliser des couleurs distinctes (exemples approuvés : bleu, vert, orange), afin de distinguer le parent des enfants. La couleur n'altère ni les dimensions ni les fonctionnalités.
- **Déploiement :** seule la tranche représentant réellement un groupe possède un chevron dans sa base inférieure ; **aucun chevron sur les enfants ordinaires A1/A2/A3**. En mode droitier, chevron **vers la droite pour un groupe ouvert**, **vers le haut pour un groupe replié**. Les chevrons éventuellement dessinés dans un en-tête ne sont pas des commandes validées et ne doivent pas être ajoutés.
- **Bas de la tranche :** le bouton **« + »** et le nœud **OUT** restent ancrés au bas de la colonne gauche, dans cet ordre vertical, immédiatement au-dessus de la bande inférieure portant le nom de la tranche. L'espace libre se trouve **au-dessus** de ces deux modules, sans déplacer les autres modules vers le bas pour le remplir. IN reste en haut. La bande inférieure sert de poignée de déplacement de la tranche.
- **Contrôle contextuel :** le module sélectionné à gauche et sa zone native de commande à droite sont unis par un **contour lumineux continu**. Si **Volume** est sélectionné, le grand fader vertical occupe toute la hauteur utile de la zone de droite. Si **FX** est sélectionné, **le fader disparaît entièrement** et les paramètres de l'effet **le remplacent dans cette même zone**, qui peut s'élargir pour eux : **aucun troisième panneau** ni fader persistant. La sélection de PAN ou Envoi remplace également le contenu par son contrôle approprié. Une tranche sans sélection ne doit pas afficher un grand panneau vide ; le comportement de sélection par défaut reste à finaliser sans inventer de commandes.
- **Modules non obligatoires :** une chaîne peut contenir plusieurs FX, plusieurs Envois, un module **MONO** ou d'autres modules compatibles, dans un ordre libre. Le dernier visuel d'exemple montre notamment deux Envois, un FX, Volume et MONO ; ces choix illustrent la modularité, **pas une configuration imposée**. Ne pas confondre Envoi et OUT.
- **Fidélité des maquettes :** les exemples approuvés sont les références de style (bleu nuit, tuiles arrondies, halo discret, typographie minimale). Toute demande de déplacement d'un seul élément doit préserver **strictement tous les autres éléments**. Ne pas rajouter de menus, légendes, transports, boutons Solo/Mute ou réglages supplémentaires non demandés. L'assemblage de plusieurs visuels doit préserver leurs designs et proportions, sans substituer des mini-tranches.
- **Recette visuelle supplémentaire :** comparer les gabarits des enfants et du parent, vérifier le fader maître et les faders individuels, l'absence de chevrons sur les enfants, les chevrons réservés aux groupes, les couleurs distinctes, l'ancrage de +/OUT, et la disparition complète du fader lors de l'ouverture d'un FX. Toute divergence est à corriger avant livraison.

**Précision de portée :** la maquette de démonstration « VIDEO + A1/A2/A3 » est un exemple de groupe, et non une obligation d'avoir trois pistes audio dans toute vidéo. La règle fonctionnelle native reste : vidéo avec son = au moins une voie vidéo et une voie audio distinctes, avec sorties indépendantes.

## Journal d'implémentation (14/10/2026)

- **Réalisé.** Voir [mixer_plan.md](mixer_plan.md) (décisions D1–D9) et [mixer_recette.md](mixer_recette.md) (matrice).
- **Décisions d'implémentation, réversibles et non validées par le cahier :**
  - le fader vidéo est l'opacité (Q10) ;
  - « Grouper » des tranches uniquement audio crée un bus de sous-mix maître (Q9) ;
  - un membre qui quitte un groupe-bus reprend la destination du maître ;
  - par défaut, la sélection montre le module de niveau, sinon IN (Q12) ;
  - la sortie MIDI par défaut est « aucune ».
- **Points toujours à préciser :** groupes imbriqués, boucles inter-groupes plus fines, seuils de synchronisation A/V, mixeur sur iOS (moteur Swift sans graphe).
