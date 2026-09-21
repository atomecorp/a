# Placeholders actifs dans tous les modes — 21 sept. 2026

Demande : un SIMPLE toucher sur un placeholder lance son action, en édition, exécution et
consultation. Texte = saisie (limite de caractères optionnelle) ; audio/vidéo = enregistrement
qui s'arrête au toucher suivant ou après une durée réglable ; photo = prise de vue ; image =
sélecteur de fichier ; forme → **Dessin** = on dessine dedans.

- [x] Rouge d'abord : `temp/placeholder_activation_baseline.probe.mjs` — 8/8 KO (aucun mode).
- [x] Causes trouvées
  - seul le double-clic (`atome.edit.enter`) appelait le remplissage ;
  - le hit-test composé remonte au conteneur : dans une page on touchait la PAGE ;
  - hors édition, le pointeur n'ouvre aucune session (select/drag bloqués) ;
  - audio/vidéo passaient par `ui.detail.record.toggle`, qui enregistre dans une timeline de
    molécule (nouveau groupe), jamais dans l'emplacement ;
  - la persistance réempilait le média (position suivante, taille 333, parent courant) ;
  - photo web : `recording_upload_path_mismatch` pour TOUTE photo (serveur rend `captures/x.jpg`,
    le client comparait à `data/users/<id>/captures/x.jpg`) ; l'id de l'emplacement était
    aussi perdu (`requirePhotoProjectAtome` le passait hors de `result`) ;
  - vidéo hors édition : l'ouverture de tout panneau Bevy exigeait le menu principal rendu
    (vide hors édition → `workspace_main_menu_overlay_missing:0:0:0:0`), puis l'aperçu
    exigeait le bouton d'outil du menu (`capture_video_preview_source_unavailable`).
- [x] Correctifs
  - `domains/rendering/placeholder_surface_layer.js` (nouveau) : calque 850, hit-test brut qui
    remonte jusqu'à l'emplacement ; hors édition il prend l'appui et active au relâchement ;
    en édition l'appui reste celui d'un objet et c'est la phase `tap` (émise par
    `surface_interaction_runtime.js` sur relâchement sans mouvement) qui active ; dessin : le
    geste dessine, sauf en édition sur un dessin déjà sélectionné (il se déplace).
  - `project_view_placeholder_fill.js` réécrit (`activatePlaceholder`, alias historique
    `fillMediaPlaceholder`) : `ui.capture.video|audio|photo` + `projectAtomeId`, arrêt auto
    `placeholder_duration_seconds`, image par upload sans atome puis écriture sur l'emplacement,
    texte par `text.edit.begin`. Un média en attente non étiqueté (template) reste activable.
  - `media_persistence_service.js` : un emplacement rempli garde cadre + parent, perd
    `placeholder_kind`.
  - `video_api_persist.js` (chemin relatif utilisateur), `capture.js` (id photo transmis).
  - `bevy_panel_runtime.js` : pas d'exigence de menu rendu hors édition ;
    `capture_recording_feedback_runtime.js` : source d'aperçu propre sans bouton projeté.
  - Texte : `maxLength` sur le textarea partagé (`setActiveTextEditorMaxLength`, remis à zéro à
    chaque montage) ; au commit, couleur normale si encore grise d'invite ; saisie permise dans
    tous les modes pour un placeholder texte (`project_work_mode_state.js`).
  - Création : Dessin = SVG vide teinté (`placeholderDrawMarkup`) ; curseurs **Durée** (s) et
    **Caractères** dans Créer > Placeholder (`ui.placeholder.duration.apply` /
    `ui.placeholder.max_chars.apply`), 0 = sans limite.
  - `svg_draw_runtime.js` : `beginGesture({ target, force })` (cible explicite + échelle viewBox).
  - Double-clic sur un emplacement actif = no-op (sinon démarrer puis arrêter aussitôt).
- [x] Vérification app réelle (Playwright, 3001, vrais clics/glisser, faux micro/caméra)
  - `temp/placeholder_activation.probe.mjs` : **33/33** — 6 kinds × 3 modes, vidéo DANS une page
    (cadre + parent conservés), audio arrêté seul à 2 s, texte limité à 5, zéro erreur console.
  - `temp/placeholder_menu.probe.mjs` : **8/8** — vrais clics Bevy : curseurs projetés, glisser
    Durée → porté par l'audio posé, Dessin créé au menu se dessine, sélectionné il se déplace,
    texte rempli repasse en blanc.
  - `temp/plain_capture_regression.probe.mjs` : 3/3 — captures sans placeholder = atome neuf.
  - Probes Node mises au nouveau contrat : `media_placeholder_fill`, `placeholder_create` OK.

## Restes
- `temp/media_placeholder_rail.probe.mjs` importe `atome_edit_footer_model_runtime.js`, qui
  n'existe plus (préexistant, sans rapport).
- iOS/AUv3 non vérifiés (sélecteur de fichier hors geste synchrone : même schéma que l'outil
  d'import existant).
- En Liste/Matrice, le Dessin ne se dessine pas (pas de canevas) : le toucher n'y fait rien.
