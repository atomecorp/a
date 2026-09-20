# La vidéo n'était pas découpée par la page — 20 sept. 2026

Signalé : image, audio, SVG et texte respectent le débordement d'une page ; la vidéo, non.

## Diagnostic (trois causes empilées, trouvées par la trace, pas par déduction)
1. **Une vidéo est un maillage, pas un sprite.** `apply_entity_clip` ne recadrait que les
   `Sprite` : la vidéo était bien repositionnée sur la zone visible, mais gardait sa taille —
   d'où un quad décalé qui dépassait (centre de la partie visible, taille pleine).
2. **Le composant attendu manquait.** Mon premier correctif lisait le rectangle d'UV sur
   `AtomeVideoExternalTexture` ; sur ce chemin il n'était pas présent, donc la découpe sortait
   sans rien faire. Le quad porte désormais son propre rectangle d'origine (`AtomeVideoQuad`).
3. **Une mise à jour de ressource refaisait le quad en entier** (`resource_ops.rs`) et sortait
   **sans repasser par la découpe** ; ma garde anti-reconstruction croyait alors le travail fait
   et ne la reposait jamais. Le quad refait oublie sa découpe, et la découpe est réappliquée
   après une mise à jour de ressource.

## Fait
- `clip.rs` : recoupe du maillage vidéo (taille visible + sous-rectangle d'UV), repli sur
  `AtomeVideoExternalTexture`, trace de diagnostic sur l'application (lue par le collecteur de
  perf de la page).
- `video_external_texture.rs` : `AtomeVideoQuad` (rectangle d'origine) + variante « découpée »
  qui n'écrase pas cette référence ; toute reconstruction pleine oublie la découpe posée.
- `resource_ops.rs` : la branche vidéo repasse par `apply_entity_clip`.
- **Le wasm a été reconstruit** (`platforms/web/bevy-renderer/build.sh`) : l'app tourne dans une
  WebView, c'est ce moteur-là qui dessine.

## Correction d'une affirmation fausse de ma part
J'avais écrit que la cible WebAssembly « ne compilait pas ». C'était mon erreur d'invocation :
elle se construit depuis `platforms/web/bevy-renderer`, dont le `.cargo/config.toml` pose
`--cfg=web_sys_unstable_apis`. Rien n'était cassé.

## Vérification
- Rust : 8 tests (`cargo test --lib video_clip_tests`), dont le cas exact qui échouait (quad sans
  composant de texture) et la séquence « découpe → reconstruction pleine → découpe à nouveau ».
- **Pixels, dans l'app** (`temp/video_overflow_pixels_ui.probe.mjs`) : bande à droite du bord de
  la page, sur la hauteur de la vidéo.

  | | avant | après |
  |---|---|---|
  | vidéo DANS la page (doit être vide) | 61 % de pixels différents | **0 %** |
  | même vidéo SANS page (témoin, doit être peinte) | — | **100 %** |

  Le témoin prouve que la vidéo se peint vraiment : sans lui, « rien ne dépasse » pourrait
  simplement vouloir dire « rien ne s'affiche ».
- 10 probes JS vertes, 46/46 modules liés, `page_fixes_ui` 7/7 : aucune régression.

## Reste
- La trace `bevy.video.clip.applied.*` reste dans le moteur ; elle ne coûte que lorsqu'une
  découpe est réellement posée et que le collecteur de perf de la page est installé.
