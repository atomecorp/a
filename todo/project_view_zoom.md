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

## Surface a nu pendant les gestes (28 sept. 2026)
Le deplacement d'un atome masquait deja ruban, rail, panneaux et cadre de selection pendant
le geste (M8). Tous les autres gestes tenus font desormais la meme chose.
- [x] `gesture_presentation_hold.js` : porte unique de la mise a nu. Jeton porte par la session, compte des gestes qui tiennent : le PREMIER masque, le DERNIER rend. Un pincement d'objet qui reprend une session de deplacement recopie le jeton, donc un seul relachement suffit pour les deux. Le ruban deja masque (Dashboard, plein ecran) le reste : `gesture_chrome_suspension` ne restaure que ce qu'il a suspendu.
- [x] `surface_interaction_runtime.js` : le deplacement d'atome passe par ce verrou (memes effets qu'avant) ; `canvas.__eveSurfaceIntentDispatch` expose le dispatcher d'intents du cadre, pour les gestes qui n'ont pas de session.
- [x] `surface_pinch_runtime.js` : zoom, rotation et recadrage d'objet mettent la surface a nu au premier mouvement reel ; `onGestureEnd` de la session relache sur TOUTES les sorties (relachement, annulation, Escape, blur, molette retombee a 160 ms).
- [x] `project_view_gesture_runtime.js` : pincement deux doigts, gestes natifs Safari et molette (zoom comme panoramique) ; la molette n'a pas d'evenement de fin → relachement a l'inactivite (160 ms, meme delai que le zoom molette d'un objet) ; `blur` / `visibilitychange` soldent tout et liberent les contacts pendants.
- [x] verrous abandonnes (session jamais terminee, document remplace) : soldes quand une toile rouvre une session, sans toucher a ceux du meme document (un panoramique a la molette survit a un appui).
- [x] sondes : `temp/gesture_presentation_hold_probe.mjs` 44/44 (verrou, pincement d'objet tactile et molette, annulation, pincement de vue, molette, gestes natifs, perte de focus, gardes de source), `temp/gesture_chrome_suspension_probe.mjs` 29/29, `temp/gesture_chrome_esm_link_probe.mjs` 14/14, `temp/view_pinch_lock_probe.mjs` vert ; `npm run check:syntax`, `check:m0` ; suite `tests/eve` : meme ensemble d'echecs qu'a HEAD (125, tous preexistants), et les tests cibles sur ce domaine donnent exactement les 6 memes echecs deja presents a HEAD.
- [x] ombre du cadre de selection pendant le pincement d'objet (28 sept.) : le pincement selectionnait l'atome des le deuxieme contact (intent `select` pose par `4e6bfa0a` dans `begin`). Le cadre et son ombre apparaissaient donc pendant la detection du geste (jusqu'au franchissement du seuil de zoom/rotation), la mise a nu les masquait, puis le relachement les restituait — sur un atome que l'utilisateur n'avait pas selectionne. Meme regle que le deplacement d'objet : un geste qui bouge ne selectionne pas ; la selection d'un atome non selectionne attend le relachement et n'est posee que si les contacts n'ont pas bouge ; la molette du trackpad (ctrl+wheel), toujours un mouvement, ne selectionne jamais. `tapSelect` porte ce toucher en attente dans la session, `finish()` le dispatche apres `endSurfacePointerSession` (les chemins annule — `pointercancel`, Escape, blur — ne selectionnent pas). Sonde : `temp/pinch_select_trace_probe.mjs` 11/11 (pincement mobile : aucun `select`, ni au demarrage ni au relachement, `resize.end` toujours emis ; pincement immobile : un seul `select`, au relachement, sans commit ; ctrl+wheel : aucun `select`).
- [ ] non verifie en app reelle : le chrome qui s'efface puis revient a l'image pendant un pincement de vue et une rotation d'objet (les sondes jsdom ne voient pas Bevy ; a confirmer avec `./run.sh` puis `HEADLESS=0 node temp/project_view_gestures.probe.mjs`).
