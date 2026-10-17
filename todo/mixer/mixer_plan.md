# Table de mixage — journal d'exécution

Cahier des charges : [mixer.md](mixer.md). Plan approuvé le 14/10/2026 (décisions D1–D9 reprises ci-dessous). Matrice de recette : [mixer_recette.md](mixer_recette.md).

## Décisions d'implémentation (réversibles)

- **D1** Vérité canonique = `timeline.mix` du timeline Molécule, muté par `applyGroupTimelineOperation` (historique, undo, sync, MCP).
  - Le champ est **additif** dans le schéma v2 : il est optionnel, comme `automation`.
  - Raison : une quinzaine de lecteurs testent `schema_version === 2`.
- **D2** Les tranches sont dérivées des pistes, avec `strip_id = <track_id>:<lane>`.
  - Ne sont persistés que les réglages modifiés et les groupes explicites.
  - Le groupe vidéo+son est dérivé ; il est détaché via `mix.detached_strip_ids`.
- **D3** `track.gain`/`track.pan`/`track.output_group_track_id` migrent dans le mix au chargement (`normalizeTimelineMix`). Les lecteurs convergent vers le mix.
- **D4** Les modules sont `volume`, `pan`, `mono`, `fx` (effets Kira 0.12 réels), `send`, `opacity`, `video_fx`.
- **D5** Un groupe = `{group_id, master_strip_id, member_strip_ids}`.
  - Groupe audio créé par « Grouper » = bus de sous-mix.
  - Groupe vidéo+son = sans changement de routage.
  - L'état ouvert/fermé reste un état d'affichage, non persistant.
- **D6** La sélection par défaut est le premier module de niveau, sinon IN.
- **D7** Queue d'effet : arrêt réel quand RMS < −80 dBFS pendant 250 ms ; un second swipe arrête immédiatement.
- **D8** Suppression : appui maintenu + glissement horizontal vers une zone visible.
- **D9** Base de la tranche : un tap choisit la destination, un appui long déplace ou groupe.

## Avancement

| Lot | Contenu | Statut |
|---|---|---|
| 0 | Socle (cahier, journal, recette) | fait |
| 1 | Modèle canonique mix | fait — `kernel/mix_{modules,schema,routing,projection,structure}.js`, opérations `mix.*` (session, alias, outils UI/MCP typés), migration au chargement ; sonde `tests/probes/molecule_mix_model.probe.mjs` 7/7 |
| 2 | Crate `mix_graph` | fait — `atome/engines/mix-graph` (graphe, effets Kira hébergés, queue/bypass, sidechain, compensation, sorties aux) ; `cargo test` 12/12 |
| 3 | Intégration moteur | fait — natif (`audio_engine/mix.rs`, commandes `audio_mix_*`, 24/24 tests natifs), WASM reconstruit, `molecule_mix_engine.js` (compilateur + agrégation), voix routées par `stripId` ; sonde réelle Web `temp/mixer/mix_graph_real_app.probe.mjs` 8/8 |
| 4 | Entrées/sorties | fait — paires de canaux supplémentaires (CPAL `aux_outputs.rs`, Web destination multicanal), périphériques réels (`audio_mix_devices` / `mix_output_devices`), entrées live (natif `live_input.rs`, Web `molecule_mix_live_web.js` via le worklet d'enregistrement) |
| 5 | Briques UI partagées | fait — `bevy_panel_fader.js`, `bevy_panel_tile_gesture.js`, `bevy_panel_lasso.js` (registre), défilement horizontal tactile, icônes pan/mono/output, `mixer_skin.js`, chevron à orientation explicite |
| 6 | Vue mix | fait — `project_view_molecule_mix_content.js` + `molecule_mix_{catalog,layout,strip_tree,module_controls,pickers,interactions,groups}.js`, i18n `languages_mixer.js` ; sonde Node `tests/probes/molecule_mix_view.probe.mjs` 3/3, sonde réelle `temp/mixer/mixer_ui_real_app.probe.mjs` 11/11 (captures `temp/mixer/ui/`) |
| 7 | Groupes | fait — groupe vidéo natif, chevron, lasso + Grouper (réel), Tout dégrouper, glisser-déposer par la base (Node) |
| 8 | Voie vidéo | fait — `molecule_mix_video.js` (opacité, filtres couleur, sortie écran, chaînage), appliqué dans `recordsForProjectPresentation` ; flou retiré (non rendu) |
| 9 | Voie MIDI | fait — piste/clip `midi`, `runtime_midi.js` (fenêtre du clip, ports sortie + envois, calé sur l'horloge de rendu) |
| 10 | Latence / synchro A/V | fait pour le moteur (0 trame ajoutée, compensation, synchro au sample) ; A/V perçu NON TESTÉ |
| 11 | Recette et clôture | fait — `mixer_recette.md`, cartes, FRAMEWORK_STATE |

## Journal

- 14/10 — Baseline : `molecule_audio_mix_transport.probe.mjs` échoue déjà sur HEAD (`atomic cleanup must stop the already-started durable voice`) ; `molecule_list_projection.probe.mjs` échoue dans l'arbre de travail pour une cause d'enregistrement d'outil (`tool_handler_missing_v2` matrix_navigation) indépendante du mix (échec identique avec le modèle de liste d'origine).
- 14/10 — Lots 1–3 livrés (voir tableau). La mise en sourdine (mute/solo) reste appliquée par le transport (comportement existant) et est aussi transmise au graphe (`muted`).
- 14/10 — Baseline vitest : `tests/eve/panel_nested_scroll.test.mjs` échoue déjà (4 tests) avec le `bevy_ui_scroll_runtime.js` de HEAD ; le défilement horizontal ajouté n'y change rien.
- 14/10 — Les anciens tests source-string du mixeur (`molecule_mix_projection.probe.mjs`, `molecule_mix_bevy_kind_contract.test.mjs`) sont remplacés par `molecule_mix_view.probe.mjs` (contrat : tout nœud à gestionnaires est d'un type interactif).
- 14/10 — À mettre à jour à la recette : la section Mixage de `tests/probes/molecule_ui_timeline_acceptance.mjs` vise encore l'ancien mixeur (Mute, `molecule_mix_gain_*`).
- 14/10 — iOS : le moteur natif est Swift (AVAudioEngine), sans graphe ; `mixGraphSupported` limite le graphe à Tauri desktop et Web, la voix iOS porte le niveau statique de la tranche (pas de régression de volume/pan).
- 14/10 — `npm run test:molecule:ui` échoue au setup (auth `requestPhoneVerification` absente) : hors mixeur, non testé.

- 2026-10-15 — Finalisation (`todo/audio_to_finalize.md` §6) : iOS et AUv3 passent sur le moteur Kira natif partagé (`atome/engines/audio-engine`, graphe complet) ; délai à temps modulable (`mix-graph/src/delay.rs`) ; rééchantillonnage de l'entrée live ; double-clic sur le fader = saisie de valeur ; Mute/Solo uniquement dans le graphe ; MIDI en liste et au déplacement de la tête. Vérifications réelles : gestes tactiles 9/9 (défilement des tranches par glisser corrigé : `long_press.quickTravelScrolls`), main gauche 6/6 (groupe déplié vers la gauche), synchro A/V dans EBU R37 après correction (image +176 ms → +3–9 ms), pixels de la voie vidéo (opacité et sortie OK ; filtres à luminance défectueux dans le shader vidéo Bevy, tâche séparée). Décisions à valider : D1–D9 (§6.4 de la todo), seuil EBU R37, ordre des tranches en gaucher, vumètres, groupes imbriqués, groupe vidéo, transfert de pistes.
