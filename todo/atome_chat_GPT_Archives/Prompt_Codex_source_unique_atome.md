# Prompt Codex — Construire la source de vérité unique d’atome/eVe

## Mission

Tu dois nettoyer, réconcilier et structurer l’ensemble des informations de pilotage du projet **atome/eVe**, aujourd’hui dispersées entre :

- le dossier `/atome` de la Librairie ChatGPT ;
- les fichiers situés ailleurs dans la Librairie mais concernant réellement atome, eVe ou Squirrel ;
- les roadmaps, fichiers `todo`, spécifications, notes et documents présents dans les dépôts GitHub concernés ;
- les Issues, Pull Requests, commits, branches et résultats de tests GitHub existants.

Le résultat doit être une **source de vérité unique sur GitHub**, cohérente, traçable et exploitable pour produire un rapport hebdomadaire fiable.

La typographie officielle est impérative : **atome** en minuscules et **eVe** avec un e minuscule, un V majuscule et un e minuscule.

## Principe fondamental

GitHub devient la source officielle pour le pilotage d’atome/eVe. La Librairie reste un espace d’entrée, de documentation de travail et d’archive, mais elle ne doit plus contenir une liste de tâches concurrente présentée comme officielle.

Ne déduis jamais l’état d’une tâche à partir de son seul intitulé ou d’une conversation. Distingue toujours :

- ce qui est demandé ou documenté ;
- ce qui existe réellement dans le code ;
- ce qui est relié à un commit ou à une Pull Request ;
- ce qui a seulement reçu une vérification rapide ;
- ce qui a été testé en profondeur ;
- ce qui reste incertain.

## Règles de sécurité et de méthode

1. Commence par lire intégralement les instructions de chaque dépôt : `AGENTS.md`, `README`, documentation interne et règles de contribution.
2. Commence par un audit en lecture seule. Ne modifie rien avant d’avoir produit l’inventaire et le plan de migration.
3. Ne supprime aucun document ou ancien `todo`. Archive-les avec un avertissement clair indiquant qu’ils ne sont plus la source officielle.
4. Travaille dans une branche dédiée. Ne pousse jamais directement sur la branche principale.
5. Préserve les modifications locales existantes et ne réinitialise jamais brutalement un dépôt.
6. Avant toute action difficilement réversible — suppression, déplacement massif, création d’un nouveau dépôt, changement des réglages d’un GitHub Project ou fusion — présente le plan précis et demande validation.
7. Ne copie jamais dans GitHub de secrets, clés, jetons, identifiants, données médicales ou personnelles, captures privées ou informations confidentielles sans rapport avec le pilotage technique.
8. Ne transforme pas automatiquement tous les fichiers de la Librairie en tâches. Classe d’abord chaque élément comme tâche, décision, spécification, référence, prototype, média, archive, doublon ou hors périmètre.
9. N’invente aucune fonctionnalité, aucun statut, aucun résultat de test et aucune correspondance entre deux documents.
10. Conserve pour chaque élément migré sa provenance exacte : chemin de la Librairie, chemin GitHub, Issue, commit, Pull Request ou autre source.

## Phase 1 — Inventaire en lecture seule

### Librairie

Inspecte récursivement :

- tout le dossier `/atome` ;
- les fichiers situés ailleurs dont le titre, le contenu ou les métadonnées concernent réellement atome, eVe ou Squirrel.

Ne te limite pas à une recherche par nom : certains documents utiles peuvent avoir des noms génériques comme `Next Task.md`, `Objectif.md`, `Test.md`, `roadmap.md` ou `todo.md`.

Pour chaque élément, relève :

- chemin et nom exacts ;
- date de modification ;
- type de contenu ;
- domaine concerné ;
- tâches ou décisions détectées ;
- doublons probables ;
- sensibilité éventuelle ;
- destination proposée.

### GitHub

Inspecte les dépôts atomecorp accessibles qui concernent atome, eVe et Squirrel :

- structure documentaire ;
- dossiers et fichiers `todo`, roadmap, documentation et tests ;
- Issues et GitHub Projects existants ;
- Pull Requests ouvertes et fusionnées ;
- commits pertinents ;
- branches actives ;
- workflows et résultats de tests existants.

Pour chaque tâche existante, cherche les preuves techniques associées. Un commit contenant des mots similaires n’est pas une preuve suffisante : vérifie le diff et le périmètre réel du changement.

### Livrable d’audit

Produis un tableau d’inventaire avec les colonnes suivantes :

| ID provisoire | Source | Élément | Type | Sujet | État déclaré | Preuve technique | Doublon/conflit | Destination proposée |
|---|---|---|---|---|---|---|---|---|

Ajoute ensuite :

- la liste des doublons certains ;
- la liste des doublons probables à arbitrer ;
- les contradictions entre documents ;
- les éléments orphelins ;
- les tâches annoncées comme terminées sans preuve ;
- les fonctionnalités présentes dans le code mais absentes des tâches ;
- les blocages d’accès ou de permissions.

Arrête-toi à la fin de cette phase pour présenter le plan de migration et obtenir l’accord humain avant les mutations importantes.

## Phase 2 — Modèle de pilotage canonique

Réutilise de préférence les outils GitHub existants. Si aucun système transversal adéquat n’existe, propose un dépôt privé de pilotage dans l’organisation atomecorp et un GitHub Project agrégeant les dépôts atome, eVe et Squirrel. Ne crée pas ce dépôt sans validation.

Les tâches opérationnelles doivent vivre dans des GitHub Issues reliées au GitHub Project. Les documents Markdown servent aux roadmaps, décisions, spécifications, procédures et rapports, mais pas à maintenir une seconde liste d’états concurrente.

### Deux axes obligatoirement séparés

#### Avancement de livraison

- À qualifier
- À faire
- En cours
- Implémenté
- Intégré
- Livré
- Bloqué
- Abandonné

#### Niveau de vérification

- Non testé
- Vérification rapide réussie
- Test fonctionnel réussi
- Régression testée
- Validé sur les plateformes prévues
- Échec connu

Une tâche peut donc être « Livrée » tout en étant « Vérification rapide réussie » ou « Non testée sur iPad ». Ne bloque pas tout le développement en exigeant une campagne approfondie avant de reconnaître l’implémentation.

### Champs minimaux de chaque tâche

- identifiant stable ;
- titre concret ;
- description et objectif utilisateur ;
- dépôt et domaine concernés ;
- plateformes concernées ;
- priorité ;
- état d’avancement ;
- niveau de vérification ;
- critères d’acceptation ;
- dépendances ;
- source d’origine ;
- liens vers Issues, commits et Pull Requests ;
- scénarios de test liés ;
- date de dernière vérification.

## Phase 3 — Déduplication et migration

1. Regroupe les formulations qui désignent manifestement la même action.
2. Conserve toutes les exigences utiles dans l’Issue canonique ; ne résume pas au point de perdre une contrainte.
3. Si deux sources se contredisent, ne choisis pas silencieusement. Crée un point d’arbitrage explicite.
4. Crée une Issue canonique pour chaque action réelle encore pertinente.
5. Relie chaque Issue à ses sources et preuves.
6. Replace les décisions durables dans des documents de décision versionnés.
7. Replace les spécifications dans une arborescence documentaire claire.
8. Archive les anciens `todo` dans un emplacement `archive/legacy-todos/` ou équivalent, avec la date de migration et un lien vers la nouvelle source officielle.
9. N’efface pas les originaux de la Librairie. Ajoute, lorsque la capacité existe, une indication claire vers la destination GitHub canonique.
10. Produis un manifeste de migration permettant de retrouver chaque ancien élément.

## Phase 4 — Tâche permanente « Test »

Retrouve dans la Librairie la tâche consacrée aux tests et transforme-la en référentiel permanent de non-régression basé en priorité sur des **scénarios utilisateur réels de bout en bout**, et non sur une accumulation de tests unitaires abstraits.

Cette tâche ou ce programme de test reste vivant et s’enrichit au fil du développement. Il ne doit pas être fermé définitivement.

Chaque scénario doit préciser :

- un identifiant stable ;
- l’objectif réel de l’utilisateur ;
- les préconditions ;
- les données ou comptes nécessaires ;
- les étapes concrètes ;
- le résultat attendu ;
- les plateformes à couvrir ;
- le dernier résultat : PASS, FAIL, BLOCKED ou NOT RUN ;
- la date, le build et le commit testés ;
- l’Issue de régression associée en cas d’échec.

Inclure progressivement les parcours critiques déjà identifiés, notamment : partage, collaboration, synchronisation, persistance après réinstallation, hors-ligne, conflits, Matrix, Keycloak, mediasoup, iPad prioritaire, Web, Tauri, Canvas/Bevy/WebGPU, Dashboard, Finder, télévision, audio et restauration depuis atome.one.

Les tests automatisés existants peuvent être conservés s’ils ont une utilité réelle, mais ils ne remplacent pas cette campagne fonctionnelle par scénarios.

## Phase 5 — Convention commits et preuves

Chaque branche, commit ou Pull Request nouvelle doit référencer l’Issue concernée.

Exemples :

```text
ATM-0124 Corrige la persistance Matrix après réinstallation
Refs #124
```

Une Pull Request peut fermer l’Issue d’implémentation avec `Closes #124`, mais le niveau de vérification reste indépendant. Les tests approfondis peuvent être suivis par une Issue liée séparée.

Pour les anciennes tâches, relie les commits existants seulement après vérification réelle du diff.

## Phase 6 — Rapport hebdomadaire fiable

Prépare un mécanisme de rapport hebdomadaire qui analyse une période explicite, en heure Europe/Paris, et s’appuie sur :

- Issues créées, modifiées, fermées ou rouvertes ;
- Pull Requests et commits réellement fusionnés ;
- changements de roadmap et décisions ;
- résultats de scénarios de test ;
- régressions ;
- tâches sans activité ;
- blocages ;
- écarts entre état déclaré et preuve disponible.

Le rapport doit séparer clairement :

1. développé ;
2. intégré ;
3. livré ;
4. vérifié rapidement ;
5. testé fonctionnellement ;
6. testé en non-régression ;
7. restant à tester ;
8. bloqué ou incertain.

Chaque affirmation technique doit comporter un lien vers la preuve GitHub correspondante. Si aucune preuve n’existe, écrire explicitement « déclaré/documenté, non vérifié dans le code ».

Enregistre les rapports dans un chemin versionné du type :

```text
reports/weekly/2026-W42.md
```

Si un workflow automatisé est possible, prépare-le et teste-le sur une période courte. Ne l’active de manière récurrente qu’après validation de sa sortie et sans exposer de secret.

## Résultats attendus

À la fin, fournir :

1. l’inventaire complet des sources examinées ;
2. le manifeste de migration ;
3. la liste des doublons fusionnés et des conflits restant à arbitrer ;
4. la structure GitHub canonique ;
5. les Issues et champs normalisés ;
6. les anciens `todo` archivés sans perte ;
7. le référentiel permanent « Test » ;
8. un état zéro daté de toutes les tâches ;
9. un premier rapport hebdomadaire basé sur des preuves ;
10. la liste exacte des opérations réalisées, commits créés, éléments non migrés et raisons.

## Critères de réussite

La mission est réussie si :

- une personne sait immédiatement où trouver l’état officiel d’une tâche ;
- aucune tâche active n’existe dans deux sources concurrentes ;
- chaque état technique est traçable jusqu’à une preuve ou marqué comme non vérifié ;
- l’avancement et le niveau de test sont indépendants ;
- les anciens documents restent récupérables ;
- les scénarios réels de non-régression sont maintenables et extensibles ;
- le rapport hebdomadaire peut être reproduit à partir de GitHub sans dépendre de souvenirs de conversation.

Commence maintenant par la **Phase 1 en lecture seule**. Ne prétends pas avoir nettoyé ou migré quoi que ce soit avant d’avoir effectivement vérifié et réalisé les opérations correspondantes.
