# Next Task — Codex Cloud : intégration, synchronisation et tests autonomes atome/eVe
Date : 11 octobre 2026
Statut : À réaliser — environnement de test uniquement

## Mission
Auditer l'architecture existante, établir un plan exécutable, implémenter ou réparer les fonctionnalités manquantes, automatiser les tests réels sur iPhone, macOS/Tauri et Web, et obtenir une validation reproductible. Ne pas se limiter à produire un rapport ou des tests fictifs.

## Contraintes non négociables
- **atome.one est l'unique serveur central de référence** pour authentification, données partagées, synchronisation et restauration entre appareils. Aucun Fastify local ne doit servir de source de vérité pour ces scénarios.
- Les écritures hors ligne sont stockées localement de manière durable, puis transmises à atome.one à la reconnexion ; les autres appareils récupèrent les changements depuis atome.one.
- **Tests uniquement** : isoler comptes, fichiers, bases, secrets et ressources de test. Ne jamais utiliser ou altérer des données réelles.
- Prévoir une remise à zéro complète des **données de test** après campagne, sur approbation explicite uniquement, avec sauvegarde et vérification de l'isolation. Ne jamais effacer automatiquement une base globale.
- Respecter l'architecture et les composants existants d'atome/eVe : JavaScript côté interface, outils natifs, API/MCP existants, conventions du projet. Ne pas introduire TypeScript ni d'interface générique.
- Demander les accès ou informations manquants (SSH, comptes tests, appareils, certificats, environnements, autorisations) précisément, sans inventer leur disponibilité. Ne jamais publier de secret dans le code, les logs ou les rapports.
- Travailler sur une branche dédiée ; documenter les modifications, tests, preuves, risques et procédure de retour arrière. Déploiements impactants soumis à validation.

## 0. Audit et plan
1. Examiner dépôts, documentation, agents Codex, clients Web, Tauri et iOS, backend distant atome.one, Fastify, authentification, stockage, communication, MCP et tests existants.
2. Cartographier les flux de session, identités, données, synchronisation, caches locaux et droits d'accès.
3. Identifier les mécanismes réels de SMS, mot de passe, gestion de conflits et collaboration ; réutiliser l'existant avant d'ajouter quoi que ce soit.
4. Vérifier accès SSH, configuration du serveur distant, environnements de test, sauvegardes et observabilité.
5. Produire un plan ordonné avec dépendances, risques, critères d'acceptation et points nécessitant validation.

## 1. Connexion distante unique
- Faire pointer les applications Web, Tauri macOS et iOS vers **atome.one** pour toutes les opérations de synchronisation et de restauration.
- Vérifier transport sécurisé, identité, autorisations, configuration par environnement, reprise sur erreur et absence de dépendance au serveur Fastify local pour les scénarios distants.
- Conserver les outils locaux de développement sans les confondre avec l'infrastructure centrale.

## 2. Authentification et persistance de session
- Créer un compte de test avec numéro de téléphone ; vérifier le code SMS et sa validité.
- Si un mot de passe a été défini par l'utilisateur, vérifier que le panneau propose et valide l'authentification par mot de passe centralisé ; sinon permettre la récupération par téléphone/SMS selon le flux prévu.
- Tester expiration, reconnexion, déconnexion explicite, révocation, changement d'appareil, perte réseau et erreurs de saisie.
- Vérifier que la fermeture/réouverture de l'application préserve la session valide, mais qu'une réinstallation peut exiger une nouvelle authentification sécurisée.

## 3. Persistance des fichiers et restauration
- Sur iPhone, créer dossiers, fichiers, médias et projets de test avec contenus vérifiables et identifiants uniques.
- Synchroniser avec atome.one ; fermer/réouvrir l'application ; se déconnecter/reconnecter ; désinstaller/réinstaller ; se reconnecter avec le même numéro et la méthode d'authentification prévue.
- Vérifier restauration complète depuis atome.one des contenus, dossiers, hiérarchies, métadonnées, références et autorisations.
- Refaire les scénarios sur macOS/Tauri et Web, puis restaurer sur un deuxième appareil.
- Comparer manifestes, empreintes et contenus : zéro perte, doublon ou corruption.

## 4. Mode hors ligne et résolution de conflits
- Couper le réseau, créer/modifier/renommer/déplacer des fichiers et dossiers, puis redémarrer l'application toujours hors ligne.
- Vérifier la durabilité des changements locaux et leur transmission automatique vers atome.one au retour du réseau.
- Sur un autre appareil, vérifier récupération de l'état central.
- Tester modifications concurrentes, suppression contre modification, pièces jointes, uploads interrompus, réseau intermittent, reprises, idempotence et gestion explicite des conflits. Aucune perte silencieuse.

## 5. Communication, partage et collaboration
- Créer deux utilisateurs de test distincts sur deux appareils.
- Envoyer un document de A vers B ; vérifier notification/réception, téléchargement, ouverture, droits, refus et révocation d'accès.
- Modifier le document côté B ; vérifier sa synchronisation par atome.one et la visibilité côté A.
- Tester édition simultanée du même fichier, propagation temps réel, présence si existante, reconnexion et conflits ; ne pas inventer de protocole ou d'API non présents.
- Vérifier isolation stricte des comptes et absence de fuite entre utilisateurs.

## 6. Pilotage automatisé des appareils
- Web : utiliser le navigateur automatisé existant, ou Playwright si justifié.
- iPhone/iOS : utiliser WebDriverAgent et, si nécessaire, Appium, via un Mac agent compatible, un iPhone réel/simulateur et les autorisations/certificats requis.
- macOS/Tauri : piloter l'application installée localement avec les outils d'automatisation compatibles et disponibles.
- Serveur atome.one : SSH autorisé, journaux, métriques, tests d'API, sauvegardes et déploiement contrôlé.
- Exécuter de véritables parcours UI et API, capturer journaux et preuves. Si un appareil ou accès manque, indiquer **NON TESTÉ**, jamais **RÉUSSI**.

## 7. Matrice et robustesse
- Plateformes : iPhone, macOS/Tauri, Web ; deuxième appareil lorsque requis.
- Expertise : débutant, intermédiaire, expert.
- Modes d'utilisation pertinents : édition, consultation/consumer et exécution, selon les modes réellement implémentés.
- Réseau : connecté, déconnecté, intermittent, lent ; interruption et reprise.
- Tester latence, fluidité, CPU, mémoire, plantages, blocages, fuites de ressources et stabilité après plusieurs cycles.
- Répéter les scénarios après toute correction et exécuter les régressions associées.

## 8. Boucle autonome de correction
Pour chaque échec : reproduire → collecter preuve/logs → identifier la cause racine → corriger le composant réel → tester localement → déployer dans l'environnement de test si autorisé → rejouer le scénario sur appareils → lancer les régressions → documenter.
Ne pas contourner un test en l'affaiblissant ; ne pas remplacer les outils natifs par des simulacres.

## 9. Données temporaires et remise à zéro
- Prévoir un namespace/base/tenant de test clairement isolé sur atome.one, avec sauvegarde et procédure de restauration.
- Documenter un script ou processus de purge ciblée, avec dry-run, liste des ressources concernées, sauvegarde vérifiée et approbation humaine explicite.
- Après les tests, **préparer** la remise à zéro ; ne pas la déclencher sans autorisation. Conserver code, configurations et infrastructure.


## Précision prioritaire — appareils et contrôle distant (11 octobre 2026)
- **iPad prioritaire pour tous les tests iOS**, plutôt qu'iPhone : l'iPad de l'utilisateur est plus disponible. Utiliser un iPhone seulement pour les vérifications spécifiques au téléphone ou si l'iPad ne permet pas le scénario ; noter ces exceptions.
- Piloter **réellement l'iPad via WebDriverAgent (WDA)**, éventuellement orchestré par Appium, depuis un Mac agent configuré. Vérifier la connexion, la signature et les permissions avant de déclarer l'automatisation opérationnelle.
- Tester en parallèle **une version Tauri** et **une version iOS sur iPad**. Ces deux clients doivent communiquer avec **atome.one** comme serveur central ; jamais entre eux directement comme source de vérité.
- Répéter entre Tauri et iPad les scénarios de session, fichiers/dossiers, réinstallation/restauration, mode hors ligne, synchronisation, partage et collaboration.
- Lancer les tests depuis les outils de contrôle effectivement disponibles ; demander à l'utilisateur uniquement les accès ou autorisations indispensables qui manquent.

## Livrables et critères d'acceptation
1. Inventaire de l'existant et plan technique exécutable.
2. Correctifs sur branche dédiée et instructions de déploiement/rollback.
3. Suite de tests automatisés et matrice des appareils/scénarios avec preuves.
4. Rapport PASS/FAIL/BLOCKED/NOT TESTED, causes, performances et limitations.
5. Procédure documentée de réinitialisation sécurisée des données de test.

**Acceptation** : utilisateur A retrouve depuis atome.one tous ses projets après fermeture, déconnexion, réinstallation et changement d'appareil ; peut travailler hors ligne puis synchroniser ; partage avec utilisateur B ; les deux collaborent en temps réel sans perte ni corruption. Tous les tests annoncés réussis ont réellement été exécutés.

**Première action Codex** : vérifier accès, architecture et appareils, produire le plan et demander uniquement les informations indispensables manquantes ; poursuivre ensuite implémentation, réparations et validations dans les limites des autorisations obtenues.


## Exigence supplémentaire — tests extensifs après réinstallation et purge locale
Exécuter **à chaque cycle majeur de validation** une remise à zéro du client et une restauration avec **le même utilisateur de test**, sur les trois plateformes. Ne jamais confondre suppression des données locales et suppression des données persistées sur atome.one.

### iPad / iOS (prioritaire)
1. Créer ou retrouver un compte de test avec numéro de téléphone ; créer projets, dossiers, documents, messages et historiques d'échanges, avec identifiants et empreintes vérifiables.
2. Attendre et vérifier la synchronisation effective sur atome.one ; capturer un état de référence.
3. Fermer l'application, la **désinstaller complètement**, la réinstaller avec l'outil de déploiement disponible, puis la relancer avec WebDriverAgent.
4. Se réauthentifier avec **le même compte** via numéro de téléphone/SMS ou mot de passe selon le parcours prévu ; restaurer depuis atome.one.
5. Vérifier exhaustivement fichiers, dossiers, contenus, métadonnées, messages envoyés/reçus, conversations, partages, autorisations et état de session. Une désinstallation peut effacer les identifiants locaux : la reconnexion sécurisée est acceptable, la perte des données serveur ne l'est pas.
6. Répéter les cycles, y compris avec interruptions réseau et changements d'appareil.

### macOS / Tauri
1. Installer et utiliser la version Tauri reliée à atome.one ; créer et synchroniser les mêmes catégories de données.
2. Fermer, **désinstaller et réinstaller** l'application ; selon le scénario, purger explicitement son stockage/cache local de test, sans toucher aux données du serveur ni aux autres comptes.
3. Reconnecter le même utilisateur ; comparer l'état restauré à l'état de référence, notamment les messages et historiques de communication.
4. Répéter et contrôler les différences entre une simple réinstallation et une purge complète des données locales.

### Web
1. Tester une reconnexion ordinaire, puis une **purge du cache, du stockage local, d'IndexedDB, des cookies et des données de site** du profil de test, selon les mécanismes réellement utilisés.
2. Recharger la version Web, se reconnecter avec le même utilisateur, restaurer les données depuis atome.one.
3. Vérifier documents, dossiers, projets, messages, conversations et partages ; tester aussi un profil navigateur vierge et les cycles répétés.

### Accès SMS et secrets
- L'utilisateur fournira ultérieurement les **clés et accès nécessaires** à la validation du numéro de téléphone et des SMS. Les demander au moment où ils deviennent indispensables, via un moyen sécurisé ; ne pas les placer dans le Markdown, le dépôt, les captures ou les logs.
- Avant leur disponibilité, préparer l'automatisation, les scénarios et l'infrastructure, mais signaler les validations SMS réelles comme **BLOQUÉES**, sans simuler leur réussite.
- Réutiliser les mécanismes existants d'authentification, de vérification et de stockage sécurisé des secrets.

### Critères de validation supplémentaires
- Tester les scénarios installation neuve, fermeture/réouverture, déconnexion/reconnexion, désinstallation/réinstallation, purge locale et nouvel appareil.
- Répéter les tests avec **le même compte** pour démontrer que les données sont réellement conservées sur atome.one et restaurées sans dépendance au cache.
- Contrôler l'historique complet des **messages échangés**, l'ordre, les pièces jointes, les destinataires, les statuts pertinents et les permissions.
- Enregistrer les résultats et preuves pour chaque plateforme, cycle et état réseau ; mesurer le temps d'installation, de reconnexion et de restauration.
- Si la réinstallation ou la purge échoue, corriger puis rejouer l'intégralité du parcours jusqu'à validation. Ne pas annoncer PASS si un appareil n'a pas réellement été piloté.
