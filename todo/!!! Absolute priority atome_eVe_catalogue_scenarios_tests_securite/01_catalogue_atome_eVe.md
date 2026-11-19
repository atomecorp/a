# 01 — Inventaire réconcilié des fonctionnalités atome / eVe

> Date de l’audit documentaire : 17 novembre 2026. Périmètre : `atomecorp/a` et `atomecorp/eVe`, branche principale consultée.

## Portée et méthode

- **816 commandes identifiées**, dont 712 dans **56 familles de contrats** et 104 méthodes MCP de plateforme, toutes prises en compte dans la matrice.
- **106 gestes spécifiques d’interface** avec propriétaire JavaScript identifié.
- **280 éléments du premier inventaire** réconciliés comme liste de vérification, non repris comme preuve indépendante de câblage.
- **1202 entrées documentaires** traçables dans cette édition (une même capacité peut apparaître sous plusieurs identifiants).
- Le registre généré actuel recense **816 action_contract, 1 296 tool_definition, 4 418 entrées au total**. Cela comprend aussi panneaux, placements, activités, données, types d’atomes : **ce ne sont pas 4 418 fonctions distinctes**.
- Les commandes des 56 familles ont un contrat et un chemin de routage générique vers les exécuteurs de domaine (`serviceCommandHandlers`). Les entrées `F` et `U` restent des gestes à associer à leurs propriétaires et accès réels ; un contrat routé ne garantit pas la présence d’un bouton universel.
- L’utilisateur a déjà validé le fonctionnement des fonctions câblées. Ce document sert à les **retrouver, expliquer et mettre en scénario**, pas à les contester ni à dépanner.
- Les contrôles effectifs et les plateformes n’ont **pas été exécutés dans cette conversation** ; les statuts PASS devront être attribués par l’IA testeuse.

## Sources structurantes

- [Registre généré et compteurs](https://github.com/atomecorp/eVe/blob/main/registry/generated/index.md)
- [Rapport de registre : familles, placements, outils et lacunes](https://github.com/atomecorp/eVe/blob/main/registry/generated/inventory-report.json)
- [Liste canonique des familles MCP](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/atome/mcp_contract_families.js)
- [Liaison des commandes aux exécuteurs](https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/tool_runtime_service_commands.js)
- [Contrats d’exécution et UI](https://github.com/atomecorp/eVe/tree/main/intuition/tools/core)
- [Contrats de calcul](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/calc/contracts.js)
- [Interface Calc](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js)

## Fonction importante oubliée : le « tableur déstructuré » (Calc)

**Concept :** les nombres appartiennent au texte. Un outil de calcul agit sur la sélection et ses opérateurs, sans grille ni fichier tableur obligatoires. Chaque valeur reconnue est rattachée à une cellule invisible ancrée dans son passage ; les calculs sont liés aux valeurs et leurs résultats se réactualisent.

**Utilisation manuelle vérifiée par le chemin du code :**

1. Ouvrir **Créer › Texte**, écrire par exemple : `12 bananes` puis `14 pommes` puis `total`.
2. Activer **Calc** dans la bande des outils du texte.
3. Toucher `12` ; activer **+** ; toucher `14` ; activer **=**.
4. Un résultat `26` est porté au-dessus du texte : le déposer sur `total` pour remplacer ce mot, ou toucher un autre endroit pour l’insérer.
5. Modifier ensuite `12` en `20` dans le même texte : le résultat lié se recalcule à `34`.
6. Autre méthode : écrire directement `12 bananes + 14 pommes =` ; le `=` déclenche le calcul. On peut également écrire `total = bananes + pommes` suivi d’un retour à la ligne.
7. Pour vérifier les cellules, activer **Grille** dans Calc : c’est l’**affichage alternatif du même texte**. Modifier un chiffre en grille modifie la valeur du texte ; glisser une cellule par son libellé pour la réordonner.
8. Depuis eVe/MCP, des commandes `calc.cell`, `calc.formula`, `calc.view`, `calc.grid_move` et `calc.recalc` font la même chose sur l’atome texte explicitement nommé.

**Exemples compatibles :** `SOMME(A1:A3)`, `MOYENNE`, `MIN`, `MAX`, `SI`, `ET`, `OU`, `ARRONDI`, `ABS`, calculs en euros, pourcentages, unités et dates, références par libellé `bananes + pommes` ou par cellule `A1*B2`. Les fonctions volatiles `MAINTENANT`, `AUJOURDHUI` et aléatoires sont refusées pour garder une valeur reproductible.

**Import :** DOCX, XLSX, Markdown, HTML, CSV, TSV, PDF et TXT sont orientés vers un document texte unique ; certaines fonctionnalités Excel non convertibles doivent être signalées dans le rapport d’import. Le document reste une donnée canonique, et non un tableur créé à côté.

**Vérifications scénarisées :** S034, X03, X04 et X05 (vue texte, opérateurs, dépendances, import, MIDI non lié, MCP, gestes).

## A — Actions d’interface à faible granularité

Ce sont des actions concrètes retrouvées dans leurs modules propriétaires. `U` permet de tester un geste isolé même lorsque ce geste n’est pas une commande MCP autonome. Pour les sources pointant sur un dossier, le scénario devra résoudre le module précis du composant actif.

### Interface

- **U0001** — Sélectionner un objet d'un clic. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/selection.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/selection.js).
- **U0002** — Ajouter un objet à une multisélection. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/selection.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/selection.js).
- **U0003** — Sélectionner toute la scène. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/select_all_tool.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/select_all_tool.js).
- **U0004** — Délimiter une sélection par lasso. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/selection.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/selection.js).
- **U0005** — Copier un objet. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/copy.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/copy.js).
- **U0006** — Coller un objet. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/paste.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/paste.js).
- **U0007** — Annuler une action. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/undo.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/undo.js).
- **U0008** — Supprimer un objet sélectionné. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/delete.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/delete.js).
- **U0009** — Dupliquer un atome. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/core/tool_runtime_atome_duplicate.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/tool_runtime_atome_duplicate.js).
- **U0010** — Dissocier un groupe. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/ungroup.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/ungroup.js).
- **U0011** — Mettre un objet devant. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/z_order_actions.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/z_order_actions.js).
- **U0012** — Mettre un objet derrière. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/z_order_actions.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/z_order_actions.js).
- **U0013** — Changer la couleur d'une sélection. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/couleur.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/couleur.js).
- **U0014** — Changer la police d'un texte. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/font.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/font.js).
- **U0015** — Changer la taille d'un objet. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/size.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/size.js).
- **U0016** — Arrondir les coins d'une forme. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/rounding.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/rounding.js).
- **U0017** — Appliquer une ombre. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/shadow.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/shadow.js).
- **U0018** — Éditer la géométrie d'une forme. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/shape_edit.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/shape_edit.js).
- **U0019** — Appliquer un masque. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/mask.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/mask.js).
- **U0020** — Changer les couches d'un dessin. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/layer.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/layer.js).
- **U0021** — Appliquer un style à plusieurs types d'objets. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/selection_style_apply.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/selection_style_apply.js).
- **U0022** — Changer le fond du projet. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/background.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/background.js).
- **U0023** — Assigner une image de fond. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/background_image.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/background_image.js).
- **U0024** — Utiliser les outils de mise en page. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/page_cover_tool.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/page_cover_tool.js).
- **U0025** — Organiser la matrice d'objets. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/matrix_objects.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/matrix_objects.js).
- **U0026** — Faire glisser un média dans le projet. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/project_drop_media_runtime.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/project_drop_media_runtime.js).
- **U0027** — Ouvrir et fermer la palette d'un outil par glissement. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/core/tool_runtime_gesture.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/tool_runtime_gesture.js).
- **U0028** — Maintenir un objet pour ses actions. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/core/tool_reveal_behavior.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/tool_reveal_behavior.js).
- **U0029** — Déployer le menu contextuel Mystic. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/core/tool_reveal_behavior.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/tool_reveal_behavior.js).
- **U0030** — Faire défiler un panneau par glissement avec inertie. Scénario : `S043`. Propriétaire : [`eVe/domains/rendering/bevy_ui_scroll_runtime.js`](https://github.com/atomecorp/eVe/blob/main/domains/rendering/bevy_ui_scroll_runtime.js).
- **U0031** — Revenir par glissement vers le bas. Scénario : `S043`. Propriétaire : [`eVe/intuition/runtime/page_turn_driver.js`](https://github.com/atomecorp/eVe/blob/main/intuition/runtime/page_turn_driver.js).
- **U0032** — Passer d'une page à l'autre par glissement latéral. Scénario : `S043`. Propriétaire : [`eVe/intuition/runtime/page_turn_driver.js`](https://github.com/atomecorp/eVe/blob/main/intuition/runtime/page_turn_driver.js).
- **U0033** — Naviguer entre niveaux de Dashboard. Scénario : `S043`. Propriétaire : [`eVe/domains/dashboard/dashboard_mystic_geometry.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_mystic_geometry.js).
- **U0034** — Utiliser l'outil Finder pour rechercher des objets. Scénario : `S043`. Propriétaire : [`eVe/intuition/tools/finder.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/finder.js).
- **U0035** — Gérer le zoom de la vue. Scénario : `S043`. Propriétaire : [`eVe/intuition/runtime/eve_intuition/main_menu_view_zoom_content.js`](https://github.com/atomecorp/eVe/blob/main/intuition/runtime/eve_intuition/main_menu_view_zoom_content.js).

### Texte

- **U0036** — Écrire dans un objet texte. Scénario : `S033`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_surface.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_surface.js).
- **U0037** — Sélectionner un mot. Scénario : `S033`. Propriétaire : [`eVe/domains/rendering/text_editing_layout.js`](https://github.com/atomecorp/eVe/blob/main/domains/rendering/text_editing_layout.js).
- **U0038** — Coloriser la sélection de texte. Scénario : `S033`. Propriétaire : [`eVe/intuition/tools/selection_style_text_selection.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/selection_style_text_selection.js).
- **U0039** — Changer le style du passage sélectionné. Scénario : `S033`. Propriétaire : [`eVe/domains/dashboard/dashboard_text_palettes.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_text_palettes.js).
- **U0040** — Changer la police dans le document. Scénario : `S033`. Propriétaire : [`eVe/domains/dashboard/dashboard_text_palettes.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_text_palettes.js).
- **U0041** — Modifier l'alignement et les paragraphes. Scénario : `S033`. Propriétaire : [`eVe/domains/dashboard/dashboard_text_palettes.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_text_palettes.js).
- **U0042** — Insérer un lien dans le texte. Scénario : `S033`. Propriétaire : [`eVe/domains/dashboard/dashboard_text_insert.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_text_insert.js).
- **U0043** — Afficher un texte en prompteur. Scénario : `S033`. Propriétaire : [`eVe/intuition/tools/prompter`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/prompter).
- **U0044** — Choisir un gabarit de page. Scénario : `S033`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_surface.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_surface.js).
- **U0045** — Importer des fichiers DOCX, XLSX, Markdown, HTML, CSV, TSV, PDF, TXT. Scénario : `S033`. Propriétaire : [`eVe/domains/document/import/document_import.js`](https://github.com/atomecorp/eVe/blob/main/domains/document/import/document_import.js).
- **U0046** — Déclencher un recalcul depuis la frappe = dans le document. Scénario : `S033`. Propriétaire : [`eVe/domains/calc/calc_natural.js`](https://github.com/atomecorp/eVe/blob/main/domains/calc/calc_natural.js).

### Calc

- **U0047** — Activer l'outil Calc dans Créer › Texte. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_surface.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_surface.js).
- **U0048** — Toucher la valeur qui doit devenir une cellule. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0049** — Encadrer plusieurs valeurs avec la sélection du texte. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0050** — Ajouter par sélection puis bouton +. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0051** — Soustraire par sélection puis bouton −. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0052** — Multiplier par sélection puis bouton ×. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0053** — Diviser par sélection puis bouton ÷. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0054** — Appuyer sur = pour calculer sans tableur. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0055** — Glisser le résultat calculé sur un mot pour le remplacer. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0056** — Toucher une zone vide pour y déposer le résultat calculé. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0057** — Sélectionner un mot et appuyer sur = pour le remplacer. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc.js).
- **U0058** — Saisir «12 bananes + 14 pommes =» pour obtenir le résultat. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/calc/calc_natural.js`](https://github.com/atomecorp/eVe/blob/main/domains/calc/calc_natural.js).
- **U0059** — Saisir «total = bananes + pommes» puis nouvelle ligne. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/calc/calc_natural.js`](https://github.com/atomecorp/eVe/blob/main/domains/calc/calc_natural.js).
- **U0060** — Saisir SOMME, MOYENNE, SI ou autre fonction du moteur. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/calc/calc_functions.js`](https://github.com/atomecorp/eVe/blob/main/domains/calc/calc_functions.js).
- **U0061** — Calculer avec quantités, devises, dates ou pourcentages. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/calc/calc_value_types.js`](https://github.com/atomecorp/eVe/blob/main/domains/calc/calc_value_types.js).
- **U0062** — Transformer les valeurs en cellules ancrées au texte. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/calc/calc_cells.js`](https://github.com/atomecorp/eVe/blob/main/domains/calc/calc_cells.js).
- **U0063** — Modifier la valeur dans le texte et recalculer ses résultats. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/calc/calc_document.js`](https://github.com/atomecorp/eVe/blob/main/domains/calc/calc_document.js).
- **U0064** — Afficher la grille facultative du même document. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc_grid.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc_grid.js).
- **U0065** — Modifier une valeur dans la grille, reporter dans le texte. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc_grid.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc_grid.js).
- **U0066** — Déplacer une cellule par son libellé dans la grille. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_calc_grid.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_calc_grid.js).
- **U0067** — Échanger la place de deux cellules de grille. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/calc/calc_grid.js`](https://github.com/atomecorp/eVe/blob/main/domains/calc/calc_grid.js).
- **U0068** — Importer XLSX avec formules compatibles. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/document/import/xlsx_import.js`](https://github.com/atomecorp/eVe/blob/main/domains/document/import/xlsx_import.js).
- **U0069** — Importer CSV en cellules et valeurs. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/document/import/csv_import.js`](https://github.com/atomecorp/eVe/blob/main/domains/document/import/csv_import.js).
- **U0070** — Exécuter le script autorisé lié au document. Scénario : `S034, X03, X04, X05`. Propriétaire : [`eVe/domains/script/script_commands.js`](https://github.com/atomecorp/eVe/blob/main/domains/script/script_commands.js).

### Image

- **U0071** — Dessiner des formes avec les outils de dessin. Scénario : `S033`. Propriétaire : [`eVe/intuition/tools/core/svg_draw_runtime.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/svg_draw_runtime.js).
- **U0072** — Modifier les tracés vectoriels SVG. Scénario : `S033`. Propriétaire : [`eVe/intuition/tools/core/svg_vector_edit_runtime.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/svg_vector_edit_runtime.js).
- **U0073** — Masquer localement une partie du dessin. Scénario : `S033`. Propriétaire : [`eVe/intuition/tools/core/svg_draw_mask_runtime.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/svg_draw_mask_runtime.js).
- **U0074** — Retoucher luminosité et contrastes d'une photo. Scénario : `S033`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_surface.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_surface.js).
- **U0075** — Cadrer et exporter une image. Scénario : `S033`. Propriétaire : [`eVe/domains/dashboard/dashboard_create_surface.js`](https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_create_surface.js).
- **U0076** — Prendre une photo depuis l'outil Capture. Scénario : `S033`. Propriétaire : [`eVe/intuition/tools/capture_photo_session_runtime.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/capture_photo_session_runtime.js).
- **U0077** — Changer de caméra. Scénario : `S033`. Propriétaire : [`eVe/intuition/tools/capture_camera_switch_runtime.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/capture_camera_switch_runtime.js).
- **U0078** — Comparer deux photos prises dans la même pose. Scénario : `S033`. Propriétaire : [`eVe/domains/beauty/beauty_runtime.js`](https://github.com/atomecorp/eVe/blob/main/domains/beauty/beauty_runtime.js).

### Audio

- **U0079** — Monter un clip sur la timeline. Scénario : `S039`. Propriétaire : [`eVe/intuition/tools/timeline_actions.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/timeline_actions.js).
- **U0080** — Ajouter des effets sur la timeline. Scénario : `S039`. Propriétaire : [`eVe/domains/rendering/project_view_timeline_fx.js`](https://github.com/atomecorp/eVe/blob/main/domains/rendering/project_view_timeline_fx.js).
- **U0081** — Découper, déplacer et éditer un sample. Scénario : `S039`. Propriétaire : [`eVe/domains/sample_edit/sample_slice_commands.js`](https://github.com/atomecorp/eVe/blob/main/domains/sample_edit/sample_slice_commands.js).
- **U0082** — Enregistrer une prise audio. Scénario : `S039`. Propriétaire : [`eVe/intuition/tools/capture.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/capture.js).
- **U0083** — Capturer les notes MIDI. Scénario : `S039`. Propriétaire : [`eVe/intuition/tools/midi_capture_runtime.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/midi_capture_runtime.js).
- **U0084** — Éditer les notes sur un piano roll. Scénario : `S039`. Propriétaire : [`eVe/intuition/tools/midi_piano_roll_editor.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/midi_piano_roll_editor.js).
- **U0085** — Convertir de l'audio en MIDI. Scénario : `S039`. Propriétaire : [`eVe/intuition/tools/audio_to_midi`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/audio_to_midi).
- **U0086** — Créer des zones de samples sur un instrument. Scénario : `S039`. Propriétaire : [`eVe/domains/audio_fx/audio_fx_commands.js`](https://github.com/atomecorp/eVe/blob/main/domains/audio_fx/audio_fx_commands.js).

### Vidéo

- **U0087** — Enregistrer une vidéo depuis Capture. Scénario : `S038`. Propriétaire : [`eVe/intuition/tools/capture_video_recording_runtime.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/capture_video_recording_runtime.js).
- **U0088** — Voir l'aperçu de la caméra en cours. Scénario : `S038`. Propriétaire : [`eVe/intuition/tools/capture_video_preview_panel.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/capture_video_preview_panel.js).
- **U0089** — Ouvrir un média en plein écran. Scénario : `S038`. Propriétaire : [`eVe/intuition/tools/inplace_media_overlay.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/inplace_media_overlay.js).
- **U0090** — Contrôler la lecture d'un média intégré. Scénario : `S038`. Propriétaire : [`eVe/intuition/tools/inplace_media_overlay.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/inplace_media_overlay.js).

### Calendrier

- **U0091** — Créer des événements et alarmes depuis les outils. Scénario : `S045`. Propriétaire : [`eVe/intuition/tools/calendar.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/calendar.js).
- **U0092** — Programmer et gérer une alarme. Scénario : `S045`. Propriétaire : [`eVe/intuition/tools/calendar_alarm_commands.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/calendar_alarm_commands.js).
- **U0093** — Choisir une sonnerie d'alarme. Scénario : `S045`. Propriétaire : [`eVe/intuition/tools/calendar_alarm_sound.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/calendar_alarm_sound.js).
- **U0094** — Programmer une répétition. Scénario : `S045`. Propriétaire : [`eVe/intuition/tools/calendar_recurrence_choices.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/calendar_recurrence_choices.js).
- **U0095** — Exporter un calendrier ICS. Scénario : `S045`. Propriétaire : [`eVe/intuition/tools/calendar_device_export.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/calendar_device_export.js).

### Contact

- **U0096** — Inviter une personne depuis son téléphone. Scénario : `S026`. Propriétaire : [`eVe/intuition/tools/contact_invite.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/contact_invite.js).
- **U0097** — Ouvrir une discussion. Scénario : `S026`. Propriétaire : [`eVe/intuition/tools/contact_conversation.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/contact_conversation.js).
- **U0098** — Partager une création. Scénario : `S026`. Propriétaire : [`eVe/intuition/tools/teleport.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/teleport.js).
- **U0099** — Gérer la visioconférence. Scénario : `S026`. Propriétaire : [`eVe/intuition/tools/visio.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/visio.js).

### Assistante

- **U0100** — Activer et utiliser la reconnaissance vocale. Scénario : `S048`. Propriétaire : [`eVe/intuition/tools/user_login_voice.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/user_login_voice.js).
- **U0101** — Recherche par la saisie dans le Finder. Scénario : `S048`. Propriétaire : [`eVe/intuition/tools/finder.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/finder.js).
- **U0102** — Chercher un outil dans le registre. Scénario : `S048`. Propriétaire : [`eVe/intuition/tools/core/exposable_tools.js`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/exposable_tools.js).
- **U0103** — Déclencher une interaction sur un objet. Scénario : `S048`. Propriétaire : [`eVe/domains/site/site_interactions.js`](https://github.com/atomecorp/eVe/blob/main/domains/site/site_interactions.js).
- **U0104** — Construire une suite d'actions déclenchées. Scénario : `S048`. Propriétaire : [`eVe/domains/site/site_interactions.js`](https://github.com/atomecorp/eVe/blob/main/domains/site/site_interactions.js).
- **U0105** — Générer et importer une image par IA. Scénario : `S048`. Propriétaire : [`eVe/intuition/tools/ai_generators`](https://github.com/atomecorp/eVe/blob/main/intuition/tools/ai_generators).
- **U0106** — Changer les autorisations d'un programme MCP. Scénario : `S048`. Propriétaire : [`eVe/domains/user/mcp_access_commands.js`](https://github.com/atomecorp/eVe/blob/main/domains/user/mcp_access_commands.js).

## B — Commandes canoniques de domaine (56 familles)

La liste ci-dessous comporte chaque identifiant **exact de commande**. Le libellé français indique son opération générale ; les variantes d’arguments et les autorisations sont définies dans le contrat lié. Les cas de la famille entière doivent être parcourus dans le scénario de famille.

### Télévision — tv (10 commandes) · scénario S001

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/tv/contracts.js). Interface, moteur et MCP utilisent la famille tv.

- **C0001** · `tv.list_channels` — Lister channels.
- **C0002** · `tv.find_channel` — find channel.
- **C0003** · `tv.open_channel` — Ouvrir channel.
- **C0004** · `tv.close` — Fermer.
- **C0005** · `tv.set_fullscreen` — Définir fullscreen.
- **C0006** · `tv.get_state` — Consulter l’état.
- **C0007** · `tv.now` — now.
- **C0008** · `tv.next` — next.
- **C0009** · `tv.get_epg` — Consulter epg.
- **C0010** · `tv.search_program` — Rechercher program.

### YouTube — youtube (4 commandes) · scénario S002

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/youtube/contracts.js). Interface, moteur et MCP utilisent la famille youtube.

- **C0011** · `youtube.search` — Rechercher.
- **C0012** · `youtube.play` — Lire.
- **C0013** · `youtube.close` — Fermer.
- **C0014** · `youtube.set_fullscreen` — Définir fullscreen.

### PeerTube — peertube (4 commandes) · scénario S003

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/peertube/contracts.js). Interface, moteur et MCP utilisent la famille peertube.

- **C0015** · `peertube.search` — Rechercher.
- **C0016** · `peertube.play` — Lire.
- **C0017** · `peertube.close` — Fermer.
- **C0018** · `peertube.set_fullscreen` — Définir fullscreen.

### Réseaux sociaux — social (7 commandes) · scénario S004

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/social/contracts.js). Interface, moteur et MCP utilisent la famille social.

- **C0019** · `social.accounts` — accounts.
- **C0020** · `social.connect` — Connecter.
- **C0021** · `social.disconnect` — Déconnecter.
- **C0022** · `social.prepare` — Préparer.
- **C0023** · `social.publish` — Publier.
- **C0024** · `social.status` — status.
- **C0025** · `social.cancel` — Annuler.

### Apple Music — apple_music (19 commandes) · scénario S005

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/apple_music/contracts.js). Interface, moteur et MCP utilisent la famille apple_music.

- **C0026** · `apple_music.favorite_current` — Ajouter aux favoris current.
- **C0027** · `apple_music.get_state` — Consulter l’état.
- **C0028** · `apple_music.authorize` — authorize.
- **C0029** · `apple_music.search` — Rechercher.
- **C0030** · `apple_music.list_playlists` — Lister playlists.
- **C0031** · `apple_music.list_library` — Lister library.
- **C0032** · `apple_music.playlist_tracks` — playlist tracks.
- **C0033** · `apple_music.play` — Lire.
- **C0034** · `apple_music.resume` — Reprendre.
- **C0035** · `apple_music.pause` — Mettre en pause.
- **C0036** · `apple_music.stop` — Arrêter.
- **C0037** · `apple_music.seek` — seek.
- **C0038** · `apple_music.shuffle` — shuffle.
- **C0039** · `apple_music.artwork` — artwork.
- **C0040** · `apple_music.next` — next.
- **C0041** · `apple_music.previous` — previous.
- **C0042** · `apple_music.create_playlist` — Créer playlist.
- **C0043** · `apple_music.add_tracks` — Ajouter tracks.
- **C0044** · `apple_music.operation_status` — operation status.

### Musique connectée — music (22 commandes) · scénario S006

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/music/contracts.js). Interface, moteur et MCP utilisent la famille music.

- **C0045** · `music.get_state` — Consulter l’état.
- **C0046** · `music.connect` — Connecter.
- **C0047** · `music.await_connection` — await connection.
- **C0048** · `music.cancel_connection` — Annuler connection.
- **C0049** · `music.disconnect` — Déconnecter.
- **C0050** · `music.search` — Rechercher.
- **C0051** · `music.open_item` — Ouvrir un élément.
- **C0052** · `music.list_library` — Lister library.
- **C0053** · `music.list_playlists` — Lister playlists.
- **C0054** · `music.playlist_tracks` — playlist tracks.
- **C0055** · `music.devices` — devices.
- **C0056** · `music.play` — Lire.
- **C0057** · `music.resume` — Reprendre.
- **C0058** · `music.pause` — Mettre en pause.
- **C0059** · `music.next` — next.
- **C0060** · `music.previous` — previous.
- **C0061** · `music.seek` — seek.
- **C0062** · `music.shuffle` — shuffle.
- **C0063** · `music.create_playlist` — Créer playlist.
- **C0064** · `music.add_tracks` — Ajouter tracks.
- **C0065** · `music.favorite_current` — Ajouter aux favoris current.
- **C0066** · `music.operation_status` — operation status.

### Localisation et itinéraires — gps (18 commandes) · scénario S007

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/gps/contracts.js). Interface, moteur et MCP utilisent la famille gps.

- **C0067** · `gps.list_trips` — Lister trips.
- **C0068** · `gps.get_trip` — Consulter trip.
- **C0069** · `gps.create_trip` — Créer un itinéraire.
- **C0070** · `gps.search_places` — Rechercher places.
- **C0071** · `gps.locate` — locate.
- **C0072** · `gps.calculate_route` — calculate route.
- **C0073** · `gps.set_favorite` — Définir comme favori.
- **C0074** · `gps.delete_trip` — Supprimer trip.
- **C0075** · `gps.duplicate_trip` — duplicate trip.
- **C0076** · `gps.preview` — Prévisualiser.
- **C0077** · `gps.new_trip` — Créer trip.
- **C0078** · `gps.start_navigation` — Démarrer navigation.
- **C0079** · `gps.stop_navigation` — Arrêter navigation.
- **C0080** · `gps.get_state` — Consulter l’état.
- **C0081** · `gps.share_position` — Partager position.
- **C0082** · `gps.stop_sharing_position` — Arrêter sharing position.
- **C0083** · `gps.list_shared_positions` — Lister shared positions.
- **C0084** · `gps.navigate_to` — navigate to.

### Sport et entraînement — training (51 commandes) · scénario S008

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/training/contracts.js). Interface, moteur et MCP utilisent la famille training.

- **C0085** · `training.list_exercises` — Lister exercises.
- **C0086** · `training.get_exercise` — Consulter exercise.
- **C0087** · `training.open_exercise` — Ouvrir un exercice.
- **C0088** · `training.set_profile` — Définir profile.
- **C0089** · `training.suggest_load` — suggest load.
- **C0090** · `training.plan_week` — plan week.
- **C0091** · `training.schedule_week` — schedule week.
- **C0092** · `training.open_journal` — Ouvrir journal.
- **C0093** · `training.open_week` — Ouvrir week.
- **C0094** · `training.prepare_session` — Préparer session.
- **C0095** · `training.session_transition` — session transition.
- **C0096** · `training.get_session` — Consulter session.
- **C0097** · `training.open_sessions` — Ouvrir sessions.
- **C0098** · `training.keep_series` — keep series.
- **C0099** · `training.open_series` — Ouvrir series.
- **C0100** · `training.remove_series` — Supprimer une série.
- **C0101** · `training.list_favorites` — Lister favorites.
- **C0102** · `training.set_favorite` — Définir comme favori.
- **C0103** · `training.read_points` — Lire points.
- **C0104** · `training.read_program` — Lire program.
- **C0105** · `training.add_to_program` — Ajouter to program.
- **C0106** · `training.set_program` — Définir program.
- **C0107** · `training.open_program` — Ouvrir program.
- **C0108** · `training.list_ready_programs` — Lister ready programs.
- **C0109** · `training.take_ready_program` — take ready program.
- **C0110** · `training.read_log` — Lire log.
- **C0111** · `training.open_media` — Ouvrir media.
- **C0112** · `training.add_media` — Ajouter media.
- **C0113** · `training.remove_media` — Retirer media.
- **C0114** · `training.film` — film.
- **C0115** · `training.card_action` — card action.
- **C0116** · `training.measure_rhythm` — measure rhythm.
- **C0117** · `training.set_music` — Définir music.
- **C0695** · `training.list_machines` — Lister machines.
- **C0696** · `training.get_machine` — Consulter machine.
- **C0697** · `training.save_machine` — Enregistrer machine.
- **C0698** · `training.archive_machine` — archive machine.
- **C0699** · `training.delete_machine` — Supprimer machine.
- **C0700** · `training.open_machine` — Ouvrir machine.
- **C0701** · `training.open_disciplines` — Ouvrir disciplines.
- **C0702** · `training.open_discipline` — Ouvrir discipline.
- **C0703** · `training.open_movements` — Ouvrir movements.
- **C0704** · `training.list_movements` — Lister movements.
- **C0705** · `training.list_disciplines` — Lister disciplines.
- **C0706** · `training.get_discipline` — Consulter discipline.
- **C0707** · `training.save_discipline_choice` — Enregistrer discipline choice.
- **C0708** · `training.save_discipline` — Enregistrer discipline.
- **C0709** · `training.log_activity` — log activity.
- **C0710** · `training.remove_discipline` — Retirer discipline.
- **C0711** · `training.remove_activity` — Retirer activity.
- **C0712** · `training.read_activity_log` — Lire activity log.

### Séances modulaires — brick_session (11 commandes) · scénario S009

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/brick_sessions/contracts.js). Interface, moteur et MCP utilisent la famille brick_session.

- **C0118** · `brick_session.read` — Lire.
- **C0119** · `brick_session.open` — Ouvrir.
- **C0120** · `brick_session.set_minutes` — Définir minutes.
- **C0121** · `brick_session.set_breath` — Définir breath.
- **C0122** · `brick_session.set_bell` — Définir bell.
- **C0123** · `brick_session.prepare` — Préparer.
- **C0124** · `brick_session.transition` — transition.
- **C0125** · `brick_session.card_action` — card action.
- **C0126** · `brick_session.suggestions` — suggestions.
- **C0127** · `brick_session.get` — Consulter.
- **C0128** · `brick_session.open_sessions` — Ouvrir sessions.

### Suivi photo beauté — beauty (7 commandes) · scénario S010

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/beauty/contracts.js). Interface, moteur et MCP utilisent la famille beauty.

- **C0129** · `beauty.open` — Ouvrir.
- **C0130** · `beauty.list_photos` — Lister les photos.
- **C0131** · `beauty.shoot` — shoot.
- **C0132** · `beauty.add_photo` — Ajouter photo.
- **C0133** · `beauty.remove_photo` — Retirer une photo.
- **C0134** · `beauty.read_reminder` — Lire reminder.
- **C0135** · `beauty.set_reminder` — Définir reminder.

### Déclarations de santé — health_declaration (2 commandes) · scénario S011

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/declaration_contracts.js). Interface, moteur et MCP utilisent la famille health_declaration.

- **C0136** · `health_declaration.add` — Ajouter.
- **C0137** · `health_declaration.withdraw` — Retirer.

### Ressenti — health_feeling (3 commandes) · scénario S012

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/feeling_contracts.js). Interface, moteur et MCP utilisent la famille health_feeling.

- **C0138** · `health_feeling.set` — Définir.
- **C0139** · `health_feeling.clear` — clear.
- **C0140** · `health_feeling.open` — Ouvrir.

### Profil de santé — health_profile (2 commandes) · scénario S013

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/profile_contracts.js). Interface, moteur et MCP utilisent la famille health_profile.

- **C0141** · `health_profile.read` — Lire.
- **C0142** · `health_profile.declare` — declare.

### Protocoles de santé — health_protocol (19 commandes) · scénario S014

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/protocol_contracts.js). Interface, moteur et MCP utilisent la famille health_protocol.

- **C0143** · `health_protocol.import` — Importer.
- **C0144** · `health_protocol.list` — Lister.
- **C0145** · `health_protocol.read` — Lire.
- **C0146** · `health_protocol.correct` — correct.
- **C0147** · `health_protocol.decide` — Décider.
- **C0148** · `health_protocol.professional` — professional.
- **C0149** · `health_protocol.answer` — answer.
- **C0150** · `health_protocol.review` — review.
- **C0151** · `health_protocol.refuse` — Refuser.
- **C0152** · `health_protocol.activate` — Activer.
- **C0153** · `health_protocol.template_create` — template create.
- **C0154** · `health_protocol.template_revise` — template revise.
- **C0155** · `health_protocol.template_list` — template list.
- **C0156** · `health_protocol.template_preview` — template preview.
- **C0157** · `health_protocol.template_proposals` — template proposals.
- **C0158** · `health_protocol.template_accept` — template accept.
- **C0159** · `health_protocol.template_refuse` — template refuse.
- **C0160** · `health_protocol.template_duplicate` — template duplicate.
- **C0161** · `health_protocol.template_remove` — template remove.

### Produits, compléments et médicaments — health_products (21 commandes) · scénario S015

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/protocol_contracts.js). Interface, moteur et MCP utilisent la famille health_products.

- **C0162** · `health_products.declare` — declare.
- **C0163** · `health_products.validate` — Valider.
- **C0164** · `health_products.list` — Lister.
- **C0165** · `health_products.restock` — restock.
- **C0166** · `health_products.pause` — Mettre en pause.
- **C0167** · `health_products.resume` — Reprendre.
- **C0168** · `health_products.stop` — Arrêter.
- **C0169** · `health_products.remove` — Retirer.
- **C0170** · `health_products.list_pause` — Lister pause.
- **C0171** · `health_products.list_stop` — Lister stop.
- **C0172** · `health_products.list_remove` — Lister remove.
- **C0173** · `health_products.intake_note` — intake note.
- **C0174** · `health_products.intakes` — intakes.
- **C0175** · `health_products.intakes_range` — intakes range.
- **C0176** · `health_products.catalogue_search` — catalogue search.
- **C0177** · `health_products.catalogue_barcode` — catalogue barcode.
- **C0178** · `health_products.medicine_search` — medicine search.
- **C0179** · `health_products.medicine_presentation` — medicine presentation.
- **C0180** · `health_products.medicine_posology` — medicine posology.
- **C0181** · `health_products.medicine_scan` — medicine scan.
- **C0182** · `health_products.reminder` — reminder.

### Conseils nutritionnels — food_advice (8 commandes) · scénario S016

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/food_advice_contracts.js). Interface, moteur et MCP utilisent la famille food_advice.

- **C0183** · `food_advice.verdicts` — verdicts.
- **C0184** · `food_advice.profile` — profile.
- **C0185** · `food_advice.products` — products.
- **C0186** · `food_advice.reason` — reason.
- **C0187** · `food_advice.tips` — tips.
- **C0188** · `food_advice.tip_save` — tip save.
- **C0189** · `food_advice.tip_remove` — tip remove.
- **C0190** · `food_advice.rules` — rules.

### Carnet médical — health_record (12 commandes) · scénario S017

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/health_record_contracts.js). Interface, moteur et MCP utilisent la famille health_record.

- **C0191** · `health_record.open` — Ouvrir.
- **C0192** · `health_record.close` — Fermer.
- **C0193** · `health_record.entries` — entries.
- **C0194** · `health_record.entry_save` — entry save.
- **C0195** · `health_record.entry_remove` — entry remove.
- **C0196** · `health_record.allergies` — allergies.
- **C0197** · `health_record.result_import` — result import.
- **C0198** · `health_record.result_remove` — result remove.
- **C0199** · `health_record.result_read` — result read.
- **C0200** · `health_record.result_verify` — result verify.
- **C0201** · `health_record.results` — results.
- **C0202** · `health_record.results_export` — results export.

### Ordonnances — ordonnance (16 commandes) · scénario S018

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/prescription/contracts.js). Interface, moteur et MCP utilisent la famille ordonnance.

- **C0203** · `ordonnance.open` — Ouvrir.
- **C0204** · `ordonnance.new` — Créer.
- **C0205** · `ordonnance.dictate` — Dicter.
- **C0206** · `ordonnance.read_photo` — Analyser une photo.
- **C0207** · `ordonnance.add_line` — Ajouter line.
- **C0208** · `ordonnance.lines` — lines.
- **C0209** · `ordonnance.validate` — Valider.
- **C0210** · `ordonnance.identity` — identity.
- **C0211** · `ordonnance.identity_set` — identity set.
- **C0212** · `ordonnance.tip_remove` — tip remove.
- **C0213** · `ordonnance.sign` — sign.
- **C0214** · `ordonnance.print` — Imprimer.
- **C0215** · `ordonnance.export` — Exporter.
- **C0216** · `ordonnance.send` — Envoyer.
- **C0217** · `ordonnance.list` — Lister.
- **C0218** · `ordonnance.received` — received.

### Aide à la prescription — prescription_aid (12 commandes) · scénario S019

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/prescription/prescription_aid_contracts.js). Interface, moteur et MCP utilisent la famille prescription_aid.

- **C0219** · `prescription_aid.open` — Ouvrir.
- **C0220** · `prescription_aid.symptoms` — symptoms.
- **C0221** · `prescription_aid.analyse` — analyse.
- **C0222** · `prescription_aid.view` — Basculer la vue texte / grille.
- **C0223** · `prescription_aid.list` — Lister.
- **C0224** · `prescription_aid.send` — Envoyer.
- **C0225** · `prescription_aid.received` — received.
- **C0226** · `prescription_aid.resolve` — resolve.
- **C0227** · `prescription_aid.correct` — correct.
- **C0228** · `prescription_aid.refuse` — Refuser.
- **C0229** · `prescription_aid.validate` — Valider.
- **C0230** · `prescription_aid.hours` — hours.

### Programmes d’objectifs — objective_program (26 commandes) · scénario S020

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/objective_program/contracts.js). Interface, moteur et MCP utilisent la famille objective_program.

- **C0231** · `objective_program.propose` — propose.
- **C0232** · `objective_program.need_set` — need set.
- **C0233** · `objective_program.decide` — Décider.
- **C0234** · `objective_program.preview` — Prévisualiser.
- **C0235** · `objective_program.reduce` — reduce.
- **C0236** · `objective_program.planning` — planning.
- **C0237** · `objective_program.launch` — launch.
- **C0238** · `objective_program.today` — today.
- **C0239** · `objective_program.adapt_preview` — adapt preview.
- **C0240** · `objective_program.adapt` — adapt.
- **C0241** · `objective_program.free_read` — free read.
- **C0242** · `objective_program.free_set` — free set.
- **C0243** · `objective_program.free_step_add` — free step add.
- **C0244** · `objective_program.free_step_rename` — free step rename.
- **C0245** · `objective_program.free_step_move` — free step move.
- **C0246** · `objective_program.free_step_wait` — free step wait.
- **C0247** · `objective_program.free_step_remove` — free step remove.
- **C0248** · `objective_program.free_done` — free done.
- **C0249** · `objective_program.pause` — Mettre en pause.
- **C0250** · `objective_program.resume` — Reprendre.
- **C0251** · `objective_program.library` — library.
- **C0252** · `objective_program.sheet` — sheet.
- **C0253** · `objective_program.sensors` — sensors.
- **C0254** · `objective_program.scenario` — scenario.
- **C0255** · `objective_program.open` — Ouvrir.
- **C0256** · `objective_program.close` — Fermer.

### Cures et soins — thalasso (8 commandes) · scénario S021

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/thalasso/contracts.js). Interface, moteur et MCP utilisent la famille thalasso.

- **C0257** · `thalasso.catalog` — catalog.
- **C0258** · `thalasso.open` — Ouvrir.
- **C0259** · `thalasso.stay_read` — stay read.
- **C0260** · `thalasso.stay_set` — stay set.
- **C0261** · `thalasso.stay_clear` — stay clear.
- **C0262** · `thalasso.care_add` — care add.
- **C0263** · `thalasso.care_remove` — care remove.
- **C0264** · `thalasso.care_done` — care done.

### Capteurs — sensors (7 commandes) · scénario S022

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/sensor_contracts.js). Interface, moteur et MCP utilisent la famille sensors.

- **C0265** · `sensors.status` — status.
- **C0266** · `sensors.consent` — consent.
- **C0267** · `sensors.set_consent` — Définir consent.
- **C0268** · `sensors.list` — Lister.
- **C0269** · `sensors.delete` — Supprimer.
- **C0270** · `sensors.restore` — restore.
- **C0271** · `sensors.set_enabled` — Définir enabled.

### Données corporelles — body_data (4 commandes) · scénario S023

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/body_data_contracts.js). Interface, moteur et MCP utilisent la famille body_data.

- **C0272** · `body_data.consent` — consent.
- **C0273** · `body_data.set_consent` — Définir consent.
- **C0274** · `body_data.status` — status.
- **C0275** · `body_data.delete` — Supprimer.

### Courses — shopping (9 commandes) · scénario S024

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/shopping/contracts.js). Interface, moteur et MCP utilisent la famille shopping.

- **C0276** · `shopping.list` — Lister.
- **C0277** · `shopping.add` — Ajouter.
- **C0278** · `shopping.update` — Modifier.
- **C0279** · `shopping.check` — Cocher.
- **C0280** · `shopping.uncheck` — Décocher.
- **C0281** · `shopping.remove` — Retirer.
- **C0282** · `shopping.clear_checked` — clear checked.
- **C0283** · `shopping.sync_nutrition` — sync nutrition.
- **C0284** · `shopping.open` — Ouvrir.

### Listes de médias — media_lists (8 commandes) · scénario S025

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/media_lists/contracts.js). Interface, moteur et MCP utilisent la famille media_lists.

- **C0285** · `media_lists.list` — Lister.
- **C0286** · `media_lists.create` — Créer.
- **C0287** · `media_lists.rename` — Renommer.
- **C0288** · `media_lists.add` — Ajouter.
- **C0289** · `media_lists.remove` — Retirer.
- **C0290** · `media_lists.delete` — Supprimer.
- **C0291** · `media_lists.open` — Ouvrir.
- **C0292** · `media_lists.control` — control.

### Partage — share (12 commandes) · scénario S026

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/sharing/contracts.js). Interface, moteur et MCP utilisent la famille share.

- **C0293** · `share.send` — Envoyer.
- **C0294** · `share.pending` — pending.
- **C0295** · `share.view` — Basculer la vue texte / grille.
- **C0296** · `share.accept` — Accepter.
- **C0297** · `share.refuse` — Refuser.
- **C0298** · `share.detach` — detach.
- **C0299** · `share.revoke` — revoke.
- **C0300** · `share.sent` — sent.
- **C0301** · `share.list_create` — Lister create.
- **C0302** · `share.list_delete` — Lister delete.
- **C0303** · `share.draft` — draft.
- **C0304** · `share.announce` — announce.

### Sorties et loisirs — shows (10 commandes) · scénario S027

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/shows/contracts.js). Interface, moteur et MCP utilisent la famille shows.

- **C0305** · `shows.plates` — plates.
- **C0306** · `shows.search` — Rechercher.
- **C0307** · `shows.open` — Ouvrir.
- **C0308** · `shows.set_favorite` — Définir comme favori.
- **C0309** · `shows.set_radius` — Définir radius.
- **C0310** · `shows.set_place` — Définir place.
- **C0311** · `shows.add_to_calendar` — Ajouter to calendar.
- **C0312** · `shows.navigate` — navigate.
- **C0313** · `shows.open_site` — Ouvrir site.
- **C0314** · `shows.open_tickets` — Ouvrir tickets.

### Navigation Web — web (8 commandes) · scénario S028

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/web/contracts.js). Interface, moteur et MCP utilisent la famille web.

- **C0315** · `web.open` — Ouvrir.
- **C0316** · `web.navigate` — navigate.
- **C0317** · `web.page` — page.
- **C0318** · `web.favorite` — Ajouter aux favoris.
- **C0319** · `web.favorites` — favorites.
- **C0320** · `web.size` — size.
- **C0321** · `web.close` — Fermer.
- **C0322** · `web.engine` — engine.

### Événements publics — events (13 commandes) · scénario S029

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/public_events/contracts.js). Interface, moteur et MCP utilisent la famille events.

- **C0323** · `events.categories` — categories.
- **C0324** · `events.declare` — declare.
- **C0325** · `events.publish` — Publier.
- **C0326** · `events.update` — Modifier.
- **C0327** · `events.unpublish` — unpublish.
- **C0328** · `events.mine` — mine.
- **C0329** · `events.nearby` — nearby.
- **C0330** · `events.report` — report.
- **C0331** · `events.contact` — contact.
- **C0332** · `events.panel` — panel.
- **C0333** · `events.save` — Enregistrer.
- **C0334** · `events.share` — Partager.
- **C0335** · `events.open` — Ouvrir.

### Boutique — shop (25 commandes) · scénario S030

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/shop/contracts.js). Interface, moteur et MCP utilisent la famille shop.

- **C0336** · `shop.browse` — browse.
- **C0337** · `shop.sell` — sell.
- **C0338** · `shop.update` — Modifier.
- **C0339** · `shop.withdraw` — Retirer.
- **C0340** · `shop.delete` — Supprimer.
- **C0341** · `shop.mine` — mine.
- **C0342** · `shop.buy` — buy.
- **C0343** · `shop.orders` — orders.
- **C0344** · `shop.order` — order.
- **C0345** · `shop.write` — Écrire.
- **C0346** · `shop.conversation` — conversation.
- **C0347** · `shop.conversations` — conversations.
- **C0348** · `shop.report` — report.
- **C0349** · `shop.favorite` — Ajouter aux favoris.
- **C0350** · `shop.favorites` — favorites.
- **C0351** · `shop.web_shops` — web shops.
- **C0352** · `shop.web_shop_add` — web shop add.
- **C0353** · `shop.plans` — plans.
- **C0354** · `shop.plan_set` — plan set.
- **C0355** · `shop.plan_item` — plan item.
- **C0356** · `shop.web_shop_site` — web shop site.
- **C0357** · `shop.plan_remove` — plan remove.
- **C0358** · `shop.plan_order` — plan order.
- **C0359** · `shop.plan_decline` — plan decline.
- **C0360** · `shop.open` — Ouvrir.

### Coachs — coaches (10 commandes) · scénario S031

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/coaches/contracts.js). Interface, moteur et MCP utilisent la famille coaches.

- **C0361** · `coaches.find` — find.
- **C0362** · `coaches.slots` — slots.
- **C0363** · `coaches.book` — book.
- **C0364** · `coaches.bookings` — bookings.
- **C0365** · `coaches.answer` — answer.
- **C0366** · `coaches.cancel` — Annuler.
- **C0367** · `coaches.mine` — mine.
- **C0368** · `coaches.become` — become.
- **C0369** · `coaches.stop` — Arrêter.
- **C0370** · `coaches.open` — Ouvrir.

### Films — films (10 commandes) · scénario S032

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/films/contracts.js). Interface, moteur et MCP utilisent la famille films.

- **C0371** · `films.services` — services.
- **C0372** · `films.set_service` — Définir service.
- **C0373** · `films.search` — Rechercher.
- **C0374** · `films.similar` — similar.
- **C0375** · `films.lists` — lists.
- **C0376** · `films.favorite` — Ajouter aux favoris.
- **C0377** · `films.like` — like.
- **C0378** · `films.open` — Ouvrir.
- **C0379** · `films.play` — Lire.
- **C0380** · `films.control` — control.

### Création texte / image — creation (22 commandes) · scénario S033

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/creation/contracts.js). Interface, moteur et MCP utilisent la famille creation.

- **C0381** · `creation.list` — Lister.
- **C0382** · `creation.read` — Lire.
- **C0383** · `creation.open` — Ouvrir.
- **C0384** · `creation.new_text` — Créer un texte.
- **C0385** · `creation.new_drawing` — Créer un dessin.
- **C0386** · `creation.new_picture` — Créer une image.
- **C0387** · `creation.write` — Écrire.
- **C0388** · `creation.style` — style.
- **C0389** · `creation.paragraph` — paragraph.
- **C0390** · `creation.page` — page.
- **C0391** · `creation.insert` — insert.
- **C0392** · `creation.link` — link.
- **C0393** · `creation.draw` — draw.
- **C0394** · `creation.drawing_style` — drawing style.
- **C0395** · `creation.arrange` — arrange.
- **C0396** · `creation.erase` — erase.
- **C0397** · `creation.retouch` — retouch.
- **C0398** · `creation.frame` — Recadrer.
- **C0399** · `creation.keep` — keep.
- **C0400** · `creation.delete` — Supprimer.
- **C0401** · `creation.export` — Exporter.
- **C0402** · `creation.send` — Envoyer.

### Calcul dans le texte — calc (8 commandes) · scénario S034

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/calc/contracts.js). Interface, moteur et MCP utilisent la famille calc.

- **C0403** · `calc.cells` — Lister les cellules de texte.
- **C0404** · `calc.cell` — Créer une cellule ancrée à une valeur.
- **C0405** · `calc.cell_update` — Modifier une cellule.
- **C0406** · `calc.uncell` — Retirer le statut de cellule sans effacer le texte.
- **C0407** · `calc.formula` — Créer ou modifier une formule.
- **C0408** · `calc.view` — Basculer la vue texte / grille.
- **C0409** · `calc.grid_move` — Déplacer ou échanger deux cellules de grille.
- **C0410** · `calc.recalc` — Recalculer les formules.

### Modèles de documents — document (5 commandes) · scénario S035

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/document/contracts.js). Interface, moteur et MCP utilisent la famille document.

- **C0411** · `document.templates` — templates.
- **C0412** · `document.template` — template.
- **C0413** · `document.untemplate` — untemplate.
- **C0414** · `document.role` — role.
- **C0415** · `document.role_style` — role style.

### Scripts des documents — script (5 commandes) · scénario S036

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/script/contracts.js). Interface, moteur et MCP utilisent la famille script.

- **C0416** · `script.list` — Lister.
- **C0417** · `script.save` — Enregistrer.
- **C0418** · `script.remove` — Retirer.
- **C0419** · `script.enable` — enable.
- **C0420** · `script.run` — run.

### Import de médias — media_import (11 commandes) · scénario S037

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/media_import/contracts.js). Interface, moteur et MCP utilisent la famille media_import.

- **C0421** · `media_import.state` — Consulter l’état.
- **C0422** · `media_import.list` — Lister.
- **C0423** · `media_import.open` — Ouvrir.
- **C0424** · `media_import.source` — source.
- **C0425** · `media_import.filter` — filter.
- **C0426** · `media_import.layout` — layout.
- **C0427** · `media_import.camera` — camera.
- **C0428** · `media_import.take` — take.
- **C0429** · `media_import.choose` — choose.
- **C0430** · `media_import.close` — Fermer.
- **C0431** · `media_import.delete` — Supprimer.

### Captures — captures (11 commandes) · scénario S038

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/capture/contracts.js). Interface, moteur et MCP utilisent la famille captures.

- **C0432** · `captures.state` — Consulter l’état.
- **C0433** · `captures.start` — Démarrer.
- **C0434** · `captures.stop` — Arrêter.
- **C0435** · `captures.close` — Fermer.
- **C0436** · `captures.camera` — camera.
- **C0437** · `captures.show` — show.
- **C0438** · `captures.play` — Lire.
- **C0439** · `captures.pause` — Mettre en pause.
- **C0440** · `captures.preview` — Prévisualiser.
- **C0441** · `captures.fullscreen` — fullscreen.
- **C0442** · `captures.delete` — Supprimer.

### Effets et instruments audio — audio_fx (70 commandes) · scénario S039

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/audio_fx/contracts.js). Interface, moteur et MCP utilisent la famille audio_fx.

- **C0443** · `audio_fx.catalog` — catalog.
- **C0444** · `audio_fx.inputs` — inputs.
- **C0445** · `audio_fx.start` — Démarrer.
- **C0446** · `audio_fx.stop` — Arrêter.
- **C0447** · `audio_fx.add` — Ajouter.
- **C0448** · `audio_fx.move` — Déplacer.
- **C0449** · `audio_fx.remove` — Retirer.
- **C0450** · `audio_fx.set_param` — Définir param.
- **C0451** · `audio_fx.bypass` — bypass.
- **C0452** · `audio_fx.set_input` — Définir input.
- **C0453** · `audio_fx.save` — Enregistrer.
- **C0454** · `audio_fx.update` — Modifier.
- **C0455** · `audio_fx.compose` — compose.
- **C0456** · `audio_fx.delete` — Supprimer.
- **C0457** · `audio_fx.favorite` — Ajouter aux favoris.
- **C0458** · `audio_fx.save_preset` — Enregistrer preset.
- **C0459** · `audio_fx.delete_preset` — Supprimer preset.
- **C0460** · `audio_fx.tone3000_search` — tone3000 search.
- **C0461** · `audio_fx.tone3000_models` — tone3000 models.
- **C0462** · `audio_fx.tone3000_take` — tone3000 take.
- **C0463** · `audio_fx.instrument_create` — instrument create.
- **C0464** · `audio_fx.instrument_update` — instrument update.
- **C0465** · `audio_fx.instrument_delete` — instrument delete.
- **C0466** · `audio_fx.instrument_read` — instrument read.
- **C0467** · `audio_fx.samples_place` — samples place.
- **C0468** · `audio_fx.zone_drop` — zone drop.
- **C0469** · `audio_fx.zone_set` — zone set.
- **C0470** · `audio_fx.zone_remove` — zone remove.
- **C0471** · `audio_fx.take_set` — take set.
- **C0472** · `audio_fx.take_remove` — take remove.
- **C0473** · `audio_fx.release_takes_set` — release takes set.
- **C0474** · `audio_fx.params_set` — params set.
- **C0475** · `audio_fx.facade_set` — facade set.
- **C0476** · `audio_fx.note_play` — note play.
- **C0477** · `audio_fx.composed_set` — composed set.
- **C0478** · `audio_fx.composed_step_add` — composed step add.
- **C0479** · `audio_fx.composed_step_set` — composed step set.
- **C0480** · `audio_fx.composed_step_remove` — composed step remove.
- **C0481** · `audio_fx.composed_segment_set` — composed segment set.
- **C0482** · `audio_fx.transition_set` — transition set.
- **C0483** · `audio_fx.transition_remove` — transition remove.
- **C0484** · `audio_fx.marker_add` — marker add.
- **C0485** · `audio_fx.marker_move` — marker move.
- **C0486** · `audio_fx.marker_set` — marker set.
- **C0487** · `audio_fx.marker_remove` — marker remove.
- **C0488** · `audio_fx.validate` — Valider.
- **C0489** · `audio_fx.slice_read` — slice read.
- **C0490** · `audio_fx.slice_tempo_set` — slice tempo set.
- **C0491** · `audio_fx.slice_divide` — slice divide.
- **C0492** · `audio_fx.slice_detect` — slice detect.
- **C0493** · `audio_fx.slice_point_add` — slice point add.
- **C0494** · `audio_fx.slice_point_move` — slice point move.
- **C0495** · `audio_fx.slice_point_remove` — slice point remove.
- **C0496** · `audio_fx.slice_point_lock` — slice point lock.
- **C0497** · `audio_fx.slices_make` — slices make.
- **C0498** · `audio_fx.slices_to_keys` — slices to keys.
- **C0499** · `audio_fx.slices_to_round_robin` — slices to round robin.
- **C0500** · `audio_fx.slices_to_midi` — slices to midi.
- **C0501** · `audio_fx.slices_to_cells` — slices to cells.
- **C0502** · `audio_fx.edit_from_slices` — Modifier from slices.
- **C0503** · `audio_fx.edit_apply` — Modifier apply.
- **C0504** · `audio_fx.edit_undo` — Modifier undo.
- **C0505** · `audio_fx.sample_analyze` — sample analyze.
- **C0506** · `audio_fx.sample_play` — sample play.
- **C0507** · `audio_fx.sample_freeze` — sample freeze.
- **C0508** · `audio_fx.bank_inspect` — bank inspect.
- **C0509** · `audio_fx.bank_import` — bank import.
- **C0510** · `audio_fx.samples_arrange` — samples arrange.
- **C0511** · `audio_fx.instrument_export_sfz` — instrument export sfz.
- **C0512** · `audio_fx.auto_sample` — auto sample.

### Profils de vie — profiles (7 commandes) · scénario S040

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/life_profiles/contracts.js). Interface, moteur et MCP utilisent la famille profiles.

- **C0513** · `profiles.list` — Lister.
- **C0514** · `profiles.create` — Créer.
- **C0515** · `profiles.rename` — Renommer.
- **C0516** · `profiles.color` — color.
- **C0517** · `profiles.delete` — Supprimer.
- **C0518** · `profiles.activate` — Activer.
- **C0519** · `profiles.assign` — assign.

### Produits alimentaires — food (7 commandes) · scénario S041

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/food/contracts.js). Interface, moteur et MCP utilisent la famille food.

- **C0520** · `food.lookup` — lookup.
- **C0521** · `food.search` — Rechercher.
- **C0522** · `food.alternatives` — alternatives.
- **C0523** · `food.attach` — attach.
- **C0524** · `food.scan` — scan.
- **C0525** · `food.add` — Ajouter.
- **C0526** · `food.identify` — identify.

### Livres — books (8 commandes) · scénario S042

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/books/contracts.js). Interface, moteur et MCP utilisent la famille books.

- **C0527** · `books.list` — Lister.
- **C0528** · `books.download` — download.
- **C0529** · `books.open` — Ouvrir.
- **C0530** · `books.remove` — Retirer.
- **C0531** · `books.import` — Importer.
- **C0532** · `books.page` — page.
- **C0533** · `books.transport` — Contrôler le transport.
- **C0534** · `books.close` — Fermer.

### Projets — projects (8 commandes) · scénario S043

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/projects/contracts.js). Interface, moteur et MCP utilisent la famille projects.

- **C0535** · `projects.list` — Lister.
- **C0536** · `projects.create` — Créer.
- **C0537** · `projects.open` — Ouvrir.
- **C0538** · `projects.favorite` — Ajouter aux favoris.
- **C0539** · `projects.delete` — Supprimer.
- **C0540** · `projects.band_tool` — band tool.
- **C0541** · `projects.media` — media.
- **C0542** · `projects.search` — Rechercher.

### Projets de code — code_project (9 commandes) · scénario S044

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/code_projects/contracts.js). Interface, moteur et MCP utilisent la famille code_project.

- **C0543** · `code_project.create` — Créer.
- **C0544** · `code_project.open` — Ouvrir.
- **C0545** · `code_project.state` — Consulter l’état.
- **C0546** · `code_project.plan` — plan.
- **C0547** · `code_project.check` — Cocher.
- **C0548** · `code_project.mode` — mode.
- **C0549** · `code_project.repo_list` — repo list.
- **C0550** · `code_project.repo_read` — repo read.
- **C0551** · `code_project.repo_search` — repo search.

### Objectifs et tableau de bord — dashboard_progression (34 commandes) · scénario S045

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/dashboard_progression/contracts.js). Interface, moteur et MCP utilisent la famille dashboard_progression.

- **C0552** · `dashboard.progression.read` — Lire — progression.
- **C0553** · `dashboard.progression.evaluate` — evaluate — progression.
- **C0554** · `dashboard.objectives.list` — Lister — objectives.
- **C0555** · `dashboard.objective.target.set` — Définir — objective / target.
- **C0556** · `dashboard.objective.settings.read` — Lire — objective / settings.
- **C0557** · `dashboard.objective.settings.set` — Définir — objective / settings.
- **C0558** · `dashboard.objective.schedule.read` — Lire — objective / schedule.
- **C0559** · `dashboard.objective.schedule.set` — Définir — objective / schedule.
- **C0560** · `dashboard.objective.aim.set` — Définir — objective / aim.
- **C0561** · `dashboard.objective.deadline.set` — Définir — objective / deadline.
- **C0562** · `dashboard.objective.challenge.set` — Définir — objective / challenge.
- **C0563** · `dashboard.objective.prepare` — Préparer — objective.
- **C0564** · `dashboard.objective.done` — done — objective.
- **C0565** · `dashboard.objective.close` — Fermer — objective.
- **C0566** · `dashboard.objective.delete` — Supprimer — objective.
- **C0567** · `dashboard.session.objectives.read` — Lire — session / objectives.
- **C0568** · `dashboard.session.objectives.set` — Définir — session / objectives.
- **C0569** · `dashboard.monitors.select` — Sélectionner — monitors.
- **C0570** · `dashboard.monitors.favorite` — Ajouter aux favoris — monitors.
- **C0571** · `dashboard.ongoing.open` — Ouvrir — ongoing.
- **C0572** · `dashboard.activity.recent` — recent — activity.
- **C0573** · `dashboard.activity.resume` — Reprendre — activity.
- **C0574** · `dashboard.stage.layout` — layout — stage.
- **C0575** · `dashboard.duo.open` — Ouvrir — duo.
- **C0576** · `dashboard.duo.choose` — choose — duo.
- **C0577** · `dashboard.duo.close` — Fermer — duo.
- **C0578** · `dashboard.search.end` — end — search.
- **C0579** · `dashboard.results.open` — Ouvrir — results.
- **C0580** · `dashboard.results.day` — day — results.
- **C0581** · `dashboard.results.week` — week — results.
- **C0582** · `dashboard.results.filter` — filter — results.
- **C0583** · `dashboard.results.hour` — hour — results.
- **C0584** · `dashboard.results.feeling` — feeling — results.
- **C0585** · `dashboard.results.close` — Fermer — results.

### Sites et domaines — site (30 commandes) · scénario S046

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/site/contracts.js). Interface, moteur et MCP utilisent la famille site.

- **C0586** · `site.goto` — goto.
- **C0587** · `site.pages` — pages.
- **C0588** · `site.state` — Consulter l’état.
- **C0589** · `site.list` — Lister.
- **C0590** · `site.settings` — settings.
- **C0591** · `site.check` — Cocher.
- **C0592** · `site.preview` — Prévisualiser.
- **C0593** · `site.publish` — Publier.
- **C0594** · `site.cancel` — Annuler.
- **C0595** · `site.history` — history.
- **C0596** · `site.rollback` — rollback.
- **C0597** · `site.retire` — retire.
- **C0598** · `site.menu` — menu.
- **C0599** · `site.form` — form.
- **C0600** · `site.domain_search` — domain search.
- **C0601** · `site.domain_quote` — domain quote.
- **C0602** · `site.domain_buy` — domain buy.
- **C0603** · `site.domain_connect` — domain connect.
- **C0604** · `site.domain_verify` — domain verify.
- **C0605** · `site.domain_primary` — domain primary.
- **C0606** · `site.domain_unlink` — domain unlink.
- **C0607** · `site.domain_transfer` — domain transfer.
- **C0608** · `site.domain_records` — domain records.
- **C0609** · `site.domain_record_set` — domain record set.
- **C0610** · `site.domain_renewal` — domain renewal.
- **C0611** · `site.domain_leave` — domain leave.
- **C0612** · `site.mail_list` — mail list.
- **C0613** · `site.mail_add` — mail add.
- **C0614** · `site.mail_remove` — mail remove.
- **C0615** · `site.hosting` — hosting.

### QR codes — qr (3 commandes) · scénario S047

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/qr/contracts.js). Interface, moteur et MCP utilisent la famille qr.

- **C0616** · `qr.make` — make.
- **C0617** · `qr.open` — Ouvrir.
- **C0618** · `qr.keep` — keep.

### Interactions — interactions (5 commandes) · scénario S048

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/interactions/contracts.js). Interface, moteur et MCP utilisent la famille interactions.

- **C0619** · `interactions.list` — Lister.
- **C0620** · `interactions.create` — Créer.
- **C0621** · `interactions.update` — Modifier.
- **C0622** · `interactions.remove` — Retirer.
- **C0623** · `interactions.run` — run.

### Vidéos commentées — video_train (17 commandes) · scénario S049

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/video_train/contracts.js). Interface, moteur et MCP utilisent la famille video_train.

- **C0624** · `video_train.share` — Partager.
- **C0625** · `video_train.thread` — thread.
- **C0626** · `video_train.open_thread` — Ouvrir thread.
- **C0627** · `video_train.open_share` — Ouvrir share.
- **C0628** · `video_train.play` — Lire.
- **C0629** · `video_train.order` — order.
- **C0630** · `video_train.reply` — reply.
- **C0631** · `video_train.vote` — vote.
- **C0632** · `video_train.report` — report.
- **C0633** · `video_train.retire` — retire.
- **C0634** · `video_train.replies` — replies.
- **C0635** · `video_train.import` — Importer.
- **C0636** · `video_train.forward` — forward.
- **C0637** · `video_train.open_forward` — Ouvrir forward.
- **C0638** · `video_train.reported` — reported.
- **C0639** · `video_train.level` — level.
- **C0640** · `video_train.dismiss` — dismiss.

### Envoi de résultats — results_send (5 commandes) · scénario S050

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/results_send/contracts.js). Interface, moteur et MCP utilisent la famille results_send.

- **C0641** · `results_send.open` — Ouvrir.
- **C0642** · `results_send.read` — Lire.
- **C0643** · `results_send.pick` — pick.
- **C0644** · `results_send.next` — next.
- **C0645** · `results_send.close` — Fermer.

### Strava — strava (8 commandes) · scénario S051

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/strava/contracts.js). Interface, moteur et MCP utilisent la famille strava.

- **C0646** · `strava.get_state` — Consulter l’état.
- **C0647** · `strava.connect` — Connecter.
- **C0648** · `strava.await_connection` — await connection.
- **C0649** · `strava.cancel_connection` — Annuler connection.
- **C0650** · `strava.import` — Importer.
- **C0651** · `strava.disconnect` — Déconnecter.
- **C0652** · `strava.remove_imports` — Retirer imports.
- **C0653** · `strava.remove_import` — Retirer import.

### Synchronisation santé — health_sync (5 commandes) · scénario S052

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/health_sync_contracts.js). Interface, moteur et MCP utilisent la famille health_sync.

- **C0654** · `health_sync.get_state` — Consulter l’état.
- **C0655** · `health_sync.connect` — Connecter.
- **C0656** · `health_sync.sync` — sync.
- **C0657** · `health_sync.disconnect` — Déconnecter.
- **C0658** · `health_sync.open_settings` — Ouvrir les réglages.

### Publication — publish (9 commandes) · scénario S053

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/publish/contracts.js). Interface, moteur et MCP utilisent la famille publish.

- **C0659** · `publish.recipients` — recipients.
- **C0660** · `publish.open` — Ouvrir.
- **C0661** · `publish.send` — Envoyer.
- **C0662** · `publish.list` — Lister.
- **C0663** · `publish.open_planned` — Ouvrir planned.
- **C0664** · `publish.edit` — Modifier.
- **C0665** · `publish.update` — Modifier.
- **C0666** · `publish.send_now` — Envoyer maintenant.
- **C0667** · `publish.cancel` — Annuler.

### Forums — forum (11 commandes) · scénario S054

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/forum/contracts.js). Interface, moteur et MCP utilisent la famille forum.

- **C0668** · `forum.list` — Lister.
- **C0669** · `forum.create` — Créer.
- **C0670** · `forum.invite` — invite.
- **C0671** · `forum.respond` — respond.
- **C0672** · `forum.leave` — leave.
- **C0673** · `forum.delete` — Supprimer.
- **C0674** · `forum.remove_post` — Retirer post.
- **C0675** · `forum.members` — members.
- **C0676** · `forum.posts` — posts.
- **C0677** · `forum.post` — post.
- **C0678** · `forum.open` — Ouvrir.

### Autorisations MCP — mcp_access (6 commandes) · scénario S055

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/mcp_access/contracts.js). Interface, moteur et MCP utilisent la famille mcp_access.

- **C0679** · `mcp_access.programs` — programs.
- **C0680** · `mcp_access.program_families` — program families.
- **C0681** · `mcp_access.program_withdraw` — program withdraw.
- **C0682** · `mcp_access.confirmations` — confirmations.
- **C0683** · `mcp_access.confirmation_open` — confirmation open.
- **C0684** · `mcp_access.confirmation_decide` — confirmation decide.

### Réseau d’objectifs — objective_network (10 commandes) · scénario S056

Contrat : [source](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/objective_network/contracts.js). Interface, moteur et MCP utilisent la famille objective_network.

- **C0685** · `objective_network.visibility_get` — visibility get.
- **C0686** · `objective_network.visibility_set` — visibility set.
- **C0687** · `objective_network.visibility_open` — visibility open.
- **C0688** · `objective_network.people` — people.
- **C0689** · `objective_network.people_open` — people open.
- **C0690** · `objective_network.report` — report.
- **C0691** · `objective_network.block` — block.
- **C0692** · `objective_network.end_link` — end link.
- **C0693** · `objective_network.network_get` — network get.
- **C0694** · `objective_network.network_set` — network set.

## C — Méthodes MCP transversales (104 méthodes)

Ces méthodes sont des services et accès transversaux. Un point d’entrée MCP n’est pas nécessairement un bouton graphique ; l’IA testeuse vérifie l’interface lorsqu’une surface existe, et le contrat MCP avec les permissions propres sinon.

### atome (3) · scénario M01

- **C0713** · `atome.create` — Créer.
- **C0714** · `atome.box` — box.
- **C0715** · `atome.describe` — describe.

### communication (5) · scénario M02

- **C0733** · `communication.list` — Lister.
- **C0734** · `communication.search` — Rechercher.
- **C0735** · `communication.read` — Lire.
- **C0736** · `communication.reply_draft` — reply draft.
- **C0737** · `communication.send` — Envoyer.

### mail (11) · scénario M03

- **C0738** · `mail.list` — Lister.
- **C0739** · `mail.read` — Lire.
- **C0740** · `mail.search` — Rechercher.
- **C0741** · `mail.next_unread` — next unread.
- **C0742** · `mail.summarize` — summarize.
- **C0743** · `mail.reply_draft` — reply draft.
- **C0744** · `mail.mark_read` — mark read.
- **C0745** · `mail.mark_unread` — mark unread.
- **C0746** · `mail.archive` — archive.
- **C0747** · `mail.delete` — Supprimer.
- **C0748** · `mail.send` — Envoyer.

### contacts (16) · scénario M04

- **C0749** · `contacts.sources` — sources.
- **C0750** · `contacts.list` — Lister.
- **C0751** · `contacts.search` — Rechercher.
- **C0752** · `contacts.read` — Lire.
- **C0753** · `contacts.create` — Créer.
- **C0754** · `contacts.update` — Modifier.
- **C0755** · `contacts.delete` — Supprimer.
- **C0756** · `contacts.import_icloud` — Importer icloud.
- **C0757** · `contacts.push_icloud` — push icloud.
- **C0804** · `contacts.select_personal` — Sélectionner personal.
- **C0805** · `contacts.import_macos` — Importer macos.
- **C0806** · `contacts.import_vcf` — Importer vcf.
- **C0807** · `contacts.export_vcf` — Exporter vcf.
- **C0808** · `contacts.stop_import` — Arrêter import.
- **C0809** · `contacts.import_status` — Importer status.
- **C0810** · `contacts.merge_duplicates` — merge duplicates.

### calendar (15) · scénario M05

- **C0758** · `calendar.sources` — sources.
- **C0759** · `calendar.search` — Rechercher.
- **C0760** · `calendar.today` — today.
- **C0761** · `calendar.next` — next.
- **C0762** · `calendar.create` — Créer.
- **C0763** · `calendar.update` — Modifier.
- **C0764** · `calendar.delete` — Supprimer.
- **C0765** · `calendar.share` — Partager.
- **C0766** · `calendar.export_webcal` — Exporter webcal.
- **C0811** · `calendar.import_native` — Importer native.
- **C0812** · `calendar.import_dav` — Importer dav.
- **C0813** · `calendar.import_ics` — Importer ics.
- **C0814** · `calendar.export_ics` — Exporter ics.
- **C0815** · `calendar.stop_import` — Arrêter import.
- **C0816** · `calendar.import_status` — Importer status.

### bank (9) · scénario M06

- **C0767** · `bank.accounts` — accounts.
- **C0768** · `bank.balance` — balance.
- **C0769** · `bank.transactions` — transactions.
- **C0770** · `bank.summary` — summary.
- **C0771** · `bank.search_transactions` — Rechercher transactions.
- **C0772** · `bank.find_payer` — find payer.
- **C0773** · `bank.spending_by_period` — spending by period.
- **C0774** · `bank.top_merchants` — top merchants.
- **C0775** · `bank.recurring_payments` — recurring payments.

### conditions (21) · scénario M07

- **C0776** · `conditions.evaluate` — evaluate.
- **C0777** · `conditions.properties.discover` — discover.
- **C0778** · `conditions.query.once` — once.
- **C0779** · `conditions.computed.list` — Lister.
- **C0780** · `conditions.computed.save` — Enregistrer.
- **C0781** · `conditions.computed.remove` — Retirer.
- **C0782** · `conditions.lists.list` — Lister.
- **C0783** · `conditions.lists.get` — Consulter.
- **C0784** · `conditions.lists.create` — Créer.
- **C0785** · `conditions.lists.resolve` — resolve.
- **C0786** · `conditions.lists.freeze` — freeze.
- **C0787** · `conditions.lists.remove` — Retirer.
- **C0788** · `conditions.sets.list` — Lister.
- **C0789** · `conditions.sets.get` — Consulter.
- **C0790** · `conditions.sets.save` — Enregistrer.
- **C0791** · `conditions.sets.duplicate` — duplicate.
- **C0792** · `conditions.sets.remove` — Retirer.
- **C0793** · `conditions.bindings.attach` — attach.
- **C0794** · `conditions.bindings.detach` — detach.
- **C0795** · `conditions.bindings.list` — Lister.
- **C0796** · `conditions.bindings.evaluate` — evaluate.

### ai (3) · scénario M08

- **C0797** · `ai.tools.list` — Lister.
- **C0798** · `ai.tools.call` — call.
- **C0799** · `ai.audit.list` — Lister.

### runtime (4) · scénario M09

- **C0800** · `runtime.tools.list` — Lister.
- **C0801** · `runtime.tools.call` — call.
- **C0802** · `runtime.tools.batch_call` — batch call.
- **C0803** · `runtime.audit.list` — Lister.

### mcp (17) · scénario M10

- **C0716** · `mcp.tools.list` — Lister.
- **C0717** · `mcp.resources.list` — Lister.
- **C0718** · `mcp.resources.read` — Lire.
- **C0719** · `mcp.prompts.list` — Lister.
- **C0720** · `mcp.prompts.get` — Consulter.
- **C0721** · `mcp.acl.list` — Lister.
- **C0722** · `mcp.proposals.list` — Lister.
- **C0723** · `mcp.proposals.read` — Lire.
- **C0724** · `mcp.confirmations.list` — Lister.
- **C0725** · `mcp.confirmations.read` — Lire.
- **C0726** · `mcp.rate_limits.list` — Lister.
- **C0727** · `mcp.security.journal.list` — Lister.
- **C0728** · `mcp.toolchains.execute` — execute.
- **C0729** · `mcp.operations.list` — Lister.
- **C0730** · `mcp.operations.read` — Lire.
- **C0731** · `mcp.operations.cancel` — Annuler.
- **C0732** · `mcp.events.list` — Lister.

## D — Contre-vérification des capacités fines du premier inventaire

Conservées pour éviter tout oubli lors de l’audit, mais ce niveau a été reconstruit en confrontation avec les propriétaires de code : ne pas compter `F` + `U` + `C` comme autant de fonctions uniques. Les formulations composites imposent de tester **chaque verbe et variante**.

### 01 — Projets, objets, navigation et organisation

- **F001** — Créer un projet. Scénarios : `L01, S043`.
- **F002** — Ouvrir un projet existant. Scénarios : `L01, S043`.
- **F003** — Renommer un projet. Scénarios : `L01, S043`.
- **F004** — Supprimer un projet. Scénarios : `L01, S043`.
- **F005** — Rechercher un projet par son nom. Scénarios : `L01, S043`.
- **F006** — Filtrer par catégorie, type ou favoris. Scénarios : `L01, S043`.
- **F007** — Ajouter un projet aux favoris ou l'en retirer. Scénarios : `L01, S043`.
- **F008** — Ajouter un objet à un projet. Scénarios : `L01, S043`.
- **F009** — Sélectionner un objet, plusieurs objets ou tous les objets concernés. Scénarios : `L01, S043`.
- **F010** — Sélectionner par lasso. Scénarios : `L01, S043`.
- **F011** — Désélectionner. Scénarios : `L01, S043`.
- **F012** — Copier un objet. Scénarios : `L01, S043`.
- **F013** — Couper un objet. Scénarios : `L01, S043`.
- **F014** — Coller un objet. Scénarios : `L01, S043`.
- **F015** — Dupliquer un objet. Scénarios : `L01, S043`.
- **F016** — Copier et coller un groupe en conservant sa structure. Scénarios : `L01, S043`.
- **F017** — Déplacer un objet, librement ou d'une distance donnée. Scénarios : `L01, S043`.
- **F018** — Redimensionner un objet. Scénarios : `L01, S043`.
- **F019** — Faire pivoter un objet. Scénarios : `L01, S043`.
- **F020** — Modifier l'opacité d'un objet. Scénarios : `L01, S043`.
- **F021** — Aligner plusieurs objets. Scénarios : `L01, S043`.
- **F022** — Répartir plusieurs objets dans l'espace. Scénarios : `L01, S043`.
- **F023** — Changer l'ordre de superposition (avant/arrière). Scénarios : `L01, S043`.
- **F024** — Regrouper et dégrouper des objets. Scénarios : `L01, S043`.
- **F025** — Supprimer, retrouver et restaurer des éléments supprimés. Scénarios : `L01, S043`.
- **F026** — Annuler ou rétablir une action. Scénarios : `L01, S043`.
- **F027** — Consulter l'historique des modifications. Scénarios : `L01, S043`.
- **F028** — Zoomer, revenir à 100 % et adapter la vue. Scénarios : `L01, S043`.
- **F029** — Passer d'une vue naturelle à une liste ou une matrice. Scénarios : `L01, S043`.
- **F030** — Créer une matrice, régler ses lignes et colonnes, modifier une cellule. Scénarios : `L01, S043`.
- **F031** — Ajouter et organiser les outils du projet. Scénarios : `L01, S043`.
- **F032** — Rechercher un objet, un contenu ou un outil dans le Finder. Scénarios : `L01, S043`.

### 02 — Texte, documents et données

- **F033** — Créer, ouvrir, sauvegarder et supprimer un texte. Scénarios : `L02, S033`.
- **F034** — Saisir, insérer, remplacer et effacer des caractères. Scénarios : `L02, S033`.
- **F035** — Sélectionner un mot, une phrase ou un passage. Scénarios : `L02, S033`.
- **F036** — Copier, couper et coller une sélection textuelle. Scénarios : `L02, S033`.
- **F037** — Mettre en gras, en italique, souligner ou barrer. Scénarios : `L02, S033`.
- **F038** — Changer la couleur des caractères. Scénarios : `L02, S033`.
- **F039** — Changer la police et la taille de police. Scénarios : `L02, S033`.
- **F040** — Utiliser des titres H1 à H6, paragraphes, citations, légendes et notes. Scénarios : `L02, S033`.
- **F041** — Aligner le texte à gauche, au centre ou à droite ; justifier. Scénarios : `L02, S033`.
- **F042** — Créer des listes à puces, numérotées ou à cases à cocher. Scénarios : `L02, S033`.
- **F043** — Cocher ou décocher un élément. Scénarios : `L02, S033`.
- **F044** — Modifier retrait, indentation, interligne et espacement. Scénarios : `L02, S033`.
- **F045** — Choisir le format de page (écran, A4, carré ou Story). Scénarios : `L02, S033`.
- **F046** — Modifier l'orientation, les marges, les colonnes et l'arrière-plan. Scénarios : `L02, S033`.
- **F047** — Insérer des séparateurs, images et dessins dans le document. Scénarios : `L02, S033`.
- **F048** — Ajouter ou supprimer un lien hypertexte. Scénarios : `L02, S033`.
- **F049** — Appliquer un modèle de document et ses styles. Scénarios : `L02, S033`.
- **F050** — Séparer le texte en plusieurs objets en fonction de ses lignes. Scénarios : `L02, S033`.
- **F051** — Utiliser le texte comme prompteur. Scénarios : `L02, S033`.
- **F052** — Exporter en texte brut, PDF ou image lorsque le format est proposé. Scénarios : `L02, S033`.
- **F053** — Partager le document ou une sélection. Scénarios : `L02, S033`.
- **F054** — Dans un texte, transformer une ou plusieurs valeurs sélectionnées en cellules de calcul ancrées aux mots (distinct du module Matrix graphique). Scénarios : `S034, L02, S033, X03, X04, X05`.
- **F055** — Assembler par sélection des opérations +, −, × et ÷, nommer les valeurs, composer une formule et déposer le résultat dans le texte. Scénarios : `S034, L02, S033, X03, X04, X05`.
- **F056** — Recalculer automatiquement après modification d’un nombre ; montrer les mêmes cellules en vue Grille puis revenir à la vue Texte. Scénarios : `S034, L02, S033, X03, X04, X05`.
- **F057** — Associer un script à un document et l'exécuter avec autorisation. Scénarios : `L02, S033`.

### 03 — Dessin, formes et composition graphique

- **F058** — Dessiner au stylo, crayon, feutre, marqueur ou pinceau calligraphique. Scénarios : `L03, S033`.
- **F059** — Tracer des lignes, flèches, rectangles, ellipses, étoiles et polygones. Scénarios : `L03, S033`.
- **F060** — Régler la couleur de contour et de remplissage. Scénarios : `L03, S033`.
- **F061** — Régler l'épaisseur d'un tracé. Scénarios : `L03, S033`.
- **F062** — Appliquer des styles de traits, remplissage, arrondi, ombre, néon et encre. Scénarios : `L03, S033`.
- **F063** — Modifier le rayon des coins. Scénarios : `L03, S033`.
- **F064** — Régler les ombres et les effets de luminosité. Scénarios : `L03, S033`.
- **F065** — Déplacer, agrandir, réduire, tourner ou dupliquer un élément dessiné. Scénarios : `L03, S033`.
- **F066** — Effacer ou restaurer localement une partie du dessin. Scénarios : `L03, S033`.
- **F067** — Créer, sélectionner, réordonner ou supprimer des couches SVG. Scénarios : `L03, S033`.
- **F068** — Masquer un élément avec un masque compatible et retirer ce masque. Scénarios : `L03, S033`.
- **F069** — Exporter un dessin en SVG. Scénarios : `L03, S033`.

### 04 — Photographie et retouche d'images

- **F070** — Importer une photo. Scénarios : `L04, S033`.
- **F071** — Prendre une photo avec l'appareil photo. Scénarios : `L04, S033`.
- **F072** — Régler luminosité et contraste. Scénarios : `L04, S033`.
- **F073** — Ajuster ombres et hautes lumières. Scénarios : `L04, S033`.
- **F074** — Modifier saturation et température colorimétrique. Scénarios : `L04, S033`.
- **F075** — Ajuster netteté et vignettage. Scénarios : `L04, S033`.
- **F076** — Appliquer une correction automatique. Scénarios : `L04, S033`.
- **F077** — Choisir un rendu vif, doux, monochrome, sépia, chaud, froid, film ou nuit. Scénarios : `L04, S033`.
- **F078** — Régler l'intensité d'un rendu. Scénarios : `L04, S033`.
- **F079** — Recadrer librement ou à un ratio prédéfini (carré, 4:3, 16:9, 9:16). Scénarios : `L04, S033`.
- **F080** — Tourner une photo de 90 degrés. Scénarios : `L04, S033`.
- **F081** — Retourner horizontalement ou verticalement. Scénarios : `L04, S033`.
- **F082** — Redresser l'horizon. Scénarios : `L04, S033`.
- **F083** — Arrondir les coins d'une image. Scénarios : `L04, S033`.
- **F084** — Effacer et restaurer des régions d'image. Scénarios : `L04, S033`.
- **F085** — Conserver des réglages non destructifs. Scénarios : `L04, S033`.
- **F086** — Exporter une photo retouchée. Scénarios : `L04, S033`.

### 05 — Capture, bibliothèque multimédia et lecture

- **F087** — Capturer du son, de la vidéo, de la photo, de la dictée ou du MIDI. Scénarios : `L05, S038`.
- **F088** — Démarrer, arrêter et enregistrer une prise. Scénarios : `L05, S038`.
- **F089** — Afficher ou masquer l'aperçu de capture. Scénarios : `L05, S038`.
- **F090** — Changer de caméra. Scénarios : `L05, S038`.
- **F091** — Capturer l'écran lorsque le système le permet. Scénarios : `L05, S038`.
- **F092** — Parcourir les prises, aller à la précédente ou à la suivante. Scénarios : `L05, S038`.
- **F093** — Lire, mettre en pause, arrêter et afficher en plein écran. Scénarios : `L05, S038`.
- **F094** — Supprimer une ou plusieurs prises. Scénarios : `L05, S038`.
- **F095** — Importer depuis des albums, la bibliothèque multimédia ou les fichiers. Scénarios : `L05, S038`.
- **F096** — Filtrer les médias par son, photo et vidéo. Scénarios : `L05, S038`.
- **F097** — Basculer entre affichage en tuiles et en liste. Scénarios : `L05, S038`.
- **F098** — Sélectionner plusieurs fichiers. Scénarios : `L05, S038`.
- **F099** — Créer, renommer ou supprimer une liste de médias. Scénarios : `L05, S038`.
- **F100** — Ajouter ou retirer des médias d'une liste sans supprimer le fichier d'origine. Scénarios : `L05, S038`.
- **F101** — Piloter une liste : lecture, pause, avancer, revenir en arrière, suivant, précédent. Scénarios : `L05, S038`.

### 06 — Audio, montage de sons et effets

- **F102** — Lire, mettre en pause ou arrêter un son. Scénarios : `L06, S039`.
- **F103** — Régler des points d'entrée et de sortie. Scénarios : `L06, S039`.
- **F104** — Couper un clip en deux. Scénarios : `L06, S039`.
- **F105** — Répéter un bloc ou une section en boucle. Scénarios : `L06, S039`.
- **F106** — Déplacer les marqueurs de début et de fin d'une boucle. Scénarios : `L06, S039`.
- **F107** — Étirer ou raccourcir la durée d'un passage. Scénarios : `L06, S039`.
- **F108** — Réinitialiser une transformation temporelle. Scénarios : `L06, S039`.
- **F109** — Copier, couper, coller ou supprimer un fragment audio. Scénarios : `L06, S039`.
- **F110** — Rendre un fragment silencieux. Scénarios : `L06, S039`.
- **F111** — Inverser la lecture d'un fragment. Scénarios : `L06, S039`.
- **F112** — Appliquer un fondu d'entrée ou de sortie. Scénarios : `L06, S039`.
- **F113** — Régler le gain et normaliser un échantillon. Scénarios : `L06, S039`.
- **F114** — Détecter la fin silencieuse d'un échantillon. Scénarios : `L06, S039`.
- **F115** — Analyser la possibilité d'une boucle et estimer une note fondamentale. Scénarios : `L06, S039`.
- **F116** — Écouter isolément une tranche audio. Scénarios : `L06, S039`.
- **F117** — Figer le résultat d'une modification. Scénarios : `L06, S039`.
- **F118** — Ajouter un effet audio sur une entrée. Scénarios : `L06, S039`.
- **F119** — Modifier les paramètres d'un effet. Scénarios : `L06, S039`.
- **F120** — Activer ou désactiver temporairement un effet (bypass). Scénarios : `L06, S039`.
- **F121** — Ajouter, déplacer, réordonner ou supprimer un module de la chaîne d'effets. Scénarios : `L06, S039`.
- **F122** — Choisir et modifier la source d'entrée audio. Scénarios : `L06, S039`.
- **F123** — Sauvegarder une chaîne d'effets personnelle. Scénarios : `L06, S039`.
- **F124** — Créer, renommer, supprimer ou mettre en favori un preset. Scénarios : `L06, S039`.

### 07 — Instruments, sampler, découpage et MIDI

- **F125** — Créer un instrument basé sur des échantillons. Scénarios : `L07, S039`.
- **F126** — Assigner des samples à des notes et à des plages de vélocité. Scénarios : `L07, S039`.
- **F127** — Créer des zones, couches et répartitions de samples. Scénarios : `L07, S039`.
- **F128** — Définir des alternances de type round-robin. Scénarios : `L07, S039`.
- **F129** — Définir des modes polyphonique, monophonique et legato. Scénarios : `L07, S039`.
- **F130** — Régler attaque, déclin, maintien et relâchement d'une enveloppe. Scénarios : `L07, S039`.
- **F131** — Régler gain et polyphonie. Scénarios : `L07, S039`.
- **F132** — Choisir lecture normale, inversée, en boucle ou ping-pong. Scénarios : `L07, S039`.
- **F133** — Segmenter un sample avec marqueurs, transitions et fondus. Scénarios : `L07, S039`.
- **F134** — Détecter automatiquement les attaques audio. Scénarios : `L07, S039`.
- **F135** — Découper un échantillon en parties égales, temps, mesures ou subdivisions. Scénarios : `L07, S039`.
- **F136** — Poser, déplacer, verrouiller ou supprimer un point de découpage. Scénarios : `L07, S039`.
- **F137** — Aligner les découpages sur un tempo ou un passage par zéro. Scénarios : `L07, S039`.
- **F138** — Affecter les tranches à des notes, touches ou cellules. Scénarios : `L07, S039`.
- **F139** — Convertir un contenu audio en représentation MIDI selon les outils disponibles. Scénarios : `L07, S039`.
- **F140** — Enregistrer des événements MIDI en précisant entrée et canal. Scénarios : `L07, S039`.
- **F141** — Éditer les notes d'un piano roll et d'une grille de pas. Scénarios : `L07, S039`.
- **F142** — Importer des banques de samples et exporter des descriptions d'instrument SFZ. Scénarios : `L07, S039`.

### 08 — Timeline, montage multipiste et automatisation

- **F143** — Démarrer, suspendre, reprendre ou arrêter une lecture de projet. Scénarios : `L08, S039`.
- **F144** — Recommencer à partir d'une position de lecture choisie. Scénarios : `L08, S039`.
- **F145** — Répéter un passage. Scénarios : `L08, S039`.
- **F146** — Créer, poser et déplacer des clips. Scénarios : `L08, S039`.
- **F147** — Organiser des pistes et des scènes. Scénarios : `L08, S039`.
- **F148** — Déplacer la tête de lecture. Scénarios : `L08, S039`.
- **F149** — Enregistrer une prise sur la timeline. Scénarios : `L08, S039`.
- **F150** — Modifier début, fin, durée et boucle d'un clip. Scénarios : `L08, S039`.
- **F151** — Découper, étirer ou replacer un clip. Scénarios : `L08, S039`.
- **F152** — Ajuster la hauteur d'une piste. Scénarios : `L08, S039`.
- **F153** — Éditer des notes MIDI, des pas et des clips texte. Scénarios : `L08, S039`.
- **F154** — Modifier les paramètres du mixage. Scénarios : `L08, S039`.
- **F155** — Mettre un effet en bypass ou le réactiver. Scénarios : `L08, S039`.
- **F156** — Créer ou modifier des points et courbes d'automation. Scénarios : `L08, S039`.
- **F157** — Annuler, rétablir ou réaligner une édition. Scénarios : `L08, S039`.

### 09 — Calendrier, agenda, alarmes et déclenchements temporels

- **F158** — Créer, éditer ou supprimer un événement ou une tâche. Scénarios : `L09, S045`.
- **F159** — Définir titre, description, lieu, date et heure. Scénarios : `L09, S045`.
- **F160** — Définir un événement sur la journée entière. Scénarios : `L09, S045`.
- **F161** — Choisir un fuseau horaire et une couleur. Scénarios : `L09, S045`.
- **F162** — Créer plusieurs calendriers ; en afficher ou masquer certains. Scénarios : `L09, S045`.
- **F163** — Programmer une alarme à une date exacte ou après un délai. Scénarios : `L09, S045`.
- **F164** — Programmer une alarme avant ou après le début ou la fin d'un événement. Scénarios : `L09, S045`.
- **F165** — Ajouter plusieurs alarmes à un même événement. Scénarios : `L09, S045`.
- **F166** — Utiliser une sonnerie intégrée ou un fichier sonore personnel. Scénarios : `L09, S045`.
- **F167** — Répéter quotidiennement, hebdomadairement, tous les quinze jours, mensuellement ou annuellement. Scénarios : `L09, S045`.
- **F168** — Choisir une fréquence personnalisée, des jours particuliers et une fin de récurrence. Scénarios : `L09, S045`.
- **F169** — Annuler une alarme sans effacer l'événement. Scénarios : `L09, S045`.
- **F170** — Faire démarrer une musique, un média, un projet ou un outil à l'heure définie. Scénarios : `L09, S045`.
- **F171** — Préparer l'ouverture d'une visioconférence à l'heure d'une alarme. Scénarios : `L09, S045`.
- **F172** — Partager un calendrier et exporter des événements ICS ou webcal. Scénarios : `L09, S045`.
- **F173** — Renseigner un profil médical, les antécédents et les allergies. Scénarios : `L09, S045`.
- **F174** — Enregistrer les vaccinations, consultations, examens, ordonnances et suivis. Scénarios : `L09, S045`.
- **F175** — Ajouter, corriger, supprimer et conserver des versions d'une entrée. Scénarios : `L09, S045`.
- **F176** — Importer un compte rendu ou un résultat d'examen. Scénarios : `L09, S045`.
- **F177** — Vérifier les valeurs extraites avant intégration. Scénarios : `L09, S045`.
- **F178** — Consulter une série de résultats dans le temps. Scénarios : `L09, S045`.
- **F179** — Exporter une série en CSV. Scénarios : `L09, S045`.
- **F180** — Enregistrer médicaments, compléments, cosmétiques et dispositifs. Scénarios : `L09, S045`.
- **F181** — Préciser dose, horaire, fréquence, période et prise « si besoin ». Scénarios : `L09, S045`.
- **F182** — Marquer une prise effectuée, reportée, oubliée ou interrompue. Scénarios : `L09, S045`.
- **F183** — Consulter l'historique des prises. Scénarios : `L09, S045`.
- **F184** — Programmer, suspendre et reprendre des rappels. Scénarios : `L09, S045`.
- **F185** — Suivre le stock et la date d'épuisement prévisible. Scénarios : `L09, S045`.
- **F186** — Rechercher des médicaments dans des données officielles françaises. Scénarios : `L09, S045`.
- **F187** — Scanner une boîte de médicament. Scénarios : `L09, S045`.
- **F188** — Importer un protocole proposé, examiner ses lignes et accepter, refuser, reporter ou corriger. Scénarios : `L09, S045`.
- **F189** — Créer un modèle de protocole à partager. Scénarios : `L09, S045`.
- **F190** — Enregistrer ressenti, humeur, énergie et fatigue. Scénarios : `L09, S045`.
- **F191** — Sélectionner des capteurs et autorisations pour la synchronisation santé. Scénarios : `L09, S045`.
- **F192** — Consulter des mesures de santé et leur évolution via les moniteurs et historiques prévus. Scénarios : `L09, S045`.
- **F193** — Parcourir des exercices de force, cardio, mobilité et gainage. Scénarios : `L09, S045`.
- **F194** — Choisir un programme ou un niveau. Scénarios : `L09, S045`.
- **F195** — Définir séries, répétitions, charges, temps de maintien et repos. Scénarios : `L09, S045`.
- **F196** — Planifier des séances sur la semaine. Scénarios : `L09, S045`.
- **F197** — Définir une progression de charge, durée ou répétitions. Scénarios : `L09, S045`.
- **F198** — Lancer, suspendre, reprendre ou terminer une séance. Scénarios : `L09, S045`.
- **F199** — Passer une étape et corriger une série. Scénarios : `L09, S045`.
- **F200** — Consulter le journal de séances et des graphiques d'évolution. Scénarios : `L09, S045`.
- **F201** — Mettre des exercices et groupes musculaires en favoris. Scénarios : `L09, S045`.
- **F202** — Visualiser les groupes musculaires sollicités. Scénarios : `L09, S045`.
- **F203** — Enregistrer une vidéo pendant un entraînement. Scénarios : `L09, S045`.
- **F204** — Configurer des cycles de respiration, durées et sons. Scénarios : `L09, S045`.
- **F205** — Construire des programmes d'objectifs avec des étapes réutilisables. Scénarios : `L09, S045`.
- **F206** — Suivre la réalisation des étapes d'un programme. Scénarios : `L09, S045`.
- **F207** — Rechercher un aliment par nom ou code-barres. Scénarios : `L09, S045`.
- **F208** — Scanner un code-barres avec la caméra. Scénarios : `L09, S045`.
- **F209** — Lire les ingrédients, allergènes et valeurs nutritionnelles disponibles. Scénarios : `L09, S045`.
- **F210** — Consulter Nutri-Score et classe NOVA lorsque les données sont présentes. Scénarios : `L09, S045`.
- **F211** — Repérer des substances ou additifs signalés. Scénarios : `L09, S045`.
- **F212** — Afficher des suggestions d'alternatives. Scénarios : `L09, S045`.
- **F213** — Créer une liste de courses. Scénarios : `L09, S045`.
- **F214** — Ajouter, modifier, cocher et décocher un produit. Scénarios : `L09, S045`.
- **F215** — Ajuster quantités et informations d'un article. Scénarios : `L09, S045`.
- **F216** — Supprimer un article ou vider les articles déjà cochés. Scénarios : `L09, S045`.
- **F217** — Partager une liste et gérer sa réception. Scénarios : `L09, S045`.
- **F218** — Accepter une liste reçue ou en conserver une copie indépendante. Scénarios : `L09, S045`.
- **F219** — Trouver un contact et l'inviter. Scénarios : `L09, S045`.
- **F220** — Ouvrir une conversation et envoyer un message. Scénarios : `L09, S045`.
- **F221** — Voir notifications et messages non lus. Scénarios : `L09, S045`.
- **F222** — Préparer ou rejoindre une visioconférence. Scénarios : `L09, S045`.
- **F223** — Envoyer un objet, une création ou une sélection d'objets. Scénarios : `L09, S045`.
- **F224** — Consulter, accepter ou refuser un partage reçu. Scénarios : `L09, S045`.
- **F225** — Conserver une copie indépendante d'une liste reçue. Scénarios : `L09, S045`.
- **F226** — Révoquer un partage. Scénarios : `L09, S045`.
- **F227** — Donner des droits de lecture, modification, création ou suppression selon le contexte. Scénarios : `L09, S045`.
- **F228** — Transférer ou présenter un objet sur une surface autorisée. Scénarios : `L09, S045`.
- **F229** — Demander un accès distant, visualiser un aperçu et transmettre certaines commandes. Scénarios : `L09, S045`.
- **F230** — Rechercher une destination. Scénarios : `L09, S045`.
- **F231** — Construire, conserver, dupliquer ou supprimer un itinéraire. Scénarios : `L09, S045`.
- **F232** — Ajouter un trajet aux favoris. Scénarios : `L09, S045`.
- **F233** — Lancer ou arrêter une navigation guidée. Scénarios : `L09, S045`.
- **F234** — Partager sa position avec un contact autorisé. Scénarios : `L09, S045`.
- **F235** — Ouvrir des pages Web et gérer des favoris. Scénarios : `L09, S045`.
- **F236** — Rechercher et lire des vidéos via les services configurés. Scénarios : `L09, S045`.
- **F237** — Rechercher films ou séries, conserver favoris et historique. Scénarios : `L09, S045`.
- **F238** — Lire une bande-annonce ou ouvrir un service de visionnage. Scénarios : `L09, S045`.
- **F239** — Ouvrir des livres EPUB/PDF non protégés et des livres audio. Scénarios : `L09, S045`.
- **F240** — Tourner les pages et reprendre une lecture à sa dernière position. Scénarios : `L09, S045`.
- **F241** — Avancer ou reculer dans un livre audio. Scénarios : `L09, S045`.
- **F242** — Rechercher de la musique et piloter lecture, pause, suivant et précédent selon le service. Scénarios : `L09, S045`.
- **F243** — Consulter ou utiliser des playlists via les services connectés. Scénarios : `L09, S045`.
- **F244** — Commander des outils existants à la voix. Scénarios : `L09, S045`.
- **F245** — Dictée, reconnaissance vocale, synthèse vocale et activation par mot-clé selon moteur et plateforme. Scénarios : `L09, S045`.
- **F246** — Transcrire un enregistrement audio. Scénarios : `L09, S045`.
- **F247** — Traduire un texte ou une transcription. Scénarios : `L09, S045`.
- **F248** — Générer une parole synthétique. Scénarios : `L09, S045`.
- **F249** — Générer ou modifier une image avec un fournisseur IA configuré. Scénarios : `L09, S045`.
- **F250** — Demander une génération audio ou vidéo à un fournisseur configuré. Scénarios : `L09, S045`.
- **F251** — Intégrer les contenus produits dans un projet. Scénarios : `L09, S045`.
- **F252** — Créer un menu, un formulaire, un lien ou un code QR. Scénarios : `L09, S045`.
- **F253** — Créer des profils de contexte et leur affecter des contenus. Scénarios : `L09, S045`.
- **F254** — Changer et personnaliser les profils. Scénarios : `L09, S045`.
- **F255** — Associer à un objet une action déclenchée par activation. Scénarios : `L09, S045`.
- **F256** — Associer à un objet une action déclenchée par appui prolongé. Scénarios : `L09, S045`.
- **F257** — Réagir à une saisie, un changement de valeur, un événement de lecture/transport ou un nouvel élément. Scénarios : `L09, S045`.
- **F258** — Déclencher manuellement une interaction. Scénarios : `L09, S045`.
- **F259** — Choisir des objets précis comme cibles. Scénarios : `L09, S045`.
- **F260** — Cibler automatiquement les objets qui satisfont des conditions. Scénarios : `L09, S045`.
- **F261** — Limiter la recherche de cibles à un projet, un parent ou certains types. Scénarios : `L09, S045`.
- **F262** — Combiner des conditions logiques ET, OU et NON. Scénarios : `L09, S045`.
- **F263** — Exécuter plusieurs actions d'outils en cascade, dans l'ordre. Scénarios : `L09, S045`.
- **F264** — Donner à chaque action des paramètres fixes ou issus de la donnée déclenchante. Scénarios : `L09, S045`.
- **F265** — Activer ou désactiver une interaction. Scénarios : `L09, S045`.
- **F266** — Autoriser une interaction selon le mode de travail (édition, consultation, performance). Scénarios : `L09, S045`.
- **F267** — Réutiliser les **vrais outils** du projet, sans moteur d'action parallèle. Scénarios : `L09, S045`.
- **F268** — Combiner une sélection avec une suite de transformations, l'ouverture d'un média, un déclenchement temporel ou une modification d'objet, lorsque les outils concernés sont disponibles. Scénarios : `L09, S045`.
- **F269** — Changer le fond d'un objet ou d'une surface. Scénarios : `L09, S045`.
- **F270** — Changer sa couleur. Scénarios : `L09, S045`.
- **F271** — Ajuster largeur et hauteur. Scénarios : `L09, S045`.
- **F272** — Régler les arrondis. Scénarios : `L09, S045`.
- **F273** — Activer et ajuster une ombre. Scénarios : `L09, S045`.
- **F274** — Appliquer un effet de fond/verre dépoli. Scénarios : `L09, S045`.
- **F275** — Changer la police du texte. Scénarios : `L09, S045`.
- **F276** — Organiser les calques et l'ordre de superposition. Scénarios : `L09, S045`.
- **F277** — Affecter des étiquettes ou des tags. Scénarios : `L09, S045`.
- **F278** — Ouvrir les panneaux des outils depuis le ruban. Scénarios : `L09, S045`.
- **F279** — Régler les matrices et leurs cellules. Scénarios : `L09, S045`.
- **F280** — Importer des médias à partir du panneau prévu. Scénarios : `L09, S045`.

## E — Ce que ce niveau de recensement ne représente pas

- Les **1296 définitions** du registre comprennent des outils internes, des commandes invisibles et des variantes de présentation : elles ne doivent pas être présentées au public comme 1296 boutons distincts.
- Les **92 types d’atomes**, **118 définitions d’activités**, **89 panneaux** et **473 nœuds de taxonomie** sont des classes et points d’entrée, pas des commandes à exécuter chacune comme une action.
- Le registre affiche aussi **40 contrats bloqués par politique** (et 69 définitions d’outils bloquées) : leur comportement correct peut être un refus explicite et non une opération exécutée.
- Certains services externes demandent configuration, abonnement ou réseau ; en leur absence, inscrire une précondition manquante, pas inventer un succès ou une anomalie fonctionnelle.
- Tout autre outil découvert à l’exécution doit être ajouté à la matrice, puis rattaché à au moins un scénario utilisateur avec mode d’emploi.

