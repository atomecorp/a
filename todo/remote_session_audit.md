# Mission : concevoir le système de contrôle distant d’Atome

Analyse le projet Atome et sa documentation, puis conçois une stratégie technique complète pour mettre en place un système universel de contrôle distant.

Le système devra servir à plusieurs usages :

- débogage distant ;
- support utilisateur ;
- assistance ;
- tutoriels ;
- administration ;
- prise de contrôle temporaire par un utilisateur autorisé.

## Acteurs du workflow complet

Le workflow comprend cinq acteurs :

1. **ChatGPT distant**  
   Interface utilisée par le développeur pour dialoguer avec Codex, analyser les problèmes et demander des corrections.

2. **Codex local ou distant**  
   Agent de développement chargé de modifier le code, compiler, lancer Atome, lire la console locale et corriger les erreurs.

3. **Atom.one**  
   Serveur central chargé de l’authentification, des autorisations, de la gestion des sessions et du relais sécurisé des échanges.

4. **Instance Atome locale**  
   Application exécutée sur la machine contrôlée. Elle reçoit les commandes, exécute les actions, produit les événements et transmet les logs.

5. **Client Atome distant**  
   Interface depuis laquelle un utilisateur autorisé observe ou contrôle l’instance locale.

## Principe central

Atom.one doit être un tuyau sécurisé et un gestionnaire de sessions.

Il doit :

- authentifier les utilisateurs et les instances ;
- créer et fermer les sessions ;
- appliquer les permissions ;
- relayer les commandes ;
- relayer les événements ;
- relayer les logs et la console ;
- maintenir l’état de connexion ;
- refuser toute commande non autorisée.

Atom.one ne doit pas :

- déboguer automatiquement ;
- modifier le code ;
- prendre des décisions à la place du développeur ;
- stocker automatiquement des captures, vidéos ou fichiers audio ;
- déclencher des corrections automatiques.

## Flux à gérer

Prévoir des canaux logiques séparés pour :

- authentification ;
- autorisation ;
- contrôle ;
- événements ;
- état de l’application ;
- logs ;
- console ;
- présence et statut de connexion.

Les médias lourds ne doivent pas faire partie de la première version.

L’audio, la vidéo, le partage d’écran et la traduction pourront être ajoutés plus tard comme canaux optionnels et indépendants.

## Modes d’utilisation

Le système ne doit pas avoir plusieurs architectures différentes.

Il doit utiliser une seule infrastructure avec différents profils de permissions.

Prévoir au minimum les rôles suivants :

- lecture seule ;
- support ;
- assistant ;
- développeur ;
- administrateur.

Pour chaque rôle, définir précisément :

- les données visibles ;
- les commandes autorisées ;
- l’accès aux logs ;
- l’accès à la console ;
- la possibilité de prendre ou de céder le contrôle ;
- la durée de validité de la session.

## Workflow attendu

Décrire précisément le workflow suivant :

1. Codex compile et lance l’instance Atome locale.
2. L’instance locale s’authentifie auprès d’Atom.one.
3. L’utilisateur distant se connecte à Atom.one.
4. Atom.one authentifie l’utilisateur et charge ses permissions.
5. Une session de contrôle est créée.
6. Le client distant reçoit l’état de l’instance locale.
7. L’utilisateur envoie une commande.
8. Atom.one valide les permissions.
9. La commande est transmise à l’instance locale.
10. L’instance locale exécute la commande.
11. Le résultat, les événements et les logs sont renvoyés via Atom.one.
12. Le client distant affiche le résultat.
13. En cas de problème, l’utilisateur consulte les logs.
14. L’utilisateur retourne dans ChatGPT et demande à Codex d’analyser ou de corriger.
15. Codex lit la console locale, modifie le code, recompile et relance.

## Gestion des erreurs

Prévoir les cas suivants :

- instance locale déconnectée ;
- client distant déconnecté ;
- serveur Atom.one temporairement indisponible ;
- commande expirée ;
- commande refusée ;
- session expirée ;
- utilisateur révoqué ;
- application locale bloquée ;
- crash complet ;
- perte de réseau ;
- reconnexion après interruption ;
- duplication ou répétition accidentelle d’une commande.

Le serveur peut mesurer la disponibilité avec des heartbeats, mais il ne doit pas prendre de décision fonctionnelle automatique.

Il doit uniquement exposer des états clairs comme :

- connecté ;
- déconnecté ;
- en attente ;
- commande transmise ;
- commande refusée ;
- commande expirée ;
- application non réactive.

## Sécurité

Définir une stratégie pour :

- authentification forte ;
- mots de passe correctement hachés ;
- jetons temporaires ;
- expiration des sessions ;
- révocation immédiate ;
- permissions à durée limitée ;
- chiffrement des échanges ;
- protection contre le rejeu de commandes ;
- identifiants uniques de commandes ;
- journal d’audit ;
- validation stricte côté serveur ;
- validation stricte côté instance locale ;
- limitation du nombre de tentatives ;
- séparation des environnements de développement et de production.

Ne jamais faire confiance au client distant.

Chaque commande doit être contrôlée par Atom.one puis validée une seconde fois par l’instance locale.

## Travail demandé

Produis les éléments suivants :

1. une analyse de faisabilité à partir du code existant ;
2. les incohérences éventuelles de cette architecture ;
3. les simplifications possibles ;
4. l’architecture technique recommandée ;
5. le workflow complet ;
6. les algorithmes principaux ;
7. les structures de données nécessaires ;
8. le protocole de messages ;
9. la machine à états d’une session ;
10. la gestion des erreurs et des reconnexions ;
11. le modèle d’autorisation ;
12. les risques de sécurité ;
13. un plan d’implémentation progressif ;
14. une V1 minimale réellement testable ;
15. les fichiers du projet qui devront être créés ou modifiés.

Ne commence pas immédiatement à coder.

Commence par inspecter le repository et la documentation existante.

Ensuite :

- confronte cette proposition à l’architecture actuelle ;
- signale clairement ce qui est impossible, inutile ou incohérent ;
- propose les corrections nécessaires ;
- fournis un plan précis avant toute modification du code.

La priorité est la suivante :

1. simplicité ;
2. robustesse ;
3. sécurité ;
4. faible latence ;
5. réutilisation pour tous les usages futurs ;
6. absence de duplication entre mode debug, support et prise de contrôle.