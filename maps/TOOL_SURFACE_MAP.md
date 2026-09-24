# Tool surface map — clé de menu ↔ `tool_id`

Généré le 2026-09-24 depuis le contenu réel du menu principal (`getMainMenuRuntime().getContent()`, session invité dans l'espace de travail) et depuis `eVe/intuition/menu/context_menus.json`.

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
| main › create | `page_create` | `ui.page.create` | Page |
| main › create › page_create | `page_format_free` / `sixteen_nine` / `four_three` / `three_two` / `a4` / `square` | `ui.page.create` | Libre, 16:9, 4:3, 3:2, A4, Carré |
| main › create | `create_placeholder` | `ui.placeholder.create` | Placeholder |
| main › create › create_placeholder | `placeholder_text` / `video` / `audio` / `photo` / `image` / `shape` | `ui.placeholder.create` | Texte, Vidéo, Audio, Photo, Image, Dessin |
| main › create › create_placeholder | `placeholder_duration` | `ui.placeholder.duration.apply` | Durée |
| main › create › create_placeholder | `placeholder_max_chars` | `ui.placeholder.max_chars.apply` | Caractères |
| main › create | `generator` | `tool.main.generator` | générateur |

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
