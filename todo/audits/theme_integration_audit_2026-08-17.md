# Audit d'intégration du thème (§2)

> Mesure, pas refonte. §1 interdit d'engager un gros refactor dans cette phase.

« Elastic » ne nomme aucun module du dépôt : ce qui existe, ce sont trois systèmes
de tokens parallèles (`look`, `skin`, `system_ui`) plus deux jeux locaux
(`ribbon/tokens.js`, `tools/visual/`). Le tableau montre, par surface citée par §2,
lequel est réellement consommé et combien de valeurs visuelles restent en dur.

| Surface | Répertoire | .js | Source(s) de tokens | hex | rgb/hsl | px | total |
|---|---|---:|---|---:|---:|---:|---:|
| surface principale | `eVe/domains/rendering` | 117 | skin | 5 | 9 | 10 | 24 |
| toolbox principale | `eVe/intuition/ribbon` | 22 | skin, system_ui | 5 | 9 | 8 | 22 |
| vues liste | `eVe/intuition/matrix` | 23 | skin, tool visual tokens | 0 | 4 | 17 | 21 |
| dialogues / overlays | `eVe/elements/design` | 23 | system_ui | 0 | 0 | 19 | 19 |
| vues projet / navigateur | `eVe/domains/dashboard` | 28 | skin, tool visual tokens | 4 | 7 | 0 | 11 |
| générateur | `eVe/intuition/tools/generator` | 4 | skin | 0 | 4 | 0 | 4 |
| toolbox contextuelle | `eVe/intuition/flower` | 7 | ribbon tokens | 0 | 1 | 0 | 1 |
| palette de création | `eVe/intuition/tools/ui` | 3 | **aucune** | 0 | 0 | 0 | 0 |
| panneaux | `eVe/intuition/panels` | 5 | skin | 0 | 0 | 0 | 0 |
| assistant | `eVe/voice` | 6 | skin | 0 | 0 | 0 | 0 |
| outils de dessin | `eVe/intuition/tools/core` | 51 | skin | 0 | 0 | 0 | 0 |
| outils audio | `eVe/intuition/tools/audio_edit` | 5 | **aucune** | 0 | 0 | 0 | 0 |
| timeline | `eVe/intuition/tools/molecule/render` | 2 | skin | 0 | 0 | 0 | 0 |

**102 valeurs visuelles en dur** sur les 13 surfaces listées par §2.

## Surfaces qui peignent sans consommer de tokens

Aucune.

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

- `eVe/intuition/ribbon/disconnected_handle_logo.js` — 13
- `eVe/intuition/matrix/core/matrix_runtime_lifecycle.js` — 9
- `eVe/elements/design/panel_chrome.js` — 8
- `eVe/domains/rendering/bevy_video_hidden_dom_runtime.js` — 6
- `eVe/intuition/ribbon/bevy_ui_main_menu_recording_visual_model.js` — 5
- `eVe/intuition/matrix/core/matrix_runtime_select.js` — 5
- `eVe/domains/rendering/bevy_media_texture_resolver.js` — 4
- `eVe/intuition/matrix/core/matrix_runtime_transform.js` — 4
- `eVe/intuition/tools/generator/builtins.js` — 4
- `eVe/intuition/ribbon/menu_model.js` — 3
- `eVe/domains/dashboard/dashboard_bevy_ui_tree.js` — 3
- `eVe/domains/dashboard/dashboard_svg_sources.js` — 3
- `eVe/intuition/matrix/ui/matrix_layout.js` — 3
- `eVe/domains/rendering/bevy_project_preview_capture_adapter.js` — 2
- `eVe/domains/rendering/bevy_ui_material_projection.js` — 2

---

## Ce qui a changé depuis le 15 août 2026

**145 → 102 valeurs visuelles en dur.** Les trois surfaces qui peignaient sans
consommer aucune source de tokens consomment maintenant `elements/skin` :

| Surface | Avant | Après | Ce qui a bougé |
|---|---:|---:|---|
| outils de dessin | 25 | 0 | couleur de trait, texte créé (fond, couleur, taille), remplissage de forme, poignées vectorielles, filets |
| timeline | 18 | 0 | `DEFAULT_TIMELINE_PALETTE` vient de `EVE_TOOL_SKIN_TOKENS.timeline` ; les kinds de clip sont mappés sur les familles sémantiques (audio = violet, vidéo = bleu, image = vert…) |
| générateur | 5 | 4 | tailles de texte généré alignées sur celles d'un texte créé à la main |

### Ce qui reste et pourquoi

- **Générateur, 4 `hsl()`** : ce sont les couleurs **produites** par les
  générateurs de texture et de dégradé. C'est du contenu, pas du chrome — les
  mettre dans le thème reviendrait à figer ce que le générateur doit inventer.
  Comptées par le script, légitimes en fait.
- **Toolbox principale (22)** : hors périmètre, reportée sur décision
  utilisateur (17 août 2026).
- **Les 76 restantes** : elles vivent dans des surfaces qui consomment déjà des
  tokens ; les résorber suppose l'unification de `look` + `skin` + `system_ui`,
  qui est un refactor large. §1 l'interdit dans cette phase, et la question du
  nom « Elastic » n'est toujours pas tranchée.

**Le §17 reste donc non atteint sur le critère « thème intégré de façon
cohérente »** : plus aucune surface ne peint hors du thème, mais il y a encore
trois systèmes de tokens au lieu d'un.
