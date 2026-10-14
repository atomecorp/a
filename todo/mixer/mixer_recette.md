# Table de mixage — recette (14/10/2026)

Cahier : [mixer.md](mixer.md). Journal : [mixer_plan.md](mixer_plan.md).

## Environnements

- **Web.** Chromium Playwright (profil persistant `temp/assistant_debug/chromium_profile`), serveur Fastify 3001, Kira WASM reconstruit le 14/10 à 18:27, fenêtré (`HEADLESS=0`) pour les captures.
- **Natif.** `cargo test` (crate `atome/engines/mix-graph`), `cargo test --lib audio_engine` de `platforms/desktop-tauri` sur le vrai périphérique audio du Mac, Node 25 pour les sondes noyau et vue.
- **Non disponibles.** Interface audio multicanal physique ; appareil iOS physique ; exécution de l'app Tauri.

## Preuves (commandes)

| Réf. | Commande | Résultat |
|---|---|---|
| P1 | `node --test tests/probes/molecule_mix_model.probe.mjs` | 7/7 |
| P2 | `cd atome/engines/mix-graph && cargo test` | 14/14 |
| P3 | `node --test tests/probes/molecule_mix_engine.probe.mjs` | 4/4 |
| P4 | `node --test tests/probes/molecule_mix_view.probe.mjs` | 4/4 |
| P5 | `node --test tests/probes/molecule_mix_midi.probe.mjs` | 3/3 |
| P6 | `PROBE_PROFILE_DIR=temp/assistant_debug/chromium_profile node temp/mixer/mix_graph_real_app.probe.mjs` | 10/10 |
| P7 | `HEADLESS=0 PROBE_PROFILE_DIR=… node temp/mixer/mixer_ui_real_app.probe.mjs` (captures `temp/mixer/ui/`) | 13/13 |
| P8 | `HEADLESS=0 … node temp/timeline/timeline_sync_real_app.probe.mjs` | 6/6, au sample près |
| P9 | `cd platforms/desktop-tauri && cargo test --lib audio_engine` | 24/24 |
| P10 | sondes existantes `molecule_v2_structure`, `molecule_snapshot_invariants`, `molecule_ui_mcp_parity`, `molecule_session_history`, `molecule_transport_runtime` | toutes vertes |

## Matrice

| # | Exigence (cahier) | Scénario | Attendu | Observé | Env. | Statut | Preuve |
|---|---|---|---|---|---|---|---|
| 1 | Volume positionnable, chemin réel | Volume avant/après FX et Envoi | niveau appliqué à son rang | −6 dB ⇒ 0,5 ; ordre respecté | natif + Web | PASS | P2, P6 |
| 2 | V4 envoi pré-effet | Envoi avant Volume −∞ | le bus reçoit le signal non atténué | bus 0,5, tranche 0 | Web réel | PASS | P2, P6 |
| 3 | V1 OUT coupé, envois actifs | OUT off + envoi | sortie principale muette, bus alimenté | entendu 0,25 = bus | Web réel | PASS | P2, P6 |
| 4 | « Aucune sortie » | destination nulle | rien sur la sortie principale, envois conservés | idem | Node + natif | PASS | P1, P2 |
| 5 | Mono, Pan | L=1,R=0 → mono ; pan droite | (0,5 ; 0,5) ; gauche coupée | idem | natif | PASS | P2 |
| 6 | Bus vers bus, boucles refusées | bus1→bus2→main ; a→b→a | somme correcte ; refus | idem (noyau + moteur) | Node + natif | PASS | P1, P2 |
| 7 | Ajout par « + » | + → Réverb | module ajouté, zone élargie, fader disparu | idem | Web réel | PASS | P4, P7 |
| 8 | Ajout par double-clic dans le vide | double-clic dans la colonne | palette d'ajout au rang visé | palette ouverte, index calculé | Node | PASS | P4 (intention), réel NON TESTÉ |
| 9 | Sélection et paramètres natifs à droite | tap VOL / Réverb | fader / paramètres Kira réels | idem, contour continu | Web réel | PASS | P7 (captures 01, 03) |
| 10 | Réordonnancement | appui maintenu + glissement vertical | module déplacé, paramètres conservés | `mix.module.move` | Node | PASS | P4 ; geste réel souris NON TESTÉ |
| 11 | Suppression | appui maintenu + glissement vers la droite hors tranche, relâchement dans la zone | supprimé ; ailleurs = annulé | idem | Node | PASS | P4 |
| 12 | Bypass | swipe gauche / droite | désactivé visible / réactivé | idem | Node | PASS | P4 |
| 13 | Queue d'effet | bypass d'une réverb, puis second swipe | queue → arrêt réel ; coupure immédiate | états 1→2 ; coupe = silence | natif + Web réel | PASS | P2, P6 |
| 14 | Clic sur module désactivé | tap sur module bypassé | ouvre ses réglages, ne coupe pas la queue | sélection seule | Node | PASS | P4 |
| 15 | IN : entrées réellement disponibles | tap IN | piste + entrées du système | liste des entrées réelles (Web : `enumerateDevices`) | Web réel | PASS | P6 (`devices_listed`) |
| 16 | Entrée live | tranche IN = micro | signal dans la tranche | niveau 1 (faux micro) | Web réel | PASS | P6 ; natif : `live_input.rs` compilé, NON TESTÉ en exécution |
| 17 | OUT / base : destinations réelles | tap sur la base | Aucune, Main Out, bus, Nouveau bus, tranches, paires | idem | Web réel | PASS | P7 (capture 06) |
| 18 | Valeurs par défaut | nouvelle tranche | audio Main Out, vidéo Écran principal, MIDI aucune | idem | Node | PASS | P1, P5 |
| 19 | Nouveau bus depuis le routage | base → Nouveau bus | piste groupe créée, routée, IN = nom du bus | idem | Node | PASS | P4 |
| 20 | Envoi unique, niveau indépendant | + Envoi → cible | palette de cibles ouverte d'office, niveau propre | idem | Node + Web | PASS | P4, P6 |
| 21 | Multi-out (paires matérielles) | tranche → paire 3-4 | signal sur la paire | moteur : paire 2 reçoit, principale muette | natif | PASS (moteur) | P2 ; carte physique NON TESTÉ |
| 22 | Sidechain | compresseur clé = autre tranche | ducking | pad < 0,05 avec clé forte | natif | PASS | P2 ; geste UI de choix de clé NON TESTÉ en réel |
| 23 | Groupe vidéo+son natif | piste vidéo avec son | groupe fermé, chevron haut ; ouvert à droite | idem | Web réel | PASS | P7 (captures 01, 05) |
| 24 | Vidéo muette | `has_audio:false` | pas de voie audio | idem | Node | PASS | P1 |
| 25 | Grouper (lasso + rail) | lasso sur les tranches → « Grouper » | groupe créé, maître violet, membres colorés | idem | Web réel | PASS | P7 (captures 07, 08) |
| 26 | Tout dégrouper | lasso sur un groupe → rail | groupe dissous, lanes détachées | idem | Node | PASS | P4 |
| 27 | Glisser-déposer par la base | appui long base → dans/hors d'un groupe | rejoint / quitte | idem | Node | PASS | P4 ; geste réel NON TESTÉ |
| 28 | Voie vidéo (opacité, filtres, sortie) | opacité 0,5 + couleur ; sortie nulle | rendu multiplié / masqué | projection vérifiée | Node | PASS | P3 ; pixels réels NON TESTÉ (clip sans média) |
| 29 | Voie MIDI | clip `.mid` → ports sortie + envoi | événements de la fenêtre sur chaque port | idem ; piste muette silencieuse | Node | PASS | P5 ; port MIDI physique NON TESTÉ |
| 30 | Latence / synchro | impulsion via envoi+bus ; boucle lecture/prise | 0 trame ajoutée ; ±1 sample | trame 37→37 ; prises au sample | natif + Web réel | PASS | P2, P8 |
| 31 | Compensation des routes parallèles | latences 64/0 | retard 64 sur la route rapide | idem (algorithme) | natif | PASS | P2 ; aucun effet actuel n'a de latence |
| 32 | Synchro A/V perçue | caméra/écran vs son | à mesurer | — | — | NON TESTÉ | seuil à définir (cahier §10) |
| 33 | Gestes tactiles | doigt réel | mêmes résultats qu'à la souris | — | — | NON TESTÉ | souris uniquement en réel |
| 34 | Main gauche | latéralité gauche | chevron ouvert vers la gauche | chevron miroir codé | — | NON TESTÉ en réel | — |
| 35 | Régression Tauri (exécution app) | app Tauri | mixeur et lecture | — | — | NON TESTÉ | `cargo check` + 24 tests natifs |
| 36 | iOS / AUv3 | moteur Swift AVAudioEngine | — | pas de graphe : la voix porte Volume×Pan de la tranche ; effets, envois, bus, live non rendus | — | LIMITATION | `mixGraphSupported` |
| 37 | Console | parcours réels | 0 erreur | 0 | Web réel | PASS | P6, P7 |
| 38 | Sonde d'acceptation Molécule (dépôt) | `npm run test:molecule:ui` | — | échec au setup : `api.auth.requestPhoneVerification is not a function` (auth changée, hors mixeur) | Web | NON TESTÉ | `temp/probe_reports/molecule_eve_ui_acceptance/default/report.json` |

## Anomalies et limites restantes

- **iOS / AUv3 (#36).** Le moteur natif iOS est en Swift (AVAudioEngine) et n'héberge pas `atome-mix-graph`. Prochaine action minimale : faire jouer le transport iOS par le moteur Kira Rust, ou lier le crate au moteur iOS.
- **Groupes imbriqués et routage à l'extraction.** Le cahier les laisse « à préciser ». Règle appliquée (D5) : un membre qui quitte un groupe-bus reprend la destination du maître.
- **Lecture de liste (séquence de Molécules).** Les clips MIDI n'y sont pas joués ; seule la lecture d'une Molécule les joue.
- **Fonction du fader vidéo (Q10).** C'est l'opacité (décision D4, réversible). Le flou n'est pas proposé : le rendu des médias ne l'applique pas.
- **Garde-fous du dépôt, en échec hors mixeur.** `check:no-fallbacks` et `check:molecule-guardrails` signalent `recording/exact_placement.js`. `check:map-paths` signale des chemins périmés de `CODEMAP.md` (Porcupine, `render/timeline_scene.js`). Les deux viennent d'autres travaux.
