# Enregistrement d'écran atome — plan (14 oct. 2026)

Statut : **plan, rien d'implémenté.** Seule la lecture du code a été faite.

## Besoin (arbitrages utilisateur du 14 oct. 2026)

- On enregistre **uniquement ce qui se passe dans atome/eVe**, jamais l'écran de l'appareil, et pas en vidéo encodée : une prise légère, qu'on peut relire, modifier et stocker.
- La prise **suit la navigation** : Dashboard, ouverture et changement de projet.
- La relecture montre **exactement l'état de l'enregistrement**, pas l'état actuel des projets.
- **L'objet produit arrive sur le projet comme une prise son ou vidéo** et **se comporte exactement comme une vidéo** : lecture dans son cadre (taille réduite), plein écran comme toute vidéo, et mêmes menus et outils.
- **Son** :
  - le son produit par les atomes est **toujours** enregistré ;
  - le **micro** est enregistré par défaut et peut être coupé par une option.
- **Curseur** : affiché par défaut.
- **Saisie** : le texte tapé n'est **pas** affiché par défaut ; une option permet de l'afficher. Ce que l'écran montre déjà (contenu d'une input box) est dans la prise de toute façon. Un champ secret n'est jamais affiché, quelle que soit l'option.
- **Réglages** : un appui long sur l'outil écran ouvre les options dans le **rail latéral du projet** (micro, curseur, saisie), avec un **bouton rec** qui lance la prise. Le Dashboard n'a pas ce rail : depuis le Dashboard, les mêmes options se règlent **dans les Préférences**.
- Pendant la prise, un indicateur **record** reste visible en bas.

## État constaté (lecture du code)

| Brique | Où | Statut |
|---|---|---|
| Outil `ui.capture.screen` | `eVe/intuition/tools/capture.js:184`, déclaré dans `tool_runtime_bootstrap_defs_b.js:272` | Existe mais sans effet : aucun handler n'est branché, il retombe sur `() => ({ ok: true })` (`capture.js:68`). Mystic l'affiche « Écran (bientôt) », désactivé. |
| `getDisplayMedia` | `intuition/tools/molecule/recording/generic.js:91` | Inadapté : il filme l'écran de l'appareil. |
| Journal d'actions Naturel | `domains/rendering/natural_action_journal.js` | Disponible : écoute `atome:changed` et les étapes intermédiaires des gestes. Inadapté seul : il ne suit qu'un projet à la fois et ne voit ni l'UI ni le Dashboard. |
| Lecteur Naturel | `domains/rendering/natural_action_replay_runtime.js` | Rejoue sur l'affichage seul. Il part de l'état ACTUEL des atomes non touchés, ce qui contredit « même état ». |
| Appels d'outils | `intuition/runtime/tool_gateway.js:165`, événement `eve:tool-invoked` | Disponible ; déjà consommé par `midi_binding_service.js`. |
| **Ce qui est affiché** | `PROJECT_SCENES.get(sceneState.foregroundProjectId).records` | **C'est le point d'observation.** Les atomes, les arbres BevyUI et le Dashboard (scène `__eve_dashboard_workspace__`) sont tous des records de la scène au premier plan. Les 9 routes d'écriture font toutes `runtime.records.set(id, nouveauRecord)` : comparer les références suffit, sans instrumenter ces routes. |
| Menus d'un objet | `intuition/menu/context_menus.json` : `menus.{mystic,sidebar}.objects.video`, `activities.video` | Les menus sont rangés **par type** d'objet. |
| Atterrissage d'une prise | `landCaptureAtome` (`capture_reveal_runtime.js`), `createPendingCaptureExportOptions` | Disponible pour audio et vidéo, y compris pour une prise lancée depuis le Dashboard. |
| Rendu dans une texture | `atome/renderers/bevy-core/src/mystic_capture.rs` (RenderLayers + RenderTarget) | Sert de précédent pour lire une prise dans un cadre. |
| Appui long sur un outil de capture | `capture.js:37` (`hold`, `pointer.long`), précédent MIDI | Disponible. |
| Options d'un outil dans le rail | `menus.sidebar.tools.<outil>` + `armed_tool_rail_runtime.js` | Disponible côté projet, ce qui suffit puisque le Dashboard n'a pas ce rail. |
| Indicateur de prise | `capture_recording_feedback_runtime.js` (`startCaptureVisualSession`) | Disponible pour audio et vidéo. **À vérifier** : qu'il produise bien le « record en bas » attendu. |
| Prise micro | `startAudioRecording` (web_capture), enregistreur natif iOS | Disponible. Exclusion mutuelle avec la vidéo (`video_recording_in_progress`) à étendre à l'écran. |
| Son produit par les atomes | `atome/src/application/audio_runtime/` (Kira, WebAudio) ; moteur natif iOS/AUv3 | **À vérifier par plateforme** : un point de dérivation du mixage de sortie. |

## Décision de type : l'objet EST une vidéo

Pour qu'il « se comporte exactement comme une vidéo » sans dupliquer les menus ni les outils, l'objet est un atome **`video`** qui porte une propriété de source, par exemple `video_source: 'screen_recording'` et `recording_url`. C'est le même principe que `placeholder_kind` : une propriété sur un type existant, jamais un nouveau type. Les menus, la lecture, le plein écran, la timeline et le partage de la vidéo s'appliquent alors tels quels.

Deux choses changent selon la source :
- **le rendu**, qui devient une sous-scène de relecture rendue dans une texture au lieu d'un décodage vidéo ;
- **le pilotage de la lecture** (lecture, pause, déplacement), qui est envoyé au lecteur de prise au lieu de l'élément vidéo.

**À vérifier au lot 2** : le point unique du runtime de lecture vidéo où brancher cette dérivation.

## Architecture : 4 pistes, une seule prise

1. **Piste d'affichage** (garantit « même état ») : une image clé de tous les records de la scène au premier plan, puis à chaque image (~30 Hz) les records dont la référence a changé, les suppressions et les changements de scène (Dashboard ↔ projet). S'y ajoutent l'affine caméra (`project_view_camera_runtime`) et la taille de la surface. Une image clé toutes les N secondes permet de se déplacer dans la prise.
2. **Piste d'actions** (pour agir sur la prise plus tard) : `eve:tool-invoked` + `atome:changed`, sur tous les projets visités.
3. **Piste pointeur et saisie** : écoute de `pointer*` et `key*` en phase de capture, sans rien intercepter. Les touches ne sont gardées que si l'option « saisie » est active, et jamais dans un champ secret.
4. **Piste son** : le mixage des atomes (toujours) + le micro (option), en un média audio lié.

Exclus de la prise : le chrome de l'enregistreur lui-même (indicateur, rail d'options) et les flux en direct non rejouables (caméra Visio, TV). Ces derniers sont remplacés par leur affiche.

**Stockage** : un fichier de prise (JSON compressé) envoyé comme un média (`/api/uploads`), référencé par l'atome vidéo. La vignette est la première image clé.

**Préférences** : un seul jeu `preferences.screenRecording` = `{ micro: true, cursor: true, typed_text: false }`, par utilisateur. Le rail du projet et les Préférences éditent ce même jeu.

## Lots

| # | Lot | Taille |
|---|---|---|
| 0 | **Mesure** (sonde app réelle) : débit de records par minute (défilement du Dashboard, édition, panneaux), poids de la prise, chemins d'affichage hors records (fond d'écran, verre, shader Mystic, image vidéo, affine caméra), et point de dérivation du son des atomes par plateforme. Objectif de poids de l'ordre de 1 Mo/min, à confirmer. | S |
| 1 | Runtime d'enregistrement (4 pistes) + handler `ui.capture.screen` (bascule) + indicateur record + exclusion audio/vidéo + atterrissage sur le projet par le chemin des prises audio et vidéo. | M |
| 2 | Atome `video` avec la source `screen_recording` : envoi du fichier, vignette, dérivation du pilotage de lecture, i18n, maps. | M |
| 3 | Lecture dans le cadre de la vidéo : sous-scène Bevy rendue dans une texture, curseur fantôme, saisie, son synchronisé ; reconstruction du WASM et du natif. **Lot le plus lourd.** | L |
| 4 | Plein écran : le même lecteur, passé par le plein écran vidéo existant. | S |
| 5 | Options : appui long → rail du projet (micro, curseur, saisie + bouton rec), section dans les Préférences, `preferences.screenRecording`. | S–M |
| 6 | Partage par le parcours vidéo existant, avec l'accès aux médias référencés par la prise (images et vidéos vues pendant l'enregistrement). | M |
| 7 | Édition : couper et rogner comme une vidéo ; plus tard, rejouer la piste d'actions sur un projet. | M–L |

Validation : sondes Playwright sur l'app réelle, avec les vrais pixels (lecture dans le cadre et plein écran) et le son, sur Web puis Tauri et iPhone. Pour le lot 3, une reconstruction du WASM et une purge du service worker sont nécessaires.

## Risques

- **Poids et CPU de la piste d'affichage** pendant un défilement du Dashboard : c'est la raison du lot 0.
- **Ce qui ne passe pas par les records** : il faut l'inventorier au lot 0, sinon la relecture ne sera pas fidèle.
- **Dérivation du son des atomes** sur iOS et AUv3, où le moteur est natif.
- **Médias absents** au moment de la relecture ou chez le destinataire d'un partage.
- **Vie privée** : tout ce qui est visible à l'écran (messages, contacts) se retrouve dans une prise partagée.
- **Rendu dans une texture** à valider sur l'iPad A12Z, limité à 4 storage textures.
