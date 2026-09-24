# Taxonomie contextuelle — prompt d'exécution

Date : 2026-09-24
Statut : cadrage validé, **rien n'est implémenté**. Ce fichier est le prompt à suivre pour réaliser la tâche.

Sources :
- `/Users/jean-ericgodard/Desktop/Contextual Taxonomy.md` (document de cadrage de l'utilisateur, corrigé ci-dessous §3) ;
- `todo/context_menus_modes_spec_2026-09-20.md` (spec antérieure ; **sa D10 et son §3.5 sont remplacés par ce fichier** pour la règle activité/type) ;
- `/Users/jean-ericgodard/Desktop/menu solution.md` (menu racine débutant, comportements par niveau) : intégré en §2 (Q2, Q5, Q6) et §3bis. Masquage de la barre et recadrage : `todo/menu_solution_2026-09-24.md`.

---

## 1. Règles de fond (non négociables)

- **R1 — Le type d'objet est la base.** Les menus contextuels (Mystic, menu latéral) sont définis **par type d'objet**. Exemple : une vidéo a au moins Lecture ; un texte n'a pas Lecture.
- **R2 — L'activité est un embrayage, pas une dimension permanente.** Sans activité *forcée*, seul le type compte. Quand l'utilisateur force une activité (par exemple musique), elle **remplace ou modifie** les outils (`add` / `remove` / `replace`).
  - Conséquence : le comportement actuel du resolver, où l'activité courante (toujours sélectionnée au boot, DTP par défaut) écrase la composition par type, est **faux**.
- **R3 — Le niveau le plus haut est la référence.** La taxonomie par défaut est celle du niveau `advanced` (la plus complète). `intermediate` et `beginner` sont des **filtres** : ils retirent, et parfois remplacent un outil par un plus simple. Ils n'ajoutent jamais. On garde l'inclusion `beginner ⊆ intermediate ⊆ advanced`, sauf pour un remplacement déclaré.
- **R4 — L'ordre des outils est fixe.** Un ordre canonique unique est défini dans le catalogue. Un menu **ne réordonne jamais**. Les outils affichés gardent toujours le même ordre relatif, quels que soient le type, le niveau ou l'activité ; un outil masqué referme simplement le trou.
- **R5 — Le menu principal dépend du niveau seulement.** Il ne dépend ni du type, ni de la sélection, ni de l'activité, ni de la vue. Les options de vues (mute / solo… dans les listes) dépendent du niveau.
- **R6 — Immuables.** Aucune règle (`remove` / `replace` / niveau / activité) ne peut retirer un outil immuable.
- **R7 — Le niveau n'est pas une permission.** Masquer n'autorise ni n'interdit rien côté exécution. Les permissions et le mode d'usage restent les gardes. Masquer une option de vue **ne modifie jamais l'état** : une piste mutée reste mutée et visible comme telle.

## 2. Décisions prises (24/09/2026)

| # | Sujet | Décision |
|---|---|---|
| Q1 | Mystic immuable | **5 fixes** : **IA au centre** + Find, Record, Dashboard, Communication (la croix actuelle). Position des bras : celle déjà définie dans `menus.mystic.base`, ne pas la réinventer. |
| Q2 | Menu principal (corrigé avec « menu solution ») | Racine `advanced`, dans cet ordre : **Organiser, Capturer, Créer, Trouver, Communiquer**, puis **Vue, Mode d'exécution, Activité**. Racine `beginner` = **les 5 premières, jamais plus de 5**. **Organiser** est le nom officiel du bouton qui ouvre le **Dashboard** ; il existe à tous les niveaux. Le **Temps** (calendrier, alarmes…) s'atteint depuis le Dashboard : ni Dashboard ni Temps ne sont des racines. « Record » = **Capturer** (photo / vidéo / audio). **Aide et Accueil ne sont pas dans le menu principal.** |
| Q3 | Mystic texte, base `advanced` | Immuables + **Avant/Arrière, Couleur, Supprimer, Copier/Coller**. Pas de Taille (elle reste au menu latéral). |
| Q3b | Mystic vidéo, base `advanced` | Immuables + **Avant/Arrière, Supprimer, Copier/Coller, Lecture**. Rien d'autre tant que ce n'est pas défini. |
| Q5 | Réglage du niveau | Il reste avec les autres réglages, dans **la fiche de l'utilisateur : Contact → Préférences → Niveau d'expertise**. L'onglet existe déjà (Débutant / Intermédiaire / Confirmé = `beginner` / `intermediate` / `advanced`). Aucune entrée dédiée dans le menu principal. Le chemin Communiquer → Contact → sa fiche reste accessible **à tous les niveaux**. L'Aide et l'Assistant passent par Mystic (centre IA). |
| Q6 | Comportements par niveau | Réglables dans le JSON et l'éditeur (bloc `behaviors`), pas codés en dur. *(Choix par défaut, modifiable.)* |
| Q7 | Intégration de l'éditeur | **Dans l'app desktop Tauri, en mode dev uniquement** (`npm run tauri:dev`). Commande Rust `save_taxonomy` compilée seulement en debug (`#[cfg(debug_assertions)]`), donc absente structurellement des builds release, web, iOS et AUv3. Le panneau d'édition ne se charge que si cette commande existe. |
| Q8 | Copier/Coller, Avant/Arrière | **Avant/Arrière = 1 outil** : la palette `z_order` existante, avec 4 enfants (monter, descendre, premier plan, dernier plan). Ses enfants sont filtrables par niveau. **Copier et Coller = 2 outils séparés.** **Coller : clic = colle directement la dernière copie ; appui long = historique des copies** (le panneau `ui.paste.panel` actuel), pour choisir laquelle coller. |
| Q9 | Forcer une activité | L'outil **Activité** est dans le **menu principal pour `intermediate` et `advanced`** (Q2). Il est aussi dans **Mystic ouvert sur le fond du projet courant** (composition `project`), pour pouvoir forcer une activité sans passer par le menu principal. La palette Activité commence par un choix **« Automatique » (aucune activité forcée)**, qui est l'état par défaut. Choisir une activité l'embraye ; « Automatique » ou re-toucher l'activité active la débraye. L'état forcé est **mémorisé par projet** : on le retrouve en rouvrant le projet, et un nouveau projet démarre en Automatique. |
| Q10 | Options de la vue Liste | Tableau §3ter validé, à affiner à l'usage. Seule la **Liste** est gouvernée pour l'instant. |
| Q11 | Ordre canonique | **L'éditeur permet de définir l'ordre canonique des outils** (monter / descendre, ou glisser, dans la liste du catalogue). Cet ordre est **unique** : il est le même quels que soient l'activité, le niveau et le type ; seuls les outils affichés changent (R4). |
| Q4 | Fichier de données | On **fait évoluer** `eVe/intuition/menu/context_menus.json`, avec son loader, son validateur et son resolver. **Pas de `taxonomy.json` séparé.** |

## 3. Corrections apportées au document Desktop

1. **Ordre (R4).** Absent du document ; il faut l'ajouter au catalogue.
2. **Niveaux.** Au lieu d'une liste complète par niveau, `advanced` = liste de référence et les niveaux inférieurs = retraits/remplacements. Identifiants du code : `beginner` / `intermediate` / `advanced`, pas `confirmed` / `expert`.
3. **Activité.** §5 du document l'empile systématiquement. Elle ne s'applique qu'en cas d'activité **forcée** (R2), et peut remplacer.
4. **Mystic.** Le centre IA est immuable (Q1), en plus des 4 bras.
5. **Fichier.** `context_menus.json`, pas `taxonomy.json` (Q4). La passerelle `saveTaxonomy` ne connaît que ce chemin.
6. **Vues.** Ajouter un bloc `views` (options par vue et par niveau, par exemple mute des listes) (R5).
7. **Menu principal.** Remplacé par Q2 : les 5 intentions de « menu solution » + Vue / Mode / Activité en avancé.
8. **Point conservé tel quel :** catalogue unique et références par id, base + add/remove, éditeur DEV-only, passerelle d'écriture limitée, diff, écriture atomique, sauvegarde de la version précédente, **aucun identifiant GitHub dans atome**, pas de push depuis l'éditeur, écriture absente du build public (protection structurelle, pas un bouton caché).

## 3bis. Menu racine et comportements par niveau (source : « menu solution.md »)

Principe directeur : la racine ne montre pas tout ce qu'atome sait faire, seulement les **intentions humaines essentielles** (Organiser — Capturer — Créer — Trouver — Communiquer). Tout le reste est contenu dans ces intentions, contextuel via Mystic, ou révélé selon le niveau.

1. **Les enfants des palettes sont filtrés aussi**, pas seulement les racines.
   - Exemple : **Créer** en `beginner` n'affiche que **Texte** et **Dessin** ; mise en page, image, code, générateurs… apparaissent aux niveaux supérieurs.
   - **Capturer** reste immédiat : photo / vidéo / audio, sans passer par Créer ni Importer.
   - Le modèle (étape 1) et l'éditeur (étape 3) descendent donc dans les palettes du menu principal.
2. **Hors de la racine `beginner`** : Assistant, Aide, Préférences, Profil, modes de vue, modes d'exécution / consultation / édition, fonctions avancées, commande de masquage.
3. **Mystic ne porte aucune commande système.** Pas de masquage de la barre, pas de préférences. Le validateur (étape 1) refuse une telle référence dans `menus.mystic`.
4. **Bloc `behaviors` par niveau** (Q6), avec des valeurs simples. Exemples :
   - `default_view_mode` (`list` en `beginner`) ;
   - `menu_recall` (`visible_marker` en `beginner`, `invisible_zone` en `advanced`) ;
   - `auto_reframe` (vrai en `beginner`) ;
   - `gesture_shortcuts` (vrai à partir de `intermediate` ou `advanced`).
   
   Il est lu par le moteur (étape 2) et réglé dans l'éditeur (étape 3). Les comportements eux-mêmes sont réalisés dans `todo/menu_solution_2026-09-24.md`.

## 3ter. Options de la vue Liste par niveau (Q10)

| Option | beginner | intermediate | advanced |
|---|---|---|---|
| Sélection, ouvrir/fermer, entrer/revenir de niveau, renommer, aperçu, réordonner | ✅ | ✅ | ✅ |
| Bouton mute (M) de la ligne | — | ✅ | ✅ |
| Bascule mute ↔ solo (S) | — | — | ✅ |
| Mix groupé : tout / aucun | — | ✅ | ✅ |
| Force du mix (curseur %) | — | — | ✅ |
| Édition de clip (poignées début/fin) | — | ✅ | ✅ |
| Menu de ligne (appui long → Mystic filtré par type et niveau) | ✅ | ✅ | ✅ |

Rappel R7 : masquer un contrôle ne change jamais l'état. Une piste mutée reste mutée et reste signalée en débutant.

Sources :
- `domains/rendering/project_view_list_content.js` (intentions l.352-457) ;
- `intuition/runtime/bevy_panel/bevy_panel_selectable_list_fixed_row.js` (`_mute`) ;
- `domains/rendering/project_view_mix_controls.js` (mute / solo / all / none, `project_view_mix_strength`).

## 4. Audit : Find → Tools liste de faux outils (mesuré le 24/09)

Mesures faites sur l'app réelle (port 3001, invité) via `window.atome.tools.v2Registry.listTools()` et `loadToolRecordsFromDatabase()`.

- **Chaîne.** `eVe/intuition/tools/finder_data_sources.js` `loadToolRecordsFromDatabase` fusionne deux sources :
  - les atomes persistés `tool` / `panel` / `tool_macro` ;
  - `mergeFinderToolRecordsWithRegistry`, qui ajoute **tout** le registre v2 (`listTools({ includeDisabled: true })`).
- **Filtre sans critère d'interface.** `isStrictToolRecord` (`finder_record_projection.js:40`) exige seulement un `tool_id` et un `tool_key`. `isToolRecordVisibleInToolsScope` (l.61) en est un alias.
- **`visibility: 'hidden'` est ignoré** alors qu'il est déclaré dans `core/tool_runtime_bootstrap_defs_a.js` / `_b.js`. En invité, sur 60 entrées affichées, une vingtaine sont `hidden` :
  - `ui.palette.open/close/hide/reveal` ;
  - `ui.item.enable/disable` ;
  - `ui.undo.action` ;
  - `ui.placeholder.duration.apply` / `max_chars.apply` ;
  - `ui.orientation.set` ;
  - `ui.*.panel`.
  
  Connecté, le registre grossit (environ 120 définitions de base) ; `ui.record.actions.replay/template` (marqués `hidden`) apparaissent aussi.
- **Doublons.** Par exemple `tool.main.delete` et `ui.delete.panel`, ou `tool.main.paste` et `ui.paste.panel`.
- **Libellés techniques ou anglais :** « Delete Panel », « text_create », « Disable Tool Item », « Set Orientation ».
- **Pas de correspondance 1:1** entre les clés de menu (`play`, `z_order`, `capture`, `create`, `time`, `view`, `copy`…) et les `tool_id` du registre. Plusieurs sont des palettes ou des entrées de menu sans outil de registre reconnaissable.

**Conclusion.** Il manque la notion d'**outil exposable** : un outil qui a une interface et peut apparaître comme bouton dans le menu principal, Mystic ou le menu latéral (et à terme être déplacé). Elle doit servir à la fois de filtre pour Find et de catalogue pour l'éditeur.

## 5. Travail à réaliser, dans l'ordre

### ✅ Étape 0 — Catalogue d'outils exposables + Find assaini (priorité 1)

> **Fait le 2026-09-24.**
> - Critère retenu : **atteignabilité depuis une surface**, pas `visibility`. Ce champ sert seulement à la boîte à outils générée ; dupliquer, rétablir et les captures sont `hidden` alors que ce sont de vrais boutons.
> - Code : `eVe/intuition/tools/core/exposable_tools.js` ; `finder_data_sources.js` `selectExposableToolRecords` / `loadExposableToolRecords` ; branché dans `bevy_panel_finder_data.js` (scope `tools`).
> - `loadToolRecordsFromDatabase` est laissé entier pour le sélecteur de liaison MIDI.
> - Mesure en app réelle (invité, espace de travail) : **161 → 74 outils**, 0 doublon, noms = libellés des boutons.
> - Sonde : `temp/finder_tools_scope_probe.mjs` (verte).
> - Table : `maps/TOOL_SURFACE_MAP.md`, avec les écarts (outils atteignables absents du registre, clés sans `tool_id`).

- **Critère.** `visibility !== 'hidden'` **et** au moins une des deux conditions :
  - l'outil est référencé par une surface (catalogue de `context_menus.json`, contenu du menu principal `main_menu_content_runtime.js`, rail) ;
  - l'outil porte un marqueur explicite (par exemple `ui.surface: true` dans sa définition).
- Écrire **une seule fonction** `isExposableTool(def)` et l'utiliser dans `isToolRecordVisibleInToolsScope` **et** dans le merge du registre (`mergeFinderToolRecordsWithRegistry` applique aujourd'hui seulement `isStrictToolRecord`).
- Dédoublonner une fonction exposée sous deux ids : garder l'id canonique, l'autre devient alias.
- Libellés : `ui.label_key` traduit via `eveT`, jamais de nom technique.
- Produire la **table clé de menu ↔ `tool_id` canonique** (fichier dans `maps/` ou section du JSON). C'est elle que lit l'éditeur.
- **Vérification :** sonde `temp/finder_tools_scope_probe.mjs`. Elle liste le résultat Find avant/après, en invité **et** connecté, et vérifie les trois points suivants :
  - aucune entrée `hidden` ;
  - aucun doublon ;
  - chaque bouton réellement visible dans les trois menus est présent.

### ✅ Étape 1 — Modèle de données (`context_menus.json` v2)

> **Fait le 2026-09-24.**
> - Format retenu : chaque table (type d'objet, racines et enfants du menu principal, `minLevels`, `views.list`) associe une clé à son **niveau minimum**. La table complète = `advanced` ; l'inclusion débutant ⊆ intermédiaire ⊆ avancé est donc garantie par construction, et c'est directement ce que les cases à cocher de l'éditeur manipuleront.
> - `order` = ordre canonique unique (52 commandes). Les activités deviennent des surcharges `add` / `remove` / `replace` (par projet et par type).
> - Validateur v2 (`context_menus_loader.js`) : ids, ordre complet, niveaux, immuables jamais retirés, contradictions add/remove, aucune commande `system` dans Mystic, ≤ 5 racines débutant, catalogue de rendu.
> - Niveau par défaut = `advanced` (`user_visual_preferences_model.js`). Ancienne version sauvegardée dans `temp/context_menus_v1_backup.json`.

Structure cible (identifiants seulement, libellés via `labelKey`) :
- **`catalog`** : pour chaque outil, `{ order, labelKey, tool_id, … }`. L'**`order` global** fait foi pour tous les menus (R4).
- **`menus.main`** : `advanced` = les 8 racines de Q2, **avec leurs enfants de palette** ; `intermediate` / `beginner` = `remove` / `replace`, sur les racines **et** les enfants (§3bis.1).
- **`behaviors.<level>`** : comportements par niveau (§3bis.4).
- **`menus.mystic`** :
  - `immutable` = centre IA + 4 bras (Q1) ;
  - `objects.<kind>.advanced` = base ;
  - `objects.<kind>.intermediate|beginner` = filtres ;
  - `activities.<id>` = `add` / `remove` / `replace` appliqués seulement si l'activité est forcée.
- **`menus.sidebar`** : même forme (catalogue détaillé défini plus tard).
- **`views.list.options`** : rempli d'après §3ter (Q10). Clés proposées :
  - `select`, `toggle`, `navigate`, `rename`, `preview`, `reorder` ;
  - `mute`, `solo`, `mix_all_none`, `mix_strength` ;
  - `clip_edit`, `row_menu`.
- **Coller (Q8)** : `paste` porte deux actions dans le catalogue, `tap` = coller la dernière copie et `long_press` = historique des copies.
- **Validateur (`context_menus_loader.js`)** — il vérifie :
  - que les ids existent dans le catalogue ;
  - qu'aucun immuable n'est retiré ;
  - que les niveaux sont inclus les uns dans les autres (hors `replace` déclaré) ;
  - l'absence de doublons ;
  - les contradictions (`add` et `remove` du même outil) ;
  - qu'un `order` existe pour chaque outil ;
  - qu'aucune commande système n'est référencée dans `menus.mystic` (§3bis.3) ;
  - que la racine `beginner` de `menus.main` compte au plus 5 entrées.
- Migration : convertir le contenu actuel (compositions par kind et par `activity:*`) vers ce format, puis appliquer Q3 / Q3b.

### ✅ Étape 2 — Moteur (resolver) et branchements

> **Fait le 2026-09-24.**
> - Resolver : type → activité forcée → niveau → immuables → permissions → ordre canonique.
> - Menu principal : racine **Organiser** (`tool.main.organize`, ouvre et ferme le Dashboard) ; racines et enfants filtrés par niveau (`resolveMenuLevelVisibility`).
> - Palettes filtrées par niveau dans Mystic et le rail (z-order : 2 choix en débutant).
> - Activité forcée : `forced_activity_state.js`, choix « Automatique » (`ui.activity.automatic`), re-toucher = débrayer, propriété projet `forced_activity` restaurée sur `squirrel:project-changed`.
> - Coller : le menu principal faisait **déjà** clic = coller / appui long = historique. Ajouté : l'appui long dans le rail (`long_press_tool_id`) et dans Mystic (événement natif `long_press` + minuterie d'immobilité 6 px / 600 ms).
> - Liste : `project_view_list_options.js` ; mute / solo / tout-aucun / force / édition de clip gardés par niveau ; indicateur inerte sur une ligne mutée ; redessin au changement de niveau ou d'activité.
> - Sondes : `temp/contextual_taxonomy_matrix_probe.mjs` (330 cas) et `temp/taxonomy_real_app_probe.mjs` (19 contrôles, app réelle, vrais gestes).

- `eVe/intuition/menu/context_menu_resolver.js` `resolveContextMenu`, dans cet ordre :
  1. surcharge du mode (consultation / exécution, inchangé) ;
  2. base du type à `advanced` ;
  3. activité si **forcée** (R2) ;
  4. filtre du niveau (R3) ;
  5. immuables réinjectés ;
  6. applicabilité et permissions (retirent seulement) ;
  7. **tri par `order` du catalogue** (R4).
- **Activité forcée (Q9).**
  - Aujourd'hui `activityState.currentActivityId` est toujours rempli au boot (`intuition/tools/activities.js` `applySelectedActivity`, qui prend la première activité à défaut). Il faut un état explicite « Automatique » (aucune activité forcée), qui est l'état **par défaut**.
  - Le resolver ne lit l'activité que dans l'état forcé.
  - Ajouter l'enfant « Automatique » en tête de la palette Activité (`payload.activity.children` dans `activities.js`), et la bascule au re-toucher.
  - Ajouter l'entrée Activité à la composition Mystic `project` (fond du projet). Ce n'est pas une commande système : elle est autorisée dans Mystic.
  - Un indicateur discret sur le bouton Activité montre qu'une activité est forcée.
  - **Persistance par projet** : l'activité forcée (ou « Automatique ») est enregistrée avec le projet et restaurée à son ouverture. S'appuyer sur la portée `project` déjà gérée par `activities_runtime.js` (`persistScopedDesktopState` / `restoreProjectDesktopState`). Ne plus se servir du choix global persistant `api.activities.setCurrent(..., persist)` pour l'embrayage.
- **Coller (Q8).**
  - Clic = coller directement la dernière copie ; appui long = historique (`ui.paste.panel`). *(Constat corrigé le 24/09 : le menu principal le faisait déjà ; seuls Mystic et le rail manquaient.)*
  - Brancher les deux gestes dans le menu principal, Mystic et le rail.
  - Vérifier que l'appui long sur une tuile Mystic n'entre pas en conflit avec le relâcher-pour-activer de Mystic (`bevy_ui_mystic_runtime.js` `releaseAt`).
- **Menu principal.** `intuition/ribbon/bevy_ui_main_menu_runtime.js` (`menuOptions` → `buildBevyMainMenuItems`) filtre `toolbox.children` selon `menus.main` + niveau. Il se recompose sur `eve:profile-preferences-updated` (aujourd'hui seule la latéralité est lue, `intuition/menu/menu_work_context.js`).
- **Vues.** `resolveViewOptions(view, context)`. Brancher `domains/rendering/project_view_mix_controls.js` : ne pas construire l'option masquée **et** ignorer le hit-test du nœud `_mute` masqué (l.168). Brancher aussi `intuition/runtime/bevy_panel/bevy_panel_selectable_list_fixed_row.js` (bouton `_mute`, l.69), en gardant l'indication d'état (R7).
- Mystic (`mystic_context_items_runtime.js`) et rail (`atome_contextual_rail_model_runtime.js`) consomment déjà le resolver : vérifier seulement.

### ✅ Étape 3 — Éditeur DEV de taxonomie + passerelle d'écriture

> **Fait le 2026-09-24** (vérification finale de l'écriture réelle : à faire dans `npm run tauri:dev`, voir plus bas).
> - Rust : `platforms/desktop-tauri/src/taxonomy_editor.rs`, commandes `taxonomy_read` / `taxonomy_save`. **Le code d'écriture n'existe qu'en debug** ; en release ce sont des bouchons qui renvoient `taxonomy_editor_unavailable`. Chemin unique = le fichier SOURCE `eVe/intuition/menu/context_menus.json` (depuis `CARGO_MANIFEST_DIR`, jamais une copie `target/`).
> - Avant écriture : JSON valide, clés requises, `version: 2`, **refus si le fichier a changé sur disque** depuis l'ouverture. Sauvegarde horodatée **hors du dépôt** (`$TMPDIR/atome_taxonomy_backups/`, pas de bruit Git), puis écriture atomique (`.tmp` + rename).
> - Permissions : `permissions/taxonomy-editor.toml` + `capabilities/default.json`.
> - JS : `eVe/intuition/dev/taxonomy_editor/` — `taxonomy_editor_model.js` (pur : cases par niveau, surcharges d'activité, ordre, diff, validation par le vrai validateur), `taxonomy_editor_bridge.js`, `taxonomy_editor_panel.js` (panneau Bevy). Appliquer = valider → écrire → remplacer la taxonomie en mémoire et prévenir les menus, sans redémarrer.
> - Ouverture : bouton « Taxonomie (dev) » à la fin de Contact → sa fiche → Préférences, rendu seulement si `taxonomy_read` répond (`__eveTaxonomyEditorAvailable`).
> - **Écart assumé sur l'empaquetage** : `eVe/intuition/dev/` n'est pas retiré des bundles. La garantie est structurelle côté Rust (aucun code d'écriture en release) ; le module JS est inerte sans la commande de debug. Modifier les trois empaqueteurs (bundle Tauri, `apk.sh`, `package_ios_runtime.mjs`) n'ajoutait aucune sécurité.
> - Sondes : `temp/taxonomy_editor_model_probe.mjs` (modèle) ; `temp/taxonomy_real_app_probe.mjs` (panneau dans l'app réelle avec une passerelle simulée qui n'écrit rien).

- **Intégration (Q7) : Tauri, mode dev uniquement.**
  - Commande Rust `save_taxonomy` dans `platforms/desktop-tauri`, sous `#[cfg(debug_assertions)]`, enregistrée dans `invoke_handler` seulement en debug.
  - Côté JS, on y accède par `getTauriInvoke`. Le panneau d'édition (Bevy, dans `eVe/intuition/dev/taxonomy_editor/`) ne se charge que si la commande répond. Ailleurs (web, iOS, AUv3, release), le module n'est jamais importé.
  - **Chemin écrit = le fichier SOURCE du dépôt** `eVe/intuition/menu/context_menus.json`, résolu depuis `CARGO_MANIFEST_DIR`. Jamais la copie figée `target/debug/eVe`, que `tauri dev` sert au lieu des sources (mémoire « squirrel lit une copie figée d'eVe »).
  - Après écriture, recharger la taxonomie en mémoire sans redémarrer, et synchroniser la copie servie.
  - Respecter `scripts/check_tauri_fs_boundary.mjs` : commande dédiée, pas d'accès fichier générique.
  - Exclure `eVe/intuition/dev/` des packagings publics.
  - **Ouverture** : un bouton « Taxonomie » dans la fiche Contact → Préférences, rendu **seulement si `save_taxonomy` répond** (`tauri dev`). En release, web, iOS et AUv3, le bouton n'existe pas et le module n'est jamais importé.
- **Interface :**
  - sélecteurs Menu [Main | Mystic | Sidebar] / Type d'objet / Niveau / Activité forcée [Aucune | …] / Vue ;
  - les sélecteurs sans objet sont désactivés (Main → seul Niveau actif) ;
  - **édition de l'ordre canonique (Q11)** : dans la vue « Catalogue », monter / descendre ou glisser un outil. Cela réécrit les `order` du catalogue. L'ordre est unique pour toutes les activités, tous les niveaux et tous les types ; le diff montre les déplacements ;
  - la liste des outils **toujours dans l'ordre du catalogue**, avec recherche, cases à cocher et origine de chaque règle (`IMMUTABLE` / `BASE` / `LEVEL` / `ACTIVITY` / `VIEW`) ;
  - les immuables sont visibles, non décochables ;
  - un remplacement se fait par « remplacer par… » ;
  - pré-remplissage avec la taxonomie en vigueur ;
  - la liste des outils proposés = catalogue exposable de l'étape 0 (pas de liste maintenue à la main).
- **Écriture :**
  - une commande dédiée `saveTaxonomy(data)`, jamais un `writeFile(path)` générique ;
  - la couche privilégiée (Fastify dev ou Tauri) connaît **le seul** chemin `eVe/intuition/menu/context_menus.json` ;
  - avant d'écrire : validation (étape 1) et **diff lisible** (par exemple `MYSTIC / TEXT  + color  - tool_x`) ;
  - écriture atomique et sauvegarde de la version précédente.
- **DEV-only structurel** : éditeur et passerelle exclus du build public (pas un bouton caché).
- Aucun credential ni token GitHub, pas de push. Git voit un fichier modifié ; **l'utilisateur commit et push lui-même**.

### ✅ Étape 4 — Données initiales

> **Fait le 2026-09-24.** Base `advanced` = taxonomie v1 convertie automatiquement (aucun palier inventé : les niveaux minimum reprennent exactement les anciens `levelVisibility`). Décisions appliquées : Q3/Q3b (texte, vidéo), Mystic projet + Activité (tous niveaux), z-order 2 choix en débutant, racines Q2, Créer en débutant = Texte + Dessin (code, page, placeholder et générateur à partir d'intermédiaire, **brouillon à ajuster dans l'éditeur**), options Liste §3ter. Les surcharges d'activité sont la conversion des anciennes compositions `activity:*` en `add` : **brouillon**, à affiner dans l'éditeur.

- Base `advanced` = taxonomie actuelle convertie, avec Q2 / Q3 / Q3b appliqués.
- Paliers `intermediate` / `beginner` : l'utilisateur les règle dans l'éditeur. Ne pas les inventer, sauf une proposition marquée « brouillon ».

### ✅ Étape 5 — Vérification bout en bout

> **Fait le 2026-09-24**, toutes les sondes vertes :
> - `temp/finder_tools_scope_probe.mjs`, `temp/contextual_taxonomy_matrix_probe.mjs` (330 cas), `temp/taxonomy_editor_model_probe.mjs` ;
> - `temp/taxonomy_real_app_probe.mjs` : **23/23**, en headless **et** en fenêtre visible (`HEADLESS=0`), captures dans `temp/probe_reports/taxonomy_real_app/` ; le menu principal est lu sur l'arbre **monté** (une première version qui relisait le modèle masquait un vrai défaut : l'arbre dessiné ignorait le niveau, corrigé dans `bevy_ui_main_menu_model.js`) ;
> - Rust : `cargo check` debug et release OK ; `cargo test --lib taxonomy_editor` 3/3 (sans la feature Bevy : un test préexistant du backend Bevy ne compile plus, `menu_plane` manquant dans `AtomeRenderNode`, sans rapport avec ce chantier).
> - **Reste à faire par l'utilisateur** : l'écriture réelle dans `npm run tauri:dev`. Ouvrir Contact → sa fiche → Préférences → « Taxonomie (dev) », cocher une case, Appliquer, puis vérifier `git status` (seul `eVe/intuition/menu/context_menus.json` doit changer) et la sauvegarde dans `$TMPDIR/atome_taxonomy_backups/`.

- **Sonde Node**, en important l'entrée du resolver (pas seulement `node --check`), sur la matrice menu × type × niveau × activité forcée. Elle vérifie :
  - que les immuables sont toujours présents ;
  - que l'ordre relatif est identique partout (R4) ;
  - l'inclusion des niveaux ;
  - que le menu principal est invariant au type et à l'activité (R5) ;
  - que texte et vidéo sont conformes à Q3 / Q3b.
- **Sonde Playwright sur l'app réelle** (serveur 3001, « Essayer ») :
  - changer le niveau → vérifier le menu principal, Mystic sur texte et vidéo, le mute de la vue Liste ;
  - forcer une activité → vérifier le changement, puis revenir à « aucune » → retour au type ;
  - lire `report.json` et les PNG.
- Éditeur : ouvrir → modifier → diff → Apply → `git status` montre `context_menus.json` modifié.
- Ne pas lancer la suite de tests du repo ; uniquement ces sondes.

## 6. Points ouverts (à trancher avant l'étape concernée)

- ~~O1~~ — **Fermé (Q7)** : Tauri, mode dev uniquement.
- ~~O1b~~ — **Fermé** : l'éditeur s'ouvre par un **bouton dans Préférences** (fiche Contact → Préférences), **visible seulement en `tauri dev`**, c'est-à-dire quand la commande `save_taxonomy` existe.
- ~~O2~~ — **Fermé (Q5)** : Aide et Assistant via Mystic ; niveau via Contact → sa fiche → Préférences.
- ~~O3~~ — **Fermé (Q8)** : z-order = 1 palette ; Copier et Coller séparés ; appui long sur Coller = historique.
- ~~O3b~~ — **Fermé** : en débutant, Avant/Arrière montre **2 choix** (premier plan, dernier plan). Monter et descendre d'un niveau sont réservés à `intermediate` et `advanced`.
- ~~O4~~ — **Fermé (Q2)** : Record = Capturer (`capture`) ; Temps n'est plus une racine, on l'atteint via le Dashboard (Organiser).
- ~~O5~~ — **Fermé (Q9)** : menu principal (intermédiaire et avancé) + Mystic sur le fond du projet ; choix « Automatique ».
- ~~O5b~~ — **Fermé** : l'activité forcée est **mémorisée par projet**. On la retrouve en rouvrant le projet, et un nouveau projet démarre en « Automatique ».
- ~~O5c~~ — **Fermé** : le **débutant a aussi Activité dans Mystic sur le fond du projet** (à tous les niveaux). C'est son seul accès, puisque le menu principal ne l'a qu'en intermédiaire et avancé.
- ~~O6~~ — **Fermé (Q10)** : tableau §3ter, Liste seulement, à affiner à l'usage.

## 7. Critères d'acceptation

1. Find → Tools ne liste que des outils exposables, sans `hidden`, sans doublon, avec des libellés traduits.
2. Mystic affiche toujours ses 5 immuables.
3. Texte → Avant/Arrière, Couleur, Supprimer, Copier/Coller ; vidéo → Avant/Arrière, Supprimer, Copier/Coller, Lecture.
4. Sans activité forcée, seul le type d'objet détermine les outils contextuels.
5. Une activité forcée modifie les outils ; revenir à « aucune » restaure ceux du type.
6. Changer de niveau change réellement l'affichage (menu principal, Mystic, menu latéral, options de vues) ; un niveau inférieur n'ajoute jamais d'outil.
7. L'ordre relatif des outils affichés est identique dans tous les contextes.
8. Le menu principal ne change qu'avec le niveau.
9. Masquer mute ne modifie pas l'état des pistes.
10. La racine débutante du menu principal = Organiser, Capturer, Créer, Trouver, Communiquer (≤ 5). Créer en débutant = Texte, Dessin. Organiser ouvre le Dashboard à tous les niveaux.
11. Le niveau reste modifiable à tous les niveaux via Communiquer → Contact → sa fiche → Préférences → Niveau d'expertise.
12. Mystic ne contient aucune commande système.
13. Coller : un clic colle la dernière copie ; un appui long ouvre l'historique des copies.
14. Mystic sur le fond du projet propose Activité à tous les niveaux, débutant compris. En débutant, Avant/Arrière n'offre que premier plan / dernier plan. Le bouton Préférences → Taxonomie n'apparaît qu'en `tauri dev`.
15. La palette Activité commence par « Automatique », qui est l'état par défaut. Une activité se force depuis le menu principal (intermédiaire et avancé) et depuis Mystic sur le fond du projet.
16. Les options de la vue Liste suivent §3ter selon le niveau.
17. L'ordre canonique se modifie dans l'éditeur, et le nouvel ordre s'applique à l'identique dans tous les menus, niveaux et activités.
18. L'éditeur et `save_taxonomy` n'existent que dans `tauri dev`. Ils écrivent le fichier source du dépôt, pas la copie `target/`.
19. L'éditeur valide, montre le diff, écrit seulement `context_menus.json` de façon atomique et garde la version précédente ; il est absent du build public ; aucun secret GitHub dans atome.

## 8. Retours UI du 25/09 (faits)

1. **Premier affichage au bon niveau** : le menu principal affichait toutes les racines puis filtrait. Correctifs : dernier niveau connu mémorisé localement et lu de façon synchrone (`eVe/intuition/menu/visual_level_cache.js`), et publication de `preferences.visual` pendant la lecture du profil déjà faite au démarrage (`workspace_surface_preference.js`). Sonde : premier arbre monté après rechargement = 5 racines.
2. **Poignée « atome »** : glyphe à la couleur de marque (`MYSTIC_CENTER_TINT`, comme le centre de Mystic). Vérifié sur les pixels : (201, 12, 125).
3. **Organiser** : nouvelle icône `atome/src/assets/images/icons/organize.svg` (agenda), aussi utilisée par la tuile Dashboard de Mystic. `grid.svg` corrigé au passage : il manquait `width`/`height`, ce qui le dessinait en petit point.
4. **Survol pendant un appui maintenu sur une palette** : le moteur de pointeur annonce `hover`/`hover_leave` à l'enfant sous le doigt (`bevy_ui_pointer_runtime.js`). L'enfant survolé passe en cyan (`interaction.hovered`, `elements/skin/tool_skin.js`), recopié sur la coque de l'outil. Relâcher sur la palette elle-même ne choisit rien.

Sonde app réelle : 31/31 en fenêtre visible (`temp/probe_reports/taxonomy_real_app/palette_hover.png`).

## 9. « Tout sélectionner » dans le rail du projet (25/09, fait)

- Taxonomie : nouvelle commande `select_all` (ordre canonique : après Annuler/Rétablir), placée dans `menus.sidebar.objects.project` (dès débutant), **pas** dans Mystic.
- Le rail du fond de projet lit désormais la composition **sidebar** `project` (`project_background_rail_runtime.js` passe `menu: 'sidebar'` ; `mystic_context_items_runtime.js` accepte ce menu). Cette composition reprend ce que le rail montrait jusqu'ici, plus `select_all` ; elle est réglable dans l'éditeur.
- Action : `tool.main.select_all` → `eVe/intuition/tools/select_all_tool.js`. Il sélectionne tous les atomes sélectionnables de la scène du projet, par la règle du lasso (`collectProjectSceneSelectableAtoms`), via `applySelectionBatch(ids, 'replace')`.
- Sonde app réelle : 34/34. Toucher le fond → rail avec « tout sélectionner » → toucher → les atomes du projet sont sélectionnés ; absent de Mystic.
