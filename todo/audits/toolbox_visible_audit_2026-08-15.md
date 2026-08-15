# Audit mécanique de la toolbox visible (§3, §15)

Racines `toolbox.children` : home, find, capture, time, communicate, mode, view, create, sound

46 entrées visibles atteintes — 46 saines, 0 à traiter.

| Entrée | Type | tool_id | Mode | Def | Route de réponse | Statut |
|---|---|---|---|---|---|---|
| `home` | tool | `tool.main.home` | V | oui | menu-handler + bootstrap-handler | ok |
| `find` | tool | `tool.main.find` | v2_finder_main | oui | menu-handler + executor:v2_finder_main | ok |
| `capture` | palette | `tool.main.capture` | V | oui | bootstrap-handler | palette (ok) |
| &nbsp;&nbsp;&nbsp;&nbsp;`audio` | tool | `ui.capture.audio` | V | oui | bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`video` | tool | `ui.capture.video` | — | oui | bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`preview` | tool | `ui.capture.preview` | — | oui | bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`photo` | tool | `ui.capture.photo` | — | oui | bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`import` | tool | `ui.capture.import` | — | oui | menu-handler + bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`screen` | tool | `ui.capture.screen` | V | oui | bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`validation` | tool | `ui.capture.validation` | — | oui | bootstrap-handler | ok |
| `time` | palette | `tool.main.time` | V | oui | bootstrap-handler | palette (ok) |
| &nbsp;&nbsp;&nbsp;&nbsp;`clock` | tool | `ui.clock.set` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`calendar` | tool | `ui.calendar.panel` | V | oui | menu-handler + bootstrap-handler | ok |
| `communicate` | tool | `tool.main.communicate` | V | oui | menu-handler + bootstrap-handler | ok |
| `mode` | palette | `tool.main.mode` | V | oui | bootstrap-handler | palette (ok) |
| &nbsp;&nbsp;&nbsp;&nbsp;`perform` | tool | `tool.main.perform` | V | oui | bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`mode_edit` | tool | `ui.mode.edit` | V | oui | bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`mode_consume` | tool | `ui.mode.consume` | V | oui | bootstrap-handler | ok |
| `view` | palette | `tool.main.view` | V | oui | bootstrap-handler | palette (ok) |
| &nbsp;&nbsp;&nbsp;&nbsp;`view_list` | tool | `ui.view.mode.list` | V | oui | menu-handler + bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`view_table` | tool | `ui.view.mode.table` | V | oui | menu-handler + bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`view_natural` | tool | `ui.view.mode.natural` | V | oui | menu-handler + bootstrap-handler | ok |
| `create` | palette | `tool.main.create` | V | oui | — | palette (ok) |
| &nbsp;&nbsp;&nbsp;&nbsp;`text_create` | tool | `ui.text.create` | v2_text_create | oui | menu-handler + executor:v2_text_create | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`draw` | palette | `tool.main.draw` | v2_draw | oui | menu-handler + executor:v2_draw | palette (ok) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`draw_freehand` | tool | `ui.draw.mode.brush` | v2_draw | oui | executor:v2_draw | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`draw_rectangle` | tool | `ui.draw.mode.rect` | v2_draw | oui | executor:v2_draw | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`draw_ellipse` | tool | `ui.draw.mode.ellipse` | v2_draw | oui | executor:v2_draw | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`draw_points` | tool | `tool.main.vector` | v2_vector_edit | oui | executor:v2_vector_edit | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`draw_record_live` | tool | `ui.detail.record.toggle` | V | oui | bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`draw_size` | tool | `tool.main.size` | V | oui | menu-handler + bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`draw_color` | tool | `ui.couleur.panel` | V | oui | bootstrap-handler | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`code_create` | tool | `ui.code.editor` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`page_create` | tool | `ui.page.create` | v2_text_create | oui | menu-handler + executor:v2_text_create | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`generator` | palette | `tool.main.generator` | V | oui | — | palette (ok) |
| `sound` | palette | `tool.main.sound` | V | oui | — | palette (ok) |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_trim_start` | tool | `ui.audio.trim.start` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_trim_end` | tool | `ui.audio.trim.end` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_split` | tool | `ui.audio.split` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_roll` | tool | `ui.audio.roll` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_loop` | tool | `ui.audio.loop` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_loop_start` | tool | `ui.audio.loop.start` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_loop_end` | tool | `ui.audio.loop.end` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_stretch_longer` | tool | `ui.audio.stretch.longer` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_stretch_shorter` | tool | `ui.audio.stretch.shorter` | — | non | menu-handler + runtime-registered | ok |
| &nbsp;&nbsp;&nbsp;&nbsp;`sound_stretch_reset` | tool | `ui.audio.stretch.reset` | — | non | menu-handler + runtime-registered | ok |

Aucune entrée visible sans route de réponse.

## Parité structurelle du conteneur generator

- profondeur (réf. `draw`) : identique — `generator` s'ouvre exactement là où `draw` s'ouvre.
- comportement (réf. `view`) : identique — conteneur pur, momentané, sous-menu immédiat.

## Références d'enfants pendantes dans la SSOT

Aucune.
