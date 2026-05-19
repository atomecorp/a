# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# Audit Technique — eVe Intuition

**Date :** 22 février 2026
**Périmètre :** `eVe/intuition/**`
**Volume total :** ~70 000 lignes, ~65 fichiers JS

---

## Métriques de base

| Fichier | Lignes | Complexité estimée |
|---|---|---|
| `tools/mtrack.js` | 8 431 | ★★★★★ |
| `eVeIntuition.js` | 6 720 | ★★★★★ |
| `tools/communication.js` | 5 057 | ★★★★★ |
| `tools/project_drop.js` | 4 542 | ★★★★ |
| `tools/user.js` | 3 736 | ★★★★ |
| `runtime/tool_genesis.js` | 3 691 | ★★★★ |
| `tools/core/tool_runtime.js` | 3 302 | ★★★★ |
| `tools/finder.js` | 2 694 | ★★★★ |
| `tools/infos.js` | 1 634 | ★★★ |
| `tools/calendar.js` | 1 578 | ★★★ |
| `tools/background.js` | 1 539 | ★★★ |
| `matrix/core/matrix_runtime.js` | 1 475 | ★★★ |
| `tools/core/hmtracks_audio_engine_v1.js` | 1 143 | ★★★★ |
| `runtime/tool.js` | 1 112 | ★★★ |
| `menu/core/toolbox_runtime.js` | 1 042 | ★★★ |
| `runtime/mtrack_dock_controller.js` | 1 043 | ★★★ |

---

## A. Liste Priorisée des Problèmes

### [CRITIQUE] `eVeIntuition.js` — Fichier God (6720 lignes, 255 déclarations top-level)

Ce fichier contient à lui seul : le bootstrap du menu, la gestion des panels, tout le système de locking/dédupe MTrax, la logique de preview video, le dock MTrack, les bindings d'événements globaux, les handlers de tools, le rendu de group timeline. C'est une accumulation incontrôlée de responsabilités sur 5+ années.

**Impact :** impossible à tester unitairement, tout changement risque des régressions non localisables, temps de parse initial excessif.

---

### [CRITIQUE] `eVeIntuition.js` — `mtraxCloseInFlightGuard` utilisé avant déclaration

```js
// Lignes 123-124 : utilisé dans collectMtraxDebugSnapshot()
close_guard_until: Number(mtraxCloseInFlightGuard?.until || 0),
// Ligne 589 : déclaré ici
const mtraxCloseInFlightGuard = { until: 0, route: '' };
```

La déclaration est à la ligne 589 mais le debugger `collectMtraxDebugSnapshot` (ligne 114) y accède via `?.`. Cela fonctionne grâce au hoisting de `const` en zone morte temporelle — si l'expression est jamais évaluée avant la ligne 589 (e.g. log eager), c'est un `ReferenceError`.

**Fix :** Déplacer `mtraxCloseInFlightGuard` en haut du fichier, avant `collectMtraxDebugSnapshot`.

---

### [CRITIQUE] `tools/communication.js` ligne 31 — `require()` dans un module ES

```js
// Fallback: try to import dynamically
try {
    return require('../../../examples/share.js').ShareAPI;
} catch (_) {
    return null;
}
```

`require()` est CommonJS. Ce fichier est un module ES (`import/export`). Dans un bundler Vite/Rollup, `require` n'est pas défini. Ce code lèvera une `ReferenceError` en runtime dans les environnements Tauri et PWA. Le commentaire dit "Fallback" — les fallbacks sont **interdits** selon les instructions de l'équipe.

**Fix :** Importer `ShareAPI` correctement via un import dynamique ES :

```js
const getShareApi = async () => {
    if (typeof window !== 'undefined' && window.ShareAPI) return window.ShareAPI;
    const mod = await import('../../../examples/share.js').catch(() => null);
    return mod?.ShareAPI || null;
};
```

---

### [CRITIQUE] `runtime/selection.js` + `runtime/selection_snapshot.js` — Duplication de la liste de préfixes

```js
// selection.js ligne 24
const TOOL_SELECTION_ID_PREFIXES = Object.freeze(['ui.', 'tool.main.', 'tool.option.', 'tool_ui.', '_intuition_']);
// selection_snapshot.js ligne 1
const SELECTION_TOOL_ID_PREFIXES = Object.freeze(['ui.', 'tool.main.', 'tool.option.', 'tool_ui.', '_intuition_']);
```

Deux constantes identiques avec deux noms différents. Toute modification d'un prefix (ajout/suppression) devra être faite dans les deux fichiers — risque de désynchronisation silencieuse qui causerait des atomes outil sélectionnables à tort.

**Fix :** Exporter la constante depuis `selection.js` et l'importer dans `selection_snapshot.js`.

---

### [CRITIQUE] `eVeIntuition.js` — 399 `addEventListener` pour 70 `removeEventListener`

Ratio **5.7:1**. La majorité des listeners sur `window` installés au bootstrap n'ont pas de contrepartie `removeEventListener`. Dans un contexte WebView/Tauri rechargeable, cela crée des accumulations de listeners fantômes à chaque rechargement.

**Impact :** memory leaks progressifs, événements traités plusieurs fois, comportements erratiques après un reload.

**Fix :** Systématiser un pattern de cleanup ou utiliser `AbortController` + `signal` pour grouper les listeners et les désinscrire lors d'un `squirrel:destroy` ou équivalent.

---

### [CRITIQUE] `eVeIntuition.js` — 116 `setTimeout` pour 51 `clearTimeout`

Ratio **2.3:1**. Des timers non nettoyés en cas de re-renders ou de rechargements partiels. Particulièrement visible dans la logique MTrax où de nombreux timers de guard/bounce ne sont pas systématiquement annulés.

---

### [MAJEUR] Utilitaires locaux redéfinis dans au moins 10 fichiers différents

Les fonctions suivantes sont re-implémentées localement dans chaque fichier au lieu d'être importées depuis un module partagé :

| Fonction | Fichiers concernés |
|---|---|
| `ensureString()` | `tool_runtime.js`, `tool_registry.js`, `tool_definition_ssot.js`, `tool_interaction.js`, `tool_target_id.js`, `tool_button_factory.js`, `panel_creator.js`, `component_creator.js`, `contracts/validator.js` (9 fichiers) |
| `isPlainObject()` | `command_bus.js`, `tool_runtime.js`, `tool_registry.js`, `contracts/validator.js`, `tools/finder.js`, `menu/index.js` (6 fichiers) |
| `deepClone()` | `command_bus.js`, `tool_runtime.js`, `tool_registry.js`, `tools/core/tool_instances.js` (4 fichiers) |

Chaque réimplémentation est légèrement différente en signature ou en comportement. Par exemple `ensureString` dans `validator.js` retourne un boolean, pas une string — incohérence de nommage dangereuse.

**Fix :** Créer `eVe/intuition/shared/utils.js` et y centraliser ces utilitaires.

---

### [MAJEUR] `tools/mtrack.js` — Fichier de 8431 lignes avec responsabilités multiples

Ce fichier contient : rendu UI du panel, lecteur audio/video multi-pistes, gestion des clips, timeline eval, dock behavior, drag & drop, gestion des groupes, playback sync. Il importe 15+ modules et déclare ses propres constantes de timing, seuils audio, schémas de données.

**Fix :** Découpage progressif via le Strangler Pattern en modules ciblés (déjà partiellement amorcé avec `mtrax_renderer_runtime.js`, `hmtracks_audio_engine_v1.js`, `mtrax_timeline_eval.js`). Continuer ce découpage.

---

### [MAJEUR] `eVeIntuition.js` lignes 223-238 — 16 fonctions wrapper inutiles

```js
const ensureHomePanelModule = () => ensureToolModule('home');
const ensureContactPanelModule = () => ensureToolModule('contact');
// ... x14 encore
```

Ces 16 fonctions ne font qu'appeler `ensureToolModule(key)` avec une clé hardcodée. Elles ne sont pour la plupart appelées qu'une fois ou pas du tout (plusieurs sont des artefacts non utilisés). Elles encombrent l'espace de noms du module pour zéro valeur ajoutée.

**Fix :** Supprimer et appeler directement `ensureToolModule('home')` etc. là où nécessaire.

---

### [MAJEUR] `eVeIntuition.js` — Deux systèmes de locking MTrax quasi-identiques

`runWithMtraxActionLock` (ligne 623) et `runWithMtraxOpenInvokeLock` (ligne 690) sont deux implémentations quasi-identiques d'un pattern "in-flight deduplication" avec les mêmes structures de données (`inFlight`, `startedAt`, `promise`, `result`, `finishedAt`).

**Fix :** Factoriser en une fonction générique `createInFlightLock(dedupMs)` qui retourne le lock manager.

---

### [MAJEUR] `tools/communication.js` + `runtime/tool_genesis.js` — Normalisation de recording type dupliquée

```js
// tool_genesis.js ligne 46
const RECORDING_TYPE_MAP = { video_recording: 'video', audio_recording: 'sound' };
// communication.js ligne 70
const COMM_RECORDING_TYPE_MAP = { video_recording: 'video', audio_recording: 'sound' };
```

Logique identique, noms différents. Si un nouveau type d'enregistrement est ajouté, il faut le mettre à deux endroits.

**Fix :** Exporter `RECORDING_TYPE_MAP` et `normalizeRenderKind` depuis un fichier partagé (ex. `shared/media_types.js`).

---

### [MAJEUR] `eVeIntuition.js` — `readExplicitLatchedState` dupliquée avec `tool_gateway.js:readExplicitLatched`

```js
// eVeIntuition.js ligne 80 : readExplicitLatchedState
// tool_gateway.js ligne 65 : readExplicitLatched
```

Même logique de résolution de l'état "latché" d'un tool, avec des noms différents. La version de `tool_gateway.js` a deux checks supplémentaires (`is_open`, `isOpen`). Résultat : certains appels passent par une version moins complète.

**Fix :** Unifier dans `tool_gateway.js` et importer depuis `eVeIntuition.js`.

---

### [MAJEUR] `runtime/layer_contract.js` — MutationObserver global non disconnectable

```js
let layerInvariantObserver = null;
// ensureLayerInvariantObserver() crée l'observer mais n'exporte pas de destroy()
```

L'observer de layer invariant est créé une seule fois et jamais déconnecté. Il observe le DOM global et s'accumule en mémoire si le module est rechargé (mode dev hot reload ou context Tauri rechargeable).

**Impact :** Potentielle fuite mémoire + appels en double après rechargement.

**Fix :** Exporter une fonction `destroyLayerInvariantObserver()` et l'appeler lors de `squirrel:destroy`.

---

### [MAJEUR] `eVeIntuition.js` — `PANEL_TTL_MS` redéfini deux fois

```js
// eVeIntuition.js ligne 239
const PANEL_TTL_MS = Object.freeze({ DEFAULT: 180000, MEDIUM: 120000, HEAVY: 90000 });
// panels/core/panel_creator.js ligne 7
const PANEL_TTL_MS = Object.freeze({ SHORT: 60000, MEDIUM: 120000, LONG: 180000, HEAVY: 90000 });
```

Deux définitions légèrement différentes du même concept — `DEFAULT` vs `LONG`, présence de `SHORT` uniquement dans `panel_creator.js`. Les TTLs de référence ne sont pas la source de vérité unique.

**Fix :** Centraliser dans `panel_creator.js` (ou un fichier `panel_constants.js`) et importer depuis `eVeIntuition.js`.

---

### [MAJEUR] `runtime/tool.js` — `PANEL_MOUNT_PARENT_ID` et `PANEL_MOUNT_LAYER_ID` redéfinis

```js
// eVeIntuition.js lignes 611-612
const PANEL_MOUNT_PARENT_ID = 'intuition';
const PANEL_MOUNT_LAYER_ID = 'intuition_panel_layer';
// tools/core/tool_runtime.js lignes 22-23
const PANEL_MOUNT_PARENT_ID = 'intuition';
const PANEL_MOUNT_LAYER_ID = 'intuition_panel_layer';
```

Constantes dupliquées. Si l'ID du layer change, il faut modifier plusieurs fichiers.

**Fix :** Exporter depuis `runtime/layer_contract.js` qui est déjà la source de vérité des IDs de layers.

---

### [MAJEUR] `tools/communication.js` — Couplage fort avec des APIs globales non documentées

`window.eveMtrackApi`, `window.eveShareApi`, `window.eveCommState`, `window.ShareAPI` sont accédés directement sans contrat d'interface explicite. Si ces APIs changent de structure, `communication.js` se casse silencieusement.

---

### [MINEUR] `eVeIntuition.js` lignes 223-238 — 8+ fonctions `ensure*Module` jamais appelées

`ensureDeletePanelModule`, `ensureCopyModule`, `ensureContactPanelModule` et d'autres ne sont plus utilisées directement dans le fichier — le système de panels passe par `ensureToolModule(key)` directement. Ce sont des artefacts.

**Fix :** Supprimer ces wrappers.

---

### [MINEUR] `runtime/command_bus.js` — `deepClone` via `JSON.parse(JSON.stringify)` pour chaque commande

Pour chaque commande dispatchée, `deepClone` est appelé 3-4 fois (`normalized`, `envelope`, retour). Dans un contexte haute fréquence (frames de gestures), c'est un overhead significatif.

**Fix :** Pour le path `frame` (qui ne persiste pas), ne pas cloner — retourner directement l'objet normalisé.

---

### [MINEUR] `contracts/validator.js` ligne 41 — `ensureString` mal nommée

```js
const ensureString = (value) => typeof value === 'string';
```

Cette fonction retourne un `boolean`, pas une `string`. Le nommage `ensureString` est trompeur (collision avec les 9 autres `ensureString` dans le projet qui elles retournent bien une string).

**Fix :** Renommer en `isString`.

---

### [MINEUR] `runtime/mtrack_dock_controller.js` — `resetState()` duplique manuellement tous les champs de `state`

```js
const resetState = () => {
    clearCollapseTimer();
    disconnectResizeObserver();
    state.host = null;
    state.hostId = '';
    state.headerEl = null;
    // ... 16 assignments manuels
};
```

L'état initial est décrit deux fois : dans l'objet `state` à la création, et dans `resetState()`. Si un nouveau champ est ajouté à `state`, `resetState()` doit être mis à jour manuellement.

**Fix :** Extraire la valeur initiale dans une fonction `createInitialState()` et appeler `Object.assign(state, createInitialState())` dans `resetState()`.

---

### [MINEUR] `eVeIntuition.js` — `positionPanelNearTool` et `positionPanelBelowAnchor` : logique de positionnement inline dupliquée

Ces deux fonctions dupliquent la logique de calcul de position (clamp dans container, gestion des marges, override du left/top). La factorisation en `computeConstrainedPosition(rect, containerRect, panelSize, options)` réduirait chaque fonction à ~10 lignes.

---

### [MINEUR] `tools/mtrack.js` — 90+ constantes de timing déclarées au top du fichier

```js
const MTRACK_PLAYING_DRIFT_SEEK_THRESHOLD_S = 0.28;
const MTRACK_PLAYING_DRIFT_SEEK_THRESHOLD_TAURI_S = 0.08;
const MTRACK_PLAYING_SEEK_COOLDOWN_MS = 170;
// ... 87 autres
```

Toutes ces constantes sont correctement nommées, mais leur volume rend difficile la navigation dans le fichier. Elles devraient résider dans un fichier de configuration dédié.

---

### [MINEUR] `tools/communication.js` — Logique de normalisation d'asset statique réimplémentée

```js
const normalizeStaticAssetUrl = (value) => {
    if (raw.startsWith('/assets/')) return raw;
    if (raw.startsWith('assets/')) return `/${raw}`;
    if (raw.startsWith('./assets/')) return `/${raw.slice(2)}`;
    return raw;
};
```

Un utilitaire similaire existe probablement dans `media_api_shared.js`. À vérifier et centraliser.

---

## B. Propositions Concrètes

### B.1 — Créer `shared/utils.js` (utilitaires centraux)

```js
// eVe/intuition/shared/utils.js
export const ensureString = (value, fallback = '') => {
    const out = String(value == null ? '' : value).trim();
    return out || fallback;
};

export const isPlainObject = (value) =>
    !!value && typeof value === 'object' && !Array.isArray(value);

export const deepClone = (value) => {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
};

export const deepMerge = (base, patch) => {
    if (!isPlainObject(base)) return deepClone(patch);
    if (!isPlainObject(patch)) return deepClone(patch);
    const out = deepClone(base);
    Object.entries(patch).forEach(([key, val]) => {
        out[key] = (isPlainObject(val) && isPlainObject(out[key]))
            ? deepMerge(out[key], val)
            : deepClone(val);
    });
    return out;
};
```

Remplacer toutes les instances locales par des imports depuis ce fichier.

---

### B.2 — Créer `shared/media_types.js`

```js
// eVe/intuition/shared/media_types.js
export const RECORDING_TYPE_MAP = Object.freeze({
    video_recording: 'video',
    audio_recording: 'sound'
});

export const normalizeRenderKind = (kind) =>
    RECORDING_TYPE_MAP[kind] || kind;
```

Supprimer les variantes locales dans `tool_genesis.js` et `communication.js`.

---

### B.3 — Factoriser le locking in-flight

```js
// runtime/in_flight_lock.js
export const createInFlightLock = (dedupMs = 720) => {
    const locks = new Map();
    return {
        async run(key, work) {
            const now = Date.now();
            const current = locks.get(key);
            if (current?.inFlight && (now - current.startedAt) <= dedupMs) {
                return current.promise;
            }
            if (current?.finishedAt && (now - current.finishedAt) <= dedupMs) {
                return current.result ?? { ok: true, deduped: true };
            }
            const promise = Promise.resolve().then(() => work()).finally(() => {
                locks.set(key, { inFlight: false, finishedAt: Date.now(), result: null });
            });
            locks.set(key, { inFlight: true, startedAt: now, promise, result: null });
            const result = await promise;
            locks.get(key) && (locks.get(key).result = result);
            return result;
        },
        clear(key) { locks.delete(key); }
    };
};
```

Remplace `runWithMtraxActionLock` et `runWithMtraxOpenInvokeLock`.

---

### B.4 — Exporter les constantes de sélection depuis selection.js

```js
// runtime/selection.js — ajouter :
export { TOOL_SELECTION_ID_PREFIXES };

// runtime/selection_snapshot.js — modifier :
import { TOOL_SELECTION_ID_PREFIXES as SELECTION_TOOL_ID_PREFIXES } from './selection.js';
// Supprimer la déclaration locale dupliquée
```

---

### B.5 — Exporter les IDs de layers depuis layer_contract.js

```js
// runtime/layer_contract.js — ajouter aux exports :
export { INTUITION_PANEL_LAYER_ID, INTUITION_ROOT_ID };
// Constant 'intuition' et 'intuition_panel_layer' ne doivent exister qu'ici
```

Supprimer `PANEL_MOUNT_PARENT_ID` et `PANEL_MOUNT_LAYER_ID` de `eVeIntuition.js` et `tool_runtime.js`, les remplacer par des imports.

---

### B.6 — Corriger `ensureString` dans `contracts/validator.js`

```js
// AVANT (trompeur)
const ensureString = (value) => typeof value === 'string';

// APRÈS (correct)
const isString = (value) => typeof value === 'string';
const ensureNonEmptyString = (value) => isString(value) && value.trim().length > 0;
// Mettre à jour les 2 usages internes
```

---

### B.7 — Fixer mtraxCloseInFlightGuard (ordre de déclaration)

Déplacer les lignes 589-592 de `eVeIntuition.js` en haut du segment MTrax (avant la ligne 114 où il est accédé).

---

### B.8 — Corriger le `require()` dans communication.js

```js
// AVANT (cassé en ES modules)
try { return require('../../../examples/share.js').ShareAPI; } catch (_) { return null; }

// APRÈS
const getShareApi = () => {
    if (typeof window !== 'undefined' && window.ShareAPI) return window.ShareAPI;
    return null; // ShareAPI doit être chargé via le bootstrap, pas dynamiquement ici
};
```

---

## C. Évaluation Globale

### Lisibilité : 5/10

Les modules `runtime/` (command_bus, layer_contract, history_policy) sont bien écrits et lisibles. Mais `eVeIntuition.js`, `mtrack.js` et `communication.js` sont des fichiers God avec des responsabilités enchevêtrées. La navigation dans ces fichiers nécessite une connaissance approfondie du contexte. Les noms de fonctions sont généralement clairs mais les fonctions sont souvent trop longues (>100 lignes fréquemment).

### Robustesse : 5/10

Le code est très défensif (nombreux guards `typeof window === 'undefined'`, optional chaining partout, fallbacks `|| ''`). Mais :

- 433 blocs `catch` silencieux cachent des erreurs potentiellement critiques
- Le ratio addEventListener/removeEventListener de 5.7:1 est préoccupant
- Un bug structurel réel (require() CJS en ES module) pourrait faire crasher communication.js en prod
- La déduplication de préfixes de sélection crée un risque de désynchronisation

### Architecture : 5/10

La stratégie de modules est bonne en intention (runtime/, tools/, contracts/, panels/) mais mal exécutée : `eVeIntuition.js` accumule tout ce qui n'a pas été déplacé, créant un anti-pattern "God Module". Les couches ne sont pas strictement séparées — `communication.js` accède à des APIs window globales directement. Le travail de découpage déjà amorcé (tool_genesis → tool_runtime, mtrack_renderer, audio_engine) montre la bonne direction mais est incomplet.

### Performance : 6/10

- Lazy loading des modules (`TOOL_MODULES` map) : bien conçu
- Cache des modules chargés (`toolModuleState`) : correct
- `deepClone` via JSON pour chaque commande en mode gesture frame : coûteux
- `document.querySelectorAll` dans `readDomSelectedIds` à chaque snapshot de sélection : potentiellement fréquent
- `collectMtraxDebugSnapshot` construit un objet lourd à chaque appel (même si les logs sont désactivés, la construction de l'objet est faite avant le guard) : overhead inutile
- Les timers non nettoyés (116 vs 51 clearTimeout) peuvent affecter les performances à long terme

---

## D. Plan d'Optimisation

### Phase 1 — Corrections Critiques Immédiates (1-2 jours)

**Stabilisation et sécurisation :**

1. **Déplacer `mtraxCloseInFlightGuard`** avant `collectMtraxDebugSnapshot` dans `eVeIntuition.js`
2. **Corriger `require()` CJS** dans `communication.js` ligne 31
3. **Unifier les préfixes de sélection** — exporter depuis `selection.js`, importer dans `selection_snapshot.js`
4. **Renommer `ensureString` → `isString`** dans `contracts/validator.js` pour éliminer la confusion de type
5. **Ajouter cleanup MutationObserver** dans `layer_contract.js` (exporter `destroyLayerInvariantObserver`)

---

### Phase 2 — Refactoring Structurel (1-2 semaines)

**Découplage et factorisation :**

1. **Créer `shared/utils.js`** avec `ensureString`, `isPlainObject`, `deepClone`, `deepMerge`
   - Migrer les 9 réimplémentations locales une par une
2. **Créer `shared/media_types.js`** avec `RECORDING_TYPE_MAP`, `normalizeRenderKind`
   - Supprimer les variantes dans `tool_genesis.js` et `communication.js`
3. **Factoriser le locking** via `runtime/in_flight_lock.js`
   - Remplacer `runWithMtraxActionLock` et `runWithMtraxOpenInvokeLock`
4. **Exporter IDs de layers** depuis `layer_contract.js`
   - Supprimer les re-déclarations dans `eVeIntuition.js` et `tool_runtime.js`
5. **Exporter `PANEL_TTL_MS` depuis `panel_creator.js`**
   - Supprimer la version dans `eVeIntuition.js`
6. **Supprimer les 16 wrappers `ensure*Module`** dans `eVeIntuition.js`
7. **Unifier `readExplicitLatchedState` / `readExplicitLatched`** dans `tool_gateway.js`
8. **Factoriser `resetState()`** de `mtrack_dock_controller.js` avec `createInitialState()`

---

### Phase 3 — Optimisation Avancée (1-4 semaines)

**Réduction des coûts runtime et modernisation :**

1. **Identifier et supprimer listeners non nettoyés** — audit systématique des `addEventListener` sans `removeEventListener` correspondant ; utiliser `AbortController` pattern
2. **Optimiser `command_bus.js`** — éviter `deepClone` sur le path `gesture.frame` (mode ephemeral, pas de persistence)
3. **Optimiser `collectMtraxDebugSnapshot`** — lazy evaluation : ne construire l'objet que si les logs sont actifs
4. **Découper `eVeIntuition.js`** via Strangler Pattern en modules dédiés :
   - `intuition_/runtime/panel_api.js` (gestion des surfaces/panels)
   - `intuition_/runtime/group_timeline_api.js` (group timeline bindings)
   - supprimer les façades bridge legacy devenues inutiles
   - `intuition/text_tool.js` (text tool mode)
5. **Découper `tools/mtrack.js`** (continuer le travail amorcé) :
   - `mtrack_playback_sync.js`
   - `mtrack_drag_drop.js`
   - `mtrack_clip_manager.js`
6. **Définir des invariants de module** pour les ID de layers et préfixes de sélection :

   ```js
   console.assert(INTUITION_PANEL_LAYER_ID === 'intuition_panel_layer', 'Layer ID contract violated');
   ```

---

## E. Contraintes Respectées

- Aucune logique métier modifiée
- Aucun comportement supprimé
- Toutes les propositions sont rétrocompatibles avec l'architecture actuelle
- Les Strangler Pattern sont progressifs (ancienne implémentation co-existe pendant la migration)
- Les invariants documentés dans `eVe/documentations/` sont préservés
- La pipeline de mutation centralisée (`window.Atome.commit`) n'est pas touchée

---

*Fin de l'audit.*
