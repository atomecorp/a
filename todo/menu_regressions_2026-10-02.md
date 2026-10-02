# Régressions et incohérences des tools — plan (2 oct. 2026)

Validation : **Web uniquement** (Chromium réel, serveur 3001, sondes `temp/menu_unification/*.probe.mjs`).

## 1. Ombre standard sur tous les tools

**Cause.** Lors de l'unification, j'ai remplacé l'ombre standard d'atome (`EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.shadow` : noir 0,45, flou 8) par un jeton `toolShadow` très léger (0,2, flou 5).
- Elle est invisible sur fond clair, en particulier sous la poignée Atome blanche et sous le dock Assistant, qui est cette même tuile élargie.
- Sur Mystic, le shader ne peint son ombre de contact que pendant le retournement des plaques (`lifted = abs(sine)`). Au repos, menu ouvert, il n'y a donc aucune ombre.
- Dans le ruban, l'ombre est portée par `_background`, à l'intérieur d'une case `overflow: hidden`. Il faut vérifier qu'elle n'est pas découpée.

**Fichiers.**
- Jetons : `elements/skin/tool_skin.js` (`toolShadow`).
- Builder commun : `intuition/ribbon/bevy_ui_menu_surface.js` (`resolveBevyMenuSurface`, image de tuile-palette).
- Shader Mystic : `atome/renderers/bevy-core/src/assets/shaders/procedural_sdf.wgsl`, avec `intuition/mystic/intuition_mystic_menu_renderer.js` (`mystic_style.y` réservé).

**Correction.**
- `toolShadow` devient **l'ombre standard** : une seule source, `systemSurface.shadow`. Toutes les tuiles la lisent, image de tuile-palette comprise.
- Mystic au repos : `mystic_style.y` porte une dose d'ombre de repos, issue de la même ombre standard, et le shader l'applique quand la plaque est posée. Reconstruction du wasm.
- Si l'ombre est découpée par la case du ruban, l'`overflow` est retiré au niveau commun.

**Validation Web.** Captures zoomées avec mesure des pixels sous et autour des tuiles :
- menu principal, poignée Atome, dock Assistant ;
- rail ;
- Mystic à l'ouverture et ouvert ;
- tuile agrandie par la lens.

## 2. Coin plié (indicateur de palette)

**Comparaison à la référence.**
- Mêmes forme, orientation et ombre : coin coupé en diagonale, rabat en triangle rectangle (angle droit en bas à gauche), ombre douce sous les bords libres.
- Écart : le pli est trop grand (24 % de la tuile contre environ 18 % sur la référence), et son plancher lié au rayon (×1,25) grossit le pli de Mystic.

**Fichiers.**
- `bevy_ui_menu_surface.js` (`resolveBevyMenuPaletteCornerSize`, générateurs SVG).
- `tool_skin.js` (`paletteCorner.sizeRatio`).

**Correction.**
- `sizeRatio` passe à 0,18.
- Le plancher devient `rayon × 0,7` : c'est suffisant pour retirer l'arc du coin.
- La même géométrie vaut pour le ruban, le rail (toutes profondeurs) et Mystic (le shader lit déjà le pli).

**Validation Web.**
- Recadrages à fort zoom de plusieurs tuiles-palettes (Créer, Vue, enr., Activités du rail, Utiliser et Activités de Mystic), comparés à la référence.
- Rendu pendant la lens (×2) et pendant l'état actif.

## 3. Arrondi constant des input boxes à l'agrandissement

**Cause (identifiée dans le moteur).** `apply_transform` (`atome/renderers/bevy-core/src/render_ops.rs`) applique un changement de dimensions en étirant le sprite (`custom_size`). Le masque de découpe de la forme arrondie, rastérisé à l'ancienne taille, n'est pas refait. Les arcs s'aplatissent donc pendant et après l'animation de largeur : arc mesuré à environ 5×1 px au lieu de 6×6 sur Calendrier ouvert.

S'y ajoute un défaut côté JS : le fond actif recopié sur la case (`buildBevyMenuToolNode`) n'a **pas de rayon**, d'où des coins carrés sur la tuile élargie allumée.

**Correction.**
- Rust : sur changement de dimensions, `refresh_shape_surface` redécoupe la silhouette à la nouvelle taille, comme à la création. C'est fait, avec un test de garde `resizing_a_rounded_shape_recuts_its_mask_instead_of_stretching_the_corners`.
- JS : la copie du fond porte le rayon de la tuile.
- Reconstruction du wasm.

**Validation Web.**
- Calendrier (champ du ruban) et Assistant (poignée Atome) : état normal, début d'agrandissement, ouvert, retour, fermé.
- Recadrages des coins avec mesure de l'arc à chaque étape. Le libellé doit rester présent, non étiré et non découpé.

## 4. Label en haut, icône en dessous

**Cause.** Le builder commun `buildBevyMenuToolContent` produit `[icône, label]` en colonne. Deux endroits recalculent les positions à la main dans cet ordre :
- l'animation des palettes du ruban (`itemContentMotionLayout`) ;
- l'assemblage du ruban (`menuItemNode` : icône, puis visuel d'enregistrement, puis label).

**Correction.**
- L'ordre devient `[label, icône]` dans le builder commun.
- Les positions animées du ruban sont inversées en conséquence ; l'assemblage du ruban met le label d'abord.
- Je vérifie le visuel d'enregistrement du ruban (`buildMainMenuRecordingVisualNodes`).
- Mystic, le rail, les tuiles de panneau et la lens suivent automatiquement (flex et `restRecordBoxes`).

**Validation Web.**
- Positions mesurées (label au-dessus de l'icône) dans le ruban, le rail et Mystic, pour plusieurs tools.
- Contrôles au repos, au survol d'un choix de palette, pendant la lens et pendant l'ouverture animée d'une palette.

## 5. Sliders

**Écart avec la demande.**
- Le parcours ouvre aujourd'hui un aperçu dès qu'on survole un slider. Il ne faut rien faire.
- L'appui ouvre un aperçu qui se referme au relâchement. Il doit ouvrir le slider et le laisser ouvert.
- L'entrée dans le slider se fait aujourd'hui par la zone d'aperçu ; elle doit se faire par une bifurcation vers l'intérieur.

**Correction**, sur le même contrôleur (`intuition/ribbon/bevy_ui_linear_menu_lens.js`), le même routeur (`bevy_ui_pointer_runtime.js`) et le vrai slider (`createBevyToolSliderHandlers`) :
1. **Passage sur un slider pendant le parcours :** aucun aperçu, aucune capture.
2. **Appui direct (clic ou toucher) :** le slider s'ouvre **épinglé** à côté de l'outil, sans changer la valeur. Le slider épinglé se manipule ensuite directement, avec les gestionnaires existants du vrai slider. Il se referme par un nouvel appui sur l'outil, un appui sur un autre outil ou un appui ailleurs.
3. **Relâchement sur le slider pendant un parcours :** même ouverture épinglée.
4. **Bifurcation vers l'intérieur sur le slider pendant le parcours** (rail droit : vers la gauche ; rail gauche : vers la droite ; ruban : vers le haut) :
   - le slider apparaît sous la trajectoire du doigt, dans l'axe de la barre ;
   - le geste lui est transféré : réglage immédiat, relatif, sans saut.
5. **Retour vers la barre :** dès que le doigt repasse en deçà du point de bifurcation, le slider se referme et le parcours reprend. Les allers-retours répétés sont possibles dans un même geste.

**Validation Web.** Les 12 cas de la demande :
1. traversée rapide ;
2. traversée lente ;
3. clic direct ;
4. appui direct ;
5. relâchement sur le slider ;
6. bifurcation ;
7. réglage ;
8. retour vers la barre sans relâcher ;
9. poursuite du parcours ;
10. plusieurs allers-retours ;
11. rail à droite ;
12. rail à gauche.

Contrôle systématique qu'aucune valeur ne saute à l'ouverture.

## Passe finale
Je rejoue toutes les sondes, puis je dresse la checklist des 5 groupes (cause, fichiers, correction, tests, résultat réel). Je relis enfin la demande point par point.

---

# Checklist finale (Web, 2 oct. 2026)

Sondes : `temp/menu_unification/{design,lens,nested,ribbon_slider,slider_cases,overflow,mystic_edges,mystic_slider,visual_checks}.probe.mjs`. Résultat : **111/111 contrôles réussis**.

## 1. Ombres standards — FAIT, testé
**Cause.** L'ombre standard avait été remplacée par un jeton trop léger. Surtout, elle était découpée à la taille de la tuile :
- dans le ruban, par la case (`overflow: hidden`) ;
- dans le rail, par la zone défilante large d'une tuile.

Sur Mystic, le shader ne peignait pas d'ombre aux plaques posées.

**Correction.**
- `toolShadow` est l'ombre standard (`systemSurface.shadow`).
- Les cases du ruban ne découpent plus leur contenu.
- Le rail reçoit `clip_margin` : nouvelle marge de peinture, générique, dans `bevy_ui_layout_runtime.js`, sans effet sur la zone cliquable.
- Mystic : dose d'ombre au repos (`mystic_style.y`) dans le shader, wasm reconstruit.

**Tests Web.** Assombrissement mesuré au pixel, juste hors de la tuile : ruban +13, poignée Atome +13, outil-palette +13, dock Assistant +79, rail +13, Mystic ouvert +42. Agrandissement : ombre visible sur la tuile agrandie (capture).

## 2. Coin plié — FAIT, testé
**Correction.**
- Coin réellement découpé, avec le coin arrondi d'un outil placé dessous visible dans la découpe.
- Rabat à pointe arrondie, dégradé et liseré clair.
- Ombre sous le rabat.
- Pli à 18 % de la tuile, comme sur la référence.
- Le label d'un outil-palette s'arrête avant le pli, et sur Mystic le rabat passe au-dessus du contenu.

**Tests Web.**
- Pixels : découpe `#b089eb` (outil dessous), rabat `#cfaff8`, surface `#d14d78` intacte.
- Le label ne couvre pas le pli.
- Captures zoomées : ruban (Vue, Créer, enr.), rail (A, B, C à toutes profondeurs), Mystic (Utiliser, Activités, Enregistrer).

## 3. Arrondis des input boxes — FAIT, testé
**Cause.**
- Moteur : `apply_transform` étirait le masque de la forme arrondie au lieu de le redécouper à la nouvelle taille.
- JS : le fond actif recopié n'avait pas de rayon.

**Correction.**
- `refresh_shape_surface` est appelé sur tout changement de dimensions, avec un test Rust de garde ; wasm reconstruit.
- Le fond recopié porte le rayon.
- Un outil fermé ne construit plus de champ de 1 px.

**Tests Web.**
- Profil d'arc identique `[5,3,2,1,1,0,0]` à 145, 414, 400, 211 et 60 px de large (début, milieu, ouvert, retour, fermé) sur Calendrier.
- Même profil sur la recherche de Trouver.
- Libellé présent et non étiré.

## 4. Label en haut, icône en dessous — FAIT, testé
**Correction.** Ordre `[label, icône]` dans le constructeur commun ; positions animées du ruban alignées.

**Tests Web.** Position mesurée du label au-dessus de l'icône dans le ruban (contact, créer, organiser), le rail (coller, infos, activités) et Mystic (copier, coller, utiliser). Captures en état agrandi et en palette.

## 5. Sliders — FAIT, testé
**Correction** (contrôleur commun et vrai slider) :
- passage sans effet ;
- appui ou relâchement : slider épinglé, réglable par ses propres gestionnaires ;
- bifurcation vers l'intérieur : slider sous le doigt, réglage relatif sans saut ;
- retour vers le trajet : fermeture et reprise du parcours ;
- le slider suit l'axe de sa barre, centré sur toute la longueur de son socle, avec le libellé et la valeur aux extrémités.

**Tests Web.** Les 12 cas, pour le rail à droite et à gauche (32/32), plus le ruban (9/9) :
- traversée rapide et lente ;
- clic et appui ;
- relâchement ;
- bifurcation ;
- réglage ;
- retour ;
- poursuite ;
- deux allers-retours sans saut.

## Hors périmètre
- Test Rust `video_nodes_spawn_external_texture_mesh_without_bevy_image_copy_target` en échec. Il passe par `apply_spawn` (`spawn.rs`, déjà modifié dans l'arbre de travail avant cette tâche), et non par le code modifié ici.
- iOS et Tauri non testés (non demandés).

---

# Retours du 2 oct. 2026 (soir)

1. **Erreur `bevy_projection_clip_size_invalid` (…z_order_corner_image)** — CORRIGÉ, testé.
   - Cause : pendant un parcours avec agrandissement dans un rail qui déborde, une tuile hors de la zone visible recevait une découpe vide (largeur 0), que le moteur rejette.
   - Correction : une découpe « disparue » valide (`intersectRect`, `bevy_ui_linear_menu_lens.js`), comme la projection standard le fait déjà.
   - Test : aucune erreur de découpe (`size_live`).
2. **Le slider n'agissait pas en direct sur l'atome** — CORRIGÉ, testé.
   - Causes :
     - l'exécuteur de gestes ignore volontairement les images intermédiaires d'un redimensionnement (il réserve l'aperçu au geste du canevas) ;
     - la valeur de départ de « redimensionner » était 96 par défaut, pas la taille de l'objet.
   - Corrections :
     - `applySizeToSelection` envoie ses images intermédiaires par l'intention de scène `resize.move`, la voie visuelle du geste du canevas, avec les mêmes cibles (`buildTargetProps`) ; la valeur finale est enregistrée comme avant ;
     - le rail lit la plus grande dimension réelle de l'objet (hors texte) et élargit la plage si besoin.
   - Test : largeur 200 → 214 → 282 pendant le geste, valeur enregistrée au relâchement, pas de saut au départ.
3. **Outil agrandi derrière le slider, et slider superposé à la barre** — CORRIGÉ, testé.
   - Dès la bifurcation, l'agrandissement revient au repos.
   - Le slider est posé juste à côté de la barre, aligné sur l'outil, jamais par-dessus. Il reprend l'agrandissement au retour.
   - Test : aucune tuile agrandie pendant le réglage, bord droit du slider à moins de 12 px du bord de la barre.

Passe complète : 119/119 contrôles réussis (10 sondes).
