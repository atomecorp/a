# Matrice de parité Dashboard records → Bevy UI (T2.1)

Source d'inventaire : `eVe/domains/dashboard/dashboard_records.js` + `dashboard_record_primitives.js`
+ `dashboard_scene_effects.js` (état 2026-07-05, post Phase 1).
Cible : `atome/renderers/bevy-core/src/ui/` (`AtomeUiNode`/`AtomeUiStyle`/`AtomeUiImage`, plugin `AtomeBevyUiPlugin`).

Statuts : ✅ = implementation covered by focused contracts · 🟡 = implementation requires a real-canvas acceptance run · ❌ = missing implementation.

Last contract review: 2026-07-13. The shared BevyUI core already provides subtree opacity,
card shadows, rounded nodes, local Roboto weights, text alignment/line height, scroll state,
drag, and wheel events. Image `contain`/`cover` plus rounded clipping is rasterized by the
shared media-texture resolver before the texture enters the Bevy surface.

## 1. Inventaire des records produits

| Record id (préfixe `__eve_dashboard_`) | Kind | Rôle |
| --- | --- | --- |
| `project_veil` | rect | voile sombre au-dessus du projet |
| `reserved_band_fill` | rect | bande réservée toolbox (bas) |
| `bottom_shadow` | image (SVG data-url) | ombre dégradée sous le dashboard |
| `background` | rect (rounded) | fond plein écran du dashboard |
| `table` | rect (rounded) | fond de la table des lanes |
| `lane_<cat>` | rect | fond de lane (couleur catégorie shadée) |
| `header_bg_<cat>` | rect | fond du header de catégorie |
| `header_side_shadow` | image (SVG dégradé) | ombre latérale de la colonne headers (handedness) |
| `header_icon_<cat>` | image (SVG data-url) | icône de catégorie |
| `header_<cat>` | text | label de catégorie |
| `focus_spread_content` / `focus_spread_header` | rect | rects interpolés de transition de rubrique |
| `card_<base>` | rect (rounded + shadow) | fond de carte d'item |
| `card_media_<base>` | image (PNG data-url) | preview projet / avatar contact |
| `card_label_backdrop_<base>` | image (SVG arrondi bas) | bandeau semi-opaque sous le titre |
| `card_title_<base>` / `card_date_<base>` | text | titre / date d'item (long-press éditable) |
| `editor` | rect (rounded) | fond éditeur plein écran |
| `editor_title` / `editor_preview` | text | textes de l'éditeur |
| effet `backdrop_blur` (scene effect) | effect | flou du projet sous le dashboard |

## 2. Parité par champ — records `rect` (shape)

| Champ record | Utilisé par | Équivalent Bevy UI | Statut |
| --- | --- | --- | --- |
| `left/top/width/height` | tous | `Node` position absolue (`AtomeUiStyle.position/size`) | ✅ |
| `color` (hex) | tous | `AtomeUiStyle.background` | ✅ |
| `opacity` (×fade) | tous | `SetSubtreeOpacity` scales the mounted subtree | ✅ |
| `corner_radius` (uniforme) | background, table, cartes, editor | `AtomeUiStyle.radius` → `BorderRadius` | ✅ |
| `material.shadow {color, blur, spread, offsetX, offsetY}` | `card_<base>` (cardShadow) | `AtomeUiStyle.shadow` → `BoxShadow` | ✅ |
| `zIndex/renderLayer` (layers tokens) | tous | `AtomeUiStyle.z_index` | 🟡 (mapper les couches tokens → GlobalZIndex) |
| `selectable:false` | tous | `Interaction`/picking désactivable | ✅ |

## 3. Parité par champ — records `image`

| Champ record | Utilisé par | Équivalent Bevy UI | Statut |
| --- | --- | --- | --- |
| `source` SVG data-url | icônes, backdrops, ombres | `AtomeUiImage.texture` (raster via shared resolver, never fetched by Bevy) | ✅ |
| `source` PNG data-url | `card_media_*` | idem | ✅ |
| `fit` contain/cover (`media_fit/object_fit`) | card_media | shared media-texture fit rasterization | ✅ |
| `corner_radius` sur image | card_media | node `style.radius` is forwarded to shared rounded texture rasterization | ✅ |
| `media_width/media_height` | card_media (ratio) | calcul de rect côté JS conservé (layout partagé) | ✅ |
| `texture_scale` (netteté 2×/4×) | icônes, media | taille de texture source ; sans équivalent nécessaire si texture pré-rasterisée à l'échelle | ✅ |
| `clipping: 'card'` | card_media | `AtomeUiStyle.overflow` (clip) sur le parent carte | 🟡 (T2.6) |
| `opacity` (0.6 backdrop, 0.92 media, ×fade) | tous | image alpha plus `SetSubtreeOpacity` | ✅ |

## 4. Parité par champ — records `text`

| Champ record (`text_style`) | Utilisé par | Équivalent Bevy UI | Statut |
| --- | --- | --- | --- |
| `text` (multi-lignes) | tous | `Text` natif | ✅ |
| `color` | tous | `AtomeUiStyle.color` → `TextColor` | ✅ |
| `font_family` Roboto (token, jamais CDN) | tous | bundled Roboto handles | ✅ |
| `font_weight` 400/500/700/800 | tous | nearest bundled Roboto-weight mapping | ✅ |
| `font_size` (15×scale, 16, 11.5, 28, 17) | tous | `AtomeUiStyle.font_size` | ✅ |
| `align` left/center | headers, titres | `AtomeUiStyle.text_align` → `TextLayout.justify` | ✅ |
| `baseline` alphabetic/middle | headers, titres | positionnement dans le nœud (align_items) ; à valider pixel-près vs rasterizer | 🟡 |
| `padding_x/padding_y` | tous | `AtomeUiStyle.padding` | ✅ |
| `stroke_color/stroke_width` (liseré léger) | headers, titres | ❌ pas de text-stroke bevy_text | ❌ |
| `shadow_color/blur/offset_x/offset_y` | headers, titres | ❌ `TextShadow` (Bevy 0.18) non exposé | ❌ |
| `text_fit: 'shrink'` + `min_font_size` | titres/dates | ❌ auto-shrink à la largeur (mesure + réduction) | ❌ |
| `line_height` | resolver | `AtomeUiStyle.line_height` → `TextFont.line_height` | ✅ |
| `texture_scale` (netteté 4×) | headers/titres | sans objet (texte vectoriel natif Bevy) | ✅ |
| `rich_text` (spans bold/color, `editing`, `selection`, `caret`) | édition de label | ❌ sélection + caret + spans pour l'édition inline (T4.4) | ❌ |
| `opacity` (0.82, inactifs 0.42, ×fade) | tous | `TextColor` alpha plus subtree opacity | ✅ |

## 5. Effet de scène

| Effet | Champs | Équivalent | Statut |
| --- | --- | --- | --- |
| `backdrop_blur` | bounds, sourceZIndexMax, targetZIndex, radius, downsample, tint | l'effet flou existant s'applique à la scène projet SOUS le dashboard : il reste rendu par le pipeline sprites (non migré) ; le dashboard Bevy UI se superpose | ✅ (aucun portage requis) |

## 6. Interactions requises (référence T2.5/T2.6)

| Besoin | Existant `drain_ui_events` | Statut |
| --- | --- | --- |
| press/release/hover avec id + position | press/release/hover (id, kind) — position à vérifier | 🟡 |
| long-press (timing côté JS) | dérivable de press/release + timestamps JS | ✅ |
| drag continu (deltas) pour inertie | drag delta emitted while pressed | ✅ |
| molette (scroll V + H) | wheel delta emitted for the hovered node | ✅ |
| scroll natif `Overflow::scroll` + `ScrollPosition` pilotable | style mapping plus patchable `ScrollPosition` | ✅ |

## 7. Synthèse « À implémenter » (alimente T2.2/T2.3)

1. **Text stroke + text shadow** (or a documented visual compensation). — §4
2. **Text-fit shrink + min_font_size** (measure then reduce). — §4
3. **Rich-text editing** (spans, selection, caret), required only for T4.4. — §4
4. **Real-canvas acceptance** for lane clipping, layer order, rounded media, scroll, drag, and wheel remains required before pixel-parity sign-off. — §§2–6
