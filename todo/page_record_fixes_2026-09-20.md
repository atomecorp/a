# Corrections Page / Placeholder / Record — 20 sept. 2026

Suite de `record_page_placeholder_template_2026-09-19.md`. Sept points remontés à l'usage.

## Demande → état
- [x] 1. Page et Placeholder : créer par CLIC (taille par défaut) ou par GLISSER (cadre tracé),
      comme le texte ; la Page devient une palette de formats (libre, 16:9, 4:3, 3:2, A4, carré)
      et le glisser respecte le ratio.
- [x] 2. Déposer sur une page : panneau à deux choix « Inclure » / « Poser dessus ».
- [x] 3. Bug visuel : ce qui dépasse d'une page réapparaissait PENDANT le glisser.
- [x] 4. Création de page très lente, et plusieurs pages figeaient l'application.
- [x] 5. Backspace sous Tauri : « tout a disparu » + erreurs CORS → **rien n'était perdu**.
- [x] 6. Déplacer un objet inclus dans une page : lent, et sans le menu Record/Relire.
- [x] 7. La palette `rec` du rail restait rouge sans pouvoir être éteinte.

## Diagnostic (vérifié, pas supposé)

### 3 — la découpe pendant le glisser
Le chemin rapide du geste envoie `{id, position, taille, échelle, rotation, origine}`
(`project_scene_direct_transform_runtime.js`) — **sans `clip_rect`**. Côté Rust,
`apply_transform` écrit `AtomeClipRect(patch.clip_rect)` sans condition (`render_ops.rs:117`)
et un champ absent vaut `None` : la découpe était effacée à chaque frame, puis rétablie au
relâchement.

### 4 — la lenteur de création
1. L'aperçu du cadre passait par une réconciliation `force: true` sur un préfixe non-overlay :
   le chemin rapide était **structurellement impossible** (`project_scene_direct_prefix_runtime.js:121-134`)
   → **une reprojection complète du projet par mouvement de souris**.
2. `createPage` entrait dans la page créée et n'en sortait jamais : la page suivante naissait
   **dans** la précédente (emboîtement), et la cascade (panneau visuel + rail + navigation)
   valait 3 à 5 rendus complets par création.

### 6 — la lenteur au dépôt
`commitWithPageDrop` classait les **petits-enfants** comme « à déplacer » : un
`combineCanonicalMolecule` par petit-enfant, chacun avec lecture complète du projet +
`loadProjectAtomes(force)` (liste locale **et** distante) + rendu complet, en série. C'était
aussi une faute : glisser une molécule sur une page l'aplatissait.
S'y ajoutait un `getStateCurrent` **par atome touché** à chaque dépôt
(`commitTargetMutations` sans `refreshState: false`).

### 5 — l'écran vide sous Tauri
La suppression est une corbeille douce (`moveAtomesToBlackHole`), restaurable, et refuse une
sélection vide. La fenêtre était restée sur le port de dev 1430 parce qu'axum (3000) n'a pas
répondu dans les 15 s : sur 1430, `/eVe/eVe.js` est servi en HTML, eVe n'a jamais monté.

### 7 — le verrou `rec`
Le rail ne déclarait jamais l'outil `active`, donc la règle R4 (« le parent éteint l'outil
verrouillé ») ne s'armait pas ; et l'intention « c'était allumé » n'était pas transmise (le rail
Bevy n'a pas de nœud DOM). De plus `mode: 'key'` et `mode: 'live'` **n'enregistraient rien** :
`record_action:changed` n'a aucun abonné, `armed_without_target` n'est jamais lu.

## Fait
- `page_formats.js` : formats + cadre pur ; le format **s'inscrit** dans le geste (il ne le
  dépasse jamais). Palette `page_create` portant son outil (R4) ; accent `page`.
- `create_gesture_preview.js` : aperçu partagé Page/Placeholder, préfixe overlay, `force: false`,
  une mise à jour par frame.
- `createPage` ne pose plus de niveau de navigation en mode Naturel ; on entre dans une page par
  double-clic, comme dans tout groupe.
- `page_container_drop.js` : `planPageDropReparent` (racines seulement) + réponse `page_over`.
- `project_view_drop_feedback.js` : le panneau accepte une liste d'options ; variante page à deux
  choix ; la réponse voyage dans `page_drop_choice` (jamais `composition_choice`, dont la liste
  blanche déclencherait un enveloppement).
- `project_scene_direct_transform_runtime.js` : `clip_rect` sur les deux chemins directs, et la
  scène de hit-test suit la découpe pendant le geste ; `pageClipForRecord` partagé avec la projection.
- `commitTargetMutations` : `refreshState: false`. `expandComposedTargets` et la géométrie de
  molécule : index parent→enfants (la seconde est extraite dans
  `molecule_owner_geometry_runtime.js`, le moteur passe de 555 à 498 lignes).
  `readBevyPerfOptIn` mémorisé.
- Rail : Record/Relire suivent le MODE, plus le type de sélection (membre de page compris).
- `rec` : l'état armé est publié et transmis (relâchable), `key`/`live` retirés, remise à zéro au
  changement de projet et à la déconnexion.
- Tauri : attente de 120 s par relances, **message visible** si axum ne répond pas, et origines
  1430 autorisées **en build de développement seulement**.

## Vérification
- Probes Node : `page_clip_during_drag`, `page_drop_choice`, `create_click_or_drag`,
  `record_latch_and_member_rail` (+ les 4 du lot précédent) — toutes vertes ; mutations
  (retrait du `clip_rect`, retrait de l'état publié du rail) → rouges. 42/42 modules liés en ESM.
- `cargo check` de la pile Tauri : compile.
- **App réelle** (`temp/page_fixes_ui.probe.mjs`, serveur 3001, `?perf=1`, vrais gestes) : 7/7,
  zéro erreur console.
  - clic → page 640×360 au point, **194 ms** ;
  - glisser → cadre au ratio, **1 à 2 reprojections pour 23 mouvements** (avant : une par mouvement) ;
  - 5 pages, **toutes filles du projet** (plus d'emboîtement) ;
  - pendant le glisser d'une page, la découpe de son membre **suit** : 760 → 880 ;
  - le rail d'un membre de page contient bien `container_record`.
- `temp/record_page_placeholder_ui.probe.mjs` (lot précédent) : 21/21 après adaptation (la page
  n'est plus entrée automatiquement, la probe y entre explicitement).

## Restes
- Le panneau de dépôt apparaît aussi quand on glisse une page sur une autre page : cohérent,
  mais non demandé — à valider à l'usage.
- L'événement `eve:project-view-navigation-changed` n'a toujours aucun écouteur (code mort
  identifié, non retiré).
- Le démarrage lent d'axum n'est pas corrigé à la source : il est désormais **dit** au lieu
  d'aboutir à une fenêtre vide.
