# debug.md — Diagnostic des crashs, freezes et blocages partiels d’atome

**Statut :** Roadmap / spécification d’intégration  
**Cible prioritaire :** iOS / TestFlight / Tauri iOS / WKWebView / JavaScript / WASM / Bevy / WebGPU  
**Principe :** le système de diagnostic doit être global, modulaire et indépendant des outils ou menus d’atome. Il ne doit pas dépendre de Mystic, d’un panneau particulier ou d’une UI susceptible de changer.

---

## 1. Problème à résoudre

Un bug observé sur une bêta iOS peut ne pas être un crash classique.

Cas concret observé :

- une partie de l’interface se fige ;
- certaines icônes deviennent pixelisées ;
- plusieurs interactions ne répondent plus ;
- le lasso continue toutefois à fonctionner ;
- l’application n’est donc pas nécessairement totalement bloquée ;
- TestFlight peut ne générer aucun crash log exploitable si le processus ne se termine pas.

Il faut pouvoir déterminer **quelle couche s’est arrêtée**, même si une autre couche continue à fonctionner.

Les causes possibles comprennent notamment :

- boucle JavaScript bloquée ou saturée ;
- gestionnaire d’événements JavaScript cassé alors que la boucle JS tourne encore ;
- état applicatif incohérent ;
- promise/rejection non gérée ;
- exception ou trap WASM ;
- boucle de mise à jour Bevy arrêtée ;
- sous-système de rendu Bevy/wgpu bloqué ;
- perte du device WebGPU ;
- erreur WebGPU non capturée ;
- canvas ou surface dont le backing store n’est plus mis à jour correctement ;
- texture ou ressource de rendu invalide ;
- problème de compositor WebKit/WKWebView ;
- thread natif iOS bloqué ;
- verrou, attente I/O ou contention ;
- pression mémoire ;
- problème survenu uniquement dans une fonction donnée alors que le reste de l’application reste vivant.

**Conclusion importante :** ne pas traiter tous les freezes comme des crashs.  
atome doit posséder son propre **flight recorder** capable de diagnostiquer les blocages partiels.

---

# 2. Objectif du système de debug

Le framework doit pouvoir répondre automatiquement à ces questions :

1. Le conteneur natif iOS est-il encore vivant ?
2. Le thread principal natif répond-il encore ?
3. La boucle d’événements JavaScript tourne-t-elle encore ?
4. `requestAnimationFrame` continue-t-il ?
5. Les événements pointer/touch arrivent-ils encore ?
6. WASM continue-t-il à exécuter sa boucle ?
7. Bevy continue-t-il son update ?
8. Le renderer continue-t-il à soumettre des frames ?
9. WebGPU a-t-il signalé une erreur ou une perte du device ?
10. Quel est le dernier événement connu avant le problème ?
11. Quel outil, objet, état ou action utilisateur était actif ?
12. Quelle couche s’est arrêtée la première ?
13. L’erreur est-elle reproductible sur le même build, modèle d’iPhone ou iOS ?
14. Peut-on reconstruire les 30 à 120 secondes qui précèdent l’incident ?

---

# 3. Architecture générale

Créer un service de diagnostic indépendant, par exemple :

```text
debug/
├── core
├── native
├── javascript
├── wasm
├── bevy
├── renderer
├── apple
├── storage
├── transport
└── report
```

Le nom exact des modules pourra changer, mais la séparation des responsabilités doit rester.

## 3.1 `debug/core`

Responsabilités :

- horodatage ;
- numéros de séquence ;
- modèle commun des événements ;
- état des heartbeats ;
- ring buffer ;
- classification d’incident ;
- création d’un rapport unique.

Aucune dépendance à l’UI d’atome.

## 3.2 `debug/native`

Responsabilités :

- état de l’application iOS ;
- activité du main thread natif ;
- watchdog sur thread secondaire ;
- changements foreground/background ;
- mémoire disponible si accessible ;
- événements lifecycle ;
- journal natif ;
- pont avec JavaScript/WASM.

## 3.3 `debug/javascript`

Responsabilités :

- heartbeat de la boucle JS ;
- `window.onerror` ;
- `unhandledrejection` ;
- erreurs console importantes ;
- événements d’input ;
- changement d’outil ;
- changement d’état significatif ;
- instrumentation des opérations longues ou critiques.

## 3.4 `debug/wasm`

Responsabilités :

- heartbeat WASM ;
- panics/traps quand ils peuvent être interceptés ;
- entrée/sortie des appels importants ;
- dernier appel JS → WASM ;
- dernier appel WASM → JS ;
- identifiant de frame/update.

## 3.5 `debug/bevy`

Responsabilités :

- numéro d’update ;
- numéro de frame ;
- durée update ;
- durée render ;
- dernier système Bevy critique exécuté ;
- erreurs du renderer remontées au debug core.

## 3.6 `debug/renderer`

Responsabilités :

- frame demandée ;
- frame construite ;
- frame soumise ;
- erreurs wgpu/WebGPU ;
- perte du device ;
- surface/canvas reconfigurée ;
- changement de taille ou de scale ;
- allocation/échec de texture si observable ;
- dernier frame ID connu.

## 3.7 `debug/apple`

Responsabilités :

- MetricKit ;
- diagnostics de hang Apple ;
- logs de crash ;
- informations de build ;
- intégration avec Xcode/Organizer ;
- corrélation avec TestFlight.

---

# 4. Heartbeats : mécanisme central

Un simple crash logger ne suffit pas.

Chaque sous-système doit publier périodiquement un **heartbeat** avec un timestamp monotone.

Exemple logique :

```text
native_background  17:21:03.100  seq=5501
native_main        17:21:03.102  seq=8241
javascript         17:21:03.110  seq=18222
raf                17:21:03.116  frame=93441
input              17:21:03.118  pointer=active
wasm               17:21:03.119  update=93440
bevy               17:21:03.120  frame=93440
renderer_submit    17:21:03.121  frame=93440
```

Le watchdog ne doit pas seulement comparer des compteurs.  
Il doit conserver le **dernier timestamp vivant de chaque couche**.

## 4.1 Heartbeat natif en arrière-plan

Créer un watchdog qui n’est pas exécuté sur le même chemin que le thread principal.

Il vérifie notamment :

```text
now - last_native_main_tick
now - last_js_tick
now - last_raf_tick
now - last_wasm_tick
now - last_bevy_tick
now - last_renderer_tick
```

Cela permet de distinguer :

```text
native background : OK
native main       : STOP
```

d’un blocage global de l’application.

## 4.2 Heartbeat JavaScript

Exemple de principe :

```js
setInterval(() => {
  debug.emit("heartbeat", {
    layer: "javascript",
    monotonic: performance.now()
  });
}, 250);
```

La valeur de 250 ms est un point de départ, pas une règle absolue.

Le heartbeat doit être désactivé ou interprété différemment quand l’application est en background afin d’éviter les faux positifs dus au throttling iOS/WebKit.

## 4.3 Heartbeat `requestAnimationFrame`

```js
function debugRAF(now) {
  debug.emit("heartbeat", {
    layer: "raf",
    monotonic: now
  });

  requestAnimationFrame(debugRAF);
}

requestAnimationFrame(debugRAF);
```

Important : la boucle JS peut encore tourner alors que la boucle d’affichage ne progresse plus.

## 4.4 Heartbeat WASM / Bevy

Le moteur doit exposer au debug core au minimum :

```text
wasm_update_id
bevy_update_id
render_frame_id
last_update_started
last_update_completed
last_render_started
last_render_completed
```

Il faut distinguer :

```text
frame_started
frame_built
frame_submitted
```

afin de savoir si la frame s’est arrêtée avant ou après la construction du rendu.

---

# 5. Matrice de diagnostic automatique

Le système doit produire une classification de ce type :

| Native | JS | RAF | WASM/Bevy | Renderer | Interprétation probable |
|---|---|---|---|---|---|
| OK | STOP | STOP | STOP | STOP | boucle JS bloquée, WebKit ou pont JS |
| OK | OK | STOP | éventuellement OK | STOP | boucle de rendu/RAF ou compositor |
| OK | OK | OK | STOP | STOP | WASM/Bevy probablement arrêté |
| OK | OK | OK | OK | STOP | renderer/wgpu/WebGPU/surface |
| OK | OK | OK | OK | OK | blocage logique local, state ou input routing |
| OK | OK | OK | OK | OK + lasso OK | vérifier handlers/outils/état UI, pas un freeze global |
| background OK | native main STOP | variable | variable | variable | main thread natif bloqué |
| tout STOP | STOP | STOP | STOP | STOP | suspension, crash, watchdog système ou blocage global |

Cette matrice donne une **direction**, pas une preuve absolue.

---

# 6. Cas spécifique : le lasso fonctionne alors que l’UI est figée

Le fait que le lasso fonctionne est une information capitale, mais il faut d’abord déterminer **où le lasso s’exécute**.

Tracer explicitement :

```text
lasso.input.layer
lasso.logic.layer
lasso.render.layer
```

Il faut savoir si le lasso est :

- entièrement JavaScript ;
- JavaScript + canvas séparé ;
- WASM ;
- Bevy ;
- rendu par une couche différente ;
- géré par le compositor WebKit ;
- géré par un Worker ;
- géré côté natif.

### Interprétation

Si le lasso utilise réellement le même event loop JavaScript principal et continue à fonctionner :

- le JavaScript principal n’est probablement pas totalement bloqué ;
- chercher un handler cassé, un state invalide, une branche logique ou un sous-système spécifique ;
- MetricKit peut ne pas considérer l’application comme complètement non responsive.

Si le lasso utilise une autre couche, son fonctionnement ne disculpe pas le JavaScript principal.

**Action obligatoire :** documenter dans le code le chemin réel du lasso afin qu’un rapport de debug puisse l’identifier automatiquement.

---

# 7. Flight recorder / ring buffer

Créer un journal circulaire en mémoire qui conserve les événements récents.

Objectif recommandé au départ :

- conserver environ 60 à 120 secondes ;
- plafonner le nombre d’événements ;
- ne jamais laisser le log grossir sans limite ;
- sérialiser en JSONL ou format compact équivalent ;
- rotation automatique ;
- aucune écriture synchrone lourde sur le thread UI.

Exemple :

```text
17:21:02.992  input.pointerDown        object=abc
17:21:02.997  tool.select              source=sidebar
17:21:03.001  js.action.start          id=9382
17:21:03.006  wasm.call.start          id=9382
17:21:03.011  bevy.update              frame=93440
17:21:03.015  renderer.submit          frame=93440
17:21:03.116  raf                      frame=93441
17:21:03.200  javascript.heartbeat
17:21:03.450  javascript.heartbeat
17:21:03.700  javascript.heartbeat
17:21:03.951  incident.renderer_stale
```

## 7.1 Événements à conserver

Au minimum :

- lancement de session ;
- build/version ;
- modèle logique de plateforme ;
- foreground/background ;
- changement de projet ;
- changement de mode ;
- sélection d’un outil ;
- pointer down/up/move avec données minimales ;
- début/fin des opérations importantes ;
- appel JS → WASM ;
- retour WASM → JS ;
- erreurs JS ;
- promises rejetées ;
- erreurs WebGPU ;
- perte du device WebGPU ;
- reconfiguration canvas/surface ;
- erreurs Bevy ;
- erreurs natives ;
- pression mémoire ;
- heartbeat de chaque couche ;
- détection de freeze ;
- redémarrage après incident.

Ne pas enregistrer chaque mouvement brut de pointeur si cela crée trop de volume.  
Préférer des événements agrégés.

---

# 8. Schéma commun des événements

Exemple :

```json
{
  "seq": 184992,
  "wall_time": "2026-09-25T17:21:03.121+02:00",
  "monotonic_ms": 884233.12,
  "session_id": "random-session-id",
  "build": "1.4.0-381",
  "platform": "ios",
  "layer": "renderer",
  "event": "frame_submitted",
  "severity": "debug",
  "frame_id": 93440,
  "operation_id": "op-9382",
  "context": {
    "mode": "edit",
    "tool": "select"
  }
}
```

Tous les événements importants doivent pouvoir être corrélés via :

```text
session_id
operation_id
frame_id
seq
```

---

# 9. Capture des erreurs JavaScript

Installer dès le démarrage :

```js
window.addEventListener("error", (event) => {
  debug.emit("javascript.error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack
  });
});

window.addEventListener("unhandledrejection", (event) => {
  debug.emit("javascript.unhandledrejection", {
    reason: String(event.reason),
    stack: event.reason?.stack
  });
});
```

Capturer également les erreurs critiques de la console si nécessaire, sans transformer toute la console en télémétrie permanente.

Ajouter des spans autour des opérations critiques :

```js
const op = debug.begin("object.transform");

try {
  // action
} catch (error) {
  debug.error(op, error);
  throw error;
} finally {
  debug.end(op);
}
```

---

# 10. Capture WASM

Le WASM doit publier vers le même debug core.

À capturer si possible :

- panic Rust ;
- trap WASM ;
- dernière fonction exportée appelée ;
- durée d’exécution ;
- identifiant d’opération ;
- dernier retour réussi ;
- frame/update courant.

Côté Rust, installer un panic hook compatible avec la cible WASM et transmettre le message au journal d’atome.

Le logger ne doit pas devenir une dépendance fonctionnelle du moteur : s’il échoue, l’application doit continuer.

---

# 11. Capture Bevy

Ajouter une ressource/plugin de debug extrêmement léger.

Exemple conceptuel :

```text
AtomeDebugState
- last_update_started
- last_update_completed
- last_render_started
- last_render_completed
- update_id
- render_id
- active_scene
- active_operation_id
```

Instrumenter au minimum les frontières du pipeline, pas chaque système.

Un build de diagnostic pourra activer un niveau plus fin.

---

# 12. WebGPU / wgpu

La pixelisation des icônes impose de surveiller explicitement cette couche.

À journaliser quand l’environnement le permet :

- création du device ;
- changement d’adapter ;
- perte du device ;
- erreur WebGPU non capturée ;
- erreurs validation ;
- erreurs internes ;
- erreurs mémoire ;
- reconfiguration de surface ;
- changement de canvas width/height ;
- changement de device pixel ratio ;
- création/destruction de texture critique ;
- numéro de frame construit ;
- numéro de frame soumis.

Dans le navigateur/WebView, enregistrer notamment les événements de perte du device et les erreurs non capturées exposées par WebGPU.

Le rapport doit pouvoir faire apparaître :

```text
WebGPU device: alive
last render build: 93440
last queue submit: 93440
last RAF: 93452
```

Cela montrerait que l’affichage continue à demander des frames mais que le renderer ne soumet plus rien.

---

# 13. Détection d’un freeze interne

Le watchdog compare les timestamps uniquement lorsque :

```text
app_foreground == true
expected_activity == true
```

Ne pas conclure à un freeze si :

- l’application est en background ;
- iOS a suspendu les timers ;
- aucun rendu n’est volontairement demandé ;
- le projet est dans un état volontairement statique.

Exemple de seuils de départ à tester :

```text
JS heartbeat stale       > 1 s
RAF stale                > 1 s si animation/rendu attendu
WASM update stale        > 1 s si update attendu
Bevy frame stale         > 1 s si rendu attendu
Renderer stale           > 1 s si frame demandée
Incident confirmé        > 2-3 vérifications consécutives
```

Ces valeurs doivent être calibrées sur les appareils réels et ne pas devenir des constantes arbitraires.

---

# 14. Snapshot automatique lors d’un incident

Quand une couche devient stale :

1. ne pas effacer le ring buffer ;
2. marquer immédiatement l’incident ;
3. conserver l’état de tous les heartbeats ;
4. conserver le dernier événement de chaque couche ;
5. capturer le contexte applicatif minimal ;
6. tenter une persistance asynchrone ;
7. continuer à enregistrer quelques secondes si le système le permet ;
8. finaliser le rapport au prochain lancement si nécessaire.

Exemple :

```text
INCIDENT partial_freeze

native_background: ALIVE
native_main:       ALIVE
javascript:        ALIVE
raf:               ALIVE
input:             ALIVE
wasm:              STALE  3.42 s
bevy:              STALE  3.39 s
renderer:          STALE  3.38 s

last_active_input: lasso.pointerMove
last_operation: object.transform
last_tool: select
```

---

# 15. Persistance

Le flight recorder fonctionne d’abord en mémoire.

Ajouter ensuite un snapshot compact sur stockage local :

- écriture asynchrone ;
- rotation ;
- fichier temporaire puis rename atomique si pertinent ;
- pas d’I/O synchrone sur le thread d’interface ;
- taille maximale stricte ;
- conservation limitée.

Au redémarrage :

```text
previous_session_clean_shutdown = false
```

→ charger le dernier snapshot et créer automatiquement un `incident_report`.

---

# 16. Rapport d’incident standard

Créer un package exportable de ce type :

```text
atome-debug-2026-09-25-172103/
├── manifest.json
├── incident.json
├── trace.jsonl
├── heartbeats.json
├── errors.jsonl
├── renderer.json
├── environment.json
└── user-note.txt
```

Si disponibles, on pourra y associer séparément :

```text
MetricKit diagnostic
Apple hang log
tailspin
crash report
sysdiagnose reference
screenshot
screen recording
```

Le rapport doit être lisible sans accès au serveur.

---

# 17. Données à inclure dans `environment.json`

Inclure :

```text
atome version
build number
commit/hash si disponible
date du build
plateforme
version iOS
modèle appareil
architecture
langue
timezone
taille écran
device pixel ratio
mémoire observable
état foreground/background
backend renderer
WebGPU adapter info si accessible et non sensible
session id aléatoire
```

Ne jamais inclure automatiquement :

- mot de passe ;
- token d’authentification ;
- contenu privé du projet ;
- messages privés ;
- données personnelles inutiles ;
- clés API ;
- cookies ;
- données médicales ;
- texte saisi par l’utilisateur sans nécessité explicite.

---

# 18. TestFlight

TestFlight doit rester un canal complémentaire.

Apple permet aux testeurs d’envoyer :

- captures d’écran ;
- commentaires ;
- feedback de crash ;
- informations de build et d’appareil.

Le détail d’un feedback peut notamment contenir :

- version/build ;
- uptime de l’application ;
- modèle de l’appareil ;
- version iOS ;
- niveau de batterie ;
- type de connexion ;
- architecture ;
- espace disque disponible ;
- résolution écran ;
- timezone.

Les crashs TestFlight peuvent être ouverts dans Xcode.

**Limite :** un freeze partiel qui ne termine pas le processus peut ne produire aucun crash report suffisant.

Le flight recorder d’atome reste donc obligatoire.

---

# 19. Procédure bêta-testeur — version courte

À mettre dans les instructions TestFlight.

## Quand atome se fige ou devient bizarre

1. **Ne pas forcer immédiatement la fermeture de l’app.**
2. Noter ce qui fonctionne encore :
   - lasso ;
   - zoom ;
   - scroll ;
   - toucher ;
   - audio ;
   - animation ;
   - autre.
3. Faire une capture d’écran si possible.
4. Noter l’action qui a précédé le problème.
5. Noter l’heure exacte ou envoyer immédiatement le feedback afin que l’heure puisse être corrélée.
6. Envoyer un feedback TestFlight avec la capture.
7. Si la détection de hang Apple est activée et produit un diagnostic, conserver le hang log/tailspin.
8. Si un diagnostic système Apple est demandé, utiliser Feedback Assistant / la procédure sysdiagnose Apple.
9. Ensuite seulement, relancer l’application.
10. Après relance, accepter l’envoi du rapport d’incident interne d’atome si cette fonction est activée.

### Texte simple à fournir aux testeurs

```text
Si atome se fige :
- ne quitte pas tout de suite l’app ;
- note ce qui fonctionne encore ;
- fais une capture ;
- note l’action juste avant le bug ;
- envoie immédiatement un feedback TestFlight ;
- puis relance l’app et envoie le rapport de diagnostic proposé par atome.
```

---

# 20. Hang Detection Apple sur appareil

Apple fournit une détection de hang sur l’appareil pour les applications signées pour le développement ou distribuées par TestFlight.

Lorsque le menu Développeur est disponible :

```text
Réglages
→ Développeur
→ Hang Detection
```

Apple permet de régler un seuil de détection ; les outils Apple peuvent ensuite produire :

- notification de hang ;
- hang log texte ;
- tailspin exploitable dans Instruments.

Cette fonction est particulièrement utile pour les testeurs capables de l’activer.

Elle ne remplace pas le flight recorder d’atome car un blocage partiel peut laisser suffisamment de composants actifs pour ne pas être classé comme un hang global.

---

# 21. MetricKit

Intégrer MetricKit au conteneur Apple.

Objectifs :

- recevoir les diagnostics de performance/hang ;
- récupérer la durée du blocage ;
- récupérer les informations de pile fournies par Apple ;
- corréler le diagnostic avec le build et la session d’atome.

Les anciennes API `MXHangDiagnostic` / `MXDiagnosticPayload.hangDiagnostics` sont désormais dépréciées dans les SDK Apple récents.

Prévoir :

- nouvelle API MetricKit quand elle est disponible sur l’OS ciblé ;
- chemin de compatibilité pour les versions iOS plus anciennes supportées par atome ;
- normalisation des deux formats vers le même modèle interne `incident`.

Ne pas coder le reste du framework directement contre les types Apple.

Créer un adaptateur :

```text
AppleMetricKitAdapter
        ↓
AtomeIncident
```

---

# 22. Xcode Organizer

Après diffusion des builds :

- consulter les crashs ;
- consulter les hangs disponibles ;
- regrouper par build ;
- comparer les versions ;
- vérifier si un bug disparaît après correction ;
- conserver les symboles nécessaires pour obtenir des traces utiles.

Corréler :

```text
build number
timestamp
version iOS
device
incident id atome
```

---

# 23. Quand le bug arrive sur TON iPhone relié à Xcode

Ne pas redémarrer immédiatement.

## Étape 1 — Pause Xcode

Mettre le processus en pause dans le debugger.

Récupérer les stacks de threads.

Dans LLDB, utiliser si nécessaire :

```text
thread backtrace all
```

But :

- savoir où le main thread natif est arrêté ;
- voir les threads en attente ;
- repérer lock/I/O/contention ;
- détecter une boucle active.

## Étape 2 — Safari Web Inspector

Inspecter la WKWebView/WebView :

- console JavaScript ;
- exceptions ;
- état du DOM si utilisé ;
- sources ;
- debugger ;
- appels réseau si pertinents.

Pour les builds destinés au diagnostic, vérifier que la WebView est configurée pour être inspectable conformément aux API WebKit supportées.

## Étape 3 — Instruments

Ordre pratique :

1. Time Profiler ;
2. System Trace si CPU faible ou attente suspectée ;
3. analyse des hangs ;
4. GPU/graphics tools si le problème pointe vers le rendu.

Apple recommande de distinguer notamment :

- CPU élevé → travail trop lourd ;
- CPU faible + freeze → thread souvent bloqué en attente d’une ressource, d’un lock, d’I/O ou d’IPC.

---

# 24. Sysdiagnose / Feedback Assistant

Le sysdiagnose est une collecte système Apple contenant des informations de diagnostic et des crash logs récents.

Pour éviter de maintenir une combinaison de boutons potentiellement différente selon le matériel ou les versions iOS :

- privilégier Feedback Assistant lorsqu’il est disponible ;
- suivre les instructions Apple actuelles « Sysdiagnose for iOS/iPadOS » ;
- déclencher le diagnostic **au plus près du moment du bug** ;
- noter l’heure exacte ;
- ne pas remplacer le flight recorder interne par le sysdiagnose.

Feedback Assistant peut joindre automatiquement un sysdiagnose lorsqu’il collecte un rapport avec l’autorisation de l’utilisateur.

---

# 25. Instrumentation des opérations

Chaque opération importante devrait pouvoir produire :

```text
operation.start
operation.step
operation.end
operation.error
```

Exemple :

```text
op=739
object.resize.start
js.handler.start
wasm.call.start
bevy.transform.start
bevy.transform.end
renderer.frame.start
renderer.frame.submit
op=739 complete
```

Si le journal se termine par :

```text
wasm.call.start
```

sans retour, on sait précisément où chercher.

---

# 26. State snapshot minimal

Lors d’un incident, capturer un état synthétique, jamais tout le projet.

Exemple :

```json
{
  "mode": "edit",
  "selected_count": 2,
  "active_tool": "select",
  "pointer_state": "drag",
  "lasso_active": true,
  "project_loaded": true,
  "pending_js_jobs": 3,
  "wasm_update": 93440,
  "bevy_frame": 93440,
  "renderer_frame": 93440
}
```

Éviter d’enregistrer le contenu métier lui-même.

---

# 27. Détection des erreurs silencieuses

Certaines erreurs ne crashent pas l’application.

Créer des invariants :

```text
selected_object_id doit exister
frame_id ne doit pas reculer
operation.start doit recevoir un end/error
renderer requested frame ne doit pas rester pending indéfiniment
pointer capture doit être libérée
bridge request doit recevoir réponse ou timeout
```

Quand un invariant casse :

```text
debug.assertion_failed
```

avec le contexte minimal.

Ces assertions peuvent être actives en bêta avec un coût faible.

---

# 28. Timeout des ponts JS ↔ WASM ↔ natif

Chaque appel asynchrone critique doit posséder :

```text
request_id
start_time
timeout
completion/error
```

Exemple :

```text
bridge.request id=582 JS→WASM
bridge.timeout id=582 elapsed=2200ms
```

Cela permet de repérer un pont qui « avale » une opération sans crash.

---

# 29. WebGPU : événements prioritaires

Créer des logs dédiés :

```text
gpu.device.created
gpu.device.lost
gpu.error.validation
gpu.error.internal
gpu.error.out_of_memory
gpu.surface.reconfigured
gpu.canvas.resized
gpu.frame.requested
gpu.frame.built
gpu.frame.submitted
```

Si les icônes deviennent pixelisées, enregistrer également les changements de :

```text
canvas width
canvas height
CSS size
devicePixelRatio
render scale
texture dimensions critiques
```

Une incohérence de taille ou de scale deviendra immédiatement visible dans le rapport.

---

# 30. Dégradation contrôlée

Le système de debug ne doit jamais créer lui-même un freeze.

Règles :

- pas de gros JSON construit à chaque frame ;
- pas d’écriture disque à chaque heartbeat ;
- pas d’upload réseau sur le thread UI ;
- pas de stack trace complète à chaque événement ;
- échantillonnage ;
- ring buffer borné ;
- niveaux `off / error / beta / verbose`.

Proposition :

```text
production : error
testflight : beta
development: verbose
```

---

# 31. Upload des rapports

Pour les builds bêta :

- stocker d’abord localement ;
- uploader au prochain moment sûr ;
- retry borné ;
- suppression après confirmation serveur ;
- permettre un export manuel ;
- respecter le consentement et la politique de confidentialité.

Identifiant :

```text
incident_id = UUID aléatoire
```

Ne jamais utiliser un identifiant personnel comme clé principale.

---

# 32. Corrélation serveur

Stocker les incidents de façon à pouvoir grouper :

```text
build
iOS version
device model
incident classification
last subsystem alive
last operation
renderer backend
GPU/device-lost flag
```

Le but est de pouvoir détecter rapidement :

```text
80 % des incidents du build 381
→ iOS X
→ même appareil
→ renderer stale
→ juste après canvas.resize
```

---

# 33. Détection de régression

Après chaque correction :

- conserver une signature de l’incident ;
- comparer le build suivant ;
- vérifier le nombre d’occurrences ;
- ne pas considérer un bug comme corrigé uniquement parce qu’il n’est plus reproduit localement.

---

# 34. Tests artificiels obligatoires

Créer des tests de diagnostic qui provoquent volontairement chaque catégorie.

## Test A — Bloquer JavaScript

Bloquer volontairement la boucle JS pendant quelques secondes.

Attendu :

```text
native_background OK
javascript STALE
raf STALE
```

## Test B — Arrêter RAF

Simuler une absence de progression graphique.

Attendu :

```text
javascript OK
raf STALE
```

## Test C — Panic/trap WASM

Attendu :

```text
javascript OK
wasm error
wasm heartbeat STALE
```

## Test D — Arrêter Bevy update

Attendu :

```text
JS OK
RAF éventuellement OK
WASM/Bevy STALE
```

## Test E — Renderer bloqué

Attendu :

```text
JS OK
RAF OK
Bevy OK
renderer STALE
```

## Test F — UI locale cassée, lasso toujours vivant

Désactiver volontairement un handler d’un outil sans arrêter le reste.

Attendu :

```text
tous heartbeats OK
lasso OK
tool handler missing/timeout
classification = logical_partial_freeze
```

## Test G — Background/foreground

Vérifier que le throttling iOS ne produit pas de faux incident.

## Test H — Pression mémoire

Vérifier que le diagnostic enregistre l’avertissement sans aggraver la situation.

---

# 35. Priorités d’implémentation

## P0 — indispensable

- `window.onerror` ;
- `unhandledrejection` ;
- ring buffer ;
- session/build/operation IDs ;
- heartbeats JS/RAF/WASM/Bevy/renderer ;
- watchdog natif ;
- snapshot sur incident ;
- persistance locale ;
- export du rapport ;
- procédure bêta-testeur.

## P1 — Apple

- MetricKit ;
- TestFlight workflow ;
- Xcode Organizer ;
- Hang Detection ;
- logs Apple ;
- corrélation des timestamps.

## P2 — graphique

- WebGPU device lost ;
- erreurs WebGPU ;
- instrumenter frame requested/built/submitted ;
- canvas size / DPR / render scale ;
- texture/surface critical state.

## P3 — analyse automatique

- classification automatique ;
- regroupement serveur ;
- signatures d’incident ;
- détection de régression ;
- dashboard interne de bugs.

---

# 36. Résultat attendu

À terme, un rapport doit pouvoir dire quelque chose de ce type sans interprétation manuelle :

```text
INCIDENT #A7E2

Type:
partial_render_freeze

Build:
381

Device:
iPhone / iOS ...

Last known state:
edit / select / lasso active

Subsystem state at incident:
native_background  ALIVE
native_main        ALIVE
javascript         ALIVE
RAF                ALIVE
input              ALIVE
WASM               ALIVE
Bevy               ALIVE
renderer           STALE 4.2 s

Last renderer event:
gpu.surface.reconfigured

Last renderer frame:
93440

RAF continues until:
93472

GPU error:
none captured

Hypothesis class:
renderer / WebGPU / surface / compositor

User observation:
icons pixelated
lasso still functional
```

Ou :

```text
Subsystem state:
native_background  ALIVE
native_main        ALIVE
javascript         STALE
RAF                STALE
WASM               STALE

Hypothesis class:
JavaScript/WebKit main execution path
```

Le système ne doit pas prétendre connaître la cause définitive.  
Il doit réduire très fortement le périmètre de recherche.

---

# 37. Règle de conception

Le système de debug d’atome doit être considéré comme une infrastructure du framework, au même niveau qu’un système de persistence ou de rendu.

Il doit être :

- indépendant de l’UI ;
- indépendant des outils courants ;
- activable par environnement ;
- extensible ;
- peu coûteux ;
- compatible avec de futures couches ;
- capable de fonctionner même quand une partie d’atome ne fonctionne plus.

Chaque nouveau sous-système critique du framework devra pouvoir déclarer :

```text
I am alive
I started operation X
I completed operation X
I failed operation X
```

---

# 38. Procédure développeur résumée

Quand un bug arrive localement :

```text
1. Ne pas quitter l’app.
2. Noter ce qui fonctionne encore.
3. Xcode → Pause.
4. Capturer toutes les stacks.
5. Inspecter la WKWebView avec Web Inspector.
6. Regarder le flight recorder.
7. Identifier le premier heartbeat devenu stale.
8. Utiliser Instruments si nécessaire.
9. Sauvegarder le rapport.
10. Corréler avec MetricKit / Apple logs.
```

Quand un bug arrive chez un bêta-testeur :

```text
1. Ne pas quitter immédiatement.
2. Capture d’écran.
3. Noter l’action précédente et ce qui fonctionne encore.
4. Feedback TestFlight immédiat.
5. Hang Detection/tailspin si disponible.
6. Diagnostic Apple/sysdiagnose si demandé.
7. Relancer.
8. Envoyer le rapport d’incident interne d’atome.
9. Corréler heure + build + incident_id.
```

---

# 39. Critère de validation final

Cette tâche n’est pas terminée tant qu’un freeze artificiel de chaque couche ne produit pas un rapport permettant de distinguer au minimum :

```text
native
javascript
RAF
WASM
Bevy
renderer/WebGPU
blocage logique local
```

et tant qu’un bêta-testeur non développeur ne peut pas fournir un rapport exploitable sans connecter son iPhone à Xcode.

---

# 40. Références Apple vérifiées

Documentation / ressources à conserver avec cette tâche :

- Apple Developer — **View tester feedback** : feedback TestFlight, captures, crash feedback et métadonnées de test.
- Apple Developer — **Beta tester feedback** : détail des informations appareil/build reçues avec le feedback.
- Apple Developer — **Track down hangs with Xcode and on-device detection** : Hang Detection sur appareil, hang log et tailspin pour builds de développement/TestFlight.
- Apple Developer — **MetricKit / MXHangDiagnostic** : anciens diagnostics de hang et call stack ; API historiques désormais dépréciées au profit des nouvelles API MetricKit.
- Apple Developer — **Feedback Assistant** : collecte de diagnostics et sysdiagnose.
- Apple Developer — **Profile, fix, and verify: Improve app responsiveness with Instruments** : différencier CPU saturé et thread bloqué, utiliser Time Profiler puis System Trace.
- Apple Developer — **Analyze hangs with Instruments** : analyse des hangs et boucles d’événements/rendu.

Liens :
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/view-tester-feedback
- https://developer.apple.com/help/app-store-connect/reference/testflight/beta-tester-feedback
- https://developer.apple.com/videos/play/wwdc2022/10082/
- https://developer.apple.com/documentation/metrickit/mxhangdiagnostic
- https://developer.apple.com/feedback-assistant/
- https://developer.apple.com/videos/play/wwdc2026/268/
- https://developer.apple.com/videos/play/wwdc2023/10248/

---

# 41. Instruction d’implémentation pour Codex

Objectif : intégrer cette infrastructure dans atome sans coupler le système à une feature, un menu ou un composant graphique particulier.

Avant modification :

1. identifier précisément le chemin natif iOS/Tauri ;
2. identifier la WKWebView/WebView ;
3. identifier où vit le JavaScript principal ;
4. identifier le pont JS ↔ WASM ;
5. identifier la boucle Bevy ;
6. identifier la couche wgpu/WebGPU ;
7. identifier le chemin réel du lasso ;
8. documenter ces relations avant de coder.

Ensuite :

- créer le debug core ;
- créer les adapters par couche ;
- connecter les heartbeats ;
- implémenter le ring buffer ;
- implémenter les captures d’erreurs ;
- implémenter la détection de stale subsystem ;
- implémenter le rapport local ;
- ajouter les adapters Apple ;
- ajouter les tests artificiels ;
- mesurer l’overhead ;
- ne considérer la tâche terminée qu’après validation sur appareil réel et TestFlight.

**Contrainte :** aucune modification du système de debug ne doit imposer une architecture spécifique aux autres briques d’atome. Le debug observe et collecte ; il ne devient pas le contrôleur fonctionnel du framework.
