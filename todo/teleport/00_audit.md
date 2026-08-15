# Téléportation — Lot 0 : restitution d'audit

Réponse à l'Étape 1 du §31 de `todo/3 - teleport.md`. Aucun code n'a été modifié pour
produire ce document ; tout ce qui suit a été vérifié dans le dépôt.

## 1. Briques réutilisées telles quelles

| Besoin du cahier des charges | Owner existant | Vérifié |
| --- | --- | --- |
| Transport temps réel authentifié | `/ws/api` — `server/server.js:1996` | oui |
| Registre de connexions par utilisateur | `server/wsApiState.js` (`wsApiClientsByUserId`) | oui |
| Diffusion d'un changement d'atome | `server/atomeRealtime.js` → `share-sync` | oui |
| Réception client et dispatch | `atome/src/squirrel/apis/unified/adole_websocket_message.js` → `squirrel:atome-updated` | oui |
| Identité unique de l'objet (§13) | `atomes.atome_id` — `database/schema.sql:44` | oui |
| Propriétés dynamiques | `particles` — `database/schema.sql:74` | oui |
| Journal append-only | `events` — `database/schema.sql:144` | oui |
| ACL par propriété | `server/atomePropertySecurity.js` | oui |
| Permissions granulaires + expiration | `permissions` — `database/schema.sql:183` | oui |
| Demande / acceptation inter-utilisateurs | `server/sharing_requests.js`, `server/notificationStack.js` | oui |
| Toolbox contextuelle par atome | `resolveAtomeEditFooterToolDefinitionsForOptions` — `eVe/intuition/runtime/eve_intuition/atome_edit_footer_runtime.js:194` | oui |
| Catalogue d'outils | `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js` | oui |
| Outils par défaut selon le kind | `DEFAULT_TOOLS_BY_KIND` — `eVe/intuition/runtime/eve_intuition/atome_edit_footer_model_runtime.js:3` | oui |
| Drag d'objet + bornes du viewport | `atome_contextual_edit_runtime.js:85-150` + `contextualGestureProps` | oui |
| Projection de records client | `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js` | oui |

## 2. Ce que le §25 suppose et qui n'existe pas

### 2.1 `RemoteCommands` / `BuiltinHandlers` sont des fantômes

- `atome/src/squirrel/apis/remote_commands.js` : **le fichier n'existe pas**.
- `atome/src/squirrel/apis/remote_command_handlers.js` : **le fichier n'existe pas**.
- Leurs seuls importeurs, `atome/src/application/examples/share.js` et
  `examples/messages.js`, sont **commentés** dans `atome/src/application/index.js:61-63`.

Conséquences directement observables :

1. `adole_websocket_message.js:100` teste `globalThis.BuiltinHandlers?.handlers?.[camel]`
   — toujours `undefined`. **Branche morte.**
2. `eVe/intuition/tools/communication_remote_commands.js:34` installe un
   `setInterval` de 1 s qui attend `globalThis.RemoteCommands` et **ne s'arrête
   jamais**, plus un second de 3 s pour le démarrage. Fuite de timer permanente sur
   toute session authentifiée.

**Décision :** la téléportation ne ressuscite pas ce système. Elle emprunte le chemin
réellement vivant `events` → `broadcastCommittedAtomeEvent` → `share-sync`.

### 2.2 Le « débogage distribué » réutilisable est local seulement

`platforms/desktop-tauri/src/server/remote_control_ws.rs` (196 lignes) est le seul
prototype de contrôle distant du dépôt. C'est :

- un dispatcher requête/réponse sur `/ws/control`, **loopback uniquement** ;
- gated par l'en-tête `x-squirrel-remote-token` ;
- limité à **six actions audio** (`audio.record.*`, `audio.analyze`, `audio.playback.*`)
  plus `status`.

Il n'a ni relais inter-appareil, ni modèle de session, ni événement pointeur/clavier.
**Réutilisable : l'enveloppe de message.** Non réutilisable : le transport.

### 2.3 Aucune notion de *device* / *surface*

`wsSendJsonToUser` diffuse à **toutes** les connexions d'un principal ; la seule
granularité existante est `wsSendJsonToUserExcept` (exclusion de l'émetteur, pour le
multi-onglet). `connection._wsApiConnectionId` existe (`server/server.js:2000`) mais il
est régénéré à chaque connexion, reste serveur-interne et n'est jamais exposé au client.

C'est la **seule brique réellement manquante** — et le prérequis de tout le reste :
sans adressage par surface, « téléporter vers *cet* écran » n'est pas exprimable.

### 2.4 Absents également

- Injection d'événements pointeur / gestes / clavier : néant.
- Trackpad distant : néant.
- Prévisualisation distante : rien hors `/ws/visio` (WebRTC), hors périmètre V1.

## 3. Ce qui est réellement créé

1. **Surface Registry** — extension de `server/wsApiState.js` + famille `surface` sur
   `/ws/api` + client `adole_api/surfaces.js`.
2. **Teleport Manager** — `server/teleport.js` (machine à états, ACK/rollback) +
   `atome/src/squirrel/teleport/teleport_manager.js`.
3. **Remote Control Manager** — famille `remote-control` sur `/ws/api`, relais
   surface → surface.

Tout le reste est une extension d'owners existants. Aucune table nouvelle : l'état de
téléportation est porté par des `particles` de l'atome, ce qui lui donne gratuitement la
diffusion temps réel, l'historique, l'undo et l'ACL par propriété.

## 4. Dette identifiée en passant (hors périmètre téléportation)

- Branche morte `BuiltinHandlers` dans `adole_websocket_message.js:100`.
- Timers infinis dans `communication_remote_commands.js` (retry sur un global qui
  n'apparaîtra jamais).

À traiter séparément — ne pas mélanger avec l'implémentation de la téléportation.
