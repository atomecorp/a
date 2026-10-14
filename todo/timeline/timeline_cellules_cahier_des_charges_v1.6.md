# atome/eVe — Timeline, Cellules et enregistrement
## Cahier des charges consolidé — décisions de conception et points techniques résiduels

**Date :** 14 octobre 2026  
**Statut :** v1.6 — maquettes Timeline validées (en-têtes compacts et ouverts), règles d’implantation et d’outils latéraux précisées ; détails techniques restant ouverts ; non intégré aux dépôts GitHub  
**Périmètre :** Molecule, Timeline, vue Cellules, lecture, déclenchement, quantification, Record, Record Action, Input, MIDI, traitement audio et édition groupée (principe transversal pour atome/eVe).  
**Méthode convenue :** aborder un seul point à la fois ; ne jamais le clôturer sans demander à l'utilisateur s'il reste un détail et obtenir sa validation. Les propositions de l'assistant ne valent pas décision tant qu'elles ne sont pas confirmées.

### Légende
- **VALIDÉ** : décision expressément confirmée par l'utilisateur, ou point déclaré terminé.
- **EXPRIMÉ** : instruction claire donnée par l'utilisateur, mais pas encore soumise à une validation de clôture du thème.
- **OUVERT** : décision ou modalité à préciser, sans supposition.
- **PROPOSÉ** : idée formulée par l'assistant et non validée formellement.

## 1. Architecture du produit et deux vues

1. **VALIDÉ — Les cellules sont indispensables.** Le modèle de cellules et leur utilisation en live doivent être conservés dans atome/eVe. Leur exclusion de `NewMolecules.md` ne correspond pas à l'intention produit.
2. **VALIDÉ — Deux vues du même contenu :** une vue **Timeline**, chronologique, et une vue **Cellules**, orientée déclenchement/jeu live. Il ne s'agit pas de deux contenus indépendants ni de deux copies des médias.
3. **VALIDÉ — Affichage libre :** Timeline seule, Cellules seules, ou les deux à l'écran dans une vue divisée (split). Elles interagissent et reflètent les modifications sur les mêmes contenus.
4. **VALIDÉ — Lecture linéaire :** en mode Timeline, déroulement chronologique selon le temps de la timeline, indépendamment de l'ordre des cellules et des Follow Actions.
5. **VALIDÉ — Lecture non linéaire :** en mode Cellules, la lecture tient compte de l'ordre des cellules et de leurs Follow Actions.
6. **VALIDÉ — Les deux possibilités de lecture restent accessibles lorsque les deux vues sont ouvertes.**
7. **VALIDÉ — Pas de lectures parallèles entre les deux stratégies de transport :** lorsque l'utilisateur lance volontairement l'autre mode de lecture, celui-ci prend la main, à la place du précédent ; les deux vues peuvent rester présentes.
8. **EXPRIMÉ — Conserver les scènes / lancements coordonnés** prévus dans la conception fondatrice, à détailler ultérieurement.

## 1 bis. Correspondance Timeline / Cellules, Scènes et Échantillons — précisions de la séance ~01:01–01:08

### Organisation et correspondance visuelle

1. **EXPRIMÉ — Concept propre à atome/eVe, sans obligation de reproduire Ableton ou Roland Zenbeats.** Les exemples externes ne déterminent pas le comportement du produit.
2. **EXPRIMÉ — Correspondance des rangées :** chaque ligne/piste de la Timeline correspond à une ligne de cellules dans la projection **Pistes**. Les cellules sont **carrées** ; leurs dimensions et la grille doivent être standardisées. Les proportions exactes restent à établir à partir de l'UI réelle.
3. **EXPRIMÉ — Bande des Scènes sur la Timeline :** tout en bas des pistes se trouve une ligne de **même hauteur que les autres pistes**. Cette ligne accueille les **régions/repères temporels** définissant les Scènes.
4. **EXPRIMÉ — Bande de boucle distincte :** une **petite ligne supplémentaire sous la ligne des Scènes** représente les points/plages de boucle d'une portion de la Timeline. Cette fonction est **indépendante** des Scènes.
5. **EXPRIMÉ — Trois projections au choix dans la vue Cellules :** **Pistes**, **Scènes**, **Échantillons**. La vue Cellules peut être seule ou simultanément affichée avec la Timeline en split. Le contexte/sélection de l'objet dans la Timeline détermine ce que les cellules représentent ; ne pas créer trois moteurs ni trois sources de vérité.

### Enchaînement par défaut des Scènes — décision ~01:21

- **VALIDÉ — Par défaut, une Scène terminée déclenche automatiquement la Scène suivante** dans l'ordre temporel, lorsqu'elle existe.
- **VALIDÉ — Si aucune Scène suivante n'existe, la lecture s'arrête** en l'absence d'une règle personnalisée.
- **VALIDÉ — Une Follow Action explicitement configurée sur la Scène peut remplacer cet enchaînement par défaut.** Les options de répétition font partie des paramètres à prévoir ; leur catalogue exact reste à valider.
- **OUVERT — Catalogue des Follow Actions personnalisées** : prochaine, précédente, cible précise, aléatoire, arrêt, répétitions/conditions, à confirmer une seule fois sans réexaminer le comportement par défaut.

### Mode Scènes

6. **VALIDÉ sur le concept — Une Scène est une plage temporelle de la Timeline** matérialisée par une région dans sa bande dédiée ; elle **lance les cellules/contenus compris dans cette plage**. L'utilisateur a confirmé explicitement ce sens vers ~01:08:00 (« exactement ça ») et l'a réaffirmé vers ~01:08:09. Ne pas redemander si une Scène est une plage temporelle.
7. **EXPRIMÉ — Projection Scènes autonome :** en mode **Scènes**, la vue Cellules peut montrer **uniquement les Scènes** (sans les autres cellules). Les Scènes deviennent des cibles manipulables, sélectionnables au lasso et configurables en batch.
8. **EXPRIMÉ — Enchaînement des Scènes :** elles peuvent se jouer l'une après l'autre **linéairement** ou suivre des **Follow Actions propres à chaque Scène**, modifiables via une sélection.
9. **EXPRIMÉ — Les Scènes sont jouables comme des cellules**, avec les paramètres pertinents déjà prévus pour celles-ci : nombre de lectures/boucles, mode de déclenchement, quantification, attaque, release, et comportements applicables en batch. Les effets n'ayant pas de sens pour certains contenus restent conditionnels à leur type, sans imposer des valeurs fictives.
10. **VALIDÉ — La Scène respecte strictement le timing de sa région sur la Timeline.** Les clips et actions de la région conservent leur position temporelle et leur durée telles que définies dans la Timeline ; aucun recalage ou départ simultané artificiel n’est introduit. Ce fonctionnement a été confirmé vers ~01:11 ; l’ancienne question sur les offsets internes est résolue.

### Lien dynamique et édition non destructive — précisions ~01:12–01:13

1. **VALIDÉ — Lien dynamique permanent depuis la Timeline :** les cellules des projections **Pistes**, **Scènes** et **Échantillons** sont des représentations reliées aux contenus, régions, positions et découpes de la même Timeline. Elles ne sont pas des copies indépendantes du média, de la Scène ou de ses événements.
2. **VALIDÉ — Mise à jour automatique et bidirectionnelle des représentations :** déplacer un clip ou modifier ses limites/son placement temporel dans la Timeline actualise automatiquement sa représentation en Cellules et son appartenance temporelle aux régions de Scènes. Modifier une cellule passe par la même donnée canonique et se reflète dans la Timeline. Aucun décalage supplémentaire ne doit être introduit par le changement de vue.
**VALIDÉ — Référence unique et réglages propres :** toute cellule, qu’elle soit présentée en mode **Pistes**, **Scènes** ou **Échantillons**, référence dynamiquement le contenu canonique de la Timeline. Elle ne possède aucune copie autonome des médias, régions, splits ou actions ; en revanche, elle conserve **ses paramètres individuels** (mode de lecture, nombres de boucles, Input, binding MIDI, Follow Actions, quantifications début/fin, fondus, pitch/Time Stretch lorsque pertinents). Les paramètres durables doivent être stockés dans le modèle canonique, et non uniquement dans l’état de la vue. Une même règle s’applique aux opérations groupées et aux overrides individuels. **Ce choix d’architecture est explicitement validé.**

3. **EXPRIMÉ — Édition des Scènes :** les régions de Scènes sont modifiables ; leurs cellules reflètent dynamiquement les limites et contenus de la région en vigueur, sans perdre l'identité des sources. Déplacer un clip peut donc changer sa position relative dans une Scène ou les régions qu'il recoupe.
4. **EXPRIMÉ — Règle transversale impérative : toutes les opérations ordinaires d'édition sont non destructives.** Split, trim, crop, déplacement, copie/association, changements de scène/région, fondus, boucles, quantification, pitch, vitesse, Time Stretch, modifications d'actions, Record et traitements par lot ne doivent ni altérer ni écraser irréversiblement le contenu source. Les transformations sont conservées sous forme de paramètres, intervalles, événements et références.
5. **EXPRIMÉ — Réversibilité :** conserver les données originales et la possibilité de modifier ou annuler les transformations ; une suppression/vidage de cellule retire l'usage ou la référence dans la projection, sans être assimilée à l'effacement physique du média source. Les prises initiales, y compris marges hors lecture, restent récupérables. Le mécanisme concret doit réutiliser l'historique/Time Machine canonique et les opérations atomiques déjà prévus par atome/eVe, sans seconde autorité.
6. **OUVERT (cas limite, non à présumer) — Suppression définitive explicite :** sa portée, les permissions et les modalités éventuelles de purge d'assets ne sont pas définies par cette règle d'édition non destructive. Ne pas transformer une commande « vider la cellule » en destruction de l'asset.

### Vidage d’une cellule : effet sur la Timeline — précision ~01:15–01:16

1. **VALIDÉ — Le vidage n’est jamais seulement visuel.** Vider une cellule modifie **la portion exacte de la Timeline qu’elle représente**, et cette modification est répercutée sur toutes les projections concernées. Il ne peut pas rester un contenu jouable « fantôme » dans la Timeline lorsque la cellule liée a été vidée.
2. **VALIDÉ — Même principe pour les trois projections.** Si la cellule représente une portion de sample, c’est **uniquement la portion correspondante** qui devient muette/vidée ; si elle représente un clip de piste ou une région de Scène, c’est son contenu correspondant sur la Timeline qui est affecté. Les portions non ciblées restent intactes.
3. **VALIDÉ PAR LE PRINCIPE GLOBAL — Aucune destruction du média/atome source.** Le changement doit être réversible (historique/undo), sans effacement ni altération physique du fichier original. L’état de la Timeline reste canonique ; la cellule n’entretient pas un état divergent.
4. **VALIDÉ — Pas de Mute pour ce comportement.** L’utilisateur rejette la proposition de créer deux opérations « Mute » et « Vider » : « mute » était seulement une analogie. L’action **Vider** crée **un trou virtuel non destructif** dans la portion concernée de la Timeline, visible dans la représentation du clip/échantillon, **sans suppression ni altération des données sources**. Ce trou n’est pas un simple état de Mute masquant une matière toujours représentée comme présente.
5. **VALIDÉ — Récupération depuis les bordures du sample/clip.** Les données supprimées de la portion visible restent disponibles ; en tirant les **bords de l’échantillon/du segment** en édition, l’utilisateur peut étendre de nouveau la région dans le trou et **récupérer la matière** sans importer ni recréer le média. Le temps déjà occupé par le trou reste localisé, sans décaler automatiquement les autres régions (pas de suppression « ripple » implicite).
6. **VALIDÉ — Synchronisation dynamique de la restauration.** Lorsque la région de la Timeline retrouve de la matière, les cellules liées (notamment les segments de l’échantillon) se remplissent ou réapparaissent automatiquement conformément au contenu restauré. Toute opération reste éditable, réversible et compatible avec le traitement en batch.
7. **VALIDÉ ET CLÔTURÉ (~01:19–01:20) —** « Vider = trou virtuel récupérable par les bords, sans Mute ». L’utilisateur a confirmé que la même règle vaut pour un sample splitté : chaque portion découpée préserve la matière originale récupérable en étendant les limites. Il a autorisé explicitement le passage au point suivant. Ne plus redemander cette validation.


### Mode Échantillons

11. **EXPRIMÉ — La partie inférieure de la Timeline peut afficher la forme d'onde (waveform) de l'échantillon sélectionné.** La projection **Échantillons** de la vue Cellules reflète les régions de cet échantillon et ses découpes (splits).
12. **EXPRIMÉ — Un échantillon non découpé peut correspondre à une seule cellule ;** lorsqu'il est découpé en N segments, **chaque segment devient une cellule** de la projection Échantillons.
13. **EXPRIMÉ — Découpe possible par :** (a) parties égales — notamment 8 ou 16 ; (b) analyse des pics/variations de dynamique ou transitoires ; (c) découpe manuelle. Ne pas confondre ces modes avec une quantification imposée à la lecture.
14. **EXPRIMÉ — Chaque morceau d'échantillon possède ses propres paramètres de cellule**, notamment boucles, attaque, release, déclenchement, quantification et traitements compatibles, tous disponibles en batch.

### Record Action et contenu agnostique

15. **EXPRIMÉ — Les déclenchements des trois projections peuvent être enregistrés en performance :** jouer des segments d'échantillons peut construire une nouvelle piste d'événements ; enregistrer l'enchaînement de pistes ou de Scènes peut construire une séquence/piste dans la Timeline. Le format précis de ces pistes dérivées et leur routage dans la hiérarchie Molecule restent à définir.
16. **EXPRIMÉ — Les pistes et les cellules sont totalement agnostiques quant au contenu :** audio, vidéo, MIDI, texte, objets visuels (cercle, dessin, forme), **n'importe quel atome** déposé, **outils/actions** exécutables ou actions enregistrées. Le contenu peut être rendu/affiché, lu ou exécuté au bon moment selon son type : par exemple texte de prompteur, apparition d'un dessin, déclenchement d'un outil. Ne pas réduire le modèle à un séquenceur audio.
17. **EXPRIMÉ — L'affichage dans la Timeline et la vue Cellules partagent les vraies références Atome** et non des copies autonomes. Il faut réutiliser l'architecture et les outils réels.
18. **OUVERT — Nature et représentation exacte d'une action/outils dans une cellule :** événements, durée, données d'activation, annulation, réexécution, interaction avec Record Action. Ce point est prévu comme question distincte et ne doit pas être présumé résolu par le seul principe d'agnosticisme.

**Rappel d’état :** la Scène comme région temporelle et la conservation exacte de son timing sont **validées**. Le **lien dynamique** et la **non-destruction de toutes les opérations d’édition** viennent d’être ajoutés comme exigences explicites. Le sous-thème complet Scènes n’a pas encore été clôturé expressément par l’utilisateur.

## 2. Modes d'interaction et déclenchements

1. **VALIDÉ — Distinguer le mode Édition et le mode Exécution** pour les cellules.
2. **VALIDÉ — En mode Édition :** le clic sert à sélectionner/éditer/configurer la cellule, sans lancer automatiquement sa lecture.
3. **VALIDÉ — En mode Exécution :** un clic sur une cellule contenant un contenu la déclenche ; une commande MIDI liée à cette cellule peut la déclencher également.
4. **VALIDÉ — Un clic sur une cellule en cours de lecture l'arrête.** Il ne faut **pas** imposer un double-clic ; la clarification ultérieure remplace l'hypothèse précédente.
5. **VALIDÉ — Plusieurs cellules d'une même piste peuvent jouer simultanément**, si elles ont été déclenchées volontairement. Lancer B n'arrête pas A : la superposition est naturelle en live jusqu'à l'arrêt explicite des cellules, sous réserve de leurs modes de lecture respectifs.
6. **EXPRIMÉ — Le déclenchement volontaire ne signifie pas un bouton spécial « lecture cumulée » :** cliquer sur une autre cellule ou envoyer le binding MIDI suffit.

## 3. Modes de lecture par cellule

1. **EXPRIMÉ — Options natives propres à chaque cellule**, accessibles via l'outil de réglage de cellule présent directement sous elle / dans son espace habituel.
2. **EXPRIMÉ — One-shot :** jouer une fois.
3. **EXPRIMÉ — Loop :** répéter en boucle.
4. **EXPRIMÉ — Momentary / maintien :** jouer tant que la commande est maintenue, s'arrêter au relâchement.
5. **VALIDÉ — Deux axes de comportement indépendants :** (a) contenu en **One-shot** ou **Loop** ; (b) déclenchement en **Latch** (appui pour lancer, nouvel appui pour arrêter) ou **Momentary / maintien** (actif durant l’appui, arrêt au relâchement). Cette séparation a été explicitement approuvée vers 00:36:40. Le nombre de lectures prévu par la cellule est une **limite supérieure** même en mode Maintien ; voir règle 12. La correspondance technique avec MIDI Note On/Note Off est à implémenter et tester.
6. **VALIDÉ — Réglage individuel de quantification de lancement/lecture** de la cellule, y compris possibilité de jouer sans quantification. Aucune quantification globale ne doit s'imposer à toutes les cellules.
7. **EXPRIMÉ — Time Stretch audio par cellule**, à préciser ultérieurement (méthode, interaction avec BPM, préservation de hauteur, etc.).
8. **VALIDÉ — Nombre de lectures/boucles :** la cellule accepte une lecture unique, un nombre fini de passages (ex. **2 passages au total**) ou un nombre infini. **Même si l'utilisateur continue à maintenir la commande, deux passages configurés signifient deux passages, jamais trois.** La terminologie exacte du champ dans l'interface (nombre de passages ou de répétitions supplémentaires) est à rendre sans ambiguïté.
9. **VALIDÉ — Attaque et release/fondus :** chaque cellule possède des durées **numériques précises**, indépendantes, pour le fondu d'attaque et celui de fin/relâchement. Les unités sont au choix **temps absolu (millisecondes, y compris micro-fade d'environ 1 ms)** ou **temps musical (temps, mesures/barres et subdivisions)**. **Aucun preset vague** de type « court / moyen / long ». La forme des courbes (linéaire, exponentielle…) reste à spécifier si nécessaire.
10. **VALIDÉ sur le principe — Pitch, vitesse, Time Stretch :** chaque cellule expose les traitements pertinents : (1) hauteur/pitch sans changement de durée, (2) vitesse/durée sans changement de pitch par Time Stretch, (3) vitesse et hauteur **couplées** comme sur une bande. Ces paramètres sont réglables précisément et applicables en batch. Les algorithmes de Time Stretch, les plages et les interactions avec le BPM et la vidéo restent à détailler techniquement.
11. **VALIDÉ — Tous ces réglages de cellule sont aussi utilisables en batch** sur une sélection multiple : répétitions, attaque, release, pitch, vitesse, Time Stretch et modes de lecture. La règle générale « tout réglage applicable à une sélection doit accepter l’édition batch » est formulée en section 7.
12. **VALIDÉ — Priorité du type de lecture et des limites en mode Maintien :** One-shot s'exécute **une fois seulement**, même si la commande reste maintenue. Une cellule avec **2 lectures** n'en fait **que 2**, même si l'utilisateur maintient plus longtemps. Une boucle **infinie** se poursuit tant que l'appui est maintenu ; le relâchement demande son arrêt et **applique le fade de release configuré lorsque pertinent**. Un relâchement ne doit pas provoquer de répétition supplémentaire ; il n'impose pas non plus un fondu si la lecture est déjà terminée. Ce cas et sa clôture ont été explicitement validés vers 00:43–00:44.
13. **VALIDÉ — Parité vidéo/audio des réglages de cellule :** les cellules vidéo disposent des mêmes catégories de réglages que les cellules audio : quantifications, boucles, type de déclenchement, fondus, vitesse/Time Stretch et, pour leur **composante sonore**, pitch lorsqu'il est pertinent. Le traitement des images vidéo lors du ralentissement/accélération et la synchronisation A/V sont à spécifier techniquement ; ne pas attribuer de hauteur musicale à une piste visuelle muette.
14. **VALIDÉ — Pas de réglages approximatifs de fondu :** les valeurs de fade doivent être exactes, y compris à très petite durée, et exprimées en millisecondes ou en unités musicales. Ce sous-thème a été validé expressément vers 00:42:23.

## 4. Enregistrement directement dans une cellule

1. **VALIDÉ — Un clic sur une cellule vide déclenche un enregistrement** lorsque l'utilisateur est en contexte d'Exécution/lecture ou Record. L'intention est de pouvoir créer une prise directement dans une cellule vide, sans procédure lourde.
2. **VALIDÉ — Premier clic :** lancement de capture immédiate à partir de la source choisie.
3. **VALIDÉ — Clic suivant :** demande d'arrêt de l'enregistrement ; la prise est conservée dans la cellule et peut ensuite être jouée.
4. **VALIDÉ — La cellule et la Timeline partagent le contenu :** la prise existe comme contenu référencé, pas comme copie divergente.
5. **VALIDÉ — L'arrêt effectif de la prise peut être retardé jusqu'à une frontière musicale quantifiée** afin d'obtenir une boucle propre, au lieu de couper exactement à l'instant du clic.
6. **EXPRIMÉ — Le même outil Input doit pouvoir choisir une source pour un enregistrement sur la Timeline ou dans une cellule.**

## 5. Quantification et conservation de la marge initiale

1. **VALIDÉ — Deux paramètres de quantification distincts pour chaque cellule :** début et fin. Pas une valeur unique imposée aux deux.
2. **VALIDÉ — Capture physique immédiate à l'appui**, même si l'appui précède le prochain temps/la prochaine mesure quantifiée.
3. **VALIDÉ — Début de lecture/portion utilisée au point quantifié :** la partie enregistrée avant cette frontière est **conservée dans la prise**, mais n'est **pas rejouée par défaut**.
4. **VALIDÉ — Marge d'anticipation récupérable en édition**, sans destruction du contenu source.
5. **VALIDÉ — Demande d'arrêt puis fin de capture à la frontière de quantification de fin choisie.** Objectif : une boucle musicalement propre.
6. **VALIDÉ — Début et fin configurables indépendamment** avec des valeurs telles que aucune quantification, mesure, temps, subdivision.
7. **VALIDÉ — Quantification de lecture réglable par cellule** (activée/désactivée ou valeur), sans règle globale prioritaire imposée.
8. **OUVERT — Préciser la distinction exacte entre « quantification de début » et « quantification de déclenchement de lecture »** si l'interface propose les deux ; ils peuvent éventuellement partager une définition, mais cela n'a pas été tranché.
9. **OUVERT — Détails du comportement lorsque la cellule a un mode Loop/One-shot/Momentary avec quantification de fin**, en particulier l'arrêt d'une cellule en lecture versus l'arrêt de sa capture.

**Exemple VALIDÉ :** bouton pressé juste avant une barre, début réel de capture immédiatement ; portion préalable conservée, début utile à la barre ; demande d'arrêt ensuite, capture prolongée jusqu'au repère de fin quantifié.

## 6. Record, Record Action et source Input

1. **EXPRIMÉ — Distinguer Record de Record Action :**
   - **Record :** capturer du contenu média (audio/vidéo, et éventuellement des actions comme type de contenu) dans une cellule ou sur la Timeline.
   - **Record Action :** enregistrer les gestes de performance de l'utilisateur sur les cellules pour constituer une piste d'événements éditable dans la Timeline. Cette piste pourra réactiver des cellules comme des instruments.
2. **VALIDÉ — Record Action enregistre uniquement les actions explicites de l'utilisateur.** Les déclenchements produits automatiquement par des **Follow Actions** ne doivent **pas** être enregistrés comme des actions manuelles.
3. **EXPRIMÉ — Une cellule peut elle-même contenir des actions enregistrées**, distinctement de la piste de performance créée par Record Action.
4. **EXPRIMÉ — Outil existant ou à raccorder « Input » :** permet de choisir le type de source **audio / vidéo / action** et, pour les entrées physiques, le dispositif précis : micro, interface audio, entrée, caméra, parmi plusieurs équipements branchés.
5. **EXPRIMÉ — Le choix de la source s'applique aux enregistrements Timeline comme aux cellules.**
6. **EXPRIMÉ — Réutiliser les outils/runtimes existants**, notamment les contrôles natifs de cellule et la capture de performance déjà présente, sans créer de seconde autorité ni de panneau de réglages parallèle.
7. **OUVERT — Articulation précise de la lecture des Follow Actions pendant la relecture d'une performance Record Action.** Les déclenchements automatiques ne sont pas enregistrés ; il reste à définir la conséquence de modifications ultérieures des Follow Actions, sans attribuer à l'utilisateur un choix qu'il n'a pas fait.
8. **OUVERT — Différence fonctionnelle détaillée entre une « cellule de type actions » et « Record Action » et comment ces deux enregistrements sont exposés par Input.**
9. **OUVERT — Préférence visuelle exacte entre les contrôles Record, Record Action et Input et statut des modes d'édition/exécution de la cellule**, en réutilisant les outils réels.

## 7. MIDI, sélection multiple et édition en batch

1. **VALIDÉ — Plusieurs cellules peuvent recevoir le même binding MIDI.** Un seul événement MIDI adresse toutes les cellules concernées : chacune traite son déclenchement sans dépendre de l'état des autres.
2. **VALIDÉ — Chaque cellule respecte sa propre quantification lors d'un événement MIDI partagé.** Elles peuvent commencer à des instants différents si leurs quantifications diffèrent. Pour synchroniser leurs départs, l'utilisateur peut leur appliquer **la même quantification en batch**.
3. **EXPRIMÉ — La sélection multiple doit être possible par lasso et par sélection point par point**, y compris pour traiter plusieurs cellules à la fois.
4. **EXPRIMÉ — Une fois les cellules sélectionnées, les outils pertinents de la barre latérale doivent proposer les options adaptées aux cellules sélectionnées.** Utiliser les outils et composants natifs de sélection et de réglage d'atome/eVe, sans créer de panneau d'options parallèle.
5. **EXPRIMÉ — Les traitements et réglages applicables à plusieurs cellules doivent pouvoir s'exécuter en batch**, avec notamment :
   - assigner un **même binding MIDI** à plusieurs cellules ;
   - attribuer une **même quantification** ;
   - attribuer un **même mode de lecture** (one-shot, boucle, maintien/latch selon les modes définis) ;
   - **vider le contenu** de plusieurs cellules ;
   - **enregistrer plusieurs cellules** dans le cadre d'une opération groupée ;
   - appliquer des **traitements et réglages de cellule** aux cellules sélectionnées, lorsqu'ils sont compatibles avec leurs contenus et leurs sources, y compris nombre de répétitions, attaques/releases, pitch, vitesse et Time Stretch audio.
6. **VALIDÉ — Une sélection multiple n'oblige pas les cellules à partager les mêmes réglages.** Elles conservent leurs valeurs individuelles tant que l'utilisateur n'applique pas explicitement un réglage commun en batch. Ceci s'applique en particulier à la quantification d'un lancement MIDI partagé.
7. **PROPOSÉ — Une opération en batch doit être atomique dans l'historique, annulable en une seule fois.** Cohérent avec l'architecture canonique d'atome/eVe, mais la modalité précise n'a pas encore fait l'objet d'une validation explicite.
8. **EXPRIMÉ — Enregistrement simultané en batch :** l'utilisateur peut sélectionner plusieurs cellules et déclencher leur enregistrement groupé ; chacune possède son **propre réglage Input**, qui peut être configuré indépendamment (entrée audio, caméra, actions selon les capacités de Record).
9. **EXPRIMÉ — Input commun puis override individuel :** une sélection multiple permet d'appliquer en une opération le même réglage Input / comportement à plusieurs cellules, puis de reprendre individuellement une cellule pour surcharger sa source et ses paramètres. Le batch n'efface pas la possibilité de personnalisation par cellule.
10. **EXPRIMÉ — Sources identiques autorisées :** si plusieurs cellules sélectionnées pointent vers le même Input, on **ne bloque pas** l'enregistrement simultané au motif que cela duplique la prise. L'utilisateur conserve ce choix, même si enregistrer plusieurs fois la même source peut être redondant. « Source différente par cellule » signifie un **choix indépendant**, pas une contrainte d'unicité.
11. **VALIDÉ — Un Record en batch ne modifie aucun paramètre implicite :** chaque cellule garde sa source Input, ses quantifications propres de début et de fin, son mode de lecture et ses autres réglages tant qu’aucune modification groupée explicite ne leur a été appliquée. Une commande d’arrêt groupée peut donc donner lieu à des fins effectives différentes selon les quantifications de fin individuelles.
12. **VALIDÉ — Modification groupée ciblée puis override individuel :** seuls les paramètres expressément modifiés via la sélection multiple prennent une valeur commune sur les cellules sélectionnées. Les réglages non concernés restent inchangés. L’utilisateur peut ensuite reprendre n’importe quelle cellule séparément et modifier à nouveau ses paramètres.
13. **REPORTÉ — Erreurs et finalisation des prises groupées :** conduite à tenir si une entrée est indisponible ou si une capture échoue pendant que d’autres réussissent ; aucune politique de rollback ou d’arrêt collectif n’a été choisie. L’utilisateur a explicitement demandé de passer à la suite sans s’attarder sur ce cas.
14. **OUVERT — Détails ergonomiques de la sélection :** gestes tactiles et souris du lasso, sélection non contiguë, ajout/retrait point par point, options à valeurs mixtes et traitement des actions incompatibles avec une sélection hétérogène. Ce sont des détails à définir en conservant les outils existants.
15. **VALIDÉ — Le thème sélection multiple, binding MIDI partagé et traitements en batch** a été explicitement déclaré suffisant par l’utilisateur vers 00:30:06. Le sous-thème « Record simultané en batch et Input par cellule » a ensuite été **explicitement clôturé** par l’utilisateur vers 00:35:01, sans demander de traiter les cas d’échec de source.
16. **VALIDÉ — RÈGLE TRANSVERSALE ET PERMANENTE POUR ATOME/eVe : tous les réglages d’un outil doivent pouvoir s’appliquer en batch lorsque plusieurs cibles compatibles sont sélectionnées.** Ne pas traiter le batch comme une fonction réservée au MIDI ou à l’audio ; cette exigence vaut également pour les futurs outils et réglages, avec les outils réels de la barre latérale et le système de sélection natif. L’action groupée doit toucher **seulement les paramètres explicitement modifiés** : aucune uniformisation implicite et aucune perte des overrides individuels. Cette règle vise les paramètres effectivement applicables aux types de cibles sélectionnés ; ne pas forcer un réglage sans sens pour un type de contenu. Les détails d’affichage des valeurs différentes et les erreurs de compatibilité restent à préciser.

## 8. Audit des décisions restantes (état initial avant précisions UI du 14/10/2026)

**Dernière confirmation :** le principe de référence dynamique unique pour chaque cellule (Pistes / Scènes / Échantillons), avec réglages par cellule conservés dans le modèle canonique, est **VALIDÉ**. Il reste des modalités fonctionnelles déjà répertoriées ci-dessous (notamment catalogue précis des Follow Actions et Record Action), mais la question de principe sur la référence n’est plus ouverte. Les cas-limites techniques sont reportables.

### Décisions produit à clarifier avant de prétendre que le cahier des charges est complet

1. **Scènes et déclenchement d’une région :** **la Scène est une région temporelle de la Timeline et son déclenchement respecte exactement les positions des contenus de cette région (VALIDÉ)** ; sa représentation dans Cellules suit dynamiquement les éditions. Restent seulement d’éventuels cas précis d’interaction entre plusieurs Scènes qui se chevauchent et des contenus déjà actifs ; ne pas importer l’exclusivité Ableton.
2. **Follow Actions (enchaînement par défaut validé) :** types d'enchaînement (suivante, précédente, aléatoire, stop, probabilités, saut vers cible…), conditions (fin du contenu, nombre de tours, délai…), portée, et priorité en cas de commandes contradictoires. Les Follow Actions **ne sont pas capturées** comme gestes explicites par Record Action (validé).
3. **Record Action à la relecture :** si l'on rejoue un déclenchement humain de A enregistré dans la Timeline, les Follow Actions de A doivent-elles s'exécuter en direct selon leurs réglages actuels ? Si oui, la performance peut changer après modification des Follow Actions ; sinon prévoir une forme de gel. **Aucun choix utilisateur encore donné.**
4. **Cellule contenant des actions :** ce que signifie « Record des actions dans une cellule », comment elle s'exécute et comment cette séquence se distingue de la piste Record Action pilotant les cellules depuis la Timeline. Définir le repérage des cibles et le rendu temporel sans seconde source de vérité.
5. **Synchronisation/vue divisée :** le **lien dynamique et la mise à jour automatique lors des éditions Timeline ↔ Cellules sont désormais explicitement posés**, ainsi que la non-destruction. Il reste à préciser seulement la projection d’occurrences multiples d’une même cellule et certains cas limites ; les deux vues simultanées et les deux stratégies de lecture exclusives sont déjà validées.
6. **Transitions et fins de contenu :** priorité entre un arrêt manuel, une requête de fin quantifiée, les Follow Actions, une fin de boucle et les fade/release, notamment lors du passage Timeline ↔ Cellules. Le principe d'un seul mode de lecture actif est validé.
7. **Organisation des cellules :** les trois projections Pistes/Scènes/Échantillons, les cellules carrées, la bande des Scènes et la bande de boucle indépendante sont **EXPRIMÉES**, et l’équivalence Scène/région est **VALIDÉE**. **Le principe architectural des cellules comme références dynamiques uniques avec réglages individuels persistants est VALIDÉ.** Restent à définir la création/duplication/suppression, l’ordre et la sérialisation exacte des références et réglages dans le schéma v2 ; l’implémentation technique précise de ce schéma n’a pas été validée.

### Détails techniques et cas limites, pouvant être reportés sans bloquer la conception globale

- choix d'algorithmes de pitch/Time Stretch, qualité, latence, synchronisation vidéo, modes de courbe de fade ;
- définition exacte du paramètre affiché « 2 boucles » = 2 lectures totales (l'exemple oral confirme 2 passages) et de la notation choisie ;
- commandes MIDI de type Note On / Note Off, boutons momentanés, contrôleurs continus et cas de perte de Note Off ;
- prévisualisation/édition des marges préenregistrées, hors lecture normale ;
- choix des entrées lorsque caméra/micro disparaît pendant une prise, erreurs partielles de Record batch : **explicitement reportés** par l'utilisateur ;
- UI du lasso et des réglages de sélection mixte ; le besoin fonctionnel de batch et la réutilisation de la barre latérale sont déjà validés ;
- nécessité éventuelle d'une quantification de départ distincte pour Record et Play au-delà des valeurs début/fin par cellule déjà validées.

**Règle de travail :** traiter une seule décision à la fois ; poser la question, attendre la réponse, puis demander explicitement si le point est clos avant de passer au suivant.

## 9. Divergences avec les documents existants

### Spécification v2 : `NewMolecules.md`
Source : https://github.com/atomecorp/a/blob/main/todo/molecule/NewMolecules.md

- La spécification active dit explicitement qu'aucun objet `Cell` n'existe : **contraire au besoin confirmé de conserver les cellules et leur représentation**. Le modèle de données exact devra être adapté sans créer deux sources de vérité.
- Elle ne définit pas la vue divisée Cellules + Timeline avec les deux stratégies exclusives de lecture.
- Elle prévoit un réglage de quantification global : **ne pas imposer ce réglage aux cellules**, dont la quantification individuelle a été validée.
- Elle prévoit la Timeline comme activité de phase 2 : à réconcilier avec les deux vues du produit souhaité.
- Elle contient des capacités Record et des régions armées à réconcilier avec le nouveau comportement de capture immédiate dans les cellules vides.

### Cahier des charges fondateur
Source : https://github.com/atomecorp/a/blob/main/done/molecule_architecture_and_rebuild_plan.md

- Prévoit explicitement Cells, Scenes, Clip Launcher, One-shot, Loop, Follow Actions et Launch Quantization ; la présente séance précise leur fonctionnement attendu et le partage des données avec la Timeline.

### Documents et mécanismes concernant Record Action
Sources :
- https://github.com/atomecorp/a/blob/main/todo/0_record_actions.md
- https://github.com/atomecorp/a/blob/main/todo/modifications.md
- https://github.com/atomecorp/eVe/blob/main/domains/rendering/project_view_interaction_recorder.js

- Un enregistrement des gestes et de leur timing existe comme concept et comme logique d'exécution. Les règles de capture d'actions de cellules et d'exclusion des Follow Actions automatiques nécessitent d'être reconciliées avec ce mécanisme.

## 10. Journal chronologique des validations (horodatages relatifs à l'appel)

- ~00:03–00:04 : cellules indispensables, deux vues pouvant coexister, deux logiques de lecture.
- ~00:05 : la lecture Timeline et la lecture Cellules ne tournent pas en parallèle.
- ~00:06–00:09 : cumul de cellules d'une même piste, modes Édition/Exécution, clic ou binding MIDI ; clic simple pour arrêter.
- ~00:09–00:13 : Record média versus Record Action de performance, cellule vide enregistrable ; options de lecture de cellule ; Input.
- ~00:14–00:18 : démarrage immédiat de la capture, frontière quantifiée de lecture, marge initiale conservée et éditable, arrêt à frontière quantifiée.
- ~00:19 : deux quantifications distinctes début / fin par cellule, point explicitement clôturé.
- ~00:20 : Record Action ne consigne que les actions humaines explicites, pas les Follow Actions ; quantification individuelle sans global imposé ; Time Stretch audio à préciser.
- ~00:21–00:22 : binding MIDI partageable entre plusieurs cellules ; lasso et sélection multiple ; réglages et bindings appliqués en batch.
- ~00:23 : demande de tenir un fichier exhaustif et de continuer à le mettre à jour.
- ~00:27–00:28 : confirmation que chaque cellule déclenchée par un MIDI binding commun respecte sa quantification individuelle ; harmonisation possible en batch. Ajouts explicites : même mode de lecture, vidage multiple, Record multiple, tout traitement compatible sur sélection, lasso / sélection point par point et outils adaptés dans la barre latérale.
- ~00:30 : utilisateur valide la clôture du point « sélection et traitements en batch ». Nouveau sous-point : Record simultané ; chaque cellule garde son Input propre ; batch de paramètres possibles puis override individuel ; plusieurs cellules peuvent enregistrer une même source, sans blocage artificiel.
- ~00:33 : précision confirmée : pendant un Record en batch, chaque cellule conserve ses paramètres de début et de fin ainsi que ses autres réglages ; seules les propriétés explicitement modifiées sur la sélection sont uniformisées. Les fins d’enregistrement peuvent donc survenir à des repères différents.
- ~00:35 : l’utilisateur confirme que le sous-thème Record en batch est suffisamment défini et demande expressément de passer au point suivant. Les cas d’échec d’une source sont reportés sans décision.
- ~00:36–00:37 : l’utilisateur valide deux réglages de mode de lecture distincts : One-shot / Loop et Latch / Maintien ; demande de repérer les modes potentiellement manquants.
- ~00:37 : l’utilisateur ajoute un nombre de répétitions paramétrable (ex. 1, 3, infini) et un fondu d’attaque/release avec durées propres à chaque cellule.
- ~00:37–00:39 : l’utilisateur demande des contrôles pitch, vitesse de lecture couplée ou non à la hauteur, Time Stretch sans variation de pitch ; **tous ces paramètres doivent fonctionner en batch**.
- ~00:39 : l’utilisateur élève ce principe en **règle transversale permanente** : à l’avenir, chaque réglage applicable à une sélection multiple doit pouvoir être effectué en batch, sans détruire les réglages non modifiés.
- ~00:41 : l’utilisateur valide expressément cette règle de batch comme règle permanente d’atome/eVe.
- ~00:41–00:42 : les fade-in/fade-out doivent être numériquement précis, soit en millisecondes (avec micro-fade autour d’1 ms), soit en unités musicales (temps, mesures) ; pas de catégories court/moyen/long. **Validé**.
- ~00:42:45–00:43 : l’utilisateur confirme les **mêmes types d’options pour la vidéo et l’audio** ; passage au point suivant validé.
- ~00:43–00:44 : en mode Maintien, une boucle infinie joue jusqu’au relâchement et prend en compte le fade de fin réglé ; une cellule One-shot ne joue qu’une fois ; une cellule limitée à 2 tours s’arrête au plus tard après ces 2 tours même si l’appui continue. Point explicitement déclaré compris et terminé.
- ~00:47 : l’utilisateur demande s’il reste des zones d’ombre : audit thématique effectué, sans rouvrir les sujets déjà validés.

- ~01:01–01:05 : l'utilisateur écarte les conventions d'Ableton/Zenbeats comme autorité ; décrit la correspondance Timeline ↔ cellules carrées, la ligne des Scènes à hauteur de piste, la bande de boucles séparée dessous ; précise **trois projections** : Pistes, Scènes, Échantillons ; Scènes avec enchaînement linéaire ou Follow Actions, lasso et batch ; waveforms affichées sous la Timeline et découpe d'échantillons égale (8/16), par dynamique/transitoires ou manuelle ; chaque segment partage les réglages de cellule.
- ~01:05–01:06 : toute cellule/scène/portion d'échantillon peut utiliser les réglages de cellule ; enregistrement de déclenchements des trois projections vers une piste de séquencement ; pistes et cellules **agnostiques** du type de contenu : audio, vidéo, MIDI, texte, dessin/forme, atome quelconque, outil et **actions**.
- ~01:07–01:08 : l’utilisateur confirme explicitement qu’une **Scène est une région temporelle de la Timeline qui lance les contenus/cellules qu’elle couvre**. Nouvelle demande : ne pas rouvrir les questions évidentes déjà définies.
- ~01:11 : la lecture d’une Scène conserve le timing exact de la région et de ses clips/actions ; aucun offset additionnel et aucun départ simultané artificiel.
- ~01:12–01:13 : **lien dynamique permanent depuis la Timeline** : décaler/modifier un clip actualise les cellules et scènes correspondantes ; **toutes les opérations d’édition sont non destructives**, sources conservées et transformations réversibles.
- ~01:15–01:16 : le **vidage d’une cellule affecte réellement la portion liée de la Timeline**, y compris dans un sample découpé ; la source demeure intacte.
- ~01:17–01:18 : l’utilisateur **rejette la notion de Mute pour « Vider »** ; vider crée un **trou virtuel temporel** sur la Timeline, sans suppression physique. Les bords du sample/clip permettent de **ré-étendre la matière source dans le trou**, entraînant la restauration dynamique de la cellule correspondante.
- ~01:19–01:20 : **confirmation et clôture explicites** : même fonctionnement pour un sample découpé en plusieurs cellules ; tout morceau reste récupérable en réétendant sa matière d’origine. L’utilisateur autorise la suite.
- ~01:21 : **enchaînement automatique des Scènes** : à la fin d’une Scène, jouer la suivante si elle existe, sinon s’arrêter ; une Follow Action explicite prévaut ; répétitions paramétrables. L’utilisateur demande une progression rapide, point par point, sans détails non essentiels.

- ~01:23 et confirmation ultérieure : **décision définitive** sur l’architecture des cellules : chaque cellule de Piste, Scène ou Échantillon est une **référence dynamique** aux données de la Timeline ; elle ne duplique pas les contenus ; ses propres options de lecture, d’Input, de MIDI, de Follow Actions et de traitement restent configurables et persistantes dans le modèle canonique. Dernière question conceptuelle déclarée validée.


## 11. Complément validé pour la maquette — UI Timeline, contrôles, gestes et référence visuelle

**Provenance :** réponses directes de l'utilisateur après la version v1.4, puis corrections explicites du premier visuel de Timeline. **Toutes les règles ci-dessous sont exprimées par l'utilisateur** ; elles remplacent les questions correspondantes du premier audit visuel. **Ne pas confondre la validation du cahier fonctionnel pour une maquette avec la validation de tous les cas limites d'implémentation.**

### 11.1 Règles de design transversales : NON-RÉINVENTION

1. **VALIDÉ — Utiliser impérativement les composants, outils, icônes, comportements, tailles et styles déjà existants d'atome/eVe.** Ne pas réinventer un composant pour la Timeline, les Scènes, les Cellules, la sélection ou les réglages si son équivalent fonctionnel existe déjà. Les références réelles sont le code, les captures et les composants du projet ; le visuel généré n'est qu'une proposition de contrôle.
2. **VALIDÉ — Réutiliser l'outil Matrice existant pour présenter les Cellules**, avec des tuiles carrées de la **taille standard définie dans atome**. N'introduire ni nouvelle taille arbitraire ni nouveau design de cellule. Tester ultérieurement si cette taille est trop importante sur mobile sans changer le standard lors de cette étape.
3. **VALIDÉ — Réutiliser typographie, teintes/contraste, épaisseurs, arrondis, pictogrammes, tailles, matériaux et unités de design déjà définis dans atome.** Pas de nouvelle charte graphique, pas de fioritures, pas de décor superflu.
4. **VALIDÉ — Conserver le système de sélection existant** : l'élément sélectionné est entouré comme ailleurs dans atome. Aucun nouvel indicateur séparé d'état « sélection », « lecture », « record », « actif », « vide » ou « erreur » n'est demandé dans la maquette ; exploiter le comportement natif réel lorsqu'il existe. L'utilisateur a refusé de redéfinir une signalétique d'état qui existe déjà.
5. **VALIDÉ — Ne pas dessiner les outils sous la Timeline dans le premier visuel.** Les outils réels réapparaîtront dans leur bandeau contextuel habituel lors de l'intégration, pas sous forme de contrôles inventés dans l'image.

### 11.2 En-têtes de pistes (mobile)

1. **VALIDÉ — Par défaut, un en-tête compact carré et coloré**, dans les dimensions standards d’atome, avec uniquement le **début du nom tronqué** (environ cinq caractères puis points de suspension selon l’espace réel). **Aucun pictogramme** : la couleur de piste remplace les icônes dans cet en-tête. C’est la présentation approuvée de la maquette « en-têtes repliés ».
2. **VALIDÉ — Clic sur un en-tête : ouverture collective de tous les en-têtes de pistes**, en élargissant **toute leur colonne** vers la droite et en **repoussant la zone de Timeline**. Les noms deviennent plus complets. Ne pas superposer un panneau flottant et ne pas cacher la Timeline derrière une pop-up.
3. **VALIDÉ — En-têtes ouverts : uniquement le nom complet (selon largeur) puis les deux grandes zones Mute et Solo, sur UNE SEULE LIGNE et sur TOUTES les pistes.** Les touches **M** et **S** sont nettement agrandies (presque deux fois la taille de la première variante), espacées, facilement manipulables au doigt, occupant presque la hauteur de la ligne avec une petite marge. Il est permis d’élargir la colonne d’en-tête et de réduire légèrement la taille du texte pour y parvenir. Mute coupe la piste ; Solo isole la piste pour la lecture. **Ne jamais empiler ou dupliquer** les touches. Le contrôle « Arm » évoqué précédemment était **inventé et explicitement rejeté** : aucun Arm de piste sans nouvelle décision produit.
4. **VALIDÉ — Clic sur la partie de base d’un en-tête ouvert : repli de la colonne entière**, tous les en-têtes retrouvant leurs carrés colorés compacts et leurs noms tronqués.
5. **VALIDÉ — Mute et Solo sur plusieurs pistes :** activation/désactivation possible **unitairement**, **par sélection de toute la colonne** concernée, ou **en faisant glisser** sur plusieurs positions de la colonne Mute ou Solo (geste de balayage continu à travers les pistes). Le sens exact du geste suit les comportements existants, sans ajout de contrôle parallèle.
6. **DISTINCTION IMPORTANTE — Mute/Solo existent au niveau d'une piste** et ne doivent pas être confondus avec l'action « Vider » une cellule, laquelle crée un trou virtuel **sans** simplement muter la matière (section 1 bis).

### 11.3 Régions, Scènes et ruler / bande de boucle

1. **VALIDÉ — Les Scènes restent des régions temporelles** de la même Timeline, avec marqueurs et segments que l'utilisateur peut voir et manipuler ; leur forme doit **réutiliser la forme visuelle des cellules/clips existants**, sous forme de régions allongées correspondant à la durée : pas de nouvelle famille d'objets graphiques.
2. **VALIDÉ — Les régions/Scènes sont dans la PARTIE SUPÉRIEURE du dispositif de ruler placé tout en bas**, jamais dans une piste « Region » tout en haut. Chaque région (« Couplet », « Refrain »…) est un rectangle de même langage que les clips, avec nom et bornes début/fin ; **elle remplit toute la hauteur disponible de sa sous-bande**, sans petits points/drapeaux verts dépassant au-dessus. Le dispositif inférieur reprend la géométrie/épaisseur standardisée des pistes, avec ses deux zones (régions au-dessus, graduations/sélection en dessous).
3. **VALIDÉ — Le ruler est TOUT EN BAS**, sous le détail média contextuel lorsqu’il apparaît. Il est organisé en **deux parties superposées** : **haut = régions/Scènes nommées**, **bas = graduations musicales (1, 2, 3, 4…) et sélection/boucle**. Dans la partie basse, les **numéros sont au-dessus du ruban vert** ; le ruban est situé plus bas, afin de laisser une zone inférieure utilisable pour le balayage/scroll. Aucun ruler numéroté ne doit apparaître en haut de la Timeline.
4. **VALIDÉ — La plage de boucle est un ruban vert fin et continu**, superposé à la zone de mesure/ruler et montrant clairement l'intervalle choisi. Cette sélection temporelle sert également de repère de quantification lorsque l'outil canonique adéquat est actif.
5. **VALIDÉ — Manipulation tactile du ruban/ruler :** appui maintenu puis glissé **dessine la sélection temporelle** ; on saisit les **bords** pour la redimensionner ; **clic dans une plage active la désactive** ; nouveau geste en dehors pour définir une autre plage. Un balayage rapide sur cette zone sert à **naviguer horizontalement** dans la Timeline plutôt qu'à dessiner une sélection.
6. **VALIDÉ — La boucle est une fonction de cette bande temporelle**, **pas une piste de contenu « Loop »** parmi les pistes audio/vidéo/MIDI. La rangée « Loop » représentée dans le premier visuel était erronée et doit être supprimée.
7. **CORRECTION VISUELLE CONFIRMÉE —** Le brouillon avec une piste « Region » en haut est **rejeté**. Les régions sont **intégrées en bas dans le ruler**, dans sa moitié supérieure. La dernière maquette sans piste « Region » en haut, avec les régions « Couplet » et « Refrain » dans le ruler inférieur, est **approuvée**. Toute éventuelle rangée de contenu « Scn… » affichée parmi les pistes ne doit pas créer une seconde autorité sur ces régions.

### 11.4 Clips, trous virtuels, matière et échantillons découpés

1. **VALIDÉ — Un segment de clip audio, vidéo ou autre média est représenté par sa matière utile.** Lorsqu'une portion de cellule est « vidée », il reste **un trou graphique réel** (zone sans matière dans la piste), jamais seulement une couleur de Mute. Les clips voisins ne bougent pas automatiquement.
2. **VALIDÉ — Les bords d'entrée/sortie exposent des poignées ou petits bouchons natifs** permettant l'extension / réduction non destructives. Tirer le bord vers un espace vide **récupère la matière cachée**. Si l'extension dépasse l'extrémité de la source en mode de lecture normal, la matière peut **se répéter / reboucler** aux bornes de la source (dans les deux sens), selon les réglages temporels pertinents. **Ne pas confondre** cette extension avec le Time Stretch, qui modifie la durée autrement.
3. **VALIDÉ — Clic dans le corps d'un clip : sélection/déplacement selon l'outil actif ;** glisser pour le déplacer temporellement. La quantification n'agit sur ce glisser que si l'outil Quantize est actif ; sinon le déplacement est libre.
4. **VALIDÉ — Splits affichés par de petites barres verticales**, avec **un petit pied/poignée en bas**. Les points de split sont déplaçables directement. Une tranche entre deux barres est sélectionnable par clic pour appliquer les outils existants au segment (niveau/volume, opérations temporelles et autres traitements compatibles).
5. **VALIDÉ — Les splits d'échantillon peuvent déjà être créés** en parts égales (8/16…), par dynamique/transitoires ou manuellement comme spécifié en section 1 bis. Leur représentation garde les barres verticales et la sélection native ; en mode Échantillons, chaque tranche apparaît comme une cellule reliée à la même source.
6. **VALIDÉ — Les manipulations ordinaires de clip et de découpe restent non destructives**, y compris le vidage et la reconstitution ; ne pas dupliquer ou éditer physiquement le média source pour gérer les trous.

### 11.5 Quantification, indicateurs et entrées

1. **VALIDÉ — Aucun voyant graphique supplémentaire de quantification Début/Fin n'est exigé dans les cellules.** La quantification est pilotée par **l'outil de quantification existant**. Si actif, les gestes temporels se calent sur ses repères ; sinon ils restent libres. **Le snap de l'édition est une commande contextuelle transverse**, distincte des quantifications temporelles individuelles de lecture et Record déjà précisées aux sections 3 et 5 : ne pas écraser ces réglages par un unique état global.
2. **VALIDÉ — Aucun indicateur particulier à ajouter pour les modes One-shot, Loop, Maintien ou Latch dans la première maquette.** Leurs options natives restent disponibles dans les outils, sans pictogrammes redondants imposés sur chaque cellule.
3. **VALIDÉ — Aucun pictogramme/état additionnel de type Input/MIDI/Audio/Vidéo/Action ne doit être inventé dans la première maquette.** L'outil Input présente une **liste des entrées disponibles filtrées par type** : sur une source vidéo, les caméras/entrées vidéo ; sur l'audio, les entrées micros/interfaces audio. Une source unique = une option, plusieurs sources = plusieurs options. La sélection du périphérique reste individuelle ou batch selon la règle transversale.
4. **VALIDÉ — Ne pas introduire de « priorité graphique » inventée entre des états hypothétiques multiples d'une même cellule.** Cette question du premier audit a été explicitement jugée sans pertinence en l'absence de cas concret. Exploiter seulement les états authentiquement disponibles dans les composants du projet.

### 11.6 Navigation, zoom et sélection multiple

1. **VALIDÉ — Pinch tactile horizontal sur la Timeline** pour ajuster le zoom temporel. **Balayage dans la zone du ruler/selection temporelle** pour se déplacer le long de la Timeline ; distinguer le balayage rapide du maintien-glisser de création de zone.
2. **VALIDÉ — Un seul curseur de zoom horizontal** en bas dans les outils, **réutilisant le slider existant** d'atome/eVe. **Pas de zoom vertical ni de slider vertical pour l'instant** : les pistes conservent leur hauteur standard.
3. **VALIDÉ — Sélection multiple par l'outil Sélection/lasso existant**, encadrer la zone visée ; garder les comportements clavier usuels, notamment **Maj/Shift** pour ajouter des éléments à la sélection.
4. **PROPOSITION NON VALIDÉE — Futur outil/toggle « Shift » tactile** pour sélection ajoutée point par point sans clavier (maintien ou activation verrouillée). L'utilisateur l'a évoqué comme **possibilité à explorer**, en précisant que cet outil n'existe pas aujourd'hui ; **ne pas le représenter comme composant réel ni comme fonctionnalité acquise**.
5. **VALIDÉ — Tous les outils et réglages compatibles sont applicables en batch** avec les règles précédemment validées : pas de modification implicite des propriétés non touchées et possibilité d'overrides individuels.

### 11.7 Visibilité Timeline / Cellules et split screen

1. **VALIDÉ — Utiliser l'outil du bandeau latéral contextuel existant** pour afficher soit la **Timeline** seule, soit les **Cellules** seules ; un **clic simple** sur la vue souhaitée l'affiche et remplace l'autre vue seule.
2. **VALIDÉ — Un clic long sur « Timeline » ou « Cellules » force la coexistence des deux vues**, que l'utilisateur soit d'abord en Timeline seule ou en Cellules seules. Le split screen n'est **pas** la conséquence d'une deuxième touche courte accidentelle.
3. **VALIDÉ — Séparation redimensionnable** des deux vues par une poignée/séparateur manipulable. Réutiliser les primitives de split/disposition réellement présentes ; si aucune n'existe, identifier le besoin et faire valider un composant fonctionnel au lieu d'inventer un panneau parallèle.
4. **VALIDÉ — Le split screen n'ajoute ni moteur supplémentaire, ni duplication des données, ni lecture simultanée linéaire et non linéaire.** Les deux vues gardent leur liaison canonique et les deux stratégies de déclenchement restent accessibles (voir section 1).

### 11.8 Zone inférieure de média sélectionné : contexte, pas panneau permanent

1. **VALIDÉ — La zone sous la Timeline est CONTEXTUELLE.** Elle apparaît lorsqu'un clip ou une cellule correspondant à un contenu est sélectionné ; elle montre ce **contenu précis**, pas toujours une waveform générique.
2. **VALIDÉ — Selon le média sélectionné :** son = waveform détaillée ; vidéo = durée / succession de photogrammes représentatifs ; autre type = représentation native pertinente si elle existe dans atome/eVe. Ne pas forcer un spectre audio pour du texte, un objet visuel ou un média vidéo muet.
3. **VALIDÉ — Pour un échantillon audio découpé :** afficher ses barres de split avec petits pieds/poignées, tranches sélectionnables et modifications de splits sans détruire la source. La projection Cellules/Échantillons suit ces segments dynamiquement.
4. **VALIDÉ — En l'absence de sélection de média, ne pas laisser une waveform arbitraire affichée comme si elle était permanente.** Aucun nouveau panneau de paramètres flottant ni bande d'outils dupliquée sous l'inspecteur dans le premier visuel.

### 11.9 Critères de fidélité des maquettes : propositions validées, corrections et limites

1. **CONFIRMÉ — Le premier visuel de Timeline a été jugé « impeccable » par l'utilisateur pour l'ensemble de sa disposition, des pistes colorées et de sa représentation générale**, sous réserve des corrections expressément formulées ensuite. Les versions visuelles générées sont des **maquettes conceptuelles**, pas la preuve d'utilisation de composants exacts du projet : avant d'en tirer du code, vérifier réellement les composants et palettes du repo.
2. **CORRECTION VALIDÉE — Placer le ruler numéroté tout en bas avec la zone de sélection**, sans deuxième ruler en haut. La bande supérieure du dispositif inférieur montre les **régions/Scènes occupant toute la hauteur de leur bande, sans drapeaux au-dessus** ; la bande inférieure montre les numéros, puis le ruban vert **sous** les numéros. Les derniers visuels validés font autorité sur les premières propositions.
3. **CORRECTION VALIDÉE — Supprimer la piste « Loop » sous les autres pistes**, car le Loop est une sélection sur le ruler, pas une source de piste. Ne pas réintroduire une rangée « Loop » pour seulement dessiner la boucle.
4. **VALIDÉ — Ne rien changer d'autre dans le concept visuel accepté.** Conserver l'en-tête mobile/compact, les pistes audio/vidéo/MIDI/objet, les séparations et l'inspecteur de média. Ne pas profiter d'une retouche ciblée pour réinventer toute l'interface.
5. **À CONTRÔLER AVANT CODAGE — Vérifier l'existence exacte des composants** Matrice, outils de sélection, outils MIDI/Input/Time/Quantize, slider canonique, en-tête/rail contextuel et primitives de split avant de promettre de les réutiliser. Si l'un n'existe pas, identifier le manque précisément.

### 11.10 Statut réel de complétude après cet audit

- **TERMINÉ POUR LES DEUX VISUELS DE TIMELINE VALIDÉS :** décisions visuelles, gestes, emplacement des régions, règles de bande latérale, états d’en-tête compact/ouvert, grandes cibles M/S, composants à réutiliser et contenu contextuel de la partie inférieure sont suffisamment définis. Ne pas rouvrir les questions UI déjà traitées.
- **PAS ENCORE UNE SPÉCIFICATION D'IMPLÉMENTATION COMPLÈTE :** le catalogue entier des Follow Actions, la sémantique des cellules contenant des actions, le rejeu des Follow Actions lors d'un Record Action, la représentation d'occurrences multiples, certains cas limites de capture/fin de lecture et la sérialisation précise v2 restent à décider ou à détailler. Ils ne bloquent pas le rendu initial de la Timeline.
- **DOCUMENTATION/GIT :** aucune modification du dépôt `atomecorp/a` ou `atomecorp/eVe` n'est effectuée par cette révision locale ; la spécification v2 actuellement déclarée « authoritative » dans GitHub contredit toujours la conservation des cellules et devra être corrigée **sur demande explicite**, après finalisation de la spécification.

### 11.11 Deux références visuelles validées — état replié / état déplié

Les deux maquettes de Timeline qui suivent sont **validées par l’utilisateur pour cette étape de conception**. Elles décrivent deux états du **même composant**, pas deux présentations alternatives à arbitrer. Les pixels et éléments décoratifs issus d’une génération d’image n’autorisent **aucune réinvention** des composants natifs d’atome/eVe ; l’intégration doit s’appuyer d’abord sur le code, les dimensions et les styles existants.

1. **VALIDÉ — En-têtes repliés :** `maquette_d_interface_de_montage_audio_sombre.png` (copie de travail actuelle dans `/mnt/data/`). Une petite colonne de **carrés colorés** affiche seulement les libellés abrégés, sans icônes, sans M/S. Les pistes et leurs clips restent visibles avec le design inchangé ; les clips occupent **toute la hauteur** de leur piste.
2. **VALIDÉ — En-têtes ouverts :** `interface_daw_mobile_aux_boutons_m_s_agrandis.png` (copie de travail actuelle dans `/mnt/data/`). Tous les en-têtes s’ouvrent ensemble ; le même contenu de Timeline est repoussé vers la droite. Pour chaque piste, sur **une seule ligne**, nom plus long puis grandes touches **M** / **S** faciles à cibler ; jamais de touches empilées. Ce visuel reprend la taille agrandie et l’écartement validés **après plusieurs itérations**. Les anciennes variantes où seules les touches d’une piste sont grandes, où apparaissent des pictogrammes, ou où les touches sont minuscules ne sont **pas** les références finales.
3. **VALIDÉ — Parties communes aux deux visuels :** mêmes pistes, contenus, tracé de lecture, trous virtuels, détail média sélectionné et règles de couleurs ; seules la **largeur des en-têtes**, la **longueur du libellé** et la **présence/taille de Mute et Solo** diffèrent. Une ouverture/repli ne modifie ni source, ni clip, ni état de lecture, ni données.
4. **VALIDÉ — Ruler et régions :** tout en bas, la partie supérieure du dispositif reçoit les **régions vertes « Couplet » / « Refrain »**, qui occupent toute la hauteur de leur bande **sans marqueurs supplémentaires au-dessus** ; la partie inférieure affiche **numéros/graduations**, puis **ruban vert de sélection plus bas**. La zone basse reste adaptée au défilement horizontal. Les anciens visuels comportant une piste « Region » en haut, une piste « Loop » dédiée, des marqueurs verts en drapeau au-dessus des régions ou une bande verte au-dessus des nombres ne font **pas** autorité.
5. **VALIDÉ — Réglages visuels minimaux :** ne pas ajouter de nouvel indicateur d’état, de nouvelle typographie, de nouveaux panneaux ni de copies graphiques d’outils. La taille du ruler est conçue selon la proportion de piste retenue, avec deux sous-zones ; vérifier lors de l’intégration les dimensions réelles natives d’atome et l’ergonomie tactile.

### 11.12 Barre latérale contextuelle et outils de piste — clarification supplémentaire

1. **VALIDÉ — La barre latérale contextuelle d’atome/eVe est toujours la surface d’outils de la sélection.** Elle est **hors cadre** des deux maquettes de Timeline pour ne représenter que le contenu central. Son absence sur les images **ne signifie pas** qu’elle est supprimée, masquée fonctionnellement ou remplacée par des boutons dessinés dans la Timeline.
2. **VALIDÉ — Sélection d’une piste :** la barre latérale existante présente les outils réellement applicables à la piste sélectionnée, notamment l’**outil Volume** pour ajuster son volume lorsque la nature de la piste le permet, et l’**outil Supprimer** pour retirer la piste. Les autres outils pertinents ne doivent apparaître que s’ils existent et s’appliquent à la sélection. Aucun clone local de Volume/Delete ni composant parallèle ne doit être créé.
3. **VALIDÉ — Création de piste :** elle utilise également le ou les **outils de création existants du bandeau latéral contextuel** avec la destination/contexte courant, et non un bouton nouveau fixé dans la zone Timeline. Ne pas inventer un identifiant d’API ou de tool ; vérifier le composant et la commande réels dans le dépôt.
4. **VALIDÉ — Séparation des rôles :** l’en-tête ouvert montre **uniquement nom, Mute et Solo**. Volume, supprimer/créer une piste, éditions et autres actions métier relèvent des **outils contextuels latéraux**. La zone inférieure affiche la matière sélectionnée, pas une seconde barre d’outils.
5. **VALIDÉ — Batch :** en sélectionnant plusieurs pistes, tous les réglages et actions **compatibles** de la barre latérale doivent fonctionner en batch, sans écraser les paramètres non modifiés ; les paramètres incompatibles ne doivent pas être artificiellement exposés.
6. **GARDE-FOU NON DESTRUCTIF :** « Supprimer une piste » retire sa structure/référence via les commandes canoniques, l’historique et les permissions existantes ; ne pas inférer que cela efface irréversiblement le média source. Préserver le contrat d’édition non destructive déjà validé.

### 11.13 Précision d'enregistrement et de lecture ; plugins prévus — 14/10/2026

- **VALIDÉ — Précision professionnelle, à l'échantillon près**, à l'enregistrement comme à la lecture. Les pistes démarrent toutes sur la même trame. Une prise faite pendant la lecture est placée sur la trame réellement entendue, latence du matériel déduite, plus une calibration propre à l'entrée.
  - **Web — livré et prouvé** : sonde à bouclage numérique ; prises calibrées et relues retombent à 0 échantillon d'écart, métronome compris.
  - **Tauri — à faire** dans la même tâche.
- **PRÉVU, NON RÉALISÉ — Plugins** (effets et instruments) : le modèle et le moteur doivent leur réserver une place, sans les implémenter maintenant :
  - un point d'insertion par piste dans la chaîne audio du moteur (Kira), entre la voix et le volume/pan de la piste ;
  - une latence de plugin déclarée, compensée par le même mécanisme de placement que la latence d'entrée ;
  - des réglages persistés dans le modèle canonique de la piste, comme les autres paramètres.
  
  Aucun format de plugin n'est choisi.

## 12. Historique du fichier

- **v0.1 — 14/10/2026 :** première consolidation écrite des décisions de la conversation. Aucune modification des dépôts GitHub n'a été effectuée.
- **v0.2 — 14/10/2026 :** ajout des décisions et exigences prononcées vers 00:27–00:28 : quantification propre à chaque cellule pour un binding MIDI commun, harmonisation par batch, lasso et sélection point par point, suppression/enregistrement groupé, traitements compatibles via la barre latérale. Point toujours en attente de validation de clôture. Aucun dépôt GitHub modifié.

- **v0.3 — 14/10/2026 :** clôture du thème sélection/traitements en batch, puis ajout du Record simultané avec Input par cellule, application groupée de la source suivie d’overrides individuels et doublons de sources autorisés. Règle temporelle du Record groupé à préciser. Aucun dépôt GitHub modifié.

- **v0.4 — 14/10/2026 :** confirmation de la règle de batch non destructif pour les paramètres : aucune harmonisation implicite ; seules les propriétés explicitement modifiées prennent une valeur commune ; quantifications de fin individuelles maintenues sinon. En attente de la clôture explicite du sous-thème par l’utilisateur. Aucun dépôt GitHub modifié.

- **v0.5 — 14/10/2026 :** clôture confirmée du Record simultané en batch, conservation des réglages individuels et possibilité d’override ; échecs d’Input laissés comme détail technique reporté. Nouveau sujet de clarification : modes de lecture/contrôle par cellule, notamment Latch, maintien, boucle et one-shot. Aucun dépôt GitHub modifié.

- **v0.6 — 14/10/2026 :** modes One-shot/Loop et Latch/Maintien confirmés ; répétitions limitées/infinies, attaque/release, pitch/vitesse/Time Stretch ajoutés comme options par cellule ; tout réglage compatible doit désormais être prévu pour une édition batch, règle générale pour atome/eVe. Éléments audio encore en clarification, aucune clôture anticipée de ce point. Aucun dépôt GitHub modifié.

- **v0.7 — 14/10/2026 :** ajout des validations explicites ~00:41–00:44 (règle globale de batch, fondus précis en ms ou unité musicale, vidéo alignée sur audio, priorité des limites de boucles en Maintien, release au relâchement). Remplacement des anciennes questions obsolètes par un audit distinguant décisions produit encore ouvertes et détails techniques reportables. **Aucune modification des dépôts GitHub.**

- **v0.8 — 14/10/2026 :** intégration des échanges ~01:01–01:08 : organisation visuelle Timeline/Cellules, trois projections Pistes/Scènes/Échantillons, bande de Scènes et bande de boucle séparée, scènes-régions validées, découpe d’échantillons, enregistrement des enchaînements, pistes/cellules agnostiques et actions/outils ; question résiduelle sur le séquencement interne d’une Scène. Aucun dépôt GitHub modifié.

- **v0.9 — 14/10/2026 :** confirmation du timing interne strict des Scènes, lien dynamique Timeline ↔ Cellules/Scènes/Échantillons, adaptation automatique aux changements de clip et exigence transversale de non-destruction/réversibilité des opérations. Rectification des questions déjà résolues. Les cas de suppression physique définitive demeurent distincts et non définis. Aucun dépôt GitHub modifié.

- **v1.0 — 14/10/2026 :** ajout de la règle de vidage synchronisé cellule ↔ portion correspondante de la Timeline, valable pour les samples découpés, pistes et Scènes, avec préservation non destructive des sources. Distinction « Mute » versus « Vider » laissée explicitement ouverte ; aucune clôture anticipée. Aucun dépôt GitHub modifié.

- **v1.1 — 14/10/2026 :** rectification explicite « pas de Mute » : une cellule vidée produit un trou virtuel non destructif dans la Timeline ; les bordures du sample/clip donnent accès à la matière conservée afin de reconstituer le segment et sa cellule liée. Le déplacement automatique des clips suivants n'est pas demandé. Confirmation formelle de clôture encore à obtenir. Aucun dépôt GitHub modifié.

- **v1.2 — 14/10/2026 :** validation formelle et clôture du vidage non destructif pour les cellules de pistes/scènes/échantillons, y compris les samples splittés ; récupération de la matière source par extension des bordures. Le prochain sujet est le comportement par défaut des Follow Actions / enchaînements entre Scènes. Aucun dépôt GitHub modifié.

- **v1.3 — 14/10/2026 :** règle par défaut d’enchaînement des Scènes consignée comme validée (suivante sinon arrêt ; priorité à la Follow Action configurée). Inventaire des types de Follow Actions laissé ouvert ; aucun dépôt GitHub modifié.

- **v1.4 — 14/10/2026 :** validation expresse de l’architecture des cellules comme références dynamiques (trois projections), sans duplication des sources et avec paramètres propres persistés dans le même modèle canonique. Le principe est clos ; les détails déjà listés demeurent ouverts lorsqu’ils ne sont pas validés. Aucun dépôt GitHub modifié.

- **v1.5 — 14/10/2026 :** audit du fichier v1.4 et ajout exhaustif des réponses de l’utilisateur aux 18 questions UI, incluant refus des nouveaux états graphiques, en-têtes compacts et Mute/Solo sans Arm, régions/Scènes, ruler et boucle en bas, trous virtuels/handles/rebouclage de matière, splits, snap de l’édition par l’outil existant, Inputs filtrés, pinch/zoom horizontal, lasso/Shift, clic court/long pour vue seule/split, détail média contextuel, standard strict des tailles de Matrice et réutilisation de la charte atome ; corrections du premier visuel documentées et ambiguïté de déplacement de la région vers le haut signalée. Le cahier fonctionnel est suffisant pour la maquette mais pas pour fermer tous les cas limites d’implémentation. Aucun dépôt GitHub modifié.

- **v1.6 — 14/10/2026 :** validation des deux états graphiques Timeline (en-têtes compacts colorés sans pictogrammes ; en-têtes ouverts collectivement, noms complets, M/S bien agrandis et alignés sur une seule ligne), région/ruler définitivement en bas sur deux niveaux, absence de drapeaux verts, clips pleine hauteur, et clarification explicite du rail d’outils contextuels d’atome/eVe pour Volume, création/suppression de piste et traitements batch. Aucune modification des dépôts GitHub.
