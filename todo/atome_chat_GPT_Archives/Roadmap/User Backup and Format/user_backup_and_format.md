# User Backup and Format

## Objectif

Finaliser un mécanisme de sauvegarde, export, validation et restauration complète des données d’un utilisateur Atom/eVe avant passage en production.

Le système doit être indépendant du stockage SQL interne : l’archive utilisateur repose sur le contrat Atome canonique et peut être restaurée même si l’implémentation de la base évolue.

## 1. Figer le format Atome V1

- Déclarer officiellement une version stable du contrat Atome : `schema_version: 1`.
- Documenter les champs obligatoires, optionnels, valeurs par défaut et invariants.
- Garantir l’immutabilité de `id`.
- Garantir que les formes legacy ne sont acceptées qu’aux frontières d’adaptation.
- Interdire les changements cassants sans migration explicite.
- Formaliser les règles de compatibilité ascendante et descendante.
- Formaliser la politique de dépréciation.
- Vérifier que tout Atome durable est sérialisable via le contrat canonique.
- Ajouter des tests de round-trip : canonique -> stockage -> canonique.
- Ajouter des fixtures historiques permettant de vérifier les migrations futures.

## 2. Définir le format d’archive utilisateur

Créer un format d’archive stable, par exemple :

```text
user_backup.atome
├── manifest.json
├── atomes/
├── assets/
├── permissions/
├── preferences/
├── events/            # optionnel selon politique
└── checksums.json
```

Le format doit pouvoir évoluer sans casser les anciennes archives.

### Manifest minimal

Le manifest doit contenir au minimum :

- `archive_format_version`
- `atome_schema_version`
- `database_schema_version`
- `application_version`
- `created_at`
- `user_id`
- `atome_count`
- `asset_count`
- `event_count` si l’historique est inclus
- liste des composants présents
- algorithme de checksum
- état de chiffrement
- éventuelles migrations nécessaires

## 3. Définir précisément le périmètre d’un backup utilisateur

Inventorier et classifier toutes les données liées à un utilisateur :

- Atomes possédés
- projets
- hiérarchies / parentages
- propriétés
- relations et compositions
- médias et autres assets
- métadonnées des assets
- préférences utilisateur
- préférences de workspace
- outils/configurations persistantes
- automatisations
- plugins et références de plugins
- permissions
- ACL
- partages
- contacts ou références associées selon politique
- calendrier selon politique
- historique d’événements si nécessaire
- état courant
- données nécessaires à la reconstruction des snapshots
- métadonnées de version
- références externes

Décider explicitement ce qui n’est **pas** exporté :

- secrets serveur
- tokens OAuth
- clés privées non exportables
- données temporaires
- caches
- sessions provider
- chemins locaux
- données recalculables

## 4. Gestion des assets

- Tous les assets doivent avoir un identifiant canonique stable.
- Ne jamais dépendre d’un chemin local absolu.
- Dédupliquer les fichiers identiques.
- Vérifier la présence de chaque asset référencé avant finalisation d’une archive.
- Calculer un checksum par asset.
- Vérifier les checksums au restore.
- Définir le comportement en cas d’asset manquant ou corrompu.
- Prévoir les gros fichiers et l’export en streaming.
- Tester les archives contenant beaucoup de médias.

## 5. Permissions et partage

Définir comment sauvegarder et restaurer :

- propriétaire
- ACL
- règles de confidentialité
- droits par Atome
- droits par projet
- partages privés
- références vers d’autres utilisateurs

Le restore ne doit jamais permettre une élévation de privilèges.

Les références à des utilisateurs absents de l’environnement de restauration doivent être gérées explicitement : conservation inactive, remapping ou suppression contrôlée.

## 6. Historique, événements et snapshots

Décider officiellement si le backup contient :

### Option A — état courant uniquement

Plus compact, suffisant pour récupérer les données.

### Option B — état courant + historique

Permet audit, undo historique et reconstruction complète.

Si les événements sont inclus :

- préserver l’ordre déterministe ;
- préserver les timestamps et identifiants ;
- empêcher un ancien événement de remplacer un état plus récent ;
- valider le replay complet ;
- tester la reconstruction de `state_current`.

Le snapshot/restore existant doit être intégré à ce format d’archive ou clairement séparé comme mécanisme interne.

## 7. API d’export

Créer une API canonique unique de type :

```text
exportUserBackup(userId, options)
```

Elle doit :

- vérifier l’identité et les droits ;
- figer une vue cohérente des données ;
- exporter le format canonique, pas la structure SQL ;
- collecter les assets ;
- générer le manifest ;
- générer les checksums ;
- chiffrer si demandé ;
- produire l’archive ;
- valider l’archive avant de la déclarer réussie.

Éviter toute seconde implémentation parallèle côté Web, Tauri ou iOS.

## 8. API de restauration

Créer une API canonique unique de type :

```text
restoreUserBackup(archive, options)
```

Avant mutation :

- lire le manifest ;
- vérifier la version ;
- vérifier les checksums ;
- vérifier la compatibilité ;
- migrer vers le schéma courant si nécessaire ;
- effectuer une validation complète à blanc ;
- détecter les collisions d’identifiants ;
- établir un plan de remapping si nécessaire ;
- vérifier les droits.

La restauration doit être transactionnelle autant que possible.

En cas d’échec :

- rollback complet ;
- aucun état utilisateur partiellement restauré ;
- rapport d’erreur exploitable.

## 9. Modes de restauration

Prévoir explicitement :

- restauration complète d’un compte ;
- restauration dans un compte vide ;
- restauration dans un compte existant ;
- import d’un projet seulement ;
- récupération d’un Atome ou groupe d’Atomes ;
- restauration des assets uniquement ;
- mode diagnostic / dry-run.

Définir les règles de collision pour chacun.

## 10. Chiffrement

Pour les backups contenant des données privées :

- chiffrement de l’archive au repos ;
- chiffrement authentifié ;
- aucune clé en clair dans l’archive ;
- stratégie de récupération des clés ;
- rotation des clés ;
- distinction sauvegarde serveur / export utilisateur ;
- tests de corruption et de mauvais mot de passe / mauvaise clé.

Le format de chiffrement doit lui aussi être versionné.

## 11. Intégrité

L’archive doit être auto-vérifiable.

Prévoir :

- checksum global ;
- checksum de chaque fichier ;
- validation du manifest ;
- validation du contrat Atome ;
- détection de fichiers manquants ;
- détection de données supplémentaires non déclarées ;
- détection de corruption partielle.

Ajouter une commande de type :

```text
verifyUserBackup(archive)
```

sans restaurer les données.

## 12. Migrations

Créer un registre unique de migrations :

```text
archive v1 + Atome schema 1
           ↓
migration
           ↓
archive/runtime courant
```

Règles :

- jamais de modification destructrice silencieuse ;
- migration déterministe ;
- migration testable indépendamment ;
- possibilité de conserver l’archive source intacte ;
- tests avec toutes les anciennes versions supportées.

## 13. Robustesse aux pannes

Tester explicitement :

- panne pendant export ;
- panne pendant compression ;
- panne pendant chiffrement ;
- panne pendant copie d’asset ;
- manque d’espace disque ;
- archive tronquée ;
- interruption réseau ;
- process tué pendant restore ;
- base verrouillée ;
- asset manquant ;
- checksum invalide.

Une archive incomplète ne doit jamais être considérée comme valide.

## 14. Sauvegarde automatique

Décider si eVe fournit aussi une politique de backup automatique.

À définir :

- fréquence ;
- rétention ;
- nombre de générations ;
- stockage local / serveur ;
- snapshots incrémentaux ou complets ;
- chiffrement ;
- rotation ;
- purge ;
- quota ;
- restauration depuis l’UI.

Une sauvegarde doit être testée par restauration périodique, pas seulement créée.

## 15. Export utilisateur

Prévoir un export déclenchable par l’utilisateur pour :

- sécurité personnelle ;
- changement de machine ;
- migration de serveur ;
- conservation hors ligne ;
- récupération après panne.

UX minimale :

```text
Backup
Restore
Verify backup
Last successful backup
```

Pas de dépendance à une interface particulière : ces actions doivent exister comme capacités/API réutilisables.

## 16. Tests obligatoires avant production

### Contrat

- Atome V1
- validation stricte
- champs inconnus
- valeurs par défaut
- données legacy
- migration

### Backup / restore

- compte vide
- petit compte
- gros compte
- milliers d’Atomes
- nombreux médias
- hiérarchies profondes
- partages
- permissions complexes
- données anciennes
- archive chiffrée
- corruption volontaire

### Invariants

Après backup + suppression + restore :

- même nombre d’Atomes
- mêmes IDs lorsque possible
- mêmes propriétés
- mêmes hiérarchies
- mêmes assets
- mêmes checksums
- mêmes permissions
- même état fonctionnel observable

Ajouter un test automatique complet :

```text
seed user
→ export
→ destroy user state
→ restore
→ canonical comparison
```

## 17. Tests multi-runtime

Valider au minimum :

- Web
- Tauri macOS
- iOS
- serveur Fastify / ADOLE

Une archive créée sur une plateforme doit être restaurable sur une autre lorsque les fonctionnalités sont disponibles.

## 18. Performance

Définir des budgets mesurables :

- démarrage export ;
- débit de génération ;
- mémoire maximale ;
- débit de restore ;
- traitement des gros assets ;
- temps de validation.

L’export doit être streamé afin de ne pas charger toute la base et tous les médias en RAM.

## 19. Observabilité

Journaliser sans exposer les données privées :

- début / fin d’export ;
- version du format ;
- quantité d’objets ;
- quantité d’assets ;
- taille ;
- durée ;
- résultat de vérification ;
- échec et phase concernée.

Ne jamais logger :

- contenu privé ;
- clés ;
- tokens ;
- secrets.

## 20. Documentation de production

Produire une documentation stable couvrant :

- format Atome V1 ;
- format archive V1 ;
- manifest ;
- politique de compatibilité ;
- migrations ;
- chiffrement ;
- export ;
- restore ;
- vérification ;
- politique de backup automatique ;
- procédure disaster recovery.

## Critères de fin de tâche

La tâche peut être considérée terminée uniquement lorsque :

1. le contrat Atome V1 est officiellement figé ;
2. le format d’archive V1 est spécifié ;
3. export complet utilisateur fonctionne ;
4. restore complet fonctionne ;
5. verify fonctionne sans restore ;
6. assets, permissions et relations sont couverts ;
7. migrations sont versionnées ;
8. corruption et pannes sont gérées ;
9. chiffrement est défini et testé ;
10. tests end-to-end backup → destruction → restore passent ;
11. tests multi-runtime passent ;
12. documentation de production est à jour ;
13. une archive ancienne reste restaurable après une évolution de schéma ;
14. aucune dépendance au schéma SQL interne n’est exposée dans le format public.

## Principe final

Le contrat Atome est le format durable.

ADOLE / SQLite / serveur sont des implémentations de stockage.

Une sauvegarde utilisateur doit survivre aux changements d’implémentation de la base.
