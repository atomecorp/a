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
| `atome/src/assets/voice/vosk/vosk-model-small-fr-0.22.tar.gz` | 40 Mo | vosk-browser (`browser_voice_engine.js:10`), navigateur seul : exclu des paquets iOS, Android et bureau (24 nov.) |
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
| `tauri-plugin-stt/ios/` (48 Ko) | inutilisé | l'app iOS n'est pas Tauri ; déclaré dans `build.rs` (`ios_path`) | V2 fait (24 nov.) |
| `service.vad` / `AtomeVoice.vad`, `planFollowup` | inutilisé (façades) | aucun appelant hors `service.probe.mjs` (app, natif, cartes) ; `vad.js` lui-même sert à `service_assistant_stt.js` | retirés (24 nov.) |
| Mot d'éveil JS + Rust | doublon de logique | sur appareil, la veille passait par le worker JS nourri du PCM natif (`audio_wake_read` toutes les 80 ms), le guide raccroché par `wake.rs` | V3 fait (24 nov.) : un seul détecteur par plateforme, Rust sur appareil, le worker au navigateur seul |
| Deux Vosk au bureau (plugin STT téléchargé + voice embarqué) | **utilisé, gardé** (24 nov.) | pas un doublon : la dictée libre télécharge le **grand** modèle français `vosk-model-fr-0.22` (~1,4 Go, `model_catalog.rs:5`) et 9 langues ; les commandes guidées lisent le **petit** modèle à grammaire. Les fusionner sur le petit dégraderait la dictée (interdit) ; le « troisième exemplaire » du petit modèle n'existe pas | aucun |
| AVSpeech du GPS iOS | utilisé, gardé (24 nov.) | `AtomeGPSHost.m:83-103` : la navigation tourne dans un `JSContext` natif, appelé par chaque position reçue en arrière-plan (`allowsBackgroundLocationUpdates`), WebView suspendue. Ses intentions `speak` ne peuvent donc pas passer par Piper (`tts_runtime.js`, dans la WebView) : seule une synthèse native parle l'écran éteint | aucun |
| Scripts `phase9_voice_*` | cassé (périmé) | `phase9_voice_latency_baseline.mjs` simulait `speechSynthesis` retiré et s'arrêtait sur `stt_offline_unavailable` ; la suite d'interruption ne fait qu'enchaîner 5 sondes | réparés (24 nov.) |

## Avancement

- 19 nov. : carte faite ; `tauri-plugin-stt/android/build/` supprimé (2,4 Mo) ; lot V1 accordé par l'orchestrateur.
- Lot V1 fait (19 nov.) :
  - supprimé `atome/src/squirrel/voice/home_surface_i18n.js` (202 lignes, 10 Ko) ; le test `assistant_voice_runtime` vise désormais le vrai propriétaire du message, `ai_planner_runtime_context.js#localizeAiFailure` (vitest 18/18) ;
  - retirés `isAffirmativeDecision`, `isNegativeDecision` et leurs deux listes de mots (`home_surface_transcript.js`) ; `isAffirmative`, `isNegative`, `speakLoginVoiceGuidancePrompt` (`user_login_voice.js`, qui n'exporte plus que `speakLoginText`) ; `startVoiceCapture` (`user_login_sequence.js`) ; la clé `eve.user.login_choice.voice_guidance_prompt` (fr, en) ;
  - la dictée de l'aide à la prescription et de l'ordonnance passe par `createDashboardDictation` : quitter l'écran arrête désormais l'écoute (avant, le micro restait ouvert et les mots étaient envoyés après coup) ; ordonnance 218 → 212 lignes, aide 235 → 231 ;
  - preuves : Biome propre, import ESM des 5 fichiers, vitest `assistant_voice_runtime` 18/18 ; sonde dans la vraie page `temp/r246_media/lot12_v1_bug14.probe.mjs` 30/30 verte (passe 18, 19 nov.) ; retest indépendant à faire.
- Reprise le 24 nov. : passe 19 sur l'arbre du jour, lot 12 encore vert 18/18 (BUG-0014, V1) ; retest indépendant en cours (`temp/r246_retest4/`).
- Sondes voix périmées trouvées le 24 nov. : `tests/atome/src/squirrel/voice/service.probe.mjs` attend encore la synthèse `speechSynthesis` retirée (le service choisit `local_onnx`) ; `scripts/phase9_voice_latency_baseline.mjs` s'arrête sur `stt_offline_unavailable` (la dictée hors ligne exige la reconnaissance sur l'appareil). Les quatre autres sondes de la suite d'interruption passent. Remise au réel en cours (sous-agent) ; `vad` et `planFollowup` tranchés après elle.

## Lot P1 — un seul propriétaire du projet courant (24 nov.)

| Avant | Après |
| --- | --- |
| ~15 lecteurs recopiés (`tool_runtime_context`, `communication_base`, `clipboard/state`, `dashboard_environment`, `project_view_records`, `media_api_shared`, `delete`, `calendar_model`, `project_data`, `tool_genesis_lifecycle_runtime`, `bevy_panel_tags/info/interaction_runtime`, `main_menu_auth_runtime`, `text_tool_over_atom`, `selection_keyboard_shortcuts`, `armed_tool_rail`, `interaction_runtime`) ; replis sur des globales jamais posées (`selectedProjectId`, `__CURRENT_PROJECT_ID`, `currentProjectId`, `eVeState`) et sur le DOM `#project_view_<id>` (3 lecteurs + `getProjectContainer`) | `eVe/core/current_project.js` : `currentProjectId()` (la fiche de session `__currentProject`, comme `adole_api/projects.js`) et `shownProjectId()` (le projet à l'écran en mode projet) ; les lecteurs délèguent ou sont retirés ; `getProjectContainer` et `getProjectIdFromDom` supprimés |

Preuves : Biome propre sur les 21 fichiers ; sonde dans la vraie page `temp/r246_media/lot13_p1_current_project.probe.mjs` 14/14 (passe 19 : tous les modules se chargent, tous les lecteurs donnent le même id sur le Dashboard et dans un projet, un texte créé sans `project_id` arrive dans le projet ouvert, une prise dans le projet). Au passage, deux variables mortes retirées (`armed_tool_rail_runtime.js#api`, l'import `toErrorMessage` de `media_api_shared.js`). Restent hors lot, en attente de leur session : `project_background_rail_runtime.js` (b490) et `communication_input_tool.js` (modifs locales d'une autre session) ; et deux lectures `eveToolBase.getCurrentProjectId || __currentProject` (`project_layer_runtime.js`, `audio_edit/context.js`) qui passent par la même source.

## Lot P2 — les lectures directes restantes (24 nov.)

| Avant | Après |
| --- | --- |
| 41 lectures directes de `__currentProject?.id` dans 32 fichiers. Elles suivent trois sens sans le dire : le projet de la session ; le projet de travail (`__eveWorkspaceMode.projectId \|\| __currentProject.id`, recopié dans 14 fichiers) ; le projet affiché. Cinq chaînes de repli retombent sur `AdoleAPI.projects.getCurrentId`, qui relit la même globale (`atome_timeline_dom`, `atome_commit_backend`, `activities_model`, `text_tool_runtime` + un repli DOM, `bevy_panel_timeline_controller`). Côté atome, trois lecteurs (`projects.js`, `activities_support.js`, ce dernier passant aussi par `AdoleAPI`) | `current_project.js` gagne `workProjectId(win)`, le projet de travail même sous le Dashboard. Les trois lecteurs prennent une `win` facultative, pour les modules qui injectent la leur. 26 fichiers eVe délèguent au propriétaire et les cinq chaînes deviennent une ligne. Côté atome, une seule lecture : `session.js#readWindowProjectId`, à côté de `updateWindowProject` qui l'écrit |

Défauts trouvés au passage et réparés :
- `text_tool_background_runtime.js#resolveProjectLayerElement` prenait le premier calque `project_view_*` venu quand celui du projet manquait. Ce pouvait être l'hôte du Dashboard. Le projet du texte était alors relu dans l'id de ce calque : un texte au clavier sur le fond pouvait viser un autre projet. Désormais, seulement le calque du projet visé.
- `tool_runtime_context.js#resolveInputTargetDescriptor` renvoyait l'id de l'hôte lui-même (`project_view_`) comme projet, faute de mieux. Désormais, ce projet ou le projet courant, sinon aucun.

Preuves statiques sur les 29 fichiers :
- Biome est propre.
- Le lint isolé `noUndeclaredVariables` ne trouve aucun nom non déclaré.
- Le lint `noUnusedVariables/noUnusedImports` ne trouve rien d'inutile.
- Les deux lints attrapent un cas témoin.
- Aucun appelant ne passe d'argument aux anciens noms réexportés, donc la `win` facultative ne change rien pour eux.

Preuve dans la vraie page : la sonde `temp/r246_media/lot13_p1_current_project.probe.mjs` charge maintenant les 26 modules et compare `workProjectId` et le lecteur atome au propriétaire, sur le Dashboard et dans un projet. Elle est à lancer à la passe 21, quand le swap le permettra.

Les cinq dernières lignes ont été migrées le même jour, une fois la voie accordée : `communication_input_tool.js`, `project_media_import_runtime.js`, `natural_band_palette_rail.js`, `project_background_rail_runtime.js`, `menu_work_context.js`. Il ne reste plus aucune lecture directe en dehors des deux propriétaires. Les 34 fichiers sont listés dans `temp/r246_media/p2/files.txt`.

À voir au lot suivant (P3) : les hôtes DOM d'atome (`.eve-atome`, `tool_genesis_host_runtime.js`, `atome_dom_id.js`) et les 12 lecteurs qui relisent un id de projet dans l'id d'un calque (`surface_hit_target_runtime`, `project_dom_state`, `context_target`, `text_tool_editing_runtime`…). Le calque `project_view_<id>` est l'hôte de la coque, toucher ou viser. Le garder ou non comme porteur d'identité est une question d'architecture, à mesurer avant de toucher.

## 24 nov. — sondes voix remises au réel, un défaut d'arrêt réparé, V2

- **Défaut réparé** (trouvé en remettant `service.probe.mjs` au réel) : arrêter une phrase la marquait d'abord « finie » (`tts_runtime.js#stop` règle la lecture, `service.js#tts.speak` prenait toute fin pour une fin naturelle), puis seulement « interrompue » : `resume_available` restait faux, « reprends » ne reprenait jamais une phrase arrêtée, la lecture passait `done` au lieu de `cancelled`, et `cancel_roundtrip_ms` valait 0 (la demande d'annulation était publiée après l'arrêt du son). Correctif `atome/src/squirrel/voice/service.js` : une fin `stopped` ne termine plus le tour ; `voice.cancel.requested` est publié avant l'arrêt. Preuve : `temp/r246_voice_probe/stop_order.mjs` (avant : `speaking > done > cancel > interruption`, `resume_available false` ; après : `speaking > cancel > interruption`, `resume_available true`, suite `resume_interrupted`), et quatre contrôles ajoutés à `service.probe.mjs`.
- **Sondes** : `service.probe.mjs` passe par la vraie route `local_onnx` (faux Worker au protocole de `local_tts_worker.js`, faux audio) et la vraie décision de route de la dictée (en ligne, sur l'appareil, assistant) ; seule assertion retirée : le choix d'une voix système `amelie-enhanced` (il n'y a plus qu'une voix, `fr_FR-siwis-medium`). `phase9_voice_latency_baseline.mjs` mesure la route actuelle (reconnaissance sur l'appareil déclarée, TTS `local_onnx` à faux moteur ; l'inférence ONNX n'est pas mesurée en Node). Les six scripts sortent à 0 ; vitest voix 24/24.
- **Façades retirées** : `service.vad` + le getter `AtomeVoice.vad`, `service.planFollowup` + `AtomeVoice.planFollowup` ; la sonde teste `createVoiceActivityDetector` et `orchestrator.planSessionFollowup` directement.
- **V2** : `platforms/desktop-tauri/vendor/tauri-plugin-stt/ios/` supprimé (48 Ko, jamais compilé : Tauri n'a que `gen/android`) ; `build.rs` sans `.ios_path("ios")` ; `src/mobile.rs` sans liaison iOS, une compilation pour iOS s'arrête sur un `compile_error!` qui nomme le vrai propriétaire (`AppNativeSpeechRecognizer.swift`) ; la ligne de `eVe/documentations/assistant_continuous_listening_plan.md` pointe ce propriétaire.


## 24 nov. — exports morts retirés (ménage élargi)

- **Inventaire** : `temp/r246_media/clean/dead_exports.mjs` compte chaque export de `atome/src` et `eVe` dans tout le code. 1 767 exports ne sont cités dans aucun autre fichier. 177 d'entre eux ne sont même pas cités dans leur propre fichier (`dead_exports.txt`, préfixe `1`).
- **Retrait sur l'arbre syntaxique** (`remove_dead.mjs`, avec le `parseAst` de rollup) : seulement dans les 108 fichiers qu'aucune session n'a modifiés. Sont exclus : `eVe/R&D`, `intuition/tools/molecule/*` (voie partagée), `core/media_engine`, et les `inspect*` (crochets de sonde). Chaque déclaration part avec ses lignes de commentaire juste au-dessus. Ensuite, `cascade.mjs` retire les aides de haut niveau et les imports que seuls ces exports utilisaient, jusqu'à ce qu'il n'y ait plus rien à retirer.
- **Résultat** : 141 exports retirés dans 94 fichiers, plus 8 aides et 8 imports devenus orphelins, soit 926 lignes en moins. Listes : `removed.txt`, `cascade1.txt`, `cascade.txt`.
- **Défaut au passage, réparé** : `project_drop_tool_projection_interaction_runtime.js` avait une variable inutilisée, `const result = invocation.result`. Elle est retirée.
- **Un faux mort rattrapé** : `isValidLogEnvelope` (`atome/src/shared/logging.js`) est importé par `dev/daemon/index.js`, un dossier que le scan ne couvrait pas. Il est remis tel quel. Pour l'attraper, les 141 noms ont été recherchés dans tout le dépôt suivi, les `.md` et `.csv` exceptés, puis dans les 87 fichiers non suivis : aucun autre appelant.
- **Preuves** :
  - Biome est propre avec la configuration du dépôt.
  - Les lints isolés `noUndeclaredVariables` et `noUnusedVariables/noUnusedImports` ne trouvent rien.
  - Les 95 modules s'importent dans Node : 95/95 (`load_check.mjs`).
- **Reste** : 1 590 exports ne sont cités que dans leur propre fichier. Là, on retirerait seulement le mot `export`, ce qui ne gagne pas de place. Ce n'est pas fait : le gain est nul et le risque de conflit avec les autres sessions réel.

## 24 nov. — Lot P3 : le projet d'un calque, un seul propriétaire

- Le propriétaire existait déjà : `eVe/intuition/matrix/core/project_dom_state.js#getProjectIdFromElement`. Il lit d'abord le registre `WeakMap` des calques, puis l'id `project_view_<id>`. Sept lecteurs refaisaient leur propre lecture de l'id à côté. Ils passent tous par lui maintenant :
  - `project_drop_projection_host_foundation_runtime.js` : la relecture qui suivait l'appel au propriétaire est retirée ;
  - `project_drop_event_runtime.js` ;
  - `tool_runtime_circle_tool_state.js` ;
  - `tool_genesis_realtime_patch_runtime.js` ;
  - `text_tool_editing_runtime.js` ;
  - `text_tool_background_runtime.js` ;
  - `debug_runtime.js`.
- **Au passage** : `tool_runtime_circle_tool_state.js` avait un repli `textContent || innerText`, inutile (`textContent` est toujours une chaîne) et signalé par Biome (`useDomNodeTextContent`). Il est retiré.
- **Laissés tels quels, à raison** :
  - `tool_runtime_context.js` lit un id de cible donné en chaîne, pas un élément ;
  - `surface_size_runtime.js` et `project_bootstrap_support.js` testent seulement si un élément est un calque.
- `intuition/mystic/context_target.js#resolveProjectContext` passe aussi par le propriétaire. La voie a été accordée et les ajouts de R-310 sont préservés. Biome est propre et le module s'importe.
- **Preuves** :
  - Biome est propre ;
  - les lints isolés (non déclarés, inutilisés) ne trouvent rien ;
  - les 7 modules s'importent dans Node (`p3_files.txt`).

## 24 nov. — Catalogue des briques par le MCP (`eve://bricks`)

Demande élargie (toi, 24 nov.) : « des briques modulaires que tu puisses assembler… le MCP… en mangeant le moins de tokens possible ».

- **Mesure** : le registre expose 2 080 outils au MCP. Leurs noms et descriptions font déjà 307 000 caractères, environ 77 000 tokens, sans compter les schémas. `tools/list` les rend tous, par pages de 50, schémas compris.
- **Fait** : `atome/src/squirrel/atome/mcp_bricks.js`, une ressource MCP qu'on lit comme un arbre.
  - `eve://bricks` donne les familles et leur nombre d'outils.
  - `eve://bricks/{famille}` donne ses sous-familles tant qu'elle a plus de 60 outils, sinon ses briques, une ligne chacune : nom, niveau de risque, première phrase.
  - `eve://bricks/{nom exact}` donne la brique entière, avec son schéma d'entrée.
  - Tout est lu dans le `tools/list` de l'appelant (`listUnifiedMcpTools`) : rien n'est écrit à la main, et une brique que ses droits refusent n'est pas montrée.
  - La ressource est branchée dans `mcp_resources.js` (gabarit et liste) et `mcp_handlers_platform.js#mcp.resources.read`. Capacité demandée : `mcp.read`, comme `eve://navigation`.
- **Composition** : elle existe déjà. `mcp.toolchains.execute` enchaîne des méthodes en un seul appel et s'arrête à une confirmation (règle 22). Elle n'a pas été doublée.
- **Preuves** :
  - `temp/r246_media/bricks/tree.probe.mjs` : 10/10 ALL OK.
  - Dans Node, la vraie entrée liste le gabarit et la racine. La lecture s'arrête sur « Runtime V2 MCP bridge is not available » : les outils vivent dans la page.
  - La preuve dans la page, `temp/r246_media/bricks/web.probe.mjs`, mesure `tools/list` face à l'arbre. Elle passe à la passe 29.
- Ligne datée ajoutée à `maps/API_MAP.md` (voie accordée).
- **Reste** :
  - le codage à chaud : assembler une brique nouvelle à l'exécution, sous la politique `mcp_security_policy.js` et la règle 22. Il se conçoit après la mesure dans la page.

## 24 nov. — Assembler des briques en un appel : une étape lit le résultat d'une autre
- **Manque trouvé** : `mcp.toolchains.execute` enchaînait des étapes, mais aucune ne pouvait se servir du résultat d'une étape d'avant. Il fallait donc un aller-retour par brique, ce qui coûte des tokens et empêche d'assembler à chaud.
- **Fait** : `atome/src/squirrel/atome/mcp_toolchain_refs.js`.
  - Dans les paramètres d'une étape, une valeur `{ "$step": 0, "path": "result.id" }` est remplacée par le résultat de l'étape 0 à ce chemin, avant l'envoi.
  - Une étape pas encore jouée, ou un chemin absent du résultat, est une erreur explicite (`toolchain_ref_step_unavailable`, `toolchain_ref_path_missing`), rendue avec `failed_index`.
  - Une chaîne arrêtée sur une confirmation (règle 22) rend `prior_steps`. L'appelant les renvoie avec `start_index`, et les étapes suivantes retrouvent les résultats d'avant. Chaque étape garde sa propre politique et sa confirmation.
  - La racine d'`eve://bricks` porte `compose` : la méthode, une étape type et la forme d'une référence, pour que l'appelant l'apprenne sans autre lecture.
- **Preuve** : `temp/r246_media/bricks/refs.probe.mjs`, ALL OK, 8 contrôles sur le vrai gestionnaire : valeurs, refus d'une référence future ou d'un chemin absent, reprise après confirmation, objet ordinaire laissé tel quel. Biome est propre sur les trois fichiers.

## 24 nov. — Passe 29 et le registre périmé
- **Passe 29** (2e essai, la 1re coupée par la garde de swap) :
  - dictée `v1_dictation` : 26/26 ALL OK, le cas restant compris ;
  - `eve://bricks` dans la page : la liste MCP elle-même échouait, `mcp_tool_unregistered:tool_definition:display.follow` ;
  - bug14 : 31 OK, un échec, l'arrêt vocal d'une prise lancée au toucher sur le Dashboard (`WRITE_FAILED`, alors que la prise s'arrête).
- **Défaut trouvé et réparé** : les commandes `display.follow`, `display.unfollow` et `display.relay` (R-248, `assistant_context_contract.js`) n'étaient pas dans le registre généré. `registry:check` signalait six sources périmées. Tout client MCP recevait une erreur au lieu de la liste des outils.
  - Réparation : `npm run registry:build` (voie accordée par l'orchestrateur), puis `registry:check` ok : 4 796 entrées, hash `4f97317889db`. Les trois commandes y sont.
- **Reste** :
  - la passe 30 (`pass30.sh` : `eve://bricks` puis bug14) ;
  - la sonde bug14 relève maintenant la vraie cause de `WRITE_FAILED` dans l'anneau des erreurs.

## 24 nov. — Passe 31 : `eve://bricks` mesuré dans la page, deux autres défauts réparés
- **Second trou du registre** : les six outils de sélection de texte (R-244, `text_selection_tools.js`) n'avaient jamais été déclarés. Le constructeur ne lisait depuis le code que les outils de `timeline_actions.js`.
  - Réparation à la racine : `scripts/registry/registry_project_commands.mjs#projectRuntimeUiActions` lit maintenant une liste de propriétaires (`RUNTIME_ACTION_FILES`) et prend leurs outils dans le code. Un essai à blanc donne 107 entrées, dont les six.
  - `registry:build` (2e voie) : 4 802 entrées, hash `225716581e86`.
  - La sonde web liste désormais tous les outils de la page absents du registre d'un coup, au lieu de s'arrêter au premier.
- **`eve://bricks` dans la page : ALL OK.**
  - `tools/list` : 1 420 outils, 956 058 caractères, environ 239 000 tokens.
  - La racine d'`eve://bricks` : 87 familles en 1 555 caractères, environ 390 tokens. Chaque outil n'est compté qu'une fois (1 420/1 420).
  - Le plus gros nœud fait 7 786 caractères, la médiane 988. Une brique avec son schéma (`adole.auth.current`) en fait 279.
  - Un chemin inconnu est refusé explicitement.
  - Trouver puis appeler une brique coûte donc quelques milliers de caractères au lieu de 956 000.
- **bug14** : la vraie cause, lue dans l'anneau des erreurs, était `audio_recording_empty`. Une prise lancée au toucher puis arrêtée à la voix aussitôt ne contient que du silence. Elle s'arrête bien, mais la réponse était `WRITE_FAILED`, ce qui est faux.
  - Réparation : un nouveau code de contrat, `TAKE_EMPTY`, dans `atome/src/squirrel/capture/contracts.js#captureError`. `audio_recording_empty` et `video_recording_empty_output` y mènent. La description de `captures.stop` le dit. Biome est propre et la correspondance est vérifiée dans Node.

## 24 nov. — Retest indépendant 5, puis lot P4 : trouver un calque de projet, un seul propriétaire
- **Retest indépendant 5** (sous-agent, ses sondes sous `temp/r246_retest5/`) : les 14 tickets passent VERIFIED (BUG-0001…0004, 0014…0023), et les deux nettoyages aussi.
  - Les exports morts : 95/95 modules se chargent. Un contrôle par arbre syntaxique sur 4 221 fichiers ne trouve aucune trace des 141 noms.
  - Les briques : tree 9/9, refs 8/8, web 5/5.
  - Rien n'a été rouvert.
- **Trouvé hors tickets** : deux contrôles statiques de `p1_current_project.probe.mjs` échouent.
  - Plus aucun module ne lit l'id d'un projet dans un calque : P3 les a tous passés par `getProjectIdFromElement`.
  - Mais la recherche « le calque du projet X » était récrite à la main dans une quinzaine de modules, « le calque autour d'un nœud » trois fois, et « tous les calques » trois fois.
- **Fait** : trois propriétaires dans `eVe/intuition/matrix/core/project_dom_state.js`, qui possède déjà les calques de projet.
  - `findProjectElement(id, doc)`, `projectElementOf(node)` et `listProjectElements(doc)`, construits sur `PROJECT_VIEW_PREFIX`.
  - 14 modules les appellent maintenant : `dashboard_workspace_mode`, `atome_timeline_dom`, `project_drop_event_runtime`, `project_bootstrap_support`, `communication_share_resolve`, `user_workspace_surface_runtime` (×2), `audio_to_midi/result_media`, `ai_generators/media_import`, `main_menu_auth_runtime`, `debug_runtime` (×2), `project_background_rail_runtime`, `text_tool_background_runtime`, `context_target`, `tool_genesis_projection_support_runtime`.
  - Le sélecteur mort `#view .project-view` est retiré : aucune classe `project-view` n'existe.
  - `debug_runtime` cherchait deux fois le même calque, il ne le cherche plus qu'une fois.
  - `tool_runtime_context.js` lit un id cible (une chaîne, pas le DOM) par `PROJECT_VIEW_PREFIX`.
- **Défaut réparé en passant**, dans `project_bootstrap_support.js` : cinq `catch` silencieux.
  - Les deux voies rapides de l'attente d'authentification et leur `try` portent maintenant l'erreur à l'anneau (`reportRuntimeError`). L'événement et le délai résolvent toujours l'attente.
  - `el.remove()` ne lève pas, et le `clear()` de l'état de liste n'est plus avalé : ces `try` sont retirés.
  - La branche `innerHTML` était morte, puisque tous les calques s'appellent `project_view_*`.
- **Preuves** :
  - Biome est propre sur les 15 fichiers, 0 avertissement : les 4 qui restaient dans `project_bootstrap_support.js` sont réparés.
  - `load_check` : 15/15 modules, plus `tool_runtime_context` 1/1.
  - `temp/r246_media/clean/p4_owner.probe.mjs` : 8/8.

## 24 nov. — Les trois réponses de l'utilisateur, codées
- **HEIC → JPEG, original gardé** : `eVe/domains/media/heic_import.js` (`isHeicFile`, `heicToJpeg`), appelé une fois au début de `asset_box_file_upload.js#sendFileToServer`, par où passe tout import.
  - L'original est d'abord rangé dans les médias de la personne (`scope: 'global'`), puis le JPEG, avec ses particules `original_atome_id` et `original_mime_type`.
  - Là où le moteur ne décode pas le HEIC (Chromium), rien ne change.
- **« montre-le » dans un projet** : `creation_runtime.js#presentationOnDashboard`.
  - Le projet est quitté par `project_view_navigation.js#leaveProjectForDashboard`, désormais partagé avec `returnToProjectsMatrix`.
  - Créer s'ouvre ensuite dès que le Dashboard l'enregistre, sans attendre au-delà de 8 s. Sinon, la réponse est `PRESENTATION_UNAVAILABLE`.
  - La description du contrat `creation.open` le dit.
- **Plusieurs fichiers sur la Timeline : un clip par fichier**, déjà fait par R-344 (`intoTimeline`).
- **Preuves** :
  - Passe 34 : `temp/r246_retest6/answers.probe.mjs` 7/7 ALL OK. Les octets décodables déclarés HEIC donnent un JPEG relié à son original gardé. Le vrai `IMG_0501.HEIC` reste un fichier sur Chromium. `creation.open` depuis un projet répond ok et le projet est quitté.
  - `cells_multi.probe.mjs` de R-344 : 22 PASS, 0 FAIL.
  - Biome propre, et les modules se chargent (4/4).

## 24 nov. — Lot V3 : un seul mot d'éveil par plateforme (validé par l'utilisateur : « Oui, fais V3 »)

Rien d'hors ligne n'est retiré : la dictée hors ligne et le mot d'éveil restent, chacun en un seul exemplaire.

| Avant | Après |
| --- | --- |
| Sur appareil (Tauri bureau, Android, app iOS), deux détecteurs du même modèle : la veille faisait tourner le worker JS (ONNX en WASM dans la WebView), nourri du PCM natif lu par `audio_wake_read` toutes les 80 ms ; le guide raccroché, `voice/wake.rs` | Sur appareil, `wake.rs` seul : la veille ouvre la session vocale native en mode `wake`, l'enregistrement de la voix personnelle en mode `collect` (`wake_native_engine.js`, choisi par `wake_detector.js`) ; le son ne passe plus en JS. Le worker ne sert plus qu'au navigateur |
| La session vocale native chargeait toujours Vosk (65 Mo) et Silero, même raccrochée | Le mode `wake`/`collect` ne charge que les trois fichiers du mot d'éveil ; Silero et Vosk se chargent au premier passage en conversation (`VoiceEngine::hearing`) |
| `wake.rs` sans mode collecte | `WakeDetector::collect` : chaque fenêtre, silence compris, et son score (`VoiceEvent::Window`) |

Défauts trouvés et réparés au passage : BUG-0024 (une seconde session vocale native échouait toujours : ONNX Runtime ne construit qu'un environnement par processus), BUG-0025 (le test de disponibilité du micro lisait la capture d'un autre), BUG-0026 (un moteur refusé arrêtait la session de son propriétaire ; Android sans demande de micro pour le moteur natif).

Mesures sur le même enregistrement (`temp/r246_v3/phrase.f32`, voix Siwis : « Ève, écoute-moi », une phrase ordinaire, la phrase encore, 12,4 s) :
- détections : Rust 2, JS 2 (les deux phrases, pas la phrase ordinaire) ;
- 140 fenêtres de part et d'autre, les mêmes 19 au-dessus de 0,5 ; écart de score maximal 0,0075 (ONNX natif contre WASM) ;
- coût par trame de 80 ms, chaque trame calculée : Rust 22 ms, JS 24 ms (machine chargée, compilations en parallèle) ; à coût égal, Rust (règle 7), et le son ne traverse plus le pont.

Deux Vosk au bureau : **gardés**, pas un doublon (voir le classement) : la dictée libre lit le grand modèle et 9 langues, les commandes le petit modèle à grammaire.

L'écart de l'archive Vosk au bureau est réglé, voir « Archive Vosk retirée du bundle bureau » plus bas.

Preuves :
- `cargo clippy -p atome-audio-engine --features voice --all-targets -D warnings` : 0 avertissement ; `cargo test` : 43 réussis, 0 échec ; rustfmt propre ; cible isolée `temp/r246_v3_target`.
- Sonde native `temp/r246_v3/parity` (la vraie session, PCM poussé comme sur iOS) : collecte, veille, veille → conversation (Vosk chargé, phrases acceptées) → veille, mode inconnu ou absent refusé (`voice_listening_invalid`), 0 erreur.
- Sonde JS `temp/r246_v3/native_backend.probe.test.mjs` + tests du mot d'éveil : 29/29.
- Swift : `swiftc -parse` des 4 fichiers. Biome propre.
- À faire par l'utilisateur sur appareil : la veille et « Ève, écoute-moi » sur le Mac, l'iPad et Android ; l'enregistrement de la voix personnelle.

### Retest indépendant 7 (24 nov.)

J'ai relu le diff et écrit mes propres sondes, sans reprendre celles de l'auteur. Elles sont dans `temp/r246_retest7/`.
- Rust : `cargo test -p atome-audio-engine --features voice` passe, 43 tests sur 43 (1 ignoré) et 1 sur 1 (`host_pulled`). La sonde `session_probe`, qui pousse le son comme sur iOS, passe ses 20 vérifications :
  - 9 sessions de suite dans un même processus (veille, collecte, conversation, trois fois), sans erreur (BUG-0024) ;
  - l'enregistrement entier donne 2 détections. Coupé en trois, il donne 1, puis 0 pour la phrase ordinaire, puis 1 ;
  - aucune détection sur 8 s de silence, sur 8 s de bruit, ni sur deux phrases ordinaires dites par les voix macOS Thomas et Eddy ;
  - en collecte, une fenêtre de 1536 valeurs par trame une fois la fenêtre remplie : 140 fenêtres pour 155 trames, 47 pour 62 trames de silence ;
  - veille, puis conversation (Vosk chargé à ce moment), puis phrases acceptées, puis veille : la phrase est encore entendue ;
  - un mode vide ou inconnu est refusé au démarrage comme en cours de session ;
  - `wake_capture::state()` répond libre sans capture, occupé en arrière-plan.
- JS : ma sonde `wake_engine_select.probe.test.mjs` (11 tests) et les tests du mot d'éveil passent, 34 sur 34. Ma sonde vérifie que le navigateur garde le worker, qu'un appareil (Tauri ou iOS) ouvre le moteur natif en `wake` ou en `collect`, qu'une session occupée donne `wake_capture_busy` sans `audio_voice_stop`, et que la disponibilité ne lit jamais `audio_wake_read`. Biome est propre sur les 4 fichiers JS, et `swiftc -parse` passe sur les 4 fichiers Swift.
- Un petit défaut trouvé, hors des trois tickets : sur appareil, si le fichier du classifieur `eve_ecoute_moi.json` manque, l'erreur est `voice_wake_failed: …: No such file` (`voice/wake.rs:201-202`, qui l'emballe en `VoiceError::Wake` et non en `VoiceError::Model`). `wake_native_engine.js:20` la traduit en `wake_engine_failed` au lieu de `wake_model_missing`, alors que le navigateur dit « modèle absent ». C'est le message affiché qui diffère, rien d'autre.
- BUG-0024, BUG-0025 et BUG-0026 sont passés à VERIFIED.

### Correction après le retest 7 (24 nov.)

Le défaut du retest 7 est corrigé à sa racine. Quand un fichier de modèle livré manque (Silero, mel ou embedding du mot d'éveil, ou classifieur `eve_ecoute_moi.json`), le moteur natif répond maintenant `voice_model_unavailable: <chemin>` (`VoiceError::Model`). Le contrôle passe par un seul `model_file()` dans `voice/mod.rs`, appelé par `vad.rs` et `wake.rs`. `wake_native_engine.js` traduisait déjà ce code en `wake_model_missing`, ce que dit aussi le navigateur.

Le test unitaire `a_missing_model_file_is_reported_as_unavailable` le vérifie. Résultats :
- `cargo test -p atome-audio-engine --features voice` : 44 tests passent, 1 ignoré ;
- clippy `--all-targets -D warnings` : 0 avertissement.

Seconde remarque du retest 7, corrigée aussi. Sur iOS, `audio_wake_state` renvoyait le `failed` de la capture d'avant, et la veille se croyait indisponible jusqu'au prochain démarrage. Ce drapeau signale l'échec d'une capture en cours à celui qui la lit (`readWakeCapture`). Une capture qui a échoué est déjà arrêtée, donc une nouvelle peut démarrer. `wakeCaptureState()` ne renvoie plus que `busy`, comme `wake_capture::state()` en Rust, et `wakeCaptureAvailable` ne lit plus que `busy`. Vérifications :
- la sonde `temp/r246_v3/availability_after_failure.probe.test.mjs` passe, et la sonde V3 aussi, soit 7 tests sur 7 ;
- `swiftc -parse` passe, Biome est propre.

## 24 nov. — Archive Vosk retirée du bundle bureau

L'app bureau embarquait l'archive Vosk du navigateur (42 207 933 octets) : `tauri.conf.json` copiait `atome/src` en entier et Tauri ne sait pas exclure un fichier d'un dossier de ressources. Sur le bureau, rien ne la lit : `conversation_turns.js#defaultEngine` choisit `native_voice_engine.js` dès que `getTauriInvoke` répond, et seul `browser_voice_engine.js` charge l'archive. `wake_detector.js` choisit `wake_native_engine.js` sur appareil, et le moteur natif lit le modèle extrait (`session.rs`, `vosk/vosk-model-small-fr-0.22`).

Ce qui a changé :
- `platforms/desktop-tauri/package_tauri_runtime.mjs` remplace `package_tauri_engines.mjs`. Il met en scène sous `temp/desktop-tauri-runtime/` les deux arbres que livre le bundle : `atome/engines` (sans les `target/` de Cargo, comme avant) et `atome/src` sans l'archive, par des clones copie-sur-écriture (APFS). Chaque chemin mis en scène garde l'heure de sa source (arrondie à la milliseconde, vers le bas), donc Cargo ne relance `build.rs` que si une source a changé.
- `tauri.conf.json` : `bundle.resources` lit `temp/desktop-tauri-runtime/src`.
- Pas de JS périmé en release : `build.rs` remet la scène en place à chaque modification sous `atome/src`. Cargo surveillait déjà ce dossier, par la ressource Tauri. La mise en scène suit donc la même règle de relance qu'avant.
- Le dev ne change pas : une build debug sert le dépôt vivant (`lib.rs#live_repo_src_dir`), et une modification JS ne relance pas plus de travail qu'avant.
- Défaut trouvé en passant et réparé : `build.rs` générait le moteur GPS (`atome/src/wasm/gps_navigation_engine.js`) **après** les ressources. Le bundle pouvait donc garder l'ancien fichier, et la réécriture rendait `atome/src` plus récent à chaque build, ce qui relançait toujours `build.rs`. Maintenant le GPS est généré avant la mise en scène, et `scripts/build_gps_native_engine.mjs` n'écrit que si les octets changent (sortie identique à l'ancienne, vérifiée par `cmp`).

Preuves (tout est dans `temp/r246_vosk_bundle/`) :
- **Mesure du bundle.** Même binaire, `tauri build --debug --bundles app --no-sign` dans une cible privée. L'avant est obtenu par `tauri bundle` avec l'ancienne ressource `atome/src` :
  - avant : 644 530 521 octets (614,67 Mio) ;
  - après : 602 322 588 octets (574,42 Mio) ;
  - écart : **−42 207 933 octets**, exactement l'archive.
  - `diff -rq` des deux `.app` n'a qu'une ligne : l'archive. Les ressources ne dépendent pas du profil, la mesure vaut donc pour la release.
- **Voix du bureau sans l'archive.** La sonde `probe/` lance la vraie session vocale native (`atome-audio-engine`, feature `voice`, libvosk du bureau) sur l'arbre mis en scène, où l'archive est absente. Elle lui fait entendre l'enregistrement de V3 (`temp/r246_v3/phrase.f32`). Résultat dans `voice_result.json` :
  - en veille : 2 réveils sur 2 ;
  - en conversation, Vosk est chargé depuis le dossier extrait et la grammaire d'écran rend « ève écoute moi » 2 fois sur 2, chaque mot à la confiance 1,0 ;
  - la phrase ordinaire donne `too_long`.
- **Sonde du paquet.** `tests/probes/tauri_engine_payload.probe.mjs` vérifie :
  - les `target/` et l'archive sont exclus ;
  - les octets sont identiques ;
  - aucun chemin mis en scène n'est plus récent que sa source ;
  - une modification JS est bien remise en scène ;
  - l'archive source reste en place pour le Web.
- **Relance de Cargo.** Une build relancée sans changement de mon côté a été relancée seulement par des modifications d'autres sessions dans `eVe/`, plus jamais par `atome/src`.
- Biome est propre (`package_tauri_runtime.mjs`, `build_gps_native_engine.mjs`) et `rustfmt --check build.rs` passe.
- Non vérifié : une build `--release` complète (machine saturée ; le contenu des ressources ne dépend pas du profil), et le lancement de l'app sur le Mac (ce test-là revient à l'utilisateur).

