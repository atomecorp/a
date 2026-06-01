# Finalisation Bevy comme moteur de rendu unique Atome/eVe

## Statut actuel

Bevy est integre comme surface de rendu disponible, compilee et testee, mais il n'est pas encore le chemin actif unique pour tous les Atomes.

## Point d'avancement 2026-06-01

Avancement estime : 95 %. Reste estime : 5 %.

Correction active :

- Fait : retrait du comportement non conforme qui excluait SVG et video du rendu Bevy.
- Fait : remplacement du chargement image par source seule par une texture RGBA explicite consommee par Bevy.
- Fait : application du meme chemin texture Bevy aux SVG, aux frames video et au texte.
- Fait : validation visuelle image, SVG, video, texte, shape et waveform dans le navigateur avec console erreur/warn propre.
- Fait : extraction de frame video Bevy stabilisee par seek vers une frame representative puis amorcage muet de presentation avant lecture RGBA, ce qui evite la frame noire initiale sur `superman.mp4`.
- Fait : waveform audio corrigee sur la route Bevy par texture RGBA derivee des pics canoniques, plus de rectangle plein.
- Fait : waveform Bevy avec pics inline ne requiert plus de source media, ce qui evite de bloquer tout le demarrage Bevy quand une waveform canonique est deja disponible.
- Fait : waveform Bevy pour audio importe sans pics corrigee par decodage du fichier audio source normalise avant generation de texture, ce qui corrige `bevy_waveform_peaks_empty`.
- Fait : les enregistrements video/audio pending sans source media ne sont plus projetes vers Bevy avant disponibilite de la source commitee, ce qui corrige `bevy_media_texture_source_required` sur enregistrement Tauri.
- Fait : les sources media RenderAtom passent par la normalisation partagee avant projection Bevy, donc `test.m4a` et les noms d'uploads/recordings ne sont plus emis comme URLs relatives nues.
- Fait : les deux fichiers signales en 404 ont ete verifies disponibles via les routes API owner-scopees (`200 OK`) et le chemin nu a ete confirme comme la source du 404 (`/test.m4a` -> `404`).
- Fait : les routes d'enregistrement audio/video directes reprojettent les Atomes media sur la scene projet apres commit.
- Fait : les enregistrements audio WAV locaux produisent des pics waveform canoniques pendant la persistence.
- Fait : hit-test/drag corrige quand le canvas visible est scale par rapport a la surface logique.
- Fait : selection verifiee au demarrage du drag sur surface scalee.
- Fait : tests JS cibles, tests Rust, check WASM, build WASM, `check:syntax`, `check:no-fallbacks` et `check:m0`.
- Reste : audit final du renderer legacy actif et verification UI complete d'import/enregistrement depuis les outils produit avec inspection visuelle stable apres demarrage du WASM.

Deja en place :

- Backend Bevy natif Tauri dans `platforms/desktop-tauri/src/bevy_backend/`.
- Features Cargo `bevy_backend`, `bevy_renderer_core`, `bevy_renderer_native`.
- Surface web/WASM Bevy dans `platforms/web/bevy-renderer/`.
- Artefacts WASM generes dans `atome/src/wasm/squirrel_bevy_renderer*`.
- Projection initiale d'Atomes vers entites Bevy ECS.
- Bevy audio non active ; Kira reste le moteur audio unique.
- Maps mises a jour pour l'ownership Bevy natif/web.

Objectif restant : faire de Bevy le seul chemin de rendu actif des Atomes, sans fallback, sans legacy renderer, sans renderer parallele.

## Regles obligatoires

- Lire et appliquer `.codex/AGENTS.md` et tous les modules requis avant chaque phase.
- Ne pas ajouter de fallback, shim, proxy DOM, API de test, renderer alternatif, ou chemin legacy.
- Ne pas stocker l'etat canonique Atome dans le DOM.
- Ne pas ajouter de canvas par Atome.
- Ne pas activer `bevy_audio`.
- Ne pas faire d'operation Git d'ecriture.
- Mettre a jour les maps a chaque changement d'ownership, API, rendu, ou structure.

## Phase 1 - Contract de projection unique vers Bevy

But : produire une seule projection JS consommee par le renderer Bevy web.

Taches :

- Ajouter un adaptateur JS dans `eVe/domains/rendering/` qui convertit `createVirtualSceneTree(...)` en payload `run_atome_bevy_renderer(...)`.
- Mapper explicitement :
  - `id` vers `id`.
  - `parentId` vers `parent_id`.
  - `bounds.x/y` ou `localTransform.x/y` vers `logical_position`.
  - `bounds.width/height` vers `logical_size`.
  - `zIndex` ou ordre de scene vers `layer`.
  - `material.fill` vers `color` quand applicable.
- Refuser les records incomplets avec erreur explicite, pas de valeur fallback silencieuse.
- Ajouter des tests unitaires JS sur le mapping depuis `virtual_scene_contract.js`.

Critere de sortie :

- Un Atome shape/text/media peut etre transforme en payload Bevy sans lire de `data-*` DOM.

## Phase 2 - Bootstrap du renderer Bevy web

But : charger le module WASM Bevy et demarrer Bevy sur la surface projet.

Taches :

- Creer un runtime JS dedie, par exemple `eVe/domains/rendering/bevy_web_renderer_runtime.js`.
- Importer `atome/src/wasm/squirrel_bevy_renderer.js`.
- Appeler `init(...)` du module wasm-bindgen si requis par le fichier genere.
- Appeler `run_atome_bevy_renderer(canvasSelector, width, height, initialNodes)`.
- Utiliser une seule surface canvas projet, creee par l'ownership existant de `surface_runtime.js`.
- Garantir qu'un projet ne demarre pas deux apps Bevy pour la meme surface.
- Supprimer l'appel actif a `createUnifiedWebGPUCompositor(...)` pour le rendu Atome projet lorsque Bevy est active.

Critere de sortie :

- Une scene projet visible demarre Bevy dans le navigateur et affiche les Atomes initiaux via Bevy.

## Phase 3 - Remplacement du chemin actif project scene

But : remplacer le rendu actif `renderProjectAtTime(...)` par Bevy pour les Atomes.

Taches :

- Modifier `project_scene_runtime.js` pour que `renderRuntimeProjection(...)` pousse la projection vers Bevy au lieu du compositor JS actuel.
- Conserver `createRenderScene(...)` seulement comme scene logique jetable pour hit-testing et projection, pas comme renderer.
- Retirer le rendu actif via `project_scene_webgpu_adapter.js` pour les Atomes une fois Bevy branche.
- Verifier que `runtime.projection.render_result` reflete le resultat Bevy, pas l'ancien compositor.
- Ne pas garder de branche conditionnelle "si Bevy echoue alors compositor".

Critere de sortie :

- Le chemin nominal d'un Atome projet passe par Bevy uniquement.

## Phase 4 - Mutations, dirty flags et rendu incremental

But : eviter de redemarrer Bevy a chaque mutation et appliquer les changements Atome dans ECS.

Taches :

- Etendre `platforms/web/bevy-renderer/src/lib.rs` avec des exports wasm-bindgen pour appliquer :
  - spawn.
  - despawn.
  - update transform.
  - update style.
  - reparent.
  - layer.
  - visibility.
  - text metadata.
- Consommer les diffs de `diffVirtualSceneTrees(...)`.
- Maintenir dans Rust une table ECS interne `AtomeEntityId -> Entity`.
- Ne pas maintenir de copie canonique de l'Atome en Rust ; seulement la projection courante necessaire au rendu.
- Ajouter tests Rust et JS sur l'application de diffs.

Critere de sortie :

- Deplacer, redimensionner, creer et supprimer un Atome met a jour Bevy sans recharger l'app.

## Phase 5 - Selection, hit-testing et interactions

But : garder l'interaction conforme aux regles DOM minimal/disposable.

Taches :

- Garder le hit-testing logique hors DOM via `scene_graph.js` tant que Bevy ne fournit pas un picking equivalent expose proprement.
- Brancher les intentions `select`, `move`, `resize`, `surface.resize` sur le runtime Bevy.
- Verifier que la selection modifie la projection/style Bevy, pas des classes DOM par Atome.
- Ne pas ajouter de `data-*` pour tester ou router les interactions.
- Tester les clics Playwright avec le guide `../atome/documentations/how_debug_UI.md`.

Critere de sortie :

- Selection, drag, resize et hit-test fonctionnent avec Bevy comme surface visible unique.

## Phase 6 - Texte et media

But : couvrir tous les types d'Atomes actuellement visibles.

Taches :

- Texte :
  - garder le service de mesure texte existant si necessaire ;
  - rendre le texte dans Bevy ou definir explicitement une phase bloquante si Bevy 0.18 impose une contrainte technique ;
  - l'editeur actif peut rester DOM uniquement pendant l'edition, mais l'affichage final doit revenir a Bevy.
- Image/SVG/video/audio waveform :
  - remplacer l'ancien adapter WebGPU media par des ressources Bevy ;
  - charger les textures via Bevy asset/image quand possible ;
  - conserver Kira pour l'audio, uniquement synchronise par evenements/ressources.
- Refuser tout media non supporte avec erreur explicite pendant l'integration, pas avec fallback visuel.

Critere de sortie :

- Shape, text, image, SVG, video et waveform ont un chemin Bevy defini et teste, ou une contrainte bloquante documentee avant suppression du renderer legacy.

## Phase 7 - Suppression du renderer legacy actif

But : eliminer le chemin parallele une fois Bevy couvre les Atomes.

Taches :

- Identifier tous les appels actifs a :
  - `createUnifiedWebGPUCompositor`.
  - `renderProjectAtTime`.
  - `createProjectSceneWebGpuAdapter`.
  - adapters image/video/waveform/text utilises comme renderer final.
- Supprimer ou convertir ces appels selon le nouveau runtime Bevy.
- Garder uniquement les modules encore utiles pour projection, mesure, cache ou migration explicite.
- Lancer `npm run check:no-fallbacks` apres chaque suppression.

Critere de sortie :

- Aucun Atome visible ne passe par l'ancien compositor.

## Phase 8 - Validation UI complete

But : prouver que Bevy est le moteur actif sur UI reelle.

Taches :

- Demarrer le serveur applicatif selon les scripts projet existants.
- Utiliser Playwright selon `../atome/documentations/how_debug_UI.md`.
- Attendre `window.__DEBUG__`, `window.new_menu_v2`, ou `#intuition` avant interaction.
- Utiliser des vrais clics Playwright avant tout diagnostic coordonne.
- Verifier :
  - creation Atome.
  - affichage initial.
  - selection.
  - drag.
  - resize.
  - suppression.
  - sauvegarde/replay si applicable.
  - navigation Matrix/projet si le rendu y apparait.
- Capturer une preuve DOM montrant une surface Bevy unique et pas de hosts Atome visibles legacy.

Critere de sortie :

- Les workflows UI principaux passent avec Bevy comme surface visible unique.

## Phase 9 - Garde-fous finaux

Commandes minimales a passer :

```bash
npm run check:no-fallbacks
npm run check:syntax
npm run check:m0
```

```bash
cd platforms/desktop-tauri
cargo check --features bevy_renderer_core
cargo test --features bevy_renderer_native bevy_backend
```

```bash
cd platforms/web/bevy-renderer
cargo check --target wasm32-unknown-unknown
cargo test --target wasm32-unknown-unknown --no-run
./build.sh
```

Validation supplementaire requise :

- Verifier que `cargo tree --features bevy_renderer_native -i bevy_audio` ne trouve aucun package.
- Verifier que `cargo tree --target wasm32-unknown-unknown -i bevy_audio` dans `platforms/web/bevy-renderer` ne trouve aucun package.
- Verifier que les artefacts `atome/src/wasm/squirrel_bevy_renderer*` sont regeneres.
- Verifier que les maps refletent l'etat final.

## Definition de termine

La tache est totalement terminee seulement quand :

- Bevy est le renderer actif pour tous les Atomes visibles.
- Aucun fallback renderer n'existe pour les Atomes.
- Aucun legacy renderer actif ne reste branche dans le flux nominal.
- Les mutations Atome passent par le pipeline canonique existant puis par projection Bevy.
- Le DOM ne contient pas d'etat canonique Atome et ne sert pas de renderer par Atome.
- Kira reste l'unique moteur audio.
- Les validations CLI et UI passent.
- Les maps sont a jour.

## Etat bloque a surveiller

Si Bevy 0.18 ne permet pas de couvrir proprement un type d'Atome web donne, il faut stopper et documenter :

- le type d'Atome concerne ;
- la limitation Bevy ou WebGPU exacte ;
- le fichier et l'API bloques ;
- la plus petite action conforme restante.

Il ne faut pas contourner ce blocage par un fallback visuel legacy.
