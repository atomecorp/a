# Rapport sanitaire du panel Moelcule Mtrax

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

Date: 2026-05-14

## Perimetre inspecte

Le panel Mtrax est principalement construit dans:

- `src/application/eVe/domains/mtrax/ui/ensure_runtime.js`
- `src/application/eVe/domains/mtrax/ui/styles.js`
- `src/application/eVe/domains/mtrax/ui/panel_dialog_runtime.js`
- `src/application/eVe/domains/mtrax/ui/docked_renderer_runtime.js`
- `src/application/eVe/domains/mtrax/ui/embedded_footer_drag_runtime.js`
- `src/application/eVe/domains/mtrax/ui/embedded_footer_resize_runtime.js`
- `src/application/eVe/domains/mtrax/preview/preview_layout_runtime.js`
- `src/application/eVe/domains/mtrax/preview/preview_layout_bindings_runtime.js`
- `src/application/eVe/domains/mtrax/preview/preview_host_resolution_runtime.js`
- `src/application/eVe/domains/mtrax/timeline/loop_cells_runtime.js`
- `src/application/eVe/intuition/eVeIntuition.js`
- logs: `logs/new_logs.txt`, `logs/interesting_logs.txt`

Ce rapport ne modifie pas le code applicatif.

## Resume executif

Le panel Molecule/Mtrax a une dette de conception importante. Les problemes visibles viennent surtout de trois decisions structurelles:

1. Le panel a plusieurs modes de montage concurrents: dialog normal, dock dans un groupe, embed dans le footer.
2. La preview peut etre interne, cachee, ou externalisee vers l'atome groupe visible.
3. La zone tracks/cells est pensee comme un split horizontal fixe, pas comme un layout responsive.

Ces modes ne sont pas isoles par un modele de layout clair. Le DOM est cree une fois, puis corrige par des styles imperatifs, des datasets, des observers, des RAF multiples et des synchronisations successives. Cela explique les effets de bord: preview hors panel, image de fond au sommet, splitter instable, panel qui bouge pendant des interactions internes, et comportement peu fiable sur formats portrait/paysage.

## Structure DOM actuelle

Dans `ensure_runtime.js`, le panel est construit ainsi:

- `body`
  - `previewSection`
    - `previewHost`
  - `content`
    - `scroll` pour timeline/tracks
    - `loopCellsSplitter`
    - `loopCellsPanel`
  - `controls`

References:

- `ensure_runtime.js:204-216`: creation de `content`, `previewSection`, `previewHost`.
- `ensure_runtime.js:218-256`: creation de `scroll`, timeline, ruler, tracks, playhead.
- `ensure_runtime.js:258-275`: creation du splitter et du panel cells.
- `ensure_runtime.js:277-279`: ordre final dans `body`.

Cette structure impose deja une preview au-dessus de la timeline, et non un layout adaptatif ou la preview/tracks/cells peuvent se reconfigurer proprement selon l'espace disponible.

## Probleme 1: la preview peut etre volontairement externalisee hors du panel

Constat:

- `preview_host_resolution_runtime.js:86-90` choisit le host du groupe visible si le root a `data-eve-mtrack-preview-externalized="true"` ou `data-eve-mtrack-docked="true"`.
- `styles.js:515-520` cache explicitement `#eve_mtrack_dialog__preview_section` quand `data-eve-mtrack-preview-externalized="true"` est present.
- `styles.js:118-122` cache aussi la preview en mode `eve-mtrack-in-footer`.

Impact:

- La preview n'est pas garantie comme contenu du panel.
- En mode dock/footer, le panel peut afficher seulement les tracks/cells, pendant que la preview est rendue ailleurs.
- Cela correspond directement au symptome: "le preview n'est pas integre a l'interieur mais il est a l'exterieur du panel".

Risque architectural:

- Les interactions preview utilisent parfois `mtrackState.ui.previewHost`, parfois le host groupe resolu.
- Un utilisateur peut percevoir une meme fonctionnalite comme deux surfaces differentes selon le mode du panel.
- Les tests de placement du panel peuvent passer alors que le rendu utile est hors du panel.

Recommandation:

- Decider une regle unique: le panel Mtrax doit posseder sa preview interne par defaut.
- Si une preview externalisee est necessaire pour l'edition directe du groupe, elle doit etre un mode nomme, visible dans l'etat, et jamais active implicitement par le simple fait d'etre docke.
- Supprimer le couplage "docked == preview externalisee" de `resolveActiveGroupPreviewHost`.

## Probleme 2: image/video/svg de preview affichee au sommet du host docke

Constat:

- `styles.js:62-74` ajoute un overlay sombre sur `.eve-mtrack-docked-host[data-eve-mtrack-edit-mode="true"]::before`.
- `styles.js:75-89` force les `img`, `video`, `svg` enfants directs du host docke en `position:absolute`, `top:0`, `height: var(--eve-mtrack-preview-base-height, 50%)`, `z-index:2`.
- `styles.js:90-95` cache ces elements seulement si le renderer est `webgpu`.

Impact:

- Si le host groupe contient une image/video/svg issue de la preview ou du media source, elle est forcee au sommet du host docke.
- Cela peut donner l'impression d'une image "en fond" au sommet du panel ou du container, surtout quand Mtrax est docke dans l'atome.
- La logique est CSS globale et cible les enfants directs du host, pas un sous-conteneur preview explicite.

Risque architectural:

- Des medias legitimes du groupe peuvent etre stylises comme preview Mtrax.
- L'etat visuel depend de `data-eve-mtrack-edit-mode` et `data-eve-mtrack-preview-renderer`, pas d'un composant preview dedie.
- Les changements de renderer peuvent laisser des elements fantomes visibles.

Recommandation:

- Introduire un conteneur preview dedie dans le panel et dans le host docke si besoin.
- Ne plus cibler `> img`, `> video`, `> svg` au niveau du host entier.
- Isoler le fond/overlay de preview dans une classe explicite, par exemple `.eve-mtrack-preview-surface`.

## Probleme 3: le splitter tracks/cells est fragile

Constat:

- Le layout principal `.eve-mtrack-content` est un flex horizontal fixe (`styles.js:217-223`).
- Le splitter est une barre verticale de 6px (`styles.js:235-243`).
- Le panel cells a une largeur initiale fixe de 320px (`styles.js:248-264`).
- La seule adaptation CSS est `@media (max-width: 1180px)` qui reduit cells a 260px (`styles.js:455-461`).
- Le redimensionnement calcule la largeur avec `contentRect.right - clientX` capture au `pointerdown` (`loop_cells_runtime.js:1719`, `loop_cells_runtime.js:1726-1741`).
- Les listeners globaux `pointermove/pointerup/pointercancel` sont ajoutes sans capture pointer (`loop_cells_runtime.js:1769-1771`).

Impact:

- Le splitter ne sait gerer qu'un split horizontal.
- Il n'y a pas de mode vertical pour portrait.
- Si le content bouge, si le panel est deplace, ou si le footer ajuste son ancre pendant le drag, la reference `contentRect.right` devient stale.
- Le latch de fermeture a 8px du bord droit peut fermer cells brutalement lors d'un drag proche du bord.

Lien avec le symptome "le separateur deplace le panel":

- Le splitter arrete `preventDefault`, mais ne stoppe pas la propagation.
- En mode footer, le header du panel a sa propre logique de drag globale (`embedded_footer_drag_runtime.js`), et plusieurs interactions Mtrax emettent des guards d'interaction internes.
- La protection contre le drag panel repose sur datasets/classes et conventions, pas sur un gestionnaire centralise de gesture.
- Si un event est capte par le systeme de dialog/drag parent ou par un overlay, le panel peut suivre le mouvement pendant que le splitter change la largeur.

Recommandation:

- Centraliser les gestures panel/resize/splitter dans une seule couche d'arbitrage.
- Ajouter `stopPropagation`/`stopImmediatePropagation` et `setPointerCapture` au splitter.
- Recalculer le rect de `content` pendant le drag, ou verrouiller explicitement la geometrie du panel pendant l'interaction.
- Remplacer le latch implicite par un bouton/collapse explicite.

## Probleme 4: layout non responsive pour tracks et cells

Constat:

- `.eve-mtrack-content` est toujours `display:flex` horizontal.
- `.eve-mtrack-loop-cells-panel` est toujours un panneau lateral.
- Aucun `@media` ne passe `.eve-mtrack-content` en colonne.
- Aucun `ResizeObserver` ne calcule l'orientation effective du panel pour placer cells a droite en paysage et en dessous en portrait.
- `MTRACK_MIN_TIMELINE_W = 920` (`constants.js:6`) impose une timeline large avec scroll horizontal.

Impact:

- Sur format portrait ou panel etroit, tracks et cells se compressent au lieu de se reflow.
- La zone cells reste a droite, prend une largeur fixe, et reduit fortement la timeline.
- Le panel devient difficile a utiliser sur iPhone/iPad portrait ou dans un footer etroit.

Recommandation:

- Introduire un vrai modele de layout:
  - `landscape`: tracks a gauche, cells a droite.
  - `portrait`: tracks au-dessus, cells en dessous.
  - `compact`: cells collapsible par onglet/toggle si l'espace est trop faible.
- Deriver ce mode depuis la taille reelle du panel, pas depuis `window.innerWidth` uniquement.
- Utiliser un `ResizeObserver` sur le root panel pour poser `data-layout="landscape|portrait|compact"`.
- Adapter le splitter:
  - horizontal/vertical selon layout.
  - largeur cells en paysage.
  - hauteur cells en portrait.

## Probleme 5: preview height calculee par contraintes verticales, pas par composition responsive

Constat:

- Le ratio preview par defaut est 0.33 (`constants.js:64`).
- La hauteur minimale preview est 132px (`constants.js:65`).
- `preview_layout_runtime.js:56-95` calcule des bornes min/max selon body, controls, scroll et hauteur utile tracks.
- `preview_layout_runtime.js:98-136` applique une hauteur inline en pixels.
- `preview_layout_bindings_runtime.js:63-69` observe seulement `ui.body`, puis reapplique le ratio.

Impact:

- Le layout est essentiellement vertical: preview, content, controls.
- La preview est dimensionnee en hauteur, mais pas par rapport a son aspect ratio video, ni au mode portrait/paysage.
- Quand la preview est cachee/externalisee, la logique de hauteur peut continuer a exister dans l'etat sans correspondre au DOM visible.

Recommandation:

- Faire de la preview une region de layout avec aspect ratio et role clair.
- Ne pas appliquer de hauteur inline si la preview est externalisee/cachee.
- Remplacer une partie des calculs imperatifs par CSS grid/flex avec variables simples et etat declaratif.

## Probleme 6: trop de modes implicites et datasets concurrents

Modes observes:

- Dialog normal: root dans le panel layer.
- Docked: `data-eve-mtrack-docked="true"`.
- Embedded footer: `data-eve-mtrack-embedded-in-footer="true"` + classe `eve-mtrack-in-footer`.
- Preview externalized: `data-eve-mtrack-preview-externalized="true"`.
- Edit mode sur host: `data-eve-mtrack-edit-mode="true"`.

Impact:

- Les styles et resolvers raisonnent sur plusieurs flags qui peuvent se combiner.
- Certains modes changent la structure effective sans changer le DOM.
- `docked_renderer_runtime.js:25-78` modifie header/footer/body via styles inline selon le mode docked.
- `panel_layer_contract_runtime.js` requalifie le root selon son parent, ce qui rend le mode dependant du montage DOM.

Recommandation:

- Remplacer les flags disperses par un etat unique de layout, par exemple:
  - `placement: floating | docked | footer`
  - `previewPlacement: internal | external`
  - `contentLayout: landscape | portrait | compact`
- Generer les classes/datasets depuis cet etat unique.
- Eviter que le parent DOM decide implicitement du comportement preview.

## Probleme 7: robustesse des observers, RAF et rebinds

Constat:

- Plusieurs modules planifient des RAF ou timeouts: docked layout sync, preview layout resize sync, ruler scroll RAF, loop cells render frame.
- `docked_renderer_runtime.js` lance jusqu'a 6 passes de sync layout pour stabiliser le dock.
- `mount_state_runtime.js` invalide l'UI si un element attendu n'est plus dans le bon parent.
- Les bindings sont proteges par des flags d'etat, mais l'UI peut etre detachee/recreee.

Impact:

- Le comportement peut dependre de l'ordre des frames.
- Un mode de montage instable peut provoquer des rebinds partiels.
- Les bugs visuels peuvent etre intermittents: preview visible une frame, cachee ensuite, splitter calcule sur une ancienne geometrie, etc.

Recommandation:

- Limiter les passes correctives et preferer un layout declaratif.
- Ajouter une fonction unique `syncMtrackPanelLayout()` pure autant que possible, appelee depuis les observers.
- Journaliser explicitement les transitions de mode: placement, previewPlacement, contentLayout.

## Probleme 8: nomenclature incoherente Mtrack / Mtrax / Mtracks

This rename work now has a dedicated task in [todo/molecule/molecule_rename_mtrack_to_molecule.md](todo/molecule/molecule_rename_mtrack_to_molecule.md).

Summary:

- The visible product domain is Molecule, but internal naming still mixes `mtrack`, `mtrax`, `mtracks`, `hmtracks`, `MTRACK`, and `MTRAX`.
- The rename must move internal naming toward `molecule` progressively, while keeping temporary compatibility aliases only at explicit public boundaries.
- The target state is a codebase where the application domain, APIs, and diagnostics read primarily as `molecule`.

## Probleme 9: factorisation insuffisante

Constat:

- Le panel est compose de nombreux modules, mais la responsabilite reste diffuse.
- Les decisions de layout sont reparties entre CSS, datasets, runtime panel, preview resolver, docked renderer, footer embed, loop cells et intuition bridge.
- Plusieurs modules lisent/ecrivent directement la geometrie DOM.
- Les gestures panel, footer, splitter, preview et timeline ne partagent pas un arbitre commun.

Impact:

- La modularisation actuelle decoupe le code, mais ne reduit pas assez la complexite systeme.
- Les bugs de layout traversent plusieurs modules.
- Les changements locaux ont un risque eleve d'effet de bord.

Recommandation:

- Factoriser autour de sous-domaines stables:
  - `molecule/layout`: calcule declaratif du layout actif.
  - `molecule/panel`: placement, chrome, open/close, mode floating/docked/footer.
  - `molecule/preview`: host interne/externe, renderer, lifecycle.
  - `molecule/timeline`: ruler, tracks, clips, playhead.
  - `molecule/cells`: loop cells, splitter, orientation, resize.
  - `molecule/gestures`: arbitrage pointer/drag/resize.
  - `molecule/debug`: logs, snapshots, probes.
- Separer les fonctions pures de calcul de layout des fonctions qui ecrivent dans le DOM.
- Centraliser les constantes de dimensions et supprimer les valeurs dupliquees ou implicites.
- Eviter les corrections imperatives dispersees apres rendu; preferer un etat de layout unique qui produit les classes/datasets.

## Probleme 10: debug massif necessaire

Constat:

- Les logs actuels sont riches pour audio/video/playback, mais faibles pour les problemes de panel.
- Les bugs signales sont des bugs de geometrie, montage DOM, host preview, propagation pointer et mode responsive.
- Les traces existantes ne montrent pas assez clairement quelle surface est active ni pourquoi.

Recommandation:

- Ajouter un debug massif, mais structure et activable par flag.
- Capturer des snapshots layout a chaque transition importante:
  - ouverture/fermeture panel;
  - changement floating/docked/footer;
  - changement preview interne/externe;
  - resize root/body;
  - debut/move/fin drag splitter;
  - debut/move/fin drag panel/footer;
  - changement portrait/paysage/compact;
  - rebind/invalidation UI.
- Chaque snapshot doit inclure:
  - `placement`;
  - `previewPlacement`;
  - `contentLayout`;
  - dimensions root/body/preview/content/scroll/cells;
  - host preview choisi;
  - datasets actifs sur root et host;
  - pointer target/path pour les gestures critiques;
  - raison de la transition.
- Ajouter des probes automatises:
  - panel floating desktop;
  - panel docked groupe;
  - panel footer;
  - portrait et paysage;
  - resize splitter;
  - preview interne visible;
  - absence d'image/video/svg fantome;
  - drag splitter sans deplacement panel.

Objectif:

- Les problemes visuels doivent devenir reproductibles via logs + probes, pas seulement observables manuellement.
- Le debug doit etre assez complet pour comparer deux frames consecutives et comprendre quelle logique a deplace/cache une surface.

## Logs pertinents

`logs/interesting_logs.txt` montre une activite Mtrax importante:

- initialisation WebGPU iOS;
- nombreux `MTRACK_VIDEO_DIAG SOURCE_CHANGED` et `UPLOAD_READY`;
- nombreux scrubs `MTRACK_IOS_SCRUB`;
- audio stage `hmtracks_audio_stage`.

Les logs confirment une forte activite preview/audio/video, mais ne donnent pas un diagnostic direct du layout panel. Il manque des logs utiles:

- mode de placement panel au moment de l'ouverture;
- host preview effectivement choisi;
- presence de `data-eve-mtrack-preview-externalized`;
- dimensions root/body/preview/content/scroll/cells;
- debut/fin de drag splitter avec rects live.

## Priorites recommandees

### P0: clarifier le contrat preview

Objectif: la preview du panel doit etre interne par defaut.

Actions:

- Supprimer le comportement implicite `docked => preview externalisee`.
- Ne cacher `preview_section` que dans un mode explicitement demande.
- Isoler le rendu preview dans un host dedie.

### P1: remplacer le layout tracks/cells par un layout responsive

Objectif: cells a droite en paysage, cells en dessous en portrait.

Actions:

- Ajouter un etat `contentLayout`.
- Utiliser le root panel comme reference de dimensions.
- Adapter CSS grid/flex selon `data-content-layout`.
- Adapter le splitter selon orientation.

### P1: fiabiliser le splitter

Objectif: le splitter ne doit jamais deplacer le panel.

Actions:

- Capturer le pointer sur le splitter.
- Stopper propagation et immediate propagation au `pointerdown`.
- Recalculer les bounds pendant le drag.
- Desactiver explicitement le drag panel pendant le resize cells.

### P2: retirer les styles globaux dangereux sur le host docke

Objectif: eviter l'image/video/svg fantome au sommet.

Actions:

- Ne plus styler `.eve-mtrack-docked-host > img/video/svg`.
- Encapsuler les medias preview dans une surface dediee.
- Nettoyer les elements preview obsoletes quand le renderer change.

### P2: simplifier les synchronisations layout

Objectif: rendre les bugs reproductibles.

Actions:

- Reduire les passes RAF multiples.
- Centraliser la lecture/ecriture de geometrie.
- Ajouter des logs de transition de layout.

### P2: lancer le renommage Molecule

Voir la tache dediee [todo/molecule/molecule_rename_mtrack_to_molecule.md](todo/molecule/molecule_rename_mtrack_to_molecule.md).

### P2: factoriser et instrumenter

Objectif: rendre les changements de layout controlables.

Actions:

- Introduire des modules `layout`, `gestures`, `debug` dedies.
- Centraliser les snapshots de geometrie.
- Ajouter des probes pour panel, preview, splitter, portrait/paysage.

## Definition de fini proposee

Le panel peut etre considere sain quand:

- la preview est visible dans le panel en mode normal;
- le mode externalise est explicite et testable;
- aucune image/video/svg non desiree n'apparait en fond ou au sommet du panel;
- le splitter cells ne deplace jamais le panel;
- en paysage, tracks et cells sont cote a cote;
- en portrait, tracks et cells sont empiles;
- le panel reste utilisable avec une largeur inferieure a 700px;
- les dimensions de preview/tracks/cells sont derivees du root panel, pas de constantes globales seules;
- les logs indiquent clairement le host preview choisi et le layout actif.
- la majorite des noms internes utilisent `molecule` au lieu de `mtrack/mtrax/mtracks`;
- les anciens noms restants sont documentes comme compatibilite temporaire ou backend distinct;
- la factorisation separe clairement panel, preview, layout, cells, gestures et debug;
- un mode debug massif permet de diagnostiquer les problemes de layout sans inspection manuelle du DOM.
