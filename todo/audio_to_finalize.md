# Audio : à finaliser (Timeline / enregistrement / synchro)

Reste à faire sur la tâche Timeline v1.6, première ébauche du 14 oct. 2026. Cette liste sera finalisée avec la tâche de mixage en cours, dans une seule tâche, pour éviter les conflits.

- Référence : `todo/timeline/timeline_cellules_cahier_des_charges_v1.6.md` et ses maquettes.
- Suivi détaillé de ce qui est livré : `todo/timeline/suivi_premiere_ebauche_2026-10-14.md`.

**Zones partagées avec le mixage** (à coordonner) :
- `eVe/core/media_engine/molecule.js` et `molecule_render_schedule.js` ;
- `eVe/intuition/tools/molecule/runtime_transport.js` ;
- `platforms/web/audio-wasm/src/{lib.rs,scheduled_backend.rs}` ;
- `platforms/desktop-tauri/src/audio_engine/*` ;
- `atome/src/application/audio_runtime/{backend.kira.js,kira_audio_commands.js}`.

`lib.rs` et `kira_audio_commands.js` ont été modifiés par une autre session après mes tests : relancer les preuves ci-dessous sur l'état fusionné.

## 1. Vérifications restantes

1. **Tauri, scénario complet dans l'application.** 4 prises à la volée, puis une 5ᵉ déposée à la mesure 2, ainsi que le métronome et le décompte.
   - Le moteur est déjà prouvé par `cargo test --lib scheduled_backend_tests -- --test-threads=1` (dans `platforms/desktop-tauri`).
   - *Comment* : reconstruire Tauri, puis copier eVe dans `target/debug/eVe` (copie figée). Rejouer à la main, ou piloter la WebView via l'inspecteur distant.
   - Vérifier `start_frame` 96000 et `sample_accurate` dans le résultat de `stopGroupTimelineGenericRecording`.
2. **Latence matérielle réelle** (vrai micro, vrais haut-parleurs), à faire par l'utilisateur. Voir l'outil du point 2.1.
3. **Input sur Tauri.** Le nom de périphérique choisi dans le panneau Input (WebView) doit correspondre au nom cpal.
   - Un nom inconnu doit renvoyer l'erreur `audio_input_device_not_found`, sans repli silencieux.
4. **Sondes à relancer après la fusion avec le mixage** :
   - `temp/timeline/timeline_sync_real_app.probe.mjs`, la preuve de synchro ; son bouclage numérique contourne la file MediaStream ;
   - `timeline_multitrack_real_app.probe.mjs` ;
   - `timeline_record_real_app.probe.mjs` ;
   - `timeline_view_real_app.probe.mjs` ;
   - `exact_placement_smoke.mjs` ;
   - `prompter_ticks_smoke.mjs`.

   Commande : `HEADLESS=0 PROBE_PROFILE_DIR=temp/assistant_debug/chromium_profile node temp/timeline/<sonde>`. Si le boot bloque, lancer d'abord `temp/timeline/purge_refused_assistant_profile.mjs`.
5. **Test de dépôt en échec** : `tests/performance/molecule_acceptance_performance.mjs` échoue sur une assertion Liste (`entries.length` 1 au lieu de 4001), avant la partie Timeline. Attribuer l'échec en comparant à un HEAD propre (`git archive`).

## 2. Précision professionnelle (priorité)

1. **Outil de calibration de l'entrée.**
   - *Comment* : dans le panneau Input, une action « Calibrer » joue une impulsion via `schedule_instances`, l'enregistre (câble de bouclage ou micro devant le haut-parleur), mesure le décalage avec `placeExactTake`, puis l'écrit dans `av.latency.report({ scope: 'calibration', object_id: '<kind>:<deviceId>' })`.
   - Elle est lue par `media_input_devices.js#readInputCalibrationSeconds`.
2. **Fondus et gain à l'échantillon près, en natif.** Aujourd'hui, `molecule.js#_syncVoiceEnvelopes` les applique depuis la boucle rAF du JS (IPC sur Tauri).
   - *Comment* : programmer les enveloppes à la création des voix, avec les tweens et paramètres Kira démarrés sur la trame exacte, sur le Web comme en natif.
   - Supprimer la synchro par rAF pour les voix programmées. Le gain de piste en direct reste un tween court.
   - Kira rend muet tout volume ≤ −60 dB.
3. **iOS sans calage à l'échantillon** : `audio_render_clock` n'existe pas côté iOS, donc le repli est non exact.
   - *Comment* : implémenter `render_clock` / `schedule_instances` / `capture_clock` dans le moteur natif iOS (AVAudioEngine), sur le modèle de Tauri : ancre trame ↔ horloge hôte, et démarrage à la trame exacte.
4. **Lecture en boucle** : le ruban vert stocke `transport.loop`, mais le moteur ne boucle pas.
   - *Comment* : au rebouclage, reprogrammer les voix de la boucle sur la trame de fin (`scheduleSessionVoices` avec une nouvelle `position`), à l'avance, sans passer par le rAF.
5. **Tête de lecture Web après un saut d'horloge.** `renderClockPosition` utilise la base de départ, alors que le placement des prises est déjà juste.
   - *Comment* : utiliser `base_segments` de `render_clock`.
6. **Métronome** : 512 mesures au maximum en lecture ouverte, une programmation de voix par mesure.
   - *Comment* : remplacer par une voix en boucle native (`loop_region`) programmée sur la trame de la mesure.
7. **Mixage natif par piste.** Les voix vont toutes sur la piste principale de Kira ; gain et pan sont appliqués par voix.
   - *Comment* : une sous-piste Kira (`TrackBuilder`) par piste de timeline. C'est aussi le point d'insertion des plugins (point 4) : **à arbitrer avec la tâche de mixage en cours.**

## 3. Fonctions du cahier v1.6 non faites

1. **Cellules (vue Matrice)**
   - Timeline à gauche, cellules carrées à droite (inversé pour les gauchers). Une colonne par région, la cellule du bas joue toute la région, une cellule par piste au-dessus.
   - Colonnes réordonnables ; cellules copiables, collables et déplaçables, ce qui réorganise la timeline.
   - Lancement par tap ou par MIDI.
   - *Comment* : vue en arbre BevyUI sur le modèle de `project_view_timeline_tree.js`. Les cellules sont des références dynamiques au modèle canonique (§1 bis) : aucune copie de média.
2. **Scènes** : la bande est réservée et vide. Créer les régions Scènes, avec leur enchaînement par défaut (§1 bis).
3. **Follow Actions assignables à toute cellule** : catalogue encore ouvert (§8). Les prévoir dans le modèle de cellule.
4. **Comping** : double-clic dans une zone vide pour fixer le nombre de prises ; une boucle sur une zone donne un comping automatique ; les zones suivantes de la même piste rejouent la première prise.
5. **Punch in / out.**
6. **Outils sur les blocs** : split (aujourd'hui Alt + double-clic seulement), join, stretch, enregistrement MIDI sur bloc, et tous les outils audio et vidéo dans le rail de la Timeline.
   - *Comment* : définitions du rail de `project_view_timeline_rail.js`, qui délèguent aux outils `audio_edit` existants. Ils trouvent déjà le bloc sélectionné via `readActiveMoleculeTarget().clip_id`.
7. **Échantillons (slices)** : reportés par l'utilisateur.
8. **Ordre de la Liste** : réordonner la Liste ne déplace pas une timeline déjà amorcée. Définir la règle, puis l'appliquer.

## 4. Prévu, non réalisé

- **Plugins** (§11.13) : point d'insertion par piste dans la chaîne Kira, latence déclarée et compensée par le même mécanisme de placement que la latence d'entrée, réglages persistés dans le modèle de la piste. Aucun format n'est choisi.

## 5. Clôture

- Mettre à jour `maps/`, `eVe/documentations/FRAMEWORK_STATE.md` (entrée du 14 oct. 2026 « Timeline v1.6 first draft ») et `todo/timeline/suivi_premiere_ebauche_2026-10-14.md`.
- Pas de commit ni de push sans demande explicite.

---

## 6. Table de mixage : à finaliser (ajout du 14 oct. 2026)

### Contexte

- **Cahier et suivi.**
  - Cahier : `todo/mixer/mixer.md`. Journal et décisions D1–D9 : `todo/mixer/mixer_plan.md`.
  - Recette ligne par ligne : `todo/mixer/mixer_recette.md`. Les lignes marquées NON TESTÉ / LIMITATION sont à faire passer en PASS.
- **Livré et vérifié**, sur Tauri desktop (Kira natif) et en Web/WASM (Kira WASM) :
  - l'état canonique `timeline.mix` et les opérations `mix.*` ;
  - le crate `atome/engines/mix-graph`, effet sur la piste principale de Kira avec une sous-piste par tranche ;
  - la vue du mixeur, les groupes, la voie vidéo, la voie MIDI, les entrées live et les paires de sorties.
- **Point 2.7 « Mixage natif par piste » : réglé par le mixeur.**
  - Les voix portent un `stripId` et jouent sur la sous-piste Kira de leur tranche.
  - Le graphe applique volume, pan, effets, envois et bus.
  - Ne pas réintroduire de gain ni de pan par voix. Sur les moteurs à graphe, le transport envoie `gain: 1, pan: 0`.
- **Point 4 « Plugins » : le point d'insertion existe.**
  - Un module de la chaîne d'une tranche, déclaré dans `kernel/mix_modules.js` et hébergé dans `mix-graph/src/module.rs`.
  - Sa latence se déclare via la fonction `module_latency` de `graph::compensation`, aujourd'hui toujours 0.
- **Fichiers du mixeur à surveiller lors des fusions** :
  - `kernel/mix_*.js` ;
  - `eVe/core/media_engine/molecule_mix_{engine,video,live_web}.js` ;
  - `eVe/intuition/tools/molecule/{runtime_midi.js,runtime_transport.js,runtime.js}` ;
  - `eVe/domains/rendering/molecule_mix_*.js` et `project_view_molecule_mix_content.js` ;
  - `platforms/desktop-tauri/src/audio_engine/{mix,aux_outputs,live_input,playback,playback_schedule,scheduled_backend,bridge}.rs` ;
  - `platforms/web/audio-wasm/src/{mix.rs,lib.rs,scheduled_backend.rs}` ;
  - `atome/src/application/audio_runtime/{backend.kira.js,kira_audio_commands.js,audio.facade.js}`.

### 6.1 iOS / AUv3 en Kira natif (prioritaire, travail long)

**Problème.** Sur iOS, `audio_*` est traité par du Swift (`platforms/ios/atome-auv3/application/AppNativeAudioCommands.swift`, AVAudioEngine) et non par Kira.
- Le graphe de mixage n'y existe donc pas.
- `mixGraphSupported()` (`molecule_mix_engine.js`) exclut `ios_native_kira` et `ios_auv3_native`.
- La voix ne porte que le Volume×Pan statique de sa tranche (`mixStripVoiceLevel`).
- Ne sont pas rendus : effets, envois, bus, sidechain, Mono, OUT coupé, entrées live, paires de sorties, vumètres, queue d'effet.

**Décision.** On passe iOS et l'AUv3 en Kira natif Rust, le même moteur que Tauri desktop. Pas de réimplémentation du DSP en Swift.

**Comment :**
1. Compiler pour iOS (`aarch64-apple-ios`, et simulateur) le moteur Rust de `platforms/desktop-tauri/src/audio_engine` avec `atome-mix-graph`.
   - Soit en bibliothèque statique liée à l'app, comme `platforms/ios/bevy-renderer`.
   - Soit via Tauri mobile, selon ce que l'app iOS embarque réellement.
2. Backend Kira iOS sur le modèle de `scheduled_backend.rs` (CPAL sait cibler CoreAudio/iOS) :
   - rendu en avance dans une FIFO, `render_clock`, démarrage des voix à la trame exacte ;
   - ancre hôte, ce qui couvre aussi le point 2.3 ;
   - paires auxiliaires (`aux_outputs.rs`).
3. Router les commandes `audio_*` du pont Swift vers ce moteur au lieu d'AVAudioEngine : lecture, programmation, `audio_mix_*`, `render_clock`. Garder Swift seulement pour la session audio iOS (`AVAudioSession`, catégorie, interruptions, route).
4. AUv3 : rendre le graphe dans le callback de l'Audio Unit, sans allocation, sans verrou bloquant et sans accès disque dans le thread temps réel (règle du module 06). Vérifier que `MixGraphEffect` ne fait que `try_lock`, comme aujourd'hui.
5. Ajouter `ios_native_kira` et `ios_auv3_native` à `GRAPH_RUNTIMES` dans `molecule_mix_engine.js`. Puis supprimer `mixStripVoiceLevel`, la branche `graph: false` de `runtime_transport.js#buildTransportTimeline` et le test associé de `molecule_transport_runtime.probe.mjs`.
6. Entrées live sur iOS : ouvrir l'entrée CPAL/CoreAudio comme `live_input.rs`. Côté WebView, l'origine `atome:` désactive les API « secure context » (AudioWorklet, `getUserMedia` selon la version) : la capture doit être native.
7. Preuves : `temp/mixer/mix_graph_real_app.probe.mjs`, adaptée au simulateur ou à l'iPhone via l'inspecteur distant, et `temp/timeline/timeline_sync_real_app.probe.mjs`. La ligne #36 de `mixer_recette.md` doit passer de LIMITATION à PASS.

### 6.2 Vérifications non faites (NON TESTÉ dans la recette)

1. **Tauri, application lancée** (#35) : reconstruire Tauri et copier eVe dans `target/debug/eVe` (copie figée). Rejouer `temp/mixer/mixer_ui_real_app.probe.mjs` et `mix_graph_real_app.probe.mjs` dans la WebView, au moins Volume, V1, V4, la queue d'effet et les groupes.
2. **Entrée live native** (#16) : une tranche avec IN = micro sur Tauri. Vérifier le niveau dans `audio_mix_levels`, l'ouverture et la fermeture du flux (`live_input::sync`), et le cas d'un nom de périphérique inconnu (`audio_input_device_not_found`).
   - **À corriger :** si la fréquence d'échantillonnage de l'entrée diffère de celle de la sortie, il n'y a pas de rééchantillonnage, donc dérive de hauteur. Demander la config d'entrée à la fréquence de sortie, ou rééchantillonner dans `LiveInput`.
3. **Interface multicanal physique** (#21) : router une tranche vers « Sortie 3-4 ».
   - Natif : canaux 3-4 réellement alimentés, FIFO auxiliaires en phase avec la principale.
   - Web : `destination.maxChannelCount > 2`, mode `discrete`.
4. **Port MIDI physique** (#29) : un clip `.mid` joué vers un vrai port.
   - **Bug préexistant :** un `.mid` importé sur le Web garde `media_url: null`, donc `prepareMidiPlayback` donne 404.
   - **Horodatage :** `sendMidiBytes` reçoit un `at_ms` relatif, interprété comme horodatage absolu par Web MIDI. Il faut un horodatage `performance.now()` absolu calé sur `started_at_ms` de l'horloge de rendu.
5. **Gestes tactiles** (#33) : swipe, appui long + déplacement, suppression, double-tap pour ajouter, lasso, glisser de bande, sur iPhone/iPad ou en émulation tactile Playwright (`hasTouch`).
6. **Main gauche** (#34) : chevron de groupe ouvert vers la gauche et palettes du bon côté. Décider si l'ordre des tranches s'inverse en gaucher ; l'ancien mixeur l'inversait.
7. **Synchro A/V perçue** (#32) : définir un seuil (cahier §10) et mesurer image contre son. La voie vidéo est une projection de rendu sans latence propre ; la latence de sortie audio n'est pas encore compensée côté image.
8. **Pixels de la voie vidéo** (#28) : clip vidéo réel, opacité et filtre couleur visibles dans la capture, image masquée quand la sortie est « Aucune ».
9. **Gestes réels non couverts par la sonde UI** : réordonnancement et suppression à la souris réelle (#10, #11), double-clic dans le vide (#8), glisser de bande (#27), choix d'une clé de sidechain dans l'UI (#22). Les ajouter à `temp/mixer/mixer_ui_real_app.probe.mjs`.

### 6.3 Corrections et compléments fonctionnels

1. **MIDI dans la lecture de liste** (séquence de Molécules, `toggleSequence`) : les clips MIDI n'y sont pas joués.
   - *Comment* : appeler `runtime_midi.start` par Molécule avec son décalage `start_seconds`.
2. **MIDI au déplacement de la tête** (`seek` / `scrub` pendant la lecture) : la lecture MIDI n'est pas relancée à la nouvelle position. Faire `midi.stop` puis `start` depuis la position.
3. **Délai : changer le temps reconstruit l'effet** (`effects.rs#requires_rebuild`), ce qui perd l'écho en cours. Acceptable, mais à documenter, ou à remplacer par un délai interne à temps modulable.
4. **Fader : double-clic pour saisir une valeur**, comme tous les tool-sliders (`openSliderValueEntry`). Le fader canonique `bevy_panel_fader.js` ne l'a pas encore.
5. **Vumètres dans la tranche** : les niveaux existent (`readGroupTimelineMixLevels`), sans affichage, parce que les maquettes n'en montrent pas. Demander à l'utilisateur s'il en veut ; ne pas les ajouter d'office.
6. **Mute / Solo** : ils restent sur l'en-tête de piste de la Timeline (le mixeur n'en affiche pas, conformément au cahier).
   - Le transport saute les voix muettes à la construction du plan, et le graphe reçoit aussi `muted`.
   - Unifier : ne laisser que le graphe appliquer mute/solo, pour qu'un changement en lecture soit immédiat, et retirer le saut côté transport. Vérifier d'abord l'effet sur la vidéo d'une piste muette.
7. **Groupes à préciser** (cahier, toujours ouvert) : groupes imbriqués, routage exact à l'extraction (règle provisoire : le membre reprend la destination du maître), commande commune d'un groupe mixte (Q9).
8. **Sortie d'un groupe vidéo** : le maître vidéo ne pilote pas l'audio de ses membres (pas de sémantique croisée). À confirmer avec l'utilisateur.
9. **Transfert de pistes entre Molécules** : les réglages de tranche suivent, mais les groupes explicites qui touchent une piste transférée sont élagués (`pruneMixReferences`). Décider s'ils doivent suivre.

### 6.4 Décisions à faire valider par l'utilisateur

Ce sont les décisions D1–D9 de `mixer_plan.md`, dont :
- fader vidéo = opacité ;
- « Grouper » des tranches uniquement audio = bus de sous-mix maître ;
- sélection par défaut = module de niveau, sinon IN ;
- sortie MIDI par défaut = aucune ;
- module « Flou » vidéo retiré, parce que le rendu des médias ne l'applique pas.

### 6.5 Dette et garde-fous

1. `tests/probes/molecule_ui_timeline_acceptance.mjs` (section Mixage réécrite pour le nouveau mixeur) n'a pas pu tourner : `npm run test:molecule:ui` échoue au setup, `api.auth.requestPhoneVerification is not a function`.
   - Réparer le setup de `molecule_eve_ui_acceptance_probe.mjs` sur le nouveau flux d'authentification (`startPhoneLogin` / `completePhoneLogin`, voir `temp/templates_interactivity/support.mjs`), puis le relancer.
2. Garde-fous en échec, hors mixeur, à traiter dans la même tâche finale :
   - `check:no-fallbacks` et `check:molecule-guardrails` : le mot « fallback » dans `eVe/intuition/tools/molecule/recording/exact_placement.js` (tâche Timeline) ;
   - `check:map-paths` : chemins périmés dans `maps/CODEMAP.md` (`scripts/bundle-porcupine.js`, `tests/eve/wake_porcupine.test.mjs`, `eVe/intuition/tools/molecule/render/timeline_scene.js`).
3. Tests vitest préexistants en échec, sans lien avec le mixeur : `tests/eve/panel_nested_scroll.test.mjs` (4 tests) échoue aussi avec le `bevy_ui_scroll_runtime.js` de HEAD. Le défilement horizontal ajouté pour le mixeur n'y change rien.
4. Taille de fichiers :
   - `molecule_mix_interactions.js` fait 309 lignes (zone transitoire) : scinder si on y ajoute du comportement ;
   - `playback.rs` (743 lignes) et `audio-wasm/src/lib.rs` (560) étaient déjà au-dessus de 500 : ne pas les faire grossir, réduire si on les retouche.
5. Après toute modification de `atome/engines/mix-graph` ou de `audio-wasm` : `cargo test` dans le crate, `./platforms/web/audio-wasm/build.sh`, puis purge du service worker dans les sondes.

### 6.6 Sondes de non-régression du mixeur (à relancer après chaque fusion)

- `node --test tests/probes/molecule_mix_{model,engine,view,midi}.probe.mjs` : 7, 4, 4 et 3 tests.
- `cd atome/engines/mix-graph && cargo test` : 14.
- `cd platforms/desktop-tauri && cargo test --lib audio_engine` : 24.
- `PROBE_PROFILE_DIR=temp/assistant_debug/chromium_profile node temp/mixer/mix_graph_real_app.probe.mjs` : 10.
- `HEADLESS=0 PROBE_PROFILE_DIR=temp/assistant_debug/chromium_profile node temp/mixer/mixer_ui_real_app.probe.mjs` : 13.
- `HEADLESS=0 … node temp/timeline/timeline_sync_real_app.probe.mjs` : 6 sur 6, au sample près à travers les tranches.

### 6.7 Clôture du mixeur

- Mettre à jour `todo/mixer/mixer_recette.md` (statuts), `todo/mixer/mixer_plan.md` (journal), `maps/` (CODEMAP, ARCHITECTURE_MAP, API_MAP, DESIGN_MAP, déjà à jour au 14 oct.) et `eVe/documentations/FRAMEWORK_STATE.md` (entrée « Modular mixer »).
- Pas de commit ni de push sans demande explicite.
