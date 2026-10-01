# Prompt Codex — Templates, Interactivité et Dashboard d’atome/eVe

**Version :** 30 septembre 2026.  
**Nature :** cahier des charges fonctionnel consolidé, consignes d’exécution et plan de tests.  
**Destination documentaire prévue :** `/atome/Roadmap/Templates and Activities/Codex_Templates_Interactivite_Dashboard.md`.  
**Sources consolidées :** `01 - Template.md` et `interactivity.md`, complétés par les décisions explicites de l’utilisateur et sa capture du Dashboard.  
**Statut :** les règles fonctionnelles ci-dessous sont la référence de cette mission. L’existence des composants, leur contrat technique et la faisabilité dans le dépôt doivent encore être vérifiés. Ce document n’atteste ni une implémentation existante ni des tests déjà réussis.

---

## 0. Mission et ordre de priorité

Tu travailles sur le dépôt local d’**atome/eVe** fourni par l’utilisateur. Lis ce document intégralement avant toute modification.

Ta mission est de réaliser, avec l’architecture existante, le système de templates et d’interactivité décrit ici, puis de construire et tester toi-même les cinq projets-exemples de référence :

| Référence | Projet-exemple à conserver | Ce qu’il démontre |
|---|---|---|
| S1 | Redimensionnement conditionnel | Sélection dynamique, critères logiques et exécution d’un véritable outil. |
| S2 | Liste et fiches issues de templates liés | Projets imbriqués, correspondances de données, choix de template et identités stables. |
| S3 | Page dynamique multi-sources | Composition d’atomes sources et liaisons configurées avec Interaction. |
| S4 | Commande d’une timeline existante | Commandes natives et synchronisation bidirectionnelle d’un slider. |
| S5 | Dashboard système complet | Reproduction du Dashboard réel par composition, rails, leaders et mises à jour dynamiques. |

**Instruction prioritaire : arrête-toi au premier échec inattendu ou prérequis manquant.** Un atome, outil, contrat, accès, référence visuelle ou moyen de test indispensable absent est un blocage, pas une invitation à l’inventer. Ne poursuis pas les modifications pour contourner le problème. Produis le rapport de blocage décrit en section 11, puis attends la réponse de l’utilisateur.

Il faut distinguer deux choses :

- **La cible produit :** une capacité nécessaire qui n’existe pas devra, après autorisation, devenir un atome ou un outil réutilisable, et non une fonction privée du Dashboard ou d’un scénario.
- **Ton autorisation immédiate :** tu ne crées pas silencieusement cette capacité manquante. Tu identifies le manque, proposes le lot nécessaire et t’arrêtes. Une autorisation ultérieure peut ouvrir ce lot, avec ses propres tests.

La création des projets-exemples, de leurs compositions, des fichiers de tests et des jeux de données de test fait partie de la mission. Elle ne dispense jamais de disposer des véritables composants et capacités qu’ils doivent utiliser.

### 0.1 Restrictions de travail

Travaille localement. Aucun commit, push, publication, déploiement, remplacement d’une version distribuée ou mise à jour forcée de vrais utilisateurs. Ne modifie pas les sous-modules, remotes ou branches pour faciliter la tâche. Ne fais aucun reset destructeur, nettoyage global ou restauration des modifications préexistantes de l’utilisateur.

Le code applicatif doit suivre le JavaScript et l’architecture du dépôt. N’introduis pas TypeScript, un nouveau framework, un nouveau moteur d’interactions, un second solver, une bibliothèque d’interface ou une nouvelle dépendance sans autorisation explicite. Réutilise les parties Rust, natives ou autres déjà présentes lorsqu’elles portent la capacité concernée.

N’invente pas de nom d’API, d’événement, de champ ou de composant. Les noms fonctionnels de ce document ne sont pas des identifiants techniques garantis.

Ne remplace pas une capacité manquante par une icône décorative, un bouton sans action, une maquette statique ou un faux service. Les substituts de test ne doivent jamais servir à prétendre qu’un composant produit existe.

Les tests utilisent un espace isolé, des comptes et ressources de test. Aucun message envoyé à une vraie personne, partage réel, suppression de média original, accès à des données de santé personnelles ou activation de capteur sans autorisation adaptée. Ne stocke pas de secret dans les exemples ou les traces.

### 0.2 Questions et autonomie

Avant de poser une question, cherche la réponse dans ce document, dans les règles générales du projet, dans les outils natifs et dans le code existant. Ne redemande pas ce qui est déjà décidé : emplacement défini par le template, comportement choisi avec Interaction, droits fournis par Communication/partage, import existant, etc.

Un exemple de test peut fixer des valeurs et une interaction particulière sans en faire une règle universelle du produit. Tu peux ainsi construire une démonstration « cliquer pour afficher la fiche » : cela ne signifie pas que toutes les listes d’atome ont ce comportement.

S’il subsiste une décision fonctionnelle réellement non couverte et nécessaire, pose **une seule question à la fois**, avec un exemple concret, le contexte et la conséquence des options. N’affirme pas que le cahier des charges est entièrement implémentable tant qu’un tel blocage subsiste.

---

## 1. Audit de cohérence et arbitrages de consolidation

Cette section conserve les points délicats repérés pendant la consolidation. Elle évite de réintroduire les ambiguïtés des documents séparés.

| Point | Lecture retenue pour la réalisation |
|---|---|
| « Structure réutilisable » ou « projet » | Un template est toujours un projet atome ordinaire identifié comme template. Les usages audio, vidéo, liste ou Dashboard ne créent pas de formats parallèles. |
| Mode enregistré à la fermeture ou mode imposé par le parent | Un projet ouvert de façon autonome retrouve son mode de fermeture. Une instance embarquée utilise le mode de travail effectif du parent. Le mode enregistré du template source ne lui donne pas un mode autonome dans ce contexte. |
| Interactivité « jamais en Édition » | C’est l’exécution des interactions d’utilisation qui est désactivée en Édition, pas la possibilité de les configurer. Passer en Édition ne supprime pas les données. |
| Droits « reportés » ou droits portés par l’objet | Les permissions existantes de Communication/partage s’appliquent dès maintenant. Seul un verrouillage supplémentaire par profil reste une évolution éventuelle. Aucun report ne justifie un contournement des droits existants. |
| Finder et outil Interaction | L’accès de référence à Interaction se fait depuis la barre latérale. Cela ne justifie pas d’interdire sa recherche si le catalogue général des outils l’expose. Dans le panneau, le Finder sert à rechercher des objets **et** des outils. |
| Toute fonctionnalité est-elle un outil ? | Une donnée, source ou représentation peut être un atome. Une capacité d’action est portée par un outil. Les deux sont de vrais composants réutilisés, non des copies d’interface propres à Interaction. |
| Un seul template enfant ou plusieurs | Le cas musical simple peut utiliser un même template pour toutes les fiches. Le système doit aussi autoriser plusieurs templates, avec priorité manuelle > règle dynamique > template par défaut. |
| Mise à jour de la structure ou destruction des données | Les données d’instance sont conservées tant que leur placeholder existe. Renommer ou déplacer ne casse pas la liaison. Supprimer un placeholder retire son contenu et sa liaison dans l’instance, pas une ressource originale indépendante. |
| Suppression d’un objet ou changement de filtre | Ne confonds pas disparition temporaire d’un résultat de recherche, retrait d’une collection et suppression réelle d’un objet. Réutilise leur sémantique existante ; si elle est indéfinie pour le cas requis, arrête-toi. |
| « Créer les composants manquants » ou « s’arrêter » | La dernière consigne impose l’arrêt et le signalement avant toute création de dépendance manquante. La forme réutilisable reste obligatoire pour un futur lot autorisé. |
| Fonctionnel complet ou code prêt | La vision et les règles sont suffisamment définies pour préparer les tâches et les tests. Le raccordement au code, les références exactes et certains comportements de bord restent des vérifications bloquantes, pas des faits acquis. |

La mention isolée de « mode Jeu » dans l’ancien brouillon ne définit pas un quatrième mode de travail. Ce document utilise les trois modes établis ci-dessous ; ne crée pas de nouveau mode à partir d’un ancien libellé.

Les quatre scénarios autres que S1 ne doivent plus rester de simples intentions : les sections 7 à 9 donnent désormais les parcours, jeux de test et résultats attendus à transformer en tests exécutables. Un contrat technique non vérifié reste explicitement bloquant.

---

## 2. Modèle fonctionnel commun

### 2.1 Projet, template et instance

**R01 — Identité du modèle.** Un template est un projet atome normal, marqué par le type, tag ou statut template compatible avec le modèle de données existant. Il peut contenir des atomes, des molécules, des placeholders, des réglages, des conditions et des interactions préparées. Aucun moteur de projet parallèle.

**R02 — Réutilisation.** Un projet créé à partir d’un template reste un projet atome. Les possibilités de modification dépendent de ses droits. Le statut template n’autorise pas une modification autrement interdite.

**R03 — Bibliothèque.** Le système doit permettre de choisir un template à la création d’un projet, de le prévisualiser, de le dupliquer ou modifier lorsque les droits le permettent, de transformer un projet existant en template et de conserver des templates personnels ainsi que des templates système. La bibliothèque doit pouvoir évoluer sans casser les projets existants.

**R04 — Pas de spécialisation cachée.** News, publications, texte, document, audio, vidéo, pages et compositions sont des usages de projets-templates. S2 n’est pas une fonction réservée à l’audio. S5 n’autorise pas un moteur privé de Dashboard.

### 2.2 Modes de travail, vues et contexte

**R05 — Trois modes de travail.** Réutilise Édition, Consultation et Performance. Les termes « consume » et « consommation » employés dans la discussion désignent ici le mode d’utilisation appelé Consultation dans les documents. Vérifie les identifiants et libellés réels sans créer un mode supplémentaire ni renommer une API arbitrairement.

**R06 — Mode de prochaine ouverture.** Pour un projet ouvert de façon autonome, le mode actif à sa fermeture devient automatiquement le mode de sa prochaine ouverture. Cela vaut aussi pour un template. Aucun réglage dédié, aucune validation spéciale, aucun choix de « mode par défaut » dans un nouveau panneau. Le partage conserve le mode déjà enregistré avec le projet.

Ne remplace pas « fermeture » par une politique différente fondée sur chaque sauvegarde ou sur une validation séparée. Le traitement technique de la fermeture, de la persistance et des interruptions doit être raccordé au cycle de vie existant. Une fermeture anormale ne doit pas être prétendument couverte sans test.

**R07 — Vues indépendantes.** Naturel, Liste et Matrice sont des vues, pas des modes de travail. Leur choix n’autorise ni n’interdit à lui seul une action.

**R08 — Projet imbriqué.** Un projet peut embarquer une instance liée d’un projet-template enfant. Dans cet usage, le mode de travail effectif de l’enfant est celui du parent ; sa vue peut rester indépendante si la composition le prévoit. L’héritage s’applique également lorsque le parent change de mode.

Le mode enregistré dans le template source ne doit pas rétablir un mode indépendant dans l’enfant. La fermeture d’un parent ne constitue pas une autorisation de modifier le template source partagé ni ses paramètres d’ouverture autonome. Vérifie que le modèle distingue bien l’état de l’instance et celui de sa source ; sinon, signale le conflit avant de coder.

**R09 — Contexte et maîtrise.** Réutilise le profil et le niveau de maîtrise existants pour la sélection des templates système et le contexte droitier/gaucher pour les placements concernés. N’ajoute pas de nomenclature parallèle « basique/débutant/confirmé/expert » si le système possède déjà ses niveaux canoniques.

### 2.3 Liens, données et permissions

**R10 — Instance liée.** Un template embarqué n’est pas une copie détachée. Son instance conserve la référence de sa source et reçoit automatiquement ses évolutions structurelles. L’imbrication projet-dans-projet doit utiliser le modèle existant ; si cette capacité manque, appliquer l’arrêt prévu en section 11.

**R11 — Droits.** Communication, et sa fonction de partage, restent la référence pour les droits portés par l’objet : lecture, modification autorisée, création de copie, modification dynamique et possibilité de modifier ces droits. Interaction, les templates et le solver doivent respecter ces règles, sans moteur d’autorisations concurrent.

Une liaison dynamique suit la source conformément à son contrat. Une copie suit la sémantique de copie existante. Ne présume pas que des droits d’édition accordent automatiquement le droit de modifier la source, ni que l’héritage du mode du parent donne des droits supplémentaires.

**R12 — Données propres à l’instance.** La structure du template et les valeurs propres à chaque instance sont distinctes. Un passage en Édition ne détruit pas les valeurs déjà saisies. Une mise à jour structurelle ne propage pas les données personnelles d’une instance dans les autres.

**R13 — Identité des placeholders.** Un déplacement ou renommage conserve la donnée associée au même placeholder. Une correspondance ne doit pas dépendre de son libellé affiché, de ses coordonnées ou de sa position dans une liste.

**R14 — Suppression.** La suppression effective d’un placeholder dans la source se propage à l’instance : ce placeholder, son contenu dans l’instance et sa liaison disparaissent. Le média ou l’objet original indépendant référencé ne doit pas être détruit. Aucun nettoyage global de la bibliothèque n’est autorisé par cette opération.

Pour une liste et ses fiches, applique les opérations et droits existants. Ne crée pas une règle de suppression propre à l’audio. Vérifie la différence entre supprimer une occurrence, retirer un élément d’une source et détruire l’objet lui-même.

**R15 — Identités des objets.** Une fiche reste associée à l’identité stable de son objet atome source, pas à son nom, à l’index de la ligne ou au seul chemin du fichier externe. Un renommage ou un tri ne crée pas une nouvelle fiche. La reconnaissance d’un fichier externe modifié relève du système d’import existant ; ne suppose pas qu’un import de dossier est un abonnement de surveillance.

**R16 — Liaisons explicites.** L’auteur établit les correspondances de données avec Interaction. N’invente pas de correspondance automatique par nom ou type entre champs et placeholders. Les critères de choix d’un template et les correspondances de ses données sont deux configurations distinctes.

### 2.4 Templates système et Dashboard

**R17 — Projet d’accueil.** Chaque utilisateur dispose d’un projet d’accueil auquel il peut revenir. Le Dashboard est ce projet, préparé à partir d’un template système et restant lié à celui-ci. Il n’est pas une catégorie d’architecture séparée.

**R18 — Sélection selon la maîtrise.** Au premier lancement, ou dans les autres contextes prévus par le produit, une sélection de templates système peut préparer l’expérience adaptée au niveau de maîtrise. Réutilise le mécanisme existant. La politique exacte de remplacement du template d’accueil lors d’un changement de maîtrise n’a pas été fixée ici : si elle est indispensable et absente du code de référence, demande une décision.

**R19 — Mises à jour du Dashboard.** Les modifications structurelles du template système Dashboard s’appliquent automatiquement, sans préavis requis, sans confirmation et sans possibilité de refus ou de conservation volontaire de l’ancienne structure. Elles respectent R12 à R14 pour les données.

Cette règle concerne ici la propagation du template système. Elle ne définit pas à elle seule l’installation d’un binaire, une politique d’App Store, les permissions d’un système d’exploitation ou le transport des mises à jour. Ne crée aucun contournement de ces mécanismes. Les tests de propagation restent isolés, sans toucher aux vrais utilisateurs.

---

## 3. Atomes, outils, Interaction et solver

### 3.1 Composants réels, aucune duplication

**R20 — Nature des composants.** Une source ou un contenu comme Météo, Contacts, Calendrier, Liste, Audio ou Vidéo peut être représenté par un atome. Un outil porte une capacité d’action sur les atomes : créer, redimensionner, relier, filtrer, etc. La terminologie n’impose pas de reclassifier le code existant ; elle interdit surtout de remplacer une source réelle par une commande fictive.

**R21 — Capacités réutilisables.** Toute capacité fonctionnelle réutilisable demandée par une interaction doit être exposée par un outil atome réel approprié. Ne code pas une version spéciale « création de fiche audio », « filtrage Dashboard » ou « import Interaction » dans un panneau si le système possède déjà la capacité générique.

**R22 — Recherche.** Les objets et outils concernés doivent être recherchables et sélectionnables dans le Finder, y compris lorsqu’ils n’apparaissent pas dans l’arborescence ou la barre par défaut, sous réserve des permissions existantes.

**R23 — Représentation native.** Dans Interaction, affiche le vrai composant de l’atome ou de l’outil avec son style et sa fonction. Pour les outils dont la représentation native est la tuile carrée décrite dans les références, conserve l’icône au-dessus, le libellé dessous et les options natives directement en dessous ou dans leur emplacement habituel. N’applique pas arbitrairement cette taille à tous les atomes : la Météo du Dashboard est notamment plus large que l’horloge dans la capture.

Le composant, le style, la logique et les connexions API/MCP sont partagés avec leurs usages ordinaires. Une apparence recopiée en CSS et une action réimplémentée ne constituent pas une réutilisation.

### 3.2 Portée et panneau d’Interaction

**R24 — Portée générale.** Interaction sert aux projets ordinaires comme aux projets-templates, avec une portée projet ou atome selon la sélection. Cela ne signifie pas qu’un panneau doit être injecté et toujours visible dans chaque projet. L’accès et la visibilité suivent l’activité, le contexte, la maîtrise et les droits existants.

L’activité Interactivité est le contexte de travail. L’outil Interaction permet d’y construire les relations. Le template est le projet qui conserve la composition et la configuration obtenues. Ne confonds pas ces trois niveaux.

**R25 — Modèle.** Une interaction exprime un déclencheur, une entrée/cible et une ou plusieurs capacités d’action. L’entrée peut venir de la sélection active ou du Finder. La cible est fixe, avec références conservées, ou dynamique, avec critères réévalués selon l’événement configuré.

Les conditions doivent préserver leurs groupes logiques. `(largeur > 30 OU hauteur > 30) ET type ≠ Vidéo` n’est pas équivalent à une autre association implicite des opérateurs.

**R26 — Composition du panneau.** Réutilise le panneau latéral et ses composants. Il doit permettre de sélectionner le déclencheur et sa source, choisir l’entrée, composer les critères, rechercher et ajouter des outils, afficher leurs options natives et ordonner les traitements. Plusieurs outils peuvent être ajoutés en cascade ; l’ordre enregistré détermine l’ordre des traitements.

Aucun panneau de réglages parallèle, aucune palette flottante ni nouvelle fenêtre générique. N’ajoute pas de texte explicatif permanent, de cartes de gestion ou de formulaires indépendants sans nécessité fonctionnelle et sans référence au système existant.

### 3.3 Configuration, exécution et résolution

**R27 — Configuration versus utilisation.** L’auteur configure la structure et les interactions en Édition. Les interactions d’utilisation s’exécutent en Consultation ou Performance conformément aux droits. Les outils ordinaires d’édition restent utilisables. Le retour à l’Édition reprend le mécanisme prévu dans le projet, décrit dans les sources comme un clic long sur le projet puis l’action correspondante du menu contextuel ; vérifie son véritable raccordement.

La synchronisation d’un template, l’édition d’une configuration et l’exécution d’une action utilisateur ne doivent pas être confondues. Vérifie leur traitement dans le cycle de vie existant avant de modifier un garde de mode. Si le code ne permet pas de respecter simultanément l’édition et les règles de liaison validées, arrête-toi et décris le conflit.

**R28 — Réutilisation du solver.** L’utilisateur a précisé que template, solver et interactivité sont reliés. Repère le solver ou le mécanisme de résolution réellement présent, ses entrées, ses règles, ses sorties et son contrôle des droits. Ne lui attribue pas de nouvelles capacités sur la seule base de son nom, et ne construis pas un second solver privé.

La répartition technique exacte entre le projet-template qui conserve la configuration, Interaction qui la compose et le moteur existant qui la résout/exécute doit être documentée après lecture du code. Une contradiction avec ces règles est un blocage, pas une permission de remodeler le produit.

**R29 — Présentation et comportements configurables.** La position des objets, les placeholders et les comportements appartiennent à la composition du template et à ses interactions. Le système de liste n’impose ni clic, ni fiche à droite, ni remplacement d’écran. Les scénarios choisissent explicitement un exemple reproductible sans rendre ce choix obligatoire ailleurs.

**R30 — Import et connexions.** Réutilise les mécanismes d’import, les sources, les connecteurs et les contrats API/MCP disponibles. L’ajout unitaire et l’import d’une liste ou d’un dossier alimentent les objets exploités par Interaction. Aucun importateur, moteur de News, gestionnaire de Contacts ou service de monitoring parallèle.

---

## 4. Étape obligatoire avant écriture : audit du dépôt et contrat d’implémentation

### T0 — État initial, accès et références

Commence en lecture seule. Identifie le dépôt local, sa révision de départ, ses éventuels sous-modules et son état de travail. Conserve l’inventaire des fichiers déjà modifiés par l’utilisateur. Ne déduis pas le dossier local d’un ancien nom de machine ou d’un chemin cité dans une conversation.

Lis les consignes applicables du dépôt, notamment les fichiers d’instructions et la documentation réellement présents. Ne suppose pas un chemin `AGENTS.md`, `Agent.md`, `.codex/…` ou un dossier de tests sans le vérifier.

Repère les commandes de compilation, de test et de lancement déclarées par le projet ; ne les invente pas. Vérifie les permissions d’écriture et la possibilité d’observer l’interface. Un environnement limité aux tests unitaires ne suffit pas à certifier une reproduction visuelle.

La capture du Dashboard fournie par l’utilisateur est :

`34FCEC0B-4B79-4D17-80FA-26565A350737.jpeg`

Elle accompagne ce prompt lorsqu’il est transmis dans l’archive de livraison. Retrouve ce fichier parmi les pièces jointes ou dans l’emplacement réellement fourni. Ne suppose pas qu’un chemin `/mnt/data` existe sur la machine de l’utilisateur. Si la capture ou les styles source indispensables manquent, arrête-toi avant toute reconstruction visuelle de S5 ; ne produis pas un Dashboard générique.

### T1 — Inventaire des capacités et des contrats

Construis une table de correspondance avant de coder. Pour chaque ligne ci-dessous, fournis le vrai chemin, les symboles utiles, l’enregistrement dans le catalogue ou le graphe, les événements/champs pertinents, le composant visuel réutilisé et les tests déjà disponibles.

| Famille à vérifier | Ce qu’il faut établir |
|---|---|
| Projet et template | Modèle commun, identification du template, instanciation, duplication, sauvegarde, ouverture et partage. |
| Projets imbriqués | Référence enfant-source, état d’instance, modes hérités et vue indépendante. |
| Identités et placeholders | Identités stables, conservation des valeurs, renommage, déplacement et suppression. |
| Interaction et solver | Panneau, sélection active, déclencheurs, conditions, cibles, cascade, résolution et cycle de vie. |
| Finder et catalogue | Recherche des atomes et outils ; visibilité des outils hors barre principale. |
| Permissions | Communication/partage, modification, copie, liaison dynamique et droit de modifier les droits. |
| Import et listes | Ajout unitaire, import global, identité d’objets, classement et changement de collection. |
| Redimensionnement | Axes X/Y, valeurs, contrôle natif, proportions et unités. |
| Sources de page | Date/Heure, Météo, Contacts, Calendrier, Liste et leurs connexions réelles. |
| Timeline et contrôles | Lecture, Pause, Stop, position, plage, slider, événements et autorisations. |
| Dashboard | Rails, leaders, éléments fixes, affichage central, actions Nouveau, News et Moniteur. |
| Profil et contexte | Compte actif, maîtrise, droitier/gaucher, adaptations de géométrie. |
| Distribution des templates système | Référence de version, propagation des modifications et conservation des données. |
| Tests et validation | Outil de validation existant, tests unitaires/intégration/UI, captures, commandes et preuves. |

Utilise les statuts **EXISTANT**, **PARTIEL**, **ABSENT** ou **NON VÉRIFIABLE**. Un fichier portant un nom plausible ne suffit pas pour conclure EXISTANT : vérifie l’export, l’enregistrement, le chemin d’exécution et le contrat utile au scénario.

Une recherche sans résultat ne prouve pas ABSENT. Vérifie les registres, fabriques, usages et variantes de nom avant de conclure. À l’inverse, une affirmation ancienne dans un document ne prouve pas l’existence dans la révision courante.

### T2 — Plan, prérequis et tests de départ

Relie chaque règle R01–R30 et chaque scénario S1–S5 aux éléments de cet inventaire. Avant d’écrire du code, décris brièvement quels composants réels seront assemblés, comment ils seront sélectionnés et où leurs options natives apparaîtront. Les détails de cette structure doivent découler des références, pas d’un modèle d’application de gestion.

Exécute la compilation et les tests de départ pertinents, dans un environnement isolé. En cas d’échec préexistant, arrête-toi, précise qu’il précède ton travail et ne le corrige pas sans autorisation.

**Passage à la réalisation autorisé seulement si :** les références requises sont présentes, les contrats indispensables sont établis, les tests de départ passent, les droits sont suffisants et aucun manque bloquant n’a été trouvé. Si la capacité centrale de template ou d’imbrication n’existe pas encore, fournis le lot proposé et attends son autorisation ; ne simule pas son existence pour continuer.

Les ajustements du raccordement demandés par cette mission peuvent alors être effectués dans les composants existants. Toute découverte ultérieure d’une capacité manquante réactive immédiatement la règle d’arrêt.

---

## 5. Réalisation par lots et preuves attendues

### T3 — Socle et panneau

Raccorde les projets-templates au modèle commun, aux modes et aux droits, puis assemble le panneau Interaction avec les composants natifs identifiés. Conserve la configuration avec le projet selon le stockage existant. N’ajoute pas un fichier JSON ou un schéma concurrent parce qu’un ancien brouillon évoquait un export : si le stockage fait défaut, cela doit apparaître dans l’inventaire.

Vérifie la recherche des composants, la sélection fixe et dynamique, les groupes de conditions, l’ajout de plusieurs outils et la restitution de leurs options. Documente l’absence de duplication et les points de raccordement au solver.

### T4 — Exemples S1 à S4

Construis les quatre projets-exemples avec le mécanisme normal de composition. Sauvegarde leurs configurations réutilisables dans l’emplacement d’exemples/tests du dépôt. N’écris pas une application autonome pour chaque exemple.

Transforme les critères des sections 6 à 8 en tests exécutables. Exécute les contrôles du lot avant de passer au suivant. Ne modifie pas les attentes d’un test pour masquer un comportement contraire aux règles.

### T5 — Dashboard S5

Construis le template système en assemblant les atomes, outils et relations identifiés dans l’audit du Dashboard réel. Conserve la capture comme référence. Les rails, leaders et gestes sont une composition de projet, pas un nouveau shell codé à part.

L’ancien Dashboard ne doit pas être supprimé ou remplacé en production pour conduire ce test. Compare les deux dans l’environnement de test et limite toute activation à cet environnement. Le passage effectif de l’application au nouveau Dashboard ne doit pas être confondu avec un déploiement autorisé.

### T6 — Régression, conservation et remise

Une fois les lots réussis, exécute les suites pertinentes existantes et les tests transversaux de la section 10. Vérifie les exemples après sauvegarde/réouverture. Conserve les tests, leurs données, les compositions et les preuves, pas seulement une explication dans le chat.

Le mot « validation » dans ce document désigne les vérifications du comportement. Réutilise l’outil de validation du projet lorsqu’il est adapté ; ne crée pas un nouvel outil simplement à cause de cette terminologie. Une validation logique ne remplace pas les tests UI nécessaires.

Aucun résultat de cette section n’est déjà obtenu du seul fait que ce prompt existe.

---

## 6. S1 — Redimensionnement conditionnel des objets

### 6.1 Résultat attendu et composants

Dans un projet de test, un bouton créé par l’auteur déclenche le redimensionnement des atomes correspondant à :

**(largeur > 30 px OU hauteur > 30 px) ET type ≠ Vidéo**

L’action utilise le véritable outil Redimensionner. Dans le cas de base, X et Y sont réglés à **80 px**, avec conservation des proportions désactivée : le résultat est exactement **80 × 80 px**. Conserver cette valeur de la dernière spécification ; ne pas réintroduire la valeur 60 évoquée dans d’anciennes discussions.

Composants requis : projet, atomes de test, bouton, Finder, cible dynamique, conditions OU/ET, outil Redimensionner et ses contrôles natifs. Leur présence et leur contrat doivent être établis dans T1.

### 6.2 Construction et utilisation

1. Ouvre le projet de test en Édition, puis l’activité Interactivité et l’outil Interaction par les accès existants.
2. Crée le bouton avec le mécanisme normal de création, puis sélectionne ce bouton et son événement d’activation comme déclencheur. Interaction ne doit pas créer implicitement le bouton.
3. Choisis la portée projet. Dans le Finder, compose les deux critères de taille reliés par OU, puis l’exclusion Vidéo reliée par ET. Affiche les groupes logiques sans ambiguïté.
4. Recherche Redimensionner dans le Finder et ajoute son vrai composant. Choisis X et Y, saisis 80 pour chaque axe et désactive la conservation des proportions.
5. Enregistre la configuration dans le projet. Identifie le projet comme template avec le mécanisme normal, sans format propre à Interaction.
6. Passe en Consultation et active le bouton. La cible est évaluée, puis l’outil agit sur les atomes admissibles. Les vidéos sont exclues.
7. Ajoute ou modifie des objets de test au moyen des opérations autorisées, puis recommence l’activation : les critères doivent être réévalués, sans liste figée cachée.
8. Vérifie aussi Performance. Pour modifier la configuration, retourne en Édition par le mécanisme standard. Ferme dans le mode choisi et contrôle la prochaine ouverture.

Le périmètre réel de la sélection doit être documenté. Ne rajoute pas une exclusion implicite des boutons ou de certains types d’objets pour obtenir le résultat souhaité. Si le déclencheur lui-même appartient à la portée et satisfait le filtre, cette conséquence doit suivre le contrat de sélection ou être signalée, pas masquée.

### 6.3 Données et tests à conserver

Les noms ci-dessous sont des noms de fixtures, pas des identifiants d’API. Les tailles et types doivent être appliqués via le modèle réel.

| Test | Préparation / action | Résultat attendu |
|---|---|---|
| S1-01 | Atome non vidéo de 40 × 20 ; activation. | Il est ciblé grâce à sa largeur ; résultat 80 × 80. |
| S1-02 | Atome non vidéo de 20 × 40 ; activation. | Il est ciblé grâce à sa hauteur ; résultat 80 × 80. |
| S1-03 | Atome non vidéo de 30 × 30 ; activation. | Inchangé : le seuil est strictement supérieur à 30. |
| S1-04 | Atome non vidéo de 20 × 20 ; activation. | Inchangé. |
| S1-05 | Vidéo de 100 × 50 ; activation. | Exclue malgré les dimensions. |
| S1-06 | Nouvel atome admissible ajouté après la première activation. | Pris en compte à l’activation suivante, sans reconstruire la règle. |
| S1-07 | Nouvelle vidéo ajoutée après la première activation. | Toujours exclue. |
| S1-08 | Objet initialement sous le seuil, puis taille modifiée au-delà de 30. | Il devient admissible à l’activation suivante. |
| S1-09 | Objet non carré, X/Y = 80, proportions désactivées. | Les deux valeurs sont appliquées exactement, même avec déformation. |
| S1-10 | Objet 100 × 50 ; X seul à 80, proportions activées. | Résultat 80 × 40 si les dimensions du contrat sont celles de l’objet ; confirmer ce contrat dans T1. |
| S1-11 | Objet 100 × 50 ; Y seul à 80, proportions activées. | Résultat 160 × 80 sous le même contrat de dimensions. |
| S1-12 | Un seul axe modifié, proportions désactivées. | L’autre axe ne suit pas. |
| S1-13 | X/Y proposés à 80 avec proportions activées. | Le rapport est conservé selon la résolution native de Redimensionner ; ne pas exiger 80 × 80 pour un objet non carré. Contrat absent = blocage. |
| S1-14 | Activation en Édition, puis en Consultation et Performance. | Pas d’exécution de l’interaction d’utilisation en Édition ; exécution autorisée dans les deux autres modes selon les droits. |
| S1-15 | Sauvegarde, fermeture et réouverture. | Configuration, références et mode de fermeture conservés. |
| S1-16 | Contrôle du panneau et de ses références de composants. | Vrai outil, options X/Y et proportions natives ; aucun style ou traitement parallèle. |

---

## 7. S2 — Liste et instances de templates associés

### 7.1 Fonction générique et cas concret

Ce scénario était nommé « Liste avec pages audio ». Il représente désormais un mécanisme générique : **un élément de liste est associé à une instance liée d’un projet-template enfant**. L’exemple musical ne doit pas introduire de logique réservée à l’audio.

Dans le projet parent, une liste de morceaux donne accès à leurs fiches. Une fiche peut présenter titre, pochette, album et audio. L’auteur choisit dans le template l’emplacement et le comportement d’affichage. Pour le parcours de test, configure explicitement un clic sur un élément afin d’afficher sa fiche dans un emplacement du parent ; cette interaction est une donnée de la composition, pas une convention codée dans toutes les listes.

La liste peut être alimentée élément par élément ou globalement par l’import existant, notamment depuis une liste ou un dossier. Chaque nouvel élément admissible reçoit automatiquement l’instance liée prévue par la configuration, sans que l’utilisateur doive fabriquer manuellement sa fiche.

### 7.2 Choix du template enfant

Une même liste peut utiliser plusieurs templates. L’affectation automatique peut dépendre du type ou de tout critère disponible dans Interaction. L’auteur peut également affecter manuellement un template à un élément précis.

Priorité validée :

**affectation manuelle explicite > règle dynamique > template par défaut**

Un seul exemple simple peut utiliser un même template pour toutes les fiches ; ce n’est pas une restriction du système. La résolution de plusieurs règles dynamiques simultanément applicables doit reprendre le solver existant. Si sa priorité n’est pas définie, ne choisis pas silencieusement « première règle » ou « dernière règle » : signale le besoin.

N’invente pas un template de secours. Le template par défaut de la composition de test doit être explicitement sélectionné. L’absence simultanée d’affectation et de défaut relève de la validation existante ; si elle n’a pas de contrat, bloque le cas concerné.

### 7.3 Correspondances de données et cycle de vie

L’auteur relie les données aux placeholders avec Interaction. Pour l’exemple : titre source → Titre ; album source → Album ; image source → Pochette ; média source → Audio. Ces termes sont des désignations fonctionnelles à associer aux vrais champs lors de l’audit.

L’identité de l’objet source lie durablement l’élément à sa fiche. L’ordre de la liste ou le nom affiché ne servent pas d’identité. Le mode de travail de la fiche embarquée est celui du parent ; sa vue peut être différente. Les droits, copies et liaisons dynamiques suivent Communication/partage.

La mise à jour du template enfant se propage à ses instances. Leurs valeurs propres restent associées aux placeholders conservés. Le renommage ou déplacement d’un placeholder conserve la donnée ; sa suppression applique R14.

### 7.4 Construction reproductible

1. Identifie les atomes Liste et contenus, les outils d’import/ajout, les projets-templates enfants, les placeholders et les capacités de liaison nécessaires. Arrête-toi sur une dépendance manquante.
2. Prépare le projet parent et, dans son espace de test, les templates enfants « Fiche audio », « Fiche vidéo » et une variante de présentation pour l’affectation manuelle. Ce sont des compositions de composants existants, pas de nouveaux types codés.
3. Place la liste et l’emplacement destiné aux fiches avec les outils de composition existants. N’impose pas cette disposition aux autres templates.
4. Prépare les références de données dans les enfants et compose leurs liaisons dans Interaction, sans correspondance automatique par nom.
5. Configure l’affectation par critères, puis un template par défaut explicite. Affecte manuellement la variante à un objet déterminé pour tester sa priorité.
6. Configure la création de l’instance associée à l’arrivée d’un nouvel élément, via les événements et outils natifs établis dans l’audit. Conserve la référence stable élément-instance.
7. Configure l’interaction d’affichage de la fiche. En mode Consultation, vérifie le parcours avec les éléments déjà présents, puis avec un ajout unitaire et un import global.
8. Fais évoluer le template enfant dans l’espace isolé. Vérifie ses instances déjà créées, leurs données et les permissions ; ne réalise pas ces opérations sur des projets de production.
9. Sauvegarde le parent et les références nécessaires. Ferme et rouvre ; la relation ne doit pas être remplacée par une nouvelle copie de toutes les fiches.

### 7.5 Jeu de test et critères

Utilise au moins deux objets audio distincts, un objet vidéo et un objet recevant une affectation manuelle. Donne aux deux objets audio des titres, albums et ressources différents pour détecter les confusions entre instances. Les noms « Echo », « Night » et « Night II » peuvent servir de données de test ; ils n’ont aucune signification dans le moteur.

| Test | Préparation / action | Résultat attendu |
|---|---|---|
| S2-01 | Ajouter un objet à la liste avec l’outil existant. | L’instance liée configurée apparaît automatiquement et référence le bon objet. |
| S2-02 | Importer plusieurs objets avec le mécanisme existant. | Les objets alimentent la liste et reçoivent leurs fiches sans importateur parallèle. |
| S2-03 | Présenter audio et vidéo avec deux règles distinctes. | Chaque objet reçoit le template prévu par ses critères, sans logique spéciale dans le moteur. |
| S2-04 | Affecter manuellement une variante à un objet qui satisfait une règle. | L’affectation manuelle prévaut. |
| S2-05 | Retirer la dérogation avec l’opération native autorisée. | La résolution revient à la règle applicable, ou au défaut selon la configuration. |
| S2-06 | Aucun critère ne correspond, mais un défaut est configuré. | Le template par défaut sélectionné est utilisé. |
| S2-07 | Configurer les liaisons titre/album/image/média. | Chaque placeholder reçoit la bonne donnée ; aucune valeur n’est déduite d’un simple nom semblable. |
| S2-08 | Inverser l’ordre des éléments puis renommer l’un d’eux. | Même identité de fiche, même objet associé, pas de doublon. |
| S2-09 | Modifier une donnée source liée dynamiquement. | La fiche suit la source selon le contrat de liaison et les droits déjà définis. |
| S2-10 | Utiliser une copie autorisée dans un cas de contrôle. | Elle suit le contrat de copie, et non une synchronisation ajoutée par le scénario. |
| S2-11 | Déplacer puis renommer un placeholder du template enfant. | Structure mise à jour, données conservées dans chaque instance correcte. |
| S2-12 | Supprimer un placeholder rempli dans le template source de test. | Le placeholder et sa liaison disparaissent des instances ; la ressource originale indépendante reste intacte. |
| S2-13 | Changer le mode du parent. | Les enfants suivent le mode de travail du parent ; leurs vues ne sont pas arbitrairement écrasées. |
| S2-14 | Passer une instance en contexte d’Édition via le parent. | Pas d’effacement automatique de ses données. |
| S2-15 | Modifier les droits de test puis tenter une action interdite. | Refus par le système existant, sans contournement dans Interaction. |
| S2-16 | Sauvegarder puis rouvrir le projet. | Correspondances, références source et dérogations conservées ; pas de création en double. |
| S2-17 | Effectuer une suppression autorisée d’un élément selon le contrat natif. | La fiche et les relations suivent ce contrat ; pas de destruction de ressources indépendantes. |
| S2-18 | Changer la présentation ou le déclencheur de l’exemple dans le template. | Le comportement change par configuration, sans modifier le moteur de liste. |
| S2-19 | Deux objets de même nom, mais d’identités différentes. | Deux associations distinctes ; aucun appariement par le seul nom. |

Si le contrat d’une opération de retrait, de remplacement de template ou de conflit de règles reste indéfini dans le système existant, documente-le comme blocage. Ne transforme pas l’expression « respecter les règles générales » en permission d’inventer leur contenu.

---

## 8. S3 et S4 — Sources dynamiques et timeline

### 8.1 S3 — Page dynamique alimentée par des atomes sources

#### Résultat attendu

Un projet-template affiche plusieurs informations provenant d’atomes réels : Date/Heure, Météo, Contacts avec vignette, Liste et Calendrier/événements. Leurs liaisons et leur présentation sont composées avec les mécanismes ordinaires.

Ce n’est pas un nouveau tableau de bord codé en dur. Une source n’est pas remplacée par une valeur statique générée pour la démonstration. Le composant Date/Heure porte l’affichage et les données que fournit la capacité native correspondante ; utilise les vrais noms et la répartition atome/outil identifiés dans le code.

Les atomes et outils sont retrouvables dans le Finder. Le panneau présente leurs composants réels, leurs options habituelles et leurs connexions existantes, sans copie de CSS, de logique ou d’API.

#### Construction et utilisation

1. Prépare un projet-template avec les emplacements de contenu définis par sa composition. Retrouve les cinq familles de sources dans le Finder.
2. Sélectionne les sources réelles et leurs champs/sorties à partir des contrats identifiés. Utilise un compte et un jeu de données de test ; ne branche pas implicitement les informations personnelles de l’utilisateur.
3. Compose dans Interaction les correspondances entre les sorties et les atomes/placeholders de destination. Ne fais aucune association implicite par nom.
4. Applique la liaison dynamique autorisée. La fréquence, les événements de mise à jour et les erreurs doivent provenir du contrat de la source, pas d’un polling ajouté arbitrairement au template.
5. En Consultation puis Performance, fais varier une source à la fois et observe la destination correspondante. Les autres contenus ne doivent pas être remplacés ou recréés inutilement.
6. Pour l’exemple de communication, compose une action explicite vers un destinataire de test avec l’outil Communication réel. L’envoi n’est pas déclenché par une simple actualisation de la météo ou du calendrier. Observe le déclenchement dans un environnement sans livraison à un destinataire réel.
7. Sauvegarde, ferme et rouvre pour vérifier les références, droits et modes.

#### Tests de S3

| Test | Action | Résultat attendu |
|---|---|---|
| S3-01 | Rechercher chaque source et les outils nécessaires. | Atomes et outils sélectionnables ; composants réellement raccordés au catalogue. |
| S3-02 | Avancer l’horloge de test selon le dispositif existant. | Date/Heure se met à jour sans valeur d’heure codée en dur dans le template. |
| S3-03 | Modifier une donnée météo de la source de test. | Seule la destination liée reçoit la mise à jour attendue. |
| S3-04 | Ajouter ou modifier un contact et sa vignette. | La source Contacts et sa représentation restent liées au bon objet. |
| S3-05 | Ajouter un événement de calendrier de test. | Il apparaît via la liaison prévue, sans collection parallèle. |
| S3-06 | Actualiser une source sans action de communication. | Aucun message n’est envoyé. |
| S3-07 | Activer l’action de communication configurée. | La bonne capacité est appelée avec le destinataire et les données prévus, dans un environnement de test sans envoi réel. |
| S3-08 | Simuler une indisponibilité via le dispositif de test du connecteur. | L’état natif d’indisponibilité est utilisé ; pas de donnée inventée pour masquer l’erreur. Les autres sources restent utilisables selon leur contrat. |
| S3-09 | Refuser un droit d’accès à une source de test. | Le droit est respecté ; ni le template ni Interaction ne contournent le refus. |
| S3-10 | Sauvegarder et rouvrir. | Références, liaisons et mode restaurés. |
| S3-11 | Inspecter les composants et les connexions employés. | Aucune implémentation parallèle de météo, calendrier, liste, contacts ou communication. |

Un jeu de données contrôlé peut isoler un connecteur externe si le projet dispose d’un tel dispositif de test. Cela ne prouve pas une connexion réelle à un fournisseur. Si un test d’intégration indispensable ne peut pas être exécuté, son statut est BLOQUÉ et non RÉUSSI.

### 8.2 S4 — Contrôler une timeline existante

#### Résultat attendu

Un projet-template, présenté en vue Naturel pour cet exemple, référence une timeline déjà créée. Il ne crée ni ne remplace la timeline. Il contient des contrôles Lecture, Pause, Stop et un slider reliés à ses capacités natives.

La liaison du slider fonctionne dans les deux sens : lorsque la timeline avance, le slider suit la tête de lecture ; lorsque l’utilisateur déplace le slider, la tête de lecture rejoint la position correspondante. La plage reste cohérente avec la timeline.

La timeline conserve l’autorité sur sa position et son état de transport. Le slider n’anime pas une horloge indépendante. Les commandes Stop, Pause, recherche temporelle et bornes reprennent la sémantique native : ce prompt n’impose pas arbitrairement qu’un Stop revienne à zéro ou qu’un déplacement du slider lance la lecture.

#### Construction et utilisation

1. Prépare une timeline de test avec le mécanisme existant et des données suffisantes pour constater une progression et un déplacement temporel.
2. Crée le projet-template de commande. Retrouve la timeline, le slider et les capacités de transport réelles avec la sélection existante/Finder.
3. Place les contrôles dans la composition. Dans Interaction, relie chacun à la capacité correspondante de cette timeline, par identité et référence réelle.
4. Configure la relation position timeline → valeur slider et l’action de manipulation slider → position timeline. Utilise le contrat natif de conversion d’unités et de plage. Ne crée pas un second transport.
5. Vérifie le dispositif existant empêchant les boucles de propagation et les événements doublés. Une mise à jour d’affichage ne doit pas être interprétée à tort comme une nouvelle manipulation humaine. Si ce contrat manque, arrête-toi avant de le remplacer par une astuce locale.
6. En Consultation et Performance, utilise Lecture, Pause, Stop et déplace le slider à plusieurs positions. Constate l’état réel de la timeline, pas seulement celui du contrôle visuel.
7. Modifie la durée de la timeline dans l’environnement de test ; vérifie que le contrôle demeure lié à la bonne plage.
8. Sauvegarde et rouvre le projet pour vérifier la conservation de la référence.

#### Tests de S4

| Test | Action | Résultat attendu |
|---|---|---|
| S4-01 | Ouvrir le template de commande. | Référence à la timeline existante ; aucune timeline de remplacement créée. |
| S4-02 | Activer Lecture. | La timeline réelle joue via sa capacité native. |
| S4-03 | Observer plusieurs positions pendant la lecture. | Le slider suit la tête de lecture réelle. |
| S4-04 | Déplacer le slider à une position intermédiaire. | La timeline rejoint la position correspondante selon ses unités et son contrat. |
| S4-05 | Activer Pause. | État et position conformes à la fonction native ; le slider reflète cet état. |
| S4-06 | Activer Stop. | Résultat conforme au transport natif vérifié, et non à une règle de remise à zéro inventée. |
| S4-07 | Manipuler le slider en lecture puis en pause. | Position et état restent cohérents avec le contrat natif de déplacement temporel. |
| S4-08 | Atteindre les deux extrémités de la plage. | Pas de position hors des bornes autorisées. |
| S4-09 | Modifier la durée/la plage de la timeline source. | Le slider reflète la nouvelle plage via la liaison réelle. |
| S4-10 | Répéter des mouvements puis laisser jouer. | Pas de boucle de rétroaction, d’événements d’action dupliqués ou de dérive d’une horloge séparée. |
| S4-11 | Refuser une commande au moyen des droits de test. | Le contrôle respecte le refus ; aucune commande cachée de secours. |
| S4-12 | Sauvegarder, fermer puis rouvrir. | Même timeline référencée, mêmes relations et restauration du mode de fermeture. |
| S4-13 | Observer les composants affichés et leurs réglages. | Slider et outils de transport natifs ; pas de copies décoratives. |

Utilise les tolérances et unités des tests natifs lorsqu’elles existent ; indique celles effectivement mesurées. Ne présente pas « immédiatement » comme une latence nulle prouvée, et ne crée pas une temporisation indépendante pour masquer un raccordement défectueux.

---

## 9. S5 — Recréer intégralement le Dashboard réel comme template système

### 9.1 Référence visuelle et limites de l’observation

La capture fournie est la référence de composition et de style. Les explications de l’utilisateur précisent les comportements invisibles dans une image fixe. Le code fournit les composants, sources et contrats réellement réutilisables. Il faut ces trois niveaux, sans faire passer une hypothèse visuelle pour un fait d’implémentation.

![Dashboard d’atome — capture de référence fournie par l’utilisateur](34FCEC0B-4B79-4D17-80FA-26565A350737.jpeg)

La capture montre un fond illustré, des éléments translucides aux angles arrondis, un affichage Date/Heure, une Météo plus large, des vignettes de contacts et de projets, ainsi qu’une colonne de leaders. Reprends le fond, les icônes, la typographie, les teintes, les proportions, les espacements, les ombres et les composants sources réels. Ne redessine pas librement un équivalent.

Les bandes noires de la capture et son cadrage ne constituent pas, à eux seuls, de nouvelles exigences d’interface. Les textes tronqués, l’heure affichée, les noms des personnes et les projets visibles sont des données de cette capture : ne les code pas comme contenu permanent du template. La capture n’autorise pas non plus à déduire une donnée météo ou physiologique qui n’est pas fournie par une source.

Aucun nouveau Dashboard monolithique, aucun ensemble de cartes génériques et aucun panneau de réglages parallèle. Le résultat doit être un projet-template système constitué d’atomes, de molécules, d’outils et de relations réels.

### 9.2 Structure commune : rails et leaders

Le Dashboard présente **cinq rails horizontaux**, dans cet ordre : Calendrier, News, Contacts, Moniteur, Projets. Chaque rail correspond à sa source et à son leader.

Les leaders sont fixés sur le bord droit dans la référence. Leur placement doit tenir compte du contexte droitier/gaucher existant : bord droit pour la configuration droitière de référence, adaptation sur le bord gauche pour la configuration gauchère. Réutilise ce contexte, sans dupliquer le Dashboard ou inventer une seconde préférence.

Il s’agit d’un changement de composition, pas d’un retournement graphique global qui inverserait les textes, images ou icônes. Vérifie les contraintes de placement existantes. Le détail technique de l’adaptation doit être raccordé au modèle de composition et au solver réels.

Chaque rail possède une partie de contenu défilant horizontalement. Les éléments fixes restent visibles et ne défilent pas avec ce contenu. Le leader demeure à son emplacement de bord. Les données absentes n’autorisent pas à remplir le rail avec des objets fictifs de production.

Un leader a deux cibles d’interaction distinctes : son accès à la collection et son action **Nouveau**. Elles réutilisent les composants présents dans le Dashboard actuel, et non un second système de navigation/création.

### 9.3 Contenu et actions de chaque rail

| Rail / leader | Élément fixe | Contenu dynamique | Activation du leader | Action Nouveau |
|---|---|---|---|---|
| Calendrier | Date/Heure, fourni par la capacité Date existante. | Rendez-vous et autres événements du calendrier ; actualisation par la source. | Afficher l’ensemble du Calendrier dans la zone centrale. | Ouvrir le mécanisme natif de création d’un événement. |
| News | Atome Météo. | News et messages reçus selon le système de News/Communication déjà défini. | Afficher toutes les News dans la zone centrale, avec leur parcours existant. | Créer une News/publication avec la capacité native. |
| Contacts | Le propriétaire du compte atome actif, toujours en tête comme élément fixe/de référence. | Les contacts récents, selon l’ordre de la source Contacts. | Afficher l’ensemble des contacts dans la zone centrale. | Créer un contact par le mécanisme existant. |
| Moniteur | Aucun élément fixe supplémentaire n’a été imposé. | Tâches et monitorings suivis par l’utilisateur ou configurés par défaut. | Afficher l’ensemble des monitorings dans la zone centrale. | Ajouter un suivi lié à une source, un projet ou une donnée, avec les outils existants. |
| Projets | Aucun élément fixe supplémentaire n’a été imposé. | Projets de l’utilisateur ordonnés par la date définie dans le système Projet, les récents en tête. | Afficher tous les projets dans la zone centrale. | Créer un projet avec la capacité native. |

**Calendrier.** Date/Heure ne bouge pas pendant le défilement des événements. Les nouveaux événements alimentent le rail à travers la source, avec son ordre existant. Ne décide pas arbitrairement d’un tri par date de création si le Calendrier utilise la date du rendez-vous. Un ordre ambigu doit être vérifié dans le comportement de référence.

**News.** La Météo reste fixe. Les autres éléments représentent les nouvelles reçues, qu’il s’agisse de publications généralistes ou des messages prévus par le système existant. Le scénario ne redéfinit ni leur réception ni un réseau social.

**Contacts.** L’élément personnel dépend du compte actif, pas d’un nom ou d’un appareil codé en dur. Une interaction configurée sur un contact peut ouvrir sa fiche ou lancer une action de communication. Ce choix appartient au template et aux capacités existantes ; ne l’impose pas à tous les objets Contact. L’ordre « récent » reprend celui du système, pas une définition inventée de la récence.

**Moniteur.** Le suivi est générique : tâches en cours, spectacle, mise en page, randonnée, sport, sommeil, rythme cardiaque, respiration ou autre donnée compatible. Les monitorings proposés par défaut et leurs réglages viennent du système correspondant. Leur configuration peut se faire ailleurs ; le Dashboard affiche ces objets sans dupliquer leurs réglages. Cette mention n’autorise pas l’activation d’un capteur ou l’accès à des données de santé sans permission. Pour le test, utilise une source de monitoring de test existante et raccordée.

**Projets.** Les éléments représentent les projets réels de l’utilisateur avec leur identité stable. Afficher tous les projets via le leader n’est pas afficher uniquement les quelques vignettes récentes visibles dans le rail.

### 9.4 Affichage central et création

L’activation d’un leader affiche la collection complète correspondante dans l’emplacement central prévu par le template. Les capacités de parcours et de consultation sont celles des composants existants.

La relation fonctionnelle est :

**leader activé → source/collection correspondante → représentation dans l’emplacement central du template**

La commande Nouveau active la capacité native appropriée. Elle ne doit pas déclencher accidentellement aussi l’action du leader parent par un double traitement de l’événement. Les paramètres, formulaires éventuels, options et validations sont ceux du véritable outil de création.

Le retour à la vue des rails et la navigation utilisent les mécanismes de référence de l’application. La capture seule ne définit pas un bouton Retour. Vérifie le comportement existant au lieu d’ajouter un élément de navigation arbitraire.

### 9.5 Construction par composition et Interaction

1. Identifie le Dashboard actuellement utilisé, ses fichiers de composition, son fond, ses styles et ses sources. Documente les écarts éventuels entre la version du code et la capture fournie. Un écart non résolu empêche de certifier une reproduction exacte.
2. Crée ou sélectionne le projet-template système Dashboard dans l’environnement isolé. Il doit utiliser le même modèle que les autres projets.
3. Reproduis la structure et les dimensions de la référence avec les atomes/molécules et outils de composition existants. Prépare les cinq rails et leurs leaders, sans recopier leurs composants.
4. Raccorde le placement contextuel du rail de leaders au contexte droitier/gaucher. Ne change pas le sens de lecture des contenus.
5. Place Date/Heure, Météo et le compte actif dans les emplacements fixes décrits ci-dessus. Configure les parties défilantes entre les contraintes fixes du template, sans capturer le geste au détriment des composants voisins.
6. Relie les rails à Calendrier, News/Communication, Contacts, Moniteur et Projets. Réutilise la construction de collections, les références stables et les règles générales de S2 lorsque ces mécanismes s’appliquent. Ne recode pas leur logique dans S5.
7. Compose les relations des leaders vers la zone centrale. Compose séparément les cinq actions Nouveau avec leurs véritables outils.
8. Configure les actions sur les contenus, notamment les contacts, selon les comportements déjà décrits et les actions existantes. N’ajoute pas une action non demandée à tous les éléments d’un type.
9. Enregistre la composition comme template système, puis prépare deux instances de test représentant deux comptes, avec des données distinctes.
10. Modifie la structure du template système de test ; constate la propagation automatique aux deux instances selon R19. Vérifie la conservation ou la suppression des données selon les identités de placeholders.
11. Teste la fermeture et la réouverture, le changement de mode et la variante droitier/gaucher. Le Dashboard utilise le mode enregistré du projet, pas un mode Consultation imposé en dur à chaque ouverture.
12. Exécute les tests ci-dessous et la régression de l’application. Garde les compositions et preuves reproductibles.

L’ajout d’un raccordement de composition ne doit pas se transformer en création cachée d’une capacité absente. Si rails, leaders, affichage central, contexte de main ou monitoring sont partiels/manquants, reviens à la règle d’arrêt et décris le composant réutilisable à réaliser.

### 9.6 Jeu de test de S5

Prépare suffisamment d’éléments pour dépasser la largeur visible de chaque rail : plusieurs événements, News, contacts, monitorings et projets. Identifie un compte de test comme propriétaire. Utilise des dates et identités distinctes, dans une horloge de test contrôlée lorsque l’infrastructure le permet.

Conserve une variante visuelle destinée à la comparaison avec la capture et une variante plus remplie pour les défilements. Les valeurs contrôlées des tests ne doivent pas devenir les données par défaut distribuées aux utilisateurs.

### 9.7 Tests de S5 à exécuter et conserver

| Test | Action / vérification | Résultat attendu |
|---|---|---|
| S5-01 | Ouvrir le projet-template et inspecter son modèle. | Projet atome commun, pas un moteur ou écran monolithique parallèle. |
| S5-02 | Comparer la variante visuelle au Dashboard fourni. | Géométrie, fond, teintes, proportions, icônes, typographie et composants conformes aux références ; écarts documentés, pas masqués. |
| S5-03 | Passer du contexte droitier au contexte gaucher avec le mécanisme existant. | Les leaders se placent sur le bord prévu ; textes et images restent lisibles, sans deuxième préférence Dashboard. |
| S5-04 | Faire défiler horizontalement les événements. | Date/Heure et leader Calendrier restent fixes ; les événements défilent. |
| S5-05 | Faire défiler horizontalement les News. | Météo et leader News restent fixes ; les nouvelles défilent. |
| S5-06 | Faire défiler les Contacts et changer le compte de test actif. | Le propriétaire correct reste en tête/fixe selon la composition ; les contacts correspondent au compte courant. |
| S5-07 | Ajouter un événement à la source de test. | Il apparaît dans le rail et la collection complète selon l’ordre natif. |
| S5-08 | Injecter une News autorisée via la source de test. | Elle apparaît sans second système de réception. |
| S5-09 | Ajouter/modifier un contact de test. | Le rail et la collection suivent leur source et leurs identités. |
| S5-10 | Faire évoluer deux monitorings de domaines différents. | Les objets de suivi correspondants s’actualisent ; pas de logique réservée à un domaine. |
| S5-11 | Ajouter et modifier des projets de test. | Les projets réels sont affichés selon le classement natif par date, avec identités conservées. |
| S5-12 | Activer successivement les cinq leaders. | La bonne collection complète apparaît dans l’emplacement central défini par le template. |
| S5-13 | Parcourir une collection centrale plus grande que son rail résumé. | Les éléments supplémentaires sont accessibles par le parcours existant. |
| S5-14 | Activer Nouveau dans Calendrier. | Le mécanisme natif de création d’événement est utilisé. |
| S5-15 | Activer Nouveau dans News. | La capacité native de création de News/publication est utilisée, sans publication réelle pendant le test. |
| S5-16 | Activer Nouveau dans Contacts. | Création de contact avec l’outil existant, dans l’espace de test. |
| S5-17 | Activer Nouveau dans Moniteur. | Ajout d’un suivi via les outils existants, sans accès implicite à un capteur réel. |
| S5-18 | Activer Nouveau dans Projets. | Création d’un projet normal, sans deuxième fabrique de projet. |
| S5-19 | Activer Nouveau et inspecter les événements. | Une seule action attendue ; l’accès à la collection du leader n’est pas déclenché par erreur. |
| S5-20 | Configurer l’action d’un contact puis l’activer. | Fiche ou communication selon la configuration ; aucune règle codée en dur sur tous les contacts. |
| S5-21 | Actualiser le template système de test pour deux instances existantes. | Les changements structurels se propagent automatiquement, sans confirmation ni option de refus. |
| S5-22 | Déplacer/renommer un placeholder du template système rempli différemment dans les deux instances. | Les données de chaque utilisateur restent dans sa propre instance et dans le bon placeholder. |
| S5-23 | Supprimer un placeholder du template système de test. | Son contenu et sa liaison disparaissent des instances ; les ressources originales indépendantes sont conservées. |
| S5-24 | Fermer puis rouvrir dans chacun des trois modes. | Mode de fermeture restauré ; droits et règles d’exécution respectés. |
| S5-25 | Tester une source indisponible et des droits insuffisants. | États et refus natifs ; aucune donnée fabriquée ou permission contournée. |
| S5-26 | Comparer les implémentations des outils utilisés hors Dashboard et dans Dashboard/Interaction. | Mêmes composants, styles, capacités et contrats ; pas de duplication métier. |
| S5-27 | Revenir à la composition de rails via la navigation existante. | Le retour fonctionne sans bouton ou sous-système de navigation inventé. |
| S5-28 | Exécuter sur les formats d’écran pris en charge identifiés dans le dépôt. | Pas de leader coupé, de commande rendue inaccessible ou de régression gestuelle ; conformité constatée sur chaque cible réellement testée. |

La référence image ne suffit pas à valider un geste, une animation, le défilement ou les données. Les tests doivent observer ces comportements dans l’application exécutée. L’absence d’un environnement UI/mobile requis est un blocage de validation, pas une réussite par extrapolation depuis le navigateur de bureau.

---

## 10. Tests transversaux, preuves et critères d’acceptation

### 10.1 Trois niveaux complémentaires

**Tests de code.** Vérifie les identités, règles de sélection, priorités, groupes logiques, gestion des états, conservation des données et droits au niveau des unités réelles.

**Tests d’intégration.** Vérifie les véritables enchaînements projet → Interaction → solver/capacité → source/destination → persistance. Une unité mockée ne prouve pas que ce raccordement fonctionne.

**Tests UI et comportements.** Lance l’application avec les outils existants, manipule réellement ses composants et capture les preuves. Le panneau doit contenir les vrais outils ; le Dashboard doit présenter les objets et comportements de référence.

Ces niveaux ne sont pas interchangeables. Une compilation réussie ne vaut pas test d’interface. Une capture sans manipulation ne prouve pas une interaction. Une maquette ne vaut pas un projet réutilisable.

### 10.2 Contrôles transversaux minimaux

| Test | Contrôle | Résultat attendu |
|---|---|---|
| C-01 | Créer, choisir, prévisualiser et enregistrer un template avec les mécanismes existants. | Le template utilise le modèle Projet, sans seconde chaîne de création. |
| C-02 | Dupliquer/modifier un template avec des droits différents. | Les autorisations existantes sont respectées ; une copie ne devient pas liée contre son contrat. |
| C-03 | Fermer et rouvrir des projets ordinaires et templates dans les trois modes. | Mode de fermeture conservé, sans réglage supplémentaire. |
| C-04 | Embriquer un enfant puis changer le mode du parent. | Mode effectif hérité, vue indépendante conservée lorsqu’elle est configurée. |
| C-05 | Fermer un parent utilisant un template source partagé. | Pas d’écriture injustifiée du mode ou des données d’instance dans le template source. |
| C-06 | Modifier la structure d’un template utilisé par plusieurs instances. | Propagation selon les liens, avec données d’instance isolées. |
| C-07 | Renommer, déplacer, puis supprimer des placeholders de test. | Identités et données conformes à R13/R14 ; ressources originales indépendantes non détruites. |
| C-08 | Rechercher des objets et un outil absent de la barre par défaut. | Résultats Finder accessibles selon les droits, sélection utilisable dans Interaction. |
| C-09 | Ajouter au moins deux outils de test existants dans une cascade. | Exécution dans l’ordre configuré avec leurs options natives ; inverser la configuration produit l’ordre inverse attendu. |
| C-10 | Configurer une interaction en Édition puis utiliser les autres modes. | Configuration possible ; pas d’exécution involontaire des actions d’utilisation pendant l’Édition. |
| C-11 | Tester droits de modification et droit de changer les droits. | Les deux passent par Communication/partage, sans permission supplémentaire accordée par le template. |
| C-12 | Rouvrir les cinq projets-exemples conservés. | Références, liaisons, paramètres et compositions retrouvés, sans réinstanciation parasite. |
| C-13 | Examiner imports et dépendances, styles et composants. | Aucun nouveau framework/TypeScript imposé, aucune logique ou interface métier recopiée. |
| C-14 | Vérifier les interfaces plugins/API/MCP utilisées. | Contrats existants préservés et documentés ; aucune capacité prétendument disponible sans preuve. |
| C-15 | Tester l’association de templates système à une maîtrise déjà gérée. | Réutilisation du profil et de sa nomenclature ; pas de seconde préférence. Politique manquante = blocage du cas requis. |
| C-16 | Exécuter les régressions pertinentes existantes. | Pas de régression masquée dans la création, le partage, la navigation, les modes, les listes et les médias. |

Les cas C-09 et les autres tests transversaux doivent utiliser des outils réellement inventoriés. Ne crée pas un outil fictif de production pour avoir une cascade de deux actions. Si le dépôt fournit des seuils de performance, notamment d’ouverture de panneau, applique-les et mesure-les ; n’invente pas une performance acquise ou un seuil arbitraire pour déclarer la réussite.

### 10.3 Résultats et conservation des preuves

Pour chaque test, conserve : identifiant, règle concernée, environnement et version de départ, préparation, commande ou manipulation réellement exécutée, résultat attendu, résultat observé, statut et chemin des preuves.

Utilise quatre statuts explicites : **RÉUSSI**, **ÉCHEC**, **BLOQUÉ**, **NON EXÉCUTÉ**. Un test ignoré, simulé à la place d’un test requis, non disponible ou non exécuté ne peut pas être RÉUSSI.

Les preuves peuvent être les sorties de commande, codes de retour, assertions, captures avant/après et relevés d’état du modèle réel. Ne conserve pas de données privées inutiles. Les tests d’envoi/partage doivent préciser qu’ils utilisent des ressources de test et non une livraison à un destinataire réel.

Une erreur attendue dans un test négatif n’est pas un échec si les assertions démontrent le refus prévu. En revanche, un échec inattendu d’assertion, de compilation, de test ou d’interaction active immédiatement la règle d’arrêt.

### 10.4 Condition de fin

Tu ne peux annoncer la réalisation complète que si :

1. les capacités indispensables ont été vérifiées et aucun blocage n’est ouvert ;
2. les cinq projets-exemples sont construits avec les composants réels, sauvegardés et reproductibles ;
3. les tests requis des scénarios et les contrôles transversaux ont été exécutés avec preuves ;
4. aucune régression inattendue ne reste présente ;
5. le Dashboard a été comparé aux références réelles, sans substitution générique ;
6. le rapport explique précisément les cibles testées, ce qui a changé et les limites effectivement rencontrées ;
7. aucun commit, push, déploiement ou effet de bord sur des données de production n’a été effectué.

L’obligation d’arrêt prime sur la volonté d’achever toute la liste de tests. Si un blocage ou un échec intervient, les tests restants restent NON EXÉCUTÉS. N’affirme pas que tout a été validé simplement parce que leur plan est rédigé.

---

## 11. Protocole d’arrêt et décisions techniques non présumées

### 11.1 Arrêt obligatoire

Arrête les modifications et les exécutions à effets de bord dans les cas suivants :

| Situation | Conduite attendue |
|---|---|
| Atome, outil, composant ou capacité nécessaire absent/partiel | Décrire le besoin réutilisable et sa dépendance ; ne pas créer de substitut caché ; attendre l’autorisation du lot. |
| API, identifiant, événement, solver ou format de données non vérifié | Présenter les éléments recherchés et les preuves disponibles ; ne pas inventer le contrat. |
| Accès au dépôt, à une dépendance, au compte de test ou aux médias requis impossible | Expliquer l’accès manquant ; ne pas contourner les permissions. |
| Échec de compilation ou de test, y compris préexistant | Conserver logs et résultat ; ne pas continuer, masquer le test ou modifier son attente. |
| Référence visuelle indispensable absente ou incompatible avec le code | Ne pas inventer une interface de remplacement ; identifier la référence à fournir ou la divergence à arbitrer. |
| Environnement UI, appareil ou moyen de test requis indisponible | Statut BLOQUÉ ; ne pas prétendre avoir observé le comportement. |
| Risque de destruction de données ou écrasement du travail utilisateur | Suspendre immédiatement ; ne pas supprimer ni réinitialiser pour poursuivre. |
| Règle fonctionnelle réellement contradictoire/non définie | Expliquer le cas concret et poser une seule question. |

L’arrêt n’interdit pas la collecte minimale, en lecture seule, des traces nécessaires à un rapport fiable. Il interdit la poursuite de l’implémentation, les contournements, les nouvelles mutations ou les tentatives répétées de correction non autorisées.

### 11.2 Points à résoudre d’abord par le code existant

Les sujets suivants ne sont **pas** de nouvelles décisions imposées par ce prompt. Cherche leur contrat existant ; ne questionne l’utilisateur que si un cas nécessaire reste indéfini :

- le tri précis des événements, contacts récents et projets ;
- le départage de plusieurs règles dynamiques et le comportement sans template admissible ;
- la distinction entre suppression réelle, retrait d’une liste et disparition d’un résultat filtré ;
- le remplacement du template affecté à un élément déjà rempli, notamment les correspondances vers d’autres placeholders ;
- la gestion d’une référence absente, révoquée, hors ligne ou d’un changement de version incompatible ;
- la validation des cycles d’imbrication de projets et des boucles de propagation ;
- la sémantique native de Stop, de déplacement temporel, des axes et de l’homothétie ;
- la navigation de retour depuis une collection centrale et les adaptations aux formats d’écran ;
- les règles de sélection/remplacement du template d’accueil lors d’un changement de maîtrise ;
- la livraison cohérente d’une mise à jour dynamique du template système, particulièrement pendant un usage en Performance ;
- la persistance lors d’une fermeture interrompue et la séparation entre état d’instance et source partagée.

Les mentions « automatique » et « obligatoire » ne permettent pas d’inventer le protocole technique ni d’ignorer une corruption d’état. Si le mécanisme actuel ne garantit pas les règles demandées, le bon résultat est un blocage documenté, pas une réussite déclarée avec une solution improvisée.

### 11.3 Format du rapport de blocage

Rends un rapport bref mais précis avec ces champs :

- **Statut :** BLOQUÉ — composant manquant, ou ÉCHEC — test/compilation/comportement.
- **Lot et exigence :** identifiant T, R, S ou C concerné.
- **Constat vérifié :** fichiers/symboles consultés ou commande exécutée ; résultat exact et preuve.
- **Conséquence :** pourquoi cela empêche de respecter le scénario sans l’inventer.
- **État du travail :** fichiers modifiés par toi, fichiers préexistants laissés intacts, tests réussis avant l’arrêt et tests non exécutés.
- **Proposition limitée :** composant générique à ajouter/corriger ou accès/référence à obtenir ; aucune réalisation de ce lot sans accord.
- **Une seule question :** la décision ou autorisation indispensable pour reprendre.

Ne déclare pas un composant absent uniquement parce qu’un grep sur son nom a échoué. Ne demande pas à l’utilisateur de redéfinir un principe déjà fixé dans R01–R30.

---

## 12. Livrables attendus de Codex et traçabilité

### 12.1 Livrables dans le dépôt local

Conserve, dans les emplacements existants ou explicitement convenus avec l’utilisateur :

1. ce cahier des charges comme référence unique des règles de cette mission ;
2. l’inventaire T1, avec preuves des composants, dépendances et contrats ;
3. les modifications de code autorisées, limitées aux raccordements et lots validés ;
4. les **cinq projets-exemples** et les ressources de test nécessaires à leur réouverture ;
5. les tests automatisés, parcours UI et preuves effectivement produits ;
6. un rapport de couverture exigences → composants → exemples → tests → résultats, ainsi que les éventuels blocages.

Un nom de fichier de sortie ne doit pas être pris pour un chemin déjà présent. Repère d’abord les conventions du dépôt, puis utilise-les. Ne touche pas à la Librairie de ChatGPT ou à des documents externes depuis Codex sans accès et demande dédiés.

### 12.2 Conservation des sujets des deux documents

| Sujet issu des documents | Où il est conservé dans ce prompt |
|---|---|
| Définition, usages et extensibilité des templates | R01–R04. |
| Création, choix, prévisualisation, duplication et templates personnels/système | R03, T3, C-01/C-02. |
| Modes, fermeture et partage du mode enregistré | R05–R08, C-03/C-05. |
| Maîtrise et projet d’accueil | R09, R17–R19, C-15, S5. |
| Activité, outil Interaction, panneau et Finder | R20–R30, T1/T3. |
| Atomes et outils réels, styles et logique non dupliqués | R20–R23, S5-26, C-13/C-14. |
| Sélections, groupes logiques, cascades | R25/R26, S1, C-09. |
| Templates imbriqués, liens, permissions et données | R08, R10–R16, S2, C-04/C-07/C-11. |
| Liste générique, import, templates multiples et priorités | S2 et S2-01 à S2-19. |
| Page dynamique | S3 et S3-01 à S3-11. |
| Timeline et slider bidirectionnel | S4 et S4-01 à S4-13. |
| Dashboard, rails, leaders, éléments fixes et Nouveau | S5 et S5-01 à S5-28. |
| Mises à jour système automatiques obligatoires | R19, S5-21 à S5-23. |
| Vérification du code, composants manquants et tests | T0–T6, sections 10 et 11. |

### 12.3 Sujets conservés mais non inventés

Les anciens documents laissaient ouverts le stockage exact et les métadonnées de templates, la représentation technique du mode, l’héritage et les variantes, les paramètres avant instanciation, les templates locaux/partagés/distants, le versionnement, la compatibilité ascendante et l’UX de recherche/organisation.

Le présent prompt conserve ces objectifs. Il ne leur substitue pas un schéma de stockage ou une interface inventés. Réutilise les contrats du dépôt. Lorsqu’un de ces sujets devient indispensable à un lot et n’est pas défini, traite-le selon la section 11. Un simple renvoi au futur ne doit pas servir à annoncer le lot comme achevé.

### 12.4 Rapport final

Termine par un état fidèle : réalisé et prouvé, partiellement réalisé avec arrêt, ou bloqué avant implémentation. Donne les fichiers modifiés, les compositions sauvegardées, les commandes exécutées, les tests réellement réussis/échoués/non exécutés, les preuves visuelles et les limitations.

Ne prétends jamais avoir vérifié les cinq exemples ou le Dashboard si tu n’as pas réellement exécuté les parcours nécessaires. N’annonce aucun commit ou déploiement : ils sont exclus de cette mission.

---

## Annexe — Provenance de la consolidation documentaire

Ce document a été consolidé à partir des dernières versions intégralement disponibles dans la conversation :

| Source | Identifiant de version de contenu fourni dans la conversation | Volume du texte |
|---|---|---|
| `/atome/Roadmap/Templates and Activities/01 - Template.md` | `file_0000000070d082108a80a522c749e56f` | 78 lignes ; 8 892 octets UTF-8. |
| `/atome/Roadmap/Templates and Activities/interactivity.md` | `file_0000000042088210ae331450a1dcc2c2` | 315 lignes ; 37 405 octets UTF-8. |
| Capture du Dashboard | `34FCEC0B-4B79-4D17-80FA-26565A350737.jpeg` | Image originale fournie par l’utilisateur ; 706 × 1 536 pixels. |

Les textes complets ont été relus, leurs règles regroupées et leurs ambiguïtés explicitées en section 1. Les tableaux de tests sont des exigences à réaliser et exécuter par Codex, **pas des résultats de tests déjà menés sur le code**. Les données de fixtures proposées servent à rendre les exemples reproductibles et n’ajoutent pas de conventions universelles à atome.

L’audit du dépôt et de l’application n’a pas été réalisé lors de cette consolidation ; il constitue la première tâche de Codex. Les noms de composants dans ce prompt décrivent les besoins fonctionnels et restent à raccorder aux implémentations réelles.

Le remplacement des deux documents dans leur dossier de Librairie n’est considéré comme effectué qu’après enregistrement et relecture du nouveau fichier à cet emplacement. Une copie téléchargeable seule ne prouve ni cet enregistrement ni la suppression des originaux.

**Fin du prompt. Commence par T0 et T1 ; n’effectue aucune modification avant le contrôle des prérequis et applique l’arrêt au premier manque ou échec.**

---

## 13. Résultat de l’audit T0/T1 et plan d’exécution (30 septembre 2026)

Cette section est ajoutée par l’exécutant après l’audit en lecture seule du dépôt. Elle ne modifie pas les règles R01–R30 ; elle raccorde ces règles au code réel, consigne les arbitrages pris et le plan de réalisation. Les statuts de la colonne « Réalisation » sont mis à jour au fil de l’eau.

### 13.1 T0 — État initial

- Dépôt : `/Users/jean-ericgodard/RubymineProjects/a`, branche `main`, révision de départ `a72c443cd`. `eVe/` est un sous-module git (aucun `git stash` depuis le parent).
- Fichiers déjà modifiés par l’utilisateur avant la mission (laissés intacts) : `atome/src/shared/share_rights.js`, `atome/src/squirrel/apis/unified/adole_apis.js`, `adole_websocket_message.js`, `calendar_api_source.js`, `voice_input_meter.js`, `database/adole_schema_migrations.js`, `database/schema.sql`, `package.json`, `server/{communication_delivery,communication_relations,fileStorage,news_broadcast,notificationStack,server,userFiles,visio,visio_routes,visio_ws_handler}.js`, deux tests `tests/eve/*`, plus fichiers non suivis (`mediasoup-client`, `contact_book_hash.js`, scripts de bundle).
- Aucun `AGENTS.md` / `CLAUDE.md` dans le dépôt ; consignes = mémoire de session de l’utilisateur.
- Lancement : serveur Fastify de dev sur le port 3001 (`.claude/launch.json` → `atome-server`), tests UI par Playwright (`tests/probes/molecule_eve_ui_acceptance_probe.mjs`, comptes jetables via `enterProvisionedWorkspace`).
- **Capture du Dashboard :** introuvable sur la machine au moment de l’audit, puis **fournie par l’utilisateur en pièce jointe dans la conversation (30 sept. 2026)**. Contenu observé : fond « coucher de soleil » plein écran ; colonne de leaders translucides au bord droit (Calendrier, News, Contacts, Moniteur, Projets), chacun avec icône au-dessus, libellé dessous et bande « Nouveau » séparée par un filet ; en haut à gauche la tuile Date/Heure (« 20:22 », « mer. 30 se. ») ; sous elle la tuile Météo double largeur (icône nuage, « —° », « Météo », « Position i. ») ; rail Contacts avec la vignette du propriétaire (avatar par défaut, numéro de téléphone tronqué) ; rail Projets en bas avec six vignettes (aperçu + nom tronqué). Rails News/Calendrier/Moniteur vides dans cette capture. Cette capture est identique en structure au Dashboard Bevy actuel du code.

### 13.2 T1 — Inventaire des capacités (statuts vérifiés dans le code)

| Famille | Statut | Constat (chemins réels) |
|---|---|---|
| Projet-template (marqueur de projet) | ABSENT | Aucun champ/tag/statut « template » au niveau projet. Existent seulement : `action_templates` sur le record projet (`eVe/domains/rendering/template_creation_runtime.js`, outil `ui.template.create`, copies **détachées**) et `NEWS_TEMPLATES` (`eVe/domains/news/news_template_model.js`, `properties.news_template`). |
| Création de projet guidée | EXISTANT (pas une bibliothèque) | `eVe/domains/dashboard/dashboard_creation_catalog.js` (`DASHBOARD_PROJECT_GOALS`), `dashboard_creation_actions.js` `createGuidedProject` → projet vide + `project_intent`. |
| Duplication de projet | EXISTANT, sans lien | `duplicateProjectRecord` / `createProjectSnapshot` / `cloneProjectSnapshot` (`eVe/intuition/matrix/core/project_data.js`), via `executeBootstrapDuplicateOperation` (`preserve_relative`). Aucune provenance conservée. |
| Projets imbriqués | ABSENT | Seul le conteneur `page` (`eVe/domains/rendering/page_container_projection.js`, `container_kind:'page'`) : un groupe qui découpe ses enfants, pas une référence de projet. |
| Placeholders | EXISTANT | `placeholder_creation_runtime.js` (`ui.placeholder.create`, `placeholder_kind` ∈ text/video/audio/photo/image/shape) ; remplissage `project_view_placeholder_fill.js` (valeur écrite sur le même atome, marqueur effacé). Identité = `atome_id`. |
| Modes de travail | PARTIEL | `'edit'|'consultation'|'performance'` dans `eVe/domains/rendering/project_work_mode_state.js` (évt `eve:project-work-mode-changed`, garde `authorizeProjectTool`). **Map en mémoire, non persistée** : pas de restauration du mode de fermeture. Retour Édition : menu Mystic (`context_menus.json` overrides consultation/performance → `mode_edit`). |
| Vues | EXISTANT | `natural|list|table` (`project_view_mode_state.js`), persistées dans `view_mode`. |
| Droits / partage | EXISTANT | `atome/src/shared/share_rights.js` (`read,write,create,delete,reshare,manage`, modes `direct|frozen|curated`), serveur `server/syncSharingService.js`, `server/userVaultRouter.js`. Copie = `frozen` ; liaison dynamique = `direct`/`curated` ; modifier les droits = `manage`. |
| Maîtrise / latéralité | EXISTANT | `eVe/intuition/tools/user_visual_preferences_model.js` (`MASTERY_LEVELS = beginner/intermediate/advanced`, `handedness right/left`), `eVe/intuition/core/state.js`. |
| Interaction / activité Interactivité | ABSENT | Aucun outil, panneau ou activité (activités actuelles : dtp, video, daw, text). |
| « Solver » | EXISTANT sous un autre nom | Aucun module nommé solver. Mécanisme de résolution réel = **moteur Conditions** (`atome/src/squirrel/conditions/engine.js`, groupes `and/or/not` imbriqués, `window.atome.conditions`, types `condition_set/binding/list`) + **runtime d’outils** (`invokeToolGateway`, `eVe/intuition/runtime/tool_gateway.js`). Modèle déclencheur→actions déjà présent : `midi_binding` (`midi_binding_runtime.js`). |
| Finder | EXISTANT | `bevy_panel_finder_*` : objets **et** outils (catégorie tools, `isExposableToolRecord`). UI de conditions `bevy_panel_conditions_runtime.js` limitée à un niveau de groupe. |
| Redimensionnement | PARTIEL | `ui.size.apply` (`eVe/intuition/tools/size.js`, panneau `bevy_panel_size_runtime.js`) : un seul champ, toujours proportionnel. `ui.resize` accepte des `items` non proportionnels via l’API. |
| Bouton déclencheur | PARTIEL | Pas de type bouton ; `tool_instance` (outil déposé) passe par l’ancien chemin DOM et n’admet qu’un outil. |
| Timeline / transport | EXISTANT | `projectViewTransport` (`project_view_transport_runtime.js` : play/pause/stop/seek/scrub, évt `eve:project-view-transport-state`) et `eveMoleculeTimelineApi`. |
| Slider-atome | ABSENT | Curseurs = éléments d’UI d’outil uniquement. |
| Anti-boucle de propagation | ABSENT (générique) | Seulement `withActionRecordingSuppressed`, `commit:false`, limitation 33 ms. |
| Liaison dynamique de données entre atomes | ABSENT | Rien ne fait piloter une propriété d’atome par une source. |
| Listes / import | PARTIEL | Pas d’atome liste (vue liste, `condition_list`). Import = panneau Média (`bevy_panel_media_runtime.js`, `importMany`). Import de dossier : ABSENT. |
| Dashboard | EXISTANT mais monolithique | Shell Bevy codé en dur (`eVe/domains/dashboard/*`, catégories `default_values/constants.json` `dashboard.categories`). Rails, leaders (filtre + Nouveau), épinglés horloge/météo, défilement, latéralité existent. Pas de zone centrale (le filtre étale les éléments sur les rails). Horloge (`dashboard_clock_card_records.js`) et Météo (`dashboard_news_modules.js`, open-meteo) **privées** au Dashboard. Moniteur : lecteur sans producteur. Contacts : tri **alphabétique**, propriétaire en tête. Projets : `updated_at` décroissant. |
| Tests | EXISTANT | Playwright + sondes `temp/` ; suite vitest du dépôt non utilisée (consigne utilisateur). |

### 13.3 Arbitrages retenus pour la réalisation

| # | Arbitrage |
|---|---|
| A1 | L’utilisateur a ordonné la réalisation complète et l’autonomie. La règle d’arrêt « composant manquant » (§0, §11) est donc levée : les capacités ABSENTES ci-dessus sont réalisées comme **composants génériques réutilisables**, jamais comme fonctions privées d’un scénario. Les autres règles (pas de faux service, pas de duplication, pas de données de production) restent entières. |
| A2 | Suite de tests du dépôt non exécutée (consigne utilisateur) ; chaque lot a sa sonde ciblée dans `temp/` et une vérification Playwright dans l’app réelle. |
| A3 | Capture fournie par l’utilisateur (voir 13.1) : elle est la référence de S5-02. Le Dashboard actuel est en plus capturé par sonde (L0) pour une comparaison pixel à pixel reproductible, la pièce jointe n’existant pas comme fichier dans le dépôt. |
| A4 | Solver = moteur Conditions + gateway d’outils. Aucun second moteur. |
| A5 | Le bouton de S1 est un atome ordinaire (forme/texte) portant une interaction à déclencheur d’activation. Pas de nouveau type « bouton ». |
| A6 | Axes X/Y et conservation des proportions ajoutés à l’outil Taille existant. |
| A7 | Template = projet tagué `template` + `properties.project_template {scope: personal|system, revision}`. Instance liée = `properties.template_link {source_project_id, source_revision}` ; chaque atome d’instance porte `template_slot_id` = identité stable de l’atome source. |
| A8 | Le mode de travail est persisté **à la fermeture** (changement de projet, retour Dashboard, `pagehide`) dans `work_mode`, puis restauré à l’ouverture. Une instance embarquée n’a pas de mode propre. |
| A9 | Les liaisons de données sont des interactions (déclencheur « source modifiée ») + action générique « régler une propriété » (outil existant réutilisé s’il existe). |
| A10 | Date/Heure et Météo extraites du Dashboard vers des sources partagées ; le Dashboard les consomme (aucune duplication). |
| A11 | Slider générique créé comme composant réutilisable, valeur en propriété. |
| A12 | Le Dashboard-template n’est activable qu’en test ; l’ancien reste en place. |
| A13 | Moniteur = records `generic_record` existants ; source de test. |
| A14 | Ordre des contacts = ordre système (alphabétique, propriétaire en tête) ; aucune « récence » inventée. |
| A15 | Zone centrale = page du template alimentée par l’interaction du leader. |
| A16 | Option « dossier » ajoutée au panneau Média existant. |
| A17 | **Décision utilisateur (30 sept. 2026)** : pour l’instant, le même template d’accueil sert à tous les niveaux de maîtrise. C-15 se réduit à vérifier qu’aucun niveau ne change de template d’accueil. |
| A18 | Départage de règles dynamiques = champ `order` explicite choisi par l’auteur (même contrat que `midi_binding.order`). |

### 13.4 Questions en suspens (décision par défaut appliquée en attendant)

1. ~~Capture du Dashboard~~ — **résolu** : fournie en pièce jointe par l’utilisateur.
2. ~~Maîtrise → template d’accueil~~ — **résolu** : même template d’accueil pour tous les niveaux.
3. **Priorité entre plusieurs règles dynamiques** (S2) — *Défaut :* ordre explicite `order` fixé par l’auteur.
4. **« Contacts récents »** — le système ne connaît pas de récence. *Défaut :* ordre système alphabétique.
5. **Stop** (S4) — *Défaut :* sémantique native de `projectViewTransport.stop`.
6. **Changer le template d’un élément déjà rempli** (S2) — *Défaut :* les valeurs sont reportées sur les slots de même `template_slot_id` ; les autres sont abandonnées dans l’instance (jamais dans la ressource originale).

### 13.5 Plan de réalisation par lots

| Lot | Contenu | Règles / tests | Réalisation |
|---|---|---|---|
| L0 | Capture de référence du Dashboard actuel (droitier/gaucher). | A3, S5-02 | **RÉUSSI** — `temp/templates_interactivity/l0_dashboard_baseline.probe.mjs`, preuves `temp/probe_reports/templates_interactivity/L0_baseline/`. Structure identique à la capture fournie. Constat : la latéralité ne bascule le Dashboard que si elle est persistée dans le profil (le poller de `eVe/user/background.js` rétablit la valeur serveur). |
| L1 | Persistance du mode de travail à la fermeture. | R05–R06, C-03 | **RÉUSSI** — nouveau `eVe/domains/rendering/project_work_mode_persistence.js` (propriété `work_mode` du record projet ; fermeture = sortie du projet via `eve:workspace-mode-changed`, ou `pagehide` noté de façon synchrone puis reporté à la réouverture) ; `restoreProjectWorkModeValue` ajouté à `project_work_mode_state.js` ; restauration branchée dans `project_workspace_activation_runtime.js`. **Défaut préexistant corrigé** : rouvrir un projet en Consultation/Performance échouait (`workspace_main_menu_overlay_missing`) parce que le menu principal y est vide par contrat — `workspace_main_menu_visibility.js` l’accepte désormais. Sonde `temp/templates_interactivity/l1_work_mode_persistence.probe.mjs` : 10/10. |
| L2 | Projet-template, instanciation liée, synchronisation structure/données. | R01–R04, R10–R14, R19, C-01/02/05–07 | **RÉUSSI** — `eVe/domains/templates/project_template_model.js` (pur : tag `template`, `project_template`, `template_link`, `template_slot_id`, `template_instance_id`, planificateur `planTemplateInstanceSync`) et `project_template_runtime.js` (marquer/lister/instancier/synchroniser, propagation vivante sur `atome:changed`, synchro à l’ouverture branchée dans `project_workspace_activation_runtime.js`). Commandes Mystic `template_toggle` / `from_template` sur les tuiles projet du Dashboard (taxonomie, `main_menu_edit_content.js`, i18n FR/EN, `context_target.js`, `mystic_context_items_runtime.js`, `dashboard_item_mystic_menu.js`). Sondes : `l2_template_model.probe.mjs` 11/11 (pur), `l2_templates_real_app.probe.mjs` 23/23 (app réelle). C-02 (droits) : aucune écriture ne contourne le serveur ; test multi-comptes reporté à S5. |
| L3 | Instance embarquée (page liée) et héritage du mode du parent. | R08, C-04 | **RÉUSSI** — `instantiateProjectTemplate(id, { targetProjectId })` crée un conteneur `page` portant `template_link` ; ses atomes vivent dans le projet parent (mode hérité par construction), décalés de la position du conteneur ; cycle d’imbrication refusé (`template_instance_cycle`). Couvert par `l2_templates_real_app.probe.mjs`. |
| L4 | Type `interaction` + moteur (cible fixe/dynamique, conditions, cascade, garde de mode et anti-boucle). | R25, R27–R28, C-09/10 | **RÉUSSI** — `atome/src/shared/core_atome_types.js` (type `interaction`), `eVe/intuition/runtime/interaction_model.js` (pur) et `interaction_runtime.js` (stockage = atomes du projet, résolution par le moteur Conditions, exécution par `invokeToolGateway` avec la cible en `selection_ids` — contrat canonique des outils), `eVe/domains/rendering/interaction_surface_layer.js` (toucher hors Édition). Garde de mode : `authorizeProjectTool` accepte les appels pendant une exécution réelle (jeton actif, appels imbriqués compris). Comparaison numérique générique des quantités avec unité (« 40px », « 50% ») dans `conditions/registry.js` et `property_catalog.js` — aucune propriété privilégiée. Sondes : `l4_conditions_units.probe.mjs` 5/5, `l4_interaction_real_app.probe.mjs` 14/14. |
| L5 | Activité Interactivité + panneau Interaction (Finder, conditions imbriquées, options natives). | R22–R26, C-08 | **RÉUSSI** — `eVe/intuition/runtime/bevy_panel/bevy_panel_interaction_runtime.js` : trois blocs *Quand / Sur quoi / Faire* ; groupes du composant Conditions existant reliés par ET/OU (option générique `listActions` ajoutée au composant) ; outils = vraies tuiles du ruban (`buildBevyMenuToolNode`) et vrais curseurs (`buildBevyToolSliderNode`) ; paramétrage par capture de l’usage réel de l’outil (`beginToolInvocationCapture`, `tool_gateway.js`) sans effet sur le projet. Ouverture par l’outil `ui.interaction.panel` (commande `interaction`, panneau on/off), activité `interactivity`. Sonde `l5_interaction_panel.probe.mjs` 17/17 (vrai clic sur une tuile, exécution par vrai toucher en Consultation, *Tester* en Édition). |
| L6 | S1 : outil Taille X/Y/proportions, projet-exemple, tests S1-01…16. | S1 | **RETIRÉ** (décision utilisateur) — exemples reportés ; aucun axe X/Y ajouté : le système reste agnostique (toute propriété, tout outil). Les critères S1-01…08 sont couverts par la sonde L4 sur des propriétés quelconques. |
| L7 | Sources partagées (Date/Heure, Météo, Contacts, Calendrier, News), liaison de données ; S3-01…11. | R20, R30, S3 | **RETIRÉ** (décision utilisateur : exemples à tester plus tard). |
| L8 | Slider générique + liaison bidirectionnelle au transport ; S4-01…13. | S4 | **RETIRÉ** (décision utilisateur). Le déclencheur `transport` existe dans le moteur. |
| L9 | Liste → fiches (instances liées, choix de template, liaisons de placeholders, import dossier) ; S2-01…19. | S2 | **RETIRÉ** (décision utilisateur). Les instances liées/embarquées (L2/L3) sont en place. |
| L10 | Dashboard comme template système (rails, leaders, épinglés, zone centrale, Nouveau), 2 instances, propagation ; S5-01…28. | R17–R19, S5 | **RETIRÉ** (décision utilisateur : peut-être fait à la main plus tard). |

Preuves : `temp/probe_reports/templates_interactivity/<lot>/`. Statuts : RÉUSSI / ÉCHEC / BLOQUÉ / NON EXÉCUTÉ.


### 13.6 Recadrage de la mission par l'utilisateur (30 septembre 2026, soir)

- Les projets-exemples (S1 à S4) ne sont pas à construire maintenant ; ils seront testés plus tard.
- Le Dashboard comme template système (S5) n'est pas urgent ; l'utilisateur le fera peut-être à la main.
- Rien de spécifique : toute propriété peut être conditionnée et tout outil peut être une action. Les axes X/Y de Redimensionner (issus de S1) ont été abandonnés et la source `geometry` remplacée par une comparaison numérique générique.
- Le panneau Interaction n'utilise que des éléments existants ; un outil y apparaît avec sa vraie apparence et on le paramètre en l'utilisant.

### 13.7 État final

**Livré et vérifié dans l'app réelle** (serveur de dev 3001, Playwright, un compte de test) : L0, L1, L2, L3, L4, L5.

| Sonde (`temp/templates_interactivity/`) | Résultat |
|---|---|
| `l0_dashboard_baseline.probe.mjs` | 2/2 |
| `l1_work_mode_persistence.probe.mjs` | 10/10 |
| `l2_template_model.probe.mjs` (pur) | 11/11 |
| `l2_templates_real_app.probe.mjs` | 23/23 |
| `l4_conditions_units.probe.mjs` (moteur réel) | 5/5 |
| `l4_interaction_real_app.probe.mjs` | 14/14 |
| `l5_interaction_panel.probe.mjs` | 17/17 |
| `taxonomy_validate.probe.mjs` (validateur réel) | 1/1 |

Preuves : `temp/probe_reports/templates_interactivity/<lot>/report.json` et captures PNG.

**Défauts préexistants corrigés en chemin** : réouverture d'un projet en Consultation/Performance (`workspace_main_menu_overlay_missing`) ; outils bloqués hors Édition même pour une action configurée par l'auteur.

**Limites connues** :
- un outil dont l'usage ne passe pas par le gateway d'outils (ex. navigation d'espace de travail) ne peut pas être capturé : Organiser/Dashboard sont exclus du catalogue ;
- un outil à champ de saisie (`input_box`, ex. Aide, Communication) garde son champ dans le ruban : dans le panneau, on le paramètre en l'utilisant depuis le ruban pendant la capture ;
- le déclencheur « Changement » réagit à toute propriété de l'objet (pas encore de choix de propriété dans le panneau) ;
- l'accès à la palette d'activités « Interactivité » a été vérifié par la taxonomie et l'ouverture par l'outil, pas par un geste sur le sélecteur d'activité.

### 13.8 Seconde phase (30 septembre 2026, nuit) : templates livrés, Matrix, outils transverses

Demande de l'utilisateur : réaliser deux ou trois templates, dont le Tableau de bord d'après la capture, des templates de News (vidéo, audio, texte avec tags, publication à tous), un outil Matrix réutilisable pour afficher les collections, et les outils visuels manquants (effet de fond, ombre).

**Livré**

| Élément | Fichiers | Principe |
|---|---|---|
| Module **Matrix** | `eVe/domains/matrix/matrix_module_{model,runtime}.js` | Un atome ordinaire `module: 'matrix'`. Il est rendu par une instance EMBARQUÉE du runtime du Dashboard : mêmes données, layout, cartes, verre, création guidée (court/long), défilement, latéralité. Options : `matrix_categories`, `matrix_headers`, `layout_fill: 'surface'`. Passif en Édition (l'atome se sélectionne et se déplace), interactif en Consultation et Performance. |
| Runtime du Dashboard paramétré | `eVe/domains/dashboard/dashboard_bevy_ui_runtime.js`, `dashboard_bevy_ui_tree.js`, `dashboard_data_controller.js` | Option `embedded` (arbre propre, cadre, colonne d'en-têtes masquable, catégories, zones déléguées aux Interactions). Le Dashboard principal est inchangé (sonde L0 verte). Records translatés dans le cadre, découpés au cadre, profondeurs relatives à l'atome. |
| Outils Matrix | `ui.matrix.place` (palette Créer › Matrix : Tout, Calendrier, News, Contacts, Moniteur, Projets), `ui.matrix.focus` (rubrique), `ui.matrix.create` (guidé ou immédiat) | Outils d'usage, autorisés dans tous les modes. |
| Interactions : zones et appui long | `interaction_model.js`, `interaction_runtime.js` | Déclencheur `hold`, filtre `zone`, déclencheur multi-atomes (`atome_ids`, bouton = forme + libellé), délai de garde de 15 s par étape. |
| **Templates système** | `eVe/domains/templates/system_template_catalog.js`, `system_template_runtime.js` | Projets-templates (scope system) décrits par références et installés ou mis à jour dans le compte (versionnés) ; instances liées ; références internes remappées sur l'instance (synchro en deux passes). |
| Tableau de bord (template) | catalogue `dashboard` v2 | Un Matrix plein écran avec en-têtes, plus trois Interactions : rubrique (`header_filter` → `ui.matrix.focus`), Nouveau guidé (`header_new` → `ui.matrix.create` guided), Nouveau immédiat (`hold` sur `header_new` → immediate). Le Moniteur garde son en-tête, son « Nouveau » est sans effet. |
| News vidéo / audio / texte | catalogue `news_video`, `news_audio`, `news_text` v3 | Vraie News (création canonique, contribution de l'auteur) dont Titre et Corps deviennent des placeholders. Le template apporte le placeholder vidéo ou audio (capture au toucher) et les boutons Importer (panneau Média), Tags (liste des 15 tags prédéfinis + création) et Publier (`ui.news.publish`, à tous). L'instance s'ouvre en Consultation. |
| Création guidée | `dashboard_creation_catalog.js`, `dashboard_creation_runtime.js`, `dashboard_creation_actions.js` | « Nouveau » News propose Vidéo, Audio, Texte, puis les formes existantes. « Nouveau » Projet propose une famille Templates › Tableau de bord. Les templates système n'apparaissent pas dans la rangée Projets. |
| Outil **Effet de fond** | `eVe/intuition/tools/backdrop.js`, `backdrop_effect_model.js`, `bevy_panel_backdrop_runtime.js`, `selection_effect_apply.js` | Verre dépoli (`material.backdrop` : flou, teinte, opacité) sur tout objet, comme l'ombre : palette Effets, rail des objets, panneau (flou, teinte, couleurs, retirer). |
| Ombre | `eVe/intuition/tools/shadow.js` | Respecte une cible explicite (`selection_ids`). |
| Ouvrir un panneau | `ui.panel.open` | Outil générique (ouvrir / fermer / basculer un panneau par sa clé), même route que les rails. |

**Sondes (app réelle, `temp/templates_interactivity/`)**

| Sonde | Résultat |
|---|---|
| `m1_matrix_module.probe.mjs` | 11/11 |
| `t1_dashboard_template.probe.mjs` | 13/13 : vrais gestes, rubrique, Nouveau guidé, Moniteur inactif, gaucher/droitier, appui long, propagation v1 → v2 |
| `t2_news_templates.probe.mjs` | 20/20, plus 1 **BLOQUÉ** : la publication elle-même. Le serveur de dev (lancé à 9 h 09) ne connaît pas encore la route `news/publish` ajoutée à 21 h 06 et répond « Request timeout ». Il faut le redémarrer. |
| `b1_backdrop_tool.probe.mjs` | 5/5 |
| Régression L0, L1, L2 (pure + app), L4 (units + app), L5, taxonomie | toutes vertes |

Comparaison visuelle : `T1_dashboard_template/template_dashboard_right.png` et `template_dashboard_left.png` reproduisent la capture fournie (fond, en-têtes teintés, horloge, météo, contacts, projets).

**Limites**
- Le Tableau de bord-template ne remplace pas le Dashboard d'accueil : il s'ouvre comme un projet (Nouveau › Projets › Templates › Tableau de bord). En faire l'accueil par défaut est une décision à prendre.
- Les rangées d'un Matrix se choisissent à la pose (palette Matrix) ; il n'y a pas encore de réglage des rangées après coup dans un panneau.
- Le rail Moniteur reste vide : il n'existe aucune source de monitoring (conforme à la demande).
