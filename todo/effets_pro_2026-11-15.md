# Effets pro audio et vidéo — proposition (15 nov. 2026, R-184)

Statut : TOUT VALIDÉ le 15 nov. (8/8) — lots 1 à 4 codés et prouvés sur le Web (15–16 nov., preuves dans R-184 du registre) ; « Fond » du Fond vert (V4) codé le 16 nov. (sonde `backdrop_ui.probe.mjs`) ; reste la recette iPad par toi.

Demande (toi, 15 nov.) : « rajouter des effets pour la vidéo et l'audio, des effets de base » comme dans les
logiciels pros (DaVinci…) : flou, colorimétrie pour la vidéo ; pour l'audio une très bonne réverb, un compresseur
avec sidechain, « avec du caractère ou pas », plusieurs modes, de quoi masteriser, des effets de voix (vocodeur) ;
proposer la série, maquettes, validation, puis coder.

## Existant vérifié (lecture du code, 15 nov.)

- Audio : briques Rust `atome/engines/atome-dsp` (natif partout, WASM sur le Web), catalogue `catalog.rs`, publiées
  en JS par `mix_dsp_catalog.js`, posées dans la console par `kernel/mix_modules.js`. Déjà là : Volume, Pan, filtres
  biquad (P-bas, P-haut, P-bde, Coupe, Cloche, Graves, Aigus), Compresseur (feed-forward, genou 6 dB, **clé =
  sidechain déjà câblée**, `dynamics.rs`), Limiteur (sans anticipation), Porte, Recul (ducker), 2/3/4 bandes,
  M/S, G/D, Saturation douce / écrêtage, Écho, Réverb (FDN 8 lignes + 4 diffuseurs, `reverb.rs`), Convolution,
  Ampli NAM (TONE3000), Oscillateur, Enveloppe.
- Vidéo : un seul effet `video_fx.color` (luminosité, contraste, saturation, N&B, sépia, inversion, teinte),
  appliqué par le shader `atome/renderers/bevy-core/assets/shaders/video_external.wgsl` ; plus l'Opacité.
  Pas de flou, roues, courbes, LUT ni incrustation. Une pyramide de flou existe dans le rendu
  (`workspace_blur_pyramid.rs`, pour le verre) : réutilisable pour le Flou.
- Console : panneau soudé validé (R-171), palettes soudées et Aux (R-183, en attente).

## Catalogue proposé

Légende : ★ = nouveau, ↑ = existant amélioré. Noms d'outil ≤ 9 lettres (règle 11).

### Audio (7 familles dans le +)

| Famille | Effets |
| --- | --- |
| Dynamique | ↑ **Comp** : caractères Propre (VCA), Opto, FET, Lampe (vari-mu), Bus ; Seuil, Ratio, Attaque, Relâche, Genou, Avance (anticipation), Gain, Mix (parallèle), Clé + Filtre clé, jauge de réduction · ↑ Limit (crête vraie, anticipation) · Porte · Recul · ★ De-ess · ★ Transit. (attaque/maintien) · ★ Expand. · ★ Multib. (compresseur 3–4 bandes sur les bandes existantes) |
| Espace | ↑ **Réverb** : Pièce, Salle, Plaque, Chambre, Ressort ; Durée, Taille, Pré-délai, Diffusion, Aigus, Graves, Modul., Largeur, Mix, Gel · ↑ Convol (bibliothèque de réponses) · ↑ Écho (synchro tempo, ping-pong, bande) |
| Égaliseur | ★ **Égal.** paramétrique 8 bandes avec courbe et analyseur, égalisation dynamique par bande · filtres simples existants |
| Voix | ★ **Vocodeur** (porteuse : piste par la clé, synthé interne, bruit) · ★ Accordeur (correction de hauteur, gamme, vitesse) · ★ Harmo (harmoniseur) · ★ Hauteur (pitch + formant) · ★ Doubleur · ★ Débruit |
| Modulation | ★ Chorus · ★ Flanger · ★ Phaser · ★ Trémolo / auto-pan |
| Saturation | ↑ Satur (Bande, Lampe, Transfo, Fuzz) · Ampli NAM · ★ Lo-fi (bitcrush, échantillonnage) |
| Master | ★ **Maximis.** (cible LUFS Streaming −14 / CD −9 / Club −6 / Podcast −16, plafond dBTP, mesures intégrée / court terme) · ★ Largeur (imageur) · ★ chaîne « Master » (Égal. → Multib. → Maximis.) dans Mes effets · ★ « Auto » : eVe règle la chaîne en écoutant (MCP `audio_fx`) |

### Vidéo (5 familles dans le + d'une piste vidéo)

| Famille | Effets |
| --- | --- |
| Couleur | ↑ **Primaire** : Exposition, Contraste, Pivot, Saturation, Vibrance, Température, Teinte, Hautes lumières, Ombres · ★ **Roues** Lift / Gamma / Gain / Offset · ★ Courbes (RVB, luma, teinte/sat) · ★ Teinte/Sat (secondaire : cibler une couleur) · ★ LUT (.cube par le panneau d'import, règle 18) · ↑ N&B (mixeur de canaux) |
| Flou | ★ **Flou** : Gaussien, Directionnel, Radial, Zoom, Objectif (bokeh) ; Rayon, Angle, Centre, Mix, Zone (ellipse) |
| Détail | ★ Netteté · ★ Débruitage |
| Look | ★ Vignette · ★ Grain · ★ Lueur (bloom) · ★ Aberration chromatique · ★ Pixels |
| Incrust. | ★ **Fond vert** (pipette sur l'aperçu, Tolérance, Douceur, Débord, Bords, Fond) · ★ Luma · ★ Masque (ellipse/rectangle) |

## Maquettes (`temp/effects_pro_2026-11-15/mockups/`, générateur `build_effects.mjs`)

Jetons validés de R-171/R-183 (fond de colonne, dalle ouverte `#3d5082`, aucun contour, pas de ✕).

- [x] E1 `e1_plus_familles.png` — le + : Aux puis les familles, la famille touchée pose ses effets dessous
- [x] E2 `e2_compresseur.png` — compresseur : caractère en rangée de choix, deux cartes côte à côte, jauge de réduction
- [x] E3 `e3_reverb.png` — réverb : espaces, deux cartes, Gel
- [x] E4 `e4_egaliseur.png` — égaliseur : courbe + spectre (nouvel élément)
- [x] E5 `e5_master.png` — colonne Master, maximiseur, mesures de sonie (nouvel élément : jauges)
- [x] E6 `e6_vocodeur.png` — vocodeur : porteuse, bandes, formant
- [x] V1 `v1_plus_video.png` — le + vidéo : familles
- [x] V2 `v2_roues.png` — roues d'étalonnage (nouvel élément)
- [x] V3 `v3_flou.png` — flou, aperçu flouté
- [x] V4 `v4_fond_vert.png` — fond vert, pipette sur l'aperçu (nouveau geste)
- [x] P1 `p1_telephone_comp.png` — téléphone debout

## Questions (une à la fois)

1. Le catalogue (et ce qui manque ou est de trop).
2. Familles dans le + (E1, V1).
3. Panneau d'un gros effet : rangée de choix du caractère + deux cartes côte à côte (E2, E3, E6).
4. Jauges (réduction, sonie) dans une case d'outil (E2, E5).
5. Courbe d'égaliseur (E4).
6. Roues d'étalonnage (V2).
7. Pipette : un toucher sur l'aperçu (V4).
8. Ordre des lots.

## Lots proposés (à coder après validation, d'un seul tenant)

1. Noyau : familles du + (`molecule_mix_catalog.js`), jauges (retour de mesure du moteur vers l'outil).
2. Audio Rust (`atome-dsp`) : Comp à caractères + avance, Réverb à espaces + modulation + gel, Égal. 8 bandes,
   Maximis. + mesure LUFS/crête vraie (ITU-R BS.1770), Multib., De-ess, Transit., Expand., modulation, Lo-fi,
   Vocodeur, Hauteur/Formant, Harmo, Accordeur, Doubleur, Débruit ; tests Rust, sans allocation dans le rendu.
3. Vidéo (bevy-core, WGSL) : Primaire étendu, Roues, Courbes (LUT 1D), LUT 3D, Teinte/Sat, Flou (pyramide),
   Netteté, Vignette, Grain, Lueur, Aberration, Pixels, Fond vert, Luma, Masque ; `MIX_VIDEO_EFFECTS` étendu.
4. Panneaux soudés (courbe, roues, pipette) ; MCP `audio_fx` + famille vidéo ; i18n.
5. Sondes Web par effet (son mesuré, pixels du rendu) ; recette iPad par toi.
