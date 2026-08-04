# Projets, objets et thumbnails

- [ ] [Fonctionnel][Projet] Créer plusieurs projets.
- [ ] [Fonctionnel][Navigation] Passer d’un projet à l’autre.
- [ ] [Fonctionnel][Objet] Créer des objets dans les projets.
- [ ] [Fonctionnel][Objet] Créer des objets différents dans chaque projet.
- [ ] [Fonctionnel][Objet] Bouger les objets dans les projets.
- [ ] [Fonctionnel][Objet] Vérifier que les objets se déplacent correctement.
- [ ] [Fonctionnel][Isolation] Vérifier que chaque objet reste dans le bon projet.
- [ ] [Fonctionnel][Isolation] Vérifier que les modifications restent dans le bon projet.
- [ ] [Fonctionnel][Isolation] Vérifier que les projets ne sont pas altérés lors du passage d’un projet à l’autre.
- [ ] [Fonctionnel][Comptage] Vérifier que le nombre de projets reste cohérent.
- [ ] [Fonctionnel][Comptage] Vérifier que le nombre de projets ne change pas sans action explicite.
- [ ] [Fonctionnel][Isolation] Vérifier l’absence de confusion entre les projets.
- [ ] [Fonctionnel][Isolation] Vérifier l’absence de mélange entre les objets de différents projets.
- [ ] [Fonctionnel][Persistance] Vérifier que chaque projet conserve bien ses propres objets.
- [ ] [Fonctionnel][Persistance] Vérifier que chaque projet conserve bien ses propres modifications.
- [ ] [Fonctionnel][Ouverture] Ouvrir un projet.
- [ ] [Fonctionnel][Fermeture] Fermer un projet.
- [ ] [Fonctionnel][Ouverture] Vérifier que l’ouverture d’un projet est fluide.
- [ ] [Fonctionnel][Fermeture] Vérifier que la fermeture d’un projet est fluide.
- [ ] [Fonctionnel][Ouverture] Vérifier que les projets s’ouvrent de manière fluide.
- [ ] [Fonctionnel][Fermeture] Vérifier que les projets se ferment de manière fluide.
<!--
Journal thumbnails — 2026-08-04
Chaîne rétablie (liste → capture → carte) puis 5 défauts corrigés dans la capture :
 1. une ressource non résolue (vidéo) faisait échouer TOUTE la vignette → elle est
    maintenant signalée dans `incomplete_resources` et la capture aboutit ;
 2. l'iframe de capture étant gardée vivante, les atomes en échec d'une capture
    fuyaient dans les suivantes → chaque capture ne considère que ses propres ids ;
 3. l'iframe hôte était dimensionnée sur la boîte carrée, donc le renderer
    reforçait un bitmap carré → hôte dimensionné à la géométrie exacte ;
 4. les dimensions persistées étaient celles demandées, pas celles du bitmap réel
    → lues sur le canvas au moment de l'encodage (sinon la carte écrase l'image) ;
 5. `await previewWarmup` bloquait l'ouverture d'un projet sur ~1 s de WASM.
Dashboard : une catégorie en échec vidait le cache de toutes les autres, et la
capture était attendue avant l'affichage du contenu → isolation par catégorie,
et contenu peint avant le rafraîchissement de la vignette.
Vérifié en app : paysage 1280x720 → 384x216 (ratio 1.778, métadonnées = bitmap),
vidéo cassée signalée sans perdre la vignette, captures successives distinctes.
Médias dans le thumbnail (2e passe) :
 6. une vidéo ne pouvait JAMAIS apparaître — `bevy_media_texture_resolver` refuse
    un nœud vidéo sans poster (`bevy_media_texture_video_gpu_source_only`), les
    frames vidéo passant par le GPU, pipeline absent de la capture hors écran.
    → `project_preview_video_posters.js` décode la 1re frame dans le document
    principal (via `captureVideoPosterDataUrl`, déjà existant) et l'injecte en
    `media_poster_data_url` avant la capture. ~1,4 s, borné par timeout.
    L'image importée, elle, marchait déjà : elle disparaissait uniquement parce
    que la vidéo faisait avorter toute la capture (défaut n°1).
Vérifié en app, visuellement : capture image + vidéo + texte → les trois présents,
384x216 (ratio 1.778 du viewport 1280x720), `incomplete_resources` vide.
Fiabilité (3e passe — éléments manquants au hasard) :
 7. une vidéo sans dimensions connues est rejetée
    (`bevy_media_texture_video_metadata_pending`) puis RETENTÉE 8 fois avec des
    délais croissants (~13,7 s cumulés). La capture abandonne à 4,2 s : la vidéo
    manque, ET les textures pas encore appliquées au moment du timeout manquent
    aussi — d'où « je mets une 4e image, une autre disparaît ».
    → `withProjectPreviewVideoPosters` stampe désormais media_width/height
    depuis le poster décodé : le 1er essai réussit, plus de boucle de retry.
 8. l'attente de capture concluait « terminé » sur un état transitoire : la file
    est remplie un tick après le montage, et un retry est réarmé derrière un
    timer. → `previewResourcesSettled` tient compte du timer programmé, et
    l'état doit être stable sur 3 sondages consécutifs.
Harnais déterministe : temp/probe_deferred_texture_integrity.mjs (16 scénarios,
dont 24 entrelacements de stress) — tout vert. Il injecte readSurfaceState/
writeSurfaceState/timers, donc les courses sont reproductibles sans navigateur.
Test bout-en-bout à lancer À LA MAIN, onglet au premier plan (rAF coupé sinon) :
coller temp/thumbnail_integrity_browser_test.js dans la console de l'app.
9 scénarios, contrôle couleur par élément + vignettes affichées.
Fiabilité (4e passe — « au-delà de 4-5 éléments il en manque la moitié ») :
 9. CAUSE RACINE. La file de textures différées n'avance que d'un lot de
    DEFERRED_TEXTURE_BATCH_SIZE=3 par `setTimeout`, et un navigateur bride les
    timers à ~1 s dans une frame qu'il ne peint pas — ce qu'EST l'iframe de
    capture (1px, z-index -1). Mesuré en app : `setTimeout(fn, 16)` met 1000 ms.
    Plafond dur à 9 éléments = 3 lots, le 4e démarrant après la deadline 4,2 s.
    → marqueur `dataset.eveDeferredTexturePolicy = 'eager'` posé par la capture
    sur son canvas : file drainée en une passe, progression par microtâches
    (jamais bridées). Les retries gardent leur timer (vraie attente).
    L'UI live n'est pas touchée : sans le marqueur, lotissement inchangé.
    Mesures (timers bridés 1000ms, budget 4200ms) :
      avant  3→3/3  6→6/6  8→8/8  10→9/10  12→9/12  16→9/16 (3225ms)
      après  3→3/3  6→6/6  8→8/8  10→10/10 12→12/12 16→16/16 (400ms)
    Probe : temp/probe_throttled_timer_capture.mjs (temps simulé, déterministe).
10. La vidéo d'un VRAI projet (superman.mp4) restait absente : mon détecteur
    `isVideoPreviewRecord` testait `type||kind||props.type||props.kind === 'video'`
    alors que le renderer utilise `normalizeType` (render_atom.js), qui lit aussi
    `properties.media_kind` / `mediaKind` et normalise les alias. Les records
    réels n'étaient donc pas reconnus → aucun poster → rejet par le résolveur.
    → détection ET source déléguées à `normalizeRenderAtom` : une seule autorité,
    divergence désormais impossible.
    Probe : temp/probe_video_record_detection.mjs — 11 formes de record, toutes
    comparées au verdict du renderer ; elle démontre aussi ce que l'ancien
    contrôle ratait (media_kind, mediaKind, video_recording).
11. CAUSE STRUCTURELLE (proposée par l'utilisateur, retenue). La capture partait
    de `getProjectSceneState().records`, une projection de RENDU = ce qui est
    monté, pas ce que le projet contient. `loadProjectAtomes` n'était consulté
    que si cette liste ressortait VIDE — donc une scène partiellement montée
    donnait une vignette partielle, silencieusement et différemment à chaque fois.
    → l'ensemble vient désormais des atomes (autorité), la scène ne fournissant
    que la version plus fraîche des atomes qu'elle connaît déjà. Union par id via
    `mergePreviewRecords` (premier ensemble gagnant). Échec de chargement des
    atomes = repli sur la projection, jamais d'échec de capture.
    Fraîcheur : non problématique, les atomes sont commités en continu ; et
    l'union couvre en plus les records ÉPHÉMÈRES qui n'existent que dans la scène
    (project_scene_runtime.js `preserveEphemeralRecords`) et qu'une approche
    « atomes seuls » perdrait.
    Probe : temp/probe_preview_uses_project_atomes.mjs (5 cas : scène partielle,
    déplacement non commité, scène vide, atomes indisponibles, wallpaper exclu).
    Rouge contre la version précédente sur « atomes consultés même si scène
    non vide ».
12. « Le thumbnail ne se met pas à jour quand j'ouvre le Dashboard ».
    `open()` a deux chemins. Le chemin de REPRISE (arbre Bevy resté monté,
    `suspended = true`) retournait avant tout appel à `schedulePostOpenHydration`
    → `refreshCurrentProjectPreview` purement ignoré. Or la reprise est le cas
    NORMAL : seule la toute première ouverture passe par le chemin complet.
    D'où : 1re ouverture = capture OK, puis plus jamais.
    → le chemin de reprise planifie désormais l'hydratation post-ouverture avec
    le drapeau, après avoir désuspendu l'arbre.
    Probe : temp/probe_dashboard_resume_refresh.mjs — instancie le vrai runtime
    avec doublures (uiRuntime, adapters) et observe les appels `listMany` :
    reprise + drapeau → passe forcée sur ['projects'] ; sans drapeau → aucune.
    Rouge vérifié en neutralisant UNIQUEMENT le bloc ajouté.
13. « Ça rafraîchit quand ça y pense, ou après un reload complet de l'app ».
    Le rendu qui suit la capture passait `preserveMountedOverlayRecords: true`.
    Or bevy_ui_project_overlay_runtime.js:154 JETTE tout record dont l'id est
    déjà monté. La carte projet existe déjà et seule sa `source` change → la
    vignette fraîche était filtrée avant même le diff par contenu, et la carte
    gardait l'ancienne image jusqu'à un remontage de l'arbre (= reload).
    Ce mode est INTENTIONNEL (pinned par tests/eve/bevy_ui_main_menu_overlay_atomic.test.mjs:388,
    qui vérifie qu'un record monté garde son ancienne couleur) : il empêche
    l'arbre complet d'écraser la peinture structurelle à l'ouverture. On ne
    touche donc PAS au contrat partagé.
    → `renderHydrated({ preserveMounted })` : preserve pour l'hydratation
    d'ouverture (inchangé), PAS de preserve pour le rendu post-capture.
    Coût nul : updateOverlayRecords diffe déjà par contenu en aval
    (sameRenderValue), donc seuls les records réellement modifiés sont poussés.
    Probe étendue : temp/probe_dashboard_resume_refresh.mjs observe désormais
    `preserveMountedOverlayRecords` à chaque mountTree.
    Rouge vérifié : avec l'ancien comportement, le montage post-capture ressort
    à `true` (vignette jetée) ; avec le correctif, `false`.
LEÇON : ne jamais réimplémenter une classification déjà faite ailleurs dans le
pipeline. Deux fois de suite le bug est venu de là (fit/contain, puis type vidéo).
LEÇON 3 : une optimisation « ne re-projette pas ce qui est déjà monté » est une
bombe pour toute mise à jour de CONTENU sur un id stable. Vérifier à quel rendu
elle s'applique avant de la réutiliser.
LEÇON 2 : ne pas dériver l'ensemble à capturer d'une projection de rendu — partir
de la source de vérité (les atomes) et n'utiliser la projection que pour la
fraîcheur.
NON revérifié en app : les 9 scénarios du test navigateur, le cas portrait, et le
bout-en-bout Dashboard avec un vrai projet.
-->
- [ ] [Fonctionnel][Thumbnail] Vérifier qu’un thumbnail est créé à chaque ouverture de projet.
- [ ] [Visuel][Thumbnail] Vérifier que le thumbnail correspond bien au projet ouvert.
- [ ] [Visuel][Thumbnail] Vérifier que le thumbnail contient les éléments du projet.
- [ ] [Visuel][Thumbnail] Vérifier que le thumbnail contient les atomes visibles à l’écran.
- [ ] [Visuel][Thumbnail] Vérifier que le thumbnail ne contient pas le fond d’écran.
- [ ] [Visuel][Thumbnail] Vérifier que le fond d’écran n’est jamais intégré au thumbnail.
- [ ] [Fonctionnel][Renommage] Renommer un projet.
- [ ] [Fonctionnel][Renommage] Vérifier que le renommage du projet fonctionne correctement.
- [ ] [Visuel][Renommage] Vérifier que le nouveau nom du projet est bien affiché.
- [ ] [Fonctionnel][Renommage] Vérifier que le renommage ne crée pas de confusion entre projets.
- [ ] [Fonctionnel][Renommage] Vérifier que le renommage ne modifie pas le contenu du projet.
- [ ] [Fonctionnel][Renommage] Vérifier que le renommage ne modifie pas les autres projets.
- [ ] [Fonctionnel][Renommage] Vérifier que le projet renommé conserve ses objets.
- [ ] [Fonctionnel][Renommage] Vérifier que le projet renommé conserve ses modifications.
- [ ] [Fonctionnel][Rechargement] Vérifier que le rechargement ne casse pas les projets.
- [ ] [Fonctionnel][Rechargement] Vérifier que le rechargement ne casse pas les objets.

## Journal — 2026-08-03 : restauration des thumbnails du Dashboard

La génération de vignettes était cassée depuis `c69aee0e` (eVe `a92797f`, 19 juil. 2026).
Le pipeline de capture n'avait pas été supprimé, seulement débranché aux deux bouts.
Quatre correctifs :

1. `preview_url` était strippé de la liste des projets (`PROJECT_LIST_EXCLUDED_PARTICLES`,
   jusque dans le SQL) et l'option `includePreviewSources` n'avait aucun appelant.
   `loadProjectList` la passe désormais à `true`.
2. `refreshCurrentProjectPreview` était câblé de bout en bout dans le runtime Dashboard
   mais aucun appelant de production ne le passait. `openWorkspaceDashboardAndMainMenu`
   le passe maintenant quand un projet courant existe.
3. Le viewport de capture était résolu dimension par dimension depuis un canvas déjà
   passé en `display:none` → ratio faux (repli sur la boîte 640×400). Résolution par
   paire, avec repli sur le backing store du canvas qui survit au masquage.
4. `requestAnimationFrame` ne se déclenche pas quand la page n'est pas peinte (onglet en
   arrière-plan, fenêtre minimisée, iframe cachée). Les boucles de capture l'attendaient
   nu : elles pendaient indéfiniment, leurs gardes de timeout n'étant évaluées qu'après
   l'`await`, et la file sérielle de captures était alors bloquée pour toute la session.
   `waitAnimationFrame` fait maintenant courir rAF contre un timer.

Boîte de capture passée à 256×256 (carrée) : le plus grand côté de l'écran est réduit à
256, portrait et paysage à budget égal, ratio conservé. Les anciennes vignettes en base
étaient des PNG pleine résolution de 110–160 Ko ; les nouvelles sont du WebP de ~4–8 Ko.

Probes : `temp/probe_thumbnail_ratio.mjs`, `temp/probe_thumbnail_wiring.mjs`,
`temp/probe_capture_wait.mjs`, `temp/probe_thumbnail_esm_link.mjs`,
`temp/probe_viewport_discriminates.mjs` — toutes vertes.

**Reste à vérifier à la main** (non validé : la session invitée en navigateur ne peut pas
écrire côté backend — `backend: local_guest` attend Tauri — et le panneau navigateur a
cessé de compositer) : les cases [Thumbnail] ci-dessus, sur l'app Tauri ou avec un compte
réel. Vérifier en particulier une fenêtre en portrait et une en paysage : marges haut/bas
en paysage, gauche/droite en portrait, jamais d'image déformée ni recadrée au carré.

