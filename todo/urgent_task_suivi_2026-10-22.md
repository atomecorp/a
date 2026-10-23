# Suivi — tâche urgente du 22 octobre 2026

Registre unique de `todo/!!!!!!_Urgent_big _task_to implement.md` (§7.1). Statuts : `PASS` (vérifié, preuve citée),
`FAIL`, `NON TESTÉ`, `BLOQUÉ`, `À VALIDER` (design ou décision attendu), `ÉTUDE` (livrable écrit, rien d'implémenté).

## Tableau des lots

| Lot | Point | Statut | Preuve / limite |
| --- | --- | --- | --- |
| L03 | S-04 a — compteur de séries resté initial | PASS Web (corrigé par la session « Activités sport : séries et timing », commit eVe `06ba8326`) · NON TESTÉ iPhone | Cause : sur iOS chaque exercice ne démarrait qu'une fois (`assertIdempotentEventReplay` voyait le `type` iOS). Sonde `temp/training/sport_all/history.probe.mjs` avec `IOS_SHAPE=1` : 17 exercices × 6 séances. Reste : recompiler l'app iOS. |
| L03 | S-04 b — fermer une activité revient à l'écran précédent | PASS Web | `eVe/domains/dashboard/dashboard_training.js`. Sonde Playwright `temp/sport_s04/close_back.probe.mjs` 9/9 ; même sonde sur HEAD : FAIL « Fermer → Mon programme » (bug reproduit). iPad non testé. |
| L05 | S-05 — enchaînement auto / mode manuel | Moteur PASS · UI À VALIDER | Profil `training.auto` (vrai par défaut). En manuel, un minuteur à zéro bipe une fois et attend « Reprendre maintenant » / « Étape validée », qui enregistrent le temps réellement fait. Sonde `temp/sport_s04/tempo_auto.probe.mjs` 13/13. Maquette `temp/sport_s04/mockups/tempo_manuel.png`. |
| L05 | S-06 — tempo et bips | Moteur PASS · UI À VALIDER | Profil `training.tempo { concentric_s, eccentric_s }` (1-6 s, musculation seulement, appliqué en Perso). Un bip court par répétition, un bip grave (`turn`, 880 Hz) à la bascule montée→descente. Cloche = désactivation de tous les bips (existant). Maquette `temp/sport_s04/mockups/tempo.png`. |
| L05 | S-06 — mots-clés vocaux locaux | ÉTUDE | Section « Étude voix » ci-dessous. |
| L03 | S-01 — audit scientifique des programmes | ÉTUDE · décisions À VALIDER | Section « S-01 » ci-dessous ; sources ACSM 2026 et BJSM 2023 vérifiées ; catalogue inchangé (en-tête de sources mis à jour). |
| L06 | S-02/S-03 — échauffement, variations, programmes prêts | À VALIDER | Dépend des décisions S-01 (objectif Force, repos) et d'un design (séries d'échauffement dans le tableau, variations par série dans Perso, catalogue de programmes). Rien codé. |
| L07 | S-07 — temps et énergie | PASS (moteur + affichage Web) | `eVe/domains/training/training_energy.js` (MET du Compendium 2024 × poids × durée ; actives = MET − 1). `training.read_log` : énergie par séance, `days` (totaux du jour), `work_minutes` / `rest_minutes` / `paused_minutes`. Bilan de séance : ligne « Énergie estimée ≈ N kcal » ; Journal : kcal dans la colonne détail. Sonde `temp/sport_s04/energy.probe.mjs` 12/12 ; capture réelle `temp/sport_s04/s07_shots/p7_bilan.png`. Sans poids sur la fiche : pas d'estimation. Jamais écrit dans Santé (qui mesure sa propre énergie active pendant la séance iOS 26) : pas de doublon. Non fait : total journalier affiché à l'écran (disponible pour l'assistant/MCP), affinement par fréquence cardiaque. |
| L04 | CAL-01 — objectifs, alarmes, agenda synchronisés | PASS partiel (Web) · 1 arbitrage · 1 capacité absente | Audit complet + correctifs : (1) supprimer un objectif retire ses événements futurs et récurrents liés (`CalendarAPI.releaseProjectEvents`, appelé par `deleteProjectRecord`), passé conservé, alarmes natives annulées ; (2) mettre un programme en pause suspend aussi les événements quotidiens de sa routine (et leurs alarmes), une nouvelle acceptation les relance ; (3) une alarme relit l'événement au moment de sonner : suspendue, supprimée ou retirée ailleurs, elle ne sonne pas ; un avis en attente d'un événement suspendu n'est plus publié ; (4) une suppression reçue d'un autre appareil retire aussitôt l'événement et ses alarmes ; (5) replanifier une semaine de sport retire les créneaux futurs abandonnés et met à jour les exercices des créneaux gardés ; (6) ids d'alarme de sommeil uniques par objectif. Preuves : `temp/cal_02/cal01.probe.mjs` (app réelle, 7/7), `temp/cal_02/routine_pause.probe.mjs` 4/4, Vitest `project_program`, `calendar_next_events`, `personal_calendar_crud` 52/52. Ouvert : voir « Questions ». |
| L11 | CAL-02 — prochain événement eVe Basic | Moteur PASS (Web) · design À VALIDER | La tuile Agenda suit désormais l'agenda en direct (`eVe/domains/dashboard/dashboard_next_event.js` : abonnement `CalendarAPI`, relecture à la fin du rendez-vous affiché) ; un événement suspendu (programme en pause) n'est plus « prochain ». Preuve app réelle `temp/cal_02/agenda_tile.probe.mjs` 6/6 ; même sonde sur HEAD : FAIL (le rendez-vous ajouté n'apparaissait qu'à la réouverture). Constat : pour un rendez-vous d'un autre jour la tuile montre la date sans l'heure. Maquettes `temp/cal_02/mockups/a_largeur.png`, `b_hauteur.png`. Limites : horizon de lecture 7 jours (au-delà : tuile vide) ; changements synchronisés d'un autre appareil vus à la réouverture, sauf suppression (immédiate). |
| L14 | Web V1 dans Divertissement | Audit fait · BLOQUÉ sur un choix d'architecture | Sur iOS le lecteur YouTube est un iframe dans la WebView principale ; aucune WKWebView secondaire n'existe ; la WebView principale est rendue opaque à 4 endroits (`WebViewManager.swift:129-131`, `squirrel.css`, script `paintBlack` d'`AppPageHost.swift:36`, vue racine). Plan minimal : entrée `fun_web` (`dashboard_stage_media.js`), type `web` du stage (`dashboard_mystic_stage.js`), outils du bandeau Précédent/Suivant/Favori/Fermer, champ du bas = adresse/recherche, favoris = `createProfilePreferenceList`, nouvelle `AppNativeWebPageController.swift` (stockage `nonPersistent`, aucun gestionnaire de messages, http(s) seulement). Voir « Questions » 4. Tauri : pas de webview enfant sans la fonction `unstable` ; Web : iframe seulement (la plupart des sites refusent). |
| L19-21 | Matrice de Scène (Molécule) | Audit fait · design À VALIDER | Existant : vues `timeline` / `cells` / `split` (`kernel/timeline_view.js`), Scènes = plages de temps, cellules = réglages clairsemés `cellId(scene, track)` (`kernel/scene_schema.js`) ; **aucun Master de Scène** dans le modèle de mixage (`mix_schema.js`, `molecule_mix_engine.js`) : à créer avec preuve audio. Sondes noyau rejouées : `molecule_scenes_cells` 6/6, `molecule_cell_player` 3/3. Maquettes `temp/matrix_scene/mockups/matrice.png`, `matrice_pistes.png` (bâties sur une capture réelle des Cellules, `temp/cal_02/matrix_base.probe.mjs`). |
| L16 | Social sportif | ÉTUDE terminée · choix A/B/C À VALIDER | `todo/etude_social_sportif_2026-10-22.md` : recommandation C maintenant (partage ciblé, note de séance, défi privé), A seulement après pilote, B rejetée ; contradiction : le code a choisi « aucun compteur de like public » (`server/news_broadcast.js:195`) alors que SOC-03 trie par likes. |
| L18 | Communications et vidéo unifiées | ÉTUDE terminée | `todo/etude_communications_video_2026-10-22.md` : « Universal Adapter » introuvable dans le code (à préciser) ; VideoTrain seulement en concept ; « tout coché par défaut » rejeté (eVe seul par défaut, destinations mémorisées par profil). |
| L12-13 | Programmes tiers et liens vérifiés | ÉTUDE terminée | `todo/etude_programmes_tiers_liens_2026-10-22.md` : aucune réception de mail entrant ni SPF/DKIM/DMARC ; liens universels iOS seulement pour `/auth/v/*` ; Android App Links et plugin Tauri deep-link absents ; schémas `atome.partner_proposal.v1` et `atome.partner_dashboard.v1` proposés ; décisions DNS/MX, budget SMS, revue RGPD/HDS. |
| L24 | eVe permanent et contrôle distant | ÉTUDE terminée | `todo/etude_eve_permanent_2026-10-22.md` : option C hybride (appareil « agent » sur le Mac du même compte, serveur atome en relais APNs à références opaques) ; agent permanent sur l'iPhone impossible après fermeture forcée (pushes silencieux abandonnés) ; à prototyper d'abord : actions de notification sans ouvrir l'app ; iOS 27 sans changement push/arrière-plan. |
| L22-23 | Écosystème musical indépendant, musique et Sport | ÉTUDE terminée | `todo/etude_musique_independante_sport_2026-10-22.md` : ne pas bâtir de réseau de diffusion public maintenant ; architecture 4 réduite (lecteur Sport local pour les fichiers que l'utilisateur possède, index BPM local, Apple Music en télécommande seulement) ; forfait « 12 € / ~100 titres » à abandonner (le forfait standard donne déjà 50 Gio, `billing_contract.js:15`) ; Spotify/Deezer inutilisables pour le mode Sport (audio-features fermé le 2024-11-27, conditions non commerciales) ; la musique ne régule pas le cœur (Terry 2020). Signalé hors étude : les intégrations Deezer/Spotify existantes sont peut-être non conformes pour une app payante (revue juridique). |
| L08-L10 | Santé : plaisir, sieste/méditation/respiration, bilan, Thalasso, « i », profil santé, proximité | ÉTUDE terminée · 12 décisions d'interface À VALIDER | `todo/etude_sante_plaisir_thalasso_2026-10-22.md` : briques `nap`/`meditation` et moteur de séance générique réutilisables ; Thalasso, Plaisir, Pranayama, Sophrologie, bilan unique introuvables ; un seul propriétaire de bilan proposé (`program_observation`) ; « i » = catalogue partagé aux 8 rubriques (exemples Sieste et bain d'eau de mer rédigés) ; profil santé : `program_preference` porte déjà allergies/intolérances, manquent catégories médicales, statut déclaré/confirmé/suggéré et effacement ; aucune source de lieux/événements ; preuves Thalasso faibles hors pathologies ; hyperventilation + apnée exclues ; RGPD art. 9, HDS et statut de dispositif médical à faire trancher par un juriste. |
| L10B | Suivi photographique Beauté / Apparence | Audit · À VALIDER | Aucun module de suivi photo (« beauté » n'existe que comme rayon de la Boutique : `eVe/domains/shopping/shopping_catalogue.js`). Briques réutilisables : rappels récurrents du calendrier (`calendar_api.js`), capture photo (`dashboard_capture_session.js`), liste des prises (`dashboard_takes_list.js`). À décider : le nom (Beauté ou Apparence) et le design (prise guidée, comparaison de deux dates). |
| L15 | Split View transversal | Audit · BLOQUÉ (deux décisions réservées par la source) | Aucun agencement à deux zones hors du `split` de la Timeline (à ne pas confondre, §1.15). SV-03 laisse expressément ouverts l'accès et le choix de la seconde zone ; rien n'est figé. |

Pauses, Reprendre, Suivant : déjà présents dans le bandeau de séance (Pause/Reprendre, Passer, Stop) et le disque
(« Série terminée », « Reprendre maintenant », « Étape validée ») ; rien ajouté.

## Designs en attente de validation

1. **Tempo et enchaînement** (`temp/sport_s04/mockups/tempo.png`, `tempo_manuel.png`), envoyé le 2026-10-22 :
   deux lignes Montée / Descente dans Perso (champs numériques existants), glyphe `repeat` à gauche de la cloche
   (allumé = auto, barré comme `bell_off` = manuel).
2. **Prochain événement eVe Basic** (`temp/cal_02/mockups/a_largeur.png`, `b_hauteur.png`), envoyé le 2026-10-22 : A = trois cases
   en largeur au-dessus de l'Atome (la tuile Agenda reprend son glyphe) ; B = la tuile Agenda grandit sur trois cases en hauteur à droite.
   À trancher aussi : afficher « demain » / « ven. 24 » quand ce n'est pas aujourd'hui (la source dit « seulement heure et sujet »).
3. **Matrice de Scène** (`temp/matrix_scene/mockups/matrice.png`, `matrice_pistes.png`), envoyée le 2026-10-22 : une Scène sur une grille
   libre (aspect des Cellules), Scènes A B C en bas à gauche, quatre icônes locales en bas à droite (Mixeur, Pistes, Follow Action,
   Timeline) ; Pistes ouvre la vraie Timeline cadrée sur la Scène, sur le côté.

## Questions (arbitrages nécessaires)

1. **CAL-01 contre une règle du code.** `project_program_runtime.js` : « Calendar placement owns dates. Revisions cannot silently move
   an existing occurrence. » CAL-01 : une modification de dates/heures/fréquence doit actualiser toutes les occurrences futures.
   Recommandation : déplacer seulement les occurrences futures jamais touchées par la personne (début identique à l'ancien plan),
   garder les déplacées, verrouillées et faites. En attendant : rien changé.
2. **Clôture d'un objectif.** Aucun état « clos/terminé » n'existe (`project_intent.status` n'admet que `draft`). CAL-01 (arrêter les
   rappels à la clôture, garder le passé) suppose cette capacité, et donc un geste d'interface pour clore. À décider : où clore.
3. **S-01** : repos constant par niveau, objectif Force, ordre poly-articulaires d'abord (détails en section S-01).
4. **Web V1 : la WKWebView sous Bevy ou par-dessus ?** WEB-02 demande « sous Bevy, à travers une découpe, après validation ». Sous :
   rendre transparentes la WebView principale, `html/body` et la vue racine pendant que la page est ouverte, et router les touchers de la
   découpe vers la page native. Par-dessus (recommandé) : vue native posée au-dessus, cadre = rectangle de la scène, bandeau et champ du
   bas restent atome ; plus simple et plus sûr pour les gestes, mais rien de Bevy ne peut se dessiner sur la page tant qu'elle est ouverte.
5. **Sécurité : routes mail du serveur — CORRIGÉ le 2026-10-23 (demande de l'utilisateur).** Chaque `/api/eve/mail/*` exige une session d'appareil vérifiée (`validateToken`) ; la connexion ouverte n'est réutilisée que par la même personne avec les mêmes identifiants (mot de passe haché dans la clé) ; hôtes IMAP/SMTP : nom DNS, port mail standard (993/143, 465/587/25), adresses publiques seulement (`checkMailHosts`) ; le client envoie sa session (`resolveMailSyncHeaders`) ; une lecture refusée n'apparaît plus comme une boîte vide synchronisée (`normalizeReadPayload`). Preuves : Fastify réel isolé `temp/mail_fix/routes_real.probe.mjs` 6/6 ; `tests/server/mailRoutes.probe.mjs` étendue (cas de sécurité) ; sondes client mail vertes sauf deux échecs déjà présents sur HEAD (`bootstrap.connector`, cas « dom » de `bootstrap.tauri_sync_target`). Non traité : le serveur Axum local (lié à 127.0.0.1, un processus par appel) garde ses routes sans contrôle d'hôte.
6. **Split View (SV-03)** : par où l'ouvrir (rail du bas, geste contextuel, autre) et comment choisir la seconde zone (choix manuel,
   proposition de l'IA). Options à comparer sur l'interface réelle avant toute maquette.
7. **Beauté ou Apparence** : le nom du module (B-01).



## Risques relevés

- **Programme plafonné à 4 000 enregistrements.** `readActivityRecords` (`eVe/domains/programs/project_program_runtime.js`)
  liste tous les `record` de l'utilisateur à chaque appel `training.*` (pages de 100). Au-delà de 4 000, tout le Sport échoue
  (`program_activity_read_incomplete`). Mesuré : `temp/sport_s04/big_account.probe.mjs`, identique sur HEAD. Correctif racine :
  un filtre `source_domain` sur les trois serveurs (Fastify, Axum, Swift). Non fait.

## Étude voix — mots-clés locaux pendant une séance (S-06)

Besoin : reconnaître localement quelques mots (« Suivant », éventuellement « Pause », « Reprends »), ignorer toute autre parole,
ne rien envoyer à un modèle génératif. Aucune API vocale présumée.

**Existant observé (inspection de code, 2026-10-22)**

| Brique | Fichier | Local ? | Plateformes | Limite |
| --- | --- | --- | --- | --- |
| Mot d'éveil openWakeWord « Ève, écoute-moi » | `atome/src/squirrel/voice/wake_detector.js`, `wake_detector_worker.js`, modèles `melspectrogram.onnx`, `embedding_model.onnx`, `eve_ecoute_moi.json` | Oui (ONNX Runtime Web dans un worker) | Web, WebView iOS, Tauri | Un seul moteur par appareil (mémoire iPhone) ; une phrase entraînée ; vérificateur personnel en 4 prises (`wake_enrollment.js`). |
| Reconnaissance native iOS | `platforms/ios/atome-auv3/application/AppNativeSpeechRecognizer.swift` | Sur l'appareil quand `supportsOnDeviceRecognition` (`requiresOnDeviceRecognition`) | iOS | `contextualStrings` déjà câblé ; écoute continue à relancer par tâche. |
| STT Tauri | plugin vendored `tauri-plugin-stt` (`service_tauri_stt.js`) | Selon le moteur du plugin, à vérifier | macOS/Tauri | Non mesuré. |
| STT navigateur | `service_browser_stt.js` | **Non** sur Chrome (audio envoyé au service du navigateur) | Web | Exclu pour ce besoin. |

**Options**

- **A — classifieur de mots-clés sur les embeddings openWakeWord déjà chargés.** Même worker, même moteur, coût nul,
  hors ligne partout où le mot d'éveil fonctionne. Il faut entraîner un classifieur par mot (positifs : prises de l'utilisateur
  comme `wake_enrollment`, ou voix locale `local_onnx` pour des positifs synthétiques ; négatifs : parole libre, salle, musique).
  Inconnu : taux de faux déclenchements avec musique et bruit de salle, et mots courts (« pause »).
- **B — reconnaissance iOS sur l'appareil, filtrée par liste.** Transcription locale, comparaison à une liste fermée, tout le reste
  ignoré. iOS seulement ; consommation d'une écoute continue à mesurer ; ne couvre ni le Web ni Tauri.

**Recommandation** : prototyper A sur le seul mot « Suivant » (le plus utile : valider série ou repos), puis B sur iOS si A
n'atteint pas la fiabilité. Précautions communes : couper la détection pendant les bips et la voix d'eVe (sinon auto-déclenchement),
n'agir que pendant une séance en cours, une action par mot reconnu, aucun envoi réseau.

**Protocole de test (à exécuter seulement si la réalisation est demandée)** : 20 « Suivant » par personne × 3 ambiances
(silence, salle, musique au casque et en haut-parleur) ; 30 min de parole libre et de musique pour compter les faux
déclenchements ; iPhone, iPad, Mac ; seuil cible ≤ 1 faux déclenchement par heure et ≥ 90 % de détection.

## S-01 — audit scientifique des programmes existants (2026-10-22)

Statut : ÉTUDE terminée ; aucune prescription modifiée (le catalogue est validé par l'utilisateur, les changements ci-dessous
sont des propositions à trancher). Sources primaires consultées le 2026-10-22 :

- ACSM 2026, *Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults:
  An Overview of Reviews*, Med Sci Sports Exerc 58(4):851-872, doi 10.1249/MSS.0000000000003897 (revue de revues, 137 revues,
  > 30 000 participants ; remplace la prise de position de 2009). Tableau 6 : force ≥ 2 séances/sem., ≥ 80 % 1RM (relation dose-effet),
  2-3 séries par séance, amplitude complète, exercices clés en début de séance ; hypertrophie ≥ 10 séries/sem. (dose-effet), accent
  excentrique ; l'échec musculaire n'apporte rien de plus, effort suffisant « proche de l'échec » ou 2-3 répétitions en réserve ;
  ni la fréquence, ni la charge, ni la périodisation, ni l'ordre n'ont modifié l'hypertrophie ; le temps de repos (< ou > 1 min)
  n'a pas modifié la force. Message central : passer de rien à un entraînement régulier compte plus que la prescription exacte.
- Currier et al., *Resistance training prescription for muscle strength and hypertrophy in healthy adults: a systematic review and
  Bayesian network meta-analysis*, Br J Sports Med 2023;57:1211-1220 (178 essais force, 119 hypertrophie) : toutes les prescriptions
  battent l'absence d'entraînement ; force : charges ≥ 80 % 1RM (≥ 8 RM) en séries multiples en tête ; hypertrophie : séries multiples
  2 fois/sem. en tête, la plupart des prescriptions comparables. https://pmc.ncbi.nlm.nih.gov/articles/PMC10579494/

| Constat (catalogue `atome/src/shared/training_catalog.js`) | Preuve | Proposition |
| --- | --- | --- |
| Toutes les séries de musculation sont en 8-16 répétitions (≈ 60-75 % 1RM) : aucune prescription « force » (≥ 80 % 1RM). | ACSM 2026 T6, Currier 2023 | Garder les niveaux actuels comme objectif « volume / hypertrophie / débutant » ; ajouter un objectif Force distinct (ex. 3 × 4-6 à ≥ 80 % 1RM, repos 2-3 min) proposé après ~8 semaines de pratique, via les programmes prêts à l'emploi de S-03. |
| Le repos **diminue** quand le niveau monte (90 → 75 → 60 s). Rien ne justifie qu'un repos plus court soit une progression. | ACSM 2026 (repos sans effet sur la force) ; hypertrophie : pas de bénéfice démontré au repos court | Repos constant par niveau : 90 s pour les exercices d'isolation (triceps, biceps, extension, leg curl), 120 s pour les poly-articulaires (squat, presse, tirage, fentes). |
| Volume par muscle : 2-3 séries par exercice, 2 séances/semaine ⇒ 4-6 séries/sem. par exercice. | ≥ 10 séries/sem. pour l'hypertrophie (dose-effet) | Le dire dans l'info « i » et dans le plan de semaine : atteindre ~10 séries/sem. par groupe en combinant 2-3 exercices (ex. Haut du corps). Pas de changement de niveau. |
| Aucune indication d'effort ; la double progression (monter la charge en haut de la fourchette) est bien en place. | ACSM 2026 : 2-3 RIR suffisent, l'échec n'est pas nécessaire | Consigne d'effort « s'arrêter à 2-3 répétitions de l'échec » dans l'info « i » (texte), sans nouveau champ. |
| Ordre libre dans « Mon programme ». | ACSM 2026 : exercices clés en début de séance (force) | Proposer par défaut les poly-articulaires en premier lors de l'ajout ; l'utilisateur garde ↑ ↓. |
| Gainage : +5 s/semaine jusqu'à 60 s puis variante ; HIIT ≤ 2/sem. | Consensus de praticiens, pas d'essai cité | Conserver ; marquer « consensus » (niveau de preuve faible) dans l'info « i ». |
| Charges de départ en part du poids du corps (`load_ratios`). | Heuristique, pas de source | Conserver comme série test seulement (déjà le cas) ; le dire. |
| Cardio : 150-300 min modérées ou 75-150 vigoureuses par semaine. | OMS 2020 | Conforme. |

Décision attendue : appliquer ou non (1) le repos constant par niveau, (2) l'objectif Force, (3) l'ordre poly-articulaires d'abord.
