# Atom Development
## Cahier des charges — normes de développement
### Ajout : modularité de création, design, comportements et interopérabilité MCP

**Révision documentaire :** `2026-09-09.modularite.01`  
**Projet :** Atome / eVe  
**Date :** 9 septembre 2026  
**Périmètre :** nouvelles fonctionnalités, modifications de fonctionnalités, plugins, refactorisations et corrections de bugs.

**Statut de cette livraison.** Ce fichier formalise l’ajout demandé au cahier des charges. Il ne remplace pas les chapitres antérieurs et ne prétend pas reproduire un document maître complet qui n’a pas été retrouvé dans les résultats consultés. Les prescriptions ci-dessous sont des exigences à appliquer ; leur présence dans ce document ne signifie pas qu’elles sont déjà implémentées ou testées. Aucun fichier du dépôt GitHub n’a été modifié dans cette livraison.

## 1. Principe directeur

**Créer par composition, modifier par configuration, étendre par un point d’extension explicite ; réécrire seulement lorsqu’une nécessité a été démontrée.**

Dès la conception d’une fonctionnalité, il doit être possible de faire évoluer son apparence, sa disposition et son comportement sans reconstruire l’ensemble de son implémentation. La modularité doit réduire le coût réel de création et de maintenance, et non multiplier les couches, les fichiers ou les abstractions.

Une capacité métier possède une implémentation de référence. L’interface utilisateur, les scénarios, les plugins et l’accès MCP utilisent cette même capacité, avec les mêmes validations et les mêmes règles d’autorisation.

## 2. MOD-01 — Réutilisation avant création

Avant toute modification, l’audit obligatoire doit identifier le propriétaire de chaque responsabilité, les composants, paramètres, contrats et chemins d’exécution déjà disponibles. Cette obligation prolonge le protocole de réutilisation existant dans `.codex/AGENTS.md` [R1].

L’ordre de préférence est : configurer l’existant ; composer les éléments existants ; étendre le propriétaire existant ; créer une nouvelle capacité uniquement si le besoin ne peut pas être satisfait proprement autrement.

Un besoin de variante ne justifie pas une copie de composant. Une extension doit conserver le comportement actuel par défaut, sauf modification explicitement prévue et validée. Une évolution nécessaire du socle reste possible : elle doit être limitée au propriétaire concerné, documentée et testée.

**Recette :** le rapport identifie ce qui a été réutilisé, modifié et supprimé, et justifie chaque nouvelle abstraction. Aucune deuxième implémentation d’une responsabilité existante n’est introduite sans décision architecturale explicite.

## 3. MOD-02 — Séparation des responsabilités

Les données et l’état, les opérations métier, la présentation et les points d’accès doivent avoir des responsabilités explicites. Cette séparation n’impose ni quatre nouveaux services ni quatre nouveaux frameworks.

Les données persistantes restent détenues par les atomes et les propriétaires canoniques. Un composant visuel ne devient pas une deuxième source de vérité. Le remplacement d’une vue ne doit pas effacer le contenu, l’historique ou les permissions.

Les comportements appellent les opérations métier ; ils ne réimplémentent pas localement la mutation de l’état. Les points d’accès exposent les opérations existantes sans créer un deuxième chemin d’exécution métier.

**Recette :** une même fonctionnalité est utilisée dans deux compositions pertinentes, puis une présentation est remplacée. Les données et le contrat métier restent inchangés, sans copie de logique.

## 4. MOD-03 — Design composable et modifiable dès la création

Le design doit être décrit par des définitions structurées et réutilisables : paramètres visuels partagés, thèmes, variantes, règles de disposition et composition de composants canoniques.

Les couleurs, espacements, tailles autorisées et états visuels ne doivent pas être recopiés dans chaque fonctionnalité. Les points de personnalisation doivent être documentés et utilisables dès la création, pas ajoutés après coup.

Le contrat existant impose un design piloté en JavaScript, des objets structurés pour les styles et les thèmes, et des composants Atome/Squirrel communs. Il interdit les composants parallèles et les sources de vérité produit HTML/CSS locales [R2]. La présente norme renforce ce contrat ; elle ne crée pas un moteur de thème concurrent.

Les variations restent dans les règles graphiques du produit : unité carrée et proportions autorisées, menus ancrés, adaptation des mêmes composants aux formats d’écran, et absence de fenêtres flottantes ajoutées par un plugin. La personnalisation ne doit pas casser l’accessibilité, les zones interactives ou les interactions tactiles.

**Recette :** créer deux variantes visuelles depuis la même définition, puis modifier un paramètre partagé. Toutes les surfaces concernées évoluent sans duplication, sans modification du code métier et sans altération des données.

## 5. MOD-04 — Comportements composables et remplaçables

Les déclencheurs, actions, conditions et enchaînements doivent être identifiables et configurables par les mécanismes existants du framework. Les variantes déclarées doivent pouvoir être sélectionnées sans réécrire le composant.

Lorsqu’une nouvelle logique nécessite du code, elle est ajoutée au propriétaire ou au point d’extension approprié. Elle ne doit pas exiger une copie de l’interface, du stockage ou de l’intégration MCP.

Une composition valide au niveau des types peut néanmoins produire un conflit métier. La validation doit donc couvrir aussi les préconditions, droits, dépendances, interactions entre actions et règles de cycle de vie. L’ordre d’exécution et les règles de résolution des conflits ne doivent pas dépendre d’effets implicites.

**Recette :** remplacer un comportement par une variante documentée, puis revenir au comportement initial. L’état est conservé, les événements ne sont pas dupliqués et les modules non concernés gardent leur comportement.

## 6. API-01 — Un contrat public unique par capacité

Chaque fonctionnalité publique doit disposer d’un contrat explicite couvrant son identité, son propriétaire, ses entrées, ses sorties, ses erreurs, ses préconditions, ses permissions, ses effets et ses versions compatibles.

Les contrats, la documentation, la validation des paramètres et l’exposition MCP doivent rester cohérents. Ils doivent être dérivés de la même définition lorsque le système existant le permet ; sinon, un contrôle automatique doit détecter leur divergence. Il est interdit d’ajouter un registre concurrent pour contourner un propriétaire existant.

Le typage des contrats ne constitue pas une obligation d’adopter TypeScript : le code applicatif reste JavaScript, avec les schémas et descriptions de types adaptés au projet.

Les opérations à effet doivent conserver le passage par le Command Bus et les contrôles canoniques de politique, capacités, audit et idempotence. Le contrat actuel prévoit également la traçabilité, l’historique et le replay [R2]. Un appel provenant de MCP ou d’un plugin n’obtient pas de privilège de contournement.

**Recette :** les accès interface, plugin et MCP produisent le même résultat métier observable, sous les mêmes autorisations. Les détails de transport peuvent différer ; les validations et les effets autorisés ne doivent pas diverger.

## 7. PLG-01 — Compatibilité et cycle de vie des modules

Chaque module ou plugin doit déclarer sa version, ses dépendances, ses points d’extension, ses capacités requises et sa compatibilité avec les versions prises en charge du framework. Ces informations rejoignent le mécanisme de déclaration existant.

Les dépendances absentes ou incompatibles doivent être détectées avant activation, avec une erreur exploitable. L’activation, la désactivation, les activations répétées et les mises à jour doivent être définies. Les écouteurs, timers et ressources possédés par un module doivent être libérés lorsque son cycle de vie l’exige.

La désactivation ne doit pas supprimer implicitement les données de l’utilisateur. Une modification incompatible d’un contrat ou d’un format de données doit être versionnée et accompagnée d’une stratégie de migration testée. Aucun mécanisme de compatibilité ne doit être conservé indéfiniment sans consommateur identifié.

Les permissions doivent être effectivement appliquées à la frontière d’exécution. Un manifeste déclaratif, seul, ne prouve pas l’isolation d’un plugin. Du code non fiable ne doit pas être exécuté avec un accès illimité au runtime de confiance.

**Recette :** activer, désactiver et réactiver le module ; vérifier l’absence de doubles appels, de ressources abandonnées et de perte de données. Tester une dépendance manquante et une version incompatible.

## 8. MCP-01 — Exposition systématique, contrôlée et testée

Toutes les fonctionnalités publiques destinées au pilotage doivent avoir une représentation MCP documentée et testable, y compris les actions autorisées de création et de modification du design et des comportements.

Cette exigence ne signifie pas exposer chaque fonction interne comme un outil distant. Les helpers, opérations de rendu par image et traitements audio temps réel restent à leur niveau d’exécution ; les opérations de contrôle pertinentes sont exposées. Aucun outil générique d’exécution arbitraire de code ne doit servir de raccourci à la définition des contrats.

Pour les outils MCP, la spécification définit notamment `tools/list`, `tools/call`, un schéma d’entrée et la possibilité d’un schéma de sortie. Lorsqu’un schéma de sortie est fourni, le résultat structuré doit s’y conformer [R3]. Atom Development exige la définition et la validation des résultats structurés des opérations qui en produisent.

Les tests doivent vérifier la découverte des opérations autorisées, un appel valide, un appel invalide, un refus de permission, une erreur métier et l’absence d’effet interdit après un refus. Les opérations nécessitant un consentement doivent respecter le contrôle de l’utilisateur ; le protocole ne remplace pas l’application des contrôles de sécurité [R4].

**Recette :** un scénario doit passer par une véritable connexion client–serveur MCP. Appeler directement la fonction JavaScript ne suffit pas à établir cette compatibilité.

## 9. MCP-02 — Portée exacte de la compatibilité

La formulation normative est **« conforme et testé avec les versions, capacités, transports et hôtes déclarés »**, et non « accepté automatiquement par tous les hôtes MCP ».

Le rapport de compatibilité doit indiquer la version du protocole, les versions des implémentations, les capacités requises, les transports et les clients testés. Au 9 septembre 2026, l’adresse officielle de spécification `latest` consultée renvoie à `2026-07-28` [R4]. Cette observation ne démontre pas que le runtime Atome prend déjà cette version en charge et n’impose aucune migration automatique. La politique de versionnement du protocole doit être prise en compte [R5].

Une version ou une capacité non prise en charge doit produire un échec explicite. Une mise à jour du protocole, d’une dépendance, d’un module ou d’un hôte impose une nouvelle campagne sur le périmètre affecté.

Le contrat du dépôt réserve les communications applicatives canoniques aux WebSockets [R2]. Une frontière MCP doit respecter ce contrat et ne pas créer un deuxième transport métier. Le transport externe et sa compatibilité réelle doivent être documentés ; une éventuelle contradiction avec les règles du dépôt doit être traitée explicitement, jamais contournée silencieusement.

**Recette :** aucun statut de compatibilité n’est attribué à une combinaison non exécutée. Une exception de sécurité à l’exposition doit être nommée, motivée et validée ; une absence d’intégration ne doit pas être présentée comme une exclusion volontaire.

## 10. VAL-01 — Validation obligatoire, locale puis globale

Chaque changement, y compris une correction de bug, doit être relié à un scénario de spécification et à ses critères de recette. La campagne couvre les contrats, le comportement, l’interface, l’expérience utilisateur, les permissions, les dépendances et les régressions pertinentes.

La validation commence par les scénarios locaux et les contrôles ciblés, puis comprend la suite globale obligatoire. Le périmètre exécuté et le périmètre non exécuté sont explicités. Pour les plateformes revendiquées, les validations doivent utiliser les chemins réels Web, Tauri et iOS selon les règles du projet.

Le statut doit distinguer : exigence rédigée, implémentation réalisée, validation automatisée réussie, validation en environnement réel réussie, puis validation finale utilisateur. Un test ignoré, non exécuté ou seulement simulé ne vaut pas validation.

### Scénarios de recette de cet ajout

| Identifiant | Scénario | Condition de réussite |
|---|---|---|
| MOD-S01 | Deux compositions réutilisent une capacité | Une seule implémentation métier ; aucun composant dupliqué. |
| MOD-S02 | Changement de thème ou de variante | Code métier inchangé ; mêmes données et permissions. |
| MOD-S03 | Remplacement d’un comportement | Contrat préservé ; aucun effet sur les modules non concernés. |
| MOD-S04 | Modification d’un paramètre partagé | Toutes les surfaces concernées restent cohérentes. |
| MOD-S05 | Désactivation puis réactivation | Pas de double événement, de fuite identifiée ou de perte de données. |
| MOD-S06 | Dépendance ou version incompatible | Refus explicite avant effets métier. |
| MCP-S01 | Découverte et exécution via MCP réel | Opération exposée conformément aux droits ; résultat attendu. |
| MCP-S02 | Entrée invalide ou permission refusée | Erreur exploitable ; aucun effet non autorisé. |
| MCP-S03 | Même action par UI, plugin et MCP | Résultats métier et règles d’autorisation cohérents. |
| REG-S01 | Réouverture, historique, partage et collaboration | Invariants et scénarios de non-régression respectés. |
| PERF-S01 | Benchmarks avant/après | Budgets fixés avant mesure respectés sur les appareils déclarés. |

## 11. PERF-01 — La modularité ne dispense pas de performances

Les benchmarks restent obligatoires pour chaque nouvelle fonctionnalité et chaque correction affectant un chemin d’exécution. Le coût des variantes, de l’activation des modules et de la frontière MCP doit être mesuré, sans masquer le coût du framework sous un coût réseau global.

Les mesures doivent séparer le retour visuel, l’interface réellement utilisable et le chargement complet ; le démarrage à froid et à chaud ; l’exécution locale et l’aller-retour distant. Le rapport indique appareil, version, jeu de données, état de cache, protocole de répétition, médiane et percentile 95.

La valeur de 500 ms évoquée pour l’ouverture de projets, outils ou panneaux reste une hypothèse de budget à qualifier par type d’action et appareil. Ce document ne la transforme pas en seuil universel ni en résultat déjà obtenu. Les seuils numériques et la marge de régression doivent être fixés avant la campagne ; une fonctionnalité ne peut être déclarée conforme aux performances avec un budget non défini.

Un dépassement bloque la conformité de la fonctionnalité jusqu’à correction ou arbitrage explicite et tracé. Il ne doit pas être dissimulé derrière une moyenne, un appareil plus puissant ou un jeu de données réduit après mesure.

## 12. DOC-01 — Répercussion dans les documents de référence

Ces normes doivent être reliées au point d’entrée `.codex/AGENTS.md` et à ses modules concernés lors de leur intégration au dépôt. Les cartes d’API, de design et d’architecture doivent refléter les propriétaires et points d’extension effectivement modifiés.

Les trois documentations demandées restent complémentaires : le document IA de développement décrit spécifications, scénarios et validation ; le document IA de plugins précise les contrats et l’intégration MCP ; le guide utilisateur unique explique la création, la personnalisation et l’usage des plugins, sans recopier une norme technique divergente.

Les exemples utilisateur doivent montrer une création par composition, une modification visuelle, un changement de comportement et une extension par plugin. Ils doivent distinguer clairement la configuration disponible et le code réellement nécessaire.

## 13. Règle de livraison

**Une fonctionnalité ne peut pas être déclarée conforme à Atom Development sur la seule base de son fonctionnement isolé. Elle doit également démontrer sa réutilisation, sa personnalisation, sa compatibilité, sa sécurité, son interopérabilité MCP applicable, ses performances et son absence de régression dans le périmètre déclaré, avant validation finale utilisateur.**

### État de la présente livraison

Exigences formalisées : oui. Règles existantes consultées : oui, dans les deux références de dépôt ci-dessous. Audit exhaustif du runtime : non. Code ou dépôt modifié : non. Tests, benchmarks et validation MCP exécutés : non. Validation finale utilisateur de cette rédaction : non encore recueillie.

## Références consultées

Les références du dépôt documentent les règles existantes ; elles ne constituent pas une preuve de réussite de tous les tests du runtime. Les nouvelles obligations de recette de ce document sont des prescriptions de projet, pas une certification délivrée par MCP.

**[R1]** Atome/eVe, `.codex/AGENTS.md`, révision Git consultée `c4276e3b9b1d10f886292e2ad154cc617a979943` : protocole de réutilisation, propriétaires canoniques et maintien documentaire.  
`https://github.com/atomecorp/a/blob/c4276e3b9b1d10f886292e2ad154cc617a979943/.codex/AGENTS.md`

**[R2]** Atome/eVe, `.codex/modules/05-api-rendering-and-ui.md`, même révision : API, MCP, Command Bus, composants, design JavaScript et communications.  
`https://github.com/atomecorp/a/blob/c4276e3b9b1d10f886292e2ad154cc617a979943/.codex/modules/05-api-rendering-and-ui.md`

**[R3]** Model Context Protocol, Tools, spécification `2026-07-28`, consultée le 9 septembre 2026.  
`https://modelcontextprotocol.io/specification/2026-07-28/server/tools`

**[R4]** Model Context Protocol, Specification, page officielle `latest` consultée le 9 septembre 2026 et renvoyant vers `2026-07-28` ; principes de sécurité et de contrôle utilisateur.  
`https://modelcontextprotocol.io/specification/latest`

**[R5]** Model Context Protocol, Versioning, documentation `2026-07-28`, consultée le 9 septembre 2026.  
`https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning`
