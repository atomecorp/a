# Défauts des outils de création (retours du 2026-09-25)

Suite de `todo/tool_rail_refonte_2026-09-24.md`.

- [x] **T1. Texte sur un atome.** Outil texte armé, cliquer sur un atome sélectionne l'atome au lieu de créer le texte. Attendu : le texte est créé à cet endroit, sans créer de molécule, et l'inclusion est proposée dans le rail contextuel comme d'habitude (choix de dépôt).
- [x] **T2. Couleur du texte.** Par défaut, le texte doit être gris foncé et non blanc.
- [x] **T3. Sliders.** Pour TOUS les sliders avec une valeur :
  - fond lisible (unité visible) ;
  - taille de brosse de 3 à 100 ;
  - double-clic sur la valeur pour la saisir à la main.
- [x] **T4. Outil actif épinglé.** Un outil actif doit se placer automatiquement dans le rail contextuel latéral (voir la documentation). Ce n'est pas le cas pour l'outil texte. Le gestionnaire d'outils doit spécifier et paramétrer ce comportement.
- [x] **T5. Débutant.** L'outil de capture d'action (`record_action`) n'apparaît pas dans le menu contextuel ; il est réservé aux niveaux intermédiaire et avancé.
- [x] **T6. Anticiper le prochain objet.** Après un tracé, le trait reste sélectionné : changer la couleur recolore l'ancien trait au lieu de régler le suivant. Même chose pour le texte.
- [x] **T7. « unable to apply color ».** Erreur intermittente, avec l'avertissement `bevy_media_texture_skipped image (no source)`.
- [x] **T8. Lasso.** Parfois, la sélection au lasso ne se déplace pas ; et après un déplacement, les atomes reviennent à leur place d'origine.
- [x] **T9. Tout sélectionner au clavier.** Cmd+A / Ctrl+A.
- [x] **T10. Backspace.** Supprimer avec Backspace a une fois provoqué un rechargement suivi de `eve_module_load_failed 'text/html' is not a valid JavaScript MIME type` (index.js:11).

## Causes et corrections

- **T1 :** intercepteur `text_tool_over_atom_runtime.js` (priorité 940).
  - Texte armé et clic sur un atome non-texte : le texte est créé dans le conteneur d'insertion.
  - Puis un `drag.end` avec `overlap_target_id` propose le choix de dépôt habituel dans le rail.
  - Un clic sur un texte édite toujours ce texte.
- **T2 :** `TEXT_DEFAULT_COLOR` (gris foncé, `intuition/atome/text/visual/style.js`) est branché dans la genèse, le runtime de records, les emplacements et la validation du texte.
  - Le trait neuf et la couleur initiale du panneau Couleur sont aussi en gris foncé.
- **T3 :** dans `shared/bevy_ui_tool_slider.js` :
  - le fond couvre tout le slider déplié ;
  - `double_click` ouvre `bevy_panel_slider_value_entry.js` (champ numérique, Entrée applique), ce qui couvre tous les sliders du ruban et du rail ;
  - la taille de brosse va de 3 à 100, et le schéma MCP suit.
- **T4 :** résidence dans la taxonomie, `menus.sidebar.tools.<outil>.pinned`.
  - Le registre (`readPinnedCreationEntries`) épingle l'outil armé dans la zone réservée du rail ; un appui le désarme (`stopPinnedCreationTool`).
  - Case « Épinglé dans le rail quand actif » dans la section Outils de l'éditeur de taxonomie.
  - Colonne « Résidence » dans le gestionnaire d'outils.
- **T5 :** les commandes de taxonomie `container_record` et `natural_actions_play` ont désormais `sidebar.minLevels` à intermédiaire, et le rail Naturel les filtre.
  - `record_actions` du projet passe en intermédiaire dans Mystic et dans le rail.
- **T6 :** tant qu'un outil de création est armé, le rail lui appartient (`armed_tool_state.js` et `syncSelection` du rail).
  - Un trait tracé outil armé n'est plus sélectionné.
  - Désarmer ré-annonce la sélection.
- **T7 :** « Unable to apply color » = `selection_empty` (couleur choisie sans rien de sélectionné).
  - Elle devient maintenant la valeur de la prochaine création (`routeStyleApply`).
  - Les panneaux passent par les handlers LEGACY (`couleur.js`, `font.js`, `size.js`) dès que leur module est chargé : l'interception de l'outil y était contournée, elle y est maintenant branchée.
  - Sur le chemin bootstrap, une cible périmée, masquée ou verrouillée ne refuse plus tout le style.
- **T8, deux causes :**
  1. La zone de contexte du lasso (≈2,5 s après le lasso) avalait tout appui dans son rectangle, y compris sur les atomes sélectionnés. Un appui sur un atome de la sélection démarre maintenant le glisser.
  2. Un glisser déplacé et terminé sans pointerup (Mystic qui reprend la main, relâché perdu, blur, nouvel appui) était ramené à l'origine. Seul Échap annule désormais ; sinon la dernière position est validée.
- **T9 et T10 :** `selection_keyboard_shortcuts_runtime.js`.
  - Backspace hors d'un champ de texte est toujours `preventDefault` : dans une WKWebView (Tauri), son action par défaut est « retour arrière », ce qui rechargeait la page du port de dev, d'où l'erreur MIME `text/html`.
  - Backspace/Suppr supprime la sélection (jamais le projet).
  - Cmd/Ctrl+A sélectionne tout.

## Probes
- `temp/creation_tools_defects_real_app.probe.mjs` : 26/26, app réelle.
- `temp/lasso_move_repro.probe.mjs` : `LASSO_PROBE OK`, 6 lassos + déplacements + blur, deux fois de suite. Elle était rouge 8/8 avant la correction.
- `temp/color_apply_repro.probe.mjs` : reproduction des cas d'application de couleur.

## Pistes ouvertes, traitées le 2026-09-25

- [x] **Image importée vide (`bevy_media_texture_skipped … (no source)`).**
  - **Cause, vue dans la base Tauri :** l'atome `file_1790108847746_…` avait été vidé par un `history.undo` (24 sept., 19:26). L'annulation de sa **création** avait effacé toutes ses clés (`delete_keys`) au lieu de le supprimer. Il restait donc un « fantôme » `type: image` sans source.
  - **Serveur Rust** (`platforms/desktop-tauri/src/server/local_atome_history.rs`) :
    - `capture_before` écrit désormais `before_identity` (null pour une création), comme Fastify ;
    - l'annulation d'une création produit un `delete`, et le rétablissement un `restore` ;
    - repli pour les événements anciens sans `before_identity` : premier événement de l'atome avec un `before` vide.
    - Test ajouté : `tests/tauri/local_atome_history.rs` `native_history_undoes_a_creation_as_a_deletion`. Il est rouge sans la correction, et les 8 tests d'historique passent.
  - **Client** (`realtime_atome_events_runtime.js`) : un `delete` reçu hors du geste local (annulation, autre appareil) retire aussi l'atome de la scène projet, et plus seulement du DOM. Avant, l'image annulée restait affichée jusqu'au rechargement.
  - Probe : `temp/import_timing_repro.probe.mjs` → `IMPORT_UNDO_PROBE OK` (annuler retire l'image, rétablir la remet avec sa source).
  - **Donnée existante :** le fantôme `file_1790108847746_…` est toujours dans le projet `2e778871…`. Il suffit de le supprimer. Je n'ai rien modifié dans la base.
- [x] **Import « pas tout de suite visible ».** Faux positif de ma probe : elle passait par la bibliothèque de médias (`createAtome: true`), qui crée une fiche de bibliothèque et non un objet du canevas. Le vrai import (`importFilesToProjectViaCreator`) affiche l'image en ~100 ms, avec sa source.
- [x] **Lasso qui ne sélectionne rien.** Un second lasso tracé dans les 2,5 s, en partant de l'intérieur du rectangle précédent, était ignoré par la couche projet. Désormais, dans la zone, un glisser trace un nouveau lasso ; un simple toucher ne fait toujours rien (l'appui long ouvre toujours Mystic avec les actions du lasso) ; un appui sur un atome reste au glisser de la sélection (`core/atome_events/project_layer_runtime.js`).
  - Probe : `temp/lasso_relasso_repro.probe.mjs` → rouge 3/3 avant, vert 3/3 après.
