# Nettoyage menus + outils Create — 16 août 2026

Suite de la réparation du boot (palette `sound` sans famille d'accent → toolbar absente
+ header qui clignote 10 s). Quatre chantiers demandés.

## A. Panel Lab supprimé — FAIT

Code de test, retiré entièrement.

- 13 modules supprimés : `eVe/intuition/runtime/bevy_panel/bevy_panel_lab_*.js`
- Références nettoyées : `eVeIntuition.js`, `boot_runtime.js` (action `ui.dev.panel_lab`),
  `context_tool_invocation_runtime.js`, `main_menu_runtime.js`,
  `main_menu_content_runtime.js`, `bevy_panel_surfaces.js` (`isPanelLabEnabled`)
- 162 clés i18n `eve.panel_lab.*` retirées (81 fr + 81 en)
- Vérifié : `grep -rn "PanelLab\|panel_lab\|PANEL_LAB" eVe --include="*.js"` → 0 hit hors documentations

## B. Logs supprimés — FAIT

Seuls `eVe Version` et `atome version` restent (kickstart.js, inchangé).

- `atome/src/squirrel/voice/telemetry.js` : `writeVoiceDiagnostic` passe en **opt-in**
  (`window.__EVE_VOICE_DIAGNOSTICS__ = true` pour les récupérer). C'était la seule
  source bruyante : ~20 sites d'appel, dont `voice.microphone.level` par échantillon.
- `eVe/intuition/tools/user_login_debug_log.js` : le pont console iOS suit le même
  opt-in que le `console.debug` (il envoyait chaque étape de login au log device).
- Les 7 `console.warn` restants dans eVe sont des chemins d'erreur — conservés.

Console après correction (session fraîche) :
```
[error] An unknown error occurred when fetching the script.   <- navigateur, pas nous
[log] eVe Version : 0.OO5
[log] atome version : 1.5.0.19
```
L'`error` restante vient de `navigator.serviceWorker.register('/sw.js')` refusé par le
navigateur intégré ; `early-init.js` l'attrape déjà (`.catch`), le message est émis par
le navigateur lui-même. Rien à supprimer côté code.

## C. Palette son → contextuelle — FAIT

- Retirée de `toolbox.children` (`main_menu_content_runtime.js`)
- **Définitions conservées** : `sound` + les 10 `sound_*` restent déclarés
- Projetée sur le footer d'édition d'atome pour les kinds `sound` et `audio`
  (`atome_edit_footer_model_runtime.js`), juste après `play`
- Le footer résout ses définitions via `intuitionContent[key]` et gère les palettes :
  aucune duplication de la liste des verbes

## D. Palette Create — FAIT (sauf 1 limite documentée)

### D1 · Le clic ruban n'armait pas l'outil texte  → corrigé
`text_tool_create_runtime.js` décidait « clic menu » vs « clic canvas » sur une liste de
couches DOM historiques (`goey_menu*`, `toolbox_menu*`). Le ruban Bevy envoie
`bevy_ui_main_menu` : le clic tombait dans la branche **création** et créait un atome
texte 220×72 immédiatement, sans jamais armer le mode ni allumer le bouton.
→ `bevy_ui_main_menu` + `tool.main` ajoutés aux couches menu.

### D2 · États activés  → corrigé
`text_create` et `code_create` n'étaient pas des latches (`code_create` était même
`momentary` + `gateway_action: 'pointer.click'`, donc jamais d'action « off »).
→ les trois verbes de Create (`text_create`, `draw_create`, `code_create`) sont
`action: 'toggle'` + `latch: true`, sans `gateway_action` forcé.

### D3 · Draw sans retour visuel  → corrigé
`draw` était une palette **imbriquée** dans `create`. Le ruban n'expose qu'un niveau :
`buildBevyMainMenuItems` ne cherche `activePaletteKey` que parmi les entrées de premier
niveau, et `paletteEntry()` ne trouvait donc jamais `draw` → `setActivePalette` renvoyait
`false` → **aucun effet, aucun retour**.
→ Create expose `draw_create`, un verbe latché sur `tool.main.draw`. Les sous-options
(freehand / rectangle / ellipse / points / taille / couleur) restent sur la palette
`draw`, projetée par le footer d'édition sur un atome SVG — même logique que le son.

### D4 · Draw ne s'arrêtait pas  → corrigé
Les modes de dessin étaient `momentary` avec `gateway_action: 'state.on'` en dur, et
`ui.draw.mode.*` ne déclarait pas `state.off` : le runtime n'avait aucune action « off »
à résoudre.
→ `button_type: 'latch'` + `state.off` dans les 3 définitions
(`tool_runtime_bootstrap_defs_b.js`), et les entrées menu passent en toggle latché.

### D5 · Code empilait les éditeurs, impossible à fermer  → corrigé
`eVe/intuition/tools/code.js` n'avait ni état ni fermeture : chaque clic construisait un
nouvel éditeur CodeMirror par-dessus le précédent, et rien dans l'UI ne pouvait les
refermer.
→ un seul éditeur possédé par l'outil, `toggleCodeEditor` en handler, `onClose` pour
suivre une fermeture faite depuis l'éditeur lui-même, API `close/toggle/isOpen/warmup`.

### D6 · Performance
Mesuré après correction : 1ʳᵉ ouverture du code **167 ms** (import du bundle CodeMirror,
474 Ko), ouvertures suivantes **5–11 ms**, fermeture **1 ms**. L'import reste paresseux
(rien n'est téléchargé si l'éditeur n'est jamais ouvert) ; `eveCodeToolApi.warmup()`
permet de payer ce coût à l'avance. Le vrai coût d'avant était l'empilement : N éditeurs
CodeMirror vivants après N clics.

### Limite restante — palettes imbriquées
Le ruban ne sait ouvrir qu'un seul niveau de palette. `generator` (enfant palette de
`create`) reste donc inerte au clic. Sa liste d'enfants est vide tant qu'aucun générateur
n'est enregistré, donc l'impact visible est nul aujourd'hui, mais le bouton ne fera rien
tant que le ruban n'aura pas un vrai support d'imbrication (modèle + `paletteEntry` +
`createBevyMainMenuPaletteMotion`, qui exige aujourd'hui un parent de premier niveau).

## Probes

- `temp/palette_accent_boot_probe.mjs` — familles d'accent de palette
- `temp/create_palette_tools_probe.mjs` — routage menu du texte, contrat des verbes
  Create, `state.off` du dessin, son contextuel, toggle du code

Rouge vérifié au HEAD pour les deux (la 2ᵉ montre au HEAD
`{"created":true,"atome_id":...}` sur un clic ruban « texte »).

## Vérifié dans l'app (session fraîche)

| Contrôle | Résultat |
|---|---|
| toolbox | `home find capture time communicate mode view create` (ni `sound` ni `panel_lab`) |
| Create | `text_create draw_create code_create page_create generator` |
| texte | `state.on` → latch + `__eveTextTool.isActive() === true` ; 2ᵉ clic → `state.off` |
| dessin | `state.on` → latch + `__eveDrawTool.isActive() === true`, mode `brush` ; 2ᵉ clic → off |
| code | ouvre (1 nœud DOM, latch) ; 2ᵉ clic ferme (0 nœud, latch off) |
| arbres montés | `dashboard_bevy_ui` + `eve_bevy_ui_main_menu` |
| dashboard | `render_in_flight: false`, `render_queued: false` |

## Non vérifiable ici

La palette son sur le footer d'un atome audio et la saisie de texte au clic sur le canvas
demandent un projet ouvert. Le compte anonyme de cet environnement n'est pas provisionné
côté serveur (`remote_account_not_provisioned` en phase `project_bootstrap`), donc aucun
projet ne s'ouvre. Les deux sont couverts par lecture de code + probe, pas par un test
bout en bout.
