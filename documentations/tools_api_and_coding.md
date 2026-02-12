# Tools API and Coding (v2)

Objectif: definir un systeme unique, coherent et testable pour les tools.
Cette spec remplace les comportements divergents (main toolbox, bureau, panneaux inline)
et impose une seule source de verite pour creation, chargement, execution et historique.

References:
- `src/application/eVe/documentations/tools.md`
- `documentations/ADOLE.md`
- `documentations/Adole Time Machine.md`

## 1) Principes non negociables

1. Un tool est un atome de type `tool`.
2. Un panel n est pas un tool. Un panel est un conteneur/host qui affiche des tools.
3. Toute action utilisateur doit passer par un tool (visible ou headless), y compris drag/scrub/split.
4. Aucune mutation directe de l etat depuis UI. Toutes les ecritures passent par le Command Bus append-only.
5. Un tool doit fonctionner meme s il n est visible nulle part (invocation script/MCP/API).
6. Le meme tool doit etre utilise partout: main toolbox, projet, inline panel, MCP, scripts.
7. Pas de code special "inline tool". Les variantes visuelles sont des overrides de layout uniquement.

## 2) Source unique de verite: Tool Registry

Tous les tools doivent etre declares via une API unique:
- `ToolRegistry.createTool(definition)`
- `ToolRegistry.updateTool(tool_key, patch)`
- `ToolRegistry.disableTool(tool_key)`
- `ToolRegistry.listTools(filters)`
- `ToolRuntime.invoke(tool_key, action, context)`

Regle:
- Si un composant n est pas cree par `createTool`, ce n est pas un tool.
- Le Finder doit lister uniquement les atomes `type = tool` issus de la base.

## 3) Modele de donnees minimal (tool atome)

```jsonc
{
  "id": "tool.play",
  "type": "tool",
  "tool_key": "play",
  "version": 1,
  "meta": {
    "name": "Play",
    "category": "transport",
    "created_by": "user_id",
    "created_at": "2026-02-12T10:00:00Z",
    "updated_at": "2026-02-12T10:00:00Z"
  },
  "ui": {
    "icon": "src/assets/images/icons/play.svg",
    "style_token": "tool-default",
    "size_mode": "default"
  },
  "behavior": {
    "button_type": "alternate",
    "actions": ["pointer.click", "pointer.long", "state.on", "state.off"],
    "history": { "mode": "auto", "coalesce_key": null }
  },
  "capabilities": {
    "contexts": ["project", "panel", "desktop", "mcp", "script"],
    "selection_required": false
  },
  "bindings": {
    "pointer.click": "play.pointer.click",
    "state.on": "play.state.on",
    "state.off": "play.state.off"
  }
}
```

## 4) Typologie des boutons

Valeurs obligatoires de `behavior.button_type`:
- `momentary`: action one-shot, retour inactif immediat.
- `latch`: on/off persistant tant que l utilisateur ne reclique pas.
- `alternate`: alterne entre etats definis (ex: play/pause).

Regles d UX/runtime:
- `momentary` ne doit jamais rester visuellement actif apres execution.
- `latch` doit rester coherent entre vues multiples du meme tool.
- `alternate` doit propager l etat sur toutes les instances visibles du tool.

## 5) Nomenclature standard des actions

Nommage canonique action handler:
- `<tool_key>.pointer.down`
- `<tool_key>.pointer.up`
- `<tool_key>.pointer.click`
- `<tool_key>.pointer.long`
- `<tool_key>.drag.start`
- `<tool_key>.drag.frame`
- `<tool_key>.drag.end`
- `<tool_key>.state.on`
- `<tool_key>.state.off`

Exemple (tool `colorer`):
- `colorer.pointer.click`
- `colorer.pointer.long`
- `colorer.pointer.up`

Invocation programmatique unique:
```js
await ToolRuntime.invoke('colorer', 'pointer.long', { selection, color: '#ff0066' })
```

## 6) Command Bus append-only + historique

Pipeline unique:
1. `ToolRuntime.invoke(...)`
2. validation contexte + permissions + schema
3. emission d intentions vers `CommandBus`
4. persistance append-only (`events`)
5. projection vers `state_current`

Regles d historique:
- Historique gere au moteur, jamais en stockage local ad hoc dans chaque tool.
- Mais toute action utilisateur doit etre emise par un tool -> couverture complete.
- Modes:
  - `auto`: journalise chaque intention valide.
  - `coalesce`: fusionne un flux (ex drag/scrub) par `gesture_id` ou `coalesce_key`.
  - `none`: pas d entree historique (reserve actions purement visuelles/ephemeres).

Undo/Redo:
- Frontieres d annulation basees sur `tx_id` ou `gesture_end`.
- `drag.frame` est coalesce, `drag.end` ferme la transaction.

## 7) Immutabilite et snapshots

Immutabilite stricte:
- `meta.created_by` immutable.
- `meta.created_at` immutable.
- `tool_key` immutable apres creation.
- `type` immutable (`tool` pour un tool).

Snapshots:
- Snapshot = point de validation explicite.
- Le snapshot est immutable apres ecriture.
- `state_current` est derive de `last_snapshot + replay(events)`.
- Le replay doit etre deterministe.

## 8) Exposition MCP

Les tools doivent etre exposes en MCP via les memes regles runtime:
- `tools.list`
- `tools.get`
- `tools.invoke`

Contraintes:
- MCP ne bypass jamais `ToolRuntime` ni `CommandBus`.
- Meme validation, meme permissions, meme audit trail que UI.
- Les appels MCP produisent les memes events append-only.

## 9) Parite visuelle: une seule impl UI de tool

Regle de rendu:
- Une seule implementation de rendu icon/style/etat pour tous les tools.
- Inline panel = meme composant, seules tailles/marges peuvent etre override.
- Interdit: chargeur d icones alternatif specifique inline.

Contrat minimal de style:
- `tool-default` pour forme/couleurs/etat actif/inactif.
- `tool-inline-sm` uniquement pour dimensionnement.
- Meme source d icone partout (`ui.icon`).

## 10) Exemple complet: tool latch "circle"

Definition:
```jsonc
{
  "id": "tool.circle",
  "type": "tool",
  "tool_key": "circle",
  "meta": { "name": "Circle" },
  "ui": {
    "icon": "src/assets/images/icons/circle.svg",
    "style_token": "tool-default"
  },
  "behavior": {
    "button_type": "latch",
    "actions": ["pointer.click", "state.on", "state.off"],
    "history": { "mode": "auto" }
  },
  "bindings": {
    "pointer.click": "circle.pointer.click",
    "state.on": "circle.state.on",
    "state.off": "circle.state.off"
  }
}
```

Handlers (exemple):
```js
// circle.state.on: active le mode creation de cercle
// circle.state.off: desactive le mode creation

// circle.pointer.click: si tool actif, cree un cercle a la position pointeur
await CommandBus.commit({
  kind: 'atome.create',
  tx_id: 'circle-create-<uuid>',
  payload: {
    type: 'shape.circle',
    parent_id: context.project_id,
    properties: {
      position: { x: context.pointer.x, y: context.pointer.y },
      radius: 40,
      fill: '#00AEEF'
    }
  }
})
```

Comportement:
- 1 clic sur le tool `circle` -> actif (latch on).
- Chaque clic canvas cree un cercle historise.
- Re-clic sur le tool `circle` -> inactif (latch off).

## 11) Separation stricte: tools vs panels vs vues

- Tool: logique executable + definition base.
- Tool instance: projection visuelle d un tool dans une vue (main, panel, projet).
- Panel: layout/host, aucun code metier de tool.

Un panel ne doit jamais reimplementer:
- chargement d icone,
- gestion d etat actif,
- logique click/long-click,
- historique.

## 12) Evolution requise du format atome

Pour supporter ce modele proprement, le format atome doit etre etendu avec:
- `type = tool` normalise,
- `tool_key` unique global,
- `behavior.button_type`,
- `behavior.history.mode`,
- `bindings` normalises,
- `capabilities.contexts`.

Recommendation:
- versionner le schema (`schema_version`) et fournir un migrateur v1 -> v2.

## 13) Checklist de conformite (R1D)

1. Tous les tools existants passent par `ToolRegistry.createTool`.
2. Finder interroge la base sur `type = tool` uniquement.
3. Plus aucun chemin de rendu "inline only".
4. Toutes les actions utilisateur (drag inclus) passent par `ToolRuntime.invoke`.
5. Tout write passe par Command Bus append-only.
6. Snapshots explicites et immutables.
7. MCP branche sur les memes APIs runtime.
8. Aucun doublon de tool (pas de prefixes redondants type `mtrack transport play`).

