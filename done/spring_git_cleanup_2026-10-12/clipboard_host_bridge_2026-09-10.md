# Presse-papiers système ↔ atome (iOS / Tauri / web) — 10 sept. 2026

Demande : impossible de coller du texte sur iOS (pas de bouton « Coller », pas de ⌘V).
Un outil standard copier / coller, qui écrive **et** relise le presse-papiers de l'hôte.

## Diagnostic (vérifié, pas supposé)

1. `atome/src/css/squirrel.css:23-26` pose `user-select:none !important` +
   `-webkit-touch-callout:none !important` sur `html,body` ⇒ la bulle native iOS ne peut pas
   apparaître. C'est **délibéré** (`hidden_text_service_runtime.js:45-58` le documente : le produit
   dessine ses propres menus) — donc non touché.
2. **La lecture du presse-papiers système n'existait nulle part.** Zéro `readText`, zéro
   `UIPasteboard`, zéro plugin clipboard Tauri.
3. **La copie était cassée sur iOS aussi**, pas seulement le collage : la page est servie depuis le
   scheme `atome:` ⇒ origine opaque, `isSecureContext === false`, `navigator.clipboard` absent.
   `writeTextToClipboard` retournait `clipboard_unavailable`.
   Prouvé par mutation test : `temp/clipboard_ios_copy_probe.mjs` passe au vert avec le correctif et
   redevient rouge (4 échecs) si l'on restaure l'implémentation d'origine.
4. **`readSelectedText` ne voyait jamais le texte d'un atome** : il lit `window.getSelection()`, or le
   texte atome est édité dans le `<textarea>` caché, dont la sélection est invisible à la Selection API.
5. Aucun raccourci ⌘C/⌘V/⌘X n'était enregistré.

## Fait

- [x] `eVe/intuition/tools/clipboard/system_bridge.js` — façade unique. Cascade natif → web.
      Un `reject` natif (build ancienne) retombe sur le web ; un `success:false` (vraie panne) est
      remonté tel quel, jamais masqué.
- [x] `system_writer.js` : `writeTextToClipboard` délègue à la façade (une ligne) ⇒ `copy.js`,
      `writeSystemClipboardForItems` et `bevy_panel_info_runtime.js` héritent du natif.
      Image/audio sans `ClipboardItem` écrivent désormais la source au lieu d'échouer.
- [x] `media_diagnostics.js` : ne contourne plus le module central.
- [x] `eVe/intuition/tools/clipboard/editable_surface.js` — routeur des 4 surfaces de texte
      (session de texte active → champ → contenteditable → aucune). Lecture **et** insertion.
- [x] `copy.js` : `readSelectedText` interroge la surface active en premier ; `ui.cut.action`
      enregistré ici même (couper = copier + supprimer, les deux verbes existaient déjà).
- [x] `paste.js` : lit l'hôte, insère au caret si une surface est active, sinon ingère le texte hôte
      comme groupe puis déroule le chemin existant (création d'atomes).
- [x] iOS : `Common/AppNativeClipboardController.swift` + les **2** tables de dispatch
      (`ViewController.swift`, `AudioUnitViewController.swift` — cette dernière n'a aucun fallback).
      `hasStrings` avant `.string` : pas d'alerte système pour un presse-papiers vide.
- [x] Tauri : `src/native_clipboard.rs` (wrapper autour du plugin officiel, mêmes noms de commande
      qu'iOS), `lib.rs`, `Cargo.toml`, `permissions/clipboard-bridge.toml`, `capabilities/default.json`.
      `cargo check` : `Checking squirrel v0.1.0` → **0 erreur**.
- [x] UI : `copy` / `cut` / `paste` dans `toolbox.children` (outils carrés, **pas** une palette —
      une palette non déclarée dans `familyByPaletteKey` fait tomber le ruban entier) ;
      `copy`/`cut` sur tous les kinds du footer contextuel, `paste` sur `text` ; priorités posées.
- [x] Icône `atome/src/assets/images/icons/cut.svg` au format exact du jeu existant.
- [x] i18n `eve.menu.cut` fr (« couper ») + en.
- [x] Raccourcis ⌘/Ctrl + C / X / V, avec chargement paresseux des modules (sinon le premier ⌘C
      d'une session tombe sur un `ui.copy.action` non encore enregistré) et garde `isEditableTarget`
      qui laisse WebKit faire son copier/coller natif dans un champ.
- [x] `maps/ARCHITECTURE_MAP.md:553` corrigé — il documentait une capture clipboard jamais écrite.

## Probes (temp/, 7 fichiers, 114 vérifications, toutes vertes)

Discriminance vérifiée par mutation test sur 4 d'entre elles (nom de commande faussé, `has_text`
ignoré, `cut` transformé en palette → `bevy_menu_palette_accent_family_required:cut`, writer d'origine
restauré).

## Compilation iOS — vérifiée

`xcodebuild -scheme atome -configuration Debug` → **BUILD SUCCEEDED**, 0 erreur (999 s ; les 2
warnings sont des `appintentsmetadataprocessor`, sans rapport).

Garde décisive sur le point risqué (deux tables de dispatch, l'AUv3 sans fallback) — le symbole est
présent dans **les deux** binaires livrés :

| binaire | symboles `AppNativeClipboardController` | occurrences des 3 commandes |
|---|---|---|
| `atome.app/atome.debug.dylib` | 43 | 6 |
| `atome.app/PlugIns/atomeAudioUnit.appex/atomeAudioUnit.debug.dylib` | 43 | 6 |

## Reste à vérifier sur appareil réel

- Le geste complet sur iPhone/iPad : copier depuis Notes → coller dans un atome texte, et l'inverse.
- L'alerte « Autoriser le collage ? » ne doit apparaître qu'au geste explicite, jamais au boot.
- Le bouton Coller doit se griser sur presse-papiers vide **sans** aucune alerte (`clipboard_has_text`).
- **L'AUv3 séparément** : c'est la seule façon d'exercer la seconde table de dispatch.

## Non fait, volontairement

- Menu flower : `cut` n'y a pas été ajouté (`copy`/`paste` y étaient déjà et fonctionnent par
  ricochet). Un `cut` y serait passé par le chemin gateway par défaut, non exercé ici.
- Commandes natives image (`clipboard_write_image`) : hors du besoin exprimé, qui est le texte.
- Handler DOM `paste` sur le `<textarea>` caché : inutile — un collage natif y arrive déjà comme
  `input`, que `syncInputFromEditor` relit intégralement.
