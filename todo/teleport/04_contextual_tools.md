# Téléportation — Lot 4 : outils contextuels

État : **fait pour la logique** (2026-08-15). Dépend des lots 1 à 3.

## Ce qui a été livré

- `eVe/intuition/tools/teleport.js` (nouveau) — quatre actions UI
  (`ui.teleport.send`, `.return`, `.persist`, `.retarget`) et surtout
  `hiddenTeleportToolKeysFor(properties)`, la règle de visibilité contextuelle.
- `main_menu_content_runtime.js` — quatre entrées de catalogue, `action: 'momentary'`,
  aucune ouverture de panneau.
- `main_tool_interaction_runtime.js` — `teleport: 'tool.main.teleport'`.
- `atome_edit_footer_model_runtime.js` — clés téléportation ajoutées aux défauts de
  chaque kind concerné.
- `atome_edit_footer_runtime.js` — le résolveur fusionne les `hiddenKeys` de l'appelant
  avec ceux calculés depuis l'état de téléportation de l'objet.

## La règle de visibilité (§8)

| État de l'objet | Outils affichés |
| --- | --- |
| local | téléporter |
| `TELEPORT_PREPARING` | **aucun** — l'issue n'est pas décidée |
| `REMOTE`, vu depuis la source | rapatrier, laisser, déplacer |
| `REMOTE`, vu depuis l'hôte | téléporter (c'est l'objet réel) |
| `PERSISTED_REMOTE` | rapatrier, déplacer |
| `DISCONNECTED` | rapatrier seulement — le chemin de récupération du §16 |

Aucun panneau, aucune fenêtre, aucun menu ajouté : §4.1 tenu. Libellés = verbes,
conformément à `todo/context_tools.md`.

## Régression attrapée et corrigée

L'import statique du Teleport Manager depuis l'outil rendait **tout le graphe de l'API
Adole eager** dans le runtime du footer contextuel : 28 modules de plus à chaque boot,
pour du code qui ne s'exécute que si l'on presse un outil de téléportation. C'est
contraire au contrat de performance mobile (`boot_runtime.js` ne fait aucun warmup, les
modules restent lazy).

Corrigé : le manager est chargé par `import()` **dans les handlers**. Les deux imports
statiques restants sont sans dépendance (`teleport_state.js`) ou locaux au renderer
(`teleport_residual_projection.js`), donc décider *quels outils afficher* reste
synchrone et gratuit.

Vérifié par parcours du graphe d'imports depuis `atome_edit_footer_runtime.js` :
`adole.js` et `teleport_manager.js` ne sont plus atteignables statiquement.

## Vérification

- `temp/teleport_contextual_tools_probe.mjs` — 8 sections : les six états ci-dessus,
  plus le câblage réel (entrées de catalogue, `tool_id`, défauts par kind, id d'outil
  principal, libellés-verbes, absence d'ouverture de panneau).
- Graphe d'imports : 231 modules atteignables depuis le footer, sans la couche API.
- Les sept probes des lots 1 à 4 passent ensemble.

## Reste à faire sur ce lot

- **Sélection multi-destinations (lot 6).** `teleportToChosenTarget` renvoie déjà
  `teleport_destination_required` avec la liste ; la toolbox doit la présenter. Une
  seule cible part directement (§5.2), zéro cible renvoie `teleport_no_destination`
  sans rien casser (§20).
- **Icônes.** `send` / `undo` / `check` sont des emprunts ; à challenger avec la
  grammaire visuelle eVe en même temps que l'apparence du proxy résiduel (lot 3).
- **i18n.** Les clés `eve.menu.teleport*` doivent être ajoutées aux fichiers de
  traduction ; le fallback français est en dur pour l'instant.
- **Vérification en application réelle** : non faite.
