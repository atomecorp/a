# Moteur audio universel — audit, plan, réalisation (16 nov. 2026)

Prompt : `~/Downloads/atome_eVe_evolution_moteur_audio_2026-11-16.md` (registre : R-191).
Dépôts lus : `atomecorp/a` `main` @ `ade6abf84` (15 nov. 2026, arbre de travail avec les éditions non
commitées de R-184 : effets pro) ; VIE / Opus : **copie locale** `~/Downloads/opus-universale` @ `026218a`
(3 nov. 2026) — le dépôt GitHub `triton-IT/opus-universale` répond 404 sans accès, la copie locale est la seule lue.

Réponses de l'utilisateur (16 nov., avant le code) :
- Multicanal : **tranches 1/2/4/8**, bus internes de cette largeur, routage canal par canal, conversions déclarées,
  effets stéréo par paires (mêmes réglages pour toutes les paires), projets actuels stéréo inchangés.
- Polyphonie : **les notes restent séparées dans le synthé** (chaîne de voix, R-186 Q1) ; somme à la sortie du synthé ;
  la console traite l'accord entier.
- Automation : la nouvelle précision **pour tous les projets** (les anciens sont des projets de test, aucune conversion).
- Suréchantillonnage : **garder l'actuel** par défaut ; 2×/4× seulement si choisi sur le module.

## 1. Verdict court

- **Déjà là et solide** : graphe compilé hors rappel, ordre déterministe (Kahn), envois depuis n'importe quel point,
  ports routés des modules à bandes, clés (sidechain) de tranche ou de port, IN secondaire, boucles fermées par un
  Retour de 128 trames, compensation de latence aux points de sommation et latence de sortie déclarée à l'hôte,
  adoption des modules au changement de graphe (état conservé, sans verrou), zéro allocation prouvée au rendu
  (`mix-graph/tests/*no_alloc.rs`), instruments multi-sorties, notes datées à la trame.
- **Manque réel (structurel)** : aucun signal de **contrôle** entre modules (rien ne module un réglage) ; automation
  calculée **une fois par bloc** du moteur, donc dépendante de la taille des blocs ; tout est **stéréo**
  (`kira::Frame`) hors des paires de sorties ; voix du Sampler **figées** (pas de chaîne par voix ni de modulation par
  voix) ; pas de types de ports déclarés (une incompatibilité n'est refusée que pour quelques cas : port absent, clé
  sur un module sans clé, IN sans source).
- **Inutile pour atome** : un éditeur de graphe à câbles (décision R-186 Q3 : modulateurs sans câbles, vue graphe
  plus tard) ; un second registre de modules (le catalogue `atome-dsp` suffit) ; le refus des cycles de VIE (atome
  autorise les boucles, D27) ; des voix qui traversent la console (choix de l'utilisateur ci-dessus).

## 2. Les quatre capacités

| Capacité | État avant ce chantier | Preuves (fichiers, tests) | Manque réel | Nature du manque |
| --- | --- | --- | --- | --- |
| 1. Ports typés | **Partiel** | audio stéréo en chaîne ; ports routés `outputs` (`program.rs` `PortRoute`, `graph.rs`), clés `KeySource` (tranche/port), IN `MixSource`, sorties d'instrument ; refus : port absent, clé refusée, IN sans source (`graph.rs#compile`) ; boucles par Retour (`return_ring.rs`, test `routing_tests.rs`) | type de port (audio N canaux / contrôle) déclaré par le catalogue ; refus explicite des branchements incompatibles ; cycle de modulation | structurel (contrat), pas d'UI requise |
| 2. Modulation audio-rate | **Partiel** | automation par couloir (`automation.rs`), courbes Linéaire/Palier/Douce, transport ancré par époque ; lissage par `Smoothed` (`atome-dsp/src/param.rs`) ; `Automation::run` **une fois par appel de rendu** (`shared.rs#render`) | évaluation à pas fixe aligné sur l'horloge (32 trames), modulateurs, cumul base ⊕ automation ⊕ modulation, cibles à la trame, suréchantillonnage choisi | structurel |
| 3. Multicanal | **Absent** (hors paires de sorties) | `kira::Frame` partout (`graph.rs`, `source_bus.rs`, `atome-dsp` `StereoBlock`) ; sorties en plus = paires (`audio-engine/src/aux_outputs.rs`, `Target::Device{channel}` = n° de paire) | largeur de tranche, bus larges, routage canal par canal, refus d'une sortie absente, conversions déclarées | structurel ; les backends gardent leurs FIFO par paire |
| 4. Signaux par voix | **Partiel** | voix du Sampler (`atome-instrument/src/voice.rs` : segment → ADSR VCA, pool `pool.rs`, vol de voix), notes datées (`mix-graph/src/instrument.rs`) | chaîne de voix générique (source → filtre → VCA, enveloppes et LFO **par voix**), appariement contrôle/audio de la même voix, somme à un point explicite | structurel (moteur de voix, R-186 Q1) |

## 3. Comparaison des moteurs (architecture seulement)

Source : `crates/vie-dsp/documentation/architecture.md`, `src/module.rs`, `documentation/voice_mix.md` — tout cela
décrit **VIE** (le moteur `vie_dsp`). « Opus » n'y est que le **nom de livraison** des greffons VST3/AUv3 de VIE
(`docs/current-capabilities.md`, qui dit lui-même ne décrire que VIE). Aucune capacité ci-dessous n'est attribuée à
Opus en propre.

| Point | VIE (lu) | atome (après ce chantier) |
| --- | --- | --- |
| Types de liaison | `FloatBuffer` (lignes mono), notes on/off, MIDI, `VoiceBuffer` (une ligne par voix) | audio de largeur 1/2/4/8, contrôle, notes datées ; voix dans la chaîne de voix |
| Cycles | refusés | autorisés par Retour (audio) ; modulation en arrière = un pas de contrôle plus tard (déclaré) |
| Modulation | ≤ 256 routes sortie flottante → propriété, résolues à la compilation | routes portées par le modulateur, cumul et unités déclarés, à la trame pour les cibles audio-rate |
| Polyphonie | ≤ 64 voix, lignes stables, `Voice Mix` = Σ(xᵢ·eᵢ) explicite | voix stables préallouées, chaîne par voix, somme explicite en fin de chaîne |
| Canaux | largeurs déclarées, conversions par modules dédiés | largeur par tranche, conversions déclarées sur la route, refus de toute réduction implicite |
| Suréchantillonnage | interne au FM Voice (4×) | 2×/4× au choix par module (enveloppe générique), latence compensée |

**Comparaison de performance non démontrée** : les deux moteurs n'ont pas tourné dans un protocole identique.

## 4. Architecture cible (sans nouveau moteur)

- `atome-dsp` : `Processor` gagne des valeurs par défaut neutres — `control_outputs()` / `process_control()` (un
  modulateur écrit son contrôle), `audio_rate(id)` + `process_modulated()` (une cible reçoit sa valeur à la trame) ;
  `ParamSpec::modulate()` dit le cumul et l'unité ; briques nouvelles : LFO, Constante, Suiveur, SVF ; enveloppe
  générique `Oversampled` (2×/4×, demi-bandes en cascade). Catalogue : ports et cibles audio-rate publiés.
- `mix-graph` : la tranche garde son modèle ; `StripSpec.channels` (1/2/4/8, 2 par défaut) ; les routes portent leur
  carte de canaux ; `Target::Outputs` (canaux physiques un par un, posés sur les paires existantes) ; le graphe rend
  par pas de contrôle de 32 trames alignés sur l'horloge absolue quand une automation ou une modulation existe (sinon
  comme avant) ; `ModuleSpec.modulations` (routes du modulateur), `ModuleSpec.oversample`.
- `atome-instrument` : moteur de voix `voice_graph` (chaîne de voix préparée une fois, N voix préallouées, modulation
  par voix, somme explicite) ; nouvel instrument `kind: "synth"` joué par le même chemin de notes que le Sampler.
- eVe (JS) : `timeline.mix` porte les nouveaux champs tels quels (le compilateur les transmet, le schéma les
  valide) ; aucune UI dans ce chantier (les maquettes du synthé sont R-186).

## 5. Plan et réalisation

Voir §7 (état après le code), mis à jour au fil des lots.

| Lot | Contenu | Fichiers | Preuve |
| --- | --- | --- | --- |
| L0 | découper `graph.rs` (> 500 lignes) avant de le faire grandir | `graph.rs` → `graph_compile.rs` + `graph_render.rs` | tests mix-graph inchangés |
| L1 | contrat des ports et de la modulation, briques modulateurs, SVF | `atome-dsp/src/{lib,param,catalog}.rs`, `control.rs`, `svf.rs` | tests atome-dsp |
| L2 | pas de contrôle 32 trames, automation alignée, routes de modulation, refus typés | `mix-graph/src/{program,automation,graph_*,modulation}.rs` | rendu identique à 17/64/128/500/4096 trames ; refus |
| L3 | suréchantillonnage 2×/4× par module | `atome-dsp/src/oversample.rs`, `mix-graph/src/dsp_module.rs` | repliement mesuré, latence compensée, CPU |
| L4 | multicanal 1/2/4/8 | `mix-graph` (tranches par paires, routes, sorties) | 1/2/4/8 sans diaphonie, refus, pistes stéréo inchangées |
| L5 | voix séparées dans le synthé | `atome-instrument/src/synth/`, `mix-graph/src/instrument_spec.rs` | deux notes, deux enveloppes, relâchements, somme |
| L6 | eVe : champs transmis et validés | `eVe/intuition/tools/molecule/kernel/mix_*.js` | sonde |
| L7 | mesures | `mix-graph/tests/engine_bench.rs` | chiffres §6 |

## 6. Protocole de mesure

`cargo test --release -p atome-mix-graph --test engine_bench -- --ignored --nocapture` sur la même machine, 48 kHz,
blocs de 128 et 512 trames, 10 s rendues hors ligne par configuration : (a) projet de référence sans les nouvelles
capacités ; (b) le même avec automation ; (c) modulation à la trame ; (d) tranches 8 canaux ; (e) synthé 16 voix ;
(f) saturation 1×/2×/4×. Mesures : temps moyen et p99 par bloc, rapport à l'échéance du bloc, allocations au rendu
(compteur global, objectif zéro). Résultats : §7.

## 7. État après le code

### 7.1 Capacités après le code

| Capacité | État | Preuves |
| --- | --- | --- |
| 1. Ports typés | **Fait** (moteur) | modulateurs déclarés par le catalogue (`control_outputs`, `control_range`, `audio_rate` → `MIX_DSP_CONTROL`) ; refus explicites testés (`mix-graph/src/modulation_tests.rs#the_typed_contract_refuses_what_it_cannot_render`, `wide_tests.rs#widths_and_maps_refuse_what_they_cannot_route`) : module sans sortie de contrôle, cible absente, réglage à crans, paramètre inconnu, sortie de contrôle absente, suréchantillonnage 3× ou d'un modulateur, largeur 3, 2→4 sans carte, canal hors cible, nombre de canaux listés faux, sortie physique absente, clé ou IN sur une tranche de 4 canaux, REC sur 4 canaux ; boucle de modulation sur soi-même acceptée, lue un pas plus tard (`a_modulation_loop_through_itself_is_allowed`) ; ordre déterministe inchangé (Kahn) |
| 2. Modulation à la trame | **Fait** | LFO→volume exact à chaque trame (`a_modulator_moves_a_parameter_at_every_frame`, écart < 1e-4) ; modulation en arrière = exactement 32 trames plus tard (`a_modulation_reaching_back_lands_one_control_step_later`) ; modulateur contourné = réglage inchangé ; rendu **identique** à 17/64/128/500/4096 trames avec automation, LFO→SVF, LFO→envoi, suiveur→volume, compresseur, écho et une boucle (`the_render_is_the_same_whatever_the_block_size`, écart < 1e-6) ; palier d'automation au pas de contrôle sans clic (pente ≤ 1/32 par trame) ; stabilité 44,1/48/96 kHz (dérive de phase du LFO en f32 ≈ 0,01° par seconde) ; cumul = base + Σ profondeur × contrôle, borné ; Hertz en octaves ; choix et nombres entiers non modulables ; suréchantillonnage 2×/4× : repliement réduit et latence déclarée (2× = 23 trames, 4× = 35) compensée sur les autres chemins (`an_oversampled_path_is_compensated_on_the_others`) |
| 3. Multicanal | **Fait** (moteur) | 8 tranches mono → bus 8 canaux → sorties 1–8 sans diaphonie (`eight_mono_strips_reach_eight_outputs_without_crosstalk`) ; réverbération par paire, mêmes réglages, paire non nourrie muette (sous −240 dB : le bruit anti-dénormaux de la réverbération) ; tranche mono = un canal des deux côtés ; repli déclaré 4→2 par carte ; chemin stéréo inchangé |
| 4. Signaux par voix | **Fait** (moteur) | synthé `atome-instrument/src/synth/` : deux notes qui se chevauchent = exactement la somme de chaque note seule (`tests/synth.rs#two_overlapping_notes_sound_as_the_sum_of_each_alone`, écart < 1e-6 : enveloppes, filtre et phase de LFO propres à chaque voix) ; rendu identique à toute taille de bloc ; relâchement par les enveloppes, pédale, vol de la voix la plus ancienne ; joué par une tranche via le chemin des notes du Sampler (`mix-graph/src/instrument_synth_tests.rs`) |

Temps réel : zéro allocation au rendu avec toutes les capacités ensemble, blocs de 17/333/128/500/31 trames
(`mix-graph/tests/r191_no_alloc.rs`), en plus des trois preuves existantes, toujours vertes.

### 7.2 Mesures (protocole §6, une exécution, cette machine (macOS), release, 16 nov. 2026)

| Configuration | bloc 128 : moyenne / p99 (% de l'échéance) | bloc 512 : moyenne / p99 |
| --- | --- | --- |
| a référence (8 tranches EQ+comp+écho+volume, bus réverb+comp) | 80,8 µs (3,0 %) / 314 µs (11,8 %) | 293 µs (2,8 %) / 381 µs (3,6 %) |
| b + automation | 84,9 µs (3,2 %) / 142 µs (5,3 %) | 331 µs (3,1 %) / 637 µs (6,0 %) |
| c + modulation (LFO → SVF et volume, 8 tranches) | 120 µs (4,5 %) / 340 µs (12,8 %) | 463 µs (4,3 %) / 1356 µs (12,7 %) |
| d 8 canaux (8 mono → bus 8 canaux réverb → 8 sorties) | 136 µs (5,1 %) / 256 µs (9,6 %) | 526 µs (4,9 %) / 765 µs (7,2 %) |
| e synthé 16 voix (2 osc, SVF modulé, 2 env., LFO) | 98,7 µs (3,7 %) / 136 µs (5,1 %) | 385 µs (3,6 %) / 463 µs (4,3 %) |
| f saturation 1× / 2× / 4× (8 tranches) | 47 / 112 / 260 µs (1,8 / 4,2 / 9,8 %) | 195 / 440 / 1074 µs (1,8 / 4,1 / 10,1 %) |

Lecture : l'automation coûte ≈ 5–13 % de plus que la référence, la modulation à la trame ≈ 40–60 % de plus sur les
tranches qui l'ont ; le 2× coûte ≈ 2,3×, le 4× ≈ 5,5× le module seul. Les p99 d'une seule exécution sur un portable
partagé sont bruités (a : p99 128 > b) : à refaire sur machine au repos avant d'en tirer une limite. Allocations au
rendu : 0 (test ci-dessus). **Comparaison de performance non démontrée** avec VIE/Opus (pas de mesure équivalente).

### 7.3 Ce qui a changé pour l'existant (à savoir)

- Le pas de contrôle s'applique à **tous** les projets (décision de l'utilisateur) : une automation est évaluée au
  premier frame de chaque pas de 32 trames alignés sur l'horloge, plus à chaque bloc ; les projets sans automation ni
  modulation gardent leurs morceaux de bloc.
- Corrigé à la racine (dépendance à la taille des blocs) : `SmoothedGain` (volume, envoi, IN, mute) rampe désormais
  sur 32 trames à chaque changement de cible, rampe portée d'un appel à l'autre (avant : sur la longueur du morceau,
  donc 128 à 4096 trames selon l'hôte) — un changement de niveau est donc plus rapide qu'avant (0,67 ms à 48 kHz) ;
  le biquad recalcule ses coefficients toutes les 16 trames d'horloge (avant : au début de chaque bloc).
- Nouvelles briques `atome-dsp` : `lfo`, `follower`, `constant`, `svf` (catalogue, 49 sortes), `noise` (générateur),
  `Oversampled`.

### 7.4 Pas fait (à savoir)

- **Aucune interface** : ni le JS du projet ni l'UI ne posent encore `channels`, `modulations`, `oversample`,
  `Target.channels`/`outputs` (le compilateur `eVe/core/media_engine/molecule_mix_engine.js` construit le programme
  champ par champ ; le moteur les reçoit par défaut : stéréo, sans modulation). Les rendre éditables est une UI
  nouvelle (règle 16 : maquette validée d'abord) — modulation et multicanal de la console : à maquetter ; synthé :
  R-186 (session « Modular sampler to-do review », UI validée, catalogue `synth_catalog.js` généré pour elle).
- Briques du synthé au-delà du moteur (largeur d'impulsion, sync, unisson, courbes d'enveloppe, 24 dB, drive, mix,
  maths, hasard, pression, pente, LFO scie/hasard/tempo) : lot R-186.
- Réglages des briques du synthé en direct : une modification passe par une nouvelle description (`instrument set`),
  qui relance les voix ; seuls gain, accord, polyphonie et plage de bend sont réglables en direct.
- La voix du synthé est mono (somme des voix → les deux canaux) ; le SVF et l'oscillateur calculent leur second canal
  pour rien (coût ×2 sur ces briques, mesure e ci-dessus).
- Le Sampler garde sa voix figée (sa migration dans la chaîne de voix : R-186 Q1, plus tard).
- Web (AudioWorklet) et iOS/Tauri : le même Rust est compilé (clippy WASM/iOS), mais aucun essai à l'oreille ni sonde
  sur appareil dans ce chantier.

### 7.5 Contrôles exécutés (16 nov. 2026)

- `cargo test -p atome-dsp -p atome-instrument -p atome-mix-graph` : vert, y compris `tests/r191_no_alloc.rs` (0 allocation sur 400 blocs de 17/333/128/500/31 trames) ; Biome propre sur les deux catalogues générés.
- `npm run check:rust` (`temp/rust_check/r191_run2.txt`) : clippy wasm_direct, ios, linux_confine OK ; aucun constat dans atome-dsp, atome-instrument ou mix-graph. Les échecs sont tous hors R-191, dans le travail en cours d'autres sessions : fmt (atome-lottie, lpproj-import, `lottie_exports.rs`), host (cibles de test `interchange` absentes), wasm_bevy (`lottie_gpu.rs`), wasm_audio (`atome_interchange` non déclaré dans `platforms/web/audio-wasm`). Au premier passage : 2 tests de synchro `atome-server` et cargo-deny (RUSTSEC-2026-0459, RUSTSEC-2026-0486), préexistants et sans lien.
- WASM Web : `squirrel_audio_wasm` (09:41) contient le synthé et toutes mes sources ; `atome_direct_wasm` reconstruit après la correction 1/√2.
- Après coup : constat clippy `bool_assert_comparison` dans `atome-dsp/tests/modulation.rs` corrigé (`assert!(… .is_err())`), `cargo clippy -p atome-dsp --tests -- -D warnings` propre, `--test modulation` 6/6.
- Tests no-alloc anciens (`instrument_no_alloc`, `routing_no_alloc`, `no_alloc`) rouges en debug sous charge (≈ 750) : `instrument_no_alloc` reproduit (6 allocations), juste après l'avertissement « running for over 60 seconds » de libtest, qui alloue sur son propre fil pendant la mesure. Confirmé en release par R-186 (16 nov., `CARGO_TARGET_DIR=temp/synth_2026-11-16/target`) : `instrument_no_alloc`, `no_alloc`, `routing_no_alloc`, `r191_no_alloc` 1/1 chacun (0 allocation), `atome-instrument` `streaming` 8/8 : la cause est l'avertissement 60 s de libtest sous charge, pas le moteur.
- Fin du 2e passage de `check:rust` : `test` rouge, avec `streaming::an_unfilled_ring_starves_counted_and_never_blocks` (assert de durée sous charge, vert en release), un test `progress_ring_tests` et deux tests `local_atome` (atome-server) hors moteur audio ; `deny` rouge, avec RUSTSEC-2026-0367/0368/0369/0429/0459/0486 sur des dépendances que R-191 n'a pas ajoutées (aucune dépendance ajoutée).
