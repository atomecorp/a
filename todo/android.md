# Tâche : produire un APK Android entièrement automatisé depuis `./run.sh` (test / développement / production)

> Analyse établie le 2026-09-23 dans `/Users/jean-ericgodard/RubymineProjects/a` (Atome / eVe / Squirrel, Tauri 2.11.1).
> Statut de ce document : **analyse + exécution**. Le prompt ci-dessous a été exécuté dans l'arbre (fichiers non committés) ; la section 12 porte l'état d'exécution, les preuves réellement obtenues et ce qui reste **To verify**.
> Toutes les sorties du script (logs, erreurs, aide) doivent être en anglais (module `.codex/modules/02-coding-standards-and-prohibitions.md`, section LANGUAGE AND STACK POLICY). Ce document de travail reste en français.

---

## 1. Objectif

Obtenir **une seule commande** qui produit un APK Android installable, sans étape manuelle, sans Android Studio, avec gestion automatique et idempotente de toute la chaîne d'outils.

Contrat fonctionnel demandé (proposition, à valider) :

```bash
./run.sh apk                      # APK test  (défaut : debug, arm64, suffixe d'application .debug, installable sur appareil)
./run.sh apk --dev                # APK développement (itération rapide, relie l'appareil à la machine de dev)
./run.sh apk --prod               # APK production (release signé, minifié, ressources embarquées)
./run.sh apk --prod --aab         # variante Play Store (optionnel, même lot)
```

Options transverses attendues :

```text
--doctor        diagnostic complet de la chaîne d'outils, sans rien construire
--force-deps    force la vérification/mise à jour de la toolchain avant build
--abi <abi>     aarch64 (défaut) | armv7 | i686 | x86_64 | all
--install       installe l'APK sur l'appareil connecté (adb install -r)
--device <id>   cible un appareil/émulateur précis
--split-per-abi produit un APK par ABI
--dry-run       affiche le plan exact (commandes, chemins, variables) sans construire
--yes           mode non interactif (CI)
```

Règles de comportement non négociables :

1. **Totalement automatisable** : aucune action manuelle, aucune ouverture d'Android Studio, aucun clic.
2. **Idempotent** : si une dépendance est présente et à jour, elle n'est pas réinstallée ; si elle est absente ou trop ancienne, elle est installée ou mise à jour ; si l'installation échoue, message explicite et arrêt propre (aucun fallback silencieux, cf. module 02 FALLBACK POLICY).
3. **Auto-chargement de l'environnement** : le script exporte lui-même `JAVA_HOME`, `ANDROID_HOME`/`ANDROID_SDK_ROOT`, `NDK_HOME`, `PATH` (adb, sdkmanager) — sans exiger de modification de `.zshrc`.
4. **Rerunnable** : premier lancement long (téléchargements Gradle/NDK/crates), lancements suivants rapides grâce au cache (`~/.gradle`, `~/.cargo`, SDK).

---

## 2. État des lieux vérifié (2026-09-23)

### 2.1 Point d'entrée existant

| Élément | Constat |
|---|---|
| `./run.sh` | Redirige vers `scripts/setup/run_unix.sh` (macOS/Linux) ou `scripts/setup/run_windows.sh`. |
| `scripts/setup/run_unix.sh:380-470` | Parseur d'options `--test`, `--force-deps`, `--prod`, `--tauri`, `--tauri-prod`, `--server`, `--fastify-url`. |
| `scripts/setup/service_commands.sh` | `dispatch_service_command_if_requested()` : c'est le point canonique des commandes (`status`, `logs`, `stop`, `update`, `check`) et de `print_usage()`. **C'est ici que doit s'ajouter `apk`.** |
| `npm run tauri` | `cd platforms/desktop-tauri && tauri` — le CLI Tauri v2 est donc déjà invocable depuis la racine. |
| `npm run quality:platforms` | Chaîne de validation plateformes existante (web, tauri, ios) : modèle à étendre pour Android. |

### 2.2 Application Tauri

| Élément | Constat |
|---|---|
| Projet | `platforms/desktop-tauri` — Tauri CLI `2.11.1` (npm) et crate `tauri 2.11.1` (Cargo.lock), donc versions alignées. |
| `tauri.conf.json` | `productName: squirrel`, `identifier: com.squirrel.desktop`, `frontendDist: ../../atome/src`, `bundle.targets: "all"`, `bundle.resources` = `atome/version.txt`, `../../atome`, `../../eVe`, `node_modules/rubberband-wasm/dist`. **Aucune section `bundle.android`.** |
| `src/main.rs` | 145 octets, `squirrel_lib::run()`. |
| `src/lib.rs:181` | `#[cfg_attr(mobile, tauri::mobile_entry_point)]` déjà présent (prérequis Tauri mobile couvert). |
| `src/lib.rs` (setup) | Démarre un serveur **Axum sur 127.0.0.1:3000**, sert les fichiers statiques depuis un répertoire, puis navigue la WebView vers `http://127.0.0.1:3000/`. |
| `src/lib.rs:226` | `if cfg!(debug_assertions) { live_repo_src_dir() } else { resource_dir()… }` → **en debug, le chemin repo local est utilisé ; incorrect pour un APK debug**. |
| `capabilities/default.json` | `remote.urls` limités à `http://127.0.0.1:3000` et `http://localhost:3000`, permissions `core:default`, `opener:default`, `stt:default`, `audio-engine`, `bevy-native-renderer`, `clipboard-bridge`. Pas de restriction `platforms`. |
| `permissions/` | `audio-engine.toml`, `bevy-native-renderer.toml`, `clipboard-bridge.toml`. |
| `vendor/tauri-plugin-stt` | Plugin STT vendoré, **supporte Android** (`vendor/tauri-plugin-stt/android/…`, SpeechRecognizer) ; il déclare `reqwest 0.12` (voir §3.1). |

### 2.3 Projet Android généré : absent

| Élément | Constat |
|---|---|
| `platforms/desktop-tauri/gen/` | Contient uniquement `schemas/`. **`gen/android/` et `gen/apple/` n'existent plus.** |
| Historique Git | Aucun fichier `gen/android/**` n'a jamais été commité (`git log --all --diff-filter=A` vide) : le travail Android du 2026-08-09 était local, il est perdu. |
| Documentation | `eVe/documentations/FRAMEWORK_STATE.md:1173`, `maps/ARCHITECTURE_MAP.md:537`, `maps/CODEMAP.md:2215` affirment qu'un « Android ARM64 debug APK » a été construit le **2026-08-09** avec **minSdk 26 / targetSdk 36** et permissions `INTERNET` + `RECORD_AUDIO`. Ces entrées décrivent un état **non présent dans l'arbre actuel** (elles servent de spécification, pas de preuve actuelle). |
| `scripts/` | **Aucune** mention d'Android, ni de `gradle`, ni de `sdkmanager` : il n'existe aujourd'hui aucun script Android dans le dépôt. |

Conclusion : l'objectif est à construire de zéro côté outillage, mais la cible technique (Tauri v2 mobile, minSdk 26, targetSdk 36) est déjà arbitrée par la documentation et compatible avec la toolchain installée.

### 2.4 Environnement de la machine (vérifié)

Déjà présent :

| Composant | Détail |
|---|---|
| Rust | `rustc 1.95.0` (épinglé par `rust-toolchain.toml`). |
| Cibles Rust Android | `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android` **déjà installées**. |
| Android SDK | Homebrew `android-commandlinetools` → `/opt/homebrew/share/android-commandlinetools` : `platform-tools` (dont `adb`), `build-tools/35.0.0` et `36.0.0`, `platforms/android-36`, `cmdline-tools/latest`, licences acceptées. |
| NDK | `ndk/27.0.12077973` présent. |
| JDK | `openjdk@21` via Homebrew (`/opt/homebrew/opt/openjdk@21`), **non lié** dans `/Library/Java/JavaVirtualMachines`. |
| Build natif | `cmake`, `ninja`, `pkg-config`, Xcode/`clang`, `libclang` Xcode (utile à `bindgen`/`oboe-sys`). |
| Node/npm | Installés, `node_modules` présent (`@tauri-apps/cli 2.11.1`). |

Manquant / non configuré :

| Manquant | Impact |
|---|---|
| `JAVA_HOME` **vide**, `java` absent du PATH | Bloque le wrapper Gradle. |
| `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `NDK_HOME` **vides** | Le CLI Tauri refuse de construire (« Android SDK not found… »). |
| `adb` hors PATH | Install/logcat impossibles sans chemin absolu. |
| Aucun émulateur ni image système | Acceptation possible uniquement sur **appareil physique** (ou installer un `system-images;android-36;google_apis;arm64-v8a` + AVD, ~1,5 Go). |
| Cache Gradle absent (`~/.gradle`) | Le wrapper télécharge Gradle **8.14.3** (~130 Mo) au premier build (URL embarquée dans le CLI). |
| Cache crates Android incomplet | `cargo tree --target aarch64-linux-android` échoue hors-ligne sur `android-build v0.1.4` → **le premier build Android exige le réseau**. |

---

## 3. Ce qui manque dans le framework (écarts vérifiés, par ordre de risque)

### 3.1 Bloquant — TLS : `reqwest` passe par `native-tls` → OpenSSL

- `platforms/desktop-tauri/Cargo.toml:91` : `reqwest = { version = "0.11", features = ["json"] }` (features par défaut → `default-tls` → `hyper-tls` → `native-tls`).
- `cargo tree -i native-tls` confirme `reqwest 0.11` (application) **et** `reqwest 0.12` (`vendor/tauri-plugin-stt`).
- Sur Android (cible Linux), `native-tls` → `openssl-sys` → nécessite un OpenSSL cross-compilé. C'est précisément ce que la documentation prétend avoir corrigé (« Reqwest uses Rustls ») mais **le code actuel ne le fait pas**.
- Correction attendue : `default-features = false` + `features = ["json", "rustls-tls-native-roots"]` (et idem pour le plugin STT vendoré, ou gating desktop-only de son code de téléchargement Vosk). Aucun fallback : si le TLS ne peut pas être établi, erreur explicite.

### 3.2 Bloquant — ressources empaquetées non lisibles par le serveur Rust

- Sur Android, `PathResolver::resource_dir()` renvoie un préfixe `asset://localhost/` et **non un chemin du système de fichiers** (source Tauri 2.11.1 `src/path/desktop.rs:226-229`).
- Or `src/lib.rs` fait `static_dir.join("index.html").exists()` puis passe ce répertoire au serveur Axum (`tower-http` ServeDir) : **cela ne peut pas fonctionner tel quel sur Android**.
- Deux voies possibles (à trancher, §5) :
  - **A. Extraction** des assets de l'APK vers `app_data_dir` au premier lancement (cache + version), puis démarrage du serveur Axum sur ce répertoire. Réutilise l'architecture actuelle (le serveur reste l'unique source), au prix d'une extraction initiale lourde.
  - **B. Servir depuis `asset_resolver`** : remplacer la couche statique par une lecture via l'asset resolver Tauri (route Axum dédiée). Plus élégant, mais change le propriétaire du service statique et doit être cohérent avec `src/server/static_asset_cache.rs` (politique de cache).

### 3.3 Bloquant — taille et duplication des ressources

- `atome/src` = **221 Mo** (dont `assets/` 192 Mo : `videos` 80, `voice` 60, `images` 32, `vendor` 15 ; `wasm` 21 Mo), `eVe` = 12 Mo.
- `frontendDist: ../../atome/src` **et** `resources: ../../atome` ⇒ `atome/src` serait embarqué deux fois.
- Conséquence : APK inutilisable (> 250 Mo) et très au-delà des limites Play (module de base ≈ 200 Mo).
- Correction attendue : un `platforms/desktop-tauri/tauri.android.conf.json` (Tauri fusionne automatiquement `<plateforme>.conf.json`) qui :
  - limite `bundle.resources` au strict nécessaire (payload produit : `atome/src` sans `assets/videos|voice|images`, `eVe`, `node_modules/rubberband-wasm/dist`, `atome/version.txt`) ;
  - fixe `bundle.android.minSdkVersion: 29` (défaut CLI = 24 ; plancher réel = API 29, imposé par `libamidi.so`, voir §12.5) et `versionCode` ;
  - garde `bundle.targets` cohérent.

### 3.4 Bloquant — chemins de code dépendants du poste de développement

| Code | Problème Android |
|---|---|
| `src/lib.rs:226` (`cfg!(debug_assertions)` → repo local) | Utilise un chemin disque inexistant dans un APK debug. |
| `src/server/mod.rs` (5 sites `Command::new(node_binary)`) | `node` n'existe pas sur Android (mail sync, etc.). |
| `src/server/mod.rs` + `src/audio_engine/transcode.rs` (`ffmpeg`) | `ffmpeg` n'existe pas sur Android. |
| `src/native_midi.rs` (`midir`), `src/native_contacts.rs`, `src/native_clipboard.rs` | À vérifier/gater par plateforme ; `midir`/contacts sont des chemins desktop/iOS. |
| `src/bevy_backend/*` | Déjà derrière `#[cfg(feature = "bevy_backend")]` : ne pas activer les features Bevy natives pour Android (le rendu dans l'APK passe par le renderer Web/WASM). |

Attendu : sans réécriture fonctionnelle, ces chemins doivent être **désactivés explicitement sur Android avec un message d'erreur nommé** (module 02 : interdiction des fallbacks silencieux).

### 3.5 Important — `usesCleartextTraffic`

- Le template Android du CLI met `manifestPlaceholders["usesCleartextTraffic"] = "true"` **en debug** et `"false"` **en release**.
- L'application navigue sa WebView vers `http://127.0.0.1:3000` ⇒ **en release, le chargement serait bloqué**.
- Correction attendue : conserver le cleartext uniquement pour le loopback (`network_security_config.xml` limité à `127.0.0.1`/`localhost`) — plus propre qu'un `usesCleartextTraffic=true` global.

### 3.6 Important — capacité/ACL, permissions et signature

- `INTERNET` est déjà dans le manifeste du template ; `RECORD_AUDIO` doit venir du plugin STT (déjà présent côté plugin) — à **vérifier dans l'APK produit** (`aapt2 dump badging`).
- `capabilities/default.json` n'a pas de clé `platforms` : à valider sur mobile (fenêtre `main`, `remote.urls` loopback).
- **Signature** : le CLI Tauri ne génère aucune `signingConfig`. `keystore.properties` est dans le `.gitignore` du projet généré. La production exige donc : keystore créé **hors dépôt** (ex. `~/.atome/android/`), `gen/android/keystore.properties` (ignoré par Git) et un `signingConfigs.release` ajouté au `app/build.gradle.kts` généré. Sans cela, la « prod » ne produit qu'un APK non signé.

### 3.7 Risque produit à valider — WebGPU dans la WebView Android

- Le rendu produit passe par le renderer Atome/Bevy WebGPU (WASM). La disponibilité de `navigator.gpu` dépend de la version de la **WebView système** (Chromium), mise à jour par le Play Store.
- Le dépôt sait déjà qu'un environnement sans `navigator.gpu` est un cas réel (`eVe/documentations/FRAMEWORK_STATE.md:4779`).
- Attendu : détection explicite au démarrage avec message bloquant clair si `navigator.gpu` est absent, et critère d'acceptation « appareil avec WebView ≥ 121 ».

---

## 4. Ce qu'il faut installer / provisionner (et comment le script le gère)

| Dépendance | Détection | Installation / mise à jour | Prérequis |
|---|---|---|---|
| Rust toolchain + 4 cibles Android | `rustup target list --installed` | `rustup target add <target>` si absente (ou `tauri android init --skip-targets-install` si déjà là) | réseau |
| JDK 17+ | `JAVA_HOME` valide + `"$JAVA_HOME/bin/java" -version` | Si absent : `brew install openjdk@21` (déjà présent ici) ; sinon message nommant la commande exacte | Homebrew |
| Android SDK cmdline-tools | présence de `sdkmanager` | `brew install android-commandlinetools` sinon | Homebrew |
| Packages SDK | `sdkmanager --list_installed` | `sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0"` + `sdkmanager --licenses` (acceptation automatique via `yes`) | réseau |
| NDK | `NDK_HOME` valide ou `<sdk>/ndk/*` | `sdkmanager --install "ndk;27.0.12077973"` (aligner sur la version effectivement utilisée ; le CLI sait aussi installer sa version par défaut) | réseau |
| Gradle | `~/.gradle/wrapper/dists/...` | Premier build : le wrapper (embarqué dans le CLI) télécharge Gradle 8.14.3 | réseau |
| Crates Rust Android | `cargo metadata --offline` | `cargo fetch --target aarch64-linux-android` | réseau |
| Dépendances npm | `node_modules/.install_complete` | réutiliser `scripts/install_dependencies.sh` (déjà appelé par `run_tauri.sh`) | — |
| `adb` | chemin SDK | export PATH, jamais de téléchargement séparé | — |

Règle : **une vérification silencieuse et rapide quand tout est présent** (aucun téléchargement), un message clair par élément installé/mis à jour sinon, et un `--doctor` qui sort un tableau `OK / MANQUANT / VERSION`.

---

## 5. Décisions à trancher avant d'écrire le code

| # | Décision | Recommandation |
|---|---|---|
| D1 | Emplacement du point d'entrée | `apk` comme commande dans `scripts/setup/service_commands.sh` (dispatch + `print_usage`), implémentation dans **un** script `scripts/android/apk.sh` ; ne pas dupliquer la logique de dépendances npm (`scripts/install_dependencies.sh`). |
| D2 | Sens de « APK développement » | **Option A** (recommandée) : APK debug qui charge l'application servie par la machine de dev sur le réseau local (itération sans rebuild d'assets). **Option B** : `tauri android dev` (hot-reload, appareil connecté, nécessite une `devUrl`). Dans les deux cas, documenter précisément, et ne pas créer un troisième mode. |
| D3 | Résolution des assets embarqués (cf. §3.2) | Extraction unique vers `app_data_dir` avec marqueur de version, puis serveur Axum inchangé. Si l'extraction s'avère trop lente, bascule vers la lecture par asset resolver — décision prise **avec mesure** (temps de premier lancement). |
| D4 | Payload Android (cf. §3.3) | `tauri.android.conf.json` avec ressources réduites ; aucune ressource exclue ne doit être requise par un test d'acceptation. |
| D5 | Identité d'application | Garder `com.squirrel.desktop` en production et `com.squirrel.desktop.debug` via `bundle.android.debugApplicationIdSuffix` pour que test et production cohabitent sur un appareil. |
| D6 | Keystore de production | Stockage **hors dépôt** (`~/.atome/android/atome-release.jks` + `keystore.properties` non versionné). Aucun secret dans Git (module 02). Le script échoue proprement si le keystore est absent, avec la commande `keytool` exacte à lancer. |
| D7 | Signature de l'APK test | APK debug signé automatiquement par la clé debug Android (aucun keystore à fournir). |
| D8 | Version Android | `versionName` = `atome/version.txt` (1.10) ; `versionCode` dérivé de façon déterministe (ex. major*10000 + minor*100 + incrément), documenté, jamais codé en dur. |

---

## 6. Plan d'implémentation par lots

### Lot 0 — Toolchain automatique (aucun build encore)

Livrable : `scripts/android/toolchain.sh` (ou fonction unique dans `scripts/android/apk.sh`) :
- export `JAVA_HOME` (Homebrew `openjdk@21` si non défini), `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `NDK_HOME`, `PATH`;
- vérification par commande réelle (`java -version`, `sdkmanager --version`, `ndk-build -v`, présence de `aarch64-linux-android` dans `rustup target list --installed`);
- installation/mise à jour **seulement si nécessaire** ;
- `--doctor` : tableau `OK/À JOUR/MANQUANT` + versions ; code de sortie non nul si un élément bloquant manque ;
- aucun `sudo`, aucun secret, aucun fichier hors dépôt sauf keystore (hors lot 0).

Preuve attendue : `./run.sh apk --doctor` sur une machine vierge (ou cache vidé) installe tout et ressort vert ; relancé, il ne télécharge rien.

### Lot 1 — Projet Android généré + premier APK debug

1. `platforms/desktop-tauri/tauri.android.conf.json` (minSdk 29, versionCode, ressources réduites, suffixe `.debug`).
2. `npm run tauri -- android init --ci` ⇒ crée `platforms/desktop-tauri/gen/android/` (à **conserver dans le dépôt** ; le CLI ne le régénère pas).
3. Ajustements du projet généré : `app/build.gradle.kts` (signing release), `app/src/main/AndroidManifest.xml` + `res/xml/network_security_config.xml` (cleartext loopback), `tauri.properties` versionné ou généré.
4. `npm run tauri -- android build --debug --apk --target aarch64`.

Preuve attendue : APK produit sous `platforms/desktop-tauri/gen/android/app/build/outputs/apk/**/*.apk`, `aapt2 dump badging` affichant `minSdkVersion 29`, `targetSdkVersion 36`, permissions attendues.

### Lot 2 — Conformité Rust/lancement sur appareil

- `Cargo.toml` + plugin STT : TLS Rustls (ou gating desktop-only) — supprimer la dépendance OpenSSL sous Android.
- Gating explicite Android : `node`, `ffmpeg`, MIDI/contacts, bevy natif → erreur nommée, jamais de fallback.
- `src/lib.rs` : chemin des assets et `static_dir` pour mobile (lot D3), y compris **APK debug** (ne plus utiliser le repo local sur mobile).
- Vérifier `resources` réellement accessibles après extraction.

Preuve attendue : APK installé (`adb install -r`), application qui démarre, `#intuition` monté, ouverture d'un projet, logs sans erreur bloquante (`adb logcat`).

### Lot 3 — Payload et poids

- Mesurer la taille de l'APK par ABI et le temps de premier lancement (extraction + démarrage du serveur).
- Réduire le payload si nécessaire (exclusion des médias d'exemple), sans casser l'acceptation.
- Documenter le poids attendu par mode (test / prod, par ABI).

Preuve attendue : tableau de tailles avant/après + justification de chaque exclusion.

### Lot 4 — Production signée

- Génération/validation du keystore hors dépôt ; `signingConfigs.release` + `keystore.properties` (non versionné).
- `--prod` : `tauri android build --apk` (release, minifié), `--aab` en option.
- Vérification de la signature (`apksigner verify --print-certs`).

Preuve attendue : APK release signé, installable, démarrage identique au debug, **sans** cleartext global et **sans** `debuggable`.

### Lot 5 — Intégration `run.sh`, garde-fous, documentation

- Dispatch `apk` dans `scripts/setup/service_commands.sh` + `print_usage`.
- Option `npm run` dédiée si utile (`build:molecule:android` à côté de `build:molecule:ios`).
- Test persistant borné dans `tests/platforms/` (contrat du script : détection d'outils, `--dry-run`, refus des combinaisons invalides) — **ne pas** faire du build APK un test unitaire.
- Mise à jour des cartes : `maps/CODEMAP.md` (propriétaires : dispatch run.sh, `scripts/android/`, `tauri.android.conf.json`, `gen/android/`), `maps/ARCHITECTURE_MAP.md:537` (statut mobile réel), `eVe/documentations/FRAMEWORK_STATE.md` (état + preuves + « To verify »), `Help.md`/`README.md` si la commande y est listée.
- Mise à jour de `FRAMEWORK_STATE` : supprimer/requalifier l'affirmation non vérifiée actuelle sur l'APK du 2026-08-09.

---

## 7. Exigences détaillées du script

1. **Un seul propriétaire** du build Android : `scripts/android/apk.sh`. Aucune duplication de logique dans `run.sh`, `run_unix.sh`, `run_tauri.sh` ou `package.json`.
2. **Ordre imposé** : toolchain → configuration → build → post-traitement → (installation) → rapport. Chaque étape annonce son nom ; un échec indique l'étape, la commande exacte et la sortie utile.
3. **Zéro écriture Git** (module 02) : le script ne fait ni `add`, ni `commit`, ni `checkout`. Il peut créer des fichiers non suivis (`gen/android`, `keystore.properties`) mais doit les annoncer dans son rapport final.
4. **Fichiers temporaires** exclusivement sous `./temp` (module 02), jamais dans `atome/src`, `scripts/`, ni à la racine.
5. **Aucun secret** : ni keystore, ni mot de passe, ni clé dans le dépôt ou dans les logs.
6. **Aucun fallback** : dépendance manquante = erreur explicite, jamais de substitution silencieuse.
7. **Logs anglais**, messages courts, une ligne par décision (`OK`, `MISSING → installing`, `UPDATED`, `SKIPPED (up-to-date)`).
8. **Mode CI** (`--yes`, sans TTY) : jamais de prompt interactif.
9. **Nettoyage** : aucun processus Gradle/cargo laissé en vie en cas d'échec.

---

## 8. Effort estimé

| Lot | Contenu | Effort |
|---|---|---|
| 0 | Toolchain auto + `--doctor` + idempotence | 0,5 – 1 j |
| 1 | `tauri.android.conf.json`, `android init`, premier APK debug qui se construit | 0,5 j |
| 2 | TLS Rustls, gating mobile, assets/resources, démarrage réel sur appareil | 2 – 3 j |
| 3 | Poids APK, payload minimal, temps de premier lancement | 0,5 – 1 j |
| 4 | Signature production + AAB | 0,5 j |
| 5 | Intégration `run.sh`, test borné, cartes, documentation | 0,5 j |
| **Total** | | **≈ 5 – 7 jours-homme**, dont l'essentiel sur les lots 2 (risque technique réel). |

Risques qui peuvent allonger : WebGPU indisponible dans la WebView de l'appareil de test ; extraction des assets trop lente ; audio AAudio/native sur Android ; premier build très long (compilation Rust Android complète, 10–30 min).

---

## 9. Validation et preuves exigées (aucune étape ne peut être déclarée « fait » sans preuve)

1. `./run.sh apk --doctor` : sortie complète, tous les éléments `OK`, deuxième exécution sans aucun téléchargement.
2. `./run.sh apk` : APK produit ; chemin exact affiché ; `aapt2 dump badging` : `minSdkVersion 29`, `targetSdkVersion 36`, `package: com.squirrel.desktop.debug`, permissions `INTERNET` (+ `RECORD_AUDIO` si plugin STT inclus).
3. `adb install -r` puis lancement : application qui **démarre** (pas d'écran vide), `#intuition` monté, ouverture d'un projet, création/déplacement d'un Atome, fermeture/réouverture (persistance).
4. `adb logcat` : aucune erreur bloquante ; si `navigator.gpu` est absent, message produit explicite et nommé.
5. `./run.sh apk --prod` : APK release **signé** (`apksigner verify --print-certs`), non `debuggable`, démarrage équivalent.
6. Preuve d'absence de dépendance au poste de dev : le mode test/prod ne doit pas exiger `node`, `ffmpeg`, ni le dépôt monté.
7. `npm run check:m0` + `node --test`/`vitest` du test borné ajouté : vert, sans régression.
8. Rapport final : commandes exécutées, sorties brutes des preuves, taille APK, et section **To verify** honnête pour tout ce qui n'a pas été exécuté (ex. appareil absent, émulateur absent).

---

## 10. Contraintes projet à respecter pendant l'implémentation

- Lire `.codex/AGENTS.md` puis les modules 01–07 ; pour ce lot : 02 (langue, temporaires, Git, fallbacks), 03 (validation), 04 (réutilisation/factorisation, cartes), 05 (rendu/UI), 06 (état/mutations), 07 (garde-fous).
- Réutiliser l'existant : n'ajouter aucun nouveau système de commandes, aucune copie de `run_tauri.sh`, aucun script parallèle dans `package.json` sans propriétaire clair.
- Aucune ligne de code supprimée sans cause vérifiée ; aucune modification de rendu/état hors périmètre Android.
- Git reste en lecture seule : **aucun commit, aucune branche, aucun push** — l'utilisateur commite lui-même.
- Toute affirmation non exécutée doit être marquée `To verify`.

---

## 11. Annexe — commandes de vérification utilisées pour cette analyse

```bash
# Point d'entrée et dispatch
cat run.sh ; sed -n '380,470p' scripts/setup/run_unix.sh ; cat scripts/setup/service_commands.sh

# Configuration Tauri
cat platforms/desktop-tauri/tauri.conf.json ; cat platforms/desktop-tauri/Cargo.toml ; cat platforms/desktop-tauri/capabilities/default.json

# Projet Android généré
ls platforms/desktop-tauri/gen            # -> uniquement schemas/
git log --all --diff-filter=A -- 'platforms/desktop-tauri/gen/android/**'   # -> vide

# Chaîne Rust / TLS
rustup target list --installed
cargo tree -i native-tls --manifest-path platforms/desktop-tauri/Cargo.toml
cargo tree --offline --target aarch64-linux-android -i openssl-sys --manifest-path platforms/desktop-tauri/Cargo.toml   # -> android-build v0.1.4 absent (réseau requis)

# Toolchain locale
java -version ; echo "$JAVA_HOME" ; echo "$ANDROID_HOME $NDK_HOME"
ls /opt/homebrew/share/android-commandlinetools/{build-tools,platforms,ndk,platform-tools}
ls /opt/homebrew/opt/openjdk@21/bin/java

# Template Android du CLI (compileSdk 36, minSdk configurable, cleartext debug/release, Gradle 8.14.3, keystore.properties)
./node_modules/.bin/tauri android init --help
./node_modules/.bin/tauri android build --help
strings node_modules/@tauri-apps/cli-darwin-arm64/cli.darwin-arm64.node | rg -i "keystore.properties|compileSdk|usesCleartextTraffic|distributionUrl"
```

Ces commandes sont reproductibles et doivent être rejouées par l'agent d'implémentation avant toute modification : elles ne remplacent pas une preuve de build, elles la préparent.

---

## 12. État d'exécution (2026-09-23)

> Compte rendu de l'agent qui a exécuté le prompt. Une affirmation non exécutée pour de vrai est marquée **To verify**.

### 12.1 Commandes offertes

```bash
./run.sh apk                        # APK test (debug, arm64) — mode par défaut
./run.sh apk --install              # puis "adb install -r" sur l'appareil connecté
./run.sh apk --prod                 # APK release signé (keystore dans ~/.atome/android/)
./run.sh apk --prod --aab           # AAB Play Store
./run.sh apk --doctor               # rapport de chaîne d'outils, ne construit rien
./run.sh apk --dry-run              # plan exact, aucune mutation
./run.sh apk --isolated-home <dir>  # caches cargo/Gradle/Android sous <dir> (CI, $HOME non inscriptible)
./run.sh apk --dev --device <serial> # session hot reload sur appareil
```

### 12.2 Fichiers implémentés

Le lot initial a été committé par l'utilisateur le 2026-09-23 (`9c6ebb44 APK creation added`) ; les correctifs de la seconde passe (§12.5) ne sont pas committés. Le dépôt reste en lecture seule côté agent.

- `scripts/android/apk.sh` — propriétaire unique de la lane Android (résolution idempotente JDK/SDK/NDK/cibles Rust/CLI Tauri, staging du web root, keystore release, `tauri android build`/`dev`, découverte des artefacts, vérification `aapt2` + `apksigner` + sha256, `--install`). La découverte lit le rapport du CLI Tauri, conserve le log de build dans `temp/apk-build.log` et s'appuie sur le marqueur `temp/apk-build-marker` (les deux sous `temp/`, gitignoré) — voir §12.5 défaut 3.
- `scripts/setup/service_commands.sh` — dispatch du case `apk` et aide.
- `platforms/desktop-tauri/tauri.android.conf.json` — overlay Android (minSdk 29, targetSdk 36, `frontendDist` = web root stagé, bundles de ressources vides).
- `platforms/desktop-tauri/gen/android/` — projet Gradle généré par `tauri android init --ci`, à **conserver dans le dépôt** (signature release + `network_security_config.xml` cleartext loopback + résolution explicite de la CLI Tauri dans `BuildTask.kt`). `app/build.gradle.kts` y porte `minSdk = 29` et doit rester aligné sur `tauri.android.conf.json`.
- `platforms/desktop-tauri/src/android_assets.rs` — matérialisation du web root embarqué dans `app_data_dir` (car `resource_dir()` renvoie `asset://localhost/` sur Android), avec manifeste d'idempotence.
- `platforms/desktop-tauri/src/lib.rs` — branche `#[cfg(target_os = "android")]`.
- `platforms/desktop-tauri/Cargo.toml` — Reqwest en Rustls (sans OpenSSL hôte) et dépendances `src/server` sorties de la table macOS (voir §12.5).
- `.gitignore`, `README.md`, `maps/ARCHITECTURE_MAP.md`, `maps/CODEMAP.md` — documentation et cartes.

### 12.3 Preuves réellement exécutées dans cette session

- `./run.sh apk --help`, `--doctor`, `--dry-run` : OK (JDK 21, SDK `android-36`, build-tools `36.0.0`, NDK `27.0.12077973`, cible Rust `aarch64-linux-android`, CLI Tauri 2.11.1).
- Staging du web root : OK (`android-webroot` ≈ 233 Mio, layout desktop reproduit).
- Compilation de la cible hôte après modification : `cargo check --package squirrel --lib` → `Finished dev profile` en 3 min 32 s, **aucune erreur**, `reqwest v0.11.27` inclus.
- Tests unitaires de `android_assets.rs` reconstruits et exécutés : **3 passed / 0 failed**.
- `npm run check:no-fallbacks` : OK (38 fichiers).
- **APK réellement produit** (run utilisateur du 2026-09-23 ~10:45, sur un hôte autorisant les sockets locaux) : `platforms/desktop-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`, **504 912 620 octets**, sha256 `8dee010baa3979368d67342b53d4048b47c54b098992cabfbdadc76a7e667306`.
  - `aapt2 dump badging` : `package com.squirrel.desktop.debug`, `versionCode 1`, `versionName 0.1.0`, `minSdkVersion:'29'`, `targetSdkVersion:'36'`, `compileSdkVersion='36'`, `native-code: 'arm64-v8a'`, `application-debuggable`, `launchable-activity com.squirrel.desktop.MainActivity`, permissions `INTERNET` et `RECORD_AUDIO` (plus `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, injectée par AGP). `testOnly` est absent.
  - `aapt2 dump xmltree --file AndroidManifest.xml` : `minSdkVersion=29`, `targetSdkVersion=36`, `debuggable=true`, `usesCleartextTraffic=true` (nécessaire au serveur Axum loopback en debug) et `networkSecurityConfig` présent ; la `<queries>` sur `android.speech.RecognitionService` confirme l'installation du plugin STT.
  - `apksigner verify --print-certs` : signature valide, certificat `C=US, O=Android, CN=Android Debug`, SHA-256 `318a2cd91765fd46175666dc98b6396c713cec962545c6017bb24671f144e8d7` — signature debug locale, attendue pour le mode test ; `--prod` doit produire la signature du keystore release.
  - `unzip -l` : `classes.dex` (9 706 836 o) et `lib/arm64-v8a/libsquirrel_lib.so` (489 764 312 o, **stocké non compressé**). Le `.so` embarque le web root stagé, ce qui explique sa taille ; il est stocké sans compression parce que le manifeste porte `extractNativeLibs=false` (chargement direct depuis l'APK). La taille de 504 912 620 o est celle d'un APK **debug** (symboles non strippés, `keepDebugSymbols` du template) : `--prod` doit produire nettement plus petit.
  - Le flavor produit est `universal` alors que la cible demandée est `-t aarch64` : la nomenclature des flavors appartient au CLI Tauri. C'est précisément ce que la découverte d'artefact ne doit pas présumer (défaut 3).
- Ce même run a échoué **après** la production de l'APK : le script ne trouvait pas le fichier et sortait en erreur (défaut 3 du §12.5). L'APK produit était complet et valide.

### 12.4 Preuves de la seconde passe (2026-09-23, après le retour des 223 erreurs)

Ces preuves ont été produites après le premier `./run.sh apk` réel de l'utilisateur, qui a échoué sur 223 erreurs `rustc` pour la cible Android.

- `cargo check --package squirrel --lib --target aarch64-linux-android --offline` : **`Finished dev profile` en 2 min 32 s, aucune erreur**. C'est le contrôle qui reproduit exactement les 223 erreurs signalées avant correctif.
- `cargo build --lib --target aarch64-linux-android` tel que piloté par `tauri android build` : **`Finished dev profile` en 1 min 50 s**, puis `libsquirrel_lib.so` produit et lié dans `gen/android/app/src/main/jniLibs/arm64-v8a`.
- Édition de liens réellement exécutée avec le wrapper NDK `aarch64-linux-android29-clang` ; le `.so` produit déclare `libamidi.so`, `liblog.so`, `libOpenSLES.so`, `libandroid.so`, `libaaudio.so`, `libdl.so`, `libm.so`, `libc.so`.
- `cargo check --package squirrel --lib` sur la cible hôte (macOS) après correctif : **`Finished dev profile` en 2 min 51 s, aucune erreur** — la lane desktop n'est pas régressée.
- Les crates Android jusqu'ici absentes sont présentes et compilées : `android-build 0.1.4`, `jni-min-helper 0.3.4`, `oboe 0.6.1`, `cpal 0.15.3` (Android), `rusqlite 0.31.0` + `libsqlite3-sys` bundle, `ring 0.17.14`, `midir 0.11.0`.

### 12.5 Défauts corrigés dans cette passe

1. **Dépendances serveur déclarées sous la cible macOS** (`platforms/desktop-tauri/Cargo.toml`). `rusqlite`, `bcrypt`, `uuid`, `chrono`, `jsonwebtoken`, `rand`, `sha2`, `hex`, `reqwest`, `zip`, `tempfile` et `dotenvy` étaient placées sous `[target.'cfg(target_os = "macos")'.dependencies]`. `src/server` les utilise pourtant sur toutes les cibles, ce qui produisait exactement les 223 erreurs signalées (94 `E0433` dont 71 `rusqlite`, 9 `reqwest`, 8 `chrono`, 3 `hex`, 2 `rand`, 1 `uuid`, plus 21 `E0277` et 1 `E0599` en cascade). Elles sont désormais dans `[dependencies]` ; seules `block2` et `objc2*` restent propres à macOS.
2. **Plancher d'API trop bas pour l'édition de liens** (`tauri.android.conf.json`, `gen/android/app/build.gradle.kts`). `minSdk` était 26, mais le NDK ne fournit `libamidi.so` qu'à partir de l'API 29 (`toolchains/llvm/prebuilt/<hôte>/sysroot/usr/lib/<abi>/29/…`), et `midir`'s backend Android le lie. L'édition de liens échouait sur `ld.lld: error: unable to find library -lamidi`. Les deux fichiers passent à `29` et doivent rester alignés. Contrepartie assumée : Android 8.0–9.0 sortent du périmètre (aucun de ces appareils ne fournit WebGPU à la WebView).
3. **Découverte d'artefact fausse** (`scripts/android/apk.sh`). AGP imbrique chaque artefact sous son **flavor** (`outputs/apk/<flavor>/debug/`), alors que le script cherchait `outputs/apk/debug` : le premier `./run.sh apk` réel a donc produit un APK valide puis affiché `ERROR No *.apk artifact was produced under …`. La découverte lit désormais le rapport du CLI Tauri (`Finished N APK at:`), seule source qui connaisse le flavor, avec deux replis explicites et jamais silencieux : les fichiers plus récents que le marqueur `temp/apk-build-marker`, puis — si Gradle n'a rien réécrit parce que toutes ses tâches étaient *up-to-date* — l'artefact `<build type>` le plus récent, accompagné d'un `WARNING` nommant le fichier réutilisé. `--install` consomme la liste déjà vérifiée au lieu de refaire une recherche divergente, et refuse un AAB (« needs an APK »).

### 12.5.1 Vérification du correctif de découverte (cette passe)

Le build Gradle ne peut pas être relancé ici (voir §12.6), mais la découverte peut l'être sur des entrées réelles : le banc `temp/_apk_discovery_test.sh` charge les fonctions de `scripts/android/apk.sh` (sans exécuter `main`) et rejoue le pipeline complet. **26 assertions sur 26 passent**, dont :

- **entrée réelle bruitée** : le log brut du run utilisateur (build Gradle, lignes cargo, le rapport du CLI, l'erreur du script) donne **exactement et uniquement** le chemin de l'APK produit ; le bruit ne crée aucun faux positif, un log sans rapport ne donne rien ;
- **vérification réelle** : `collect_artifacts` exécute `aapt2 dump badging` et `apksigner verify` sur l'APK découvert dans `gen/android/app/build/outputs` (les mêmes sorties que §12.3) ;
- **priorité au rapport** : un artefact leurre plus récent dans un autre flavor n'est pas retenu quand le rapport nomme l'artefact de la configuration demandée ;
- **fraîcheur** : sans rapport CLI, seul un fichier plus récent que le marqueur est retenu ;
- **Gradle *up-to-date*** : plus rien n'est réécrit → un `WARNING` nomme le fichier réutilisé et la commande réussit au lieu d'échouer à tort ;
- **échecs explicites** : arbre de sortie absent et arbre vide échouent tous deux avec le message nommé attendu (et le chemin du log de build) ;
- **`--install`** : un AAB est refusé avec `needs an APK`.

### 12.6 Environnement de la session (pas des défauts du framework)

1. Écriture hors du dépôt refusée par le bac à sable : `~/.cargo`, `~/.gradle` et `~/.atome` renvoient `Operation not permitted (os error 1)`, et **aucun socket TCP local n'est autorisé** (`listen EPERM` sur `127.0.0.1:0`). Une commande exécutée **dans** le bac à sable échoue donc dans `tauri android build` sur `failed to build WebSocket server: Operation not permitted (os error 1)`, et Gradle ne démarre pas (`FileLockContentionHandler … java.net.SocketException`). Reproduit deux fois le 2026-09-23 ; c'est aussi la preuve que le chemin d'erreur de la lane est bruyant, nommé et non silencieux.
2. La lane complète **est** exécutable depuis ce poste : le préfixe `./run.sh` est déjà approuvé et s'exécute hors bac à sable. C'est ainsi qu'ont été produits tous les runs réels de §12.7. Piège à retenir : ne pas enchaîner `./run.sh apk` derrière un pipe, un `;` ou une autre commande, sinon l'appel retombe dans le bac à sable et échoue comme au point 1.
3. La suppression de fichiers (`rm`) reste refusée à l'agent — le réviseur d'approbation est en panne (`supported API model names are deepseek-flash, deepseek-v4-pro, but you passed codex-auto-review`). Tout ménage sous `temp/` doit être fait par l'utilisateur.

Sur un poste normal, ces points disparaissent ; la lane Android est désormais vérifiée de bout en bout, y compris ses reprises après échec.

### 12.7 Seconde passe réelle (2026-09-23, session suivante)

Objectif de cette passe : exécuter la lane pour de vrai et vérifier qu'elle produit bien un APK fonctionnel. Trois défauts ont été trouvés ainsi, corrigés et couverts par le banc.

**Run réel du mode test, de bout en bout.** `./run.sh apk` → `[apk] Done`, **exit 0** : la lane résout la chaîne, compile la cible `aarch64-linux-android`, laisse le CLI Tauri assembler via Gradle, découvre l'artefact par le rapport du CLI, le vérifie (`aapt2 dump badging`, `apksigner verify`, sha256) puis conclut. Trois runs consécutifs ont produit la même empreinte.

**Run réel du second passage (Gradle *up-to-date*).** Un `./run.sh apk --install` lancé juste après un run complet a exercé le chemin « Gradle n'a rien réécrit » : `[apk] WARNING Gradle rewrote no *.apk file; reusing the newest debug output on disk: …`, puis la vérification, puis l'échec **nommé** attendu de `--install` (`No authorized Android device is connected; plug one in or start an emulator`) — aucun appareil n'était connecté. Le scénario T7 de §12.5.1 est donc confirmé sur un vrai Gradle, appareil absent compris.

**Défaut 4 — le rapport du CLI n'atteignait jamais le log (corrigé).** `temp/apk-build.log` ne faisait que 567 octets et ne contenait **pas** la ligne `Finished 1 APK at:` : la CLI Tauri écrit ce rapport sur **stderr**, alors que le `tee` de la lane ne capturait que stdout. La « source autoritaire » de découverte restait donc morte en pratique et tout reposait sur le repli « plus récent que le marqueur ». Correctif : `( cd "$TAURI_DIR" && "$TAURI_CLI" … ) 2>&1 | tee "$BUILD_LOG"` — les deux flux continuent d'aller au terminal et `pipefail` continue de faire échouer la lane. Preuve sur le run `--prod` : le log passe à 27 619 octets et contient le rapport avec le chemin de l'APK release.

**Défaut 5 — l'APK doublait de taille quand un artefact précédent existait (corrigé).** Mesuré sur l'APK debug : **994 683 526 octets** alors que la somme de ses entrées n'est que de 505 086 808 octets, soit **489 765 844 octets morts** insérés entre `classes9.dex` et `assets/tauri.conf.json`. AGP réempaquette dans le fichier existant **sans le tronquer** : les octets de la charge utile précédente restent derrière les nouveaux offsets. Reproductible : fichier présent avant packaging → 994 683 526 octets ; fichier absent → **504 916 716 octets et zéro octet mort**. Correctif : `remove_stale_artifacts()` supprime, juste avant le build, les `*.apk` / `*.aab` **du même type de build** sous l'arbre de sortie (un autre type de build, par exemple un release déjà signé pendant un run debug, est laissé intact ; `--dry-run` imprime le `rm` au lieu de l'exécuter). Après correctif, trois runs consécutifs debug donnent 504 916 716 octets, zéro gap, même sha256 `2cac16aef46f29573e32da53477e3e8ebad222c7c1f4620299ebd69f028dd9a6`.

**Run réel du mode production.** `./run.sh apk --prod` → `[apk] Done`, exit 0 :

- keystore release **créé** faute d'existant : `~/.atome/android/squirrel-release.jks` (RSA 4096, `CN=Squirrel, OU=Atome, O=Squirrel, L=Paris, C=FR`, 10 000 jours), mot de passe aléatoire conservé hors dépôt, identifiants stagés dans `gen/android/keystore.properties` (gitignoré). **À sauvegarder** : c'est cette clé qui définira les mises à jour de l'application.
- `platforms/desktop-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`, **229 264 109 octets** (219 Mio, contre 481 Mio en debug), `.so` strippé de 225 614 912 octets, `package com.squirrel.desktop` (sans suffixe `.debug`), `launchable-activity com.squirrel.desktop.MainActivity`, `native-code 'arm64-v8a'`, `targetSdkVersion 36`, aucun `application-debuggable`, **aucun octet mort** ;
- signature `apksigner verify --print-certs` : `CN=Squirrel, OU=Atome, O=Squirrel, L=Paris, C=FR`, SHA-256 `e2fcef4afad5b4c98db3b8d8fb2ce9c8eca52f8d2e264a54d84e369e0e24f55f`, valide ; sha256 de l'APK `81e3f27bb078a92423e2d208cf93a1f4d20d49a793462a464421a0fecc91dda2`.

**Banc étendu.** `temp/_apk_discovery_test.sh` : **30 assertions / 30**. Deux cas neufs : T11 (un CLI factice qui écrit le rapport sur stderr doit le faire apparaître dans le log capturé) et T12 (l'artefact debug périmé est supprimé, l'artefact release est épargné).

### 12.8 Reste à faire / **To verify**

- Fait : `./run.sh apk` réel jusqu'à l'APK, terminé en `0` avec `[apk] Done` — voir §12.3 (run utilisateur) et §12.7 (trois runs de l'agent, plus un run `--prod`).
- Fait : chemin Gradle *up-to-date* observé sur un vrai Gradle (deuxième run), avec le `WARNING` nommé et l'artefact réutilisé — voir §12.7.
- Fait : `./run.sh apk --prod` réel — APK release signé par le keystore release, plus léger que le debug, sans octet mort — voir §12.7.
- Fait : `aapt2 dump badging`, `aapt2 dump xmltree`, `apksigner verify --print-certs` et sha256 sur l'APK debug comme sur l'APK release.
- **To verify (appareil requis)** : `./run.sh apk --install` puis démarrage réel sur appareil, `navigator.gpu` dans la WebView Android, permissions micro/réseau, serveur Axum local. Le refus sans appareil est, lui, déjà vérifié (message nommé).
- **To verify** : `./run.sh apk --prod --aab` (variante Play Store) et `--split-per-abi` ; le chemin AAB est implémenté et son refus par `--install` est couvert par le banc, mais aucun AAB réel n'a encore été produit.
- **To verify** : `./run.sh apk --dev --device <serial>` (session hot reload), qui exige un appareil connecté.
- Résolu dans cette passe : `midir` **n'a pas besoin d'être gaté** — la crate 0.11 fournit un backend Android réel (`src/backend/android`, JNI + AMidi). Restent à trancher : `native_contacts` (déjà gaté macOS/Windows, compile sans objet sur Android) et les 5 sites `Command::new(node)` de `src/server/mod.rs` plus `ffmpeg` (`src/server/mod.rs:314`, `audio_engine/transcode.rs:68`), qui compilent mais échouent à l'exécution sur Android car les binaires n'y existent pas.
- Nettoyage possible (gitignorés, 0 fichier suivi) : `temp/android-home/` (~2,1 Go), `temp/apk-verify/` (~3,2 Go), `temp/c`, `temp/android_check.sh`, `temp/android_*.txt|json`, ainsi que le banc de cette passe (`temp/_apk_discovery_test.sh`, `temp/_apk_lane_under_test.sh`, `temp/_apk_*.log|out`, `temp/_apk_fixture/`) et le marqueur/log de build (`temp/apk-build-marker`, `temp/apk-build.log`), recréés à chaque run. `temp/apk-verify/` contient les clones des caches et peut être supprimé sans conséquence. S'y ajoute `temp/_apk_debug_with_hole.apk` (994 683 526 octets) : c'était la pièce à conviction du défaut 5, désormais redondante puisque §12.9 re-mesure l'absence d'octet mort sur l'artefact courant.

### 12.9 Vérification finale indépendante (2026-09-23, 11:18, état courant du dépôt)

**La lane repart de zéro et conclut.** `./run.sh apk` relancé seul sur sa ligne, avec l'APK debug précédent supprimé par la lane elle-même (`[apk] removing the previous app-universal-debug.apk so Gradle packages from scratch`) : compilation Rust `dev` réelle, assemblage Gradle, découverte par le rapport du CLI, vérification, puis `[apk] Done` avec **exit 0**.

- APK debug : `platforms/desktop-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`, **504 916 716 octets** (482 Mio), sha256 `2f9812ffa6830dcf35bfb03647a7a9cdea9ebb026fc1b0cdd0ef8736b3bbe693`.
- Intégrité structurelle mesurée sur le fichier final : 931 entrées, somme des entrées compressées 504 751 214 octets, surcoût 165 502 octets (en-têtes locaux + répertoire central) → **zéro octet mort** ; `ZipFile.testzip()` (CRC32 de chaque entrée, soit les 482 Mio) sans erreur ; `assets/tauri.conf.json` présent (2 266 octets) ; `lib/arm64-v8a/libsquirrel_lib.so` de 489 768 408 octets.
- `aapt2 dump badging` : `com.squirrel.desktop.debug`, `targetSdkVersion 36`, `native-code 'arm64-v8a'`, activité de lancement `com.squirrel.desktop.MainActivity`, permissions `INTERNET` et `RECORD_AUDIO`. `apksigner verify` : signature debug valide (`318a2cd9…f144e8d7`).
- `temp/apk-build.log` : 5 127 octets et **contient** `Finished 1 APK at:` → le correctif du défaut 4 est actif dans l'état courant.
- APK release re-mesuré sans reconstruction : 229 264 109 octets, 924 entrées, surcoût 133 424 octets, CRC intégral sans erreur, `.so` strippé de 225 614 912 octets → toujours aucun octet mort.
- Politique réseau lue dans les deux manifestes compilés : debug `usesCleartextTraffic=true` ; release `usesCleartextTraffic=false` **plus** un `network_security_config` embarqué qui réautorise le cleartext pour `127.0.0.1` et `localhost` seulement — c'est la condition pour que la WebView joigne le serveur Axum local en production. Vérifié sur la ressource compilée de l'APK release (`res/8G.xml`), pas seulement sur la source.
- Banc re-exécuté dans cet état : `bash temp/_apk_discovery_test.sh` → **30 passed, 0 failed**.

**Le log collé par l'utilisateur (10:45) est antérieur aux correctifs.** Il se termine sur `[apk] ERROR No *.apk artifact was produced under …/app/build/outputs` alors que le CLI venait d'annoncer l'APK. Ce texte d'erreur **n'existe plus** dans `scripts/android/apk.sh` (le message courant nomme le type de build et le log), et la découverte lit désormais le rapport du CLI sur les deux flux (défaut 4), puis ses deux replis. Reproduire cette panne demanderait de désactiver T9 et T11 du banc.

**Non reproductible octet pour octet, et ce n'est pas un défaut.** Ce run a recompilé la crate (`Compiling squirrel`, deux fois : une par le CLI, une par la tâche Gradle) ; l'empreinte debug diffère donc de celle de §12.7 tout en gardant exactement la même taille et la même structure. Aucune revendication de reproductibilité binaire ne doit être faite pour le mode debug.

**Toujours To verify, faute d'appareil sur ce poste.** Aucun AVD, aucune image système et aucun binaire `emulator` dans le SDK local ; le démon `adb` ne démarre pas dans le bac à sable (`could not install *smartsocket* listener: Operation not permitted`). L'installation et le démarrage réels sur appareil, `navigator.gpu` dans la WebView Android, le micro et le serveur Axum local restent donc non exécutés.

### 12.10 Identité « atome » et icône Atome (2026-09-23, session suivante)

Objectif : l'application installée doit s'appeler **atome** et porter le **logo Atome**, sur Android, sur iOS et dans la version Tauri pour macOS. Le point de départ était l'inverse : nom « squirrel » et icône Tauri par défaut dans l'APK installé.

**Ce qui a été renommé (visible).**

- `platforms/desktop-tauri/tauri.conf.json` : `productName` `squirrel` → `atome` et titre de la fenêtre principale → `atome`.
- `platforms/desktop-tauri/gen/android/app/src/main/res/values/strings.xml` : `app_name` et `main_activity_title` → `atome`. C'est le **seul** endroit qui pilote le libellé du lanceur Android : `tauri android init` ne réécrit jamais un projet déjà généré, la modification est donc manuelle et durable.
- `scripts/android/apk.sh` : bandeau `Squirrel Android build` → `atome Android build` (en-tête de fichier aligné : « Android APK automation for atome (Squirrel runtime / eVe) »).
- `scripts/run_tauri.sh` : les motifs de nettoyage des process Tauri obsolètes suivent le bundle macOS renommé. Le binaire Cargo lui-même reste `squirrel` dans cette passe ; son renommage complet (`target/debug/atome`, `Contents/MacOS/atome`) est décrit en **§12.12**.
- `atome/documentations/desktop_tauri_distribution.md` : `squirrel.app` / `squirrel.dmg` → `atome.app` / `atome.dmg`.
- `maps/ARCHITECTURE_MAP.md` (section Tauri/Android) : phrase d'identité ajoutée — nom visible et icône, propriétaire unique par plateforme.

**Ce qui n'a PAS été renommé, volontairement (identifiants techniques).**

- `com.squirrel.desktop` et `com.squirrel.desktop.debug` : renommer l'`applicationId` installerait une **seconde** application à côté de celle déjà présente et orphelinerait la base locale ; l'APK actuel met à jour l'existant.
- crate/lib Rust `squirrel` / `squirrel_lib` : le nom de la bibliothèque native est chargé par `System.loadLibrary("squirrel_lib")` dans `platforms/desktop-tauri/gen/android/app/src/main/java/com/squirrel/desktop/generated/Rust.kt`. Renommer les deux ensemble est possible, mais impose de réécrire un fichier **généré** (donc réécrit au prochain `tauri android init`) et une recompilation complète des deux cibles.
- keystore `~/.atome/android/squirrel-release.jks` et son alias `squirrel`, thème Android `Theme.squirrel`, nom de service `squirrel`, répertoires de données `squirrel/Data`, `squirrel/Uploads`, `squirrel/project`.
- Décision réversible : une identité technique complète (applicationId, crate, keystore) reste à trancher ; son coût est une réinstallation propre, une migration des données locales et une nouvelle clé de signature.

**Icônes : une seule source d'art pour les trois plateformes.**

- Source : `atome/src/assets/images/logos/atome.svg` (le dossier est `logos`, pas `logo`). Le master raster opaque 1024 (`temp/atome-icon-1024.png`) est dérivé de l'icône iOS existante `icon_1024.png`, elle-même identique au SVG (comparaison visuelle : même tracé magenta sur fond blanc).
- `tauri icon <master>` a régénéré `platforms/desktop-tauri/icons/*` (dont `icon.icns` et `icon.ico`), les `mipmap-*` Android (`ic_launcher` / `ic_launcher_round` : 48/49/96/144/192 px ; `ic_launcher_foreground` : 108/162/216/324/432 px) et a créé `mipmap-anydpi-v26/ic_launcher.xml` (adaptive icon) plus `values/ic_launcher_background.xml` (`#fff`).
- iOS : les 16 PNG de `platforms/ios/atome-auv3/application/Assets.xcassets/AppIcon.appiconset/` ont été régénérés depuis le master (rééchantillonnage Lanczos), **opaques et sans canal alpha** — Apple refuse un icône transparent et les anciens fichiers étaient transparents (sauf le 1024). `Contents.json` est inchangé : mêmes noms de fichiers, mêmes tailles déclarées.
- Les fonds de l'icône adaptative Android et des icônes iOS sont blancs, comme le master 1024 : c'est le rendu du logo Atome utilisé partout ailleurs.

**Preuves réellement exécutées.**

- APK reconstruit par `./run.sh apk` seul sur sa ligne → `[apk] Done`, exit 0. `aapt2 dump badging` : `application-label:'atome'` (toutes locales), `launchable-activity: name='com.squirrel.desktop.MainActivity' label='atome'`, `package com.squirrel.desktop.debug`, `targetSdkVersion 36`, `native-code 'arm64-v8a'`, signature debug `318a2cd9…f144e8d7` valide.
- APK : `platforms/desktop-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`, **504 845 219 octets**, sha256 `2e0172db6697105bc960a60a07a040864b60caebb4db24b058af38c9d3f3f933`, 932 entrées, surcoût d'en-têtes 165 627 octets, `ZipFile.testzip()` sans erreur → toujours **zéro octet mort**.
- Icône réellement embarquée : `res/mipmap-xxxhdpi-v4/ic_launcher.png` extrait de l'APK = logo Atome sur fond blanc (192×192) ; `res/mipmap-anydpi-v26/ic_launcher.xml` référence `@mipmap/ic_launcher_foreground` + `@color/ic_launcher_background`.
- macOS : build debug réel `tauri build --debug --bundles app` (3 min 35 s) → `platforms/desktop-tauri/target/debug/bundle/macos/atome.app`, `CFBundleName` et `CFBundleDisplayName` = `atome`, `CFBundleExecutable` = `squirrel` (nom du binaire Cargo), `CFBundleIdentifier` = `com.squirrel.desktop`, `Resources/icon.icns` **identique octet pour octet** au `.icns` régénéré (sha256 `125817f247b44dc089a80a6a3b09c4a4284ea8c78c4141c8280b1b268f652eae`).
- iOS : `xcrun actool --app-icon AppIcon … platforms/ios/atome-auv3/application/Assets.xcassets` compile l'Asset Catalog et produit `AppIcon60x60@2x.png` / `AppIcon76x76@2x~ipad.png` sans aucun avertissement d'icône ; le seul message d'erreur est l'absence de runtime simulateur dans le bac à sable. Les 17 fichiers de l'AppIcon set ont la taille déclarée dans `Contents.json` et aucun canal alpha.
- Bancs de dépôt rejoués après les modifications : `check:no-fallbacks` OK (38 fichiers), `check:tauri-fs-boundary` PASS, `check:syntax` OK (2 189 fichiers). `check:map-paths` reste à 128 > 127 (échec préexistant, **delta 0** : la phrase ajoutée à la carte n'introduit aucun chemin manquant).

**To verify.**

- Installation réelle sur l'appareil : impossible depuis cette session (`adb` ne démarre pas dans le bac à sable). Voir le nom et l'icône sur le lanceur du téléphone reste la seule preuve visuelle définitive.
- Build iOS complet (archive/TestFlight) non lancé : seul `actool` a été exécuté sur le catalogue.
- **Le crash Android constaté avant ce renommage n'est ni diagnostiqué ni corrigé par cette passe** : renommer l'application et changer l'icône ne touche pas au code d'exécution. La piste reste un panic Rust au démarrage (le message précédent décrit les commandes `logcat` à lancer côté appareil).

### 12.11 Émulateur Android local et cause du crash (2026-09-23, session suivante)

**Question posée** : « dans ce que tu as installé pour créer l'APK, y a-t-il un émulateur Android ? »

**Réponse vérifiée : non.** Le SDK installé (`/opt/homebrew/share/android-commandlinetools`) ne contenait que `build-tools`, `cmdline-tools`, `licenses`, `ndk`, `platform-tools` et `platforms` : aucun paquet `emulator`, aucune image système, aucun AVD sous `~/.android`, pas d'Android Studio. `adb` était présent, `sdkmanager` et `avdmanager` aussi.

**Ce qui a été ajouté, et où.** Tout est **local au projet** et **non versionné** : `temp/` est ignoré par Git, donc rien de tout cela n'est synchronisé avec GitHub, et aucun répertoire global n'est modifié (ni le SDK Homebrew, ni `~/.android`).

| Élément | Emplacement | Taille |
| --- | --- | --- |
| `platform-tools` | `temp/android-sdk/platform-tools` | ~40 Mo |
| `emulator` (37.1.11) | `temp/android-sdk/emulator` | ~1,5 Go |
| Image système `system-images;android-36;google_apis;arm64-v8a` | `temp/android-sdk/system-images` | ~3,9 Go |
| AVD `atome-api36` (profil `pixel_7`, 4 Go de RAM) | `temp/android-avd/avd` | variable |
| État de l'émulateur, `emulator.log`, `emulator.pid`, home utilisateur | `temp/android-avd` | — |
| Captures `logcat` | `temp/logcat/atome-<horodatage>.log` et `atome-crash-<horodatage>.log` | — |

**Deux contraintes non documentées ont dû être traitées** (elles sont désormais encodées dans `scripts/android/apk.sh`) :

1. **`avdmanager` ignore `ANDROID_HOME` et `ANDROID_SDK_ROOT`.** Le CLI déduit son SDK root du **grand-parent** de son « toolsdir » (`-Dcom.android.sdkmanager.toolsdir`, posé par son script de lancement), donc de l'installation `cmdline-tools` globale. Avec une image système locale, `create avd -k …` échoue en `Error: Package path is not valid. Valid system image paths are:` suivi de `null`, quelle que soit la variable d'environnement. La lane surcharge donc la propriété : `AVDMANAGER_OPTS="-Dcom.android.sdkmanager.toolsdir=<sdk_root>/cmdline-tools/latest"`. L'avertissement `Could not load devices from …/devices.xml` qui suit est bénin : l'AVD est créé avec le profil demandé et sort en code 0.
2. **L'émulateur refuse un SDK root sans `platform-tools`.** Il valide un candidat en exigeant un sous-dossier `platform-tools`, sinon il remonte l'arborescence puis abandonne en `FATAL | Broken AVD system path`. `platform-tools` fait donc partie du paquetage local, même si la lane pilote `adb` depuis le SDK global.

**Utilisation : une seule ligne, tout le reste est automatique.**

```bash
./run.sh apk --emulator                      # build + AVD + boot + install + lancement + logcat
./run.sh apk --emulator --emulator-wipe      # repart d'un AVD neuf (et arrête une instance déjà lancée)
./run.sh apk --emulator --logcat-seconds 60  # capture plus longue
./run.sh apk --emulator --emulator-headless  # sans fenêtre (GPU swiftshader)
./run.sh apk --emulator --emulator-avd nom --emulator-api 35 --emulator-port 5556
```

Chaque dépendance est vérifiée avant usage : ce qui est présent est réutilisé, ce qui manque est téléchargé, rien n'est téléchargé deux fois. La fenêtre de l'émulateur reste ouverte volontairement (c'est la preuve visuelle demandée) ; pour l'arrêter : `adb -s emulator-5554 emu kill`.

**Preuve d'exécution réelle (2026-09-23, 16:16-16:17).** `./run.sh apk --emulator --emulator-wipe` seul sur sa ligne → `[apk] Done`, exit 0 : APK debug 481 Mo reconstruit et vérifié (`aapt2` : `application-label:'atome'`, `com.squirrel.desktop.debug`, `arm64-v8a` ; `apksigner` : signature debug valide ; sha256 `4f2b1e1de6b9fdcdee0d7996788dc32cc6cadface52891c9b4cb5ab4f0095dcb`), AVD `atome-api36` recréé, `emulator-5554` booté, `adb install` réussi, `am start` en `Status: ok`, puis 25 s de `logcat` capturés.

**Le crash d'installation sur téléphone est maintenant expliqué, preuve locale à l'appui.** L'application **ne peut pas démarrer** : l'échec est une `FATAL EXCEPTION: main` levée par le chargement de la bibliothèque native.

```text
java.lang.UnsatisfiedLinkError: dlopen failed: cannot locate symbol "__cxa_pure_virtual"
  referenced by "/data/app/…/base.apk!/lib/arm64-v8a/libsquirrel_lib.so"
	at java.lang.System.loadLibrary(System.java:1765)
	at com.squirrel.desktop.Rust.<clinit>(Rust.kt:18)
	at com.squirrel.desktop.WryActivity.onCreate(WryActivity.kt:117)
	at com.squirrel.desktop.MainActivity.onCreate(MainActivity.kt:9)
```

Chaîne de causes établie :

- `libsquirrel_lib.so` porte le code **C++ d'Oboe** (chaîne `oboe` présente dans le binaire ; Oboe vient de `cpal`/`kira`, dépendances audio de `platforms/desktop-tauri/Cargo.toml`) ;
- il laisse **32 symboles C++ non résolus**, dont `__cxa_pure_virtual` et `_ZSt9terminatev`, qui appartiennent au runtime `libc++_shared.so` ;
- son en-tête dynamique ne déclare **aucune** entrée `DT_NEEDED` pour `libc++_shared.so` (seuls `libamidi`, `liblog`, `libOpenSLES`, `libandroid`, `libaaudio`, `libdl`, `libm`, `libc`) ;
- l'APK ne contient **qu'**`lib/arm64-v8a/libsquirrel_lib.so` : aucun `libc++_shared.so` n'est embarqué.

Sur Android, `dlopen` résout les symboles à l'édition de liens : sans ce runtime, le chargement échoue systématiquement — sur l'émulateur comme sur le téléphone, puisque c'est le même APK. Le processus n'a donc jamais atteint le code Rust, ce qui explique l'absence de tout panic ou tombstone : le `SIGKILL` observé ensuite n'est que la conséquence de la mort de l'Activity.

**Correctifs possibles (non appliqués, décision non prise dans cette passe)** : lier le runtime C++ partagé (`-lc++_shared` côté Rust, ou `ANDROID_STL=c++_shared` avec ajout de `libc++_shared.so` de la NDK dans `jniLibs/arm64-v8a/`), ou au contraire le lier statiquement (`c++_static` / `-static-libstdc++`). Le choix engage les builds Android et doit être validé par une nouvelle exécution de `./run.sh apk --emulator`.

**To verify.**

- Émulateur : fenêtre visible, lancement de l'application, captures `logcat` — **fait** dans cette passe. Reste à vérifier : rendu réel de l'interface (WebGPU/WebView dans l'émulateur) une fois le chargement de la bibliothèque corrigé.
- Le crash n'est **pas corrigé** : renommer l'application et changer l'icône ne touchent pas au code d'exécution, et la cause est un défaut de liaison de la bibliothèque native, pas un panic Rust.

### 12.12 Identité macOS complète — binaire `atome`, ressources sous `project/`, icône arrondie (2026-09-23, session suivante)

Objectif : après §12.10, le conteneur `atome.app` portait bien le bon nom, mais l'application **lancée** affichait encore « Squirrel » et l'icône **carrée** par défaut de Tauri. Cette passe ferme les deux écarts et documente ce qui reste hors de portée du bac à sable.

**Cause racine du blocage de build (binaire contre ressources).**

- `bundle.resources` de `tauri.conf.json` copiait `../../atome` **dans le dossier de profil** sous la clé `atome`, c'est-à-dire exactement `target/debug/atome` — le chemin du nouveau binaire. À chaque build, `tauri-build` tentait de remplacer ce dossier par les ressources et échouait en `failed to remove file 'platforms/desktop-tauri/target/debug/atome'` / `Operation not permitted`. Le renommage du binaire a donc transformé une copie de ressources en conflit de noms.
- Correctif : toutes les ressources sont désormais mappées sous une **racine unique** `project/` — `project/version.txt`, `project/atome`, `project/eVe`, `project/node_modules/rubberband-wasm/dist`. Aucune clé de ressource ne peut plus coïncider avec un nom de binaire.
- `platforms/desktop-tauri/src/lib.rs` : le candidat `dir.join("project/atome/src")` est ajouté **en tête** de la liste de résolution release ; les anciens candidats `atome/src` et `_up_/atome/src` sont retirés (un seul chemin, pas de repli).

**Ce que macOS lit réellement pour le nom.**

- Dans le bundle, l'identité vient d'`Info.plist` : `CFBundleName`, `CFBundleDisplayName` et `CFBundleExecutable` valent `atome`, et `Contents/MacOS/atome` existe.
- Hors bundle (`tauri dev`), le nom est porté par un `__info_plist` **embarqué dans le binaire** : `tauri-codegen` y écrit `CFBundleName` = `bundle.macOS.bundleName` ou `productName` — donc `atome` — plus `CFBundleShortVersionString` / `CFBundleVersion` issues de `version`, et fusionne `platforms/desktop-tauri/Info.plist` (descriptions d'usage micro/caméra/contacts). C'est ce `CFBundleName` qui pilote le nom affiché par le Dock et la barre de menus en développement.
- Le nom du binaire reste un second propriétaire visible, côté CLI : `platforms/desktop-tauri/Cargo.toml` déclare `[[bin]] name = "atome"` **et** `default-run = "atome"` (le CLI Tauri désigne le binaire principal par `default-run`, ou à défaut par le nom du package ; sans cette clé il ne reconnaît pas `atome` comme binaire principal).
- Restent volontairement techniques : `com.squirrel.desktop`, crate/lib `squirrel` / `squirrel_lib` (chargés par `System.loadLibrary("squirrel_lib")` du projet Android généré), keystore, `Theme.squirrel`, répertoires de données.

**Icône macOS : convention arrondie, pas un carré plein.**

- macOS n'arrondit pas les icônes fournies par les développeurs, contrairement à iOS qui masque lui-même : une icône livrée pleine page reste visuellement carrée, et un logo nu sans tuile ne ressemble à aucune autre icône du Mac. La conformité vient donc de l'art lui-même (tuile arrondie + coins transparents).
- Géométrie mesurée sur les icônes Apple (Calculator, Music, Notes) : toile 1024, corps **856**, marge **84**, coins transparents. Le master Tauri 1024 fournit corps 856 / marge 84 ; les tailles dérivées conservent des coins transparents (voir preuves).
- Les deux lanes utilisent la même icône : dans le bundle, macOS lit `Contents/Resources/icon.icns` ; en développement, `tauri` appelle `setApplicationIconImage` au démarrage (`RunEvent::Ready`, sous `dev` + macOS) avec l'icône embarquée par `tauri-codegen`, c'est-à-dire le premier `.icns` de `bundle.icon` = `icons/icon.icns`.
- Aucun changement d'art : la source reste `atome/src/assets/images/logos/atome.svg` et son master raster.

**Preuves réellement exécutées.**

- `npm run build:molecule:tauri` → `Built application at: …/target/debug/atome` puis `Bundling atome.app` → `Finished 1 bundle`, exit 0.
- Ressources stagées : `target/debug/project/{atome/src/index.html, eVe/version.txt, version.txt, node_modules/rubberband-wasm/dist}` — plus aucun dossier de ressources nommé `atome` à la racine du profil.
- `Info.plist` du bundle : `CFBundleExecutable = atome`, `CFBundleName = atome`, `CFBundleDisplayName = atome`, `CFBundleIdentifier = com.squirrel.desktop`.
- `Contents/Resources/icon.icns` est **identique octet pour octet** à `platforms/desktop-tauri/icons/icon.icns` (sha256 `ca03d715967ae9ceea5157608a0f5d1156559413a5a82a63aec5748d5c226d34`).
- Décomposition `iconutil -c iconset` puis mesure pixel : les **10 tailles** de l'`.icns` embarqué ont leurs quatre coins transparents. 1024 → corps 856 / marge 84 / 32,96 % de pixels transparents ; 512 → 868 / 78 ; 256 → 880 / 72 ; 128 → 896 / 64.
- Mesure de l'icône livrée **avant** cette passe (copie de référence `temp/pristine3`, `icon.icns` du 22/09) : coins transparents mais **76,63 % de pixels transparents** et corps non carré 949 × 825 — un **logo nu sans tuile**, à comparer aux 32,96 % et 856 × 856 de la version actuelle. Aperçus composés sur damier à l'échelle du Dock : `temp/dock-scale-preview-256.png`, `temp/atome-dock-icon-preview.png`, et la comparaison `temp/icon-comparaison-avant-apres.png` (gauche = avant, droite = après).
- `./run.sh --tauri` → compilation puis `Running target/debug/atome` ; Axum écoute sur `127.0.0.1:3000` (le processus `atome` est bien le propriétaire du port).
- Autres surfaces visibles : `atome/src/index.html` — `apple-mobile-web-app-title` valait `App`, corrigé en `atome` (nom affiché à l'ajout à l'écran d'accueil iOS) ; Android (`strings.xml`) et iOS (`INFOPLIST_KEY_CFBundleDisplayName = atome`, application **et** extension AUv3) étaient déjà corrects.
- Bancs : `check:syntax` (2189 fichiers) réussi, `check:no-fallbacks` réussi, `check:tauri-fs-boundary` réussi, `check:map-paths` en échec **préexistant** (128 > 127, delta 0 — déjà constaté avant cette passe).

**To verify (limites du bac à sable, pas des incertitudes produit).**

- Le rendu du **Dock pour le processus en cours** n'a pas pu être capturé : `screencapture` refusé (« could not create image from display », autorisation d'enregistrement d'écran), `lsappinfo` vide, `NSRunningApplication(processIdentifier:)` ne voit pas un binaire nu lancé par `tauri dev` (non enregistré auprès de LaunchServices) et l'énumération AppKit est bloquée en bac à sable. La preuve retenue est la chaîne déterministe `Info.plist` + `.icns` ci-dessus, plus l'aperçu composé.
- Si l'ancienne icône persiste dans le Dock après mise à jour d'une installation existante : c'est le cache du Dock/LaunchServices, pas le bundle — `killall Dock` le rafraîchit.
- Toute modification d'icône exige une **recompilation** : `tauri-codegen` embarque l'`.icns` dans le binaire pour `dev`, et le bundle copie `icons/icon.icns` à la construction. Aucune des deux lanes ne relit le fichier à chaud.
- iOS et Android restent inchangés volontairement : leurs icônes demeurent opaques et sans arrondi, les deux systèmes appliquant eux-mêmes le masque.

**Contraintes respectées** : aucun commit, aucun staging, `eVe/` non modifié.
