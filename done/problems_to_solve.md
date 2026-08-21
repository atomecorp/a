# Audit code — problèmes à résoudre (21 août 2026)

Statut : **traité le 21 août 2026 — 60 / 65 cases faites, rien commité.**

Bilan sur le dépôt principal : **+1 807 / −59 324 lignes → net −57 517**
(code réellement supprimé ou factorisé ; `git diff` affiche en plus ~28 300
« suppressions » qui sont en fait les 345 probes renommées `*.test.mjs` →
`*.probe.mjs`, non détectées comme renommages tant que les nouveaux fichiers
ne sont pas indexés). **144 fichiers supprimés.**
`eVe/` (sous-module) : +826 / −835 sur les fichiers que ce lot a touchés.

## Reste à faire (décision ou permission utilisateur)

| Lot | Case ouverte | Pourquoi |
|---|---|---|
| **P4-5** | réécriture d'historique `git filter-repo` | destructive et irréversible, à faire une fois en concertation. Commande prête : `git filter-repo --path platforms/web/bevy-renderer/target --invert-paths` |
| **P4-5** | sortir les gros binaires (60,3 Mo ONNX, 55,4 Mo `superman.mp4`, 36,4 Mo `Vampire.m4v`, 12,9 Mo wasm) | Git LFS ou téléchargement au setup : change ce que le clone livre, décision produit |
| **P4-6** | `git worktree remove .claude/worktrees/relaxed-haibt-6af634` (296 Mo) | refusé par le bac à sable de cette session ; à lancer à la main |
| **P1-2** | extraire les familles `auth` et `atome` du handler `/ws/api` | la famille `file` (335 l.) est sortie et **vérifiée sur la vraie socket** ; les deux autres (~1 400 l.) sont le même travail, à faire par familles successives avec `temp/ws_api_exercise_probe.mjs` comme garde |
| **P4-4** | annoter les 502 `catch {}` restants | trop nombreux pour une passe ; un **cliquet** (`scripts/check_empty_catch_budget.mjs`, budget 502) empêche désormais le compte de remonter. Les 12 prioritaires (transport WS + tool_slider) sont faits |

## Ce qui a été vérifié

Probes écrites pour ce lot, toutes vertes, rejouables (`./temp/`) :
`p0_1_sanitize_svg_probe`, `p0_p3_squirrel_core_probe`, `p0_7_rubberband_probe`,
`p0_7_rubberband_render_probe` (charge vraiment le wasm et étire 1 s de signal),
`p1_6_nullish_probe`, `p2_scalars_probe`, `p2_4_spark_registry_probe`,
`p2_5_ws_dispatch_probe`, `boot_probe`, `link_check`, **`ws_api_exercise_probe`
(serveur réel + client WebSocket réel)**.

Gardes : `npm run check:m0` vert (8 gardes, dont 2 nouvelles),
`node check-syntax.mjs` vert sur 1 840 fichiers, `npm run probes` 279/345
(les 66 échecs sont antérieurs — comparés un par un à `HEAD`).

⚠️ Le sous-module `eVe/` porte aussi des modifications non commitées **qui ne
viennent pas de ce lot** (suppression de la logique `group steps`, menu flower
dashboard, drag de liste, i18n — cf. `todo/modifications.md`). Elles font échouer
`tests/probes/project_render_legacy_source_audit.probe.mjs` ; ne pas les
confondre avec ce travail.

---

Périmètre balayé : `atome/src/squirrel`, `atome/src/shared`, `atome/src/utils`,
`atome/src/application`, `atome/shared`, `server/`, `eVe/`, `scripts/`, `package.json`,
configs de build. **1 370 fichiers JS, 315 405 lignes.**

Tous les chiffres ci-dessous sont **mesurés**, pas estimés. Les scanners utilisés sont
dans `./temp/` (`dupscan2.mjs`, `fnnames.mjs`, `orphans.mjs`, `reach.mjs`, `bigfn.mjs`,
`complexity.mjs`) et sont rejouables.

### Règles impératives (rappel)

1. Travailler dans `/Users/jean-ericgodard/RubymineProjects/a/`, **jamais** dans un worktree.
2. `eVe/` est un **sous-module git** : pas de `git stash` depuis le parent.
3. **Ne jamais commiter ni pusher.** Annoncer « prêt » et s'arrêter.
4. **Ne pas lancer la suite de tests du repo.** Pour chaque modification : écrire une
   **probe ciblée dans `./temp/`** qui importe le **vrai module**, la faire échouer
   d'abord (rouge), puis passer au vert.
5. Une découpe/extraction se valide par **import ESM de l'entrée**, pas par `node --check`.
6. Cocher au fil de l'eau. Quand tout est coché → déplacer vers `./done/`.

---

## Tableau de bord

| Sévérité | Lots | Thème dominant |
|---|---|---|
| **P0** | 7 | Sécurité, packaging cassé, code mort *testé*, cécité au debug |
| **P1** | 8 | Incohérences de contrat : deux implémentations du même chose |
| **P2** | 7 | Redondance : mêmes 5 lignes recopiées 7 à 27 fois |
| **P3** | 9 | Performance : boot série, DOM non batché, fuites d'observers |
| **P4** | 10 | Code mort (60 568 lignes), hygiène dépôt (.git 2,3 Go) |

Métriques transverses mesurées :

| Indicateur | Valeur |
|---|---|
| `catch {}` totalement vides | **891** (473 atome+server, 418 eVe) |
| Fichiers > 500 lignes | **59** |
| Fichiers > 400 lignes | **205** |
| Fonctions ≥ 120 lignes | **250** |
| Lignes injoignables depuis les entrées réelles | **60 568 / 298 847 (20,3 %)** |
| Listeners globaux posés / retirés | **449 / 171** |
| Lectures double `snake_case`/`camelCase` | **880** |
| Taille `.git` / arbre de travail | **2,3 Go / 326 Mo** |

---

# P0 — À traiter en premier

## P0-1 · `sanitizeSVG` est une fonction identité exportée comme API publique

`atome/src/squirrel/apis/svg_utils.js:4`

```js
// Lightweight sanitizer kept as identity to avoid ReferenceErrors.
export function sanitizeSVG(raw) { return raw; }
```

Elle est ré-exportée depuis `atome/src/squirrel/apis/loader.js:327` et
`atome/src/squirrel/apis.js:14,26,38` — donc offerte comme garantie de sécurité du
framework. Tout appelant qui écrit `render_svg(sanitizeSVG(userSvg), …)` croit être
protégé et ne l'est pas : `render_svg` fait `tmp.innerHTML = String(svgcontent)`
(`svg_utils.js:14`), ce qui exécute `<script>`, `onload=`, `<foreignObject>`.

Même trou dans le cœur du framework : `atome/src/squirrel/squirrel.js:105,112,174,181`
injecte `merged.innerHTML` et le contenu de `fetch(merged.svgSrc)` sans aucun filtrage.

- [x] Soit implémenter une vraie sanitisation (whitelist de balises/attributs, suppression
      de `script`, `foreignObject`, `on*`, `href` en `javascript:`), soit **supprimer
      l'export** pour que l'absence de protection soit explicite. Ne pas laisser une
      fonction qui ment sur son nom.
- [x] Décider et documenter la politique pour `svgSrc` : source de confiance uniquement,
      ou passage obligatoire par le sanitizer.

## P0-2 · `package.json` publie 4 fichiers qui n'existent pas

`package.json:8-24` déclare :

| Champ | Cible | État |
|---|---|---|
| `main` | `dist/squirrel.js` | OK |
| `module` | `dist/squirrel.esm.js` | **absent** |
| `browser` | `dist/squirrel.umd.js` | **absent** |
| `types` | `dist/types/index.d.ts` | **absent** |
| `exports.import` | `dist/squirrel.esm.js` | **absent** |
| `exports.require` | `dist/squirrel.cjs.js` | **absent** |
| `unpkg`/`jsdelivr` | `dist/squirrel.min.js` | présent mais daté du **28 avril** (le `.js` est du 13 août) |

Un `npm install squirrel-framework` + `import 'squirrel-framework'` échoue à la
résolution. Les champs `author`, `homepage`, `repository`, `bugs` sont encore les
gabarits (`Your Name <your.email@example.com>`, `github.com/your-org/…`).

- [x] Aligner `exports`/`main`/`module`/`browser`/`types` sur ce que le build produit
      réellement, ou produire les artefacts manquants.
- [x] Renseigner author / repository / homepage / bugs.
- [x] Régénérer `dist/squirrel.min.js` ou retirer `unpkg`/`jsdelivr`.

## P0-3 · Le cœur du framework avale toutes les erreurs

`atome/src/squirrel/squirrel.js:40-52` — `wrapAsyncHandler` enveloppe **tous** les
handlers d'événement créés par `$()` :

```js
if (result && typeof result.then === 'function') {
  result.catch(err => {
  });
}
return result;
} catch (err) {
}
```

Toute exception synchrone et tout rejet de promesse dans n'importe quel handler
d'événement de l'application disparaît sans trace. Idem pour `batch()`
(`squirrel.js:355-364`, `catch (error) {}`) et pour les deux `fetch(svgSrc).catch(error => {})`
(`squirrel.js:113, 182`).

L'intention (« éviter le reload de la WebView Tauri sur `unhandledrejection` ») est
légitime, la mise en œuvre non : elle rend tout bug d'interaction invisible. C'est la
cause racine du coût de diagnostic sur l'ensemble du projet.

- [x] Introduire un point de collecte unique (`reportRuntimeError(err, context)`) : buffer
      en anneau exposé sur `window.__squirrelErrors`, `console.error` quand
      `window.__SQUIRREL_DEBUG` est vrai, silencieux sinon. Le rejet reste absorbé
      (l'objectif Tauri est préservé), mais l'erreur cesse d'être perdue.
- [x] Brancher `batch()` et les `catch` de `svgSrc` sur le même point.

## P0-4 · 1 692 lignes de routes HTTP d'auth mortes en production, mais couvertes par les tests

`server/auth.js:168` exporte `registerAuthRoutes`, qui monte
`/api/auth/login`, `/register`, `/me`, `/logout`, `/refresh`, `/delete-account`,
`/change-password`, `/reset-password`, `/request-otp`, `/api/admin/*`…

**`registerAuthRoutes` n'est appelé nulle part dans `server/`.** Son seul appelant du
dépôt est `tests/server/granularity_qa_fixtures.test.mjs:26`.

Volume concerné : `auth_routes_core.js` 328 + `auth_routes_account.js` 490 +
`auth_routes_admin.js` 316 + `auth_routes_register.js` 237 + `auth_routes_session.js` 92
+ `auth.js` 229 = **1 692 lignes**.

Le chemin réellement servi est le dispatch WebSocket de `server/server.js:2000-4470`
(voir P1-2). Conséquence : **la suite de tests valide une implémentation que personne
n'exécute**, et l'implémentation exécutée n'a pas cette couverture.

Seul `registerServerIdentityRoutes` est vivant — appelé directement depuis
`server/server.js:759`, *et aussi* depuis `auth.js:210` (double enregistrement potentiel
si `registerAuthRoutes` était rebranché).

- [x] Trancher : supprimer les routes HTTP d'auth (cohérent avec la doctrine
      WebSocket-only, cf. P0-5), ou les rebrancher et supprimer la copie WS.
- [x] Si suppression : réécrire `tests/server/granularity_qa_fixtures.test.mjs` contre
      le dispatch WS, sinon on perd la couverture sans la remplacer.

## P0-5 · La garde `check_websocket_only_transport` est aveugle sur 6 fichiers

`scripts/check_websocket_only_transport.mjs:34-39` ne scanne que quatre fichiers de
composition :

```js
const compositionFiles = [
    'server/server.js',
    'platforms/desktop-tauri/src/server/mod.rs',
    'platforms/desktop-tauri/src/server/local_atome.rs',
    'platforms/ios/atome-auv3/Common/LocalHTTPServer.swift'
];
```

Or les routes `/api/auth/*` interdites par `FORBIDDEN_BUSINESS_PATH` vivent dans
`server/auth_routes_{core,register,account,admin,session}.js`, jamais scannés.
`node scripts/check_websocket_only_transport.mjs` → **« guard passed »** alors que
21 routes HTTP métier sont déclarées dans le dépôt.

- [x] Étendre le scan à tout `server/**/*.js` (la regex existante suffit), pas à une
      liste blanche de 4 fichiers.
- [x] Vérifier au passage que la même liste blanche ne masque pas d'autres gardes
      (`check_no_fallbacks`, `check_dom_projection_guardrails`, …).

## P0-6 · `$()` ignore silencieusement les valeurs falsy

`atome/src/squirrel/squirrel.js:103-105`

```js
merged.id && (element.id = merged.id);
merged.text && (element.textContent = merged.text);
merged.innerHTML && (element.innerHTML = merged.innerHTML);
```

`$('div', { text: 0 })` → aucun texte. `$('div', { text: '' })` → le texte précédent
n'est pas effacé. Même piège dans `element.$()` qui, lui, utilise correctement
`'text' in updateProps` (`squirrel.js:173`) : **les deux chemins du même composant ont
des sémantiques différentes**.

- [x] Uniformiser sur `!= null` (ou `in`) dans les deux branches.
- [x] Probe : `$('div', { text: 0 })` doit rendre `"0"`, `element.$({ text: '' })` doit vider.

## P0-7 · Rubber Band s'enregistre comme moteur `available: true` alors qu'il ne peut pas charger

`eVe/intuition/tools/audio_edit/rubberband_stretch_runtime.js`

Le code est complet et de bonne facture (study + process offline, cache par
`(source, ratio)`, encodage WAV 16 bits, remise au chargeur canonique
`loadTransientAsset`). Il est bien dans la chaîne de boot :
`eVe/eVe.js:31` → `eVe/intuition/bootstrap.js:8` → `tools/audio_edit/index.js:13`
→ `installRubberbandStretchEngine()`.

Mais **les deux résolutions de module échouent dans le navigateur** :

```
l. 40   import('rubberband-wasm')
        → spécificateur nu ; le seul importmap du projet (atome/src/index.html:22)
          ne déclare que "#squirrel/". Le navigateur jette
          « Failed to resolve module specifier ».

l. 41   new URL('rubberband-wasm/dist/rubberband.wasm', import.meta.url)
        → http://host/eVe/intuition/tools/audio_edit/rubberband-wasm/dist/rubberband.wasm
          Le fichier réel est à /node_modules/rubberband-wasm/dist/rubberband.wasm. 404.
```

Probe rouge reproductible : `node temp/rubberband_resolution_probe.mjs`.

Conséquence exacte, pas théorique :

1. `installRubberbandStretchEngine()` déclare `available: true, preservesPitch: true`
   (l. 214-221). `resolveStretchEngine` privilégiant un moteur disponible qui préserve
   la hauteur (`stretch_engine.js:68`), **Rubber Band gagne systématiquement** contre
   `playback_rate`.
2. `apply()` lit le cache (`readStretchedAsset`), le trouve vide, lance
   `ensureStretchedAsset(...)` en tâche de fond et retourne
   `{ playback_rate: 1/ratio, preserves_pitch: false, rendered: false, pending: true }`
   — donc **du varispeed**, exactement ce que `playback_rate` aurait donné.
3. Le rendu de fond échoue à `loadRubberbandInterface`, et l'échec est avalé par
   `.catch(() => null)` (l. 229). **Le cache ne se réchauffe jamais**, donc l'état
   « pending » est permanent : l'étirement ne préserve jamais la hauteur, et rien ne le
   signale.
4. `describeStretchSupport()` rapporte `preserves_pitch: true` (il lit la déclaration du
   moteur, pas le résultat de `apply`). **L'UI annonce une capacité que le moteur n'a pas.**

Point de licence à ne pas perdre de vue : `THIRD_PARTY_LICENSES.md:10-33` documente que
Rubber Band est GPL v2+, que distribuer Atome avec impose de publier Atome sous GPL, et
que la décision a été maintenue le 17 août 2026. Aujourd'hui l'obligation est encourue
(la dépendance est déclarée dans `package.json:183`) sans qu'aucune fonctionnalité soit
rendue en échange.

- [x] Ajouter `"rubberband-wasm": "/node_modules/rubberband-wasm/dist/index.esm.js"` à
      l'importmap de `atome/src/index.html`, **et** pointer le `.wasm` sur
      `/node_modules/rubberband-wasm/dist/rubberband.wasm` (chemin absolu depuis la
      racine servie, pas `import.meta.url`). Vérifier aussi les runtimes Tauri et iOS,
      qui servent le même `index.html` mais pas forcément `node_modules`.
- [x] Tant que le chargement n'est pas prouvé : enregistrer le moteur avec
      `available: false` + `unavailableReason`, pour que `resolveStretchEngine` retombe
      honnêtement sur `playback_rate` au lieu d'annoncer une hauteur préservée qu'il ne
      livre pas.
- [x] Remplacer `.catch(() => null)` (l. 229) par une remontée d'erreur — c'est
      précisément le `catch` vide qui a rendu la panne invisible (cf. P0-3, P4-4).
- [x] Aucune probe ni test ne couvre ce moteur (`grep -rl rubberband tests/` → vide).
      Ajouter une probe qui charge réellement le wasm et étire 1 s de signal.

---

# P1 — Incohérences de contrat

## P1-1 · `ui.text.create` a deux implémentations concurrentes, la géométrie est dupliquée à la main

Documenté dans le code mais non résolu :

- `eVe/intuition/runtime/eve_intuition/tool_window_bridge_runtime.js:56` :
  *« `ui.text.create` is registered twice (V2 execution mode `v2_text_create` and this
  registered handler) »*
- `eVe/intuition/tools/core/tool_runtime_create_execution.js:114-119` : *« which
  registration serves a call depends on the persisted V2 `execution_mode`; keeping a
  second copy of the geometry […] made the project double-click behave differently from
  one boot to the next »*
- `tool_runtime_create_execution.js:165-172` : *« Background-point geometry must match
  createEditableTextAtome's, the other registered implementation […] whichever one wins
  the dispatch »* — puis `132` et `24` en dur, à maintenir synchronisés manuellement
  avec l'autre implémentation.

Le contournement actuel (déléguer à `window.__eveTextTool.createEditableTextAtome` quand
la source est un clic de fond) ne couvre que deux `sourceLayer` ; toutes les autres
routes gardent la copie divergente.

- [x] Une seule registration. L'autre devient un alias qui délègue, sans logique propre.
- [x] Extraire `132 × 24` (et les minima 64/40, défauts 220/72) dans le contrat de skin
      partagé, plus aucune constante littérale dans les deux exécuteurs.

## P1-2 · L'authentification est implémentée deux fois, dans deux transports

`server/server.js:2000-4470` — **un seul handler de route de 2 471 lignes** pour
`/ws/api`, contenant une chaîne `if (action === …) / else if` de 26 branches côté auth
seul : `bootstrap`, `register`, `create-user`, `login`, `logout`, `me`, `delete-user`,
`list-users`, `get-user`, `update-user`, `lookup-phone`, `change-phone`, `remove-phone`,
`request-phone-verification`, `verify-phone-verification`… puis les branches atome
(`create`, `get`, `update`, `alter`, `list`, `transfer-owner`, `set-particle`, …).

Chacune duplique la logique de son homologue HTTP (P0-4). Exemple concret de dérive :
`server/server.js:2809` **redéfinit localement** `normalizeAccessValue` alors que la
fonction canonique existe dans `server/auth_user_particles.js:42` et est importée par
7 autres fichiers.

- [ ] Extraire le corps du handler `/ws/api` en modules `wsAuthOperations.js`,
      `wsAtomeOperations` (existe déjà !), un par famille d'action, avec une **table de
      dispatch** `{ action: handler }` au lieu de la chaîne `else if`.
- [x] Supprimer toute redéfinition locale d'un helper déjà importé (`normalizeAccessValue`
      au minimum ; auditer les autres au passage).
- [x] Recette d'extraction : cf. `todo/…/project_rf02_extraction_recipe` — audit d'appels
      **complet** + exercer la vraie route avec un client WS, le boot ne suffit pas.

## P1-3 · Deux emplacements pour le code « shared », deux chemins d'import

| Chemin | Contenu |
|---|---|
| `atome/src/shared/` | Les 10 vrais contrats (`atom_graph.js` 331 l., `core_atome_types.js` 267 l., …) |
| `atome/shared/` | 7 **shims de ré-export** de 4 à 10 lignes vers `../src/shared/…`, **+ 3 vrais modules** (`logging.js`, `recipient_access.js`, `render_visual_tokens.js`), **+ 1 fichier de test** (`atome_contract.probe.mjs`) |

Conséquences mesurées :

- `server/server.js:14` et `dev/daemon/index.js:4` importent `atome/shared/logging.js` —
  un module réel qui n'a **pas** d'équivalent dans `src/shared`.
- Les tests importent par le shim (`tests/shared/semantic_rename_contract.probe.mjs:10`
  → `atome/shared/…`), la production par le chemin réel. Deux graphes de modules pour le
  même code.
- Un fichier `.test.mjs` vit dans l'arbre de production.

- [x] Choisir **un** emplacement. Déplacer `logging.js`, `recipient_access.js`,
      `render_visual_tokens.js` vers `atome/src/shared/`, supprimer les shims, mettre à
      jour les ~10 importeurs.
- [x] Déplacer `atome/shared/atome_contract.probe.mjs` sous `tests/`.

## P1-4 · Attribut DOM écrit `data-tool-id` **et** `data-tool_id`

36 sites. Le code compense en interrogeant les deux :

```js
// eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js:32
`[data-tool-id="${toolId}"], [data-tool_id="${toolId}"], [data-eve-intuitionx-footer-tool-id="${toolId}"]`
// eVe/intuition/tools/detail_state.js:164-165 — même sélecteur écrit deux fois
```

Chaque nouveau sélecteur doit se souvenir des deux graphies (et de la troisième
`data-eve-intuitionx-footer-tool-id`) ; un oubli = bouton mort silencieux.

- [x] Une seule graphie canonique (`data-tool-id`, conforme à la convention HTML), une
      passe de renommage, puis une garde qui interdit `data-tool_id`.

## P1-5 · eVe importe atome par deux mécanismes différents

- **62** imports via l'alias `#squirrel/…` (déclaré dans `package.json:imports` et dans
  l'importmap de `atome/src/index.html:22`)
- **9** imports relatifs profonds `../../../atome/src/squirrel/…`, tous dans
  `eVe/intuition/tools/` (`teleport.js:34,105,185,209,246`,
  `teleport_destination_picker.js:17`, `teleport_grant_notifications.js:17`,
  `trackpad.js:20,28`)
- **plus** des `../../../atome/shared/…` (`communication_events.js:7`,
  `bevy_panel_finder_data.js:10`, `bevy_native_texture_mapping.js:11`, …)

Les chemins relatifs cassent au moindre déplacement de fichier et échappent aux
scanners qui suivent l'alias.

- [x] Basculer les 9 (+ ceux vers `atome/shared`) sur l'alias, ajouter `#atome-shared/`
      à l'importmap si nécessaire.

## P1-6 · 880 lectures double `snake_case` / `camelCase`

Le contrat d'entrée n'est canonique nulle part : chaque consommateur accepte les deux
graphies, parfois trois.

```js
// atome/src/application/audio_runtime/av_contracts.js:375-381
stream_id: safeString(input.stream_id || input.streamId || input.session_id || input.sessionId),
backend:   safeString(input.backend || input.provider || input.runtime_backend || input.runtimeBackend),
sample_rate: Number(input.sample_rate || input.sampleRate || 0) || 0,
timestamp_seconds: Number(input.timestamp_seconds || input.timestampSeconds || 0) || Date.now() / 1000,
```

```js
// eVe/intuition/tools/core/tool_runtime_create_execution.js
input.text_tool_keep_empty === true || input.textToolKeepEmpty === true
  || input.keep_empty === true || input.keepEmpty === true
```

Deux problèmes distincts :
1. **Incohérence** : aucune graphie n'est la vérité, donc aucune ne peut être retirée.
2. **Bug latent** : les chaînes `||` traitent `0` et `''` comme absents.
   `timestamp_seconds: 0` devient `Date.now()/1000`.
   `atome/src/squirrel/apis/svg_utils.js:26-27` : `parseFloat(width) || 200` → une largeur
   `0` devient `200`.

- [x] Normaliser aux **frontières** (une fonction `normalizeXInput` par contrat), pas à
      chaque lecture. Le cœur ne lit plus qu'une graphie.
- [x] Remplacer `||` par `??` partout où `0`/`''` est une valeur légitime.

## P1-7 · Quatre signatures pour le même helper `response()` côté serveur

| Fichier | Signature |
|---|---|
| `server/wsApiAuthProvisioning.js:13` | `response(requestId, success, fields)` → ajoute `ok` |
| `server/wsSurfaceOperations.js:35` | `response(message, success, fields)` → type figé |
| `server/wsTeleportOperations.js:57` | `response(message, success, fields)` → type figé |
| `server/wsAtomeOperations.js:38` | `response(type, message, success, fields)` |

7 fichiers `ws*Operations.js` définissent chacun leur `response` local. L'un ajoute un
champ `ok`, les autres non — les clients doivent donc connaître le type de réponse pour
savoir quel champ lire.

- [x] Un seul `server/wsResponse.js` : `wsResponse(type, message, success, fields)`,
      champs identiques pour toutes les familles.

## P1-8 · Conventions de nommage de fichiers non tenues

`atome/src/squirrel/components/` : 58 fichiers en `snake_case`, **2 exceptions** —
`List_builder.js` (majuscule) et `dropDown_builder.js` (camelCase). Sur un système de
fichiers sensible à la casse (CI Linux, Docker), un import mal capitalisé casse le build
alors qu'il passe sur macOS.

- [x] Renommer en `list_builder.js` / `dropdown_builder.js`, mettre à jour
      `spark.js:126,132` et les importeurs.

---

# P2 — Redondance

## P2-1 · `cloneValue` réécrit 19 fois, avec 3 sémantiques différentes

19 définitions distinctes. Trois comportements incompatibles :

| Variante | Fichiers | Comportement sur objet portant des fonctions |
|---|---|---|
| `structuredClone` puis fallback JSON | `voice/tool_router_shared.js:8`, `ai/trace_store.js:5`, `ai/quota_tracker.js:3`, `ai/persistent_memory.js:3`, `ai/offline_mutation_queue.js:4`, `ai/proactive_state_store.js:3`, … (14×) | **jette** `DataCloneError` |
| `structuredClone` + garde `undefined` + `try` | `security/token_vault.js:9`, `contacts/local_source.js:13` | absorbe |
| JSON pur | `voice/panel.js:37` | **strip silencieux** des fonctions |

C'est exactement le piège déjà rencontré côté eVe (menus/outils portant des fonctions →
`DataCloneError` au boot) : le round-trip JSON y est un strip **voulu**. Ici les trois
variantes coexistent sans qu'on sache laquelle un appel donné utilise.

- [x] Deux helpers **nommés pour leur sémantique** dans un module partagé :
      `cloneStructured(value)` (jette si non clonable) et `cloneJson(value)` (strip
      assumé). Chaque site choisit explicitement.
- [x] Ne **pas** faire une conversion de masse `JSON.parse(JSON.stringify)` →
      `structuredClone` : cassure de boot garantie sur les objets porteurs de fonctions.

## P2-2 · Helpers scalaires réécrits 5 à 16 fois, avec des `fallback` divergents

| Helper | Occurrences | Divergence mesurée |
|---|---|---|
| `toText` | 16 | — |
| `normalizeText` | 16 | — |
| `nowIso` | 8 | identique partout (`new Date().toISOString()`) |
| `toFiniteNumber` | 7 | **fallback par défaut `0` vs `null` ; certains court-circuitent `''`, d'autres non** |
| `clone` | 7 | — |
| `toIso` | 5 | — |
| `toTimestamp` | 5 | — |
| `toKey` | 6 | — |
| `readEnv` | 6 | — |

Le cas `toFiniteNumber` est un bug latent, pas seulement du bruit :

```js
// bank/local_index.js:3        → fallback 0, Number('') === 0 donc '' → 0
const toFiniteNumber = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
// mail/mail_socket.js:12       → fallback obligatoire, '' → fallback
const toFiniteNumber = (value, fallback) => { if (value === null || value === undefined || value === '') return fallback; … };
// contacts/icloud_connector.js:9 → fallback null, '' → null
```

Trois réponses différentes pour `toFiniteNumber('')` : `0`, `undefined`, `null`.

- [x] `atome/src/squirrel/shared/scalars.js` : une implémentation par helper, sémantique
      documentée, tous les sites migrés. Probe de non-régression sur les cas limites
      (`''`, `0`, `null`, `undefined`, `NaN`).

## P2-3 · Génération d'identifiants dupliquée 27 fois, longueurs incohérentes

```js
apis/svg_utils.js:17          'svg_' + Math.random().toString(36).slice(2)          // longueur variable
components/button_builder.js:56  `btn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
components/table_builder.js:22   `table_${…}.substr(2, 6)`
components/input_builder.js:98   `input_${…}.slice(2, 8)`
apis/unified/adole_connection.js:214  `client_${…}.substr(2, 9)`
voice/session_runtime_support.js:42   `${prefix}_${…}.slice(2, 10)`
```

- Trois longueurs de suffixe (6, 8, 9, 10) → probabilités de collision d'un facteur 10⁶
  d'un composant à l'autre.
- **8 usages de `String.prototype.substr`**, déprécié (Annex B).
- 45 usages de `crypto.randomUUID` existent déjà ailleurs dans le même dépôt : deux
  politiques d'ID coexistent.

- [x] Un seul `makeId(prefix)` partagé, adossé à `crypto.randomUUID()` avec repli
      `Math.random` documenté. Supprimer les 8 `substr`.

## P2-4 · `spark.js` : la liste des composants est écrite trois fois

`atome/src/squirrel/spark.js` :

1. `sparkComponentModules` — 17 entrées `{ id, path }` (l. 122-138)
2. 21 lignes de déstructuration `const Button = loadedModules['components.button'].default;` (l. 196-…)
3. 21 lignes d'affectation `squirrelComponentRegistry.Button = Button;` (l. 234-…)

Ajouter un composant = éditer trois endroits ; en oublier un ne produit aucune erreur,
juste un composant absent du registre à l'exécution.

`squirrelComponentRegistry` est d'ailleurs déclaré comme objet vide (l. 143) puis
rempli par mutation, au lieu d'être construit depuis la liste.

- [x] Une seule table `{ id, path, exportName, registryKey }`, registre construit par
      réduction. Les 42 lignes de boilerplate disparaissent.

## P2-5 · `handleMessage` : le même bloc « résoudre la requête en attente » 12 fois

`atome/src/squirrel/apis/unified/adole_websocket_message.js` — 473 lignes, indentation
maximale **48 colonnes**, 26 branches `message.type === '…'`, **34** occurrences de
`message.request_id || message.requestId`, **12** copies quasi identiques de :

```js
const pending = this.pendingRequests.get(message.request_id || message.requestId);
if (pending) {
    this.pendingRequests.delete(message.request_id || message.requestId);
    clearTimeout(pending.timeout);
    pending.resolve({ ok: message.success, success: message.success, … });
}
return;
```

- [x] Table de dispatch `{ type: handler }` + un unique `resolvePending(message, shape)`.
- [x] Normaliser `request_id`/`requestId` **une fois** à l'entrée de `handleMessage`.

## P2-6 · Les deux configs rollup sont le même fichier

`diff scripts/rollup.config.npm.js scripts/rollup.config.cdn.js` → **2 lignes de
commentaire** d'écart. Même `input`, même `output.file` (`./dist/squirrel.js`), même
format UMD.

`npm run build:all` = `build:cdn && build:npm` → construit **deux fois le même artefact
au même endroit**. Le second écrase le premier.

- [x] Soit un seul config et un seul script, soit deux configs qui produisent réellement
      des cibles différentes (ESM pour npm, UMD minifié pour CDN) — ce que
      `package.json` promet déjà (P0-2).

## P2-7 · `$()` duplique 60 lignes entre création et mise à jour

`atome/src/squirrel/squirrel.js` : la gestion de `css` (l. 133-147 vs 191-206), de
`attrs` (l. 120-131 vs 208-221) et des handlers (l. 152-161 vs 224-238) est écrite deux
fois, textuellement, avec les divergences déjà relevées en P0-6.

- [x] Extraire `applyCss(el, css)`, `applyAttrs(el, attrs)`, `applyHandlers(el, props, registry)`
      et les appeler depuis les deux chemins.

---

# P3 — Performance

## P3-1 · Boot : 20 modules cœur chargés strictement en série

`atome/src/squirrel/spark.js:89-119` + `loadModulesSequentially`
(`atome/src/utils/module_loader_runtime.js:44`) : cascade de 20 `import()` séquentiels,
chacun attendant la résolution du précédent. Le commentaire justifie par
« several install runtime side effects on import », mais l'affirmation est globale alors
que `bank.bootstrap`, `calendar.bootstrap`, `contacts.bootstrap`, `mail.bootstrap` sont
des domaines indépendants les uns des autres.

Les 17 modules composants, eux, sont déjà concurrents (`loadModulesConcurrently`) — la
technique est donc disponible.

- [x] Mesurer la dépendance réelle module par module (probe : charger en concurrent et
      comparer l'état des globals installés). Regrouper en **vagues** : ce qui doit
      précéder, puis un batch concurrent.
- [x] `loadModulesConcurrently` utilise `Promise.all` : **un seul module en échec fait
      échouer tout le batch** et perd les autres, puis `bootstrapSpark().catch()`
      (l. 325) tue le boot entier. Passer à `allSettled` + décision explicite sur les
      modules critiques vs optionnels.

## P3-2 · Un `document.querySelector` par élément créé

`atome/src/squirrel/squirrel.js:251` — `tryAppendToParent()` fait
`document.querySelector(parent)` à **chaque appel de `$()`**, le parent par défaut étant
la chaîne `'#view'`. Créer une liste de 1 000 items = 1 000 `querySelector` sur un
sélecteur constant.

- [x] Chemin rapide `getElementById` quand le sélecteur est `#id` simple, plus un cache
      `Map<selector, element>` invalidé sur détachement.

## P3-3 · Boucle rAF de 120 frames par élément orphelin, chaînes concurrentes

`atome/src/squirrel/squirrel.js:262-289` — si le parent n'existe pas encore :

- jusqu'à **120 rAF** par élément (≈ 2 s de travail par élément non attaché) ;
- `retry` est aussi enregistré sur `window:squirrel:ready` **et** `document:DOMContentLoaded`
  en capture ; quand l'un se déclenche il appelle `retry`, qui **replanifie un nouveau
  rAF** en écrasant `element._parentAttachRaf` — la chaîne précédente n'est pas annulée
  et continue de tourner. Deux à trois chaînes rAF simultanées par élément.
- Le garde `_parentAttachPending` protège `ensureParentAttachment`, pas le chemin
  événementiel.

- [x] Une file d'attente **globale** d'éléments en attente de parent, drainée une fois
      par frame, au lieu d'une boucle par élément. Annuler l'ancien rAF avant d'en
      planifier un nouveau.

## P3-4 · `element.remove()` ne nettoie pas récursivement → fuite d'observers

`atome/src/squirrel/squirrel.js:316-339` surcharge `remove()` pour déconnecter les
`MutationObserver` et retirer les listeners **de cet élément seul**. Les enfants créés
par `$()` (l. 165-168) gardent leurs observers et leurs listeners.

Pire : tout retrait par une voie native (`parent.removeChild(el)`,
`parent.innerHTML = ''` — **92 occurrences** de `innerHTML =` dans le périmètre, dont
`table_builder.js:245`, `console_builder.js:183`, `slice_objects.js:212`) contourne
entièrement le nettoyage. Les observers restent connectés sur des nœuds détachés.

Indicateur global : **449** `window/document.addEventListener` pour **171**
`removeEventListener`.

- [x] Nettoyage récursif dans `remove()` (parcourir `element.querySelectorAll('*')` et
      purger les registres).
- [x] Remplacer les vidages par `innerHTML = ''` sur des conteneurs gérés par `$()` par
      un `clearChildren(el)` qui passe par le nettoyage.

## P3-5 · `observeMutations` observe tout par défaut

`atome/src/squirrel/squirrel.js:373-380` : `{ attributes: true, childList: true, subtree: true }`
par défaut. Sur un conteneur applicatif, c'est une notification par mutation d'attribut
de n'importe quel descendant. Aucune API pour déconnecter un observer particulier
(seulement `element.remove()`).

- [x] Défauts minimaux (`childList` seul), options explicites obligatoires pour
      `subtree`/`attributes`. Retourner une fonction `disconnect`.

## P3-6 · `check-syntax.mjs` lance 1 161 processus Node

`check-syntax.mjs:38` — `spawnSync(process.execPath, ['--check', filePath])` par fichier,
sur `atome/src` + `server` + `scripts` + `tests` = **1 161 fichiers**, dont les bundles
vendorisés `atome/src/js/opal.min.js`, `gsap.min.js`, `opal-parser.min.js`,
`codemirror.bundle.js` (inutiles à vérifier).

`eVe/` (177 392 lignes, la plus grosse surface JS du projet) **n'est pas dans le scope**.

- [x] Remplacer par un parse en process unique — `esbuild` est déjà en devDependency
      (`esbuild.transform` ou `parseSync`), ou `acorn`.
- [x] Exclure `atome/src/js/**` et inclure `eVe/`.
- [x] Rappel : `node --check` est par fichier ; il ne voit pas les exports/imports
      manquants entre modules. Valider une découpe par **import ESM de l'entrée**.

## P3-7 · Pas de `DocumentFragment` pour les enfants

`atome/src/squirrel/squirrel.js:165-168` : `merged.children.forEach(… element.appendChild(child))`
— un `appendChild` par enfant sur un nœud potentiellement déjà dans le document.

- [x] Construire dans un `DocumentFragment`, un seul `appendChild`.

## P3-8 · SVG re-téléchargés sans cache

`atome/src/squirrel/squirrel.js:107-115` et `179-185` : chaque élément déclarant `svgSrc`
déclenche son propre `fetch`. Le `templateRegistry` cache la config, pas le contenu SVG.
Une liste de 50 items avec la même icône = 50 requêtes.

- [x] `Map<url, Promise<string>>` partagée.

## P3-9 · `element.animate` surchargé : contrat non standard

`atome/src/squirrel/squirrel.js:306-313` remplace `element.animate` par une fonction qui
retourne `animation.finished` (une `Promise`) au lieu de l'objet `Animation`. Tout code —
y compris une bibliothèque tierce — qui fait `el.animate(…).cancel()` ou `.pause()`
plante. `fill: 'forwards'` est de plus imposé sans possibilité de le surcharger
(l'objet options passé n'est lu que pour `duration` et `easing`).

- [x] Exposer `element.animateTo(…)` (nouveau nom) qui retourne la promesse, et laisser
      `animate` natif intact. Propager toutes les options.

---

# P4 — Code mort et hygiène

## P4-1 · 155 fichiers / 60 568 lignes injoignables (20,3 % du JS)

Mesuré par `temp/reach.mjs` en partant des vraies entrées (`spark.js`, `kickstart.js`,
`early-init.js`, `application/index.js`, `eVe/eVe.js`) et en suivant les `import`
statiques, les `import()` dynamiques **et** les tables `{ path: './x.js' }` du chargeur.
Les lignes commentées sont exclues. Le chiffre est un **plancher** (l'heuristique de
chemin est volontairement permissive).

Concentration :

| Répertoire | Fichiers morts |
|---|---|
| `atome/src/application/examples` | 66 |
| `atome/src/application/lyrix` | 25 |
| `atome/src/squirrel/voice` (`home_surface*`) | 13 |
| `atome/src/application/vie` | 5 |
| `atome/src/application/jeezs` | 4 |
| `eVe/intuition/tools/molecule` | 4 |
| barils `index.js` inutilisés (`squirrel/{bank,mail,calendar,contacts,security,voice}`, `eVe/intuition/{tools,panels,components,matrix/*}`) | 12 |

Les 10 plus gros : `lyrix/src/features/lyrics/display.js` (4 351), `lyrix/index.js`
(3 452), `jeezs/index.js` (2 612), `examples/ios_file_browser.js` (2 192),
`lyrix/src/components/ui.js` (2 079), `lyrix/src/components/settings.js` (1 873),
`examples/menus.js` (1 643), `examples/record_video_UI.js` (1 522),
`lyrix/src/components/songLibraryModal.js` (1 427), `examples/messages.js` (1 300).

Cas particuliers à traiter séparément :
- `atome/src/squirrel/voice/home_surface*.js` (8 fichiers, ~1 300 l.) : **injoignables
  en production mais couverts par 3 suites de tests** — même schéma que P0-4.
- `atome/src/squirrel/apis.js` (42 l.) : baril agrégateur, aucun importeur.

- [x] Décider par famille : supprimer, ou archiver hors de `atome/src` (`examples/`,
      `lyrix/` sont des démos, pas du framework).
- [x] Ne pas exclure le fichier de définition de la recherche d'appelants (un appel
      intra-fichier compte), et **booter l'app** après chaque suppression.

## P4-2 · Le point d'entrée applicatif est un cimetière de 76 imports commentés

`atome/src/application/index.js` — 204 lignes, dont :
- **76** lignes `// import('./examples/…')`
- 1 import réel (`module_loader_runtime`)
- 1 chargement dynamique de `eVe/eVe.js`
- ~40 lignes de code d'expérimentation commenté, une liste de todos, et
  `// TEST MODIF Mon Dec  1 23:46:19 CET 2025` en dernière ligne.

- [x] Réduire à ce qui s'exécute. Les scénarios de démo vont dans un fichier de
      configuration ou une page dédiée, pas en commentaires dans l'entrée.

## P4-3 · `ios_file_browser.js` : 2 192 lignes, 244 `catch {}` vides, monkey-patch global de `console`

`atome/src/application/examples/ios_file_browser.js` (mort, cf. P4-1) concentre à lui
seul **244 des 891 catch vides du dépôt**. Style ES5 (`var`, IIFE), indentation
incohérente (2 et 6 espaces sur des lignes adjacentes), une fonction `display_files` de
**685 lignes**.

Surtout, l. 2-32 : il **remplace `window.console.log` et `window.console.error`** au
chargement du module, pour toute l'application, avec un buffer et un flush de 200 ms.
Deux autres fichiers font la même chose (`examples/ios_apis.js:1,12`,
`examples/web_swift_audio_test.js:2,13`) — un double chargement empile les patches.

- [x] Supprimer avec le reste de P4-1. Si le pont console iOS doit survivre, en faire un
      module unique, idempotent, activé explicitement, pas un effet de bord d'import.

## P4-4 · 891 blocs `catch {}` totalement vides

473 dans `atome/src` + `server`, 418 dans `eVe`. Hors `ios_file_browser.js` (244), les
foyers principaux : `examples/ios_audio_bridge.js` (43), `examples/record_video_UI.js`
(19), `lyrix/src/components/songLibraryModal.js` (17), `lyrix/index.js` (13),
`examples/visio.js` (13), `aBox/index.js` (9), `squirrel/components/tool_slider_builder.js` (6),
`squirrel/apis/unified/adole_websocket_message.js` (6).

Un `catch` vide dans une couche de transport (`adole_websocket_message.js`) est
particulièrement coûteux : un message mal formé est ignoré sans trace.

- [ ] Chaque `catch` vide devient soit un `reportRuntimeError(err, tag)` (P0-3), soit un
      commentaire qui **explique pourquoi** l'erreur est attendue et sans conséquence.
- [x] Prioriser les 6 de `adole_websocket_message.js` et les 6 de `tool_slider_builder.js`
      (code vivant), pas ceux du code mort.

## P4-5 · `.git` pèse 2,3 Go pour un arbre de 326 Mo

3 482 objets `platforms/web/bevy-renderer/target/` sont dans l'historique. Les plus gros
blobs :

| Taille | Chemin |
|---|---|
| 75,4 Mo | `target/debug/deps/libbevy_render-*.rlib` |
| 64,1 Mo | `target/debug/deps/libbevy_sprite_render-*.rlib` |
| 61,2 Mo | `target/debug/deps/squirrel_bevy_renderer-*` |
| 59,3 Mo | `target/debug/deps/libsquirrel_bevy_renderer.dylib` (× 9 versions) |
| 58,1 Mo | `target/debug/deps/libnaga-*.rlib` |

`**/target/` est bien ignoré aujourd'hui (`.gitignore:20`) et plus rien n'est suivi, mais
l'historique reste : chaque clone télécharge 2,3 Go.

S'ajoutent, **encore suivis** : `atome/src/assets/videos/superman.mp4` (55,4 Mo),
`atome/src/assets/voice/fr_FR-siwis-medium.onnx` (60,3 Mo),
`atome/src/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm` (12,9 Mo).
Total `atome/src/assets` : **186 Mo** (81 Mo de vidéos, 60 Mo de modèle vocal).

- [ ] Décider : réécriture d'historique (`git filter-repo --path platforms/web/bevy-renderer/target --invert-paths`)
      — opération destructive, à faire une fois, en concertation.
- [ ] Sortir les gros binaires (vidéos de démo, modèle ONNX, wasm vendorisé) du dépôt :
      Git LFS ou téléchargement au setup (`install_full.sh` le fait déjà pour d'autres
      dépendances).

## P4-6 · Worktree obsolète de 296 Mo

`git worktree list` :

```
/Users/…/a/.claude/worktrees/relaxed-haibt-6af634  b312cc9f (detached HEAD)
```

296 Mo, copie complète incluant les `.wasm` de 13 Mo. `.claude/worktrees/lucid-wing-313eb4`
est vide (4 Ko).

- [ ] `git worktree remove` des deux (rappel : ne jamais travailler dans un worktree).

## P4-7 · `dist/` incohérent

`dist/squirrel.js` du **13 août**, `dist/squirrel.min.js` du **28 avril**. Le minifié
publié sur unpkg/jsdelivr a donc ~4 mois de retard sur le non-minifié. Cf. P0-2 pour les
fichiers déclarés mais absents.

- [x] Régénérer ou supprimer. Un artefact de build périmé dans le dépôt est pire que pas
      d'artefact.

## P4-8 · 493 fichiers de test, 136 exécutés par vitest

`tests/vitest.manifest.json` liste 136 suites ; `find tests -name '*.test.mjs'` en
trouve 493. La convention est documentée dans `vitest.config.js` (« tout autre fichier
`*.test.mjs` sous `./tests` est un script node autonome ») et une garde
(`tests/governance/vitest_manifest_guard.test.mjs`) maintient le manifeste — donc **ce
n'est pas un oubli**. Mais 357 fichiers portant le suffixe `.test.mjs` ne sont lancés par
aucune commande unique : rien ne garantit qu'ils passent encore.

- [x] Renommer les probes autonomes en `*.probe.mjs` pour que le suffixe reflète le
      régime d'exécution.
- [x] Un script `npm run probes` qui les exécute tous et rapporte, sinon leur valeur
      décroît jusqu'à zéro.

## P4-9 · Fixtures de test dans l'arbre de production

- `atome/src/squirrel/voice/orchestrator.planner_fixture.mjs` (301 l.)
- `atome/src/squirrel/voice/orchestrator.test_fixture.mjs` (287 l.)
- `atome/src/squirrel/ai/default_tools.runtime_bridge.fixture.mjs` (255 l.)
- `atome/shared/atome_contract.probe.mjs` (11 359 octets)

843 lignes de fixtures livrées avec le framework, en contradiction avec la convention
affichée dans `vitest.config.js` (« plus aucun `*.test.mjs` colocalisé dans un dossier
source : atome/src, eVe, server, database »).

- [x] Déplacer sous `tests/fixtures/`.

## P4-10 · `try {}` vide et `eval` en portée lexicale

- `server/auth.js:193-197` : un `try {}` **sans corps** suivi d'un `catch` qui logge
  « Anonymous user init failed » — la logique a été retirée, la gestion d'erreur est
  restée. Supprimer.
- `atome/src/squirrel/components/console_builder.js:125` : `const result = eval(command);`
  — `eval` direct, donc exécution dans la **portée lexicale du module**, avec accès à
  toutes ses variables internes. `editor_builder_run.js:154` utilise correctement
  `new Function` ; l. 168 retombe sur `eval(compiled)` pour Ruby/Opal.
  Une console d'exécution de code utilisateur est un usage légitime, mais l'`eval` direct
  ne l'est pas : remplacer par `new Function(…)` (portée globale) dans les deux cas.

---

## Fonctions les plus longues (pour les découpes futures)

| Lignes | Emplacement |
|---|---|
| 2 471 | `server/server.js:2000` — handler de route `/ws/api` |
| 1 094 | `atome/src/application/lyrix/src/components/songLibraryModal.js:261` `showSongLibrary` |
| 903 | `atome/src/application/jeezs/index.js:217` `buildBaseStyleRules` |
| 685 | `atome/src/application/examples/ios_file_browser.js:1482` `display_files` |
| 648 | `atome/src/application/lyrix/src/components/settings.js:1064` `showSettingsModal` |
| 647 | `atome/src/application/lyrix/index.js:2262` `createMainInterface` |
| 506 | `eVe/intuition/runtime/bevy_panel/bevy_panel_conditions_runtime.js:35` `createPanelConditionsRuntime` |
| 469 | `eVe/intuition/runtime/eve_intuition/panel_layout_runtime.js:25` `createPanelLayoutRuntime` |
| 462 | `atome/src/squirrel/components/menu_builder.js:7` `createMenu` |
| 452 | `eVe/core/atome_events/project_layer_runtime.js:61` `bindProjectLayerEvents` |
| 439 | `atome/src/squirrel/apis/unified/adole_adapter.js:16` `createWebSocketAdapter` |
| 426 | `atome/src/squirrel/components/button_builder.js:21` `createButton` |
| 426 | `atome/src/squirrel/components/console_builder.js:12` `createConsole` |

Les 6 premières sont du code mort (P4-1) : les découper serait du travail perdu, les
supprimer d'abord.

---

## Ordre d'exécution suggéré

1. **P0-1, P0-2, P0-6, P0-7** — corrections locales, sans risque, valeur immédiate.
2. **P4-1 → P4-3** — supprimer les 60 568 lignes mortes **avant** toute refonte : cela
   retire mécaniquement 244 catch vides, 6 des 13 fonctions géantes, et réduit le
   périmètre de tous les lots suivants.
3. **P0-3** — point de collecte d'erreurs unique ; prérequis au diagnostic de tout le reste.
4. **P0-4 + P0-5 + P1-2** — trancher HTTP vs WebSocket pour l'auth, réparer la garde,
   puis découper le handler de 2 471 lignes.
5. **P2-1 → P2-3** — factoriser les helpers (le plus gros gain de cohérence pour le moins
   de risque).
6. **P3-1 → P3-5** — performance du cœur `squirrel.js` et du boot.
7. **P1-1, P1-4, P1-6** — incohérences de contrat eVe, les plus coûteuses à défaire.
8. **P4-5, P4-6, P4-7** — hygiène dépôt, à faire en concertation (réécriture d'historique).

---

## Reproduire les mesures

```bash
node temp/reach.mjs atome/src/squirrel/spark.js atome/src/squirrel/kickstart.js atome/src/squirrel/early-init.js atome/src/application/index.js eVe/eVe.js
```

```bash
node temp/fnnames.mjs atome/src/squirrel atome/src/shared atome/src/utils server
```

```bash
node temp/bigfn.mjs atome/src/squirrel atome/src/application server eVe
```

```bash
grep -rnE "catch\s*(\([^)]*\))?\s*\{\s*\}" atome/src eVe server --include='*.js' | wc -l
```
