# 0 — finalise-features : audit dépôt (§1) + plan d'exécution

> Produit par la passe « Repository-first audit » exigée par `todo/0 -finalise-features.md` §1.
> Date : 2026-08-15. Rien n'a été modifié pendant cette passe.

---

## A. Résultat de l'audit (§1)

### §2 — Framework de thème « Elastic »

**Le nom « Elastic » ne correspond à aucun module de thème du dépôt.**

Ce qui existe réellement, ce sont **trois systèmes de tokens parallèles** :

| Système | Fichiers | Portée observée |
|---|---|---|
| `look` | `eVe/elements/look/tokens.js` (`eveTokens`), `tool_theme.js` (`eveToolTheme`), `eve_presets.js`, `base_preset.js`, `css_preset.js`, `matrix_preset.js`, `goey_menu_preset.js` + `goey_menu_vars.js`, `preset_chrome.js`, `preset_controls.js`, `utility_presets.js` | toolbox, menu goey, matrix, chrome de panneaux |
| `skin` | `eVe/elements/skin/tokens.js`, `assistant_skin.js`, `button_skin.js`, `dashboard_skin.js`, `panel_skin.js`, `tool_skin.js` | assistant, dashboard, boutons, panneaux |
| `system_ui` | `eVe/elements/system_ui_tokens.js` | tokens UI système |

`eVe/intuition/tools/elastic_slider.js` / `elastic_slider_visual.js` sont un **widget slider**, pas le thème — le mot « elastic » y désigne le comportement du curseur.

→ **Ambiguïté bloquante pour le libellé de §2.** Hypothèse retenue pour avancer : « Elastic » = le nom cible du système unifié, et le travail de §2 est **l'unification `look` + `skin` + `system_ui` en une source unique + le remplacement des valeurs visuelles en dur**. Cette hypothèse est à confirmer ; elle ne bloque pas l'audit des valeurs en dur, qui est fait dans tous les cas.

### §3 — Toolbox

SSOT bien identifiée, pas de système dupliqué :

- normalisation : `eVe/intuition/tools/core/tool_definition_ssot.js`
- définitions (~110 outils) : `tool_runtime_bootstrap_defs_a.js` + `tool_runtime_bootstrap_defs_b.js`
- résolution d'exécuteur : `tool_runtime_executor_resolver.js` (21 modes `v2_*` + `V2_REGISTERED_HANDLER_EXECUTION_MODE`)
- contenu du menu visible : `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js`
- clés du menu principal : `main_tool_interaction_runtime.js` (`mainToolIdByKey`, 26 clés)

Beaucoup de defs portent `visibility: 'hidden'` — ce sont des outils d'API, pas des boutons morts. L'audit §15 doit porter sur les entrées **visibles**, c.-à-d. l'arbre atteignable depuis `toolbox.children` de `main_menu_content_runtime.js`.

### §4 — Dessin vectoriel — **implémenté, à vérifier**

`eVe/intuition/tools/core/` : `svg_vector_model.js`, `svg_vector_dom_runtime.js`, `svg_vector_edit_runtime.js`, `svg_vector_mutation_runtime.js`, `svg_vector_refresh_runtime.js`, `svg_path_data.js`, `svg_layer_model.js`, `svg_layer_store.js` (~2 000 L).
Outil `ui.vector.edit` → `v2_vector_edit`. Entrées menu : `draw_points`, `vector`.
→ Travail = vérification du parcours complet (créer / éditer / sauver / rouvrir), pas construction.

### §5 — Dessin à main levée — **implémenté, à vérifier**

`svg_draw_model.js`, `svg_draw_runtime.js`, `svg_draw_dom_runtime.js`, `svg_draw_commit_runtime.js` (~1 100 L).
Outils `ui.draw.mode.brush` / `.rect` / `.ellipse` → `v2_draw`. Entrées menu : `draw_freehand`, `draw_rectangle`, `draw_ellipse`, `draw_size`, `draw_color`.
→ **Manquant côté menu : gomme (eraser) et plume (pen).** À confirmer comme MVP ou Post-MVP.

### §6 / §7 — Édition crop/cut et audio — **le noyau existe, l'UI n'existe pas**

Le noyau molecule implémente déjà les opérations demandées :

| Besoin du §6/§7 | Reducer existant | Fichier |
|---|---|---|
| trim / crop | `resizeClip` (`molecule.clip.resize`) | `molecule/kernel/reducers.js` |
| split | `splitClip` (`molecule.clip.split`) | `molecule/kernel/reducers.js` |
| roll / répétition | `setClipBlockLoop` (`molecule.clip.block_loop`) | `molecule/kernel/block_loop.js` |
| loop transport | `setLoop` (`molecule.transport.loop`) | `molecule/kernel/reducers.js` |
| cut / copy / paste / duplicate | `molecule.clip.cut/copy/paste/duplicate` | `molecule/session/session.js` |

Table d'alias verbe → reducer : `molecule/session/timeline_operations.js` (`clip.trim`, `clip.crop`, `clip.loop`, `clip.split`, `transport.loop`…).
Gestes : `molecule/gestures/index.js` (déjà `clip.move` + `clip.resize`).
Modèle de clip côté moteur média : `start`, `duration`, `inPoint`, `playbackRate`, `fadeIn`, `fadeOut`, `gain` (`eVe/core/media_engine/molecule_support.js`).
Loop natif : Rust `platforms/web/audio-wasm/src/lib.rs` (`loop_region`), Swift `platforms/ios/atome-auv3/application/AppNativeAudioPlayback.swift` (`loopStartSeconds` / `loopEndSeconds`), Tauri `platforms/desktop-tauri/src/audio_engine/bridge.rs`.

**Ce qui manque : aucune entrée de toolbox n'expose ces opérations.** Zéro `tool_id` audio d'édition dans les defs (`grep ui.audio` → 0). Le travail §6/§7 est donc : defs d'outils + entrées de menu + câblage gateway → session molecule + persistance + cohérence forme d'onde/timeline.

### §7.3 — Time stretch zplane élastique — **bloqué**

`grep -ri "zplane\|élastique\|elastique"` sur tout le dépôt (hors `node_modules`, `.git`, `target`, `done`) → **une seule occurrence : le fichier todo lui-même.**

zplane élastique est un SDK commercial sous licence (zplane.development GmbH) : achat + accord de licence + archive SDK livrée par le fournisseur. **Je ne peux ni l'obtenir, ni le vendorer, ni le reconstituer.** §7.3 ne peut donc pas être livré tel quel.

Ce qui **peut** être livré sans le SDK, et qui représente l'essentiel du §7.3 hors DSP :

- le champ `stretch` du modèle de clip (ratio, mode, pitch-lock) + validation ;
- la persistance des paramètres et la restauration exacte après save/reload ;
- la cohérence durée effective ↔ timeline ↔ forme d'onde ;
- la compatibilité avec trim / split / roll / loop ;
- le contrôle UI dans la toolbox ;
- **une couture `StretchEngine`** à une seule implémentation par défaut (repitch via `playbackRate`, déjà présent dans le modèle de clip), derrière laquelle élastique se branche plus tard **sans toucher à l'architecture**.

C'est l'option retenue par défaut. Le §7.3 restera marqué *non livré* tant que le SDK n'est pas fourni.

### §9–§13 — Generator — **à créer**

Palette Create actuelle : `main_menu_content_runtime.js:195-208`
`children: ['text_create', 'draw', 'code_create', 'page_create']`.

§11 demande de réutiliser les fonctionnalités de génération existantes : **il n'y en a pas.** Pas de sous-système de génération audio/vidéo/image/texture/IA à raccorder. Le travail est donc entièrement : conteneur + point d'enregistrement + intégration UI (§10), ce que §10 autorise explicitement (« The MVP does not require every possible generator to be implemented »).

---

## B. Plan d'exécution

Ordre choisi : d'abord ce qui est mécanique et sans arbitrage, ensuite ce qui construit, enfin les audits de sortie.

| # | Lot | Sections | État |
|---|---|---|---|
| 1 | Audit dépôt | §1 | ✅ fait (ce document) |
| 2 | Générateur : conteneur + point d'enregistrement + entrée palette Create | §9, §10, §12, §13 | ✅ fait — voir §C |
| 3 | Audit mécanique de la toolbox visible → table §15 | §3, §15 | ✅ fait — voir §D |
| 4 | Vérification vectoriel (créer/éditer/sauver/rouvrir) | §4 | ✅ fait — voir §E |
| 5 | Vérification main levée + gomme/plume | §5 | ✅ fait — voir §E |
| 6 | Outils d’édition audio : trim, split, loop, loop points, roll | §6, §7.1, §7.2, §7.4, §7.5, §7.6, §8 | ✅ fait — voir §F |
| 7 | Time stretch : modèle + persistance + couture `StretchEngine` | §7.3 sauf DSP — voir §F |  ✅ |
| 8 | Thème : inventaire des valeurs visuelles en dur | §2 | ✅ audit fait — voir §G ; unification non faite |
| 9 | Scénarios de validation | §16 | ✅ fait — voir §H |
| 10 | Definition of Done | §17 | ✅ fait — voir §I (non atteint) |

### Hypothèses retenues (à corriger si fausses)

1. **« Elastic » = nom cible du système de thème unifié**, pas un module existant. Le lot 8 unifie `look` + `skin` + `system_ui`.
2. **zplane élastique indisponible** → lot 7 livre tout sauf le DSP, derrière une couture prête pour le SDK.
3. **Gomme et plume** (§5) : ajoutées si le noyau `svg_draw_*` les supporte déjà, sinon marquées *Post-MVP — intentionnellement absentes*.
4. Périmètre §15 = entrées **visibles** du menu (`toolbox.children` et leur descendance). Les defs `visibility: 'hidden'` sont des outils d'API et ne sont pas des « boutons morts ».

### Contraintes de méthode

- Pas de refonte, pas de nouveau framework front, pas de gros refactor (§1).
- Pas de seconde architecture de dessin (§5) ni d'édition audio parallèle (§7.3).
- Chaque modification est validée par une probe ciblée écrite dans `./temp`, pas par la suite de tests du dépôt.
- Rien n'est commité ni poussé.

---

## C. Lot 2 livré — conteneur Generator (§9, §10, §12, §13)

### Fichiers créés

| Fichier | Rôle |
|---|---|
| `eVe/intuition/tools/generator/registry.js` | **Le point d'enregistrement** (§10). Familles + générateurs, validation, notification d'abonnés. Aucun DOM, aucune création. Une famille n'apparaît dans le menu que si elle contient au moins un générateur — une palette vide serait exactement le « bouton mort » que §15 interdit. |
| `eVe/intuition/tools/generator/builtins.js` | 4 générateurs MVP qui renvoient **uniquement des specs d'Atome** : `text.title`, `text.paragraph`, `texture.color_field`, `texture.ramp`. PRNG déterministe (même graine → même sortie). N'utilisent que des propriétés déjà présentes dans `ATOME_PRESETS` — aucun nouveau champ de style, donc aucune couture Bevy à toucher. |
| `eVe/intuition/tools/generator/runtime.js` | Projection du registre vers la palette + exécution. `runGenerator` passe par `eveToolBase.createAtome`, la même route que Text/Page/Code : le contenu généré est un Atome normal (§13), pas une application isolée dans eVe (§12). Gère les specs `children` en second passage avec `parentId`. |
| `eVe/intuition/tools/generator/index.js` | Entrée, importée depuis `bootstrap.js`. Idempotente. |

### Fichiers modifiés

- `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js` — entrée `generator` (palette) + ajout dans `create.children`.
- `eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js` — `generator: 'tool.main.generator'`.
- `eVe/intuition/tools/core/tool_runtime_bootstrap_defs_b.js` — def `tool.main.generator`.
- `eVe/i18n/languages_en_core.js` / `languages_fr_core.js` — 10 clés.
- `eVe/intuition/bootstrap.js` — import de l'entrée.

### Parcours §12 obtenu

`Create` → `generator` → famille (`texture`, `text`) → générateur → l'exécution crée l'Atome.
Les paramètres sont exposés comme **entrées de menu distinctes** (`titre` / `paragraphe`, `aplat` / `dégradé`), à l'image de `draw_freehand` / `draw_rectangle` / `draw_ellipse` — pas de dialogue modal, conformément à §14.

### Validation

- `temp/generator_container_probe.mjs` — **96 checks, PASS**. Couvre : refus de famille inconnue, refus de générateur sans `generate()`, notification d'abonnés, masquage des familles vides, déterminisme par graine, forme du patch de menu (dont la présence du `touch` — une entrée sans `touch` est inerte), `extra_input` pour la route gateway, création réelle via `createAtome` (1 groupe + 6 enfants parentés, clé `children` jamais transmise), échec propre sur générateur inconnu et sur commit raté, et présence effective de l'entrée dans les 3 SSOT.
- `temp/generator_entry_link_probe.mjs` — **PASS**. Lien ESM de l'entrée réelle, auto-installation, dégradation propre sans runtime de menu.
- `node --check` sur les 6 fichiers modifiés — OK.

### Reste à faire sur ce lot

- Vérification en application réelle (palette visible, génération, sauvegarde, réouverture) — non faite, l'app n'a pas été lancée.
- Familles `audio` / `video` / `image` déclarées dans le registre mais sans générateur : volontairement **absentes du menu**. Elles apparaîtront dès qu'un générateur s'y enregistrera.

---

## D. Lot 3 livré — audit mécanique de la toolbox visible (§3, §15)

Script : `temp/toolbox_visible_audit.mjs` (rejouable). Rapport : [`todo/audits/toolbox_visible_audit_2026-08-15.md`](audits/toolbox_visible_audit_2026-08-15.md).

Le script part de `toolbox.children` et descend l'arbre. Pour chaque entrée il vérifie qu'au moins **une** des quatre routes de réponse existe : handler de menu (`touch`/`active`/`inactive`), handler enregistré au bootstrap, mode d'exécution `v2_*` résolu par `tool_runtime_executor_resolver`, ou `registerAtomeTool`/`registerUiAction` au runtime. Une entrée sans aucune des quatre est un bouton mort.

**38 entrées visibles atteintes.**

### Table §15

| Tool | Statut avant | Action | Statut après | Reste |
|---|---|---|---|---|
| 35 entrées (home, find, capture+7, time+2, communicate, mode+3, view+3, create+text/draw+7/code/page) | complet | aucune | complet | vérification en app réelle |
| `import` → `audio` | **déconnecté (mauvaise cible)** | `children` supprimés | complet | — |
| `import` → `modules` | **placeholder mort** | `children` supprimés | supprimé | — |
| `import` → `projects` | **placeholder mort** | `children` supprimés | supprimé | — |
| `load`, `save` | placeholder | marqués Post-MVP + refs pendantes retirées | Post-MVP — volontairement inertes | non atteignables (parent `file` hors `toolbox.children`) |
| `generator` | absent | créé (lot 2) | complet | vérification en app réelle |

### Le défaut trouvé

`import` déclarait `children: ['audio', 'modules', 'projects']`.

- `modules` et `projects` **n'existent pas** dans la SSOT du menu. Or `resolvePaletteChildrenFromCatalog` est appelé avec `includeMissing: true` (`toolbox_runtime_model.js:94`) : une clé absente devient une entrée synthétique `type:'tool'`, libellée avec la clé brute, **sans `tool_id` et sans handler** — exactement le « bouton mort inexpliqué » que §15 interdit.
- `audio` était pire : il résolvait vers l'entrée **capture** `audio` (`ui.capture.audio`, action `toggle`). « import > audio » déclenchait donc un enregistrement.

`import` est une action momentanée dont le `touch` ouvre déjà le flux d'import : il n'a besoin d'aucun enfant. `children` supprimé. Même correction sur `load`, qui référençait les deux mêmes clés fantômes.

### Constat d'architecture relevé au passage

`buildBevyMainMenuItems` (`ribbon/bevy_ui_main_menu_model.js:87`) ne rend que **deux niveaux** : les racines et les enfants directs de la palette active. `normalizeCatalogToolEntry` ne propage pas `children`, donc un enfant de palette ne porte jamais `isExpandable`. **Les palettes imbriquées (`draw`, `generator`) ne s'ouvrent pas dans le ruban principal** — elles dépendent du rendu toolbox/goey. Ce n'est pas une régression : `draw` est dans ce cas depuis toujours.

Le script vérifie donc en plus la **parité structurelle** du conteneur `generator` : identique à `draw` en profondeur (il s'ouvrira exactement là où `draw` s'ouvre) et identique à `view` en comportement (conteneur pur, momentané, sous-menu immédiat). Les deux passent.

### Garde ajoutée

Le script échoue (exit 1) s'il apparaît une entrée visible sans route de réponse, **ou une référence d'enfant pendante n'importe où dans la SSOT**. Aujourd'hui : 0 et 0, exit 0.

---

## E. Lots 4 & 5 livrés — vectoriel (§4) et main levée (§5)

Probe : `temp/vector_freehand_roundtrip_probe.mjs` — **47 checks, PASS** (jsdom, modules réels).

### Ce qui était déjà bon

- **§5 entrées mouse / pointer / touch / stylus** : le runtime écoute `pointerdown` / `pointermove` / `pointerup` / `pointercancel` (`svg_draw_runtime.js:488-495`). Pointer Events couvre les quatre par construction.
- **Trait continu, largeur, apparence** : `resolveDrawGeometry` + `sanitizeDrawStrokeWidth` (bornée 1–420) + `normalizeDrawColor`.
- **Persistance** : `buildProjectPatchFromGeometry` écrit `svg_markup`/`svgMarkup` + placement. Un second trait fusionne dans le markup existant sans détruire le premier, et un re-commit du même `nodeId` remplace au lieu de dupliquer — les deux vérifiés.
- **§4 aller-retour éditable** : un trait persisté se rouvre en modèle vectoriel, un point se déplace, se re-sauve, se rouvre déplacé. Ajout de point idem.

### Ce qui manquait, et qui est corrigé

**L'outil de dessin produisait des formes non éditables.** `resolveDrawGeometry` émet `<rect>` et `<ellipse>` pour les modes rectangle/ellipse, mais `resolveEditableTarget` ne sélectionnait que `path, polygon, polyline, line`. Un rectangle ou une ellipse dessinés se rouvraient donc **sans aucune poignée** — §4 « edit geometry where supported » n'était pas tenu pour deux des trois modes de dessin.

Incohérence aggravante : `svg_layer_model.js` listait déjà `rect`, `circle`, `ellipse` dans `SVG_EDITABLE_TAGS` et son sélecteur de calque les acceptait. La forme était donc **sélectionnable comme calque puis refusait silencieusement toute édition**.

Ajouté dans `eVe/intuition/tools/core/svg_vector_model.js` : `buildRectModel`, `buildEllipseModel`, `buildCircleModel`, au **même contrat** que les modèles existants (`points`, `movePoint`, `addPoint`, `applyToElement`, `toMarkup`, `pointSpace`). Le sélecteur accepte désormais `rect[width][height], ellipse[rx][ry], circle[r]`.

Choix de conception : les poignées exposent **les paramètres propres de la forme**, sans convertir le nœud en `path` — une conversion réécrirait la donnée persistée dans le dos de l'utilisateur.

- rect : 4 coins horaires depuis `p1` en haut-gauche ; tirer un coin **épingle le coin opposé** (vérifié).
- ellipse : `p1` centre (`anchor`), `p2`/`p3` contrôles de rayon (`control`) ; tirer un rayon **ne déplace pas le centre** (vérifié).
- circle : centre + un contrôle de rayon radial.

Aucune autre modification n'a été nécessaire : `svg_vector_edit_runtime.js` est entièrement générique sur le contrat de modèle (`movePoint` l.224, `addPoint` l.298, `applyToElement` l.100, `toMarkup` l.105) et `svg_vector_mutation_runtime.js` travaille sur `svg_markup` sans connaître le type.

### Post-MVP — volontairement absents

`pencil`, `pen`, `eraser` (§5 « Complete existing tools such as, **where present** »). Aucun des trois n'existe : `DRAW_MODE_SET` ne contient que `brush`, `rect`, `ellipse`. Les créer serait la « seconde architecture de dessin » que §5 interdit. La suppression d'un trait passe par l'outil `delete` générique, qui couvre le « erase/remove » du baseline.

### Reste

Vérification en application réelle des poignées rect/ellipse/circle à l'écran (les modèles sont validés, le rendu des poignées ne l'est pas).

---

## F. Lots 6 & 7 livrés — édition audio (§6, §7, §8)

Probe : `temp/audio_edit_probe.mjs` — **83 checks, PASS**, contre le **vrai noyau molecule** (timeline réelle, session réelle, dispatch réel). Une commande mal formée échoue ici, pas dans l'app.

### Ce qui existait déjà, et que je n'ai pas redoublé

- Reducers : `resizeClip` (trim/crop), `splitClip`, `setClipBlockLoop` (roll), `setLoop` (transport) — `molecule/kernel/`.
- Actions UI : `timeline_actions.js` enregistrait **déjà** `ui.timeline.clip.trim`, `.clip.split`, `.clip.loop`, `.transport.loop`, plus undo/redo.
- Affordances visuelles : la scène timeline rend déjà les poignées de crop (`mol:crop:<clip>:in|out`) et de loop.

**Le chaînon manquant était exactement un : un bouton de toolbox ne porte ni `clip_id` ni instant.** Rien ne pouvait donc construire une commande noyau à partir d'un appui.

### Ce qui a été ajouté

`eVe/intuition/tools/audio_edit/` — une couche de liaison, rien d'autre :

| Fichier | Rôle |
|---|---|
| `context.js` | Résout, depuis l'état vivant : projet → molécule active → clip → playhead. Le clip vient de la sélection (`mol:clip:…`, `mol:crop:…:in`, `mol:clip-loop-handle:…`) et, à défaut, du clip **sous le playhead**. Ne mute jamais. |
| `commands.js` | Fonctions pures contexte → `{ operation, command }` ou refus typé. Toutes les règles de frontière de §7 y sont testables directement. |
| `runtime.js` | Un `registerUiAction` par verbe : résoudre, construire, dispatcher via `applyGroupTimelineOperation`. Zéro DSP. |
| `stretch_engine.js` | La couture `StretchEngine` (voir §7.3 ci-dessous). |

Nouvelles entrées de menu sous une palette racine **`sound`** : `trim in`, `trim out`, `split`, `roll`, `loop`, `loop in`, `loop out`, `slower`, `faster`, `reset`. Verbes momentanés, pas de panneau, pas de modale — conforme §14.

### Un bug réel écrit puis attrapé par la probe

`Number(null)` et `Number('')` valent **0**, pas `NaN`. Mon helper `finite()` transformait donc « pas d'instant fourni » en « seconde zéro » : un *trim in* sans temps explicite ramenait le début du clip en tête de timeline et le noyau refusait avec `negative source_in_seconds`. Corrigé, avec trois checks de régression (`null`, `undefined`, `''` retombent sur le playhead) **et** un check que `0` explicite vaut toujours seconde zéro.

### Ce que la probe établit vraiment

- **§7.1 trim non destructif** : `source_in` avance avec le bord au lieu que le média soit coupé.
- **§7.2 split** : deux régions contiguës, durée totale conservée, **même référence média** des deux côtés, fenêtre source découpée et non dupliquée (`left.source_out === right.source_in`).
- **§7.4 roll** : la répétition s'active, la portée est ≥ la durée du clip, la désactivation laisse le clip intact.
- **§7.5/§7.6** : déplacer un marqueur de boucle ne déplace pas l'autre ; un marqueur qui croiserait l'autre est **refusé plutôt que permuté** ; la boucle fonctionne **sans clip** (c'est du transport, pas du clip — la distinction que §7.6 demande) ; désactiver la boucle conserve la région pour la prochaine activation.
- **§8** : chaque édition durable est journalisée, undo/redo rétablit le nombre de clips, la référence média survit à toute la chaîne.

### §7.3 — Time stretch : livré sauf le DSP

Ajouté :
- `molecule/kernel/stretch.js` — reducer `setClipStretch`, enregistré dans le dispatch de session, dans `DURABLE_OPERATIONS`, dans l'alias `clip.stretch`, et dans `TIMELINE_VERBS`.
- `molecule/kernel/schemas.js` — validation du champ `clip.stretch` `{ enabled, ratio, engine, pitch_lock, natural_duration_frames }`.
- `audio_edit/stretch_engine.js` — le registre de moteurs.

Vérifié par la probe : ×2 double la durée, **le début ne bouge pas**, ratio/moteur/pitch-lock/durée naturelle persistés, frames et secondes restent cohérents, un second stretch **recalcule depuis la durée naturelle au lieu de composer**, le reset restaure la durée d'origine à la frame près, la portée de roll grandit avec le bloc étiré, et un clip étiré reste splittable et trimmable en conservant ses paramètres.

**Le DSP n'est pas livré.** `zplane_elastique` est **déclaré** dans le registre avec `available: false` et la raison `zplane_elastique_sdk_not_installed` — pas remplacé en silence. Demander élastique retombe sur `playback_rate` (varispeed, déjà supporté par kira et AVAudioEngine), et `describeStretchSupport()` signale `degraded: true` + `preserves_pitch: false` au lieu de le cacher. Brancher le vrai SDK = **un appel** `registerStretchEngine({ id: 'zplane_elastique', available: true, apply })`. Rien d'autre dans le dépôt ne change.

### Reste sur ce lot

- Le rendu du stretch au playback : `apply()` renvoie un `playback_rate`, mais aucun backend ne le consomme encore. Trim/split/roll/loop passent par le noyau et sont donc effectifs ; **le stretch est correct dans le modèle et pas encore audible**.
- Vérification en application réelle (palette `sound` visible, verbes sur une vraie molécule, save/reopen).

---

## G. Lot 8 livré — audit d'intégration du thème (§2)

Script : `temp/theme_audit.mjs`. Rapport : [`todo/audits/theme_integration_audit_2026-08-15.md`](audits/theme_integration_audit_2026-08-15.md).

**Mesure, pas refonte** — §1 interdit d'engager un gros refactor dans cette phase, et l'ambiguïté sur « Elastic » (§A) n'est pas levée.

Le script parcourt les 13 surfaces que §2 énumère et répond à deux questions vérifiables : quelle source de tokens chaque surface consomme réellement, et combien de valeurs visuelles brutes (hex, `rgb()`/`hsl()`, longueurs `px`) elle porte encore. Les fichiers `*_tokens.js` / `*_preset.js` / `*_skin.js` sont comptés à part : ce sont les endroits **où les couleurs doivent vivre**, les compter comme « en dur » reviendrait à reprocher au thème d'être un thème.

**145 valeurs visuelles en dur** dans le code consommateur des 13 surfaces.

### Les trois constats à traiter

1. **Trois surfaces peignent sans importer aucune source de tokens** : outils de dessin (`tools/core`, 25), timeline (`molecule/render`, 18), générateur (`tools/generator`, 5 — ce sont les couleurs *générées* par `texture.*`, du contenu et non du chrome ; à confirmer comme légitimes).
2. **Trois surfaces mélangent deux systèmes** : vues liste (skin + tool visual tokens), toolbox principale (skin + system_ui), vues projet (skin + tool visual tokens). C'est le symptôme direct de la non-unification.
3. **Aucune surface ne consomme `look`** — le système qui porte pourtant `eveToolTheme` et les presets goey. Il est consommé plus haut, hors des répertoires listés.

### Ordre de traitement proposé (non exécuté)

1. `molecule/render/timeline_scene.js` (18 littéraux, 2 fichiers) — le meilleur rapport surface/effort, et il prend déjà un objet `palette` en paramètre : il suffit de le faire venir des tokens plutôt que de l'appelant.
2. `intuition/matrix/visual/matrix_visual_tokens.js` (37 littéraux, fichier de tokens local) — candidat n° 1 à la fusion dans `skin`.
3. `elements/design/panel_chrome_tokens.js` (16) — idem.
4. Ensuite seulement, la question « Elastic » : décider si le système unifié prend ce nom, et fusionner `look` + `skin` + `system_ui`.

---

## H. Lot 9 livré — scénarios de validation (§16)

Runner : `temp/run_all_probes.sh` — rejoue tout, exit 0 seulement si tout passe.

```
generator_container_probe.mjs        OK   96 checks
generator_entry_link_probe.mjs       OK
vector_freehand_roundtrip_probe.mjs  OK   47 checks
audio_edit_probe.mjs                 OK   83 checks
toolbox_visible_audit.mjs            OK   46 entrées visibles, 46 saines
```

**226 checks + l'audit de toolbox, tous verts.**

### Couverture réelle des scénarios §16

| Scénario §16 | Couvert par probe | Reste à faire en app réelle |
|---|---|---|
| Theme | audit statique (§G) | cohérence visuelle à l'écran |
| Vector — create/edit/move/resize/save/reopen | **oui** — aller-retour géométrie complet, path + rect + ellipse + circle | rendu des poignées à l'écran |
| Freehand — draw/erase/save/reopen | **oui** — trait, fusion multi-traits, persistance `svg_markup` | tracé au doigt/stylet sur appareil |
| Crop/Cut | **oui** via `clip.trim` / `clip.split` (mêmes reducers) | import média réel |
| Audio Trim | **oui** — non-destructif vérifié | lecture audible |
| Audio Split | **oui** — régions, timing, références média | lecture audible |
| Time Stretch | **oui** pour durée/placement/persistance/restauration | **audible : non** (aucun backend ne consomme encore `playback_rate`) ; **élastique : non** (SDK absent) |
| Roll | **oui** — activation, portée, sortie propre | lecture audible |
| Loop | **oui** — marqueurs indépendants, croisement refusé, persistance | lecture au franchissement |
| Generator | **oui** — jusqu'à `createAtome` inclus | palette visible, save/reopen projet |

Ce que **aucune** probe ne remplace : l'application n'a pas été lancée. Tout ce qui est marqué « reste à faire » relève d'un passage en conditions réelles.

---

## I. Lot 10 — Definition of Done (§17)

| Critère §17 | État | Preuve / réserve |
|---|---|---|
| le système de thème est intégré de façon cohérente | ❌ **non** | audité et chiffré (145 littéraux, 3 systèmes parallèles) ; l'unification n'est pas faite et l'ambiguïté « Elastic » n'est pas levée |
| toutes les entrées essentielles de la toolbox fonctionnent | ✅ | 46 entrées visibles, 46 avec une route de réponse, 0 référence pendante |
| le dessin vectoriel est utilisable | ✅ | 47 checks ; rect/ellipse/circle rendus éditables (ils ne l'étaient pas) |
| le dessin à main levée est utilisable | ✅ | idem ; pencil/pen/eraser marqués Post-MVP (absents du noyau, §5 dit « where present ») |
| les outils crop/cut sont utilisables | ✅ | mêmes reducers que trim/split, couverts |
| audio trim | ✅ | non destructif vérifié |
| audio cut/split | ✅ | régions, timing, références média vérifiés |
| audio **time stretch** | ⚠️ **partiel** | modèle, durée, placement, persistance, restauration, compatibilité : oui. **DSP : non** — zplane élastique est un SDK sous licence absent du dépôt ; le slot est déclaré `available: false`, pas remplacé en douce |
| audio roll | ✅ | activation/portée/sortie vérifiées |
| loop et loop points | ✅ | marqueurs indépendants, croisement refusé |
| **Generator** dans la palette Create | ✅ | entrée statique + registre extensible |
| les générateurs existants sont raccordés | ✅ *vacuously* | il n'en existait aucun (§A) ; 4 générateurs MVP fournis à la place |
| le contenu généré devient du contenu Atome normal | ✅ | passe par `eveToolBase.createAtome`, enfants parentés |
| tout persiste après save/reload | ⚠️ | vérifié au niveau modèle (svg_markup, état molecule) ; **pas vérifié bout-en-bout dans l'app** |
| aucun contrôle MVP ne reste un placeholder mort | ✅ | 3 supprimés (`import > audio/modules/projects`), `load`/`save` marqués Post-MVP |

**Verdict : le §17 n'est pas atteint.** Deux critères bloquent — le thème (lot 8 audité mais non appliqué) et le time stretch (SDK indisponible). Un troisième est réservé : la persistance n'a pas été éprouvée dans l'application réelle.


---

# 17 août 2026 — Reprise : rail contextuel, thème, stretch audible

Périmètre arbitré par l'utilisateur : **le menu principal n'est pas touché**, et
tout ce qui s'y rapporte est reporté (dont l'entrée `Generator` de la palette
Create, inerte parce que le ruban n'ouvre qu'un niveau de palette). En
contrepartie, une exigence nouvelle : le rail contextuel latéral doit être
ouvert et alimenté en modes liste et matrice.

## J. Rail contextuel en liste et matrice (exigence nouvelle)

Probe : `temp/contextual_rail_views_probe.mjs`, **rouge d'abord** — 13 échecs
correspondant à quatre manques réels.

| Manque | Correctif |
|---|---|
| le rail ne prévenait personne quand il s'ouvrait ou se fermait, donc la vue ne rebâtissait jamais son arbre et le contenu s'étendait **sous** le rail | `ATOME_CONTEXTUAL_EDIT_CHANGED_EVENT` émis depuis `syncLegacyState()`, seul point par lequel passe toute mutation de cible ; la surface s'y abonne |
| rien n'ouvrait le rail à l'entrée dans une vue | `syncContextualRail()` appelée après chaque rendu réussi |
| rien ne le réalimentait au changement de niveau | même fonction : elle compare une signature `level:` / `item:` et n'agit que si la cible a changé — c'est aussi ce qui empêche la notification de boucler |
| un atome simple sélectionné n'alimentait pas le rail | `project_view_contextual_rail.js`, propriétaire unique du routage ligne → rail |

Règle appliquée : **le niveau courant par défaut, l'élément dès qu'il est
sélectionné**, retour au niveau à la désélection.

Réutilisation plutôt que création :

- un atome réel prend `enter` — *exactement* la route du double-clic en mode
  naturel, donc les mêmes outils, le même rail ;
- une molécule / section / piste garde `presentMoleculeInfo` → `enterVirtual` ;
- `resolveAtomeContextualRecordKind` / `normalizeAtomeContextualKind` sortent de
  `boot_runtime.js` vers `atome_contextual_kind.js` : la scène n'est plus le seul
  point d'entrée du rail, et deux copies auraient fini par diverger sur le nom
  d'un atome audio.

Deux corrections tombées de là :

- la matrice lisait sa sélection en retour de `getCurrentSelectionIds()`, un
  module qui ignore les lignes de molécule — elle laissait donc le rail sans
  cible. Elle applique maintenant la même règle que la liste ;
- en repassant en naturel, le conteneur virtuel est retiré du rail
  (`releaseContainerRail`) ; un atome sélectionné, lui, y reste légitimement.

## K. Thème (§2) — 145 → 102 valeurs en dur

Rapport : [`todo/audits/theme_integration_audit_2026-08-17.md`](audits/theme_integration_audit_2026-08-17.md).

**Plus aucune surface ne peint hors du thème.** Les trois qui ne consommaient
aucune source de tokens consomment `elements/skin` :

| Surface | Avant | Après |
|---|---:|---:|
| outils de dessin (`tools/core`) | 25 | **0** |
| timeline (`molecule/render`) | 18 | **0** |
| générateur (`tools/generator`) | 5 | 4 (les `hsl()` **produits** par les générateurs — du contenu, pas du chrome) |

Deux ajouts au skin : `EVE_TOOL_SKIN_TOKENS.timeline` (les kinds de clip mappés
sur les familles sémantiques — audio = violet, vidéo = bleu, image = vert) et
`EVE_TOOL_SKIN_TOKENS.drawing`, qui sépare explicitement `content` (la couleur
avec laquelle un atome **naît**) de `handle` (le chrome d'édition vectorielle).

**Hors périmètre** : la toolbox principale (22, reportée) et l'unification de
`look` + `skin` + `system_ui`, qui reste un refactor large interdit par §1 — et
dont la question du nom « Elastic » n'est toujours pas tranchée.

## L. Time stretch audible (§7.3)

Le vrai trou n'était pas le SDK : c'était que **rien ne jouait le stretch**.
`apply()` renvoyait un `playback_rate` qu'aucun appelant ne lisait, et
`runtime_transport.js` projetait ses clips vers le moteur média **sans taux**.

1. **Audible partout.** `resolveClipStretchPlayback(clip)` traduit un
   `clip.stretch` persisté en ce qu'on dit au backend ; le transport le
   consomme. La plomberie existait déjà sur les trois plateformes
   (`set_param('playback_rate')` → `audio_set_playback_rate` en WASM, en Tauri
   et en natif iOS) : elle n'était simplement jamais atteinte.
2. **Hauteur préservée.** Moteur `rubberband`, rendu **hors ligne** :
   décodage → `rubberband_study` puis `rubberband_process` → WAV 16 bits →
   `loadTransientAsset`. Un buffer déjà étiré se joue à vitesse 1 — appliquer le
   ratio par-dessus l'étirerait deux fois.
3. **iOS compris, sans code natif neuf.** `loadTransientAsset` route déjà vers
   `audio_load_clip_from_bytes`, commande qui **existe déjà** dans
   `AppNativeAudioCommands.swift` et qui écrit elle-même le fichier temporaire.
   La contrainte « iOS exige un chemin local » était donc déjà levée.
4. **Résolution par défaut.** `resolveStretchEngine('')` préfère désormais un
   moteur qui préserve la hauteur ; le varispeed n'est retenu que s'il est seul.
   Un clip déjà persisté garde **son** moteur : l'id est une donnée.
5. **Rien n'est remplacé en douce.** Le slot `zplane_elastique` reste déclaré
   `available: false` avec sa raison. Un rendu pas encore prêt s'annonce
   `pending: true, preserves_pitch: false` au lieu de mentir.

> ⚠️ **Licence.** Rubber Band est GPL-v2+ ou commerciale. Le risque a été
> signalé, le choix a été maintenu par le propriétaire du produit, et la
> conséquence est consignée dans `THIRD_PARTY_LICENSES.md` : distribuer Atome
> avec cette bibliothèque oblige à publier Atome sous GPL, sauf achat de la
> licence commerciale.

## M. État du §17 après cette passe

| Critère §17 | Avant | Après |
|---|---|---|
| thème intégré de façon cohérente | ❌ | ⚠️ **partiel** — plus aucune surface ne peint hors du thème (145 → 102), mais il reste trois systèmes de tokens au lieu d'un |
| audio **time stretch** | ⚠️ modèle seul | ✅ **audible** — varispeed sur les 3 plateformes, hauteur préservée par Rubber Band |
| tout persiste après save/reload | ⚠️ modèle | ⚠️ inchangé — toujours pas éprouvé dans l'application lancée |

Le §17 n'est donc **toujours pas atteint**, sur deux points désormais : les trois
systèmes de tokens, et la vérification bout-en-bout en conditions réelles. Le
time stretch, lui, n'est plus bloquant.

## Preuves

```
contextual_rail_views_probe.mjs      OK   (rouge d'abord : 13 échecs)
audio_edit_probe.mjs                 OK   106 checks
generator_container_probe.mjs        OK   96 checks
vector_freehand_roundtrip_probe.mjs  OK   47 checks
toolbox_visible_audit.mjs            OK   28 entrées visibles, 28 saines
theme_audit.mjs                      145 -> 102 valeurs en dur
check:component-reuse-guardrails     ok (4 rules)
check:no-fallbacks                   ok (39 fichiers)
```

**Réserve inchangée : l'application n'a pas été lancée.** Tout ce qui précède est
vérifié par probes sur les vrais modules. Restent à éprouver à l'écran : le rail
en liste/matrice, la cohérence visuelle après le passage au thème, et surtout
**écouter** un clip étiré.
