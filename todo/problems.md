# Rapport de problèmes — framework atome / eVe

**Date de l'audit :** 9 septembre 2026
**Périmètre :** `atome/src` (315 modules / 65 845 l.), `eVe` (957 / 186 594 l.), `server` (74 / 18 448 l.),
`database` (15 / 4 705 l.), `scripts` (58 / 6 430 l.), `tests` (629 fichiers / 112 312 l.),
Rust (`bevy-core`, `desktop-tauri`, ~30 250 l.), Swift iOS (72 fichiers / 18 665 l.), packaging, dépôt git.

**Méthode :** graphe d'imports complet (statique + littéraux de chemin dynamiques) pour la
détection de code mort, détection de blocs dupliqués (fenêtre glissante de 10 lignes normalisées),
inventaire des globales, comparaison des trois backends action par action, lecture de la base
réelle (`database_storage/`), et **deux probes exécutées** dont le rouge est reproduit ci-dessous.

> Les constats marqués **[PROBE]** ont été prouvés par exécution, pas seulement par lecture.

> ## ⚠️ Statut au 9 septembre 2026 — corrigé
>
> La très grande majorité de ces constats a été traitée. Le journal d'exécution,
> avec le détail de chaque correctif, les mesures avant/après et les probes de
> validation, est dans **[todo/problems_fixes.md](problems_fixes.md)**.
>
> **Cinq constats de ce rapport se sont révélés faux ou surévalués** à la
> vérification. Ils sont corrigés en tête de leur section :
>
> | Constat | Rectification |
> |---|---|
> | P0-2 : « 5,4 Go de cache Cargo copiés » | Faux. `copyDirectory` ignorait déjà `target/`. Le vrai gâchis était la **double copie des 188 Mo d'assets** (paquet 417 Mo → 210 Mo). |
> | P3-1 : liste du code mort | L'index inverse avait été construit avec `git ls-files` — **eVe est un sous-module**, ses 957 fichiers en étaient absents, donc plusieurs modules bien vivants paraissaient morts (`local_tts_worker`, `french_phoneme_encoder`, `panel_creator`, `tool_button_params`, les fichiers `R&D/`, `bevy_project_preview_capture_frame`). Liste refaite par atteignabilité avant : **21 modules réellement morts, 2 412 lignes**. |
> | P2-8 : « 3 écouteurs sans `passive` » | Faux positif : les trois déclarent `passive: false` sur la ligne suivante et appellent `preventDefault()`. Ils doivent l'être. |
> | P3-5 : « 16 scripts orphelins » | Faux positif : tous sont référencés par des chemins assemblés (`join(projectRoot, 'scripts/x.js')`). **0 orphelin sur 48.** |
> | P2-2 : « journal jamais compacté » | Cause réelle trouvée : un enregistrement de profil réémettait l'avatar **inchangé** (610 Ko) dans `props` et dans `before`. Corrigé : 2 400 Ko → 0,2 Ko par écriture. |

---

## Synthèse chiffrée

| Constat | Mesure |
|---|---|
| Code mort (0 importeur) | **28 modules / 4 480 lignes** |
| Code vivant seulement pour les tests | **13 modules / 1 579 lignes**, gardés par **2 003 lignes de probes** |
| Blocs de 10 lignes dupliqués entre fichiers distincts | **117 groupes** |
| Implémentations concurrentes de `isTauriRuntime()` | **10**, divergentes |
| Chaînes de repli `x.a \|\| x.b [\|\| x.c]` (alias de propriétés) | **2 344** |
| Propriétés stockées en double (camelCase **et** snake_case) en base réelle | **15 clés sur 85** |
| `catch {}` totalement vides | **441** (budget figé à 465, jamais abaissé) |
| `addEventListener` sans `removeEventListener` correspondant | **729 vs 213** (Δ 516) |
| Actions WS implémentées côté Fastify mais absentes du backend Rust | **46 sur 69** |
| Globales posées sur `window`/`globalThis` | **209** |
| Chemins de fichiers cités dans `maps/*.md` qui n'existent plus | **144 / 1 223 (11,8 %)** |
| Modules > 500 lignes (plafond dur du projet) | **23**, + 44 garés entre 480 et 500 |
| Dépendances npm déclarées et jamais importées | **9** |
| Poids du pack git | **2,23 Gio**, dont **398 Mo** pour les 3 encodages d'un seul WASM |

---

# P0 — Bugs confirmés

## P0-1 · Le paquet PWA produit par `scripts/package-app.js` ne peut pas booter **[PROBE]**

`build_PWA_app.sh` → `scripts/package-app.js`. Trois défauts cumulés :

1. **Aucune `importmap` dans l'`index.html` généré** ([scripts/package-app.js:229-283](scripts/package-app.js:229)),
   alors que le vrai [atome/src/index.html:21-29](atome/src/index.html:21) en déclare une
   (`#squirrel/`, `#shared/`, `#utils/`, `rubberband-wasm`). **114 imports à spécificateur nu**
   répartis sur 93 modules ne résolvent donc plus rien.
2. **`atome/src/utils/` et `atome/src/shared/` ne sont pas copiés à la racine du paquet**
   ([scripts/package-app.js:159-165](scripts/package-app.js:159)). Or les **5 premiers imports de
   `spark.js`** sont `../utils/perf_runtime.js`, `../utils/ios_runtime.js`,
   `../utils/module_loader_runtime.js`, `../utils/spark_exposure_runtime.js`,
   `../utils/perf_collector_runtime.js` → 5 × 404 avant la première ligne exécutée.
3. `early-init.js` (chargé en premier par le vrai `index.html`) est absent du template.

```
Dossiers copiés :  atome/src/js→js  assets→assets  css→css  squirrel→squirrel
                   application→application  atome→atome  eVe→eVe
importmap dans l'index.html généré : NON ❌
imports à spécificateur nu qui exigent l'importmap : 114
   ../utils/perf_runtime.js → racine "utils" copiée à plat ? NON ❌   (×5)
VERDICT : PAQUET NON BOOTABLE ❌
```

**Le même défaut atteint le paquet npm** : `package.json` déclare `files: ["dist/",
"atome/src/squirrel/", …]` — sans `atome/src/utils/` ni `atome/src/shared/`.

## P0-2 · `scripts/package-app.js` copie 5,4 Go d'artefacts de build Rust dans le paquet

[scripts/package-app.js:164](scripts/package-app.js:164) : `copyDirectory(projectRoot/atome, targetDir/atome)`
copie **tout** `atome/`, soit **5,6 Go** dont **5,3 Go de `atome/renderers/bevy-core`** (cache `target/`
de Cargo). Les 188 Mo d'assets et les 21 Mo de WASM sont en plus copiés **deux fois** (une fois à plat,
une fois sous `atome/`). Le « paquet PWA » pèse donc ~5,8 Go.

## P0-3 · La chaîne d'acceptation `quality:acceptance` ne peut pas passer

Deux scripts npm référencés n'existent pas :

- `quality:platforms = npm run build:all && …` → **`build:all` n'existe pas** ; `quality:platforms`
  échoue à sa première commande, donc `quality:acceptance` aussi.
- `prepublishOnly = npm run build:npm` → **`build:npm` n'existe pas** ; `npm publish` échoue.

Autres portes vides : `check:m2 = npm run check:m1` (alias sans contenu propre),
`scan:components = echo 'Scan skipped'`, `cdn:upload = echo 'TODO'`.

## P0-4 · Course à l'initialisation de la base : 2 requêtes concurrentes sur 4 échouent au démarrage **[PROBE]**

[database/adole_db_core.js:22-47](database/adole_db_core.js:22) — `initDatabase()` commence par
`if (db) return db;` mais `db` n'est affecté qu'**après** `await connect(config)`. Aucun verrou
de promesse en vol. Tout appelant de `query()` déclenche `if (!db) await initDatabase()`
([adole_db_core.js:50](database/adole_db_core.js:50)) : N requêtes concurrentes ⇒ N initialisations complètes.

Probe exécutée (4 `SELECT` lancés dans le même tick sur une base neuve) :

```
[ADOLE v3.0] Unified schema applied successfully   ← ×4
  requête 0: fulfilled {"ok":1}
  requête 1: fulfilled {"ok":2}
  requête 2: rejected  view users_view already exists
  requête 3: rejected  view users_view already exists
❌ COURSE CONFIRMÉE : 2/4 requêtes concurrentes échouent au démarrage
```

**Cause aggravante :** [database/adole_schema_migrations.js:393-395](database/adole_schema_migrations.js:393)
fait `DROP VIEW IF EXISTS users_view` puis `CREATE VIEW users_view` (**sans** `IF NOT EXISTS`),
avec un `await` entre les deux et **hors transaction**. Même sans la course, il existe à chaque
démarrage une fenêtre où la vue d'authentification n'existe pas.

`server/userVaultProcess.js:20` appelle `initDatabase()` par coffre : **228 coffres** rejouent
toute la chaîne.

## P0-5 · Aucun versionnement de schéma : toutes les migrations rejouent à chaque démarrage

`database/adole_schema_migrations.js` (417 l., 15 migrations) n'a **ni table `schema_migrations`
ni `PRAGMA user_version`**. Chaque boot réévalue les 15 migrations : `PRAGMA table_info`,
scans conditionnels, et le `DROP/CREATE VIEW` inconditionnel de P0-4.

## P0-6 · `window.print` et `window.puts` sont écrasées par des fonctions **vides**

[atome/src/squirrel/apis/essentials.js:97-102](atome/src/squirrel/apis/essentials.js:97) :

```js
window.puts  = function puts(val)  { };   // corps vide
window.print = function print(val) { };   // corps vide — écrase l'API navigateur
window.log   = window.puts;               // ligne 310 : log() est aussi un no-op
```

Deux conséquences :

- **`window.print()` natif est définitivement désactivé** pour toute l'application (impression navigateur).
- **13 messages destinés à l'utilisateur ne s'affichent nulle part.** Ce sont des retours d'erreur
  réels du transfert de fichiers :
  `asset_box_upload_transport.js:440` et `:461` — `puts('[upload] Connectez-vous pour envoyer des fichiers')`,
  `:137` — `puts('[download] échec pour …')`, `:513` — `puts('[upload] … envoyé au serveur')`,
  `asset_box_panel_render.js:143` et `:260`, `asset_box.js:109`, `asset_box_panel_dom.js:229/235`.
  Un envoi qui échoue est donc **silencieux** côté utilisateur.

## P0-7 · 46 actions WS sur 69 n'existent que dans le backend Fastify

Comparaison action par action des trois implémentations du même contrat :

| Backend | Fichier principal | Lignes |
|---|---|---|
| Fastify (Node) | `server/server.js` + 73 modules | 18 448 |
| Axum (Rust, Tauri desktop) | `platforms/desktop-tauri/src/server/mod.rs` (5 463) + `local_atome.rs` (4 149) + `local_auth.rs` (1 661) | ~13 000 |
| Swift (iOS) | `platforms/ios/atome-auv3/Common/LocalHTTPServer.swift` | 3 853 |

**Présentes des deux côtés (23) :** `ack alter bootstrap commit commit-batch create delete get
get-pending history list login logout lookup-phone push register request-phone-verification
soft-delete transfer-owner update verify-phone-verification`

**Absentes du backend Rust (46) :** `accept announce cancel change-phone create-user delete-all
delete-particle delete-user deny download-chunk download-info export finalize get-particle
get-particles get-user grant import inbox list-users me my-shares offer once persist ping policy
prepare preview-frame preview-request preview-stop properties-discover publish realtime remove-phone
request respond restore return revoke search set-particle shared-with-me stage-file update-user
upload-chunk upload-complete`

Vérification ciblée (`grep` sur l'arbre complet) : `set-particle`, `get-particles`, `shared-with-me`,
`publish`, `search` valent **0 occurrence** côté Rust **et** côté Swift.

## P0-8 · 10 implémentations divergentes de `isTauriRuntime()` — le prédicat qui choisit le backend

C'est le même nom pour dix prédicats qui ne répondent pas la même chose sur la même page :

| Fichier | `atome:` | `tauri.localhost` | `localhost:3000` | `__AUV3_MODE__` | `__SQUIRREL_FORCE_FASTIFY__` |
|---|---|---|---|---|---|
| `apis/unified/adole_api/runtime.js:4` (référence) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `apis/loader.js:46` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `eVe/core/project_security.js:306` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `eVe/domains/user/profile_api_support.js:29` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `eVe/intuition/tools/project_bootstrap_support.js:182` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `eVe/domains/rendering/bevy_native_renderer_runtime.js:37` | ❌ | ❌ | ❌ | ❌ | **❌ ignoré** |
| `eVe/domains/media/api/media_api_auth.js:56` | (délégué) | — | — | — | + heuristique port local |
| `eVe/intuition/runtime/media_source_runtime.js:~20` | `() => false` par défaut | | | |
| `apis/loadServerConfig.js:389`, `eVe/core/atome_commit_runtime.js:8` | délégations | | | |

Conséquences concrètes :

- **Sur `localhost:3000`** (la page servie par axum) : `adole_api/runtime.js` répond « Tauri »,
  `project_security.js` répond « pas Tauri ». Les deux décisions gouvernent l'accès au workspace
  anonyme. Deux modules de la même page sont en désaccord.
- **Sur iOS (`atome:`)** : `apis/loader.js` répond `false` là où 5 autres copies répondent `true`.
- `bevy_native_renderer_runtime.js` **n'honore pas `__SQUIRREL_FORCE_FASTIFY__`** : forcer Fastify
  ne force pas le chemin de rendu.

De plus, la ligne `protocol === 'tauri:' || 'asset:' || 'ipc:' || 'atome:'` est copiée-collée dans
au moins 4 fichiers de plus (`runtime_audio_backend.js:65`, `serverUrls.js:216`, `adole_backend.js:140`, `loader.js:50`).

## P0-9 · Les écritures SQL brutes du serveur contournent tous les garde-fous d'`adole.js`

`database/adole.js` se présente comme « single source of truth », mais on compte **218 instructions
SQL brutes dans 20+ modules `server/`**, dont **17 `INSERT`/`UPDATE` directs sur `particles` et
`state_current`** (`auth_users.js:55-67,100,147,275-281`, `auth_identity.js:133-193`,
`userFiles.js:347-352`, `wsApiGuestAdoption.js:218-223`).

Ces écritures contournent, toutes ensemble :

- `assertCanonicalPropertyKey()` — appelé **à un seul endroit** dans tout le dépôt
  ([database/adole.js:918](database/adole.js:918)) ;
- l'incrément de `particles.version` ;
- l'insertion dans `particles_versions` (l'historique que le schéma décrit comme « complet ») ;
- le journal d'événements.

Résultat : les mutations d'authentification et de fichiers n'apparaissent **ni dans l'historique,
ni dans l'undo, ni dans la synchronisation par diff**. Par ailleurs `UPDATE particles … WHERE
particle_key='username'` sur une ligne absente ne fait **rien** silencieusement (0 ligne modifiée)
— cas atteignable à la réactivation d'un utilisateur supprimé.

## P0-10 · CORS : `Origin: null` accepté inconditionnellement, avec `credentials: true`

[server/server.js:322](server/server.js:322) : `if (origin === 'null') return true;` — et `'null'`
figure déjà dans `ALLOWED_CORS_ORIGINS` ([server.js:308](server/server.js:308)). `Origin: null` est
envoyé par les iframes sandboxées, les pages `file://` et certaines redirections. Combiné à
`credentials: true`, cela ouvre le partage d'identifiants à toute page capable de produire cette origine.

De plus, [server.js:325](server/server.js:325) fait `new URL(origin)` **sans `try`** : un en-tête
`Origin` malformé lève dans la vérification CORS.

## P0-11 · Aucune limitation de débit sur les routes d'authentification

Plugins Fastify enregistrés ([server/server.js:477-788](server/server.js:477)) : `cors`, `compress`,
`static` ×5, `websocket`. **`@fastify/rate-limit` n'est ni installé ni enregistré.** Le seul
étranglement existant est interne à l'OTP (`server/auth_otp.js`) et au backoff GitHub. `login` et
`register` sont non throttlés (bcrypt est bien utilisé — `server/auth_crypto.js:38` — mais ne
protège pas d'un bourrage).

---

# P1 — Incohérences structurelles

## P1-1 · Chaque propriété est écrite deux fois : camelCase **et** snake_case

Constat sur la base réelle (coffre le plus chargé, 213 Mo) : **15 clés sur 85** existent sous les
deux orthographes simultanément.

```
currentActivityId  currentActivityName  currentProjectId  fileName  filePath  firstName
fontSize  fontWeight  lineHeight  matrixSlot  mimeType  projectNumber  renderOrder
svgMarkup  zIndex
```

Source de la double écriture, explicite dans le code :

- [eVe/intuition/runtime/tool_genesis_properties_runtime.js:33-38](eVe/intuition/runtime/tool_genesis_properties_runtime.js:33)
  émet `fontSize` **et** `font_size`, `lineHeight` **et** `line_height` dans le même objet ;
- [eVe/domains/rendering/project_view_creation_runtime.js:353](eVe/domains/rendering/project_view_creation_runtime.js:353)
  écrit `{ svg_markup: '', svgMarkup: '', … }`.

Les valeurs sont pour l'instant identiques — **rien ne le garantit** : il n'y a pas de table d'alias
canonique, seulement des chaînes de repli reconstruites à chaque lecture. Exemple à 5 alias :
[eVe/domains/rendering/render_atom.js:20](eVe/domains/rendering/render_atom.js:20)
`firstDefined(properties.svg_markup, properties.svgMarkup, properties.svg, properties.raw_svg, properties.rawSvg)`.

Coût direct mesuré : `svgMarkup` et `svg_markup` stockent **deux fois les mêmes 35 789 octets**,
avec doublement dans `particles_versions` et dans la charge d'événement.

`assertCanonicalPropertyKey()` ne canonicalise rien : il ne fait que `trim()` et rejeter les clés
réservées ([atome/src/shared/atome_contract.js:130-139](atome/src/shared/atome_contract.js:130)).

## P1-2 · 2 344 chaînes de repli `||` — dont 23 sur des propriétés numériques (le 0 est avalé)

Le pattern `x.a || x.b [|| x.c]` apparaît **2 344 fois**. Sur une propriété numérique ou textuelle,
`||` traite `0`, `''` et `false` comme absents et bascule sur l'alias suivant. Cas relevés :

- `tool_genesis_host_runtime.js:170` — `spec.fontSize || spec.font_size || '17px'`
- `tool_genesis_host_runtime.js:172` — `spec.lineHeight || spec.line_height || '1.35'`
- `tool_genesis_properties_runtime.js:33-38` — quatre replis croisés
- `tool_runtime_finder_execution.js:425` — `input.fontSize || input.font_size || skinStyle.fontSize || defaultFontSize`
- `record_audio_api.js:195` — `detail.duration_sec || detail.durationSec || 0`

Le correctif générique est `??` (ou une table d'alias unique), pas un repli supplémentaire.

## P1-3 · Trois backends, un seul contrat, aucune spécification partagée

Voir P0-7 pour l'écart de couverture. Au-delà du décompte, aucun artefact commun ne définit le
contrat : ni schéma JSON, ni fichier `.proto`, ni table d'actions générée. Les trois
implémentations sont trois relectures indépendantes de la même intention, en trois langages,
avec 21 000 lignes cumulées.

Effet de bord observé côté Rust : [platforms/desktop-tauri/src/server/mod.rs:5054-5056](platforms/desktop-tauri/src/server/mod.rs:5054),
`Err(_) => return` — un premier message mal formé ferme la socket **sans trame d'erreur**. Le client
ne voit pas une erreur mais un silence, jusqu'au timeout.

## P1-4 · La logique « activer un seul projet » est copiée-collée dans 3 modules

Bloc identique (listing de 2 000 états `project`, diff du drapeau `active`, `commitBatch`) dans :

- [eVe/intuition/matrix/core/project_workspace_activation_runtime.js:24](eVe/intuition/matrix/core/project_workspace_activation_runtime.js:24)
- [eVe/intuition/tools/project_bootstrap_projects.js:32](eVe/intuition/tools/project_bootstrap_projects.js:32)
- [eVe/intuition/tools/user_workspace_runtime.js:68](eVe/intuition/tools/user_workspace_runtime.js:68)

`limit: 2000` en dur dans les trois. Si deux d'entre eux s'exécutent à l'ouverture du workspace,
c'est deux listings de 2 000 lignes pour le même résultat.

## P1-5 · 117 groupes de blocs de 10 lignes dupliqués entre fichiers distincts

Extraits notables (la liste complète est reproductible par la méthode décrite en tête) :

| Fichiers | Nature |
|---|---|
| `tool_runtime.js:265` / `tool_runtime_gesture.js:200` / `tool_runtime_selection.js:323` | même bloc de destructuration de 13 exécuteurs, répété |
| `media_api_auth.js:273` / `matrix/core/project_data.js:137` / `project_bootstrap_support.js:200` | résolution d'identité/backend |
| `tool_runtime_bootstrap_defs_a.js:21` **et** `:301` **et** `defs_b.js:9` | duplication interne + externe |
| `contacts/local_source.js:37` / `macos_source.js:84` / `service_contact_utils.js:93` | normalisation de contact |
| `sharing.js:22` / `sharing_message_api.js:11` | en-tête de module dupliqué |
| `communication_media_source.js:10-22` / `media_source_runtime.js:16-28` | table `BUNDLED_MEDIA_ASSET_BY_NAME` **strictement identique** (et l'un des deux est mort) |

## P1-6 · Quatre `connector_contract.js` pour un seul concept, avec quatre schémas incompatibles

`atome/src/squirrel/{mail,calendar,contacts,bank}/connector_contract.js` exportent tous
`X_V1_ARCHITECTURE_DECISION` + `createXConnectorContract`, même forme générale, mais champs
divergents :

| | mail | bank |
|---|---|---|
| lecture | `read_path` (protocol/host/port/security) | `read_source` (id/protocol/role/writable) |
| écriture | `send_path` | *(absent)* |
| index | `local_index` | `normalized_index` |
| politique | `draft_policy`, `delivery_policy` | `analytics_mode`, `confirmation_policy` |

Même abstraction, quatre vocabulaires. `bank/connector_contract.js` n'est en outre importé que par
un test (voir P3-2).

## P1-7 · 209 globales sur `window` — dont un doublon de casse et une API de panneaux à la main

Inventaire complet des affectations `window.X =` / `globalThis.X =` : **209**.

- **`window.atome` et `window.Atome` coexistent.** `globalThis.Atome` est la classe
  ([atome/src/squirrel/atome/atome.js:371](atome/src/squirrel/atome/atome.js:371)), `window.Atome`
  est réécrit en objet nu par [eVe/core/atome_commit.js:298](eVe/core/atome_commit.js:298)
  (`if (!window.Atome) window.Atome = {}`), et `window.atome = window.atome || {}` est répété
  **dans 14 modules eVe**. Deux noms à une majuscule près, trois sémantiques.
- **18 paires `open_*_panel` / `close_*_panel`** posées à la main, une par outil
  (`couleur.js:373-374`, `font.js`, `size.js`, `tags.js`, `timeline.js`, `layer.js`, `undo.js`,
  `paste.js`, `delete.js`, `infos.js`, `background.js`, `user.js`, …). Aucun registre :
  ajouter un panneau = éditer un fichier de plus sans aucune vérification.
- `window.resize` ([apis/loader.js:316](atome/src/squirrel/apis/loader.js:316)),
  `window.span = { textContent: '' }` ([loader.js:112-113](atome/src/squirrel/apis/loader.js:112)),
  `window.log`, `window.wait`, `window.grab` : noms très génériques sur l'objet global.
- `window.__CHECK_DEBUG__` **et** `globalThis.__CHECK_DEBUG__` définis séparément.

## P1-8 · 75 clés i18n référencées par l'UI n'existent dans aucun catalogue

Le système i18n est sain (875 clés, parité fr/en presque parfaite, 0 clé orpheline). Le problème est
l'adoption :

- **75 clés utilisées côté UI ne sont définies nulle part** → l'UI retombe sur le `fallback` anglais
  codé en dur, alors que **`DEFAULT_EVE_LOCALE = 'fr'`** ([eVe/i18n/languages.js:8](eVe/i18n/languages.js:8)).
  Sont concernés des pans entiers : `eve.finder.*` (7 clés — dialogue, recherche, états
  idle/loading/error), `eve.layer.*` (8), `eve.couleur.*` (3), `eve.contact.*` (5),
  `eve.conditions.*` (4), `eve.menu.color`, `eve.menu.layer`, `eve.molecule.*` (4), `eve.comm.*` (3)…
- **`eve.lasso.action.group` n'existe qu'en anglais** → l'interface française affiche « Group ».
- **95 modules eVe sur 957 (10 %) utilisent i18n.** Ailleurs, le texte est littéral, et les langues
  se mélangent dans la même interface : `communication_events.js:79` → `'Nouveau partage disponible'`,
  `bevy_panel_contact_runtime.js:170` → `'No contacts available'`.
- Les clés `eve.background.*` (52 entrées) vivent dans `languages_*_**account**.js` — mauvais fichier.
- Le préfixe `eve.` sert **à la fois** de namespace i18n et de namespace d'événements de télémétrie
  (`eve.boot_module`, `eve.bind.atomeDrag`, `eve.atome_commit`…). Les deux espaces de noms
  se recouvrent.

## P1-9 · 441 `catch {}` vides, un cliquet jamais resserré, un correctif adopté à 4,5 %

`scripts/check_empty_catch_budget.mjs` mesure **441** pour un `BUDGET = 465`. Le fichier dit
lui-même « Lower BUDGET whenever you bring the count down » — ce n'est pas fait : **24 créneaux de
régression restent ouverts**, et le cliquet ne cliquette plus.

Le remède prescrit (`reportRuntimeError`, `atome/src/squirrel/runtime_errors.js`) n'est employé que
**21 fois** contre 441 catch vides — **4,5 % d'adoption**.

Pires concentrations :

```
20  eVe/shared/lasso_context_zone_runtime.js       13  eVe/core/atome_events/project_layer_runtime.js
19  eVe/intuition/tools/user_workspace_runtime.js  11  eVe/intuition/matrix/core/matrix_runtime_toolstate.js
15  eVe/domains/media/api/audio_core_record.js      9  eVe/core/atome_commit_transport.js
14  eVe/core/atome_commit_backend.js                7  eVe/domains/media/asset_box_auth.js
```

Exemple type ([eVe/domains/media/api/audio_api.js:113-123](eVe/domains/media/api/audio_api.js:113)) :
trois `try { … } catch (error) { }` consécutifs autour de la mise en place de la synchronisation
des envois, plus trois `.catch(() => { })`. Une panne de synchronisation est indétectable.

## P1-10 · `security.bootstrap` n'est pas marqué critique dans le boot

[atome/src/squirrel/spark.js:104-108](atome/src/squirrel/spark.js:104) : la vague 2 charge
`security.bootstrap` et `conditions.bootstrap` **sans `critical: true`**. `loadBootWave` utilise
`settle: true` et n'échoue que sur les modules critiques ([spark.js:200-215](atome/src/squirrel/spark.js:200)).
Si le bootstrap de sécurité échoue, le boot continue et l'application se présente à moitié armée,
avec pour seule trace un événement de perf.

## P1-11 · La règle des 500 lignes est satisfaite numériquement, pas structurellement

Plafond dur du projet : 500 lignes (`.codex/modules/02-coding-standards-and-prohibitions.md:73`).

**23 modules au-dessus** — dont deux hors norme :

| Lignes | Fichier |
|---|---|
| **4 270** | `server/server.js` — dont **une seule fonction `startServer()` de 3 760 lignes** ([server.js:466-4220](server/server.js:466)), 38 routes, 1 524 lignes à ≥ 4 niveaux d'indentation, profondeur max 7 niveaux |
| **2 234** | `database/adole.js` |
| 1 130 | `eVe/R&D/ATG.js` *(code mort, cf. P3-1)* |
| 665 / 652 / 641 / 570 / 547 / 546 … | `av_contracts.js`, `asset_box_upload_transport.js`, `user_login_credentials.js`, … |

Et surtout : **44 modules garés entre 480 et 500 lignes**. Le découpage suit le nombre, pas le
concept. Symptômes visibles : `eVe/intuition/tools/core/` contient **60 fichiers**, dont
`tool_runtime.js`, `tool_runtime_bootstrap.js`, `tool_runtime_bootstrap_defs_a.js`,
`tool_runtime_bootstrap_defs_b.js`, `tool_runtime_bootstrap_midi_schemas.js`… ;
`eVe/intuition/tools/` contient **30 fichiers `project_drop_*`**.

**284 modules sur 1 419 (24 %) portent le suffixe `_runtime.js`** — un suffixe qui ne distingue rien.

## P1-12 · La documentation d'architecture cite 144 fichiers qui n'existent plus

`maps/` = 1,06 Mo de Markdown (`CODEMAP.md` 386 Ko, `API_MAP.md` 282 Ko, `ARCHITECTURE_MAP.md`
226 Ko, `DESIGN_MAP.md` 170 Ko). Sur **1 223 chemins de fichiers cités, 144 (11,8 %) n'existent pas** :

```
CODEMAP.md      94   DESIGN_MAP.md   18   API_MAP.md      16   ARCHITECTURE_MAP.md  16
```

Deux dérives visibles : le renommage `.test.mjs` → `.probe.mjs` n'a pas été répercuté (des dizaines
de `tests/**/*.test.mjs` cités n'existent plus), et des modules supprimés restent documentés
(`eVe/intuition/tools/detail*.js`, `eVe/intuition/projection/tool_strip.js`, `server/mod.rs`…).

**Contradiction directe doc/code :** `maps/CODEMAP.md:873`, `maps/ARCHITECTURE_MAP.md`,
`done/WEBGPU_to_repair.md` et `done/renderer_unification.md` décrivent tous « le fork maintenu
`wgpu 27.0.1` » comme le socle du chemin web. Or `platforms/web/bevy-renderer/Cargo.toml:32-33`
et `atome/renderers/bevy-core/Cargo.toml:34-35` épinglent **29.0.4**. Le fork 27.0.1
(2,4 Mo, ~25 000 lignes de Rust vendorisé) **n'est référencé par aucun `Cargo.toml`**.

Le commentaire d'en-tête de `atome/src/sw.js` annonce « ~2,7 Mo » pour le WASM du renderer ;
le fichier réel pèse **12,96 Mo** — cinq fois plus.

---

# P2 — Performance

## P2-1 · `listAtomes()` est un N+1 : jusqu'à 201 allers-retours SQLite pour un listing

[database/adole.js:874-906](database/adole.js:874) :

```js
atomes = await getAtomesAccessibleToUser(ownerId, options);   // 1 requête
for (const atome of atomes) {
    const fullAtome = await getAtome(atome.atome_id);          // ← 2 requêtes chacune
    …
}
```

`getAtome()` refait `getAtomeById()` (**la ligne déjà en main est jetée et relue**) puis charge les
particules. Avec `limit = 100` par défaut : **1 + 100 × 2 = 201 requêtes séquentielles**, sur le
chemin du listing de projets.

De plus, `SqliteDriver.run/get/all` appelle `this.db.prepare(sql)` **à chaque appel**
([database/driver.js:99,113,120](database/driver.js:99)) — aucun cache de statements préparés :
201 préparations pour un listing.

## P2-2 · Le journal d'événements domine le stockage et n'est jamais compacté

Mesure sur le coffre le plus chargé (`database_storage/vaults/a41c2a…/vault.db`, **213 Mo**) :

| Table | Lignes | Octets de charge utile |
|---|---|---|
| `events` | 5 354 | **52,9 Mo** (≈ 9,9 Ko / événement) |
| `particles_versions` | 11 484 | 13,0 Mo |
| `state_current` | 228 | 1,6 Mo |
| `particles` | 2 807 | 1,6 Mo |
| **`snapshots`** | **0** | — |

Le mécanisme d'instantané existe (`createStateSnapshot`, `listStateSnapshots`,
`rebuildStateCurrentFromEvents`) mais **n'est jamais employé** : 0 ligne. Le journal croît sans
borne et toute reconstruction rejoue 5 354 événements gras.

`particles_versions` archive `old_value` **et** `new_value` en entier : modifier une fois
`user_face` (625 Ko) duplique 625 Ko dans l'historique. Les particules les plus lourdes du coffre
sont `eve_profile` (625 338 o) et `user_face` (624 593 o) — deux clés distinctes de taille quasi
identique, probablement le même avatar base64 stocké deux fois.

**228 coffres** existent sur disque pour **685 Mo**, sans mécanisme de purge. Deux d'entre eux
pèsent 213 Mo et 138 Mo. Sur le coffre inspecté, **22 des 32 tables sont vides**.

## P2-3 · `isDuplicateAtomeCreate` devient quadratique sur un import en masse

[server/server_dedup.js:42-56](server/server_dedup.js:42) : la carte `wsRecentAtomeCreates` n'est
purgée que si `size > 2000`, et la purge ne supprime que les entrées de plus de 4 s. Sur un import
de 10 000 atomes en quelques secondes, **aucune entrée n'est assez vieille** : la carte grossit et
un balayage complet O(n) est exécuté **à chaque création** au-delà de 2 000 → comportement
quadratique. Même schéma dans `isDuplicateWsRequest` ([server_dedup.js:35-38](server/server_dedup.js:35), seuil 200).

## P2-4 · Boot en 7 étapes strictement sérielles

[atome/src/squirrel/spark.js:93-160](atome/src/squirrel/spark.js:93) : 4 vagues `SPARK_BOOT_WAVES`
+ 1 vague composants + `kickstart` + `loadServerConfig` + import de l'application. Les vagues sont
concurrentes **à l'intérieur**, sérielles **entre elles** : au minimum **7 allers-retours réseau
enchaînés** avant la première image. En réseau mobile, c'est le poste dominant.

## P2-5 · Minuteries et écouteurs jamais libérés

- [atome/src/utils/perf_collector_runtime.js:197](atome/src/utils/perf_collector_runtime.js:197) :
  `win.setInterval(beat, PERF_HEARTBEAT_MS)` — **poignée non conservée**, `clearInterval` impossible.
- [eVe/domains/media/api/audio_api.js:118](eVe/domains/media/api/audio_api.js:118) :
  `setInterval(… syncQueuedUploads …, SYNC_INTERVAL_MS)` — jamais annulé, dans un `catch {}` vide.
- **729 `addEventListener` pour 213 `removeEventListener`** (Δ 516). Pires écarts :

```
+19  atome/src/squirrel/components/tool_slider_builder.js   (22 add / 3 rem)
+15  atome/src/squirrel/components/slice_events.js          (15 / 0)
+13  eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js (13 / 0)
+13  atome/src/squirrel/voice/panel.js                      (13 / 0)
+11  atome/src/squirrel/components/editor_builder_dom.js    (11 / 0)
+10  eVe/intuition/tools/layer.js                           (10 / 0)
```

Ces modules construisent des panneaux ouverts/fermés en boucle : chaque cycle ajoute des écouteurs.

- `window.grab` maintient un `domCache = new Map()`
  ([essentials.js:107](atome/src/squirrel/apis/essentials.js:107)) : entrées supprimées uniquement
  quand le nœud est détaché au moment d'une relecture (`:231`) — pas d'éviction par taille ni par âge.
- `pendingConsoleMessagesByUserId` ([server/wsApiState.js:13](server/wsApiState.js:13)) : la file
  par utilisateur est plafonnée à 200, mais **le nombre d'utilisateurs dans la carte ne l'est pas**,
  et une entrée n'est supprimée que si l'utilisateur se reconnecte.

## P2-6 · 250 boucles avec `await` à l'intérieur

Concentrations : `database/adole.js` (11), `server/atomePropertySecurity.js` (8),
`eVe/core/media_engine/molecule.js` (6), `server/server_uploads.js` (6),
`server/wsApiGuestAdoption.js` (6), `server/wsAtomeOperations.js` (6). Toutes ne sont pas
parallélisables, mais chacune est un point de sérialisation à examiner.

## P2-7 · Poids expédié à l'application

`atome/src/assets` = **188 Mo**, `atome/src/wasm` = 21 Mo.

| Poids | Fichier | Statut |
|---|---|---|
| 60,3 Mo | `assets/voice/fr_FR-siwis-medium/*.onnx` | modèle de voix embarqué |
| **55,4 Mo** | `assets/videos/superman.mp4` | **vidéo par défaut** de `eVe/domains/atome/genesis.js:15` et repli de `'video_missing.mp4'` |
| 12,9 Mo | `assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm` | |
| 12,96 + 4,6 + 3,1 Mo | `wasm/squirrel_bevy_renderer_bg.wasm` + `.gz` + `.br` | **3 encodages livrés** (20,6 Mo) |
| 11,3 / 8,0 / 5,6 Mo | `video_1787217554069.mp4`, `JeezsFire.mp4`, `WhatsApp*` | **0 référence dans tout le code** |
| 6,2 + 5,5 + 3,3 + 2,2 Mo | `assets/images/{1,2,3,4}.png` | non optimisées |
| 1,8 Mo | `js/codemirror.bundle.js.map` | source map livrée en production |
| 4,1 Mo | `js/opal*.js` (3 fichiers) | chargés à la demande par l'éditeur uniquement |
| 912 Ko | `eVe/R&D/` | maquettes HTML + `.webloc` — copiés dans le paquet PWA |

## P2-8 · Divers, moindre impact

- 3 écouteurs `wheel`/`touchstart` sans `{ passive: true }` :
  `eVe/domains/rendering/surface_interaction_runtime.js:479`,
  `eVe/domains/media/asset_box_panel_dom.js:201`,
  `eVe/intuition/ribbon/menu_scroll_runtime.js:137` *(ce dernier dans un module mort)*.
- 21 `JSON.parse(JSON.stringify(...))`. ⚠️ **Ne pas remplacer par `structuredClone`** : le
  round-trip JSON supprime volontairement les fonctions portées par les menus/outils eVe.
- 176 `getBoundingClientRect`, concentrés dans `panel_layout_runtime.js` (8),
  `matrix_runtime_dezoom.js` (6), `dialog_geometry_runtime.js` (6) — à vérifier pour l'alternance
  lecture/écriture de layout.
- `adole.db-wal` (5,1 Mo) est **plus gros que `adole.db`** (4,1 Mo) : le checkpoint WAL ne se fait pas.

---

# P3 — Code mort et dette

## P3-1 · 28 modules / 4 480 lignes sans aucun importeur

```
1130  eVe/R&D/ATG.js                                    85  eVe/intuition/tools/communication_media_source.js
 472  atome/src/squirrel/apis/update_atome.js           71  eVe/core/media_engine/molecule.scenarios.js
 438  eVe/intuition/tools/imports_exports/index.js      66  eVe/intuition/ribbon/disconnected_handle_logo.js
 418  eVe/R&D/converter.js                              66  atome/src/squirrel/voice/local_tts_worker.js
 368  eVe/intuition/tools/ui/tool_button_factory.js     49  eVe/R&D/atomic_object_demo_methods.js
 287  eVe/intuition/runtime/bevy_panel/bevy_panel_matrix.js   37  database/index.js
 152  eVe/intuition/ribbon/menu_scroll_runtime.js       26  eVe/intuition/tools/index.js
 140  atome/src/squirrel/voice/french_phoneme_encoder.js 17  eVe/intuition/panels/index.js
 139  eVe/intuition/tools/molecule/media/index.js       16  eVe/intuition/matrix/core/index.js
 138  eVe/intuition/tools/molecule/multi_instance/index.js  16  eVe/core/media_engine/index.js
 120  eVe/intuition/tools/molecule/gestures/index.js    13  eVe/intuition/matrix/ui/index.js
 102  eVe/intuition/components/core/component_creator.js 11  eVe/intuition/components/index.js
  93  scripts/ios_boot_performance_campaign.mjs          4  eVe/intuition/tools/ui/index.js
                                                        4  eVe/intuition/tools/init.js
                                                        2  atome/src/help/help.js
```

À noter : **10 fichiers `index.js` de barillet** morts, symptôme d'une convention de barillets
abandonnée en cours de route sans nettoyage. `atome/src/help/help.js` est un
`Object.freeze({})` vide.

⚠️ Rappel de méthode : avant suppression, inclure le fichier de définition lui-même dans la
recherche d'appelants (un appel intra-fichier compte), puis booter.

## P3-2 · 13 modules / 1 579 lignes vivants **uniquement** pour les tests

Ces modules n'ont aucun importeur en production. Les probes qui les gardent sont vertes et ne
prouvent rien sur l'application.

| Module (lignes) | Gardé par |
|---|---|
| `server/wsAtomeRealtimeOperation.js` (27) | `tests/server/atome_property_security.probe.mjs` (**519 l.**) |
| `server/sync_queue_worker.js` (55) | `tests/server/sync_queue_worker.probe.mjs` (72 l.) |
| `server/wsApiClient.js` (50) | `tests/eve/adole_commit_boundary.probe.mjs` (328 l.) |
| `eVe/intuition/flower/menu_items.js` (79) | `tests/probes/flower_menu_modules.probe.mjs` (**702 l.**) |
| `eVe/intuition/tools/contextual/flower_menu_layout.js` (285) | `…/flower_menu_layout.probe.mjs` (127 l.) |
| `eVe/domains/rendering/bevy_project_preview_capture_frame.js` (325) | 2 suites |
| `atome/src/shared/accessibility_bridge_contract.js` (59) + `semantic_rename_contract.js` (109) | `tests/shared/accessibility_behavior_contract.probe.mjs` (161 l.) |
| `atome/src/squirrel/voice/home_surface_i18n.js` (202) | `tests/eve/assistant_voice_runtime.test.mjs` |
| `atome/src/application/audio_runtime/auv3_host_playback.js` (133) | `…/auv3_host_playback.probe.mjs` (94 l.) |
| `atome/src/squirrel/bank/connector_contract.js` (40) | `tests/atome/src/squirrel/bank/service.probe.mjs` |
| `eVe/intuition/runtime/index.js` (95) | 6 probes |
| `eVe/intuition/tools/molecule/persistence/index.js` (120) | 2 probes |

Le cas le plus coûteux : **519 lignes de probe de sécurité** valident
`server/wsAtomeRealtimeOperation.js`, un module de 27 lignes que le serveur n'appelle jamais.

## P3-3 · 2,4 Mo de Rust vendorisé mort

`atome/renderers/wgpu-web-external-texture/wgpu-27.0.1/` (1,9 Mo) et `wgpu-types-27.0.1/` (512 Ko),
~25 000 lignes : **aucun `Cargo.toml` ne les référence** (seul 29.0.4 est épinglé). Seule la
documentation les décrit encore comme actifs (cf. P1-12).

## P3-4 · 9 dépendances npm déclarées et jamais importées

`three`, `tone`, `mediasoup-client`, `@ruby/wasm-wasi`, `glslify`, `tslib`, `@fastify/cookie`,
`@fastify/jwt`, `pino-pretty` — **0 `import`/`require` dans tout le source**.

`three` avait été retiré de `index.html` et de `package-app.js` (`done/optimisations.md:117`) mais
laissé dans `package.json`.

`leaflet` est un cas particulier : `index.html` dit « Leaflet is gone », mais
[scripts/package-app.js:242,244](scripts/package-app.js:242) injecte toujours
`js/leaflet.min.css` et `js/leaflet.min.js` — **fichiers qui n'existent pas** dans
`atome/src/js/` → deux 404 à chaque lancement du paquet.

## P3-5 · 16 scripts orphelins dans `scripts/`

Non référencés par `package.json` ni par un autre script :

```
axum_mail_sync_bridge.mjs      phase9_icloud_credentials_doctor.mjs
basic-pitch-entry.js           phase9_icloud_live_bundle.mjs
codemirror-entry.js            phase9_mcp_runtime_suite.mjs
dom_projection_density_runtime.mjs   phase9_ui_regression_suite.mjs
dom_projection_report_runtime.mjs    phase9_voice_interrupt_suite.mjs
export_dom_subtrees.mjs        phase9_voice_latency_baseline.mjs
ios_boot_performance_campaign.mjs    purge_webview_storage.mjs
package-app.js                 test_contracts.mjs
```

(`package-app.js` est appelé par `build_PWA_app.sh`, pas par npm.)

## P3-6 · Conventions de tests : trois régimes distingués par un manifeste, pas par un nom

`vitest.config.js` énonce : « `*.test.mjs` = suite vitest, listée explicitement dans le manifeste.
**Rien d'autre ne porte ce suffixe.** » Or :

- 208 `.test.mjs` existent, **205** sont au manifeste ;
- les 3 restants (`tests/server/ws_sync_runtime.test.mjs`, `tests/server/server_media.test.mjs`,
  `tests/eve/lasso_context_action_regression.test.mjs`) utilisent `node:test` et sont exécutés par
  `run_probes.mjs` — un **troisième** régime d'exécution non documenté ;
- **362 `.probe.mjs`** existent, et `npm run probes` **ne figure dans aucune chaîne `quality:*`** :
  la majorité du corpus de tests n'est dans aucune porte.
- `eVe/tests/` existe encore (`test.js`, `designUI.js`, `Todos/`) alors que la même config affirme
  qu'il n'y a plus de test colocalisé dans `eVe`.

## P3-7 · Autres

- `atome/src/squirrel/apis.js` n'est référencé que par `scripts/bundle.js`.
- `eVe/domains/media/api/media_api_auth.js:69-71` : `resolveStoredToken(keys = [])` **retourne
  toujours `''`** et ignore son paramètre. `getLocalAuthToken()` retombe dessus.
- `dist/` est versionné (9 fichiers) et **déjà périmé** : `dist/squirrel.js` (le `main` npm) date du
  1ᵉʳ sept., les sources du 2 sept.
- Un `<script>` XSS possible : [atome/src/squirrel/components/editor_builder_load_dialog.js:112](atome/src/squirrel/components/editor_builder_load_dialog.js:112)
  interpole `props.fileName` (contrôlé par l'utilisateur) dans `innerHTML`.
- `new Function(` ×2 dans `editor_builder_run.js` (exécution de code de l'éditeur — attendu, mais à documenter).

---

# P4 — Hygiène du dépôt

## P4-1 · 2,23 Gio de pack git, dont 398 Mo pour un seul artefact de build

Aucun `git-lfs` : `.gitattributes` ne contient qu'une règle de fin de ligne pour `*.sh`.

Poids cumulé par chemin dans **tout l'historique** :

| Poids | Chemin | Révisions |
|---|---|---|
| 156,4 Mo | `atome/src/wasm/squirrel_bevy_renderer_bg.wasm.gz` | 34 |
| 134,4 Mo | `atome/src/wasm/squirrel_bevy_renderer_bg.wasm` | 67 |
| 107,1 Mo | `atome/src/wasm/squirrel_bevy_renderer_bg.wasm.br` | — |
| 55,7 Mo | `assets/voice/…siwis-medium.onnx` | |
| 54,4 Mo | `assets/videos/superman.mp4` | |
| 39,4 Mo | `platforms/web/bevy-renderer/target/debug/deps/libsquirrel_bevy_renderer.dylib` | **artefact Cargo commité** |
| 37,8 Mo | `src/assets/videos/avengers.mp4` | **chemin d'une ancienne arborescence** |
| ~150 Mo | `platforms/web/bevy-renderer/target/debug/deps/*.rlib`, `src-audio-wasm/target/debug/*` | artefacts Cargo commités |

Le WASM du renderer, régénéré à chaque build, ajoute ~12 Mo à l'historique **de façon permanente**
à chaque commit. Tout clone télécharge 2,2 Gio.

## P4-2 · Worktrees résiduels

`git worktree list` :

```
/Users/…/RubymineProjects/a                                    17f9af3e [main]
/Users/…/.codex/worktrees/5adf/a                               e72c21cd (detached)
/Users/…/.codex/worktrees/5d43/a                               f5ba54bd (detached)
/Users/…/RubymineProjects/a/.claude/worktrees/relaxed-haibt-…  b312cc9f (detached)   ← 296 Mo
```

Le worktree `.claude/worktrees/relaxed-haibt-6af634` (296 Mo) est **à l'intérieur du dépôt
principal** et fait apparaître des `Cargo.toml` fantômes dans toutes les recherches.

## P4-3 · Répertoires locaux volumineux (correctement ignorés, mais à surveiller)

`platforms/desktop-tauri/target` **18 Go**, `atome/renderers/bevy-core` **5,3 Go**,
`platforms/web` 846 Mo, `database_storage` 694 Mo, `platforms/ios` 452 Mo, `temp` 144 Mo.
**Total du répertoire de travail : 29 Go.**

## P4-4 · Sprawl documentaire

`todo/` : **148 fichiers Markdown versionnés** (dont `2- Granularity_Validation.md` 110 Ko,
`audit_execution_plan.md` 94 Ko, `execution_order.md` 85 Ko). `done/` : 85 fichiers.
`.audit/CODE_AUDIT_PROGRESS.md` : 93 Ko. `known-bug-solutions/` : 21 fichiers. `maps/` : 1,06 Mo
(dont 11,8 % de chemins morts, cf. P1-12). Il n'y a pas d'index unique : le même sujet est traité
dans `todo/`, `done/`, `.audit/`, `.codex/modules/` et `maps/`.

---

# Ordre de traitement suggéré

**Bloquants immédiats** (rien d'autre n'a de valeur tant qu'ils tiennent)
1. **P0-1 / P0-2** — packaging PWA : ajouter l'importmap, copier `utils/` + `shared/` + `early-init.js`,
   supprimer le `copyDirectory(atome → atome)`. Reprendre la probe `package_app_probe.mjs` en garde.
2. **P0-3** — créer ou retirer `build:all` et `build:npm` ; la porte d'acceptation doit pouvoir passer.
3. **P0-4 / P0-5** — verrou de promesse en vol dans `initDatabase`, `CREATE VIEW IF NOT EXISTS`,
   `DROP`/`CREATE` dans une transaction, table de version de schéma.
4. **P0-6** — décider ce que `puts`/`log` doivent faire, et rendre `window.print` au navigateur.

**Contrats** (ce sont les vraies sources de « ça marche puis ça ne marche plus »)
5. **P0-8** — un seul `isTauriRuntime()` exporté, tous les autres supprimés ; probe qui vérifie
   qu'aucun module ne redéfinit le nom.
6. **P1-1 / P1-2** — table d'alias canonique unique, écriture d'une seule orthographe,
   `??` au lieu de `||` sur les valeurs numériques.
7. **P0-9** — faire passer les écritures serveur par `adole.js`, ou déplacer les garde-fous
   sous la couche SQL.
8. **P0-7 / P1-3** — figer le contrat WS dans un artefact partagé et mesurer l'écart des trois backends.

**Sécurité**
9. **P0-10** (Origin `null` + `new URL` sans `try`), **P0-11** (rate limit).

**Nettoyage à faible risque, gain immédiat**
10. **P3-1 / P3-2 / P3-3 / P3-4 / P3-5** — 4 480 lignes mortes + 1 579 lignes « test seulement »
    + 2,4 Mo de Rust vendorisé + 9 dépendances + 16 scripts.
11. **P2-7** — sortir les vidéos de démo et le modèle ONNX du bundle ; ne livrer qu'un encodage du WASM.
12. **P4-1** — `git-lfs` (ou `.gitignore`) sur `atome/src/wasm/*.wasm*` ; envisager une réécriture
    d'historique pour les 398 Mo d'artefacts de build.

**Performance**
13. **P2-1** (N+1 `listAtomes`), **P2-2** (instantanés jamais créés), **P2-3** (dédup quadratique),
    **P2-5** (minuteries et écouteurs).

---

## Annexe — artefacts de l'audit

Les deux probes exécutées sont conservées dans `./temp` (rejouables telles quelles) :

- `temp/package_app_boot_probe.mjs` — vérifie que le paquet PWA est bootable (rouge : importmap absente,
  5 imports de `spark.js` non copiés).
- `temp/db_init_race_probe.mjs` — lance 4 requêtes concurrentes sur une base neuve
  (rouge : 2 rejets, schéma appliqué 4 fois).

Elles sont à reprendre comme gardes une fois les correctifs P0-1 et P0-4 appliqués.
