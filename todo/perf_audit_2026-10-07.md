# Audit performance / énergie — atome/eVe (7 oct. 2026)

Journal de la mission « Audit, nettoyage et optimisation des performances ».
Toutes les mesures ont été relevées, pas estimées. Sondes conservées dans
`temp/perf_audit_2026-10/` ; rapports JSON dans `temp/perf_audit_2026-10/reports/`.

## Méthode et limites de mesure

- **Environnement** : Chromium Playwright, fenêtre hors écran (vrai GPU Apple,
  WebGPU réel), profil persistant connecté, serveur Fastify `:3001`, WASM Bevy
  servi depuis le working tree. Même chemin de rendu que l'iPhone (Bevy WASM
  WebGPU dans WKWebView, cf. `done/ios_energy_render_loop.md`).
- **Instrumentation temporaire** (`instrument.js`, injectée par `addInitScript`,
  jamais livrée) : rAF, `setInterval`/`setTimeout`, écouteurs, observers,
  ObjectURL, AudioContext, éléments média, appels WebGPU (`submit`,
  `createBindGroup`, `importExternalTexture`, octets `writeBuffer`…) — tout est
  attribué à la ligne appelante.
- **CPU** : temps CPU cumulé des processus Chromium (`ps`) → % renderer et
  % processus GPU ; `Performance.getMetrics` (TaskDuration = occupation du fil
  principal) ; compteurs Bevy `read_atome_bevy_web_diagnostics()` (ticks/s =
  rendus complets par seconde).
- **A/B exact** : un WASM « avant » reconstruit depuis `lib.rs` de HEAD (seul
  mon correctif diffère, même taille octet pour octet que l'original) est servi
  par interception réseau (`ab_drag_idle.probe.mjs`).
- **Non mesurable ici** : Instruments/Energy Log sur iPhone physique, pression
  thermique iOS, `document.hidden` réel (Playwright neutralise le
  « backgrounding » ; les tentatives fenêtre minimisée restent `hidden:false`).

## A. Audit initial — problèmes identifiés

| Prio | Zone | Problème | Cause | Impact | Preuve / mesure | Correction |
|---|---|---|---|---|---|---|
| **P0** | Bevy WASM (Web **et iPhone**) — `platforms/web/bevy-renderer` | **3 rendus complets par réveil** du moteur | Les systèmes de vidange écrivaient `RequestRedraw` ; `bevy_winit` relit ce message double-tamponné à l'update suivant → 2 rendus identiques en plus ; un `WakeUp` force en outre son propre redraw | GPU + CPU ×3 dès qu'une source réveille à faible cadence (fond vidéo 12,5 i/s → 37 rendus/s) | wakes 12,1/s → ticks 36,6/s ; `importExternalTexture` 37/s ; GPU process 14 %, fil principal 18 % au repos | **Corrigé** : plus de `RequestRedraw` dans les vidanges ; trames vidéo cadencées par `window.request_redraw()` (1 rendu / trame décodée) |
| **P0** | Fond d'écran par défaut | Vidéo plein écran **par défaut pour tout utilisateur** (`assets/videos/eVe.mp4`, depuis le 4 oct.) | Choix produit ; décodage + rendu continu même **sous un projet opaque** qui la masque entièrement | Décodage vidéo + rendus permanents sans aucun pixel visible en mode projet | projet ouvert : vidéo `playing`, 12 redraws/s, captures identiques (fond gris opaque) | **Corrigé** : pause sous couverture opaque, reprise au découvert (décodeur/URL/tête conservés) |
| **P0** (Web) | `adole_api/browser_workspace.js` + `guest_workspace_store.js` | **File d'envoi IndexedDB bloquée et relue entièrement à chaque commit** | Chaque commit émet `squirrel:workspace-outbox-ready` → `pendingWorkspaceEvents()` = `getAll()` de toute la file ; la 1re entrée refusée par le serveur (`property_write_denied`) arrête la passe, rien n'est acquitté, la file ne se vide jamais | CPU + GC proportionnels à la file, croissance sans fin → ralentissement progressif ; **plus aucune synchronisation** | profil : 2,8 s sur 7,9 s de glisser dans `guest_workspace_store.js:50/234`, 0,6 s de GC ; file du profil de sonde : **46 416 événements, 67 Mo, bloquée depuis le 30 sept.** | **Non corrigé — arbitrage requis** : sort d'un événement refusé définitivement (quarantaine/dead-letter + signalement ?) = sémantique sync/historique (module 06) |
| **P0** (iOS, lecture de code) | `AppNativeAudioPlayback.swift` | `AVAudioEngine` de lecture **jamais arrêté** après la première lecture | Aucun chemin d'arrêt hors `audio_shutdown`/reprise de route | Unité I/O audio active en permanence (rendu de silence) + `UIBackgroundModes: audio` → l'app (WebView + Bevy) reste éveillée en arrière-plan | inspection : seuls `engine.stop()` = shutdown/reset de route | **Corrigé** : pause 2 s après la dernière voix, redémarrage transparent (à valider sur appareil) |
| **P1** | `bevy_ui_runtime_state.js` | Diagnostic d'overlay **quadratique**, attendu à chaque ouverture de panneau (P0-1 de l'audit d'août, toujours présent) | `Array.from(handlers.keys())` refait par nœud visité | Latence d'ouverture croissante avec le nombre d'arbres montés | 6×130 nœuds : 30 ms ; 6×300 : 177 ms | **Corrigé** : index unique par appel (0,5 ms / 2,8 ms), sortie identique |
| **P1** (Web) | Kira WASM / cpal | Flux audio Web **actif en continu** après la première lecture (~29 `AudioBufferSourceNode`/s à vide) | `AudioManager<CpalBackend>` jamais suspendu ; Kira 0.12 n'expose aucune pause | CPU audio + AudioContext éveillé (Web seulement ; iOS/Tauri = Kira natif) | 5 456 nœuds créés en ~3 min sans lecture | Non corrigé — exigerait de détruire/recréer l'AudioManager (contrainte de geste navigateur) → recommandation |
| **P1** | Iframe de capture de vignettes | Seconde instance Bevy/WASM + second device WebGPU **conservée** après la première capture | Choix documenté (« one retained hidden iframe », warm-up) | Mémoire renderer/GPU retenue (voir § D) | mesure § D | Non modifié (choix d'architecture documenté) → signalé |
| **P2** | `matrix_module_runtime.js` | Sonde de sécurité 1 s permanente, même app cachée | `setInterval` brut | Réveil CPU 1/s | 1 tir/s mesuré | **Corrigé** : `createVisibilityAwareInterval` (brique existante) |
| **P2** | `eVe/user/background.js` | Watcher de profil toutes les 1,2 s (`auth.current` + lecture profil) | Polling (déjà suspendu quand caché) | Réveil CPU ~0,8/s | voir § E | Non modifié → recommandation (événement push existant) |
| **P2** | `trace_runtime.js` | `MutationObserver` de traçage attaché même traçage désactivé | Observer posé au boot, callback qui sort immédiatement | Négligeable (DOM ≈ 30 nœuds) | observer vivant, 0 coût mesurable | Non modifié |
| **P2** | `bevy_web_renderer_runtime.js` | Diagnostics WASM sérialisés à chaque diff, collecteur désactivé | Argument évalué avant la garde de `recordBevyPerfEvent` | Allocation par diff | voir § E | voir § E |

## B. Causes de chauffe iPhone réellement démontrées

1. **Boucle de rendu Bevy ×3** (mesuré, Web = même WASM que WKWebView) : chaque
   réveil produisait 3 rendus complets (extract + toutes les caméras + passes de
   flou + present). Avec la vidéo de fond à 12,5 i/s : **37 rendus/s en
   permanence, sans aucune interaction**.
2. **Fond d'écran vidéo par défaut** (mesuré) : depuis le 4 oct., tout compte
   sans fond choisi reçoit `eVe.mp4` (960×960 H.264 24 i/s, affiché plafonné à
   12,5 i/s). Il était décodé et rendu **aussi sous un projet opaque** qui le
   masque à 100 %.
3. **Moteur audio iOS jamais arrêté** (lecture de code, non mesurable ici) :
   après une première lecture, l'`AVAudioEngine` rend du silence en continu ;
   avec `UIBackgroundModes: audio`, iOS n'a aucune raison de suspendre l'app —
   WebView, timers et heartbeat Bevy continuent en arrière-plan.

Hypothèses **invalidées** par la mesure (ne pas y revenir) :
- multiplication de boucles rAF / timers / observers à l'ouverture de panneaux
  ou au changement de projet : **aucune** (voir § C) ;
- fuite d'écouteurs : le compteur Chrome (`JSEventListeners`) reste à 340–780 ;
  la hausse apparente de mon compteur venait des `AudioBufferSourceNode` du
  flux Kira Web (objets éphémères) ;
- surcharge du DOM : 27–530 nœuds selon la vue, 1 canvas.

## C. Boucles et systèmes permanents (repos, après réglage)

| Source | Cadence | Statut |
|---|---|---|
| Boucle winit/Bevy (`squirrel_bevy_renderer.js` rAF) | avant : 37/s au repos ; après : 2/s (heartbeat) en projet, 12,5/s sur le Dashboard (fond vidéo visible) | **corrigée** (×3 supprimé + pause sous couverture) |
| `redrawRequester` (`bevy_web_presentation_runtime.js:158`, setTimeout 0) | 12/s (une par trame vidéo) | légitime ; ne réveille plus que 1 rendu |
| `matrix_module_runtime.js:256` filet 1 s | 1/s | **corrigé** : suspendu quand caché |
| `eVe/user/background.js` watcher profil | 1,2 s | déjà suspendu quand caché ; P2 |
| `visibility_aware_interval` 15 s | 0,07/s | OK |
| `adole_api/surfaces.js` heartbeat 30 s, ping WS 30 s | 0,03/s | OK |
| `dashboard_news_modules.js` 60 s | 0,02/s | OK |
| `bevy_ui_runtime.js:58` rAF | ~2/s en projet | OK (projections ponctuelles) |
| Observers vivants | 13 (dont 2 Bevy internes), constants | OK |

**Duplication / cycle de vie** — vérifié sur 8 ouvertures/fermetures de 7
panneaux (info, media, couleur, layer, tags, calendar, finder) et 8 bascules
Dashboard ↔ projet : intervalles 5 → 5, timeouts en attente 0 → 0, observers
13 → 13, rAF en attente ≤ 1, ObjectURL 0, nœuds DOM 29–31. **Aucune boucle,
aucun timer, aucun observer ne survit à la fermeture d'un panneau.**

## D. Mémoire

- Tas JS après GC : 17–19 Mo au boot, 26–31 Mo projet ouvert ; +0,15 Mo par
  cycle d'ouverture/fermeture de 7 panneaux, +0,2 Mo par bascule
  Dashboard ↔ projet (8 cycles) — pas de fuite caractérisée.
- ObjectURL vivants : 0 ; AudioContext JS : 0 ; éléments média : 1 (fond vidéo).
- **Iframe de capture de vignettes** (seconde instance Bevy) : retirée de force
  → renderer −40 Mo RSS, processus GPU −6 Mo ; **0 tick en 10 s** (ne rend rien
  au repos). Coût mémoire modéré, conservé (choix documenté de préchauffage).
- **IndexedDB (Web)** : `queue` 67 Mo, `events` 61 Mo, `snapshots` 86 Mo,
  46 416 lignes chacune pour un seul compte de sonde — conséquence directe du
  blocage de file ci-dessus (voir § I).

## E. CPU — principaux consommateurs (profil CDP, après corrections)

| Scénario | Fil principal occupé | Dominante |
|---|---|---|
| Dashboard repos 10 s | 677 ms (6,8 %) | rendu Bevy des trames du fond vidéo (WASM, `createBindGroup`, `importExternalTexture`) ; 0 trame WebSocket |
| Projet repos 10 s | 185 ms (1,9 %) | heartbeat Bevy ; 0 trame WebSocket |
| Glisser 120 déplacements | 5 817 ms / 7 922 ms | **file IndexedDB : 3,5 s + 0,6 s GC** (§ A, P0 Web) |
| Ouverture Info | 430 ms | WASM UI (layout) 250 ms, relecture file IndexedDB 245 ms |
| Ouverture Calendar | 658 ms | WASM UI 535 ms (calcul de mise en page Bevy UI) |
| Ouverture Couleur | 362 ms | WASM UI 230 ms + roue chromatique JS 40 ms |
| Bascule → Dashboard | 2 412 ms | (projection Dashboard, vignettes) |

Le diagnostic WASM évalué à chaque diff (`bevy.diff.applied`) n'apparaît pas
dans les profils : laissé tel quel (P2 sans coût mesuré).

## F. GPU (appels WebGPU/s au repos, instrumentation)

| | `submit` | `createBindGroup` | `importExternalTexture` | `writeBuffer` |
|---|---|---|---|---|
| Dashboard avant | 73,5 | 478 | 36,7 | 818 Ko/s |
| Dashboard après | 26,9 | 134 | 26,9 | 270 Ko/s |
| Projet avant | 74,2 | 370 | 74,1 | — |
| Projet après (fond en pause) | ≈ 4 (heartbeat) | — | 0 | — |

## G. Modifications

| Fichier | Changement |
|---|---|
| `platforms/web/bevy-renderer/src/lib.rs` | vidanges sans `RequestRedraw` ; signatures des systèmes sans `World` inutile ; compteur `paced_redraws` ; extraction de l'horloge de réveil (815 → 727 lignes) |
| `platforms/web/bevy-renderer/src/frame_clock.rs` (nouveau) | réveil immédiat (entrée) vs redraw cadencé (`request_frame_paced_web_redraw`, trames vidéo), heartbeat |
| `platforms/web/bevy-renderer/src/tests.rs`, `web_wake_tests.rs` | contrat mis à jour (0 `RequestRedraw` après vidange) |
| `atome/src/wasm/*` | WASM reconstruit (`build.sh`, version `4d11c96a1c29b24a`), embarqué aussi par le bundle iOS |
| `eVe/domains/rendering/bevy_surface_background_runtime.js` | pause du fond vidéo sous couverture opaque, reprise au découvert |
| `eVe/domains/rendering/bevy_ui_runtime_state.js` | diagnostic d'overlay linéaire (index par appel) |
| `eVe/domains/matrix/matrix_module_runtime.js` | filet 1 s → `createVisibilityAwareInterval` |
| `platforms/ios/atome-auv3/application/AppNativeAudioPlayback.swift`, `AppNativeAudioController.swift` | pause de l'`AVAudioEngine` 2 s après la dernière voix |
| `maps/CODEMAP.md`, `ARCHITECTURE_MAP.md`, `API_MAP.md` | contrats ci-dessus |
| `known-bug-solutions/idle-render-loop-heat/` + index | cause racine, hypothèses rejetées, contrôles |

## H. Mesures avant / après (fenêtres de 12–20 s, même machine)

| Scénario | CPU renderer | CPU proc. GPU | Fil principal | Rendus Bevy/s |
|---|---|---|---|---|
| Dashboard repos | 28,4 → 15,6 % | 14,2 → 10,4 % | 17,7 → 8,3 % | 36,6 → 13,4 |
| Projet repos | 26,0 → 15,9 % (fix 1) → 1,9 % fil princ. (fix 2) | 13,6 → 8,6 % | 17,2 → 8,7 → 1,9 % | 36,8 → 13,3 → **2,0** |
| Lecture audio | 29,3 → 19,9 % | 14,4 → 10,0 % | 21,8 → 14,0 % | 60,2 → 36,6 (chaque changement rendu) |
| Vues Liste / Matrice | 21,5–26,4 → 13,9–16 % | 11–14 → 8,5–8,9 % | 16–18 → 9 % | 36–38 → 13–14 |
| Glisser (A/B même session) | 122 → 117 % | 7,6 → 5,6 % | — | 34,3 → 21,3 pour 22,7 → 24 ops/s ; position finale identique |
| Ouverture panneau Info (1re) | 740 → 330–430 ms | | | |

Non régression : captures avant/après identiques ; sonde fond vidéo 8/8 ;
0 erreur de page/console imputable (2 avertissements préexistants : MIDI SysEx,
`tool_family_unclassified visual_fullscreen`).

## I. Risques restant à examiner

1. **File d'envoi Web bloquée (P0)** — arbitrage requis : que faire d'un
   événement refusé définitivement par le serveur ? Tant que ce n'est pas
   tranché, un seul refus bloque toute la synchronisation d'un compte et
   alourdit chaque commit. Correctif de perf indépendant possible ensuite :
   lire la file par plage de clés du propriétaire et ne pas relancer une passe
   complète à chaque commit pendant qu'elle échoue sur la même tête.
2. **iOS non validé sur appareil** : correctif `AVAudioEngine` compilé (simulateur), pas testé sur
   appareil ; le gain Bevy/fond vidéo s'applique au bundle iOS (même WASM) mais
   n'a pas été mesuré sur iPhone (Energy gauge/Instruments indisponibles ici).
3. **Arrière-plan réel** non mesurable sous Playwright (`hidden` reste faux).
4. Tests Rust de `squirrel-bevy-renderer` : la cible de test ne compile plus
   **avant** ce travail (11 erreurs `E0063`, champs ajoutés à
   `AtomeStylePatch`/`AtomeRenderNode`) — mes assertions mises à jour n'ont pas
   pu tourner ; la validation repose sur les sondes runtime.
5. Flux Kira Web actif à vide après une première lecture (Web seulement).

## J. Recommandations justifiées par les mesures

- Trancher le sort des événements refusés de la file Web (§ I.1), puis borner la
  lecture de la file.
- Valider sur iPhone : jouer un son, arrêter, attendre > 2 s, passer en
  arrière-plan → l'app doit se suspendre ; jauge Energy Xcode avant/après sur
  Dashboard et projet.
- Fond vidéo par défaut : il reste le premier poste au repos sur le Dashboard
  (≈ 12,5 rendus/s, décodage 960² H.264). Si la chauffe persiste sur iPhone,
  c'est un arbitrage produit (image par défaut, ou vidéo plus légère).
- Ouverture de panneaux : le coût dominant est désormais le layout Bevy UI côté
  WASM (250–535 ms), à profiler côté Rust.

---

# Gestes interactifs (7 oct., 2e passe)

Sonde `temp/perf_audit_2026-10/interactions.probe.mjs` : vrais gestes (clic sur la
vignette, clic maintenu, clics de menu, glisser du pied de panneau), mesure du temps
jusqu'à stabilisation, de la fluidité (enregistreur rAF temporaire, longues tâches),
des ticks Bevy et du profil CPU ; captures pendant et après chaque geste.

## Mesures avant / après (même profil, même machine)

| Geste | Avant | Après |
|---|---|---|
| Ouvrir un projet depuis sa vignette | 2,07–2,20 s ; 2 longues tâches ≈ 420 ms ; image max 333 ms | **0,93 s ; 0 longue tâche** |
| Retour Dashboard (chemin Organiser) | longues tâches 677 ms ; p95 100 ms | **0 longue tâche ; p95 17,6 ms** (≈1,2 s = durée de l'animation) |
| Panneau Templates | non stabilisé en 20 s ; 8,7–9,7 s de fil bloqué | **3,6 s la 1re fois, 0,54 s ensuite** |
| 1re ouverture d'un panneau (Info) | 645–651 ms ; gel 617 ms | **208 ms ; gel 158 ms** |
| Glisser d'atome (120 déplacements) | fil principal 5 817 ms, GC 606 ms | **540 ms, GC 4,7 ms** |
| Menu Mystic (clic maintenu) | ouverture ≈ 1,0 s (seuil 450–550 ms + animation 700 ms), p95 17,6 ms | inchangé (comportement voulu) |
| Palette du menu (`Créer`) | ≈ 530 ms (animation), 0 longue tâche, p95 18,6 ms | inchangé, p95 17,6 ms |
| Glisser de panneau | p95 17,6–18,4 ms, 0 longue tâche | inchangé |

Captures avant/après : états finaux identiques au pixel près (projet, Info, glisser de
panneau, Mystic) ; transition vignette→projet présente (image à 300 ms) ; Templates
désormais affiché (avant : non affiché dans le délai). Différences restantes = fond
vidéo animé et instant de capture dans une transition plus rapide.

## Causes et corrections

| Prio | Cause démontrée (profil) | Correction | Preuve d'équivalence |
|---|---|---|---|
| **P0** (Web) | Chaque commit relisait **toute** la file d'envoi IndexedDB (46 416 lignes, 67 Mo dans le profil de sonde) pour la trier, puis s'arrêtait sur la 1re entrée refusée | Index `[owner_id, created_at]` (base v2, migration non destructive) ; `oldestPendingWorkspaceEvent` lit seulement l'entrée suivante ; envoi une à une, même ordre, même arrêt sur refus, rien n'est jeté | `outbox_index_equivalence.probe.mjs` (migration v1→v2, 3 000 lignes, ex æquo, 4 propriétaires) ; sonde du dépôt `guest_workspace_indexeddb_runtime_probe` : PASS |
| **P1** | Retour Dashboard : `normalizeRenderAtom` ×3 par enregistrement, chacun avec plusieurs `new URL()` et `toLowerCase`/regex sur des vignettes `data:` de centaines de Ko — résultat jeté pour ces sources | `isPassthroughMediaSource` avant tout travail ; `readMediaUserId` ne parse l'URL que si la clé `media_user_id` peut y figurer | `media_user_id_equivalence.probe.mjs` : 135 cas × 4 options identiques à HEAD ; 300 vignettes `data:` 962 ms → 0,1 ms ; projection 593 → 103 ms |
| **P1** | 1re ouverture de panneau : flou gaussien de l'ombre calculé en CPU par pixel et par coefficient avec test de bornes (`convolve_axis`, 385 ms) | Convolution par coefficient sur plages contiguës + couleur constante hors boucle | test Rust `tap_major_convolution_is_bit_identical_to_the_per_pixel_form` (bit à bit) + 33 tests d'ombre verts |

Fichiers : `atome/src/squirrel/apis/unified/adole_api/guest_workspace_store.js`,
`browser_workspace.js`, `eVe/domains/media/shared/media_source.js`,
`eVe/domains/rendering/render_atom.js`, `atome/renderers/bevy-core/src/shadow_texture.rs`,
WASM reconstruit, cartes `CODEMAP`/`API_MAP`.

## Reste ouvert

- **Arbitrage toujours requis** : la file Web reste bloquée par une entrée refusée
  (`property_write_denied`) — elle ne coûte plus rien en CPU, mais rien n'est
  synchronisé tant que le sort des entrées refusées n'est pas décidé.
- Suite visuelle canonique `molecule_eve_ui_acceptance_probe` inutilisable
  (préexistant : appelle `auth.requestPhoneVerification`, supprimée par la refonte
  d'authentification) ; sonde `guest_workspace_lifecycle_runtime_probe` en échec
  identique sur HEAD propre (préexistant).
- 1re ouverture de panneau : 158 ms restants (masque SDF de l'ombre + texture de
  surface côté Rust, rasterisation des textes côté JS).
- iOS : l'app compile pour le simulateur avec le correctif `AVAudioEngine` (`xcodebuild … CODE_SIGNING_ALLOWED=NO` : BUILD SUCCEEDED) ; mesures d'énergie sur iPhone non réalisées (Instruments indisponible ici).

---

# 3e passe — décisions de l'utilisateur appliquées (7 oct.)

1. **File d'envoi Web, rien n'est perdu** : un événement refusé par le serveur (verdict
   portant sur l'événement, ex. `property_write_denied`) est déplacé dans le magasin
   IndexedDB `refused_queue` (base v3), conservé tel quel, signalé
   (`squirrel:workspace-sync-refused`), et la synchronisation continue avec les suivants
   dans l'ordre. Panne réseau / délai (status 0) ou refus d'authentification :
   la passe s'arrête, l'événement garde sa place. À chaque ouverture de session
   (`squirrel:remote-session-ready`) les refusés reviennent dans la file à leur place
   (`created_at`). L'import d'état serveur ne peut pas écraser un changement refusé
   (compté comme non envoyé) ; l'adoption de compte les emporte.
   Preuves : `outbox_refusal.probe.mjs` (6 scénarios) ; app réelle : la file de
   51 360 lignes du profil de sonde se vide (~2 600 acceptées, ~3 950 mises de côté
   en 2 min), aucune pause.
2. **Fond animé conservé, figé à l'inactivité** : lecture tant qu'il y a de l'activité
   (pointeur, toucher, molette, clavier) ; après 10 s sans geste, ou app cachée,
   l'image se fige (vidéo en pause, décodeur et position conservés, 2 rendus/s) ;
   reprise au premier geste (mesuré : 2 ms). Un seul minuteur réarmé, écouteurs
   passifs posés une fois. `wallpaper_pause.probe.mjs` : 11/11.
3. **Tests menés par moi** : tests Rust du renderer Web réparés (champs ajoutés aux
   initialisations) → 27/27 ; la suite visuelle canonique dépend des SMS (compte neuf
   à chaque run) → non réparée, couverte par `interactions.probe.mjs`.

## Mesure finale des gestes (WASM `040be97724cb528e`)

| Geste | Résultat final |
|---|---|
| Ouvrir un projet depuis sa vignette | 0,97–1,11 s, 0 longue tâche |
| Retour Dashboard | 0 longue tâche, p95 17,7 ms |
| Templates | 1,50 s puis 1,09 s |
| 1re ouverture de panneau / suivantes | 235 ms / 19 ms |
| Mystic | ouverture ≈ 1,04–1,11 s (seuil + animation voulus), p95 17,6 ms |
| Palette | ≈ 0,5 s (animation), p95 17,6 ms |
| Glisser de panneau | p95 17,6 ms, 0 longue tâche |

Reste : validation énergie sur iPhone (par l'utilisateur).
