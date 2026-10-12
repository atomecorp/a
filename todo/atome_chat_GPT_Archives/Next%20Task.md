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

## Livrables et critères d'acceptation
1. Inventaire de l'existant et plan technique exécutable.
2. Correctifs sur branche dédiée et instructions de déploiement/rollback.
3. Suite de tests automatisés et matrice des appareils/scénarios avec preuves.
4. Rapport PASS/FAIL/BLOCKED/NOT TESTED, causes, performances et limitations.
5. Procédure documentée de réinitialisation sécurisée des données de test.

**Acceptation** : utilisateur A retrouve depuis atome.one tous ses projets après fermeture, déconnexion, réinstallation et changement d'appareil ; peut travailler hors ligne puis synchroniser ; partage avec utilisateur B ; les deux collaborent en temps réel sans perte ni corruption. Tous les tests annoncés réussis ont réellement été exécutés.

**Première action Codex** : vérifier accès, architecture et appareils, produire le plan et demander uniquement les informations indispensables manquantes ; poursuivre ensuite implémentation, réparations et validations dans les limites des autorisations obtenues.
