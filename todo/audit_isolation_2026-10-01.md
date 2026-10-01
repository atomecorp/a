# Audit isolation utilisateurs / projets — 1er oct. 2026

Mission : `~/Desktop/prompt_audit_isolation_atome_eVe.md`. Sondes dans `temp/isolation/`.
Aucun commit. Statuts : RÉUSSI / ÉCHOUÉ / NON TESTÉ.

## Plan

- [x] 1. Serveur Fastify + coffres : accès croisés, substitution d'ids, filtre projet, partage, révocation
- [x] 2. Flux de synchro partagés (portée par objet)
- [x] 3. Client Web : changement de compte (mémoire, localStorage, IndexedDB, caches)
- [x] 4. Client : changement de projet A→B→A, réponses tardives
- [x] 5. Restauration réelle (Web) : objets, positions, tailles, cycles, rechargement
- [x] 6. Tauri (axum + SQLite local)
- [x] 7. iOS (serveur Swift + SQLite)
- [x] 8. Dashboard : funnel par projet
- [ ] 9. Performance d'ouverture de projet

## Journal

### 1–2. Serveur (fait)

- Sonde `temp/isolation/server_isolation.probe.mjs` : 30/30.
- **Défaut critique corrigé (H1)** — partager UN objet d'un projet donnait au destinataire
  tout le flux de synchro du projet (replay + temps réel), y compris les objets non partagés.
  Cause : un flux = un projet (`project:<id>`), mais `vault_stream_registry` ne garde qu'un
  `atome_id` par flux (le dernier écrit) et `streamAccess`/`projectStreamEvent` autorisaient
  le flux entier sur cette base. Effet secondaire : partager un objet qui n'était pas le
  dernier écrit échouait (`share_owner_required`).
  Correction `server/userVaultRouter.js` : accès au flux = partages actifs qui désignent ce
  flux ; filtrage par événement (`shareCoveringEvent`) ; `streamForAtome` pour
  `syncSharingService.ownedStream`. Sonde `temp/isolation/stream_scope_leak.probe.mjs` :
  3/7 avant, 7/7 après.
- **Défaut corrigé (échec fermé)** — les états partagés étaient rejetés par
  `projectStateForRead` (ancien modèle `permissions` central) : un projet partagé était
  invisible via `state-current`. Les états partagés portent désormais les capacités du partage.
- **Défaut corrigé** — `listStates(include_shared)` ignorait `project_id`/`atome_type`/
  `exclude_system` pour les partages et les ajoutait à chaque page (doublons, trous).
- Non-régression : l10 28/28, l1 16/16, l4_l5 16/16, l6 11/11, l9 10/10, identité médias 32/32.

### Débloquage boot (hors périmètre, nécessaire aux tests réels)

- HEAD ne bootait plus : `module_load_failed tool_definition_duplicate_tool_id:ui.matrix.place`
  (module Matrix du 30 sept.). Les 6 cases `matrix_*` redéclaraient `atome_tool: true` avec le
  `tool_id` de leur palette. Aligné sur `shape_*`/`placeholder_*` (variantes sans
  `atome_tool`) dans `eVe/intuition/runtime/eve_intuition/main_menu_create_content_runtime.js`.

### 4. Changement de projet (fait)

- **Défaut corrigé** — A → B avec réponse tardive de A : le rafraîchissement autoritaire de A
  (post-présentation) reprenait le premier plan du canevas et affichait le calque de A alors
  que B était le projet courant (gestes possibles sur les objets de A). Cause :
  `renderProjectRecords` forçait `claimProjectSceneForeground`/visibilité du calque sans
  vérifier le projet courant, et `renderProjectScene` prenait le premier plan par défaut.
  Correction `tool_genesis_project_load_runtime.js` (+ injection `getCurrentProjectId` dans
  `tool_genesis.js`) : seul le projet courant prend le canevas (`keepForeground` sinon).
  Sonde `temp/isolation/project_switch_race.probe.mjs` : 4/7 → 7/7 (app réelle, latence
  injectée sur la lecture distante de A).
- **Défaut corrigé** — A → B → A, glisser réel, puis livraison d'un instantané pris avant le
  glisser : la scène revenait à l'ancienne position (persistance correcte, affichage faux ; le
  geste suivant repartait de la mauvaise position). Correction : époque de mutation par projet
  (`atome:changed`), attente bornée de `waitForPendingMutations` (mécanisme existant de
  l'historique), relecture (2 max) d'un instantané périmé au lieu de l'afficher.
  Sonde `temp/isolation/stale_response.probe.mjs` : 6/7 → 7/7 ; témoins sans latence 7/7.

### 3. Changement de compte, même navigateur (fait)

Sonde `temp/isolation/user_switch.probe.mjs` (Alice → déconnexion → Bob sans rechargement,
puis rechargement) : 20/20. Liste de projets, globals, Dashboard, DOM, lecture directe :
aucune trace d'Alice. Données d'Alice intactes dans son coffre (lecture SQLite directe).

- **Défaut corrigé (intégrité)** — boîte d'envoi Web (local d'abord) : un commit arrivé
  PENDANT une passe de synchro n'était jamais poussé (attente indéfinie jusqu'au commit
  suivant). Mesuré : 1 événement bloqué > 8 s. Cause : `synchronizeBrowserWorkspace` rendait
  la promesse en cours sans relance. Correction `browser_workspace.js` : relance coalescée ;
  `flushBrowserWorkspace` (contournement à deux passes) ramené à une passe.
- **Défaut corrigé (intégrité)** — la déconnexion ne poussait pas les écritures en attente :
  le projet et l'objet d'Alice créés juste avant restaient uniquement sur l'appareil (0 dans
  son coffre). Correction `auth_methods_session_account.js` : vidage borné (3 s) de la boîte
  d'envoi avant verrouillage ; hors ligne, elles restent dans le magasin local d'Alice.
- **Défaut corrigé (résidu)** — après déconnexion, l'overlay des menus recréait le runtime de
  scène du dernier projet d'Alice (premier plan non réinitialisé) ; `__eveWorkspaceMode`
  désignait encore son projet. Corrections : `clearAllProjectScenes` réinitialise premier plan
  et propriétaire de surface ; `dashboard_lifecycle_runtime.js` remet le mode neutre au logout ;
  le chargement de projet est lié au compte qui l'a lancé (`loadOwnerId`).
- Conforme par conception : `squirrel_sync_cursors_v1`/`streams_v1` gardent l'entrée d'Alice
  sous sa clé `env|principal` (métadonnées opaques, jamais lues par Bob ; vérifié).

### 5. Restauration Web (fait)

- `temp/isolation/restore_cycles.probe.mjs` : 21/21 — P1 (forme, texte, cercle) + P2 ; glisser
  réel, redimension, couleur, contenu ; P1→P2→P1, rechargement, modifs cumulées sur 2 cycles,
  2e rechargement. Coffre serveur ET scène = référence des actions ; aucun objet en trop ;
  le dernier projet du compte est repris au rechargement.
  Note : la forme créée 120×80 est stockée 333×222 dès la création (politique connue
  `normalizeAtomeSizeToMaxAxis`), identique partout — pas un défaut de restauration.
- `temp/isolation/pending_destination.probe.mjs` : 10/10 — écritures hors ligne d'Alice, app
  fermée, relance, déconnexion hors ligne, Bob connecté sur le même profil : aucun événement
  d'Alice sous Bob ; au retour d'Alice, projet + objet arrivent dans SON coffre (acteur Alice).
- Ouverture de projet mesurée (activation stale-first, 9 mesures) : 62–152 ms.

### 8. Dashboard — « funnel » par projet (fait)

Le code n'a aucun concept « funnel ». L'entrée propre à chaque projet dans le Dashboard est sa
tuile : emplacement persistant `matrix_slot`/`project_number` (+ vignette `preview_url`),
synchronisation des emplacements sérialisée par utilisateur (`project_order_runtime.js`).
Sonde `temp/isolation/dashboard_tiles.probe.mjs` : 13/13 — créations concurrentes (emplacements
uniques), relance idempotente, suppression sans déplacer les autres, restauration identique
après rechargement, tuiles de Bob indépendantes, celles d'Alice inchangées.

- **Constat NON corrigé (décision produit)** — `createProjectRecord` teste
  `Number.isFinite(Number(slotIndex))` avec `slotIndex = null` par défaut : `Number(null) === 0`,
  donc toute création sans emplacement explicite (Dashboard, News, modèles) INSÈRE en tête au
  lieu d'ajouter en fin, et réécrit l'emplacement de TOUTES les autres tuiles (N événements
  synchronisés par création ; mesuré : 1 création → 2 écritures pour 2 projets). Corriger
  changerait l'ordre visible (« plus récent en premier ») : laissé à l'arbitrage.

### 6. Tauri — axum + SQLite unique par appareil (fait, code réel exécuté)

Tous les comptes d'un appareil partagent une base ; l'isolation repose sur les gardes Rust
(`local_atome_security.rs` : propriétaire effectif, permissions avec expiration/conditions,
`can_create` sur le parent, `create_owner_mismatch`, transfert limité aux espaces invités).
Test de non-régression ajouté `platforms/desktop-tauri/src/server/local_atome_isolation_tests.rs`
(vrais gestionnaires publics) : 2/2 — lecture/écriture croisées, substitution, transfert,
filtre projet ; permission explicite = objet seul, révocation immédiate. Aucun défaut trouvé.
App Tauri complète (fenêtre) : NON TESTÉE (le scénario UI Web couvre le JS commun ; prérequis :
`tauri dev` + copie à jour de `target/debug/eVe`).

### 7. iOS — serveur Swift AiSRuntime (fait, vrai code dans le simulateur)

Sonde `temp/isolation/ios_isolation.probe.mjs <port>` (deux principaux locaux `start-guest`,
WebSocket du serveur local, app signée ad hoc pour le trousseau) : **11/20 → 20/20**.
- **Défaut critique corrigé** — `atome.list` sans aucun jeton (`owner_id: '*'` = tous les
  comptes) et `atome.get` sans contrôle : tout client du WebSocket local lisait tous les atomes.
- **Défaut corrigé** — `events.list` vérifiait seulement un jeton valide : un compte lisait le
  contenu des projets d'un autre par `project_id`/`atome_id`.
- **Défauts corrigés** — commits : création dans le projet d'un autre compte, propriétaire et
  acteur forgés par le client, réaffectation d'un objet à un autre compte.
Correction `LocalHTTPServer.swift` : `authorizedWebViewEvent` (contrat Axum `authorize_event`,
acteur imposé = jeton, parent créé dans le même lot autorisé), filtre propriétaire sur
`events.list`, jeton + propriétaire imposés sur `atome.list`/`atome.get`. La synchro entrante
(`persistRemoteSyncEnvelope`) n'est pas concernée. Arrière-plan / interruption système iOS :
NON TESTÉS (prérequis : appareil ou scénario simulateur dédié).

### Client — lecture en vol partagée entre comptes (corrigé)

`atome_record_projection.js` : la clé de déduplication des lectures `state-current` en vol
n'incluait pas le compte ; une lecture lancée pour Alice pouvait être servie à Bob (chemin
`skipOwner + includeShared`, non refiltré). Sonde `temp/isolation/inflight_key.probe.mjs` :
rouge contre HEAD (1 appel partagé), verte après (2 appels).
