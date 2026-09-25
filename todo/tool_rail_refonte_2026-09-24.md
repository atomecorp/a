# Refonte des outils : options d'outil armé dans le rail contextuel + gestionnaire d'outils (dev)

Démarré le 2026-09-24. Plan : `~/.claude/plans/pasted-content-id-1ea1-les-outils-greedy-reef.md`.

## Règles retenues
- Un outil de création armé (Texte, Dessin) affiche **ses options dans le rail contextuel**, avant toute création.
- Les options viennent de la taxonomie : table `menus.sidebar.tools` de `eVe/intuition/menu/context_menus.json`.
  - Un outil **hérite** des commandes `option: true` de la table de son type.
  - Ses propres `options` fixent un niveau, ou `null` pour retirer une option héritée.
  - **Seul le niveau filtre, jamais l'activité.**
- Le rail et la sélection :
  - **armer un outil prend le rail**, même si un objet est sélectionné ;
  - une sélection faite **après** l'armement (l'objet créé, un autre objet) reprend le rail ;
  - toucher le vide redonne le rail à l'outil ;
  - désarmer rend le rail à la sélection ou au fond de projet.
- Chaque valeur a **un seul propriétaire** :
  - texte : `tools/core/tool_presets.js` (couleur, taille, police) ;
  - dessin : `__eveDrawTool` (taille, brosse, opacité), plus la couleur courante du panneau Couleur.
- Couleur et Police ouverts **depuis le rail d'un outil** écrivent le réglage de l'outil, pas la sélection (« cible de style » explicite). Un texte en cours d'édition garde son stylage normal.
- Le gestionnaire d'outils est un outil dev séparé : bouton « Outils (dev) » à côté de « Taxonomie (dev) », même garde `tauri dev`.

## Phases
- [x] **1. Gestionnaire d'outils (inspecteur)** : `eVe/intuition/dev/tool_manager/`.
  - `tool_manifest_model.js` est pur ; `tool_manager_sources.js` lit les sources vivantes ; `tool_manager_panel.js` fournit le panneau.
  - Le panneau est un tableau avec les colonnes palette / appui long / glisser / saisie / API / MCP / niveaux / problèmes, une fiche de détail et des filtres.
  - Bouton dans Préférences : `bevy_panel_home_settings_view.js` et `bevy_panel_home_runtime.js`.
- [x] **2. Taxonomie `tools`** :
  - `vocabulary.tools`, `menus.sidebar.tools`, drapeau `commands.option` ;
  - nouvelles commandes `draw_size` et `draw_type` ;
  - validation dans `context_menus_loader.js` ;
  - `resolveToolOptionTable` et `resolveContextMenu({ type: 'tool' })` dans `context_menu_resolver.js` ;
  - éditeur de taxonomie : section « Outils ».
- [x] **3. Rail d'outil armé** : `runtime/eve_intuition/armed_tool_rail_runtime.js`.
  - Passe par l'API publique `enterVirtual`, installé au boot ; aucune modification de `atome_contextual_edit_runtime.js`.
  - Le rail du fond de projet cède la place quand un outil est armé.
  - Créer → Dessin devient un outil simple : ses options ont quitté la palette du ruban.
  - Événement `eve:creation-tool-armed-changed` émis par le mode Texte.
- [x] **4. Préréglages** :
  - `tool_presets.js` ;
  - crochet `style_apply` dans `tool_runtime_bootstrap_panel_handlers.js` ;
  - la création de texte lit le préréglage (`text_tool_create_runtime.js`, en camelCase et en snake_case à cause du préréglage de genèse en `fontSize`).
- [x] **5. MCP** :
  - `input_schema` sur `ui.couleur.apply`, `ui.size.apply`, `ui.font.apply`, `ui.draw.size.apply`, `ui.draw.brush.type`, `ui.draw.opacity.apply` ;
  - nouvel outil `ui.tool.preset`.
- [ ] **6. (plus tard, optionnel)** Éditer le comportement (appui long, glisser, palette, saisie) depuis le gestionnaire. Il faut d'abord migrer le contenu de menu JS vers des données.

## Probes (toutes vertes)
- `temp/tool_manager_real_app.probe.mjs` : 8/8, app réelle.
- `temp/tool_taxonomy_probe.mjs` : 30 contrôles.
- `temp/armed_tool_rail_real_app.probe.mjs` : 14/14, app réelle.
  - Vrais clics de menu, vrai tracé à l'épaisseur réglée, vrai texte créé avec couleur et taille réglées, niveau débutant.
- `temp/tool_options_mcp_real_app.probe.mjs` : 12/12, par `handleAtomeMCPRequestAsync`.
- `temp/taxonomy_editor_tools_section.probe.mjs` : section Outils de l'éditeur.
- Non-régression :
  - `temp/taxonomy_real_app_probe.mjs` : entièrement vert ;
  - `temp/taxonomy_editor_model_probe.mjs` ;
  - `temp/contextual_taxonomy_matrix_probe.mjs` : 330 cas.

## Restes et constats du gestionnaire (non traités)
- 8 outils ont **deux implémentations**, un exécuteur v2 propre plus un handler legacy : `text_create`, `draw_create`, `find`, `matrix`, `draw`, `draw_points`, `vector`, `select`.
- 13 outils de création n'ont **aucun schéma** : un agent ne peut pas les paramétrer (draw_*, page_*, code_create).
- 10 `tool_id` sont **introuvables** dans les registres : les placeholders passent hors passerelle, `z_order`, les familles du générateur.
- 6 clés placées par la taxonomie sont **hors de l'ordre canonique** : preview, code_create, page_create, create_placeholder, generator, select.
- Les préréglages Texte sont dans `localStorage` (par appareil), pas encore dans les préférences du profil.
- Le rail trie toujours par `CONTEXT_TOOL_PRIORITY` pour les objets. Le rail d'outil suit l'ordre canonique. Le rail objet est laissé intact pendant qu'une autre session modifie `atome_contextual_*`.
- Écriture réelle par `npm run tauri:dev` : à vérifier à la main. Les probes simulent le pont Tauri.
