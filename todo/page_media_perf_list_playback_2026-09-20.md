# Page : vidéo découpée, voile réglable, lenteur, lecture en Liste — 20 sept. 2026

Suite de `page_record_fixes_2026-09-20.md`. Quatre points signalés à l'usage.

## Demande → état
- [x] 1. Une **vidéo** incluse dans une page n'était pas découpée.
- [x] 2. Le voile d'édition laissait trop voir ce qui déborde ; opacité à régler.
- [x] 3. Déplacer un objet **inclus dans une page** était impraticable.
- [x] 4. En mode **Liste**, la page ne jouait pas l'animation enregistrée.

## Diagnostic (mesuré)

### 1 — la vidéo traverse la page
Une vidéo n'est pas un sprite mais un **maillage** (`insert_video_quad_mesh`, texture externe).
`apply_entity_clip` ne recadrait que les `Sprite` : aucune découpe ne s'appliquait donc à une
vidéo, quelle que soit la page qui la contenait.

### 3 — la lenteur : mes voiles d'édition
Reproduit dans l'app (page ouverte, objet inclus déplacé, 72 mouvements) :

| | images | p95 | max | geste | reprojections |
|---|---|---|---|---|---|
| avant | 23 | **233 ms** | 383 ms | 5,3 s | 20 |
| après | 141 | **17,2 ms** | 33 ms | 1,2 s | 7 |

Cause : les 4 voiles d'édition mesuraient 100 000 px de côté. Chaque projection les
reconstruisait, d'où des blocages de ~200 ms. Le rail, lui, demande une reprojection quand
l'objet suivi bouge (coût normal une fois les voiles bornés).
Deux coûts secondaires corrigés en passant : la découpe était recalculée **par atome et par
image** (index unique désormais : 0,12 ms au lieu de 0,49 ms par image), et le geste envoyait
un lot réseau **par image** (68 envois et 272 `atome:changed` pour un glisser → 10 et 40).

### 4 — la page ne joue pas en Liste
La prise d'actions était rangée sur le **projet**, jamais sur la page ; et une page se jouait
comme une molécule (ses membres un par un), sans rapport avec l'animation enregistrée.

## Fait
- **Vidéo** (`atome/renderers/bevy-core/src/clip.rs`) : le quad vidéo est recoupé (taille
  visible + sous-rectangle d'UV), avec une garde pour ne pas re-téléverser le maillage à chaque
  image. 5 tests Rust ajoutés (le module n'en avait aucun).
- **Voile** : dimensionné à l'écran autour de la page (plus de quads infinis), opacité portée à
  **0,88** et réglable : `window.evePageVeil.set(0.95)` / `.read()`.
- **Lenteur** : voiles bornés, un seul index de découpe par image, envois de geste groupés
  (120 ms), index parent→enfants réutilisé.
- **Liste** : enregistrer DANS une page range la prise **sur la page** et ne capte que son
  contenu (`scope_id`) ; une page porteuse d'une prise se joue comme une **animation**
  (`kind: 'action_capture'`) partout où elle est jouée ; pendant la lecture hors Naturel, la page
  est épinglée dans l'aperçu avec son contenu, cadrée sur **son** cadre (ce qui déborde n'y entre
  pas), et chaque record rejoué est publié à l'aperçu pour qu'il s'anime.
- Récursion corrigée : lire l'état du rail depuis ses propres définitions repartait en boucle
  infinie (le rail compte ses outils dans son état) ; l'atome actif est passé en paramètre.

## Vérification
- Probes Node : 10 vertes, dont `page_capture_playback` (prise limitée à la page, page jouée
  comme animation, cadrage, publication à l'aperçu) et `page_member_drag_perf` (coût par image).
  Mutations : portée retirée → rouge ; lecture de prise retirée → rouge ; `clip_rect` retiré →
  rouge. 46/46 modules liés en ESM.
- Rust : `cargo test --lib video_clip_tests` 5/5 ; mutation du calcul d'UV → 2 rouges.
  `cargo check` natif OK. **La cible WebAssembly ne compile pas** (erreur préexistante dans
  `video_external_web.rs`, non liée) : la découpe vidéo est donc active côté natif (Tauri), et
  attendra une reconstruction du wasm pour le navigateur.
- App réelle (serveur 3001, vrais gestes) :
  - `page_member_drag_ui` : le glisser d'un objet inclus est revenu au niveau d'un objet libre ;
  - `page_list_playback_ui` 7/7 : prise stockée sur la page, mode Liste, la page se joue comme
    animation, s'affiche en grand et s'anime (PNG `02_list_playing_page.png`) ;
  - `page_fixes_ui` 7/7 : aucune régression.

## Restes
- La zone d'aperçu de la Liste garde sa hauteur habituelle : la page l'occupe entièrement mais
  ne prend pas tout l'écran.
- Un objet créé pendant qu'une page est le conteneur courant devient son membre même si on le
  pose hors du cadre : il est alors invisible (coupé) et inatteignable.
- Les reprojections dues au rail pendant un geste (7 pour 72 mouvements) restent.
