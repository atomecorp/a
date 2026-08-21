# Archive & restauration d'un utilisateur (dossier + base) — spec d'exécution

Date du constat : 2026-08-21
Statut : **à faire** — la brique serveur existe, mais elle est inatteignable, incomplète et non sûre pour une vraie restauration.

---

## 0. Verdict

eVe **ne sait pas** aujourd'hui archiver puis restaurer un utilisateur avec gestion de la sécurité.
Ce qui existe est un socle serveur non branché : un export/import ZIP admin, jamais exposé dans l'UI,
qui laisse un utilisateur restauré **incapable de se reconnecter**.

Cette tâche **complète** le code existant. Elle ne le réécrit pas.

---

## 1. Constat de l'existant (vérifié, pas supposé)

### Ce qui existe

| Élément | Emplacement |
|---|---|
| `buildUserExportZip()` — ZIP `manifest.json` + `db/<table>.json` + `data/users/<userId>/…` | `server/userExportImport.js:80` |
| `inspectUserExportZip()` — lit le manifeste, déduit les users | `server/userExportImport.js:176` |
| `importUserExportZip()` — réinjecte les tables puis réécrit les fichiers | `server/userExportImport.js:201` |
| Route `POST /api/admin/users/export` | `server/server.js:1498` |
| Route `POST /api/admin/users/import` | `server/server.js:1635` |
| Garde admin `isAdminPasswordValid()` (`timingSafeEqual`) | `server/server_utils.js:53` |
| Lecture du mot de passe admin (`x-admin-password` ou body) | `server/server_utils.js:62` |
| Module client `exportUsers()` / `importUsersFromFiles()` / `openUserImportDialog()` (438 L) | `eVe/intuition/tools/imports_exports/index.js` |
| Racine des dossiers utilisateurs : `data/users/<userId>/` | `server/userHome.js:4`, `server/shell.js:32` |

Sécurité déjà en place : token utilisateur obligatoire sur les deux routes ; mot de passe admin exigé
dès qu'on touche un autre utilisateur que soi (`server/server.js:1571` et `server/server.js:1669`) ;
garde anti path-traversal à la réécriture des fichiers (`server/userExportImport.js:230-242`).

### Les 7 manques

1. **Module client orphelin.**
   `grep -rn "imports_exports" --include="*.js"` ne renvoie **aucun import** dans le code —
   uniquement des mentions dans `todo/perf_audit_2026-08-09.md` et `done/eve_master_cleanup_audit_report.md`.
   Aucune entrée de menu, aucun outil eVe n'expose la fonction. Elle est inatteignable pour l'utilisateur.

2. **Couverture de tables incomplète.**
   `ALLOWED_TABLES` (`server/userExportImport.js:5`) couvre :
   `atomes, particles, particles_versions, snapshots, events, state_current, permissions, sync_queue, sync_state`.
   Le schéma (`database/schema.sql`, `database/adole_schema_migrations.js`) contient **aussi** :
   `principal_phone_credentials`, `principal_identity_aliases`, `principal_identity_migrations`,
   `property_privacy_rules`, `surface_grants`, `guest_workspace_principals`, `guest_adoption_*`,
   `account_provision_operations`, `principal_file_migrations`.
   **Conséquence directe : un utilisateur restauré ne peut plus s'authentifier** (credentials absents),
   et perd ses règles de confidentialité et ses grants de surface.

3. **Restauration non sûre.**
   `insertRows()` fait un `INSERT OR IGNORE` ligne à ligne (`server/userExportImport.js:69`),
   hors transaction, sans dry-run, sans détection de collision d'ID, sans remap de propriétaire,
   et sans rapport de ce qui a été ignoré. Un ré-import sur une base où l'utilisateur existe encore
   produit un résultat **silencieusement partiel**.

4. **Ni intégrité ni chiffrement.**
   Le manifeste ne porte aucun checksum ni signature ; le ZIP contient des données personnelles en clair.
   Rien ne détecte une archive altérée avant écriture en base.

5. **Sécurité serveur limitée.**
   Le rôle admin repose uniquement sur `EVE_ADMIN_PASSWORD` / `SQUIRREL_ADMIN_PASSWORD`
   (`server/server_utils.js:48`) — secret vide ⇒ `isAdminPasswordValid()` renvoie toujours `false`,
   comportement non explicité côté route. Pas de rate-limit sur ces deux routes,
   pas de journal d'audit persistant (seulement `request.log`), body limit global à 1 GiB
   (`server/server.js:401`) sans plafond spécifique à l'import.

6. **Fastify uniquement.**
   Aucune action équivalente sur `/ws/api`, rien côté serveur Swift local.
   ⇒ la fonction est **absente sur iOS**, où le backend primaire est le serveur Swift local.

7. **Aucun test.** Ni probe, ni test, ne couvre l'export/import.

---

## 2. Lot 1 — Contrat d'archive `eve-user-archive` v2

- Structure de l'archive :
  - `manifest.json` : `format: "eve-user-archive"`, `version: 2`, `users[]`, `exported_at`,
    `schema_version`, `counts` par table, `checksums` par entrée (SHA-256), `credentials_omitted`,
    `encrypted` (bool).
  - `db/<table>.json`
  - `data/users/<userId>/…` (conserver le préfixe actuel pour la compat de lecture)
- Compléter `ALLOWED_TABLES` **et** `IMPORT_ORDER` avec : `principal_phone_credentials`,
  `principal_identity_aliases`, `principal_identity_migrations`, `property_privacy_rules`,
  `surface_grants`. Statuer **explicitement** (inclus / exclu + raison écrite dans le code) pour
  `guest_workspace_principals`, `guest_adoption_operations`, `guest_adoption_payloads`,
  `guest_adoption_files`, `account_provision_operations`, `principal_file_migrations`.
- `IMPORT_ORDER` doit respecter les dépendances de clés : `atomes` avant tout le reste,
  identités avant `permissions` et `surface_grants`.
- **Credentials** : `principal_phone_credentials` n'est inclus que si l'appelant passe
  `include_credentials: true`. Sinon le manifeste porte `credentials_omitted: true` et la restauration
  impose un ré-enrôlement du compte (message explicite dans le rapport).
- **Rétro-compat lecture** : une archive `eve-user-export` v1 (sans checksums) doit rester importable,
  en mode dégradé signalé dans le rapport.

## 3. Lot 2 — Restauration transactionnelle

- Trois modes, décidés **avant** toute écriture : `dry_run`, `merge`, `replace`.
- Rapport détaillé retourné dans tous les modes : par table — insérées / ignorées / en conflit ;
  plus fichiers écrits, fichiers refusés. Remplace le `INSERT OR IGNORE` muet actuel.
- Toute la réinjection dans **une seule transaction** via `database/driver.js` ; rollback complet
  sur échec (aujourd'hui un échec en milieu de course laisse la base à moitié peuplée).
- Détection préalable des collisions d'`atome_id` / d'identifiant utilisateur ; option de remap
  de propriétaire (`owner_id`, `creator_id`, `principal_id`, `granted_by`).
- Durcir l'extraction : conserver **et tester** la garde anti path-traversal existante
  (`server/userExportImport.js:230-242`), ajouter un plafond de taille décompressée cumulée
  (anti zip-bomb) et le refus des entrées de type lien symbolique.

## 4. Lot 3 — Sécurité

- Vérifier les checksums du manifeste **avant** toute écriture ; refuser l'archive si altérée.
- Chiffrement optionnel de l'archive : passphrase fournie à l'export, exigée à l'import.
  Réutiliser `server/auth_crypto.js` — ne pas introduire de nouvelle primitive crypto.
- Journal d'audit **persistant** sur les deux routes : qui, quand, quels utilisateurs, quel mode,
  `include_credentials`, résultat, taille.
- Rate-limit dédié aux deux routes admin + body limit propre à l'import (le 1 GiB global est trop large).
- Rendre explicite le cas `EVE_ADMIN_PASSWORD` vide : réponse claire type `admin_not_configured`,
  jamais d'ouverture implicite.

## 5. Lot 4 — Exposition à l'utilisateur

- Rebrancher `eVe/intuition/tools/imports_exports/index.js` : import depuis le registre d'outils
  + entrée de menu « Archiver / Restaurer un utilisateur ».
  ⚠ Le ruban n'ouvre qu'**un** niveau de palette : les options (mode, credentials, passphrase)
  vont dans le footer contextuel d'atome, pas dans une sous-palette.
- Écran de confirmation avant restauration, affichant le rapport du `dry_run`.
- Passphrase et mot de passe admin saisis sans persistance en clair — aujourd'hui le mot de passe
  admin est lu depuis `sessionStorage['eve_admin_password']`
  (`eVe/intuition/tools/imports_exports/index.js:164`) : à revoir.

## 6. Lot 5 — Parité iOS

- Actions typées `user.archive.export` / `user.archive.import` sur `/ws/api`.
- Implémentation correspondante côté serveur Swift local (backend primaire sur iOS).
- Livrable séparé, vérifié par un vrai client WebSocket sur `ws://127.0.0.1:<port>/ws/api`
  (pas par l'UI : Bevy panique dans le simulateur).

## 7. Validation

Probes dédiées dans `./temp` (ne pas lancer la suite de tests du repo).

**Probe nominale** — base jetable :
1. créer un utilisateur + particles + permissions + règles de confidentialité + fichiers sous `data/users/<id>/`
2. export
3. suppression complète de l'utilisateur (base + dossier)
4. import
5. vérifier l'égalité ligne à ligne des tables exportées, l'identité des fichiers,
   **et** que l'utilisateur peut se réauthentifier (avec `include_credentials: true`).

**Probes négatives** :
- archive au checksum falsifié ⇒ refus **avant** écriture, base inchangée ;
- archive contenant une entrée `../` ou un lien symbolique ⇒ entrée ignorée, rien hors `data/users/` ;
- archive `eve-user-export` v1 ⇒ import en mode dégradé signalé ;
- import sans mot de passe admin sur un autre utilisateur ⇒ 403 `admin_required` ;
- `EVE_ADMIN_PASSWORD` vide ⇒ refus explicite.

**Probe iOS** : exercice réel de `/ws/api` par client WebSocket pour le lot 5.

---

## Fichiers à modifier

- `server/userExportImport.js` — contrat v2, tables, transaction, modes, durcissement ZIP
- `server/server.js:1498` et `server/server.js:1635` — modes, audit, rate-limit, body limit, cas admin non configuré
- `server/server_utils.js` — signalement explicite du secret admin absent
- `eVe/intuition/tools/imports_exports/index.js` — modes, passphrase, rapport dry-run, plus de stockage en clair
- Registre d'outils + menu eVe — exposition de la fonction
- `/ws/api` + serveur Swift local — lot 5
