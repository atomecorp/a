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
  - fixe `bundle.android.minSdkVersion: 26` (défaut CLI = 24, incompatible avec le plancher CPAL/AAudio) et `versionCode` ;
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

1. `platforms/desktop-tauri/tauri.android.conf.json` (minSdk 26, versionCode, ressources réduites, suffixe `.debug`).
2. `npm run tauri -- android init --ci` ⇒ crée `platforms/desktop-tauri/gen/android/` (à **conserver dans le dépôt** ; le CLI ne le régénère pas).
3. Ajustements du projet généré : `app/build.gradle.kts` (signing release), `app/src/main/AndroidManifest.xml` + `res/xml/network_security_config.xml` (cleartext loopback), `tauri.properties` versionné ou généré.
4. `npm run tauri -- android build --debug --apk --target aarch64`.

Preuve attendue : APK produit sous `platforms/desktop-tauri/gen/android/app/build/outputs/apk/**/*.apk`, `aapt2 dump badging` affichant `minSdkVersion 26`, `targetSdkVersion 36`, permissions attendues.

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
2. `./run.sh apk` : APK produit ; chemin exact affiché ; `aapt2 dump badging` : `minSdkVersion 26`, `targetSdkVersion 36`, `package: com.squirrel.desktop.debug`, permissions `INTERNET` (+ `RECORD_AUDIO` si plugin STT inclus).
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

### 12.2 Fichiers implémentés (non committés, dépôt en lecture seule côté agent)

- `scripts/android/apk.sh` — propriétaire unique de la lane Android (résolution idempotente JDK/SDK/NDK/cibles Rust/CLI Tauri, staging du web root, keystore release, `tauri android build`/`dev`, vérification `aapt2` + `apksigner` + sha256, `--install`).
- `scripts/setup/service_commands.sh` — dispatch du case `apk` et aide.
- `platforms/desktop-tauri/tauri.android.conf.json` — overlay Android (minSdk 26, targetSdk 36, `frontendDist` = web root stagé, bundles de ressources vides).
- `platforms/desktop-tauri/gen/android/` — projet Gradle généré par `tauri android init --ci`, à **conserver dans le dépôt** (signature release + `network_security_config.xml` cleartext loopback + résolution explicite de la CLI Tauri dans `BuildTask.kt`).
- `platforms/desktop-tauri/src/android_assets.rs` — matérialisation du web root embarqué dans `app_data_dir` (car `resource_dir()` renvoie `asset://localhost/` sur Android), avec manifeste d'idempotence.
- `platforms/desktop-tauri/src/lib.rs`, `platforms/desktop-tauri/Cargo.toml` — branche `#[cfg(target_os = "android")]` et Reqwest en Rustls (sans OpenSSL hôte).
- `.gitignore`, `README.md`, `maps/ARCHITECTURE_MAP.md`, `maps/CODEMAP.md` — documentation et cartes.

### 12.3 Preuves réellement exécutées dans cette session

- `./run.sh apk --help`, `--doctor`, `--dry-run` : OK (JDK 21, SDK `android-36`, build-tools `36.0.0`, NDK `27.0.12077973`, cible Rust `aarch64-linux-android`, CLI Tauri 2.11.1).
- Staging du web root : OK (`android-webroot` ≈ 233 Mio, layout desktop reproduit).
- Compilation de la cible hôte après modification : `cargo check --package squirrel --lib` → `Finished dev profile` en 3 min 32 s, **aucune erreur**, `reqwest v0.11.27` inclus.
- Tests unitaires de `android_assets.rs` reconstruits et exécutés : **3 passed / 0 failed**.
- `npm run check:no-fallbacks` : OK (38 fichiers).
- Projection `aapt2 dump badging`, `apksigner verify`, sha256, installation `adb` : **To verify** — aucun APK n'a pu être produit ici (voir 12.4).

### 12.4 Blocages de l'environnement de la session (pas des défauts du framework)

1. Écriture hors du dépôt refusée par le bac à sable : `~/.cargo` et `~/.gradle` → `Operation not permitted (os error 1)`.
2. Réseau indisponible pour `cargo` et Gradle (DNS refusé) ; le seul accès réseau approuvé (`curl`) refuse d'écrire un fichier. Conséquence : **141 crates** restent hors du registre local, dont `android-build 0.1.4` et `jni-min-helper 0.3.4` — le premier build Android ne peut pas se faire hors ligne.
3. Escalade d'approbation hors bac à sable en panne (`supported API model names are deepseek-flash, deepseek-v4-pro, but you passed codex-auto-review`) : toute action hors workspace est refusée.
4. Disque : 1,3 Gio libres pour un besoin estimé de 8 à 10 Go (crates décompressées, `target/aarch64-linux-android`, caches Gradle + AGP).

Sur un poste normal (dossier personnel inscriptible + réseau), ces quatre points disparaissent et `./run.sh apk` fait le travail complet en une commande.

### 12.5 Reste à faire / **To verify**

- **To verify** : premier `./run.sh apk` réel jusqu'à l'APK, puis `aapt2 dump badging` (minSdk 26, targetSdk 36, `com.squirrel.desktop.debug`, `INTERNET`), `apksigner verify --print-certs`, sha256.
- **To verify** : `./run.sh apk --prod` (keystore `~/.atome/android/squirrel-release.jks`) et `--prod --aab`.
- **To verify** : installation et démarrage réels sur appareil (`--install`), `navigator.gpu` dans la WebView Android, permissions micro/réseau, serveur Axum local.
- **To verify** : sites desktop-only à gater pour Android (`node`, `ffmpeg`, `midir`, `native_contacts`, `native_clipboard`) — non traités ici.
- Nettoyage possible (gitignorés, 0 fichier suivi) : `temp/android-home/`, `temp/c`, `temp/android_check.sh`, `temp/android_*.txt|json`.
