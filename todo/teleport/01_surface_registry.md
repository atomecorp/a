# Téléportation — Lot 1 : Surface Registry

État : **fait** (2026-08-15). Prérequis des lots 2 à 9.

## Ce qui a été livré

### Serveur

- `server/wsApiState.js` — registre de surfaces à côté du registre de connexions qu'il
  affine : `wsApiSurfacesByUserId`, `attachWsApiSurface`, `detachWsApiSurface`,
  `touchWsApiSurface`, `getWsApiSurface`, `listWsApiSurfacesForUser`,
  `normalizeSurfaceId`, `wsSendJsonToSurface`. `detachWsApiClient` retire désormais
  aussi la surface.
- `server/wsSurfaceOperations.js` (nouveau) — famille typée `surface` :
  `announce`, `list`, `ping`, `retire` → `surface-response` ; push `surface-presence`
  vers les autres connexions du compte ; `announceWsSurfaceDisconnect` pour le `close`.
- `server/server.js` — dispatch branché juste après `handleWsAtomeOperation` ;
  annonce de déconnexion **avant** `detachWsApiClient` (sinon le principal n'est plus
  attaché et la présence ne part pas).

### Client

- `atome/src/squirrel/apis/unified/adole_api/surfaces.js` (nouveau) — identité de surface
  persistée (UUID v4, `localStorage`), descripteur (label / plateforme / capacités),
  `announce` / `ensureAnnounced` / `list` / `ping` / `retire`, plus le cycle de vie
  (annonce à la connexion, heartbeat 30 s, purge à la déconnexion).
- `adole_websocket.js` — `connectionGeneration`, incrémenté à chaque `onopen`.
- `adole_adapter.js` — `ws.connectionGeneration` exposé sur la façade.
- `adole_websocket_message.js` — `surface-response` typé + push `surface-presence`
  redispatché en `squirrel:surface-presence`.
- `adole_apis.js` — `AdoleAPI.surfaces`.

## Décisions

1. **Identité persistée côté client, pas `connection._wsApiConnectionId`.** Ce dernier
   est régénéré à chaque socket ; il ne peut donc pas désigner « cet écran » après une
   reconnexion (§13 : ne pas perdre l'identité lors d'une reconnexion).
2. **Registre Fastify uniquement.** Les serveurs locaux Axum/Swift ne voient qu'un seul
   appareil : ils ne peuvent pas relayer. `surfaces.js` parle donc toujours à
   `FastifyAdapter`, même en runtime Tauri/iOS. Pas de famille `surface` côté local —
   ce ne serait pas de la parité, ce serait du code mort.
3. **`surface_id` toujours interprété dans l'espace de noms du principal attaché.** Le
   payload ne porte jamais d'identité : deux comptes peuvent annoncer le même id sans
   se voir ni s'écraser.
4. **Le socket le plus récent gagne.** Une reconnexion réutilise l'id persisté ; le
   socket périmé est délié, et sa fermeture ultérieure ne peut pas évincer l'entrée
   vivante.

## Vérification

- `temp/teleport_surface_registry_probe.mjs` — 10 sections, registre pur.
  Mutation-testée : neutraliser la libération du socket périmé **et** la garde
  propriétaire fait passer 3 assertions au rouge, donc la probe n'est pas verte par
  construction.
- `temp/teleport_surface_client_probe.mjs` — 11 sections. Lie l'entrée ESM réelle
  (`adole_apis.js`), franchit la vraie garde d'autorisation serveur
  (`isWsApiPrincipalProvisioned` sur une base SQLite jetable dans `temp/`, jamais la
  base du développeur), et fait dialoguer le client avec le vrai handler serveur.
  Rouge d'abord à trois reprises pour des raisons réelles avant d'être verte.
- `node --check` sur les cinq fichiers clients et les trois fichiers serveur touchés.

## Limites connues, à traiter au lot 2

- **Jeton Fastify en runtime Tauri/iOS.** `isAuthenticated()` lit la session unifiée, qui
  peut être authentifiée contre le backend local sans jeton Fastify ; l'annonce serait
  alors rejetée. Le relais de téléportation exige un principal Fastify :
  `auth_fastify_token.js` possède déjà le handoff, il faudra le rendre obligatoire avant
  toute téléportation inter-appareils.
- **Registre en mémoire.** Un redémarrage Fastify vide les surfaces. Le heartbeat de 30 s
  les rétablit, mais une téléportation en vol pendant ce trou doit être couverte par
  l'ACK/rollback du lot 2, pas par le registre.
- **Quirk préexistant, non corrigé ici.** `resolveWsApiPrincipal` traite
  `_wsApiAuthExpMs === null` comme expiré (`Number(null) === 0`), alors que `undefined`
  passe. Plusieurs chemins d'auth écrivent `null` explicitement. Cela concerne toutes les
  familles typées, pas seulement `surface` — à traiter séparément.
