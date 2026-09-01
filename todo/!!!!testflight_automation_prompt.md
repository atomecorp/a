# Tâche : automatiser la publication d’une nouvelle build iOS sur TestFlight

Tu travailles directement dans le dépôt courant du projet **Atome**.

## Objectif

Je veux pouvoir lancer **une seule commande** qui :

1. détecte automatiquement la version et le numéro de build actuels ;
2. incrémente correctement le numéro de build ;
3. compile l’application iOS en mode Release ;
4. crée l’archive Xcode ;
5. exporte la build destinée à App Store Connect ;
6. envoie automatiquement cette nouvelle build vers **App Store Connect / TestFlight** ;
7. affiche clairement le résultat et les éventuelles erreurs.

Je gérerai ensuite moi-même sur le site **App Store Connect** les groupes TestFlight, les testeurs et la disponibilité de la build.

---

## ÉTAPE 1 — Vérifier ce qui existe déjà

**Ne crée rien immédiatement.**

Commence par inspecter le dépôt, en particulier le dossier :

`/scripts`

ou tout dossier équivalent contenant les scripts/outils de build et de déploiement.

Recherche également dans tout le dépôt les scripts ou configurations existants liés à :

- TestFlight
- App Store Connect
- upload
- deploy
- release
- archive
- exportArchive
- `xcodebuild`
- `altool`
- `notarytool`
- `iTMSTransporter`
- Fastlane
- incrémentation de `CURRENT_PROJECT_VERSION`
- `MARKETING_VERSION`
- numéro de build / version iOS

### Si un script existe déjà

Ne crée pas un doublon.

Analyse-le et indique :

- son chemin ;
- ce qu’il fait exactement ;
- comment il est censé être lancé ;
- s’il fonctionne encore avec les outils Apple/Xcode actuels ;
- ce qui lui manque par rapport à l’objectif décrit ici.

Si nécessaire, **améliore le script existant** plutôt que d'en créer un nouveau.

---

## ÉTAPE 2 — Identifier correctement le projet

Avant toute modification, détermine automatiquement :

- le `.xcodeproj` ou `.xcworkspace` utilisé ;
- le scheme correspondant à l’application principale ;
- le target principal iOS ;
- le Bundle Identifier ;
- `MARKETING_VERSION` actuelle ;
- `CURRENT_PROJECT_VERSION` actuel ;
- la configuration Release correcte ;
- la méthode de signature actuellement utilisée.

Attention : le projet contient notamment une application et une extension **AUv3**. Ne suppose donc pas qu'il n'existe qu'un seul target.

Ne modifie pas arbitrairement les versions des targets/extensions sans vérifier leur relation avec l'application distribuée.

---

## ÉTAPE 3 — Créer ou améliorer le script

Je veux idéalement pouvoir exécuter quelque chose d'aussi simple que :

```bash
./scripts/testflight.sh
```

Le script doit :

### 1. Vérifier l'environnement

Vérifier notamment :

- présence de Xcode ;
- présence des outils nécessaires ;
- projet/workspace ;
- scheme ;
- configuration Release ;
- paramètres nécessaires à la signature.

En cas de problème, arrêter proprement avec un message explicite.

### 2. Lire la version actuelle

Afficher par exemple :

```text
Version : 1.2
Build actuel : 17
Nouvelle build : 18
```

**Ne jamais utiliser un numéro de build codé en dur.**

### 3. Incrémenter automatiquement le build

Incrémenter uniquement ce qui est nécessaire pour permettre l'upload d'une nouvelle build TestFlight.

Par défaut :

```text
17 -> 18
```

La `MARKETING_VERSION` ne doit pas être augmentée automatiquement sauf nécessité réelle.

### 4. Archiver

Utiliser les outils Xcode appropriés pour produire une archive Release valide.

Le script doit arrêter immédiatement le processus si l'archive échoue.

### 5. Exporter

Créer un export approprié pour une distribution **App Store Connect / TestFlight**.

Réutiliser une configuration/export plist existante si elle est correcte.

Ne pas multiplier inutilement les fichiers de configuration.

### 6. Envoyer vers App Store Connect

Uploader la build avec **la méthode Apple actuellement supportée**.

Ne pas utiliser une méthode Apple obsolète simplement parce qu'un ancien script du dépôt l'utilise.

Les identifiants/secrets App Store Connect ne doivent **jamais être écrits en clair dans Git**.

Réutiliser les mécanismes d'authentification déjà présents dans le projet s'ils existent.

Si une configuration manuelle initiale est nécessaire (par exemple clé API App Store Connect), documenter précisément ce que je dois fournir et où le configurer de manière sécurisée.

### 7. Résultat

À la fin, afficher quelque chose de très clair :

```text
SUCCESS

Version : 1.2
Build : 18
Archive : OK
Export : OK
Upload App Store Connect : OK

La build 18 a été envoyée à App Store Connect.
Elle devrait apparaître dans TestFlight après le traitement Apple.
```

En cas d'erreur, afficher clairement **à quelle étape elle s'est produite**.

---

## Sécurité

Le script ne doit jamais :

- supprimer une build existante ;
- modifier les testeurs TestFlight ;
- modifier les groupes TestFlight ;
- publier l'application sur l'App Store ;
- écraser des credentials ;
- mettre une clé privée ou un secret dans Git ;
- modifier des paramètres Xcode sans nécessité.

Son rôle s'arrête à :

**incrémenter → construire → archiver → exporter → uploader vers App Store Connect/TestFlight.**

---

## Important

Avant d'écrire du code :

1. inspecte réellement le dépôt ;
2. cherche les scripts existants ;
3. identifie la structure Xcode réelle ;
4. explique brièvement ce que tu as trouvé ;
5. décide s'il faut réutiliser/modifier un script existant ou en créer un nouveau.

Ensuite seulement, implémente la solution.

Après l'implémentation, vérifie le script autant que possible **sans déclencher accidentellement une publication réelle pendant les tests**.

Ajoute si pertinent un mode :

```bash
./scripts/testflight.sh --dry-run
```

permettant de vérifier toute la configuration et les commandes prévues sans uploader réellement la build.
