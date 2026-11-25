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

Campagne R-246, phase 1 sécurité, Web (serveur de sonde isolé, binaire de la session, sondes Node sur l'entrée MCP réelle), 25 nov. 2026. Comptes fictifs Alice, Bob, Carol ; aucune donnée réelle.

```yaml
id: BUG-0027
statut: FIXED_AWAITING_RETEST
priorite: CRITIQUE
categorie: SECURITE
fonctions: [C0716]
scenarios: [Q01, Q11]
plateforme: "Web (atome-server), même code pour le WS file upload-complete"
canal: "HTTP POST /api/uploads, WS file upload-complete"
donnees_test_synthetiques: "comptes de sonde, octets aléatoires"
gestes_reproduction: ["1. Bob envoie un fichier avec X-Atome-Id = l'id d'un fichier d'Alice, ou l'id du compte d'Alice (son atome user)", "2. relire l'atome nommé"]
attendu: "refus : un envoi n'écrit que l'atome de fichier de son propre compte, ou un id neuf"
observe: "l'enregistrement du fichier réécrivait l'atome nommé quel que soit son propriétaire : le fichier d'Alice passait à Bob, et un compte (atome user) devenait un fichier de Bob, comptes détruits"
proprietaire_canonique: "atome/servers/atome-server/src/media/storage.rs#register"
origine_du_defaut_confirmee: "register insérait/mettait à jour l'atome `atome_id` sans vérifier son propriétaire ni son type"
correctif: "media/file_record.rs (nouveau, sorti de storage.rs 510 → 348 l.) : claimable() refuse upload_atome_not_owned si l'atome existe et n'est pas un fichier du même compte ; uploads.rs#registered répond 403 et efface le fichier reçu ; ws_api/file_ops.rs#completed efface aussi le fichier assemblé refusé"
factorisation_simplification: "storage.rs ramené sous 500 lignes : l'enregistrement d'un fichier a son propre propriétaire (file_record.rs)"
tests_unitaires_integration_ui: "media::file_record (3 tests : un autre compte, un compte lui-même, un id neuf ou son propre fichier) ; temp/r246_resume/security/q_server.probe.mjs (Q01 hijack : upload_naming_a_file_id, an_account, own_account, a_account_intact)"
retour_ia_testeuse: "Retest 25 nov. 2026 (lot retest_security) : ROUVERT puis réparé. temp/r246_resume/retest_security/r27_upload_claim.probe.mjs avec le binaire du lot security : 22/24 (temp/r246_resume/retest_security/r27_upload_claim.out) — un envoi nommant un atome qui n'existe que dans le coffre d'Alice (créé, octets pas encore envoyés : vault_object_registry, absent de la base centrale) était accepté (Bob 200) et l'envoi d'Alice refusé ensuite (403). Cause : claimable() ne lisait que la base centrale. Correctif : media/file_record.rs#register reçoit le VaultRouter ; un id nommé dont le coffre tenant est celui d'un autre compte n'est accepté que si le partage donne l'écriture (writable_in_vault → authorize_shared_write), sinon upload_atome_not_owned ; appelants mis à jour : media/uploads.rs#registered, ws_api/file_ops.rs#completed, media/wallpaper.rs, social/news/media.rs, providers/video.rs (champ router au lieu de central), providers/mod.rs. Après : 24/24 (temp/r246_resume/retest_security/r27_upload_claim.after.out) ; non-régression temp/r246_resume/security/q_server.probe.mjs 59/59. À retester par un autre agent."
```

```yaml
id: BUG-0028
statut: VERIFIED
priorite: HAUTE
categorie: SECURITE
scenarios: [Q05]
plateforme: "Web (import de document, même code partout)"
canal: "import d'un .docx"
gestes_reproduction: ["1. un .docx dont un lien externe vise javascript:, file:, data: ou vbscript:", "2. importDocumentFile"]
attendu: "seuls les liens web, mail et téléphone sont gardés, comme en Markdown et HTML"
observe: "le lien Word gardait tout schéma"
proprietaire_canonique: "eVe/domains/document/import/docx_body.js#walkInline"
correctif: "walkInline passe la cible par markdown_inline.js#linkLook (la règle de lien unique)"
tests_unitaires_integration_ui: "temp/r246_resume/security/q05_imports.probe.mjs 26/26"
retour_ia_testeuse: "Retest indépendant 25 nov. 2026 (lot retest_security) : temp/r246_resume/retest_security/r28_docx_links.probe.mjs 12/12 (temp/r246_resume/retest_security/r28_docx_links.out) — docx écrit octet par octet, 22 schémas hostiles (casse, espaces, entités et caractères de contrôle dans le schéma, //, \\\\, atome:, intent:, blob:, ms-word:), liens imbriqués, champs HYPERLINK simples et complexes, TargetMode autrement écrit, ancre ; par importOfficeDocument et importDocumentFile (.docx et .docm) : seuls https/mailto/tel restent, le texte reste en clair ; un NUL dans le schéma refuse le fichier entier. VERIFIED."
```

```yaml
id: BUG-0029
statut: VERIFIED
priorite: CRITIQUE
categorie: MCP
scenarios: [Q03, Q04]
plateforme: "toutes (atome/src/squirrel)"
canal: "MCP direct, voix, assistant"
gestes_reproduction: ["1. une commande outward (share.send, social.publish, shop.buy…) appelée par runtime.tools.call ou un lot par l'assistant (source ai ou voice)"]
attendu: "règle 22 : tenue, demandée à la personne dans sa conversation"
observe: "une politique outward sans confirmation_required s'exécutait aussitôt"
proprietaire_canonique: "atome/src/squirrel/atome/mcp_security_policy.js#resolveAccessPolicy"
correctif: "invariant à l'entrée unique : une politique outward permise est toujours à confirmer ; une commande CB outward pour certaines entrées seulement l'est pour celles-là (CB_CONFIRMED_WHEN)"
tests_unitaires_integration_ui: "temp/r246_resume/security/q_mcp_policy.probe.mjs 183/183 ; tests/eve/cb_l6_commands.test.mjs 4/4"
retour_ia_testeuse: "Retest indépendant 25 nov. 2026 : temp/r246_resume/retest_security/r29_outward_doors.probe.mjs 1533/1533 (temp/r246_resume/retest_security/r29_outward_doors.out) — chaque commande outward (OUTWARD_COMMANDS et CB_OUTWARD_COMMANDS), pour ai et voice, par 15 portes de l'entrée unique (chaque clé d'id, espaces, input sous params, lot seul ou après une étape bénigne, timer.schedule imbriqué deux fois, mcp.toolchains.execute, ai.tools.call), registre de l'assistant tout en risque low : rien n'atteint le runtime ni l'outil sans confirmation ; ui tenu aussi ; un outil bénin s'exécute. Le correctif tient. Nouveau défaut trouvé à côté : BUG-0100 (pont voix)."
```

```yaml
id: BUG-0030
statut: FIXED_AWAITING_RETEST
priorite: HAUTE
categorie: MCP
fonctions: [C0718, C0722, C0723, C0724, C0725, C0729, C0730, C0731, C0732]
scenarios: [Q03, Q07]
plateforme: "toutes (atome/src/squirrel)"
canal: "MCP direct, programme apparié derrière le relais"
gestes_reproduction: ["1. la personne fait une requête MCP (ui)", "2. un programme apparié avec « Lire » seulement (mcp.read) appelle mcp.operations.list / read, mcp.events.list, mcp.confirmations.list, mcp.proposals.list, mcp.operations.cancel"]
attendu: "un programme ne voit et n'annule que ses propres requêtes"
observe: "il lisait les résultats entiers des opérations de la personne (summarizeResult garde tout objet sans ok/error), leurs événements et le journal de sécurité par mcp.events.list, les confirmations et propositions de tout acteur, et annulait les opérations en cours de la personne"
proprietaire_canonique: "atome/src/squirrel/atome/mcp_core.js (opérations, événements)"
origine_du_defaut_confirmee: "les enregistrements ne portaient pas leur acteur ; les lectures ne filtraient pas"
correctif: "chaque opération et chaque événement porte actor_id (mcp.js le passe) ; visibleToActor : la personne (local_owner) voit tout, un programme ce qui est à lui ; lectures, annulation, confirmations, propositions filtrées ; les événements du journal de sécurité exigent mcp.security.read"
tests_unitaires_integration_ui: "temp/r246_resume/security/q_mcp_records.probe.mjs 50/50 ; tests/atome/src/squirrel/atome/mcp.platform_surface.probe.mjs, mcp.security_surface.probe.mjs PASS"
retour_ia_testeuse: "Retest 25 nov. 2026 : ROUVERT puis réparé. temp/r246_resume/retest_security/r30_program_reads.probe.mjs (vrai CommandBusV2) : un programme « Lire » lisait tout le journal de commandes de la personne (entrées, patchs) par runtime.audit.list et par la ressource runtime://audit/recent. Correctif : atome/src/squirrel/atome/mcp_handlers_ai_runtime.js — runtime.audit.list filtre les entrées par visibleToActor(acteur, envelope.actor.actor_id) avant la limite ; atome/src/squirrel/atome/mcp_resources.js — la lecture runtime://audit/recent passe __mcp à ce handler. Après : 48/48 (temp/r246_resume/retest_security/r30_program_reads.out) ; mcp.platform_surface, mcp.security_surface, mcp.runtime_bridge PASS ; non-régression q_mcp_records 50/50, q_mcp_policy 183/183. À retester par un autre agent."
```

```yaml
id: BUG-0031
statut: FIXED_AWAITING_RETEST
priorite: HAUTE
categorie: SECURITE
scenarios: [Q01, Q09, Q11]
plateforme: "Tauri macOS, Tauri Windows, Android, iOS (serveur local, atome-server src/local)"
canal: "HTTP 127.0.0.1:3000 (/api/uploads, /api/recordings, fichiers locaux)"
gestes_reproduction: ["1. GET http://127.0.0.1:3000/api/uploads/<fichier>?media_user_id=<compte> sans jeton, ou un en-tête X-User-Id seul", "2. avec un jeton valide, media_user_id = un autre compte de l'appareil"]
attendu: "le lecteur est la session vérifiée ; un nom de compte seul n'est pas une identité ; jamais le dossier d'un autre compte de l'appareil"
observe: "require_auth_user, list_uploads, l'envoi et la lecture des médias acceptaient X-User-Id / X-Phone / media_user_id sans jeton ; avec jeton, media_user_id choisissait n'importe quel dossier"
proprietaire_canonique: "atome/servers/atome-server/src/local/local_request_auth.rs"
correctif: "resolve_authenticated_user = la session vérifiée seule ; resolve_media_authenticated_user exige un jeton (bearer ou `token` de l'URL d'un élément média) et refuse un dossier tenu par un autre compte de l'appareil (auth_local_grants, guest_workspace_principals), le dossier distant de la personne elle-même restant lisible ; local_uploads.rs et local_file_transfer.rs passent par la session ; côté client media_api_auth.js#appendStreamingMediaAuthQuery met le jeton de session locale dans l'URL du serveur local de bouclage, media_api_local_availability.js exige ce jeton"
tests_unitaires_integration_ui: "local::local_request_auth::session_tests (2 tests : un nom sans session refusé ; dossier propre, propriétaire synchronisé, jamais un autre compte)"
regressions_cross_platform: "À VÉRIFIER PAR L'UTILISATEUR sur appareil : connexion Tauri macOS et iPad, puis affichage d'une image, lecture d'une vidéo et d'un son de la Médiathèque, d'un enregistrement, d'un média reçu en partage. Le contrôle à distance Tauri (remote_control.rs) garde son secret propre."
retour_ia_testeuse: "Retest 25 nov. 2026 : ROUVERT (lecture du code du module local) puis réparé, quatre portes restantes : (a) local/local_ws_file.rs#resolve_ws_file_user_id prenait user_id/userId/owner_id du message avant le jeton → envoi dans le dossier de n'importe quel compte sans jeton ; désormais le seul compte prouvé par le jeton (verified_user_id_from_token). (b) local/local_recordings.rs#delete_recording_handler supprimait dans le dossier nommé (media_user_id) ; désormais le seul compte de la session (bearer ou token de l'URL). (c) /file/* = ServeDir(project_root) sans aucune authentification (données de tous les comptes, en dev tout le dépôt, joignable par tout processus local et par rebinding DNS) ; nouveau local/local_file_access.rs (middleware branché dans local_start.rs) : session vérifiée exigée, chemin borné à data/users/<dossier>/… et dossier lisible par la session (folder_readable_by rendu pub(super)), rien d'autre servi ; côté client media_api_auth.js#resolveProtectedStreamingTarget traite /file/ sur le bouclage comme un média protégé (jeton de session locale ajouté, jamais hors bouclage, ni sur atome: iOS ni sur le Web) et media_source_runtime.js#resolveMediaSrc ajoute ce jeton à l'URL /file/ réécrite vers 127.0.0.1. (d) local/local_atome_reads.rs#handle_list prenait le propriétaire nommé (ou *) pour lecteur : chaque ligne passe désormais can_read(session), sauf l'annuaire public des personnes. Preuves : cargo test -p atome-server --lib vault_router:: media::file_record local:: 102/102 (temp/r246_resume/retest_security/rust_tests2.log), dont local_file_access::only_a_folder_of_data_users_is_served, session_tests::a_file_message_acts_for_its_token_never_a_named_account, local_atome_isolation_tests::an_atome_list_naming_another_owner_reads_as_the_session ; clippy -D warnings 0 (temp/r246_resume/retest_security/clippy.log), temp/r246_resume/retest_security/r31_file_token.test.mjs 2/2 (vitest, config temp/r246_resume/retest_security/vitest.config.mjs). Le Tauri n'est pas lancé sur ce Mac par la sonde : À VÉRIFIER PAR L'UTILISATEUR sur appareil (Tauri macOS et iPad : affichage d'une image, vidéo, son et enregistrement de la Médiathèque, fond d'écran, suppression d'un enregistrement). À retester par un autre agent."
```

```yaml
id: BUG-0032
statut: FIXED_AWAITING_RETEST
priorite: MOYENNE
categorie: SECURITE
scenarios: [Q06, Q05]
plateforme: "toutes (eVe/domains/script)"
canal: "document partagé en écriture, import, synchro"
gestes_reproduction: ["1. Bob, co-éditeur du document d'Alice, écrit dans `scripts` un script `trust: 'enabled'` (ou change la source d'un script qu'Alice avait activé en gardant `enabled`)", "2. Alice (ou son assistant) lance script.run"]
attendu: "un script ne tourne que pour qui l'a activé, et seulement la source vue"
observe: "la confiance était le champ `trust` du document, écrit par quiconque écrit le document ; untrustScripts() (prévu pour l'import et le partage) n'avait aucun appelant"
proprietaire_canonique: "eVe/domains/script/script_commands.js, script_trust.js"
correctif: "la confiance est un Atome privé de la personne `script_trust` (nouveau type, atome/src/shared/access_social_atome_types.js ; registre régénéré, 4872 entrées) portant le SHA-256 de lang+source ; run et list le relisent (propriétaire = la personne) ; le champ du document reste 'untrusted' ; withTrust et untrustScripts supprimés"
factorisation_simplification: "un seul lieu de confiance au lieu d'un appel à câbler sur chaque chemin d'entrée"
tests_unitaires_integration_ui: "temp/r246_resume/security/q06_script_trust.probe.mjs 13/13 (commandes réelles sur un magasin en mémoire qui garde le propriétaire)"
regressions_cross_platform: "un script activé avant ce correctif doit être réactivé une fois (la confiance ancienne était dans le document)"
retour_ia_testeuse: "Retest 25 nov. 2026 : ROUVERT puis réparé. temp/r246_resume/retest_security/r32_trust_forgery.probe.mjs, binaire du lot security : 6/11 (temp/r246_resume/retest_security/r32_trust_forgery.out) — Bob, co-éditeur (écriture + création) du document d'Alice, créait script_trust:<alice>:<doc>:<script> sous le document partagé : la création par partage atterrit dans le coffre d'Alice, propriétaire Alice, avec le condensat de Bob → script_commands.js#trusted le croyait. Même trou pour mcp_program_grant, objective_visibility, objective_network. Et un id prévisible pouvait être squatté dans le coffre de Bob (enregistré à lui pour toujours : la confiance d'Alice devenait impossible). Correctif : marque `owner_only: true` sur ces quatre types (atome/src/shared/access_social_atome_types.js#owned, émise par scripts/registry/registry_atome_types.mjs ; eVe/registry/generated/atome_types.json régénéré, seule différence 4 × owner_only, registry:check ok) ; serveur atome-server/src/vault_router/owner_only.rs (nouveau) : VaultRouter#refuse_owner_only, appelé par vault_router/mod.rs#commit, refuse atome_owner_only quand l'écrivain n'est pas le propriétaire du coffre et que l'événement ou l'atome existant est d'un type owner_only, et quand l'id d'un type owner_only nomme un autre compte existant ; le marquage propriétaire d'une création partagée y est déplacé (with_vault_owner, mod.rs 677 → 662 l.). Après : 12/12 (temp/r246_resume/retest_security/r32_trust_forgery.after.out, contrôle de squat compris) ; q06_trust_server 4/4, q06_script_trust 13/13 ; Q06 dans Chromium temp/r246_resume/retest_security/q06_scripts_chromium.probe.mjs 24/24 (temp/r246_resume/retest_security/q06_scripts_chromium.out, temp/r246_resume/retest_security/out/q06_report.json) : script non activé refusé, activé exécuté, portée sans API Web, temps (SCRIPT_TIMEOUT 3 s), mémoire, profondeur (SCRIPT_TOO_DEEP), import dynamique sans requête, eval sans évasion, écritures hors cellule d'entrée refusées ; source réécrite par Bob (champ trust: 'enabled' gardé) → untrusted et SCRIPT_NOT_ENABLED jusqu'à réactivation ; confiance forgée par Bob refusée atome_owner_only. À retester par un autre agent."
```

```yaml
id: BUG-0100
statut: FIXED_AWAITING_RETEST
priorite: CRITIQUE
categorie: VOIX
fonctions: [C0293]
scenarios: [Q03, Q04]
plateforme: "toutes (atome/src/squirrel/voice)"
canal: "voix réelle (orchestrateur vocal)"
donnees_test_synthetiques: "runtime et assistant enregistreurs, commande share.send"
gestes_reproduction: ["1. le pont d'exécution vocal est construit avant que handleAtomeMCPRequestAsync soit posé sur globalThis (ordre de démarrage)", "2. une commande outward dite à la voix (share.send)"]
attendu: "règle 22 : tenue, demandée à la personne ; jamais exécutée sans passer par l'entrée MCP unique"
observe: "resolveVoiceExecutionBridge rendait un pont de repli (createRuntimeBridge) qui appelait runtime.invokeById directement : la politique et la confirmation étaient sautées"
proprietaire_canonique: "atome/src/squirrel/voice/orchestrator_bridge.js"
origine_du_defaut_confirmee: "repli silencieux sur le runtime quand l'entrée MCP n'était pas encore chargée"
correctif: "createRuntimeBridge supprimé ; le pont vocal est toujours celui de l'entrée MCP, lue à chaque appel (mcpEntry) : absente, l'appel échoue (voice_mcp_entry_unavailable), chargée plus tard, elle est utilisée"
factorisation_simplification: "un seul pont au lieu de deux (repli retiré)"
tests_unitaires_integration_ui: "temp/r246_resume/retest_security/r29_outward_doors.probe.mjs (voice_bridge_without_entry_never_runs_outward, voice_bridge_entry_loaded_later_is_used_and_holds) ; tests/eve/assistant_voice_runtime.test.mjs 18/18"
regressions_cross_platform: "même code partout ; à vérifier par l'utilisateur : une commande vocale ordinaire au démarrage de l'app"
retour_ia_testeuse: "trouvé et réparé par le lot retest_security (25 nov. 2026) ; à retester par un autre agent"
```

```yaml
id: BUG-0060
statut: FIXED_AWAITING_RETEST
priorite: BASSE
categorie: VISUEL
scenarios: [S002]
plateforme: "toutes (ressource partagée atome/src/assets)"
canal: "MCP direct (youtube.play), puis l'affiche de l'objet vidéo"
donnees_test_synthetiques: "vidéo publique aqz-KE-bpKQ"
gestes_reproduction: ["1. dans un projet, youtube.play { video_id }", "2. regarder le logo YouTube de l'objet (affiche du fournisseur)"]
attendu: "le logo complet « YouTube »"
observe: "« YouTbe » : le second « u » manquait. `<use xlink:href=\"#A\" x=\"78.9\"/>` visait un id absent, le tracé du premier « u » n'avait pas `id=\"A\"`"
proprietaire_canonique: "atome/src/assets/images/logos/YouTube.svg (eVe/domains/media/online_video_providers.js)"
origine_du_defaut_confirmee: "référence <use> sans cible dans le SVG"
correctif: "id=\"A\" posé sur le tracé du premier « u » ; le <use> le duplique 78,9 unités plus loin"
tests_unitaires_integration_ui: "rendu du SVG : temp/r246_resume/media_end/out/svg/youtube_fixed.png (logo complet) ; capture temp/r246_resume/media_end/out/edit/s002_youtube.png"
retour_ia_testeuse: ""
```

```yaml
id: BUG-0061
statut: FIXED_AWAITING_RETEST
priorite: CRITIQUE
categorie: DONNEES
scenarios: [X01, S002]
plateforme: "toutes (Web vérifié)"
canal: "souris-clavier, tactile, voix, MCP (ui.undo.action, ui.redo, le rail)"
donnees_test_synthetiques: "projets R246 Reportage références (S002) puis R246 X01"
gestes_reproduction: ["1. dans le projet A, sélectionner un objet (ici l'objet YouTube)", "2. ouvrir le projet B, y créer un texte", "3. Annuler (ui.undo.action), puis Rétablir"]
attendu: "Annuler défait la dernière édition du projet B ; rien du projet A ne change"
observe: "l'annulation a défait une édition de l'objet du projet A (media_url, youtube_video_id retirés, événement history.undo sur l'atome du projet A), Rétablir l'a réappliquée : la sélection du projet quitté survivait à l'ouverture du projet B et resolveSelectionScope (eVe/core/atome_timeline_dom.js) bornait l'historique à ces identifiants"
impact_fonctionnel_et_visuel: "modification invisible d'un autre projet (perte de données possible) ; l'édition voulue n'est pas annulée"
proprietaire_canonique: "eVe/intuition/matrix/core/project_workspace_activation_runtime.js#runProjectActivation (ouverture d'un projet) ; la sélection : eVe/intuition/runtime/selection.js"
origine_du_defaut_confirmee: "aucune étape de l'ouverture d'un projet ne terminait la sélection ; seule la déconnexion la vidait"
correctif: "entrer dans un autre projet termine la sélection (clearAllSelectionLocal, exporté par selection.js) avant toute autre étape, donc Annuler/Rétablir, le rail et Supprimer ne visent plus les atomes du projet quitté ; rouvrir le même projet la garde"
tests_unitaires_integration_ui: "temp/r246_resume/media_end/edit.probe.mjs : X01.BUG-0061.selection_ends_with_project, X01.BUG-0061.undo_stays_in_project, X01.caption_undo_redo"
regressions_cross_platform: "même code sur Tauri et iOS (pas de chemin propre à la plateforme)"
retour_ia_testeuse: ""
```

```yaml
id: BUG-0062
statut: FIXED_AWAITING_RETEST
priorite: HAUTE
categorie: FONCTIONNEL
scenarios: [S002, X01]
plateforme: "Web (serveur atome-server) ; tout hôte dont getStateCurrent renvoie la ligne du coffre"
canal: "voix / MCP (projects.media controls), toucher d'un média hors Édition"
donnees_test_synthetiques: "temp/r246_resume/media_end/fixtures/clip1080.mp4 et clip360.mp4, déposés sur le canevas"
gestes_reproduction: ["1. déposer une vidéo sur le canevas d'un projet", "2. Consultation (ou Édition), projects.media { action: 'controls', atome_id }, en place ou en plein écran"]
attendu: "les commandes de la vidéo (−10 s, Lecture/Pause, +10 s, ligne de temps) apparaissent"
observe: "MEDIA_FAILED (project_media_controls_no_media) : getStateCurrent renvoie la ligne d'état (atome_type: 'video', sans clé type) et projectMediaKindOf ne lisait que type ou properties.type, donc aucun genre de média ; la position de l'image était pourtant connue"
proprietaire_canonique: "eVe/domains/media/project_media_cue.js#projectMediaKindOf, project_media_controls.js#kindOf"
origine_du_defaut_confirmee: "temp/r246_resume/media_end/mctl.probe.mjs : state = {atome_type:'video', properties.kind:'video'}, scène = {type:'video'}, emplacement trouvé, erreur no_media"
correctif: "projectMediaKindOf et kindOf lisent aussi atome_type (le nom du champ dans une lecture d'état, comme les autres lecteurs de eVe/core) ; même lecture dans network_screens.js ; media_handoff.js (même fonction) en profite"
tests_unitaires_integration_ui: "temp/r246_resume/media_end/mctl.probe.mjs (Édition et Consultation, en place et plein écran) ; edit.probe.mjs S002.C0541.media_controls"
retour_ia_testeuse: ""
```

```yaml
id: BUG-0063
statut: FIXED_AWAITING_RETEST
priorite: MOYENNE
categorie: FONCTIONNEL
scenarios: [S001, S002]
plateforme: "toutes (eVe)"
canal: "voix / MCP (tv.set_fullscreen, tv.close, tv.get_state, youtube.set_fullscreen, youtube.search…)"
gestes_reproduction: ["1. dans un projet, tv.open_channel France 24", "2. passer le projet en Consultation", "3. « mets la télé en plein écran » : tv.set_fullscreen { enabled: true }"]
attendu: "le plein écran, comme le double toucher le donne en Consultation (règle 20) : regarder n'est pas éditer"
observe: "project_work_mode_editing_blocked : la porte des modes de travail (authorizeProjectTool) traitait toute commande tv.* et youtube.*/peertube.* comme une édition du projet ; le toucher passait, la voix non"
proprietaire_canonique: "eVe/domains/rendering/project_work_mode_state.js#authorizeProjectTool"
origine_du_defaut_confirmee: "temp/r246_resume/media_end/edit.log (run 13:45) : S001.C0005.fullscreen en Consultation refusé"
correctif: "les commandes TV, YouTube et PeerTube passent dans tous les modes sauf celles qui posent un objet dans la scène (open_channel, play), lues sur leurs contrats (TV_COMMANDS, YOUTUBE_COMMANDS, PEERTUBE_COMMANDS)"
tests_unitaires_integration_ui: "temp/r246_resume/media_end/edit.probe.mjs 46/46 : plein écran en Consultation, média seul (rangée de la bande noire), puis un toucher montre Pause et le ✕ (out/edit/s001_tv_fullscreen_touched.png)"
retour_ia_testeuse: ""
```

```yaml
id: BUG-0064
statut: FIXED_AWAITING_RETEST
priorite: BASSE
categorie: FIABILITE
scenarios: [X02]
plateforme: "Web (WASM) ; Tauri avant audio_init"
canal: "toutes (horloge des vumètres)"
gestes_reproduction: ["1. projet musique, Vue › Mixage (ou une piste choisie : Niveau)", "2. avant la première lecture"]
attendu: "les vumètres lisent un niveau nul tant qu'aucun mix ne tourne"
observe: "pageerror non attrapée « [backend.kira] No audio backend available » : mix_levels (et mix_readings) appelaient invoke() quand le moteur n'était pas encore démarré (mode null), ce qui rejette"
proprietaire_canonique: "atome/src/application/audio_runtime/backend.kira.js#mix_levels, #mix_readings"
origine_du_defaut_confirmee: "pile : backend.kira.js invoke ← mix_levels ← audio.facade ← molecule/runtime.js#readGroupTimelineMixLevels ← project_view_level_meters (temp/r246_resume/media_end/delivery.log)"
correctif: "Tauri démarré : invoke ; sinon le niveau du mix WASM s'il tourne, aucun niveau sinon (aucun mix ne tourne avant le démarrage du moteur) ; même règle pour mix_readings (fichier réduit d'une ligne)"
tests_unitaires_integration_ui: "temp/r246_resume/media_end/delivery.probe.mjs : Z.no_page_error"
retour_ia_testeuse: ""
```

```yaml
id: BUG-0065
statut: FIXED_AWAITING_RETEST
priorite: HAUTE
categorie: VOIX
fonctions: [F143, F146]
scenarios: [X01, X02, X24]
plateforme: "Web (WASM)"
canal: "voix / MCP (captures.start, captures.state, captures.stop)"
gestes_reproduction: ["1. projet, Vue › Timeline (ou Mixage), lecture à l'arrêt", "2. « enregistre 3 secondes » (captures.start {kind:audio, duration_seconds:3})", "3. lire captures.state, attendre 6 s"]
attendu: "la voix dit la vérité sur la prise : armée tant que Lecture ne tourne pas, ses 3 s comptées depuis son vrai départ, puis finie ; captures.stop la désarme ; Enr. revient au repos"
observe: "réponse « recording:true, take:0 » alors que la prise n'était qu'armée (Enr. arme depuis le 25 nov. jusqu'à Lecture) ; captures.state « recording:false » ; l'arrêt minuté captures.stop {take:0} ne trouvait rien (NOTHING_RECORDING) et Enr. restait sur « Stop », armé pour toujours"
proprietaire_canonique: "eVe/domains/capture/capture_runtime.js#timelineTake, #startInProject ; eVe/domains/rendering/project_view_timeline_recording.js#launch"
origine_du_defaut_confirmee: "timelineTake ne lisait que recorder.live() (prises lancées) : une prise armée n'existait pas pour la voix ; la vue Mixage n'était pas lue du tout ; la durée était programmée au départ de la commande, pas au départ réel (temp/r246_resume/media_end/out/cap/report.json, view_timeline_after.png)"
correctif: "le recorder expose ses prises armées (armedTakes) et une attente de départ (whenRecordLaunched : appelée une fois au lancement par Lecture, oubliée au désarmement) dans la Timeline et le Mixage ; timelineTake voit la prise armée (armed:true, même numéro de prise quand elle démarre) ; captures.start renvoie armed:true/recording:false et programme l'arrêt minuté au vrai départ ; captures.state donne armed ; contrat captures (armed, description de start) mis à jour"
tests_unitaires_integration_ui: "temp/r246_resume/media_end/cap.probe.mjs : timeline.start_armed, state_armed, armed_waits_for_lecture, recording_after_lecture, timed_stop_from_real_start, band_back_to_enr, voice_disarm ; endurance.probe.mjs : X24.take_ended"
retour_ia_testeuse: ""
```

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
