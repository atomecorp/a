# iOS — assistant inaccessible et clé IA non collable (10 sept. 2026)

## Symptômes rapportés
Sur iOS uniquement (web et Tauri bureau OK) : impossible de coller la clé dans
le champ, pas de focus apparent, le champ ne retient rien, et le statut affiche
« Statut de la clé indisponible — connexion à vérifier ». L'assistant s'ouvre
mais reste inutilisable.

## Cause racine (chaîne complète)
La clé OpenAI ne vit **que** côté serveur : `credential.store/status` et
`responses` passent par le relais WS de l'hôte, qui s'authentifie avec le
principal distant. Or sur iOS ce principal ne pouvait jamais s'établir.

1. **Base « cloud » loopback.** `getCloudServerUrl()` testait `isTauri()` — vrai
   pour `atome:` — **avant** sa branche `isEmbeddedIosRuntime()`, désormais
   morte. iOS résolvait donc `http://127.0.0.1:3001` : un port du téléphone, où
   aucun Fastify ne peut tourner. *Rouge mesuré, `temp/ios_cloud_base_probe.mjs`.*
2. **Gardes anti-loopback scopées bureau.** `isInvalidFastifyLoopbackBase` et
   `isDisallowedFastifyLoopbackPort` sortaient sur `!isDesktopTauriRuntime()`.
   Le téléphone acceptait donc `http://localhost:3001` — le serveur « Local
   test » que le panneau Home propose **par défaut** (`sync_environment.js`).
3. **Aucune reprise sur la voie native.** `provider_broker` n'appelait
   `ensureFastifyToken()` (seul chemin vers `configureTauriRemoteSync()`) que
   sur la voie Fastify. Un jeton distant expiré, ou un relancement sans login,
   laissait le relais sans credential jusqu'au prochain login manuel.
4. **Collage impossible.** Aucun champ de panneau BevyUI n'avait de route depuis
   le presse-papiers : pas de `navigator.clipboard` sous `atome:`, et
   `-webkit-touch-callout: none` supprime la bulle « Coller » d'iOS.
5. **Messages muets.** `provider_principal_unavailable`, `no_active_ai_provider`,
   `ai_active_provider_key_missing`… tombaient tous sur le générique
   « La demande n'a pas pu aboutir ».

## Corrections
| Fichier | Correction |
| --- | --- |
| `atome/src/squirrel/apis/serverUrls.js` | branche iOS avant la branche native générique dans `getCloudServerUrl()` |
| `atome/src/squirrel/apis/loadServerConfig.js` | `isInvalidFastifyLoopbackBase` rejette toute adresse loopback sur iOS (et purge l'override empoisonné) ; `resolveTauriProdFastifyHttpBase` valide chaque candidat |
| `atome/src/squirrel/ai/provider_broker.js` | reprise du lien natif + un seul rejeu, limité aux échecs *avant* transmission ; `provider_connection_closed` n'est rejoué que pour les actions idempotentes ; `error.link_reason` porte la vraie cause |
| `eVe/…/bevy_panel_text_editing.js` | action `paste` : focus synchrone dans le geste, puis `readSystemClipboardText()`, écriture par `setRangeText` + `session.sync()` |
| `eVe/…/bevy_panel_home_view.js` | `fieldNode({ paste: true })` + icône `paste.svg` sur les champs de clé IA ; ligne de détail sous le statut |
| `eVe/…/bevy_panel_home_runtime.js` | notice sur collage refusé ; notice sur serveur refusé |
| `eVe/…/bevy_panel_home_vault.js` | `link_reason` joint à `provider.error` |
| `eVe/i18n/languages_{fr,en}_{account,interaction}.js` | 8 messages d'assistant actionnables + 3 messages de serveur + 2 de collage |

## Sondes (toutes vertes, rouge d'abord vérifié)
`temp/ios_cloud_base_probe.mjs` · `ios_provider_link_probe.mjs` ·
`ios_provider_link_negative_probe.mjs` · `provider_retry_idempotence_probe.mjs` ·
`panel_field_paste_probe.mjs` (jsdom + vraie branche iOS du pont presse-papiers) ·
`home_panel_ai_key_view_probe.mjs` · `assistant_error_message_probe.mjs` ·
`touched_modules_link_probe.mjs` · `home_ai_key_paste_ui_probe.mjs`
(Playwright bout-en-bout : panneau Home réel, hit-test réel, clic réel, champ
rempli depuis le presse-papiers).

## Reste à faire
- **Non vérifié sur appareil.** Tout est mesuré sur la voie web et sur les vraies
  unités de code ; il faut un build iOS pour confirmer sur le téléphone.
- Le champ de l'assistant dans le ruban (`createRibbonInlineSearchRuntime`) n'a
  pas encore l'affordance de collage — il reste non collable sur iOS.
- Si le téléphone n'a jamais eu de compte distant, l'IA reste indisponible **par
  conception** (la clé est côté serveur) : le statut affiche maintenant pourquoi
  (`missing_login_cache`, `cache_login_failed`, `sync_remote_url_missing`…).

---

# 11 sept. 2026 — LA cause de l'asymétrie iOS, mesurée

Les corrections de la veille étaient toutes côté client. Aucune ne pouvait
marcher, parce que la cause est **côté serveur**.

## Preuve

Même trame, même socket, deux serveurs (`temp/remote_ws_contract_probe.mjs`) :

| trame envoyée | `wss://atome.one/ws/api` | `ws://127.0.0.1:3001/ws/api` |
| --- | --- | --- |
| `ping` | `pong` | `pong` |
| `auth` / `me` | `No token provided` | `No token provided` |
| `atome` / `list` | `remote_account_not_provisioned` | `remote_account_not_provisioned` |
| **`ai-provider` / `credential.status`** | **aucune réponse** | `not_authenticated` |

Le socket de production est parfaitement vivant — il répond à tout le reste sur
la même connexion. Il **ignore silencieusement** les trames `ai-provider`.

- atome.one : `version 1.5.0.19`, `eveVersion 0.OO5`
- dépôt / serveur local : `version 1.6.0.1`, `eveVersion 0.OO7`
- `server/wsAiProviderOperations.js` est arrivé dans `b507cdf6` « full AI
  implementation », **daté du 10 sept. 2026**, et il est bien sur `origin/main`.

## Pourquoi iOS et seulement iOS

La clé OpenAI vit côté serveur : tout passe par le relais de l'hôte.

- **Web** : la page parle au serveur de dev (code à jour) → marche.
- **Tauri bureau** : le relais Rust joint le Fastify **local** `127.0.0.1:3001`
  (code à jour, même machine) → marche.
- **iOS** : le relais Swift joint `https://atome.one` — le seul hôte dont le
  « cloud » est réellement distant. Le serveur n'a pas la route → silence →
  timeout → « Statut de la clé indisponible ».

## Correction réelle

**Mettre à jour atome.one** (`update_server.sh` tire `origin/main` et redémarre).
Le code y est déjà ; seul le déploiement est en retard. Action sur la machine de
production : non exécutée sans accord explicite.

## Corrections client apportées quand même

- `provider_broker` : timeouts **par action** (`credential.status` 15 s,
  `credential.store` 25 s, le reste 180 s). Avant, une simple lecture de statut
  attendait **trois minutes** de silence — c'est ce qui faisait paraître le
  panneau figé.
- Le silence du transport (`{error:'Request timeout', status:0}`) devient
  `provider_route_unanswered` et non un refus du fournisseur, avec un message
  qui nomme la vraie cause : « la liaison est bonne, la route manque au serveur
  distant ».

## Copier/coller : le bouton est retiré, le geste le remplace

Sur demande de l'utilisateur (« pas très atome friendly ») : plus d'icône en
face des clés. **Un appui long dans n'importe quelle inputbox ouvre le menu
Flower avec Copier et Coller.**

- `flower/context_selection.js` : type de contexte `text_field`.
- `flower_tool_capability_matrix.js` : `FLOWER_TEXT_FIELD_TOOL_KEYS = ['copy','paste']`.
- `flower_context_items_runtime.js` : branche `text_field` placée **avant** tout
  raisonnement sur les atomes (un champ n'en a pas) ; Copier grisé si le champ
  est vide.
- `bevy_panel_text_editing.js` : `longPress` ouvre le Flower avec `onCopy` /
  `onPaste` — le seam `context.onCopy/onPaste` existait déjà pour les tuiles du
  Dashboard, rien de neuf n'a été inventé. Plus `onActionError`, car une action
  Flower n'a pas de ligne de notice à elle.
- `textInputNode` accepte `onLongPress` ; câblé dans les 7 panneaux (home,
  contact, calendar, info, comm, tags, conditions) + le champ ville du Dashboard.
- **Laissés tels quels** : le pied de vue projet, le renommage de molécule et
  l'étiquette du Dashboard, où l'appui long signifie déjà « renommer ».

Sondes : `temp/field_flower_clipboard_probe.mjs` (chaîne réelle complète :
résolveur d'items réel, invocateur réel, éditeur caché réel, branche iOS réelle
du presse-papiers), `temp/provider_route_silence_probe.mjs`,
`temp/remote_ws_contract_probe.mjs`, + les 8 de la veille. Toutes vertes.

## Confirmation sur la vraie voie iOS (app installée, simulateur)

Build simulateur → `xcrun simctl install/launch` → serveur Swift local de l'app
sur `127.0.0.1:57775`, exercé par un vrai client WebSocket
(`temp/ios_lane_credential_status_probe.mjs`,
`temp/ios_lane_relay_to_prod_probe.mjs`). Aucun tap, aucune UI.

| étape | résultat |
| --- | --- |
| `auth/register` + `auth/me` (Swift local) | OK |
| `ai-provider/credential.status`, **relais non configuré** | `provider_principal_unavailable` en **2 ms** — donc ce n'est PAS un timeout |
| `sync/configure-remote` vers `https://atome.one` | `configured: true` |
| `ai-provider/credential.status`, **relais configuré** | **aucune réponse, 25 s** (3 runs sur 3) |
| `atome/list` sur la MÊME liaison configurée | OK en 6 ms |

Le log réseau natif montre la liaison TLS vers `atome.one:443` établie
normalement (DNS, handshake TLS 1.3) : la trame part, et rien ne revient.
C'est exactement la mesure faite depuis node contre le serveur de production.
**La cause est confirmée de bout en bout sur le vrai chemin de code iOS.**

Note : au tout premier envoi après le lancement de l'app, une fois, la réponse a
été `provider_connection_failed` (457 ms) — liaison TLS à froid. Les trois runs
suivants donnent le silence. Ma correction JS retente déjà une fois sur
`provider_connection_failed`, ce qui couvre ce cas ; pas de modification Swift.

## 11 sept. 2026 (suite) — pourquoi « rien n'a changé » sur le téléphone

Deux faits, mesurés, qui expliquent l'écran signalé :

1. **Le JS de l'app iOS est empaqueté au build** (`package_ios_runtime.mjs`,
   phase Xcode « Package Atome Runtime », sortie dans `atome_runtime/chunks`).
   Aucune correction JS n'atteint le téléphone sans reconstruction +
   réinstallation. Le build simulateur de la veille n'a jamais été posé sur
   l'iPhone : le Flower sur appui long ne pouvait donc pas s'y trouver.
2. **Le cycle clé → statut est sain** sur un serveur qui a la route
   (`temp/ai_credential_status_ws_probe.mjs`, serveur local, compte réel) :
   `configured:false` → `credential.store` → **`configured:true`** →
   `credential.remove` → `false`. Aucun second défaut serveur : il ne reste que
   le déploiement d'atome.one.

## Un chemin qui marche SANS déployer la production

Le Mac sert déjà la bonne version sur le réseau local :
`http://192.168.1.18:3001` → `version 1.6.0.1`, et il **répond** à
`ai-provider`. Deux verrous empêchaient le téléphone de s'en servir, tous deux
levés :

- **App Transport Security absent des Info.plist.** Le serveur local de l'app
  est en loopback, qu'ATS a toujours exempté — donc personne n'avait eu besoin
  d'une entrée ATS. Mais `http://192.168.x.x:3001` est un chargement non
  chiffré **non-loopback** : ATS le refuse net, sans erreur visible côté web.
  Ajouté `NSAllowsLocalNetworking` (app + AUv3) : autorise le réseau local,
  laisse ATS intact pour tout hôte public. Ce n'est **pas**
  `NSAllowsArbitraryLoads`.
- **`normalizeBase` mettait `https://` devant une adresse LAN.** Taper
  `192.168.1.18:3001` donnait `https://…`, qui ne peut que échouer contre un
  Fastify de dev. Les plages privées et `.local/.lan/.home` prennent désormais
  `http`. Sonde : `temp/sync_environment_lan_base_probe.mjs`.

Vérifié que la garde anti-loopback iOS n'est pas trop large : une adresse LAN
est **acceptée** et devient la base cloud, le loopback reste refusé
(`temp/ios_cloud_base_probe.mjs`).

## L'appui long → Flower, vérifié dans le vrai moteur

`temp/home_field_flower_longpress_ui_probe.mjs` (Playwright, aucun handler
appelé à la main) : panneau Home réel → hit-test réel du champ clé →
`pointerdown`, 900 ms immobile, `pointerup` → l'arbre `eve_bevy_ui_flower` est
monté avec exactement deux pétales, `eve_bevy_ui_flower_item_copy_0` et
`eve_bevy_ui_flower_item_paste_1` → hit-test du pétale Coller → clic réel →
**champ rempli depuis le presse-papiers, champ focalisé**. PASS.

## Reste bloqué sur toi

Aucun accès à atome.one depuis cette machine : pas d'entrée SSH pour ce domaine,
et `deploy/atome-one-sync` est marqué « prepared, not executed » (c'est un autre
design, pas la prod en cours). Le déploiement ne peut pas venir de moi.

## Installé sur l'iPhone 17 Pro (11 sept. 2026, 08:48)

`xcodebuild -destination id=06AE42D0-…` → **BUILD SUCCEEDED**, puis
`xcrun devicectl device install app` → `one.atome.app` posée, puis
`process launch` → lancée. Vérifié dans le bundle **installé** :

- `Info.plist` → `NSAppTransportSecurity = { NSAllowsLocalNetworking = true }` ;
- `atome_runtime/chunks` contient `provider_route_unanswered` et `text_field`
  (donc le Flower sur appui long et les nouveaux timeouts sont bien à bord).

### Adresse à mettre dans le téléphone

Le Mac est passé sur le **partage de connexion de l'iPhone** : son IP est
`172.20.10.10` (passerelle `172.20.10.1` = le téléphone, ping 5 ms, 0 % de
perte). `http://172.20.10.10:3001` sert `1.6.0.1` et **répond** à `ai-provider`.

Home → Préférences → Serveur → Custom → `http://172.20.10.10:3001`

Deux limites à connaître : cette adresse change dès que le Mac rejoint un autre
réseau, et le serveur de dev doit tourner. C'est un contournement, pas la
solution — la solution reste le déploiement d'atome.one.

**Note d'exploitation** : le serveur de dev est tombé deux fois pendant la
session, dont une fois pendant les sondes Playwright. Cf.
[[reference_ui_visual_tests_playwright]] « une sonde à la fois ».

---

# 11 sept. 2026 (3) — trois causes trouvées et corrigées

## 1a. Coller par l'outil du ruban ne pouvait pas marcher

Presser un outil du ruban est une pression sur un autre nœud BevyUI, et le
runtime pointeur émet `blur` sur le nœud précédemment focalisé **avant** que
l'outil ne s'exécute. Pour un champ de panneau ce blur termine la session
d'édition et **démonte l'éditeur caché** : quand `insertTextIntoActiveSurface`
cherche une surface active, il n'y en a plus, et le collage retombait sur
« créer un atome » alors que l'utilisateur regardait un caret.

Correction : le champ laisse une **cible de réinsertion** (`editable_surface.js`,
propriétaire unique de « où va le texte ») que le collage utilise quand il n'y a
plus de surface vivante ; elle est libérée au blur (fenêtre de 20 s — sur iOS la
lecture du presse-papiers peut attendre derrière l'alerte « Autoriser le
collage ? ») et **oubliée** quand la session s'arrête, pour qu'un panneau fermé
ne capture pas un collage ultérieur.
Rouge mesuré : `afterBlurOk:false`, brouillon inchangé. Vert : le texte arrive.
Sonde `temp/ribbon_paste_into_field_probe.mjs`.

## 1b. L'appui long : 8 px de tolérance, c'est une souris, pas un doigt

`holdMoveTolerancePx = 8` dans le runtime pointeur BevyUI. Une souris tient le
pixel ; un doigt sur du verre dérive en continu. **Mesuré** avec un vrai
`Input.dispatchTouchEvent` : 6 px de tremblement → le Flower s'ouvre ; **14 px →
il ne s'ouvre plus**, et le geste devient un défilement du panneau (d'où « le
champ perd le focus »).

Correction : la tolérance suit le **type de pointeur** —
`{ mouse: 8, pen: 10, touch: 18 }` — le critère (l'immobilité) est inchangé,
seules les unités que l'appareil délivre réellement diffèrent. Vérifié à 6, 14 et
17 px, et aussi sur un champ **déjà focalisé** (le cas décrit) : le Flower
s'ouvre sans voler le focus, puis Coller remplit le champ.
Sonde `temp/home_field_flower_touch_longpress_probe.mjs` (`PROBE_JITTER_PX`,
`PROBE_FOCUS_FIRST`).

## 2. Les palettes du ruban se referment au défilement

`createBevyMainMenuScrollRuntime` reçoit un `onScroll`, émis **une seule fois par
geste** sur un glisser horizontal et sur la molette — jamais sur l'animation de
snap (conséquence, pas geste) ni quand il n'y a rien à défiler. Branché sur la
même fermeture que `dismissPalettes()`.
Sonde `temp/main_menu_scroll_closes_palette_probe.mjs`.

## 3. L'échange de fichiers ne suivait PAS le réglage de serveur

`asset_box_auth.js` faisait `const apiBases = resolveApiBases()` **au chargement
du module**. Le serveur choisi dans Home → Préférences → Serveur écrit
`__SQUIRREL_FASTIFY_URL__`, mais la base des uploads/downloads restait celle du
boot pour toute la session : changer de serveur n'avait aucun effet sur les
fichiers. Rouge mesuré : `afterSwitch` reste `https://atome.one`.

Correction : résolution à **chaque appel** (elle ne lit que deux globales), et la
base « qui a réussi » est oubliée quand l'utilisateur change de serveur, sinon
l'ancienne garde la priorité. Sondes
`temp/upload_base_follows_server_setting_probe.mjs` et
`temp/upload_base_frozen_baseline_probe.mjs`.

### Trouvé au passage, NON modifié — à décider

Sur un runtime natif (iOS, `atome:`), `resolveApiBases()` renvoie
**uniquement** la base locale `http://127.0.0.1:<port>` et jamais le cloud
configuré : les fichiers ne passent donc jamais par atome depuis le téléphone,
ils restent sur l'appareil (la réplication est censée s'en charger). C'est
peut-être voulu (hors-ligne d'abord). Rerouter tout le média iOS vers le cloud
est un changement de comportement majeur : pas touché sans décision explicite.

---

# 11 sept. 2026 (4) — régression de perf pendant un enregistrement

## Ce que j'ai MESURÉ

**1. Le chemin que l'audio partage avec l'UI n'est pas la cause.**
Pendant un enregistrement audio, `scheduleScopeRender` déclenche un render
complet du ruban à ~30 Hz (throttle de 34 ms — code antérieur à la fenêtre de
régression). A/B du coût de ce render, HEAD contre `b6dfa0ec` (09-08, dernier
état fluide), entrées identiques, 13 puis 18 items :
`0,021 ms → 0,032 ms` (×1,5) et `0,019 ms → 0,034 ms` (×1,8). Soit **1 ms par
seconde** à 30 Hz. Négligeable — ce n'est pas là.
Sonde `temp/ribbon_render_cost_ab_probe.mjs` (arbre 09-08 extrait par
`git archive` dans le scratchpad, liens vers `atome/`+`node_modules`).

**2. La capture audio elle-même est propre.** `mergeFloat32Chunks` n'est appelé
qu'à l'arrêt, pas par chunk : aucun coût quadratique pendant l'enregistrement.
Le travail par chunk (`createAudioScopeFrame`) est borné.

**3. LA régression catastrophique de la fenêtre est sur la voie VIDÉO.**
`a839a2e7` (10 sept. 11:04) a fait passer la lecture CPU du preview de
**96 px à 1280 px** de côté long, et l'a branchée sur **deux** consommateurs
(le ruban + le nouveau panneau de preview). Le `getImageData` est une lecture
GPU→CPU sur le thread principal et son coût est l'AIRE. Mesuré sur cette
machine :

| côté long | par trame | octets/trame | thread principal à 30 fps |
| --- | --- | --- | --- |
| 96 px | 0,56 ms | 36 Ko | 17 ms/s |
| 1280 px | 5,6–6,2 ms | 6,6 Mo | **169–186 ms/s** |

Dix fois le budget de thread principal pour un moniteur live, plus 196 Mo/s
d'upload de texture. C'est indépendant de la plateforme, donc cohérent avec
« Tauri, Chrome et Safari ».

Correction : la lecture est dimensionnée pour ce que les consommateurs affichent
réellement — `PREVIEW_READBACK_MAX_PX = 320` (le panneau la remonte à l'échelle,
l'icône du ruban fait ~30 px), et la garde de `pushToolVideoFrame`
(`MAX_VISUAL_FRAME_PX`) est alignée dessus : une garde plus large que le besoin
du producteur ne fait que laisser passer une trame coûteuse sans le dire.
Mesuré après : **185,7 → 30,7 ms/s** et 6,6 Mo → 410 Ko par trame.

## Ce que je n'ai PAS reproduit

La lenteur sur un enregistrement **audio seul**. Le périphérique audio factice de
Chromium headless ne produit aucune trame de scope, donc le retour visuel ne
s'arme jamais : profil CPU à 99 % idle, `recordingNodes: []`, alors que
`isRecording: true`. La mesure n'était donc pas représentative et je ne m'en sers
pas comme preuve. Sonde `temp/audio_recording_cpu_profile_probe.mjs` (utilisable
avec un vrai micro, en fenêtre : `ATOME_PLAYWRIGHT_HEADLESS=0`).

## LA cause du cas audio, mesurée dans l'app réelle

Un refresh complet du ruban coûte **3,8 ms de médiane** (jusqu'à 5 ms) —
mesuré par `temp/ribbon_refresh_cost_probe.mjs`, 14 refresh réels dans un
workspace réel. Et `scheduleScopeRender` en demandait **un par trame de scope,
~30 fois par seconde** : soit **114 ms de thread principal par seconde**, en
permanence, pendant toute la durée d'un enregistrement, uniquement pour animer
un vumètre de la taille d'une icône.

Ce n'est pas un surcoût apparu dans la fenêtre : c'est un coût **structurel**
que le reste des changements (×1,5 sur le modèle, la vidéo à 1280 px, le panneau
de preview supplémentaire) a fait basculer du « supportable » au « ça saccade ».

Correction : seules les **64 barres** changent, et elles portent des
identifiants stables. Une trame émet donc 64 patchs de style via
`updateTreeMotion` — le même chemin que le caret des champs de texte — au lieu
de reconstruire et re-uploader l'arbre entier. La première trame d'une session
garde une vraie construction (les barres n'existent pas encore, et c'est elle
qui enregistre les bornes que le patch réutilise) ; tout imprévu retombe sur la
reconstruction.

La géométrie a **un seul propriétaire** (`audioScopeBarGeometry`), utilisé par
la construction ET par le patch : deux copies de cette arithmétique auraient
dérivé, et un scope qui dérive saute à la première reconstruction du ruban.

Mesuré : 1 construction puis **0 reconstruction** sur 19 trames suivantes,
64 mises à jour par trame, **0 écart de géométrie** entre build et patch.
Sonde `temp/audio_scope_patches_instead_of_rebuild_probe.mjs`.
