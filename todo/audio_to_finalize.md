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
3. **[x] FAIT — Input sur Tauri.** Le panneau Input liste les entrées du moteur natif (`mix_output_devices`, noms cpal) : le nom choisi est un nom que cpal connaît. Nom inconnu → `audio_input_device_not_found` (test natif `live_input_follows_the_output_rate_and_refuses_unknown_devices`). Le nom de périphérique choisi dans le panneau Input (WebView) doit correspondre au nom cpal.
   - Un nom inconnu doit renvoyer l'erreur `audio_input_device_not_found`, sans repli silencieux.
4. **[x] FAIT (14 oct., soir) — Sondes à relancer après la fusion avec le mixage** : sync 10/10 (avec calibration réelle et boucle), multitrack 6/6, record 8/8, view 6/6, `exact_placement_smoke` OK, `prompter_ticks_smoke` OK :
   - `temp/timeline/timeline_sync_real_app.probe.mjs`, la preuve de synchro ; son bouclage numérique contourne la file MediaStream ;
   - `timeline_multitrack_real_app.probe.mjs` ;
   - `timeline_record_real_app.probe.mjs` ;
   - `timeline_view_real_app.probe.mjs` ;
   - `exact_placement_smoke.mjs` ;
   - `prompter_ticks_smoke.mjs`.

   Commande : `HEADLESS=0 PROBE_PROFILE_DIR=temp/assistant_debug/chromium_profile node temp/timeline/<sonde>`. Si le boot bloque, lancer d'abord `temp/timeline/purge_refused_assistant_profile.mjs`.
5. **[x] ATTRIBUÉ — Test de dépôt en échec** : préexistant, hors audio. La Liste a gagné le niveau d'expertise (en débutant, le dépliage est ignoré → 1 entrée) et la navigation par l'outil `ui.matrix.navigation` (`tool_handler_missing_v2` dans un script Node sans amorçage des outils). Prochaine action : donner au test une fenêtre « advanced » et le gestionnaire de navigation (comme `project_view_list_redesign.test.mjs`). Constat initial : `tests/performance/molecule_acceptance_performance.mjs` échoue sur une assertion Liste (`entries.length` 1 au lieu de 4001), avant la partie Timeline. Attribuer l'échec en comparant à un HEAD propre (`git archive`).

## 2. Précision professionnelle (priorité)

1. **[x] FAIT — Outil de calibration de l'entrée.** Bouton « Calibrer l'entrée audio » du panneau Input → `recording/input_calibration.js` (`calibrateTimelineInput` dans l'API timeline). Web : impulsions programmées + capture sur le contexte partagé (option `measure` de l'enregistreur, rien n'est persisté), placées par `placeExactTake` ; natif : commande `audio_measure_input_latency` (`audio_engine/calibration.rs`, même horloge hôte qu'une prise). Écrit `av.latency.report({ scope: 'calibration' })`. Preuves : sonde réelle `calibration_tool_measures_the_loopback_offset` + prise calibrée à ±1 échantillon ; vrai CoreAudio : 2453 trames (51 ms) haut-parleur → micro, 2 trames d'écart. Limite : le registre `av.latency` n'est pas persisté (comme le choix d'entrée). Défaut corrigé au passage : `backend.kira.js` évalué deux fois (alias `#squirrel/`) remettait le moteur Kira Web à zéro ~10 s après le boot → dédoublonnage par id dans `module_loader_runtime.js`.
   - *Comment* : dans le panneau Input, une action « Calibrer » joue une impulsion via `schedule_instances`, l'enregistre (câble de bouclage ou micro devant le haut-parleur), mesure le décalage avec `placeExactTake`, puis l'écrit dans `av.latency.report({ scope: 'calibration', object_id: '<kind>:<deviceId>' })`.
   - Elle est lue par `media_input_devices.js#readInputCalibrationSeconds`.
2. **[x] FAIT (14 oct., soir) — Fondus et gain à l'échantillon près, en natif.** Fondus canoniques `clip.fades {in_frames, out_frames}` + op `molecule.clip.fades` (verbe `clip.fades`) ; enveloppe `VoiceEnvelope` rendue à chaque trame par `atome/engines/mix-graph/src/voice.rs` (Web + Tauri) ; plus de synchro rAF pour les voix programmées. Preuves : `cargo test` mix-graph 25/25, Tauri `scheduled_voice_fades_are_sample_exact`, `temp/audio_finalize/fades_metronome.probe.mjs`.
   - Ancien constat : Aujourd'hui, `molecule.js#_syncVoiceEnvelopes` les applique depuis la boucle rAF du JS (IPC sur Tauri).
   - *Comment* : programmer les enveloppes à la création des voix, avec les tweens et paramètres Kira démarrés sur la trame exacte, sur le Web comme en natif.
   - Supprimer la synchro par rAF pour les voix programmées. Le gain de piste en direct reste un tween court.
   - Kira rend muet tout volume ≤ −60 dB.
3. **[~] iOS : calage à l'échantillon branché** (`render_clock`, `schedule_instances`, `capture_clock` du moteur partagé, voir §6.1 ; prouvé au simulateur, prise placée à vérifier sur iPhone). Constat initial — iOS sans calage à l'échantillon : `audio_render_clock` n'existe pas côté iOS, donc le repli est non exact.
   - *Comment* : implémenter `render_clock` / `schedule_instances` / `capture_clock` dans le moteur natif iOS (AVAudioEngine), sur le modèle de Tauri : ancre trame ↔ horloge hôte, et démarrage à la trame exacte.
4. **[x] FAIT — Lecture en boucle** : chaque passe est programmée à l'avance sur la trame exacte de fin de la précédente (`startLoopScheduling`, minuteur hors rAF), voix coupées par `VoiceEnvelope.end_seconds`. Preuve app réelle : `take6_loop_passes_replay_exactly` (4 passes identiques à l'échantillon). Désactivée pendant un enregistrement (placement linéaire).
   - Ancien constat : le ruban vert stockait `transport.loop`, mais le moteur ne bouclait pas.
   - *Comment* : au rebouclage, reprogrammer les voix de la boucle sur la trame de fin (`scheduleSessionVoices` avec une nouvelle `position`), à l'avance, sans passer par le rAF.
5. **[x] FAIT — Tête de lecture Web après un saut d'horloge** (`renderFrameAt` partagé avec le placement, horloge lue à chaque image). `renderClockPosition` utilise la base de départ, alors que le placement des prises est déjà juste.
   - *Comment* : utiliser `base_segments` de `render_clock`.
6. **[x] FAIT — Métronome** : une voix native en boucle par série de mesures du même tempo (réancrée toutes les 16 mesures seulement si la mesure n'est pas un nombre entier de trames) ; plus de limite de 512 mesures. Preuve : `take5_metronome_clicks_every_beat_within_one_sample`.
   - Ancien constat : 512 mesures au maximum en lecture ouverte, une programmation de voix par mesure.
   - *Comment* : remplacer par une voix en boucle native (`loop_region`) programmée sur la trame de la mesure.
7. **[x] FAIT (par le mixeur, 14 oct.) — Mixage natif par piste** : chaque voix porte le `stripId` de sa piste et le graphe `atome-mix-graph` mixe par tranche (Volume, Pan, effets, envois, mute/solo) en natif comme sur le Web ; le point d'insertion des plugins sera un module de tranche. Constat initial : les voix vont toutes sur la piste principale de Kira ; gain et pan sont appliqués par voix.
   - *Comment* : une sous-piste Kira (`TrackBuilder`) par piste de timeline. C'est aussi le point d'insertion des plugins (point 4) : **à arbitrer avec la tâche de mixage en cours.**

## 3. Fonctions du cahier v1.6 non faites

1. **[x] FAIT — Cellules (vue Matrice)** — livré le 15 oct. :
   - Vue : `view.layout` timeline | cells | split + `split_ratio` + `cells_mode` edit | play (op `view.set`) ; outils du rail « Timeline » / « Cellules » (appui court = seule, appui long = côte à côte, `longPressInvokes` du rail contextuel), poignée de séparation déplaçable. Cellules carrées sur la rangée de leur piste, cellule de Scène sur la rangée de la règle ; gaucher = miroir. Owners : `project_view_timeline_cells.js` (arbre), `_cell_gestures.js`, `_cells_rail.js`, `_cells_midi.js`.
   - Édition : tap = sélection (Maj/Cmd ajoute), glisser = déplacer le contenu (`cell.place`), Alt = copier, cellule de Scène glissée = colonnes réordonnées (`scene.move`) ; réglages en lot dans le rail (lecture, déclenchement, passages, quantize début/fin, attaque/relâchement, Follow Action, MIDI, Vider).
   - Jeu : appui = lancement quantisé / arrêt (Latch), relâchement (Momentary) ; MIDI Note On/Off (`midi {note, channel}` de la cellule, « Apprendre ») ; progression = ruban de boucle glissé (mouvement, sans reconstruction).
   - Transport des cellules : `core/media_engine/molecule_cell_player.js` (passes programmées à l'avance sur leur trame exacte, grille commune, arrêt quantisé, passes au-delà annulées) + `tools/molecule/runtime_cells.js` (réglages, Follow Actions sur la trame de fin, Scène suivante par défaut puis arrêt) ; API `triggerGroupTimelineCells` / `stopGroupTimelineCells` / `readGroupTimelineCells`, verbes `eve.timeline.cells.trigger|stop` ; prend la main sur le transport linéaire et inversement.
   - Preuves : `tests/probes/molecule_cell_player.probe.mjs` 3/3 ; app réelle `temp/timeline/timeline_cells_real_app.probe.mjs` 20/20 (souris réelle, MIDI par `routeMidiMessage`).
   - **[x] Enregistrement dans une cellule vide** (§4–5 du cahier) : appui = capture immédiate, début utile sur le pas de quantize début de la grille des cellules, second appui = fin sur le pas de quantize fin ; la prise est placée au début de la Scène par `placeExactTake` (la grille sert de correspondance), la marge d'avant reste dans la source (`runtime_cell_recording.js`, ruban couleur Record pendant la prise). Preuves : `tests/probes/molecule_cell_recording.probe.mjs`, app réelle `take9_cell_take_lands_at_the_scene_start_to_the_sample` (impulsion à l'échantillon). Défaut corrigé au passage : le worklet d'enregistrement Web sautait les quanta d'une entrée devenue inactive (prise raccourcie, matière décalée) → ces quanta sont du silence (`audio_browser_recorder_worklet.js`).
   - **[x] Attaque / relâchement de cellule** (`fade_in_ms`/`fade_out_ms`) : rendus à l'échantillon par l'enveloppe de voix partagée (`VoiceEnvelope.attack_*`/`release_seconds`, mix-graph 30/30, WASM reconstruit, audio-engine 24/24) — attaque sur la première passe depuis le départ de la cellule, relâchement avant la fin de la dernière passe.
   - **[x] Arrêt exact et relâchement** : nouvelle commande moteur `audio_set_voice_end {voiceId, endFrame, releaseFrames}` (Web WASM, Tauri, iOS via `dispatch`) — `mix-graph/src/voice_control.rs` : deux atomiques lus à chaque trame par l'enveloppe (temps réel sans verrou), registre par id hors fil audio. L'arrêt quantisé d'une cellule finit les voix qui sonnent sur la trame exacte du pas, avec le relâchement de la cellule ; un arrêt manuel (Latch, relâchement Momentary) fond sur `fade_out_ms`. Preuves : mix-graph 32/32 (`a_late_end_cuts_a_sounding_voice_on_its_frame_with_its_release`), sonde moteur réel `temp/timeline/voice_end_real_app.probe.mjs` (silence dès la trame demandée, mi-relâchement à l'échantillon), `molecule_cell_player.probe.mjs`.
   - **[x] Lasso** (lasso canonique `createBevyPanelLasso`, depuis le vide de la vue Cellules, Maj/Cmd ajoute) et **projection « Scènes »** (`view.cells_projection` tracks | scenes, palette « Projection » du rail). App réelle `timeline_cells_real_app.probe.mjs` 22/22.
   - Vidéo des cellules : même règle que la lecture linéaire dans la vue Timeline — une vue structurée possède l'affichage (`recordsForProjectPresentation`), l'audio des clips vidéo est joué ; l'image relève de la vérification §6.2.8.
   - Projection « Échantillons » : reportée par l'utilisateur (§3.7).
   - Constat initial : Timeline à gauche, cellules carrées à droite (inversé pour les gauchers). Une colonne par région, la cellule du bas joue toute la région, une cellule par piste au-dessus. Colonnes réordonnables ; cellules copiables, collables et déplaçables, ce qui réorganise la timeline. Lancement par tap ou par MIDI. *Comment* : vue en arbre BevyUI sur le modèle de `project_view_timeline_tree.js`. Les cellules sont des références dynamiques au modèle canonique (§1 bis) : aucune copie de média.
2. **[x] FAIT — Scènes** — bande des Scènes (15 oct.) : maintien + glisser = dessiner (quantisé), glisser rapide = défiler, région déplacée / étirée par ses bords, arrêtée par sa voisine, outil « Supprimer la Scène » ; owner `project_view_timeline_scenes.js` ; preuve app réelle `temp/timeline/timeline_scenes_real_app.probe.mjs` 14/14. Enchaînement par défaut (Scène suivante puis arrêt) joué par le transport des cellules. Modèle (14 oct., nuit) : `timeline.scenes` (régions de la bande, sans chevauchement) et `timeline.cells` (réglages creux), noyau `kernel/scene_schema.js`, `kernel/scenes.js`, `kernel/cell_content.js` ; ops durables `molecule.scene.add/update/remove/move`, `molecule.cell.set/clear/place` (verbes `scene.*`, `cell.*`) ; sonde `tests/probes/molecule_scenes_cells.probe.mjs` 6/6. Constat initial : la bande est réservée et vide. Créer les régions Scènes, avec leur enchaînement par défaut (§1 bis).
3. **[x] FAIT (modèle)** — `follow_action {type: next|previous|stop|repeat|target|random, after_passes, target_scene_id}` dans les réglages de toute cellule, validé ; une Scène ciblée ne peut pas être supprimée. **Follow Actions assignables à toute cellule** : catalogue encore ouvert (§8). Les prévoir dans le modèle de cellule.
4. **[x] FAIT (modèle + capture + choix) — Comping** (15 oct.) : `record_region.takes` (1..16, double-clic sur la région → saisie canonique `openSliderValueEntry`, ou curseur « Prises » du rail) ; une région à plusieurs prises est bouclée pendant qu'elle enregistre (`resolveRecordLoop`), la capture couvre les N passes et `splitIntoTakes` (`kernel/takes.js`) en fait un clip `takes {count, length_frames, active}` (la dernière joue) ; op `molecule.clip.take` (verbe `clip.take`, palette « Prise » du rail) glisse la fenêtre source de passes entières → comping = couper le bloc + choisir une prise par morceau ; TL-62 : les régions suivantes d'une même piste rejouent la première prise (`replayTake` du planificateur). Preuves : `tests/probes/molecule_takes.probe.mjs` 4/4 ; app réelle `take8_looped_region_records_three_exact_takes` (3 prises, impulsions à ±1 échantillon, choix de prise exact). **Décision ouverte (Q10 du cahier)** : interface de comping au-delà de « couper + choisir la prise » (couloirs de prises visibles, balayage). Constat initial : double-clic dans une zone vide pour fixer le nombre de prises ; une boucle sur une zone donne un comping automatique ; les zones suivantes de la même piste rejouent la première prise.
5. **[x] FAIT — Punch in / out** (15 oct.) : une région Record posée sur une piste qui a déjà du contenu, enregistrée depuis le pré-roll, ne remplace que sa plage, à la trame (`placeExactTake` + `molecule.clip.record_replace`) ; la matière de part et d'autre est coupée sans perte (fenêtres source intactes, récupérables par les bords). Preuve app réelle : `take7_punch_in_out_replaces_only_the_region` dans `temp/timeline/timeline_sync_real_app.probe.mjs` (11/11, impulsions à ±1 échantillon).
6. **[~] Outils sur les blocs** — livré le 15 oct. : rail du bloc sélectionné (`project_view_timeline_clip_rail.js`) : Couper et Rogner début/fin à la tête de lecture, Bloc en boucle, Étirer (plus long / plus court / original) = outils `ui.audio.*` existants ; Joindre = nouvelle op `molecule.clip.join` (`kernel/clip_join.js`, inverse exact du split, refus sinon ; verbe `clip.join`) ; fondus d'entrée/sortie (`clip.fades`) ; Supprimer. Preuves : `tests/probes/molecule_clip_join.probe.mjs` 3/3, app réelle `temp/timeline/timeline_block_tools_real_app.probe.mjs` 11/11. **Reste** : enregistrement MIDI sur bloc. Constat initial — **Outils sur les blocs** : split (aujourd'hui Alt + double-clic seulement), join, stretch, enregistrement MIDI sur bloc, et tous les outils audio et vidéo dans le rail de la Timeline.
   - *Comment* : définitions du rail de `project_view_timeline_rail.js`, qui délèguent aux outils `audio_edit` existants. Ils trouvent déjà le bloc sélectionné via `readActiveMoleculeTarget().clip_id`.
7. **Échantillons (slices)** : reportés par l'utilisateur.
8. **[décision à valider] Ordre de la Liste** : réordonner la Liste ne déplace pas une timeline déjà amorcée. Règle actuelle (codée dans `project_view_timeline_owner.js`) : à la première ouverture, la lecture de la Liste amorce la timeline ; ensuite la timeline est l'arrangement canonique. **Proposition** : garder cette règle (un réordonnancement de Liste ne réécrit jamais un arrangement fait à la main) et offrir une action explicite « Réaligner la timeline sur la Liste » (ré-amorçage, une entrée d'historique, annulable). Non appliqué sans validation : cela réécrirait des arrangements existants. Constat initial : réordonner la Liste ne déplace pas une timeline déjà amorcée. Définir la règle, puis l'appliquer.

## 4. Prévu, non réalisé

- **Plugins** (§11.13) : point d'insertion par piste dans la chaîne Kira, latence déclarée et compensée par le même mécanisme de placement que la latence d'entrée, réglages persistés dans le modèle de la piste. Aucun format n'est choisi.

## 5. Clôture

**[x] FAIT (15 oct.)** — `maps/` (CODEMAP, ARCHITECTURE_MAP, API_MAP, DESIGN_MAP), `FRAMEWORK_STATE.md` (entrée « Audio to finalize »), `todo/timeline/suivi_premiere_ebauche_2026-10-14.md`, `todo/mixer/mixer_plan.md`, `mixer_recette.md`, `known-bug-solutions` (4 fiches). Aucun commit ni push.

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

**[~] Avancement (14 oct., nuit)** :
- [x] 1. Moteur extrait en crate partagé `atome/engines/audio-engine` (Tauri le réexporte ; `commands.rs` = surface unique, `dispatch` par nom). Lié à la bibliothèque statique iOS (`platforms/ios/bevy-renderer`, C ABI `atome_ios_audio_command`). Compile pour `aarch64-apple-ios` et `-sim`. Tests : 24/24 sur le vrai CoreAudio + `tests/host_pulled.rs`.
- [x] 2. Backend iOS = le même `scheduled_backend` (cpal/CoreAudio) ; sortie mise au repos après 5 s sans voix (`output_idle.rs`, énergie iOS), réveillée par une voix ou une lecture d'horloge.
- [x] 3. Pont Swift : lecture, programmation, horloge, mixage, calibration et enregistrement passent par le moteur (`AppNativeKiraEngine.swift`, `Common/NativeKiraEngine.swift`) ; Swift garde la session audio, les chemins du bac à sable, les crêtes et le mot d'éveil. Lecteur `AVAudioEngine` supprimé. Preuve simulateur (vraie WebView) : voix programmée sur sa trame exacte, crête de tranche 0,25 (sinus 0,5 × Volume −6 dB), horloge à 48 000 trames/s, enregistrement Rust avec `capture_clock`.
- [~] 4. AUv3 : mode « sortie tirée par l'hôte » (`host_output.rs`, FIFO vidée par le bloc de rendu, sans verrou ni allocation) prouvé en test ; extension branchée (`audio_init` → `atome_ios_audio_host_start`, commandes → `NativeKiraEngine`, `AUv3KiraEngine.swift` mixe dans le bloc de rendu). **À vérifier** dans un vrai hôte AUv3 sur appareil.
- [x] 5. `ios_native_kira` et `ios_auv3_native` dans `GRAPH_RUNTIMES` ; `mixStripVoiceLevel`, la branche `graph: false` du transport et leur test supprimés.
- [~] 6. Entrées live iOS : le moteur ouvre l'entrée cpal ; Swift tient la session capture tant que le programme a une entrée live. **À vérifier** sur appareil (le simulateur ne liste aucune entrée).
- [ ] 7. Preuves de bout en bout sur iPhone (`mix_graph_real_app`, `timeline_sync`) : le simulateur n'a pas de WebGPU (pas d'interface), ligne #36 de la recette à repasser sur appareil.

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
   - **[x] CORRIGÉ** — config d'entrée demandée à la fréquence de sortie, sinon rééchantillonnage linéaire temps réel (`mix-graph/src/resample.rs`) ; ouverture/fermeture et nom inconnu testés sur le vrai CoreAudio. Reste : niveau dans `audio_mix_levels` dans l'app Tauri lancée. Constat initial : si la fréquence d'échantillonnage de l'entrée diffère de celle de la sortie, il n'y a pas de rééchantillonnage, donc dérive de hauteur. Demander la config d'entrée à la fréquence de sortie, ou rééchantillonner dans `LiveInput`.
3. **Interface multicanal physique** (#21) : router une tranche vers « Sortie 3-4 ».
   - Natif : canaux 3-4 réellement alimentés, FIFO auxiliaires en phase avec la principale.
   - Web : `destination.maxChannelCount > 2`, mode `discrete`.
4. **Port MIDI physique** (#29) : un clip `.mid` joué vers un vrai port.
   - **[x] Non reproduit le 14 oct. (soir)** : sur serveur isolé, un `.mid` importé porte `media_url: /api/uploads/…` et `prepareMidiPlayback` charge ses événements (`temp/audio_finalize/midi_import_url.probe.mjs`). Constat initial : un `.mid` importé sur le Web gardait `media_url: null`, donc `prepareMidiPlayback` donnait 404.
   - **[x] FAIT — Horodatage** : `at_ms` absolu (`performance.now()` de départ du plan, calé sur `started_at_ms`), envoi 40 ms en avance vers les ports Web MIDI, note-off d'arrêt horodatés après les note-on en file. Reste : essai sur un vrai port.
   - Constat initial : `sendMidiBytes` reçoit un `at_ms` relatif, interprété comme horodatage absolu par Web MIDI. Il faut un horodatage `performance.now()` absolu calé sur `started_at_ms` de l'horloge de rendu.
5. **[x] FAIT (15 oct.) — Gestes tactiles** en émulation tactile Chromium (événements tactiles CDP) : `temp/mixer/mixer_touch_real_app.probe.mjs` 9/9 — double-tap dans la colonne vide (ajout), appui long + déplacement (réordonner, supprimer à droite), glisser de bande dans un groupe, lasso au doigt, swipe. **Défaut trouvé et corrigé** : aucun glisser ne faisait défiler les tranches (ni doigt ni souris, seulement la molette) — la bande possède son glisser (appui long) et le fond son lasso. Option canonique `long_press.quickTravelScrolls` du runtime pointeur (`bevy_ui_pointer_runtime.js`) : un trajet rapide avant l'appui long va à la zone de défilement ; posée sur la bande des tranches. Sonde souris 18/18 inchangée. Constat initial — **Gestes tactiles** (#33) : swipe, appui long + déplacement, suppression, double-tap pour ajouter, lasso, glisser de bande, sur iPhone/iPad ou en émulation tactile Playwright (`hasTouch`).
6. **[x] FAIT (15 oct.) — Main gauche** : un groupe ouvert se déplie à gauche de son maître (`layoutMixRow({ handedness })`), chevron à gauche de la bande et rattaché au maître (plus au premier élément), palettes en miroir de la main droite (vers la droite de leur ancre, retournées quand la place manque). Preuve app réelle `temp/mixer/mixer_left_hand_real_app.probe.mjs` 6/6 ; sonde droitier 18/18 inchangée. **Décision à valider** : l'ordre des tranches reste celui des pistes (non inversé en gaucher), l'ancien mixeur l'inversait. Constat initial — **Main gauche** (#34) : chevron de groupe ouvert vers la gauche et palettes du bon côté. Décider si l'ordre des tranches s'inverse en gaucher ; l'ancien mixeur l'inversait.
7. **[x] FAIT (15 oct.) — Synchro A/V perçue** : seuil proposé **EBU R37** (son au plus 40 ms en avance, 60 ms en retard sur l'image) — **à valider**. Mesure app réelle `temp/mixer/av_sync_real_app.probe.mjs` (prise caméra simulée image + son, transport projet ; chaque image présentée par `requestVideoFrameCallback` contre l'instant entendu à son `expectedDisplayTime`) : **avant** image en avance de 176 ms en moyenne (pire 190 ms) — la vidéo suivait la position rendue sans la latence de sortie et n'était recalée qu'au-delà de 0,25 s ; **après** moyenne +3 à +9 ms, pire 34–38 ms, dans le seuil. Correctifs : la tête donnée à l'image = position entendue − latence de sortie (`outputLatencySeconds()` de l'exécuteur audio, transport projet) ; l'image suit l'horloge du son (`bevy_video_clock_follow.js` : recalage au-delà de 120 ms, sinon débit poussé de ±8 % au plus, avance d'une image d'affichage) ; `bevy_video_decode_source_runtime.js` 502 → 490 lignes. Constat initial — **Synchro A/V perçue** (#32) : définir un seuil (cahier §10) et mesurer image contre son. La voie vidéo est une projection de rendu sans latence propre ; la latence de sortie audio n'est pas encore compensée côté image.
8. **[x] Pixels de la voie vidéo** (#28, 15 oct.) — vrais pixels GPU, `temp/mixer/video_lane_pixels_real_app.probe.mjs` (prise caméra simulée en mode Naturel, voie vidéo de la timeline projet) : opacité 20 % estompe l'image, sortie « Aucune » la masque, retour à l'identique → **OK**. **Filtres couleur corrigés** : les échantillons `texture_external` ne sont pas bornés (conversion YUV→RGB du navigateur hors gamut, mesuré (−0,96 ; 0,37 ; −1,09) pour un pixel affiché (0,83,0)) ; `apply_color_filters` borne désormais l'échantillon à [0,1] avant les filtres (`atome/renderers/bevy-core/assets/shaders/video_external.wgsl`), WASM Bevy reconstruit. Preuve (`PROBE_ISOLATED=1 HEADLESS=0`, puis `FILTER_SWEEP=1`) : sur (0,87,0), niveaux de gris 1 → (62,62,62), sépia 1 → (67,60,46), saturation 0 → (62,62,62), niveaux de gris 0,5 → (31,75,31), luminosité 0,5 → (0,43,0), contraste 0,5 → (64,107,64), inversion → (255,168,255) — tous à ±1 des niveaux CSS attendus ; le contrôle `grayscale_filter_removes_the_colour` vérifie aussi le niveau de gris (= luminance de la base, (4,100,0) → (72,72,72)). Captures `page.screenshot` : 17–96 ms ; le dépassement de 30 s observé ailleurs vient d'une fenêtre Chromium privée d'images (rAF ≈ 1/s, fil principal libre, *long animation frames* de ~1 s sans script) sous forte charge machine, pas de la sonde.
9. **[x] FAIT — Gestes réels non couverts par la sonde UI** (ajoutés à `temp/mixer/mixer_ui_real_app.probe.mjs`, 19/19 PASS à la souris réelle) : réordonnancement et suppression à la souris réelle (#10, #11), double-clic dans le vide (#8), glisser de bande (#27), choix d'une clé de sidechain dans l'UI (#22). Les ajouter à `temp/mixer/mixer_ui_real_app.probe.mjs`.

### 6.3 Corrections et compléments fonctionnels

1. **[x] FAIT — MIDI dans la lecture de liste** (chaque Molécule au décalage de sa place dans la liste ; arrêt de la liste = arrêt des voies MIDI) (séquence de Molécules, `toggleSequence`) : les clips MIDI n'y sont pas joués.
   - *Comment* : appeler `runtime_midi.start` par Molécule avec son décalage `start_seconds`.
2. **[x] FAIT — MIDI au déplacement de la tête** (seek/scrub en lecture relancent la voie à la nouvelle position) (`seek` / `scrub` pendant la lecture) : la lecture MIDI n'est pas relancée à la nouvelle position. Faire `midi.stop` puis `start` depuis la position.
3. **[x] FAIT — Délai à temps modulable** : `mix-graph/src/delay.rs` remplace le délai Kira (tampon de 4 s, tête de lecture qui glisse vers le nouveau temps, écho en vol conservé, écho exact à la trame) ; `requires_rebuild` ne reconstruit plus que pour un autre effet. Tests `delay::tests` (2). Constat initial : changer le temps reconstruisait l'effet (`effects.rs#requires_rebuild`), ce qui perd l'écho en cours. Acceptable, mais à documenter, ou à remplacer par un délai interne à temps modulable.
4. **[x] FAIT — Fader : double-clic pour saisir une valeur** (`openFaderValueEntry` dans `bevy_panel_fader.js`, gestes du fader extraits dans `molecule_mix_fader_actions.js` ; preuve réelle `fader_double_click_types_the_value`). Constat initial :, comme tous les tool-sliders (`openSliderValueEntry`). Le fader canonique `bevy_panel_fader.js` ne l'a pas encore.
5. **Vumètres dans la tranche** : les niveaux existent (`readGroupTimelineMixLevels`), sans affichage, parce que les maquettes n'en montrent pas. Demander à l'utilisateur s'il en veut ; ne pas les ajouter d'office.
6. **[x] FAIT — Mute / Solo** : seul le graphe les applique sur les moteurs à graphe (le transport ne saute plus les pistes) ; le solo s'applique aussi aux voies MIDI. Constat initial : ils restent sur l'en-tête de piste de la Timeline (le mixeur n'en affiche pas, conformément au cahier).
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

1. **[x] VERTE (15 oct., 20/20)** — `HEADLESS=0 node temp/audio_finalize/run_acceptance_isolated.mjs`. Les échecs restants venaient de deux sources. D'une part, des **bugs de l'app**, corrigés et décrits dans `known-bug-solutions/` : ruban réduit à l'Atome après une connexion ; import Web sans effet au premier passage et sons importés sans durée ; Lecture/Stop/rail d'une Molécule en Naturel ; rail redessiné à chaque tick du transport (85 → 1 rendu en 3 s) ; Inclure qui enveloppait la Molécule cible ; `px` absent lors du glisser en Matrice ; calibration à forte latence ; rognage traité comme une boucle ; activité de Molécule qui affichait le projet. D'autre part, des **sondes restées sur l'UI d'avant le 9 oct.** : import par Mystic → Média ; choix unique Inclure ; la Liste n'a plus de Retour (`leaveLevel`) et son ordre suit le sens d'accordéon ; rail défilant ; deux propriétaires de lecture pour une Molécule (transport de la vue projet, ou transport natif depuis le canevas) ; débit vidéo à 1 ± 8 % (suivi d'horloge) ; `waitForStableScene` hors calques BevyUI. Intermittent vu une fois sur quatre : avant le premier `applyDepth`, z canonique 6 contre z projeté 1 (diagnostic désormais complet dans le message d'échec). **Question produit ouverte** : la Liste n'offre plus de Retour pour sortir d'un niveau entré par double-clic (la Matrice en a un). Historique — **[x] Relancée (15 oct.)** sur une instance Fastify isolée à SMS simulé : `HEADLESS=0 node temp/audio_finalize/run_acceptance_isolated.mjs` (la sonde pointe l'app sur ce serveur seul — `server_config.json` + `__SQUIRREL_FORCE_FASTIFY__` — attend son adoption et réessaie `startPhoneLogin` tant que le socket s'ouvre). Défauts de la sonde corrigés : `memberEntryIndex` hors de portée depuis l'extraction de la section Liste ; palette « Activité » devenue « Vue ». Résultat : setup OK, 9 contrôles OK, 10 en échec, **tous des écarts de la sonde avec l'UI actuelle, hors audio** : les vues Timeline/Mixage montrent la timeline du projet (racine) alors que la fixture pose ses clips dans une Molécule enfant (`timeline_clip_not_actionable`, `molecule_mix_audio_strip_missing`) ; ordre du ruban sans « home » ; icônes des modes de vue (`visible_true` attendu `tool/hamburger/grid`) ; actions Supprimer/Info du rail de Molécule ; erreur CORS de la sonde du backend local :3000 hors port 3001. Prochaine action (hors tâche audio) : mettre la fixture à niveau (naviguer dans la Molécule ou poser la fixture sur la timeline projet) et l'ordre du ruban. Constat précédent — **[~] Setup réparé, exécution bloquée par l'environnement** — `molecule_eve_ui_acceptance_probe.mjs` : connexion par `startPhoneLogin` → paiement simulé → `completePhoneLogin` (lien du mock SMS), premier lancement complété, option `PROBE_PROFILE_DIR` (profil déjà connecté), attente du Dashboard. Sur le 3001 actuel : pas de mock SMS (lien jamais reçu) et le profil de sonde n'ouvre plus d'espace de travail (aucun WebSocket ouvert, même profil vierge). Prochaine action : relancer avec un serveur `SQUIRREL_AUTH_SMS_MOCK=1`. Constat initial : `tests/probes/molecule_ui_timeline_acceptance.mjs` (section Mixage réécrite pour le nouveau mixeur) n'a pas pu tourner : `npm run test:molecule:ui` échoue au setup, `api.auth.requestPhoneVerification is not a function`.
   - Réparer le setup de `molecule_eve_ui_acceptance_probe.mjs` sur le nouveau flux d'authentification (`startPhoneLogin` / `completePhoneLogin`, voir `temp/templates_interactivity/support.mjs`), puis le relancer.
2. **[x] FAIT** — Garde-fous en échec, hors mixeur, à traiter dans la même tâche finale :
   - `check:no-fallbacks` et `check:molecule-guardrails` : le mot « fallback » dans `eVe/intuition/tools/molecule/recording/exact_placement.js` (tâche Timeline) ;
   - `check:map-paths` : chemins périmés dans `maps/CODEMAP.md` (`scripts/bundle-porcupine.js`, `tests/eve/wake_porcupine.test.mjs`, `eVe/intuition/tools/molecule/render/timeline_scene.js`).
3. **[x] FAIT (15 oct.)** — l'ancre était bien conservée ; seule la constante 726 (800 − 74) datait d'avant l'écart d'ancrage des panneaux (`dockGapPx`, voulu : un panneau s'arrête un peu au-dessus de la barre) → attente dérivée du jeton, 21/21. Constat initial — Tests vitest préexistants en échec, sans lien avec le mixeur : `tests/eve/panel_nested_scroll.test.mjs` (4 tests) échoue aussi avec le `bevy_ui_scroll_runtime.js` de HEAD. Le défilement horizontal ajouté pour le mixeur n'y change rien.
4. **[x] Contrôlé (15 oct.)** — fichiers touchés tous ≤ 500 lignes : `backend.kira.js` 544 → 471 (chemins locaux AUv3 et marqueurs de clip extraits dans `kira_backend_support.js`), `audio-wasm/src/lib.rs` 464, `molecule_mix_interactions.js` 277 ; `audio-engine/src/playback.rs` 689 (préexistant, non agrandi par cette tâche) ; `squirrel_audio_wasm.js` est généré. Constat initial — Taille de fichiers :
   - `molecule_mix_interactions.js` fait 309 lignes (zone transitoire) : scinder si on y ajoute du comportement ;
   - `playback.rs` (743 lignes) et `audio-wasm/src/lib.rs` (560) étaient déjà au-dessus de 500 : ne pas les faire grossir, réduire si on les retouche.
5. Après toute modification de `atome/engines/mix-graph` ou de `audio-wasm` : `cargo test` dans le crate, `./platforms/web/audio-wasm/build.sh`, puis purge du service worker dans les sondes.

### 6.6 Sondes de non-régression du mixeur (à relancer après chaque fusion)

**Repassage après la recette Molécule (15 oct. soir, `PROBE_ISOLATED=1`)** : Cellules 22/22, outils de blocs, Record, multipiste 6/6, vue, Scènes, rognage, synchro, UI mixeur 19/19 (×3), tactile, gaucher 6/6 (×3), graphe, A/V EBU R37 : tout vert. Deux corrections dans les sondes. (1) Les sondes ne purgent plus le service worker sur une origine isolée (`purgeOfflineApp`) : la purge pendant la première installation laissait un worker actif à cache vide, d'où des imports paresseux en `ERR_FAILED` et le faux échec r27. (2) `clickRail` des Cellules attend la case. Sous forte charge (Tauri d'une autre session, charge 8 à 30), on voit des aléas temps réel : prise courte de −0,44 s, A/V −54 ms, capture d'écran sans image pendant 30 s. `screenshotOrStack` imprime désormais la pile du thread principal quand cela se produit. Passage précédent — **Dernier passage complet (15 oct., `PROBE_ISOLATED=1`)** : synchro 13/13 (le décalage de la 1re prise de la sonde varie parfois — artefact du bouclage, la calibration et les prises suivantes restent à ±1 échantillon), multipiste 6/6, Record 8/8, vue 6/6, Scènes 14/14, Cellules 22/22, outils de blocs 11/11, graphe du mixeur 9/9, UI mixeur 18/18, tactile 9/9, gaucher 6/6, A/V EBU R37, pixels vidéo (sauf filtres à luminance), fin de voix tardive 2/2 ; seule « erreur » = la console CORS de la sonde du backend local :3000 sur un port isolé. Node : 140/146 sondes Molécule — les 6 en échec échouent à l'identique sur HEAD propre (Liste/niveau d'expertise, cycle d'import Node, sonde WebGPU visant une ancienne URL :3000). Rust : mix-graph 32/32, audio-engine 24/24 ; Tauri `cargo check` OK. Garde-fous `check:m0` verts, chemins des cartes 0/0.


- `node --test tests/probes/molecule_mix_{model,engine,view,midi}.probe.mjs` : 7, 4, 4 et 3 tests.
- `cd atome/engines/mix-graph && cargo test` : 14.
- `cd platforms/desktop-tauri && cargo test --lib audio_engine` : 24.
- `PROBE_PROFILE_DIR=temp/assistant_debug/chromium_profile node temp/mixer/mix_graph_real_app.probe.mjs` : 10.
- `HEADLESS=0 PROBE_PROFILE_DIR=temp/assistant_debug/chromium_profile node temp/mixer/mixer_ui_real_app.probe.mjs` : 13.
- `HEADLESS=0 … node temp/timeline/timeline_sync_real_app.probe.mjs` : 6 sur 6, au sample près à travers les tranches.

### 6.7 Clôture du mixeur

**[x] FAIT (15 oct.)** — voir §5.

- Mettre à jour `todo/mixer/mixer_recette.md` (statuts), `todo/mixer/mixer_plan.md` (journal), `maps/` (CODEMAP, ARCHITECTURE_MAP, API_MAP, DESIGN_MAP, déjà à jour au 14 oct.) et `eVe/documentations/FRAMEWORK_STATE.md` (entrée « Modular mixer »).
- Pas de commit ni de push sans demande explicite.
