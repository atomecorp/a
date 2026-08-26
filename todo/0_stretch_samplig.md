# stretch_samplig.md

## Cahier des charges — moteur de sampling polyphonique avec time-stretch zplane ELASTIQUE

**Projet cible :** AEF / atome  
**Statut :** spécification d’intégration directe  
**Objectif :** intégrer un moteur de sampling polyphonique capable de jouer plusieurs voix simultanément avec time-stretch et pitch-shift en temps réel, en utilisant prioritairement le SDK **zplane ELASTIQUE PRO**, sans couche temporaire basée sur Rubber Band ou une autre bibliothèque.

---

# 1. Objectif fonctionnel

Le moteur doit permettre :

- le chargement d’un ou plusieurs samples audio ;
- leur déclenchement simultané en polyphonie ;
- le changement de hauteur indépendamment de la durée ;
- le changement de durée/tempo indépendamment de la hauteur ;
- le fonctionnement en temps réel ;
- le maintien d’une latence suffisamment faible pour le jeu instrumental ;
- le choix du mode de traitement ELASTIQUE exposé par le SDK ;
- l’utilisation des modes les plus performants pour le live et des modes les plus qualitatifs lorsque la charge CPU le permet ;
- la synchronisation musicale avec le moteur temporel d’AEF ;
- l’intégration dans l’architecture existante d’AEF sans recréer une seconde logique audio parallèle ;
- une architecture compatible avec le futur moteur de sampler d’atome.

Le comportement cible doit se rapprocher d’un sampler moderne de type BeatMaker 3 / MPC / Kontakt pour le déclenchement des voix, avec time-stretch indépendant par voix.

---

# 2. Technologie retenue

## 2.1 SDK principal

Utiliser :

**zplane ELASTIQUE PRO SDK**

Le choix du package PRO est volontaire : le package PRO donne également accès à **ELASTIQUE EFFICIENT** et à deux modes monophoniques via une API commune selon la documentation actuelle de zplane.

Le moteur ne doit donc pas être conçu autour d’un seul algorithme fixe.

L’abstraction AEF devra permettre à une voix de sélectionner un mode de traitement sans modifier l’architecture générale du moteur.

---

# 3. Capacités ELASTIQUE à exploiter

Selon la documentation zplane actuelle :

## ELASTIQUE PRO

- time-stretch temps réel ;
- pitch-shift temps réel ;
- traitement généraliste haute qualité ;
- traitement polyphonique ;
- conservation des formants disponible ;
- cohérence de phase entre canaux ;
- stabilité temporelle ;
- traitement sample-accurate ;
- jusqu’à 48 canaux ;
- fréquences d’échantillonnage annoncées : 32 kHz à 384 kHz ;
- optimisations CPU incluant SSE et NEON.

## ELASTIQUE EFFICIENT

- time-stretch temps réel ;
- traitement destiné notamment aux contenus polyphoniques complexes ;
- charge CPU plus faible que PRO ;
- possibilité de fractionner le traitement pour réduire les pics de charge aux faibles latences ;
- possibilité de réduire la bande passante pour diminuer encore la charge CPU.

## Conséquence pour AEF

Ne pas construire un système artificiel « qualité / moyen / mobile » avant lecture exacte du SDK reçu.

Créer plutôt une abstraction générique :

```text
StretchMode
    - Pro
    - Efficient
    - MonoMode1
    - MonoMode2
```

Puis mapper les noms réellement disponibles dans la version du SDK livrée par zplane.

L’interface utilisateur pourra ensuite présenter des noms simples :

```text
Quality
Balanced
Live
```

mais le mapping réel doit être défini à partir des capacités exactes du SDK reçu.

---

# 4. Principe de polyphonie

Une voix de sampler représente une lecture indépendante.

Chaque voix doit posséder au minimum :

```text
Voice
    id
    sample
    playback_position
    source_sample_rate
    output_sample_rate

    pitch
    stretch_ratio
    target_bpm
    source_bpm

    gain
    pan
    velocity

    loop_start
    loop_end
    loop_enabled

    attack
    decay
    sustain
    release

    stretch_engine_instance
    stretch_mode

    state
```

États possibles :

```text
Idle
Starting
Playing
Releasing
Stopped
```

---

# 5. Instance ELASTIQUE par voix

Hypothèse d’architecture de départ :

**une instance de traitement indépendante par voix active nécessitant du time-stretch.**

Cette décision doit toutefois être validée avec zplane lors de l’accès au SDK.

Questions précises à poser au support :

1. Une instance ELASTIQUE doit-elle être créée par voix de sampler ?
2. Une instance peut-elle être réutilisée entre plusieurs déclenchements ?
3. Existe-t-il une architecture recommandée spécifiquement pour les samplers polyphoniques ?
4. Quel est le coût mémoire moyen d’une instance PRO ?
5. Quel est le coût mémoire moyen d’une instance EFFICIENT ?
6. Une instance inactive peut-elle être conservée dans un pool ?
7. La création/destruction d’instance est-elle autorisée sur le thread audio ?
8. Quelles fonctions du SDK sont garanties real-time safe ?
9. Existe-t-il une limite contractuelle ou technique au nombre d’instances simultanées ?
10. zplane possède-t-il un exemple de sample player polyphonique ?

Aucune hypothèse ne doit remplacer les réponses du SDK/support sur ces points.

---

# 6. Pool de voix

Le moteur doit utiliser un **voice pool**.

Ne pas créer et détruire les objets de voix pendant le rendu audio si cela peut provoquer allocation mémoire, lock ou latence non déterministe.

Exemple :

```text
VoicePool
    Voice[0]
    Voice[1]
    Voice[2]
    ...
    Voice[N]
```

Valeur initiale recommandée pour les tests :

```text
32 voix
```

mais **32 n’est pas une limite produit**.

Le moteur devra permettre de modifier cette limite selon plateforme et mémoire disponible.

Cibles de validation :

- 8 voix simultanées ;
- 16 voix ;
- 32 voix ;
- 64 voix si la plateforme le permet.

---

# 7. Voice stealing

Lorsque toutes les voix sont utilisées, prévoir une stratégie déterministe.

Priorité proposée :

1. voix déjà terminée ;
2. voix en release et presque inaudible ;
3. voix la plus ancienne ;
4. éventuellement voix de plus faible amplitude.

Ne pas interrompre arbitrairement une voix forte récente.

Le moteur doit permettre de changer de stratégie ultérieurement.

---

# 8. Thread audio

Le callback audio doit rester déterministe.

Éviter dans le thread temps réel :

- allocation mémoire ;
- accès disque ;
- parsing ;
- JSON ;
- attente mutex ;
- accès réseau ;
- logs lourds ;
- création de fichiers ;
- destruction complexe d’objets ;
- conversions de format inutiles ;
- chargement de sample ;
- travail UI.

Les commandes UI doivent être converties en messages légers destinés au moteur audio.

Exemple :

```text
UI / JS
   ↓
Command queue
   ↓
Native audio engine
   ↓
Voice manager
   ↓
ELASTIQUE
   ↓
Mixer
   ↓
Audio output
```

---

# 9. Chargement des samples

Le sample doit être préparé avant le déclenchement si possible.

Pipeline :

```text
file
↓
decode
↓
normalisation du format interne
↓
metadata
↓
sample buffer/cache
↓
voice engine
```

Metadata minimale :

```text
duration
sample_rate
channels
frame_count
source_bpm
root_note
loop_start
loop_end
```

Les informations BPM/root note peuvent être absentes.

---

# 10. Relation pitch / stretch

Le moteur doit séparer explicitement :

```text
pitch_ratio
```

et :

```text
time_ratio
```

Exemples :

Changer la durée sans modifier la hauteur :

```text
pitch_ratio = 1.0
time_ratio = valeur variable
```

Transposer de +12 demi-tons sans modifier la durée :

```text
pitch_ratio = 2.0
time_ratio = 1.0
```

Les deux paramètres doivent pouvoir évoluer simultanément.

---

# 11. Synchronisation au tempo AEF

Le moteur doit recevoir le tempo du moteur principal AEF.

Ne pas créer une horloge musicale indépendante dans le module ELASTIQUE.

Relation type :

```text
stretch_ratio = source_bpm / target_bpm
```

ou son inverse selon la convention exacte du SDK.

Cette convention devra être vérifiée dans la documentation livrée avec le SDK.

Le moteur devra gérer :

- tempo fixe ;
- changement de tempo en lecture ;
- automation de tempo ;
- démarrage au prochain beat ;
- démarrage à la prochaine mesure ;
- repositionnement transport ;
- loop ;
- seek.

---

# 12. Sample-accurate scheduling

Le déclenchement d’une voix ne doit pas dépendre du rafraîchissement UI.

Les événements doivent être horodatés dans le moteur audio.

Exemple :

```text
NoteOn
    voice
    target_sample_position
```

Le moteur doit pouvoir déclencher un sample à l’intérieur d’un bloc audio et pas uniquement au début du buffer.

---

# 13. Pitch instrumental

Pour un sampler chromatique :

```text
semitones = played_note - root_note
pitch_ratio = 2 ^ (semitones / 12)
```

La transposition doit pouvoir être combinée au time-stretch.

Exemple :

sample original :

```text
C3
120 BPM
```

lecture :

```text
G3
95 BPM
```

Le moteur doit produire simultanément :

```text
pitch → G3
duration → alignée sur 95 BPM
```

---

# 14. Formants

Exposer le contrôle de conservation des formants lorsque le mode ELASTIQUE choisi le permet.

Paramètres AEF prévus :

```text
formant_preserve: true/false
formant_shift
```

Ne pas simuler un contrôle non fourni par le SDK.

Le mapping exact sera établi après réception de l’API.

---

# 15. Looping

Chaque voix doit pouvoir fonctionner avec :

```text
loop_enabled
loop_start
loop_end
```

Prévoir ultérieurement :

```text
loop_crossfade
loop_direction
```

Le moteur doit vérifier comment ELASTIQUE doit être réinitialisé ou alimenté lorsqu’un buffer revient au début d’une boucle.

Le loop ne doit pas provoquer :

- click ;
- désynchronisation ;
- reset audible du stretch ;
- perte de phase inattendue.

---

# 16. Trim / start / end

Le sample doit pouvoir définir :

```text
sample_start
sample_end
```

indépendamment du fichier audio original.

Le trim doit fonctionner avant le moteur de stretch du point de vue logique.

---

# 17. Reverse

Prévoir l’architecture pour la lecture inverse même si elle n’est pas nécessaire à la première intégration.

Ne pas supposer qu’ELASTIQUE accepte directement un flux inversé.

Si nécessaire :

```text
sample cache reversed
→ ELASTIQUE
```

---

# 18. Enveloppe

Chaque voix doit posséder une enveloppe indépendante.

Minimum :

```text
Attack
Decay
Sustain
Release
```

L’enveloppe doit être appliquée à la voix avant mix final.

---

# 19. Vélocité

La vélocité MIDI/AEF doit pouvoir agir sur :

```text
gain
```

et ultérieurement éventuellement :

```text
filter
sample layer
sample selection
```

---

# 20. Architecture native / JS

Le DSP ELASTIQUE est fourni sous forme de bibliothèques natives et d’headers C/C++.

Le traitement ELASTIQUE doit donc vivre dans la couche native.

Architecture générale souhaitée :

```text
AEF JS API
     ↓
AEF audio bridge
     ↓
Native sampler engine
     ↓
Voice manager
     ↓
ELASTIQUE SDK
     ↓
Native mixer/audio engine
```

Le JS ne doit jamais traiter lui-même les blocs audio ELASTIQUE.

---

# 21. API AEF à exposer

API conceptuelle minimale :

```text
sampler.load(sampleId, path)

sampler.play(sampleId, options)

sampler.stop(voiceId)

sampler.stopAll()

sampler.setPitch(voiceId, semitones)

sampler.setStretch(voiceId, ratio)

sampler.setTempo(voiceId, bpm)

sampler.setMode(voiceId, mode)

sampler.setLoop(voiceId, start, end)

sampler.setEnvelope(voiceId, adsr)

sampler.setGain(voiceId, gain)

sampler.setPan(voiceId, pan)
```

Cette API est **conceptuelle**.

Elle ne doit pas être injectée telle quelle si AEF possède déjà une convention pour :

- objets ;
- propriétés ;
- messages ;
- commandes ;
- événements ;
- audio nodes ;
- transport.

Il faut raccorder cette fonctionnalité à la logique AEF existante.

---

# 22. Points AEF à identifier avant codage du raccord final

Avant de modifier l’architecture AEF, identifier précisément :

## Audio

- où se trouve le callback audio principal ;
- format interne des buffers ;
- planar ou interleaved ;
- float32 / float64 ;
- nombre de frames par callback ;
- sample rate ;
- gestion multicanal ;
- resampling actuel ;
- moteur de mixage ;
- graphe audio éventuel.

## Transport

- source du tempo ;
- source de la position musicale ;
- représentation beat/bar/tick ;
- mécanisme de scheduling ;
- loop global ;
- seek ;
- changement de tempo.

## Bridge

- manière actuelle d’appeler le natif depuis JS ;
- système d’événements natif → JS ;
- contraintes Tauri ;
- contraintes WKWebView ;
- contraintes AUv3.

## Objets AEF

- représentation actuelle d’un sample ;
- représentation actuelle d’une piste ;
- représentation actuelle d’un clip ;
- propriété playback ;
- propriété loop ;
- propriété trim ;
- propriété pitch ;
- système de serialization.

Ces informations doivent être lues dans le code AEF réel avant raccord.

---

# 23. Plateformes

Cibles prévues :

```text
macOS
iOS / iPadOS
AUv3
Tauri macOS
Tauri iOS / WKWebView
```

Pour chaque SDK fourni par zplane, confirmer explicitement :

- architecture arm64 iOS ;
- architecture arm64 macOS ;
- éventuel x86_64 macOS si nécessaire ;
- simulateur iOS ;
- linkage statique ;
- Bitcode si encore pertinent pour la version de toolchain utilisée ;
- App Store compatibility ;
- AUv3 compatibility ;
- restrictions de redistribution.

---

# 24. Important — licence et open source

AEF/atome étant open source, **ne jamais placer le SDK ELASTIQUE, ses bibliothèques binaires propriétaires ou ses headers confidentiels dans le dépôt public sans autorisation écrite de zplane.**

Architecture recommandée :

```text
public repository
    adapter API
    interfaces
    build hooks

private/local SDK directory
    zplane binaries
    protected headers if required
```

Exemple :

```text
third_party/
    zplane/
        README.md
        .gitignore
```

avec SDK réel absent du dépôt Git public.

La compatibilité précise entre le modèle open-source d’atome et la licence commerciale zplane doit être confirmée explicitement avec zplane avant distribution.

---

# 25. Acquisition du SDK

Société :

**zplane.development GmbH & Co KG**  
Goerzallee 311  
14167 Berlin  
Germany

Téléphone :

```text
+49 30 854 091 50
```

Email général/licensing publié par zplane :

```text
info@zplane.de
```

Site licensing :

```text
https://licensing.zplane.de/
```

Page ELASTIQUE :

```text
https://licensing.zplane.de/technology
```

Page licensing :

```text
https://licensing.zplane.de/licensing
```

---

# 26. Version d’évaluation

Selon la page licensing actuelle de zplane :

**chaque livraison de SDK possède par défaut une période d’évaluation de 3 semaines.**

Pendant cette période, le contrat peut être résilié sans obligations financières supplémentaires selon les conditions publiées par zplane.

Le SDK livré comprend normalement :

- bibliothèques statiques nécessaires ;
- headers C/C++ ;
- documentation SDK ;
- exemples de code C/C++ ;
- support d’intégration.

Il ne s’agit donc pas simplement d’une démo audio : il faut demander **une livraison du SDK ELASTIQUE PRO pour évaluation**.

---

# 27. Email à envoyer à zplane

## Subject

```text
ELASTIQUE PRO SDK evaluation request for AEF / atome polyphonic sampler
```

## Message

```text
Hello,

I am developing AEF / atome, an audio and creative framework targeting macOS and iOS/iPadOS, including AUv3 and native audio applications.

We want to integrate zplane ELASTIQUE directly into our native sampler engine for real-time polyphonic time-stretching and pitch-shifting.

Our intended use case is an interactive musical sampler where multiple independent sample voices can be triggered simultaneously while each voice can have independent pitch and time-stretch parameters.

We would like to evaluate the ELASTIQUE PRO SDK, including access to ELASTIQUE EFFICIENT through the same SDK/API.

Could you please provide information about:

- access to the 3-week SDK evaluation;
- iOS/iPadOS arm64 support;
- macOS Apple Silicon support;
- AUv3 compatibility;
- recommended architecture for a polyphonic sample player;
- whether one ELASTIQUE processing instance is normally used per sampler voice;
- real-time-safe API calls;
- recommended strategy for instance pooling/reuse;
- expected memory footprint per active instance;
- any practical limits on simultaneous instances;
- licensing conditions for an application whose main framework/source code is open source while the proprietary ELASTIQUE SDK itself would not be redistributed in the public source repository;
- commercial licensing model and expected royalties/fees;
- App Store distribution conditions.

The initial target is a native low-latency sampler engine with at least 16–32 simultaneous stretched voices on modern Apple Silicon devices, with scalability according to device performance.

Please also let us know if you have a sample-player or polyphonic integration example available in the SDK.

Best regards
```

---

# 28. Questions commerciales obligatoires

Avant engagement définitif, obtenir par écrit :

- coût initial éventuel ;
- royalties ;
- minimum annuel éventuel ;
- minimum garanti éventuel ;
- nombre de produits autorisés ;
- nombre de plateformes autorisées ;
- iOS inclus ou non ;
- macOS inclus ou non ;
- AUv3 considéré comme produit séparé ou non ;
- build standalone considéré comme produit séparé ou non ;
- distribution App Store ;
- TestFlight ;
- builds internes ;
- CI/CD ;
- nombre de développeurs autorisés ;
- redistribution dans binary builds ;
- contraintes open source ;
- obligation éventuelle d’afficher la marque zplane/ELASTIQUE ;
- procédure de renouvellement/upgrade du SDK.

La page publique indique que les tarifs dépendent notamment :

- du nombre de produits ;
- du nombre de plateformes ;
- du marché visé ;

et que le modèle est normalement basé sur des royalties par unité vendue, tout en restant négociable.

---

# 29. Intégration build

Créer une couche indépendante :

```text
audio/stretch/
```

ou équivalent AEF existant.

Structure conceptuelle :

```text
stretch/
    StretchEngine
    StretchVoice
    StretchMode
    ZplaneEngine
```

Ne jamais appeler directement les classes zplane depuis toute l’application.

Seul :

```text
ZplaneEngine
```

ou son équivalent doit connaître le SDK propriétaire.

Cela permet :

- isolation du code propriétaire ;
- tests ;
- maintenance ;
- remplacement éventuel ;
- compilation sans SDK pour certains builds ;
- dépôt public propre.

---

# 30. Interface C++ interne proposée

Conceptuellement :

```cpp
class StretchProcessor {
public:
    virtual void prepare(double sampleRate,
                         int maxBlockSize,
                         int channels) = 0;

    virtual void reset() = 0;

    virtual void setTimeRatio(double ratio) = 0;
    virtual void setPitchSemitones(double semitones) = 0;
    virtual void setMode(StretchMode mode) = 0;

    virtual int process(
        const float* const* input,
        int inputFrames,
        float* const* output,
        int outputCapacity
    ) = 0;
};
```

Le prototype exact doit être adapté à la manière dont ELASTIQUE consomme et produit les frames.

Ne pas figer cette signature avant lecture du SDK.

---

# 31. Séparation adapter / engine

Architecture :

```text
AEF
↓
Sampler API
↓
SamplerEngine
↓
Voice
↓
StretchProcessor interface
↓
ZplaneStretchProcessor
↓
ELASTIQUE SDK
```

Ainsi AEF ne dépend jamais directement de la syntaxe zplane.

---

# 32. Gestion du buffer

Le SDK ELASTIQUE peut avoir une relation entrée/sortie différente selon le ratio de stretch.

Prévoir :

- FIFO d’entrée ;
- FIFO de sortie ;
- gestion de l’overlap ;
- demande de frames ;
- récupération des frames produites ;
- compensation de latence.

Ne pas supposer :

```text
N frames input = N frames output
```

---

# 33. Latence

Le moteur doit connaître ou mesurer :

```text
algorithm_latency_frames
```

et l’exposer au scheduler si nécessaire.

Objectif :

- éviter qu’une note time-stretchée démarre perceptiblement après une note non stretchée ;
- permettre une compensation cohérente entre voix.

Si ELASTIQUE fournit une API de latence, l’utiliser.

Sinon mesurer précisément selon mode et configuration.

---

# 34. Changement de paramètres en lecture

Tester séparément :

- modification continue du stretch ratio ;
- modification continue du pitch ;
- changement brusque de tempo ;
- changement de mode ;
- activation des formants.

Déterminer quelles opérations :

```text
peuvent être automatisées sample-accurate
```

et lesquelles :

```text
nécessitent reset/reconfiguration
```

Ne pas faire de changement de mode au milieu d’une voix si le SDK impose une reconstruction d’instance.

---

# 35. Préservation du comportement musical

Les changements de tempo doivent éviter :

- clicks ;
- sauts temporels ;
- perte de sync ;
- re-déclenchement ;
- changement de phase brutal.

Pour les automations rapides, prévoir un smoothing des paramètres AEF si nécessaire.

---

# 36. Tests obligatoires

## Test 1 — identité

```text
pitch = 0 semitone
stretch = 1.0
```

Le résultat doit rester temporellement correct.

## Test 2 — tempo

```text
120 BPM → 100 BPM
pitch inchangé
```

## Test 3 — pitch

```text
0 → +12 semitones
durée inchangée
```

## Test 4 — combinaison

```text
120 → 90 BPM
+7 semitones
```

## Test 5 — polyphonie

Déclencher simultanément :

```text
8 voix
16 voix
32 voix
64 voix
```

Mesurer :

```text
CPU
XRuns
mémoire
latence
dropouts
```

## Test 6 — percussion

Kick/snare/loop avec transitoires fortes.

## Test 7 — voix

Voix chantée avec formants.

## Test 8 — mix complet

Sample stéréo polyphonique complexe.

## Test 9 — boucle

Loop court pendant plusieurs minutes.

## Test 10 — changement de tempo live

Automation du tempo en lecture.

## Test 11 — stress

Déclenchement très rapide de notes avec voice stealing.

## Test 12 — iPad/iPhone

Tester sur plusieurs générations Apple Silicon.

---

# 37. Benchmark

Créer un benchmark automatisable produisant :

```text
device
OS
sample_rate
buffer_size
stretch_mode
voice_count
CPU_average
CPU_peak
memory
underruns
latency
```

Ne pas se contenter d’un ressenti utilisateur pour les performances.

---

# 38. Critère de validation minimal

La première intégration considérée fonctionnelle doit réussir :

```text
16 voix simultanées
time-stretch actif
pitch indépendant
stéréo
48 kHz
buffer live utilisé par AEF
aucun dropout
aucune allocation critique dans le callback
```

sur une cible Apple Silicon représentative.

Le moteur ne doit toutefois contenir aucune limite arbitraire à 16 voix.

---

# 39. Critère cible

Objectif souhaité :

```text
32 voix polyphoniques time-stretchées
```

avec mode live/efficient approprié sur matériel moderne.

Puis tester au-delà.

La limite finale doit être déterminée par mesure réelle, pas par supposition.

---

# 40. Dégradation contrôlée

Si la charge devient excessive, ordre possible :

1. conserver toutes les voix ;
2. utiliser un mode ELASTIQUE moins coûteux pour les nouvelles voix ;
3. réduire éventuellement certains paramètres de qualité autorisés par le SDK ;
4. utiliser voice stealing seulement en dernier recours.

Ne pas provoquer spontanément un changement audible de qualité sans règle produit explicite.

---

# 41. Mode offline / export

Lors d’un export non temps réel, permettre l’utilisation du meilleur mode disponible indépendamment de la contrainte live.

Concept :

```text
Live → Efficient / configuration faible latence
Export → Pro / meilleure qualité
```

Le choix exact dépendra du SDK.

---

# 42. Sécurité de licence dans Git

Ajouter aux exclusions :

```gitignore
third_party/zplane/**
vendor/zplane/**
```

ou l’emplacement réel retenu.

Conserver éventuellement publiquement :

```text
README_ZPLANE.md
```

expliquant :

- que le SDK est propriétaire ;
- qu’il doit être obtenu auprès de zplane ;
- où le placer localement ;
- quelles variables de build configurer.

---

# 43. Build sans ELASTIQUE

Prévoir un flag :

```text
AEF_WITH_ZPLANE_ELASTIQUE
```

Quand absent :

- AEF compile ;
- le wrapper existe ;
- les fonctions stretch déclarent proprement l’indisponibilité ;
- aucune référence linker vers zplane.

Cela évite de casser le dépôt open source pour les développeurs qui ne possèdent pas la licence.

---

# 44. Aucun recâblage futur du moteur

Même si ELASTIQUE est choisi directement, conserver une interface interne neutre.

Ce n’est pas pour utiliser Rubber Band maintenant.

C’est pour empêcher le SDK propriétaire de contaminer toute l’architecture.

Règle :

```text
AEF connaît StretchProcessor.
ZplaneStretchProcessor connaît ELASTIQUE.
```

Pas :

```text
AEF entier → appels ELASTIQUE partout.
```

---

# 45. Ce qu’il ne faut pas faire

Ne pas :

- commencer avec Rubber Band « temporairement » ;
- coder deux moteurs en parallèle ;
- créer une API JS spécifique à ELASTIQUE ;
- mettre le SDK propriétaire dans Git public ;
- hardcoder 8/16 voix ;
- créer une horloge musicale séparée ;
- supposer le comportement du SDK sans lire sa documentation ;
- allouer une instance dans chaque NoteOn avant confirmation de sa real-time safety ;
- reconstruire l’instance sur chaque buffer ;
- faire le DSP dans JavaScript ;
- traiter les notes depuis le thread UI ;
- réduire arbitrairement la qualité sans mesure.

---

# 46. Ordre d’implémentation

## Phase A — licence

- contacter zplane ;
- obtenir SDK PRO d’évaluation ;
- confirmer plateformes ;
- confirmer modèle open-source/propriétaire ;
- récupérer conditions commerciales.

## Phase B — inspection SDK

- lire documentation PRO ;
- lire Direct API ;
- compiler exemple zplane ;
- identifier latence ;
- identifier lifecycle ;
- identifier appels real-time safe ;
- identifier format des buffers ;
- identifier contrôle pitch/stretch ;
- identifier modes disponibles.

## Phase C — inspection AEF

- localiser moteur audio ;
- localiser callback ;
- localiser transport ;
- localiser scheduler ;
- localiser bridge JS/native ;
- localiser objet sample/clip ;
- vérifier format buffers.

## Phase D — adapter

Créer :

```text
StretchProcessor
ZplaneStretchProcessor
```

sans modification UI.

## Phase E — une voix

Faire fonctionner :

```text
sample
→ stretch
→ pitch
→ sortie
```

dans le moteur AEF réel.

## Phase F — voice manager

Ajouter pool + polyphonie.

## Phase G — sync

Raccorder tempo/scheduler.

## Phase H — loops/trim/envelope

Raccorder les fonctions sampler.

## Phase I — UI

Brancher les contrôles existants AEF.

## Phase J — benchmark

Mesurer puis optimiser uniquement ce qui pose réellement problème.

---

# 47. Décision actuelle

La stratégie retenue est :

> **Intégrer directement zplane ELASTIQUE dans le moteur AEF plutôt que construire d’abord un moteur Rubber Band destiné à être remplacé.**

Le moteur reste néanmoins derrière une interface interne neutre afin de protéger l’architecture AEF.

Le package demandé à zplane doit être :

> **ELASTIQUE PRO SDK**

car il donne accès au moteur PRO ainsi qu’à EFFICIENT et aux modes supplémentaires annoncés par zplane via une API commune.

---

# 48. Informations à fournir depuis AEF avant raccord définitif

Pour éviter toute supposition, récupérer dans le code AEF les réponses à ces questions :

1. Quel fichier/classe possède actuellement le callback audio ?
2. AEF utilise-t-il AVAudioEngine, AudioUnit, RemoteIO, un moteur C/C++ maison ou autre ?
3. Où le mixage des clips/samples est-il effectué ?
4. Où le tempo global est-il stocké ?
5. Comment la position musicale est-elle représentée ?
6. Existe-t-il déjà un scheduler sample-accurate ?
7. Comment les commandes JS atteignent-elles le moteur natif ?
8. Quel type de buffer est utilisé ?
9. Quel est le block size habituel sur iOS ?
10. Comment AEF représente-t-il actuellement un sample ?
11. Comment les loops sont-elles représentées ?
12. Comment trim/cut sont-ils représentés ?
13. Existe-t-il déjà une classe Voice ou Player ?
14. Existe-t-il un système d’object pool ?
15. Le moteur fonctionne-t-il actuellement à fréquence fixe ou suit-il le hardware ?
16. Comment AUv3 partage-t-il le moteur avec la version standalone ?

Ces réponses doivent provenir du code AEF réel.

---

# 49. Sources officielles

zplane ELASTIQUE technology:

https://licensing.zplane.de/technology

zplane licensing:

https://licensing.zplane.de/licensing

zplane company/contact:

https://licensing.zplane.de/company

Contact :

```text
info@zplane.de
+49 30 854 091 50
```

---

# 50. Résultat attendu

À la fin de l’intégration, AEF doit disposer d’un moteur capable de faire :

```text
sample
+ polyphonie
+ pitch instrumental
+ time-stretch temps réel
+ tempo sync
+ loops
+ trim
+ ADSR
+ faible latence
```

avec ELASTIQUE utilisé comme moteur DSP natif et AEF restant responsable de :

```text
transport
scheduling
voice management
sample management
UI
serialization
routing
mixing
```

Le SDK zplane est responsable du traitement spécialisé :

```text
time stretching
pitch shifting
formant processing lorsque disponible
```

La séparation doit être nette.
