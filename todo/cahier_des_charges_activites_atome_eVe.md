# atome/eVe — Cahier des charges Activités, Sport et Objectifs

**Version de travail réorganisée — 27 octobre 2026.**  
**Statut :** besoins recueillis et analyse documentaire effectuée ; dépôt, écrans, composants et comportements non audités dans le cadre de cette révision. Aucune maquette ni implémentation n'est validée par ce document.  
**Sources :** texte transmis par Jeezs, version « activité précision validée v6 » et précision ultérieure sur BUG-002.  
**Destinataire :** agent chargé de l'audit, des propositions, des maquettes puis de l'implémentation après validation.

## 1. Finalité et principes

Faire évoluer les activités d'atome/eVe, en particulier Sport, pour rendre leur utilisation plus confortable, conserver les séances en cours, permettre le suivi des exercices et assembler les outils existants de médias, de partage et d'objectifs. Les activités sont des briques d'action réutilisables qui peuvent contribuer à un ou plusieurs objectifs.

Le calendrier et la recherche de professionnels sont des chantiers transversaux. Ils ne doivent pas devenir des sous-applications propres à Sport.

### Règles obligatoires

- Réutiliser les véritables briques, outils, objets, comportements, API et options natives d'atome/eVe après vérification. Étendre une brique canonique si nécessaire ; ne pas dupliquer les moteurs d'activités, d'objectifs, de médias, de conversation, de partage ou de permissions.
- Interface zen, modulaire et minimale : assembler les outils réels, garder leur apparence et leur logique. Le Finder est utilisé pour rechercher/sélectionner si cela correspond au fonctionnement constaté ; les options natives restent avec l'outil. Aucun panneau générique, réseau social autonome, fenêtre surgissante indépendante ou réglage parallèle inventé.
- Les noms de composants, fonctionnalités, plateformes, modes eVe et intégrations mentionnés sont des **éléments à vérifier**, non des preuves d'implémentation. Distinguer : besoin exprimé, décision validée, hypothèse, proposition et comportement effectivement testé.
- JavaScript prioritaire et architecture existante ; pas de TypeScript sans demande explicite. Éviter dépendances, couches et bibliothèques supplémentaires sans nécessité démontrée. Préserver le travail local.
- Aucun changement de code avant validation explicite du plan d'ensemble **et des maquettes concernées**. Audit, analyse, tests de l'existant et propositions sont autorisés. Aucun commit, push, PR ou déploiement sans instruction explicite.
- Après validation, exécuter les tâches et sous-tâches autorisées en continu, avec tests et documentation, sans pauses artificielles. S'arrêter en cas de blocage réel, arbitrage nécessaire, permission manquante ou validation non obtenue.
- Pour chaque fonctionnalité, mesurer si possible mémoire, CPU, taille du code/bundle et latence avant/après sur les plateformes disponibles ; ne jamais annoncer un gain non mesuré. Charger à la demande si l'architecture le permet et si cela apporte un bénéfice.

## 2. État, priorités et dépendances

Tous les éléments ci-dessous restent **à auditer / concevoir** sauf indication contraire. L'ordre est une proposition de travail, à confirmer après audit ; aucune demande n'est supprimée ni reportée définitivement.

| Priorité proposée | Identifiant | Sujet | Dépendances / remarques |
|---|---|---|---|
| 0 | PROC-001, PROC-002 | Audit, challenge, plans et validation | Préalable commun à toute modification |
| 0 | FEAT-007, ARCH-001 | Architecture atomique et factorisation Activités ↔ Objectifs | À instruire avant les fonctions communes |
| 1 | BUG-002, UX-001 | Champs numériques mobiles et lignes de réglage | Composants transversaux à vérifier |
| 1 | UX-002, UX-003 | Séances en cours et repos entre séries | États et chronométrage communs |
| 1 | FEAT-001, FEAT-008 | Marche et charges par série | Réutiliser mesures, composants et états |
| 1 | FEAT-013, UX-004 | Variantes de planche, annonces et progression globale | S'appuyer sur UX-001, UX-002 et UX-003 ; vérifier les outils et durées existants |
| 1 | FEAT-014 | Refonte Cardio, course et programmes par intervalles | S'appuyer sur FEAT-001, ARCH-001, FEAT-008, FEAT-009, UX-002 à UX-004 ; audit et maquettes à valider |
| 2 | FEAT-009, FEAT-011 | Objectifs et tempo | ARCH-001 ; FEAT-008 et UX-003 pour le tempo |
| 2 | FEAT-004, 005, 006 | Média, partage et VideoTrain | Outils natifs, permissions, continuité de séance |
| 3 | FEAT-010 | Recherche de coachs / spécialistes | Valeur et sources à confirmer ; réservation liée à FEAT-012 |
| 3 | FEAT-012 | Calendrier et réservation | Chantier autonome transversal ; peut être planifié séparément |

Les identifiants UX-001, UX-002 et FEAT-001 sont attribués ici à des besoins précédemment sans identifiant ; FEAT-004 à FEAT-012, UX-003, PROC-001, PROC-002, ARCH-001 et BUG-002 conservent leur référence. Les numéros absents ne présument ni bug ni fonctionnalité supplémentaires.

### Suivi

Pour chaque point : `à auditer → à concevoir → maquette / plan à valider → prêt → en cours → testé → terminé`. Consigner responsable éventuel, preuve, dépendances, décisions, tests et écarts. « Terminé » exige les critères d'acceptation et les tests pertinents. Les cases ci-dessous correspondent au travail restant ; elles ne prétendent pas décrire l'état réel du code.

## 3. Processus de préparation et d'exécution

### PROC-001 — Audit, challenge et cohérence

- [ ] Lire le présent cahier, les instructions applicables dont AGENTS.md, les documents et captures disponibles ; inventorier chaque exigence et la rattacher à un identifiant.
- [ ] Cartographier le dépôt et les écrans réels : Activités, Sport, Objectifs, composants numériques, états et mesures, Finder, médias, VideoTrain, partage, communication, calendrier, profils, stockage et MCP s'il existe. Donner les chemins, dépendances, contrats et tests constatés.
- [ ] Pour chaque demande, examiner utilité, faisabilité, simplicité, alternatives, cohérence, confidentialité, sécurité, accessibilité, coûts, maintenance et ressources. Proposer des éléments à différer si nécessaire, sans les retirer du suivi sans accord.
- [ ] Produire une matrice « existant vérifié / commun / spécifique / manquant », une carte des dépendances et les contradictions ou questions à arbitrer. Présenter les preuves et limites de l'audit ; ne pas inventer d'API.
- [ ] Produire un plan hiérarchisé, une architecture, des tests et des maquettes fidèles aux composants et captures réels. Présenter l'ensemble, recevoir la validation explicite et intégrer les corrections avant tout code.
- [ ] Mettre à jour ce cahier au fil des décisions sans perdre les besoins, exemples, scénarios ou identifiants. La **réorganisation documentaire** demandée ici est réalisée ; l'audit du dépôt, la validation et le challenge fondé sur le code restent à faire.

### PROC-002 — Plans et réalisation

- [ ] Pour chaque BUG, UX, FEAT et chantier transversal : objectif, périmètre, briques réutilisées, prérequis, sous-tâches ordonnées, livrables, tests, critères d'acceptation, conditions de fin et risques.
- [ ] Ordonner les dépendances pour éviter les reprises ; isoler le calendrier tout en décrivant son intégration à Sport.
- [ ] Faire valider le plan global et les maquettes correspondantes avant toute modification, y compris non visuelle. Après validation, poursuivre les étapes autorisées jusqu'à leur fin ; documenter et tester au fil de l'eau.

## 4. Architecture transversale

### FEAT-007 — Sobriété et composition atomique

- [ ] Auditer les modules de capture, lecture, listes, recherche, Finder, médias, partage, conversation et permissions, avec chemins et dépendances. Utiliser les outils effectifs dans les panneaux, avec leurs options natives.
- [ ] Maintenir une source de vérité cohérente pour chaque donnée utilisée par UI, partage, VideoTrain et MCP si disponible. Une nouvelle brique doit répondre à un manque constaté, être réutilisable hors Sport et justifier son coût.
- [ ] Préserver le point d'accès Média unifié et un accès Partager distinct. Ne pas créer un second gestionnaire de médias, lecteur, moteur de conversation ou sous-application Sport.
- [ ] Vérifier usage mémoire, CPU, poids et latence ainsi que le chargement à la demande ; comparer uniquement des mesures réelles.

### ARCH-001 — Activités ↔ Objectifs

**Principe validé :** une activité est une action ou séance exécutable et mesurable indépendamment ; un objectif décrit une intention, des critères de réussite et éventuellement une échéance ; leur relation décrit une contribution mesurable. Une activité peut contribuer à plusieurs objectifs, un objectif utiliser plusieurs activités ; chacun peut exister sans l'autre.

- [ ] Cartographier objets, données, outils, panneaux, événements, permissions, mesures, historiques, planifications et API des deux domaines, avec leurs chemins.
- [ ] Déterminer ce qui est réellement commun : sélection, durée, états, échéances, répétitions, métriques, historique, progression, notifications, partage, calendrier et profils. Mutualiser seulement les comportements identiques ; conserver les spécificités métier.
- [ ] Définir source de vérité, identifiants, cardinalités, calculs de contribution, unité/période, synchronisation, édition et révocation. Éviter le double comptage d'une séance **dans un même agrégat**, sans empêcher une contribution légitime à plusieurs objectifs distincts ; documenter la règle.
- [ ] Étudier les liens avec objectifs généraux et ponctuels, challenges, charges, tempo, calendrier, séances en cours, médias et partage. Éviter copie de données et états concurrents ; prévoir migration non destructive et non-régression si nécessaire.
- [ ] Challenger toute abstraction trop générale et mesurer son coût réel. Proposer matrice de factorisation, schéma de relations et plan de migration fondés sur l'existant.
- [ ] Maquetter rattachement/détachement, contributions et changement d'objectif pendant une activité, sans l'interrompre ; utiliser les vrais panneaux.

**Acceptation :** plusieurs activités associées à un objectif sans copie ; une activité liée à plusieurs objectifs avec règles de calcul explicites ; activité autonome ; retrait d'un objectif sans perte d'historique ; permissions, progression et états cohérents ; mesure des ressources avant/après lorsque possible.

## 5. Interactions communes et continuité

### BUG-002 — Saisie numérique mobile : glissement ou clavier

**Problème signalé par Jeezs :** sur mobile, toucher un champ numérique, par exemple durée ou charge, ouvre immédiatement le clavier et empêche la modification par glissement. Le problème concerne potentiellement tous les champs utilisant ce mécanisme, pas uniquement Sport. La correction doit être étudiée dans le composant numérique existant.

- [ ] Appui puis glissement : modifier progressivement la valeur sans ouvrir le clavier.
- [ ] Relâchement après glissement : conserver la nouvelle valeur, sans clavier.
- [ ] Appui puis relâchement sans glissement : ouvrir le clavier pour saisie manuelle.
- [ ] Auditer le composant, les occurrences et plateformes concernées ; déterminer un seuil de mouvement adapté aux gestes naturels et au défilement, sans inventer de comportement déjà implémenté.
- [ ] Étudier annulation du geste, sortie de la zone, interruptions, limites et précision, unités, accessibilité, saisie clavier matériel et compatibilité tactile/souris. Les modalités précises sont à maquetter et valider.
- [ ] Tester tous les contextes utilisant le composant, notamment durée et charge : toucher simple, glisser, relâcher, défilement, limites, annulation et non-régression des autres plateformes.

**Acceptation :** les trois gestes attendus fonctionnent sur les plateformes mobiles concernées et aucune correction locale isolée ne duplique le composant commun.

### UX-001 — Dimensions des lignes de réglage

- [ ] Dans tous les panneaux d'activités concernés, harmoniser hauteur, épaisseur visuelle et surface utilisable des lignes de réglage (répétitions, séries et autres valeurs) avec les autres panneaux réels d'atome.
- [ ] **Ne pas agrandir les sélecteurs eux-mêmes** : ajuster les lignes qui les accueillent. Respecter l'apparence, les proportions et les composants existants.
- [ ] Tester confort et cohérence sur les écrans supportés, y compris avec BUG-002. Maquette et validation préalables.

### UX-002 — Activités et tâches en cours

- [ ] Revenir au dashboard sans interrompre les activités ou tâches actives ; préserver état et mesures.
- [ ] Quand au moins une activité ou tâche est active, afficher l'icône « Activité en cours » dans la barre inférieure, **à gauche de l'icône atome**. Au clic, déployer au-dessus de la barre les activités et tâches en cours, y compris multiples ; sélectionner un élément pour y revenir.
- [ ] Vérifier pause, reprise, arrêt et navigation entre panneaux ; ne pas confondre transfert média en cours et activité sportive active. Aucune icône ou zone grisée n'est demandée.
- [ ] Étudier comportement lors de verrouillage, suspension ou arrêt de l'application selon les capacités réelles de chaque plateforme ; ne pas promettre une exécution système impossible. Clarifier ce qui continue effectivement et ce qui est restauré.
- [ ] Tester plusieurs séances/tâches, retour et reprise, état du chronomètre et des mesures, redémarrage et interruptions disponibles. Produire et valider des maquettes fidèles.

## 6. Sport : cardio, marche, séries et tempo

### FEAT-014 — Refonte Cardio : course, objectifs et programmes par intervalles

**Besoin exprimé par Jeezs :** revoir la partie Cardio et y ajouter la course, qu'il indique ne pas trouver actuellement. Vérifier dans le code si elle existe déjà, entièrement ou en partie, avant toute conclusion et réutiliser les briques communes aux exercices. Ces besoins concernent aussi les autres activités cardio compatibles, notamment le vélo.

#### Description textuelle des captures fournies

Les captures servent de références **fonctionnelles**, pas de design à recopier. Aucune image externe n'est nécessaire pour comprendre ce cahier :

- **Choix du programme avant l'effort :** l'écran photographié comporte quatre grandes tuiles : « Objectif temps », « Objectif distance », « Intervalles croisés » et « HI-LOW BLOCKS ». Les deux premières évoquent une cible réglable ; la troisième représente des barres progressant vers un sommet puis redescendant ; la quatrième montre des blocs alternant intensités basse et haute. La capture ne précise pas la formule, les durées exactes ni le comportement de ces programmes : ne pas les inventer.
- **Suivi pendant l'effort :** une durée centrale est entourée d'informations : distance en km, allure en min/km, fréquence cardiaque en BPM et calories ; la console présente aussi vitesse et pente. Des réglages et commandes existent sur la machine. Les valeurs illustrées sont des exemples d'une console, non des mesures du projet. La photo contient également « MOVEs » et des cœurs : Jeezs ne demande pas ces indicateurs.
- **Traduction pour atome/eVe :** permettre d'identifier simplement les types de programmes, éventuellement par des tuiles natives ou composants équivalents et par une représentation des profils. La composition, les couleurs, les proportions, les outils et leurs options doivent provenir du véritable design atome/eVe. Ne pas reproduire les cartes, textes publicitaires, boutons ou la mise en page de la console ; produire des maquettes fidèles aux composants du projet et les faire valider.

#### Avant la séance : course et objectifs

- [ ] Vérifier l'existant Cardio, les panneaux, les parcours de course, marche, vélo et les outils de programme ; distinguer ce qui fonctionne réellement de ce qui est demandé.
- [ ] Prévoir la course comme activité Cardio, en extérieur et sur tapis, selon les capacités réellement disponibles. Le choix tapis / extérieur adapte les données disponibles et leur source ; ne pas supposer de connexion à une machine ni de contrôle automatique de sa vitesse ou de son inclinaison.
- [ ] Prévoir une activité libre et la sélection d'un **objectif de temps**, d'un **objectif de distance** ou d'un **programme par intervalles**. Définir leur compatibilité et leurs conditions de fin sans imposer plusieurs objectifs contradictoires.
- [ ] Conserver les réglages au bon endroit, dans les options natives de l'outil ; les lignes de réglage suivent UX-001 sans agrandir les sélecteurs. Réutiliser objectifs et activités suivant ARCH-001 et FEAT-009, sans créer un gestionnaire parallèle.
- [ ] Avant le départ, permettre de voir le contenu du programme, ses étapes, séries, objectifs et durée prévue lorsqu'elle est calculable ; toute suggestion doit pouvoir être revue et confirmée.

#### Programmes et profils d'intervalles

- [ ] Permettre un programme composé de phases telles que **échauffement → sprint ou effort intense → récupération**, avec plusieurs blocs ou répétitions, puis éventuellement retour au calme. Échauffement, efforts et récupérations doivent être configurables et les indications personnalisables selon l'activité ; ne pas imposer de paramètres sportifs non validés.
- [ ] Étudier des programmes de type HIIT et d'autres intervalles : alternance de blocs hauts/bas, profil progressif montant puis descendant de type cloche/parabolique, et programme personnalisé composé par l'utilisateur. Un profil parabolique est une option à définir précisément, non une formule présumée à partir de l'image.
- [ ] Permettre, selon l'activité et les outils réels, de régler nombre et ordre des blocs ou séries, durée ou distance de chaque phase, récupération et intensité cible pertinente : allure, vitesse ou autre mesure adaptée. Proposer une visualisation des blocs ou d'une courbe et une vue des valeurs avant départ ; l'utilisateur peut modifier le programme.
- [ ] Distinguer le **profil d'intensité cardio au fil des phases** du **profil de charges de musculation par série FEAT-008** : étudier les outils communs de séquence, calcul et visualisation sans mélanger leurs unités ni créer automatiquement un second moteur.
- [ ] Un même mécanisme de phases doit pouvoir servir à la course, au vélo et à d'autres exercices cardio compatibles, avec mesures et réglages propres à chaque discipline ; ne pas ajouter de champs artificiels aux activités qui ne les utilisent pas.
- [ ] Intégrer UX-003 et UX-004 : annoncer la pause ou récupération à venir, puis indiquer pendant celle-ci la prochaine phase et le temps connu ; conserver la continuité de la séance et la progression globale. Tenir compte des choix de variantes FEAT-013 lorsque pertinents.

#### Pendant l'effort : suivi et données

- [ ] Afficher clairement la durée totale écoulée et, lorsqu'elle est connue, la durée totale prévue et l'avancement global, y compris phases d'effort et de récupération ; montrer en parallèle la série ou phase courante et son numéro / nombre total si applicable. Réutiliser l'indicateur UX-004 proposé en bas, non modifiable et à maquetter.
- [ ] Afficher la distance, l'allure en min/km ou la vitesse en km/h selon les préférences et données disponibles ; permettre la conversion ou le choix d'affichage lorsque le calcul est possible. Signaler une allure indisponible si la vitesse est nulle ou la donnée insuffisante.
- [ ] Prévoir la fréquence cardiaque en BPM lorsqu'une source compatible est effectivement accessible et autorisée. Indiquer clairement si elle est absente ou interrompue ; ne jamais en déduire une valeur fictive.
- [ ] Prévoir les calories en kcal **uniquement si une source ou une méthode de calcul pertinente existe** ; distinguer estimation fournie par un appareil, estimation calculée et valeur éventuellement renseignée manuellement. Étudier une estimation personnalisée avec les données réellement nécessaires, facultatives et consenties, par exemple poids, durée et intensité si disponibles. Indiquer qu'il s'agit d'une estimation, sa provenance et les limites ; si les données nécessaires manquent, ne pas afficher une valeur inventée.
- [ ] Adapter les sources de distance, vitesse et allure à l'extérieur ou au tapis : GPS, capteur ou valeur de l'équipement **uniquement si disponibles et compatibles** ; prévoir absence/refus de permission, perte de signal et comportement sans donnée. La disponibilité sur tapis ne découle pas de celle du GPS extérieur.
- [ ] Ne pas inclure les indicateurs « MOVEs » ni les cœurs/likes visibles sur la console. La **fréquence cardiaque en BPM reste demandée** ; l'icône ou l'apparence associée est à valider.
- [ ] Conserver pause, reprise, arrêt, retour dashboard, activité en arrière-plan, audio et transitions selon UX-002, UX-003, UX-004 et FEAT-006. Aucune progression ou mesure ne doit avancer silencieusement de façon incompatible avec l'état réel.

#### Audit, maquettes et critères d'acceptation

- [ ] Auditer les composants et données existants : chronomètres, distances, GPS, capteurs, mesure cardiaque, estimations caloriques, séquences, objectifs, indicateurs, tuiles, graphiques, cardio et connexions éventuelles aux équipements. Donner les chemins et limites ; ne pas inventer de composant, capteur, API ni connexion tapis.
- [ ] Maquetter avec les véritables outils atome/eVe : choix course et tapis/extérieur ; choix objectif temps, distance ou intervalles ; configuration et aperçu des profils en courbe, blocs et personnalisé ; suivi en cours avec durée, phase, distance, allure, fréquence cardiaque, calories si disponibles et progression globale ; phase de récupération avec indication suivante. Présenter les variantes utiles à vélo et aux autres cardio compatibles.
- [ ] Vérifier les cas : course libre, objectif temps, objectif distance, parcours HIIT avec plusieurs répétitions, programme en blocs, profil en cloche, programme personnalisé, vélo compatible, capteur cardiaque absent, GPS indisponible, tapis sans connexion, calories impossibles à estimer, changement de phase, repos écourté et suspension/reprise.
- [ ] Tester les calculs de durée et distance selon leurs sources, la cohérence du profil affiché avec les phases exécutées, la distinction entre estimation et mesure, les objectifs, la progression globale, les permissions et la non-régression des autres activités. Faire valider le plan et les maquettes avant tout code.

**Décisions à instruire :** définition des profils et intensités, sources fiables par plateforme et par équipement, formule/calibrage des calories s'il en existe une pertinente, disponibilité de la distance sur tapis sans appareil connecté, précision des annonces et règles de progression lors des phases de durée indéterminée.

### FEAT-001 — Marche

- [ ] Examiner le réglage « pouls » : signification, utilité, raison de sa modification et comportement ; clarifier dans l'outil réel après audit.
- [ ] Vérifier le compte à rebours et le mode marche libre ; proposer un chronométrage libre et une durée cible facultative.
- [ ] Étudier l'affichage automatique de fréquence cardiaque en BPM à partir d'une source réellement compatible et autorisée ; expliciter disponibilité, absence de capteur et mesure non disponible. Ne pas inventer de connexion.
- [ ] Afficher vitesse (km/h) ou allure (min/km), au choix ; préciser les cas de vitesse nulle et disponibilité des mesures.
- [ ] Étudier marche avec itinéraire et afficher le trajet GPS effectivement parcouru pendant et après la séance au moyen de l'intégration cartographique existante, si confirmée. Distinguer itinéraire prévu et trace réelle ; autorisation et précision GPS à vérifier.
- [ ] Tester marche libre, durée cible, unités, capteur absent, GPS refusé/perdu, pause/reprise et retour à la séance ; maquetter et faire valider avant code.

### UX-003 — Repos et enchaînement des séries

**Observation à confirmer dans le code :** le compte à rebours observé correspond au repos automatique de 90 secondes entre séries, pas à une bascule erronée en mode chronométré. L'enjeu signalé est la lisibilité du parcours.

- [ ] Identifier clairement « Série en cours », « Repos — 01:30 » et « Série suivante » ; distinguer répétitions et repos.
- [ ] Conserver le lancement automatique du repos à la fin d'une série ; vérifier si et comment les 90 secondes sont configurées.
- [ ] Étudier l'enchaînement automatique à la fin du repos ou manuel sur action explicite, ainsi que le passage anticipé à la série suivante. Clarifier transitions et sons sans présumer de leur implémentation.
- [ ] Tester fin de série, pause, reprise, repos écourté, passage manuel/automatique et navigation hors panneau. Produire plusieurs maquettes série → repos → série suivante et les faire valider.

### FEAT-013 — Cardio : sélection des variantes de planche

**Besoin :** dans Cardio, rendre le module de planche compatible avec le fonctionnement des autres exercices et permettre de choisir les variantes présentes dans le programme.

- [ ] Auditer le module de planche, ses variantes réelles, sa configuration et les composants utilisés par les autres exercices ; identifier comment une variante est activée ou exclue et ne pas inventer une liste existante.
- [ ] Permettre de filtrer les variantes disponibles : inclure ou exclure une ou plusieurs options, par exemple les planches latérales droite et gauche, et choisir une seule variante si souhaité. Conserver uniquement les variantes explicitement retenues dans le déroulement.
- [ ] Examiner comment conserver ou modifier ce choix, son effet sur l'ordre et la durée du programme, et le comportement si aucune variante n'est sélectionnée ; proposer les règles à validation sans ajouter d'étapes fictives.
- [ ] Appliquer les mêmes lignes de réglage que les autres activités conformément à UX-001 : lignes plus confortables et cohérentes avec l'existant, **sans agrandir les sélecteurs eux-mêmes**.
- [ ] Réutiliser les vrais outils et leurs options natives. Présenter une ou plusieurs maquettes fidèles montrant la sélection des variantes et le résultat dans le programme ; attendre leur validation explicite avant tout code.
- [ ] Tester toutes les variantes, droite seule, gauche seule, exclusion d'une ou plusieurs variantes, une seule variante retenue, aucune sélection, changement de sélection et cohérence de la durée/progression. Vérifier les plateformes supportées et la non-régression des autres exercices.

### UX-004 — Annonces de transition et progression globale de l'activité

**Portée :** plusieurs exercices et activités, dont la planche, pas uniquement Sport ou un seul panneau. Cette demande complète UX-003 pour les repos entre séries et UX-002 pour les activités en cours.

#### Avant et pendant la pause

- [ ] Avant le début d'une pause prévue, annoncer clairement que la pause arrive. Définir après audit le moment opportun et les outils existants utilisables, sans perturber l'exercice en cours.
- [ ] Pendant la pause, afficher qu'il s'agit d'une pause, son temps ou son compte à rebours disponible, et ce qui suivra : prochain exercice ou variante, prochaine série si pertinent, et sa durée prévue lorsqu'elle est connue.
- [ ] Conserver les états et transitions UX-003 : le repos démarre automatiquement à la fin d'une série ; étudier les modes de passage manuel ou automatique et le passage anticipé. Les annonces ne doivent jamais déclencher une transition silencieuse.
- [ ] Vérifier les messages, signaux sonores et outils réels ; éviter une nouvelle interface de réglage. Tester pauses successives, fin d'activité, mise en pause manuelle, passage anticipé et durée ou étape suivante inconnue.

#### Indicateur global de progression

- [ ] Pour une activité planifiée, afficher le numéro de série et le nombre total de séries, les temps pertinents ainsi qu'une progression de **l'ensemble de l'activité**, en complément du curseur ou de la progression de la série en cours.
- [ ] Dans le calcul global, inclure l'enchaînement prévu des séries ou exercices et des repos ; par exemple, pour une activité estimée à 12 minutes, montrer la part déjà parcourue et le temps global selon les données effectivement disponibles. Éviter de confondre temps de la série, temps de repos et temps total de l'activité.
- [ ] Proposition de design à valider : une bande ou ligne fine en bas de l'écran, de dimension standard comparable à un slider, qui avance automatiquement et sert uniquement d'indicateur ; elle ne permet pas de modifier la progression. Son emplacement exact et sa relation à la barre inférieure et aux outils existants restent à maquetter.
- [ ] Distinguer durée prévue/estimée et durée réellement écoulée. Si l'utilisateur modifie une durée, filtre des variantes, écourte un repos ou change le programme, recalculer la progression sans incohérence et expliquer si nécessaire que l'estimation a changé. Définir, après audit et validation, le traitement des pauses manuelles et des enchaînements manuels ou de durée indéterminée ; ne pas afficher un total ou un pourcentage fictivement précis.
- [ ] En cas de durée inconnue ou indéterminée, proposer une indication honnête de l'avancement et des éléments connus ; tester le retour au dashboard, la reprise et les activités simultanées.
- [ ] Auditer les indicateurs, curseurs, chronomètres et modules de planning existants avant de proposer une brique ; les réutiliser et respecter le design réel, sans créer de contrôle parallèle inutile.

**Maquettes et validation :** montrer avant-pause, pause avec étape suivante et durée, retour à l'exercice, progression locale et bande globale pour un exemple complet de 12 minutes ; proposer l'intégration sur les écrans réels et plateformes supportées. Valider explicitement le design et le comportement avant toute modification de code.

**Tests d'acceptation :** séries avec repos cumulés ; annonce avant le repos et prochaine étape pendant celui-ci ; progression globale distincte de la série ; filtrage de variantes et mise à jour du total ; pause/reprise, repos écourté, changement de durée, étape inconnue, dernière série, fin d'activité et retour depuis le dashboard. Vérifier que la bande ne modifie jamais la position ou le programme.

### FEAT-008 — Charges par série et profils de progression

**Objectif :** proposer des charges sur N séries tout en conservant une saisie et un ajustement indépendants pour chaque série.

- [ ] Mode manuel : saisir chaque charge ; exemple 20 → 22 → 25 → 30 kg. Autoriser montée puis baisse, par exemple 20 → 30 → une charge inférieure choisie.
- [ ] Mode pas fixe : départ et incrément positif ou négatif ; exemple 20, 25, 30, 35 kg avec +5 kg. Ce n'est pas l'exemple à pas variables ci-dessus.
- [ ] Mode bornes + forme : définir N, minimum, maximum et courbe ; étudier rampe montante, descendante, montée puis descente (cloche/parabolique) et forme non linéaire de type hyperbolique. Chaque formule, sens, paramètres et éventuels plateaux sont à définir et valider ; « hyperbole » seul est insuffisant.
- [ ] Exemple : 12 séries, minimum 20 kg, maximum 40 kg. Afficher toutes les charges proposées avant démarrage. Un pas fixe de +5 kg avec départ à 20 kg donne 75 kg à la 12e série : ces contraintes ne peuvent donc pas toutes être imposées simultanément. Garder les modes distincts.
- [ ] Prendre en compte les paliers disponibles, par exemple 0,5 / 1 / 2,5 / 5 kg ou personnalisés ; afficher l'arrondi et ne pas dépasser silencieusement les bornes. Traiter l'absence de valeur réalisable entre les bornes, le nombre de séries égal à 1 et les bornes incohérentes par un message/action compréhensible à valider.
- [ ] Modifier une ou plusieurs séries après génération sans écraser leurs valeurs de manière inattendue ; préciser la régénération et ses effets avant confirmation. Distinguer charges planifiées et réellement effectuées, y compris après changement en séance.
- [ ] Cohérence avec UX-003, FEAT-009 et FEAT-011 ; aucun changement physique de charge n'est présumé. Profils descendants et non linéaires restent optionnels et jamais activés implicitement.
- [ ] Faire examiner les profils par des coachs/préparateurs et spécialistes ; ne pas les présenter comme protocoles validés. Auditer les outils de calcul et de visualisation avant d'en créer.
- [ ] Maquetter saisie par série, sélection, paramètres compacts, courbe et toutes les charges éditables ; conserver les dimensions UX-001. Tester bornes, arrondis, édition individuelle, régénération, reprise et valeurs effectuées.

**Challenge :** commencer par vérifier la valeur de la saisie manuelle et du pas fixe ; les courbes sophistiquées peuvent être proposées dans un lot ultérieur, sans les retirer du périmètre sans accord.

### FEAT-011 — Tempo appris et challenges

- [ ] À partir des outils existants de série et de durée, étudier un mode Record : 12 répétitions en 20 s donnent une moyenne d'environ 1,67 s/répétition. Cette moyenne ne mesure ni le rythme de chaque répétition ni les phases du mouvement.
- [ ] Proposer cette référence pour les séries suivantes, avec guidage visuel ou sonore facultatif ; l'utilisateur peut démarrer, interrompre et modifier le tempo. Étudier un défaut de profil éventuellement lié à l'objectif, avec priorité au réglage de l'exercice/séance ; aucun ajustement automatique non confirmé.
- [ ] Étudier un challenge de reproduction de cadence ou de progression choisie ; une régularité réelle par répétition ne peut être évaluée sans mesures supplémentaires. Vitesse et qualité technique sont distinctes.
- [ ] Relier le résultat à l'exercice, la série, le nombre de répétitions, la durée, le tempo moyen, la charge réellement utilisée, la source des mesures et le choix de sauvegarde profil/séance. Comparer en tenant compte des répétitions et de la charge ; ne jamais augmenter automatiquement la charge pour un challenge.
- [ ] Gérer zéro répétition, arrêt anticipé, pauses, variation du rythme, changement de charge et interruption/reprise. Étudier compatibilité avec BUG-002, UX-003, FEAT-008, FEAT-009, l'audio FEAT-006 et les ressources.
- [ ] Challenger l'intérêt d'un tempo moyen et d'une mesure plus fine avec des spécialistes ; ne pas assimiler vitesse et sécurité. Maquetter Record, durée, tempo, référence et challenge avec les outils existants ; tester et faire valider.

## 7. Médias, partage et VideoTrain

### FEAT-004 / FEAT-006 — Média unifié pour l'activité

**Décision fonctionnelle :** un point d'accès Média par activité/exercice, appuyé sur l'outil existant s'il est identifié, doit permettre de distinguer :

1. **Accompagnement pendant l'activité :** musique, playlist, audio, vidéos, films, chaînes TV et autres sources réellement accessibles avec les droits nécessaires.
2. **Médias de l'exercice :** photos, vidéos pédagogiques, conseils, démonstrations, variantes, performances publiées et VideoTrain. Distinguer contenu pédagogique et communautaire, leurs provenances et permissions.

Un accès **Partager distinct** utilise l'outil natif, avec choix explicite de l'objet, des destinataires et des champs visibles.

- [ ] Consulter et associer plusieurs photos/vidéos à chaque activité ou exercice ; distinguer exercices alternatifs travaillant un même muscle ou liés à une même activité.
- [ ] Étudier liste, tuiles ou composition modulaire à partir des composants réels, sans choix visuel figé. Examiner bouton, panneau ouvert, consultation, ajout et navigation entre exercices apparentés.
- [ ] Associer à chaque activité une playlist ou source audiovisuelle mémorisée ; proposer une reprise automatique au démarrage si choisie, et laisser choisir un autre média pendant la séance. Vérifier autorisations, disponibilité, capacités et restrictions du système/service ; aucun contournement de restrictions ou de DRM.
- [ ] Conserver l'activité pendant consultation et lecture selon les capacités réelles : lecture/pause, volume, changement de source, reprise, verrouillage, interruptions et priorité/mixage des alertes sportives.
- [ ] Auditer audio, playlists, lecteurs, TV/streaming, capture, Finder, partage, VideoTrain, communication et connecteurs existants. Identifier si un contrôle musical est déjà présent dans Sport ; distinguer spécifié, implémenté et testé.
- [ ] Partager un lien ou une référence autorisée lorsque les droits interdisent la redistribution d'un média tiers. Traiter sources indisponibles, réseau absent et flux protégés.
- [ ] Préparer au moins deux compositions fidèles aux vrais modules pour « Pendant l'activité » et « Exercice / VideoTrain », ainsi que les états lecture et partage. Vérifier mobile, tablette, ordinateur selon plateformes supportées ; validation explicite.

### FEAT-005 — Partage sportif et conversation VideoTrain

**Finalité :** pour cardio et musculation, documenter volontairement une technique, progression ou performance par photo/vidéo et mesures pertinentes ; partager avec des destinataires autorisés et discuter dans le VideoTrain existant. Aucune publication publique implicite, aucun second système de commentaires.

#### Capture, association et partage

- [ ] Depuis l'exercice, capturer ou choisir un média si les outils et permissions le permettent ; prévisualiser avec les outils natifs. Pas d'activation caméra/micro, de transmission ou de publication sans action et autorisation appropriées.
- [ ] Lier explicitement média, exercice, auteur, séance/occurrence facultative et résultat précis éventuel. Autoriser une vidéo technique sans chiffre. Les mesures sont propres à la discipline : charge, séries, répétitions et éventuellement durée/effort pour musculation ; durée, distance, allure ou vitesse pour cardio selon disponibilité.
- [ ] Distinguer mesure instrumentée, valeur saisie, calcul et déclaration. Ne jamais modifier silencieusement la séance privée en publiant.
- [ ] Par défaut privé ; visibilité explicite avant et après partage : privé, personnes/groupe autorisés ou communauté si le modèle le permet. Prévisualiser ce qui sera visible : média, auteur, exercice, mesures sélectionnées, commentaire, timecodes.
- [ ] Distinguer droits sur média, publication, résultat, fil et séance source ; accès à l'un n'implique pas accès aux autres. Exclure par défaut historique, santé, GPS, EXIF et informations personnelles ; traiter explicitement les métadonnées.
- [ ] Vérifier consultation, téléchargement, réponse, vote, repartage, retrait, suppression du média, désactivation des commentaires et révocation selon les droits existants. Contrôler les droits à la source ou au serveur pertinent, pas seulement dans l'interface.
- [ ] Définir le devenir des réponses si l'origine est retirée : état de retrait, cascade ou autre politique compatible. Une référence logique stable n'impose pas de conserver un contenu supprimé.

#### Conversation et classement

- [ ] Réutiliser les fils VideoTrain avec référence stable à l'exercice et éventuellement à la séance ; publication initiale photo, vidéo, résultat ou message. Réponses vidéo, audio ou texte reliées au parent ; réponses à une réponse et conservation du contexte.
- [ ] Permettre l'ancrage à un instant ou segment vidéo et retrouver le passage et son contexte selon permissions. Un seul modèle de conversation, pas de commentaires Sport parallèles.
- [ ] Associer identifiant et nombre de likes à chaque contribution éligible ; un vote actif maximum par votant et contribution. Étudier faux comptes, abus et modération.
- [ ] Dans la vue de démonstration, seules les réponses **vidéo admissibles et accessibles** peuvent devenir « Mieux noté ». Textes et audios restent consultables et peuvent être classés dans la discussion. Définir le périmètre du classement — fil, exercice ou variante — avant de l'implémenter ; ne pas agréger arbitrairement différents exercices.
- [ ] Recalculer après ajout/retrait d'un vote, sans changement perturbant pendant la lecture ; décider quand rafraîchir. Pour égalités, l'ancienneté puis l'identifiant sont une proposition à valider. Si la meilleure contribution devient supprimée, modérée, masquée ou inaccessible, sélectionner la suivante éligible ou afficher un état vide.
- [ ] Popularité ne signifie ni validité technique ni validation médicale. Prévoir signalement/modération des contenus dangereux ou trompeurs, sans encourager la surenchère de charge ; définir des protections si des mineurs peuvent participer.

#### Origine ⇄ Mieux noté

- [ ] Concevoir un sélecteur à deux états, nom provisoire : **Origine** = référence stable au message initial et à sa place ; **Mieux noté** = sélection dérivée parmi les réponses vidéo accessibles et admissibles. Aucune ne remplace l'autre.
- [ ] Naviguer vers la contribution en conservant arborescence, auteur, réponses et timecodes ; recalculer les permissions pour l'utilisateur courant. Prévoir état vide si aucune vidéo admissible, même sans vote.
- [ ] Étudier pause/lecture, position, changement de sélection et restauration du contexte avec les vrais lecteurs. Commande compréhensible, tactile et clavier ; tenir compte du mode Débutant seulement s'il existe. Pas de pop-up.
- [ ] Auditer les captures et composants, puis proposer plusieurs maquettes : emplacement, dimensions, états, animation éventuelle et navigation, adaptées aux plateformes réellement supportées. Si rien ne convient, proposer une brique native réutilisable, non un widget isolé Sport.

**Scénario d'acceptation prioritaire :** Sport → Musculation → Jambes → Squat ; filmer et publier volontairement une séance ; une autre personne répond par vidéo à 00:08 ; plusieurs démonstrations reçoivent des votes ; afficher la meilleure vidéo admissible ; passer Origine → Mieux noté → Origine en conservant les liens, auteurs, fil et contexte.

**Autres tests :** course + photo partagée à un seul contact ; réponses audio/texte avec bon parent ; aucune réponse, aucun vote, égalités, retrait de like, suppression/modération, changement de permission, concurrence, reclassement en cours de lecture ; un texte populaire ne remplace pas la meilleure vidéo. Tester aussi gros médias, réseau lent/hors ligne, transfert interrompu, synchronisation, confidentialité des URL/ID et accès direct. Vérifier les plateformes réellement supportées, la non-régression Sport/VideoTrain et la parité UI/MCP si MCP existe.

#### Modèle logique à confronter à l'existant

| Concept | Informations à relier, sans présumer de tables ou classes |
|---|---|
| Exercice | Identifiant, discipline, type, variantes |
| Séance / résultat | Exercice, date/occurrence, mesures et sources, propriétaire |
| Publication | Auteur, exercice, séance facultative, contenu, visibilité, date |
| Message VideoTrain | Fil, parent, auteur, type, média, date, état et permissions |
| Ancre | Média et instant/segment |
| Vote | Votant, cible, état et déduplication |
| Origine / mieux noté | Référence initiale stable / sélection calculée autorisée |

Utiliser les objets et relations réellement disponibles ; documenter toute migration et compatibilité des anciennes données. Vérifier Matrix ou tout autre service seulement s'il existe. UI et MCP éventuel doivent partager la logique métier canonique et les permissions.

## 8. Objectifs, professionnels et calendrier

### FEAT-009 — Objectifs sportifs et challenges

- [ ] Auditer le système Objectifs, préférences, profils, connexions et écrans existants, puis relier Sport au système commun suivant ARCH-001 ; ne pas créer de second gestionnaire.
- [ ] Prévoir un objectif sportif général persistant, modifiable : prise de masse, force, endurance, tonification, condition cardiovasculaire, mobilité, entretien, etc. Les catégories exactes sont à valider. Permettre un objectif de séance ou d'exercice sans écraser le général, et des challenges avec cible, progression et échéance facultative.
- [ ] Associer/dissocier activité et objectif avec l'outil natif approprié ; proposer des paramètres selon discipline et objectif sans modifier silencieusement charge, répétitions, repos, durée, allure ou séries. Clarifier priorité entre objectif général, ponctuel et séance en cours.
- [ ] Autoriser pratique sans objectif, suspension et modification. Profil facultatif : âge, poids, expérience et autres informations justifiées ; consentement, minimisation, visibilité, modification et suppression. Les données ne sont pas publiques par défaut.
- [ ] Mobilité, reprise et douleur ne constituent ni diagnostic ni traitement. Pas de programme thérapeutique automatique sans validation professionnelle ; aucune promesse de supprimer une douleur. Examiner les catégories et suggestions avec des spécialistes.
- [ ] Maquetter accès discret, objectif associé, sélection/recherche native, options, général/ponctuel, déconnexion et challenge avec les mesures existantes ; distinguer suggestion, confirmation et enregistrement. Tester sans profil ni objectif, plusieurs activités, modification pendant séance, interruption/reprise, incompatibilité et confidentialité.

### FEAT-010 — Accès aux coachs et spécialistes

- [ ] Étudier un accès discret et pertinent par discipline/objectif, par exemple coach de tennis depuis tennis ; ne pas l'imposer à chaque activité. Le « bouton N » reste non identifié : ne pas inventer son sens, son emplacement ou son icône.
- [ ] Auditer recherche, annuaire, Finder, fiches, contact, partage et géolocalisation ; réutiliser les outils disponibles. Définir recherche par discipline, spécialité, proximité volontaire et disponibilité seulement si connue.
- [ ] Distinguer coach, entraîneur diplômé et professionnel médical/paramédical ; ne jamais afficher une certification sans preuve et critères définis. Évaluer sources, fiabilité, conditions, coûts et maintenance.
- [ ] Déterminer avec Jeezs si le besoin couvre seulement la recherche, le contact et/ou la réservation. Aucune promesse de messagerie ou réservation sans mécanisme réel. FEAT-012 fournit la logique de calendrier si validée.
- [ ] Étudier confidentialité, sécurité, accessibilité et coût de ressources ; proposer des maquettes utilisant les composants réels. Tester absence de position, données obsolètes, absence de résultat et droits.

### FEAT-012 — Calendriers multiples et réservation : chantier transversal

**Décision validée :** calendrier indépendant de Sport ; la réservation d'un coach en est un cas d'usage. Ne pas créer un calendrier réservé aux coachs.

- [ ] Auditer calendriers, événements, comptes, permissions, notifications, disponibilités, partage et synchronisation ; documenter les capacités et API réelles.
- [ ] Prévoir plusieurs calendriers par compte (personnel, professionnel, sportif et autres noms choisis). Partager un calendrier ou certaines disponibilités avec droits explicites ; garder privés les détails d'événements masqués.
- [ ] Prévoir un compte atome/eVe par coach participant pour gérer plages, indisponibilités, durée, lieu/distanciel, fuseau et délais de réservation/annulation ; vérifier identité et qualifications sans certification inventée.
- [ ] Permettre au sportif de consulter les créneaux autorisés, choisir date/heure, demander ou réserver et voir confirmation, modification ou annulation selon le parcours validé. Distinguer créneau disponible, demande en attente et réservation confirmée.
- [ ] Gérer double réservation et concurrence avec confirmation atomique adaptée à l'architecture réelle, conflits entre calendriers, synchronisation multiappareil, fuseaux, changements d'heure, hors ligne et révocation. Ne pas révéler le titre d'un événement privé pour indiquer l'indisponibilité.
- [ ] Étudier rappels, synchronisation avec calendriers externes, récurrence et groupes sans les supposer existants. Lier la fiche FEAT-010 aux disponibilités sans recopier la logique dans Sport.
- [ ] Challenger valeur, coût, complexité et alternatives ; présenter des maquettes de calendriers, partage, disponibilités et réservation, fondées sur les vrais outils. Tests de concurrence, permissions, conflits et fuseaux avant livraison.

## 9. Décisions ouvertes et analyse critique

| Point | Analyse / proposition à instruire | Décision |
|---|---|---|
| Courbes de charge | Les formes complexes demandent définition mathématique, arrondi et validation ; manuel et pas fixe sont plus faciles à vérifier. | Ordre de livraison à valider, sans suppression. |
| Tempo et régularité | Une moyenne de série ne révèle pas les variations entre répétitions. | Définir si une mesure plus fine apporte assez de valeur et avec quelle source. |
| Arrière-plan | La continuité dépend des contraintes réelles de la plateforme et du type de mesure. | Décrire précisément maintien, suspension et restauration par plateforme. |
| Audio automatique | Une source mémorisée est souhaitée ; la reprise dépend des permissions et politiques des services. | Valider les comportements et solutions de repli. |
| Média pédagogique / communautaire | Un accès commun est utile ; provenance, droits et classement sont différents. | Maquetter l'organisation, sans deux systèmes. |
| Origine et mieux noté | La meilleure réponse dépend des droits et du périmètre du classement ; popularité n'est pas expertise. | Choisir périmètre, égalité et moment de rafraîchissement. |
| Objectifs et activités | Une même séance peut contribuer à plusieurs objectifs ; un agrégat ne doit pas la compter plusieurs fois par accident. | Définir les règles pour chaque indicateur et historique en cas de modification. |
| Coach et calendrier | Recherche de professionnel et réservation ont des coûts et dépendances distincts. | Préciser contact/réservation et preuves de qualification ; calendrier reste transversal. |
| Capteur, GPS, services tiers | Leur simple mention ne prouve pas qu'une connexion ou un droit d'accès existe. | Auditer capacités, consentements et solutions en cas d'indisponibilité. |
| Course et programmes cardio | Les captures illustrent des objectifs et des profils, mais ne spécifient ni algorithme ni intégration à un tapis. | Vérifier l'existant, les sources de mesures, les profils et les capacités de chaque plateforme avant conception. |
| Calories | Le résultat dépend des données et de la méthode ; une valeur personnalisée reste une estimation. | Étudier les sources et hypothèses ; masquer la valeur si elle ne peut pas être estimée de façon pertinente. |
| Source d'interface | Les captures de console ont été examinées, mais les écrans et composants réels d'atome/eVe ne l'ont pas été ici. | Produire des maquettes fidèles après audit ; aucune apparence n'est validée. |

## 10. Plan d'ensemble proposé pour l'agent

1. **État des lieux :** lire les instructions, inventorier le code et les écrans, relever les comportements réels et les écarts. Reproduire BUG-002 si possible ; confirmer le repos de 90 s et la présence des fonctions évoquées.
2. **Architecture et arbitrages :** traiter ARCH-001 et FEAT-007, puis états partagés, composants numériques et dépendances ; cartographier les modules et leurs sources de vérité. Présenter les questions et limites.
3. **Plans et maquettes :** préparer pour chaque tâche les sous-tâches et critères ; proposer plusieurs maquettes fidèles, montrant les vrais outils et leurs options. Soumettre plan et maquettes à validation explicite avant tout code.
4. **Après validation :** traiter les composants et parcours de base, puis Sport/Objectifs/Médias suivant les dépendances approuvées ; exécuter de façon continue, tester et documenter au fil de l'eau. Le calendrier reste une piste transversale indépendante à planifier séparément.
5. **Vérification :** scénarios nominaux et cas limites de chaque section, non-régression, permissions, accessibilité, plateformes et performances mesurables. Mettre à jour ce cahier et les preuves, sans déclarer un point terminé sans critères remplis.

## 11. Prompt consolidé prêt à transmettre

> Tu travailles sur atome/eVe, en JavaScript et dans l'architecture réelle du dépôt. Lis entièrement ce cahier ainsi que les instructions applicables, dont AGENTS.md. Audite Activités, Sport, Objectifs, champs numériques, états des séances, Finder, médias, VideoTrain, partage, profils, calendrier et MCP s'il existe. Ne confonds jamais un besoin spécifié avec une fonctionnalité implémentée.
>
> Fournis d'abord une cartographie avec chemins, composants, API, tests, lacunes et preuves. Analyse en priorité la factorisation Activités ↔ Objectifs et la sobriété des briques atomiques. Reproduis et instruis BUG-002 : toucher-glisser modifie la valeur sans clavier ; toucher-relâcher sans glisser ouvre le clavier. Instruis également les lignes de réglage, les séances en cours, marche, repos, charges, tempo, objectifs, médias, partage, VideoTrain, coachs et calendrier transversal. Conserve les scénarios, détails et critères du présent cahier.
>
> Pour chaque sujet, challenge valeur, alternatives, faisabilité, dépendances, confidentialité, accessibilité, sécurité, performance et maintenance ; indique ce qui est vérifié, proposé ou reste à arbitrer. Prépare un plan détaillé avec sous-tâches, tests, critères d'acceptation, dépendances et migration si nécessaire. Ne supprime ni ne reporte définitivement un besoin sans accord.
>
> Ajoute au périmètre Cardio le choix des variantes de planche, notamment latérale droite et gauche, et la compatibilité de son module avec les autres exercices. Pour les activités concernées, annonce la pause avant son début et, pendant celle-ci, indique la prochaine étape et son temps connu. Étudie un indicateur de progression globale des séries, exercices et repos, distinct de la progression locale ; la bande inférieure non modifiable est une proposition à maquetter et faire valider. Traite les durées inconnues, les changements de programme et les interruptions sans afficher une fausse précision.
>
> Instruis FEAT-014 : révision de Cardio, course extérieure ou sur tapis, objectifs de temps ou distance et programmes par intervalles/HIIT, blocs, profil en cloche et personnalisé. Réutilise les mécanismes communs à la course et au vélo, distingue intensité cardio et charge de musculation, et décris les captures fournies comme références fonctionnelles sans copier leur design. Prévois avant séance le choix et l'aperçu du programme, et pendant l'effort durée globale, phase/série, distance, allure, fréquence cardiaque et calories seulement si leur source ou estimation personnalisée est pertinente. Ne présume aucun capteur, connexion tapis, calcul de calories ou contrôle machine ; fais valider les maquettes avant tout code.
>
> Construis plusieurs maquettes fidèles aux captures, proportions et véritables composants. Les outils et leurs options natives doivent apparaître à leur place réelle. Présente notamment la saisie des charges par série, le repos, la continuité des séances, les objectifs, le Média unifié, Partager distinct et Origine ⇄ Mieux noté. N'invente ni API, ni panneau générique, ni réseau social séparé. Les variantes correspondent aux plateformes effectivement supportées.
>
> Présente audit, architecture, questions, plan et maquettes, puis attends la validation explicite du plan d'ensemble et de chaque maquette concernée avant **toute modification de code**. Après validation, réalise les étapes autorisées sans pause artificielle, teste et documente ; arrête-toi seulement si une décision, une permission ou une validation manque, ou en cas de blocage réel. Préserve le travail local ; aucun commit, push, PR ou déploiement sans instruction explicite.

## 12. Historique des décisions et traçabilité

- **21 octobre 2026 :** date de la spécification FEAT-005 communiquée dans le document source.
- **27 octobre 2026 :** intégration des exigences médias, VideoTrain, partage, charges, objectifs, calendrier, architecture et processus dans le cahier évolutif transmis.
- **27 octobre 2026 — présente révision documentaire :** réorganisation et dédoublonnage, identifiants ajoutés pour les trois besoins auparavant non identifiés, plan et challenge documentaire. Les décisions existantes et demandes à instruire sont maintenues. Le dépôt n'a pas été audité et aucun code ni maquette n'a été modifié.
- **Précision de Jeezs :** BUG-002 = champ numérique mobile, glissement pour ajuster sans clavier, toucher-relâcher pour saisie ; portée potentiellement transversale. Statut : signalé, correction à étudier dans le composant existant.
- **27 octobre 2026 — ajout :** FEAT-013 pour le filtrage des variantes de planche en Cardio ; UX-004 pour les annonces autour des pauses et l'indicateur global de progression, avec bande inférieure proposée et maquettes à valider.
- **27 octobre 2026 — ajout :** FEAT-014 pour la refonte Cardio, la course, les objectifs temps/distance, les programmes d'intervalles et le suivi ; les captures sont décrites textuellement et leur design n'est pas imposé.
- **Règle de lecture :** les mentions antérieures « réorganisation future » sont remplacées par ce document restructuré ; PROC-001 reste obligatoire pour l'audit réel, le challenge approfondi, les arbitrages et la mise à jour après validation.
- **27 octobre 2026 — audit du dépôt (PROC-001) :** cartographie, matrice, contradictions avec la charte (AGENTS.md 11–16) et plan en lots dans `todo/etude_activites_sport_objectifs_2026-10-27.md`. Cause de BUG-002 établie par sonde (le contact seul ouvre l'éditeur, `bevy_panel_numeric_field_runtime.js`). Aucun code ni maquette modifié ; arbitrages Q1–Q8 en attente.
- **28 octobre 2026 — décisions reçues** (détail dans l'étude) : Q1 toucher-relâcher ouvre le clavier ; Q2 curseur unique transverse, deux par rangée ; Q3 icône « en cours » collée à l'Atome ; Q4 jauge globale au pied de la fiche ; Q5 planche en Musculation, nouvelle zone abdos (FEAT-015) ; Q6 partage ciblé puis VideoTrain ; Q7 séance interrompue reprise ; Q8 Bien vieillir et séance récurrente comptées. Livrés Web : L1 (BUG-002), L2, Q8 a, nombres d'or. Maquettes validées : L3 « En direct », L4, L5 option C.
- **28 octobre 2026, soir — relecture complète :** le plan du 27 oct. avait sorti des exigences sans accord, dont les formes de FEAT-008. Les 18 oublis (O1–O18) sont listés et rattachés à un lot au §4 bis de l'étude ; chacun sera validé un par un avant tout code.
- **28 octobre 2026, nuit — lots livrés au Web** (sondes Playwright WebGPU sous `temp/activities_audit/`, détail dans l'étude et `eVe/documentations/FRAMEWORK_STATE.md` §5) :
  - **L3** : séance hors fiche, outil « en cours » et scène « En direct », reprise après arrêt.
  - **L4** : avant-pause annoncée, jauge globale, Auto / manuel.
  - **L5** : variantes de planche.
  - **L6** : charges par série et formes.
  - **L7** : course, marche, tapis, programmes ; « Trajet » prévu sous la trace réelle.
  - **L8** : objectifs, rattachement, accord sur les données corporelles.
  - **L9** : Record, tempo, cadence.
  - **L10** : médias d'un exercice, exercices apparentés, musique avec atténuation des bips.
  - **L11** : envoi d'une séance et fil VideoTrain ; EXIF / GPS retirés.
  - **L12** : coachs, disponibilités, réservation acceptée ou refusée, délai d'annulation.
- **28 octobre 2026, nuit — décisions prises en codant** (à confirmer par Jeezs si besoin) :
  - **Une séance à la fois par famille.** Ouvrir la fiche d'un autre exercice pendant une séance montre la séance en cours.
  - **Reprise après arrêt.** Une séance retrouvée en cours est mise en pause ; le temps d'arrêt compte dans son étape. Seules les séances de moins de 24 h sont reprises.
  - **Kilomètres d'un trajet** : arrondis au dixième, le cardio acceptant désormais les dixièmes de km.
  - **Coachs.**
    - L'événement n'entre dans les deux agendas qu'à l'acceptation.
    - Le client annule jusqu'au délai ; le coach annule jusqu'au début.
    - Valeurs par défaut : séance de 45 min, délai de 24 h.
    - Fuseau du coach = celui de son appareil.
- **28 octobre 2026, nuit — O16 et O17 :**
  - **O16** : comportement au verrouillage, en arrière-plan et à l'arrêt, plateforme par plateforme, dans `todo/seances_en_cours_par_plateforme_2026-10-28.md`. Écarts : la course écran verrouillé sur iOS ne compte plus la distance, et les bips ne sonnent pas écran verrouillé.
  - **O17** : mesures dans `todo/mesures_activites_2026-10-28.md`. Il n'y a pas de mesure « avant » pour L1–L2.
- **Questions tranchées le 29 oct.** :
  - **valeurs Perso** : en lignes, l'une sous l'autre (vue 3 de `temp/dashboard_root_above_atom/sheet_perso.png`), une ligne d'un demi-outil par rangée d'un outil, le « i » d'un outil entier ; la Durée totale aussi en ligne ; règle 14 réécrite ;
  - **« Fil »** : un outil dans le pied du niveau Médias de l'exercice (pictogramme › Médias › Fil).
- **29 oct. 2026 — l'outil « en cours » (▶), validé par Jeezs, à coder** (maquette `temp/dashboard_root_above_atom/sheet2.png`) :
  - l'outil Dashboard ne bouge jamais, il reste dans la bande ;
  - ▶ quitte la bande et se pose au-dessus de l'assistant, sur toutes les vues ;
  - sur le panneau « En direct », il est dans le pied du panneau, à droite (norme du pied de panneau du 29 oct. : ✕ à gauche, nom au centre) ;
  - grille pleine : **option A**, la grille réserve la case au-dessus de l'assistant ; les tuiles se décalent, et la dernière d'une page vraiment pleine passe à la page suivante.
- **Tranché (29 oct.)** : ▶ touché dans le pied du panneau « En direct » met en pause la séance choisie ou la relance ; il est allumé tant qu'elle tourne.
- **29 oct. — codé et vérifié au Web** (sonde `temp/activities_audit/q29/probe.mjs`) : lignes de valeurs, bulle du curseur qui ne couvre plus le nom, « Fil » dans les Médias, ▶ au-dessus de l'assistant avec case réservée, ▶ du pied « En direct ».
- **À reprendre plus tard (Jeezs, 29 oct.) — se filmer pendant la séance** :
  - aujourd'hui le seul chemin est pictogramme › Médias › Ajout › Caméra › Vidéo ;
  - souhait : une petite caméra sur la fiche, qui est l'outil de capture existant (écran, vidéo, son, photo), pas un outil nouveau ;
  - idée à challenger : une capture **combinée** qui enregistre en même temps la vidéo (ou la photo) et les performances affichées (temps, répétitions, disque), pour qu'elles soient sur la prise ;
  - à savoir avant : `ui.capture.screen` est déclaré mais n'a pas encore d'enregistreur (plan `todo/screen_recording_plan_2026-10-14.md`) ;
  - maquette d'abord (règle 16).
