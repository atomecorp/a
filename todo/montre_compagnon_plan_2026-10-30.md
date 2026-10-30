# App compagnon montre (Apple Watch, puis Wear OS) — étude, écrans, faisabilité

> 2026-10-30. Statut : **plan seulement, rien n'est codé.** Les écrans ci-dessous sont des esquisses de principe
> (contenu et enchaînement), pas des maquettes : la montre est une forme nouvelle, donc ses maquettes aux vrais
> jetons passent d'abord par la validation (AGENTS.md règle 16) — c'est le lot W0.

## 1. Ce qui existe déjà (vérifié dans le code)

| Brique | Où | Ce qu'elle fait aujourd'hui |
| --- | --- | --- |
| Cible watchOS `atomeWatch` | `platforms/ios/atome-auv3/watch/` (watchOS 10, `one.atome.app.watchkitapp`) | App **sans écran** (fond noir) : l'iPhone la démarre pour une séance, elle enregistre les mouvements du poignet (jusqu'à 800 Hz) et le pouls, puis envoie le fichier à l'iPhone. |
| Pont iPhone ↔ montre | `application/AppWatchSensorBridge.swift` | `WatchConnectivity` déjà actif (contexte d'application + messages + transfert de fichier), `HKHealthStore.startWatchApp`. |
| Séance d'entraînement watchOS | `watch/WatchSensorSession.swift` | `HKWorkoutSession` qui garde l'app vivante et mesure le pouls. |
| Commandes Sport | `atome/src/squirrel/training/contracts.js` (`training.*`) | Tout ce que la montre doit faire existe déjà en commande : `list_exercises`, `list_favorites`, `read_program`, `get_exercise`, `set_profile` (niveau 1–3, `custom` = Perso, `record`), `prepare_session`, `session_transition` (start, pause, resume, confirm, skip, stop, finish, measure…), `get_session`, `open_sessions`, `film`. |
| Séances communes | `eVe/domains/programs/activity_session_store.js` | Sport **et** Bien-être (sieste, méditation : `brick_session.*`) passent par le même magasin ; chaque mouvement de séance est **publié** à qui le suit (`createActivitySessionChannel`). C'est le point où brancher la montre. |
| Horodatage d'événement | `session_transition.recorded_at` | Une transition peut porter l'instant où elle a eu lieu : la montre pourra donc valider une série même si l'iPhone ne la reçoit qu'un peu plus tard. |
| Assistant depuis un hôte natif | `AssistantRequestInbox.swift` + `eVe/voice/assistant/assistant_native_link.js` | CarPlay et Siri ouvrent déjà **le même** assistant de la page et CarPlay en reflète la phase (écoute, parle, erreur). Précédent exact pour la montre. |
| Moteur vocal natif | `application/AppNativeVoiceEngine.swift` | Swift pousse un PCM 16 kHz toutes les 40 ms au moteur ; la source du micro est remplaçable. |
| Android | `platforms/desktop-tauri/gen/android` (Tauri) | App téléphone Android existante. |
| Module Wear OS `:wear` | `platforms/desktop-tauri/gen/android/wear/` (`WearSensorService.kt`, `WearSensorListener.kt`) + sources partagées `vendor/sensor-recording/android` | Pendant de la cible Apple Watch : enregistreur de capteurs **sans écran**, lien avec le téléphone par le plugin. Compile (`./gradlew :wear:assembleDebug`), jamais essayé sur une vraie montre. |

## 2. Principe d'architecture (le seul qui tient les règles du projet)

**L'iPhone décrit, la montre projette.** La montre ne détient aucune vérité :

1. Toute action de la montre devient **une commande canonique** (`training.*`, `brick_session.*`, assistant) exécutée
   sur le téléphone par le chemin MCP existant → pipeline de commit → historique. Aucune logique de séance n'est
   recopiée en Swift ou en Kotlin.
2. Le téléphone envoie à la montre **un modèle d'écran déjà calculé** (chiffre du disque, « suivant », niveaux,
   libellés déjà traduits par `eveT`). La montre ne fait que le poser et compte le temps localement à partir des
   instants reçus (pas un message par seconde).
3. Un seul propriétaire côté JS : un module `watch_link` (à créer, dans `eVe/domains/programs/`) qui (a) traduit
   les gestes reçus en commandes, (b) s'abonne aux canaux de séance et publie le modèle d'écran. Les ponts Swift et
   Kotlin ne sont que des **transports** (même contrat de messages pour Apple et Android).
4. Rendu : pas de WebGPU ni de Metal public sur watchOS, donc **Bevy ne peut pas tourner sur la montre**. L'écran
   montre est en SwiftUI (puis Compose for Wear OS) : c'est une frontière de plateforme native, comme CarPlay.
   → **À arbitrer par toi** (question Q1) : c'est la seule entorse au « un seul moteur de rendu ».

```
Montre (SwiftUI)            iPhone natif (Swift)              Page eVe (JS)
 geste « Lancer » ──WCSession──► WatchLinkBridge ──invoke──► watch_link → training.session_transition start
                                                                         → commit → historique
 écran mis à jour ◄─WCSession── WatchLinkBridge ◄──événement── watch_link ◄─ canal de séance publié
```

## 3. Les écrans, étape par étape

Taille de travail : Apple Watch 45 mm ≈ 198 × 242 pt (41 mm ≈ 176 × 215 ; Ultra ≈ 205 × 251). L'Atome (assistant)
garde le coin bas-droit sur chaque écran, comme partout ailleurs (règle 13).

### É1 — Accueil montre : les activités en dalles, défilement horizontal

```
┌──────────────────────┐
│ 10:42                │
│   ┌──────────┐ ┌──   │   ← la dalle suivante se montre coupée au bord
│   │    🏋     │ │     │
│   │Musculat. │ │     │   glisser ← → : activité suivante / précédente
│   └──────────┘ └──   │   toucher : entrer
│                   ◉  │   ◉ = l'Atome (assistant)
└──────────────────────┘
```
Dalles : Musculation, Cardio, Souplesse, Bien-être, puis tes favoris et ton programme (`list_favorites`,
`read_program`). Si une séance est déjà en cours sur le téléphone, la montre s'ouvre **directement sur É4**.

### É2 — Dans Musculation : les zones puis les exercices

```
┌──────────────────────┐
│ ‹ Musculation        │
│   ┌──────────┐ ┌──   │   zones : Pectoraux, Dos, Épaules, Bras, Abdos…
│   │ Pectoraux│ │     │   même geste : glisser ← →, toucher pour entrer
│   └──────────┘ └──   │
│                   ◉  │
└──────────────────────┘
          ↓ toucher
┌──────────────────────┐
│ ‹ Pectoraux          │
│   ┌──────────┐ ┌──   │
│   │  Pompes  │ │     │
│   │  Niv. 2  │ │     │   le niveau choisi se lit sur la dalle
│   └──────────┘ └──   │
│                   ◉  │
└──────────────────────┘
```
Choisi sur la montre ou sur le téléphone, c'est le même état : choisir Pompes sur l'iPhone fait passer la montre
sur Pompes, et inversement.

### É3 — Pompes, prêt à lancer (pages horizontales)

```
  [Niveaux]      ◄──      [Prêt]       ──►    [Enregistrer]
┌────────────┐      ┌────────────────┐      ┌────────────┐
│ Niv. 1     │      │    Pompes      │      │            │
│ Niv. 2  ✓  │      │   ╭──────╮     │      │    ⏺       │
│ Niv. 3     │      │   │  ▶   │     │      │ Filmer     │
│ Perso      │      │   ╰──────╯     │      │ (iPhone)   │
│      ◉     │      │ 3 × 12   ◉     │      │       ◉    │
└────────────┘      └────────────────┘      └────────────┘
```
- **Niveaux** : Niveau 1, 2, 3, Perso (et Record si tu le veux). Perso : on règle séries / répétitions / repos /
  charge à la **couronne** (ou au glisser vertical), pas de − et + (règle 14). → `training.set_profile`.
- **Prêt** : le disque ▶ lance la séance → `prepare_session` puis `session_transition start`.
- **Enregistrer** : déclenche l'enregistrement (voir Q4 : filmer avec l'iPhone, ou garder la séance).

### É4 — Séance en cours : le disque et « suivant »

```
  [Contrôles]      ◄──      [Disque]           ──►   [Niveaux / Réglage]
┌────────────┐      ┌────────────────────┐      ┌────────────┐
│            │      │  Série 2 / 3       │      │ Charge     │
│  ⏸  Pause  │      │   ╭──────────╮     │      │  12 kg     │
│            │      │   │    12    │     │      │ (couronne) │
│  ■  Arrêter│      │   │   rép.   │     │      │ Niv. 1 2 3 │
│            │      │   ╰──────────╯     │      │ Perso      │
│  ‹  Sortir │      │ Suivant : repos 60s│      │       ◉    │
│        ◉   │      │ ♥ 128          ◉   │      └────────────┘
└────────────┘      └────────────────────┘
```
- **Disque** (centre) : le chiffre en cours (répétitions ou compte à rebours), l'info suivante dessous, le pouls de
  la montre. Toucher le disque = « série faite » → `session_transition confirm`. Vibration à la fin d'un repos et
  d'une série chronométrée (Taptic Engine).
- **Contrôles** (glisser vers la droite) : Pause / Reprendre, Arrêter, Sortir (la séance continue sur le téléphone).
- **Niveaux / Réglage** (glisser vers la gauche) : changer la charge de la série suivante, changer de niveau.

### É5 — Arrêter : glisser pour confirmer

```
┌──────────────────────┐
│   ╭──────────────╮   │
│   │  Série 3 / 3 │   │   le petit rond garde l'information suivante
│   ╰──────────────╯   │
│  ◯━━━━━━━━━━━━━━► ■  │   glisser le rond jusqu'au bout = arrêter
│                   ◉  │   (évite un arrêt par erreur en plein effort)
└──────────────────────┘
```
→ `session_transition stop` (ou `finish` si la dernière série est faite : la séance est gardée et compte pour tes
objectifs, comme sur le téléphone).

### É6 — L'assistant

```
┌──────────────────────┐
│                      │
│        ◉ ◉ ◉         │   l'Atome au centre, il respire pendant l'écoute
│                      │   (mêmes phases que CarPlay : écoute, réfléchit, parle)
│  « série faite,      │
│    12 à 8 kilos »    │   (texte seulement si tu le veux — zen par défaut)
└──────────────────────┘
```
Toucher l'Atome (coin bas-droit, sur n'importe quel écran) ou lever le poignet et parler. Tout ce que l'assistant
sait déjà faire en Sport (« passe », « pause », « mets 4 séries de 15 ») marche tel quel, puisqu'il appelle les
mêmes commandes.

## 4. Faisabilité

| Point | Faisable ? | Comment / risque |
| --- | --- | --- |
| Écrans montre (dalles, pages horizontales, couronne, vibrations) | **Oui, sûr** | SwiftUI `TabView(.page)`, `digitalCrownRotation`, `WKInterfaceDevice.play`. Attention : le glisser depuis le bord gauche est aussi le « retour » système. |
| Synchro téléphone ↔ montre (choix, état de séance) | **Oui** | Le canal `WatchConnectivity` existe déjà. L'état part du canal de séance déjà publié. Risque : il faut que la page eVe tourne sur l'iPhone. Pendant une séance c'est le cas (mode `audio` d'arrière-plan + séance HealthKit). Si l'app iPhone a été fermée, la montre peut la réveiller, mais démarrer toute la page en arrière-plan n'est pas garanti → V1 : « ouvre eVe sur ton iPhone » si injoignable. |
| Lancer, pauser, valider, arrêter depuis la montre | **Oui, sûr** | Commandes `training.session_transition` existantes ; `recorded_at` garde l'instant vrai du geste. |
| Niveaux 1/2/3/Perso et réglages | **Oui, sûr** | `training.set_profile` existant. |
| Pouls en direct dans la séance | **Oui** | Déjà mesuré sur la montre ; à envoyer en `session_transition measure` (source `health`). |
| Déclencher l'enregistrement | **Oui** | `training.film` (filmer avec l'iPhone) ou `finish` (garder la séance) — selon Q4. Les mouvements du poignet s'enregistrent déjà d'office. |
| Parler à l'assistant **via l'iPhone** | **Oui, probable** | La montre capte la voix et l'envoie à l'iPhone qui la donne au moteur vocal existant (source du PCM remplacée) ; la réponse sort sur la montre, l'iPhone ou les AirPods. Risque : latence de `WatchConnectivity` (~0,2–0,5 s) ; à mesurer sur l'appareil. |
| Parler à l'assistant **sans iPhone** (montre cellulaire / Wi-Fi) | **Incertain** | watchOS restreint les connexions temps réel (WebSocket) aux apps audio actives ; possible mais à prouver. Plus tard. |
| Montre seule, sans téléphone (séance hors ligne) | **Plus tard** | Il faudrait le moteur de séance sur la montre = deuxième implémentation, interdit. Alternative propre : la montre garde les gestes horodatés et les rejoue à l'iPhone (`recorded_at`) ; l'affichage reste limité sans iPhone. |
| Bien-être (sieste, méditation) sur les mêmes écrans | **Oui** | Même magasin de séances (`brick_session.*`). |
| Wear OS (montres Android) | **Oui, plus coûteux** | Le module `:wear` (capteurs, sans écran) et son lien avec le téléphone existent déjà : on y ajoute les écrans en Compose for Wear OS et les messages du contrat montre, côté téléphone dans le plugin Android existant. **Une montre Wear OS ne s'appaire pas à un iPhone** : elle exige l'app Android du téléphone. Même contrat de messages que l'Apple Watch, donc le module JS `watch_link` sert aux deux. |
| Garmin, etc. | Hors plan | Autre langage (Monkey C), autre écosystème. |

**Verdict** : l'Apple Watch est faisable de bout en bout pour la V1 décrite (activités, choix synchronisé, séance
pilotée, niveaux, réglages, arrêt, enregistrement, assistant via l'iPhone). Le seul point incertain est l'assistant
sans iPhone. Wear OS est faisable ensuite avec le même cœur JS, mais demande l'app Android au point.

## 5. Lots (dans l'ordre)

| Lot | Contenu | Taille |
| --- | --- | --- |
| **W0** | Maquettes PNG aux tailles réelles de la montre, adaptation de la charte (grille d'outil sur 198 pt, place de l'Atome, retour système) → ta validation écran par écran. | S |
| **W1** | Contrat de messages montre (un fichier partagé), module JS `watch_link` (gestes → commandes, canal de séance → modèle d'écran), pont Swift côté iPhone et côté montre ; commandes MCP correspondantes (`watch.*` si besoin, chaque action d'écran ayant sa commande). | M |
| **W2** | É1 + É2 : activités, zones, exercices, favoris, programme ; choix synchronisé dans les deux sens. | M |
| **W3** | É3 + É4 + É5 : lancer, disque et « suivant », valider une série, pause, arrêter au glisser, vibrations, ouverture directe sur la séance en cours. | M |
| **W4** | Niveaux et réglages (couronne), Perso, charge de la série suivante. | S |
| **W5** | Enregistrement (Q4) + pouls en direct dans la séance. | S |
| **W6** | Assistant via l'iPhone (voix de la montre → moteur vocal, phases reflétées comme CarPlay), mesure de latence sur l'appareil. | M–L |
| **W7** | Bien-être sur les mêmes écrans. | S |
| **W8** | Wear OS : app Compose, pont Data Layer dans l'app Android, même `watch_link`. | L |

Validation : simulateur iPhone + simulateur Apple Watch appairés pour chaque lot ; l'essai au poignet est le tien.

## 6. Questions (6) — tranchées le 2026-10-30

**Décision de l'utilisateur (2026-10-30) : les six recommandations sont validées telles quelles.** Donc :
SwiftUI natif qui pose ce que l'iPhone décrit (1) ; en séance Contrôles à gauche, Disque au centre, Niveaux à
droite (2) ; arrêt en glissant le rond (3) ; « Enregistrer » = filmer avec l'iPhone **et** garder la séance, deux
pages distinctes (4) ; la voix sort là où sont les écouteurs, sinon sur la montre (5) ; V1 avec l'iPhone à portée (6).
Prochaine étape : W0 (maquettes PNG aux tailles réelles, à valider écran par écran).

## 7. W0 — maquettes validées (2026-10-30)

Maquettes : `temp/watch_companion/out/w0_1_naviguer.png`, `w0_2_seance.png`, `w0_3_assistant.png` (générateur
`temp/watch_companion/mockups/build.mjs`, Apple Watch 45 mm, vrais jetons). **Validées par l'utilisateur, avec les sept
recommandations :**

1. **Fond noir** (pas le fond d'écran eVe) : écran OLED, séance longue.
2. **Bande du bas adaptée à la montre** (exception de la règle 13 propre à la montre) : le Retour tient un outil
   (pas un et demi) ; en séance il n'est que sur la page Contrôles (= Sortir, à côté de Pause) ; ailleurs l'Atome seul
   au coin bas-droit ; sur la page Disque, l'info suivante prend la place libre en bas à gauche.
3. **Le pouls est affiché** (l'utilisateur a changé d'avis le 2026-10-30) : en petit, en bas à gauche, en face de
   l'Atome (cœur rouge + chiffre), sur chaque page de séance sauf Contrôles (Retour et Pause y sont) ; sur la page
   Disque, sous l'info suivante.
4. **Filmer seul**, pas de Photo (« prends une photo » passe par l'assistant).
5. **Assistant A** : l'Atome s'allume dans son coin (lueur sur le tracé, jamais de halo), l'écran ne change pas.
6. **Niveaux 1, 2, 3, Perso** sur la montre ; Record reste sur l'iPhone.
7. **Écran « Ouvre eVe sur ton iPhone »** quand l'iPhone est hors de portée (seul texte hors des dalles).

Écrans retenus : É1 Activités (Musculation, Cardio, Souplesse, Bien-être, Favoris…, dalles roses de la rubrique
Activité, défilement horizontal) ; É2 zones puis exercices ; É3 Niveaux ◄ Prêt (disque ▶) ; séance Contrôles
(disque-outil glissé jusqu'à ■) ◄ Disque (série / repos, anneau, « Ensuite · … ») ► Réglage (niveau + rouleaux,
couronne) ► Filmer (dalle, glyphe allumé et temps pendant la prise) ; fin = disque ✓ « Enregistrer ».
Wear OS (W8) : la plupart des montres sont rondes → maquettes rondes à faire avant W8.

1. **Rendu natif sur la montre** — Bevy ne peut pas tourner sur watchOS. Réponses : (a) SwiftUI natif qui ne fait que
   poser ce que l'iPhone décrit ; (b) attendre. *Recommandation : (a), c'est le même cas que CarPlay.*
2. **Gestes** — tu as dit glisser horizontal pour les activités. Pendant la séance : Contrôles à gauche, Disque au
   centre, Niveaux à droite (comme l'app Exercice d'Apple) ? *Recommandation : oui.*
3. **Arrêt** — glisser le rond jusqu'au bout (É5), ou un simple toucher sur ■ dans Contrôles ?
   *Recommandation : glisser, pour ne jamais arrêter par erreur en plein effort.*
4. **« Déclencher l'enregistrement »** — c'est (a) filmer / photographier avec l'iPhone (`training.film`), (b) garder la
   séance à la fin, ou (c) les deux ? *Recommandation : (c), deux pages distinctes.*
5. **Voix de l'assistant** — la réponse sort (a) sur la montre, (b) sur l'iPhone / les AirPods, (c) là où sont les
   écouteurs, sinon sur la montre ? *Recommandation : (c).*
6. **Sans iPhone** — la V1 exige-t-elle l'iPhone à portée (recommandé), ou faut-il dès la V1 garder les gestes sur la
   montre et les rejouer ensuite ?

## 8. W1–W7 — codés (2026-10-30)

Tout est codé ; le détail et les preuves sont dans `eVe/documentations/FRAMEWORK_STATE.md` §5 (2026-10-30, Apple Watch
companion). Commandes : `training.card_action`, `brick_session.card_action` (+ `training.open_series`, `training.film`).
Ajout sans nouvel écran : au tout premier « Lancer », la carte Sport demande l'accord (mouvements) sur l'iPhone ; la
montre affiche alors l'écran iPhone validé avec « Réponds sur ton iPhone ».
Non vérifié ici : aucun simulateur watchOS ni montre appairée → rien n'a tourné sur une montre ; voix en direct
(latence WCSession, captation WebRTC dans la WKWebView), arrière-plan. W8 (Wear OS) : maquettes rondes d'abord.

