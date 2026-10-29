# Effets et générateurs audio — plan à suivre (28 oct. 2026)

Statut : **plan, rien n'est codé.** Questions de conception à valider une à une (§9), maquettes
panneau par panneau, code seulement après la dernière réponse.

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
- **D13 (28 oct.) — geste transverse à tout atome (à arbitrer avant code)** : sur un effet (tuile, tranche de
  console) **un toucher active/désactive** ; **un glissé dessus retourne la carte** (le retournement Mystic du
  Dashboard), qui grandit au passage et montre le panneau de réglages. À rendre générique (un seul owner) et à
  appliquer aux modules existants. Rencontres à trancher : glissé latéral = tourner la page d'une grille (règle
  13) ; glissé = bypass dans la console actuelle ; appui long = options (scène de l'appui long) ; D10 (appui lent
  ouvre le panneau) remplacé par ce glissé.
- **D7** (déduit du même motif) Un combo peut contenir un combo : il se déplie de même, et le compilateur aplatit
  le tout ; une boucle (un combo qui se contient) est refusée à la sauvegarde.
