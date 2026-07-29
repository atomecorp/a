# Chauffe iOS — boucle de rendu et consommation

Fait le 29/07/2026. Toutes les mesures ci-dessous ont été relevées, pas estimées.

## Point d'architecture

Sur iOS il n'y a **pas** de renderer Bevy natif : `atome_ios_bevy_renderer_status()`
renvoie `presentable: 0` / `linked_no_presenter`, donc `shouldUseNativeBevyRenderer()`
est faux et l'app rend via le **WASM Bevy WebGPU dans WKWebView**. La chaleur venait
donc du couple WKWebView + wasm + WebGPU, pas du code Swift.

## Cause dominante corrigée

`web_winit_settings()` utilisait `UpdateMode::reactive(16ms)` pour `focused_mode`
**et** `unfocused_mode`. En mode `Reactive`, `bevy_winit` lance un `app.update()`
complet — extract + render + present — à chaque expiration du `wait`, que quoi que
ce soit ait changé ou non. Résultat : ~60 redessins plein écran par seconde sur un
projet immobile, sans un doigt sur l'écran.

Remplacé par un **battement de cœur de 1 s** ; les frames sont désormais produites
par les wakes, que le runtime JS émet déjà à cadence rAF sur chaque lot d'ops.

Piège rencontré : livrer un `WakeUp` coûte un tour de boucle supplémentaire (Bevy
ré-arme `window.request_redraw()` après chaque update), donc un wake par frame
n'atterrissait qu'une frame sur deux → 30 ticks/s. Un wake fusionné est maintenant
mémorisé (`WEB_WAKE_COALESCED`) et ré-émis en fin de tick.

| scénario | avant | après |
|---|---|---|
| repos, rien ne bouge | ~60 ticks/s | **1,0 tick/s** |
| activité (wake à cadence rAF) | ~60 ticks/s | **59,9 ticks/s** |

## Autres corrections

- **MSAA.** Aucune caméra n'insérait de composant `Msaa` ; le défaut Bevy est
  `Sample4`. Les formes sont pourtant anti-aliasées analytiquement dans les shaders
  (`smoothstep` sur la SDF). `Msaa::Off` posé sur les 4 caméras.
- **Flou plein écran.** Capture et cibles ping-pong allouées à `pixel_size / 4`,
  rayon divisé d'autant, et `sigma` plafonné à 32 dans le shader. Le coût d'une
  gaussienne séparable étant `pixels × taps × 2`, et les deux termes suivant la
  résolution, un facteur 4 divise le travail par ~64. Le rayon 48 px par défaut
  passe de ~73 taps/pixel/passe à ~19.
  `screen_dimensions` dans `procedural_sdf.wgsl` ne peut plus venir de
  `textureDimensions(blurred_texture)` : le DPR transite par `shape.z`.
- **Polling de fond.** Les trois watchers permanents (1,2 s, 1 s, 1 s) passent par
  `eVe/shared/visibility_aware_interval.js` : arrêt complet quand le document est
  caché, tick de rattrapage au retour.

## Hypothèses invalidées par la mesure

- **DPR.** Déjà plafonné à 1,5 (`MAX_RENDER_SURFACE_DEVICE_PIXEL_RATIO`), pas 3.
  Rien à faire ; les estimations de coût du flou ont été recalculées en conséquence.
- **Profil WASM.** `-Oz` ne coûte que ~25 % de CPU par frame de plus que
  `opt-level=3` + `-O2` (0,50 ms contre 0,38 ms de moyenne sur 600 frames), pour un
  binaire **deux fois plus petit** (13,4 Mo contre 26,9 Mo) et un démarrage **plus
  rapide** (init 114 ms contre 178 ms). `-Oz` conservé. Le premier relevé, qui
  semblait donner 4× en faveur de la vitesse, était un relevé à froid.
- **`backdrop-filter` CSS.** Compté dans l'app réelle : 2 éléments déclarants,
  **0 visibles** au repos. Le grep statique comptait des sites de code, pas des
  couches vivantes. Aucun changement visuel fait.

## Comment re-vérifier

```bash
node temp/energy_probe/bench_runner.mjs loop
node temp/energy_probe/bench_runner.mjs perf
node temp/energy_probe/visibility_interval_probe.mjs
```

Le banc a besoin du serveur sur `127.0.0.1:3001`. Il tourne sous Playwright et non
dans le pane navigateur intégré, qui rapporte `document.hidden: true` — rAF y est
gelé et toute mesure de boucle y est invalide (constaté : 0 tick partout).

`temp/energy_probe/ios_energy_probe.js` fait la même mesure depuis la console
Safari attachée à la WKWebView, pour relever les chiffres sur l'iPhone lui-même.

Reste à faire côté device : jauge Energy Impact d'Xcode et Instruments Metal System
Trace avant/après, et vérifier si `UIBackgroundModes: audio` laisse la boucle
tourner en arrière-plan (le pilotage par rAF devrait la geler, à confirmer).
