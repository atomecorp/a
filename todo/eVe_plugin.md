# Système de plugins Atome / eVe — concepts, challenge, plan, guideline et APIs

Statut : **conception validée contre les sources, aucun code écrit.**
Ce fichier est un **prompt d'exécution** : à coller tel quel dans l'agent de dev.

Phase d'exécution assignée : **Phase 10** (voir `todo/execution_order.md`, section « Todo scope registry »).

Maps à lire avant toute écriture : `maps/ARCHITECTURE_MAP.md`, `maps/API_MAP.md`,
`maps/CODEMAP.md`, `maps/DESIGN_MAP.md`. Ce document ne les remplace pas, il s'y branche.

---

## Rôle

Tu es un agent de développement senior sur une base JavaScript / Rust / Bevy / WebGPU / WASM.

Ta tâche : livrer un **système de plugins tiers** pour eVe qui n'ouvre **aucune** brèche
dans les invariants existants (commit append-only, SSOT unique par domaine, un seul
renderer, un seul propriétaire de texte, un seul bus d'entrée pointeur, budgets de frame).

### Règles impératives

1. Lire `./.codex/AGENTS.md` et les 4 maps avant toute écriture.
2. Travailler dans `/Users/jean-ericgodard/RubymineProjects/a/`, **jamais** dans un worktree.
3. `eVe/` est un **sous-module git** : pas de `git stash` depuis le parent.
4. **Ne jamais commiter ni pusher.** Annoncer « prêt » et s'arrêter.
5. **Ne pas lancer la suite de tests du repo.** Pour chaque modification : écrire une
   probe ciblée dans `./temp`, la faire échouer d'abord, puis passer.
6. Un plugin **n'ajoute jamais une table** ; il **ajoute une ligne** dans la table du
   propriétaire existant. Toute nouvelle table de routage parallèle est un échec.
7. Aucun ajout de `kind` universel. Le vocabulaire existant suffit (§3).

---

## 0. Verdict du challenge, en trois lignes

- **Le format Atome contient déjà le manifeste de plugin.** `capabilities` / `interfaces` /
  `composition` / `policy` / `lifecycle` existent, sont normalisés, et décrivent exactement
  ce qu'un manifeste de plugin doit décrire. Il n'y a **rien à inventer** côté modèle.
- **Il manque trois choses, et une seule est coûteuse** : la persistance de cette enveloppe
  (petit), l'ouverture des points d'extension figés (petit × 7), et **un bac à sable
  d'exécution** (le vrai travail, aujourd'hui inexistant).
- **« L'effort sera minime » est vrai pour tout sauf le temps réel audio/vidéo.**
  L'architecture interdit explicitement le chemin facile (compositeur JS à côté de Bevy,
  callback audio en JS). Les effets signal passent obligatoirement par Rust/WASM/WGSL.
  C'est cadrable, ce n'est pas gratuit. Voir §2.3.

---

## 1. Inventaire vérifié — ce que le format donne déjà gratuitement

Tout ce qui suit a été lu dans les sources, pas supposé.

### 1.1 L'enveloppe universelle EST un manifeste de plugin

`atome/src/shared/atome_universal_contract.js` définit déjà :

| Champ | Contenu | Usage plugin direct |
|---|---|---|
| `kind` | `application, ui, tool, api, agent, workflow, service, protocol, data_model, capability, component, connector, automation, pack, policy, visual, media, project, user, generic` | `pack` = le plugin ; les autres = ses contributions |
| `capabilities[]` | `{key, description, inputs_schema, outputs_schema, effects[], risk_level, permissions[]}` avec `effects ∈ {read, write, persistent, external_write, network, execution}` et `risk_level ∈ {LOW, MEDIUM, HIGH, CRITICAL}` | permissions demandées **et** capacités offertes |
| `interfaces` | `{inputs, outputs, events, commands}` | contrat d'appel du plugin |
| `composition` | `{dependencies, children, ports, compatible_with}` | dépendances, contributions, compatibilité |
| `policy` | `{permissions, visibility ∈ {private, group, enterprise, public_free, public_paid}, license, pricing, entitlements}` | **le magasin est déjà modélisé** |
| `lifecycle` | `{version, migrations, compatibility, deprecation, archived_at}` | install / upgrade / dépréciation |

Un plugin n'est donc pas un nouveau type d'objet. C'est un Atome de `kind: "pack"`.

### 1.2 Ce qui vient gratuitement dès qu'un plugin écrit par le chemin canonique

Toute mutation qui passe par `window.Atome.commit` / `commitBatch` hérite **sans code
supplémentaire** de : événements append-only, projection `state_current`, historique,
undo, snapshots, sync multi-runtime, partage/ACL (`database/adole_permissions.js`),
replay temporel, et rendu Bevy automatique pour les kinds visuels.

C'est le principal argument : **un plugin qui commit correctement est déjà persistant,
synchronisé, partageable, annulable et rendu.**

### 1.3 Registre d'outils v2 — déjà un demi-registre de plugins

- `eVe/intuition/contracts/contracts.js` : `TOOL_CONTRACT_V2` exige
  `{id, type, schema_version, tool_key, meta, ui, behavior, capabilities, bindings}`.
- `eVe/intuition/tools/core/tool_registry.js` : chaque outil est **persisté comme Atome**
  (`type: 'tool'`, `tool_definition` sérialisé dans les props, `finder_visible`, `label_key`).
- `eVe/intuition/tools/core/tool_runtime_registered_handler.js` : registre de handlers
  **dynamique à l'exécution** (`window.atome.tools.handlers`, une `Map`, avec option
  `overwrite`). Point d'injection déjà présent.
- Invocation unifiée : `atome.tools.v2Runtime.invokeById({tool_id, action, input, source, meta})`.

### 1.4 Passerelle IA / MCP — déjà un moteur de politique

`atome/src/squirrel/ai/agent_gateway.js` :
`registerTool({name, capabilities[], risk_tier, handler})`, moteur de politique
`allow / deny / require_confirm`, journal d'audit, idempotence, propositions + approbation,
quotas (`quota_tracker.js`), limites de débit par capacité
(`atome/src/squirrel/atome/mcp_security_policy.js` : `mail.send` 3/min, `calendar.write` 8/min,
`runtime.sensitive` 5/min, `toolchain.sensitive` 4/min).

**Conséquence** : un outil de plugin correctement déclaré devient appelable par l'IA,
par la voix et par MCP **sans une ligne de code supplémentaire**.

### 1.5 UI déclarative BevyUI — le plus gros levier

Les panneaux sont **des arbres de données**, pas du DOM :
structure imposée `PanelRoot -> BodyScroll -> FooterControls`, primitives déjà validées dans
`eVe/intuition/runtime/bevy_panel/` (texte, séparateur, bouton icône, `text_input`,
multiline, numérique, select, segmented, accordéon, table, media card, scope chips,
selectable list, sortable header, matrix, choice).

**Conséquence décisive** : l'UI d'un plugin peut être **du JSON**. Donc sérialisable, donc
franchissable par `postMessage`, donc sandboxable, donc identique sur Web / Tauri / iOS
sans travail par plateforme. C'est ce qui rend le bac à sable réaliste.

### 1.6 Autres briques réutilisables

- `eVe/domains/rendering/renderer_adapter_registry.js` — enregistrement d'adaptateurs par `kind`.
- `atome/src/application/audio_runtime/` — `AVClock`, `AVClockRegistry`, `AVMemoryObjectStore`,
  `AVAtomeObjectStore`, `createUnsupportedCapabilityError`, `AVMonitoringStore`.
- Façades ouvertes `atome/src/squirrel/{mail,contacts,calendar,bank}/`.
- `atome/src/squirrel/security/token_vault.js` — coffre chiffré (secrets de plugin).
- `atome/security/trusted_keys.js` + `serverVerification*.js` — modèle de vérification
  cryptographique réutilisable pour la signature de paquets.
- i18n par clé (`label_key`) déjà dans le contrat d'outil.

---

## 2. Challenge — où la prémisse tient, où elle casse

### 2.1 Là où l'effort est réellement minime (≈ 70 % du système)

Modèle de données, manifeste, persistance, historique, partage, sync, exposition IA/MCP,
description d'UI, catalogue, i18n, magasin (champs `policy.pricing` / `entitlements`).
Tout est déjà là ou à un `properties.manifest` près.

### 2.2 Là où il n'y a rien du tout : l'exécution

**Aucun mécanisme du dépôt n'exécute du code tiers.** Un seul `Worker` existe
(`atome/src/squirrel/voice/local_tts_runtime.js`), aucun `iframe sandbox`, aucun chargement
dynamique de code non versionné.

Le piège évident, et **à refuser explicitement** : donner au plugin un `import` vers
`window.atome.*`. Cela détruirait d'un coup :
mutation directe hors bus de commandes, propriété du DOM, second renderer, second
propriétaire de texte, second intercepteur pointeur — tous interdits par
`maps/ARCHITECTURE_MAP.md`.

### 2.3 Là où la prémisse est fausse : audio/vidéo temps réel

Contraintes dures relevées dans les maps :

- AUv3 : « no blocking or allocation-prone realtime audio work ».
- « Live project video must not be solved by ... adding a JavaScript side compositor
  beside Bevy. »
- Le moteur audio est Kira (natif + WASM), la vidéo passe par `GPUExternalTexture` dans
  Bevy, avec batching désactivé par piste.

Donc **un plugin JS ne peut pas être dans le callback audio ni dans la boucle de composition
vidéo**. Il faut un modèle à deux plans, et il faut l'assumer :

| Plan | Porteur | Latence | Contenu |
|---|---|---|---|
| **Contrôle** | déclaratif ou Worker JS | tolérante | construire des graphes, régler des paramètres, ordonnancer, analyser hors-ligne, transformer des assets, produire des presets |
| **Signal** | WASM (audio) / WGSL (vidéo) | échantillon / frame | `process(in, out, params, frames)`, zéro allocation, zéro appel hôte |

Livrer le plan de contrôle en premier, le plan signal en lot séparé (L8).

### 2.4 Le risque n°1 n'est pas technique : c'est l'érosion du SSOT

Chaque point d'extension qui accepte un plugin devient un second SSOT **sauf si
l'enregistrement traverse le propriétaire existant**. D'où la règle 6 des règles impératives.

### 2.5 Le risque n°2 : le plugin comme contournement du bus de commandes

Toute API qui rend un **objet vivant** (nœud DOM, handle d'arbre Bevy, référence d'Atome
mutable) rouvre la mutation directe.

→ **Règle d'or** : l'intégralité de l'API plugin est **message-passing avec des valeurs
sérialisables** (structured-clone) et **asynchrone**. Aucun handle. Aucun objet vivant.

Bénéfice collatéral : déclaratif, Worker et WASM deviennent **trois porteurs du même
contrat**. Un seul protocole à écrire, à tester et à documenter.

### 2.6 Le risque n°3 : les budgets de performance

Le dépôt a payé cher ses budgets (aucune frame > 32 ms, rafraîchissement de panneau
coalescé sur 1 rAF, cache de textures 16 MiB / 96 entrées, DPR plafonné à 1.5, renderer
strictement événementiel sans cadence idle). Un plugin qui reconstruit son arbre à chaque
frame les annule tous.

→ Quotas par plugin + chien de garde + démontage forcé (L6).

### 2.7 Dette latente trouvée pendant l'audit (à corriger dans L0)

`UNIVERSAL_KINDS` est **dupliqué** entre `atome/src/shared/atome_universal_contract.js:3`
et `database/adole_storage_projection.js:5`. Deux listes à maintenir en parallèle = un
divergent garanti dès qu'un `kind` bouge. À unifier avant d'y appuyer un système de plugins.

---

## 3. Concept retenu

### 3.1 Un plugin est un Atome de `kind: "pack"`

Aucun nouveau `kind`. Le paquet référence ses contributions via `composition.children`,
chacune étant un Atome d'un `kind` **existant** :

| Contribution | `kind` | Propriétaire de destination |
|---|---|---|
| outil de menu / palette / flower | `tool` | `tool_registry.js` + `eVeIntuition.js` |
| surface de panneau BevyUI | `ui` | `panel_definitions.js` (via fonction d'enregistrement) |
| rubrique Dashboard | `data_model` | `dashboard_model.js` |
| outil IA / MCP | `agent` | `AtomeAI.registerTool` + `mcp_security_policy.js` |
| enchaînement automatisé | `workflow` | `mcp.toolchains` |
| source externe (mail, contacts, calendrier, IA, social) | `connector` | façade ouverte du domaine |
| effet audio / vidéo | `capability` + artefact | registre d'effets AV (à créer, L8) |
| jeu de tokens visuels | `component` | `elements/skin/` (liste blanche, L5) |
| grant / entitlement | `policy` | `plugin_capability_grants.js` (à créer) |

### 3.2 Manifeste — exemple complet

```json
{
  "id": "pack.acme.photo",
  "type": "pack",
  "kind": "pack",
  "schema_version": 1,
  "meta": {
    "name": "Acme Photo",
    "description": "Filtres et retouche non destructive",
    "created_by": "acme"
  },
  "lifecycle": {
    "version": "1.2.0",
    "compatibility": { "atome_plugin_api": "^1.0.0" },
    "migrations": [{ "from": "1.1.0", "to": "1.2.0", "tool_id": "acme.photo.migrate" }]
  },
  "policy": {
    "visibility": "public_paid",
    "license": "proprietary",
    "pricing": { "model": "one_time", "amount_cents": 900, "currency": "EUR" },
    "entitlements": ["acme.photo.pro"]
  },
  "capabilities": [
    { "key": "atome.read",     "effects": ["read"],                          "risk_level": "LOW" },
    { "key": "atome.write",    "effects": ["read", "write", "persistent"],   "risk_level": "MEDIUM" },
    { "key": "media.transform","effects": ["read", "execution"],             "risk_level": "MEDIUM" },
    { "key": "ui.panel",       "effects": ["read"],                          "risk_level": "LOW" }
  ],
  "composition": {
    "dependencies": [],
    "compatible_with": ["image", "video"],
    "children": [
      { "id": "acme.photo.tool.filters", "kind": "tool",
        "contribution_point": "flower.context", "target_kinds": ["image"] },
      { "id": "acme.photo.panel",        "kind": "ui",
        "contribution_point": "panel.surface" },
      { "id": "acme.photo.ai.describe",  "kind": "agent",
        "contribution_point": "ai.tool" }
    ]
  },
  "interfaces": {
    "commands": { "apply_filter": { "params": { "filter_id": "string", "amount": "number" } } },
    "events":   { "filter_applied": { "atome_id": "string" } }
  },
  "carrier": {
    "type": "worker",
    "entry": "index.js",
    "integrity": "sha384-...",
    "network_allowlist": []
  }
}
```

`carrier` est le seul champ **hors** enveloppe universelle : il vit dans
`properties.carrier` (§4, L0).

### 3.3 Trois porteurs, un seul protocole

| Porteur | Pour quoi | Isolation |
|---|---|---|
| `declarative` | UI + enchaînements d'outils existants + connecteurs décrits. **Aucun code.** | totale, par construction |
| `worker` | logique métier JS, transformations d'assets, plan de contrôle AV | `Worker` sans DOM, sans `fetch`, sans `window` ; uniquement `MessagePort` |
| `wasm` | DSP audio, effet vidéo, calcul lourd | module WASM à ABI figée, mémoire préallouée par l'hôte |

Le porteur `declarative` doit couvrir la majorité des cas : c'est lui qui rend la promesse
« effort minime » réelle, et il ne demande aucun bac à sable.

### 3.4 Règle d'or

> Tout ce qui traverse la frontière plugin ↔ hôte est **une valeur sérialisable, asynchrone,
> et vérifiée contre une capacité accordée**. Jamais un handle, jamais un objet vivant,
> jamais un accès synchrone à un état de l'hôte.

---

## 4. PHASE 1 — Ce qui manque dans Atome (backlog d'implémentation)

Lots ordonnés. Chaque lot est livrable seul et a un critère de sortie vérifiable par probe.

### L0 — Persistance de l'enveloppe universelle *(petit, bloquant)*

**Constat vérifié** : `normalizeCanonicalAtome(record, { universal: true })` calcule
`capabilities / interfaces / composition / policy / lifecycle` aux frontières
(`server/atomeRouteContract.js:49`, `database/adole_storage_projection.js:80,102`), mais le
stockage ne fait transiter que `properties`. Un manifeste écrit aujourd'hui **revient vide**
au relecture, hors défauts du type enregistré.

Tâches :
- Choisir **un** domicile durable et un seul : `properties.manifest` (aligné sur le
  précédent `tool_definition` du registre d'outils) — préféré, aucune migration SQL.
- Réhydrater l'enveloppe depuis `properties.manifest` dans `projectStoredAtome` et
  `projectStoredStateCurrent`.
- Unifier `UNIVERSAL_KINDS` : `database/adole_storage_projection.js` importe la liste depuis
  `atome/shared/atome_universal_contract.js` au lieu de la redéclarer.
- Ajouter le type `pack` à `atome/src/shared/core_atome_types.js` (schéma :
  `manifest`, `carrier`, `install_state`, `granted_capabilities`, `source_domain`).

Critère de sortie : une probe `./temp/` écrit un Atome `pack` avec manifeste complet via
`Atome.commit`, le relit via `state_current`, et retrouve `capabilities`, `policy`,
`lifecycle` et `composition.children` **identiques** octet pour octet après aller-retour.

### L1 — Contrat de manifeste *(petit)*

Créer `atome/src/squirrel/plugins/plugin_manifest_contract.js` :
`validatePluginManifest(manifest)` construit au-dessus de `atome_universal_contract.js` —
vérifie `carrier`, `composition.children[].contribution_point` contre le registre de points
d'extension, `lifecycle.compatibility.atome_plugin_api` en semver, unicité des ids,
absence de cycle dans `dependencies`.

Critère de sortie : probe couvrant 12 manifestes invalides (capacité inconnue, point
d'extension inconnu, cycle, semver incompatible, id dupliqué, effet non supporté…) →
12 erreurs typées distinctes, aucune exception non typée.

### L2 — Registre des points d'extension *(moyen)*

**C'est le lot qui ouvre les tables figées.** Créer
`atome/src/squirrel/plugins/contribution_points.js` : table déclarative
`{ point_id, owner_module, required_capabilities[], register_fn, unregister_fn, max_per_plugin }`.

Points à ouvrir, chacun via une **fonction d'enregistrement dans le module propriétaire**
(jamais une table parallèle) :

| Point | Propriétaire actuel (figé) | Travail |
|---|---|---|
| `tool.catalog` | `tool_registry.js` | déjà dynamique — exposer un `registerPluginTool` capé |
| `menu.main` / `menu.palette` | `eVe/intuition/eVeIntuition.js` | slot d'appoint en fin de ruban, plafonné |
| `flower.context` | `eVe/intuition/flower/` | filtre par `target_kinds` |
| `panel.surface` | `eVe/intuition/panel_definitions.js` (littéral gelé) | `registerPanelSurface(def)` + résolution lazy du module |
| `dashboard.category` | `dashboard_model.js` + `eVe/default_values/constants.json` | catégorie `generic_record` avec `source_domain: "plugin.<id>"` — le contrat v1 existe déjà |
| `ai.tool` | `AtomeAI.registerTool` | déjà dynamique — préfixer et quotas |
| `mcp.capability` | `mcp_security_policy.js` (chaîne de `if` sur préfixe) | remplacer par un résolveur consultant le registre |
| `renderer.kind` | `renderer_adapter_registry.js` | déjà dynamique — **refuser** en v1 (§6) |
| `av.effect` | *n'existe pas* | créé en L8 |

Critère de sortie : une probe enregistre puis retire un outil, une surface de panneau et une
rubrique Dashboard depuis un pack fictif ; après retrait, `0` trace dans le catalogue
d'outils, `0` enregistrement de surface, `0` enregistrement Bevy résiduel, et le menu
principal reste visible et interactif.

### L3 — Protocole de pont *(moyen)*

`atome/src/squirrel/plugins/plugin_bridge_protocol.js` — schéma de message unique :

```
host  -> plugin : { t:'activate'|'deactivate'|'intent'|'event'|'result'|'error', id, payload }
plugin -> host  : { t:'call'|'declare_ui'|'emit'|'log', id, capability, payload }
```

Invariants : tout `call` porte une `capability`, refusée si non accordée ; toute charge utile
passe un test structured-clone ; tout `call` a un délai maximal ; les ids sont opaques et
non devinables ; aucune fonction, aucun nœud DOM, aucun `Proxy` ne franchit la frontière.

Critère de sortie : probe qui tente de faire passer une fonction, un `HTMLElement`,
un `Proxy` et un objet cyclique → 4 refus typés, aucun crash du pont.

### L4 — Grants de capacités *(moyen)*

`atome/src/squirrel/plugins/plugin_capability_grants.js` — un Atome `policy` par couple
(utilisateur, plugin) : `{granted[], denied[], granted_at, granted_by, revoked_at}`.

- Vérification **à chaque appel hôte**, pas à l'installation seulement.
- Mapping `risk_level` → politique par défaut : `LOW` auto, `MEDIUM` consentement à
  l'installation, `HIGH`/`CRITICAL` `require_confirm` **à chaque appel** via le moteur
  existant de `agent_gateway.js`.
- Révocation immédiate : le prochain appel échoue, le plugin est désactivé.

Critère de sortie : probe révoquant `atome.write` pendant l'exécution d'un plugin →
le commit suivant échoue avec `plugin_capability_revoked`, aucun événement n'est écrit,
le plugin passe en `disabled`.

### L5 — Hôte de cycle de vie *(gros)*

`atome/src/squirrel/plugins/plugin_host_runtime.js` :
`install → resolve deps → check grants → start carrier → activate contributions →
deactivate → uninstall`, plus `upgrade` exécutant `lifecycle.migrations`.

États persistés : `installed | enabled | disabled | failed | quarantined`.
Un plugin `failed` **ne redémarre pas** au boot suivant sans action explicite.
Démarrage **paresseux** : aucun plugin ne démarre au boot par défaut — c'est une contrainte
dure du contrat de boot mobile (« Boot and workspace restoration are demand-driven »).

Porteurs : `plugin_carrier_declarative.js`, `plugin_carrier_worker.js`,
`plugin_carrier_wasm.js` (stub en L5, réel en L8).

Critère de sortie : probe install → enable → contribution visible → disable →
**zéro** enregistrement résiduel (outil, surface, rubrique, outil IA, écouteur, timer,
enregistrement Bevy) → uninstall → zéro Atome orphelin de `source_domain: "plugin.<id>"`.
Puis reboot : aucun plugin démarré, aucun coût de boot mesurable (comparer au collecteur
`?perf=1` → `window.__squirrelPerf`).

### L6 — Quotas et chien de garde *(moyen)*

`atome/src/squirrel/plugins/plugin_quota_runtime.js`, adossé au modèle de
`atome/src/squirrel/ai/quota_tracker.js` :

| Ressource | Budget par défaut |
|---|---|
| mise à jour d'arbre UI | ≤ 1 par frame d'animation, coalescée |
| commits | ≤ 10/s en rafale, ≤ 100/min |
| appels réseau | liste blanche du manifeste uniquement, ≤ 30/min |
| temps mur d'un handler d'intention | 250 ms → avertissement, 2 s → terminaison |
| mémoire du worker | plafond annoncé, dépassement → `quarantined` |
| jobs de transformation média | 1 concurrent par plugin |

Critère de sortie : probe avec un plugin volontairement abusif (boucle de rebuild UI) →
le budget de 32 ms de frame **n'est pas dépassé**, le plugin est terminé et mis en
`quarantined`, l'application reste interactive.

### L7 — Surface API publique et versionnage *(moyen)*

Geler `atome.plugin.api@1` (§5.3). Ce lot **crée une obligation** que le dépôt n'a pas
aujourd'hui : la culture actuelle est « vérifier la source avant de dépendre d'un module ».
Un auteur tiers ne peut pas faire ça.

- Un fichier de surface unique, exporté et testé, avec politique de dépréciation
  (2 versions mineures de préavis, refus au chargement si `compatibility` incompatible).
- Ajouter la famille dans `maps/API_MAP.md` en **Public open**.

Critère de sortie : probe de conformité qui énumère la surface exportée et échoue si un
symbole disparaît ou change de signature sans bump de version.

### L8 — Plan signal AV *(gros, séparable)*

Registre d'effets `av.effect` + deux chemins :

- **Audio** : ABI WASM figée
  `process(in_ptr, out_ptr, params_ptr, frames) -> void`, buffers préalloués par l'hôte,
  **aucune allocation, aucun verrou, aucun appel hôte** dans `process` (contrainte AUv3).
  Chargement côté Kira, déclaration de `latency_frames` obligatoire.
- **Vidéo** : descripteur WGSL branché sur le pipeline de matériaux Bevy existant
  (`atome/renderers/bevy-core/`), pas de compositeur JS, pas de lecture GPU→CPU.

Alternative non destructive **à privilégier** et déjà supportée : n'exposer que des
**paramètres** sur les champs canoniques existants (filtres couleur, transitions,
`uv_rect`, `material`) — zéro pixel ne traverse la frontière.

Critère de sortie : un effet audio WASM de test tourne en AUv3 sans underrun mesuré sur
10 minutes ; un effet vidéo WGSL de test s'applique sur 4 pistes simultanées en gardant
le p95 de frame sous le plancher navigateur mesuré (`temp/browser_raf_floor_probe.mjs`).

### L9 — Distribution et confiance *(moyen)*

- Format de paquet : manifeste + assets + signature détachée.
- Vérification de signature réutilisant le modèle de `atome/security/trusted_keys.js`.
- `integrity` (sha384) obligatoire sur chaque artefact de code.
- Secrets du plugin dans `token_vault.js` : le plugin peut **utiliser** un secret via une
  capacité, il ne peut **jamais le lire**.
- Le magasin consomme `policy.visibility`, `pricing`, `entitlements` déjà présents ;
  activer la rubrique `tool.dashboard.store` aujourd'hui no-op.

Critère de sortie : un paquet non signé, un paquet signé par une clé inconnue et un paquet
au digest altéré sont **tous les trois** refusés à l'installation avec trois erreurs typées
distinctes.

---

## 5. PHASE 2 — La documentation à écrire pour les auteurs de plugins

Emplacement : `eVe/documentations/plugins/` (le dépôt y a déjà ses docs de contrat).
Langue : anglais, comme le reste de `eVe/documentations/`.

### 5.1 Arborescence de la documentation à produire

```
eVe/documentations/plugins/
  00_overview.md            concepts, un plugin = un Atome pack, les 3 porteurs
  01_quickstart.md          plugin déclaratif « hello panel » en 15 lignes de JSON
  02_manifest_reference.md  référence champ par champ (§3.2)
  03_capabilities.md        catalogue des capacités, effets, niveaux de risque, consentement
  04_api_reference.md       atome.plugin.api@1, namespace par namespace (§5.3)
  05_ui_guide.md            arbres BevyUI, primitives autorisées, intentions, i18n
  06_contribution_points.md les slots, leurs contraintes, leurs quotas
  07_domain_audio_video.md  recette AV : plan de contrôle vs plan signal
  08_domain_communication.md connecteurs mail / contacts / calendrier / social
  09_domain_graphics.md     création graphique et retouche photo
  10_domain_text.md         texte, spans riches, transformations
  11_domain_contacts.md     sources d'annuaire
  12_performance.md         budgets, ce qui fait tuer un plugin
  13_security_privacy.md    grants, secrets, réseau, données utilisateur
  14_testing.md             kit de conformité, probes
  15_publishing.md          signature, versions, migrations, magasin
  16_antipatterns.md        les interdits et pourquoi (§6)
```

### 5.2 Ce que `02_manifest_reference.md` doit contenir

Le tableau du §1.1 + le JSON du §3.2, plus, pour chaque champ :
qui le consomme (fichier réel), s'il est durable, s'il est vérifié à l'installation ou à
l'exécution, et ce qui se passe en cas d'absence.

### 5.3 `atome.plugin.api@1` — surface à documenter *(et à figer en L7)*

Tout est `async`, tout retourne des valeurs sérialisables, tout est gaté par capacité.

```js
// --- données canoniques -------------------------------------------------
atome.data.query({ project_id, type, kind, source_domain, limit })   // cap: atome.read
atome.data.get(atome_id)                                            // cap: atome.read
atome.data.commit({ kind, atome_id, props, tx_id })                 // cap: atome.write
atome.data.commitBatch(events, { tx_id })                           // cap: atome.write
atome.data.on('changed', handler)                                   // cap: atome.read

// --- état privé du plugin (Atomes source_domain: "plugin.<id>") ---------
atome.store.get(key) / set(key, value) / list(prefix) / remove(key)  // cap: plugin.store

// --- UI déclarative ------------------------------------------------------
atome.ui.declarePanel({ surface_key, title_key, tree })              // cap: ui.panel
atome.ui.updatePanel({ surface_key, tree, preserve_node_id })        // coalescé 1/frame
atome.ui.closePanel(surface_key)
atome.ui.onIntent(handler)        // { surface_key, node_id, action, value }
atome.ui.notify({ level, message_key, params })

// --- outils ---------------------------------------------------------------
atome.tools.declare({ tool_id, ui, behavior, capabilities, bindings })// cap: tool.declare
atome.tools.onInvoke(handler)                                        // { tool_id, action, input }
atome.tools.invoke({ tool_id, action, input })                       // cap: tool.invoke

// --- sélection et contexte projet ---------------------------------------
atome.context.selection()          // ids + kinds, jamais de nœuds
atome.context.currentProject()
atome.context.textRange()          // plage de style courante, lecture seule

// --- média, plan de contrôle --------------------------------------------
atome.media.listAssets(filter)                                       // cap: media.read
atome.media.transform({ asset_id, op, params })                      // cap: media.transform
atome.media.analyze({ asset_id, features, rate_hz })                 // ≤ 30 Hz, métré
atome.media.transport({ action, position, clock_id })                // cap: media.control
atome.media.declareEffect(descriptor)                                // cap: av.effect (L8)

// --- communication --------------------------------------------------------
atome.comm.mail.*      // cap: mail.read | mail.send   (send => HIGH, confirm systématique)
atome.comm.contacts.*  // cap: contacts.read | contacts.write
atome.comm.calendar.*  // cap: calendar.read | calendar.write
atome.comm.share.*     // cap: share.write

// --- IA --------------------------------------------------------------------
atome.ai.declareTool({ name, description, params, capabilities, risk_tier })
atome.ai.call({ tool_name, params })                                 // quota partagé

// --- divers ----------------------------------------------------------------
atome.net.fetch(request)     // cap: net.fetch, liste blanche du manifeste, jamais direct
atome.secrets.use(secret_id, operation)  // utilise sans jamais lire
atome.i18n.t(key, params)
atome.log.info|warn|error(message, data)
```

**Absent volontairement, et le doc doit dire pourquoi** :
`document`, `window`, `fetch` global, accès Bevy, accès renderer, accès DOM, accès direct
au store, accès synchrone, callbacks par frame.

### 5.4 Recettes par domaine — le contenu qui compte

**`07_domain_audio_video.md`**
- Ce qu'un plugin peut faire aujourd'hui sans plan signal : arranger des clips, régler
  gains/trims/transitions, produire des presets, analyser hors-ligne, générer des pistes,
  piloter le transport, réagir à la progression de lecture.
- Ce qui exige L8 : tout traitement échantillon par échantillon ou pixel par pixel.
- Caméra/micro : **jamais** d'accès direct. Le plugin demande une session de capture par
  capacité ; l'hôte détient la permission plateforme et le `MediaStream` ; le plugin reçoit
  soit des trames d'analyse métrées, soit un identifiant d'overlay branché sur le chemin
  `GPUExternalTexture` existant.
- Contrainte AUv3 à répéter mot pour mot dans le doc.

**`08_domain_communication.md`**
- Un connecteur **implémente un port de façade** (`list`, `get`, `sync`, `send`), il n'ouvre
  pas son propre transport. Les opérations métier passent par `/ws/api` ; HTTP reste
  réservé aux octets (fichiers/médias) et à la découverte. Exception médias temps réel
  Matrix/MediaSoup documentée telle quelle.
- `mail.send` est `external_write` / `HIGH` : confirmation utilisateur systématique,
  plafond 3/min déjà appliqué par `mcp_security_policy.js`.

**`09_domain_graphics.md`**
- **Créer** : commit d'Atomes `shape` / `text` / `image` → rendu Bevy automatique. Gratuit.
- **Retoucher** : deux voies, dans cet ordre de préférence.
  1. *Non destructive* — n'écrire que des paramètres sur les champs canoniques existants
     (couleur, `material`, filtres, `uv_rect`, opacité). Aucun pixel ne traverse.
  2. *Destructive* — `atome.media.transform` : job hôte (worker + OffscreenCanvas/WASM),
     sortie = nouvel asset + commit. Un job concurrent par plugin.
- **Interdit en v1** : enregistrer un nouveau `kind` de rendu (dégradé maillé, primitive
  vectorielle inédite). Cela demande du Rust côté `bevy-core`. Sortie recommandée : produire
  une `image`.

**`10_domain_text.md`**
- `rich_text.spans` supporte déjà `bold`, `color`, `font_family`, `font_size` : les
  transformations de plage sont des commits, pas un éditeur.
- **Interdit** : ouvrir un second éditeur ou capturer le clavier.
  `text_editing_session.js` est l'unique propriétaire de saisie ; un plugin lit
  `atome.context.textRange()` et écrit par `atome.data.commit`.
- Transformations IA (traduire, résumer, reformater) : passer par `atome.ai.call`, quota
  partagé, jamais d'appel réseau direct vers un fournisseur.

**`11_domain_contacts.md`**
- `eve_contacts_local` est la source inscriptible ; les contacts d'annuaire non locaux
  restent non éditables. Un plugin ajoute une **source d'annuaire** (connecteur) ou opère
  via `contacts.read` / `contacts.write`.
- Les projections Dashboard et panneau Contact viennent gratuitement.

### 5.5 `12_performance.md` — le contrat que l'auteur doit signer

Reprendre les budgets de L6, plus les règles d'écriture : arbres UI immuables et diffés,
un seul `updatePanel` par frame, `preserve_node_id` pour ne pas perdre le scroll, pas de
timer périodique (tout est événementiel), pas de préchargement au boot, pas de travail
pendant que le panneau est fermé.

### 5.6 `14_testing.md` — kit de conformité

Un harnais `temp/plugin_conformance/` fourni aux auteurs, qui vérifie :
manifeste valide, aucune capacité non déclarée utilisée, aucune valeur non sérialisable
émise, budgets respectés sur un scénario de 60 s, démontage propre (zéro trace résiduelle),
et comportement correct quand une capacité est révoquée en vol.

---

## 6. Anti-patterns — à refuser en revue, sans négociation

1. Donner au plugin `window`, `document`, `fetch` global, ou un `import` vers `atome.*`.
2. Rendre un handle vivant (nœud DOM, arbre Bevy, référence d'Atome mutable) au plugin.
3. Créer une table de routage parallèle pour les contributions au lieu d'enregistrer dans
   le propriétaire existant.
4. Faire écrire un plugin hors de `Atome.commit` / `commitBatch`.
5. Laisser un plugin peindre : second canvas, DOM overlay, CSS injecté, second renderer.
6. Laisser un plugin capter le pointeur ou le clavier hors du chemin d'intentions.
7. Démarrer des plugins au boot (casse le contrat de boot à la demande).
8. Mettre du JS dans le callback audio ou dans la boucle de composition vidéo.
9. Ajouter un `kind` universel pour « plugin ».
10. Accorder une capacité `HIGH`/`CRITICAL` de façon persistante et silencieuse.
11. Exposer un secret en lecture au plugin.
12. Publier une surface d'API sans version ni politique de dépréciation.

---

## 7. Ordre d'exécution et dépendances

```
L0 ─┬─ L1 ─┬─ L2 ──────────────┐
    │      └─ L3 ── L4 ── L5 ──┴── L6 ── L7 ──┬── L9
    └────────────────────────────────────────┴── L8 (séparable, Rust)
```

- **Jalon « plugin déclaratif utilisable »** : L0 → L1 → L2 → L5(déclaratif) → L6.
  C'est déjà un système de plugins complet pour l'UI, les rubriques, les outils et les
  enchaînements. C'est là que la promesse d'effort minime est tenue.
- **Jalon « plugin tiers exécutable »** : + L3, L4, L5(worker), L7, L9.
- **Jalon « plugin média temps réel »** : + L8. Travail Rust, à planifier séparément.

À faire dès l'ouverture du chantier : ajouter `todo/eVe_plugin.md` au « Todo scope registry »
de `todo/execution_order.md` en Phase 10, et prévoir la mise à jour des 4 maps
(`API_MAP` : nouvelle famille publique ouverte ; `ARCHITECTURE_MAP` : point d'extension
plugins + direction de dépendance ; `CODEMAP` : `atome/src/squirrel/plugins/` ;
`DESIGN_MAP` : liste blanche des tokens exposables) **dans la même tâche** que le code,
comme l'exigent les portails de pré-implémentation.
