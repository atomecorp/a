# ADOLE v3.0 — Architecture unifiee (Axum / Fastify / AiS)

Cette documentation est la **reference fonctionnelle** de l'architecture ADOLE v3.0.
Elle corrige les divergences historiques et s'aligne sur **le schema actuel en base**.

---

# 0. Source de verite

- **Schema canonique** : `database/schema.sql` (ADOLE v3.0, modele Atome/Particle)
- **Protocoles de sync + conflits** : sections 6 a 8 de ce document (contrat a respecter)
- **Isomorphisme runtimes** : Axum, Fastify et AiS doivent implementer **les memes endpoints et payloads**

**Important** : les schemas historiques de type `objects/properties` ou les tables dediees `users/projects/atomes` sont **des specs legacy** et ne font plus foi.

---

# 1. Principes

- **Tout est un atome** : users, projects, documents, medias, etc.
- **Les proprietes sont des particles** (cle/valeur, schema flexible).
- **Versioning fin** : chaque modification cree une nouvelle entree dans `particles_versions`.
- **ACL granulaire** : permissions par atome ou par particle.
- **UI-agnostique** : la DB ne connait pas le renderer. Si besoin, stocker `renderer` ou `kind` dans les particles.

---

# 2. Schema canonique (ADOLE v3.0)

Le schema complet est **dans `database/schema.sql`**. Ci-dessous les tables et roles.

## 2.1 TABLE `atomes`

Identite de tous les objets (y compris users et projects).

- `atome_id` (PK) : UUID de l'objet
- `atome_type` : type canonique (`user`, `project`, `shape`, ...)
- `parent_id` : hierarchie
- `owner_id` / `creator_id`
- `created_at`, `updated_at`, `deleted_at` (soft delete)
- **sync** : `last_sync`, `created_source`, `sync_status`

## 2.2 TABLE `particles`

Proprietes courantes d'un atome (cle/valeur).

- `particle_id` (PK)
- `atome_id` (FK)
- `particle_key` (ex: `x`, `y`, `color`, `username`, `password_hash`)
- `particle_value` (TEXT / JSON)
- `value_type`
- `version`, `created_at`, `updated_at`
- `UNIQUE(atome_id, particle_key)`

## 2.3 TABLE `particles_versions`

Historique complet de chaque modification de particle.

- `version_id` (PK)
- `particle_id` (FK)
- `atome_id` (FK)
- `particle_key`
- `version`
- `old_value`, `new_value`
- `changed_by`, `changed_at`

## 2.4 TABLE `snapshots`

Backups complets d'un atome ou projet.

- `snapshot_id` (PK)
- `atome_id`, `project_id`
- `snapshot_data`, `state_blob`
- `label`, `snapshot_type`, `actor`, `created_by`, `created_at`

## 2.5 TABLE `events` (append-only)

Journal d'evenements (source de verite).

- `id` (UUID)
- `ts`, `atome_id`, `project_id`
- `kind`, `payload`, `actor`
- `tx_id`, `gesture_id`

## 2.6 TABLE `state_current`

Projection materialisee (cache) pour lecture rapide.

- `atome_id` (PK)
- `owner_id`, `project_id`
- `properties` (JSON)
- `updated_at`, `version`

## 2.7 TABLE `permissions`

ACL granulaire par atome ou par particle.

- `permission_id` (PK)
- `atome_id`
- `particle_key` (NULL = tout l'atome)
- `principal_id` (user)
- `can_read`, `can_write`, `can_delete`, `can_share`, `can_create`
- `share_mode`, `conditions`, `granted_by`, `granted_at`, `expires_at`

## 2.8 TABLE `sync_queue`

File persistante de sync (offline-first).

- `queue_id` (PK)
- `atome_id`, `operation`, `payload`
- `target_server`, `status`, `attempts`, `max_attempts`
- `last_attempt_at`, `next_retry_at`, `error_message`, `created_at`

## 2.9 TABLE `sync_state`

Etat de sync par atome.

- `atome_id` (PK)
- `local_hash`, `remote_hash`
- `local_version`, `remote_version`
- `last_sync_at`, `sync_status`

## 2.10 Vue `users_view`

Compatibilite pour lister les users (atomes avec `atome_type='user'`).

---

# 3. Runtime regroupe et isomorphe

**Objectif** : un seul contrat, plusieurs runtimes.

- **Axum (Tauri)**, **Fastify**, **AiS** exposent **les memes routes**, **les memes enveloppes**, **les memes erreurs**.
- Les differences ne doivent concerner que **le transport** (HTTP/WS) et **le stockage local**.
- Toute divergence doit etre detectee par tests contractuels (section 8).

---

# 4. Renderer / Kind / Type

- **`atome_type` est canonique** (logique/semantique, pas UI).
- **Pas de colonne `renderer` en DB** : la DB reste UI-agnostique.
- Si besoin : `renderer` et `kind` sont stockes comme **particles** (ex: `particle_key='renderer'`, `particle_key='kind'`).

---

# 5. Granularite et ACL (a conserver)

- **Property-level** : une particle = une propriete.
- **Versioning complet** via `particles_versions`.
- **ACL granulaire** via `permissions` (par atome ou particle).

---

# 6. Sync offline/online — contrat unifie (reecrit)

## 6.1 Idempotence

- Chaque mutation cree un **event unique** (`events.id` UUID). Idempotence = dedupe par `events.id`.
- Les writes sont append-only (events + particles_versions), jamais de mutation destructive du passe.

## 6.2 Journal d'operations (source de verite)

- `events` est le **log canonique**.
- `state_current` est une **projection** calculable a partir de `events` + `snapshots`.

## 6.3 Double ecriture local + remote

- Chaque mutation locale :
  1. Ecrit `particles` + `particles_versions`
  2. Ajoute un `event`
  3. Met a jour `state_current`
  4. Enfile dans `sync_queue`
- La sync pousse les operations vers l'autre backend via `sync_queue` (retry/backoff).

## 6.4 Gestion des erreurs partielles

- Une ecriture qui echoue en remote **reste en queue** avec `status='error'` et `attempts`.
- Rejouer jusqu'a `max_attempts`, puis marquer en echec durable.

## 6.5 Detection de conflits

- Conflit si :
  - `sync_state` indique **modifications concurrentes** (hash local != remote)
  - ET les versions/timestamps montrent des changements des deux cotes.

## 6.6 Resolution des conflits

- Par defaut : **merge par particle** (plus recent gagne).
- En cas d'ambiguite (timestamps egaux mais valeurs differentes), statut `conflict`.
- La resolution **cree une nouvelle version** (jamais overwrite).

---

# 7. Strategie de compaction

- **Snapshots periodiques** (par taille ou par temps).
- **Retention** des `particles_versions` (ex: garder N versions ou fenetre temporelle).
- **Archive des `events`** anciens dans un stockage froid.
- **Rebuild** de `state_current` depuis le dernier snapshot + events restants.

---

# 8. Tests contractuels Axum / Fastify / AiS

A mettre en place pour garantir l'isomorphisme :

- **Schema parity** : meme tables, memes colonnes, memes index.
- **API parity** : endpoints identiques + reponses identiques.
- **WS sync parity** : meme protocoles, memes enveloppes d'events.
- **Fixtures** : scenarios de sync offline -> online + conflits.

---

# 9. AiS (AUv3) — compatibilite

AiS doit exposer **les memes API et protocoles** que Axum/Fastify.
Le stockage peut etre file-based (App Group) mais **le modele logique reste Atome/Particle**.
