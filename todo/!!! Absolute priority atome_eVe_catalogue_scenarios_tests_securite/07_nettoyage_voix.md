# R-246 phase 3 — Nettoyage de la voix : carte, classement, lots

Relevé du 19 nov. 2026, lecture du code (sous-agent en lecture seule), puis appelants revérifiés à la main pour
chaque suppression proposée. Une ligne « inutilisé » n'est retirée qu'après preuve (grep des appelants, import ESM,
sonde). La dictée libre de chaque plateforme est validée **avant** toute migration de moteur.

## La carte, par responsabilité

Le centre : `atome/src/squirrel/voice/service.js#createVoiceService` (réveil, STT, deux TTS, capture, VAD), exposé
en `window.AtomeVoice` par `bootstrap.js`.

| Responsabilité | Web | Tauri bureau / Android | iOS | Statut |
| --- | --- | --- | --- | --- |
| Mot d'éveil « Ève, écoute-moi » | `wake_detector.js` + worker (openWakeWord ONNX, onnxruntime-web) | le même en veille ; `audio-engine/src/voice/wake.rs` (portage Rust) pour le guide raccroché | idem, Rust par `NativeKiraEngine` | **doublon de logique** (JS + Rust, même modèle) |
| Commandes guidées | `browser_voice_engine.js` (vosk-browser WASM + Silero) | `native_voice_engine.js` → `audio-engine` voice (Vosk + grammaire, Silero) | même JS → Vosk iOS | utilisé ; recoupe le planificateur déterministe hors ligne (incertain) |
| Dictée libre | `service_browser_stt.js` (Web Speech) ; en ligne `service_assistant_stt.js` (transcription serveur) | `tauri-plugin-stt` : Vosk + cpal, modèles **téléchargés** ; Android : `SpeechRecognizer` | `AppNativeSpeechRecognizer.swift` (SFSpeech) | utilisé ; `tauri-plugin-stt/ios` jamais compilé (doublon) |
| Guide hors ligne | `first_launch_guide.js`, `assistant_offline.js` | idem | idem | utilisé |
| Conversation | `conversation_session.js`, `assistant_session_controller.js`, `realtime_session.js` (en ligne) | idem | idem + CarPlay, montre | utilisé |
| Synthèse | Piper `fr_FR-siwis-medium` ONNX (`tts_runtime.js`), lignes préenregistrées `voice_lines.js`, TTS serveur (1 appelant) | idem | idem ; `AtomeGPSHost.m` AVSpeech pour le GPS natif | utilisé ; AVSpeech GPS incertain |
| Capture / VAD | `wake_capture.js` + worklet, `vad.js` | `audio-engine` cpal (2 captures : plugin STT et voice) | `AppNativeWakeCapture.swift` | utilisé |

## Actifs voix (du -h)

| Actif | Taille | Lu par |
| --- | --- | --- |
| `atome/src/assets/voice/vosk/vosk-model-small-fr-0.22/` | 65 Mo | moteur natif (`session.rs:56`) |
| `atome/src/assets/voice/vosk/vosk-model-small-fr-0.22.tar.gz` | 40 Mo | vosk-browser (`browser_voice_engine.js:10`), paquet iOS |
| `atome/src/assets/voice/fr_FR-siwis-medium/*.onnx` | 60 Mo | `local_tts_worker.js`, `generate_voice_lines.mjs` |
| `atome/src/assets/voice/lines_fr/` | 20 Mo | `voice_lines.js` |
| `atome/src/assets/vendor/onnxruntime-web/` | 13 Mo | 3 workers |
| `platforms/desktop-tauri/native/lib/libvosk.dylib` / `android/.../libvosk.so` | 12 / 9,6 Mo | `build.rs`, `build.gradle.kts` |
| `atome/src/assets/vendor/vosk-browser/vosk.js` | 5,5 Mo | `browser_voice_engine.js` |
| `atome/src/assets/voice/wake/` + `vad/silero_vad.onnx` | 2,6 + 2,2 Mo | workers JS et `session.rs` |

Le même modèle Vosk français existe trois fois : dossier extrait (natif), archive (navigateur), et le téléchargement
du plugin STT au bureau (`model_catalog.rs`).

## Classement en cinq preuves

| Brique | Classe | Preuve | Lot |
| --- | --- | --- | --- |
| `home_surface_i18n.js` (202 l.) | inutilisé | seul `tests/eve/assistant_voice_runtime.test.mjs:9` l'importe | V1 |
| `isAffirmativeDecision` / `isNegativeDecision` | inutilisé | 0 appelant hors définition | V1 |
| `user_login_voice.js` : `isAffirmative`, `isNegative`, `speakLoginVoiceGuidancePrompt` | inutilisé | 0 appelant hors bloc d'export | V1 |
| `user_login_sequence.js#startVoiceCapture` | inutilisé | 0 appel `.startVoiceCapture` | V1 |
| « Dicter » d'ordonnance et d'aide à la prescription | doublon | recopie de `createDashboardDictation`, le propriétaire unique de la dictée | V1 |
| `tauri-plugin-stt/android/build/` (2,4 Mo) | régénérable | sortie de build non suivie | fait (19 nov.) |
| `tauri-plugin-stt/ios/` (48 Ko) | inutilisé | l'app iOS n'est pas Tauri ; déclaré dans `build.rs` (`ios_path`) | V2 |
| `service.vad` / `AtomeVoice.vad`, `planFollowup` | incertain | appelés seulement par `tests/.../service.probe.mjs` ; API publique de `AtomeVoice` | à trancher |
| Mot d'éveil JS + Rust | doublon de logique | `wake.rs:1-4` se dit portage du JS | V3 (mesures) |
| Deux Vosk au bureau (plugin STT téléchargé + voice embarqué) | doublon | deux captures cpal, trois sources du modèle | V3 (dictée validée d'abord) |
| AVSpeech du GPS iOS | incertain | voix de navigation en arrière-plan | à trancher |
| Scripts `phase9_voice_*` | incertain | hors `package.json`, simulent `speechSynthesis` retiré | V2 |

## Avancement

- 19 nov. : carte faite ; `tauri-plugin-stt/android/build/` supprimé (2,4 Mo) ; lot V1 accordé par l'orchestrateur.
- Lot V1 fait (19 nov.) :
  - supprimé `atome/src/squirrel/voice/home_surface_i18n.js` (202 lignes, 10 Ko) ; le test `assistant_voice_runtime` vise désormais le vrai propriétaire du message, `ai_planner_runtime_context.js#localizeAiFailure` (vitest 18/18) ;
  - retirés `isAffirmativeDecision`, `isNegativeDecision` et leurs deux listes de mots (`home_surface_transcript.js`) ; `isAffirmative`, `isNegative`, `speakLoginVoiceGuidancePrompt` (`user_login_voice.js`, qui n'exporte plus que `speakLoginText`) ; `startVoiceCapture` (`user_login_sequence.js`) ; la clé `eve.user.login_choice.voice_guidance_prompt` (fr, en) ;
  - la dictée de l'aide à la prescription et de l'ordonnance passe par `createDashboardDictation` : quitter l'écran arrête désormais l'écoute (avant, le micro restait ouvert et les mots étaient envoyés après coup) ; ordonnance 218 → 212 lignes, aide 235 → 231 ;
  - preuves : Biome propre, import ESM des 5 fichiers, vitest `assistant_voice_runtime` 18/18 ; sonde dans la vraie page `temp/r246_media/lot12_v1_bug14.probe.mjs` 30/30 verte (passe 18, 19 nov.) ; retest indépendant à faire.
