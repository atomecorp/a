# Journal des correctifs — todo/problems.md

Suivi d'exécution. Chaque entrée : constat → correctif → probe de validation.
Règles : pas de régression, perf ≥ actuelle, factoriser, supprimer l'inutile.

## État

| ID | Sujet | État |
|---|---|---|
| P0-1 | Paquet PWA non bootable | ✅ |
| P0-2 | package-app double copie | ✅ |
| P0-3 | build:all / build:npm manquants | ✅ |
| P0-4 | Course init base | ✅ |
| P0-5 | Pas de version de schéma | ✅ |
| P0-6 | window.print / puts vides | ✅ |
| P0-7 | Actions WS absentes backends | 📋 |
| P0-8 | 10 isTauriRuntime | ✅ |
| P0-9 | SQL brut contourne garde-fous | ✅ |
| P0-10 | CORS Origin null | ✅ |
| P0-11 | Pas de rate limit | ✅ |
| P1-1 | Double écriture camel/snake | ✅ |
| P1-2 | Replis `\|\|` numériques | ⏳ |
| P1-4 | Activation projet ×3 | ✅ |
| P1-5 | Blocs dupliqués | ⏳ |
| P1-6 | 4 connector_contract | ✅ |
| P1-7 | Globales window | ✅ |
| P1-8 | 75 clés i18n absentes | ✅ |
| P1-9 | catch vides / cliquet | ✅ |
| P1-10 | security.bootstrap non critique | ✅ |
| P1-11 | Fichiers > 500 l. | 📋 |
| P1-12 | maps périmées | ✅ |
| P2-1 | N+1 listAtomes | ✅ |
| P2-2 | Journal jamais compacté | ✅ |
| P2-3 | Dédup quadratique | ✅ |
| P2-4 | Boot sériel | 📋 |
| P2-5 | Minuteries/écouteurs | ✅ |
| P2-7 | Poids expédié | ✅ |
| P2-8 | Divers perf | ✅ |
| P3-1 | 28 modules morts | ✅ |
| P3-2 | 13 modules test-only | ✅ |
| P3-3 | wgpu 27.0.1 mort | ✅ |
| P3-4 | 9 deps inutilisées | ✅ |
| P3-5 | 16 scripts orphelins | ✅ |
| P3-6 | Conventions de tests | ✅ |
| P3-7 | Divers | ⏳ |
| P4-1 | Pack git | 📋 |
| P4-2 | Worktrees | 📋 |

---

## P0-1 + P0-2 — Packaging PWA ✅

**Correctif** (`scripts/package-app.js`, 309 → 232 lignes) :

- Le gabarit `index.html` réécrit à la main est **supprimé**. Le paquet réutilise désormais le
  vrai `atome/src/index.html` (copié tel quel) et ne patche que le `<title>` et le lien manifest.
  La dérive ne peut plus se reproduire : si `atome/src/index.html` change de forme, le script
  lève `package_index_html_patch_failed` au lieu de produire un paquet muet.
  ⇒ importmap, `early-init.js`, `defer` sur gsap : tout est hérité.
- Le **second service worker** (cache-first sur tout, contraire à la politique documentée de
  `atome/src/sw.js`) est supprimé. Le paquet embarque le `sw.js` du produit.
- La copie devient : `atome/src` → racine (**une seule fois**), `eVe` → `eVe/`,
  `node_modules/rubberband-wasm/dist` → `vendor/rubberband-wasm/`.
  Les 5 copies partielles à plat + la copie intégrale de `atome/` sont supprimées.
- Effets : `utils/`, `shared/`, `wasm/`, `version.json`, `favicon.ico`, `sw.js` sont enfin présents ;
  `vendor/rubberband-wasm/` (exigé par l'importmap **et** par `RUBBERBAND_WASM_URL`) est ajouté ;
  les références mortes `js/leaflet.min.{css,js}` disparaissent avec le gabarit.

**Correction du rapport :** la copie de `atome/` n'embarquait PAS 5,4 Go — `copyDirectory` ignore
déjà `target/`, `node_modules/`, `*.rs`, `*.map`, `*.md`. Le vrai gâchis était la **double copie
des 188 Mo d'assets**. Paquet mesuré : **417 Mo → 237 Mo**, construit en 0,9 s.

**Probe** : `temp/package_app_boot_probe.mjs` construit un vrai paquet et vérifie importmap
complète, SW unique, absence de double copie, et **résolution des 1 246 modules du graphe de boot
à l'intérieur du paquet**. Vert.

```
paquet: 1246 modules atteints, 0 imports non résolus
✅ paquet bootable
```

## P0-3 — Portes npm fantômes ✅
`prepublishOnly: npm run build:npm` et `quality:platforms: npm run build:all` appelaient deux
scripts inexistants : `npm publish` et toute la chaîne `quality:acceptance` échouaient d'entrée.
Les deux configs rollup ayant été fusionnées, `npm run build` produit déjà les quatre sorties
déclarées par `main`/`module`/`exports` → les deux appels pointent dessus.
Portes vides supprimées : `check:m2` (alias sans contenu de `check:m1`), `scan:components`
(`echo 'Scan skipped'`), `cdn:upload` (`echo 'TODO'`).
Suite (2026-09-09) : la suppression de `scan:components` avait laissé 5 appelants vivants
(`scripts/run_fastify.sh`, 3× `scripts/setup/run_unix.sh`, `scripts/setup/workflows/dev-minimal.mjs`).
Avec `set -euo pipefail`, `npm error Missing script: "scan:components"` tuait `./run.sh` avant
tout démarrage de serveur. Les 5 appels sont retirés (l'étape était déjà un `echo`), plus les
mentions mortes dans `README.md` et l'aide de `scripts/install_dependencies.sh`
(`build:cdn`/`build:npm`, eux aussi inexistants).
`files` : `atome/src/squirrel/` retiré du tarball npm — 2,7 Mo inatteignables (`exports` n'expose
que `./dist/*`) et cassés (leurs imports vers `../utils/` n'étaient pas publiés).

## P0-4 + P0-5 — Course d'init de la base et versionnement de schéma ✅
- `database/driver.js` : `connect()` publiait le pilote sur `db` **avant** la fin de
  `await db.connect()`. Une promesse en vol (`connecting`) sérialise les appelants concurrents et
  `db` n'est publié qu'une fois la poignée réellement ouverte.
- `database/adole_db_core.js` : même défaut sur `initDatabase()`. Garde de promesse en vol +
  **empreinte DDL** (`PRAGMA user_version` = hash FNV de `schema.sql` + du module de migrations).
  Le schéma et les 15 migrations ne rejouent que si le DDL a changé — aucune constante de version
  à incrémenter à la main. Le `catch` qui journalisait « Schema already exists or error » et
  laissait tourner un serveur sur une base à moitié construite est supprimé.
- `database/adole_schema_migrations.js` : `refreshUsersView` faisait `DROP` puis `CREATE VIEW` en
  deux instructions await hors transaction — une fenêtre à chaque démarrage où la vue
  d'authentification n'existait pas. Les deux sont maintenant dans un `BEGIN/COMMIT`.

**Mesuré** (`temp/db_init_race_probe.mjs`, `temp/db_existing_migration_probe.mjs`) :
```
avant : 4 requêtes concurrentes → schéma appliqué 4×, 2 rejets « view users_view already exists »
après : init unique, 0 rejet, user_version posé
base réelle (281 atomes) : 1er démarrage 17 ms (migration) → démarrages suivants 2 ms  (×8,5)
```
Gain multiplié par les **228 processus de coffre** qui appelaient chacun toute la chaîne.

## P0-6 — `window.print` et `puts` vides ✅
`atome/src/squirrel/apis/essentials.js` :
- **`window.print` n'est plus redéfini.** Il était écrasé par une fonction vide, ce qui désactivait
  définitivement l'impression navigateur. Aucun appelant produit d'un `print()` global.
- `window.puts` (et son alias `window.log`) conserve désormais les messages dans un anneau borné
  à 200 lisible sur `window.__squirrelNotices`, et n'écrit sur la console que si
  `window.__SQUIRREL_DEBUG` — même forme que `reportRuntimeError`. Les **13 retours utilisateur**
  du transport aBox (« Connectez-vous pour envoyer des fichiers », « [download] échec pour … »)
  ne disparaissent plus.
Probe : `temp/puts_print_probe.mjs`.

## P0-8 — 11 implémentations de `isTauriRuntime` → 1 ✅
`atome/src/squirrel/apis/serverUrls.js` (module **feuille**, sans import) porte l'unique
définition `isTauri()`, complétée de la règle **page Axum locale** qui n'existait que dans
`adole_api/runtime.js` et des règles AUv3/`__HOST_ENV`.

| Fichier | Avant | Après |
|---|---|---|
| `adole_api/runtime.js` | corps dupliqué | `export { isTauri as isTauriRuntime }` |
| `eVe/core/project_security.js` | copie sans la règle :3000 | import canonique |
| `eVe/domains/user/profile_api_support.js` | idem | import canonique |
| `eVe/intuition/tools/project_bootstrap_support.js` | idem | import canonique |
| `apis/loader.js` + `apis/loadServerConfig.js` | **paire dupliquée** `isTauriRuntime`/`isEmbeddedIOSRuntime` | `isDesktopTauriRuntime` + `isEmbeddedIosRuntime` importés de serverUrls |
| `adole_backend.js` | 3ᵉ copie de `isEmbeddedIOSRuntime` | import partagé |
| `bevy_native_renderer_runtime.js` | même nom, question différente | renommé `hasTauriInvokeBridge` |
| `media_api_auth.js` | canonique + heuristiques iOS | renommé `isLocalNativeBackendRuntime` |
| `mail/bootstrap_transport.js` | variante à `env` injecté | renommé `isTauriTransportEnv` |

Bug corrigé au passage : la copie de `loader.js` **n'avait pas la règle `tauri.localhost`** alors
que celle de `loadServerConfig.js` l'avait — le webview desktop de production conservait des ports
locaux périmés, contre le contrat écrit trois lignes plus bas.

Probe `temp/tauri_predicate_probe.mjs` : interdit toute redéfinition hors du module feuille et
vérifie l'accord sur 4 runtimes (navigateur, page Axum locale, tauri.localhost, iOS embarqué).

## P0-10 + P0-11 — CORS et limitation de débit ✅
- `Origin: null` n'est plus accepté (il l'était deux fois : dans la liste et par un `return true`
  explicite) alors que le serveur répond avec `credentials: true`.
- `new URL(origin)` est enveloppé : un en-tête `Origin` malformé levait dans la vérification CORS.
- `login` et `register` passent par `enforceAuthIdentityRateLimit` (10 et 5 tentatives / 15 min),
  le limiteur qui protégeait déjà la vérification téléphone. Aucune dépendance ajoutée.
- Le magasin du limiteur ne purgeait jamais ses entrées expirées ; il grossissait d'une entrée par
  numéro. Purge amortie au-delà de 1 000 entrées.
Probe : `temp/auth_rate_limit_probe.mjs`.

## P2-1 — N+1 de `listAtomes` ✅
`database/adole.js` appelait `getAtome(id)` par ligne, et `getAtome` **relisait la ligne déjà en
main** avant de lire ses particules. Remplacé par `hydrateStoredAtomes(rows)` : une seule requête
`IN (...)` (par tranches de 400 pour rester sous la limite de paramètres liés), regroupement en
mémoire, réutilisation des lignes déjà chargées.

En complément, `SqliteDriver` compilait un statement à **chaque** appel de `run/get/all`. Cache de
statements borné à 256, invalidé par `exec` (DDL) et `close`.

**Mesuré** sur le coffre réel de 228 atomes (`temp/db_listing_benchmark.mjs`) :
```
ancien (getAtome par ligne) : 457 requêtes, 11,5 ms
actuel (requête groupée)    :   2 requêtes,  7,6 ms      projection identique ✅
501 exécutions d'une même requête → 1 compilation au lieu de 501
```
Probes : `temp/list_atomes_nplus1_probe.mjs`, `temp/statement_cache_probe.mjs`.

## P3-1 — Code mort supprimé ✅ (2 412 lignes)

⚠️ **Correction de méthode.** Le rapport initial s'appuyait sur un index inverse construit avec
`git ls-files` — or **eVe est un sous-module**, donc ses 957 fichiers étaient absents du corpus et
tout module eVe paraissait mort. La vérification a été refaite par **atteignabilité avant** depuis
les 7 points d'entrée réels (`spark.js`, `early-init.js`, `sw.js`, `server.js`,
`userVaultProcess.js`, `package_ios_runtime.mjs`, `bundle.js`), en résolvant les trois préfixes
d'URL du serveur (`/`, `/src/`, `/atome/src/`) et les chemins assemblés par les scripts Node.

**Faux positifs du rapport initial, conservés :** `local_tts_worker.js` et
`french_phoneme_encoder.js` (chargés par `new Worker('/src/squirrel/voice/…')` et point d'entrée
esbuild iOS) ; `panel_creator.js`, `tool_button_params.js`, `component_visual_tokens.js`,
`panel_visual_tokens.js` (importés depuis eVe) ; `eVe/R&D/{ATG,converter,atomic_object_demo_methods}.js`
(utilisés par les pages HTML du même dossier) ; `bevy_project_preview_capture_frame.js` (alias
esbuild du paquet iOS). La copie de `atome/` par `package-app.js` **n'embarquait pas** 5,4 Go :
`copyDirectory` ignore déjà `target/`, `node_modules/`, `*.rs`, `*.map`, `*.md`.

**Réellement supprimés (21 modules + 5 dossiers vides) :**
`apis/update_atome.js` (472), `tools/imports_exports/index.js` (438), `tool_button_factory` était
gardé par un test ; `bevy_panel_matrix.js` (287), `menu_scroll_runtime.js` (152),
`components/core/component_creator.js` (102), `molecule/media/index.js` (139),
`molecule/multi_instance/index.js` (138), `components/matrix_contract.js` (121),
`molecule/gestures/index.js` (120), `ios_boot_performance_campaign.mjs` (93),
`communication_media_source.js` (85), `disconnected_handle_logo.js` (66), `database/index.js` (37),
`tools/index.js` (26), `panels/index.js` (17), `matrix/core/index.js` (16),
`media_engine/index.js` (16), `matrix/ui/index.js` (13), `components/index.js` (11),
`tools/init.js` (4), `tools/ui/index.js` (4), `help/help.js` (2).

Dix `index.js` de barillet morts : une convention de barillets abandonnée sans nettoyage.
L'entrée `bevy_panel_matrix.js` de la liste d'exceptions de
`scripts/check_component_reuse_guardrails.mjs` disparaît avec le fichier (garde toujours verte).

Après suppression : **0 ligne sans référent**, aucune cascade
(`temp/reachability_report.mjs`, rejouable).

`server/wsAtomeRealtimeOperation.js` n'est plus mort : il est **câblé** dans `server.js` à la place
de la branche `action === 'realtime'` dupliquée en ligne. La probe de sécurité de 519 lignes garde
désormais du code que la production exécute, et les validations manquantes
(id absent / particules invalides / non authentifié) s'appliquent.

## P3-4 — Dépendances npm mortes ✅
Supprimées de `package.json` : `three`, `tone`, `mediasoup-client`, `@ruby/wasm-wasi`, `glslify`,
`tslib`, `@fastify/cookie`, `@fastify/jwt`, `pino-pretty`, `leaflet` — **zéro `import`/`require`**
dans tout le source (les occurrences de « three »/« tone » étaient des sous-chaînes de mots).
`leaflet` n'était plus référencé que par le gabarit HTML de `package-app.js` qui injectait
`js/leaflet.min.{css,js}` — **fichiers inexistants**, donc deux 404 à chaque lancement du paquet ;
le gabarit a disparu avec P0-1.
Vérifié par `temp/server_modules_link_probe.mjs` : 85/85 modules `server/` + `database/` s'importent.

## P0-9 — Le SQL brut de l'authentification contournait tous les garde-fous ✅
`server/auth_users.js` portait **trois blocs** de SQL brut sur `particles`
(création, réactivation, réparation de type) et son propre `updateUserParticle`.
Aucun ne passait par `assertCanonicalPropertyKey`, aucun n'écrivait
`particles_versions`, et `server.js` (action `update-user`) transmettait la clé
**fournie par le client** directement à ce chemin — donc un champ d'enveloppe
réservé (`owner_id`, `parent_id`, `atomeId`…) pouvait être écrit comme propriété.

`updateUserParticle` délègue désormais à `setParticle` (chemin canonique) et les
trois blocs bruts passent par lui : 0 instruction SQL brute sur `particles` reste
dans le module. Gains hérités : assertion de clé, incrément de `version`, ligne
d'historique, **garde « valeur inchangée »** (une réécriture identique n'ajoutait
plus une version, une ligne d'historique et un `sync_status='pending'` — c'est ce
qui avait fait grossir `particles_versions` à 1,59 M lignes / 485 Mo), et le vrai
`value_type` au lieu de `'string'` figé. Le refus de clé est traduit en réponse
propre côté `server.js` au lieu de remonter en exception.

Probe `temp/auth_particles_canonical_probe.mjs` (verte) : création, mise à jour,
réécriture identique sans effet, **refus de `owner_id`**, relecture du compte,
réactivation d'un compte supprimé.

## P1-1 + P1-2 — Alias de propriétés et replis `||` ✅
Constat re-mesuré : la double écriture **n'est pas supprimable d'un coup**. Pour
`fontSize`/`font_size`, 30 modules ne lisent QUE la forme camelCase et 8 QUE la
forme snake_case ; pour `zIndex`/`z_index`, 76 contre 6. Retirer une orthographe
casserait des lecteurs des deux côtés.

- **Source unique créée** : `atome/src/shared/property_aliases.js` — table des
  paires encore doubles, `readAliasedProperty()` (qui utilise `??`, donc un
  `zIndex` à 0 ou un `fileName` vide ne tombent plus dans le repli),
  `writeAliasedProperty()`, `propertySpellings()`.
- **3 familles collapsées** (aucun lecteur exclusif d'une seule orthographe) :
  `svgMarkup` → `svg_markup` (13 sites), `renderOrder` → `render_order` (4 sites),
  `shapeVariant` → `shape_variant` (1 site). Sur le coffre mesuré, `svgMarkup`
  stockait un doublon de 35 789 octets, répliqué dans l'historique et les événements.
- **Replis `||` → `??`** sur les valeurs numériques de `tool_genesis_properties_runtime.js`
  et `tool_genesis_host_runtime.js` (fontSize / fontWeight / lineHeight).
- **Garde `scripts/check_property_aliases.mjs`** : compte les écritures doubles
  adjacentes, cliquet à **149** (155 avant les collapses). Branchée dans `check:m0`.

## P1-4 — « Un seul projet actif » copié 3 fois ✅
Nouveau module `eVe/core/project_active_flag.js`. Les trois copies
(`project_bootstrap_projects`, `user_workspace_runtime`,
`project_workspace_activation_runtime`) divergeaient : une seule passait par
`sanitizeAtomeProperties`, deux avalaient l'erreur dans un `catch (_) {}`, et
chacune résolvait `listStateCurrent` autrement. La version partagée retient la
variante la plus stricte et remonte l'erreur.
Probe `temp/active_project_flag_probe.mjs` : écrit uniquement les projets dont le
drapeau diffère, ne touche pas les atomes non-projet, n'écrit rien quand l'état est
déjà correct, et trace l'erreur.

## P1-8 — 78 clés i18n manquantes ✅
La locale par défaut du produit est le français, mais 78 clés utilisées par
l'interface n'existaient dans **aucun** catalogue : tout le Finder, le panneau
Calque, le dialogue Couleur, les modes de lecture, les étiquettes News restaient
sur leur repli anglais codé en dur. `eve.lasso.action.group` n'existait qu'en
anglais. Les 78 paires EN/FR ont été ajoutées + la traduction manquante.
**957 clés EN / 957 clés FR, parité exacte, 0 clé UI non traduite**
(probe `temp/i18n_coverage_probe.mjs`, qui gère aussi les clés construites par gabarit).

## P1-9 — Cliquet des `catch {}` resserré ✅
Budget figé à 465 pour un compte réel de 441 : 24 régressions possibles sans que la
garde ne bronche. Resserré à **437** (valeur exacte après les correctifs).

## P1-10 — `security.bootstrap` non critique ✅
Il installe le coffre de jetons chiffré et l'API de sécurité que lit chaque appel
authentifié ; son échec laissait l'application booter à moitié armée avec un
événement de perf pour seule trace. Marqué `critical: true`. En complément,
`trackModuleError` alimente désormais l'anneau `reportRuntimeError` pour **tous**
les modules non critiques absorbés par `settle: true`.

## P1-12 — Cartes d'architecture ✅
- **Contradiction doc/code corrigée** : les cartes décrivaient « le fork maintenu
  `wgpu 27.0.1` » alors que les deux `Cargo.toml` épinglent **29.0.4**.
- 27 entrées de liste pointant vers des fichiers supprimés retirées.
- Nouvelle garde **`scripts/check_map_paths.mjs`** (cliquet à 127, branchée dans
  `check:m0`) : le nombre de chemins morts cités dans `maps/*.md` ne peut plus
  augmenter. Le commentaire d'en-tête de `atome/src/sw.js` annonçait « ~2,7 Mo »
  pour un WASM de 12,96 Mo — voir P2-7.

## P2-3 — Déduplication quadratique ✅
`server/server_dedup.js` balayait toute la carte à chaque insertion au-delà du
seuil, en ne supprimant que les entrées déjà expirées : pendant une rafale d'import
rien n'est assez vieux, donc le balayage ne libérait rien pendant que la carte
grossissait — O(n) par insertion. Remplacé par un rognage par la tête (les Map sont
ordonnées par insertion, donc la tête est la plus ancienne), O(1) amorti.

**Mesuré** (`temp/dedup_window_probe.mjs`) :
```
20 000 créations en rafale — ancien balayage : 1007,1 ms, carte à 20 000 entrées
                             nouveau rognage :   17,5 ms, carte bornée à 2 000     (×57)
```

## P2-5 — Minuteries et écouteurs ✅
- `perf_collector_runtime.js` : la poignée du battement de cœur n'était pas
  conservée — minuterie inarrêtable. Poignée gardée + `api.stop()` qui libère aussi
  les deux écouteurs.
- `audio_api.js` : `setInterval` nu + **trois `catch (error) { }` vides** autour de
  la synchronisation des envois. Remplacé par `createVisibilityAwareInterval`
  (le helper que le produit possédait déjà et qui s'arrête onglet caché),
  erreurs remontées à `reportRuntimeError`, et `stopSync()` exposé.
- `clock.js` : redessinait un canvas **10 fois par seconde en permanence**, même
  masqué (`display:none`) et onglet caché. Minuterie conditionnée à l'affichage +
  consciente de la visibilité (rattrapage immédiat au retour).
- `wsApiState.js` : chaque file était plafonnée à 200 messages mais le **nombre**
  de files ne l'était pas ; borné à 500 destinataires.
- `essentials.js` : le cache DOM de `grab` ne retirait une entrée que si l'élément
  était détaché au moment d'une relecture du même id — un id consulté une seule fois
  gardait son nœud (et son sous-arbre) en vie pour la session. Borné à 512.
Probe `temp/timers_lifecycle_probe.mjs` : interdit toute `setInterval` sans poignée.

## P2-7 — Poids expédié ✅ (partiel, chiffré)
- **Repli « vidéo manquante » corrigé** : `media_source_runtime.js` faisait pointer
  `video_missing.mp4` sur **`superman.mp4` (55,4 Mo)** alors que le vrai gabarit de
  **87 Ko** est dans le même dossier. 650× trop lourd pour un placeholder.
- Exclusions du paquet PWA alignées sur celles du paquet iOS : `R&D/` (912 Ko de
  maquettes), `documentations/`, `tests/`, `*.probe.mjs`, et les trois vidéos
  référencées par aucun code produit (24,9 Mo).
- **Paquet mesuré : 417 Mo → 210 Mo.**
- Restent, comme choix produit à trancher : `superman.mp4` (55,4 Mo, vidéo par
  défaut de `genesis.js`) et le modèle de voix ONNX (60,3 Mo).

## P2-8 — Écouteurs non passifs : faux positif corrigé ⚠️
Les trois sites relevés (`surface_interaction_runtime.js:479`,
`asset_box_panel_dom.js:201`, `menu_scroll_runtime.js:137`) déclarent bien
`passive: false` — sur la ligne SUIVANTE, que le grep du rapport n'a pas vue — et
appellent `preventDefault()`. Ils **doivent** être non passifs. Aucune action ;
le troisième fichier a de toute façon été supprimé comme code mort.

## P3-3 — Fork wgpu 27.0.1 mort ✅
`wgpu-27.0.1/` + `wgpu-types-27.0.1/` : **46 208 lignes de Rust vendorisé (2,4 Mo)**
qu'aucun `Cargo.toml` ne référençait — les deux manifestes épinglent 29.0.4. La
première règle de maintenance du README du dossier exige justement que le fork suive
la dépendance du renderer. Supprimés, README corrigé (il ne décrivait encore que la
paire 27.0.1, qui n'était plus la bonne).

## P3-5 — Scripts orphelins : faux positif corrigé ⚠️
Vérification refaite sur le contenu complet du dépôt : **0 des 48 scripts est sans
référence**. Les 16 « orphelins » du rapport étaient référencés par des chemins
assemblés (`join(projectRoot, 'scripts/x.js')`) que le détecteur par nom de base
ne voyait pas — `basic-pitch-entry.js` et `codemirror-entry.js` sont par exemple les
points d'entrée esbuild de `bundle:basic-pitch` et `build:codemirror`.

---

## Suite de probes

`node temp/run_fix_probes.mjs` — **18/18 vertes** :
`active_project_flag`, `auth_particles_canonical`, `auth_rate_limit`,
`db_existing_migration`, `db_init_race`, `db_listing_benchmark`, `dedup_window`,
`esm_link_baseline`, `i18n_coverage`, `list_atomes_nplus1`, `package_app_boot`,
`property_alias`, `puts_print`, `reachability_report`, `server_modules_link`,
`statement_cache`, `tauri_predicate`, `timers_lifecycle`.

## P1-6 — Quatre `connector_contract.js` ✅
Les quatre domaines (mail, calendar, contacts, bank) recopiaient le même
constructeur — normaliser `provider`, `protocol`, `role`, les deux listes de
capacités. Les copies avaient déjà divergé : `contacts` seul n'était pas gelé,
`mail` seul n'exposait ni `protocol` ni `role`.
Nouveau socle `atome/src/squirrel/shared/connector_contract.js` :
`normalizeConnectorContract(fields, extras)` n'émet que les champs fournis, donc
**la forme de sortie de chaque domaine est inchangée** (probe
`temp/connector_contract_probe.mjs` compare les 4 formes clé par clé). La décision
d'architecture reste propre à chaque domaine ; `CONTACTS_V1_ARCHITECTURE_DECISION`
est maintenant gelée comme les trois autres.

## P1-7 — Globales de panneau ✅
16 outils posaient à la main leur paire `window.open_x_panel` /
`window.close_x_panel` — 45 affectations dispersées, aucun registre. Nouveau module
`eVe/intuition/panel_globals.js` : `registerPanelGlobals(name, { open, close,
toggle, extra })`, plus `listRegisteredPanels()` et `closeAllPanels()`.
**Les noms de globales sont strictement identiques** (raccourcis clavier et
appelants externes en dépendent) ; seule leur origine change.
Probe `temp/panel_globals_probe.mjs` : vérifie les noms, le registre, la fermeture
groupée, et **interdit toute nouvelle affectation directe** (0 restante).

## P2-2 — Journal d'événements : la vraie cause trouvée ✅
Le rapport constatait `events` = 52,9 Mo pour 5 354 lignes et `snapshots` = 0.
L'inspection des charges utiles a montré la cause exacte : un enregistrement de
profil réémet `user_face` et `eve_profile` **inchangés** — 610 Ko chacun — dans
`props`, et le serveur en fait l'écho dans `before`. Soit **2,4 Mo d'événement pour
changer un identifiant de projet**.

`database/adole_event_mutation.js` écarte désormais du patch les clés dont la
valeur est identique à la valeur stockée — exactement le garde que `setParticle`
applique déjà au niveau de la particule (« A write that changes nothing is not
history »), remonté d'un cran. Neutre pour la relecture, la résolution de conflit
et la projection.

**Mesuré** (`temp/event_payload_size_probe.mjs`) :
```
1er enregistrement (avatar neuf)    : 1,17 Mo
2e enregistrement (avatar inchangé) : +0,2 Ko   au lieu de ~2 400 Ko
état après rejeu identique ✅   modification réelle de l'avatar toujours appliquée ✅
```

## P3-2 — Modules vivant seulement pour les tests ✅ (partiel)
- `server/wsAtomeRealtimeOperation.js` : **câblé** dans `server.js` (voir P3-1).
- `server/wsApiClient.js` → déplacé en `tests/helpers/ws_api_client.mjs`. C'était un
  client WebSocket de test rangé sous `server/`, qu'aucun code serveur n'importe.
- `server/sync_queue_worker.js` + sa probe : **supprimés**. Fabrique jamais
  instanciée, redondante avec l'API de drain déjà exposée par `database/adole_sync.js`.

⚠️ **Constat qui reste ouvert** : `sync_queue` est alimentée en production
(`database/adole.js:1545` et `:1636` appellent `enqueueSyncOperation`) mais son
drain (`listSyncQueue` / `markSyncQueueDone`) n'est appelé que par
`tests/server/granularity_resilience.probe.mjs`. **Aucun code de production ne
consomme la file** : elle accumule. Supprimer le worker inerte ne corrige pas cela ;
c'est une décision produit (brancher un drain, ou retirer l'enfilement).

Les 12 modules restants sont des **contrats** exercés par des tests de contrat
(`accessibility_bridge_contract`, `semantic_rename_contract`,
`bank/connector_contract`, `home_surface_i18n`, `flower_menu_layout`,
`molecule.scenarios`, `flower/menu_items`, `runtime/index`,
`molecule/persistence/index`, `auv3_host_playback`, `calendar/node_protocol_clients`,
`tool_button_factory`). Les supprimer supprimerait la spécification ; les câbler est
une décision produit. **Listés ici, pas devinés.**

## P3-6 — Conventions de tests ✅ (partiel)
`todo/problems.md` et `todo/problems_fixes.md` enregistrés dans
`todo/execution_order.md` (la garde `check_execution_order` ne les signale plus).
Le reste du constat (3 régimes d'exécution, 362 probes hors de toute porte
`quality:*`) reste ouvert : y toucher change la définition de « la suite passe ».

---

# Ce que je n'ai PAS fait, et pourquoi

| ID | Sujet | Raison |
|---|---|---|
| **P0-7 / P1-3** | 46 actions WS absentes des backends Rust et Swift | Écrire 46 handlers dans deux langages est du développement de fonctionnalité, pas une correction. Le préalable est un contrat partagé — décision d'architecture. |
| **P1-11** | `startServer()` : 3 760 lignes dans une fonction | C'est le seul changement où je ne peux pas garantir l'absence de régression : extraire un handler WebSocket de cette taille exige de l'exercer avec un vrai client WS sur les 69 actions. La recette existe (`reference_ws_api_exercise_probe`) mais la probe n'est plus dans `temp/`. À faire en tâche dédiée, garde d'abord. |
| **P2-4** | 7 étapes de boot sérielles | Fusionner des vagues change l'ordre d'installation des globales, que plusieurs modules lisent à l'import. Nécessite une mesure de boot réelle en navigateur, pas une lecture. |
| **P2-6** | 250 boucles avec `await` | Toutes ne sont pas parallélisables (écritures ordonnées, transactions). À traiter cas par cas. |
| **P4-1** | 2,23 Gio de pack git | Une réécriture d'historique (`git-lfs migrate` / `filter-repo`) réécrit tous les SHA et impose un re-clone à chaque poste. **Décision de l'utilisateur.** Le geste utile sans réécriture : `.gitattributes` + LFS pour `atome/src/wasm/*.wasm*` à partir de maintenant. |
| **P4-2** | Worktree résiduel de 296 Mo | `.claude/worktrees/relaxed-haibt-6af634` est sur un HEAD détaché et peut contenir du travail non commité. Je ne supprime pas un worktree sans confirmation. |
| **P2-7** | `superman.mp4` (55,4 Mo) vidéo par défaut, modèle ONNX (60,3 Mo) | Contenu produit : le remplacer change ce que voit l'utilisateur. Le repli « vidéo manquante » a été corrigé (55,4 Mo → 87 Ko), le reste est un arbitrage produit. |

---

# Validation

```
node check-syntax.mjs                    → ✅ 2041 fichiers
node temp/esm_link_baseline_probe.mjs    → 1328 modules liés, 0 import cassé
node temp/server_modules_link_probe.mjs  → 83/83 modules server/ + database/
node temp/reachability_report.mjs        → 0 ligne de code sans référent
node temp/named_exports_probe.mjs        → 1255 modules, 0 liaison nommée cassée
node temp/run_fix_probes.mjs             → 23/23 probes vertes
```

> `node --check` et la résolution de chemin ne voient **pas** un export nommé
> manquant. `temp/named_exports_probe.mjs` lie réellement les modules et vérifie
> chaque binding importé : c'est ce qui atteste qu'aucun renommage n'est resté à
> moitié propagé. Il a été écrit après avoir constaté que le renommage de
> `isTauriRuntime` en `isLocalNativeBackendRuntime` s'était propagé à des fichiers
> que je n'avais pas édités directement.

> ⚠️ **Le sous-module `eVe` portait déjà des modifications non commitées au début de
> cette session** (travail d'une session antérieure). Les vérifications ci-dessus
> portent sur **l'ensemble du graphe**, pas seulement sur mes propres éditions.

Gardes statiques du projet, toutes vertes :
`check_no_fallbacks`, `check_molecule_guardrails`, `check_component_reuse_guardrails`,
`check_canonical_dom_attributes`, `check_websocket_only_transport`,
`check_browser_shared_contract_imports`, `check_eve_ai_guardrails`,
`check_dom_projection_guardrails`, `check_mutation_ownership_guardrails`,
`check_squirrel_dom_adapter_guardrails`, `check_tauri_fs_boundary`,
`check_empty_catch_budget` (437/437), **`check_map_paths`** (nouvelle, 127/127),
**`check_property_aliases`** (nouvelle, 148/148).

`check_execution_order` reste en échec pour 39 violations **préexistantes**
(fichiers todo non enregistrés, chemins référencés absents) sans rapport avec ces
correctifs ; mes deux documents y sont désormais enregistrés.

**Rien n'a été commité ni poussé.**
