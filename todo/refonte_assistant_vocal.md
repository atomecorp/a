# Refonte de l'assistant vocal : une seule chaîne vocale native

Rédigé le 22 oct. 2026, réécrit le même jour après arbitrage de l'utilisateur.
Statut au 23 oct. : **lots 0 à 7 faits** (lot 6 : points ouverts, §18.7).
Résultats : §10 (banc), §11 (moteur), §12 (intégrations), §13 (boucle), §14 (guide, hors ligne), §15 (disque), §16 (nettoyage). Le §9 décrit l'état
d'avant la refonte ; ce qu'il disait « à retirer » l'est pour le guide (§14.1), le reste attend le lot 7.

## 1. Pourquoi une refonte

### 1.1 Le symptôme

Le guide vocal du premier lancement demande à un moteur de **dictée** de tenir une **conversation**.
Des astuces se sont empilées pour forcer ce fonctionnement, chacune corrigeant un symptôme et en
créant un autre : coupure du micro pendant qu'eVe parle (`muteListening` / `set_muted`), filtre de sa
propre voix (`stripOwnVoice`, `ECHO_MS`, `OWN_VOICE_MS`), silences artificiels (0,3 s de zéros),
règles de renouvellement des requêtes.

Cause prouvée sur l'iPad (journaux de `localspeechrecognition`, 22 oct.) : la coupure du micro **met en
pause une requête restée ouverte** ; à la reprise, le moteur clôt l'énoncé puis ne transcrit plus rien,
2 fois sur 3.

### 1.2 La vraie cause : cinq moteurs que l'on ne contrôle pas

Le problème n'est pas propre à iOS. Chaque plateforme délègue la reconnaissance à une boîte noire du
système, chacune avec ses propres règles de session :

| Plateforme | Moteur actuel | Défaut |
| --- | --- | --- |
| Web | `webkitSpeechRecognition` (`service_browser_stt.js`) | Chrome envoie le son aux serveurs de Google ; Firefox n'a rien |
| Tauri Mac / Windows / Linux | Vosk via `tauri-plugin-stt` (vendoré) | modèle **téléchargé** depuis alphacephei.com : réseau obligatoire |
| Tauri Android | `SpeechRecognizer` (même plugin) | dépend du fabricant, souvent du réseau Google |
| Tauri iOS | `SFSpeech` (même plugin) | une phrase à la fois |
| App iOS | `AppNativeSpeechRecognizer.swift` (`SFSpeech`) | le bug mesuré le 22 oct. |
| FreeBSD | rien | non couvert |

Ramener ces cinq moteurs à un même contrat garderait cinq jeux de bizarreries. La refonte les
remplace par **une seule chaîne vocale, la nôtre**.

## 2. Exigences (règles de l'utilisateur)

1. **eVe reste en place sur tous les écrans** du premier lancement, du premier au dernier.
2. Elle ne s'en va **que** sur :
   - une **commande vocale explicite** (« au revoir », « raccroche », « arrête de m'écouter »…) ;
   - un **toucher sur le fond**, en dehors d'elle et en dehors des boutons et champs ;
   - **3 minutes sans un mot** (elle le dit à voix haute avant de raccrocher).
3. Raccrochée, elle n'entend rien. Elle revient sur un **toucher sur elle** ou sur
   « **Ève, écoute-moi** ».
4. La reconnaissance est **fiable** : chaque commande est comprise du premier coup, ou au plus au second.
5. Sa voix garde son **volume normal**.
6. **Même code, même comportement** sur iOS, Android, Mac, Windows, Linux, FreeBSD et navigateur. Aucune
   astuce propre à une plateforme.
7. **Audio natif sur chaque plateforme**, WASM seulement dans le navigateur (Safari, Chrome…).
8. **Le guide du premier lancement fonctionne sur l'appareil**, sans réseau.
9. **Hors ligne, l'assistant est indisponible** : un toucher sur lui ne lance rien, il dit seulement
   qu'il n'est pas disponible parce qu'on est hors ligne. Pas de reconnaissance de parole libre sur
   l'appareil.

## 3. Concept cible

### 3.1 Conversation tour par tour

C'est le fonctionnement de Siri et de l'assistant Google :

```
parle (son du micro ignoré) → écoute UNE phrase → comprend → agit ou répond → écoute UNE phrase → …
```

- **Pendant qu'elle parle, le son du micro est jeté** (plus 300 ms après la fin réelle de sa voix). Le
  micro, lui, reste ouvert : aucune requête du système n'est mise en pause, donc le bug du §1.1 disparaît
  par construction. Pas d'écho, pas de filtre de sa propre voix.
- **Un tour = une phrase.** Il se ferme 1 s après le dernier mot entendu.
- **Un tour sans phrase** (rien dit) ne termine rien : le tour suivant s'ouvre aussitôt.
- **Une erreur** relance le tour après 1 s, puis 2 s, 4 s… jusqu'à 15 s au plus, et écrit un
  diagnostic. Elle n'arrête jamais la conversation.
- **Les phrases du décor** (télévision, conversation dans la pièce) sont ignorées sans réponse : la
  grammaire les rend en `[unk]` (§4.2).
- « **Je n'ai pas compris** » : au plus une fois toutes les 10 s.

### 3.2 Reconnaissance restreinte aux phrases de l'écran

Sur l'appareil, eVe n'a besoin de comprendre que des **commandes connues à l'avance** (exigence 9).
La fiabilité vient de cette restriction, pas de la taille du modèle : chaque écran fournit la liste de
ses phrases (intentions de `eVe/i18n/languages_first_launch_voice.js`), et le moteur ne peut entendre
qu'elles. « Sommeil » ne peut plus devenir « ce mail ».

La parole libre passe toujours par l'assistant connecté (OpenAI Realtime), donc seulement en ligne.

## 4. Architecture

```
micro natif ──PCM 16 kHz──▶ moteur vocal Rust ──événements──▶ JS (tours, guide, assistant)
(cpal / AVAudioEngine /      (Silero VAD + Vosk grammaire       (jamais de son côté JS
 getUserMedia en Web)         + fin de phrase + mot d'éveil)      hors navigateur)
```

### 4.1 Le moteur vocal : une seule brique Rust

Module du crate existant `atome/engines/audio-engine`, propriétaire canonique de l'audio et déjà de la
capture du mot d'éveil (`wake_capture.rs`) : on étend ce propriétaire, on ne crée pas de brique parallèle.
Un crate séparé seulement si le lot 0 prouve qu'une dépendance (libvosk) ne peut pas entrer dans
`audio-engine` sur une plateforme. Il possède :

- **la détection de parole** : Silero VAD (`silero_vad.onnx`, 2,3 Mo) exécuté par **`ort`** (ONNX Runtime).
  `tract` est écarté : il ne charge aucune des exportations Silero v5 (§10.3) ;
- **la reconnaissance** : Vosk, petit modèle français (`vosk-model-small-fr-0.22` : 65 Mo décompressé,
  42 Mo compressé), avec **grammaire** = phrases de l'écran + `[unk]`. Le crate `vosk` est déjà utilisé par
  `tauri-plugin-stt` sur le bureau ;
- **la fin de phrase** : 1 s sans nouveau mot, sauf élision finale (« C' ») ;
- **l'ignorance du son pendant qu'eVe parle** (`speaking: true/false`, plus 300 ms) ;
- **le mot d'éveil « Ève, écoute-moi »**, pour n'avoir qu'un seul circuit audio : **le modèle actuel
  porté en Rust** (`wake_features.js`, `wake_classifier.js`, `wake_detector.js`, modèles
  `assets/voice/wake/` exécutés par le même `ort`), vérificateur personnel compris. La grammaire Vosk seule
  est écartée (trop de faux déclenchements, §10.4) ; elle peut servir de **confirmation** après le modèle.

Contrat unique (identique sur toutes les plateformes) :

- entrées : `start({ language, phrases })`, `setPhrases(phrases)`, `setSpeaking(bool)`, `hangUp()`,
  `wake()`, `stop()` ;
- sorties (événements) : `speech_start`, `phrase { text, intent_phrase }`, `unknown`, `wake`,
  `level { input }`, `error { code }`.

Le JavaScript ne reçoit que ces événements, **jamais le son** (sauf dans le navigateur, où tout tourne
dans la page).

### 4.2 Une compilation par plateforme, un seul code source

C'est déjà le schéma du projet : le moteur audio Rust (Kira, cpal) tourne en natif dans Tauri et en WASM
sur le Web (`atome/src/wasm/squirrel_audio_wasm*`) ; l'app iOS lie déjà une bibliothèque Rust statique
(`libatome_ios_bevy_renderer.a`).

| Plateforme | Capture du micro | Moteur vocal | Pont vers JS |
| --- | --- | --- | --- |
| Tauri Mac / Windows / Linux / FreeBSD | cpal (`atome/engines/audio-engine/src/wake_capture.rs`, généralisé) | natif, dans le binaire Tauri | événements Tauri |
| Tauri Android | cpal (AAudio) | natif (NDK) | événements Tauri |
| App iOS | `AVAudioEngine` dans Swift (`AppNativeWakeCapture.swift`, généralisé), sous la politique `AppNativeAudioSessionPolicy` | bibliothèque statique Rust, appelée par FFI depuis Swift | messages de `AppPageHost.swift` |
| Navigateur | `getUserMedia` + worklet (`wake_capture.js`, généralisé) | WASM dans un worker | messages du worker |

Établi au lot 0 (§10) :

- **`libvosk` pour iOS** : construit depuis les sources (Kaldi branche `vosk`, OpenFST, vosk-api, avec
  Accelerate), lié et exécuté sur l'iPad A12Z. macOS, Windows, Linux et Android ont des builds officiels ;
  FreeBSD reste à construire.
- **Navigateur** : `vosk-browser` (Vosk compilé par emscripten, grammaires acceptées, sans threads partagés)
  donne la même précision que le natif ; Silero et le mot d'éveil y passent par onnxruntime-web, déjà
  embarqué. Un WASM unique Rust + libvosk (emscripten) n'a pas été construit : `ort` ne cible pas
  emscripten, donc la logique Rust du moteur (fins de phrase, rejet du décor, états) sera compilée en
  `wasm32-unknown-unknown` et pilotera ces deux moteurs WASM derrière le même contrat.
- **Mémoire** : mesurée sur l'iPad (§10.5). Reste à mesurer sur l'iPhone le plus faible ciblé.

### 4.3 Modèles embarqués

- Les modèles sont **livrés dans l'app**, jamais téléchargés au premier lancement (exigence 8). Le
  téléchargement depuis alphacephei.com de `tauri-plugin-stt` disparaît pour l'assistant.
- Poids ajouté (mesuré) : 2,3 Mo (Silero) + 65 Mo décompressé / 42 Mo compressé (Vosk petit français),
  plus environ 30 Mo d'exécutable natif iOS (Vosk + Kaldi + OpenFST + ONNX Runtime, §10.5) ; à comparer aux
  79 Mo de voix et aux 13 Mo d'onnxruntime-web déjà embarqués.
- Autres langues : un petit modèle Vosk par langue (environ 40 à 50 Mo chacun). Quelles langues sont
  embarquées et lesquelles se téléchargent en ligne au changement de langue : à décider avec l'utilisateur
  avant le lot 2.
- Licences : Silero VAD (MIT), Vosk et ses petits modèles (Apache 2.0) ; à revérifier au moment du
  vendoring et à déclarer comme les autres actifs vendorés.

### 4.4 La boucle de conversation (JS)

Nouveau module, environ 150 lignes : `eVe/voice/conversation/conversation_turns.js`.

- Il possède la machine à états `idle → speaking → listening → acting`, la reprise après erreur, la règle
  des 3 minutes, l'état « raccroché » et l'état exposé au disque (`getState`, `subscribe`, niveaux d'entrée
  et de sortie).
- Il ne connaît ni les écrans ni les intentions. On lui donne :
  - `say(text)` : la voix pré-rendue (`voice_lines.js`) ; il appelle `setSpeaking(true/false)` autour ;
  - `phrases()` : les phrases de l'écran courant ;
  - `understand(phrase)` : la réponse ou l'action.
- Il consomme les événements du moteur vocal (§4.1) et n'ouvre jamais le micro lui-même.

### 4.5 Le guide du premier lancement : du contenu seulement

`eVe/domains/user/first_launch_guide.js`, réécrit, environ 120 lignes visées :

- les phrases de chaque écran ;
- les intentions (boutons, « répète », « raccroche », « décris ») et leurs formulations, qui deviennent la
  grammaire de l'écran ;
- l'appui sur le bouton nommé, par le même outil qu'un toucher.

**Supprimé** : `stripOwnVoice`, `ECHO_RUN_WORDS`, `muteWhileSpeaking`, `heardAfter`, `ECHO_MS`,
`SHORT_SESSION_MS`, `OWN_VOICE_MS`, `MUTE_TAIL_MS`.

**Gardé** : la remise de la préférence du profil à la fin du premier lancement.

### 4.6 eVe présente sur tous les écrans

- Catalogue (`eVe/domains/templates/first_launch_template_catalog.js`) : sur les 16 écrans de compte, la
  cellule `logo` devient la cellule `atom` (`operation: 'assistant'`). Le `version` de chaque gabarit
  touché est incrémenté, pour que les gabarits déjà installés soient remplacés.
- `first_launch_presentation.js` : une règle générale, « tout gabarit du premier lancement qui a une
  cellule `atom` héberge le disque », à la place de la liste `FIRST_LAUNCH_ATOM_TEMPLATES`.
  - Accueil et choix : le disque dans sa cellule.
  - Objectifs, sommeil et programme : le disque ancré en bas à droite (cellules `floating`).
  - Écrans de compte : le disque à la place de l'ancien logo.
- `first_launch_runtime.js` : sur une session déjà ouverte (`onReturn`), le disque est retiré comme l'était
  le logo. L'assistant de la session est déjà là.
- `first_launch_pairing` et `first_launch_confirmed` (fenêtres d'appairage par-dessus une session) : sans
  disque, comme aujourd'hui.

### 4.7 Quitter et rappeler

- **Toucher sur le fond** : réutiliser `touchOutside` de `eVe/domains/dashboard/dashboard_eve_atom.js`
  (couche `setRenderSurfaceInteractionInterceptorLayer`). Il est aujourd'hui désactivé quand le guide porte
  la voix (`if (!voice)`) : l'activer pour le guide, avec l'action `hangUp`.
  - Les boutons, champs et curseurs (`isBevyUiPointer`) gardent leur toucher.
- **Toucher sur le disque** :
  - raccrochée : elle revient (elle redit l'écran, puis écoute) ;
  - en train de parler : elle se tait et écoute ;
  - en train d'écouter : rien.
- **« Ève, écoute-moi »** : le moteur vocal ne cherche le mot d'éveil que lorsqu'elle est raccrochée.
- **Commande vocale** : les intentions `hang_up` existantes (`eVe/i18n/languages_first_launch_voice.js`).

### 4.8 Assistant indisponible hors ligne

- Hors ligne, un toucher sur l'assistant (ou « Ève, écoute-moi » en dehors du premier lancement) ne lance
  aucune session : eVe dit une seule phrase, pré-rendue, du type « Je ne suis pas disponible, nous sommes
  hors ligne. » Texte par `eveT()`, voix générée par `scripts/generate_voice_lines.mjs`.
- L'état en ligne vient du propriétaire existant de la connexion (`state.online` dans
  `atome/src/squirrel/apis/unified/adole_connection.js`, à confirmer comme seul propriétaire avant de
  l'utiliser). Aucun nouveau test de réseau.
- Le guide du premier lancement n'est pas concerné : il tourne sur l'appareil (exigence 8).

### 4.9 Ce qui disparaît

- `platforms/ios/atome-auv3/application/AppNativeSpeechRecognizer.swift` et son routage dans
  `AppPageHost.swift`.
- Pour l'assistant et le guide : `service_tauri_stt.js`, `service_browser_stt.js`, le mode `onUtterance`,
  `muteListening` / `mute()` / `setMuted` (`bootstrap.js`, `service_stt_runtime.js`, `stt_api.js`), le pont
  `window.__ATOME_NATIVE_STT__`.
- L'appel à `audio_wake_read` toutes les 80 ms avec des tableaux d'échantillons en JSON.
- Le détecteur de volume `vad.js`, s'il n'a plus d'autre consommateur.
- `tauri-plugin-stt` : seulement si plus aucun consommateur ne l'utilise (voir §8).

## 5. Ordre de réalisation (lots)

| Lot | Contenu | Terminé quand |
| --- | --- | --- |
| 0 | **Banc d'essai** : enregistrements réels (voix Thomas du Mac + télévision + conversation), Vosk avec grammaire vs mots isolés, `tract` vs `ort` pour Silero, voie du mot d'éveil, mémoire et latence sur Mac et iPad A12Z, faisabilité Vosk iOS / emscripten | rapport chiffré dans ce fichier ; choix arrêtés |
| 1 | **Fait (§11)** — Moteur vocal dans `audio-engine` (VAD, Vosk grammaire, fin de phrase, ignorance pendant la parole, événements) | sonde Rust : les enregistrements du lot 0 rendent les bonnes phrases, `[unk]` sur le décor |
| 2 | **Fait sauf essais au son réel (§12)** — Intégrations : Tauri (bureau, Android) puis iOS (bibliothèque statique + capture Swift) puis WASM | sonde JS par plateforme : 20 tours enchaînés, chacun rend sa phrase (Mac qui parle) |
| 3 | **Fait (§13)** — Brique `conversation_turns.js` | sonde Node avec faux moteur, faux `say` et faux `understand` : erreurs, silence, 3 min, raccrocher, rappel |
| 4 | **Fait (§14)** — Guide réécrit sur la brique ; assistant indisponible hors ligne | sonde Node du parcours complet (`temp/voice_probe/`) + sonde hors ligne |
| 5 | **Fait (§15)** — Disque sur tous les écrans + toucher sur le fond | captures iPad de chaque écran atteignable |
| 6 | **Fait (§18), deux points ouverts** — Recette (§6) sur iPad, Mac et émulateur Android | critères du §6 tenus |
| 7 | **Fait pour le guide (§16)** — Retrait de l'ancien modèle (§4.9), cartes (`maps/`), `FRAMEWORK_STATE`, mémoire | grep sans reste de l'ancien modèle |

## 6. Recette

Sur l'iPad, le Mac parle avec la voix Thomas. Chaque essai part d'une installation neuve.
`temp/ipad_campaign_2026-10-20/alerts.sh` accepte les seules invites autorisées : micro, alarmes. (L'invite
« reconnaissance vocale » ne doit plus apparaître : plus de `SFSpeech`.)

1. Parcours libre complet (Démarrer → Commencer → Sommeil → Valider → C'est parti), **3 fois de suite**
   sans échec, **en mode avion**.
2. Raccrocher par la voix, puis rappeler par « Ève, écoute-moi » : la commande suivante est comprise.
3. Raccrocher par un toucher sur le fond, puis rappeler par un toucher sur elle : idem.
4. Un toucher sur un bouton ne la fait pas raccrocher.
5. Télévision ou conversation dans la pièce pendant 2 min : aucune réponse, aucune action, elle écoute
   toujours.
6. 3 minutes de silence : elle dit au revoir et raccroche. « Ève, écoute-moi » la rappelle.
7. Volume de sa voix mesuré au micro du Mac : environ −27 dB crête, comme sans écoute.
8. Disque visible sur chaque écran atteignable : capture de chacun.
9. Un projet ouvert, en ligne : l'assistant de la session répond.
10. Hors ligne, un toucher sur l'assistant : la phrase d'indisponibilité, rien d'autre.
11. Mac (Tauri) et émulateur Android (`atome-api37`) : points 1, 2 et 5.

**Critère d'acceptation** : tous les points tenus, avec aucune commande ratée deux fois de suite et aucun
tour sourd (un tour ouvert qui ne rend rien alors qu'une phrase a été dite).

## 7. Risques à mesurer, pas à supposer

- **Vosk sur iOS et FreeBSD** : builds non officiels, à construire au lot 0.
- **Vosk en WASM avec le même code** (emscripten) : sinon, adaptateur `vosk-browser` pour le seul
  navigateur (§4.2).
- **Maintenance de Vosk** : le projet évolue peu. Le contrat du moteur vocal (§4.1) ne dépend pas de Vosk :
  un autre moteur à grammaire pourra le remplacer sans toucher au JS.
- **Mémoire sur iPhone** (§4.2).
- **Mots isolés** : la grammaire règle les confusions entre phrases de l'écran ; mesurer au lot 0 les
  confusions qui restent (« oui » / « non », noms courts).
- **Durée des builds iOS** (plus d'une heure constatée) : regrouper les essais natifs.
- **Android** : pas d'appareil ici, émulateur seulement ; capture cpal sur l'émulateur à vérifier.

## 8. Hors périmètre et points à arbitrer

- **Dictée libre en ligne** : d'autres fonctions utilisent la reconnaissance actuelle pour de la parole
  libre — capture du Dashboard (`dashboard_capture_session.js`, `purpose: 'dictation'`), panneau vocal
  (`atome/src/squirrel/voice/panel.js`), trackpad (`eVe/intuition/tools/trackpad.js`), contrôleur de session
  de l'assistant (`assistant_session_controller.js`, `session_runtime_capture.js`). Elles gardent leur
  chemin actuel pendant la refonte. Leur avenir (transcription par l'assistant connecté ?) est à arbitrer
  par l'utilisateur ; tant qu'elles existent, `tauri-plugin-stt` et `SFSpeech` restent pour elles seules.
- L'assistant connecté (OpenAI Realtime) et l'IA choisie dans les préférences (Anthropic…).
- Les nouvelles voix françaises d'OpenAI.
- La prononciation de « synchroniser ».
- **L'interruption à la voix pendant qu'elle parle** : demandera une annulation d'écho. Comme la voix
  d'eVe est produite par nous (`tts_frame_bus.js`), le signal de référence est disponible : une annulation
  d'écho dans le moteur vocal Rust marcherait à l'identique partout. À évaluer après la refonte.
- Les langues embarquées autres que le français (§4.3).

## 9. État du code au moment de la pause (22 oct.)

Modifié dans l'arbre de travail par la campagne précédente, rien n'est commité :

- **À garder** :
  - `bootstrap.js` : chargement du service vocal sur l'app iOS ;
  - `realtime_session.js` et `assistant_session_keeper.js` : règle des 3 minutes ;
  - `matrix_template_runtime.js` et `matrix_grid_model.js` : cellules `floating`, et `matrixTemplateFrame`
    déplacé ;
  - `first_launch_presentation.js` : disque ancré `floating` ;
  - `first_launch_guide.js` : routage du mot d'éveil une fois le service prêt (repris par le moteur vocal
    au lot 4).
- **Remplacé par la refonte** :
  - `stt_api.js` et `service_support.js` : pont iOS natif `__ATOME_NATIVE_STT__` (plus utile pour le
    guide et l'assistant, voir §8 pour les autres consommateurs) ;
  - `muteListening` et `mute` (`bootstrap.js`, `service_stt_runtime.js`) ;
  - le mode `onUtterance` (`service_tauri_stt.js`, `service_browser_stt.js`) ;
  - la logique d'écho et de coupure du guide ;
  - `AppNativeSpeechRecognizer.swift` (non suivi par Git), y compris la version compilée le 22 oct. et non
    vérifiée.
- **Pas de cette campagne, à ne pas toucher** : `Info.plist` et `NativeCalendarAlarm.swift` (alarmes
  AlarmKit, une autre session). C'est l'origine de la nouvelle invite « programmer des alarmes ».
- **Outils de test** : `temp/ipad_campaign_2026-10-20/` (`fullflow.sh`, `hw.sh`, `step.sh`, `alerts.sh`,
  `waitlisten.sh`, sondes `x_*.js`) et `temp/voice_probe/`.

## 10. Résultats du lot 0 (banc d'essai, 22-23 oct.)

Tout est dans `temp/voice_bench/` (corpus, scripts, résultats bruts). Rien n'est intégré à l'app.

### 10.1 Méthode

- **Corpus** (`corpus.mjs`, `gen_corpus.mjs`) : 46 commandes du premier lancement (mots seuls et petites
  phrases : « je veux démarrer », « le sommeil »…), 3 formes de « Ève, écoute-moi », 7 pièges proches
  (« Steve, écoute-moi », « écoute-moi »…), 10 phrases de fond. 8 voix macOS françaises pour les commandes,
  2 autres pour le fond. 16 kHz mono.
- **3 conditions** : propre ; bruit rose (environ 15 dB sous la voix) ; **voix de fond** (une autre voix qui
  parle environ 10 dB sous la commande, pendant tout l'enregistrement, comme une télévision).
- **Grammaires** (`grammars.mjs`) : construites à partir des vraies intentions (`FIRST_LAUNCH_GUIDE_STEPS` +
  `languages_first_launch_voice.js`) ; score par le vrai `matchGuideIntent` (`eval.mjs`).
- **Limite** : voix de synthèse, mixage numérique, pas d'acoustique de pièce. La recette sur l'iPad avec la
  voix du Mac (lot 6) reste le juge final.

### 10.2 Vosk : la grammaire est nettement meilleure, et rapide partout

Commandes comprises, sans règle de rejet (368 commandes par condition) :

| Configuration | Propre | Bruit rose | Voix de fond | Vitesse (Mac) |
| --- | --- | --- | --- | --- |
| **Petit modèle + grammaire** | **95,7 %** juste, 1,1 % faux | 91,6 % / 2,2 % | 81,3 % / 7,3 % | 0,7 ms par bloc de 80 ms, fin de phrase en 2 ms |
| Petit modèle, texte libre | 73,4 % / 0,8 % | 63,9 % / 1,4 % | 48,9 % / 0,5 % | 34 ms par bloc, pointes à 1,2 s |
| Grand modèle (1,4 Go), texte libre | 72,8 % / 0 % | — | 51,4 % / 1,1 % | 8 s de chargement, 1,3 à 1,9 Go de mémoire |

- Échecs propres à corriger au lot 1 (vocabulaire) : « paypal » entendu « paye pal », « apple pay », « vas-y »
  jamais reconnu ; `wero` et `décris-moi` absents du vocabulaire du petit modèle (ignorés par la grammaire).
  Il faudra des formulations présentes dans le vocabulaire.
- **iPad Pro A12Z (natif, mêmes décodages)** : précision identique au Mac ; 1,9 ms par bloc de 80 ms (95e
  centile 15 ms, pire 64 ms) ; phrase rendue 9 ms (95e centile 15 ms) après la fin de l'audio ; création
  d'un tour 0,3 ms.
- **Navigateur (vosk-browser dans Chromium)** : même précision (95,9 % propre, 81,3 % voix de fond),
  chargement du modèle 1,8 s, environ 0,22 × le temps réel messages compris.

### 10.3 Silero : `ort`, pas `tract`

- `tract` 0.23.9 refuse les trois exportations Silero v5 publiées (`silero_vad.onnx`,
  `silero_vad_16k_op15.onnx`, `silero_vad_op18_ifless.onnx`) : leur nœud `If` (branche 8 kHz / 16 kHz) échoue
  à l'analyse des formes. Le contourner demanderait de réécrire le graphe : écarté.
- `ort` 2.0.0-rc.15 : Mac 0,13 ms par bloc de 32 ms, 41 Mo de mémoire ; **iPad A12Z 0,14 ms (95e centile
  0,15 ms), chargement 79 ms, +36 Mo**. Compile pour iOS et Android avec un ONNX Runtime précompilé (téléchargé
  depuis le CDN de pyke au moment de la compilation, empreinte vérifiée par `ort-sys`) ; FreeBSD : pas de
  binaire précompilé, à construire.
- Même moteur pour le mot d'éveil (openWakeWord est en ONNX) : un seul runtime d'inférence natif.

### 10.4 Mot d'éveil : garder le modèle actuel

Sur 16 « Ève, écoute-moi », 56 pièges proches et 388 commandes ou phrases de fond :

| | Propre | Bruit rose | Voix de fond |
| --- | --- | --- | --- |
| Modèle actuel (openWakeWord + `eve_ecoute_moi.json` + sa règle) | 14/16 ; pièges 8 ; autres 0 | 12/16 ; 9 ; 1 | **4/16** ; 1 ; 0 |
| Grammaire Vosk seule | 16/16 ; pièges 30 ; autres 4 | 15/16 ; 26 ; 6 | 11/16 ; 23 ; 5 |
| Les deux (modèle puis confirmation Vosk) | 14/16 ; pièges 7 ; autres 0 | 11/16 ; 4 ; 0 | 4/16 ; 1 ; 0 |

- Décision : le modèle actuel, porté en Rust sur `ort` ; confirmation Vosk en option (divise par deux les
  pièges sous bruit, sans perte en propre).
- Faiblesse mesurée **du modèle actuel** sous voix de fond (4/16) : hors refonte, à reprendre par un
  réentraînement avec des négatifs « voix de fond ».

### 10.5 Mémoire, taille, faisabilité

- **iPad A12Z (empreinte physique, la mesure qu'iOS utilise pour tuer une app)** : 2,9 Mo au départ →
  39,5 Mo avec ONNX Runtime + Silero → 138 Mo avec Vosk chargé (+99 Mo) ; stable pendant les 896 décodages.
- **Exécutable iOS** de l'app de test : 32,6 Mo avec Vosk + Kaldi + OpenFST + ONNX Runtime (27,7 Mo avec
  `tract` à la place d'ONNX Runtime).
- **Vosk pour iOS** : alphacephei ne publie pas de build iOS (« sur demande »). Construit ici depuis les
  sources : OpenFST compilé directement (18 s, sans autotools), Kaldi configuré pour Darwin puis compilé avec
  le SDK iOS et Accelerate (0 erreur), vosk-api ajouté, `libvosk_ios.a` lié dans l'app de test et exécuté sur
  l'iPad. Scripts : `temp/voice_bench/vosk_ios/`.
- **App de test** `one.atome.voicebench` (xcodegen, `temp/voice_bench/ios_bench/`), installée sur l'iPad
  atomic ; rapport lu dans son conteneur (`devicectl device copy from`). Piège : un dossier nommé `resources`
  à la racine du paquet casse la signature (« code object is not signed at all ») ; il s'appelle `bench`.
- **Non fait** : Windows, Linux, FreeBSD, Android sur émulateur, iPhone. Un WASM unique Rust + libvosk
  (emscripten) n'a pas été construit (pas d'emsdk sur la machine, et `ort` ne cible pas emscripten, §4.2).

### 10.6 Point ouvert : rejeter les voix de fond sans perdre de commandes

La grammaire force les phrases de fond vers des commandes : 36 % (propre) à 55 % (bruit rose) d'entre elles
déclenchent une action. La règle prévue « plus de 10 mots » ne marche pas en mode grammaire (la phrase est
réduite à quelques mots). Règles mesurées (`decor_rules.mjs`) :

| Règle de rejet | Propre : commandes / fond → action | Bruit rose | Voix de fond |
| --- | --- | --- | --- |
| aucune | 95,7 % / 36 % | 91,6 % / 55 % | 81,3 % / 49 % |
| durée de parole > 2,2 s | 95,7 % / **5 %** | 91,6 % / **9 %** | 52,2 % / 1 % |
| second décodage libre > 5 mots | 95,4 % / **0 %** | 91,0 % / 5 % | 41,3 % / 0 % |

- En propre et sous bruit, la règle de durée (mesurée par Silero, pas par Vosk) suffit presque.
- **Sous voix de fond continue, aucune règle ne tient** : la voix de fond allonge chaque énoncé, et la
  rejeter fait perdre la moitié des commandes. C'est le risque principal de la refonte, et il vient de
  l'acoustique, pas du moteur : le grand modèle fait pire.
- À essayer au lot 1, mesuré sur ce même corpus avant toute intégration :
  1. un seuil de **niveau proche** (la personne parle à l'appareil plus fort que la télévision, comme
     `voiceRatio` du mot d'éveil) appliqué aux segments Silero ;
  2. le **traitement vocal du système** sur la capture (iOS `setVoiceProcessingEnabled`, Android
     `VOICE_COMMUNICATION`), qui atténue le bruit stationnaire mais pas une voix ;
  3. ne décoder que le segment Silero le plus fort, pas tout l'enregistrement.
- Critère d'acceptation inchangé (§6 point 5) : 2 min de télévision sans action, mesuré dans une vraie pièce.

### 10.7 Ce que le lot 0 change au plan

- §4.1 : `ort` au lieu de `tract` ; mot d'éveil = modèle actuel porté ; poids du modèle Vosk corrigé.
- §4.2 : Vosk iOS faisable depuis les sources ; navigateur = vosk-browser + onnxruntime-web pilotés par la
  logique Rust en `wasm32-unknown-unknown`.
- §4.3 : poids réels.
- §5 lot 1 : commence par le rejet des voix de fond (§10.6) et le vocabulaire des grammaires (§10.2).
- Dépendances à valider par l'utilisateur avant le lot 1 : `ort` (et ses binaires précompilés de pyke),
  Kaldi/OpenFST/vosk-api compilés pour iOS, vosk-browser pour le navigateur, Silero VAD (MIT), modèle
  `vosk-model-small-fr-0.22`.

## 11. Lot 1 — avancement (23 oct.)

### 11.1 Vocabulaire des grammaires (fait)

- Mots absents du petit modèle : `wero`, `décris-moi` (et `vazi`, forme entendue de « vas-y »). En mode
  grammaire, Vosk recompose des suites de mots plutôt que des phrases entières (« paye pal », « apple paie »,
  « y a moi ») : les variantes entendues deviennent des formulations.
- `eVe/i18n/languages_first_launch_voice.js` (français seulement) : `paye pal`, `paie pal`, `pal` (PayPal),
  `apple paie`, `apple paye` (Apple Pay), `véro` à la place de `wero`, `vas y`, `décris moi` à la place de
  `décris-moi` ; en-tête : chaque mot doit exister dans le vocabulaire du modèle. Vérifié : 0 mot manquant
  (`temp/voice_bench/vosk_bench/src/bin/vocab.rs`).
- Effet (Vosk seul, lot 0) : propre 95,7 → **97,6 %** juste, faux 1,1 → **0,3 %**. Reste : « vas-y » (les voix de
  synthèse disent « vazi »), une voix sur « je reviens », « il est à moi ».

### 11.2 Rejet des voix de fond (fait, mesuré)

Principe retenu (prototype `temp/voice_bench/pipeline_bench`, balayage des réglages dans `pipeline_eval.mjs`) :
une trame est « proche » quand Silero entend de la parole **et** que son niveau dépasse de 9 dB l'ambiance
(90e centile des 10 dernières secondes hors tour). Un tour s'ouvre sur une trame proche et se ferme après 1 s
sans trame proche ; au-delà de 2,2 s de parole proche, c'est une conversation, pas une commande. Sous une
ambiance parlée (télévision), les trames qui ne ressortent pas sont atténuées de 20 dB avant Vosk ; sous un
bruit stationnaire, non (cela coûtait 4 points).

Nouvelles conditions du corpus : **télé seule** (phrases de fond 10 dB sous la voix, sur 3 s de télévision)
et **voisin** (phrases de fond à pleine voix, personne ne parle à eVe).

### 11.3 Moteur vocal dans `atome-audio-engine` (fait, sonde passée)

- `atome/engines/audio-engine/src/voice/` (366 lignes) : `vad.rs` (Silero sur `ort`), `turn.rs` (tours, ambiance,
  atténuation), `grammar.rs` (Vosk, refus explicite d'un mot hors vocabulaire : `voice_words_out_of_vocabulary`),
  `mod.rs` (`VoiceEngine::load`, `set_phrases`, `set_speaking`, `push`, `input_db` ; événements `speech_start`,
  `phrase { text, words }`, `unknown { reason: outside_grammar | too_long }`).
- Derrière la fonctionnalité Cargo **`voice`** (`vosk` + `ort` =2.0.0-rc.15 optionnels) : les builds actuels
  (Tauri, bibliothèque iOS) ne changent pas tant que leur hôte ne l'active pas (lot 2). `cargo check` sans la
  fonctionnalité : OK ; `clippy --features voice` : rien sur le module. `Cargo.lock` du moteur : +350 lignes
  (dépendances optionnelles résolues).
- Trois défauts trouvés par la sonde et corrigés à la racine :
  1. une fenêtre d'ambiance de 3 s se vide dans les pauses de la télévision → **10 s**, et aucun tour avant
     **1 s** d'ambiance entendue ;
  2. une phrase manquée relevait le seuil des suivantes → une trame n'entre dans l'ambiance qu'à **4,5 dB** au
     plus au-dessus d'elle (la télévision montée en volume est encore apprise en quelques secondes) ; les 300 ms
     qui précèdent l'ouverture d'un tour sont retirées de l'ambiance (début de la phrase) ;
  3. l'état récurrent de Silero, gardé à travers une coupure du flux, décalait les débuts de phrase → **remis à
     zéro quand eVe parle** (le flux est coupé à ce moment-là dans l'app).
- Sonde : `temp/voice_bench/engine_probe` (le vrai module, flux continu en blocs de 80 ms, 368 commandes par
  condition, 80 phrases de fond), score par `engine_eval.mjs` avec le vrai `matchGuideIntent` :

| Condition | Résultat du moteur | Rappel lot 0 (Vosk seul) |
| --- | --- | --- |
| Commandes, propre | **97,0 %** justes, **0 %** fausses | 95,7 % / 1,1 % |
| Commandes, bruit | **92,4 %** / 1,6 % | 91,6 % / 2,2 % |
| Commandes, télévision dessous | **84,0 %** / 4,3 % | 81,3 % / 7,3 % |
| Télévision seule | **0 action** sur 80 | 49 % d'actions |
| Voisin qui parle (pas à eVe) | **0 action** sur 80 | 36 % d'actions |

- Temps de calcul (Mac, sonde) : 0,6 ms par bloc de 80 ms (95e centile 6 ms ; une pointe isolée à 0,9 s,
  machine chargée, à surveiller sur l'iPad). La phrase arrive 1 s après le dernier mot (règle des 1 s).

### 11.4 Mot d'éveil porté dans le moteur (fait)

- `voice/wake.rs` (179 lignes) : port de `wake_features.js`, `wake_classifier.js` et du mode détection de
  `wake_detector_worker.js` — frontal openWakeWord (`melspectrogram.onnx`, `embedding_model.onnx`) sur le même
  `ort` que Silero (un seul environnement ONNX Runtime), classifieur `eve_ecoute_moi.json` (base64 décodé par la
  crate `base64`, ajoutée à la fonctionnalité `voice`), porte de silence, règle de déclenchement (`policy`),
  vérificateur personnel (`set_wake_verifier`, même format JSON, lu dans le coffre par l'hôte).
- `mod.rs` : `VoiceModels` (chemins des modèles), `set_listening(Conversation | Wake)` (chaque bascule repart
  d'un historique vide), événement `wake { score }`. Raccrochée, seul le mot d'éveil est écouté ; un seul flux micro.
- Comparaison au détecteur JS de production sur le même corpus (`engine_probe/src/bin/wake_probe.rs` contre
  `temp/wake_training/eval_bench_corpus.mjs`, 1 380 énoncés × 3 conditions) :
  - sans vérificateur : **1 380 / 1 380 décisions identiques** ;
  - avec un vérificateur (`model_a.json` servant de vérificateur de test) : **1 379 / 1 380** ; l'écart est au
    seuil : 3e trame à 0,89968 en WASM contre le seuil 0,9 du vérificateur — précision flottante entre ONNX Runtime
    natif et sa version WASM, pas un écart de logique.
- Temps natif (Mac) : 3,8 ms par trame de 80 ms (95e centile 5,7 ms) ; le JS en WASM : 2,9 à 4,9 ms en moyenne.
- Mode conversation inchangé après l'intégration (97,0 / 92,4 / 84,0 %, 0 action sur le fond).

### 11.5 Reporté aux lots suivants

- Commandes mal comprises sous télévision (4,3 %) : mots courts de grammaire pris dans la voix de fond
  (« mail » → sommeil, « repas » → nutrition, « a »). Mesuré et **écarté** : un seuil de confiance sur les mots
  qui ont fait la correspondance ramène les fautes de 4,3 à 1,9 % (seuil 0,8) mais fait perdre 20 points de
  commandes justes, même en propre. Mesuré : sans « mail » ni « ce mail » (ajoutés pour la reconnaissance
  d'Apple, qui entendait « ce mail » pour « sommeil » ; Vosk ne les rend jamais pour « sommeil »), les fautes
  sous télévision passent de 4,3 à **3,8 %**, sans perte ailleurs. À retirer de `languages_first_launch_voice.js`
  au lot 4, quand Vosk remplace la reconnaissance actuelle (qui en a encore besoin d'ici là).
- Règle de l'élision finale (« C' ») non implémentée : aucun cas dans le corpus ; à ajouter seulement si la
  recette la montre nécessaire.
- La normalisation des phrases pour Vosk (minuscules, apostrophe droite, sans ponctuation) se fera côté JS,
  avec la boucle de conversation (lot 3-4).
- Mesure du moteur sur l'iPad A12Z : au lot 2, une fois la fonctionnalité `voice` activée dans la bibliothèque iOS.

## 12. Lot 2 — intégrations (en cours, 23 oct.)

### 12.1 Socle commun (fait)

- **Modèles livrés** : `atome/src/assets/voice/vosk/vosk-model-small-fr-0.22/` (65 Mo) et
  `atome/src/assets/voice/vad/silero_vad.onnx` (2,2 Mo), chacun avec `metadata.json` (source, empreinte SHA-256,
  licence : Apache-2.0 pour Vosk, MIT pour Silero). Même dossier que la voix et le mot d'éveil : livré tel quel par
  Tauri (`resources` → `project/atome/src`), par le paquet iOS (`atome_runtime/src/assets/voice`) et servi au Web.
- **Session vocale** `atome/engines/audio-engine/src/voice/session.rs` : un `VoiceEngine` sur son fil, nourri toutes
  les 40 ms soit par la capture micro du moteur (bureau ; `wake_capture::take_samples`, sans JSON), soit par le PCM
  que l'hôte pousse (iOS). Les événements attendent dans une boîte que l'hôte lit ; le son ne quitte jamais le natif.
- **Surface de commandes unique** (`commands::dispatch`, celle de Tauri et de l'ABI C iOS) : `voice_start
  { modelsRoot, ownCapture }`, `voice_stop`, `voice_set_phrases`, `voice_set_speaking`, `voice_set_listening
  ('conversation' | 'wake')`, `voice_set_wake_verifier`, `voice_read` → `{ active, events, input_db, overrun }`.
  Sans la fonctionnalité `voice`, ces noms répondent `audio_command_unknown` (explicite).
- **Pont JS** `atome/src/squirrel/voice/native_voice_engine.js` : `start`, `stop`, `setPhrases`, `setSpeaking`,
  `setListening`, `setWakeVerifier`, `inputDb`, événements par `onEvent` (lecture toutes les 80 ms). Mêmes commandes
  `audio_voice_*` sur Tauri et sur l'app iOS (`getTauriInvoke`).

### 12.2 Bureau (Tauri) — câblé, compilé ; essai acoustique en attente

- `platforms/desktop-tauri/Cargo.toml` : fonctionnalité `voice` hors Android/iOS (libvosk déjà fournie par
  `native/lib`) ; commandes `audio_voice_*` (`audio_engine/bridge.rs`, via `dispatch`), enregistrées (`lib.rs`) et
  autorisées (`permissions/audio-engine.toml`). `cargo check` : OK.
- Sondes (`temp/voice_bench/engine_probe`) :
  - session, PCM poussé en temps réel (`session_push_probe`) : **20 / 20 tours** rendent leur phrase ;
  - **pont JS réel** + `dispatch` réel (`js_bridge_probe.mjs` + `dispatch_server`) : **20 / 20 tours**, « Ève,
    écoute-moi » réveille eVe raccrochée (`wake`), `setPhrases(['wero'])` refusé
    (`voice_words_out_of_vocabulary: wero`) ;
  - vrai micro du Mac (`session_probe`, `level_probe`) : la capture fonctionne (le niveau suit la pièce), mais **la
    sortie son du Mac était coupée (volume 0, muet)** : `say` n'a rien joué, l'essai « le Mac parle » n'a rien mesuré.
    À refaire son activé.
- Pas encore fait : l'app Tauri lancée elle-même (la WebView appelant les commandes).

### 12.3 iOS — compilé, contrat vérifié sur l'iPad ; essai acoustique en attente

- `platforms/ios/build_vosk_ios.sh` : recette figée (Kaldi `bc5baf1`, OpenFST `18e94e6`, vosk-api `4ab9821`),
  mise en cache dans `~/Library/Caches/atome/vosk-ios/` ; 3 min 30, `libvosk_ios.a` 36,6 Mo, iOS arm64, iOS 15 minimum.
- `platforms/ios/bevy-renderer` : fonctionnalité `voice` (`build.rs` intègre `libvosk_ios.a` à la bibliothèque
  statique) ; `atome_ios_voice_push` (ABI C, toujours présente, `false` sans moteur vocal).
- `build_bevy_renderer.sh` : moteur vocal pour l'app sur appareil seulement (`one.atome.app`, `iphoneos`) ; l'AUv3 et
  le simulateur n'en ont pas. `project.pbxproj` : l'app ajoute `-lc++` et `Accelerate` (modification ciblée, seule
  autre différence locale : les numéros de version d'une autre session).
- Swift : `AppNativeVoiceEngine.swift` (la capture micro existante sous la politique de session audio de l'app, poussée
  toutes les 40 ms ; modèles lus dans `atome_runtime/src/assets/voice`), routage dans `AppNativeAudioCommands.swift`,
  commandes de lecture/réglage dans `NativeKiraEngine.commands`, déclaration dans `AtomeIosAudioEngineBridge.h`.
- Bibliothèque Rust iOS : compilée avec (appareil) et sans (simulateur) moteur vocal ; symboles `vosk_*`,
  `OrtGetApiBase`, `atome_ios_voice_push` présents.
- `xcodebuild` (schéma `atome`, Debug, appareil) : **BUILD SUCCEEDED** ; modèles présents dans
  `atome.app/atome_runtime/src/assets/voice/` (Vosk 65 Mo) ; un avertissement Swift corrigé ensuite (capture `weak`).
- **Sur l'iPad A12Z**, par la WebView de l'app (`__ATOME_IOS_NATIVE_INVOKE`, relais Web Inspector de
  `temp/ipad_campaign_2026-10-20/ev.mjs`) : `audio_voice_start` actif en **1,9 s** (chargement des modèles), le micro
  de l'iPad nourrit le moteur (niveau −60 dB au calme, −48 dB sur un bruit), `wero` refusé
  (`voice_words_out_of_vocabulary`), bascule en mode éveil, arrêt propre. Pas d'énoncé prononcé : le son du Mac
  est coupé.

### 12.4 Navigateur (fait, vérifié dans Chromium)

- **Logique partagée** : nouvelle crate `atome/engines/voice-turns` (`atome-voice-turns`, sans dépendance) : la
  détection des tours (ex-`voice/turn.rs`, déplacé) et `Conversation` (pré-écoute de 300 ms, traîne de 300 ms
  après la voix d'eVe, gain sous ambiance parlée), l'orchestration qui était dans `voice/mod.rs`. Le moteur natif
  l'utilise (`listen`, `push` → actions `SpeechStart`, `Feed(pcm)`, `Close(end)`) : **événements identiques**
  avant/après sur tout le corpus (comparaison ligne à ligne). Le WASM du Web l'exporte
  (`platforms/web/audio-wasm/src/voice.rs`, classe `VoiceConversation` ; `atome/src/wasm/squirrel_audio_wasm*`
  reconstruits : seules des exportations ajoutées).
- `atome/src/squirrel/voice/browser_voice_worker.js` : Silero sur onnxruntime-web (déjà embarqué) + `VoiceConversation`.
  `atome/src/squirrel/voice/browser_voice_engine.js` : même API et mêmes événements que `native_voice_engine.js` ;
  capture `wake_capture.js` (getUserMedia), Vosk WASM (vosk-browser, vendoré dans
  `atome/src/assets/vendor/vosk-browser/` avec `metadata.json`), modèle en archive
  `assets/voice/vosk/vosk-model-small-fr-0.22.tar.gz` (42 Mo ; exclu des paquets iOS et Android, embarqué aussi par le
  bundle Tauri de bureau), mot d'éveil raccrochée = détecteur openWakeWord existant (`wake_detector.js`, qui lit
  lui-même le vérificateur dans le coffre).
- Vérification : Chromium sans fenêtre, micro simulé lisant un enregistrement (silence + 4 commandes),
  `temp/voice_bench/web_engine/` : modèle chargé en 1,4 s, **4 / 4 phrases** (« sommeil », « nutrition », « au revoir »,
  « journal intime »), environ 1,7 s après le début de chaque commande ; console propre (journaux Kaldi coupés).
- Limite : vosk-browser ne sait pas dire si un mot est dans le vocabulaire ; les phrases sont celles que le moteur
  natif vérifie sur le même modèle.
- Après la refonte : `cargo check` Tauri OK, moteur iOS (`--features voice`, `aarch64-apple-ios`) OK, clippy sans
  remarque sur `voice` et `voice-turns`.

### 12.5 Android (compilé, contrat vérifié sur l'émulateur)

`libvosk.so` officiel (vosk-android 0.3.75, Maven Central,
arm64-v8a, 10 Mo) dans `platforms/desktop-tauri/native/lib/android/arm64-v8a/`, lié par `build.rs`, empaqueté par
`gen/android/app/build.gradle.kts` (`jniLibs.srcDir`) ; fonctionnalité `voice` hors iOS. `./run.sh apk --test` :
APK de 693 Mo avec `lib/arm64-v8a/libvosk.so` (un premier essai a échoué disque plein ; j'ai supprimé mes seuls
artefacts de banc). Émulateur `atome-api37` (sans fenêtre), WebView pilotée par CDP (`temp/android-cdp/eval.mjs`) :
`audio_voice_start` actif en **0,67 s** (modèles lus depuis les actifs extraits), `wero` refusé, bascule en mode
éveil, arrêt propre. Le micro de l'émulateur ne rend que du silence (−60 dB) : capture réelle à vérifier sur un
téléphone.

### 12.6 Reste du lot 2

- Essai acoustique sur l'iPad et sur le Mac : 20 tours, le Mac qui parle (son du Mac à rétablir).
- Essai de la capture réelle sur un téléphone Android (le micro de l'émulateur ne rend que du silence).

## 13. Lot 3 — boucle de conversation (fait, 23 oct.)

- `eVe/voice/conversation/conversation_turns.js` (130 lignes) : `createConversationTurns({ say, phrases, understand,
  lines: { notUnderstood, goodbye }, onWake })`. Elle choisit le moteur (natif si l'hôte a `invoke` — Tauri, app iOS —,
  sinon celui du navigateur) et ne connaît ni écrans ni intentions.
  - États `idle → listening → acting → speaking → listening`, plus `hung_up` ; `getState()` (mode, niveau d'entrée) et
    `subscribe()` pour le disque.
  - eVe parle : `setSpeaking(true)`, la ligne, `setSpeaking(false)` (le moteur ajoute ses 300 ms).
  - `phrase` → `understand(text)` → rien, une ligne, ou `{ say, hangUp }`.
  - `unknown/outside_grammar` → « pas compris » au plus une fois toutes les 10 s ; `unknown/too_long` (voix de la
    pièce) → rien.
  - 3 minutes sans un mot (tout début de parole relance le délai) → ligne d'au revoir, raccroché, moteur en mode éveil.
  - Raccrochée : seul `wake` est entendu ; `wake` ou `recall()` (toucher) → conversation, `onWake()`.
  - Erreur du moteur → diagnostic `conversation.engine_error`, redémarrage après 1, 2, 4, 8, puis 15 s, dans le mode
    courant ; la conversation ne s'arrête jamais.
  - `screenChanged()` : les phrases du nouvel écran, au tour suivant.
- Sonde `temp/voice_bench/conversation_probe.mjs` (faux moteur, horloge virtuelle) : **18 / 18 vérifications** —
  réponse et micro ignoré pendant la voix, « pas compris » limité, voix de la pièce ignorée, relance du délai, 3 minutes,
  phrase ignorée raccrochée, rappel par le mot d'éveil et par toucher, raccrocher par la voix, redémarrages à 1 s puis 2 s,
  état exposé, arrêt.

## 14. Lot 4 — guide réécrit (23 oct.)

### 14.1 Guide du premier lancement sur la boucle (fait)

- `eVe/domains/user/first_launch_guide.js` réécrit (171 lignes, contre 265) sur `createConversationTurns` : il garde la
  voix pré-rendue, les sous-titres, les phrases par écran (première visite), « répète », « décris », l'appui sur le bouton
  nommé par le même outil qu'un toucher, le signal du disque (voix d'eVe, niveau d'entrée du moteur toutes les 100 ms)
  et l'API de l'Atome d'accès (`getState`, `subscribe`, `subscribeSignal`, `open`, `close`).
  - Grammaire de l'écran = ses intentions + « répète », « raccroche », « décris » (si l'écran se décrit), normalisées
    pour Vosk (minuscules, apostrophe droite, sans ponctuation) ; `screenChanged()` à chaque écran.
  - Toucher sur elle : raccrochée → elle revient (son écran, puis l'écoute) ; parlant → elle se tait et écoute ;
    écoutant → rien. `close()` (toucher sur le fond, lot 5) → elle raccroche.
  - Au revoir des 3 minutes : la ligne déjà pré-rendue `eve.voice.assistant.idle_hang_up` (« Je te laisse. Dis :
    Ève, écoute-moi, pour me rappeler. »).
  - Pendant le premier lancement, le mot d'éveil du service vocal (runtime JS) est coupé : le moteur l'écoute lui-même ;
    à la fin, la préférence du profil s'applique de nouveau.
  - Langue : le modèle est français ; dans une autre langue elle parle sans écouter (diagnostic
    `first_launch.guide.voice_language_unsupported`).
- **Supprimé** : `stripOwnVoice` et `ECHO_RUN_WORDS` (`first_launch_guide_model.js`), `muteWhileSpeaking`,
  `heardAfter`, `ECHO_MS`, `SHORT_SESSION_MS`, `OWN_VOICE_MS`, `MUTE_TAIL_MS`, `COMMAND_MAX_WORDS`, la reprise
  de la reconnaissance, l'aiguillage du mot d'éveil vers le guide ; « ce mail » et « mail » des intentions françaises
  (mesuré au §11.5).
- Boucle : une phrase que `understand` ne sait pas placer reçoit aussi « pas compris » (même limite de 10 s) ;
  sonde de la boucle : 20 / 20.
- Sonde `temp/voice_bench/guide_flow_probe.mjs` (vrai guide, vraie boucle, faux moteur, fausse voix, faux écrans) :
  **20 / 20** — lignes puis écoute, grammaire de chaque écran (sans « mail »), micro ignoré pendant sa voix, parcours
  Démarrer → Commencer (« accès libre ») → Sommeil → Valider → C'est parti avec la grammaire de chaque nouvel écran,
  « répète », « pas compris », « au revoir » (raccrochée, mode éveil), commande ignorée raccrochée, mot d'éveil (retour,
  écran redit), toucher sur le fond puis sur elle, fin du premier lancement (écoute arrêtée).
- Connu : au premier écran, le moteur charge ses modèles avant qu'elle parle (1,9 s mesurées sur l'iPad A12Z) ;
  si la recette trouve ce silence gênant, démarrer le moteur plus tôt.

### 14.2 Assistant indisponible hors ligne (fait)

- `eVe/voice/assistant/assistant_offline.js` : `withAssistantOfflineGate(api, { env })` enveloppe l'API publiée par
  `bootstrapEveAssistant` (le seul endroit où elle est publiée : toucher, menu, mot d'éveil du service passent par elle).
  Hors ligne (`checkConnection('fastify')`, le propriétaire existant ; le serveur nuage porte les modèles de
  l'assistant), `open`, et `toggle` / `toggleInput` quand l'assistant est fermé, ne lancent aucune session : eVe dit
  une phrase pré-rendue, diagnostic `voice.assistant.offline`. Fermer reste toujours possible.
- Phrase `eve.voice.assistant.error.offline` : « Je ne suis pas disponible : nous sommes hors ligne. » (anglais : « I am
  not available: we are offline. ») ; ligne Siwis rendue par `scripts/generate_voice_lines.mjs --missing`
  (`atome/src/assets/voice/lines_fr/53349cb9beaade2a.wav`).
- `assistant_runtime.js` reste à 500 lignes (un import ajouté, deux affectations réunies sur une ligne).
- Sonde `temp/voice_bench/offline_probe.mjs` : **6 / 6** (hors ligne : `open`, `toggle`, `toggleInput` sans session et
  une phrase ; en ligne : la session s'ouvre ; une session ouverte se ferme hors ligne ; le reste de l'API inchangé).
- Paquet iOS reconstruit à blanc (`package_ios_runtime.mjs`) : le nouveau code y est, l'archive du navigateur non.

## 15. Lot 5 — eVe sur tous les écrans (fait, 23 oct.)

- Maquette validée par l'utilisateur le 23 oct. (`temp/voice_bench/mockups/maquette_1_ecran_compte_disque.png`, faite des
  pixels réels de l'app ; l'écran ancré était déjà la capture réelle).
- `first_launch_template_catalog.js` : les **14** cellules `logo` deviennent la cellule de l'Atome
  (`{ kind: 'atom', operation: 'assistant' }`) — les 7 cartes de compte (`accountCard` : device_class, reconnect,
  pair_wait, opened, accounts, recovery, recovery_wait) et phone, credentials, billing, billing_store, sms, welcome,
  profile ; chaque `version` est incrémentée (gabarits installés remplacés). Le plan disait 16 : les deux fenêtres
  d'appairage n'ont pas de logo et restent sans disque.
- `first_launch_presentation.js` : règle générale — tout gabarit du premier lancement qui a une cellule Atome héberge le
  disque (la liste `FIRST_LAUNCH_ATOM_TEMPLATES` disparaît ; `FIRST_LAUNCH_FRAMED_TEMPLATES` ne garde que la mise en
  page en carrés de l'accueil et du choix). Dans une carte de compte, la Matrix pose toutes les cellules et le disque
  prend un carré d'une unité au milieu de la cellule du logo, comme dans le coin ancré : grand quand elle écoute, petit
  anneau raccrochée (première version : toute la cellule, les deux tailles étaient égales — corrigé après capture).
- Toucher sur le fond → elle raccroche : `onBackgroundTap` de la Matrix (le chemin du Dashboard,
  `dashboard_mystic_runtime.js`), seulement avec le guide comme voix ; les cellules gardent leur toucher, un toucher
  sur le disque la rappelle. (Première tentative par une couche d'interception de surface : le fond de la Matrix est de
  l'interface, le toucher n'y arrivait pas — remplacée.)
- `first_launch_runtime.js` : par-dessus une session ouverte (`onReturn`), le disque est retiré comme l'était le logo.
- `dashboard_eve_atom.js` (modifié aussi par une autre session) : finalement **pas touché**.
- Vérification (`temp/voice_bench/mockups/capture_lot5.mjs`, app réelle, Chromium WebGPU, téléphone 390 × 844, Fastify
  jetable, micro simulé) : carte « Cet appareil est-il à vous seul ? » avec le disque à la place du logo (conforme à la
  maquette) ; toucher sur le fond → petit anneau ; toucher sur elle → elle revient et redit l'écran ; écran de paiement
  (disque en bas, visible après défilement) ; écran Objectifs ancré : toucher sur le fond → petit anneau. Captures dans
  `temp/voice_bench/mockups/lot5/`.

## 16. Lot 7 — nettoyage (fait pour ce que seul le guide utilisait, 23 oct.)

- Retiré de l'ancienne reconnaissance (qui sert encore la dictée du Dashboard, le panneau vocal et le trackpad, §8) :
  le micro coupé — `mute` (`service_stt_runtime.js`), `muteListening` (`bootstrap.js`), `setMuted` (`stt_api.js`),
  la commande iOS `set_muted`, l'état `muted` et ses gardes (`AppNativeSpeechRecognizer.swift`) — et le mode
  conversation `onUtterance` (`service_browser_stt.js`, `service_tauri_stt.js`). Gardés : le pont iOS
  `__ATOME_NATIVE_STT__` et `AppNativeSpeechRecognizer.swift` (la dictée iOS en dépend).
- Vérifié : `node --check` des cinq fichiers JS, aucune référence restante, `xcodebuild` appareil **BUILD SUCCEEDED**
  sans avertissement sur ces fichiers.
- Cartes : entrées datées du 23 oct. dans `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md` ;
  `FRAMEWORK_STATE.md` §5 : enregistrement « Native voice engine for the guided conversation » (vérifié / non vérifié).
- Mémoire : `project_voice_engine_refonte_2026-10-23`.
- Reste hors de ce lot : la dictée libre (§8, à arbitrer) garde `tauri-plugin-stt` et la reconnaissance d'Apple.

## 17. Reste à faire

- **Lot 6, recette au son réel** : fait (§18) ; ouverts : commandes sous la télévision sur l'iPad, « répète » au son
  réel, mode avion (§18.7).
- Capture réelle sur un téléphone Android.
- Arbitrage de la dictée libre en ligne (§8).

## 18. Lot 6 — recette au son réel (fait, 23 oct. ; points ouverts en §18.7)

### 18.1 Mac (le haut-parleur du Mac, son micro, la vraie session vocale)

- `say` joue ici environ 40 dB plus bas qu'`afplay` (−55 dB contre −15 dB au micro) : les phrases sont rendues par
  `say -o` et jouées par `afplay` (`engine_probe/src/bin/session_probe.rs`).
- 20 tours (ligne d'eVe micro ignoré, puis Thomas dit la commande) : **18 / 20 intentions justes, 0 fausse**, 2 sans
  rien (un tour resté ouvert, une commande non captée) ; jamais deux ratés de suite. (Le premier passage, pendant que
  `say -o` générait chaque fichier, a donné des événements groupés en retard : non retenu.)

### 18.2 iPad A12Z (le Mac parle, l'app écoute ; parcours du premier lancement)

- Pilote `temp/voice_bench/ipad_route.mjs`, **synchronisé sur l'app** (remarque de l'utilisateur : une première
  version envoyait les phrases à l'aveugle, pendant qu'eVe parlait encore) : il attend que la boucle ait rouvert le micro
  depuis 1,5 s (diagnostic `conversation.speaking`, ajouté pour cela et pour `conversation.heard`, écrit seulement avec
  les diagnostics vocaux) et vérifie l'étape publiée (`eve:first-launch-state`) avant la phrase suivante.
- Installation par-dessus (la permission micro est gardée ; WebDriverAgent refuse le mode automatisation, donc pas
  d'installation neuve possible sans l'utilisateur) ; JS de travail empaqueté par `install_voice.sh`.
- **Parcours 1 complet** : « Démarrer » (accès → choix, 4,4 s), « Accès libre » (→ objectifs, 7,4 s), « Sommeil »
  (→ sommeil, 5,1 s), « Valider » (raté une fois, compris au second essai, 8,2 s), « C'est parti » (premier lancement
  terminé, Dashboard et page Sommeil). Chaque phrase est entendue telle quelle (`conversation.heard`).
- Défaut vu dans la première version aveugle : « C'est parti » dit sur l'écran du choix (hors de sa grammaire) a été pris
  pour « retour ». Une commande hors grammaire peut donc être forcée vers une intention de l'écran ; à mesurer avec des
  phrases hors grammaire dans le corpus.

### 18.3 Parcours 2 à 4 (installations neuves, WebDriverAgent accepte l'invite micro)

- WebDriverAgent relancé par l'utilisateur dans son terminal (`xcodebuild test-without-building` + `iproxy 8100`) ;
  `temp/ipad_campaign_2026-10-20/alerts.sh` accepte ensuite les seules invites autorisées (micro, alarmes).
- Défaut trouvé au parcours 1 et corrigé : pendant l'action d'un bouton (créer le programme prend des secondes), le
  guide restait en « acting » et avalait la phrase dite sur l'écran suivant (« Valider » raté). `first_launch_guide.js`
  lance l'action sans l'attendre : elle continue pendant que la boucle réécoute.
- **Parcours 2 et 3 : 5 / 5 au premier essai** chacun ; **parcours 4** (après le correctif du §18.5) : 5 / 5 au premier
  essai (« Démarrer » 4,3 s, « Accès libre » 4,5 s, « Sommeil » 4,8 s, « Valider » 6,8 s, « C'est parti »).

### 18.4 Raccrocher / rappeler (`temp/voice_bench/ipad_hangup.mjs`)

- Défaut trouvé et corrigé : le toucher sur le fond n'écoutait que le fond de la Matrix, c'est-à-dire l'intérieur de
  son cadre. Sur les écrans encadrés ou ancrés (accès, choix, objectifs, sommeil, programme), un toucher autour du cadre
  tombe sur la surface du projet et ne raccrochait pas. `first_launch_presentation.js` ajoute, tant que le guide porte
  la voix, une couche `setRenderSurfaceInteractionInterceptorLayer('project', …)` (même règle que le Dashboard :
  `pointerdown` hors interface Bevy) qui appelle la même fonction `hangUp` que `onBackgroundTap`.
- Vérifié sur l'iPad, 14 contrôles : toucher sur le fond de la Matrix (accès) → raccrochée, « Démarrer » ignoré, toucher
  sur le disque → elle redit son écran, « Démarrer » compris ; « au revoir » (choix) → raccrochée sans un mot,
  « Accès libre » ignoré, « Ève, écoute-moi » → elle redit son écran, « Accès libre » compris ; toucher sur le bouton
  « Meilleur sommeil » → écran sommeil **sans raccrocher** (« Valider » à la voix compris ensuite) ; toucher autour du
  cadre (sommeil) → raccrochée, « Valider » ignoré, toucher sur le disque → « Valider » compris. (L'écran sommeil est
  `quiet` : rappelée, elle n'y dit rien, c'est voulu.)
- **3 minutes de silence** : ligne d'au revoir à 180 s, raccrochée (« Accès libre » ignoré), « Ève, écoute-moi » la
  rappelle (2 essais, 2 fois).

### 18.5 Télévision (`ipad_tv.mjs`, `ipad_tv_commands.mjs` ; sonde moteur `engine_probe/src/bin/tv_probe.rs`)

- Défaut trouvé sur l'iPad et reproduit à l'identique par la sonde moteur : 2 min de télévision (le babillage du
  corpus en boucle, 10 dB sous les commandes) ouvraient **un tour toutes les 5 s** pendant 2 min (22 `too_long`),
  avalaient les commandes dites dessous, et finissaient sur un « pas compris » (et, dans la sonde, un faux
  « identifier »). Cause : l'ambiance n'apprenait la pièce qu'entre les tours ; un tour trop long pour une commande est
  la pièce qui parle, mais ses trames n'y entraient jamais, donc le seuil restait celui de la pièce silencieuse. Le
  corpus du lot 0 ne l'avait pas vu : ses télévisions duraient 3 s.
- Correctif (`atome/engines/voice-turns/src/turn.rs`) : les trames d'un tour fermé en `too_long` (et ses 300 ms de
  début) entrent dans l'ambiance par la même règle que les autres (au plus 4,5 dB au-dessus d'elle).
- Sonde moteur : 1 `too_long` le temps d'apprendre, puis plus rien ; les commandes à 60 s et 110 s sous la télévision
  et celle d'après sont comprises ; plus de faux « identifier ». **Corpus inchangé** : propre 97,0 % / 0 %, bruit
  92,4 % / 1,6 %, télévision 84,0 % / 3,8 %, télévision seule et voisin 0 action. WASM du navigateur reconstruit
  (Chromium 4 / 4), app iOS reconstruite (`BUILD SUCCEEDED`), sondes de boucle, de guide et hors ligne passées.
- iPad, nouvelle build : **2 min de télévision sans action** (critère du §6) ; dans un essai 0 tour ouvert par la
  télévision, dans l'autre 2 au démarrage de la télévision (le temps d'apprendre), dont un « pas compris ».
  Commandes dites **après** la télévision : 2 / 2 dans un essai, 1 raté dans l'autre (1,5 s après la fin, tour coupé).
- Diagnostic ajouté (écrit seulement avec les diagnostics vocaux) : `conversation.speech_start` et
  `conversation.unknown { reason }` dans `conversation_turns.js`.

### 18.6 Marge « proche » : 9 dB contre 8, 7, 6, 5 dB (23 oct.)

Balayage de `MARGIN_DB` (`temp/voice_bench/margin_sweep.sh`, `RISE_DB` tenu à 4,5 dB pour ne bouger que la marge ;
`turn.rs` remis à 9 dB ensuite) :

| Marge | Corpus : propre / bruit / télé dessous (justes / fausses) | Télé seule, corpus | Télé longue seule, sonde | Mac au son réel : sous la télé, après, tours de la télé | iPad au son réel : sous la télé, après, télé seule 2 min |
| --- | --- | --- | --- | --- | --- |
| 9 | 97,0 / 0 — 92,4 / 1,6 — **84,0 / 3,8** | 0 action | 2 tours (1 `too_long` au début) | 8 / 9, 3 / 3, 1 | **20 / 31** (4/8, 8/10, 8/13), 6 / 6, 1 tour muet au début |
| 8 | 97,3 / 0 — 92,1 / 1,9 — **84,0 / 2,7** | 0 action | 3 tours (+1 `outside_grammar` à 7 s) | 9 / 9, 3 / 3, 1 | **19 / 24** (8/10, 11/14), 4 / 4, 1 tour muet au début (2 essais) |
| 7 | 97,0 / 0 — 92,4 / 1,9 — **30,7 / 3,8** | 0 action | 3 tours | 9 / 9, 3 / 3, **3** | — |
| 6 | 97,3 / 0 — 92,4 / 1,6 — **30,2 / 4,3** | 0 action | 3 tours | 8 / 9, 3 / 3, **3** | — |
| 5 | 97,3 / 0 — 92,1 / 1,6 — **30,4 / 4,3** | 0 action ; voisin **2,5 %** | 3 tours | — | — |

- Sous 8 dB la marge casse tout : la télévision ouvre un tour juste avant la commande et s'y mêle (156 refus
  `outside_grammar` sur 368 au corpus), et au son réel elle ouvre 3 tours au lieu de 1.
- 8 dB : sur l'iPad 79 % sous la télévision contre 65 % à 9 dB (échantillons de 24 et 31 commandes : écart modeste) ;
  ailleurs égal, et moins de commandes fausses au corpus. Coût : à l'arrivée de la télévision, la sonde numérique ouvre
  un tour de plus (refusé en `outside_grammar`, donc un « pas compris » possible) ; au son réel, Mac et iPad, aucun tour
  de plus.
- (L'écart Mac / iPad tient au montage : sur l'iPad la télévision et la « personne » sortent du même haut-parleur,
  loin de l'appareil ; dans une pièce la personne parle près de lui.)
- **Décision de l'utilisateur (23 oct.) : 8 dB**, `RISE_DB` fixé à 4,5 dB (il valait la moitié de la marge).
  `turn.rs` modifié, WASM du navigateur et app iOS reconstruits. Revérifié sur ce code : corpus identique au balayage
  (97,3 / 0 — 92,1 / 1,9 — 84,0 / 2,7, télévision seule et voisin 0 action), sonde télévision (commandes à 60 s, 110 s et
  après : comprises), Chromium 4 / 4, sondes de boucle et de guide passées ; **iPad : parcours complet 5 / 5 au premier
  essai**, et « Démarrer » compris au premier essai sur 7 installations neuves.

### 18.6 bis Démarrage sourd (vu une fois, non reproduit)

- Sur une installation neuve (build 8 dB), eVe n'a rien entendu pendant 3 minutes : aucun tour ouvert, aucun refus,
  aucune erreur, alors que le micro donnait bien du son (la pièce sous −60 dB, la commande vers −32 dB, lus par
  `audio_voice_read`). Au bout de 3 minutes elle a raccroché comme prévu ; « Ève, écoute-moi » l'a rappelée et tout a
  marché ensuite. **Non reproduit sur 7 installations neuves** (1 sur 8 aujourd'hui). Cause inconnue : le retour en
  conversation remet à zéro le tour, Silero et les échantillons en attente, mais une phrase d'eVe le fait aussi.
- Pour le saisir la prochaine fois : `temp/ipad_campaign_2026-10-20/trap_voice.js` (piège de test, chargé en tête du JS
  empaqueté) enregistre chaque appel natif `audio_voice_*` (commande, niveau d'entrée, événements) ;
  `temp/voice_bench/ipad_nv_dump.mjs` le résume seconde par seconde ; `ipad_deaf_hunt.sh` répète les installations
  neuves jusqu'au premier « Démarrer » raté deux fois et garde la trace.

### 18.7 Ouvert

- **Démarrage sourd** (§18.6 bis) : vu une fois sur 8 installations neuves, cause inconnue, piège en place.
- Commandes sous la télévision sur l'iPad : 79 % à 8 dB (§18.6). Un « pas compris » reste possible à l'arrivée de la
  télévision, le temps d'apprendre la pièce.
- **« Répète » mal reconnu au son réel** : 0 / 3 sur l'iPad dans une pièce calme, 1 / 2 sur le Mac (micro réel) ;
  « redis », « recommence » et « tu peux répéter » passent. Parfait en numérique (confiance 1,0). À mesurer avec des
  phrases hors grammaire et des variantes dans le corpus.
- Toujours ouverts : capture réelle sur un téléphone Android, arbitrage de la dictée libre (§8), mode avion sur l'iPad.
