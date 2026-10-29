# Synthétiseur / sampler par briques — plan à valider (29 oct. 2026)

Statut : **questions et maquettes validées (29 oct.) ; briques du Sampler codées à part le 29 oct. soir (crate `atome-instrument`, noyau JS, contrat MCP : cahier sampler §14), branchement après la session effets.** Source : `~/Downloads/Cahier_des_charges_synthetiseur_sampler_modulaire_atome_eVe.md`
v2.0 (ci-dessous « le cahier »). Suite du chantier effets `todo/effets_generateurs_audio_2026-10-28.md` (« plan
effets », décisions D0–D26), dont ce plan reprend le modèle sans en inventer un second.
Méthode : toutes les questions (§7) d'un coup → réponses → maquettes aux vrais jetons → code en une passe.

## 1. État vérifié dans le code (29 oct., arbre de travail avec les éditions en cours des effets)

| Sujet | État | Où |
| --- | --- | --- |
| Contrat de brique | **Existe** : `Processor` (prepare / process stéréo planaire / set_param lissé / params / latency / tail / reset) | `atome/engines/atome-dsp/src/lib.rs` |
| Catalogue | **Existe** : 17 sortes (volume, pan, 7 filtres biquad, compresseur, limiteur, écho, reverb, convolution, ampli NAM, oscillateur, enveloppe), clés stables ; catalogue JS **généré** depuis Rust | `atome-dsp/src/catalog.rs`, `tests/catalog_js.rs` → `eVe/intuition/tools/molecule/kernel/mix_dsp_catalog.js` |
| Chaîne | **Existe** : série, bypass avec traîne, latence gardée au bypass | `atome-dsp/src/chain.rs` |
| Oscillateur | sinus, scie/carré polyBLEP, triangle ; fréquence, forme, niveau. **Pas** de sync, FM/PM, largeur d'impulsion, sortie de contrôle | `atome-dsp/src/oscillator.rs` |
| Enveloppe | ADSR **linéaire, appliquée en VCA** ; la gate est un paramètre (taux de bloc). **Pas** de sortie de contrôle, pas de legato, pas de courbes | `atome-dsp/src/envelope.rs` |
| Rééchantillonneur | sinc fenêtré en flux, sans allocation | `atome-dsp/src/resample.rs` |
| Graphe de la console | DAG de tranches, ordre topologique (Kahn), **boucle refusée** (« mix routing loop », Rust et JS), compensation de latence **nourrie par la vraie latence** des briques | `mix-graph/src/graph.rs:74-152`, `kernel/mix_routing.js:48-86` |
| Hébergement d'une brique | `dsp_module.rs` : un `Processor` par module, paramètres atomiques lus **une fois par bloc**, actifs chargés hors temps réel, graphe entier échangé | `mix-graph/src/dsp_module.rs`, `lib.rs` |
| Générateur en entrée | **Refusé** dans une chaîne (« a generator is a strip input ») mais **aucune entrée générateur** : `InputSpec` = `Track` / `LiveAudio` ; JS `input.kind` = `track` / `live_audio` | `dsp_module.rs:80`, `mix-graph/src/program.rs`, `kernel/mix_schema.js:27` |
| Notes → son | **Rien.** Le MIDI ne va qu'aux ports externes (`runtime_midi.js`) ; Tauri et AUv3 renvoient le MIDI au JS | `molecule/runtime_midi.js`, `desktop-tauri/src/native_midi.rs:125`, AUv3 `utils.swift:284` |
| Ports d'événement / modulation | **Rien** (`StereoBlock::slice` prévu « pour couper un bloc à un événement », inutilisé) | `atome-dsp/src/lib.rs:38` |
| Voix de la timeline | région, boucle, gain, pan, `rate` (vitesse = hauteur), enveloppe à la trame, fin tardive atomique. **Pas** de reverse, de hauteur séparée, d'allocation polyphonique | `mix-graph/src/voice.rs`, `voice_control.rs` |
| Time-stretch | **Hors ligne seulement** : `rubberband-wasm` (GPL v2+) en JS, rendu mis en cache ; rien en natif, `dsp_core.cpp` vide | `audio_edit/rubberband_stretch_runtime.js`, `THIRD_PARTY_LICENSES.md:1-37` ; licence du projet **Apache-2.0** |
| Latence | natif : rendu 2048 trames en avance (≈ 43 ms), blocs 256 ; Web : Kira sur le fil principal, 120 ms d'avance. **Chemin direct** (plan effets L2) **pas encore codé** ; aucun AudioWorklet DSP | `audio-engine/src/scheduled_backend.rs:21-24`, `audio-wasm/src/scheduled_backend.rs:16-19` |
| iOS / AUv3 | Kira + graphe tournent (commandes Rust) ; l'ancien chemin Swift PCM coexiste dans l'AUv3 | `bevy-renderer/src/audio.rs`, `AUv3RenderEngine.swift:46-60` |
| Effets enregistrés, combos, `audio_fx`, Capture › Effets | **Pas encore codés** (plan effets validé, code en cours : L1) | — |
| MCP console | `mix.module.add/update/move/remove/bypass`, `mix.input.set`… ; **l'énumération `type` n'a pas `dsp`** | `atome/src/shared/timeline_tool_contract.js:16-33` |

### 1.1 Écarts et incohérences relevés

1. **Boucles** : le cahier (§2.3, Annexe C) les autorise ; le plan effets **D26** (même jour) les refuse ; le code les
   refuse. → Q1.
2. **Rubber Band** : le cahier le dit « déjà intégré » pour le temps réel ; il n'est qu'**hors ligne, en WASM, sous
   GPL v2+**, alors que le projet est Apache-2.0 et part sur l'App Store (GPL et App Store ne vont pas ensemble). Sans
   licence commerciale, le distribuer n'est pas possible. → Q2.
3. **Premier lot très lourd** : 16 voix avec time-stretch exigent d'abord ce qui n'existe pas : notes → moteur,
   allocation de voix, stretch temps réel. Le cahier l'assume ; le plan le découpe (§5) sans le repousser.
4. **Paramètres au taux de bloc** : gate et réglages sont lus une fois par bloc Kira ; une note doit tomber à la trame
   → API d'événements avec découpe du bloc (S1).
5. **`ModuleCell` en `try_lock`** : si le verrou est pris, le module est sauté pour le bloc (`graph.rs:252`) : un
   effet laisse passer le son sec, un générateur ferait un trou. À corriger dans le lot effets (signalé).
6. **Ni FTZ ni garde « zéro allocation »** alors que le plan effets L1 les promet ; le Web alloue des `Vec` à chaque
   pompe (`render_ahead`). À corriger dans L1 (signalé).
7. **MCP** : `mix.module.add` ne propose pas `dsp` : l'assistant ne peut pas poser une brique `atome-dsp` (bug du
   lot effets, signalé).
8. **Réglages en direct** : chaque geste renvoie le programme entier (`mix_apply`) ; le Rust a déjà des paramètres
   atomiques par clé → une commande par paramètre (S1).
9. Le cahier parle de « simpler » interdit, de « Moissonneur » et « Détecteur » non définis → Q8.

## 2. Le concept, en une phrase

**Un instrument est une tranche dont l'entrée est un générateur polyphonique** (D26) : il réutilise la tranche,
ses modules, ses combos (D6/D7/D21), son enregistrement « Mes … » et le même MCP. Rien de neuf à côté.

```text
 notes (MIDI, séquenceur, timeline, MCP)
        │ événements datés à la trame
        ▼
 ┌─ IN : INSTRUMENT (générateur polyphonique) ─────────────┐
 │  voix 1..N = la même chaîne de voix, instanciée N fois  │
 │   [Sampler | Osc | Bruit] → [Filtre] → [VCA]            │  ← portée « voix »
 │      ↑ modulateurs de voix : Enveloppe, LFO, Vélocité   │
 │  layers en parallèle, sommés (stack : somme/zone/vel.)  │
 └──────────────────────────┬──────────────────────────────┘
                            ▼ somme des voix
   chaîne de la tranche : [Filtre global] → [Reverb] → [Volume] → OUT   ← portée « globale »
        ↑ modulateurs globaux : LFO commun, Suiveur…
```

- **La portée est donnée par la place** : une brique dans la chaîne de voix agit par voix ; dans la chaîne de la
  tranche, globalement ; dans un layer, sur ce layer (les trois portées du cahier §8.2, sans réglage de plus).
- **La modulation sans câbles** : un modulateur (Enveloppe, LFO, Suiveur, Détecteur, Vélocité, Macro…) est un outil
  posé dans la chaîne comme un effet ; il ne traite pas le son, il **sort un contrôle** et porte la liste de ses
  cibles `{module, paramètre, profondeur, opération}`. On l'assigne en le glissant sur un réglage (maquette). Une
  vue « graphe » pour l'expert reste possible plus tard, sur les mêmes données (cahier §13.1.7).
- **Un instrument enregistré** = un « Mon effet » dont l'entrée est un générateur : rangé dans **Capture ›
  Instruments** (D23.7), lié à ses instances, paramètres par instance (D6), imbricable (D7), rendu comme un outil
  qui se déplie (D21, liseré `combo_rail`).

## 3. Contrat de brique étendu (atome-dsp, un seul contrat)

Le `Processor` actuel reste ; on lui ajoute ce qui manque, avec des valeurs par défaut pour que les effets
existants ne changent pas :

| Ajout | Rôle |
| --- | --- |
| `ports()` | entrées/sorties audio (0 pour un générateur), sorties de **contrôle**, entrées/sorties d'**événements**, chacune typée (audio, contrôle, événement, note, transport) ; publié dans le catalogue généré → UI, MCP, validation |
| `event(offset, Event)` | note on/off (note, vélocité, voix), gate, déclencheur, reset ; l'hôte **coupe le bloc à l'événement** (`StereoBlock::slice`) : précision à la trame |
| `control_out(&mut [f32])` | un modulateur écrit son contrôle par bloc |
| entrées de modulation | l'hôte applique `valeur = base ⊕ profondeur × contrôle` toutes les **32 trames** (0,67 ms) par `set_param` lissé ; les cibles déclarées **audio-rate** (fréquence/FM d'un oscillateur, amplitude d'un VCA, coupure d'un filtre SVF) la reçoivent à chaque trame (Q5) |
| événements sortants | file sans verrou vers l'ordonnanceur : passage de marqueur, fin de boucle, fin de phase d'enveloppe |
| unités | `Unit` gagne : demi-tons, cents, battements, trames, ratio de lecture, normalisé ; conversions explicites, jamais implicites (cahier §7.3) |

Règles temps réel tenues dans ce lot : FTZ/DAZ, tampons préalloués, voix préallouées, aucun verrou dans le rendu,
test « zéro allocation » sur chaque brique.

## 4. Briques (catalogue cible, par lot)

| Famille | Lot 1 (P0) | Ensuite |
| --- | --- | --- |
| Sources | Oscillateur (+ largeur d'impulsion, sync, FM/PM), Bruit (blanc, rose, graine reproductible), **Sampler** | wavetable, granulaire, additif, phonèmes |
| Voix | Instrument (allocation N voix, vol de voix, sustain, unisson/désaccord), Note → hauteur, Vélocité | MPE (Q12) |
| Contrôle | Enveloppe ADSR **comme source** (courbes, legato, boucle), LFO (formes, sync tempo, par voix ou global selon la place), Constante, Échelle, Mélange, Macro | multi-segments libre, pas-à-pas, hasard déterministe |
| Filtres | SVF multimode modulable à la trame (le biquad actuel reste pour l'EQ fixe) | banque de filtres, formants |
| Sampler | région, boucle (avant / ping-pong / arrière), fondu de raccord, slices, vitesse ≠ hauteur ≠ durée | slices par détection |
| Événements | Marqueur, Compteur, Condition, Action, Horloge/tempo du transport | séquenceur interne |
| Rendu | Sortie, **Moissonneur** (capture → nouveau sample), Freeze/bounce hors ligne | export |
| Analyse | **Détecteur** (seuil/onset → événement), Suiveur (niveau → contrôle) | hauteur, spectre |
| Spectral | — | générateur de bandes, FFT/STFT, filtre spectral (Q10) |

Le **lecteur de région** (lecture d'une portion avec boucle et enveloppe) n'aura qu'un propriétaire : il passe de
`mix-graph/src/voice.rs` à `atome-dsp`, utilisé à la fois par la voix de la timeline et par le Sampler.

## 5. Lots

| Lot | Contenu | Preuve |
| --- | --- | --- |
| **S0** | Réponses §7, puis maquettes une par une (instrument fermé/déplié, assignation d'un modulateur, sampler avec forme d'onde et marqueurs, Capture › Instruments) | « validé » par maquette |
| **S1** | Contrat étendu (§3), catalogue généré avec ports, commande par paramètre, FTZ + test zéro allocation | `cargo test` atome-dsp/mix-graph ; sonde |
| **S2** | Chemin des notes : MIDI natif → moteur sans détour par le JS (Tauri, AUv3) ; notes JS/MCP/timeline → événements datés à la trame ; entrée `instrument` de la tranche (Rust + `mix_schema.js`) ; pool de voix | sonde : note programmée tombe à la trame exacte ; clip MIDI joue l'instrument interne |
| **S3** | Briques P0 : oscillateur complet, bruit, ADSR source, LFO, constante/échelle/mélange, SVF, VCA | exemple A du cahier (osc + ADSR) sans code par instrument |
| **S4** | Sampler + lecteur de région partagé + time-stretch temps réel (Q2) ; **16 voix stéréo 48 kHz** mesurées (Q11) | mesures CPU/mémoire/latence publiées, 10 min sans décrochage |
| **S5** | Marqueurs, compteurs, conditions, actions ; sémantique des cas limites (Q6, Q7) | exemples C et E, cas §10.6 du cahier en tests Rust |
| **S6** | Layers/stack, enregistrer → Mes instruments, préréglages, Capture › Instruments | exemple D ; sauver, rouvrir, rejouer |
| **S7** | Retours (Q1), Moissonneur, freeze/bounce hors ligne, Détecteur, Suiveur | exemple F ; boucle de retour stable, sans NaN |
| **S8** | MCP : catalogue lu du Rust, composer, valider à blanc, enregistrer, rendre ; test d'équivalence UI = MCP | exemple G par les deux voies, mêmes données |
| **S9** | Bandes et spectral (Q10) | exemple B, mesures d'artefacts et de coût |

Dépendances avec le chantier effets : S1 modifie le contrat `Processor` qu'écrit le lot effets L1 → à faire
**avec** lui, pas après ; le jeu **en direct** au clavier attend le **chemin direct** (effets L2 : natif et
AudioWorklet Web) ; l'interface attend la tranche B et les combos (effets L5–L6). La lecture depuis le séquenceur
et la timeline n'attend pas L2 (l'avance de rendu est compensée).

## 6. MCP (une seule famille avec les effets)

Instruments et effets sont les mêmes objets (tranches, combos) : **une famille** — celle prévue pour les effets —
pas deux. Commandes à ajouter à ce qui existe : `catalog` (briques, ports, paramètres, unités, latence, coût, lus du
catalogue Rust généré), `instrument.create`, `mod.assign/unassign`, `marker.add/move/remove`, `note.play`
(audition), `validate` (à blanc), `render`, `save`, `compose` (« une nappe sombre qui respire »). Les modules
restent sur `mix.module.*` (avec `dsp` ajouté). Chaque action d'écran a sa commande.

## 7. Questions

Posées toutes ensemble le 29 oct. (réponses possibles et recommandation dans le message de la session) ; les
réponses s'inscrivent en §8.

- **Q1** Boucles de retour : autorisées (cahier) ou refusées (D26) ?
- **Q2** Time-stretch temps réel : quel moteur, vu la licence GPL de Rubber Band ?
- **Q3** Le modèle « instrument = tranche à entrée polyphonique, portée par la place, modulateurs sans câbles » ?
- **Q4** Granularité des briques visibles ?
- **Q5** Modulation : taux de contrôle partout + audio-rate sur quelques cibles ?
- **Q6** Marqueurs : collés au contenu (trames de la source) ?
- **Q7** Actions d'un marqueur : sonores seulement, ou aussi des actions d'eVe ?
- **Q8** Moissonneur et Détecteur : quelles définitions ?
- **Q9** Le Sampler joue-t-il aussi le flux live (entrée micro) ?
- **Q10** Bandes : banque de filtres + additif d'abord, spectral FFT ensuite ?
- **Q11** Machine de référence des 16 voix ?
- **Q12** MIDI : niveau visé (MIDI 1.0, MPE, MIDI 2.0) ?
- **Q13** Ordre avec le chantier effets en cours ?

## 8. Décisions (29 oct., réponses de l'utilisateur)

- **Q1 — Boucles de retour autorisées** (déjà validé deux fois ; D26 du plan effets mal transcrit, corrigé en D27).
  Fermées par un Retour (bloc précédent, 128 trames), limiteur + garde valeurs non finies, signalées dans le design.
- **Q2 — Time-stretch derrière un contrat `Stretcher` interchangeable** (le JS a déjà ce sélecteur pour le rendu
  d'avance : `audio_edit/stretch_engine.js`). Signalsmith Stretch (MIT) en premier, **à challenger** : latence,
  CPU à 16 voix, qualité, mesurés contre Rubber Band en mode **temps réel natif** (pas WASM) — usage personnel de
  test, pas de distribution pour l'instant ; licence à voir plus tard. Le meilleur aux mesures est retenu.
- **Q3 — Modèle validé** : instrument = tranche à entrée polyphonique, portée par la place, modulateurs sans câbles.
  Vue graphe : plus tard.
- **Q4 — B** : outils musicaux visibles + primitives de calcul (constante, échelle, mélange, multiplication).
- **Q5 — B** : modulation toutes les 32 trames ; à chaque trame pour les exceptions décidées au cas par cas
  (hauteur/FM d'oscillateur, VCA, coupure de filtre…).
- **Q6 — A** : un marqueur posé **dans un son** (sampler, boucle, enveloppe) suit le son : il est repéré en trames
  de la source, donc l'étirement, la hauteur, le tempo et la lecture à l'envers ne le décalent pas ; il se déclenche
  quand la tête de lecture le franchit, dans un sens comme dans l'autre ; un saut (seek) ne le déclenche pas. Les
  marqueurs **de la piste** (timeline) restent en temps du projet, inchangés.
- **Q7 — B élargi** : un marqueur peut déclencher **toute commande** eVe/MCP, par une file qui ne bloque jamais
  l'audio ; les commandes confirmées gardent leur confirmation.
- **Q8 — Définitions validées** : Moissonneur = capture continue en mémoire tournante → nouveau sample ;
  Détecteur = analyse (seuil, attaque, hauteur) → événement ou contrôle.
- **Q9 — A** : le Sampler lit aussi le flux live, via la mémoire du Moissonneur.
- **Q10 — B** : banque de filtres + additif d'abord, FFT ensuite après mesures.
- **Q11 — C** : mesures sur le Mac d'abord, puis l'iPad.
- **Q12 — MPE dès le départ** (coût faible : hauteur, pression, timbre par voix sur des paramètres par voix qui
  existent de toute façon) ; repli sur MIDI 1.0 seulement si une mesure le montre trop coûteux.
- **Q13 — A** : l'intégration commence quand le chantier effets est fini.
- **Q13bis — A** (29 oct. soir) : les briques s'écrivent tout de suite dans leurs propres fichiers ; le branchement
  (console, `mix-graph`, catalogue, famille MCP) attend la fin de la session effets.
- **Défauts du code effets** : à corriger (inscrits en D28 du plan effets).
- **D-S1 (29 oct.)** Le synthé est une **entrée comme les autres**, choisie au IN (micro, ligne, autre tranche,
  instrument…). Les briques sous le liseré jouent **par note** ; ce qui suit dans la tranche traite toutes les notes.
- **D-S2 (29 oct.)** **Sorties multiples** : un instrument multitimbre (une partie par canal MIDI ou par layer, ex.
  une batterie) a plusieurs sorties, chacune routable vers sa propre tranche. Le moteur : le nœud instrument expose N
  sorties stéréo dans `mix-graph` (comme les envois). Maquette S5.
- **D-S3 (29 oct.)** **IN secondaire** : en plus de l'IN de tête (indispensable), un module **IN** s'insère n'importe où
  dans une chaîne et y **mélange** une autre source (micro, tranche, instrument). Intégration visuelle : maquette S5.

## 9. Maquettes (`temp/synth/mockups/`, générateur `gen_s1.mjs` sur le prélude des maquettes effets)

- **S1** instrument dans sa tranche — `s1a_instrument_replie.png`, `s1b_instrument_deplie.png`. Retouchée le 29 oct.
  après réponse : **le synthé est choisi au IN comme toute entrée** (D26 maintenu, pas d'outil séparé) : l'outil IN
  porte son glyphe ; touché, il déplie ses briques **de voix** sous le liseré `combo_rail` ; ce qui suit (Réverb, +,
  Volume, OUT) agit sur toutes les voix. **Validée le 29 oct.**
- **S5** sorties multiples d'un instrument multitimbre + module **IN secondaire** — à faire.
- **S2** brancher un modulateur — `s2a_lfo_cibles.png`, `s2b_filtre_module.png` (`gen_s2.mjs`), envoyée le 29 oct. :
  le modulateur ouvert (panneau soudé) a une carte **Cibles** : une rangée par réglage piloté (pastille de la brique,
  nom du réglage, profondeur en slider), un **+** pour en ajouter (liste des réglages de l'instrument, recherche) ;
  autre voie : glisser l'outil LFO sur un slider. Le réglage piloté montre la **plage balayée** (bande claire autour
  de la valeur). **Validée le 29 oct.**
- **S3** Sampler — `s3a_sampler.png`, `s3b_marqueur.png` (`gen_s3.mjs`), envoyée le 29 oct. : panneau soudé ;
  carte Sample (liste avec recherche) + Préréglage ; carte **forme d'onde** (trois demi-outils de haut) : bulles du bas
  = début/fin de la région jouée (dehors assombri), bulles du haut = boucle (bande cyan), trait lavande = marqueur ;
  toucher deux fois l'onde pose un marqueur, le glisser le déplace, pincer zoome ; réglages Hauteur, Durée
  (étirement), Lecture (Une fois / Boucle / Aller-retour / Arrière), Raccord (fondu de boucle). Marqueur touché :
  la carte des réglages devient la sienne — **roulette** Quand (Une fois / À chaque passage / Tous les N / Au Ne
  passage) + rangée **Action** (liste de toute commande). **Retour utilisateur (29 oct.)** : la base (petite,
  minimaliste) est bonne comme brique ; il manque tout le niveau professionnel → analyse §10, puis maquettes S3c–S3e.
- **S3c** Zones — `s3c_zones.png` (`gen_s3c.mjs`) : carte notes × vélocité plein écran, clavier, fiche de la zone touchée
  (prises en tuiles, roulettes Tirage et Groupe). **Design approuvé le 29 oct. soir**, avec ajouts (cahier sampler
  §5.1, §6.1) dessinés dans `gen_s3c2.mjs` / `gen_s3d0.mjs` : `s3c2a_glisser` (panneau d'import au pied, sons cochés
  glissés ensemble), `s3c2b_depot_libre` (Répartir : Notes / Vélo / Altern), `s3c2c_depot_occupe` (Altern / Mixer /
  Couche / Rempl.), `s3c2d_melange` (roulette Pile + niveau par son), `s3d0a_point_couper`, `s3d0b_point_warp`
  (roulettes Point et Aimant, points d'aimant sur les temps). **Toutes validées le 29 oct. soir** (« je valide le
  design, c'est parfait »). Ajout demandé à la validation : la **coupe** se règle par une **liste de sélection** des
  autres zones dans la fiche de la zone (une zone coupe celles qu'elle coche ; deux coches réciproques = groupe
  d'exclusion classique) — `s3c2e_coupe.png`, briques standard (liste à cases sur le rail de gauche).
- **S4** Capture › Instruments — à faire.

## 10. Sampler professionnel — analyse et recommandations (29 oct.)

> Détaillé et complété dans **`todo/sampler_cahier_des_charges_2026-10-29.md`** (fait autorité pour le Sampler :
> latence, découpage, éditeur, banques, V1.1–V1.7, questions Q14–Q23).

Demande : couches par vélocité, round-robin, boucles avec attaque / boucle / release, follow actions sur des marqueurs
dans le sample, vue plein écran de précision (sélection, copier-coller non destructif). La brique S3a reste le
**niveau de base** ; deux niveaux s'ajoutent au-dessus, sur les mêmes données.

### 10.1 Trois niveaux, un seul objet

| Niveau | Ce qu'on y fait | Où |
| --- | --- | --- |
| **Brique** (S3a, validée comme base) | un son, sa région, sa boucle, ses réglages | panneau soudé de l'outil |
| **Zones** | répartir plusieurs samples : touches × vélocité, couches, round-robin, groupes | carte « Zones » du même panneau (S3c) |
| **Éditeur** | travail de précision sur un sample : zoom à l'échantillon, sélection, opérations, boucles, slices, marqueurs | la carte forme d'onde **grandit en plein écran** (règle : un élément s'ouvre en grandissant) (S3d, S3e) |

### 10.2 Modèle de données : instrument → groupes → zones (héritage)

Le modèle qu'utilisent les samplers pros (Kontakt, EXS/Sampler de Logic, HALion, le format ouvert **SFZ**) :
un réglage posé sur l'instrument vaut pour tous ses groupes, un réglage d'un groupe pour toutes ses zones, une zone
peut le remplacer. Une **zone** porte :

- sample (référence immuable) + région début/fin + décalage de départ (modulable par la vélocité) ;
- note racine, accord fin, plage de notes, **plage de vélocité** (+ fondu enchaîné entre couches voisines) ;
- **boucle** : mode (aucune / avant / aller-retour / arrière), type (**continue**, ou **tenue** : on boucle tant que
  la touche est tenue puis on **sort vers le release**, la fin du sample), raccord (fondu), nombre de passages ;
- **release** : la partie après la boucle, jouée au relâché ; et **samples de relâché** déclenchés au note-off
  (étouffoir d'un piano), atténués selon la durée tenue ;
- **round-robin** : position dans un cycle (cycle, hasard, hasard sans répétition) — chaque frappe prend la zone
  suivante, la caisse claire ne sonne jamais deux fois pareil ;
- **groupes d'étouffement** (choke : le charleston fermé coupe l'ouvert), mode de voix (poly / mono / legato +
  glissé), **articulations** par touche de commutation (keyswitch) ;
- marqueurs (§10.4) et gain, pan, filtre, enveloppes propres (héritables).

Proposition forte : **import SFZ** (et DecentSampler `.dspreset`, SF2 ensuite) → toutes les banques libres et
commerciales s'ouvrent dans eVe ; **export SFZ** pour la portabilité. Licences : chaque banque garde la sienne.

### 10.3 Moteur de lecture : ce qu'exige la qualité pro

- **Interpolation** à pas variable par voix : sinc polyphasé (même conception que `atome-dsp/src/resample.rs`, en
  ratio variable), deux qualités (jeu en direct / rendu) ;
- **Streaming disque** : le début de chaque sample en mémoire, la suite lue sur un fil de travail dans des anneaux
  préalloués — indispensable pour un piano de plusieurs Go et pour la mémoire de l'iPad ;
- **Zéro clic** : fondu de raccord de boucle, micro-fondu (1–5 ms) au vol de voix, accroche au passage par zéro ;
- vol de voix : relâchées d'abord, puis la plus faible ; même note rejouée = reprise propre ;
- départ à la trame, décalage de départ ; **tempo** : boucle calée au tempo par étirement (Q2) ou par slices.

### 10.4 Marqueurs et follow actions dans le sample

Q6/Q7 tranchées (marqueur collé au son, toute commande). **Réutiliser le vocabulaire des Follow Actions des cellules**
(`kernel/scene_schema.js#FOLLOW_ACTIONS` : next, previous, stop, repeat, target, random, `after_passes`), sorti dans un
module partagé — un seul propriétaire : au passage d'un marqueur, sauter à un autre marqueur / slice / zone (suivante,
précédente, au hasard, cible), répéter N fois, s'arrêter, ou lancer toute commande. Même roulette « Quand » que S3b.

### 10.5 Éditeur plein écran, non destructif

- Zones fixes (règle 12) : en haut une **vue d'ensemble** du sample (où l'on est), au milieu la **vue de travail**
  zoomable jusqu'à l'échantillon (pincer), au pied les outils dans la bande (règle 13), ✕ à gauche.
- **Sélection** au doigt (bulles de début/fin), accroche : passage par zéro, attaques détectées (Détecteur), grille
  du tempo ; écoute de la sélection ; valeurs tapées (toucher deux fois).
- Opérations : couper, copier, coller, silence, fondu entrant/sortant, inverser, gain/normaliser, rogner,
  découper en **slices** (à la main, aux attaques, à la grille), poser boucle / marqueur, **trouver la boucle**
  (Détecteur : meilleur raccord par corrélation).
- **Non destructif** : le sample source ne change jamais ; les opérations forment une liste. Le noyau de la
  Timeline sait déjà couper, joindre, rogner, faire des fondus et étirer à la trame près sur une source immuable
  (`kernel/clip_join.js`, `clip_fades.js`, `stretch.js`) → **un sample édité est une petite Molécule** (une piste,
  des clips de la source) que le moteur lit depuis un **rendu en cache** ; « Figer » en fait un nouveau sample
  (cahier §5.3). Manquent au noyau : inverser, gain par clip, silence.
- Annuler / rétablir : celui du projet (le pipeline de commit).

### 10.6 Propositions en plus

- **Slices → clavier + motif MIDI** : une boucle découpée joue une slice par touche, et eVe crée le clip MIDI qui
  la rejoue telle quelle — on change le tempo sans étirer, on réarrange les frappes.
- **Auto-sampling** : eVe joue un instrument (un synthé d'eVe, ou un appareil MIDI externe) note par note et
  vélocité par vélocité, l'enregistre par le Moissonneur, coupe, cale, et **range tout seul** les zones.
- **Rangement automatique** : glisser 30 samples → note racine détectée (nom de fichier ou analyse de hauteur),
  couche de vélocité par niveau mesuré, round-robin pour les doublons.
- MCP : les mêmes opérations (« rends cette caisse claire en 4 round-robin », « coupe la boucle en 16 slices »).

## 11. La note composée — composer son sample à la volée (29 oct.)

Demande de l'utilisateur : une note peut être faite de **plusieurs samples enchaînés** — un sample d'attaque, un
sample de corps à partir d'un marqueur, un sample de release — et **chaque étape tirée dans une liste** (round-robin,
hasard) : release au hasard, attaque au hasard… Les follow actions vivent **dans le sample**, pas sur la Timeline.
Tout doit être faisable **en V1**, découpé en parties, la brique de base restant simple.

### 11.1 Le concept : une note = des étapes, chaque étape = une liste, des follow actions entre elles

```text
 note-on ──► ATTAQUE  [A1 · A2 · A3]  tirage : hasard sans répétition
                 │ au marqueur « m1 » de l'attaque (fondu 13 ms)
                 ▼
             CORPS    [C1]            boucle tenue tant que la touche est enfoncée
                 │ note-off (fondu 21 ms)
                 ▼
             RELEASE  [R1 · R2 · R3]  tirage : hasard
                 │ fin du sample
                 ▼
               stop
```

- **Segment** = un sample + sa région, sa boucle, son gain, son accord (exactement la brique S3a).
- **Étape** = une **liste** de segments + une règle de tirage : un seul, cycle (round-robin), hasard, hasard sans
  répétition, par vélocité, par note. Le cas simple (S3a) = une étape, un segment : rien ne change pour lui.
- **Transition** (follow action) = un déclencheur → une cible, avec un fondu :
  - déclencheurs : fin du segment, **passage d'un marqueur**, N passages de boucle, **note-off** (relâché),
    nouvelle note liée (legato), vélocité / contrôleur MIDI au-dessus d'un seuil, durée écoulée ;
  - cibles : étape suivante, précédente, une étape nommée, une étape au hasard, répéter, s'arrêter, ou **toute
    commande** (Q7) ; le tirage dans la liste de l'étape se fait à l'arrivée.
- **Fondu** entre étapes (puissance constante, en ms) et option d'**alignement de phase** (pour enchaîner deux
  sons tenus sans battement).
- Les **zones** (§10.2) restent la carte touches × vélocité ; chaque zone joue un segment simple **ou** une note
  composée. Couches de vélocité et round-robin s'expriment avec le même mécanisme (une étape et sa règle de tirage).

### 11.2 Réutiliser les Cellules de la Timeline (un seul propriétaire)

La Timeline a déjà ce vocabulaire pour ses cellules : `play_mode` one_shot / loop, `passes`, `trigger` latch /
**momentary** (= tant que tenu), `follow_action` next / previous / stop / repeat / target / random avec
`after_passes` (`eVe/intuition/tools/molecule/kernel/scene_schema.js`). Une note composée en est la version
« dans une voix » : **même schéma, sorti dans un module partagé**, étendu de ce qui manque (note-off, marqueur,
tirage dans une liste, fondu). Les cellules en profitent (une cellule pourra suivre un marqueur).

Différence d'exécution : les cellules sont pilotées par le transport JS ; la note composée est exécutée **dans
la voix, en Rust**, à la trame près : chaque voix porte une petite machine d'états préallouée, aucune décision ne
passe par le JS. Le hasard est **à graine** : un rendu hors ligne rejoue exactement les mêmes tirages (cahier §4.2).

### 11.3 Contraintes moteur que cela impose (V1)

- Toutes les têtes de samples des listes **préchargées** (streaming §10.3) : le tirage ne doit jamais attendre le disque.
- Une voix peut faire sonner **deux segments en même temps** pendant un fondu : la voix a deux lecteurs.
- Le vol de voix, le choke et le legato traversent les étapes (une note volée termine proprement sa release courte).
- Le time-stretch (Q2) s'applique par segment ; un marqueur suit son son (Q6) même étiré.
- Mesure : 16 voix × 2 lecteurs × stretch sur le Mac, puis l'iPad (Q11).

### 11.4 Interface (maquettes à faire)

- **S3a** reste la brique simple (validée comme base).
- **S3c Zones** : la carte touches × vélocité ; une zone touchée montre ses couches et son round-robin.
- **S3d Éditeur plein écran** (§10.5) : la forme d'onde grandit en plein écran, sélection, opérations, slices, boucle,
  marqueurs, le tout non destructif.
- **S3e Note composée** : proposition — la **grille des cellules** de la Timeline réutilisée : une colonne par étape
  (Attaque, Corps, Release), dans chaque colonne la liste de ses segments en tuiles ; la règle de tirage au pied de
  la colonne ; une follow action se règle sur le segment ou le marqueur qui la porte (roulette Quand + Action, S3b).

### 11.5 Découpage — tout en V1, dans cet ordre

| Partie | Contenu | Preuve |
| --- | --- | --- |
| **V1.1** Brique simple | S3a, interpolation à pas variable, boucle continue / tenue + release, 16 voix + stretch | mesures Mac puis iPad |
| **V1.2** Zones | touches × vélocité, couches + fondu, round-robin, choke, mono/legato, keyswitch, streaming | sonde : bonne zone à la trame, mémoire tenue avec une grosse banque |
| **V1.3** Note composée | étapes, listes, tirages à graine, follow actions (module partagé avec les cellules), fondus, deux lecteurs par voix | tests Rust des cas limites (§10.6 du cahier) + écoute |
| **V1.4** Éditeur | plein écran, sélection, opérations non destructives (Molécule + rendu en cache), slices, trouver la boucle, Figer | sonde : éditer, annuler, figer, rejouer |
| **V1.5** Banques | import SFZ / DecentSampler, rangement automatique, slices → MIDI, auto-sampling | une banque SFZ libre jouée telle quelle |
| **V1.6** MCP | toutes ces opérations en commandes, équivalence UI = MCP | exemple G du cahier |
