# Effets et générateurs audio — plan à suivre (28 oct. 2026)

Statut (29 oct.) : maquettes validées, **code en cours, d'un seul tenant jusqu'au dernier lot** (règle
AGENTS.md « A task runs to its end » : on ne rend pas la main tant qu'un lot reste, sauf blocage nommé).
Fait : L1 (briques `atome-dsp`, hôte `dsp` dans `mix-graph`, latence réelle compensée), cœur de L3/L4 (NAM, convolution, reverb),
L10 (effets Kira retirés de `mix-graph`, projets anciens convertis au chargement par
`kernel/mix_kira_effects_conversion.js` ; sans équivalent : `stereo_width` de la reverb, `mix` du compresseur et du
filtre), L11 + L12 (ports, clés, Retour de boucle, sondes `mix-graph` `port_tests` + `tests/no_alloc.rs`, noyau JS,
lignes « Clé » et « Bande N → » dans la zone de la console), D27, D28 (1) (2 natif ; 2 Web avec L2) (3).

Avancement du 29 oct. (soir), vérifié par sondes :
- **L2** chemin direct : Tauri ≤ 256 trames, ≤ 5,3 ms à 48 kHz (sortie) ; Web par AudioWorklet (D28-2 Web : plus
  d'allocation par pompe). Sur macOS, entrée et sortie restent deux flux cpal alignés par l'anneau d'entrée (cpal
  0.15 n'a de flux duplex sur aucun hôte).
- **D23-1 Windows (29 oct., nuit)** : sortie **WASAPI exclusive** par défaut, à la plus petite période de
  l'interface, pilotée par événement, fil en classe « Pro Audio » ; **duplex** : toutes les entrées du moteur
  (tranches en direct et prises) sont ouvertes en exclusif et lues **dans le même cycle que la sortie, sur le même
  fil**, avant le chemin direct (`wasapi_client.rs`, `wasapi_duplex.rs`, `output_fill.rs`, `recorder_capture.rs`).
  Une interface qui refuse l'exclusif est une erreur nommée (`wasapi_exclusive_refused`), jamais un flux partagé.
  Vérifié ici : `cargo check --target x86_64-pc-windows-msvc` (lib et tests) sans avertissement, tests macOS
  28/28. **Pas encore entendu : à essayer par l'utilisateur sur un PC Windows** (sortie, entrée en direct, prise
  pendant la lecture, test `wasapi_client::tests`). **ASIO non fait** : il faut le SDK Steinberg (licence) et un
  build sur Windows ; à décider par l'utilisateur.
- **L3–L5** : Capture › Effets, tuiles, panneau d'interrupteur (D14), chaîne à la volée, Volume (D16, D19), Mes
  effets ; retour à la réouverture (restauration au lancement, au premier toucher sur le Web).
- **L6** : Mes effets dans l'ajout d'un module de la console du projet ; catégorie **Effets** du Finder
  (`audio_effect`) ; **Effets** dans la bibliothèque du Dashboard (Média d'eVe Pro après Images, dernier rayon de la Médiathèque ; la tuile de Capture, même niveau) ; but
  `creation/effects` de `ui.new_project` : un projet ouvert sur sa console, une piste son posée (sa 1re tranche).
- **L7** : famille MCP `audio_fx` (catalog, inputs, start, stop, add, move, remove, set_param, bypass, set_input,
  save, update, compose, delete), sonde bout à bout.
- **L8** : entrée `host` de l'AUv3 (`host_output.rs#push_host_input`, `AUv3KiraEngine.swift#routeHostInput`) : une
  tranche dont l'IN est « Hôte » joue le son de l'appli hôte à travers sa chaîne, le son sec n'est plus recopié
  tant qu'elle l'écoute ; test Rust `direct_tests::the_host_input_reaches_the_strip_that_listens_to_it`. **À
  essayer par l'utilisateur dans AUM.**
- **Console du projet = tranche B** (D24) : colonne IN, modules, +, OUT, nom au pied ; panneau soudé (préréglage,
  choix, tool sliders deux par rangée) ; les tranches voisines s'écartent.
- Charte : règle 14 (D12b, D18), règle 20 (D13), règle 13 (D14), règle 15 (`combo_rail`).
- **m7 (29 oct., nuit), vérifié par sondes Web** (`temp/effects/probes/console_m7`, `dashboard_m7`,
  `audio_fx_mcp_m7`, `scene_master`) : propriétaire unique du geste de la règle 20
  (`eVe/intuition/shared/tool_gesture.js`, familles validées) ; dans la console du projet, toucher = bypass d'un
  effet fermé, glissé = panneau, maintien relâché = panneau, maintien puis déplacé = réordonner / autre tranche /
  zone de suppression (Volume et Pan compris, sans bypass) ; « Enregistrer le préréglage » (champ du nom prérempli,
  Entrée enregistre) ; recherche TONE3000 dans la ligne « Ampli », tons dépliés avec la photo dans l'aperçu, modèle
  pris (console et Dashboard) ; combo déplié avec son `combo_rail` ; virgule décimale selon la langue ; maître de
  scène = colonne standard (Volume en tool slider, nom au pied ; un glissé = un `scene.update { gain_db }`) ; Favori
  des briques (sa tuile en tête, retour au niveau tenu) ; MCP `audio_fx.favorite`, `save_preset`,
  `tone3000_search`, `tone3000_models`, `tone3000_take`. Le pilote `bevy_panel_fader.js` est supprimé.
- Restent à l'utilisateur : clé TONE3000 et `server/ws_tone3000.js` à mettre sur atome.one (déploiement avec son
  accord) ; essai Windows et décision ASIO ; essai AUM.
- TONE3000 réel (29 oct., soir) : clé `t3k_cs_` posée par l'utilisateur dans `private/tone3000.txt` (le fichier
  porte aussi la clé publishable et la legacy, non utilisées) ; vrai appel par `handleWsTone3000` : recherche
  « Marshall JCM800 » 25 tons, liste des modèles (8 A2), téléchargement de 295 ko (`SlimmableContainer` 0.7.0,
  48 kHz), chargé par `AmpModel` et joué à 48 et 44,1 kHz, tailles 1 et 0,3, sortie finie, ≈ 0,2 s de calcul par
  seconde à pleine taille (sonde `temp/tone3000/`).

Demande de l'utilisateur, résumée :

- un effet sert **à la fois** d'insert dans une tranche de la console (il prend l'entrée de la tranche) et
  d'**outil autonome** : touché, il se branche tout seul sur l'entrée choisie (une seule entrée → directement),
  on joue tout de suite ;
- deux effets lancés à la suite forment une **chaîne à la volée**, ordonnable comme une tranche ;
- la chaîne se **sauve comme un nouvel effet** (« Guitar Combo 1 ») : il rejoint la bibliothèque, catégorie
  **Mes effets**, et se place ensuite dans les consoles comme n'importe quel effet ;
- le **MCP** sait lister, régler, chaîner, sauver et composer des effets (« je veux un son de tel type ») ;
- premier effet : **NAM** (Neural Amp Modeler, architecture A2), puis une reverb, une convolution ;
- **consommation minimale, latence minimale, partout** : DSP en Rust natif sur chaque plateforme, WASM
  (version dégradée) sur le Web ;
- même chantier ensuite pour les **générateurs** (synthétiseurs).

## 1. État vérifié dans le code (28 oct.)

Ce qui existe déjà et qu'on réutilise (pas de second système) :

| Brique | Propriétaire | Ce qu'elle fait déjà |
| --- | --- | --- |
| Modèle de la console | `eVe/intuition/tools/molecule/kernel/mix_schema.js`, `mix_structure.js` | `timeline.mix.strips[<piste>:<voie>].chain[]`, entrée `track` ou `live_audio{device_id}`, sorties, bus, groupes |
| Catalogue des modules | `kernel/mix_modules.js` | module `fx` + `MIX_AUDIO_EFFECTS` : reverb, delay, compressor (sidechain), eq 3 bandes, filter, distortion. Paramètres : `number`, `enum`, `strip_ref` seulement |
| Compilateur vers le moteur | `eVe/core/media_engine/molecule_mix_engine.js` | programme envoyé par `audio.mix_apply` |
| Graphe Rust | `atome/engines/mix-graph` | effet Kira sur la piste principale, toute la console dans le même bloc ; `build_effect` (`effects.rs`) ; compensation de latence prête mais nourrie par `&\|_\| 0` (`lib.rs:178`) |
| Moteur natif | `atome/engines/audio-engine` (cpal) | Tauri + iOS + AUv3 ; entrée live par périphérique (`live_input.rs`) ; **rendu en avance de 2048 trames** (`scheduled_backend.rs:24`, ≈ 43 ms) |
| Web | `platforms/web/audio-wasm` | Kira sur le **fil principal**, blocs de 512, 120 ms d'avance ; entrée live par worklet d'enregistrement, morceaux de 20 ms → **≈ 150 ms aller-retour** |
| UI de la console | `eVe/domains/rendering/molecule_mix_*.js` | tranche = colonne de modules, picker d'effets lu dans `MIX_AUDIO_EFFECTS` |
| MCP de la console | `atome/src/shared/timeline_tool_contract.js` | `mix.module.{add,update,move,remove,bypass}`, `mix.input.set`… |
| Famille MCP nouvelle | `atome/src/squirrel/atome/mcp_contract_families.js` + `tool_runtime_service_commands.js` | modèle `capture/contracts.js` |
| Bibliothèque | `eVe/domains/dashboard/dashboard_library.js` (`KINDS`), `dashboard_media_rubric.js` | rayons image / vidéo / son, lus dans les fichiers de l'utilisateur |
| Générateurs | `eVe/intuition/tools/generator/` | registre de **générateurs d'atomes** (palette Créer), famille `audio` déjà déclarée |
| Plans antérieurs | `todo/DSP_audio_engine.md` (crate `atome_dsp`), `todo/eVe_plugin.md` L8 (ABI `process(in, out, params, frames)`, `latency_frames` obligatoire), `todo/mixer/mixer.md` | aucun crate DSP n'existe encore ; formats externes (VST/AU/CLAP) exclus |

Constat décisif : **la console sait déjà faire passer une entrée live dans une chaîne d'effets, sur toutes les
plateformes, mais trop tard pour jouer** (43 ms natif + tampon d'entrée ; ≈ 150 ms Web). Jouer de la guitare
demande < 10 ms natif. C'est le cœur du chantier, avant même NAM.

Note périmée à corriger au passage : « pas de graphe sur iOS » (mémoire et `todo/audio_to_finalize.md`
l. 135–137) — iOS et AUv3 font tourner le même moteur Kira + graphe.

## 2. Le concept, tel que je le comprends

Trois objets, un seul moteur :

1. **Effet** (brique) : un processeur DSP Rust déclaré au catalogue (NAM, reverb, convolution, eq…), avec
   ses paramètres typés, sa latence et sa traîne. Il ne sait rien de l'endroit où il est branché.
2. **Chaîne** : une liste ordonnée d'effets avec une entrée et une sortie. C'est exactement la `chain[]`
   d'une tranche. En autonome, la chaîne à la volée **est une tranche live** (entrée `live_audio`), seulement
   présentée hors de la console.
3. **Mon effet** (atome sauvé) : une chaîne figée + ses paramètres exposés, typée, rangée dans
   **Mes effets**. Placé dans une tranche, c'est un module `fx` dont `effect = user:<atome_id>` ; le
   compilateur l'**aplatit** en ses effets au moment de compiler (aucune imbrication au temps réel, coût nul).

Donc : utiliser un effet en autonome = créer/compléter une tranche live hors console ; sauver = figer cette
tranche en atome « effet » ; la remettre dans une console = un `fx` de plus. Un seul modèle, une seule
validation, un seul compilateur, un seul MCP.

## 3. Moteur : où se joue la latence

Une crate Rust nouvelle, **`atome/engines/atome-dsp`** (nom repris de `todo/DSP_audio_engine.md`), seule
propriétaire du DSP des effets et générateurs, compilée en natif (Tauri, iOS, AUv3, Android) et en wasm32
(`+simd128`). Contrat d'un processeur (inspiré de l'ABI de `eVe_plugin.md` L8, des paramètres de nih-plug/CLAP) :

```
prepare(sample_rate, max_block, channels)   // hors temps réel : allocations, chargement modèle/IR
process(&mut io, frames)                     // temps réel : zéro allocation, zéro verrou, zéro E/S
set_param(id: u32, value: f32)               // lissé dans le processeur
latency_frames() -> u32                      // réel, nourrit enfin la compensation de mix-graph
tail_frames() -> u32
reset()
```

Règles temps réel imposées par la crate : dénormaux coupés (FTZ/DAZ), tampons préalloués, chargement des
modèles `.nam` et des IR sur un fil de travail puis **échange atomique** du processeur prêt, jamais de JS
dans le rappel audio.

Deux chemins, un même code DSP :

| Chemin | Usage | Où il tourne | Latence visée |
| --- | --- | --- | --- |
| **Console** (existant) | tranches de la timeline, lecture, mixage | `mix-graph` dans Kira, rendu en avance | inchangée ; la latence des effets est compensée |
| **Direct** (nouveau) | effet autonome, monitoring d'une tranche live, jeu | natif : traité **dans le rappel de sortie du périphérique**, hors de l'avance de 2048 trames, entrée lue dans l'anneau `live_input` du même cycle ; tampon 64–128 trames demandé au périphérique (iOS : `preferredIOBufferDuration`) | natif 3–8 ms aller-retour (dépend de l'interface) |
| **Direct Web** | idem dans un navigateur | un **AudioWorklet** qui héberge le WASM `atome-dsp` (blocs de 128), `MediaStreamSource` → worklet → sortie, `getUserMedia` sans AGC/débruitage/annulation d'écho, `latencyHint: 'interactive'` ; réglages par le port du worklet (pas besoin de SharedArrayBuffer) | 10–30 ms Chrome bureau ; Safari plus ; « dégradé » assumé |
| **AUv3** | atome comme pédale dans un hôte (AUM, GarageBand) | l'entrée de l'hôte (`pullInputBlock`) passe enfin dans la chaîne au lieu d'être recopiée | latence de l'hôte |

### 3.1 Pourquoi 43 ms aujourd'hui, et comment descendre au minimum physique (natif)

Cause vérifiée (`atome/engines/audio-engine/src/scheduled_backend.rs`) : un fil de rendu fait tourner Kira
**2048 trames en avance** dans une FIFO, que le rappel cpal de sortie se contente de recopier. Ce choix sert la
lecture de la timeline : le JS programme les voix à la trame près et l'avance lui laisse le temps de le faire ;
pour un son connu d'avance elle ne s'entend pas (l'ancre trame/instant compense). Pour une entrée live, elle
s'ajoute telle quelle. S'y ajoutent : flux cpal d'entrée et de sortie **séparés** en `BufferSize::Default`
(souvent 512 trames sur macOS) reliés par l'anneau `live_input` (au moins un tampon de plus), et un
rééchantillonnage linéaire si les fréquences diffèrent. Total réel bien au-delà de 43 ms.

Ce qui reste incompressible : convertisseurs de l'interface (≈ 0,5–1,5 ms) + un tampon d'entrée + un tampon de
sortie. À 48 kHz, 32 trames = 0,67 ms, 64 trames = 1,33 ms : **≈ 3–5 ms aller-retour**, ce que font les
pédaliers logiciels pro. Plan :

1. **Le jeu ne passe plus par l'avance.** L'entrée live est traitée dans le **rappel de sortie même**, après la
   recopie de la FIFO de la timeline : même cycle, même tampon, aucun anneau entre entrée et sortie.
2. **Un vrai flux duplex** (entrée et sortie dans un seul rappel, une seule horloge), car cpal 0.15 n'en a pas :
   macOS/iOS une unité Core Audio unique (HAL Output / RemoteIO, entrée activée, `AudioUnitRender` de l'entrée
   dans le rappel de sortie) ; Android AAudio en mode performance basse latence, exclusif ; Windows WASAPI
   exclusif (ASIO si présent) ; Linux ALSA/JACK. C'est la frontière plateforme, en Rust.
3. **Tampon demandé au plus petit que tient la machine** (32 ou 64 trames ; iOS `preferredIOBufferDuration`),
   et la fréquence de l'interface adoptée telle quelle (pas de rééchantillonnage sur le chemin du jeu).
4. **Effets à latence algorithmique nulle** sur ce chemin : NAM est causal (0 trame) ; la convolution utilise une
   tête en temps direct + queue FFT (convolution sans latence) ; la reverb FDN est à 0.
5. Fil audio en priorité temps réel (macOS/iOS : workgroup audio du périphérique), dénormaux coupés.
6. Mesure systématique par boucle câblée sortie → entrée (`measure_input_latency` existe).

L'avance de 2048 trames de la timeline peut rester pour la lecture ; elle sera réduite (256–512) dans un lot à
part si la réactivité du transport le demande, sans toucher au chemin du jeu.

Le chemin direct alimente aussi l'enregistrement : on enregistre l'entrée sèche **et** la sortie traitée,
alignées par la latence déclarée (c'est ce que fait un ampli de studio).

Coût visé (mesuré à chaque lot, sonde à l'appui) : NAM A2 « standard » ≈ 3–9 % d'un cœur natif, plus sur
WASM ; A2 est **réglable en taille au temps réel** (slimmable) : on l'exploite pour baisser le coût sur
téléphone et sur le Web, automatiquement selon la charge mesurée.

## 4. Sources DSP retenues (licences vérifiées)

| Effet | Source | Licence | Intégration |
| --- | --- | --- | --- |
| Ampli NAM A1/A2/LSTM/slimmable | `nam-rs` 0.4 (Rust pur, sans allocation dans `process_buffer`) | MIT | dépendance Rust, ou portage dans `atome-dsp` (question Q2) |
| Référence de performance NAM | `NeuralAmpModeler-rs` (noyaux AVX2, tanh polynomiale) | Apache-2.0 | s'en inspirer pour noyaux simd128/NEON |
| Référence officielle | `NeuralAmpModelerCore` v0.6 (C++/Eigen) | MIT | validation numérique (ESR) seulement |
| Cabinet (IR) / convolution | `fft-convolver` + `realfft`/`rustfft` | MIT | partitionnement uniforme ; non uniforme pour les longues IR |
| Reverb de base | réseau FDN Hadamard façon Signalsmith (« Let's write a reverb ») | MIT | écrit en Rust dans `atome-dsp` |
| Reverb « pro » | CloudSeed (portage Rust pur) ou zita_rev1 (Faust → Rust) | MIT / STK-4.3 | lot ultérieur |
| EQ, filtres | biquads RBJ, SVF Cytomic | libres | écrits en interne |
| Compresseur, gate, saturation | Airwindows | MIT | portage d'algorithmes |
| Accordeur | `pitch-detection` / `pyin` | à vérifier | lot ultérieur |
| À éviter | Dragonfly, aloe-fft, modules DSP de chowdsp | GPL-3 | — |

Modèles `.nam` : ils viennent de TONE3000, chacun sous la licence de son auteur (souvent : usage libre, pas de
redistribution du fichier). **On n'embarque aucun modèle tiers** ; l'utilisateur importe les siens (question Q4).

## 5. Données

- **Paramètre de type asset** (nouveau, dans `mix_modules.js`, la validation, l'UI et le Rust) : référence à un
  média de l'utilisateur (`.nam`, `.wav` d'IR), importé par le panneau d'import unique (règle 18).
- **Atome `audio_effect`** (Mes effets) : `{ chain: [module…], exposed: [{module_id, param, label}], io:
  {inputs, outputs, channels}, origin: 'user'|'assistant', revision }`, créé par `window.Atome.commit`.
- **Atome `audio_rack`** (la chaîne à la volée autonome) ou rien de persistant : question Q1.
- `fx.effect` accepte `user:<atome_id>` ; `compileMoleculeMixProgram` aplatit.

## 6. MCP (famille `audio_fx`, puis `audio_gen`)

`audio_fx.catalog` (effets intégrés + mes effets, paramètres, latence, coût), `audio_fx.inputs`,
`audio_fx.rack.{start,add,move,remove,set_param,bypass,stop}` (micro = commande confirmée),
`audio_fx.save` (chaîne → Mon effet), `audio_fx.update`, `audio_fx.delete`, `audio_fx.compose` (« un son
clair et spacieux » → l'assistant choisit et règle les briques, sauve). Les inserts de la console restent
sur `mix.module.*`, qui accepte les mêmes ids d'effets. Chaque action d'écran a sa commande (6
enregistrements habituels).

« Créer un nouvel effet avec son code » : sur l'appareil (iOS interdit toute compilation), un nouvel effet
est **une composition de briques** `atome-dsp` (graphe de primitives, §8). Écrire du **code Rust neuf**
relève du développement (une session sur le repo), pas de l'app en marche — question Q8.

## 7. Lots

| Lot | Contenu | Preuve de sortie |
| --- | --- | --- |
| **L0** | Validation des questions §9 et des maquettes, une par une | « validé » pour chaque panneau |
| **L1** | Crate `atome-dsp` : contrat processeur, lissage, FTZ, échange atomique ; branchée dans `build_effect` ; latence réelle → compensation | sonde Rust : zéro allocation (`assert_no_alloc`), latence déclarée = mesurée |
| **L2** | **Chemin direct** natif (Tauri d'abord, puis iOS) + Web AudioWorklet | aller-retour mesuré par boucle câblée (`measure_input_latency`) ; cible < 10 ms natif |
| **L3** | NAM A2 (+ A1, LSTM) + import `.nam` + paramètre asset | ESR contre NAMCore < 1e-4 ; CPU mesuré par taille ; 10 min sans décrochage |
| **L4** | Convolution (IR de cabinet), reverb FDN | idem |
| **L5** | Outil autonome + panneau + chaîne à la volée (maquettes validées) | Playwright Web, puis l'utilisateur sur l'iPad |
| **L6** | Sauver → Mon effet ; rayon Mes effets ; placement dans une tranche (aplatissement) | sonde : sauver, rouvrir, placer, écouter |
| **L7** | Famille MCP `audio_fx` + `compose` | sonde MCP bout à bout |
| **L8** | AUv3 : l'entrée de l'hôte traverse la chaîne | l'utilisateur dans AUM |
| **L9** | Générateurs : mêmes processeurs sans entrée (oscillateurs, enveloppes, synthé simple), entrée MIDI, tranche d'entrée `generator`, « Mes instruments » | à planifier après L6 sur le même modèle |
| **L11** | **Effets multi-sorties** : un module peut avoir plusieurs sorties (séparation en bandes, mid/side, gauche/droite…) ; chaque sortie part vers une ou plusieurs destinations (entrée d'une autre tranche, sortie, clé d'un module) ; la sortie principale continue la chaîne ; latence compensée sur chaque chemin | sonde Rust : bandes recombinées = signal d'origine ; bande routée vers une autre tranche alignée |
| **L12** | **Sidechain générique** : toute brique à entrée de clé (compresseur, gate, ducking…) prend sa clé d'une tranche, d'une entrée ou d'une sortie de module ; boucles autorisées par un Retour (D27) | sonde : ducking d'une tranche par une autre ; clé prise sur une bande |
| **L10** | Remplacer les effets Kira intégrés (reverb façon Freeverb…) par ceux d'`atome-dsp` | écoute A/B + CPU |

Plateformes : Web + Tauri d'abord (vérifiables ici), iOS/AUv3 ensuite (testés par l'utilisateur sur l'iPad).

## 8. Plus tard : briques primitives

Le graphe de primitives de `todo/DSP_audio_engine.md` (oscillateurs, filtres, enveloppes, LFO, délai…)
devient la matière de `audio_fx.compose` et des générateurs. Il n'est pas nécessaire pour la V1 des effets :
une chaîne série suffit. FunDSP n'est pas retenu d'office (qualité moyenne de ses reverbs, et notre contrat
processeur couvre le besoin) — à rediscuter au lot L9.

## 9. Questions à valider (une à la fois)

- **Q1** Où vit l'outil autonome, et que devient la chaîne à la volée quand on le ferme ?
- **Q2** Dépendances Rust externes (`nam-rs`, `realfft`, `fft-convolver`, toutes MIT) ou portage interne ?
- **Q3** Mon effet placé dans une tranche : copie indépendante, ou lié à la bibliothèque (le modifier change
  toutes ses instances, comme `template_link`) ?
- **Q4** Modèles NAM : bibliothèque vide au départ (import seulement), ou un modèle libre de droits fourni ?
- **Q5** Paramètres d'un Mon effet : tous ceux de ses briques, ou quelques réglages choisis à la sauvegarde ?
- **Q6** Plusieurs entrées (guitare + micro) : une chaîne par entrée côte à côte, ou une seule chaîne ?
- **Q7** Un Mon effet peut-il en contenir un autre (imbrication, aplatie à la compilation) ?
- **Q8** « Créer un plugin avec son code » : composition de briques dans l'app, et code Rust neuf seulement
  en session de développement — d'accord ?
- Puis les maquettes, une par une : M1 panneau d'un effet autonome (NAM), M2 chaîne à la volée, M3 sauver,
  M4 rayon Mes effets, M5 Mon effet dans une tranche.

## 10. Décisions

- **D0 (28 oct.)** Latence : nulle en pratique en natif (chemin direct §3.1) ; sur le Web elle est acceptée.
- **D0b** NAM = architecture A2 (avec A1/LSTM pour les anciens modèles).
- **D0c** Modèles NAM récupérés **à la volée depuis TONE3000** (recherche, téléchargement dans les médias de
  l'utilisateur, licence de chaque capture respectée, aucun modèle embarqué). À vérifier : l'API publique de
  TONE3000 et son mode d'accès (compte, clé) — sans clé écrite dans le repo.
- **D0d** Un effet avec son propre code se crée par le MCP hors iOS (Tauri, Web) puis se retrouve tel quel sur
  iOS. Conséquence technique à trancher (Q8) : iOS interdit de charger du code natif ou un JIT ; un effet
  « codé » doit donc voyager sous une forme portable.
- **D0e** Générateurs : sur le même moteur, après les effets.
- **D1 révisé (28 oct.)** Les effets vivent dans la rubrique **Capture** de l'accueil : une tuile **Effets**
  ouvre son niveau, la grille de tous les effets (tuiles, comme partout dans Capture) avec **Mes effets**.
  Jamais de palette ni de dalle posée par-dessus la grille : un niveau se pose dans les cases.
  À la réouverture de l'app, la chaîne revient branchée dans l'état laissé.
- **D2** Vérifié le 28 oct. : aucune rubrique « Effets » n'existe encore. Le Finder du mode projet a Tous,
  Images, Vidéos, Sons, Outils, Lieux, Contacts (`bevy_panel_finder_model.js#FINDER_CATEGORIES`) ; Créer › Projet
  propose mise en page, vidéo, audio, texte (`dashboard_creation_catalog.js#DASHBOARD_PROJECT_GOALS.creation`).
  À ajouter : la catégorie **Effets** au Finder du projet (type `audio_effect`) et à la bibliothèque du
  Dashboard, et **Effets** dans Créer › Projet.
- **D3** Deux latences distinctes : celle de la timeline (avance de rendu, sans importance pour un son connu)
  et celle du flux temps réel (chemin direct). Il faut une **compensation de latence** complète : chaque effet
  déclare sa latence (`latency_frames`), `mix-graph` aligne les chemins parallèles (envois, bus, effets en
  parallèle) — sa compensation existe (`graph.rs#compensation`) mais reçoit 0 aujourd'hui ; et le chemin direct
  se synchronise avec la timeline (une prise jouée à travers les effets tombe sur la trame entendue).
- **D4** Quitter le panneau ne coupe rien : la chaîne continue de jouer jusqu'à un arrêt explicite. Sur la
  tranche à la volée : toucher **IN** coupe/rétablit l'entrée ; toucher **OUT** (en bas) éteint/rallume toute la
  tranche ; chaque effet a son **bypass** (le glisser sur le côté le désactive, geste de la console existante,
  `molecule_mix_interactions.js`). Arrêter l'effet explicitement arrête tout.
- **D5** Bibliothèques externes efficaces autorisées (user, 28 oct.) : `nam-rs` (NAM A1/A2/LSTM/slimmable),
  `rustfft`/`realfft`, `fft-convolver` (ou équivalent sans latence), et les suivantes du même calibre, licence
  MIT/BSD/Apache/ISC, jamais GPL. Chacune derrière le contrat processeur d'`atome-dsp`, attribution dans
  `THIRD_PARTY_LICENSES.md`. Si une mesure montre un coût excessif (ex. `nam-rs` sans SIMD sur ARM), on ajoute
  les noyaux NEON/simd128 nécessaires (contribution amont de préférence).
- **D6** Un Mon effet placé dans une tranche reste **lié** : modifier sa composition ou son code (quels effets,
  leur ordre, le code d'un effet) touche toutes ses instances. Les **paramètres** sont propres à chaque instance.
  Dans une tranche, un combo se comporte comme **un seul effet** (une tuile) ; touché, il **se déplie** et montre
  ses effets, chacun avec ses réglages (répond aussi à Q5 : tous les paramètres de ses briques restent
  accessibles, par instance). Q4 tombe avec D0c (modèles TONE3000 à la volée).
- **D4 révisé (28 oct.)** Toucher **IN** déplie les entrées possibles et on en choisit une (une autre tranche
  peut en être une : chaîner des tranches, surtout utile au séquenceur). Toucher **OUT** déplie de même les
  sorties possibles. **Arrêter la tranche** est un geste à part, explicite : un outil Arrêt visible (préféré,
  « plus explicite ») ou un appui long — tranché sur maquette. Le bypass par effet (glissé sur le côté) reste.
- **D8** Plusieurs entrées : chaque tranche à la volée a **une** entrée (mono ou paire stéréo), choisie par IN ;
  lancer un effet sur une autre entrée crée une deuxième tranche côte à côte, chacune sa chaîne.
- **D9 (28 oct.)** Deux sortes d'effets créés après coup :
  1. **Assemblage de briques** (filtres, convolution, FFT, reverb, délais, transformations, oscillateurs pour
     les synthés) : c'est une **donnée**, pas du code ; elle tourne **en natif, à pleine vitesse, partout, iOS
     compris**, tout de suite. C'est la voie de `audio_fx.compose` (le MCP assemble) et des générateurs. Le
     graphe de primitives du §8 passe donc au premier plan, juste après les premiers effets.
  2. **Effet à code neuf** : écrit par le MCP sur Tauri ou le Web, compilé en WASM avec le contrat processeur ;
     exécuté sur Tauri/Android par compilation native au chargement (wasmtime/Cranelift, sans chaîne Rust chez
     l'utilisateur), sur le Web par le navigateur. **Sur iOS il n'apparaît qu'une fois intégré en natif à une
     build** : l'auteur peut le proposer à atome (éventuellement à la vente, boutique existante), atome le
     compile, le vérifie et l'intègre à la build suivante.
- **D10 (28 oct.) — le côté magique, règle d'interface première.** Un effet seul, c'est **l'outil seul** : on le
  touche, il s'allume (état Actif : son glyphe s'éclaire) et **ça joue tout de suite**, câblé sur l'entrée (une
  seule entrée : rien à montrer ; plusieurs : la dernière utilisée). Pas de tranche, pas d'entrée affichée.
  Le panneau (entrée, modèle, réglages) ne s'ouvre que sur demande : **appui lent** sur l'outil (ou glissé
  dessus). La tranche à la volée n'apparaît qu'à partir de **deux** effets allumés.
- **D11 (28 oct.) — la tranche à la volée = la tranche de la console existante** (validée sur capture réelle,
  `temp/effects/capture/03_fx_selected.png` : IN en haut, modules, +, OUT en bas, réglages de l'effet choisi à
  côté). Un outil seul **est déjà une tranche**, entrée et sortie masquées ; une tranche **se replie en un seul
  outil** et se déplie en tranche. Différence avec une tranche de console : celle-ci a en plus son fader de
  volume vertical (module VOL/PAN). À corriger au passage : les réglages de la tranche sont encore des barres
  horizontales, pas le slider d'outil de la charte (règle 14).
- **D12 (28 oct.) — maquette 2** : l'ordre du panneau d'un effet est validé (entrée si plusieurs, modèle
  TONE3000, puis réglages). À refaire avec des **sliders horizontaux** (comme la tranche) — en arbitrage contre
  la règle 14 de la charte (slider d'outil). **Préréglages** (presets) à prévoir sur la tranche et sur chaque
  effet, dans les deux panneaux : une liste nommée qu'on choisit et qu'on sauve, pas une rangée de valeurs.
- **D12b (29 oct.) — règle des sliders, arbitrée** : **dans un projet**, le slider est le slider d'outil (un
  bouton qui se déploie selon le mouvement : barre, colonne), partout et systématiquement. **Dans le Dashboard**
  (ses tuiles, ses panneaux, plus guidé, plus de place), les valeurs sont des **sliders horizontaux** posés
  ouverts ; le slider d'outil y reste possible mais optionnel. À écrire dans la règle 14 d'AGENTS.md au moment du
  code ; conséquence : les cartes du Dashboard qui ont des sliders d'outil (Sport…) passent aux barres.
- **D13 (28 oct.) — geste transverse à tout atome (à arbitrer avant code)** : sur un effet (tuile, tranche de
  console) **un toucher active/désactive** ; **un glissé dessus retourne la carte** (le retournement Mystic du
  Dashboard), qui grandit au passage et montre le panneau de réglages. À rendre générique (un seul owner) et à
  appliquer aux modules existants. Rencontres à trancher : glissé latéral = tourner la page d'une grille (règle
  13) ; glissé = bypass dans la console actuelle ; appui long = options (scène de l'appui long) ; D10 (appui lent
  ouvre le panneau) remplacé par ce glissé.
- **D13 tranché (29 oct.) — future règle 20 d'AGENTS.md (gestes transverses à tout atome)** :
  - trois familles d'outils, déclarées par chaque outil : **interrupteur** (effet, métronome, boucle,
    écoute) — toucher = marche/arrêt ; **action** (Supprimer, Exporter) — toucher = l'action ; **choix**
    (Couleur, Police, Taille, modèle de l'Ampli) — toucher = son panneau ;
  - **appui long** = le panneau par défaut (activation, réglages, préréglages, puis les options habituelles en
    bas : c'est la scène d'appui long existante) ; un outil peut le débrayer ; **tenir puis bouger** = déplacer
    (dans la console : réordonner la chaîne, passer un module d'une tranche à une autre) ;
  - **outil** : un glissé dans n'importe quelle direction ouvre le panneau, le même geste le referme ; dans une
    rangée qui défile (ruban du projet sur téléphone), un glissé **le long de la rangée la fait défiler**, et
    seul un glissé **en travers** ouvre le panneau (comportement déjà codé du ruban,
    `bevy_ui_main_menu_model.js` `slideDirection: 'up'`) ;
  - **tuile** : glissé vertical = bascule du panneau, glissé latéral = page de la grille (règle 13) ;
  - panneau ouvert : on le referme par le même glissé sur l'élément monté en haut, ou par ✕ ; un glissé dans le
    panneau fait défiler ses réglages ;
  - la bande du bas du Dashboard (Retour, champ, assistant) reste immuable, hors de cette règle ;
  - sécurité audio : limiteur de sortie toujours actif sur le chemin direct ; au premier allumage d'un effet sur
    une entrée micro, le panneau s'ouvre une fois (entrée, casque) ;
  - un seul owner du geste, puis revue des outils existants (classer chacun, signaler les écarts).
- **D14 (29 oct.) — panneau d'un interrupteur, design officiel de tous les marche/arrêt du Dashboard** : la
  tuile ne reste pas affichée au-dessus, c'est **elle qui grandit en panneau** (un élément ne peut être à la
  fois icône et agrandi). Au pied du panneau, une bande : à gauche le **nom** de ce qui est réglé (« Ampli »,
  pour savoir sur quel panneau on est), à droite **l'outil lui-même** (son glyphe, allumé quand il joue) qui sert
  d'interrupteur ; la ligne « Allumé » disparaît. Le reste (préréglage, entrée, modèle, sliders horizontaux)
  validé. Maquette `temp/effects/mockups/m2c_panneau_ampli.png`. À écrire dans la charte : ce nom au pied est
  une exception nommée à la règle 11 (libellé inerte en haut).
  Retouches du 29 oct. (`m2d_panneau_ampli.png`) : le nom **centré** dans la bande du pied ; le **✕ dans cette
  même bande, à gauche**, au niveau de l'interrupteur (gain de place, plus de rangée ✕ sous le panneau : place
  nommée par l'utilisateur, exception à la règle 13) ; le panneau aussi haut que son contenu. **Gaucher** : la
  bande s'inverse (interrupteur à gauche, ✕ à droite) et les sliders aussi (remplissage depuis la droite).
- **D7** (déduit du même motif) Un combo peut contenir un combo : il se déplie de même, et le compilateur aplatit
  le tout ; une boucle (un combo qui se contient) est refusée à la sauvegarde.
- **D15 (29 oct.) — M3 validé** (`m3a_deux_effets.png`, `m3b_tranche.png`) : toucher un 2e effet forme la chaîne,
  une tuile « Chaîne » allumée dans la grille (nom par défaut, puis « Chaîne 2 »…, renommable à l'enregistrement) ;
  son panneau = la vraie tranche (IN, modules, +, OUT à gauche ; réglages du module choisi à droite ; pied ✕ / nom /
  interrupteur de la chaîne). La chaîne non enregistrée vit dans Capture › Effets et revient allumée à la réouverture.
  Réordonner = appui long puis déplacer (aussi d'une tranche à l'autre).
- **D16 (29 oct.) — module Volume** : un outil Volume (gain, sans latence) se range dans la chaîne comme un effet ;
  toute tranche naît avec un Volume en dernier, avant OUT, et **c'est lui** le slider général (pas de second
  réglage) ; on peut en ajouter d'autres ailleurs. Tranche fermée = un outil + ce volume dessous (barre
  horizontale au Dashboard, tool slider en projet, D12b). Aucun module choisi : la zone de droite montre la carte
  de la tranche (entrée, sortie, volume). Maquette M3c à valider.
- **D17 (29 oct.) — appui long sur une tuile d'effet = comme toute tuile** (choix A) : l'élément monte au-dessus
  de sa liste d'options (Favori compris) ; le panneau s'ouvre par le glissé vertical. L'appui long = panneau (D13)
  ne vaut que pour les **outils**, pas pour les tuiles.
- **D18 (29 oct.) — M3d validé** (`m3c2_chaine_fermee.png`, `m3d1_tranche_repliee.png`, `m3d2_reverb_ouverte.png`) :
  trois états — chaîne fermée (tuile + volume dans sa demi-rangée basse ; un glissé qui démarre sur la barre règle le
  volume, ailleurs il tourne la page), chaîne ouverte sans outil (une seule colonne : IN, modules, +, Volume, OUT ;
  pied ✕ + interrupteur, sans nom), un module ouvert : **l'outil et son panneau ne font qu'un objet**, une seule ombre
  en contour, l'outil prend la couleur du panneau (plus de nom répété, plus de look « rempli » pour l'ouvert ;
  allumé = joue). Le panneau soudé se referme en retouchant son outil ; le ✕ du pied ferme la tranche. À écrire
  dans la charte (règles 13/14) au moment du code.
- **D19 (29 oct.) — Volume = outil qui s'agrandit** : au repos un outil comme les autres (glyphe + valeur) ; touché, il
  prend toute la hauteur de la colonne (remplace IN…OUT, le pied reste) en slider vertical long et précis ; un
  glissé sur la jauge règle, la valeur s'affiche à côté pendant le geste ; un toucher sur son glyphe le referme.
  Maquettes `m3e1_volume_outil.png`, `m3e2_volume_ouvert.png`.
  Geste (29 oct., validé) : **toucher** l'outil Volume l'ouvre et il reste ouvert (on glisse pour régler, on
  retouche pour refermer) ; **glisser directement** sur l'outil le déploie pendant le geste, on règle, on relâche et
  il se referme — comme le tool slider standard. Pour le Volume, le glissé règle donc la valeur (il n'ouvre pas de
  panneau, D13 ne s'applique pas à un outil slider).
- **D20 (29 oct.) — M4 validé** (`m4a_maintien_chaine.png`, `m4b_mes_effets.png`) : appui long sur la tuile Chaîne →
  ses options au pied (Enregistrer comme effet, Ajouter aux favoris, Renommer, Dupliquer, Supprimer) ; à
  l'enregistrement le champ du bas devient le champ du nom (prérempli « Chaîne », clavier ouvert) ; la tuile de
  Capture › Effets devient cet effet (pas une copie). Glyphe par défaut : celui du premier effet de la chaîne
  (pas d'option de plus tant que l'utilisateur ne la demande pas).
- **D21 (29 oct.) — M5 validé** (`m5a_combo_replie.png`, `m5b_combo_deplie.png`, `m5c_liseres.png`) : un combo est un
  outil dans la tranche ; touché, il déplie ses modules sur place, sans fond de groupe ; le groupe est montré par le
  **liseré `combo_rail`** (3 px, côté extérieur, une couleur par niveau, l'enfant coupe le parent). Inscrit dans la
  charte (AGENTS.md règle 15) ; le même liseré marque le contenu d'un accordéon ouvert (à appliquer au brick
  `bevy_panel_accordion_direction.js` et à ajouter à `DESIGN_CHARTER_BORDERS`). Libellé d'outil ≤ 6 lettres : un
  effet enregistré gagne un nom court (« Guitar »), sinon coupé avec « … ».
- **Maquettes terminées le 29 oct.** — tout est validé ; prochaine étape : le code, lot L1 (crate `atome-dsp`).
- **D22 (29 oct.) — TONE3000 : un seul compte « Atome » pour tout le monde** (remplace D0c sur ce point) : la clé ou
  les identifiants sont dans `./private/tone3000.txt` (ignoré par git), lus côté serveur seulement ; le serveur
  télécharge les modèles pour les utilisateurs ; jamais de clé dans le dépôt ni envoyée au client.
- **D23 (29 oct.) — réponses aux 10 questions** :
  1. Windows : **latence minimale**, mode exclusif (WASAPI exclusif / ASIO) par défaut ; bloquer la carte pour les
     autres applis est accepté.
  3. Modèles NAM = atomes de la bibliothèque, synchronisés, hors ligne ; choix depuis la ligne « modèle » de l'Ampli
     (liste avec recherche, motif standard).
  4. Réponses impulsionnelles : jeu CC0 livré + panneau d'import unique + TONE3000 (compte Atome).
  5. **Une seule tranche partout** (Dashboard et projet) : ancienne ou nouvelle à trancher sur maquette.
  6. AUv3 : traite aussi le son de l'appli hôte (effet), en plus de l'instrument MIDI.
  7. Tuile « Instruments » dans Capture, mêmes motifs — **elle viendra avec la tâche générateurs**.
  8. **Pas de synthé de test** (tranché) : un synthé jetable serait non standard et à supprimer. Les générateurs
     seront une tâche à part, par assemblage de briques (oscillateur, enveloppe, filtre…) comme la tranche. Dans ce
     chantier, seules les briques DSP de base (oscillateur, enveloppe) entrent dans `atome-dsp` (L1), vérifiées par
     sonde ; L9 sort du lot.
  9. Jeu : MIDI, séquenceur, timeline ; clavier à l'écran = plus tard, avec maquette.
  10. Anciens effets convertis automatiquement à l'ouverture, puis ancien code supprimé.
- **D24 (29 oct.) — Q5 : la nouvelle tranche (B) partout**, Dashboard et projet ; l'ancienne console disparaît.
  Dans un projet, un effet ouvert garde le **panneau soudé standard** (cartes : préréglage, puis ses réglages en tool
  sliders deux par rangée, D12b) ; les tranches voisines se décalent, jamais recouvertes. Maquette
  `m6b3_console_reverb_panneau.png` (à valider).
- **Volume déployé gradué** (à valider, `m3f_volume_gradue.png`) : la valeur en haut à la place du haut-parleur
  (supprimé), la graduation dB sur le côté (+12…−∞), l'outil déployé prend la largeur de la tranche (deux outils).
- **D25 (29 oct.) — `m3f_volume_gradue.png` et `m6b3_console_reverb_panneau.png` validés.** Toutes les questions et
  maquettes sont closes ; feu vert pour coder tous les lots (L1–L8, L10 ; L9 réduit aux briques DSP de base).
- **D26 (29 oct.) — routage** (confirmé par l'utilisateur) : un générateur (synthé) est un **nœud d'entrée** de
  tranche (choisi au IN comme un micro). Le routage est un **graphe** : la sortie d'une tranche peut aller vers une
  autre tranche, une tranche peut être choisie comme entrée d'une autre, et un **nœud « tranche »** insère une
  tranche entière comme module dans une autre (insert). Plusieurs sorties et envois possibles. ~~Toute boucle est
  refusée à la connexion~~ — **erreur de transcription, corrigée par D27** ; la compensation de latence
  couvre tous les chemins parallèles (D3).
- **D27 (29 oct.) — les boucles de retour sont AUTORISÉES** (validé deux fois par l'utilisateur ; le refus écrit en
  D26 était faux). Entre briques et entre tranches. Une boucle se ferme par un **Retour** qui lit le bloc précédent
  (128 trames fixes, rendu déterministe), protégé par un limiteur et une garde contre les valeurs non finies ;
  signalée dans le design, jamais par pop-up ni notification. À changer dans le code : `graph.rs#dependency_order`
  (« mix routing loop ») et `kernel/mix_routing.js#findCycle`, qui refusent encore toute boucle.
- **D28 (29 oct.) — défauts à corriger dans L1** (relevés par l'audit du chantier synthé, l'utilisateur demande
  de les corriger) : (1) `graph.rs:252` saute un module dont le `try_lock` échoue (son sec, ou trou pour un
  générateur) → aucun verrou dans le rendu ; (2) ni FTZ/DAZ ni test « zéro allocation » ; le Web alloue des `Vec`
  à chaque pompe (`audio-wasm/src/scheduled_backend.rs#render_ahead`) ; (3) `mix.module.add`
  (`timeline_tool_contract.js:19-20`) n'accepte pas `type: 'dsp'` : le MCP ne peut pas poser une brique.
- **D29 (29 oct.) — multi-sorties et sidechain (L11, L12)** : un effet à bandes garde **par défaut chaque bande dans
  la tranche** (rien ne se perd) ; une bande peut être envoyée vers une autre tranche, elle quitte alors la tranche.
  La destination d'une sortie en plus et la **clé** d'un sidechain se choisissent **dans le panneau soudé** du module :
  carte « Sorties » (une ligne par sortie) et ligne « Clé », qui déplient la même liste que IN/OUT (motif existant).
  Dans la colonne de la tranche, **rien** ne le signale (zen). Premiers effets : Bandes 2/3/4 (Linkwitz-Riley),
  compresseur à clé, ducking, gate à clé, Mid/Side et Gauche/Droite.
