# Téléportation — Lot 2 : Teleport Manager

État : **fait** (2026-08-15). Dépend du lot 1.

## Ce qui a été livré

### Modèle partagé

`atome/src/shared/teleport_state.js` — **owner unique** de la sémantique d'état.
Placé côté partagé, pas côté serveur : le serveur décide des transitions, le renderer
décide si une surface peint l'objet ou son proxy résiduel. Une seconde copie leur
permettrait d'être en désaccord sur l'endroit où se trouve l'objet — exactement ce que
le §13 interdit. Le module n'a aucun import, il est donc sûr des deux côtés.

- 8 états, table de transitions explicite : tout saut non listé est **refusé**, jamais
  coercé. `LOCAL → REMOTE` est notamment impossible : on ne peut pas court-circuiter les
  deux phases.
- Constructeurs de patch purs : `buildPrepare/Commit/Cancel/Return/Persist/Disconnect/Reconnect`.
  Aucun accès base : l'appelant commite via le pipeline d'événements existant, donc
  l'autorisation et la diffusion restent chez leurs owners actuels.
- `rendersOnSurface(properties, surfaceId)` — le filtre de rendu du lot 3 en découle.

### Serveur

`server/wsTeleportOperations.js` — famille `teleport` sur `/ws/api` :
`offer`, `accept`, `decline`, `cancel`, `return`, `persist`, `state`.
Pushes : `teleport-offer`, `teleport-arrived`, `teleport-cancelled`.
`handleTeleportSurfaceLoss` branché sur la fermeture de connexion dans `server.js`.

### Client

- `atome/src/squirrel/teleport/teleport_manager.js` — owner renderer des transitions.
  Il ne modifie **jamais** les propriétés lui-même : il demande, le serveur décide.
  Auto-acceptation pour les appareils du même compte (§11.1), file d'offres en attente
  sinon.
- `adole_websocket_message.js` — `teleport-response` typée + les trois pushes
  redispatchés en `squirrel:teleport-*`.

## L'invariant central, et comment il est tenu

> Un objet n'est jamais considéré comme parti tant que la destination n'a pas confirmé (§16).

`offer` écrit `TELEPORT_PREPARING` mais **ne touche pas** `teleport_surface_id`.
Seul `accept` le déplace. Donc pendant toute la phase d'attente, `rendersOnSurface`
répond encore `true` pour la source : l'objet reste visible et manipulable là où il est.
Décliner, expirer (12 s, configurable), annuler ou perdre la destination ramène l'état
sans qu'aucun déplacement n'ait jamais eu lieu.

Perte de surface = **deux** conséquences distinctes, volontairement non confondues :
les offres en vol vers elle sont annulées (rien n'est arrivé), les objets qu'elle
hébergeait passent `DISCONNECTED` — ni perdus, ni rapatriés d'office. L'utilisateur
décide.

## Décisions

1. **État en particles, aucune migration.** Le patch passe par `commitAtomeEvent`, donc
   il hérite de l'ACL par propriété, de l'historique, de l'undo et de la diffusion
   temps réel. Aucune table, aucun chemin réseau nouveau.
2. **`cancel` est lié à la surface source, pas seulement au principal.** Bug trouvé par
   la probe : une téléportation intra-compte a le même principal aux deux bouts, donc
   une vérification au niveau du principal laissait la **destination** annuler l'offre
   qu'elle était censée répondre. Corrigé : `cancel` exige `sourceSurfaceId`, `decline`
   exige `targetSurfaceId`.
3. **Une seule offre en vol par atome.** Deux sessions concurrentes se disputeraient le
   même objet.
4. **L'origine est capturée au premier saut.** Sur une chaîne Téléphone → Mac → iPad,
   « Rapatrier » vise toujours le téléphone, pas l'étape précédente (§22).
5. **Le contrôleur reste la surface source** après l'arrivée : le téléphone continue de
   piloter la vidéo qu'il vient de pousser sur le Mac (§9.2).
6. **Inter-utilisateurs explicitement refusé** (`teleport_cross_user_not_authorized`)
   tant que le modèle de permissions du lot 8 n'existe pas. Refus visible, pas silence.

## Vérification

Trois probes, aucune suite de tests du repo :

- `temp/teleport_state_machine_probe.mjs` — 10 sections, modèle pur.
- `temp/teleport_protocol_probe.mjs` — 13 sections. Vrai handler, vrai registre, vraie
  base SQLite jetable, deux sockets. Couvre offre/ACK, vol de session, décline, annule,
  destination hors ligne, double offre, rapatriement, persistance, perte de surface et
  **expiration réelle** (timeout raccourci par variable d'environnement, pas simulé).
- `temp/teleport_manager_client_probe.mjs` — 8 sections. Deux appareils simulés, chacun
  avec sa `window`, ses instances de modules et sa boîte de réception ; le trajet
  client → serveur → push → réaction est complet.

Les cinq probes des lots 1 et 2 passent ensemble.

## Reste à faire pour ce lot

- **iOS/Tauri** : le manager parle à `FastifyAdapter`. Si la session est authentifiée
  seulement contre le backend local, l'annonce et l'offre sont rejetées. À rendre
  explicite (message d'erreur utilisable) au lot 3 ou 4.
- **`handleTeleportSurfaceLoss` scanne `particles`** par valeur brute et JSON. Correct
  mais non indexé ; à revoir si le nombre d'atomes téléportés grandit.
