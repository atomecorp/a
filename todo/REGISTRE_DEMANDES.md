# Registre des demandes en cours

Registre unique de ce que tu as demandé et qui n'est pas terminé (règle « Registre des demandes » d'`AGENTS.md`,
créée le 2026-10-30 après l'enquête sur les demandes zappées). Toute session qui s'arrête en laissant une partie
d'une demande non faite l'écrit ici ; toute session qui démarre une tâche lit d'abord les entrées de son domaine.

## Statuts

- `OUVERT` : à faire ; rien ne l'empêche.
- `À RAPPROCHER` : un reste noté par une session passée ; l'état actuel du code n'est pas vérifié. Vérifier
  d'abord, puis passer en `FAIT` (avec la preuve) ou en `OUVERT` (avec ce qui manque vraiment).
- `EN COURS` : un agent ou une sonde lancé par une session y travaille en ce moment ; sa fin réveille la session, qui passe alors l'entrée en `FAIT` ou en `OUVERT`.
- `ATTENTE UTILISATEUR` : seulement quand la question (ou la maquette) t'a réellement été posée ; écrire laquelle
  et quand.
- `FAIT` : livré et vérifié ; la preuve (sonde, fichier) est écrite dans l'entrée.

Format d'une entrée : un titre `### R-NNN — …`, puis une ligne `- Statut : …` (lue par le garde-fou de la session
d'exécution, `.claude/hooks/registre_stop_guard.mjs`), puis la source, ce qui est validé, ce qui reste.

## Entrées à exécuter

### R-106 — Complete atome/eVe optimization campaign
- Statut : EN COURS (2026-10-31) — current chat, campaign `temp/optimisation_2026-10-30T12-40-47-959Z/`.
- User request and approval: optimize performance, memory retention and package size across Web, Tauri and iOS without losing functionality; continue automatically. Latest device instruction: « fais tout ce que tu peux faire sans l'ipad et des mo,n retour je le reconnecte ».
- Validated complete lots: preservation, physical-device control and reference installation (3/8; 37% complete, 63% remaining). Implementation and partial tests do not count as accepted whole lots.
- Verified evidence and source ownership: campaign `WORK_LOG.md`, `campaign.json`, persistent lifecycle/virtualization/package/native tests, and runtime campaign entry in `eVe/documentations/FRAMEWORK_STATE.md`. No Git write or push is authorized by this task.
- Remaining: finish subsystem audit, optimized runtime/endurance and before/after acceptance on Web/Tauri, physical iPad acceptance after reconnect, final checks/cleanup and measured delivery report. Web endurance was interrupted after170 cycles/1,724,631ms, before final acceptance; a fresh full run is active. Latest Release Tauri builds at535.33MiB but its blank startup is under diagnosis; compilation is not acceptance.
- Device work is explicitly deferred by the user. Earlier questions asking for USB reconnect and permission to dismiss a real alarm are unanswered; no device action or indirect dismissal while deferred. Continue independent work.

### R-001 — Calendrier : refonte du panneau Rendez-vous
- Statut : FAIT (2026-10-30, soir) — Q2 codée (Perso, Pro, Sport au départ, `temp/reco_small/r001_default_calendars.probe.mjs` 8/8 relancée par le registre) ; Q1 et Q60 : état actuel gardé (ta réponse « reco partout »). Restent non vérifiés : AlarmKit sur appareil, visio à l'heure, Tauri, iOS.
- Source : ta demande du 2026-10-27, 12 h 15 (session `77572327`, « Alors, je suis allé dans rendez-vous… »).
  La session s'est arrêtée à 14 h 05 sur la question 2 sur 3, sans réponse ; rien n'a été codé.
- Validé par toi : maquettes `temp/calendar_event_redesign/mockups/` (rouleaux sans − / +, les voisins servent
  de − et +) ; carte Fin = rouleaux de l'heure de fin liés à la durée dans les deux sens, sans bascule Durée / Date ;
  plusieurs calendriers (carte repliable, au plus 4 lignes puis défilement) ; dépliages vers le haut ; sélection à
  gauche ; visio : invitations à l'enregistrement, et à l'heure de l'alarme eVe ouvre la salle pour toi et envoie
  aux invités une notification « Rejoindre ».
- Questions restées sans réponse : le pas du rouleau des minutes (5 en 5, réglage actuel, ou 1 en 1) ; les
  calendriers créés au départ.
- Manque dans le code (vérifié le 2026-10-30) : « Répéter » n'a que 4 choix fixes
  (`bevy_panel_calendar_editor_model.js` `CALENDAR_REPEAT_CHOICES`), pas de mode avancé (« un jour sur deux »,
  propositions standard comme chez Apple) ; les alarmes ne sont que des pastilles « avant » / « à l'heure », sans
  « pendant » ni « après », et seule celle « à l'heure » porte une action ; la carte s'appelle encore
  « Me prévenir » au lieu de « Alarme » ; le titre doit rester fixe quand le reste du panneau défile (à vérifier).
- Déjà fait par d'autres sessions (à confirmer, pas à refaire) : rouleaux de début, de date et de durée
  (2026-10-28, `bevy_panel_calendar_rollers.js`) ; « Calendriers » de l'Agenda (2026-10-29, FRAMEWORK_STATE).

- Questions posées le 2026-10-30 : n° 1 (pas des minutes) et 2 (calendriers de départ) de `todo/questions_registre_2026-10-30.md` ; le reste de l'entrée se code sans attendre.
- FAIT le 2026-10-30 : refonte « Rendez-vous » (carte titre fixe, rouleaux Début / Fin liés, « Répéter » propositions
  + Personnalisé RFC 5545, « Alarmes » plusieurs, Quand avant/après le début/la fin, Quoi Notification à Projet,
  visio) ; un seul propriétaire de l'instant d'alarme (`calendar_alarm_instant.js`) ; MCP `calendar.repeat.set`,
  `calendar.alarm.set` relatif. Preuves : `temp/r001/recurrence_alarms.probe.mjs` 37/37,
  `temp/r001/panel_controls.probe.mjs` 28/28, Playwright `temp/r001/panel_ui.probe.mjs` 26/27 (seul échec : l'étape
  « grille posee » du harnais), captures `temp/r001/shots/`. Non vérifié : AlarmKit sur appareil, visio à l'heure,
  listes Musique / Média / Projet à l'écran, Tauri, iOS.
- FAIT le 2026-10-30 (reco partout) : Q2, au premier affichage de l'Agenda d'un compte, « Calendriers » montre Perso,
  Pro, Sport ; Pro et Sport sont faits une fois par compte par `createCalendar` (pipeline canonique,
  `eVe/intuition/tools/calendar_default_calendars.js`, ids `calendar_pro_<compte>` / `calendar_sport_<compte>`), jamais
  refaits s'ils sont supprimés. Preuves : `temp/reco_small/r001_default_calendars.probe.mjs` 10/10 (compte neuf isolé,
  rechargement après suppression de Sport), capture `temp/reco_small/r001/3_calendriers_depart.png`. Non vérifié : Tauri, iOS.

### R-002 — Sampler : écran complet de l'éditeur de sample
- Statut : FAIT (2026-10-30, soir) — éditeur de sample plein écran (Q3, maquettes E1–E4) : `temp/reco_sampler/edit_kernel.probe.mjs` 11/11, Playwright `sample_editor_ui.probe.mjs` 42/42 (`temp/reco_sampler/ui_attempt_1.log`), captures `temp/reco_sampler/shots/`. Non vérifié : Tauri, iOS, vrai pincement WebKit, son audible.
- Source : cahier `todo/sampler_cahier_des_charges_2026-10-29.md` §8 ; mémoire du 2026-10-29 « Bloqué : pas de
  maquette validée (règle 16) ; voix et MCP seulement ».
- Reste : maquette aux vrais jetons, ta validation, puis le code et la sonde.
- Question posée : questions posées le 2026-10-30 (session d'exécution du registre), texte complet dans `todo/questions_registre_2026-10-30.md`, n° 3 : « Valides-tu l'éditeur de sample plein écran (maquettes `temp/synth/mockups/e1_editeur_repos.png` à `e4_editeur_repere.png`, outils en 4 familles Écoute, Éditer, Forme, Repère) ? »
- FAIT le 2026-10-30 (reco partout) : éditeur de sample plein écran codé selon E1–E4 (`eVe/domains/dashboard/dashboard_sample_editor.js` + `_view.js`, ouvert par l'outil « Éditer » au pied d'une zone) : vue d'ensemble, vue de travail (deux canaux, zoom, défilement, bulles), familles Écoute / Éditer (Couper, Copier, Coller, Muet, Rogner, Figer) / Forme (Entrée, Sortie, Envers, Gain, Norme, Centre, Étirer, Ton) / Repère (Slice, Boucle, Marque, Aimant), chaque outil par la commande canonique (`audio_fx.edit_apply`, nouvelle op `pitch`). Écart accepté : retour par le Retour `fold` du pied (règle 13) au lieu du ✕. Preuves : `temp/reco_sampler/edit_kernel.probe.mjs` 11/11 sur PCM réel, `temp/reco_sampler/view_build.probe.mjs` PASS, Playwright `temp/reco_sampler/sample_editor_ui.probe.mjs` ALL PASS (rapport `temp/probe_reports/dashboard_enhancement/reco_sampler_editor/`, captures `temp/reco_sampler/shots/`). Non vérifié : Tauri, iOS, pincement réel à deux doigts, écoute audible ; le moteur lit encore la source, pas le rendu en cache (cahier §8.4).

### R-003 — Sampler : correspondances SFZ manquantes
- Statut : FAIT (2026-10-30)
- Source : mémoire Sampler du 2026-10-29 (« Jamais fait »).
- Fait : `one_shot` (la zone joue jusqu'au bout du sample), keyswitches (`sw_lokey/sw_hikey/sw_last/sw_default`) et filtres de zone (`fil_type`, `cutoff`, `resonance`, `fil_keytrack`, `fil_keycenter`, `fil_veltrack`) dans le moteur (`atome-instrument`), la spec `mix-graph`, le schéma JS, l'import et l'export SFZ ; WASM Web reconstruit.
- Preuve : `cargo test` (`atome-instrument/tests/bank_opcodes.rs` 5/5, `mix-graph/src/instrument_bank_tests.rs` 2/2, journal `temp/r003/cargo_tests.log`) ; `node temp/r003/sfz_opcodes.probe.mjs` 13/13.

### R-004 — Sampler : auto-sampling de la sortie d'eVe
- Statut : FAIT (2026-10-30)
- Source : mémoire Sampler du 2026-10-29 (« attend un enregistreur de sortie »).
- Fait : le worklet du chemin direct (où jouent les instruments d'eVe sur le Web) garde une prise de sa propre sortie (`direct_path_worklet.js` `take_start` / `take_stop`) ; `audio_fx.auto_sample { instrument_id }` joue les notes du plan sur la chaîne de l'instrument, découpe la prise stéréo sans latence et crée le nouvel instrument. Natif (Tauri, iOS) : refusé clairement (CAPTURE_UNAVAILABLE), comme l'auto-sampling MIDI natif.
- Preuve : `COMM_SERVER_ROOT=temp/r004/tree node temp/r004/auto_sample_instrument.probe.mjs` → 10/10 sur la vraie page (rapport `temp/probe_reports/dashboard_enhancement/r004_auto_sample_instrument/report.json`).

### R-005 — Activités : cahier des charges jamais coché
- Statut : FAIT (2026-10-31) — Q33, Q38 et Q65 (message discret dans la bande du bas : `temp/reco_activites/quiet_message.probe.mjs` 17/17, `loisirs_cut.probe.mjs` 9/9) ; Q32 laissée ouverte à ton nom (relecture par des spécialistes, hors code) ; Q39 pas maintenant ; Q64 pas de fil public, étude des faux comptes après le lancement des invitations.
- Source : `todo/cahier_des_charges_activites_atome_eVe.md`.
- Rapproché le 2026-10-30 (contrôle dans le code, script `temp/cahier_reconcile/apply.mjs`) : 96 cases cochées avec
  leur preuve, 40 partielles (« partiel : … ; manque : … »), 2 non commencées ; l'en-tête dit l'état réel.
- Reste codable sans maquette : messages de borne et de valeur ramenée (retour existant), source du calcul des
  calories dans la ligne « ≈ », source des mesures partagées, saut à l'ancre dans le lecteur, réponse à une réponse
  (données déjà là), synchro hors connexion et multi-appareil, tests de fuseau horaire.
- Demandent aussi une décision (vu le 2026-10-30) : lire le passage ancré d'une réponse VideoTrain (quel geste ?) et montrer une réponse à une réponse comme telle.
- Reste qui demande une maquette validée (règle 16) : résumé et réglages du défi de cadence ; durées
  d'échauffement / retour au calme et distance ou allure par phase ; affichage d'une perte GPS ou d'un pouls
  absent dehors ; trace après la séance ; pas de charge personnalisés ; télécharger, repartager, couper les commentaires d'un fil ; file
  de modération ; réponses imbriquées.
- Hors code (ta décision) : relecture par des coachs ou des spécialistes (FEAT-008, FEAT-009, FEAT-011) ; partage
  d'un média tiers non redistribuable (FEAT-004/006).

- Questions posées le 2026-10-30 : n° 32 et 33 ; les maquettes des éléments nouveaux suivent de `todo/questions_registre_2026-10-30.md` ; le reste de l'entrée se code sans attendre.
- FAIT le 2026-10-30 (codable sans maquette) : messages de borne (`training_form.js#trainingFormNotes`, éditeur
  « Forme », et `training.set_profile` → `form_notes` pour l'assistant) ; source du calcul des calories (« Énergie ·
  poids × durée ») ; source des mesures partagées (instrumented / typed / computed / declared, exigée par MCP) ;
  réservation coach hors connexion (`SOURCE_UNAVAILABLE`) et sur plusieurs appareils ; fuseaux. Preuves :
  `temp/r005/form_notes.probe.mjs` 6/6, `set_profile_notes.probe.mjs` 5/5, `sources.probe.mjs` 7/7,
  `offline_coaches.probe.mjs` 5/5, `multidevice.probe.mjs` 12/12, `tz.probe.mjs` 10/10. Cahier coché (98/138).
- Bloqué (question 37) : le message de borne ne s'affiche pas sur l'accueil (`teleport_feedback.js#showTeleportToast`
  peint dans la scène du projet ; sans projet, rien, et il répond `painted: true` ; Playwright
  `temp/r005/toast_home.probe.mjs`) ; touche aussi Coachs, Boutique, Émissions, Web, Vidéo.
- Questions 38 (énergie de l'appareil) et 39 (calories saisies). Non vérifié : Tauri, iOS.
- FAIT le 2026-10-30, Q48 et Q49 (maquettes r005_06, r005_07a, r005_07c validées) : Échéance (rouleau de dates,
  « Aucune ») et Défi (nombre 13 · 21 · 34… + jours / séances) dans la préparation d'un objectif, après « Heure de la
  séance » ; « Régler » dans la tenue de l'objectif la rouvre (MCP `dashboard.objective.prepare`) ; tuile « Coachs »
  dans Cardio / Musculation / Souplesse seulement quand l'annuaire a des coachs de la discipline, liste filtrée ;
  « Fuseau » sous Annulation dans Mon coaching › Séance (zone de l'appareil par défaut ; voix « mes horaires sont à
  l'heure de Londres » → `coaches.become { timezone }`). Preuves : `temp/r005_code_coach/q48.probe.mjs` 13/13,
  `q49.probe.mjs` 8/8, Playwright `ui.probe.mjs` 36/36 (captures `temp/r005_code_coach/shots/`). Cahier 100/138.
  Écarts de maquette assumés : le Défi a un premier cran « Aucun » (même motif que « Aucune ») ; les voisins de
  Paris sur le rouleau Fuseau sont Oslo / Podgorica (toutes les zones IANA triées par décalage), non Londres / Berlin.
  Non vérifié : Tauri, iOS.
- CORRIGÉ le 2026-10-30 : le panneau « Fil » de VideoTrain n'avait pas de ✕ à gauche de son pied (règle 13) et son
  nom n'y était pas centré (il passait toujours un Retour replié) ; preuve Playwright `temp/r005_code_thread/thread_ui.probe.mjs` 1b.
- FAIT le 2026-10-30, Q50 à Q52 (maquettes `temp/r005_mockups/out/r005_08`, `r005_09`, `r005_10b` validées, 52 B) :
  appui sur sa contribution → Import · Envoi · Avis (allumé = réponses ouvertes) · Retir. ; sur celle d'un autre →
  Import (si son auteur l'a permis à l'envoi) · Signal ; niveau « Signalés » du propriétaire du fil (nombre de
  signalements, drapeau, Garder · Retir.) ; « ↳ <nom> » sous la réponse à une réponse, placée sous sa réponse parente ;
  l'heure d'ancre touchée lit l'origine depuis cet instant, en tête ; chaque geste a sa commande MCP `video_train.*`.
  Preuves : `temp/r005_code_thread/thread_rights_ws.probe.mjs` 23/23, Playwright `thread_ui.probe.mjs` 33/33
  (captures `temp/r005_code_thread/shots/`), `reply_order.check.mjs` 3/3, `labels.check.mjs` 14/14. Cahier 109/138.
  Choix pris sans maquette (même motif, à revoir si tu veux) : l'outil d'entrée de « Signalés » s'appelle « Modér. »
  (« Signal. » était coupé : 7 signes) et n'apparaît que si des signalements attendent ; la case « Import permis »
  (décochée par défaut) dans la carte d'Envoi / de partage ; Garder laisse la contribution cachée pour qui l'a
  signalée ; un fil VideoTrain n'est jamais public, donc aucun fil public pour un moins de 15 ans sans code d'âge.
  Reste (ta décision) : fils publics et mineurs ; étude des faux comptes. Non vérifié : Tauri, iOS, Android.
- FAIT le 2026-10-30, Q43 à Q47 (maquettes validées) : défi de cadence (Record › Rythme, bilan tenu / pas tenu),
  programme cardio échauffement / calme / effort en mètres / allure, rangées GPS et Pouls absents dehors, trace après
  la séance (privée, décochée à l'envoi), pas de charge par exercice. Preuves : `temp/r005_code_sport/pure.probe.mjs`
  13/13, `ui_nodes.probe.mjs` 10/10, Playwright `ui.probe.mjs` 36/37 (seul échec : l'étape « grille posee » du
  harnais), captures `temp/r005_code_sport/shots/`. Même motif appliqué sans maquette : « Valeur » en tête de la
  colonne de Forme pour le gainage. Non vérifié : appareils.
- FAIT le 2026-10-30 (reco partout) : Q33 — une vidéo d'un tiers (YouTube, PeerTube : eVe n'en a que la référence) part en lien seul,
  jamais en fichier, décidé par le serveur (`server/news_broadcast.js#linkOnlyMember`, lit l'atome de l'auteur dans son coffre)
  pour VideoTrain (partage, réponse, Envoi), le fil eVe et les forums ; dans le texte pour les réseaux ; « Import » refusé
  `news_media_link_only` ; MCP `video_train.*` répond `link_only`. Q38 — l'énergie active mesurée par l'appareil sur la séance
  d'abord (« Énergie · montre ≈ 245 kcal », lue par le propriétaire santé comme le pouls, jamais pour l'assistant / MCP), le
  calcul poids × durée seulement sans appareil ; la feuille santé iOS de la séance demande aussi la lecture de l'énergie active.
  Preuves : `temp/reco_activites/link_only_ws.probe.mjs` 11/11, `link_only_client.probe.mjs` 9/9,
  `temp/r005_code_thread/thread_rights_ws.probe.mjs` 23/23, `temp/reco_activites/device_energy.probe.mjs` 9/9 (faux hôte natif).
  Non vérifié : iPhone / Apple Watch (délai de synchro de la montre), Android (permission calories actives non demandée à la séance,
  comme le pouls), Tauri. Cahier 110/138.
- ATTENTE UTILISATEUR (Q37, maquette seule, rien codé) : `temp/reco_activites/mockups/q37_message_dans_la_bande.png` (et à côté de
  l'annonce Loisirs réelle d'aujourd'hui : `q37_loisirs_et_message.png`). Question : « Sur la fiche Écarté › Forme (Perso, 8 séries,
  Pas +3 kg depuis 12 kg), eVe ramène les séries 4 à 8 à 18 kg. La maquette montre ce message dans le champ de la bande du bas, à
  la place de « Rechercher », sans loupe, comme l'annonce de Loisirs ; il s'efface au toucher. Je le code ainsi pour tous les
  messages discrets (Forme, Coachs, Boutique, Émissions, Web, Vidéo) ? Reco : oui. » Cause du silence : `teleport_feedback.js#paint`
  passe un projet vide à `updateProjectSceneRecords`, qui ne dessine rien et rend `Promise.resolve(null)` ; `paint` ne lit pas cette
  réponse et dit `true` (Playwright `temp/reco_activites/forme_capture.probe.mjs` : `painted: true, project: '', inScene: false`).
- FAIT le 2026-10-31 (reco partout, Q65 validée) : le message discret du Dashboard s'écrit dans le champ de la bande du bas à la
  place de son indication, sans loupe, sur le verre du champ comme l'annonce de Loisirs ; un toucher l'efface (le reste de ce
  toucher ne tape pas, n'ouvre pas Loisirs) et l'indication revient. Un seul propriétaire : `eVe/domains/dashboard/dashboard_quiet_message.js`
  (la ligne), posée par `dashboard_communication_input.js#noticeField` (la brique de l'annonce Loisirs, `onTouch`) ;
  `teleport_feedback.js#showTeleportToast` (async) l'y envoie quand le Dashboard est à l'écran, sinon dessine sur le projet
  ouvert et répond ce qui a été fait (`paint` n'écrit que sur le projet à l'écran, lit la réponse de la scène : plus de `true`
  sans dessin). Tous les appelants (Forme, Coachs, Boutique, Émissions, Web, Vidéo, Loisirs, effets) passent par là.
  L'annonce Loisirs coupée « Loisirs : les so… » l'est par la règle de la brique (`fitSingleLineText`, « … »), aucun outil
  ne la recouvre (Send est la partie du verre après le champ). Preuves : Playwright `temp/reco_activites/quiet_message.probe.mjs`
  17/17 (vraie écriture Forme → « Séries 4–8 ramenées à 18 kg » dans le champ, toucher, « Rechercher » + loupe revenus, sans
  caret ; `false` sans endroit où dessiner ; projet ouvert : dessiné dans sa scène puis retiré), `temp/reco_activites/loisirs_cut.probe.mjs`
  9/9 ; captures `temp/reco_activites/capture/quiet/`, `capture/loisirs_cut/`.

### R-006 — Tâche urgente du 22 oct. : designs et questions restés en attente
- Statut : EN COURS (2026-10-31) — réponse « Oui, reco partout » : Q66 à Q68 (Sport) et Q70 à Q73 (Santé) en codage.
- Source : `todo/urgent_task_suivi_2026-10-22.md` ; études `todo/etude_sante_plaisir_thalasso_2026-10-22.md` §7,
  `todo/etude_activites_sport_objectifs_2026-10-27.md`.
- Rapproché le 2026-10-30 :
  - Fait : Tempo et enchaînement (maquettes L9v2 / O5 validées le 28 oct. ; outil « Auto » de
    `dashboard_training_card.js`, rouleau « Rythme » de `dashboard_training_record.js`) ; Matrice de Scène (« Validé :
    proposition A », 23 oct., FRAMEWORK_STATE 2026-10-23 et 2026-10-29) ; Web V1 par-dessus Bevy (2026-10-28,
    `web_page_player.js`) ; L16 Social sportif (« C puis A », 28 oct., FRAMEWORK_STATE « Sport lot L11 ») ; L06
    variations par série (`training_form.js`) ; L08-L10 décisions 6 et 7 (sieste, méditation, respiration codées le
    28 oct.).
  - Caduc : « Prochain événement eVe Basic » (l'accueil Basic fixé le 26 oct. : contact, agenda, objectif ; la
    disposition A sert à l'accueil Pro).
  - Questions jamais tranchées : CAL-01 (déplacer les séances futures quand l'heure d'un objectif change) ; clore un
    objectif ; S-01 (repos fixe, visée Force, poly-articulaires d'abord) ; L06 séries d'échauffement et programmes
    tout faits ; Split View (SV-03) ; B-01 « Beauté » ou « Apparence » ; L08-L10 décisions 1-5 et 8-12 (Plaisir,
    « i » des outils santé, bilan unique, profil santé, Thalasso, découverte locale, assistant et santé, stockage).
  - Vérifié le 2026-10-30 : Kapalabhati (`atome/src/shared/breath_pattern.js`, validé le 28 oct.) est une
    hyperventilation cyclique courte, sans apnée ; l'étude (§ Sécurité respiratoire) l'exclut, surtout près de l'eau.
    Question n° 34 ajoutée.

- Questions posées le 2026-10-30 : n° 13 à 29 et 34 de `todo/questions_registre_2026-10-30.md`. Tout ce qui reste de l'entrée dépend de ces réponses.
- FAIT le 2026-10-30 (reco partout) : Q13 (une nouvelle heure d'objectif déplace les séances à venir, garde les séances vécues, faites aujourd'hui ou déplacées à la main ; CAL-01 aussi pour les actions de programme), Q14 (« Clore » au maintien à côté de « Fait », commande `dashboard.objective.close`, programme en pause, historique gardé), Q15 (repos fixe 90 s / 120 s), Q16 (visée Force : 3 à 5 rép., charge plus lourde), Q17 (poly-articulaires d'abord) codés. Preuves : `temp/reco_sport/sport_reco.probe.mjs` 31/31, `temp/reco_sport/cal_close.probe.mjs` 17/17 (TZ=Europe/Paris), `until_expand.probe.mjs` PASS, `temp/cal_02/routine_pause.probe.mjs` 4/4, app réelle `temp/reco_sport/capture.probe.mjs` (« repos 120 s », ordre de « Mon programme »). Non vu dans l'app réelle : la ligne « Clore » (la case Objectifs est invisible sur l'accueil Pro du téléphone ; `close_ui.probe.mjs` n'a pas pu ouvrir la rubrique). Pas de réouverture d'un objectif clos.
  - Posées puis validées le 2026-10-31 (« Oui, reco partout », questions n° 66 à 68) : Q18 échauffement (`q18a`-`q18d`) et programmes prêts (`q18e`, `q18f`) ; Q19 ligne « Duo » au maintien (« Côte à côte » dépasse les 6 lettres de la règle 11) et zones l'une sur l'autre (`q19a`-`q19c`) ; Q20 plaque, prise guidée et comparaison « Beauté » (`q20a`-`q20c`). Maquettes et questions : `temp/reco_sport/mockups/` et `temp/reco_sport/mockups/questions.md`.
  - FAIT le 2026-10-31 (Q66 = Q18) : échauffement par défaut sur les exercices chargés à la barre ou à la machine (8 × 50 % puis 5 × 75 % de la charge, 60 s de repos après chacune ; pas `warmup` de `program_session_contract.js`, jamais compté comme une série), « + 2 échauf. » sur la carte et durée qui le compte (5:21 → 8:00 au développé couché 40 kg), ligne « Échauffement » du Détail, « 1/2 » sur « échauf. » en orange pendant la séance, rouleau « Échauf. » de Perso (Aucune / 1 série / 2 séries ; `training.set_profile` `warmup_sets`). Programmes prêts : outil « Prêts » dans la bande de « Mon programme », panneau « Programmes prêts » (accordéons Débutant, Force, Haut / Bas à 5 séances, Remise en forme ; `atome/src/shared/training_ready_programs.js`), disque « Prendre ce programme » : il remplace « Mon programme » (la séance du jour, en alternance), ses jours vont à l'agenda en séries hebdomadaires, un programme pris avant quitte l'agenda à partir du jour même ; les séances faites restent au Suivi. Commandes `training.list_ready_programs`, `training.take_ready_program` (confirmée), `training.open_program` `panel: ready`. Preuves : `temp/reco_sport/warmup.probe.mjs` 18/18, `ready.probe.mjs` 21/21, `ready_runtime.probe.mjs` PASS, `q66_q68_ui.probe.mjs` (vraie page) 26/26, captures `temp/reco_sport/shots/q66*.png`.
  - FAIT le 2026-10-31 (Q68 = Q20) : module « Beauté » : plaque dans Activité › Bien-être à côté de Sieste ; prise guidée (caméra en haut, dernière photo de la même pose en transparence, rouleaux « Pose » et « Zone », disque orange « Prendre la photo », bande ✕ / Suivi / Rappel) ; la photo passe par le seul chemin de prise (`bevy_panel_media_capture.js`, médias de la personne) puis rejoint les photos Beauté ; « Suivi » montre deux dates de la même pose côte à côte, chacune sur son rouleau ; « Rappel » met ou retire un rappel hebdomadaire dans l'agenda. Famille MCP `beauty` : `open`, `list_photos`, `shoot` (confirmée), `add_photo`, `read_reminder`, `set_reminder`. Preuves : `temp/reco_sport/beauty.probe.mjs` 13/13, `q66_q68_ui.probe.mjs` (caméra factice de Chromium) 26/26, captures `temp/reco_sport/shots/q68*.png`. Q67 (« Duo », Q19) confiée à un autre agent, rien codé ici. Non vérifié : iOS, Tauri, vraie caméra.
- FAIT le 2026-10-30 (reco partout) : Q21 objectif « Plaisir » (OBJ-14, phrases vocales comprises), Q22 hors progression, Q23 suggestion du jour dans la bulle d'eVe Basic (une par jour, jamais sous un panneau de préparation, jamais la respiration en séjour Thalasso ; « ne me propose plus rien » à la voix, `brick_session.suggestions`), Q24 le Ressenti en fin de séance de brique (motif Sport M5b) et après un soin Thalasso fait, Q26 séjour Thalasso côté données et voix (`thalasso.*`), Q27 source de chaque entrée de Loisirs (la découverte locale existait), Q28 `health_profile.read` demande l'accord à chaque fois, Q34 « i » du Kapalabhati (eau, grossesse, épilepsie, cœur, panique) et jamais en contexte d'eau. Preuves : `node temp/reco_sante/pure.probe.mjs` 25/25 ; `PROBE_ISOLATED=1 node temp/reco_sante/ui.probe.mjs` 27/28 (seul échec : l'étape « grille posee » du harnais), rapport `temp/reco_sante/ui.probe.report.json`, captures `temp/reco_sante/shots/`.
  - BLOQUÉ Q29 : aucun stockage « appareil seulement » n'existe (Web → Fastify, Tauri → synchro Axum, iOS → synchro Swift) ; les allergies et intolérances d'aujourd'hui (`program_preference`, portée globale) sont synchronisées, contrairement à la décision. Il faut créer ce mécanisme (décision d'architecture) ; tant qu'il manque, les nouveaux sujets du profil (grossesse, cœur, articulations, respiration, peau, thyroïde/diabète, épilepsie, panique) ne sont pas enregistrés (Q25).
  - À valider par l'utilisateur (maquettes, écrans non codés) : Q25 lignes à case du profil santé (`temp/reco_sante/out/m1_profil_sante.png`), Q26 écran du séjour et ajout d'un soin (`m2_sejour_thalasso.png`, et où le ranger), Q23 geste « Ne plus proposer » au maintien sur la phrase (`m3_ne_plus_proposer.png`). Questions dans chaque PNG.
  - Non fait : la molette des souffles n'est pas filtrée par un contexte d'eau (la carte n'en a pas) ; eVe Pro n'a pas de bulle sur son accueil (pas de suggestion).
### R-007 — Finder du projet : maquette à six états jamais validée
- Statut : FAIT (2026-10-31) — Finder A–F (`temp/reco_finder/r007.probe.mjs` 46 OK, `r007_ef.probe.mjs` 30/30) et Q75 cœur blanc sans fond partout (Finder, Contacts : `heart_contacts.probe.mjs`). Seul échec : l'étape « grille posee » du harnais. Non vérifié : PeerTube, clavier iOS, cœur du Train vidéo.
- Source : session `e9cfee6f` du 2026-10-27, arrêtée sur « Valides-tu la maquette du Finder ? » (liste, Choix,
  Filtre, Lieux, TV, vidéos en ligne). Aucune réponse trouvée dans les transcripts (rapprochement du 2026-10-30).
- Maquettes : `temp/finder_charter/mockups/finder_charter.png` (états A–F) et `finder_today_project.png` (l'actuel).
- Rien du nouveau design n'est codé : `bevy_panel_finder_view.js` garde l'en-tête triable (`sortableHeaderNode`) et
  les pastilles de portée ; l'appui long renomme encore (`bevy_panel_finder_interactions.js`, `finder.row.rename`).
  « Outils du Finder dans Tous » (2026-10-29) n'a touché que le chargement (`loadScopeRecords` `withTools`).
- Reste : la validation de la maquette et de ses 3 sous-questions (garder Suppr. dans Choix ; le tri dans Filtre ;
  le champ de recherche dans la bande), puis coder A–F et les deux défauts vus en route (triangle orange de
  `bevy_panel_accordion.js`, écart de 4 px au lieu de 5 entre pastilles).
- Question posée : questions posées le 2026-10-30 (session d'exécution du registre), texte complet dans `todo/questions_registre_2026-10-30.md`, n° 4 à 7 : validation de la maquette A–F (remise aux règles du 30 oct. : rayons au dixième, plus de chevrons, 3 px entre lignes ; l'ancienne version est gardée dans `finder_charter_2026-10-27.html`), Suppr. dans Choix, tri dans Filtre, champ de recherche dans la bande.
- FAIT le 2026-10-30 (reco partout) : A–D codés selon la maquette (liste, Choix par appui long avec Tout / Suppr. demandé dans la bande / Import / Nom, Filtre avec tris Récents / A → Z / Type au pied et conditions, Lieux en lignes nom / adresse sous la carte) ; le champ dans la bande du panneau, Trouver allumé tant qu'il est ouvert ; en-tête triable, « n résultats », bouton Tags et triangle orange retirés ; 5 px entre pastilles ; chaque geste a son action MCP `ui.find.panel`. E (TV) et F (vidéos en ligne) vérifiés ensuite : bande ✕ + champ seuls, ni portées ni Filtre ; TV : logo, nom, catégorie · source, un cœur par chaîne, le champ filtre, un toucher joue la chaîne sur le projet et ferme le Finder, glyphe sur Pays / Favoris, glyphe vidéo pour une chaîne sans logo ; vidéos : l'image mène la ligne, titre, chaîne · durée (durée YouTube ajoutée côté serveur), la page suivante se lit seule près de la fin (elle ne se déclenchait jamais : corrigé), chaque vidéo une fois ; champ vide = l'historique, rien sans historique (texte « Saisir une recherche puis appuyer sur Entrée » retiré). Preuves : `PROBE_ISOLATED=1 node temp/reco_finder/r007.probe.mjs` → 46 OK, 1 FAIL (« grille posee », harnais) ; `PROBE_ISOLATED=1 node temp/reco_finder/r007_ef.probe.mjs` → ALL OK (30 ; catalogue TV, flux et recherche YouTube réels, 25 → 47 lignes, cœur contour au repos et plein pour un favori) ; captures `temp/probe_reports/dashboard_enhancement/reco_finder_r007/` (1_repos … 7_lieux) et `reco_finder_r007_ef/` (8_tv … 13_youtube_page_suivante). Cœur (question 75, réponse « Oui, reco partout » du 2026-10-31) : blanc et sans fond partout, contour au repos, plein pour un favori, cible de toucher gardée — fait à la brique `buildFavoriteHeartButtonNode` (Finder, contacts, Train vidéo). Preuves : `r007_ef.probe.mjs` → ALL OK (30) ; `temp/reco_finder/heart_contacts.probe.mjs` → le toucher sur le cœur nu bascule le favori, plein et blanc ensuite (seul échec : « grille posee », harnais) ; captures `reco_finder_r007_ef/8_tv.png`, `8b_tv_pays.png`, `reco_finder_heart_contacts/1_contacts_avant.png`, `2_contacts_apres.png`. Train vidéo non capturé (même brique). Non vérifiés : PeerTube (même chemin), logos refusés au Chromium sans tête (imgur 403), clavier iOS.

### R-008 — Action d'alarme : restes
- Statut : FAIT (2026-10-30)
- Source : mémoire « Action d'alarme » du 2026-10-25.
- Reste : lancer Apple Music / Spotify à une heure ; la grille Outil liste tout le ruban (~100 outils) au lieu des
  outils pertinents.
- Fait : la musique d'une alarme (Apple Music, Spotify) joue et s'arrête par la source unique de Musique (`placed_launch.js` → `music_source.js` `.play` / `.stop`) ; la grille « Outil » ne liste que les 10 outils déclarés `launch_at_time` (Audio, Vidéo, Écran, MIDI, IA, Lire, Arrêter, Télévision, Lire et Rec du prompteur).
- Preuve : `temp/r008/alarm_music_tools.probe.mjs` → 17/17 sur la vraie page (rapport et captures `temp/r008/report/`). Lecture Spotify réelle et iPhone : R-102.

### R-009 — Séquenceur : M7, Ouvrir / Lancer sur un événement du calendrier
- Statut : FAIT (2026-10-30)
- Source : `todo/timeline/sequenceur_vues_clips_2026-10-29.md` (« M7 : … (à faire) », même motif que M6, validé
  d'office).
- Rapproché le 2026-10-30 : M7 est codé (commit eVe bee6cc2a du 29 oct.) : rouleau « Mode » Lancer / Ouvrir dans le panneau de lancement du calendrier (`bevy_panel_calendar_launch.js`, `placed_launch.js` `PLACED_PROJECT_MODES`).
- Preuve : `PROBE_ISOLATED=1 COMM_SERVER_ROOT=temp/r004/tree node temp/sequencer_build/cal_mode.probe.mjs` (vraie page, compte neuf) : la ligne « Mode » montre Lancer / Ouvrir sur le rouleau canonique ; par défaut Lancer (`ui.timeline.transport.play`), un pas du rouleau → Ouvrir (rien n'est joué). Sortie gardée : `temp/sequencer_build/cal_mode_2026-10-30.log`.

### R-010 — Timeline et vidéo : restes ouverts
- Statut : FAIT (2026-10-31) — Q74 outil « Réalig » en Liste (`temp/reco_small/r010_realign.probe.mjs` 15/15, `r010_realign_run2.log`) ; Q8 et Q10 : état actuel gardé (ta réponse « reco partout »). Non vérifié : iOS, Tauri.
- Source : mémoire « Audio et Timeline » ; `todo/audio_to_finalize.md`.
- Fait : filtres de couleur de luminance du shader vidéo, corrigés le 2026-10-15
  (`atome/renderers/bevy-core/assets/shaders/video_external.wgsl#apply_color_filters` borne l'entrée à [0, 1] ;
  FRAMEWORK_STATE 2026-10-15 « Video colour filters clamped », sonde
  `temp/mixer/video_lane_pixels_real_app.probe.mjs` `FILTER_SWEEP=1`).
- Reste : trois décisions jamais tranchées (aucune réponse trouvée dans tes messages depuis le 7 oct.) : seuil de
  synchro image / son EBU R37 (le code resynchronise au-delà de 120 ms, mesuré +3 à 9 ms) ; bouton « Réaligner la
  timeline sur la Liste » (aujourd'hui la timeline est remplie une fois depuis la Liste, puis ne bouge plus) ; ordre
  des tranches du mixeur pour un gaucher (`molecule_mix_layout.js#layoutMixRow` garde l'ordre des pistes).

- Questions posées le 2026-10-30 : n° 8 (seuil de synchro), 9 (outil « Réalig. ») et 10 (ordre des tranches pour un gaucher) de `todo/questions_registre_2026-10-30.md`. Rien d'autre à coder dans cette entrée.
- Maquette du 2026-10-30 (reco partout, Q9) : `temp/reco_small/mockups/r010_maquette_realig.png` (zoom
  `r010_maquette_realig_zoom.png`, état actuel `r010_liste_actuelle.png`) : l'outil « Réalig » (glyphe d'alignement
  `para_left`) dans la bande du bas d'un projet en Liste, posé par le vrai ruban. Rien de codé. Question à poser :
  valides-tu cet outil, à cette place (premier outil de la bande, à gauche) et avec ce glyphe ? Q8 et Q10 : état actuel
  gardé, rien à coder.
- FAIT le 2026-10-31 (Q74 validée, « Oui, reco partout ») : « Réalig » codé. En Liste, premier outil de la bande, à
  gauche (`menu_work_context.js`, `main_menu_view_zoom_content.js`) ; un toucher remet la timeline dans l'ordre de la
  Liste en un seul lot annulable (`project_view_timeline_owner.js#realignProjectTimelineToList`) ; commande MCP
  `ui.timeline.realign`. Preuve : `temp/reco_small/r010_realign.probe.mjs` (A-B-C → C-A-B au toucher, une annulation
  rend A-B-C, MCP, état durable relu ; captures `temp/reco_small/r010/`). Non vérifié : iOS, Tauri.
### R-011 — TV et YouTube : restes ouverts
- Statut : FAIT (2026-10-30, soir) — coins de la découpe et Q11 (la ligne de la Liste joue dans sa vignette, `temp/reco_small/r011_list_row_window.probe.mjs` 11/11). Non vérifié : vraie iframe YouTube, flux TV réel, iOS, Tauri.
- Source : mémoire « TV, YouTube, fenêtres média ».
- Fait : la « page hôte du lecteur » est codée et en ligne depuis le 2026-10-07 (`atome/src/eve_youtube_player.html`,
  `eVe/intuition/tools/youtube_player_host.js` ; FRAMEWORK_STATE 2026-10-07 ; https://atome.one/eve_youtube_player.html
  répond). Son essai sur l'iPhone et sur Tauri est reporté dans R-102.
- Manque :
  - coins arrondis de la découpe : `media_window.wgsl#fragment` rend tout le quad transparent sans forme arrondie ;
    passer taille et rayon (ou le masque `shape_sdf`) au pipeline `media_window.rs` et écarter l'extérieur ;
  - mode liste (ta demande du 6 oct., session `3e1e2de6` : « On va faire de même en mode liste ») : une ligne de la
    Liste qui montre une vidéo TV / YouTube reçoit sa découpe et le lecteur se place sous l'aperçu de la ligne.

- Questions posées le 2026-10-30 : n° 11 de `todo/questions_registre_2026-10-30.md` ; le reste de l'entrée se code sans attendre.
- FAIT le 2026-10-30 : coins arrondis de la découpe (masque de forme de l'atome dans `media_window.rs` /
  `media_window.wgsl`, effacement destination-out, suit taille, rayon, variante et masque). Preuves : `cargo test --lib
  media_window` 6/6, sonde pixels `temp/r011/rounded_media_window.probe.mjs` 10/10 sur le wasm livré `cb26d7cb7ccc980b`
  (sur le wasm de HEAD, les deux contrôles de coins échouent), captures `temp/r011/shipped_wasm_home/`. Non vérifié :
  iOS et Tauri, iframe YouTube réelle, canevas d'un projet (l'ouverture d'un projet en sonde échoue aussi sur HEAD).
- Vu, hors de cette entrée : une vidéo qui joue (`video_external`) ignore son propre `corner_radius` côté Rust.
- FAIT le 2026-10-30 (reco partout) : Q11, mode liste. Une ligne de la Liste dont la TV / la vidéo en ligne joue sur
  place devient une seule image sur tout son bloc de film, sa découpe (`media_window_of`,
  `bevy_panel_record_timeline_preview.js#filmFrames`), et le lecteur se pose dessous
  (`project_scene_query_runtime.js#readProjectSceneMediaWindowStandIn`, `inplace_media_overlay.js`) ; aucune autre
  copie n'est découpée (`render_atom.js`) ; au repos le film est inchangé. Preuves :
  `temp/reco_small/r011_list_row_window.probe.mjs` 11/11 contrôles propres (l'étape « grille posee » du harnais échoue
  parfois), captures `temp/reco_small/r011/2_liste_lecture.png`, `3_liste_apres.png`, `4_naturel_lecture.png` ; tests
  `tests/eve/youtube_player_lifecycle`, `peertube_player`, `tv_inplace_player` passent (le dernier échoue 1 fois sur 6
  au premier lancement à froid). Non vérifié : vraie iframe YouTube / vrai flux TV, iOS, Tauri ; les commandes
  posées sur le média (`project_media_controls.js`) lisent encore la place de l'Atome, pas celle de la ligne.

### R-012 — Musique en cours : recherche de position Spotify
- Statut : FAIT (2026-10-30)
- Source : mémoire « Musique en cours » du 2026-10-23 (« Spotify seek not implemented »).
- Fait : commande `music.seek` (contrat `atome/src/squirrel/music/contracts.js`), `controlSpotify` envoie `PUT /me/player/seek?position_ms=…&device_id=…` puis relit la position (`server/music/spotify_operations.js`, `music_operations.js`) ; la source Musique (`eVe/domains/music/music_source.js`) peut chercher sur Spotify (`canSeek`), Deezer reste catalogue seul.
- Preuve : `node temp/r012/spotify_seek.probe.mjs` → 10/10 (vrai contrat, vraie opération serveur, vraie source ; seule l’API HTTP de Spotify est simulée). Essai sur un vrai compte Premium : R-102.

### R-013 — Moteur vocal : restes ouverts
- Statut : ATTENTE UTILISATEUR (2026-10-30, soir) — Q12 et Q61 FAITES (ci-dessous) ; reste tes 10 « répète » sur l'iPad
  « Jeezs's Tab » avec le mode d'essai (étapes ci-dessous, envoyées le 2026-10-30), puis leur rejeu au banc.
- Source : mémoire « Refonte du moteur vocal » du 2026-10-23 ; `todo/refonte_assistant_vocal.md` §17, §18.7.
- Rapprochement du 2026-10-30 : rien n'a bougé depuis le 2026-10-23 (FRAMEWORK_STATE, 2026-10-23, liste encore les
  trois défauts).
- Reste codable ici : « répète » faible en son réel (0/3 iPad, 1/2 Mac, parfait en numérique) : ajouter les variantes
  entendues à la grammaire Vosk et les mesurer au corpus (intention dans `eVe/domains/user/first_launch_guide.js`).
- Reste sur ton appareil (reporté dans R-102) : démarrage sourd (1 fois sur 8, cause inconnue ; piège
  `trap_voice.js` et `temp/voice_bench/ipad_deaf_hunt.sh` prêts), mode avion sur l'iPad.
- Question jamais posée (§8) : la dictée libre garde-t-elle la reconnaissance du système ou passe-t-elle par
  l'assistant connecté ? (`dashboard_capture_session.js` `purpose: 'dictation'`).

- Questions posées le 2026-10-30 : n° 12 de `todo/questions_registre_2026-10-30.md` ; le reste de l'entrée se code sans attendre.
- Fait le 2026-10-30 : variantes entendues mesurées (banc moteur réel `temp/r013/bench.mjs`, 36 prises réelles au
  Mac + corpus du lot 0) : aucun gain, deux fausses « répète » sous la télé ; grammaire inchangée. Les échecs au son
  réel du Mac sont des tours `too_long` (bruit de la pièce), un seul « hors grammaire » sur 36.
- Reste (après Q61) : enregistrer sur l'iPad le PCM poussé au moteur pour ≥ 10 « répète » dits par une personne,
  le rejouer au banc ; démarrage sourd et mode avion (R-102).
- FAIT le 2026-10-30 (reco partout) : Q12 — la dictée libre passe par la transcription de l'assistant connecté quand il
  peut servir la personne (compte authentifié accepté par le fournisseur, `provider_broker.js#providerPrincipalReady`, et
  appareil en ligne, `checkConnection('fastify')`), par la reconnaissance du système sinon (hors ligne, ou invité en ligne) ; une seule décision par dictée
  (`atome/src/squirrel/voice/service_stt_runtime.js#routeOf`, `service_assistant_stt.js`), erreur explicite sans relais ;
  la capture du Dashboard n'écrit rien et signale l'erreur si la dictée échoue. Aucun des deux plugins ne devient mort
  (hors ligne, tours de l'assistant, permission micro d'Android) : rien retiré. Q61 — mode d'essai du moteur codé
  (`atome/engines/voice-turns` `Take`, `session::read(record)`, WASM `setRecording`/`takeRecording`, commande de
  développeur `window.eveVoiceTestTakes`, `eVe/voice/conversation/conversation_test_takes.js`), banc `temp/r013/bench.mjs`
  set `device`, pilote iPad `temp/reco_voice/ipad_takes.mjs`. Preuves : `temp/reco_voice/dictation_route.probe.mjs` 11/11 (dont l'invité en ligne → système)
  (fournisseur simulé sur le socket : la qualité réelle de la transcription n'est pas vérifiée),
  `temp/reco_voice/takes_web.probe.mjs` 7/7 (3 tours Web rejoués au banc natif, même résultat 3/3). Le WASM audio de
  `atome/src/wasm` n'est pas reconstruit (travail non construit d'une autre session dans audio-wasm) : sur le Web le mode
  d'essai répond `conversation.setRecording is not a function` jusqu'à la prochaine construction ; l'iPad l'a à sa
  prochaine construction Xcode.
- Reste (tes prises, sur l'iPad « Jeezs's Tab », USB) : 1) construire et installer l'app depuis Xcode (elle embarque le
  moteur modifié) ; 2) réinstaller à neuf pour retomber sur le premier lancement guidé (ou rester sur un écran guidé) ;
  3) au Mac : `xcrun devicectl device process launch --device 00008142-001C21C62147801C --terminate-existing one.atome.app
  -- -AtomeWebInspector`, puis `node temp/reco_voice/ipad_takes.mjs on` ; 4) sur un écran du guide, dire 10 fois
  « répète » à ta distance habituelle, en attendant chaque fois qu'eVe ait fini de parler ; 5) `node
  temp/reco_voice/ipad_takes.mjs status` (10 prises ou plus), `node temp/reco_voice/ipad_takes.mjs pull`, puis
  `node temp/reco_voice/ipad_takes.mjs off` ; ne pas relancer l'app avant le `pull` (prises en mémoire seulement).
  Ensuite (moi) : `DEVICE_DIR=temp/r013/device node temp/r013/bench.mjs ipad device`, écoute des prises.
- Défaut hors lot vu le 2026-10-30 : l'objectif « pleasure » (`DASHBOARD_OBJECTIVES`) n'a pas de phrases vocales
  (`eve.first_launch.intent.goal.pleasure` absent de `eVe/i18n/languages_first_launch_voice.js`) : l'écran Objectifs du
  guide n'a aucune phrase pour lui (et `temp/r013/phrases.mjs` échoue sur `goals`).

### R-014 — Publication programmée : contacts par profil (Q7)
- Statut : FAIT (2026-10-30, soir) — Q35 : appui long sur la tuile d'un réseau dans Publier → « Profils » (`temp/reco_small/r014_network_hold.probe.mjs` 13/13).
- Source : mémoire « Publication programmée » du 2026-10-28.
- Réponse trouvée : « A » le 2026-10-28 à 17 h 48 (session `6e947365`) : dans Publier, les destinataires suivent le
  profil actif ; le Répertoire reste non filtré.
- Fait : contacts filtrés dans Publier (`eVe/domains/publish/publish_people.js`, `getLifeProfileRuntime().visible`),
  `contact_model.js` garde `profiles`, ligne « Profils » du maintien (eVe fd2e7981, FRAMEWORK_STATE 2026-10-28).
- FAIT le 2026-10-30 : forums et réseaux de Publier filtrés par le profil actif (`publish_people.js#underActiveLifeProfile`,
  `#readPublishForums`, `publish_networks.js#readPublishNetworks`, commandes `publish.*`) ; un forum ou un réseau
  rangé par l'Atome `life_profile_filing` (`life_profile_runtime.js#assign` / `#filingsOf`, MCP `profiles.assign`
  `item_kind` + `item_id`) ; maintien d'une tuile forum dans Contacts → ligne « Profils ». Preuve :
  `temp/r014/forum_profiles.probe.mjs`, 21/21 (`temp/r014/run/report.json`). Non vérifié : Tauri, iOS, synchro.
- Manque (après réponse à Q35) : ranger un réseau depuis l'écran (aujourd'hui par l'assistant seulement).
- FAIT le 2026-10-30 (reco partout) : Q35, appui long sur une tuile réseau de Publier (TikTok, Instagram, Page
  Facebook) → maintien commun avec la ligne « Profils » ; cocher range le réseau (`life_profile_filing`,
  item_kind network) par `window.Atome.commit` (`publish_surface.js#holdNetwork`, `bevy_panel_disc_tiles.js`
  `holdable`, `hostHold` du stage). Preuves : `temp/reco_small/r014_network_hold.probe.mjs` 13/13 (vrais appuis :
  appui long TikTok → Profils → Sport ; sous Pro TikTok absent, sous Sport présent), captures `temp/reco_small/r014/`.
  Vu : une fois Profils déplié, la dalle agrandie couvre la tuile tenue (comportement de la brique commune).

### R-015 — Curseurs : derniers curseurs hors du curseur unique
- Statut : FAIT (2026-10-30, soir) — Q36 B : l'outil lâché rejoint la bande du bas, curseur DOM retiré (`temp/reco_small/r015_band_tool.probe.mjs` 13/16 : les 3 échecs sont la réouverture d'un projet en sonde, défaut antérieur prouvé par `r015_reopen_baseline.probe.mjs`, une erreur AudioContext non attribuée et l'étape du harnais ; la persistance est relue après rechargement, 9b/9c).
- Vérifié le 2026-10-30 : vivant, Trouver › Outils › « Taille » lâché sur un projet monte ce curseur (bornes fausses
  0–100 au lieu de 8–420) ; preuve `temp/r015/live_slider.probe.mjs` (2/2), capture `temp/r015/live_dom_slider.png`.
  Aucun code changé : toute suite dépend de la réponse.
- Source : mémoire « Sliders : un seul partout » du 2026-10-26.
- Rapprochement du 2026-10-30 : un seul reste vivant, le curseur de la boîte à outils de la projection DOM, un
  `<input type="range">` natif (`atome/src/squirrel/components/tool_slider_elements.js`, monté par
  `eVe/intuition/projection/button.js` via `slider_tool_content.js`, lié par
  `project_drop_projection_slider_runtime.js`), gardé exprès « jusqu'au passage de cette boîte à outils en Bevy »
  (FRAMEWORK_STATE 2026-10-26). Tous les autres sont sur la jauge ou le curseur d'outil.
- Reste : passer ce curseur sur le curseur d'outil Bevy (`bevy_ui_tool_slider.js#buildBevyToolSliderNode`).
- FAIT le 2026-10-30 (reco partout) : Q36 B, l'outil lâché depuis Trouver › Outils rejoint la bande du bas du projet
  (`eVe/intuition/menu/project_band_tools.js`, Atome projet `band_tools`, gardé une fois, relu à l'ouverture) ;
  « Taille » y est le curseur d'outil Bevy 8–420 ; MCP `projects.band_tool`. Le chemin du curseur DOM est supprimé
  (7 fichiers, `ToolSlider` retiré de `spark.js` et `scripts/bundle.js`, 3 cas de test DOM retirés). Preuves :
  `temp/reco_small/r015_band_tool.probe.mjs` (journal `temp/reco_small/r015.log`, 21:42) : contrôles 1–8, 10, 9b, 9c
  passent (dépôt réel, aucun bouton DOM ni `<input type=range>`, `band_tools` = [size], jauge « 233 px » au geste, MCP,
  après rechargement `band_tools` relu = [size] et la bande du projet bâtie de lui pose Taille 8–420) ; échouent :
  9 (réouverture du projet après rechargement : `bevy_renderer_diff_present_timeout`, défaut connu des sondes, le même
  sans aucun `band_tools` et avec le menu d'avant ce lot : `temp/reco_small/r015_baseline_{1,2,pristine,gesture_1,gesture_2}.log`)
  et 11 (« The AudioContext encountered an error from the audio device » de Chromium après rechargement, vu seulement
  dans les passes qui font glisser le curseur, 3 fois sur 4 ; jamais sans ce glissement ni dans les bases ; non attribué,
  aucun code audio sur ce chemin) ; l'étape « grille posee » du harnais échoue aussi. Captures `temp/reco_small/r015/`,
  `tests/eve/slider_options_contract.test.mjs` 12/12. Non prouvé : Taille vue dans la bande d'un projet rouvert à l'écran. Hors périmètre : le reste de la boîte à outils de projection DOM (`project_drop_toolbox_*`, runtimes palette /
  déplacement / hôte, `window.eveProjectDropApi.mountToolProjectionInstance`) n'a plus d'appelant (code mort à retirer
  sur accord).

### R-016 — Résultats : lots après le lot A
- Statut : ATTENTE UTILISATEUR (2026-10-31) — tout est codé (lots B à F, Q40/Q69 « Mon nom » et image fidèle de l'aperçu : `temp/reco_resultats/results.probe.mjs` ALL OK, `run14.log`) ; reste ton geste pour Strava : accord développeur, création de l'application, clés `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` dans `/etc/squirrel/squirrel.env` (étapes dans la puce « lot F » ci-dessous, envoyées le 2026-10-30).
- Source : mémoire « Panneau Résultats » du 2026-10-28 (session `67c374b0`) ; plan validé (« Ordre de
  réalisation »), maquettes `temp/results_panel/mockups/` M1–M12.
- Fait : lot A, données du ressenti (`atome/src/shared/health_feeling_contract.js`,
  `atome/src/squirrel/health/health_feeling.js`, MCP `health_feeling.set` ; FRAMEWORK_STATE 2026-10-28, sondes 24/24
  et 9/9). Pas encore écrit : HKStateOfMind sur iOS.
- Manque (rapprochement du 2026-10-30, rien dans le code ni dans FRAMEWORK_STATE) :
  - B, moniteur Résultats (M1–M4 validées) : anneaux et cartes pastel, bande de la semaine glissée de côté,
    bascules d'activité au pied, heure choisie en glissant sur une carte, repères « après », commandes vocales,
    entrée « Résultats » dans le Moniteur, carte Ressenti vide « Non renseigné ».
  - C, séance (M5b–M9) : fin de séance sans le grand disque, Passer / Enregistrer dans la bande ; lignes du ressenti
    au départ et pendant le repos ; le matin, le champ du pied en Pro. La phrase de l'assistant en Basic n'a pas de
    maquette.
  - D, muscles (M10) : muscles principaux et secondaires des 93 exercices, la silhouette, la ligne « Muscles ».
  - E, envoi (M11) : sélection, tout coché par défaut, puis « Suite » vers Publier (Publier existe depuis le
    2026-10-29).
  - F, connexions (M12) : panneau Préférences › Santé et OAuth serveur par service (Strava, Whoop, Oura) ; chaque
    service demande un accord développeur de ton côté ; l'assistant ne lit jamais ces données.

- Question 30 : déjà répondue le 28 oct. (le matin en Basic = une courte phrase de l'assistant qu'on touche). Question posée le 2026-10-30 : n° 31 (services de connexion, lot F) de `todo/questions_registre_2026-10-30.md`.
- En cours le 2026-10-30 : lot B (moniteur Résultats) et lots D + E (muscles, envoi), puis lot C ; lot F attend la question 31 et tes accords développeur.
- FAIT le 2026-10-30 : lot D (muscles des 93 exercices `atome/src/shared/training_muscles.js`, silhouettes
  `training_body_map.js`, ligne « Muscles » `dashboard_training_muscles.js`) et lot E (« Envoyer mes résultats »,
  `eVe/domains/results_send/`, MCP `results_send.*`). Preuves : `temp/r016de/muscles_data.probe.mjs` 13/13,
  `temp/r016de/ui.probe.mjs` 39/40 (seul échec : l'étape « grille posee » du harnais), captures `temp/r016de/shots/`.
  Lot E branché sur des cartes d'essai : le moniteur du lot B doit appeler `registerResultsSendSource`.
- Questions 40 (« Mon nom » dans l'aperçu), 41 (image jointe), 42 (pas de réseaux pour des résultats).
- FAIT le 2026-10-30 : lot C (ressenti avant Lancer, pendant les repos, au bilan sans disque avec Passer · Suivi ·
  Envoi · Enreg. ; champ du matin en Pro ; panneau « Ressenti », MCP `health_feeling.open`). Preuve :
  `temp/r016c/feeling.probe.mjs` ALL OK (`temp/r016c/run8.log`), `temp/r016c/block.node.mjs`, captures
  `temp/r016c/*.png`. En cours : la phrase du matin en Basic, vérifiée au navigateur par l'agent. Non fait : rangées
  de ressenti sur les cartes cardio (autre vue). Questions 53 (teinte d'une case cochée), 54 (séance toute passée).
- FAIT le 2026-10-30 (reco partout) : lot F, Strava d'abord (Q31). Connexion par la page de Strava (OAuth serveur,
  jetons dans le coffre `health.strava`, renouvellement, déconnexion révoquée), import des 30 derniers jours dans les
  séances (un enregistrement par jour `activity_import`, source « instrumented » / strava, réimport sans doublon),
  vu par Résultats (séances Sport, anneau) ; MCP `strava.*` ; Préférences › Santé (brique « Santé » de Réglages),
  bloc pareil aux comptes des réseaux. Sans application Strava sur le serveur : « Non disponible sur ce serveur
  atome », erreur `NOT_CONFIGURED`. Preuves : `temp/reco_strava/strava_server.probe.mjs` 35/35,
  `temp/reco_strava/strava_import.probe.mjs` 25/25, `temp/reco_strava/ui_settings.probe.mjs` ALL OK sans et avec clés
  (`ui_not_configured.log`, `ui_configured.log`), captures `temp/probe_reports/dashboard_enhancement/reco_strava_*/`.
  Reste de ton côté : accord développeur Strava, création de l'application, clés `STRAVA_CLIENT_ID` /
  `STRAVA_CLIENT_SECRET` dans `/etc/squirrel/squirrel.env`, redirection
  `https://atome.one/api/social/oauth/callback/strava`. Non vérifié : un vrai compte Strava, iOS, Tauri. Whoop, Oura :
  non commencés (Q31 = Strava d'abord).
- FAIT le 2026-10-30 (reco partout) : Q41 l'envoi joint l'image de l'aperçu (découpée dans l'image que le moteur
  dessine, `eVe/domains/rendering/bevy_ui_node_capture.js`, rangée dans tes médias « Mes résultats.png ») en plus des
  lignes ; Q54 une séance toute passée finit « Arrêté », sans ligne d'objectif, enregistrée arrêtée et pas comptée,
  Passer et Enreg. en sortent ; Q55 toucher une carte sans glisser rend la journée entière ; Q56 depuis « Tout », un
  toucher garde l'activité seule, ensuite chaque toucher ajoute ou retire (filtre des médias inchangé) ; Q58 la plaque
  « Résultats » du Moniteur est une plaque entière, son nom entier ; Q62 A Forme et Force en tête de la zone des valeurs
  de la carte cardio avant Lancer. Q42, Q53, Q57, Q59 : état actuel gardé. Preuves : `temp/reco_resultats/results.probe.mjs`
  ALL OK (`run9.log`), `temp/reco_resultats/training.probe.mjs` ALL OK (`training_run2.log`),
  `temp/reco_resultats/split_import.probe.mjs` ALL OK, captures `temp/reco_resultats/out/`.
- Q40 (« Mon nom » dans l'aperçu) : maquette faite, pas codée, en attente de ta validation :
  `temp/reco_resultats/mockups/q40_maquette_nom_coche.png` (une ligne « Résultats de Jean-Eric » en haut de l'aperçu,
  en gras, un demi-outil de haut), `q40_maquette_nom_decoche.png` (ligne absente), écran actuel `q40_actuel.png`.
  Question : « Quand " Mon nom " est coché, on montre " Résultats de Jean-Eric " en première ligne de l'aperçu, comme
  sur la maquette ? Reco : oui. »
- FAIT le 2026-10-31 : Q40 (question 69 validée) codée, remplace la ligne « maquette faite, pas codée » ci-dessus :
  « Mon nom » coché, l'aperçu commence par « Résultats de <ton nom> » en gras, un demi-outil de haut ; décoché, la ligne
  disparaît ; l'image jointe à l'envoi la porte en tête. Une personne sans nom : pas de ligne.
  `eVe/domains/results_send/results_send_panel.js`. Preuves : `temp/reco_resultats/results.probe.mjs` ALL OK (`run11.log`),
  captures `temp/reco_resultats/out/q40_nom_coche.png`, `q40_nom_decoche.png`, `q40_sans_nom.png`, `q41_image_envoyee.png`.
- FAIT le 2026-10-31 (relecture du coordinateur) : l'image jointe est fidèle à l'aperçu : le fond du panneau tel qu'il est
  peint entre les cartes (plus de bandes blanches), la marge du panneau tout autour, l'espace des cartes comme à l'écran,
  « Résultats de … » à la marge, comme sur la maquette validée ; plus de barre de défilement sur l'image (un défilement
  par le code la laisse maintenant s'éteindre). `eVe/domains/rendering/bevy_ui_node_capture.js`,
  `eVe/domains/rendering/bevy_ui_scroll_runtime.js`. Preuves : `temp/reco_resultats/results.probe.mjs` ALL OK (`run14.log`),
  image `temp/reco_resultats/out/q41_image_envoyee.png`.

### R-104 — Refonte globale atome/eVe : cartographie, MCP universel en accès, offline sans IA
- Statut : EN COURS (signal de départ donné le 2026-10-30 au soir, session `41da0099`). Fait au départ : commit eVe
  `402f9924` puis parent `e3f1d0849`, push des deux `main` (vérifié sur GitHub). TestFlight : une publication 1.41 (40)
  de la session montre tournait déjà sur le même état ; pas de doublon lancé (le script refuse deux publications).
  Choix de branche (§1.2 bis, toi, 2026-10-30) : **branche dédiée à part**, `refonte-r104` (parent et eVe) dans le
  worktree `.claude/worktrees/refonte-r104`, partie de `e3f1d0849` / `402f9924` ; les autres sessions restent sur
  `main` ; une seule fusion à la fin. Exception à « jamais de worktree », limitée à cette tâche. Git redevient en
  lecture seule hors de cette branche.
- Phases A et B faites (30 oct., soir) : inventaires `temp/r104/baseline/` et conception
  `eVe/documentations/global_registry_architecture.md` (dans le worktree). Phase C : maquettes faites, 37 écrans en
  téléphone et bureau (MA, MB, MC, MD) dans `temp/r104/mockups/` du worktree. Phase C CLOSE (30 oct., soir) : 6
  questions posées et répondues, toutes sur la recommandation : S0–S5 = alertes, briques R0–R2 ; catalogue
  Compl'Alim + Open Food Facts ; modèle partagé par lien, chaque version proposée ; import et Modèles dans le Carnet
  (Traitements, outil « Modèl. ») ; partage du carnet rien coché ; liste B prise en bloc. Réponses consignées dans
  `temp/r104/mockups/QUESTIONS_PHASE_C.md` (worktree). Phase D (code) en cours.
  - Phase D, lot D4 fait le 2026-10-30 (moteurs Santé sans interface) : import de protocole (forme du modèle, texte
  original gardé tel quel, `.txt` reconnu), index des ingrédients, règles S0–S5 (toutes « proposées, inactives »),
  planificateur sans IA, revue proposé → revu → actif, modèles partagés par partage lié avec versions proposées,
  catalogue Compl'Alim hors ligne, produits Open Food Facts vus gardés sur l'appareil, familles MCP
  `health_protocol` / `health_products` fermées à l'IA. Preuve : `temp/r104/probes/d4_*.probe.mjs` (6 sondes,
  138 PASS, 0 FAIL), détail dans `temp/r104/PHASE_D_LOG.md` § D4.
  - À te soumettre en fin de tâche (D4, non bloquant) : les règles SEC-01..10 et les sorties A–I ne sont définies que dans ton document 2
  (personnel, jamais lu). D4 les a calées sur les dix familles de tests B.6 et l'ordre B.1–B.3 du cahier 01 :
  comparer avec ton document 2 et dire ce qui diffère. Tes modèles réels de `tests/health_protocols/` n'ont jamais
  été lus : lance `node temp/r104/probes/d4_import.probe.mjs tests/health_protocols` (n'affiche que des comptes).
  Non fait : interface (maquettes MA/MB de la phase C), i18n des libellés.
  - Lot D8 (2026-10-31) : MD1 (Programmes dans Mon matériel, familles, « Retir. », droits gardés en atomes privés), MD2 (demande annoncée par eVe, panneau Refus / Oui, assistant sans JSON) et MD3 (Relier, Visib., carte, Signal / Bannir / Fin du lien, « Réseau des objectifs » dans Confidentialité) codés. Preuves : `temp/r104/probes/d8_access.probe.mjs`, `d8_social.probe.mjs` 21/21, `d8_network_unit.mjs` 15/15, captures `temp/r104/probes/out/d8_*`. Reste (fait par l'orchestrateur après le lot D5) (fichiers Mystic interdits au lot) : brancher l'entrée du niveau « Relier » dans la grille, la scène de la carte, les lignes Signaler / Bloquer / Fin du lien de l'appui d'un contact, et les annotations du registre (`mcp_access`, `objective_network`) ; détail dans `temp/r104/PHASE_D_LOG.md` § D8 « Placements to add after D5 ». Bloqué (nommé) : essai P022–P025 avec de vrais comptes d'autres personnes.
- Source : la session « Cahier MCP » du 2026-10-28 au 2026-10-30. Le cahier en vigueur est
  `todo/refonte_globale_architecture_mcp_offline_v1_2_2026-10-30.md` (V1.2, copié de ton dossier Téléchargements).
  Il remplace le cahier MCP du 28 oct. et le plan `todo/mcp_universal_access_plan_2026-10-28.md` (périmé).
- Validé par toi : attendre la fin de toutes les autres tâches, y compris la session « Audit atome eVe ». Au démarrage,
  et avant toute écriture : commit, push de `main` (eVe puis le parent) et build TestFlight. Puis poser la question
  de branche du §1.2 bis du cahier.
- Le 2026-10-30, tu as demandé de fusionner cette tâche avec la session « Plan de gestion des activités »
  (cahier Santé 01 + protocoles 02) en une seule tâche, traitée en une passe. Le plan commun est
  `todo/plan_refonte_mcp_et_sante_activites_2026-10-30.md`. Les deux plans ont été validés par toi le 2026-10-30
  (« Plans approved ») ; les 13 questions de la phase C restent à poser une à une après le signal. Le volet
  Santé de la session « Plan de gestion des activités » est écrit à part, avec les mêmes phases A–F :
  `todo/plan_sante_activites_objectifs_2026-10-30.md` (état réel du code, blocages par nature, 7 questions Santé
  de la phase C avec recommandations). Ta consigne du 2026-10-30 : ne rien démarrer avant ton signal. Les deux
  tâches partent ensemble, dans une nouvelle session bâtie sur les deux plans ; les deux anciennes sessions ne
  sont archivées ou supprimées qu'avec ton accord.
- Questions Santé (§6 du plan Santé) toutes réglées le 2026-10-30 : 1 la charte l’emporte partout ; 2 Santé partagée en trois (objectifs sous Projets, briques sous Activité, carnet en rubrique propre) ; 3 mise en relation = outil de la bande ; 4 D1 déjà validée le 28 oct. ; 5 thermalisme tranché par le cahier (`THERM-CAND-*`) ; 6 Ciqual embarqué + produits Open Food Facts déjà vus gardés sur l’appareil ; 7 ton document 2 sert de base et d’exemple, c’est un modèle (template) et d’autres viendront : l’import suit la forme du modèle, chaque document déposé dans `tests/health_protocols/` (ignoré par Git, jamais poussé, `atomecorp/a` est public) est importé et testé sans changer le code ; certains modèles sont partageables : privés par défaut, partagés par leur auteur entre comptes eVe (partages liés D8–D10, jamais GitHub), le receveur repasse par l’import et la sécurité S0–S5 sur son propre profil ; les proposer et les partager dans eVe = maquettes en phase C.
- Tuile « Carnet de santé » de l'accueil : question posée avec maquettes le 2026-10-31 (« à côté de Moniteur »
  impossible en Pro), réponse **A — sous Projets** (rangée du bas, à gauche de Capture ; Basic inchangé, carnet par
  la recherche et la voix). Maquettes `temp/r104/mockups/carnet_tile/` (worktree). Placement confié au lot D14.
- Lots D1 à D15 codés dans le worktree (détail et preuves : `temp/r104/PHASE_D_LOG.md`). Reste : tuile Carnet (D14,
  en cours), reliquats de phase D (`temp/r104/REMAINING.md`), phase E (recette), phase F (fusion après ton accord).
- Références externes citées par le cahier : `~/Desktop/taxonomie.md` ;
  `~/Downloads/01_CAHIER_COMPLET_SANTE_ACTIVITES_OBJECTIFS_atome_eVe.md` (le nom
  `CAHIER_DES_CHARGES_SANTE_ATOME_EVE_2026-10-30.md` cité par le cahier est introuvable ; c'est le fichier le plus proche).
- FAIT le 2026-10-30 : lot B, moniteur « Résultats » (Moniteur › Résultats, MCP `dashboard.results.*`), branché au
  lot E (envoi depuis le vrai moniteur). Preuve : `temp/r016b/results.probe.mjs` ALL OK 57/57
  (`temp/r016b/run12.log`), `temp/r016b/model.probe.mjs`, captures `temp/r016b/out/`. Non vérifié : vrai hôte santé
  iOS/Android, appareil. Questions 55 à 59. Lot F attend la question 31.
- FAIT le 2026-10-30 (suite du lot C) : phrase du matin en Basic une fois par jour même après rechargement, touchée
  elle ouvre « Ressenti » ; lignes du ressenti pendant les récups cardio et au bilan cardio. Preuve :
  `temp/r016c/basic_cardio.probe.mjs` ALL OK (`temp/r016c/basic_run6.log`), captures `temp/r016c/b0*.png`,
  `c0*.png`. Bloqué : lignes avant Lancer sur une carte cardio (question 62).

## Attentes de ton côté (aucune session ne peut les faire seule)

### R-101 — Inscrire l'iPhone 13 Pro de Sylvain
- Statut : ATTENTE UTILISATEUR
- Question posée le 2026-10-30 (session `e6d257bf`) : l'UDID de son iPhone 13 Pro, pour l'inscrire au compte
  développeur.

### R-102 — Essais sur tes appareils
- Statut : ATTENTE UTILISATEUR
- Vidéo puis visio sur l'iPhone, app au premier plan (session `fa77e9d2`, 2026-10-27) ; scintillement de
  Capture › Audio sur l'iPad (session `51ffbaeb`) ; écoute du Sampler sur l'iPad / AUv3 ; montre réelle (W1–W7) ;
  alarmes d'objectif sur l'iPhone ; écran CarPlay dans la voiture ; lecture YouTube par la page hôte sur l'iPhone et
  sur Tauri (R-011) ; démarrage sourd et mode avion du moteur vocal sur l'iPad (R-013).

### R-103 — Compte de test sur atome.one
- Statut : ATTENTE UTILISATEUR
- Question du 2026-10-29 (session `0b6e244a`) : rouvrir l'inscription une minute pour créer le compte de test.
  Probablement dépassée par l'inscription sur invitation (2026-10-30) : à confirmer avec toi.

### R-104 — Montre : tuiles jamais reçues (glyphe iPhone seul)
- Statut : EN COURS (2026-10-30, soir) — envoi TestFlight 1.41 (40) en cours depuis cette session.
- Source : ta photo du 2026-10-30 au soir (session `84259824`) : au premier lancement de TestFlight 1.40 (39), la montre
  ne montre que le glyphe bleu de l'iPhone, sans texte, donc elle n'a jamais reçu ses tuiles.
- Cause trouvée : l'iPhone n'ouvrait sa liaison montre (WCSession) qu'au chargement de la fenêtre d'eVe ; la demande de
  la montre qui réveille l'app en arrière-plan était perdue, et rien ne la renvoyait. Corrigé dans le code (liaison ouverte
  au lancement, page démarrée sans fenêtre à la demande, la montre resalue une page qui ne l'a pas encore été). Preuves :
  sonde `temp/watch_companion/probe_watch_link.mjs` 53/53, cible montre compilée, dessin des images vérifié en WebKit
  (`temp/watch_companion/webkit/paint_probe.swift`).
- Reste : ton essai sur la montre avec la 1.41 (40) (déclaration de chiffrement option 2 dans App Store Connect, puis mise à jour TestFlight).
