# Méta-prompt — Architecture audio interne pour atome

Tu es un architecte logiciel senior spécialisé en audio temps réel, Rust, DSP, moteurs modulaires et IA créative.

Je veux que tu génères un **prompt final** qui servira à produire une **fiche technique d’architecture complète** pour intégrer un moteur DSP modulaire dans le projet **atome**.

## Contexte général

- Le nom du projet s’écrit toujours **atome** en minuscules.
- L’objectif est de créer des **plugins internes à atome**.
- Il ne faut pas ajouter de formats de plugins externes comme VST, AU, AUv3, CLAP ou LV2.
- atome possède déjà sa propre couche de compatibilité externe : il ne faut donc pas créer de doublons.
- L’architecture doit rester **simple, cohérente, modulaire et sans empilement inutile de frameworks**.

## Base audio actuelle

- **CPAL** : I/O audio bas niveau.
- **Kira** : utilisé au minimum pour :
  - mixer,
  - timing,
  - horloge,
  - routing,
  - gestion générale du moteur audio.
- Les effets intégrés de Kira ne doivent pas constituer la base créative du système DSP.
- Il faut éviter tout double emploi avec Kira.

## Nouvelle couche DSP

Créer un crate interne nommé :

`atome_dsp`

Son rôle :

- encapsuler **FunDSP** ;
- fournir les briques DSP atomiques utilisées par atome ;
- permettre l’ajout de DSP personnalisés écrits directement en Rust ;
- permettre de combiner dynamiquement ces briques pour fabriquer :
  - effets,
  - synthétiseurs,
  - générateurs,
  - modulations,
  - traitements audio,
  - chaînes de sound design ;
- rester totalement interne à atome.

## Pilotage MCP

Chaque fonction DSP utile doit pouvoir être exposée à MCP afin qu’une IA puisse :

- inspecter les DSP disponibles ;
- connaître leurs entrées, sorties et paramètres ;
- composer un graphe DSP ;
- modifier un graphe ;
- créer une chaîne d’effets ;
- construire un synthétiseur ;
- générer des routings ;
- connecter des modulateurs ;
- remplacer ou reconfigurer des nodes ;
- sauvegarder et rappeler les configurations ;
- créer de nouveaux modules DSP internes à atome.

L’objectif est qu’une IA puisse construire à la demande des effets et instruments complexes à partir de briques DSP simples.

## Architecture attendue

Le prompt final doit exiger une description précise des couches suivantes :

1. CPAL
2. Kira
3. atome_dsp
4. FunDSP
5. couche MCP
6. système interne de graphes DSP
7. système de paramètres
8. système de modulation
9. système de presets/configurations
10. gestion du temps réel

Le document doit clairement expliquer les responsabilités de chaque couche et éviter tout chevauchement fonctionnel.

## Format interne des nodes

Définir un format de node DSP interne avec au minimum :

- `id`
- `type`
- entrées audio
- sorties audio
- entrées de contrôle
- sorties de contrôle
- paramètres
- valeurs min/max
- unités
- valeurs par défaut
- fréquence de mise à jour
- coût CPU estimé
- latence
- état interne éventuel
- schéma MCP
- métadonnées
- possibilités de modulation

Prévoir une API permettant aux DSP personnalisés de respecter exactement cette interface.

## Briques DSP primitives

Le système doit privilégier des **briques DSP élémentaires et combinables**, et non des effets tout faits.

Le prompt final doit demander d’identifier et organiser les primitives nécessaires pour couvrir notamment :

### Signal

- gain
- addition
- multiplication
- mix
- split
- inversion
- clamp
- normalisation
- DC offset
- waveshaping

### Oscillateurs

- sine
- triangle
- saw
- square
- pulse
- noise
- wavetable
- phase
- sync

### Filtres

- low-pass
- high-pass
- band-pass
- notch
- shelving
- peak
- state-variable filter
- biquad
- one-pole
- ladder si pertinent
- all-pass

### Dynamique

- envelope follower
- peak detector
- RMS
- compressor primitives
- limiter primitives
- gate
- expander

### Saturation / non-linéarités

- soft clip
- hard clip
- tanh
- polynomial waveshaping
- diode-style nonlinearities
- asymmetrical shaping
- fold
- rectify

### Temps

- sample delay
- delay line
- fractional delay
- feedback
- interpolation
- tap delay
- circular buffer

### Modulation

- LFO
- envelope
- ADSR
- slew limiter
- sample & hold
- random
- step generator
- smoothing

### Spatialisation

- pan
- balance
- stereo width
- mid/side
- crossfeed
- matrices de routing

### Analyse

- peak
- RMS
- zero crossing
- FFT si nécessaire
- pitch detection si pertinent
- envelope extraction

### Synthèse

Le système doit permettre de composer les primitives pour créer :

- synthèse soustractive
- FM
- AM
- ring modulation
- wavetable
- additive
- granular si pertinent
- physical modelling si pertinent

Le document ne doit pas transformer ces catégories en effets monolithiques si elles peuvent être construites proprement avec les primitives.

## Extensibilité

Décrire comment ajouter facilement un DSP personnalisé dans `atome_dsp`.

Le système doit permettre :

- création d’un nouveau node Rust ;
- déclaration automatique de ses paramètres ;
- enregistrement dans le catalogue DSP ;
- exposition MCP ;
- documentation automatique ;
- tests automatisés ;
- benchmark ;
- disponibilité immédiate dans le graphe atome.

Il faut proposer une interface ou un trait Rust minimal permettant de créer de nouveaux nodes.

## Temps réel et performances

Le prompt final doit imposer des règles strictes audio temps réel :

- zéro allocation dans le callback audio ;
- aucun lock bloquant dans le thread audio ;
- aucun accès réseau ;
- aucun accès disque ;
- aucune opération imprévisible ;
- buffers préalloués ;
- structures cache-friendly ;
- SIMD lorsque pertinent ;
- traitement par blocs lorsque pertinent ;
- contrôle précis des dénormalisés ;
- gestion de la latence ;
- benchmark systématique ;
- profilage CPU.

Les modifications complexes du graphe doivent être préparées hors du thread audio.

Le passage vers un nouveau graphe doit utiliser une stratégie sûre du type :

- atomic swap ;
- double buffering ;
- graph snapshot ;
- lock-free message passing ;
- autre mécanisme équivalent pertinent.

Le document doit proposer la meilleure approche pour atome.

## MCP et mutation des graphes

Décrire comment MCP peut demander :

- création d’un node ;
- suppression d’un node ;
- connexion ;
- déconnexion ;
- modification de paramètre ;
- modulation ;
- duplication ;
- remplacement ;
- création complète d’un graphe.

Les commandes MCP ne doivent jamais modifier directement des structures sensibles utilisées par le callback audio.

Prévoir une séparation claire entre :

- control thread ;
- graph builder ;
- audio thread.

## Exemples obligatoires

Le prompt final doit demander au document de montrer comment construire uniquement à partir des primitives :

### Saturation

Exemple :

input  
→ gain  
→ waveshaper  
→ filtre  
→ gain de sortie

### Delay

input  
→ delay line  
→ feedback  
→ filtre dans la boucle  
→ mix dry/wet

### Synthétiseur

oscillateur  
→ pitch modulation  
→ filtre  
→ enveloppe  
→ amplitude  
→ sortie

### Effet modulé

input  
→ delay court  
→ modulation LFO  
→ feedback  
→ mix

Ces exemples doivent montrer comment MCP pourrait générer automatiquement les graphes.

## Organisation Rust

Le prompt final doit demander une proposition d’organisation des crates/modules, par exemple :

```text
atome_audio
├── io
│   └── cpal
├── engine
│   └── kira
├── dsp
│   ├── graph
│   ├── nodes
│   ├── modulation
│   ├── parameters
│   ├── registry
│   └── runtime
├── mcp
│   └── audio
└── tests
```

Cette structure est indicative : l’IA doit proposer une meilleure organisation si nécessaire.

## Benchmarks

Définir une stratégie de benchmark réelle sur mobile et desktop.

Tester notamment :

- nombre maximal de nodes ;
- nombre de voix ;
- polyphonie ;
- chaînes longues ;
- modulation massive ;
- oversampling ;
- taille des buffers ;
- consommation CPU ;
- consommation mémoire ;
- latence ;
- glitchs / xruns.

Prévoir au minimum :

- iOS ARM64 ;
- macOS Apple Silicon ;
- desktop ;
- Web/WASM si FunDSP et l’architecture le permettent sans duplication excessive.

## Analyse de Kira

Le prompt final doit demander explicitement :

- ce qu’il faut conserver de Kira ;
- ce qu’il ne faut pas utiliser ;
- ce qui ferait doublon avec `atome_dsp` ;
- s’il faut désactiver certaines features Cargo ;
- si un fork de Kira est réellement nécessaire ou inutile ;
- dans quelles circonstances un fork deviendrait pertinent.

Ne jamais proposer un fork uniquement pour supprimer du code qui n’est pas utilisé au runtime.

## Analyse de FunDSP

Le prompt final doit demander une vérification précise de :

- architecture ;
- performances ;
- allocations ;
- compatibilité temps réel ;
- ergonomie Rust ;
- possibilité d’écrire des nodes personnalisés ;
- graphes dynamiques ;
- SIMD ;
- WASM ;
- ARM64 ;
- licence ;
- maintenance ;
- activité du projet ;
- qualité du code ;
- limitations éventuelles.

Si FunDSP n’est finalement pas adapté à une exigence essentielle, le document doit le signaler clairement plutôt que forcer son utilisation.

Toute alternative proposée devra être justifiée par un avantage majeur et ne devra pas créer un empilement de frameworks.

## Principe architectural fondamental

Le système recherché est :

```text
CPAL
  ↓
Kira minimal
  ↓
atome_dsp
  ↓
FunDSP + DSP spécifiques atome
  ↓
graphe audio interne
  ↑
MCP / IA
```

MCP décrit et orchestre.

`atome_dsp` contrôle l’architecture DSP.

FunDSP fournit les primitives mathématiques et DSP.

Kira fournit uniquement les fonctions moteur réellement utiles.

CPAL communique avec le matériel.

Il ne faut jamais multiplier les moteurs audio ou bibliothèques sans nécessité démontrée.

## Livrable demandé au prompt final

Le prompt final généré doit demander la production d’un document comprenant :

1. architecture générale ;
2. responsabilités de chaque couche ;
3. diagramme textuel ;
4. architecture Rust ;
5. format des nodes ;
6. catalogue des primitives DSP ;
7. mécanisme de graphe ;
8. mutation temps réel ;
9. interface MCP ;
10. API d’extension DSP ;
11. exemples de graphes ;
12. stratégie de performance ;
13. stratégie de tests ;
14. benchmarks ;
15. analyse Kira ;
16. analyse FunDSP ;
17. risques techniques ;
18. décisions à prendre ;
19. MVP ;
20. feuille de route d’intégration.

Inclure :

- pseudo-code Rust ;
- exemples d’API ;
- structures de données ;
- schémas textuels ;
- recommandations concrètes.

Le résultat doit être une **spécification exploitable directement par une IA de développement ou par Codex pour implémenter progressivement le moteur audio d’atome**.
