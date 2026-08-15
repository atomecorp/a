# Audit d'intégration du thème (§2)

> Mesure, pas refonte. §1 interdit d'engager un gros refactor dans cette phase.

« Elastic » ne nomme aucun module du dépôt : ce qui existe, ce sont trois systèmes
de tokens parallèles (`look`, `skin`, `system_ui`) plus deux jeux locaux
(`ribbon/tokens.js`, `tools/visual/`). Le tableau montre, par surface citée par §2,
lequel est réellement consommé et combien de valeurs visuelles restent en dur.

| Surface | Répertoire | .js | Source(s) de tokens | hex | rgb/hsl | px | total |
|---|---|---:|---|---:|---:|---:|---:|
| outils de dessin | `eVe/intuition/tools/core` | 51 | **aucune** | 7 | 12 | 6 | 25 |
| surface principale | `eVe/domains/rendering` | 115 | skin | 5 | 9 | 10 | 24 |
| toolbox principale | `eVe/intuition/ribbon` | 22 | skin, system_ui | 5 | 9 | 7 | 21 |
| vues liste | `eVe/intuition/matrix` | 23 | skin, tool visual tokens | 0 | 4 | 17 | 21 |
| dialogues / overlays | `eVe/elements/design` | 23 | system_ui | 0 | 0 | 19 | 19 |
| timeline | `eVe/intuition/tools/molecule/render` | 2 | **aucune** | 11 | 7 | 0 | 18 |
| vues projet / navigateur | `eVe/domains/dashboard` | 28 | skin, tool visual tokens | 4 | 7 | 0 | 11 |
| générateur | `eVe/intuition/tools/generator` | 4 | **aucune** | 0 | 3 | 2 | 5 |
| toolbox contextuelle | `eVe/intuition/flower` | 7 | ribbon tokens | 0 | 1 | 0 | 1 |
| palette de création | `eVe/intuition/tools/ui` | 3 | **aucune** | 0 | 0 | 0 | 0 |
| panneaux | `eVe/intuition/panels` | 5 | skin | 0 | 0 | 0 | 0 |
| assistant | `eVe/voice` | 6 | skin | 0 | 0 | 0 | 0 |
| outils audio | `eVe/intuition/tools/audio_edit` | 5 | **aucune** | 0 | 0 | 0 | 0 |

**145 valeurs visuelles en dur** sur les 13 surfaces listées par §2.

## Surfaces qui peignent sans consommer de tokens

- **outils de dessin** (`eVe/intuition/tools/core`) — 25 littéraux, aucune source de tokens importée.
- **timeline** (`eVe/intuition/tools/molecule/render`) — 18 littéraux, aucune source de tokens importée.
- **générateur** (`eVe/intuition/tools/generator`) — 5 littéraux, aucune source de tokens importée.

## Surfaces qui mélangent plusieurs systèmes de tokens

- **toolbox principale** — skin + system_ui
- **vues liste** — skin + tool visual tokens
- **vues projet / navigateur** — skin + tool visual tokens

## Fichiers de définition de tokens (littéraux attendus, non comptés)

- `eVe/intuition/matrix/visual/matrix_visual_tokens.js` — 37
- `eVe/elements/design/panel_chrome_tokens.js` — 16
- `eVe/intuition/ribbon/tokens.js` — 10
- `eVe/intuition/panels/visual/panel_visual_tokens.js` — 2

## Les 15 fichiers consommateurs les plus chargés en valeurs en dur

- `eVe/intuition/tools/molecule/render/timeline_scene.js` — 18
- `eVe/intuition/ribbon/disconnected_handle_logo.js` — 13
- `eVe/intuition/matrix/core/matrix_runtime_lifecycle.js` — 9
- `eVe/intuition/tools/core/tool_runtime_finder_execution.js` — 8
- `eVe/elements/design/panel_chrome.js` — 8
- `eVe/domains/rendering/bevy_video_hidden_dom_runtime.js` — 6
- `eVe/intuition/tools/core/svg_vector_dom_runtime.js` — 6
- `eVe/intuition/tools/core/tool_runtime_create_execution.js` — 6
- `eVe/intuition/ribbon/bevy_ui_main_menu_recording_visual_model.js` — 5
- `eVe/intuition/matrix/core/matrix_runtime_select.js` — 5
- `eVe/intuition/tools/generator/builtins.js` — 5
- `eVe/domains/rendering/bevy_media_texture_resolver.js` — 4
- `eVe/intuition/matrix/core/matrix_runtime_transform.js` — 4
- `eVe/intuition/ribbon/menu_model.js` — 3
- `eVe/domains/dashboard/dashboard_bevy_ui_tree.js` — 3
