# Intuition Liquid — généralisation aux menus

Journal d'exécution du plan `~/.claude/plans/oui-le-plus-propre-wise-cook.md`.

## Lot 1 — SSOT labels et icônes ✅

- **Créé** `eVe/intuition/shared/tool_presentation.js` — `resolveToolPresentation({key, definition, children, labelKey, label, icon, translate})` → `{label, icon}`.
  Le libellé est traduit, l'icône est **toujours un chemin**, jamais une clé brute.
- **Branché** les trois consommateurs : Flower (`flower_context_items_runtime.js`),
  ruban (`bevy_ui_main_menu_model.js` `itemForEntry`), rail contextuel
  (`atome_contextual_edit_model.js`, 2 sites).
- **Divergence réelle corrigée** : seul le ruban appliquait `resolveToolChoiceIcon`,
  qui fait porter à une palette l'icône de son enfant sélectionné. Le Flower affichait
  l'icône de la palette, le ruban celle de l'enfant courant. Les deux sont alignés.

### Code mort supprimé
| quoi | lignes |
|---|---|
| `eVe/intuition/flower/menu_items.js` (+ sa part dans `tests/probes/flower_menu_modules.probe.mjs`) | 79 |
| `eVe/intuition/tools/contextual/flower_menu_layout.js` + sa probe | 285 |
| 18 exports morts de `eVe/intuition/ribbon/menu_model.js` (276 → 134 l.) | 142 |
| **total** | **~506** |

### Corrections au plan
- `normalizeToolEntry` **n'était pas mort** : les 11 références pointaient vers un
  **homonyme** dans `tool_definition_ssot.js`. L'export de `menu_model.js` l'est, lui
  (un seul importeur, un test) — conservé.
- Un premier comptage d'appelants ratait les imports **relatifs au même dossier**
  (`from './menu_model.js'`). Motif corrigé avant toute suppression.

### Reste ouvert
- `disabled` et `intent` sont produits par le Flower et **jamais lus** par son rendu :
  un item désactivé est peint et activable. À trancher (honorer, ou cesser de produire).

## Lot 2 — Shader multi-gouttes ✅ (cœur)

Le mode liquide dessine maintenant **N gouttes dans un seul quad**, avec un style
partagé. Vérifié à l'écran : sept gouttes en corolle, chacune avec son verre, sa
réfraction, son liseré et ses arcs — **un record, un matériau, un patch par frame**.

- `intuition_liquid_drop(...)` : le rendu d'UNE goutte, géométrie en paramètre,
  style depuis les uniformes. Renvoie un `IntuitionLiquidSample` (couleur + alpha)
  et ne fait **jamais** `discard` — un fragment hors de cette goutte peut appartenir
  à la suivante.
- `intuition_liquid(...)` : boucle, rejet précoce par boîte englobante, composition
  « over ». **Zéro goutte déclarée = comportement mono-goutte historique**, vérifié
  à l'écran avant de continuer.
- Contrat : `liquid_drops[24]` (`[cx, cy, diamètre, enfoncement]`) + `liquid_drop_count`.

### Deux corrections au plan
- **Pas un tableau de 48.** serde et `Default` ne s'implémentent que jusqu'à 32
  éléments — `[[f32;4];48]` ne compile pas. Deux tableaux séparés : `flower_petals`
  (24, style **partagé**) et `liquid_drops` (24, géométrie **propre**). Plus clair,
  et ça dit de soi-même ce qui est partagé.
- **`textureSample` interdit sous flux non uniforme.** Le rejet précoce par `continue`
  rend le flux non uniforme, et le shader ne compilait plus — `Invalid ShaderModule`,
  écran noir, aucune erreur au build. Remplacé par `textureSampleLevel(..., 0.0)` :
  les cibles de capture et de flou n'ont pas de mipmaps, le rendu est identique.
  **C'est le piège n°1 de ce chantier** : une erreur WGSL ne se voit qu'à l'exécution.

### Bug de perf corrigé au passage
`set_workspace_blur_radius` était appelé à chaque `patch_procedural_sdf`, donc à
chaque frame animée, et `Assets::get_mut` marquait les deux matériaux de flou comme
modifiés → Bevy re-préparait buffer et bind group **par frame, pour rien**. Sortie
anticipée quand le rayon ne change pas.

### Reste au lot 2 (optimisations, pas des correctifs)
- Quad réduit à la boîte englobante (~0,92 Mpx au lieu de 3,0 pour un Flower).
  Touche l'invariant `screen_uv = uv` gardé par `procedural_sdf_tests.rs:274`.
- Arbitrage du rayon de flou entre l'assistant (48) et le liquide.

## Lot 3 — Préréglage utilisateur ✅

Sur le patron exact de la latéralité, sans plomberie nouvelle.

- `user_visual_preferences_model.js` : deux champs, `renderStyle: 'flat'|'liquid'`
  (défaut **flat** — le nouveau rendu s'active, il ne s'impose pas) et `liquidTheme`.
- **Créé** `eVe/intuition/liquid/intuition_liquid_preference.js` — délibérément
  minuscule et **sans dépendance au design** : il est lu tôt (les surfaces doivent
  savoir si elles s'effacent) alors que `intuition_liquid_design.js` (1300 l., 13
  thèmes) ne doit être chargé qu'à la demande. C'est cette séparation qui garantit
  que le mode `flat` ne paie **rien**.
- Contrôle dans le panneau Home, sous la latéralité, i18n fr + en.
- `syncIntuitionLiquidThemeFromPreference()` aligne le thème à l'ouverture et
  s'abonne aux changements — abonnement unique, gardé.

Le nom du thème n'est **pas** validé côté préférence : le valider y importerait tout
le module de design dans le chemin de boot. Un nom inconnu retombe sur le défaut,
côté design.

## Lot 4 — Le Flower en liquide ✅

Vérifié à l'écran, dans les deux modes, avec le hit-test.

- **`resolveBevyFlowerPlacements()`** extrait de `bevy_ui_flower_model.js` : fonction
  pure, sans dépendance Bevy, qui dit OÙ se pose chaque item. `buildBevyUiFlowerTree`
  et `resolveBevyFlowerItemPoint` en sont devenus des appelants.
  Probe `temp/lot4_placements_probe.mjs` : l'ancienne API et la nouvelle rendent le
  **même point**, et les nœuds de l'arbre tombent au pixel sur ces placements.
- **`resolveBevyMenuSurface`** renvoie un fond transparent en mode liquide — et le
  **miroir** de `buildBevyMenuToolNode` est neutralisé aussi, sinon le latch
  réaffichait la plaque opaque.
- **Créé** `intuition_liquid_menu_renderer.js` : une surface = un record, un
  matériau, un patch. Générique (clé + gouttes), donc réutilisable tel quel pour le
  ruban et les panneaux.
- Branché sur `render()` et la fermeture du runtime Flower, en **import dynamique** :
  en mode `flat`, ni le design ni ses thèmes n'entrent dans le graphe.

### Ce que la vérification a prouvé
| | |
|---|---|
| `flat` | six pétales opaques, inchangés |
| `liquid` | six gouttes de verre, **mêmes icônes, mêmes labels, mêmes positions** |
| thème `dark` à chaud | appliqué, meilleur contraste |
| clic sur une goutte | `copy` activé — **le hit-test de l'arbre survit** |
| fermeture | surface démontée, `readLiquidMenuSurfaces()` vide, zéro fuite |

C'est la validation du pari du plan : ne remplacer que le FOND. Le hit-test,
l'animation, l'accessibilité et la teinture des SVG n'ont pas été touchés.

### Menus contextuels
Couverts sans une ligne : les sept points d'entrée convergent tous vers ce Flower.
