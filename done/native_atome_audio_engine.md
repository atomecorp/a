# Native Atome Audio Engine

## Objectif

Unifier le moteur audio d'atome/eVe autour de Kira + CPAL en gardant une seule logique produit selon le runtime:

- Story desktop/Tauri: backend natif Kira + CPAL
- W3 desktop/Tauri: backend natif Kira + CPAL
- iOS Audio Unit / AUv3: backend natif iOS/AUv3
- Android natif: backend natif Kira + CPAL
- Web pur: playback via Kira compilé en WebAssembly
- Web pur en mode dégradé: enregistrement via technologies Web, puis remise au pipeline atome

Le seul cas où l'enregistrement ne peut pas être purement natif est le Web pur. Dans ce cas, il faut utiliser `getUserMedia` + `AudioWorklet` comme chemin principal, avec `MediaRecorder` en fallback.

## Etat actuel

- Le moteur natif Tauri existe déjà:
  - playback Kira dans `src-tauri/src/audio_engine/playback.rs`
  - recording CPAL dans `src-tauri/src/audio_engine/recorder.rs`
  - commandes Tauri dans `src-tauri/src/audio_engine/bridge.rs`
- Le bridge iPlug/Tauri existe déjà pour l'enregistrement:
  - `src-tauri/src/iplug_bridge.rs`
  - `src-tauri/src/native_recorder.rs`
- Le chemin AUv3 iOS sait déjà enregistrer `mic` et `plugin`:
  - `platforms/ios/atome-auv3/auv3/utils.swift`
- Le crate WebAssembly existe déjà:
  - `platforms/web/audio-wasm/src/lib.rs`
  - artefacts générés dans `src/wasm/`
- Le fallback Web audio existe déjà côté eVe:
  - `src/application/eVe/domains/media/api/audio_api.js`
  - `getUserMedia`
  - `AudioWorklet`
  - `MediaRecorder` fallback

## Problèmes constatés

### 1. Le workflow produit n'est pas unifié

- Le code Kira/WASM existe mais n'est pas branché clairement dans l'entrée principale produit.
- La façade `Squirrel.av.audio` n'est pas aujourd'hui le point central utilisé partout par eVe.
- eVe a encore son propre chemin `record_audio()` séparé.

### 2. Le backend WebAssembly est incomplet

- `platforms/web/audio-wasm/src/lib.rs` expose le playback.
- Il n'expose pas encore:
  - `audio_record_start`
  - `audio_record_stop`
  - `audio_get_levels`
- Donc le mode WebAssembly n'est pas complet pour l'enregistrement.

### 3. Le bridge Tauri eVe/iPlug est fragile

- `src/application/eVe/domains/media/api/audio_api.js` envoie actuellement le payload vers `window.__toDSP()` sous forme de chaîne JSON.
- `src/application/audio_runtime/tauri_audio_bridge.js` transmet ce payload tel quel à `iplug_send`.
- `src-tauri/src/iplug_bridge.rs` attend un objet JSON, pas une chaîne.
- Il faut donc corriger ce chemin.

### 4. Android n'est pas câblé end-to-end

- Le recorder `native_recorder.rs` est `macOS-only`.
- Cela ne bloque pas l'approche cible Android, mais cela prouve que le chemin recorder "iPlug natif" ne peut pas être considéré comme universel.
- Android devra passer par le moteur Rust Kira + CPAL, pas par le recorder Obj-C/Swift/macOS.

### 5. Le provider voice/capture n'a pas de fallback Web

- `src/squirrel/voice/service.js` active `iplug_native_recorder` seulement si `record_start` et `record_stop` existent.
- En browser pur, il n'y a pas aujourd'hui de provider capture Web dédié pour le workflow voix.

## Architecture cible

### Règle de décision unique

Le choix du backend ne doit plus dépendre de chemins parallèles non alignés. Il faut centraliser la décision dans un seul résolveur runtime.

Ordre cible:

1. `tauri_native_kira`
2. `ios_auv3_native`
3. `android_native_kira`
4. `web_wasm_kira`
5. `web_capture_fallback`

### Mapping cible par runtime

| Runtime | Playback | Record | Tech principale |
|---|---|---|---|
| Story desktop/Tauri | Kira natif | CPAL natif | Rust + Tauri |
| W3 desktop/Tauri | Kira natif | CPAL natif | Rust + Tauri |
| iOS AUv3 | AUv3/iOS natif | AUv3/iOS natif | Swift + AudioUnit |
| Android | Kira natif | CPAL natif | Rust + mobile runtime |
| Web | Kira WASM | Web capture fallback | WASM + Web Audio |

### Principe important

Le Web pur doit rester séparé en deux couches:

- lecture: Kira en WASM
- capture: Web Audio API native du navigateur

Il ne faut pas essayer de forcer `MediaRecorder` comme technologie primaire de capture pour l'audio moteur. `MediaRecorder` doit rester une sécurité de compatibilité.

## Technologies à utiliser

### Playback natif desktop/mobile

- Rust
- Kira
- CPAL
- Tauri commands pour desktop
- binding mobile selon le runtime déjà en place

### iOS Audio Unit

- Swift
- AUv3
- AudioUnit render callbacks
- recorder core partagé

### Web playback

- Rust compilé en WebAssembly
- `wasm-bindgen`
- Kira avec backend CPAL WASM
- chargement des clips par bytes ou URL

### Web recording

Chemin principal:

- `navigator.mediaDevices.getUserMedia({ audio: true })`
- `AudioContext`
- `MediaStreamAudioSourceNode`
- `AudioWorkletNode`
- capture PCM mono/stéréo
- resampling si nécessaire
- encapsulation WAV PCM 16-bit avant persistence ou upload

Fallback:

- `MediaRecorder`

Pourquoi ce choix:

- `AudioWorklet` donne un contrôle précis du PCM
- permet le metering en direct
- permet un export WAV cohérent avec le reste du pipeline
- évite les limites de format et d'encodage variables de `MediaRecorder`

## Actions à mener

### Phase 1. Stabiliser le backend natif Tauri

But:

- faire de Kira + CPAL le backend officiel natif pour Story et W3 sur desktop

Actions:

- garder `src-tauri/src/audio_engine/playback.rs` comme moteur de playback canonique
- garder `src-tauri/src/audio_engine/recorder.rs` comme moteur de record canonique
- décider si `src-tauri/src/iplug_bridge.rs` reste seulement un bridge de compatibilité ou s'il est déprécié à terme
- corriger le chemin `eVe -> __toDSP -> tauri_audio_bridge -> iplug_send`

Code à écrire:

- dans `src/application/eVe/domains/media/api/audio_api.js`
  - supprimer l'envoi stringifié vers `window.__toDSP`
  - envoyer un objet JS natif

Exemple:

```js
function sendToIPlug(payload) {
    try {
        if (window.__toDSP) {
            window.__toDSP(payload);
            return true;
        }
    } catch (_) {}
    try {
        const handlers = window.webkit?.messageHandlers;
        if (handlers?.swiftBridge?.postMessage) {
            handlers.swiftBridge.postMessage(payload);
            return true;
        }
        if (handlers?.squirrel?.postMessage) {
            handlers.squirrel.postMessage(payload);
            return true;
        }
    } catch (_) {}
    return false;
}
```

### Phase 2. Introduire un résolveur runtime unique

But:

- éviter les choix implicites dispersés entre façade audio, eVe, voice, AUv3, Tauri

Créer un module dédié:

- `src/application/audio_runtime/runtime_audio_backend.js`

Responsabilités:

- détecter le runtime
- choisir playback backend
- choisir record backend
- exposer une décision structurée

Exemple:

```js
export function resolveAudioRuntime(env = window) {
    const isTauri = !!(env.__TAURI__ || env.__TAURI_INTERNALS__);
    const isAUv3 = env.__HOST_ENV === 'auv3'
        || !!(env.webkit?.messageHandlers?.swiftBridge && env.__AUV3_MODE__ === true);
    const hasWasm = typeof WebAssembly !== 'undefined';
    const hasWebCapture = !!(env.navigator?.mediaDevices?.getUserMedia);

    if (isAUv3) {
        return {
            runtime: 'ios_auv3',
            playback: 'ios_auv3_native',
            record: 'ios_auv3_native'
        };
    }

    if (isTauri) {
        return {
            runtime: 'tauri_native',
            playback: 'tauri_native_kira',
            record: 'tauri_native_kira'
        };
    }

    if (hasWasm) {
        return {
            runtime: 'web',
            playback: 'web_wasm_kira',
            record: hasWebCapture ? 'web_capture_fallback' : 'unsupported'
        };
    }

    return {
        runtime: 'web_legacy',
        playback: 'html',
        record: hasWebCapture ? 'web_capture_fallback' : 'unsupported'
    };
}
```

### Phase 3. Brancher réellement Kira dans la façade produit

But:

- faire de `kira` le backend normal, pas seulement une implémentation optionnelle présente dans le repo

Actions:

- décommenter ou intégrer dans le bootstrap produit:
  - `src/application/audio_runtime/audio.facade.js`
  - `src/application/audio_runtime/backend.kira.js`
- modifier l'auto-détection pour privilégier `kira`
- garder `iplug` en compatibilité de transition

Code à écrire:

- dans `src/application/index.js` ou dans un bootstrap eVe dédié

Exemple:

```js
import('./audio_runtime/audio.facade.js');
import('./audio_runtime/backend.kira.js');
import('./audio_runtime/tauri_audio_bridge.js');
```

Puis dans `audio.facade.js`, remplacer le boot final:

```js
audio.detect_and_set_backend(['kira', 'iplug', 'html']);
```

### Phase 4. Compléter le crate WASM

But:

- obtenir un vrai backend WebAssembly atome audio, pas seulement un player

Fichier:

- `platforms/web/audio-wasm/src/lib.rs`

Ajouter:

- `audio_record_start`
- `audio_record_push_pcm`
- `audio_record_stop`
- `audio_get_levels`

Choix technique:

- ne pas faire dépendre l'acquisition micro WASM de CPAL comme point d'entrée métier
- faire remonter le PCM depuis JS vers le module WASM
- laisser au JS Web la responsabilité de `getUserMedia` et de l'`AudioWorklet`
- utiliser WASM pour:
  - metering
  - traitement éventuel
  - assemblage du résultat si nécessaire

Exemple d'API cible:

```rust
#[wasm_bindgen]
pub fn audio_record_start(sample_rate: u32, channels: u16) -> Result<(), JsValue>;

#[wasm_bindgen]
pub fn audio_record_push_pcm(data: &[f32]) -> Result<(), JsValue>;

#[wasm_bindgen]
pub fn audio_record_stop() -> Result<Box<[u8]>, JsValue>;

#[wasm_bindgen]
pub fn audio_get_levels() -> Result<JsValue, JsValue>;
```

Remarque:

- pour le Web, cette API est plus robuste qu'un `audio_record_start()` purement interne au module, car le navigateur impose de toute façon une orchestration JS pour les permissions et la capture.

### Phase 5. Créer un adaptateur Web capture dédié

But:

- fournir le seul fallback d'enregistrement du mode Web

Créer:

- `src/application/audio_runtime/backend.web.capture.js`

Responsabilités:

- ouvrir `getUserMedia`
- créer `AudioContext`
- capturer via `AudioWorklet`
- calculer metering
- pousser les chunks PCM vers WASM si disponible
- sinon encoder WAV côté JS
- exposer `record_start` et `record_stop`

Code à écrire:

```js
export async function createWebCaptureRuntime({
    sampleRate = 16000,
    channels = 1,
    onLevels = null,
    onChunk = null
} = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);

    const workletSource = `
    class AtomeRecorder extends AudioWorkletProcessor {
      process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;
        const ch0 = input[0];
        const mono = new Float32Array(ch0.length);
        mono.set(ch0);
        this.port.postMessage({ pcm: mono }, [mono.buffer]);
        return true;
      }
    }
    registerProcessor('atome-recorder', AtomeRecorder);
    `;

    const blob = new Blob([workletSource], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await ctx.audioWorklet.addModule(url);

    const node = new AudioWorkletNode(ctx, 'atome-recorder');
    const chunks = [];

    node.port.onmessage = (event) => {
        const pcm = event.data?.pcm;
        if (!pcm) return;
        chunks.push(pcm);
        if (typeof onChunk === 'function') onChunk(pcm);
        if (typeof onLevels === 'function') {
            let peak = 0;
            for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
            onLevels({ peak });
        }
    };

    const silent = ctx.createGain();
    silent.gain.value = 0;

    src.connect(node);
    node.connect(silent);
    silent.connect(ctx.destination);

    return {
        async stop() {
            src.disconnect();
            node.disconnect();
            silent.disconnect();
            stream.getTracks().forEach((track) => track.stop());
            await ctx.close();
            return chunks;
        }
    };
}
```

### Phase 6. Exposer un recorder Web-compatible pour voice

But:

- le workflow vocal doit continuer à fonctionner en browser pur

Fichiers:

- `src/application/audio_runtime/record_audio_api.js`
- `src/squirrel/voice/service.js`

Actions:

- ajouter un fallback browser dans `record_audio_api.js`
- si contexte `browser`, appeler le runtime Web capture
- dans `service.js`, faire apparaître un provider `web_capture_recorder`

Code à écrire dans `service.js`:

```js
const captureSelected = (() => {
    if (typeof recordStart === 'function' && typeof recordStop === 'function') {
        return 'iplug_native_recorder';
    }
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        return 'web_capture_recorder';
    }
    return 'unsupported';
})();
```

### Phase 7. Clarifier le contrat iOS AUv3

But:

- verrouiller la règle métier:
  - AUv3 iOS = natif
  - source `mic` = input bus
  - source `plugin` = output bus

Actions:

- conserver `platforms/ios/atome-auv3/auv3/utils.swift` comme implémentation canonique iOS
- documenter explicitement que ce chemin ne doit pas être remplacé par WASM
- garder le bridge JS `iplug_recording` pour compatibilité UI

Rien à réécrire en profondeur ici si le comportement actuel convient.

### Phase 8. Préparer Android

But:

- rendre la cible Android cohérente avec desktop Tauri

Actions:

- faire passer Android par le moteur Rust `audio_engine`
- ne pas dépendre de `native_recorder.rs`
- prévoir une couche bridge mobile qui appelle:
  - `audio_init`
  - `audio_record_start`
  - `audio_record_stop`

Pré-requis:

- vérifier le runtime mobile actuel retenu pour Android
- vérifier si l'app Android passe bien par Tauri mobile ou autre conteneur

## Fichiers à modifier

### Priorité 1

- `src/application/eVe/domains/media/api/audio_api.js`
- `src/application/audio_runtime/tauri_audio_bridge.js`
- `src/application/audio_runtime/audio.facade.js`
- `src/application/audio_runtime/backend.kira.js`
- `src/application/audio_runtime/record_audio_api.js`
- `src/squirrel/voice/service.js`

### Priorité 2

- `platforms/web/audio-wasm/src/lib.rs`
- `src/application/audio_runtime/backend.web.capture.js`
- `src/application/audio_runtime/runtime_audio_backend.js`

### Priorité 3

- `src/application/index.js` ou bootstrap eVe équivalent
- tests front de backend audio
- tests Tauri de workflow record/playback

## Tests à écrire

### Objectif du plan de test

Le moteur doit être validé sur quatre familles de cas:

- lecture
- enregistrement
- direct from disk
- direct to disk

Il faut aussi ajouter une validation dédiée:

- synchro lecture/enregistrement
- précision au sample près pour les calages
- robustesse du workflow UI/debug

### Jeux de signaux de référence

Créer un dossier de fixtures audio déterministes:

- `src/application/eVe/tests/fixtures/audio/impulse_1s_48k_mono.wav`
- `src/application/eVe/tests/fixtures/audio/click_track_120bpm_48k_mono.wav`
- `src/application/eVe/tests/fixtures/audio/sine_440_5s_48k_mono.wav`
- `src/application/eVe/tests/fixtures/audio/voice_ref_16k_mono.wav`
- `src/application/eVe/tests/fixtures/audio/stereo_pan_lr_48k.wav`

But de chaque fixture:

- `impulse`: mesurer un décalage exact en index d'échantillon
- `click_track`: mesurer la stabilité temporelle et le drift
- `sine`: valider lecture continue et absence de glitch
- `voice_ref`: valider la chaîne voix
- `stereo_pan_lr`: valider routing et respect des canaux

### Outillage de test

Créer un petit outillage de mesure:

- `src/application/eVe/tests/audio/analyze_wav_alignment.mjs`
- `src/application/eVe/tests/audio/build_audio_fixtures.mjs`
- `src/application/eVe/tests/audio/assert_wav_props.mjs`
- `src/application/eVe/tests/audio/run_native_audio_matrix.mjs`

Responsabilités:

- lire un WAV
- vérifier sample rate, channels, durée
- détecter le premier sample non nul ou le premier pic au-dessus d'un seuil
- calculer `delta_samples`
- calculer `delta_ms`
- produire un rapport JSON exploitable par CI et par debug manuel

Exemple de sortie:

```json
{
  "fixture": "impulse_1s_48k_mono.wav",
  "expectedSample": 24000,
  "measuredSample": 24000,
  "deltaSamples": 0,
  "deltaMs": 0,
  "sampleRate": 48000,
  "channels": 1,
  "status": "ok"
}
```

### Lecture

#### Tauri

- initialiser le moteur via `audio_init`
- charger un clip depuis mémoire
- charger un clip depuis disque
- lancer `play`
- lancer `stop`
- vérifier absence d'erreur bridge/Tauri
- vérifier durée et fin de lecture attendue
- vérifier lecture mono et stéréo
- vérifier changement de volume
- vérifier changement de playback rate

#### AUv3

- charger un buffer de référence dans l'hôte
- lancer la lecture via le chemin natif AUv3
- vérifier que le render callback produit les bons buffers
- vérifier stabilité sur plusieurs cycles start/stop
- vérifier lecture plugin seule et lecture mixée si le host le permet

#### Web

- charger le module WASM
- lire un clip via bytes
- lire un clip via URL/asset
- vérifier fallback propre si WASM indisponible

### Enregistrement

#### Tauri

- `record_start` micro
- `record_stop`
- vérifier création du WAV
- vérifier taille non nulle
- vérifier sample rate et channels attendus
- vérifier événements `record_started` et `record_done`
- vérifier seconde capture après une première session sans fuite d'état

#### AUv3

- record `mic`
- record `plugin`
- vérifier refus propre sur `sample_rate` ou `channel_count` incompatibles
- vérifier émission `iplug_recording`
- vérifier que l'arrêt flush bien le fichier final

#### Web

- fallback capture via `getUserMedia`
- capture PCM via `AudioWorklet`
- fallback `MediaRecorder` si `AudioWorklet` indisponible
- encodage WAV final
- vérification permission refusée et message d'erreur propre

### Direct From Disk

Le cas "direct from disk" doit vérifier que la lecture ne dépend pas d'un préchargement complet en mémoire pour les assets longs.

Tests à ajouter:

- lecture d'un fichier WAV long depuis chemin disque en Tauri
- lecture d'un fichier compressé si ce format est supporté par le backend final
- vérification du temps de démarrage de lecture
- vérification qu'un seek ou repositionnement reste cohérent
- vérification d'absence de blocage UI lors du démarrage

Technologies:

- Tauri command dédiée si nécessaire
- Kira streaming si supporté sur le backend retenu
- fixture audio longue de 2 à 10 minutes

### Direct To Disk

Le cas "direct to disk" doit vérifier que l'enregistrement long ne dépend pas d'un buffer RAM illimité.

Tests à ajouter:

- enregistrement direct vers fichier sur Tauri
- rotation propre `start -> stop -> start -> stop`
- vérification de flush disque à l'arrêt
- validation d'un enregistrement long
- validation qu'un crash contrôlé ou fermeture rapide ne produit pas un fichier vide silencieux sans signaler l'erreur

Pour AUv3:

- vérifier si le host écrit directement sur disque ou si l'extension retourne un buffer
- si le host écrit sur disque, ajouter le même plan de test
- sinon, documenter explicitement la limite et le point exact où l'écriture disque a lieu

### Synchro lecture/enregistrement

Il faut ajouter un protocole explicite de mesure de synchro pour les opérations de calage.

Principe:

- jouer un fichier `impulse` ou `click_track`
- lancer simultanément un record
- récupérer le fichier enregistré
- mesurer la position du premier pic dans le signal capturé
- comparer à la position attendue

Mesures à produire:

- `delta_samples`
- `delta_ms`
- dérive cumulée sur 10 s, 30 s, 60 s
- variance entre plusieurs runs

Seuils recommandés:

- chemin purement bufferisé/offline: cible `0 sample`
- chemin natif live: mesurer la latence absolue, mais exiger une latence stable et un `delta_samples` constant
- pour les opérations de calage, stocker la latence mesurée et l'utiliser comme offset de compensation

### Précision à l'échantillon près

Le calage sample-accurate ne doit pas reposer sur l'horloge UI.

Méthode recommandée:

- injecter une impulsion unique à l'index `N`
- enregistrer le retour ou la source monitorée
- détecter le premier pic au-dessus d'un seuil fixé
- calculer `measuredIndex - N`
- répéter sur plusieurs `sampleRate`

Matrice minimale:

- 44.1 kHz mono
- 48 kHz mono
- 48 kHz stéréo
- 96 kHz si le runtime le supporte

Résultat attendu:

- chemin de rendu déterministe: `delta_samples = 0`
- chemin temps réel: `delta_samples` constant, documenté et compensable

### Utiliser `debug_UI.md`

Le debug UI doit servir à verrouiller l'état métier pendant les tests audio end-to-end.

Fonctions à exploiter:

- `window.__DEBUG__.setDeterministicTestMode(true)` pour les tests de géométrie et d'état
- `window.__DEBUG__.getAppState()`
- `window.__DEBUG__.getFooterState()`
- `window.__DEBUG__.getTimelineState()`
- `window.__DEBUG__.exportSnapshot()`

Usage recommandé:

- avant le test, activer le mode déterministe si le test ne dépend pas d'une animation
- piloter l'UI avec Playwright
- capturer l'état `__DEBUG__`
- capturer screenshot
- stocker en même temps le WAV généré et le JSON debug

Exemples de validations UI/audio:

- le bouton Record est visuellement latché et `recordBridge.active === true`
- la timeline est active au démarrage du playback
- l'état footer reflète bien le mode `key` ou `live`
- un start/stop audio sans erreur laisse un état footer propre

### Solution de test natif Tauri

Créer un harness de test Tauri piloté depuis JS mais vérifié par artefacts audio natifs.

Proposition:

- lancer l'app Tauri sur Mac
- piloter l'UI via Playwright ou équivalent navigateur embarqué si possible
- exposer des commandes Tauri de test seulement en mode debug
- générer les WAV de sortie dans un dossier temporaire
- analyser les fichiers via `analyze_wav_alignment.mjs`

Compléments utiles:

- ajouter un mode `test loopback` dans le moteur Rust pour router une source connue vers l'enregistreur
- ajouter un mode `test tone/impulse generator` côté Rust
- produire un JSON de métadonnées par run:
  - `runtime`
  - `device`
  - `sample_rate`
  - `buffer_size`
  - `expected_sample`
  - `measured_sample`
  - `delta_samples`

Cette approche permet de tester:

- playback seul
- record seul
- playback + record synchronisés
- direct-to-disk
- direct-from-disk

### Solution de test natif AUv3 sur iOS et Mac

Il faut un host de test minimal pour AUv3, pas seulement l'UI JS.

Proposition:

- créer ou réutiliser un host AUv3 de test sur Mac et iOS
- charger l'extension AUv3
- injecter un signal connu dans l'input bus
- enregistrer la sortie plugin et/ou micro selon le scénario
- exporter les fichiers dans un dossier de test partagé
- analyser ensuite les WAV avec le même outillage JS

Deux niveaux de test:

- niveau 1: tests sur macOS avec host AUv3 de debug pour itérations rapides
- niveau 2: tests sur iOS réel pour valider la réalité device/driver/latence

Approche pragmatique:

- Mac: host de test rapide pour la majorité des runs
- iOS réel: campagne courte de validation avant merge majeur audio

### Matrice de test minimale

- Tauri Mac: lecture, record, direct-from-disk, direct-to-disk
- AUv3 Mac host: lecture plugin, record plugin, synchro
- AUv3 iOS réel: record mic, record plugin, synchro
- Web browser: playback WASM, capture `AudioWorklet`, fallback `MediaRecorder`

### Fichiers de test à créer

- `src/application/eVe/tests/audio/analyze_wav_alignment.mjs`
- `src/application/eVe/tests/audio/run_tauri_audio_playback_probe.mjs`
- `src/application/eVe/tests/audio/run_tauri_audio_record_probe.mjs`
- `src/application/eVe/tests/audio/run_tauri_audio_sync_probe.mjs`
- `src/application/eVe/tests/audio/run_web_audio_capture_probe.mjs`
- `src/application/eVe/tests/audio/fixtures/audio/README.md`
- `platforms/ios/atome-auv3/auv3/tests/AudioEngineHostTests.swift`
- `platforms/ios/atome-auv3/auv3/tests/AudioEngineSyncTests.swift`

### Critères d'acceptation

- Story et W3 passent bien par le backend natif en Tauri
- AUv3 iOS ne bascule jamais sur WASM
- Web n'utilise WASM que pour le playback
- Web enregistre via capture Web et non via faux bridge natif
- les tests de calage exposent un `delta_samples` mesuré
- les offsets de latence sont documentés par runtime
- les artefacts de test permettent de rejouer un diagnostic sans ambiguïté

## Ordre recommandé d'implémentation

1. Corriger `audio_api.js` pour ne plus stringifier le payload bridge.
2. Introduire le résolveur runtime audio unique.
3. Brancher officiellement `audio.facade.js` + `backend.kira.js` dans le bootstrap produit.
4. Ajouter `backend.web.capture.js`.
5. Ajouter le fallback browser dans `record_audio_api.js` et `voice/service.js`.
6. Compléter `platforms/web/audio-wasm/src/lib.rs` pour le metering et le record bufferisé.
7. Ajouter les tests runtime.

## Décision finale

La pile recommandée est:

- natif desktop/mobile Android: `Rust + Kira + CPAL`
- iOS Audio Unit: `Swift + AUv3 natif`
- web playback: `Kira en WebAssembly`
- web recording: `getUserMedia + AudioWorklet`, `MediaRecorder` en fallback

Il ne faut pas chercher à faire du WASM le point d'entrée unique de capture micro sur le Web. Le navigateur impose un pilotage JS pour la permission, le stream et le graphe audio. Le bon design est:

- JS Web capture le micro
- JS pousse le PCM dans le pipeline atome/WASM
- WASM reste le moteur audio playback et éventuellement traitement/metering

Cela respecte le besoin produit:

- Story: natif
- W3: natif
- iOS Audio Unit: natif
- Android: natif
- Web seul: WASM pour playback, Web capture pour record
