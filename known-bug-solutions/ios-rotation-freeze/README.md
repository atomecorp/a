# iOS rotation freeze: stale presented frame and a pinned hidden editor

## Symptom

On iPhone, after a while of use, the interface stops answering: the bottom tool
band does nothing, and any tool that is tapped raises the keyboard instead of
opening. Reported on 2026-09-22 with two captures (17.20.31 and 17.20.45): the
landscape capture (2622×1206, i.e. 874×402 CSS at DPR 3) shows a written text;
the portrait capture (1206×2622) shows the **same** picture stretched and
deformed, and the app no longer repaints.

## Confirmed cause — two independent owners

### 1. The resize intent was swallowed, so the compositor stretched the old frame

`surface_runtime.js` measures the surface with
`syncRenderSurfaceSize()`/`syncCanvasSize()`, which writes `SURFACE_SIZE`. That
measurement is also written by callers that publish **no** intent — the WASM
renderer boot and the backing guard do exactly that. `applySurfaceResize()`
then compared the freshly resolved size against `SURFACE_SIZE` instead of
against the size the engine had actually received through `surface.resize`. As
soon as another owner wrote the measurement first (boot, a backing guard, a
rotation burst), the reconciliation frame concluded "already at the right size"
and emitted nothing: the canvas kept the previous physical geometry while the
CSS carried the new one, and the compositor stretched the last presented image
into the new box. No later reconciliation could repair it, because the
comparison was made against the value that had just been written.

The renderer had the same class of guard one level down:
`applyBevyWebRendererSurfaceResize()` returned `resized: false` as soon as the
*logical* width/height matched, even when the backing or the DPR had moved, so
`apply_atome_bevy_surface` was never re-pushed and the engine kept the old
physical surface.

### 2. The hidden editor stayed pinned, so every tap reopened the keyboard

`bevy_panel_text_editing.js` retains the field session across iOS's
end-of-long-press blur — the fix of
[ios-panel-input-fast-tap-blur](../ios-panel-input-fast-tap-blur/README.md) —
by holding `mysticFieldKey` while *its* Mystic menu stands. The flag had two
leaks, both reachable in real use:

- the opening itself can fail (`bevy_mystic_runtime_unavailable`: the Mystic
  runtime is mounted only after the boot presentation, so the first long press
  of a session can precede it), and the `await` threw **before** the "second
  long press toggles it shut" cleanup ran;
- the menu owner can remove the menu without ever calling the `onClose` it was
  given — a rotation, a suspended menu, a work-mode change do that.

A permanently truthy `retainOnBlur` keeps the hidden `<textarea>` mounted and
reclaims the focus at every blur, so the next tap on any tool re-raises the iOS
keyboard, and the tool band below it no longer receives the gesture: the field
is dead but still owns the focus, which is the "nothing answers, the keyboard
opens everywhere" part of the report.

## Durable correction

- `surface_runtime.js` keeps a second, distinct register: `SURFACE_RENDER_SIZE`
  is the size the engine was **actually told**. `applySurfaceResize()` decides
  the `surface.resize` intent against it and updates it when the intent is
  emitted; `ensureRenderSurface()` seeds it with the initial projected size. A
  silent measurement can no longer consume the intent — the settled
  reconciliation republishes the geometry the engine never received. No second
  renderer, state, or timer is introduced: one extra WeakMap at the owner that
  already owns the intent.
- `bevy_web_renderer_runtime.js` compares the full signature it is about to
  push — logical size, physical pixels, device pixel ratio, and whether the
  backing actually changed — before skipping a surface patch.
- `bevy_panel_text_editing.js` retains the field only while **both** hold: the
  field is the recorded one, and `isMysticMenuOpen()` is true at blur time.
  The long-press opening is wrapped in `try/catch/finally`, so a refused
  opening reports itself on the notice line and clears the flag instead of
  pinning the session for the rest of the app run.

## Rejected hypotheses

- *The deformation is a rendering artefact of the WebGPU canvas itself.* The
  two captures prove it is a **compositor stretch**: the portrait image is the
  landscape bitmap resampled with `sx = 0.536`, `sy = 2.03` (mean absolute
  error 1.41/255 against 33.90 for a genuine box-swap at 0.460/2.174). The
  pixels are the previous frame, not a new one.
- *The `mysticFieldKey` leak alone explains the deformation.* It does not:
  cause 1 is a surface/renderer contract, cause 2 is focus ownership. Both are
  required, and both are fixed.

## Open hypothesis (not fixed, no proof yet)

`hidden_text_service_runtime.js` keeps a shared `<textarea>` mounted at
`bottom: 0` (≥24 px, `pointerEvents: auto`). It is a candidate for stealing a
bottom-band tap through `elementFromPoint` in
`surface_hit_target_runtime.js` — but no measurement has established that yet,
and enlarging that element or its hit area without evidence would be a
regression of its own. Keep it as the first thing to measure if a bottom-band
dead tap survives the next physical-device run.

## Regression evidence

Added, and each one fails on the pre-fix code (verified by reverting the fix
patch and re-running):

- `tests/eve/render_surface_size_contract.test.mjs` — "A silent surface
  measurement must not swallow the reconciled resize intent": mount at 800×600,
  let a silent owner measure 874×402, then require the settled reconciliation to
  publish exactly one `surface.resize` carrying the new size and the previous
  one; a second reconcile stays silent.
- `tests/eve/bevy_project_renderer_guards.test.mjs` — "Bevy web runtime
  republishes the surface when only the physical signature changed": same
  logical size, DPR moving from 1 to 1.5, the patch must be re-pushed with
  `pixel_width: 1311`, and the identical call right after must collapse to
  `resized: false`.
- `tests/eve/bevy_panel_text_editing_retention.test.mjs` — both directions: a
  refused Mystic opening releases the field on the next blur, and a standing
  menu still retains it, while a menu removed without `onClose` (rotation) no
  longer pins it.

`tests/eve/*` is ignored by default; the new retention suite is whitelisted in
`.gitignore` next to the other persistent eve suites, or it would exist only on
this machine and never be committed.

## Verification

- Pixel analysis of the two captures was reproduced during this investigation
  (`temp/iosrot/match.mjs`, removed afterwards with the other probe files).
- 59 tests over 10 suites (surface size, surface reconciliation, Bevy renderer
  runtime and redraw, text editing session, main-menu geometry, panel input,
  multiline input, field copy, and the new retention suite) pass;
  `npm run check:syntax` passes on 2175 files.
- **Physical-device iOS acceptance remains to be done.** The native lane could
  not be driven from this session (`xcrun devicectl` escalation was refused by
  the sandbox reviewer), and no simulated lane replaces it. Required sequence
  on the device: boot, edit a text field, leave it, open a Home panel, rotate
  the device, then verify (1) the project repaints at the new geometry instead
  of showing a stretched frame, (2) the bottom band answers, and (3) no tool
  press raises the keyboard.

Correlation with commit `485507fa` ("faster boot", 2026-09-22 17:12) was
considered because the captures are seven minutes later. Nothing establishes
it; the two causes above reproduce independently of that commit.

### 3. Le champ retenu restait une cible tactile, sans focus

La session de texte de scene est **retenue** au blur par choix
(`text_bridge.js` : `retainOnBlur: true`) : le champ doit cesser de posséder le
caret pendant qu'un outil de style a l'attention, et `applyFormat` a besoin
d'une session vivante pour colorer une sélection. Mais le champ retenu restait
monté à `bottom: 0` avec `pointerEvents: auto`, sur toute la largeur que
`applyActiveTextEditorMetrics()` lui avait donnée — la largeur du texte édité.
Sans focus et pourtant touchable, il était ouvert par le premier tap qui
l'atteignait : iOS focalise un champ nativement, sans aucun JS. D'où « n'importe
quel outil ouvre le clavier » et la bande du bas morte, sous le clavier.

Correction : `hidden_text_service_runtime.js` porte la règle
(`setActiveTextEditorHitTest`), `text_editing_session.js` la rend au focus et au
`start()`, la retire quand un blur retenu ne reprend **pas** le focus (texte de
scene), et la laisse retirée quand une session est conservée pour le
propriétaire suivant. La contrainte mesurée qui imposait `pointerEvents: auto`
— WebKit refuse le glissement de curseur natif à un champ qu'il juge non
interactif — ne vaut que pendant le focus, exactement quand la cible revient.
Le chemin Mystic qui reprend son focus n'est pas touché. `text_bridge.js`
reprend la saisie sur un tap explicite via `focusActiveTextEditor()`, puisque
c'est désormais la scène qui reçoit ce geste.

Propriétaire de non-régression : `tests/eve/text_editing_session_contract.test.mjs`
(rouge sans le garde).

## Le rendu complet nomme son appelant

Le log iPhone a prouvé une boucle (91 `scene.start` pour 102 projections, états
dominants réémis en rafale, oscillation entre deux propriétaires) sans jamais
dire **qui** la demandait : `scene.start.N` ne portait que le nombre d'atomes.
`project_scene_runtime.js` publie désormais `scene.start.<atomes>.<propriétaire>`
en lisant le premier frame hors de lui-même (suffixe de hash de bundle retiré,
identifiant borné à 48 caractères). Aucun code ne parse ce stage : le tag est
additif. Propriétaire de non-régression :
`tests/eve/scene_render_owner_milestone.test.mjs`.

## La vignette de projet : second renderer Bevy et relecture GPU synchrone

Le relevé natif du 2026-09-22 (363 lignes, dépôt
`~/.codex/attachments/72fe567c-cbed-410a-962c-1f72a3ec27c1/Texte collé.txt`)
ajoute une troisième piste, mesurée celle-là :

- pas de boucle de rendu (12 `scene.start` seulement, contre 33 et 91 sur les
  relevés antérieurs) et aucune `Conversion error!` : les deux premières causes
  sont donc bien réduites sur ce build ;
- le log **s'arrête** sur un démarrage de renderer :
  `bevy.surface.132x255.198x383`, `bevy.map_start`, `bevy.map_ready`,
  `bevy.payload.text-shape-audio_waveform.746120`, `bevy.wasm_start`,
  `bevy.wasm_ready`, `bevy.run_ready` — et rien après ;
- cette surface fait **132 × 255 logiques** (198 × 383 physiques à DPR 1,5),
  soit le ratio 0,5176 ≈ 402/777 du projet iPhone : c'est une **vignette de
  carte Dashboard**, pas la surface principale (seule l'autre surface du log,
  `bevy.surface.402x778.603x1167`, est la scène).

Qui la démarre : `project_preview_runtime.js` →
`bevy_project_preview_capture_adapter.js` → la capture dans l'iframe retenue
`/eve_preview_capture.html` → `bevy_project_preview_capture_frame.js`, qui
appelle `startBevyWebRenderer({ runExportName: 'run_atome_bevy_preview_renderer' })`
— un **second** Bevy/wgpu dans le même WebProcess, avec le heartbeat
`WEB_IDLE_HEARTBEAT_MS = 500` (un `app.update()` complet, extract + render +
present, deux fois par seconde, pour toujours) puisque l'iframe et son canvas
sont conservés entre les captures.

Ce qui déclenche cette capture est exactement ce que l'utilisateur décrit :

- revenir d'un projet au panneau d'accueil force la capture du projet courant
  (`forceCurrentProjectPreview` → `forceCapture: true`, `dashboard_data_adapters.js`) ;
- une **rotation**, une édition de texte, un changement de révision changent la
  clé de cache (`buildMatrixPreviewCacheKey` : taille de cible, `sourceViewport`,
  DPR, révision) et relancent donc la capture.

Et le point bloquant est unique dans tout le domaine de rendu :

```js
canvas.toDataURL(format, 0.72)   // bevy_project_preview_capture_frame.js
```

Un canvas **WebGPU** ne se relit pas sur le thread principal : `toDataURL` y
déclenche une synchronisation avec le process GPU, dans une boucle qui, elle,
réessaie jusqu'à `CAPTURE_TIMEOUT_MS = 4200` ms. Le log natif s'arrêtant sur le
`bevy.run_ready` du renderer de capture — c'est-à-dire sur la dernière ligne
publiée avant la première relecture — est cohérent avec un thread JS qui ne rend
plus la main, alors que le clavier, lui, reste natif.

Correction appliquée :

- `bevy_project_preview_capture_frame.js` n'appelle plus `toDataURL` sur la
  surface WebGPU. Le nouvel export `snapshotCaptureCanvas` lit la surface par
  `createImageBitmap` (lecture faite par le navigateur, hors thread JS), dessine
  le bitmap dans **un seul** canvas 2D réutilisé, et encode là — le chemin déjà
  utilisé par les posters vidéo, validés sur appareil. Aucun repli silencieux :
  si `createImageBitmap` manque (`bevy_project_preview_snapshot_unsupported`) ou
  si la surface n'est pas encore présentée, la boucle garde son budget et
  retente, puis échoue nommément.
- la surface de capture porte `data-role="preview-capture-webgpu-render-surface"`,
  donc le prochain log dira `bevy.surface.preview-capture.…` : plus de taille nue.
- chaque phase de capture publie un jalon borné (`bevy.preview.start`,
  `bevy.preview.renderer_ready`, `bevy.preview.redraw_ready`,
  `bevy.preview.encode.<n>` pour n ≤ 3, `bevy.preview.visible.<n>`,
  `bevy.preview.done`, `bevy.preview.empty`). Le prochain relevé doit donc
  trancher entre trois lectures :
  1. `bevy.preview.start` → rien : le blocage est **avant** la capture (renderer
     principal, scheduler) ;
  2. `bevy.surface.preview-capture…` puis `bevy.run_ready` puis **rien** : le
     second Bevy/wgpu bloque le thread au premier `app.update()` — la capture
     doit alors cesser de démarrer un renderer dédié sur iOS ;
  3. `bevy.preview.encode.1` puis rien : la relecture de surface bloque encore,
     et il faut passer à une relecture côté moteur (GPU→buffer asynchrone).

## Pourquoi l'appareil n'a pas pu être piloté depuis cette session

`xcrun devicectl` exige une exécution hors bac à sable, et le réviseur
automatique d'approbations de cette session est en panne de configuration :

```
Automatic approval review failed: The supported API model names are
deepseek-flash, deepseek-v4-pro, but you passed codex-auto-review.
```

Le fournisseur configuré dans `~/.codex/config.toml` est `deepseek`, et le
réviseur envoie le modèle `codex-auto-review` à cet endpoint. Ce n'est pas un
refus de sécurité : **toute** commande escaladée est refusée, donc `devicectl`
(qui a besoin de `CoreDeviceService`) ne peut pas démarrer. Deux issues : passer
le réviseur en revue manuelle (`approvals_reviewer = "user"` / approbation à la
demande) pour que l'agent pilote l'appareil, ou exécuter le protocole ci-dessous
côté utilisateur.

## Protocole de vérification sur appareil (à faire)

```bash
cd /Users/jean-ericgodard/RubymineProjects/a
xcodebuild -project platforms/ios/atome-auv3/atome.xcodeproj -scheme atome \
  -configuration Debug -destination 'generic/platform=iOS' -allowProvisioningUpdates build
xcrun devicectl device install app --device 00008142-001C21C62147801C \
  "$HOME/Library/Developer/Xcode/DerivedData/atome-dfddpcrrbapckwaztgumwbwidlhf/Build/Products/Debug-iphoneos/atome.app"
xcrun devicectl device process launch --device 00008142-001C21C62147801C \
  --terminate-existing --console one.atome.app 2>&1 | tee /tmp/atome_ts.log
```

Séquence, centrée sur les gestes du rapport (pas le boot) : écrire un texte →
taper dedans → sortir du champ → toucher un outil → ouvrir le panneau d'accueil
→ tourner l'iPhone portrait → paysage → laisser 10-15 s → `Ctrl-C`.

À lire dans `/tmp/atome_ts.log`:

- `scene.start.<n>.<propriétaire>` : qui relance des rendus complets (les
  libellés explicites arrivent avec ce build, le `chunk` du relevé précédent
  venait de la pile minifiée) ;
- `bevy.surface.<zone>.…` : `preview-capture` = le renderer de vignette ;
- la séquence `bevy.preview.*` : la phase exacte du gel, selon les trois
  lectures ci-dessus.

**Aucun de ces correctifs n'a encore été construit ni exécuté sur l'appareil** :
le dernier relevé provient d'un build antérieur (son `scene.start.26.chunk` et
son `bevy.surface` sans zone le prouvent). Rien n'est déclaré corrigé tant que
la séquence ci-dessus n'a pas été rejouée.

Notes de ménage : `temp/ios_rotation_surface.probe.mjs` (sonde inutilisée) et le
dossier vide `temp/ios_freeze/` n'ont pas pu être supprimés — `rm` demande la
même approbation escaladée, cassée pour la même raison. `npx vitest run` échoue
aussi sur `project_preview_runtime.test.mjs` (fichier local non suivi) et sur
`unified_rendering_contract` : échecs préexistants, sans rapport.
