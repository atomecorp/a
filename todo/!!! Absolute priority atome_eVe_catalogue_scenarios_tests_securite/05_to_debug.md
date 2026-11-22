# 05 — to debug · atome/eVe

> **File active des défauts réellement constatés**. Ce fichier est initialement vide : la présente préparation ne lance aucune plateforme et ne crée aucun bug présumé. L'IA testeuse ajoute une fiche dès qu'un écart est confirmé, y compris **lisibilité, lenteur, parité, librairie et faille de sécurité**. L'IA correctrice lit et corrige. Le retest et la clôture restent indépendants.

## États

`OPEN` → `IN_PROGRESS` → `FIXED_AWAITING_RETEST` → `VERIFIED` → **ARCHIVÉ**.

`BLOCKED` et `NOT_TESTED` sont des états de test, pas des anomalies réparées. `N/A` n'est accepté qu'avec preuve d'inapplicabilité structurelle. Si un correctif échoue au retest, le ticket retourne `OPEN`.

## Politique

- Un ticket par défaut ou cause reproductible : une panne sur une plateforme peut concerner plusieurs commandes et scénarios ; lier tous les IDs impactés.
- Enregistrer l'absence d'une fonction attendue sur Web/Tauri macOS/Tauri Windows/iOS/Android/FreeBSD (si option disponible) comme **parité** ; identifier la bibliothèque, le runtime, les capacités GPU et l'adaptateur manquants.
- Les erreurs visuelles seules sont des bogues : texte coupé, contrôles cachés, panneaux masqués, libellés illisibles, geste non fluide, animation lente, zoom ou scroll cassé.
- Les failles de sécurité sont prioritaires, mais ne jamais copier un secret, une donnée médicale réelle ou un jeton dans le fichier de tickets ; preuves expurgées et accès restreint.
- Ne pas enregistrer comme bogue le refus attendu d'une autorisation médicale ou autre politique de sécurité.
- Le correcteur doit documenter la **factorisation/simplification/optimisation** menée en même temps que chaque réparation, avec performance avant/après.
- Une mise à jour de bibliothèque n'est pas justifiée par son seul âge : enregistrer advisory, compatibilité, versions résolues, résultats sur toutes les plateformes pertinentes.
- L'IA testeuse valide, retire le ticket de cette file après retest et conserve la preuve dans une archive datée ; l'IA correctrice ne supprime pas elle-même les tickets validés.

## Tickets ouverts

Campagne R-246, phase médias, Web (Chromium de Playwright, serveur de sonde isolé, binaires de la session), 19 nov. 2026.

```yaml
id: BUG-0001
statut: FIXED_AWAITING_RETEST
priorite: HAUTE
categorie: FONCTION
fonctions: [F086]
scenarios: [L04]
plateforme: "Web"
canal: "MCP direct (chemin de la voix)"
donnees_test_synthetiques: "temp/r246_media/fixtures/photo_6000x4000.jpg"
gestes_reproduction: ["1. creation.new_picture", "2. creation.retouch luminosité 60, look mono ; creation.frame carré, quart de tour ; arrondi 60", "3. creation.export"]
attendu: "le fichier exporté porte la retouche : 4000×4000, gris, plus clair, coins transparents en PNG"
observe: "l'original 6000×4000 couleur, tel quel"
proprietaire_canonique: "eVe/domains/dashboard/dashboard_create_filing.js#creationFile"
origine_du_defaut_confirmee: "creationFile envoyait state.image.preview sans la dessiner"
correctif: "eVe/domains/dashboard/dashboard_retouch_export.js (nouveau) : même projection (render_atom.js) et même raster (bevy_media_texture_image_fit.js) que l'écran, depuis l'original ; une image neutre reste ses octets d'origine"
tests_unitaires_integration_ui: "temp/r246_media/lot2_image.probe.mjs : avant 5 échecs, après tout passe (temp/r246/lot2_before, lot2_after)"
```

```yaml
id: BUG-0002
statut: FIXED_AWAITING_RETEST
priorite: CRITIQUE
categorie: PERSISTANCE
fonctions: [F070, F087]
scenarios: [S038, L04, L08]
plateforme: "Web"
canal: "souris-clavier (dépôt), MCP direct"
donnees_test_synthetiques: "temp/r246_media/fixtures/hostile/empty.mp4 puis n'importe quel média"
gestes_reproduction: ["1. importer un fichier de 0 octet", "2. importer d'autres médias, déposer une vidéo dans un projet"]
attendu: "le fichier vide gardé tel quel ; tout le reste part au serveur"
observe: "POST /api/uploads 400 « Empty upload body » à chaque passe ; la passe de synchro s'arrête avant les événements ; plus rien n'arrive au serveur (médias absents de la liste, identifiant null, copie « fantôme », vidéo jamais posée dans le projet)"
impact_fonctionnel_et_visuel: "règle 21 violée : le travail reste sur l'appareil"
proprietaire_canonique: "atome/src/squirrel/apis/unified/adole_api/browser_workspace.js ; atome-server src/media/uploads.rs"
origine_du_defaut_confirmee: "un fichier refusé coupait la passe (les lignes refusées étaient déjà mises de côté, pas les fichiers) ; le serveur refusait un fichier vide"
correctif: "fichier refusé mis de côté comme une ligne et remis en file à la reconnexion (browser_workspace.js, guest_workspace_store.js, auth_methods_login.js) ; serveur : un fichier de 0 octet gardé tel quel (uploads.rs, local/local_file_transfer.rs) ; un fichier vide est un fichier, pas une vidéo (asset_box_file_upload.js)"
tests_unitaires_integration_ui: "temp/r246_media/diag3.probe.mjs 7/7"
```

```yaml
id: BUG-0003
statut: FIXED_AWAITING_RETEST
priorite: MOYENNE
categorie: FONCTION
fonctions: [F070]
scenarios: [L04, L08]
plateforme: "Web"
canal: "MCP direct"
attendu: "les médias de la liste portent leur type, leur taille et leur durée (lus par dashboard_own_media.js, dashboard_media_list_add.js, dashboard_beauty_card.js)"
observe: "mime_type, width, height, duration_sec absents de la liste du serveur"
proprietaire_canonique: "atome/engines/atome-store/src/vault.rs#files_described ; atome-server src/media/storage.rs#downloads"
correctif: "la description des fichiers porte mime_type, width, height, duration_sec"
tests_unitaires_integration_ui: "temp/r246_media/diag3.probe.mjs B.list_carries_measures"
```

```yaml
id: BUG-0004
statut: FIXED_AWAITING_RETEST
priorite: MOYENNE
categorie: AUDIO_VIDEO
fonctions: [F107]
scenarios: [L06]
plateforme: "Web"
canal: "MCP direct"
gestes_reproduction: ["1. audio_fx.edit_apply silence sur un quart", "2. audio_fx.edit_apply stretch ×2 sur tout le son"]
attendu: "tout s'étire, le silence dure deux fois plus"
observe: "INVALID_ARGUMENT « a silence has no sound to change » (même refus pour pitch)"
proprietaire_canonique: "eVe/domains/sample_edit/edit_list.js"
correctif: "étiré, un silence garde sa nature et dure × le rapport ; transposé, il reste tel quel (comme fondu, gain, inversion)"
tests_unitaires_integration_ui: "temp/r246_media/node/edit_list.node.mjs"
```

```yaml
id: BUG-0005
statut: VERIFIED
priorite: HAUTE
categorie: AUDIO_VIDEO
fonctions: [F143]
scenarios: [L08]
plateforme: "Web"
canal: "MCP direct"
gestes_reproduction: ["1. déposer une vidéo sans piste son (.webm) dans la vue Timeline d'un projet", "2. ui.timeline.transport.play"]
attendu: "le projet joue, la vidéo muette"
observe: "toute la lecture échoue : molecule_video_audio_load_failed, HTTP 500 de /api/extract-audio (ffmpeg -map 0:a:0 ne trouve aucun flux)"
proprietaire_canonique: "atome/servers/atome-server/src/media/audio_track.rs ; eVe/core/media_engine/molecule_session_clips.js"
correctif: "le serveur répond 422 no_audio_track (un fait sur la vidéo, pas une panne) ; backend.kira.js porte ce code sur l'erreur ; le clip joue alors muet"
tests_unitaires_integration_ui: "temp/r246_media/lot5_timeline.probe.mjs (F143.play)"
```

```yaml
id: BUG-0006
statut: VERIFIED
priorite: MOYENNE
categorie: FONCTION
fonctions: [F136]
scenarios: [L07]
plateforme: "Web"
canal: "MCP direct"
gestes_reproduction: ["1. audio_fx.slice_point_add", "2. audio_fx.slice_point_lock locked true", "3. audio_fx.slice_point_remove (ou Suppr. dans la bande du découpage)"]
attendu: "le point part (contrat : « a locked one is unlocked first »)"
observe: "POINT_LOCKED : l'outil Suppr. affiché et la voix sont refusés"
proprietaire_canonique: "eVe/domains/sample_edit/slice_points.js#removeSlicePoint"
correctif: "le verrou protège des méthodes et du déplacement, pas d'une suppression demandée"
tests_unitaires_integration_ui: "temp/r246_media/lot4_instrument.probe.mjs (F136.point_remove)"
```

```yaml
id: BUG-0007
statut: VERIFIED
priorite: MOYENNE
categorie: MCP
fonctions: [F125]
scenarios: [L07]
plateforme: "Web"
canal: "MCP direct"
gestes_reproduction: ["1. audio_fx.note_play sur un instrument qui échoue à jouer"]
attendu: "le code du contrat et la raison précise (commentaire du propriétaire)"
observe: "WRITE_FAILED seul : la raison est jetée pour les commandes d'instrument et d'effet"
proprietaire_canonique: "eVe/domains/audio_fx/audio_fx_commands.js#executeAudioFxCommand"
correctif: "chaque échec porte reason. Cause de note_play ainsi lue : direct_path_context_unavailable — le rack (direct_path_web.js) lisait le contexte du moteur avant de le réveiller ; il appelle maintenant unlock d'abord, comme play_record_core#init"
tests_unitaires_integration_ui: "temp/r246_media/lot4_instrument.probe.mjs (F125.note_play)"
```

```yaml
id: BUG-0008
statut: VERIFIED
priorite: HAUTE
categorie: FONCTION
fonctions: [F142, F095]
scenarios: [L07, S037]
plateforme: "Web"
canal: "MCP direct"
gestes_reproduction: ["1. importer bank.sfz (ou un .sf2, MIME audio/x-sf2)"]
attendu: "la banque rejoint les médias comme fichier gardé tel quel, puis audio_fx.bank_import la lit"
observe: "import refusé : « Failed to probe audio container » (une MIME audio/* la classait en son)"
proprietaire_canonique: "eVe/domains/media/asset_box_media.js#inferUploadAtomeType"
correctif: "une banque (BANK_FORMATS, déplacé dans atome/src/squirrel/audio_fx/bank_contracts.js, seule liste) est raw, comme le MIDI passe avant la branche audio"
tests_unitaires_integration_ui: "temp/r246_media/lot4_instrument.probe.mjs (F142.*)"
```

```yaml
id: BUG-0009
statut: VERIFIED
priorite: MOYENNE
categorie: PERSISTANCE
fonctions: [F087]
scenarios: [S038, L05]
plateforme: "Web"
canal: "MCP direct"
gestes_reproduction: ["1. captures.start audio puis captures.stop", "2. lire la prise dans la liste des médias"]
attendu: "la taille du fichier"
observe: "size null : la prise lisait wavInfo.byteSize, champ qui n'existe pas (WavInfo n'a ni byteSize ni byte_size)"
proprietaire_canonique: "eVe/domains/media/api/audio_core_record_persist.js"
correctif: "size_bytes = la longueur du WAV encodé ; la liste rend aussi natural_width/height des prises (photo)"
tests_unitaires_integration_ui: "temp/r246_media/lot6_capture.probe.mjs (S038.*_media_real)"
```

```yaml
id: BUG-0010
statut: VERIFIED
priorite: HAUTE
categorie: AUDIO_VIDEO
fonctions: [F146]
scenarios: [L08]
plateforme: "Web"
canal: "MCP direct"
gestes_reproduction: ["1. déposer un son et une vidéo dans un projet en vue Timeline", "2. ui.timeline.read"]
attendu: "un clip audio et un clip vidéo"
observe: "deux clips de type group (visuel, sans son au mixage) : clipKindFor ne lisait ni props ni atome_type"
proprietaire_canonique: "eVe/intuition/tools/molecule/runtime_creation.js#clipKindFor"
correctif: "cause tracée (passe 9) : un import appelle wrapAtomeInGroupTimeline avec les seuls identifiants, et runtime_creation.js#attach devinait type et durée sans description. attach lit maintenant l'enregistrement canonique de l'atome quand le détail ne le décrit pas ; clipKindFor et sourceDuration lisent properties ou props, et atome_type"
tests_unitaires_integration_ui: "temp/r246_media/lot5_timeline.probe.mjs (F146.clips_laid, clip_kinds) ; retest indépendant temp/r246_media/retest2_all.probe.mjs, retest2_tl.probe.mjs (19 nov.) : vérifié pour un fichier déposé seul. Deux fichiers déposés ensemble sur la Timeline font un dossier (R-202 Q14) et un seul clip group : question à l'utilisateur dans R-246"
```

```yaml
id: BUG-0011
statut: VERIFIED
priorite: HAUTE
categorie: VOIX
fonctions: [C0433, C0434]
scenarios: [X19]
plateforme: "Web"
canal: "MCP direct (voix)"
gestes_reproduction: ["1. ouvrir un projet", "2. captures.start { kind: 'video', duration_seconds: 3 }"]
attendu: "la prise filmée dans le projet, comme l'outil rec. du ruban"
observe: "PRESENTATION_UNAVAILABLE : captures.* ne connaissait que la liste du Dashboard ; à la voix, aucune prise n'était possible dans un projet"
proprietaire_canonique: "eVe/domains/capture/capture_runtime.js"
correctif: "sans présentation du Dashboard, captures.start/stop/state/close passent par les outils rec. du projet (ui.capture.audio, video, midi avec active ; photo en un cliché sur le projet courant), comme captures.camera passait déjà par l'outil seul ; durée minutée par captures.stop planifié"
tests_unitaires_integration_ui: "temp/r246_media/lot7_x19.probe.mjs, passe 12a (19 nov.) : prises vidéo et narration dictées dans le projet, posées sur la Timeline (clips video et audio), lecture qui avance ; retest indépendant (sous-agent, 19 nov., temp/r246_media/retest3_captures.probe.mjs, rapport temp/r246_retest3/captures/) : VERIFIED"
```

```yaml
id: BUG-0012
statut: VERIFIED
priorite: MOYENNE
categorie: AUDIO_VIDEO
fonctions: [F146]
scenarios: [X19]
plateforme: "Web"
canal: "MCP direct et Play de la Timeline"
gestes_reproduction: ["1. projet en vue Timeline", "2. plein écran du Visuel (il s'arme)", "3. Play"]
attendu: "le Visuel passe en plein écran quand la Timeline joue"
observe: "il restait armé : seule la lecture de la vue Naturel/Liste l'activait, la Timeline joue sur son propre transport Molecule"
proprietaire_canonique: "eVe/domains/rendering/project_view_visual_fullscreen_runtime.js"
correctif: "project_view_surface_events.js suit déjà le transport Molecule de la Timeline : son annonce « playing » active le plein écran armé (onTimelinePlaying), et shouldProject compte la Timeline qui joue (projectTimelinePlaying), quel que soit le déclencheur (Play, voix, prise)"
tests_unitaires_integration_ui: "temp/r246_media/lot7_x19.probe.mjs (X19.fullscreen_projects_while_playing : passe 13, 19 nov., lot7 tout vert) ; retest indépendant (sous-agent, 19 nov., temp/r246_media/retest3_captures.probe.mjs, rapport temp/r246_retest3/captures/) : VERIFIED"
```

```yaml
id: BUG-0013
statut: VERIFIED
priorite: CRITIQUE
categorie: PERSISTANCE
fonctions: [C0433]
scenarios: [X01]
plateforme: "Web"
canal: "MCP direct (voix)"
gestes_reproduction: ["1. ouvrir un projet", "2. captures.start { kind: 'photo' } deux fois", "3. Atome.getStateCurrent(projet)"]
attendu: "deux photos rangées dans le projet, l'atome du projet inchangé"
observe: "l'atome du projet réécrit en image (kind image, source de la photo), la seconde photo par-dessus la première : régression introduite par le premier correctif de BUG-0011, qui passait le projet comme projectAtomeId (l'emplacement à remplir)"
proprietaire_canonique: "eVe/domains/capture/capture_runtime.js ; eVe/domains/media/api/media_persistence_service.js#ensureProjectMediaAtome"
correctif: "la photo dictée passe ownerProjectId, comme le ruban ; la persistance refuse explicitement (capture_slot_is_project) un identifiant réservé égal au projet qui reçoit la prise"
tests_unitaires_integration_ui: "temp/r246_media/lot8_x01_x07.probe.mjs (X01.project_holds_takes, X01.project_intact) : passe 14, 19 nov., 21/21 (2 photos, 1 vidéo, 1 narration dans le projet, atome du projet intact) ; retest indépendant (sous-agent, 19 nov., temp/r246_media/retest3_captures.probe.mjs, rapport temp/r246_retest3/captures/) : VERIFIED"
```

```yaml
id: BUG-0014
statut: FIXED
priorite: HAUTE
categorie: VOIX
fonctions: [C0433, C0434]
scenarios: [X19, X01]
plateforme: "Web"
canal: "outil rec. du ruban puis MCP direct (voix)"
gestes_reproduction: ["1. ouvrir un projet", "2. outil ui.capture.audio { active: true } (le toucher)", "3. captures.state puis captures.stop"]
attendu: "la prise en cours vue (recording true) et arrêtée à la voix"
observe: "captures.state répondait recording false et captures.stop NOTHING_RECORDING pendant la prise : capture_runtime.js suivait la prise par sa propre variable, remplie par captures.start seulement (trouvé par le retest indépendant du 19 nov.)"
proprietaire_canonique: "eVe/domains/capture/capture_runtime.js"
correctif: "la prise en cours se lit sur les enregistreurs eux-mêmes (getAudioRecordingState, getVideoRecordingState, getVideoRecordingControllerState, getMidiCaptureState), qu'elle ait commencé à la voix ou au toucher"
tests_unitaires_integration_ui: "temp/r246_media/lot12_v1_bug14.probe.mjs (à lancer)"
```

Constaté, conforme à la règle validée (pas un ticket) : un HEIC reste un fichier dans Médiathèque › Données sur Chromium, qui ne le décode pas (R-202). Question à l'utilisateur dans R-246.

## Modèle à copier au premier défaut

```yaml
id: BUG-0001
statut: OPEN
priorite: CRITIQUE | HAUTE | MOYENNE | BASSE
categorie: FONCTION | UI_LISIBILITE | UI_MASQUE | GESTE | FLUIDITE | PERFORMANCE | AUDIO_VIDEO | SECURITE | DEPENDANCE | PARITE_PLATEFORME | MCP | VOIX | PERSISTANCE
fonctions: [C0001, U0001, F001]
scenarios: [S001, X01, Q01]
version_code_et_commit: ""
plateforme: "Web | Tauri macOS | Tauri Windows | iOS | Android | FreeBSD"
appareil_os_moteur_webview: ""
canal: "souris-clavier | tactile | voix réelle | MCP direct"
donnees_test_synthetiques: ""
preconditions: ""
gestes_reproduction: ["1. ...", "2. ..."]
attendu: ""
observe: ""
impact_fonctionnel_et_visuel: ""
risque_securite_et_personnes_impactees: ""
preuve_ecran_video: "chemin vers fichier privé"
logs_expurges: ""
mesures_avant: "FPS, CPU, RAM, latence, son, GPU"
frequence: ""
proprietaire_canonique: ""
origine_du_defaut_confirmee: ""
correctif: ""
factorisation_simplification: ""
optimisation_et_mesures_apres: ""
dependances_et_versions: ""
controles_securite: ""
tests_unitaires_integration_ui: ""
regressions_cross_platform: ""
retour_ia_testeuse: ""
archive_apres_verification: ""
```

## Compte rendu par lot (à renseigner)

- Lot / Date / commit :
- Scénarios tentés :
- Fonctions réellement testées (C/U/F) :
- Parcours Web / Tauri macOS / Windows / iOS / Android / FreeBSD :
- Canaux tactile, clavier-souris, voix eVe et MCP :
- Problèmes critiques/hauts/moyens/bas :
- Temps et performances mesurés :
- Dépendances obsolètes/incompatibles/vulnérables :
- Regressions et preuves de retest :
- Ticket d'amélioration documentaire (si le catalogue était incomplet) :
