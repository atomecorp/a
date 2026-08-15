# Téléportation — contrat développeur

Statut : **socle implémenté et couvert par probes ; non vérifié en application réelle.**
Cahier des charges : `todo/3 - teleport.md`. Journal d'exécution : `todo/teleport/`.

## L'idée en une phrase

Téléporter un objet, c'est **changer sa surface active** — pas déplacer un
enregistrement, pas copier des données, pas partager un écran.

L'atome garde son `atome_id`, son `owner_id` et sa ligne en base. Ce qui change, c'est
**ce que chaque surface peint**. C'est ce qui rend le §13 (unicité) vrai par
construction : il n'y a jamais deux objets, donc il n'y a jamais de divergence possible.

## Les quatre briques

| Brique | Owner | Rôle |
| --- | --- | --- |
| Surface Registry | `server/wsApiState.js` + `server/wsSurfaceOperations.js` | savoir quels sièges d'appareil existent et les adresser individuellement |
| Teleport Manager | `atome/src/shared/teleport_state.js` + `server/wsTeleportOperations.js` | la machine à états et son protocole en deux phases |
| Remote Control | `server/wsRemoteControlOperations.js` | déléguer les entrées d'une surface à une autre |
| Surface Grants | `server/surfaceGrants.js` | autoriser un autre compte, capacité par capacité |

Côté renderer : `atome/src/squirrel/teleport/` (managers) et
`eVe/domains/rendering/teleport_residual_projection.js` (ce qui est peint).

## Ce qu'une surface est

Un **siège d'appareil** : un onglet, une fenêtre Tauri, une instance iOS.
Identifiant UUID v4 **persisté côté client**, donc stable à travers un rechargement et
une reconnexion. `connection._wsApiConnectionId` n'est **pas** cette identité : il est
régénéré à chaque socket.

Le registre est **Fastify uniquement**. Les serveurs locaux Axum/Swift ne voient qu'un
appareil : ils ne peuvent rien relayer.

## L'invariant à ne jamais casser

> Un objet n'est jamais considéré comme parti tant que la destination n'a pas confirmé.

Concrètement : `offer` écrit `TELEPORT_PREPARING` mais **ne touche pas**
`teleport_surface_id`. Seul un ACK de la surface visée le déplace. `LOCAL → REMOTE`
n'est pas une transition légale.

Toute modification du protocole doit préserver cela. La probe
`temp/teleport_state_machine_probe.mjs` le vérifie explicitement.

## État, porté par des particles

`teleport_state`, `teleport_surface_id`, `teleport_origin_surface_id`,
`teleport_controller_surface_id`, `teleport_session_id`, `teleport_persist`.

Écrits via `commitAtomeEvent`, donc l'ACL par propriété, l'historique, l'undo et la
diffusion temps réel sont **hérités**, pas réimplémentés. Aucune table pour l'état, aucun
chemin réseau nouveau.

États : `LOCAL`, `TELEPORT_PREPARING`, `REMOTE`, `REMOTE_CONTROLLED`, `RETURNING`,
`PERSISTED_REMOTE`, `DISCONNECTED`, `ERROR`. Table de transitions explicite ; tout saut
non listé est **refusé**, jamais coercé.

## Règle de rendu

`teleport_surface_id` vide **ou** égal à ma surface → je peins l'objet.
Sinon → **proxy résiduel** : même `id`, source média retirée, badge de taille fixe.

Appliqué dans `normalizeProjectSceneRecords`, l'entonnoir unique de la scène.

⚠️ Ne jamais faire passer la géométrie du proxy par `normalizeAtomeSizeToMaxAxis` :
cette fonction **redimensionne au lieu de clamper**.

## Permissions

- **Même compte** : autorisé par défaut (§11.1), mais la surface visée est **toujours
  prévenue** — indicateur de session active, pas de silence.
- **Autre compte** : rien ne passe sans autorisation explicite. Sept capacités séparées,
  vérifiées indépendamment. « Accepter un objet » ne vaut **jamais** « donner le
  contrôle de la machine ».

Seul le propriétaire de la surface décide, peut accorder moins que demandé (jamais
plus), et peut révoquer à tout moment. Une demande en attente n'autorise rien.

`hasSurfaceCapability` doit considérer **toutes** les autorisations vivantes, pas la plus
récente : des autorisations concurrentes portent des capacités différentes.

## Contrôle distant

Brique **indépendante** de la téléportation : un téléphone pilote un Mac sans avoir rien
téléporté. Un identifiant de session **n'est pas une capacité** — chaque événement
d'entrée revérifie que le principal *et* la surface de l'émetteur sont le contrôleur.
Révocation immédiate, sans période de grâce.

Les entrées reçues sont appliquées en **synthétisant des événements pointeur standards**
(`remote_input_applicator.js`), jamais en attaquant le renderer : l'intercepteur de
surface canonique reste l'unique propriétaire du pointeur.

## Ce qui n'existe pas

`RemoteCommands` et `BuiltinHandlers` sont des **fantômes** : les fichiers n'existent
pas, leurs importeurs sont commentés. Le dispatch dans `adole_websocket_message.js` est
mort et `communication_remote_commands.js` retente indéfiniment un global qui
n'apparaîtra jamais. Ne rien construire dessus.

`/ws/control` (Tauri) est un dispatcher **loopback** à six actions audio. Seule son
enveloppe de message a été réutilisée.

## Vérification

Quinze probes dans `temp/teleport_*_probe.mjs`. Elles n'utilisent pas la suite de
tests du dépôt : elles pilotent les vrais handlers sur une base SQLite jetable.

```bash
for p in temp/teleport_*_probe.mjs; do node "$p" || echo "FAIL $p"; done
```

**Aucune vérification en application réelle n'a été faite** : les probes couvrent la
logique, pas la peinture Bevy, pas le geste réel, pas iOS.
