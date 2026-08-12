# Atome/eVe — Songlist, hiérarchie, enregistrement et toolbox contextuelle

## Objet

Ce document décrit le concept complet de la nouvelle Songlist Atome/eVe, son comportement hiérarchique, son fonctionnement multipiste, sa zone temporelle basse, la logique d’enregistrement, la toolbox contextuelle de droite et les règles de design associées.

Le but est de conserver une interface extrêmement simple en surface, tout en permettant une profondeur fonctionnelle importante.

---

# 1. Philosophie générale

La Songlist doit pouvoir être utilisée aussi simplement que :

- une liste de chansons ;
- un bloc-notes ;
- une liste de contenus ;
- une liste de médias ;
- une playlist ;
- une structure de performance.

Elle ne doit pas ressembler visuellement à un DAW complexe tant que l’utilisateur ne descend pas dans les niveaux.

Principe fondamental :

> La complexité apparaît uniquement quand l’utilisateur choisit explicitement d’aller plus profond.

---

# 2. Structure globale de l’écran

L’écran est composé de trois zones principales :

1. **Zone centrale**
   - contenu principal ;
   - ici : Songlist en mode Liste.

2. **Toolbox principale en bas**
   - fixe ;
   - invariable ;
   - 9 outils ;
   - tous carrés et de même taille.

3. **Toolbox contextuelle à droite**
   - change selon le contexte ;
   - l’outil Activité/Contexte reste permanent en bas de cette toolbox, juste au-dessus de l’outil Atom.

Lorsque le niveau **Pistes / Mixage** est réellement affiché, la zone centrale se termine par une zone temporelle basse attachée aux pistes. Cette zone appartient au contenu multipiste : elle n’est ni un footer global, ni une toolbox supplémentaire, ni une quatrième zone principale de l’écran.

---

# 3. Règle géométrique stricte

## Outils

Tous les outils :
- toolbox du bas ;
- toolbox de droite ;

doivent être :

- carrés ;
- strictement de même dimension.

## Lignes

Chaque ligne de la Songlist doit avoir une hauteur exactement égale à :

> **la moitié du côté d’un carré d’outil**

Cette règle est absolue et doit être conservée dans le prototype puis dans l’implémentation.

La zone temporelle basse est composée de deux lignes compactes. Chacune reprend la hauteur normale d’une ligne de Songlist, soit exactement la moitié du côté d’un outil. Ces lignes ne sont pas des outils : elles occupent la largeur utile du multipiste et ne dérogent pas à la règle imposant des outils carrés.

---

# 4. Structure d’une ligne

Chaque ligne comporte, de gauche à droite :

1. **Accordéon**
2. **Groupe**
3. **Nom / Label**
4. **Zone de contenu / preview**

---

# 5. Accordéon

Le petit triangle situé complètement à gauche d’une ligne sert uniquement à :

- déplier ;
- replier.

Il ne doit pas :
- jouer ;
- sélectionner ;
- ouvrir une autre page ;
- changer de comportement selon le niveau.

Son comportement doit rester parfaitement prévisible.

---

# 6. Visualisation de la profondeur

Quand un élément est déplié :

- les niveaux enfants sont indentés ;
- l’accordéon enfant reste dans son propre carré ;
- les colonnes doivent rester rigoureusement alignées ;
- la profondeur ne doit pas être matérialisée par un simple espace vide.

Une ligne/bande verticale continue doit matérialiser chaque niveau de profondeur.

Cette ligne doit être alignée exactement sur la colonne d’accordéon correspondante.

Objectif :

- comprendre immédiatement qu’on est dans une Song ;
- puis dans une Section ;
- puis dans une Piste.

Le système doit rester minimaliste.

---

# 7. Les trois niveaux fondamentaux d’un morceau

## Niveau 1 — Song

Représente le morceau.

Une Song peut rester totalement simple si l’utilisateur ne souhaite pas aller plus loin.

En surface, elle peut afficher une preview du contenu réel enregistré plus profondément.

---

## Niveau 2 — Structure / Section

Une Song peut contenir des sections successives :

- Intro ;
- Couplet ;
- Refrain ;
- Pont ;
- etc.

Ces éléments sont lus séquentiellement.

Ce niveau est le niveau de structure temporelle du morceau.

---

## Niveau 3 — Pistes / Mixage

Une Section peut contenir plusieurs pistes.

Contrairement aux Sections, les pistes d’une même Section sont destinées à fonctionner simultanément.

Exemples :
- voix ;
- guitare ;
- batterie ;
- sampler ;
- MIDI ;
- vidéo ;
- code déclenché ;
- etc.

Le niveau Pistes / Mixage est le seul niveau qui affiche la zone temporelle basse. Elle reste absente de la Songlist générale et du niveau Structure afin de ne jamais exposer inutilement la complexité du multipiste.

---

# 8. Sous-niveaux supplémentaires

Une Piste peut elle-même être dépliée.

Exemples :

- Sampler → zones/samples ;
- MIDI → notes MIDI ;
- vidéo → couches ou contenus associés ;
- autres objets complexes.

Le système reste récursif, mais la sémantique de lecture dépend du niveau.

---

# 9. Principe fondamental : le média réel vit au niveau Piste

Le vrai contenu enregistré ou importé :

- waveform ;
- vidéo ;
- MIDI ;
- autre média temporel ;

doit vivre au niveau **Piste**.

Une Song ou une Section peut afficher une preview synthétique de ce contenu, mais le média source est attaché à la Piste.

---

# 10. Record — logique automatique

## Principe

Record agit en fonction du niveau actuellement focalisé.

L’utilisateur n’a pas à créer manuellement tous les niveaux intermédiaires.

---

## Record depuis la Songlist

Record crée automatiquement :

1. une nouvelle Song ;
2. sa première Section ;
3. sa première Piste ;
4. le média enregistré dans cette Piste.

Conceptuellement :

**Song → Section 1 → Piste 1 → média**

Mais l’interface reste repliée par défaut pour conserver la simplicité.

La nouvelle Song apparaît donc comme une ligne simple.

Elle peut montrer une preview de la waveform ou du média.

Les niveaux internes existent réellement, mais ne sont visibles qu’en dépliant.

---

## Record depuis une Song

Si la Song est le niveau actif, Record peut créer une nouvelle Section avec sa première Piste.

L’utilisateur reste dans une logique de construction de structure.

---

## Record depuis une Section

Si une Section est active, Record crée une nouvelle Piste dans cette Section.

C’est à ce niveau que le comportement devient naturellement multipiste.

---

## Record depuis le niveau Piste / Mixage

Les nouveaux enregistrements créent de nouvelles pistes parallèles dans le mixage courant.

Lorsque Punch In et Punch Out sont définis dans ce contexte, ils bornent temporellement la prise sans modifier la logique de création de la Piste.

---

# 11. Pourquoi ne pas tout déplier automatiquement après Record

Le prototype ne doit pas ouvrir automatiquement toute la hiérarchie après un enregistrement.

Raison :

- la majorité des usages simples peuvent rester monopiste ;
- l’utilisateur ne doit pas être confronté immédiatement à Song → Section → Piste ;
- il découvre la profondeur uniquement s’il déplie.

Cela permet d’avoir une expérience simple pour un utilisateur classique et un système profond pour un utilisateur avancé.

---

# 12. Preview d’une ligne

La grande zone de contenu d’une ligne est une surface interactive distincte de l’accordéon.

Un clic/tap sur cette zone :

- audio → lecture ;
- vidéo → lecture/affichage ;
- texte → affichage ;
- image → affichage ;
- autre contenu → activation adaptée.

Si le Visualiseur est ouvert, le contenu compatible est affiché dedans.

---

# 13. Réorganisation

Un clic long / appui long sur la zone de contenu permet :

- de saisir la ligne ;
- de la déplacer ;
- de réorganiser l’ordre des éléments.

Cette interaction doit rester distincte du clic simple de lecture/affichage.

---

# 14. Groupe / Mute

La cellule Groupe peut être utilisée pour agir rapidement sur l’état du groupe ou de l’élément.

Comportement proposé/validé pour le prototype :

- clic simple → mute / unmute ;
- clic long → créer/assigner un nouveau groupe.

Cette logique est particulièrement utile pour :
- dupliquer des sections ;
- créer Couplet 1 / Couplet 2 ;
- muter certaines pistes dans une variante ;
- conserver des clones modifiables.

---

# 15. Pistes qui dépassent la fin d’une section

Ne pas ajouter de « piste transverse » flottante traversant visuellement plusieurs sections.

Cette solution encombrerait fortement l’interface.

Préférer une propriété simple de la Piste :

> **continuer à jouer jusqu’à sa propre fin, même si la Section se termine**

Cette propriété peut permettre :
- qu’un son continue dans la Section suivante ;
- qu’un effet ou un média dépasse une limite de structure ;
- des comportements temporels complexes sans casser la hiérarchie.

Cette propriété pourra être exposée dans les outils contextuels.

---

# 16. Précision temporelle audio et vidéo

Le système doit être conçu pour permettre une lecture et un enregistrement temporel précis **au sample près** pour l’audio.

Conséquences :

- aucune Section ne doit introduire un décalage arbitraire ;
- le passage d’une Section à l’autre doit pouvoir être calculé sur une timeline audio exacte ;
- les Pistes peuvent commencer à un offset précis ;
- les opérations de crop, split, join, grab et loop doivent conserver la précision temporelle ;
- le moteur de lecture doit être indépendant de la représentation visuelle ;
- la Songlist est une vue structurée de données temporelles précises, pas la source du timing.

Pour l’audio, la position canonique reste précise au sample près, quelle que soit l’unité ou la densité visuelle de la ruler.

Pour la vidéo, le timecode doit pouvoir être interprété et affiché au format SMPTE selon le framerate défini par le projet. Le framerate appartient aux données temporelles du projet ; il ne devient pas un contrôle permanent ajouté à l’interface.

La ruler, les timecodes et le playhead ne sont que des projections de ce temps canonique. Les pixels de l’interface ne deviennent jamais la source du timing.

---

# 17. Lecture séquentielle et simultanée

La sémantique dépend du niveau.

## Songlist

Les Songs/items peuvent être lus séquentiellement.

## Structure

Les Sections :
- Intro ;
- Couplet ;
- Refrain ;
- etc.

sont lues séquentiellement.

## Mixage / Pistes

Les Pistes d’une même Section sont jouées simultanément selon leur position temporelle.

---

# 18. Zone temporelle basse du niveau Pistes / Mixage

La surface Pistes / Mixage se termine par une zone temporelle basse attachée aux pistes.

Cette zone :

- apparaît uniquement lorsque le niveau multipiste est déplié ou focalisé ;
- disparaît lorsque l’utilisateur revient au niveau Songlist ou Structure ;
- n’est ni un footer global, ni une nouvelle toolbox, ni un quatrième niveau de la hiérarchie ;
- reste limitée à deux lignes compactes ;
- ne contient aucun nouvel outil permanent.

## Ligne supérieure — Rail de repères temporels

La ligne supérieure regroupe une seule famille visuelle de repères temporels typés :

- Start ;
- End ;
- Loop In ;
- Loop Out ;
- Punch In ;
- Punch Out ;
- Markers / zones nommées.

Start et End définissent les bornes de travail. Les déplacer ne réalise pas automatiquement un crop destructif et n’empêche pas une Piste autorisée à continuer de jouer jusqu’à sa propre fin.

Loop In et Loop Out définissent l’intervalle de boucle actif. Punch In et Punch Out définissent l’intervalle d’enregistrement. Ces quatre bornes restent manipulables comme des repères, pas comme des boutons permanents.

Les Markers conservent leur rôle de zones temporelles globales, nommées et dimensionnées. Un Marker possède un début et une durée ; il ne devient ni une Piste, ni un média, ni un simple point indifférencié. Sa portion sur chaque Piste reste une projection du contenu canonique de cette Piste.

Seuls les repères définis ou utiles au contexte actif sont affichés.

## Ligne inférieure — Ruler temporelle / Time ruler

La ligne inférieure affiche les graduations et les timecodes utiles au contexte.

Une seule unité principale est visible à la fois. Elle peut s’adapter au besoin :

- mesures / temps musicaux ;
- minutes / secondes ;
- samples lorsque la précision audio doit être explicitée ;
- SMPTE pour la vidéo.

L’affichage SMPTE utilise le framerate défini par le projet. Le changement d’unité ou de niveau de zoom ne modifie jamais la position temporelle canonique.

Les graduations et libellés doivent être suffisamment espacés pour fournir un repère utile sans transformer la zone en mini-DAW.

## Playhead / tête de lecture

Un playhead unique indique la position courante.

Il est aligné sur la ruler et le rail de repères afin de donner une référence commune aux pistes, aux timecodes et aux bornes temporelles. Le playhead traverse les deux lignes de la zone basse ; sa projection dans le contenu multipiste doit rester fonctionnelle et minimale.

Le playhead ne constitue pas un outil supplémentaire.

## Relation avec les outils contextuels

La zone temporelle permet de lire, placer et ajuster les repères temporels.

Crop, Split et Grab restent exclusivement des outils contextuels liés à l’objet ou à la sélection courante. Ils ne deviennent pas des boutons permanents dans cette zone.

L’outil Loop configure le comportement de boucle à partir de Loop In et Loop Out ; il n’est pas dupliqué dans le rail. Les boucles propres à une Piste restent des propriétés contextuelles de cette Piste et ne créent pas de rail permanent supplémentaire.

Aucune troisième bande, toolbar fixe, légende permanente ou invention décorative ne doit être ajoutée.

---

# 19. Barre de contexte au-dessus de la toolbox principale

Une barre contextuelle interactive peut être affichée juste au-dessus de la toolbox fixe.

Elle sert à indiquer clairement le niveau actif.

Exemples :

- Songlist ;
- Song : Toto ;
- Song : Toto › Refrain ;
- Song : Toto › Refrain › Piste 3.

Cette barre peut également servir plus tard pour :
- renommage ;
- navigation de profondeur ;
- retour ;
- informations directement liées au niveau actif.

Elle doit rester concise.

La barre de contexte reste distincte de la zone temporelle basse. Dans le niveau multipiste, l’ordre vertical est :

1. Pistes ;
2. zone temporelle basse ;
3. barre de contexte, lorsqu’elle est affichée ;
4. toolbox principale fixe.

Principe UI :

- information passive → peut être placée plus haut ;
- interaction → préférentiellement en bas, proche du doigt.

---

# 20. Toolbox contextuelle de droite

## Principe

La toolbox de droite est entièrement contextuelle.

Son contenu dépend :
- du niveau ;
- de l’objet sélectionné ;
- de l’activité active.

Elle ne doit jamais être remplie artificiellement pour occuper toutes les cases.

Les emplacements inutilisés restent vides.

Crop, Split, Join, Suppression de zone et Grab restent dans ce système contextuel existant. Aucun de ces outils ne doit être dupliqué sous les pistes.

---

# 21. Activité / Contexte

L’outil permanent situé en bas de la toolbox droite, juste au-dessus d’Atom, sert à changer l’activité/contexte.

Exemples :

- Songlist ;
- Mixage ;
- Image ;
- Vidéo ;
- Audio ;
- Mise en page ;
- Texte ;
- etc.

Changer d’activité peut modifier :
- les outils disponibles ;
- la représentation centrale ;
- la logique d’interaction.

Exemple :
- activité Mixage → vue adaptée au mixage.

En dehors de la zone temporelle basse définie dans ce document, ne pas inventer le reste de la vue Mixage tant qu’il n’est pas spécifié.

---

# 22. Outil contextuel 1 — Lecture

Le premier outil contextuel au-dessus d’Activité est l’outil Lecture.

Il lit le contexte courant.

## Au niveau Songlist
Lecture séquentielle des Songs/items.

## Au niveau Structure
Lecture séquentielle des Sections.

## Au niveau Pistes / Mixage
Lecture du contexte multipiste courant.

Un clic direct sur une ligne reste également possible pour jouer uniquement cette ligne.

---

# 23. Métronome

Outil contextuel destiné à :
- métronome ;
- décompte ;
- préparation d’enregistrement ;
- fonctions rythmiques associées.

---

# 24. Visualiseur

Outil contextuel permettant d’ouvrir une vue/preview dans la zone centrale.

Exemple :
- liste en bas ;
- visualiseur au-dessus.

Le visualiseur sert à afficher :
- vidéo ;
- image ;
- texte ;
- autre contenu compatible.

---

# 25. Browse / Import

Outil contextuel permettant d’importer de nouveaux éléments dans :
- la liste ;
- la Song ;
- la Section ;
- le contexte actif.

L’élément importé est placé dans le niveau actuellement focalisé, selon sa nature.

---

# 26. FX

Outil contextuel d’effets.

Le système doit permettre deux niveaux d’application :

1. appliquer un effet à une Piste entière ;
2. « peindre » un effet localement sur une portion temporelle.

L’interface détaillée n’est pas encore verrouillée.

---

# 27. Crop

Permet de définir ou réduire la zone utile d’un média/piste.

Doit conserver la précision temporelle.

Déplacer Start ou End permet d’ajuster les bornes de travail, mais ne réalise pas automatiquement un crop destructif.

Crop reste contextuel et n’est jamais affiché comme commande permanente dans la zone temporelle basse.

---

# 28. Split

Permet de couper une Piste ou une zone temporelle.

Split reste contextuel et n’est jamais affiché comme commande permanente dans la zone temporelle basse.

---

# 29. Join

Permet de joindre des segments compatibles.

---

# 30. Suppression de zone

Permet de supprimer une portion temporelle.

---

# 31. Grab / déplacement temporel

Permet de saisir une Piste ou un élément temporel et de le déplacer dans le temps.

Exemple :
- retarder une piste ;
- avancer une piste ;
- repositionner précisément un élément.

Grab reste contextuel et n’est jamais affiché comme commande permanente dans la zone temporelle basse.

---

# 32. Loop

Permet de définir le comportement de boucle.

Exemples :
- boucle complète ;
- boucle sur une sélection ;
- boucle un nombre donné de fois ;
- longueurs de boucles différentes selon les pistes.

Cela permet notamment des comportements de type polyrhythmie.

Loop In et Loop Out sont les repères de l’intervalle actif. L’outil Loop en configure le comportement. Les boucles propres à une Piste restent des propriétés contextuelles de cette Piste et ne créent pas de rails permanents supplémentaires.

---

# 33. Interaction hiérarchique et focus

Le niveau actif est fondamental.

Il détermine notamment :
- où Record crée ;
- où Création ajoute ;
- où Import insère ;
- ce que Lecture joue ;
- quels outils contextuels apparaissent.

Le système doit rendre ce focus perceptible sans surcharger l’écran.

Les principaux signaux sont :
- indentation ;
- rails verticaux ;
- barre de contexte ;
- contenu actuellement déplié.

---

# 34. Accordéon vs Focus profond

Deux comportements complémentaires sont possibles.

## Accordéon
Pour :
- explorer rapidement ;
- conserver le contexte ;
- ouvrir/refermer un niveau.

## Focus profond
Pour :
- isoler un niveau complexe ;
- travailler sans pollution visuelle.

Le triangle d’accordéon reste toujours un simple déplier/replier.

Le mécanisme permettant d’isoler un niveau et de revenir en arrière reste à définir.

---

# 35. Mode monopiste vs multipiste

Le système doit permettre à un utilisateur monopiste de ne jamais être confronté inutilement au multipiste.

Workflow simple :

1. Record ;
2. une Song apparaît ;
3. sa preview est visible ;
4. lecture possible immédiatement.

Workflow avancé :

1. déplier Song ;
2. voir la Structure ;
3. déplier Section ;
4. voir les Pistes ;
5. voir apparaître la zone temporelle basse du multipiste ;
6. Record à ce niveau ;
7. création d’une nouvelle Piste parallèle.

Ainsi :
- le monopiste reste simple ;
- le multipiste est disponible sans changer d’application ni de paradigme.

La zone temporelle disparaît dès que le niveau Pistes / Mixage n’est plus affiché.

---

# 36. Principe général de simplicité

Règles à respecter dans toute implémentation :

- ne rien ajouter sans justification explicite ;
- ne jamais remplir l’UI « pour faire joli » ;
- ne jamais dupliquer une fonction déjà accessible ailleurs ;
- ne pas introduire de header interactif si l’action peut logiquement rester en bas ;
- privilégier une structure progressive ;
- masquer la complexité tant qu’elle n’est pas nécessaire ;
- rendre chaque geste prévisible ;
- conserver un comportement identique pour un même contrôle ;
- ne pas imposer les conventions des DAW, éditeurs vidéo ou logiciels de design traditionnels si elles ne sont pas nécessaires ;
- limiter la zone temporelle basse à deux lignes ;
- n’afficher que les repères définis ou utiles ;
- ne pas ajouter de troisième rail, de boutons décoratifs ou de toolbar fixe sous les pistes.

---

# 37. État actuel du concept

Le concept est suffisamment cohérent pour passer à un prototype fonctionnel plus complet.

Les principaux points encore ouverts concernent surtout :
- le mécanisme exact de focus profond / retour ;
- le reste de la vue Mixage, hors zone temporelle basse désormais définie ;
- le détail de certains outils contextuels ;
- la représentation finale des états actifs/mute/groupes ;
- la manière exacte d’afficher certaines previews.

Aucun de ces points ne bloque la validation du fonctionnement général Song → Structure → Piste ni la logique de Record.
