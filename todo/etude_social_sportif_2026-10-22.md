# Étude — social sportif (lot L16, SS / SOC-01 à SOC-06, VID-02)

Date : 2026-10-22. Statut : **étude complète, aucun code modifié, aucune action Git ni externe**.
Périmètre : `todo/!!!!!!_Urgent_big _task_to implement.md` §1.10 (SOC-01–06, VID-02), §1.15, L16/L17, §4, §6 « Social sportif », §7.3.
Le dépôt a été lu tel qu'il est dans l'arbre de travail : `atome/src/shared/training_catalog.js` et `atome/src/squirrel/training/contracts.js` portent des modifications locales antérieures à cette étude (statut Git du début de session) ; l'audit les décrit telles qu'elles sont.
Les cartes `maps/` n'ont servi qu'à la navigation ; chaque statut ci-dessous renvoie à du code.

---

## 1. Compréhension concrète et contextualisée (sans réseau social traditionnel)

L'utilisateur fait une séance « bras » dans le Dashboard Sport : carte d'exercice `biceps_curl`, niveau 2, 3 × 12, 75 s de repos, charge proposée par `training.suggest_load`. Le social sportif ne vient **qu'en complément** de cette carte et du programme :

- **Avant** : en ouvrant l'exercice, lire des conseils techniques, des variantes (marteau, pupitre), des difficultés fréquentes (« je balance le dos »). C'est utile même sans jamais publier.
- **Pendant** : au mieux, une consultation d'une ligne ou d'une vidéo courte de la bonne exécution. Sinon rien : la minuterie, les séries et la voix (`training.session_transition`) restent prioritaires.
- **Après** : choisir, *si on le veut*, de partager un résultat (« 3 × 12 à 10 kg, enfin sans balancer »), poser une question, répondre à quelqu'un, aimer une contribution.

La discussion reste rattachée à son contexte sportif (exercice, zone, séance ou programme). Elle ne demande pas d'ouvrir un flux général. Il faut distinguer deux objets dont les identités et les droits diffèrent :

| Objet | Qui écrit | Qui lit par défaut | Contenu |
| --- | --- | --- | --- |
| Discussion partagée d'un exercice | plusieurs personnes | l'audience choisie (privée par défaut) | conseils, variantes, questions, médias |
| Journal / commentaire de séance individuelle | la personne seule | elle seule | la note de séance, les séries, l'éventuel cœur |

Le suivi doit rester entier sans aucune publication. Aucune donnée de santé (fréquence cardiaque, énergie, poids corporel) ni de localisation ne part automatiquement.

---

## 2. État des preuves et concurrence

Toutes les sources ont été consultées le **2026-10-22**. Signification des mentions : **F** = fait rapporté par la source ; **I** = inférence de cette étude ; **SF** = signal faible (source secondaire, auto-déclarée ou non revue par des pairs).

### 2.1. Fréquence de publication des vrais pratiquants (pas des hashtags)

- **Aucune source primaire trouvée** ne mesure la part de pratiquants réguliers qui publient leurs séances, ni leur fréquence. C'est la lacune principale. Les volumes de hashtags sont volontairement exclus, car ils mesurent l'audience et la production d'une minorité, pas l'activité des pratiquants.
- Meilleure référence comparable : van Mierlo, *The 1% Rule in Four Digital Health Social Networks*, JMIR 2014;16(2):e33 — https://jmir.org/2014/2/e33. **F** : sur 63 990 acteurs, moins de 25 % ont publié quoi que ce soit. Les « superusers » produisent 74,7 % des contenus, les contributeurs 24 %, les lurkers 1,3 %. Il s'agit de communautés santé (alcool, dépression, tabac), pas de sport. **I** : il faut prévoir une très forte inégalité de contribution ; la consultation seule sera l'usage majoritaire.
- Enquêtes de partage : Fitness Show Australie, environ 320 répondants, 51 % publient leurs efforts (https://www.ausleisure.com.au/news/fitness-show-provides-a-snapshot-of-the-fitness-habits-of-australians). Sondage Perspectus EAU, 2 000 habitués de salle : 82 % filment ou photographient pour les réseaux, mais 61 % veulent interdire les selfies en salle (https://www.arabianbusiness.com/lifestyle/uae-gym-goers-want-selfie-ban-despite-personal-social-media-habits-report). **SF** : échantillons de convenance, formulations différentes, pas de fréquence. **I** : partager *sur les grands réseaux* est courant chez les habitués, mais ne prouve aucune demande d'un réseau supplémentaire dans une app de suivi.
- Volume chez Strava : 14 milliards de kudos en 2025 (+20 %), environ 1 million de clubs créés, nombre presque quadruplé (Year in Sport 2025, couverture secondaire : https://www.bikeradar.com/news/strava-year-in-sport-2025, https://athletechnews.com/running-walking-strength-training-strava-year-in-sport-report/). **F/SF** : il s'agit d'engagement en volume, sans dénominateur de publieurs. Selon le PDG (Fortune, 2025-10-13 : https://fortune.com/2025/10/13/strava-ipo-ceo-michael-martin-gen-z-running-clubs-marathons-dating-apps), la génération Z dit vouloir utiliser Strava davantage et Instagram/TikTok autant ou moins. C'est déclaratif.
- Boostcamp revendique 23 000 séances partagées en septembre 2026 (https://www.boostcamp.app/features/community). **SF** : chiffre auto-déclaré, sans base d'utilisateurs actifs.

### 2.2. Motivation, comparaison sociale, liens, rétention

- Tong & Laranjo, *npj Digital Medicine* 2018 — https://pmc.ncbi.nlm.nih.gov/articles/PMC6550193/. **F** : 19 études, dont seulement 4 ECR. La méta-analyse des 4 ECR ne trouve **pas d'effet significatif** sur l'activité physique (DMS 0,957 ; IC 95 % −1,09 à 3,00 ; I² = 99,6 %). Les fonctions sociales augmenteraient l'engagement, mais leur effet propre est impossible à isoler dans des interventions multi-composantes, et les préférences des utilisateurs sont partagées.
- Arigo, Brown, Pasko, Suls, JMIR 2020;22(3):e15642 — https://www.jmir.org/2020/3/e15642/. **F** : méta-revue de 26 revues. Les résultats des fonctions de comparaison sociale sont incohérents ; elles motivent « certaines personnes dans certaines circonstances » ; les apps ignorent les différences individuelles.
- Zhang, Brackbill, Yang, Becker, Herbert, Centola, *Prev Med Rep* 2016;4:453-458 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5008041/. **F** : ECR, n = 790 étudiants, réseaux de 6 personnes. Fréquentation moyenne : comparaison 35,7, combiné 38,5, contrôle 20,3, **soutien seul 16,8** (sous le contrôle).
- Patel et al., *JAMA Internal Medicine* 2019 (STEP UP), communiqué Penn Medicine — https://pennmedicine.org/news/news-releases/2019/september/using-a-wearable-device-to-exercise-more-add-competition-to-improve-your-results. **F** : 602 adultes en surpoids. La compétition (classement hebdomadaire) donne +920 pas/jour contre le contrôle, et c'est le seul bras qui reste supérieur après l'arrêt du jeu. Le soutien (un parrain informé) et la collaboration sont plus faibles. L'abstract primaire n'a pas été ouvert ici.
- Aral & Nicolaides, *Nature Communications* 2017;8:14753 — https://mitsloan.mit.edu/press/new-study-mit-sloan-school-management-professors-shows-exercise-contagious. **F** : environ 1,1 million de coureurs ; un km de plus couru par les amis entraîne environ 0,3 km de plus le même jour. Les moins actifs influencent les plus actifs, pas l'inverse.
- Effets négatifs : Poncin, Charry, Kullak 2024 (conférence ; https://dial.uclouvain.be/pr/boreal/en/object/boreal%3A289963) : la comparaison vers le haut dans les communautés d'apps fitness réduit l'efficacité, sauf si les liens sont forts. Étude arXiv 2025 (https://arxiv.org/pdf/2508.12388) : les utilisateurs distancés évitent le classement, masquent l'app ou la quittent. **SF** : qualitatif ou non publié en revue.

**Synthèse (I)** : les effets démontrés viennent de **petits groupes structurés de personnes connues ou assignées**, avec un mécanisme de comparaison explicite et souvent des incitations. Ils ne viennent pas de flux ouverts ni de fils de discussion par exercice. Rien ne montre qu'un fil « biceps » améliore l'activité ou la rétention. Les bénéfices ne sont ni universels ni automatiquement transférables à eVe.

### 2.3. Concurrence (fonctions datées)

| Produit | Fonctions sociales constatées | Date / nature de la source |
| --- | --- | --- |
| Strava | Flux, kudos, clubs ; messagerie 1:1 et de groupe réservée aux abonnés réciproques, désactivable (déc. 2023 : https://www.techradar.com/computing/software/strava-gets-a-handy-direct-messaging-feature-to-make-organizing-rides-easier) ; masquage du départ, de l'arrivée ou de la carte entière (2021 : https://road.cc/content/tech-news/strava-adds-privacy-features-hiding-data-285549) | presse spécialisée ; non vérifié dans l'app en 2026 |
| Hevy | Flux des abonnements, likes, commentaires et réponses, Discover des séances populaires, suggestions masquables, « enregistrer comme routine », export vers Strava (https://help.hevyapp.com/hc/en-us/articles/35688036014231, https://www.hevyapp.com/features/social-features/) | aide officielle, non datée |
| JEFIT | Amis, partage de logs, comparaison à la communauté, routines communautaires, revendique plus de 10 M d'utilisateurs (https://apps.apple.com/au/app/jefit-strength-training-guide/id449810000) | fiche App Store, auto-déclaratif |
| Boostcamp | « Community » : abonnements, réactions, commentaires, profils privés, visibilité par séance (Tout le monde / Abonnés / Moi seul), cartes de partage, programmes publiés ; se présente lui-même comme « pas centré » sur le flux face à Hevy (https://www.boostcamp.app/features/community, https://www.boostcamp.app/vs/hevy) | site éditeur, 2026 |
| TikTok / Instagram / groupes privés | Audience et démonstrations ; qualité très variable (voir 2.4). Les groupes WhatsApp ou Messenger de salle ou de club occupent déjà l'échange entre proches | I |

**I** : la concurrence couvre déjà le flux suivi/likes/commentaires (Hevy, Boostcamp) et l'échange de groupe (Strava, messageries). Une différenciation crédible d'eVe ne passe pas par le flux. Elle passerait par le **contexte** : conseil attaché à l'exercice et à son niveau, assistant vocal, programme et suivi local sans publication.

### 2.4. Risques

- **Image corporelle** : revue systématique Jerónimo & Carraça 2022 (20 études), https://research.ulusofona.pt/pt/publications/effects-of-fitspiration-content-on-body-image-a-systematic-review-2/. **F** : l'exposition à la « fitspiration » aggrave l'insatisfaction corporelle et la comparaison d'apparence, surtout chez les plus jeunes. Le rapport Strava 2025 indique que 61 % des Gen Z qui soulèvent le font pour l'esthétique (**SF**, presse).
- **Conseil dangereux populaire** : revue 2025 sur la désinformation en activité physique, JMIR Infodemiology (https://infodemiology.jmir.org/2025/1/e62760) : **F** information de faible qualité répandue. Étude Cureus 2024 sur 187 vidéos TikTok d'exercices du genou (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11055612/) : **F** la popularité est inversement corrélée à la qualité. Cela confirme directement « popularité ≠ qualité » (§1.15).
- **Localisation** : Dhondt et al., ACM CCS 2022 (https://lepoch.at/publication/epz-inference-attacks) : **F** sur 1,4 M d'activités Strava, la zone de confidentialité est retrouvée jusqu'à 85 % des cas. « StravaLeaks », Le Monde, oct. 2024 (relais : https://www.computing.co.uk/news/2024/security/world-leaders-locations-exposed-strava) : les déplacements de chefs d'État ont été révélés par les profils de leurs gardes du corps. **I** : il ne faut **jamais** joindre de trace GPS, de nom de salle ni d'horaire récurrent à une contribution sportive.
- **Harcèlement et tiers filmés** : pas d'étude revue par des pairs trouvée. Un rapport Mindbody cité par Newsweek indique que 57 % des femmes se sont senties « regardées de façon inappropriée » à l'entraînement (https://newsweek.com/safe-gymgoer-issues-warning-man-took-photos-1691563) : **SF**. **I** : une photo ou vidéo de salle peut montrer des tiers sans leur consentement (droit à l'image).
- **Mineurs** : aucune source datée trouvée sur les protections des concurrents pour les mineurs. Âge du consentement numérique (RGPD art. 8, 13 à 16 ans selon l'État) : **I à faire vérifier par un juriste**.
- **Obligations d'hébergeur** : DSA, art. 16 (mécanisme de notification et d'action) et art. 17 (motivation des décisions) pour tout hébergeur de contenus d'utilisateurs (https://www.crowell.com/en/insights/client-alerts/notice-and-action-mechanisms-in-the-dsa-balancing-the-removal-of-illegal-content-and-the-freedom-of-expression). **I, à confirmer par un professionnel** : l'exemption des micro et petites entreprises (art. 19) ne couvrirait pas ces deux articles. Dès qu'un contenu est public entre inconnus, un signalement est donc obligatoire.

---

## 3. Challenge et dix objections (SOC-04)

1. **Utilité propre face aux plateformes et groupes existants.** Hevy et Boostcamp offrent déjà flux, likes et commentaires ; WhatsApp et Strava offrent l'échange de groupe. *Réponse possible* : seul le contexte de la carte d'exercice est propre à eVe. *Motif de rejet* : si les utilisateurs Sport partagent déjà ailleurs et ne consultent pas de contributions dans la carte (consultation < 10 % des ouvertures de carte sur 8 semaines, seuil à valider).
2. **Démarrage à froid et centaines d'espaces vides.** Le catalogue compte 17 exercices et 3 zones, soit 20 cibles (`training_catalog.js:128`). Avec la règle des 1 %, 20 fils supposent des centaines de contributeurs actifs par semaine avant qu'un fil ne paraisse vivant. *Motif de rejet* : moins d'environ 30 contributeurs hebdomadaires sur le fil le plus actif après le pilote.
3. **Granularité et fragmentation.** Muscle, exercice, séance, programme, objectif : le modèle ne connaît ni les muscles ni les variantes comme objets (`variant` n'est qu'un champ de niveau, `training_catalog.js:13-19`). Discuter par muscle créerait des doublons. *Proposition* : une seule clé, la cible du catalogue (`TRAINING_TARGETS`), plus un tag facultatif ; aucun espace par séance ni par objectif.
4. **Motivation sans course aux likes.** Les ECR favorisent la *comparaison entre proches* (Zhang 2016, Patel 2019), pas les likes. La comparaison vers le haut fait décrocher une partie des utilisateurs (Poncin 2024). *Garde-fou* : pas de compteur public sur la personne ni de classement ouvert ; une comparaison éventuelle seulement entre personnes choisies, et désactivable.
5. **Conseil dangereux populaire.** La popularité est inversement corrélée à la qualité (Cureus 2024). « Plus appréciés » ne doit jamais se lire comme « recommandé » ; un conseil santé (douleur, blessure, grossesse, pathologie) renvoie vers un professionnel. *Motif de rejet* : impossibilité d'assurer la modération et le signalement prévus (objection 7).
6. **Confidentialité** des performances, photos, vidéos, programme et salle. Le défaut doit être *privé*. La santé est déjà filtrée côté runtime : la fréquence cardiaque ne part que vers l'utilisateur qui agit dans l'app (`training_runtime.js:29,244`, `healthAllowed`). Les inférences de localisation (Dhondt 2022) interdisent toute trace GPS ou nom de salle.
7. **Modération** : spam, abus, contenus corporels, santé, droit à l'image, mineurs, suppression. L'existant offre le blocage réciproque et la modération par l'hôte d'une communauté (refuser, bannir, retirer), mais **aucun signalement** (§4). Un espace public sans signalement est irrecevable (DSA art. 16, à confirmer juridiquement).
8. **Aide réelle ou distraction pendant la séance.** La séance est minutée et vocale. Un fil ouvert pendant les repos casse le rythme. *Proposition* : rien de social pendant une séance active, sauf consultation explicite demandée.
9. **Différenciation, adoption, rétention et coûts** : stockage et trafic vidéo, transcodage, modération humaine, conformité. Aucune base installée de pratiquants eVe n'est connue de cette étude. La rétention attribuable au social n'est pas démontrée (Tong & Laranjo 2018).
10. **Métriques permettant aussi de rejeter l'idée.** Elles sont définies au §5.5. Le mécanisme de mesure d'usage d'eVe n'a pas été audité ici : il faudra une mesure agrégée et consentie, sans donnée santé (point ouvert).

---

## 4. Audit vérifiable des outils, chemins, accès et capacités (SOC-06)

Statuts : *Available and compatible* / *Existing but unsuitable* / *Unavailable* / *Not found after investigation* / *Not verifiable because access is missing*.

| Brique | Statut | Preuves (fichier:ligne) |
| --- | --- | --- |
| Catalogue d'exercices (17), niveaux, zones, cibles | Available and compatible | `atome/src/shared/training_catalog.js:24-60` (exercices), `:69` (objectifs), `:128` (`TRAINING_TARGETS` = exercices + `zone:*`) |
| Contrat Sport unique (UI, assistant, MCP) | Available and compatible | `atome/src/squirrel/training/contracts.js:4-5`, `TRAINING_COMMANDS` `:59-65`, capacités `training.read`/`training.write` `:60` |
| « Mon programme » (lecture, ajout, réordonnancement, exécution) | Available and compatible | commandes `read_program`, `add_to_program`, `set_program`, `open_program` (`contracts.js:52-56`) ; carte `eVe/domains/dashboard/dashboard_training_program.js:1-6` ; propriétaire `eVe/intuition/tools/training_lists_preference.js:1-12` (préférence de profil qui suit le compte) |
| Activités / profils par exercice | Available and compatible | `eVe/domains/training/training_runtime.js:36-56` (`program_activity:training:<acteur>:<exercice>`, `activity_read`) |
| Séances (événements rejoués, révision, idempotence) | Available and compatible | `session_transition` (`contracts.js:43-48`), `program_session:training:` (`training_runtime.js:21`) |
| Note de séance individuelle | Existing but unsuitable | le modèle accepte `note` ≤ 4000 car. (`eVe/domains/programs/program_session_model.js:51,118`), mais la carte envoie toujours `note: ''` (`eVe/domains/dashboard/dashboard_training_session.js:190,195`) : aucune saisie exposée |
| Journal / semaine | Available and compatible | `dashboard_training_journal.js:1-4`, `read_log` (`contracts.js:57`) |
| Filtrage santé vers l'extérieur | Available and compatible | `healthAllowed(source)` (`training_runtime.js:29`) ; « energy is an estimate » (`contracts.js:57`) ; refus `health_access_denied_for_actor` (`training_runtime.js:244`) |
| Fil News (projet tagué, contributions groupées) | Existing but unsuitable | `eVe/domains/news/news_thread_runtime.js:1-19` : arbre titre/corps par contribution, **sans réponse liée à une contribution** ; payload texte seul, médias par `atomeIds` (`news_publication_payload.js:1-11`) |
| Réponses à un message (`reply_to`) | Not found after investigation | recherche `reply_to|in_reply|replyTo|replies` sur `eVe`, `atome/src`, `server` : aucun modèle de réponse dans News ou les communautés |
| Like | Existing but unsuitable | `server/news_broadcast.js:195-202` : « the author alone learns it (no public count) » ; seule une notification `news-like` est envoyée à l'auteur ; pas d'annulation ni de compteur stocké ; état « aimé » client en mémoire seulement (`eVe/domains/dashboard/dashboard_news_publication.js:146,157-158`) |
| Tri « Plus appréciés » | Not found after investigation | seul tri existant : chronologique décroissant `server/communities.js:143` |
| Relayer (repost, avec origine) | Available and compatible | `server/news_broadcast.js:203-221` (`reposted_from` garde l'auteur d'origine ; un post de communauté y reste) |
| Communautés (adhésion, hôte, refuser/bannir/retirer) | Available and compatible | `atome/src/shared/community_contract.js:1-27` (`sleep_circle` seul) ; `server/communities.js:83-127` ; client `eVe/domains/community/sleep_circle.js:1-9` (invité : records locaux) |
| Blocage réciproque | Available and compatible | `server/news_broadcast.js:167,188,257`, `server/communities.js:140` |
| Signalement de contenu | Not found after investigation | recherche `report|signal|abuse|flag` dans News, communautés et social : aucun mécanisme |
| Suppression d'un post | Existing but unsuitable | communauté : `DELETE FROM news_publications` (auteur ou hôte, `server/communities.js:118-126`), une table serveur de diffusion hors pipeline de commit ; pas de suppression générale de publication News trouvée. Conformité au modèle « historique append-only » à vérifier avec le module 06 |
| Notifications (boîte Communication) | Available and compatible | genres `publication`, `news-like`, … (`eVe/intuition/tools/communication_inbox_model.js:11,58-61`) |
| Partage ciblé à des personnes choisies | Available and compatible | sélecteur de personnes + envoi (`dashboard_news_publication.js:170-173`, `dashboard_people_picker.js`) |
| Recherche (tags News) | Existing but unsuitable | `searchTags` par tag (`news_publish_api.js:191`, `news_broadcast.js:229-236`) ; pas de recherche dans les contributions |
| Publication vers réseaux tiers | Available and compatible (hors périmètre sportif) | `atome/src/squirrel/social/capabilities.js:1-13` (TikTok, Instagram pro, Pages Facebook ; résultats par destination) |
| VideoTrain (fil vidéo) | Not found after investigation | seules occurrences : `eVe/concept/eVe.html:702,854` (concept) ; aucun code dans `eVe`, `atome/src`, `server` |
| Switch « Origine / Mieux noté » (VID-02) | Not found after investigation | aucune occurrence `best_rated|mieux not|bestRated` hors todo et concept |
| Vues Naturel / Liste / Tableau / Mix / Timeline | Available and compatible | `eVe/domains/rendering/project_view_surface_runtime.js:41` ; News en `view_mode:'list'` (`news_model.js:34`) ; « Matrice » n'est pas un mode de vue |
| « Matrix » | Existing but unsuitable (comme réseau social) | `eVe/domains/matrix/matrix_module_model.js:1-12` : module de mise en page qui affiche des collections (dont News) ; aucun protocole Matrix (recherche `matrix-js-sdk|synapse|m.room` : rien) |
| mediasoup | Available and compatible pour appel live ; Existing but unsuitable pour fils asynchrones | SFU `server/visio.js:1,43-58` ; client `eVe/domains/visio/visio_call_runtime.js:3,12` ; aucun stockage ni lecture de vidéos publiées |
| Comportement Web / iPad / iPhone / macOS | Not verifiable because access is missing | étude en lecture seule sans exécution sur les appareils ; aucune affirmation de plateforme ici |
| Universal Adapter | Not verifiable because access is missing | hors périmètre SOC ; à auditer dans L18 |

**Contradiction relevée (arbitrage nécessaire)** : le code fixe volontairement « like = notification privée à l'auteur, sans compteur public » (`server/news_broadcast.js:195`). SOC-03 demande un tri par nombre de likes, donc un compteur au moins visible dans la discussion. Ces deux choix produit s'opposent. Cette étude ne tranche pas.

---

## 5. Options A/B/C comparées et recommandation

### 5.1. Option A — social minimal attaché aux exercices et séances

Une discussion par cible du catalogue (exercice ou zone), ouverte depuis la carte d'exercice. Contributions texte, photo ou vidéo, réponses, like et annulation, tri Chronologique / Plus appréciés, publication facultative d'un résultat de séance.

- **Bénéfices** : contexte propre à eVe ; consultation utile avant la pratique ; réemploi de l'infrastructure communauté/News (adhésion, hôte, blocage, relais, notifications).
- **Limites** : 20 espaces vides au départ ; pas de réponse, de compteur, de signalement ni de recherche dans le contenu (§4) ; médias attachés par `atomeIds` seulement.
- **Coûts** : *développement* moyen. Il faut ajouter des réponses, un like stocké et réversible avec compteur, le tri, le signalement et le traitement des notifications, l'entrée depuis la carte d'exercice, la saisie de la note et le partage d'un résumé de séance sans santé. *Exploitation* : modération continue (hôte et signalements), stockage et transcodage vidéo, conformité DSA et RGPD.
- **Risques** : conseil dangereux mis en avant par les likes, image corporelle, tiers filmés, mineurs, spam.
- **Dépendances** : décision sur le compteur de likes ; design validé (§5 du fichier source) ; avis juridique sur le signalement et les mineurs ; VideoTrain inexistant pour VID-02.
- **Valeur pour un utilisateur avec peu d'amis** : réelle *si* les fils sont peuplés par d'autres, nulle sinon. Le démarrage à froid frappe d'abord cet utilisateur.

### 5.2. Option B — communauté plus développée mais contextualisée

Profils publics, abonnements, flux des séances (type Hevy), découverte, défis et classements, clubs, VideoTrain complet.

- **Bénéfices** : alignement avec les attentes du marché (Hevy, Boostcamp) ; la compétition structurée a des preuves ECR (Patel 2019).
- **Limites** : reconstruit ce que la concurrence fait déjà ; en contradiction directe avec « pas de clone de flux social » (§1.15) et avec le Zen UI.
- **Coûts** : *développement* élevé (graphe social, flux, découverte, classements, VideoTrain, recherche). *Exploitation* élevée (modération à l'échelle, vidéo, abus, anti-spam).
- **Risques** : tous ceux de A, amplifiés ; comparaison vers le haut et décrochage (Poncin 2024) ; exposition de profils et de localisation.
- **Dépendances** : A complet, VideoTrain, L18, design, juridique.
- **Valeur pour un utilisateur avec peu d'amis** : passe par la découverte d'inconnus, donc par plus de risque. Faible tant que la base est petite.

### 5.3. Option C — pas de réseau social maintenant : échanges, conseils et partage ciblé

- Partager **un résumé** d'exercice, de séance ou de programme avec des personnes choisies, par le partage et la messagerie Communication existants.
- Poser une question à un contact ou à un coach identifié ; appel visio avec le coach (mediasoup existant).
- Saisir une **note de séance** privée, déjà prévue par le modèle.
- En option à tester : un *défi privé entre contacts choisis* (comparaison hebdomadaire de régularité, pas de charges). C'est le seul mécanisme social appuyé par des ECR.

Pas d'espace public ni de like public.

- **Bénéfices** : utile sans aucun réseau ; réemploi presque total (sélecteur de personnes, Communication, visio, contrat Sport) ; risques publics quasi nuls (pas d'hébergement public entre inconnus) ; respecte SOC-01 (« le suivi reste utile sans jamais publier »).
- **Limites** : pas de savoir collectif d'inconnus ; pas de « Plus appréciés » ni de VideoTrain ; peu d'effet réseau.
- **Coûts** : *développement* faible. Résumé partageable sans santé, saisie de note, éventuel défi privé. *Exploitation* faible (messages privés existants, blocage existant).
- **Risques** : un résumé partagé avec trop d'éléments (cœur, énergie, horaires réguliers) : il faut une liste blanche de champs ; pression entre proches dans un défi : désactivable, pas de charges comparées.
- **Dépendances** : design validé du point d'entrée ; décision sur les champs partageables.
- **Valeur pour un utilisateur avec peu d'amis** : modérée. La note privée et le coach restent utiles, mais un défi suppose au moins un proche. L'assistant et le catalogue sourcé restent la principale aide.

### 5.4. Recommandation

**Recommandation : C maintenant, avec une porte de passage mesurée vers A ; B rejetée pour la période étudiée.** Motifs :

1. Les preuves ne soutiennent pas qu'un espace de discussion par exercice améliore l'activité ou la rétention (Tong & Laranjo 2018 ; Arigo 2020). Ce qui est démontré, la comparaison en petit groupe connu, tient dans C.
2. Le démarrage à froid (20 cibles, règle des 1 %) rendrait A vide pour la majorité, surtout pour les utilisateurs avec peu d'amis.
3. Il manque à l'existant les briques indispensables d'un espace public : signalement, réponses, compteur de likes, VideoTrain. Les ajouter est autorisé en réalisation, mais seulement si l'usage le justifie.
4. Les risques (conseil populaire dangereux, image corporelle, localisation, tiers filmés, mineurs) sont faibles dans C et élevés dans A et B.

**Motifs pour lesquels cette recommandation pourrait être rejetée** : (a) l'utilisateur considère le savoir collectif par exercice comme différenciant et accepte la modération ; (b) une base d'utilisateurs Sport suffisante existe déjà (donnée inconnue ici) ; (c) l'arbitrage « compteur de likes public » est tranché favorablement, avec un engagement de modération.

### 5.5. Métriques, seuils et critères de rejet (proposés, à valider)

Mesures agrégées et consenties, **sans aucune donnée santé ni localisation** ; le mécanisme de mesure reste à identifier.

| Métrique (pilote C, 8 semaines) | Seuil de passage vers A | Critère de rejet |
| --- | --- | --- |
| Part des utilisateurs Sport actifs ayant partagé ou posé ≥ 1 question | ≥ 15 % | < 5 % : rejet de A, C conservé ou réduit |
| Part des partages ou questions obtenant une réponse en 48 h | ≥ 50 % | < 20 % |
| Notes de séance saisies / séances terminées | indicateur d'intérêt réflexif | — |
| Défi privé : régularité hebdomadaire des participants vs leur propre période précédente | hausse soutenue après 4 semaines | décrochage ou désactivation > 50 % |
| Signalements, blocages ou retraits pour 1 000 messages | stable et faible | hausse continue |
| Rétention Sport à J30 (partageurs vs autres) | à lire avec prudence, c'est **corrélationnel** | aucune différence ou différence négative |

Pour A (si ouverte) : au moins environ 30 contributeurs hebdomadaires sur le fil le plus actif, un temps de première réponse médian < 24 h, et une modération traitée selon les délais fixés juridiquement. Sinon, fermeture ou retour à C.

---

## 6. Spécification de la solution proposée (C), puis de A conditionnelle

### 6.1. Décisions confirmées vs arbitrages ouverts

**Confirmé par le cahier** : le social enrichit le suivi sans le remplacer ; publication facultative et consentie ; deux mécanismes distincts (tri d'une discussion ≠ Origine/Mieux noté d'un fil VideoTrain) ; la popularité n'est ni qualité ni sécurité ; pas de clone de flux ; pas d'exposition automatique de santé ni de localisation ; « partout par défaut » non validé.

**Arbitrages à obtenir** : (1) choix A/B/C ; (2) compteur de likes public (contradiction §4) ; (3) sens chronologique d'une discussion : ancien → récent, plus lisible pour un fil, alors que le fil de communauté est actuellement récent → ancien (`communities.js:143`) ; (4) champs d'un résumé partageable ; (5) présence du défi privé ; (6) identité du coach (vérifiée ou non) ; (7) âge minimal (juriste).

### 6.2. C — fonctionnel

- **Points d'entrée** : sur la carte d'exercice et sur le résumé de fin de séance, le partage passe par l'outil de partage existant. Aucun nouveau bouton sans design validé (Zen ; validation panneau par panneau). Commande vocale : « partage ma séance de biceps avec Paul ».
- **Contenu d'un résumé** : exercice, niveau, séries × répétitions × charge, date au jour près, note si l'utilisateur la joint. **Exclus par construction** : fréquence cardiaque, énergie, poids corporel, heure exacte, lieu.
- **Note de séance** : saisie facultative à la fin, privée, réutilisant le champ `note` du contrat.
- **États vides** : sans contact, le sélecteur de personnes affiche son état vide existant ; aucun texte d'incitation à se faire des amis.
- **Médias** : photo ou vidéo jointes seulement par sélection explicite (panneau Média). Pas de captation automatique pendant la séance.
- **Modération** : messages privés, blocage existant ; pas d'hébergement public.
- **Hors ligne** : le partage suit le mécanisme existant de la Communication (à vérifier, non audité ici).

### 6.3. C — technique (propriétaires à réemployer ou étendre)

- Ajout au contrat Sport d'**une** commande `training.share_summary` (lecture seule, sans écriture) qui produit le résumé en liste blanche à partir de `read_log` / `get_session`. Le partage lui-même passe par le chemin Communication existant, pas par une seconde voie.
- Saisie de la note : le contrat `session_transition finish` porte déjà `note` ; seule l'UI de la carte de séance est à étendre.
- Défi privé (si retenu) : une préférence partagée entre personnes consentantes, qui compare uniquement le nombre de séances par semaine ; propriétaire à déterminer après audit (aucun existant trouvé).

### 6.4. A — si choisie plus tard (spécification d'orientation)

- **Discussion** = une communauté `sport` dans `COMMUNITIES` (`community_contract.js`), filtrée par `exercise_id` ∈ `TRAINING_TARGETS` sur chaque contribution. Cela évite 20 communautés : un seul hôte, une seule modération.
- **Extensions nécessaires** : `reply_to` (référence à la contribution racine, jamais de copie) ; like persistant, réversible et idempotent, avec compteur (après l'arbitrage 2) ; tri dans `feed()` (chronologique explicite, ou par likes décroissants avec égalités départagées par date et les messages sans vote après, en ordre chronologique) ; signalement → file de l'hôte avec motif et décision motivée ; suppression par l'auteur ou l'hôte sans réécrire l'historique Atome (à valider avec le module 06).
- **Le tri** ne modifie jamais la source ni les réponses. La meilleure contribution est mise en évidence **sans** libellé « recommandé ».
- **VID-02** : dépend de VideoTrain (inexistant). « Origine / Mieux noté » sélectionnera deux références *du même fil*, en réemployant le même compteur de likes, sans second fil ni second switch de tri.
- **Santé** : tout message mentionnant douleur, blessure ou pathologie doit pouvoir renvoyer vers un professionnel. Pas de détection automatique promise.

### 6.5. Hypothèses à tester

H1 : des utilisateurs Sport partagent un résumé ciblé au moins une fois par mois. H2 : la note privée est utilisée. H3 : un défi privé améliore la régularité sans décrochage massif. H4 (A seulement) : un fil d'exercice reçoit une réponse en moins de 24 h.

---

## 7. Plan d'intégration et de tests

**L'implémentation n'est pas commencée et attend le choix explicite de l'utilisateur (A, B ou C, ou variante) et les arbitrages du §6.1.** Le design de tout nouveau point d'entrée sera présenté et validé avant le code. Aucun Git push ni aucune action externe ne découle de ce rapport.

### 7.1. Si C est choisi

1. Design du point de partage et de la saisie de note (maquette aux vrais jetons, en PNG), puis validation.
2. Contrat : `training.share_summary` dans `atome/src/squirrel/training/contracts.js` et son exécuteur dans `eVe/domains/training/training_runtime.js` (fichier de 321 lignes, à ne pas faire grossir au-delà ; extraire si nécessaire).
3. UI : `eVe/domains/dashboard/dashboard_training_session.js` (note), carte d'exercice (`dashboard_training_card.js`), réemploi de `dashboard_people_picker.js` et du chemin d'envoi Communication.
4. Défi privé : seulement s'il est retenu, après audit d'un propriétaire existant.
5. Mise à jour des cartes (`maps/API_MAP.md`, `CODEMAP`) et de FRAMEWORK_STATE si des faits vérifiés nouveaux apparaissent.

### 7.2. Si A est choisi (en plus de C, après la porte de passage)

Extensions de `community_contract.js`, `server/communities.js` et `server/news_broadcast.js` (réponse, like stocké, compteur, tri, signalement), entrée depuis la carte d'exercice, puis seulement ensuite VideoTrain (L18) pour VID-02.

### 7.3. Tests (scénarios du §6 « Social sportif » applicables)

| Scénario | C | A |
| --- | --- | --- |
| Utilisateur sans réseau social / peu d'amis : Sport, programme et journal entièrement utilisables | oui | oui |
| Résumé partagé : liste blanche vérifiée, aucune santé ni localisation, y compris dans la charge envoyée | oui | oui |
| Note de séance : saisie, rejeu, sync multi-appareils, reste privée | oui | oui |
| Nouvelle discussion, texte/photo/vidéo, réponses | — | oui |
| Like, annulation, idempotence (double toucher, deux appareils) | — | oui |
| Ordre chronologique ; likes, égalités, aucun vote ; nouveau message sans vote ; mise à jour du mieux noté | — | oui |
| Source et réponses préservées après tri ; VideoTrain un seul fil | — | oui (VideoTrain après L18) |
| Droits privé/public, suppression par l'auteur et l'hôte, signalement traité, blocage | blocage | oui |
| État vide, réseau indisponible, reprise selon le mécanisme existant | oui | oui |
| Entrées depuis activité, séance et « Mon programme » sans changer la navigation | oui | oui |
| Performance (ticks Bevy, pas rAF), accessibilité, non-régression des séances (minuterie, voix, Santé) | oui | oui |
| Plateformes : Web, iPad réel, iPhone, macOS (Tauri) | oui | oui |

Validation : sondes ciblées sous `temp/` qui passent par le vrai contrat `training.*` et le vrai `/ws/api` ; vérification graphique Playwright selon `atome/documentations/how_debug_UI.md` (clics réels sur le canevas, jamais le volet navigateur intégré) ; iPad réel pour le tactile. Non-régression explicite : séance minutée, `schedule_week`, enregistrement Santé (`health_workout`), Cercle Sommeil (même mécanisme de communauté), News et relais.

### 7.4. Limites de cette étude

Aucune exécution ni mesure d'usage d'eVe. La base d'utilisateurs Sport est inconnue. Aucune source primaire sur la fréquence de publication des pratiquants n'a été trouvée. L'abstract de STEP UP et le rapport Strava ont été lus via des sources secondaires. Les points juridiques (DSA, mineurs, droit à l'image) exigent un professionnel compétent. Le comportement par plateforme et l'Universal Adapter n'ont pas été vérifiés.

**Plus petite prochaine action fondée sur les preuves** : obtenir le choix A/B/C et l'arbitrage sur le compteur de likes.
