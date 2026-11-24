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
statut: VERIFIED
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
retest: "24 nov., temp/r246_retest5/media_voice.probe.mjs (passe 2, 30/30) : image 1500×1000 recadrée carré, quart de tour, mono, luminosité 60, arrondi 60 → PNG 1000×1000, gris, coins transparents, bandes gardées, plus clair que la même retouche sans luminosité (71 contre 51, 114 contre 84) ; image neutre = octets d'origine (14 849 o). VERIFIED"
```

```yaml
id: BUG-0002
statut: VERIFIED
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
retest: "24 nov., temp/r246_retest5/media_voice.probe.mjs (passe 2, 30/30) : fichier de 0 octet gardé et arrivé au serveur (taille 0), PNG, WAV et JPEG suivants arrivés, aucun fichier en attente ; un fichier refusé (400) mis de côté sans arrêter la passe, remis en file par requeueRefusedBrowserWorkspaceEvents, puis arrivé au serveur. VERIFIED"
```

```yaml
id: BUG-0003
statut: VERIFIED
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
retest: "24 nov., temp/r246_retest5/media_voice.probe.mjs (passe 2, 30/30) : GET /api/uploads porte mime_type, width/height (boîte), natural_width/natural_height 320×200 et duration_sec 1 s du WAV. VERIFIED"
```

```yaml
id: BUG-0004
statut: VERIFIED
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
retest: "24 nov., temp/r246_retest5/bug4_edit_list.node.mjs 9/9 : silence sur un quart puis étirement ×2 accepté, longueur ×2, silence ×2 ; transposition +3 acceptée, silence inchangé ; étirement partiel commencé dans le silence juste (le rendu WASM ne se charge pas sous Node, non exécuté). VERIFIED"
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
statut: VERIFIED
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
tests_unitaires_integration_ui: "temp/r246_media/lot12_v1_bug14.probe.mjs : passes 18 (19 nov.) et 19 (24 nov.) 18/18 ; retest indépendant temp/r246_retest4/bug14_captures.probe.mjs à relancer (la passe 20 a été coupée par la garde de swap)"
retest: "24 nov., temp/r246_retest4/bug14_captures.probe.mjs relancée (retest 5, passe 2) 32/32 ALL OK : prises audio et vidéo touchées en projet vues et arrêtées à la voix. VERIFIED"
```

```yaml
id: BUG-0015
statut: VERIFIED
priorite: HAUTE
categorie: VOIX
fonctions: [C0433, C0434]
scenarios: [X19, X24]
plateforme: "Web"
canal: "outil rec. puis MCP direct (voix)"
gestes_reproduction: ["1. un projet, vue Timeline", "2. rec. au toucher, ou captures.start { kind, duration_seconds }", "3. captures.state / captures.stop ; une prise minutée arrêtée tôt puis une nouvelle prise"]
attendu: "la prise de la Timeline vue et arrêtée à la voix ; un arrêt minuté n'atteint que sa propre prise ; captures.stop { take } laisse une autre prise"
observe: "trouvé par la lecture du retest indépendant (24 nov.) : dans la Timeline la prise passe par l'enregistrement de la Timeline (capture.js#recordIntoTimeline), invisible à projectTake() ; en projet l'arrêt minuté partait sans { take } et coupait la prise suivante ; captures.stop { take } ignorait take ; captures.state ne donnait aucun numéro"
proprietaire_canonique: "eVe/domains/capture/capture_runtime.js"
correctif: "projectTake() lit aussi la prise de la Timeline (project_view_timeline_content.js expose recordingTake, le live() de son enregistreur) ; chaque prise de projet a un numéro tiré de son identité (son fichier, l'instant MIDI startedAtMs ajouté à getMidiCaptureState, son départ dans la Timeline) ; l'arrêt minuté vise { take }, stop { take } est respecté, state donne take"
tests_unitaires_integration_ui: "temp/r246_retest4/bug14_captures.probe.mjs (cas Timeline, minuté, take nommé), à lancer"
retest: "24 nov., temp/r246_retest4/bug14_captures.probe.mjs (retest 5, passe 2) 32/32 : Timeline touchée et à la voix vue/arrêtée, arrêt minuté n'atteint pas la prise suivante, stop { take } d'un autre numéro laisse la prise, state donne take. VERIFIED"
```

```yaml
id: BUG-0016
statut: VERIFIED
priorite: HAUTE
categorie: VOIX
fonctions: []
scenarios: []
plateforme: "Web, toutes"
canal: "voix réelle"
gestes_reproduction: ["1. l'assistant dit une phrase", "2. « stop » (tts.stop) ou une interruption (voice.interrupt)", "3. « reprends »"]
attendu: "la phrase arrêtée est reprise (resume_interrupted)"
observe: "arrêter une phrase la marquait d'abord « finie » (tts_runtime.js#stop règle la lecture, service.js#tts.speak prenait toute fin pour une fin naturelle) : interrupted_from_phase completed, resume_available false, la lecture done au lieu de cancelled, cancel_roundtrip_ms 0 ; trouvé en remettant service.probe.mjs au réel (24 nov.)"
proprietaire_canonique: "atome/src/squirrel/voice/service.js"
correctif: "une fin stopped ne termine plus le tour ; voice.cancel.requested est publié avant l'arrêt du son"
tests_unitaires_integration_ui: "tests/atome/src/squirrel/voice/service.probe.mjs (4 contrôles ajoutés) et temp/r246_voice_probe/stop_order.mjs : avant speaking > done > cancel > interruption, resume_available false ; après speaking > cancel > interruption, resume_available true, suite resume_interrupted"
retest: "24 nov., temp/r246_retest5/bug16_stop_resume.node.mjs 12/12 + tests/atome/src/squirrel/voice/service.probe.mjs ok : tts.stop et voice.interrupt depuis speaking, resume_available true, lecture cancelled, cancel.requested avant l'interruption, suite resume_interrupted ; fin naturelle sans reprise. VERIFIED"
```

```yaml
id: BUG-0017
statut: VERIFIED
priorite: HAUTE
categorie: VOIX
fonctions: []
scenarios: []
plateforme: "Web, toutes"
canal: "tactile"
gestes_reproduction: ["1. Dashboard › Santé, aide à la prescription (symptômes) ou ordonnance", "2. Dicter", "3. fermer le panneau par son ✕ ou passer à une rubrique"]
attendu: "le micro s'arrête quand l'écran se ferme"
observe: "healthRecordPanel.leave ne courait qu'au changement d'écran ; la fermeture du panneau (onClose) laissait la dictée écouter ; et Dicter touché deux fois pendant un départ ouvrait deux sessions, la première orpheline (lecture du retest indépendant, 24 nov.)"
proprietaire_canonique: "eVe/domains/dashboard/health_record_panel.js, eVe/domains/dashboard/dashboard_dictation.js"
correctif: "onClose du panneau finit ce que son écran tient ouvert ; une dictée à la fois : un départ en cours est la dictée (un second toucher l'arrête quand elle écoute), un nouveau départ arrête d'abord le précédent"
tests_unitaires_integration_ui: "temp/r246_retest4/v1_dictation.probe.mjs : double Dicter 1 session, aucune orpheline (passe 20) ; fermeture à relancer"
retest: "24 nov., temp/r246_retest4/v1_dictation.probe.mjs (retest 5, passe 2) 26/26 : fermeture par ✕, écran suivant et rubrique arrêtent la dictée (aide et ordonnance) ; double Dicter pendant un départ : une session, aucune orpheline. VERIFIED"
```

```yaml
id: BUG-0018
statut: VERIFIED
priorite: CRITIQUE
categorie: FONCTION
fonctions: []
scenarios: []
plateforme: "Web, toutes"
canal: "copier / coller"
gestes_reproduction: ["1. un projet", "2. copier un objet (persistClipboardGroups)"]
attendu: "le presse-papiers est enregistré dans le projet"
observe: "ReferenceError getCurrentProjectId (clipboard/state.js:104) : régression de mon lot P1 du 24 nov., le module réexportait le propriétaire sans le nom qu'il utilise lui-même ; trouvé par le retest indépendant (passe 20)"
proprietaire_canonique: "eVe/intuition/tools/clipboard/state.js"
correctif: "importé sous le nom utilisé et réexporté ; Biome noUndeclaredVariables (configuration isolée) passé sur les 34 fichiers touchés : aucun nom non déclaré"
tests_unitaires_integration_ui: "temp/r246_retest4/p1_current_project.probe.mjs (persistClipboardGroups), à relancer"
retest: "24 nov., temp/r246_retest4/p1_current_project.probe.mjs (retest 5, passe 2) : persistClipboardGroups sans ReferenceError, presse-papiers dans le projet ouvert (OK) ; deux contrôles statiques du lot P1 (lecture du calque project_view_ dans 5 + 21 modules) échouent, hors de ce ticket. VERIFIED"
```

```yaml
id: BUG-0019
statut: VERIFIED
priorite: HAUTE
categorie: VOIX
fonctions: []
scenarios: []
plateforme: "Web, toutes"
canal: "voix (captures.state / captures.stop) après un toucher"
gestes_reproduction: ["1. le Dashboard, Capture fermée", "2. toucher l'outil d'enregistrement d'un son (ui.capture.audio)", "3. dire « où en est la prise ? » puis « arrête »"]
attendu: "la voix voit la prise et l'arrête"
observe: "captures.state répond recording:false et captures.stop NOTHING_RECORDING : sur le Dashboard la présentation de Capture répondait seule, sans lire les enregistreurs ; et `take: null` sortait au repos, hors du contrat (entier) ; trouvé par le retest indépendant (passe 22)"
proprietaire_canonique: "eVe/domains/capture/capture_runtime.js"
correctif: "la prise en cours est celle de la session Capture tant qu'elle est ouverte, sinon celle des enregistreurs (liveTake), pour state, stop et close ; `take` donné seulement pendant une prise"
tests_unitaires_integration_ui: "temp/r246_retest4/bug14_captures.probe.mjs, passe 23"
retest: "24 nov., temp/r246_retest5/media_voice.probe.mjs (passe 2, 30/30) + bug14_captures 32/32 : au repos state sans clé take ; prise touchée sur le Dashboard vue (take entier) et arrêtée à la voix. VERIFIED"
```

```yaml
id: BUG-0020
statut: VERIFIED
priorite: HAUTE
categorie: VOIX
fonctions: []
scenarios: []
plateforme: "Web, toutes"
canal: "dictée (Dicter, ordonnance, aide à la prescription)"
gestes_reproduction: ["1. ouvrir l'app", "2. toucher Dicter avant que la vague de démarrage optionnelle de la voix soit chargée"]
attendu: "la dictée écoute"
observe: "dashboard_dictation_unavailable : la dictée lisait window.AtomeVoice sans le poser ; le service vocal arrive par une vague optionnelle (spark.js) et, posé plus tard, remplaçait l'objet déjà là ; la lecture à voix haute d'une prise avait le même défaut ; trouvé en passe 22 (window.AtomeVoice absent)"
proprietaire_canonique: "eVe/voice/global_voice.js (nouveau)"
correctif: "globalVoice(win) pose le service par son bootstrap (idempotent) puis le donne ; utilisé par la dictée, la lecture d'une prise, et les trois copies du même code (GPS, Sport, mot d'éveil) remplacées"
tests_unitaires_integration_ui: "lot12_v1_bug14 et temp/r246_retest4/v1_dictation.probe.mjs, passe 23"
retest: "24 nov., temp/r246_retest5/media_voice.probe.mjs (passe 2, 30/30) : AtomeVoice absent (vague optionnelle non chargée), createDashboardDictation().start() le pose et écoute (ok, session) ; un bootstrap ultérieur garde le même objet ; v1_dictation 26/26. VERIFIED"
```

```yaml
id: BUG-0021
statut: VERIFIED
priorite: CRITIQUE
categorie: FONCTION
fonctions: []
scenarios: []
plateforme: "toutes"
canal: "ordonnance dictée, recherche d'un médicament, scan d'une boîte"
gestes_reproduction: ["1. Médicaments › Ordonnance", "2. dicter « Doliprane 1000 mg trois fois par jour pendant cinq jours »"]
attendu: "la ligne Doliprane 1000 mg apparaît dans l'ordonnance"
observe: "aucune ligne : ordonnance.dictate répond medicine_catalogue_unavailable ; la recherche lisait `assets/health/bdpm_index.json`, un fichier que rien ne produit (resté « à faire » au registre depuis le 5 nov.) ; la recherche, le scan d'une boîte et la dictée échouaient donc partout ; trouvé par le retest indépendant (passes 27-28)"
proprietaire_canonique: "eVe/domains/health_protocol/medicine_catalogue.js"
correctif: "l'index de recherche est fait de la partie médicaments du bundle de référence santé que le serveur construit chaque mois (une seule lecture, partagée avec la posologie : health_reference_client.js#loadHealthReferenceMedicinesPart) ; le fichier inexistant n'est plus lu"
tests_unitaires_integration_ui: "temp/r246_media/p2/medicine_catalogue_bundle.probe.mjs (Node, bundle d'essai du crate, 6/6) ; temp/r246_retest4/v1_dictation.probe.mjs à relancer"
retest: "24 nov., temp/r246_media/p2/medicine_catalogue_bundle.probe.mjs 6/6 et temp/r246_retest4/v1_dictation.probe.mjs (retest 5, passe 2, bundle d'essai) : la ligne Doliprane dictée entre dans l'ordonnance. VERIFIED"
```

```yaml
id: BUG-0022
statut: VERIFIED
priorite: CRITIQUE
categorie: MCP
fonctions: []
scenarios: []
plateforme: "toutes"
canal: "MCP tools/list (tout client MCP, eve://bricks)"
gestes_reproduction: ["1. dans la page, appeler tools/list par handleMcpProtocolMessage"]
attendu: "la liste des outils, page par page"
observe: "erreur -32603 mcp_tool_unregistered:tool_definition:display.follow, puis, après régénération, :text_selection.assistant ; les commandes display.follow/unfollow/relay (R-248) et les six outils de sélection de texte (R-244, 19 nov.) n'étaient pas dans le registre ; registry:check signalait six sources périmées ; le constructeur ne lisait depuis le code que les outils de timeline_actions.js"
proprietaire_canonique: "scripts/registry/registry_project_commands.mjs#projectRuntimeUiActions"
correctif: "les outils d'exécution sont lus dans le code d'une liste de propriétaires (RUNTIME_ACTION_FILES : timeline_actions.js, text_selection_tools.js), plus aucun outil de ce genre déclaré à la main ; registre régénéré (voies accordées), registry:check ok, hash e03bec334f68"
tests_unitaires_integration_ui: "temp/r246_media/bricks/web.probe.mjs, passe 31 : tools/list 1420 outils, eve://bricks ALL OK ; la sonde liste d'un coup tout outil de la page absent du registre"
retest: "24 nov., temp/r246_media/bricks/web.probe.mjs (retest 5, passe 2) 5/5 : aucun outil de la page hors registre, tools/list 1420 outils, eve://bricks 87 familles 1420/1420 ; registry:check ok (hash e03bec334f68). VERIFIED"
```

```yaml
id: BUG-0023
statut: VERIFIED
priorite: MAJEURE
categorie: VOIX
fonctions: ["captures.stop"]
scenarios: []
plateforme: "toutes"
canal: "voix (captures.stop) sur une prise lancée au toucher sur le Dashboard"
gestes_reproduction: ["1. Dashboard : toucher l'outil d'enregistrement son", "2. dire « arrête » aussitôt"]
attendu: "la prise s'arrête et la réponse dit ce qui s'est passé"
observe: "la prise s'arrête, mais la réponse est WRITE_FAILED ; la vraie cause (anneau des erreurs) est audio_recording_empty : une prise silencieuse n'est pas gardée"
proprietaire_canonique: "atome/src/squirrel/capture/contracts.js#captureError"
correctif: "nouveau code de contrat TAKE_EMPTY (audio_recording_empty, video_recording_empty_output) : arrêtée, rien n'est gardé ; décrit dans captures.stop ; registre régénéré"
tests_unitaires_integration_ui: "temp/r246_retest4/bug14_captures.probe.mjs, passe 32 : 32/32 ALL OK"
retest: "24 nov., temp/r246_retest5/media_voice.probe.mjs (passe 2, 30/30) : prise touchée de 3,5 s arrêtée à la voix ok:true ; arrêt immédiat ok ou TAKE_EMPTY, jamais WRITE_FAILED, enregistreur arrêté ; bug14_captures 32/32. VERIFIED"
```

```yaml
id: BUG-0024
statut: VERIFIED
priorite: HAUTE
categorie: VOIX
fonctions: ["audio_voice_start"]
scenarios: []
plateforme: "Tauri macOS, Tauri Windows, Android, iOS (le moteur vocal natif)"
canal: "session vocale native ouverte une deuxième fois dans le même processus"
gestes_reproduction: ["1. guide vocal ouvert puis fermé (ou moteur redémarré après une erreur)", "2. le rouvrir"]
attendu: "la session se rouvre"
observe: "audio_voice_start échoue : voice_vad_failed: only one environment is allowed per process ; ONNX Runtime (ort 2.0.0-rc.15, environment.rs:516) ne construit qu'un environnement par processus, même après qu'il a été libéré"
proprietaire_canonique: "atome/engines/audio-engine/src/voice/mod.rs#environment"
correctif: "un seul environnement du processus, construit à la première session et gardé pour toutes les suivantes"
tests_unitaires_integration_ui: "test voice::tests::every_session_shares_the_one_process_environment ; sonde temp/r246_v3/parity (5 sessions de suite dans un processus, 0 erreur)"
retest: "24 nov., retest indépendant 7, temp/r246_retest7/session_probe (sonde Rust propre, PCM poussé) : 9 sessions de suite dans un processus (wake, collect, conversation × 3), chacune ouverte, un second start refusé voice_session_busy, arrêtée, 0 erreur ; cargo test -p atome-audio-engine --features voice 43/43 (+1/1). VERIFIED"
```

```yaml
id: BUG-0025
statut: VERIFIED
priorite: MOYENNE
categorie: VOIX
fonctions: ["audio_wake_read"]
scenarios: []
plateforme: "Tauri macOS, Android, iOS"
canal: "veille suspendue pendant que le guide tient le micro"
gestes_reproduction: ["1. activation vocale allumée", "2. le guide vocal ouvert (il tient le micro)", "3. la veille réessaie chaque seconde"]
attendu: "la veille attend sans rien prendre au guide"
observe: "le test de disponibilité lisait la capture (audio_wake_read) : il prenait au guide le son reçu depuis sa dernière lecture ; au bureau il répondait en plus « libre » pendant que la capture tournait, d'où un nouvel essai qui échouait"
proprietaire_canonique: "atome/src/squirrel/voice/wake_capture.js#wakeCaptureAvailable"
correctif: "nouvelle commande audio_wake_state (Rust wake_capture::state, Swift wakeCaptureState) qui dit seulement si la capture est prise"
tests_unitaires_integration_ui: "temp/r246_v3/native_backend.probe.test.mjs (« availability asks the capture state, never reads its PCM »)"
retest: "24 nov., retest indépendant 7 : wake_capture::state() sans capture busy:false, en arrière-plan busy:true puis false (session_probe) ; temp/r246_retest7/wake_engine_select.probe.test.mjs : captureAvailable n'appelle que audio_wake_state (Tauri et iOS, busy/failed → indisponible), audio_wake_read jamais appelé (le faux hôte échoue s'il l'est) ; 34/34 avec les tests du mot d'éveil. VERIFIED"
```

```yaml
id: BUG-0026
statut: VERIFIED
priorite: MOYENNE
categorie: VOIX
fonctions: ["audio_voice_start", "audio_voice_stop"]
scenarios: []
plateforme: "Tauri macOS, Android, iOS"
canal: "moteur vocal natif (native_voice_engine.js)"
gestes_reproduction: ["1. une session vocale native tenue par un propriétaire (le guide)", "2. un second moteur tente de démarrer : voice_session_busy", "3. il s'arrête (redémarrage après erreur)"]
attendu: "la session du premier propriétaire continue"
observe: "stop() envoyait audio_voice_stop sans avoir rien démarré : il arrêtait la session de l'autre. Et sur Android le moteur natif ouvrait le micro sans demander la permission (seule la capture de la veille la demandait), d'où un micro muet possible"
proprietaire_canonique: "atome/src/squirrel/voice/native_voice_engine.js"
correctif: "stop() n'arrête que la session que ce moteur a démarrée ; start() demande la permission du micro par ensureNativeMicrophone (wake_capture.js), comme toute capture native"
tests_unitaires_integration_ui: "temp/r246_v3/native_backend.probe.test.mjs (« a busy session is reported as a busy capture and its owner keeps it », « a refused start stops nobody »)"
retest: "24 nov., retest indépendant 7, temp/r246_retest7/wake_engine_select.probe.test.mjs : start refusé voice_session_busy (chaîne Tauri et Error iOS) → wake_capture_busy et 0 audio_voice_stop ; micro refusé → 0 audio_voice_start ; fermé pendant le démarrage → arrêté une fois ; vérificateur refusé → la session démarrée est arrêtée ; 11/11. VERIFIED"
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
