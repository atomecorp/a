# Vue projet : zoom/pan, vignettes, formats de page (26 sept. 2026)

Plan : `~/.claude/plans/vas-y-cree-moi-synthetic-pascal.md`. Ordre : 4 → 5 → 1 → 2 → 3.

## Lot 4 — Vignettes cadrées sur le contenu
- [x] `domains/rendering/project_preview_content_bounds.js` : couverture > union des bornes tournées (débord de page coupé, fantômes exclus), marge 5 %, élargie au ratio de l'écran
- [x] `project_preview_runtime.js` : `sourceViewport` = bornes de contenu (repli écran si vide)
- [x] origine x/y transmise (`webgpu_compositor.js`) + dans la clé de cache (`matrix_preview_renderer.js`) → changer de couverture invalide
- [x] action « Couverture » : `intuition/tools/page_cover_tool.js`, filtre `containerKinds` dans `context_menu_resolver.js`, taxonomie, i18n, aiguillage rail
- [x] probes `temp/preview_content_bounds_probe.mjs` (6/6), `temp/page_cover_menu_probe.mjs` (2/2)
- [x] ratio de la vignette = ratio de l'écran (la boîte du Dashboard est carrée : élargir au ratio de la boîte rendait les cartes carrées)
- [x] app réelle (`temp/preview_pages_lot45.probe.mjs`, headless) : forme à (2600,1800) visible dans la vignette persistée ; bornes → `cover` après bascule ; une seule couverture ; « Couverture » et « PDF » visibles dans le rail d'une page après un vrai clic (priorités 25/26 : en fin de liste elles tombaient hors de la zone visible du rail qui défile) ; filtre page-seule appliqué seulement quand le record est connu (la passe des candidats n'en a pas)
- [ ] ⚠ image de la vignette « couverture » non vérifiée : la capture 256 px du Dashboard est instable en sonde, **HEAD compris** (A/B fait) → défaut du pipeline de capture signalé à part (taille figée au 1er démarrage, capture sans redimensionnement = vide)

## Lot 5 — Formats de page
- [x] tailles réelles (A4 794×1123, A3, A5, Letter) — 9:16 = 16:9 tracé debout (pas de case dédiée)
- [x] orientation = sens du geste (clic = orientation naturelle du format) ; probe `temp/page_formats_probe.mjs` 10/10
- [x] `page_format`/`page_orientation` persistés (vérifié app réelle)
- [x] 5b export PDF : `page_pdf_document.js` (PDF 1 image, sans dépendance, probe `temp/page_pdf_probe.mjs`), `page_pdf_export.js` (iframe de capture dédiée puis détruite), commande Tauri `export_file_save` → Téléchargements (+ permission `file-export`) ; repli `<a download>` ; app réelle : PDF A4 avec le contenu à sa place
- [ ] iOS : pas de commande Swift `export_file_save` → repli `<a download>` inopérant sur `atome:`

## Lots 1-3 — Caméra de vue
- [x] 1a Rust : `project_view.rs` (parent virtuel : `GlobalTransform = vue ∘ Transform` en PostUpdate après propagation, avant visibilité ; calques sélection/ombre/onde/proxy de découpe suivis via leur propriétaire), champ `project_space` sur `AtomeRenderNode` (serde default), ops `project_view` / `project_space` (web + pont natif) ; 6 tests Rust ; wasm reconstruit ; desktop compile
- [x] 1b `project_view_camera.js` (maths pures, sans dépendance) + `project_view_camera_runtime.js` (moteur, persistance `preferences.projectViews` par utilisateur, 100 %, Tout voir dans la zone libre, suspension hors mode Naturel) ; `project_view_space.js` (règle : atomes + fantômes de page + aperçu de création) ; probes 8/8
- [x] 2 conversions : `surface_runtime` (point projet portant `screen`, `anchor_rect`), `scene_graph` hit-test par nœud (UI en écran, atomes en projet, tolérance ÷ zoom), `project_scene_hit_testing` (index spatial interrogé en projet ET écran), rail du fond + Mystic (point UI → projet), timeline (point écran), texte sur le fond, `computeDropBase` (tous les dépôts), poignées SVG, tests contextuels (groupe/recadrage)
- [x] app réelle `temp/project_view_zoom.probe.mjs` (fenêtre GPU) : rendu zoomé/décalé, UI non zoomée, sélection au point zoomé, ancien point vide, glisser = delta ÷ zoom, page créée au point projet, dépôt projeté, Tout voir, retour 100 %
- écran voulu (non converti) : seuils tap/drag en px, rail ancré par latéralité, textarea caché, vues Liste/Matrice (UI), lasso DOM (reconverti en rect client puis testé en écran) ; DOM hérité non converti : `core/atome_events/drag_runtime|drag_arm|resize|placement|text_edit` (hôtes DOM, les atomes du Naturel sont Bevy)
- [x] texte net au zoom : palier 1/2/4 dans la clé du résolveur de texte, re-raster des textes du projet 250 ms après la stabilisation (moteur web ; le natif garde sa résolution) — vérifié à l'image
- [x] masque de retouche du dessin (`__eve_draw_retouch_`) ajouté à l'espace projet
- [x] 3 gestes : `project_view_gesture_runtime.js` (deux doigts sur le fond : capture fenêtre + `pointercancel` du 1er doigt ; ctrl/⌘+molette bornée ±10/évt ; molette = pan ; gestes Safari), branché après l'UI et l'objet via `window.__eveProjectViewGestures`
- [x] rail du fond : Zoom (slider %, valeur tapée au double-clic), 100 %, Tout voir (`main_menu_view_zoom_content.js`, aiguillés dans `project_background_rail_runtime.js`) ; `sliderFollowsValue` (le slider suit le zoom au repos)
- [x] correctif préexistant : `bevy_ui_pointer_runtime` laissait un survol périmé (bouton « Organiser ») avaler toute molette du canevas
- [x] mémorisation : fin de geste sans changement mémorise quand même ; vérifié serveur (`loadUserProfile`) et après rechargement
- [x] app réelle `temp/project_view_gestures.probe.mjs` 12/12
- [ ] non vérifiés : iOS (tactile WKWebView, pas de commande Swift d'export), rendu natif Tauri (compile, non exécuté), surfaces verre sur un atome zoomé, vidéo zoomée

## Régression corrigée (27 sept. 2026)
- [x] Mystic décalé proportionnellement au zoom : la plaque `__intuition_mystic_surface_…` n'était pas en `__eve_` et suivait la vue. Règle : tout identifiant en `__` est système (écran), sauf préfixes projet explicites ; même règle pour « Tout voir ». Vérifié à 50 % et 200 % (`temp/project_view_mystic.probe.mjs`).
