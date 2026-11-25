# Commandes vocales et MCP du multipiste

Date : 2026-11-25 — relevé en lecture seule du code (rien n'a été exécuté, aucun appel réel).

## Sources lues

- `atome/src/squirrel/atome/mcp_contract_families.js` (familles de contrats MCP ; aucune famille « timeline » : le multipiste passe par les outils runtime ci-dessous), et les contrats importés qui touchent le multipiste : `audio_fx/contracts.js` (+ `instrument_contracts.js`, `slice_contracts.js`, `bank_contracts.js`), `capture/contracts.js`, `controls/contracts.js`, `interactions/contracts.js`.
- `atome/src/shared/timeline_tool_contract.js` : le contrat d'entrée unique de tous les outils timeline (`TIMELINE_WRITE_VERBS`, `TIMELINE_TOOL_SCHEMAS`, `MIX_COMMANDS`).
- `atome/src/squirrel/ai/default_tools_timeline.js` et `timeline_tool_ids.js` : les noms côté assistant (`eve.timeline.*`), chacun relié à son jumeau runtime (`ui.timeline.*`).
- `atome/src/squirrel/ai/conversation_session.js` et `atome/mcp_handlers_ai_runtime.js` : l'assistant charge **`ai.tools.list` + `runtime.tools.list`**. Tout outil runtime déclaré (`ui.*`, `midi.*`…) lui est donc proposé, et il l'appelle par `runtime.tools.call`.
- Exécuteurs : `eVe/intuition/tools/timeline_actions.js`, `timeline_media_actions.js`, `eVe/intuition/tools/molecule/runtime.js`, `runtime_api_commands.js`, `runtime_cells_command.js`, `runtime_api_transport.js`, `molecule/session/timeline_operations.js` (alias des verbes), `molecule/session/operation_dispatch.js` (verbe → réducteur), les réducteurs de `molecule/kernel/*.js` (`reducers.js`, `structure.js`, `scenes.js`, `cell_content.js`, `cell_groups.js`, `cell_defaults.js`, `clip_*.js`, `warp.js`, `stretch.js`, `takes.js`, `markers.js`, `automation*.js`, `mix_structure.js`, `timeline_view.js`, `metronome_settings.js`, `scene_schema.js`), `eVe/intuition/tools/audio_edit/{runtime,commands}.js`, `eVe/intuition/tools/core/tool_runtime_bootstrap*.js` (vues, MIDI, capture), et les fichiers de rail/panneau `eVe/domains/rendering/project_view_*` pour relever les écarts.
- `eVe/documentations/HELP_CAPABILITY_INVENTORY.md` n'a pas été utilisé : il est périmé.

## Comment lire ce document

- Chaque verbe timeline existe sous deux noms qui lancent **le même exécuteur** : `eve.timeline.<verbe>` pour l'assistant (AtomeAI), `ui.timeline.<verbe>` pour le runtime et le MCP (`runtime.tools.call`). Les tableaux donnent le `<verbe>` seul.
- `group_id` désigne le projet (sa Molécule). Quand il est facultatif, la Molécule active est prise.
- Un verbe d'édition s'appelle avec `{ group_id?, command: {…} }`. La colonne « Entrées » donne les champs de `command` que le réducteur lit vraiment. **Depuis le 2026-11-25** (§12c), chaque verbe d'édition publie le schéma typé de sa commande. *Avant :* pour les verbes d'édition (hors `mix.*`), le schéma publié à l'assistant dit seulement « Command of the Molecule kernel operation X ». Les champs ne sont pas typés dans le contrat (voir les écarts, §13).
- `eve.timeline.operation { operation, command }` accepte en plus tout verbe connu des alias, même ceux qui n'ont pas d'outil dédié (§12).
- Risque : la plupart des verbes sont `low` ou `moderate`, faits tout de suite (règle 22). Les seules confirmations de famille qui touchent le multipiste : `captures.start`, `captures.delete`, `audio_fx.start`, `audio_fx.delete`, `audio_fx.instrument_delete`, `audio_fx.delete_preset`.

---

## 1. Transport

| Commande | Ce qu'elle fait réellement | Entrées | Geste à l'écran |
|---|---|---|---|
| `transport.command` | Pilote la lecture du projet. `play` : Lecture, ignoré si ça joue déjà. `stop`. `toggle` : Lecture/Stop. `pause` : met en pause, ou reprend si c'est déjà en pause. `jump` : saut au début, à une mesure, à un marqueur, à une Scène ou à la mesure `value`. Pendant la lecture, le saut tombe sur le pas suivant de `quantize` (`project` = l'Aimant du projet, `bar`, `beat`, `off` = tout de suite). | `group_id`, `op` (play·stop·toggle·pause·jump), `to {kind: start/bar/marker/scene/value, bar, marker_id, scene_id}`, `value`, `quantize` | Lecture de la ligne des vues ; Début ; touche sur la règle |
| `transport.play` | Lit la timeline d'un projet depuis `start_seconds`. Ouvre d'abord le projet s'il ne l'est pas (projet « lancé »). | `group_id`, `project_id?`, `start_seconds?` | Lecture |
| `transport.stop` | Arrête le transport du projet. | `group_id` | Stop |
| `transport.toggle` | Lecture/Stop de la Molécule entière, d'une Section ou d'une Piste. | `group_id`, `section_id?`, `track_id?` | Lecture d'une piste ou d'un niveau |
| `transport.list.toggle` | Lecture/Stop enchaînée des Molécules ouvertes, dans l'ordre de la Liste. | `group_ids?` | Vue Liste : touche sur le rang du niveau |
| `transport.list.stop` | Arrête la lecture enchaînée de la Liste. | — | Vue Liste : seconde touche |
| `transport.seek` | Place la tête de lecture (réducteur `setPlayhead`). | `command.playhead_seconds` | Touche sur la règle |
| `transport.scrub` | Même réducteur que `seek` (la tête de lecture placée). Pas de son de défilement. | `command.playhead_seconds` | Glisser sur la règle |
| `transport.loop` | Active ou coupe la boucle du transport et fixe ses bornes. | `command.enabled`, `start_seconds`, `end_seconds` | Bornes de boucle sur la règle |
| `transport.tempo` | Pose ou retire un tempo, une signature ou une rampe à un instant de la carte des tempos. | `command.tempo`, `start_seconds`, `beats_per_bar`, `beat_unit`, `ramp`, `remove` | Tempo (case à droite de la règle), Signature (Réglages), couloir de tempo |
| `quantization.set` | Fixe la quantification du projet. | `command.quantization` (off, bar, beat, 1/2beat … 1/32beat) | — |
| `ui.timeline_scrub` | Outil runtime caché du défilement (actions drag.start/frame/end, seek). | selon l'action | Glisser de la tête de lecture |
| `ui.play` / `ui.pause` / `ui.stop` | Outils génériques de lecture des objets (vue Naturelle : Lecture au pied du rail). Pas spécifiques au multipiste. | sélection | Lecture du rail contextuel |
| `audio_edit` : `ui.audio.loop`, `ui.audio.loop.start`, `ui.audio.loop.end` | Boucle du transport : allumée sur le clip choisi, sinon 4 s depuis la tête. Bornes posées à la tête ou à `value_seconds`, sans jamais se croiser. | `clip_id?`, `project_id?`, `enabled?`, `value_seconds?` | Outils d'édition audio |

## 2. Vues

| Commande | Ce qu'elle fait | Entrées | Geste |
|---|---|---|---|
| `ui.view.mode.list` · `.table` · `.natural` · `.timeline` · `.cells` · `.scene` · `.mix` | Choisit la vue du projet : Liste, Matrice, Disposition, Timeline, Cellules, Scène, Mixage. Exécuteur : `executeBootstrapMomentaryHandler` `{kind:'view'}`. | — | Bande › Vue › choix |
| `activity.list` · `activity.mix` · `activity.timeline` | Ouvre l'activité Liste, Mixage ou Timeline de la Molécule sur la surface Bevy (`setGroupTimelineActivity`). | `project_id?` | Idem (ancien chemin) |
| `view.set` | Présentation enregistrée de la timeline : zoom X et Y, entité en focus, Aimant (`snap`), disposition (timeline, cells, split, et `split_ratio` 0.15–0.85), mode des Cellules (play/edit = Édition), Scène choisie, filtre de Scène, Inspecteur, en-têtes ouverts, piste dépliée, piste FX, console, groupes repliés, chemin des Scènes imbriquées, support d'Enr. (`record_source` : audio, video, midi, action = Geste). | `command.{x_zoom, y_zoom, focus, snap, layout, split_ratio, cells_mode, scene_id, scene_filter, inspector, headers_open, unfolded_track_id, fx_track_id, console, folded_groups, cells_group_id, cells_scene_path, record_source}` | Pincer pour zoomer ; Aimant (Réglages) ; Édition ; appui long sur un en-tête ; Enr. › support |
| `ui.timeline.panel` | Ouvre ou ferme le panneau Timeline (ancien outil du menu). | — | — |
| `realign` | « Réalig » : relaie la timeline du projet dans l'ordre de la Liste, en un seul lot annulable. | `project_id?` | Vue Liste › Réalig |
| `read` | Lit l'instantané complet de la timeline (pistes, clips, Scènes, cellules, console, automation, réglages). | `group_id?` | — (lecture, prérequis de presque tout) |

## 3. Pistes et sections

| Commande | Ce qu'elle fait | Entrées (`command`) | Geste |
|---|---|---|---|
| `track.add` | Ajoute une piste dans une section, à un rang. | `section_id`, `track_id`, `order?` (+ champs de la piste) | Coin « + » › Nv. piste |
| `track.remove` | Supprime une piste, ses cellules et son automation. Ses références de console sont élaguées. La dernière piste vide ne peut pas être supprimée. | `track_id` | Suppr. sur l'en-tête |
| `track.update` | Change une piste : nom, rang, section, solo, mute, armement, `continue_beyond_section`, quantification, boucle. | `track_id` + champs | En-tête : double touche puis nom ; M, S |
| `track.mute` · `track.solo` · `track.loop` · `track.quantization` | Alias de `track.update` : la même commande, sans transformation (passer `mute: true`, `solo: true`, `loop: {…}`, `quantization`). | `track_id`, champ | M, S de l'en-tête |
| `track.reorder` | Déplace une piste (vers une autre section si besoin, à `target_index`). Alias de `molecule.track.move`. | `track_id`, `target_index`, `target_section_id?` | Glisser un en-tête |
| `track.import` | Plaque « Importer » : pose les médias de la personne bout à bout sur une piste depuis `start_seconds`. | `track_id`, `media_atome_ids[]`, `start_seconds?`, `project_id?` | Plaque Importer de la partie vide d'une piste |
| `section.add` · `section.update` · `section.remove` | Crée, modifie (nom, ordre, durée, tempo, mesure) ou supprime une Section. La dernière section part avec sa Molécule. | `section_id`, `name`, `order?`, `duration_frames?`, `tempo?`, `meter?` | Rail de structure |
| `transfer` | Transfère, de façon atomique, une Section ou des Pistes d'une Molécule ouverte à une autre. | `source_group_id`, `target_group_id`, `entity_type` (section/track), `section_id`/`track_id`/`track_ids`, `target_section_id?`, `target_index?` | Glisser entre projets ouverts |

## 4. Clips

| Commande | Ce qu'elle fait | Entrées (`command`) | Geste |
|---|---|---|---|
| `clip.place` | Pose sur une piste un outil du ruban, un autre projet ou une Scène du même projet. Un outil s'exécute au passage de la tête. Un projet joue imbriqué, ou est lancé/ouvert (`mode`). | `track_id`, `start_seconds`, `duration_seconds?`, `placed_tool_id` / `placed_project_id` / `placed_scene_id`, `mode` (nested, launch, open, run), `clip_id?` | Glisser un outil ou un projet sur une piste |
| `clip.move` | Déplace un clip (temps, et piste si besoin). Le son lié et l'automation sous le clip suivent. | `clip_id`, `start_seconds`, `track_id?` | Glisser un clip |
| `clip.trim` / `clip.crop` | Redimensionne par un bord (`molecule.clip.resize`). Le son lié suit. | `clip_id`, `edge` (start/end), `value_seconds` | Tirer un bord du clip |
| `clip.loop` | Bloc en boucle : le clip se répète sur `duration_frames`. | `clip_id`, `enabled`, `duration_frames` | Poignée de boucle du clip |
| `clip.view` / `clip.mode` | Présentation du clip : vue (onde, vignette…), mode d'un clip posé (nested, launch, open, run) et bord. `null` rend le choix au contenu. | `clip_id`, `view?`, `mode?`, `edge?` | Rail du clip |
| `clip.fades` | Fondus d'entrée et de sortie (0 et 0 les retirent). | `clip_id`, `in_frames`, `out_frames` | Poignées de fondu |
| `clip.stretch` | Étirement temporel : ratio, moteur, hauteur verrouillée, ancre. | `clip_id`, `enabled`, `ratio`, `engine?`, `pitch_lock?`, `anchor?` | Rail du clip › Étirer |
| `clip.warp` | Warp : allumé, garde la longueur. « Suivre » prend le tempo sous le clip. Accepte aussi transposition et marqueurs. | `clip_id`, `enabled`, `follow?`, `pitch_semitones?`, `markers?` | Rail du clip › Warp |
| `clip.split` | Coupe un clip en deux à `at_seconds`. | `clip_id`, `at_seconds`, `left_clip_id`, `right_clip_id` | Ciseaux / Couper |
| `clip.join` | Recolle deux clips contigus de la même source. | `left_clip_id`, `right_clip_id` | Joindre |
| `clip.take` | Comping : le clip joue la prise n (de 1 à N). | `clip_id`, `take` | Couloirs de prises |
| `clip.cut` · `clip.copy` · `clip.paste` · `clip.duplicate` | Couper, copier, coller (ancre `start_seconds`, piste facultative ; l'automation et le lien vidéo/son sont recopiés), dupliquer. | `clip_id`/`clip_ids`, `start_seconds` (paste), `track_id?` | Copier/Coller du rail |
| `clip.erase` | Supprime un clip (`molecule.clip.delete`). Supprimer le dernier clip supprime le propriétaire Molécule (`deleteFinalMoleculeOwner`). | `clip_id` | Suppr. |
| `clip.sound.split` | Sépare le son d'une vidéo sur une nouvelle piste, juste dessous. | `clip_id`, `sound_clip_id`, `track_id`, `track_name?` | Rail vidéo › Séparer le son |
| `clip.sound.unlink` | Délie une vidéo et son son. | `clip_id` | Rail › Délier |
| `audio.export` | Exporte la fenêtre d'un clip audio, telle qu'on l'entend, en WAV 24 bits vers l'export du système. | `clip_id`, `group_id?` | Rail du clip audio › Exporter |
| `ui.audio.trim.start` / `.end` | Rogne le début ou la fin du clip choisi à la tête de lecture (ou à `value_seconds`). Un clip en boucle garde ce qu'il joue. | `clip_id?`, `project_id?`, `value_seconds?` | Outils d'édition audio |
| `ui.audio.split` | Coupe le clip choisi à la tête. | `clip_id?`, `value_seconds?` | idem |
| `ui.audio.roll` | Répète le bloc du clip (`clip.loop`, 2 fois par défaut). | `clip_id?`, `enabled?`, `repeats?` | idem |
| `ui.audio.stretch.longer` · `.shorter` · `.reset` | Étire ×1,25, comprime ÷1,25, ou remet à 1. | `clip_id?`, `ratio?`, `factor?`, `engine?`, `pitch_lock?` | idem |
| `media.list` · `media.add` · `media.replace` · `media.delete` | Médias du projet (rail Médias) : les lister par type ; en ajouter sans les poser ; faire jouer à chaque clip un autre média du même type ; supprimer des médias et leurs clips (l'historique les garde). | `project_id?`, `types?` / `media_atome_ids` / `media_ids`, `by_media_atome_id` | Rail › Médias |
| `history.undo` · `history.redo` | Annule ou rétablit la dernière édition de la timeline. | `group_id?` | Annuler / Rétablir |

## 5. Enregistrement

| Commande | Ce qu'elle fait | Entrées | Geste |
|---|---|---|---|
| `record.prepare` | Prépare le projet courant pour une prise micro avec l'outil Enr. Rend `group_id` et `track_id`. Crée une Molécule seulement si besoin. | `project_id?` | Enr. |
| `record.start` | Prise générique sur une région armée ou une piste. Source : audio, video, screen, photo, midi ou action (Geste). Avec `duration_ms` (100 ms à 10 min), elle s'arrête seule et rend la prise importée. | `group_id`, `track_id?`, `record_region_id?`, `source_kind?`, `duration_ms?`, `capture_id?` | Enr. (piste armée) |
| `record.stop` | Arrête la prise et la garde (une seule par `capture_id`, sinon toutes). | `group_id`, `capture_id?` | Enr. à nouveau / Arrêter |
| `record.cancel` | Annule la prise et la jette. | `group_id`, `capture_id?` | — |
| `record_region.add` · `.update` · `.remove` | Régions d'enregistrement : piste, section, début, durée, armée, source, mode de remplissage, nombre de prises. | `record_region_id`, `track_id`, `section_id`, `start_frame`, `duration_frames`, `armed`, `source_kind`, `fill_mode`, `takes` | Région rouge sur la piste |
| `mix.record.set` | Entrée de prise d'une piste : appareil (micro ou caméra), écoute pendant la prise, mono ou stéréo, canaux physiques. | `strip_id`, `device_id`, `monitoring`, `format`, `channels` | Rail Entrée de la piste |
| `performance.delete` | Efface la performance enregistrée (l'automation jouée en direct) de la Molécule. | `group_id?` | — |
| `captures.start` | Ouvre une capture et la lance dans le dernier projet : son, vidéo, photo, texte dicté ou prise MIDI. Dans la Timeline ou le Mixage à l'arrêt, la prise est **armée** et enregistre quand Lecture fait avancer la tête. `duration_seconds` l'arrête seule. **Confirmée** (micro ou caméra). | `kind`, `duration_seconds?` | Enr. › palette |
| `captures.stop` · `captures.camera` · `captures.close` · `captures.delete` | Arrête et garde la prise ; passe à la caméra suivante ; ferme la capture ; supprime des prises de leur projet (**confirmée**). | `take?` / `atome_ids` | Enr. ; Caméra ; ■ |
| `ui.capture.audio` · `.video` · `.photo` · `.screen` · `.midi` · `.preview` · `.camera_switch` · `.import` | Bascules runtime de la palette Enr. du ruban (prise audio, vidéo, photo, écran, MIDI, aperçu, caméra suivante, import). | — | Enr. › choix |
| `ui.record.actions` | Bascule « Geste » : enregistre les mouvements faits sur les objets du projet. | — | Enr. › Geste |
| `metronome.set` (voir §11) | Le décompte de la prise passe par `pre_roll_bars`. | | |

## 6. Cellules et Scènes

| Commande | Ce qu'elle fait | Entrées | Geste |
|---|---|---|---|
| `cells.trigger` | Presse ou relâche des cellules ou des Scènes (`track_id` = « scene » : la Scène entière). Chaque cellule suit sa quantification, son mode, ses passages et sa Follow Action. Sert aussi aux liaisons MIDI (`midi_value`). | `group_id`, `cells[{scene_id, track_id}]`, `gesture` (press/release), `midi_value?` | Touche ou maintien d'une cellule ou d'une Scène |
| `cells.stop` | Arrête toutes les cellules qui jouent. | `group_id` | Stop (Lecture devenue Stop) |
| `cells.command` | Pilote des cellules à côté de leur lancement. `play` (si elle est silencieuse ; elle reprend où elle était en pause). `restart` (depuis le début). `stop`. `pause` (la pause suivante reprend ; refusée sur une Scène). `speed` (0,25 à 4, entendue tout de suite, gardée par un `cell.set` 300 ms après le dernier mouvement). `pitch` (−24 à 24 demi-tons : le module Pitch de la tranche de la cellule, ajouté la première fois). | `group_id`, `op`, `cells[]`, `value` | Réglages de la cellule (Son › Pitch, Vitesse) ; contrôles liés |
| `scene.add` · `scene.update` · `scene.remove` | Crée une Scène (nom, début, durée). La modifie (nom, début, durée, gain en dB). La supprime. | `scene_id`, `name`, `start_frame`, `duration_frames`, `gain_db` | Coin « + » › Nv. scène ; double touche sur le nom |
| `scene.move` | Déplace une colonne de Scène à `index`. Le contenu suit et est coupé aux bords. | `scene_id`, `index` | Glisser une tuile de Scène |
| `cell.set` | Réglages d'une ou plusieurs cellules : mode one_shot ou loop, déclenchement (latch, momentary, once), passages, quantification de début et de fin, fondus et ADSR, Follow Action, vitesse, sens inverse, vélocité, reprise, retrig/ratchet, chance, groupe d'étouffement, nom, prises, suite de prise, points de boucle, « En Scène », jeu par note (launch, poly, mono, legato), bend, glide, instrument. | `scene_id`+`track_id` ou `cells[]`, `settings{…}` | Ligne des réglages des Cellules, rail Cellule |
| `cell.clear` | Vide une cellule (trou virtuel ; la cellule Scène vide toutes les pistes). La matière reste récupérable. | `scene_id`, `track_id` | Effacer |
| `cell.carve` | Trou virtuel dans une plage de la cellule (non joué ; les morceaux gardent leur source). | `scene_id`, `track_id`, `from_frame`, `to_frame` | Éditeur de cellule › Silence |
| `cell.restore` | « Désilence » : rejoue les trous d'une plage et recolle les morceaux. | idem | Éditeur › Désilence |
| `cell.roll` | Roll : fait tourner le son de la cellule autour de sa Scène comme un cylindre. | `scene_id`, `track_id`, `frames` | Éditeur › Roll |
| `cell.offset` | Décale tout le son de la cellule dans sa Scène (silence devant ; ce qui dépasse n'est plus joué). | `scene_id`, `track_id`, `frames` | Éditeur › Offset |
| `cell.remove` | Retire une plage et recolle (ce qui suit avance). | `scene_id`, `track_id`, `from_frame`, `to_frame` | Éditeur › Couper |
| `cell.insert` | Ouvre `frames` de place à `at_frame` : vide, ou rempli par la copie d'une plage (coller). | `scene_id`, `track_id`, `at_frame`, `frames`, `copy?{from_frame,to_frame}` | Éditeur › Insérer / Coller |
| `cell.trim` | Amène le début du premier morceau ou la fin du dernier à `frame`. | `scene_id`, `track_id`, `edge`, `frame` | Bords dans l'éditeur |
| `cell.place` | Met le contenu d'une cellule dans une autre : déplacé, copié (`copy`) ou échangé (`exchange`). Les tranches propres suivent. | `from_scene_id`, `from_track_id`, `to_scene_id`, `to_track_id`, `copy?`, `exchange?` | Glisser une cellule |
| `cell.group` · `cell.ungroup` | Crée ou défait un groupe de cellules. | `cell_group_id`, `members`, `name` | Appui long › Grouper |
| `clip.scene.detach` | Rend indépendante une Scène incluse (clip de Scène posé). | `clip_id`, `scene_id`, `name` | Rail du clip de Scène |
| `clip.group` | Groupe des clips libres de la Timeline en clip-bloc (refusé s'il recouvrirait un autre clip de la piste de son premier clip). | `clip_group_id`, `clip_ids`, `name` | Rail Édition › Grouper |
| `clip.ungroup` | Rend libres les clips d'un clip-bloc. | `clip_group_id` | Rail Édition › Dégrouper |
| `clip.group.move` | Déplace un clip-bloc d'un seul coup, chaque clip sur sa piste. | `clip_group_id`, `delta_seconds` | Glisser du bloc |
| `audio_fx.slices_to_cells` · `audio_fx.motif_to_cell` | Chaque tranche d'un son, ou le Motif rendu, devient une cellule (une Scène après la dernière). | `media_atome_id`, `project_id`, `track_id?` | Outil Tranches |

## 7. Console (Mixage)

Les identifiants de tranche ont la forme `<track_id>:<lane>` (audio, video, midi). Une tranche de cellule est propre à sa Scène.

| Commande | Ce qu'elle fait | Entrées (`command`) | Geste |
|---|---|---|---|
| `mix.module.add` | Ajoute un module à une tranche : volume, pan, mono, effet dsp, effet de la personne (`user_effect`), envoi, entrée IN, opacité, transform, effet vidéo. Paramètres, destination, sorties d'un split, clé de sidechain, source d'un IN, rang. | `strip_id`, `module_id`, `type`, `effect?`, `effect_id?`, `params?`, `destination?`, `outputs?`, `key?`, `source?`, `index?` | « + » de la tranche |
| `mix.module.update` | Change les paramètres, l'effet, la destination, les sorties, la clé, la source ou la face d'un module. | `strip_id`, `module_id`, … | Panneau soudé du module |
| `mix.module.move` | Déplace un module dans sa chaîne ou vers une autre tranche compatible. | `strip_id`, `module_id`, `index`, `to_strip_id?` | Module tenu puis déplacé |
| `mix.module.remove` | Retire un module. | `strip_id`, `module_id` | Suppr. du module |
| `mix.module.bypass` | Contourne ou rétablit un module. | `strip_id`, `module_id`, `bypass` | Interrupteur au pied du panneau |
| `mix.param.set` | Fixe un paramètre par une valeur, entendu tout de suite, gardé en `mix.module.update` une fois au repos (contrôles liés, MIDI). | `strip_id`, `module_id`, `param`, `value` | Fader, Pan, curseurs |
| `mix.output.set` | Sortie de la tranche (main, bus, tranche, appareil, écran, port MIDI), activée ou non, sorties MIDI. | `strip_id`, `destination`, `enabled?`, `midi_outputs?` | OUT |
| `mix.input.set` | Entrée de la tranche : piste, entrée audio en direct, ou instrument (et sa sortie). | `strip_id`, `input{kind, device_id, instrument_id, output}` | IN |
| `mix.group.create` · `.join` · `.leave` · `.dissolve` | Groupes de tranches : créer (tranche maître et membres), rejoindre, quitter, dissoudre. | `group_id`, `master_strip_id`, `member_strip_ids` / `strip_id` | Groupes de la console |
| `mix.preset.list` · `.save` · `.load` · `.reset` | Préréglages de tranche du compte : lister (par lane, avec leurs parties), enregistrer sous un nom les parties choisies (effets, routage, E/S ; un nom déjà pris est remplacé), appliquer les parties demandées (un lot ; VOL, PAN, Opacité restent), remettre une tranche à neuf. | `strip_id`, `name`, `preset_id`, `parts?`, `lane?` | Rail du Mixage › Enreg., Charger |
| `hardware.list` · `.place` · `.learn` | Appareils MIDI externes (Prises › Matériel) : lister les branchés et les miens (liaisons, contrôles), poser un appareil (clé ou nom) sur une piste pour sa zone ou sous les pistes (un synthé : sa piste), apprendre le prochain contrôle bougé sur l'appareil d'une piste. | `device`, `track_id?`, `start_seconds?`, `end_seconds?`, `module_id?` | Prises › Matériel, panneau de l'appareil › Appr. |
| `clip.output` *(par `operation` seulement)* | Envoie un seul clip vers un bus ou une piste. `null` le rend à sa piste. | `clip_id`, `destination` | Rail du clip › Sortie |
| `clip.gain` *(par `operation` seulement)* | Gain d'un clip en dB (0 le retire). | `clip_id`, `gain_db` | Rail du clip › Gain |

## 8. Effets

### 8a. Effets d'une piste du projet

Ce sont les modules de la console : `mix.module.add`, `update`, `move`, `remove`, `bypass` et `mix.param.set` (§7). Le catalogue des effets dsp (dynamique, espace, EQ, voix, modulation, saturation, master) et vidéo est décrit dans le champ `effect` du contrat.

### 8b. Effets en direct et « Mes effets » (famille MCP `audio_fx`, rack de Capture › Effets)

| Commande | Ce qu'elle fait | Entrées |
|---|---|---|
| `audio_fx.catalog` · `audio_fx.inputs` | Ce qui peut jouer et ce qui joue (effets, Mes effets, Mes instruments, chaînes) ; les entrées audio. | — |
| `audio_fx.start` / `stop` | Allume un effet sur l'entrée utilisée (**confirmé** : le micro s'allume). Éteint un effet, une chaîne, ou tout. | `effect`, `device_id?` / `strip_id?` |
| `audio_fx.add` · `move` · `remove` · `bypass` · `set_param` · `set_input` | Édite une chaîne du rack : ajout (IN compris), déplacement, retrait, contournement, valeur, entrée (appareil ou sortie d'instrument). | `strip_id`, `module_id`, `effect`, `param`, `value`… |
| `audio_fx.save` · `update` · `compose` · `delete` | Mes effets : enregistrer une chaîne, renommer ou mettre en favori, recomposer, supprimer (**confirmé**). | `strip_id`, `effect_id`, `name`, `effects[]` |
| `audio_fx.save_preset` · `delete_preset` · `favorite` | Préréglages d'un effet (y compris les `params` d'un module de console de projet) ; favori. | `effect`, `name`, `params?` |
| `audio_fx.master` · `audio_fx.auto` | Chaîne Master (EQ → Multibande → Maximiseur) ; gain auto du Maximiseur vers une cible LUFS. | `device_id?` / `strip_id`, `module_id`, `target_lufs` |
| `audio_fx.tone3000_search` · `_models` · `_take` | Captures d'ampli TONE3000 (recherche, modèles, import vers l'Ampli). | `query`, `tone_id`, `model_id`, `effect` |
| `audio_fx.driver` · `driver_set` | Pilote audio Windows (WASAPI ou ASIO). | `driver`, `name` |

Note : `audio_fx` pilote le rack de Capture, pas directement la console d'un projet. Le seul pont vers le projet est `save_preset` avec `params`.

## 9. Automation

| Commande | Ce qu'elle fait | Entrées (`command`) | Geste |
|---|---|---|---|
| `automation.lane.add` · `.remove` | Crée un couloir d'automation (cible et paramètre), ou le retire. | `automation_id`, `target_id`, `param` | Auto de l'en-tête ; triangle ▾/▸ |
| `automation.keyframe.add` | Pose un point (temps, valeur, courbe). | `automation_id`, `keyframe_id`, `time_seconds`, `value`, `curve?` | Touche dans le couloir |
| `automation.keyframe.move` · `.edit` · `.remove` | Déplace un point (temps), change sa valeur ou sa courbe, le supprime. | `automation_id`, `keyframe_id`, `time_seconds` / `value`, `curve` | Glisser ou appui sur un point |
| `automation.carry` | Emporte les points d'une plage vers une autre piste ou un autre temps, en copie ou non (utilisé par déplacer et coller). | `track_id`, `from_seconds`, `to_seconds`, `target_track_id`, `start_seconds`, `copy`, `suffix` | (automatique) |
| `performance.delete` | Efface l'automation jouée en direct. | `group_id?` | — |

Les blocs mute et replay d'une piste (`track.mute` et `track.replay` comme couloirs, `track_blocks.js`) passent aussi par `automation.*` : `param` = `track.mute` / `track.replay`.

## 10. MIDI

| Commande | Ce qu'elle fait | Entrées | Geste |
|---|---|---|---|
| `midi.notes.set` | Écrit la liste complète des notes d'un clip MIDI (hauteur, début et fin en ms, vélocité, canal, probabilité), ses contrôleurs (cc, bend, pressure), ses couloirs de contrôleurs et le motif de pas d'une grille de batterie. | `atome_id`, `notes[]`, `duration_ms?`, `controls?`, `midi_lanes?`, `step_pattern?`, `project_id?` | Piano roll, grille de pas, Pads |
| `midi.output.set` | Sortie d'un ou plusieurs atomes MIDI : port, instrument d'eVe, canal. | `atome_ids[]`, `output` / `instrument` / `channel` | Rail Sortie MIDI |
| `midi.binding.create` · `read` · `list` · `update` · `reorder` · `enable` · `disable` · `delete` · `learn` · `remap` · `execute` | Liaisons MIDI (`midi_binding_service.js#invokeMidiBindingCommand`) : un message (type, canal, numéro, plage) déclenche des actions d'outil sur un atome cible, avec une plage continue. Apprendre, réaffecter, exécuter. | `binding_id`, `target_atome_id`, `input{message_type, channel, number}`, `actions[]`, `continuous?` | Interrupteur MIDI des Réglages puis objet touché › Apprendre |
| `ui.midi.binding.panel` · `ui.midi.input.panel` · `ui.midi.output.panel` | Ouvrent les panneaux Liaison MIDI, Entrée MIDI et Sortie MIDI. | `target_atome_id?`, `project_id?` | Outils du rail |
| `midi.export` | Remet le fichier .mid du clip à l'export du système. | `clip_id` | Rail du clip MIDI › Exporter |
| `midi.freeze` | « Figer » : rend un clip MIDI en clip audio par son instrument, sur la prochaine piste libre ; la piste MIDI est mise en muet. | `clip_id` | Rail › Figer |
| `clip.velocity` *(par `operation` seulement)* | Part de vélocité d'un clip MIDI (0,01 à 1). | `clip_id`, `velocity` | Rail du clip MIDI |
| `ui.audio.to_midi` | Convertit l'audio en MIDI (outil du ruban). | sélection | — |
| Instruments `audio_fx.instrument_*`, `zone_*`, `take_*`, `params_set`, `facade_set`, `note_play`, `composed_*`, `transition_*`, `marker_*`, `synth_*`, `validate`, `bank_*`, `samples_*`, `auto_sample`, `instrument_export_sfz` | Les instruments qui jouent les pistes et cellules MIDI : Sampler (carte touches × vélocités, zones, prises, round-robin, étouffements, relâchés), notes composées, synthé modulaire (modules, routes de modulation), import et export de banques (SFZ, DecentSampler, SF2, EXS), auto-échantillonnage. `note_play` fait écouter une note sans rien écrire. | `instrument_id`, … | Panneaux de l'instrument |
| Tranches `audio_fx.slice_*`, `slices_*`, `edit_*`, `sample_*`, `motif_*` | Outil Tranches et éditeur d'échantillon : découpe (grille, attaques, à la main), warp de points, tranches vers touches, round-robin, MIDI ou cellules, éditions non destructives, Motif. | `media_atome_id`, … | Outil Tranches |

## 11. Réglages

| Commande | Ce qu'elle fait | Entrées | Geste |
|---|---|---|---|
| `metronome.set` | Métronome : allumé ou non, mesures de pré-roll (décompte, 8 au plus), volume, accent, son (beep, wood, clave, bell), sortie (main, piste, bus, paire de la carte son), seulement pendant le décompte et les prises. | `command.{enabled, pre_roll_bars, volume, accent, sound, output, record_only}` (au moins un) | Réglages › Métronome (touche ; appui long = panneau) |
| `ui.timeline.metronome.panel` | Ouvre le panneau du métronome. | — | Appui long sur Métronome |
| `cells.defaults.set` *(par `operation` seulement)* | Ce que prend une nouvelle cellule : ses réglages de jeu, la **Longueur** de sa prise (temps ou mesures, `null` = Libre) et le **Décompte** (`count_in_beats`). | `command.settings{…, length, count_in_beats}` | Réglages › Décompte, Longueur ; rail des réglages par défaut |
| `view.set { snap }` | **Aimant** (quantification des gestes d'édition). | `snap` | Réglages › Aimant |
| `transport.tempo { beats_per_bar, beat_unit }` | **Signature**. | | Réglages › Signature |
| `cell.set { quantize_start, takes, midi }` | Cellule › Calage, Prises, MIDI (sur une sélection). | | Réglages › Cellule |
| `mix.record.set` / `mix.input.set` | Réglages › **Entrée**. | | |
| `quantization.set` | Quantification du projet. | | |

## 12. Outils ajoutés le 2026-11-25 (R-371, règle 22)

Ces outils comblent les écarts relevés le même jour. Chacun existe sous ses deux noms (`eve.timeline.<verbe>` et `ui.timeline.<verbe>`).

### 12a. Opérations qui n'avaient pas d'outil dédié

Elles ne passaient que par `eve.timeline.operation` ; chacune a maintenant son outil, sa description et son schéma :

| Verbe | Ce qu'il fait | Entrées (`command`) |
| --- | --- | --- |
| `clip.slip` | Glisse le contenu d'un clip dans sa fenêtre. | `clip_id`, `source_in_seconds?`, `source_out_seconds?` |
| `clip.edge` | Ce que fait le glisser d'un bord : `crop` (Rogner), `loop` (Boucle), `stretch` (Étirer). | `clip_id`, `edge` |
| `clip.gain` | Gain du clip en dB (Son › Gain). | `clip_id`, `gain_db` |
| `clip.velocity` | Vélocité d'un clip MIDI (0..1). | `clip_id`, `velocity` |
| `clip.transition` | Enchaînement avec le clip suivant : `none`, `fade`, `black`, `slide`. | `clip_id`, `kind`, `frames` |
| `clip.source` | Le clip joue un autre média, même place et même durée. | `clip_id`, `atome_id` |
| `clip.output` | Sortie propre du clip (null : celle de sa piste). | `clip_id`, `destination` |
| `clip.sound.link` | Relie de nouveau une vidéo et son son. | `clip_id`, `sound_clip_id` |
| `marker.add` · `marker.update` · `marker.remove` | Marqueurs. | `marker_id`, `name?`, `time_seconds` |
| `section.move` · `track.move` | Déplacer une section ou une piste. | `section_id` / `track_id`, `target_index`, `target_section_id?` |
| `scene.layout` | Arrangement d'une Scène dans la vue Scène. | `scene_id`, `layout` |
| `cells.defaults.set` | Réglages d'une nouvelle cellule (Longueur, Décompte…). | `settings{…, length, count_in_beats}` |
| `keyboard.bar.add` | Le Clavier d'une piste (25 nov.) : pose un instrument de la personne à la touche `key`, rangée `row` (0 la plus basse). Sur une barre, il en prend les touches (layer) ; à côté, les touches libres (split) ; Clavier vide, toutes les touches. | `track_id`, `endpoint_id` (nouveau), `instrument_id`, `name?`, `key`, `row?` |
| `keyboard.bar.edge` | Tire le bout bas ou haut d'une barre jusqu'à `key`, jamais au-delà de ses voisines. | `track_id`, `endpoint_id`, `side` (low·high), `key` |
| `keyboard.bar.set` | Réglages d'une barre : touches `range`, Transp. (±48), Canal (0 = tous, 1–16), Vélocité `[douce, forte]`, Fondu (0–24 touches). | `track_id`, `endpoint_id`, `range?`, `transpose?`, `channel?`, `velocity?`, `fade?` |
| `keyboard.bar.remove` | Retire une barre du Clavier. | `track_id`, `endpoint_id` |

`clip.add`, `clip.record_replace` restent internes (le placement passe par `clip.place`, la prise par `record.*`).

### 12b. Outils en direct (rien n'est écrit dans l'historique)

| Verbe | Ce qu'il fait | Entrées |
| --- | --- | --- |
| `input.calibrate` | Calibrer (Réglages › Avancé) : mesure la latence de l'entrée audio d'une prise et la garde. | `group_id?`, `track_id?` |
| `input.level` | Lit le niveau de l'entrée d'une piste (son « Niveau ») pendant `duration_ms`, sans l'entendre ni l'enregistrer : crête en dB, gauche, droite. | `track_id`, `duration_ms?` |
| `mix.levels` | Lit les niveaux de sortie de la console (bords de chaque tranche, dB) et les mesures des modules. | `strip_ids?` |
| `cells.bend` | Pitch bend d'une cellule jouée par note (0..16383, 8192 au centre). | `scene_id`, `track_id`, `value` |
| `scene.gain` | Gain d'une Scène entendu tout de suite (son Master) ; `scene.update { gain_db }` le garde. | `scene_id`, `gain_db` |
| `transport.cue` | Prépare le transport arrêté à `seconds` (image et son prêts). | `seconds?` |
| `transport.preview` | Fait entendre un grain à `seconds`, comme la tête glissée à l'arrêt. | `seconds`, `audio?` |
| `midi.note.preview` | Fait entendre une note d'un clip MIDI (un pad, une touche) : `pitch` ou `drum` (son du kit), répétée `count` fois tous les `every_ms` (Répét.). | `clip_id`, `pitch?`, `drum?`, `velocity?`, `count?`, `every_ms?` |

### 12c. Ce qui a changé dans les outils existants

- **Tous les verbes d'édition ont un schéma typé** (`atome/src/shared/timeline_edit_commands.js`) : les champs que lit leur réducteur, avec leurs valeurs permises (grilles, modes, vues, sons du métronome…), et une description qui dit ce que fait le verbe. Avant, ils publiaient seulement `command: { type: 'object' }`.
- **`cells.trigger`** accepte dans chaque cellule `chain` (`scene`, `loop_scene`, `loop_all` : l'enchaînement de Lecture tenue), `note` et `velocity` (une cellule jouée par note).

`batch { operations[], label }` applique toujours plusieurs opérations en un seul pas annulable, et `operation` accepte tout verbe connu.

## 13. Écarts relevés le 2026-11-25 et ce qu'ils sont devenus

1. **Calibrer** : comblé, `input.calibrate`.
2. **Enchaînement des Scènes** : comblé, `chain` dans `cells.trigger`.
3. **Pitch bend d'une cellule** : comblé, `cells.bend`.
4. **Niveau d'entrée, vumètres, mesures** : comblé, `input.level` et `mix.levels`.
5. **Gain d'une Scène en direct** : comblé, `scene.gain`.
6. **Pré-écoute et scrub entendu** : comblé, `transport.cue` et `transport.preview`.
7. **Pads** : jouer un pad et sa répétition, comblé par `midi.note.preview` ; le choix du Kit d'un pad est un champ du motif (`step_pattern.rows[].note`), écrit par `midi.notes.set`.
8. **Opérations sans outil** : comblé, §12a.
9. **Schémas non typés** : comblé, §12c.
10. **Gestes de présentation** (replier le rail, élargir un en-tête, déplier une jauge, ouvrir un rouleau, faire défiler la barre des Scènes) : pas un écart. Ils ne changent que ce que l'écran montre, rien du projet ; la voix lit l'état par `read` et agit sans eux. Ce qui se garde (en-têtes ouverts, piste dépliée, groupes repliés, console) passe par `view.set`.
11. **Communication et Calendrier du rail** : hors du multipiste (familles `communication` et `calendar`).
12. **Interrupteur Pilotage** : pas un écart. C'est un mode d'écran (« le prochain objet touché ouvre son panneau ») ; à la voix on nomme l'objet directement, par `midi.binding.create` ou `learn`.

## 14. Gel automatique des pistes (R-370)

| Commande | Ce qu'elle fait | Entrées | Geste |
|---|---|---|---|
| `audio_freeze.load` | Charge du moteur audio (instant et crête), la part de chaque piste, les pistes gelées. | — | Lecture or (≥ 60 %) ou rouge (≥ 80 %) |
| `audio_freeze.status` | Idem, avec le réglage global et la mémoire des rendus utilisée. | — | — |
| `audio_freeze.report` | Les cinq dernières lectures : leur crête de charge, pistes gelées et dégelées. | — | — |
| `audio_freeze.prepare` | « Prépare le concert » : gèle tout de suite ce qui peut l'être. | — | — |
| `audio_freeze.enable` | Gel automatique allumé ou éteint (préférence du profil). | `on` | Réglages › Avancé › Gel auto. |
| `audio_freeze.track_policy` | Une piste : `auto` ou `live` (« Toujours en direct »). | `track_id`, `policy` | voix seulement (choix de l'utilisateur, 25 nov.) |

## 15. Notes d'un clip audio (R-372)

| Commande | Ce qu'elle fait | Entrées | Geste |
|---|---|---|---|
| `clip.tune` | Fait jouer au clip le rendu de ses notes déplacées (hauteur, dérive, formant), l'original gardé ; `clear` rend l'original. | `clip_id`, `atome_id`, `notes`, `formant_semitones` ou `clear` | Vue Notes, rail Hauteur |

## 16. Synchro MIDI (R-379)

| Commande | Ce qu'elle fait | Entrées | Geste |
|---|---|---|---|
| `midi_sync.status` | Qui donne le tempo (Interne ou un appareil), s'il suit ses départs, le tempo reçu, et pour chaque appareil de sortie ce qu'il reçoit. | — | Réglages › Avancé › Synchro |
| `midi_sync.master` | « Synchronise-toi sur la Digitakt » : un appareil d'entrée devient maître (vide : Interne) ; `follow` : ses départs et arrêts pilotent le transport. | `port`, `follow` | rouleau « Maître », case « Suivre ses départs » |
| `midi_sync.output` | Ce qu'un appareil de sortie reçoit : horloge, départ et arrêt, décalage (0 à 89 ms). | `name`, `clock`, `transport`, `offset_ms` | accordéon de l'appareil |

## 17. Multicam (R-375)

Les verbes d'édition (`ui.timeline.multicam.create`, `.remove`, `.angle.add`, `.angle.remove`, `.angle.snap`, `.angle.camera`,
`.cut`, `.cut.update`, `.cut.remove`, `.paint`, `.pip`, `.pip.remove`, `.cuts.replace`, `.auto`) passent par `ui.timeline.operation`
et ont chacun leur outil typé (`timeline_edit_commands.js`). Outils en direct :

| Commande | Ce qu'elle fait | Entrées | Geste |
|---|---|---|---|
| `multicam.regie.effect` | Choisit l'effet des zones du haut F1–F3 de la Régie (fade, slide, star, blur, pip, zoom, glitch, color, black, iris), ou bascule le Latch (`latch`). | `effect` | panneau des effets live |
| `multicam.camera.set` | Règle une caméra Blackmagic d'un angle (iris, focus, iso, shutter, white_balance, nd, lift, gamma, gain, saturation, contrast) : valeurs vérifiées par le protocole, gardées sur l'angle, envoyées par sa liaison. | `track_id`, `name`, `values` | panneau Caméra (M4) |
| `multicam.camera.share` | Cet appareil (l'iPhone) donne sa caméra et son micro à la Multicam du compte ; un second appel arrête. | — | Capture › Multicam (sur le Dashboard la scène s'ouvre, l'aperçu montre le flux partagé, lampe rouge à l'antenne) |
