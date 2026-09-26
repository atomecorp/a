# Tool surface map — clé de menu ↔ `tool_id`

Généré le 2026-09-24 depuis le contenu réel du menu principal (`getMainMenuRuntime().getContent()`, session invité dans l'espace de travail) et depuis `eVe/intuition/menu/context_menus.json`.

Mise à jour 2026-09-25 : les cases de rail des outils de création viennent de `menus.sidebar.tools` ; Page n'est plus une palette locale (ses 6 formats sont ses cases de rail) et le Générateur expose la liste projetée par son registre.

Un outil est **exposable** (Find → Tools, futur catalogue de l'éditeur de taxonomie) s'il est **atteignable** depuis une surface :
- les racines du menu principal (`toolbox.children`) et, par les enfants de palette, tout ce qu'elles ouvrent ;
- les commandes déclarées par Mystic et le menu latéral dans `context_menus.json` (groupes, croix de base, surcharges de mode).

Le champ `visibility` des définitions du registre **n'est pas** ce critère : il empêche seulement un outil d'être ajouté à la boîte à outils générée automatiquement. Plusieurs vrais boutons (dupliquer, rétablir, les captures…) sont `hidden`.

Code : `eVe/intuition/tools/core/exposable_tools.js` ; branché dans `finder_data_sources.js` `loadExposableToolRecords`. Sonde : `temp/finder_tools_scope_probe.mjs`.

## Menu principal (racines et palettes)

| Chemin | Clé | `tool_id` | Libellé |
|---|---|---|---|
| main | `help` | `tool.main.help` | aide |
| main | `home` | `tool.main.home` | accueil |
| main | `find` | `tool.main.find` | trouver |
| main | `capture` | `tool.main.capture` | enr. |
| main › capture | `audio` | `ui.capture.audio` | audio |
| main › capture | `video` | `ui.capture.video` | video |
| main › capture | `preview` | `ui.capture.preview` | prévisualiser |
| main › capture | `photo` | `ui.capture.photo` | photo |
| main › capture | `import` | `ui.capture.import` | importer |
| main › capture | `screen` | `ui.capture.screen` | ecran |
| main › capture | `record_actions` | `ui.record.actions` | Actions |
| main › capture | `capture_actions` | — (palette) | Relire |
| main › capture › capture_actions | `play_actions_realtime` | `ui.record.actions.replay` | Temps réel |
| main › capture › capture_actions | `play_actions_final` | `ui.record.actions.replay` | État final |
| main › capture › capture_actions | `save_actions_template` | `ui.record.actions.template` | En template |
| main › capture | `validation` | `ui.capture.validation` | validation |
| main | `time` | `tool.main.time` | temps |
| main › time | `clock` | `ui.clock.set` | afficher l’heure |
| main › time | `calendar` | `ui.calendar.panel` | calendrier |
| main › time | `alarm` | `ui.alarm` | alarme |
| main | `communicate` | `tool.main.communicate` | communiquer |
| main | `mode` | `tool.main.mode` | mode |
| main › mode | `perform` | `tool.main.perform` | Exécution |
| main › mode | `mode_edit` | `ui.mode.edit` | edit |
| main › mode | `mode_consume` | `ui.mode.consume` | Consultation |
| main | `view` | `tool.main.view` | Vue |
| main › view | `view_list` | `ui.view.mode.list` | Liste |
| main › view | `view_table` | `ui.view.mode.table` | Matrice |
| main › view | `view_natural` | `ui.view.mode.natural` | Disposition |
| main | `activity` | `tool.main.activity` | Activité (enfants dynamiques : une entrée par activité) |
| main | `create` | `tool.main.create` | Créer |
| main › create | `text_create` | `ui.text.create` | Texte |
| main › create | `draw_create` | `tool.main.draw` | Dessin |
| main › create › draw_create | `draw_size` | `tool.main.size` | Taille |
| main › create › draw_create | `draw_type` | `ui.draw.brush.type` | Brosse |
| main › create | `code_create` | `ui.code.editor` | Code |
| main › create | `page_create` | `ui.page.create` | Page (armement direct : la palette locale n'existe plus depuis le 2026-09-25) |
| rail › page | `page_format_free` / `sixteen_nine` / `four_three` / `three_two` / `a4` / `square` | `ui.page.create` | Libre, 16:9, 4:3, 3:2, A4, Carré — cases du rail, choix courant allumé |
| main › create | `create_placeholder` | `ui.placeholder.create` | Placeholder |
| main › create › create_placeholder | `placeholder_text` / `video` / `audio` / `photo` / `image` / `shape` | `ui.placeholder.create` | Texte, Vidéo, Audio, Photo, Image, Dessin — la liste reste dans Créer et devient aussi les cases du rail |
| main › create › create_placeholder | `placeholder_duration` | `ui.placeholder.duration.apply` | Durée |
| main › create › create_placeholder | `placeholder_max_chars` | `ui.placeholder.max_chars.apply` | Caractères |
| main › create | `generator` | `tool.main.generator` | générateur |

## Rail de l'outil armé (`context_menus.json` → `menus.sidebar.tools`)

Un outil de création `pinned: true` quitte « Créer » dès qu'il est armé : sa case épinglée en bas du rail contextuel le représente (un appui l'éteint par le propriétaire qui publie son état) et ses options sont les cases de ce même rail. Voir `maps/ARCHITECTURE_MAP.md` (« Armed creation tools: taxonomy residence… — 2026-09-25 »).

| Outil | Clé de contenu | `tool_id` | Options du rail (ordre déclaré) | Propriétaire des valeurs |
|---|---|---|---|---|
| Texte | `text_create` | `ui.text.create` | `size`, `couleur`, `font` | `tool_presets.js`, panneaux couleur/police |
| Dessin | `draw_create` | `tool.main.draw` | `couleur`, `draw_opacity`, `draw_size`, `draw_type` | `window.__eveDrawTool`, panneau couleur |
| Code | `code_create` | `ui.code.editor` | — (son éditeur reste un panneau) | `eveCodeToolApi` |
| Page | `page_create` | `ui.page.create` | les 6 `page_format_*` | `eveProjectViewCreationApi.readPageFormat()` |
| Placeholder | `create_placeholder` | `ui.placeholder.create` | les 6 `placeholder_*` + `placeholder_duration`, `placeholder_max_chars` | `evePlaceholderCreationApi.readChoice()` / `readLimits()` |
| Générateur | `generator` | `ui.generator.run` | liste projetée par `eVe/intuition/tools/generator/registry.js` (familles remplacées par leurs générateurs) | `window.eveGeneratorApi.readChoice()` |
| Template | `template_create` | `ui.template.create` | — (aucune porte d'entrée dans le ruban aujourd'hui) | `eveTemplateCreationApi` |

## Règle on/off des outils à panneau (2026-09-25)

Tout outil qui ouvre un panneau est un bouton **on/off**, sur toutes les surfaces (ruban, rail contextuel, rail de l'outil armé, Mystic, rails News/niveau/molécule, rails des outils à input box) : allumé tant que son panneau est ouvert, un second appui le referme.

- **Déclaration unique** : `context_menus.json` → `commands.<clé>.panel` (valeurs de `vocabulary.panels`) — aujourd'hui `couleur`, `font`, `info`, `communicate`, `home`, `calendar`, `find` (→ `finder`), `midi_binding`. Visible dans l'éditeur de taxonomie (« on/off · panneau … ») et dans son diff.
- **Lecture** : `eVe/intuition/tools/core/panel_toggle_rule.js` — l'état allumé est lu sur le runtime des panneaux, jamais gardé par une surface. `invokeUnifiedContextTool` (point de passage du ruban, du rail et de Mystic) en déduit `state.on` / `state.off`.
- **Rails virtuels** (définitions figées à l'entrée) : une case déclare `panel: '<surface>'`, le rail contextuel l'allume à chaque rendu.
- **Garde** : le gestionnaire d'outils signale `panel_not_on_off` pour toute entrée de contenu qui ouvre un panneau sans être un latch.

## Mystic et menu latéral (`context_menus.json` → `commands`)

| Clé | `tool_id` | Libellé |
|---|---|---|
| `text` / `molecule` / `shape` | — (commandes du lasso, action locale) | |
| `ai` | `tool.main.ai` | IA |
| `dashboard` | — (tuile Mystic, aucune entrée de contenu) | |
| `copy` | `tool.main.copy` | copier |
| `paste` | `tool.main.paste` | coller |
| `delete` | `tool.main.delete` | supprimer |
| `info` | `tool.main.info` | infos |
| `size` | `tool.main.size` | redimensionner |
| `couleur` | `tool.main.couleur` | colorer |
| `z_order` | `tool.main.z_order` | Plan |
| `font` | `tool.main.font` | changer la police |
| `line_splitter` | `ui.text.line_splitter` | Séparer les lignes |
| `play` | `ui.play` | lire |
| `sound` | `tool.main.sound` | son |
| `audio_to_midi` | `ui.audio.to_midi` | to MIDI |
| `draw` | `tool.main.draw` | Dessin |
| `draw_opacity` | `ui.draw.opacity.apply` | Opacité |
| `vector` | `tool.main.vector` | Vecteur |
| `midi_binding` | `ui.midi.binding.panel` | Liaison MIDI |
| `teleport` / `teleport_return` / `teleport_persist` / `teleport_retarget` / `teleport_preview` | `ui.teleport.send` / `.return` / `.persist` / `.retarget` / `.preview` | téléporter, rapatrier, laisser, déplacer, Aperçu distant |
| `undo` | `tool.main.undo` | annuler |
| `redo` | `ui.redo` | Rétablir |
| `record_action` | `ui.detail.record.toggle` | Enregistrer |
| `ungroup` | — | Dégrouper |
| `rename` | — | renommer |
| `duplicate` | `ui.duplicate` | dupliquer |
| `cut` | `tool.main.cut` | couper |

## Écarts relevés

- **Atteignables mais absents du registre** : Find ne liste que des enregistrements du registre ; ces outils n'y apparaissent donc pas. À traiter à l'étape 1 (catalogue) :
  - `tool.main.z_order`, `ui.placeholder.create`, `ui.draw.brush.type`, `ui.draw.opacity.apply` ;
  - `ui.teleport.*` (send, return, persist, retarget, preview, request_access, remote_keyboard) ;
  - `ui.trackpad.toggle`.
- **Sans `tool_id`** : `capture_actions` (palette), `dashboard`, `ungroup`, `rename`.
- **Plusieurs boutons pour un même `tool_id`** : `ui.page.create` (6 formats), `ui.placeholder.create` (6 types), `ui.record.actions.replay` (temps réel / état final), `ui.detail.record.toggle` (plusieurs clés d'enregistrement). Find montre un seul outil, nommé par le premier bouton.
- **Libellés à revoir en i18n** (hors périmètre de l'étape 0) : `ecran`, `video`, `edit`, `enr.`, `to MIDI`, `laisser`.
