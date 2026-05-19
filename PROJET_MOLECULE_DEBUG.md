# Projet Molécule - Debug, renommage et évolution MTRX

Date: 2026-04-30

## Décision de départ

On commence par débuguer les flux Molécule/MTRX existants avant d'ajouter l'enregistrement audio/vidéo multi-plateforme. Les bugs actuels touchent l'identité des médias, la persistance, l'ouverture/fermeture, le preview et la couche graphique. Ajouter une grosse fonctionnalité maintenant rendrait les causes beaucoup plus difficiles à isoler.

On part des bugs réels observés, puis on fait un audit ciblé du système MTRX/MTrack/Molécule autour des zones touchées. On ne commence pas par un grand nettoyage global.

## Vision produit cible

- Le terme utilisateur officiel est **Molécule**.
- **MTRX** peut rester un nom technique pour le moteur, le format ou une représentation interne.
- L'utilisateur ne devrait pas voir un outil de conversion nommé MTrack/Mtrax.
- Double-cliquer une molécule ou un média doit ouvrir directement l'expérience Molécule pertinente.
- Les vues futures doivent être plusieurs représentations du même objet Molécule, pas plusieurs objets concurrents:
  - vue timeline / tracks;
  - vue liste des médias et assets;
  - vue layout / compositing sans timeline encombrante;
  - éventuellement une vue diagnostic/dev réservée.

## Position sur l'ancien outil MTrack/Mtrax

L'outil MTrack actuel ressemble encore à un outil d'ouverture/conversion explicite. Ce rôle n'est plus souhaitable si la création/conversion en structure MTRX est implicite à l'import ou à l'ouverture.

Décision recommandée:

- A court terme, ne pas supprimer brutalement le code.
- Retirer ou renommer l'exposition UI "MTrack/Mtrax" vers "Molécule".
- Faire du double-clic l'entrée normale vers l'objet Molécule.
- Garder temporairement les modules internes `mtrax` si le renommage complet risque de casser le runtime.
- A moyen terme, transformer l'ancien outil en sélecteur de vues Molécule ou le supprimer s'il n'a plus de responsabilité propre.

## Bugs récurrents rapportés

### P0 - Perte ou mélange de médias

- Les vidéos sont parfois perdues après rechargement de la page.
- Les vidéos sont parfois perdues après fermeture/réouverture de MTrack.
- Deux MTracks ouverts successivement peuvent être rassemblés dans un seul.
- Après ouverture/fermeture d'une vidéo puis ouverture/fermeture d'un audio, la réouverture peut mélanger audio et vidéo dans le même MTrack.
- Des contenus qui devraient rester séparés semblent combinés dans une même timeline/session.

Hypothèses à vérifier:

- Identifiants de session/timeline trop génériques ou réutilisés.
- Clé de persistance commune entre plusieurs molécules.
- Déduplication d'ouverture trop agressive.
- Etat global partagé entre deux panels ou deux médias.
- Fermeture qui écrit un état incomplet ou dans la mauvaise molécule.
- Réhydratation qui fusionne plusieurs sources au lieu de restaurer l'objet exact.

### P0 - Preview vidéo et vignettes instables

- La vignette vidéo ne s'affiche pas toujours.
- Le preview vidéo peut disparaître après reload ou fermeture.
- Le comportement est erratique, donc probablement lié à l'ordre des événements, au chargement média, aux URLs protégées, ou au cycle de vie du host preview.

Hypothèses à vérifier:

- URL média temporaire ou token expiré/non réhydraté.
- Preview host détruit trop tôt ou rattaché au mauvais parent DOM.
- Race condition entre import, preview, persistance et rendu.
- Fallback image/video non stable selon runtime Fastify/Axum/Tauri/browser.

### P1 - Ouverture graphique confuse

- L'ouverture MTrack crée une deuxième vue: l'atome reste sur le bureau et MTrack s'ouvre en dessous avec un preview interne.
- Ce comportement encombre l'interface et ne correspond pas à la vision cible.
- L'expérience attendue est d'ouvrir les pistes/outils autour de l'objet courant, pas de dupliquer la représentation utilisateur.
- Pour débuguer hors box/footer, on veut pouvoir ouvrir temporairement deux vues MTrack/Molécule visibles en même temps, par exemple une vidéo et un audio, afin de vérifier que chaque atome garde sa propre session et que le second double-clic ne recycle pas le premier état.

Hypothèses à vérifier:

- Le système crée un panel MTrack indépendant au lieu de promouvoir l'atome courant en vue Molécule.
- Le preview est traité comme un contenu séparé plutôt que comme une représentation de l'atome actif.
- L'ancien outil de conversion impose encore son modèle UI.

### P1 - Bugs graphiques de déplacement et fermeture

- En déplaçant MTrack, le panel peut se refermer.
- Le déplacement peut cacher la timeline ou les éléments multipistes.
- Le layout des pistes/timeline peut se désynchroniser du panel.

Hypothèses à vérifier:

- Conflit entre drag panel, drag média, drag timeline et sélection.
- Z-index ou overlay qui intercepte les événements.
- Resize/reflow déclenché pendant un drag.
- Fermeture déclenchée par un blur/click-outside mal filtré.

### P2 - Renommage incomplet

- Les termes MTrack/Mtrax restent visibles dans l'outil et probablement dans certains menus/raccourcis.
- Le langage produit doit être Molécule.

Décision:

- Renommer d'abord les labels UI et les entrées outil.
- Garder les noms internes `mtrax` pendant la phase de stabilisation si nécessaire.
- Programmer le renommage technique complet après stabilisation, avec tests de non-régression.

## Ordre de travail recommandé

1. [en cours] Reproduire et instrumenter les pertes/mélanges de médias.
2. [en cours] Stabiliser l'identité Molécule: session, timeline, atome courant, clés de persistance.
3. [à faire] Stabiliser fermeture/réouverture/reload.
4. [à faire] Corriger preview vidéo/vignettes.
5. [à faire] Corriger ouverture double-clic et suppression de la deuxième vue inutile.
6. [à faire] Corriger drag/layout/fermeture graphique.
7. [à faire] Renommer l'UI vers Molécule.
8. [à faire] Auditer le système MTRX complet pour les points faibles restants.
9. [à faire] Décider si l'ancien outil MTrack est supprimé ou transformé en sélecteur de vues.
10. [à faire] Ensuite seulement, ajouter l'enregistrement audio/vidéo multi-plateforme.

## Probes et scénarios de validation à créer ou renforcer

- Import vidéo, ouverture Molécule, fermeture, réouverture: la vidéo reste présente.
- Import vidéo, reload page, réouverture: la vidéo reste présente.
- Import audio puis vidéo séparément: deux molécules restent séparées.
- Ouvrir deux molécules successivement: aucune fusion involontaire.
- Fermer une molécule puis ouvrir une autre: pas de contamination d'état.
- Double-clic média: une seule représentation cohérente, sans panel doublon.
- Debug hors box: double-clic vidéo puis double-clic audio doit permettre de voir deux vues Molécule/MTrack distinctes, sans contamination vidéo/audio.
- Drag panel Molécule: le panel ne se ferme pas et la timeline reste visible.
- Preview vidéo: vignette stable avant/après reload et avant/après fermeture.
- Suppression/duplication: l'objet dupliqué a sa propre identité et ses propres assets.

## Zones du code à auditer en priorité

- `eVe/intuition/tools/mtrack.js`
- `eVe/intuition/runtime/mtrack_dock_controller.js`
- `eVe/domains/mtrax/`
- `eVe/domains/mtrax/preview/`
- `eVe/core/media_engine/molecule.js`
- `eVe/core/media_engine/molecule.api.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/intuition/tools/core/mtrax_renderer_webgpu_adapter.js`
- `eVe/core/project_store/`

## Points de faiblesse déjà suspectés

- Trop de responsabilités dans l'ancien outil MTrack.
- Etat global ou singleton utilisé pour plusieurs molécules.
- Verrous d'ouverture/déduplication qui peuvent confondre deux actions proches.
- Frontière floue entre atome, molécule, preview, timeline et panel.
- Persistance média et persistance timeline probablement pas assez strictement liées à une identité unique.
- UI encore pensée comme un outil externe plutôt qu'une vue native de l'objet Molécule.
- MTrack est encore fortement piloté comme un singleton global (`activeGroupId`, timeline, preview, panel), ce qui contredit le besoin de debug multi-instance et explique probablement la contamination d'état entre deux atomes.

## Journal d'enquête et corrections

### 2026-04-30 - Enquête P0 identité/persistance

Statut: correction 1 appliquée, validation partielle OK.

Constats:

- L'import média convertit bien les vidéos/audios/images en groupe Molécule/MTRX dans `tool_genesis.js`, avec `group_type: "mtrax_media"`, `mtrax_import: true`, `source_kind: "mtrax_import"` et une timeline initiale.
- La sauvegarde de timeline dans `eVe/domains/mtrax/timeline/persist_runtime.js` réécrit ensuite le payload du groupe avec `group_type: "media"`.
- Cette réécriture affaiblit l'identité spécialisée d'une molécule importée après fermeture/sauvegarde/reload. Elle peut faire perdre aux couches UI/rendu le signal "mtrax_media" qui distingue une molécule média importée d'un groupe générique.
- Le flux d'ouverture passe par plusieurs verrous/déduplications: `tool_genesis.js`, `ui.mtrax.open`, `openGroupTimelineThroughMtrack`, puis `eveMtrackApi.loadGroupTimeline`. Les verrous semblent actuellement séparés par groupe, mais ils restent à tester avec deux ouvertures très proches.

Correction candidate:

- [fait] Préserver `group_type: "mtrax_media"` et les flags `mtrax_import/source_kind/media_kind/original_kind` dans le payload de persistance quand la timeline active vient d'un import MTRX.

Validation prévue:

- [fait] Ajout de `eVe/domains/mtrax/tests/timeline_persist_runtime.test.mjs`.
- [fait] `node eVe/domains/mtrax/tests/timeline_persist_runtime.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/mtrack_commit_bridge_runtime.test.mjs`: PASS.
- [fait] `node eVe/core/media_engine/molecule.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/clip_deletion_runtime.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/join_playback_runtime.test.mjs`: PASS.
- [bloqué] Le test `eVe/domains/mtrax/preview/preview_host_resolution_runtime.test.mjs` mentionné dans l'IDE n'existe pas dans le workspace actuel.

### 2026-04-30 - Enquête P1/P0 boucles, splits et doublons

Statut: correction 2 appliquée, validation OK.

Constat:

- `eVe/domains/mtrax/tests/clip_loop_model.test.mjs` échouait avant correction: `buildClipPlaybackSegments` retournait `[]` dans le scénario de lecture aplatie d'une boucle/crop.
- Le test passait `fallbackSource`, mais `buildClipPlaybackSegments` ne lisait que `defaultSource`.
- Effet runtime probable: certains chemins historiques ou tests qui fournissent `fallbackSource` peuvent produire zéro segment lisible, donc un média peut sembler perdu dans les cas de boucle, split, duplication ou playback aplati.

Correction:

- [fait] `buildClipPlaybackSegments` accepte maintenant `fallbackSource` comme alias de `defaultSource`.

Validation prévue:

- [fait] `node eVe/domains/mtrax/tests/clip_loop_model.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/timeline_persist_runtime.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/mtrack_commit_bridge_runtime.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/clip_deletion_runtime.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/join_playback_runtime.test.mjs`: PASS.
- [fait] `node eVe/core/media_engine/molecule.test.mjs`: PASS.
- [fait] Syntaxe OK sur `persist_runtime.js` et `loop_model.js`.

### 2026-04-30 - Nouvelle tâche P0/P1 ouverture attachée et debug multi-instance

Statut: correction court terme appliquée, validation automatisée OK. La refonte multi-instance réelle reste à faire.

Objectif court terme:

- [corrigé] Quand on double-clique un atome audio/vidéo, la fermeture MTrack ne doit jamais faire disparaître l'atome source du bureau.
- [corrigé] Quand on ouvre un audio après une vidéo, aucun preview/piste de la vidéo précédente ne doit rester visible pendant plusieurs secondes.
- [partiel/debug] Pour le debug hors box/footer, garder une copie visuelle figée de la vue précédente lors d'un switch direct vidéo -> audio, afin de voir deux états à l'écran et détecter la contamination du singleton.

Objectif produit long terme:

- MTrack/MTRX doit devenir une vue attachée à l'atome Molécule courant, pas une application/panel global contenant une deuxième représentation de l'atome.
- Chaque atome Molécule doit porter sa propre identité de session/timeline/preview.

Hypothèses à vérifier:

- [confirmé] `openGroupTimelineThroughMtrack` alimente un unique `eve_mtrack_dialog`, donc chaque ouverture remplace l'état global précédent.
- [confirmé] Le visuel de l'atome source pouvait rester vide: `renderGroupHostPreview` retire le placeholder quand l'atome est le MTrack actif, puis la fermeture ne rafraîchissait le visuel que si une nouvelle preview avait été persistée.
- [confirmé] Lorsqu'un autre atome est ouvert pendant que le panel est visible, l'ancien panel reste affiché jusqu'à la fin de `buildMtrackGroupTimelinePayload` puis `loadGroupTimeline`.
- [à vérifier] Le montage en footer autour de l'atome courant est confondu avec la présence de l'atome sur le bureau.
- [à vérifier] Le preview interne est rendu depuis la même timeline globale au lieu d'une instance attachée.

Corrections appliquées:

- [fait] Sur `eve:mtrack-panel-closed`, appeler `refreshGroupVisual(groupId)` même quand aucune nouvelle vignette n'a été capturée, pour reconstruire le placeholder/preview de l'atome source.
- [fait] Pendant un changement de groupe visible, masquer le vrai `eve_mtrack_dialog` jusqu'à la fin du chargement de la nouvelle timeline. Cela évite de voir l'ancienne vidéo pendant l'ouverture de l'audio.
- [fait] Pendant un changement de groupe visible, créer une copie DOM figée et non interactive du panel précédent, limitée à deux snapshots. C'est un outil de debug court terme pour visualiser deux états à l'écran malgré le singleton.

Validation:

- [fait] `node --check eVe/intuition/eVeIntuition.js`: PASS.
- [fait] `node eVe/domains/mtrax/tests/timeline_persist_runtime.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/clip_loop_model.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/mtrack_commit_bridge_runtime.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/clip_deletion_runtime.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/tests/join_playback_runtime.test.mjs`: PASS.
- [fait] `node eVe/core/media_engine/molecule.test.mjs`: PASS.

Limite restante:

- La vraie solution produit n'est pas encore une multi-instance fonctionnelle. Le code utilise toujours un singleton MTrack global. La correction actuelle empêche la disparition visuelle et la contamination visible pendant le switch, et ajoute un snapshot debug, mais il faudra ensuite extraire une session MTRX par atome.

### 2026-04-30 - Audit audio/rendu et suppression AudioWorklet lecture

Statut: correction lecture appliquée, enregistrement browser conservé comme exception contrôlée.

Règle validée:

- [fait] La lecture MTrack/Molécule ne doit jamais utiliser AudioWorklet.
- [fait] La lecture audio passe par Kira: natif via Tauri/iOS, WASM en browser.
- [fait] `AudioWorklet` reste autorisé uniquement pour l'enregistrement audio en browser pur, car il capte du PCM plus proprement que `MediaRecorder` quand on doit produire un WAV contrôlé.
- [à faire] iOS/AUv3 et Tauri doivent avoir des backends natifs d'enregistrement audio/vidéo; ne pas dépendre d'AudioWorklet sur ces plateformes.

Corrections appliquées:

- [fait] `hmtracks_audio_engine_v1.js` ne crée plus de processeur AudioWorklet ni de thread audio local pour la lecture. Il devient un pont transport/horloge `kira_bridge_only`.
- [fait] Le pont de lecture n'expose plus de `targetNode` WebAudio ni de route `web_audio`.
- [fait] Les fallbacks de lecture `AudioBufferSourceNode/createBufferSource` ont été retirés de `hmtracks_native_playback_runtime.js`.
- [fait] Les diagnostics MTrack parlent maintenant de pont Kira au lieu de `audio_worklet_required`.
- [fait] Le test `hmtracks_audio_engine_v1.test.mjs` vérifie que le backend browser lecture est `web_wasm_kira`, route `kira`, sans noeud WebAudio de sortie.
- [fait] Le chemin `AudioWorklet` d'enregistrement browser a été restauré après clarification: l'interdiction concerne la lecture.

Décision d'architecture proposée pour l'enregistrement multi-plateforme:

- API JS unique: `record_start/record_stop` pour audio et une future API equivalente `capture_start/capture_stop` pour audio+video.
- Backends natifs:
  - Tauri desktop: Rust natif, CPAL pour audio, capture video par APIs OS, encodage/mux natif.
  - iOS/AUv3: Swift natif, AVFoundation/ReplayKit selon source, AVAssetWriter pour fichier final.
  - Browser pur: Web APIs, `AudioWorklet` pour PCM audio-only, `MediaRecorder` possible pour capture audio+video browser.
- Pas de "une seule lib magique" si elle dégrade iOS/AUv3 ou Tauri. La source de vérité doit être le contrat API + manifeste de recording, pas le même backend partout.

### 2026-04-30 - Audit structurel MTrack/Molécule

Statut: audit initial fait, nettoyages bas risque appliqués, refontes lourdes à planifier.

Constats principaux:

- [confirmé] Le runtime MTrack/Molécule reste organisé autour d'un gros état singleton dans `eVe/domains/mtrax/core/state_factory.js`. Il mélange session, timeline, preview, rendu, audio, recording, sélection, drag, diagnostics et état projet.
- [confirmé] Le modèle actif/dormant (`activeGroupId`, `dormantGroupId`, timeline active, preview actif) explique bien la contamination possible entre deux atomes ouverts successivement. Ce n'est pas encore un vrai modèle multi-instance.
- [confirmé] Plusieurs fichiers dépassent 900 à 2000 lignes (`loop_cells_runtime.js`, `hmtracks_native_playback_runtime.js`, `record_capture_runtime.js`, `window_api_runtime.js`, `transport_gestures_runtime.js`, `styles.js`, `group_timeline_load_runtime.js`, `play_runtime.js`). Ce sont des zones à risque élevé pour les régressions et les effets de bord.
- [confirmé] Le renderer WebGPU a un fallback noop. C'est préférable à un crash, mais dangereux si le résultat utilisateur devient un preview vide silencieux.
- [confirmé] Le vocabulaire technique `mtrax` est encore omniprésent dans les ids, schemas, datasets et routes. Il ne faut pas le renommer globalement maintenant, car il sert de contrat interne.
- [confirmé] Les libellés utilisateur principaux pouvaient encore afficher `Mtrack`/`MTraX`.
- [confirmé] La lecture audio locale ne doit plus avoir de fallback WebAudio; la seule route de lecture valide est Kira natif/WASM.

Corrections de nettoyage appliquées:

- [fait] Les libellés utilisateur directs passent à `Molécule` dans le panel, l'outil principal, les defaults utilisateur et le titre de groupe.
- [fait] Les diagnostics lourds de panel sont maintenant derrière flags debug/trace au lieu de tourner par défaut.
- [fait] Le vocabulaire de lecture audio a été nettoyé: moteur bridge Kira, pas de processeur local AudioWorklet de lecture.
- [fait] Ajout d'un garde `groupTimelineLoadSeq` sur le chargement de timeline: une ouverture ancienne qui finit après une ouverture plus récente est ignorée avant de réécrire l'état singleton.
- [fait] Les diagnostics Xcode/console du bridge MTrack sont désactivés par défaut et les stacks ne sont construites qu'en mode debug/diag.

Validation ajoutée:

- [fait] `group_timeline_load_stale_runtime.test.mjs`: reproduit deux chargements concurrents et vérifie que l'ancien chargement ne remplace pas la Molécule active.
- [fait] Suite ciblée relancée: stale load, persistance timeline, loop model, join playback, audio engine Kira, contrat mount panel.

### 2026-04-30 - Régression lecture Tauri/browser après cleanup audio

Statut: correction appliquée, validation automatisée ciblée OK. Validation manuelle Tauri/browser encore nécessaire.

Régression rapportée:

- Tauri: la lecture audio marche, mais la lecture vidéo ne démarre plus.
- Browser: la lecture audio ne marche plus; la vidéo démarre environ une seconde puis se bloque.
- iOS/AUv3: lecture OK selon observation.

Cause probable:

- Le cleanup audio a rendu le routage trop strict: le runtime essayait de piloter aussi les timelines vidéo pures via le moteur audio Kira/clock bridge.
- En browser, `resolveAudioRuntime()` annonçait `web_wasm_kira` dès que `WebAssembly` existe, mais la façade `Squirrel.av.audio` peut ne pas être chargée. Le runtime tentait alors Kira au lieu de retomber sur `HTMLMediaElement`.
- Les clips audio browser étaient mutés/pausés si le moteur natif ne prenait pas réellement la sortie, donc silence.

Corrections:

- [fait] Tauri/browser vidéo pure: ne plus forcer Kira; revenir à l'horloge visuelle et à `HTMLMediaElement`.
- [fait] Tauri audio: continuer à utiliser Kira natif.
- [fait] Browser audio: utiliser Kira WASM seulement si la façade `Squirrel.av.audio` expose réellement `create_clip` et `play_instance`; sinon fallback `HTMLMediaElement`.
- [fait] Audio browser fallback: si Kira ne possède pas la sortie, l'élément audio est démuté, positionné et lancé via `media.play()`.
- [fait] Aucun retour d'`AudioWorklet` pour la lecture.

Validation:

- [fait] `play_runtime_route_policy.test.mjs`: couvre Tauri vidéo pure, Tauri audio, browser audio sans façade WASM.
- [fait] Suite ciblée relancée: route policy, stale load, persistance timeline, loop model, join playback, audio engine Kira.

Tâches ajoutées après audit:

1. [en cours][P0] Extraire une vraie session Molécule par atome/groupe: état, timeline, preview, transport et audio doivent être adressés par `groupId/sessionId`, pas par un singleton global.
2. [en cours][P0] Ajouter une probe double ouverture: vidéo puis audio, audio puis vidéo, deux molécules visibles en debug, aucune contamination de pistes/preview.
3. [à faire][P0] Durcir la fermeture: fermer une Molécule ne doit jamais masquer ou supprimer l'atome source du bureau.
4. [à faire][P0] Formaliser le contrat d'enregistrement unique: API JS commune, backends natifs Tauri/iOS/AUv3, backend browser séparé avec `AudioWorklet` seulement pour recording browser.
5. [à faire][P1] Découper `state_factory.js` en sous-états par domaine: session, timeline, preview, audio, recording, UI, diagnostics.
6. [en cours][P1] Découper les fichiers runtime les plus gros en modules testables, en commençant par `loop_cells_runtime.js`, `hmtracks_native_playback_runtime.js`, `record_capture_runtime.js`, `window_api_runtime.js`.
7. [à faire][P1] Remplacer les fallbacks WebGPU noop silencieux par un état d'erreur explicite visible dans le diagnostic et testable.
8. [à faire][P1] Séparer clairement UI de panel et lifecycle média: drag/resize/close ne doivent pas écrire la timeline ou le média hors action explicite.
9. [à faire][P1] Continuer le renommage UI vers Molécule sans toucher aux ids techniques `mtrax` tant que les probes P0 ne sont pas vertes.
10. [à faire][P2] Préparer une migration technique `mtrax` -> `molecule` seulement après stabilisation, avec compatibilité des anciennes timelines.

### 2026-04-30 - Audit cellules / loop cells / record cells

Statut: nettoyage ciblé appliqué, première découpe modèle/sections/preview terminée, tests automatisés OK. Le découpage UI complet reste à faire.

Constats:

- [confirmé] `loop_cells_runtime.js` reste trop massif et mélange modèle, rendu DOM, drag/drop, sélection, schedule d'enregistrement, footer et persistance.
- [confirmé] Les clés de cellule `entryId::trackId` étaient encore construites/parsées à plusieurs endroits, donc risque de divergence entre sélection, couleurs, record cells, suppression et persistance.
- [confirmé] Les structures `selectedLoopCellKeys`, `loopCellColorByKey` et `loopCellRecordByKey` pouvaient conserver des clés périmées ou non canoniques après reload, clone, duplication, suppression ou capture.
- [confirmé] Les clones de cellule invalides pouvaient rester dans l'état sans section visible, avec configs de cellule encore persistables.
- [confirmé] L'application d'une source d'enregistrement à plusieurs cellules pouvait programmer plusieurs persistences au lieu d'une mutation groupée.
- [confirmé] Il restait un petit bout de code mort côté preview cellule.

Corrections:

- [fait] Ajout d'une source de vérité `shared/loop_cell_keys.js` pour construire/parser les clés de cellule.
- [fait] Canonicalisation des clés dans runtime cellules, chargement timeline, persistance timeline, suppression, capture record, outil couleur, contexte sélection et API d'état.
- [fait] Pruning des sélections/configs de cellule périmées: active cell, selected cells, couleurs, record cells, playback cell.
- [fait] Duplication/clone de cellule: copie des couleurs et configs d'enregistrement scoped par cellule.
- [fait] Suppression d'entrée cellule: nettoyage de la sélection, des configs et de l'état playback associé.
- [fait] Batch record cells: une seule persistance/footer event pour une sélection multi-cellules.
- [fait] Normalisation des clones invalides: fallback sur le marker source si possible, sinon rejet.
- [fait] Suppression du code mort `previewRendered`.
- [fait] Extraction de `timeline/loop_cells_model.js`: règles d'état, clés, maps, pruning, duplication scoped, normalisation follow/repeat.
- [fait] Extraction de `timeline/loop_cells_sections.js`: résolution des sections visibles et navigation section suivante.
- [fait] Extraction de `timeline/loop_cells_preview.js`: rendu miniature audio/vidéo des cellules.

Validation:

- [fait] Ajout/extension de `loop_cells_runtime.test.mjs`: duplicate/clone, suppression, batch clear, batch record source, pruning, clés non canoniques, clone invalide.
- [fait] Ajout de tests directs: `loop_cells_model.test.mjs`, `loop_cells_sections.test.mjs`, `loop_cells_preview.test.mjs`.
- [fait] Toute la suite locale `eVe/domains/mtrax/tests/*.mjs`: PASS.
- [fait] Syntaxe globale: `npm run check:syntax` -> `Syntax OK (1072 file(s))`.

Reste à faire:

1. [fait][P1] Extraire le modèle pur des cellules hors de `loop_cells_runtime.js`.
2. [en cours][P1] Extraire le rendu DOM/bindings drag/drop/resize dans un module UI dédié.
3. [à faire][P1] Ajouter des probes visuelles browser/Tauri: drag header, resize panel, drop record audio/video, suppression cellule, reload avec couleurs/record cells.
4. [à faire][P2] Harmoniser les rapports API pour exposer "Molécule/cellules" côté UI sans renommer les contrats techniques MTRX.

### 2026-04-30 - Régression son vidéo Web/Torii et contrat audio lié

Statut: première correction insuffisante confirmée par test manuel. Deuxième passe appliquée sur le vrai chemin runtime: source extraite protégée/authentifiée + extraction FFmpeg déterministe AAC. Validation manuelle Web/Safari, Web3 et Torii encore nécessaire.

Matrice de test manuel rapportée:

| Plateforme | Audio atome | Vidéo atome | Scrub vidéo | Vignette vidéo | Autre |
| --- | --- | --- | --- | --- | --- |
| Web/Safari | OK, scrub OK | image OK, son absent ou micro-saut puis silence | position visuelle OK, son absent | très instable | après fermeture, une molécule vidéo peut devenir non déplaçable |
| Web3 | OK, scrub OK | vidéo OK avec son | OK avec son | instable/absente | lecture globalement correcte |
| Torii/Tauri | OK, scrub OK | image OK, son absent/intermittent | scrub visuel OK, son absent | instable | proche Web/Safari |
| iOS/AUv3 | OK d'après tests précédents | OK d'après tests précédents | OK d'après tests précédents | à confirmer | différent de Torii malgré le natif |

Constats d'enquête:

- [confirmé] L'import vidéo crée bien deux clips: un clip `video` role `video_image` et un clip `audio` lié role `video_audio`.
- [confirmé] Le clip audio lié pointait encore vers le même conteneur vidéo, pas vers une ressource audio extraite.
- [confirmé] Plusieurs runtimes traitaient encore le clip vidéo lui-même comme porteur d'audio natif. Résultat: double routage possible, mute/unmute incohérent et comportement divergent selon WebKit, Tauri/Kira, Web3/WASM et iOS.
- [confirmé] Le serveur Fastify possède déjà `/api/extract-audio/:file`, qui extrait une piste `.m4a` avec FFmpeg pour les conteneurs vidéo.
- [confirmé] La première correction Web ne pouvait pas changer le comportement de manière fiable: `/api/extract-audio/:file` n'était pas normalisé comme source protégée, donc le resolver auth pouvait laisser sortir une source non fetchée/authentifiée vers Kira WASM.
- [confirmé] L'extraction serveur faisait `-acodec copy`; un `.m4a` pouvait donc conserver un codec non supporté ou fragile côté Safari/WebAudio. Le symptôme compatible est un micro-départ de son puis silence.
- [confirmé] Le générateur de thumbnails normalisait toutes les vidéos comme `video_recording`, ce qui pouvait transformer un upload `/api/uploads/foo.mov` en `/api/recordings/foo.mov`.
- [confirmé] Une erreur thumbnail était stockée comme état final non retenté, donc un échec transitoire pouvait laisser la vignette absente jusqu'à un nouvel import/reload favorable.

Corrections appliquées:

- [fait] Ajout de `clips/audio_link_policy.js`: source de vérité pour `video_image`, `video_audio`, `linked_audio_clip_id` et `linked_video_clip_id`.
- [fait] `hmtracks_session_runtime.js`: les clips vidéo liés `video_image` ne sont plus ajoutés à `native_audio_clips`. Seul le clip audio lié porte le son.
- [fait] `hmtracks_native_playback_runtime.js`: lecture, scrub et preview audio ignorent les clips vidéo qui ne portent pas leur propre audio.
- [fait] `position_runtime.js`, `audio_state_runtime.js`, `playback_seek_policy_runtime.js`: un clip vidéo `video_image` est toujours muet; il ne peut plus réactiver par accident l'audio du `HTMLVideoElement`.
- [fait] `element_runtime.js`: en browser non Tauri/iOS/AUv3, un clip `video_audio` résout son playback vers `/api/extract-audio/:file`, tout en conservant la source canonique vidéo pour la persistance.
- [fait] `hmtracks_session_runtime.js`: la session audio peut utiliser la source runtime extraite pour le moteur audio sans polluer le `src` persistant.
- [fait] `source_runtime.js`: `/api/extract-audio/:file` est normalisé comme source API canonique, y compris depuis une URL absolue avec token.
- [fait] `authorized_playback_runtime.js`: `/api/extract-audio/:file` est traité comme source protégée, fetché avec auth et converti en blob avant Kira WASM; il n'est plus réécrit vers `/api/uploads/:file`.
- [fait] `server/server.js`: extraction audio vidéo réencodée systématiquement en AAC stéréo 48 kHz `.aac.m4a`; nouveau nom de cache pour ne pas réutiliser les anciens `.m4a` issus de `-acodec copy`.
- [fait] `src-tauri/src/server/mod.rs`: Torii expose aussi `/api/extract-audio/:file` sur le serveur local Axum, avec la même extraction AAC déterministe.
- [fait] `element_runtime.js`: Torii utilise maintenant la piste audio extraite pour les clips `video_audio`; iOS/AUv3 restent sur le chemin natif host existant.
- [fait] `element_runtime.js`: Web/Safari ne stocke plus le `blob:` temporaire comme source runtime des clips `video_audio`; il garde `/api/extract-audio/:file`, ce qui empêche la session audio de retomber sur la vidéo originale.
- [fait] Logs ajoutés: `descriptor:audio_payload` expose la source canonique, la source audio runtime, et si un blob n'a servi qu'au calcul de durée; `buildSession.nativeAudioClipDetails` expose si la session reçoit bien `/api/extract-audio`.
- [fait] `hmtracks_native_audio_runtime.js`: Kira natif Tauri peut charger une source préparée par bytes quand il n'existe pas de chemin fichier direct, ce qui permet de lire la piste extraite tout en gardant le moteur de lecture natif.
- [fait] `eVeIntuition.js`: la génération thumbnail respecte maintenant le type réel de source (`uploads` vs `recordings`) au lieu de forcer `video_recording`.
- [fait] `eVeIntuition.js`: `seekVideoToTime` retourne immédiatement si la vidéo est déjà au bon temps et évite le seek exact à la fin du média.
- [fait] `preview_frame_data_runtime.js`: une metadata thumbnail/waveform en erreur est retentée après throttle au lieu de bloquer définitivement.
- [fait] `eVeIntuition.js`: une génération vidéo sans aucune frame devient une erreur retentable, pas un cache `empty` permanent.

Validation ajoutée:

- [fait] `node eVe/domains/mtrax/clips/audio_link_policy.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/audio/hmtracks_session_audio_link_policy.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/media/element_video_audio_source.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/media/extracted_audio_auth_source.test.mjs`: PASS.
- [fait] `node eVe/domains/mtrax/preview/preview_metadata_retry.test.mjs`: PASS.
- [fait] `node --check eVe/intuition/eVeIntuition.js`: PASS.
- [fait] `node --check server/server.js`: PASS.
- [fait] `npm run check:syntax`: PASS, `Syntax OK (1078 file(s))`.
- [fait] `CARGO_TARGET_DIR=/private/tmp/eve-tauri-codex-target cargo check` dans `src-tauri`: PASS.
- [info] `cargo fmt --check` échoue sur de nombreux fichiers Rust déjà hors format sans rapport avec cette correction; pas de `cargo fmt` global lancé pour éviter du churn massif.

Reste à vérifier manuellement:

1. [à faire][P0] Web/Safari: vidéo avec son en lecture et scrub, sans micro-saut.
2. [à faire][P0] Torii/Tauri: vidéo avec son en lecture et scrub, sans chemin audio doublé.
3. [à faire][P0] Web3: non-régression lecture vidéo + son.
4. [corrigé à valider][P0] Vignettes vidéo instables: normalisation upload/recording et retry d'erreur corrigés; vérifier sur Web, Web3 et Torii.
5. [à faire][P1] Molécule vidéo non déplaçable après fermeture: reprendre le drag/overlay après correction audio.

## Critères d'acceptation avant nouvelle feature d'enregistrement

- Les médias ne disparaissent plus après reload.
- Les médias ne disparaissent plus après fermeture/réouverture.
- Deux molécules ouvertes successivement ne fusionnent pas.
- Audio et vidéo importés séparément ne se mélangent pas.
- Double-clic ouvre une expérience Molécule unique et cohérente.
- Le preview vidéo et les vignettes sont stables.
- Les actions de drag ne ferment pas le panel et ne cachent pas la timeline.
- Les labels utilisateur principaux disent Molécule, pas MTrack/Mtrax.
- Les probes de non-régression couvrent les scénarios ci-dessus.

## Notes de méthode

- Ne pas lancer un renommage global `mtrax` vers `molecule` tant que les bugs P0 ne sont pas stabilisés.
- Chaque correction doit être attachée à un scénario reproductible.
- Si un bug est erratique, ajouter d'abord du diagnostic ou une probe qui capture l'état: ids, route, active atome, timeline id, media ids, preview host, persistence key.
- Garder MTRX comme terme technique possible, mais retirer MTrack/Mtrax du langage utilisateur dès que le flux est stable.
