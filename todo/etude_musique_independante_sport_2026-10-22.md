# Étude critique — écosystème musical indépendant et musique sportive adaptative (lots L22/L23)

Date : 2026-10-22. Nature : **étude seule** (MUS-01). Aucun code, fichier applicatif, maquette, dépense, contact ou négociation. Sources externes consultées le 2026-10-22 (liste numérotée [S#] en fin de §3).

Légende : **[F]** fait sourcé · **[O]** observé dans le code (fichier:ligne) · **[E]** estimation calculée par l'étude · **[H]** hypothèse non vérifiée · **[J]** confirmation juridique, fiscale ou commerciale manquante (professionnel requis).

---

## 1. Synthèse exécutive

**Verdict : ne pas construire maintenant un réseau public de diffusion musicale (architectures 1 à 3).** Construire d'abord, sous condition de validation, une **capacité locale Sport + musique sur fichiers que l'utilisateur détient légalement**, ce qui n'exige aucune licence de diffusion publique.

**Réalisable (données vérifiées)**
- Lecture locale de fichiers natifs. Le moteur unique décode déjà mp3, ogg, flac, aac et mp4 [O]. La mesure de fréquence cardiaque pendant une séance existe sur iOS 26+ [O].
- Sélection hors ligne au tempo pertinent, avec un index BPM local calculé sur l'appareil. Cette analyse n'existe pas encore [O] ; l'état de l'art donne environ 80 % de tempos justes à ±4 % et environ 91 à 96 % quand on tolère les erreurs d'octave [F, S32]. Une correction par l'utilisateur reste donc nécessaire.
- Le stockage d'un catalogue de 100 titres coûte environ **0,05 à 0,15 $/mois** [E, S24-S27]. L'offre atome existante inclut déjà **50 GiB pour 12 €** (`atome/src/shared/billing_contract.js:15`) [O].

**Préférable** : en premier, « eVe = meilleur lecteur Sport pour la musique qu'on possède » (fichiers achetés sur Bandcamp ou Ampwall, enregistrements personnels, médias CC0 de la Médiathèque). En second, les intégrations Apple Music limitées au pilotage du lecteur officiel, sans BPM et sans accès aux fichiers. Pour les artistes : un stockage **privé, pour leur propre usage**. La directive 2019/790 exclut explicitement ce cas des « fournisseurs de partage de contenus » [F, S21].

**Difficile**
- Diffusion publique interactive : licences séparées pour l'enregistrement (master) et pour la composition. Sacem, SCPP et SPPF entrent en jeu, ainsi que l'art. 17 [F/J].
- Ventes « 0 % » : sur une vente de 1 €, Stripe prend à lui seul 26,5 %, contre environ 19 à 21 % chez Bandcamp [E, S13, S28].
- Acquisition des deux côtés (artistes et auditeurs) face à Bandcamp, Ampwall, SoundCloud et Audius.

**À abandonner ou geler**
- BPM venant de Spotify : `audio-features` est fermé aux nouvelles apps depuis le 2024-11-27 [F, S1].
- Toute idée d'accès hors ligne aux caches protégés Apple, Spotify ou Deezer [F, S4, S6, S12].
- Le forfait « 12 € / ~100 titres » : il fait doublon avec l'offre existante et ne repose sur aucun coût réel.
- Les majors, tant qu'aucune traction n'est prouvée.

**Alerte hors périmètre, mais bloquante pour un usage commercial** : les intégrations déjà présentes dans eVe sont probablement non conformes en l'état.
- Deezer : les conditions de l'API sont **non commerciales** [F, S12].
- Spotify : le mode Développement est limité à 5 utilisateurs et réservé à un usage non commercial [F, S3].
- Apple : 4.5.2(i) interdit de « monétiser indirectement » l'accès à Apple Music [F, S5].

Une revue juridique est recommandée avant toute exposition publique [J].

**Décision demandée** : valider l'étape juridique du §10 (avocat PI musique) et la sonde technique locale (100 fichiers natifs, mode avion, capteur réel). Ensuite seulement, rouvrir la question d'un réseau d'artistes.

---

## 2. Inventaire atome/eVe (observé dans le code, en lecture seule)

| Brique | Preuve | Statut |
| --- | --- | --- |
| Moteur audio unique (Kira, décodage Symphonia) | `platforms/web/audio-wasm/Cargo.toml:30-32` (wav, mp3, ogg, vorbis, flac, aac, isomp4) ; `platforms/desktop-tauri/Cargo.toml:87,90` ; `atome/engines/audio-engine/Cargo.toml:12,19` ; `PlayRecordCore` `atome/src/application/audio_runtime/play_record_core.js:51`, `loadAsset` l.206 | **Disponible et compatible** pour lire des fichiers natifs |
| Lecteur de fichiers locaux avec file d'attente/playlist/enchaînement | Aucun propriétaire trouvé (Molécule = timeline et clips : `eVe/core/media_engine/molecule_cell_player.js:14`) | **Non trouvé après recherche** |
| Tempo dans eVe | Tempo de projet saisi : `eVe/intuition/tools/molecule/runtime_record_scheduler.js:10-11`, métronome `runtime_metronome.js:25-32` | **Existant mais inadapté** (tempo de projet, pas d'analyse de morceau) |
| Analyse BPM, lecture des tags (TBPM/ID3), ISRC | Aucune occurrence applicative (grep `bpm`, `TBPM`, `id3`, `isrc`) | **Indisponible** |
| Apple Music (iOS) | Contrat `atome/src/squirrel/apple_music/contracts.js:13-38` (search, list_playlists, play, next…) ; runtime `eVe/domains/apple_music/apple_music_runtime.js:9` ; `SystemMusicPlayer` `platforms/ios/atome-auv3/application/AppleMusicPlayback.swift:11` | **Disponible**, pilotage du lecteur Apple seulement ; aucun accès à l'audio ni au BPM |
| Spotify | Session OAuth et scopes `server/music/spotify_session.js:15-16` ; API `server/music/spotify_operations.js:14-93` ; Connect, Premium (`atome/src/squirrel/music/contracts.js:36`) | **Existant mais inadapté** à un usage commercial et au Sport (voir §8) |
| Deezer | Recherche du catalogue public seulement `server/music/deezer_catalog.js:14-35` | **Existant mais inadapté** (conditions non commerciales [S12]) |
| Médiathèque en ligne (CC0 / domaine public) | `server/ws_media_library.js:1-10` (Openverse, NASA, Internet Archive) | **Disponible** comme source de sons libres, pas de catalogue musical |
| Import et stockage des médias | `eVe/domains/media/asset_box_upload_transport.js` ; coffres `server/userVaultRouter.js` | **Disponible** (stockage privé) |
| Quota de stockage appliqué à l'envoi | `storageBytes` exposé `server/billing/billing_ledger.js:81` ; aucune application trouvée | **Non trouvé après recherche** |
| Diffusion publique, lien d'écoute public, CDN | Aucun propriétaire | **Indisponible** |
| Synchronisation, file hors ligne | `SyncEngine` `atome/src/squirrel/apis/unified/sync_engine.js:63` ; pipeline `eVe/core/atome_commit.js` | **Disponible et compatible** (resynchronisation des écoutes) |
| Recherche et filtres d'Atomes | `atome/src/squirrel/conditions/engine.js:162-170`, listes dynamiques `conditions/lists.js:112,133` | **Disponible**, réutilisable pour un index de tempo |
| Paiement | Offre unique `billing_contract.js:15` (12 €/50 GiB, 20 €/200 GiB, 30 €/1 TiB) ; boutiques IAP `:25` ; paiement Web **simulé** `:27` ; `atome/src/squirrel/billing/store_purchase.js` | **Existant mais inadapté** à la vente de musique (pas de vendeur, pas de reversement) |
| Fréquence cardiaque en direct pendant une séance | `HKLiveWorkoutBuilder` iOS 26+ `platforms/ios/atome-auv3/Common/AppNativeHealthWorkout.swift:10-12,103,195` ; la page reçoit seulement « quel moniteur a changé » (l.11-12) ; moniteur `heart_rate` `atome/src/squirrel/health/health_catalog.js:111-114` ; observateur `AppNativeHealthController.swift:385` | **Disponible** sur iOS 26+ ; latence de lecture de la valeur **non vérifiable sans appareil** |
| Pas et cadence | `CMPedometer` en direct `health_catalog.js:101-103`, `AppNativeHealthController.swift:59` ; Android `TYPE_STEP_COUNTER` `:105-107` ; aucune cadence instantanée exposée | **Existant mais inadapté** (cumul de pas, pas de cadence) |
| Capteur Bluetooth direct (ceinture), Web Bluetooth, macOS/Web | Aucune occurrence `CoreBluetooth` ou `navigator.bluetooth` | **Indisponible** hors HealthKit |
| Séance Sport et sons | `eVe/domains/training/training_runtime.js:23` (résumé de FC), `training_sound.js` (bips via le moteur unique) | **Disponible**, point d'ancrage Sport |

---

## 3. Faits, sources, dates — établi versus supposé

**Établi [F]**
- **Spotify.** Depuis le 2024-11-27, les nouvelles apps et les apps en mode Développement n'ont plus accès à Audio Features, Audio Analysis, Recommendations, Related Artists ni aux extraits de 30 s [S1]. Le 2026-02-06, le mode Développement a été réservé à l'apprentissage et aux projets personnels non commerciaux : Premium obligatoire, 1 Client ID, 5 utilisateurs [S3]. Depuis le 2025-05-15, l'accès étendu est réservé aux apps « établies » [S2]. Le seuil de 250 000 MAU n'est cité que par des sources secondaires [H].
- **Politique Spotify** [S4] :
  - IV.2 : pas d'usage commercial des apps de streaming ;
  - III.5 : « Do not create any product or service which is integrated with streams or content from another service » ;
  - III.7 : interdiction d'enchaîner, mixer ou superposer avec un autre audio ;
  - « ne pas analyser le contenu Spotify », clause présente depuis 2021 selon un agent Spotify (source secondaire [S2]).
- **Apple, DPLA §3.3.6(D)** [S6] :
  - pas de monétisation, directe ou indirecte, de l'accès à Apple Music ;
  - ni téléchargement, ni envoi, ni modification, ni « synchronisation » du contenu MusicKit avec d'autres contenus ;
  - lecture uniquement par le rendu MusicKit ;
  - lecture lancée par l'utilisateur, avec play, pause et skip.
- **Apple, guideline 4.5.2(ii)** : MusicKit ne remplace pas les licences, par exemple pour jouer un morceau précis à un moment précis [S5].
- **Apple, données de tempo.** L'objet `Songs` d'Apple Music ne contient **aucun champ tempo** [S7]. `MPMediaItem.beatsPerMinute` correspond au champ « BPM » saisi dans iTunes [S8].
- **Deezer** : usage non commercial, privé et familial ; morceaux entiers seulement pour les comptes Premium+, sinon 30 s ; toute autre utilisation exige l'accord de Deezer [S12].
- **Bandcamp** (article du 2026-06-10) : 15 % sur le numérique, 10 % au-delà de 5 000 $ ; 10 % sur le physique ; paiement « typiquement 4–6 % » ; part pour les sociétés de gestion selon le pays de l'acheteur [S13].
- **Ampwall** (2024-09-30) : 10 $/an pour 5 h de musique, 5 % de frais de transaction, société à mission [S14].
- **Merlin** : réservé aux détenteurs de **masters** pesant moins de 5 % du marché mondial ; pas de distribution ; droits numériques libres de tiers exigés ; aucune mention de l'édition [S17].
- **Directive 2019/790.** Définition de l'OCSSP (art. 2(6)) ; obligation d'autorisation (art. 17(1)) ; responsabilité et « meilleurs efforts » (17(4)) ; régime allégé pour moins de 3 ans et moins de 10 M€, avec obligation supplémentaire au-delà de 5 M visiteurs uniques (17(6)) ; exclusion des « cloud services that allow users to upload content for their own use » [S21].
- **Infrastructure** :
  - R2 : 0,015 $/Go-mois, sortie gratuite, lectures 0,36 $/M [S24] ;
  - B2 : 6,95 $/To-mois, sortie gratuite jusqu'à 3× le volume stocké, puis 0,01 $/Go [S25] ;
  - CloudFront Europe : 0,085 $/Go sur les 10 premiers To, dégressif jusqu'à 0,02 $ (liste publiée le 2026-10-19) [S26] ;
  - S3 Paris : 0,024 $/Go-mois [S27].
- **Paiement**
  - Stripe FR : 1,5 % + 0,25 € (carte standard EEE), 20 € par litige [S28].
  - Apple : 15 % (Small Business < 1 M$), 10 % pour les abonnements au-delà d'un an [S9].
  - Google, régions EEE/UK/US depuis le 2026-06-30 : abonnements 10 % + 5 % de frais de facturation [S11].
- **Science**
  - Méta-analyse Terry et al. 2020 (139 études) : affect g = 0,48 ; performance 0,31 ; effort perçu 0,22 ; **fréquence cardiaque g = 0,07, non significatif** ; le tempo rapide module la performance [S29].
  - Préférence de tempo : elle croît avec l'intensité, avec des paliers ; plage préférée 125–140 bpm sur vélo, 123–131 sur tapis [S30].
  - Van Dyck 2015 : un décalage de tempo de ±3 % fait varier la cadence de course de 2 % au plus ; l'entraînement chute à partir de +2,5 % (16 coureurs, intensité faible à modérée) [S31].

**Supposé, non établi [H/J]** : barèmes Sacem pour le streaming interactif (non publiés dans les sources trouvées) ; conditions des majors ; prix de Feed.fm et Tuned Global (« sur devis ») ; contrôle par un tiers d'Apple Music en mode avion ; transposition française de l'art. 17 (ordonnance 2021-580, CPI L.137-1 s.), non relue sur Légifrance pendant cette étude ; ampleur de l'apport des droits des membres à la Sacem.

**Sources (consultées le 2026-10-22)**
[S1] https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api · [S2] https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access (via résumé de recherche) · [S3] https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security · [S4] https://developer.spotify.com/policy · [S5] https://developer.apple.com/app-store/review/guidelines/ · [S6] https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ (§3.3.6(D)) · [S7] https://developer.apple.com/documentation/applemusicapi/songs/attributes-data.dictionary · [S8] https://developer.apple.com/documentation/mediaplayer/mpmediaitem/beatsperminute · [S9] https://developer.apple.com/app-store/small-business-program/ · [S10] https://developer.apple.com/support/music-streaming-services-entitlement-eea/ (via résumé ; Attachment 14 depuis le 2026-10-01) · [S11] https://support.google.com/googleplay/android-developer/answer/112622 · [S12] https://developers.deezer.com/termsofuse · [S13] https://get.bandcamp.help/hc/articles/23020694353047 · [S14] https://www.berklee.edu/berklee-now/news/ampwall-launch-bandcamp-alternative (ampwall.com : HTTP 403) · [S15] https://techcrunch.com/2024/12/17/soundcloud-introduces-a-new-cheaper-paid-plan-for-artists (secondaire) · [S16] https://decrypt.co/305649 (Audius, secondaire) · [S17] https://merlinnetwork.org/merlin-membership-criteria et https://merlinnetwork.org/path-to-merlin-membership/ · [S18] https://www.feed.fm/ · [S19] https://www.tunedglobal.com/ · [S20] https://musicreports.com/ et https://musicreports.com/faq · [S21] https://eur-lex.europa.eu/eli/dir/2019/790/oj (texte lu via https://www.legislation.gov.uk/eudr/2019/790/article/2 et /article/17, EUR-Lex inaccessible à l'outil) · [S22] https://entreprendre.service-public.gouv.fr/vosdroits/F31988 (Sacem, via résumé) · [S23] https://cms.law/fr/fra/a-la-une/application-de-la-licence-legale-aux-web-radios-validation-par-le-conseil-constitutionnel (secondaire) · [S24] https://developers.cloudflare.com/r2/pricing/ · [S25] https://www.backblaze.com/cloud-storage/pricing · [S26] https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.json et https://aws.amazon.com/cloudfront/pricing/ · [S27] https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/eu-west-3/index.json · [S28] https://stripe.com/fr/pricing · [S29] https://doi.org/10.1037/bul0000216 (résumé : https://bura.brunel.ac.uk/handle/2438/19875) · [S30] https://doi.org/10.1080/02701367.2011.10599755 et https://impact.ref.ac.uk/casestudies/CaseStudy.aspx?Id=12524 · [S31] https://pmc.ncbi.nlm.nih.gov/articles/PMC4526248/ · [S32] https://arxiv.org/abs/2109.01607 et https://archives.ismir.net/ismir2017/paper/000137.pdf (chiffres Acc1/Acc2 rapportés par la recherche, PDF non relu).

---

## 4. Originalité, concurrence, attractivité, valeur et limites

| Acteur | Modèle (source) | Ce qu'il offre déjà |
| --- | --- | --- |
| Bandcamp | 15 % puis 10 %, plus 4–6 % de paiement, part sociétés de gestion [S13] | Vente, page d'artiste, fichiers achetés téléchargeables, communauté d'acheteurs |
| Ampwall | 10 $/an pour 5 h, 5 % de frais [S14] | Alternative à Bandcamp, quasi gratuite, société à mission |
| SoundCloud | Artist 39 $/an, Artist Pro 99 $/an ; part sur la distribution supprimée fin 2025 [S15, secondaire] | Audience massive, distribution vers les plateformes de streaming |
| Audius | 10 % de frais réseau sur les ventes, jetons d'artiste depuis oct. 2025 [S16, secondaire] | Streaming gratuit et catalogue décentralisé |
| Feed.fm, Tuned Global | B2B sur devis, catalogue licencié, cas fitness avec BPM (Lululemon chez Tuned Global) [S18, S19] | Musique licenciée « clé en main » pour les apps de sport |

**H12 « Garder son catalogue différencie » : réfuté.** L'artiste garde ses masters chez Bandcamp, Ampwall et SoundCloud. Ampwall coûte 10 $/an. MUS-02 le dit lui-même : la propriété des masters n'est pas une innovation. Le seul angle neuf et difficile à copier n'est pas l'hébergement. C'est **l'intégration dans un environnement créatif et sportif** : un même Atome peut être enregistré dans Molécule, joué en séance avec la FC, rangé dans le Dashboard et synchronisé hors ligne. Cette valeur profite aux **auditeurs-pratiquants** et aux **créateurs déjà dans eVe**, pas aux artistes en général.

**H1 « 0 % attire automatiquement » : réfuté.**
1. Les frais de paiement restent dus. Sur une vente de 1 € par Stripe : 0,015 + 0,25 = **0,265 € (26,5 %)**. Chez Bandcamp, 15 % + 4–6 % donnent environ 19–21 % [E]. Sur un album à 10 € : 0,40 € (4 %) chez atome contre environ 19–21 % chez Bandcamp. Le « 0 % » n'avantage l'artiste qu'à partir d'un panier d'environ 2 à 3 € ; en dessous, il est **plus cher** [E].
2. Seuil d'intérêt d'un forfait F face à une commission c : ventes mensuelles S > F/c. Pour F = 12 €, il faut **S > 80 €/mois** face à Bandcamp à 15 %, **120 €** face à Bandcamp à 10 %, environ **225 €** face à Ampwall à 5 % (ses 10 $/an déduits) [E]. En dessous de ces seuils, le forfait coûte plus cher que la commission. La part des artistes indépendants au-dessus de 80 €/mois n'est pas connue : elle est à mesurer en entretiens.
3. Les ventes in-app sur iOS et Android supportent 15–30 % de commission de la boutique [S5, S9, S11]. Il n'y a donc pas de « 0 % » possible dans l'app, sauf droits d'achat externe selon la juridiction [S10, J].

**H9 « Un modèle équitable suffit à attirer l'utilisateur » : réfuté.** Un marché biface exige des auditeurs pour attirer les artistes, et inversement. Les concurrents ont déjà des acheteurs (Bandcamp) ou une audience (SoundCloud). eVe ne dispose aujourd'hui que de ses abonnés, en nombre non mesuré dans cette étude. L'équité est une condition nécessaire, jamais suffisante.

**Limites** : sans catalogue connu, la fonction Sport ne vaut qu'avec la musique déjà possédée par l'utilisateur. C'est un public réel (fichiers Bandcamp, archives MP3/FLAC, DJ, musiciens) mais minoritaire [H].

---

## 5. Droits, contrats, autorisations, interlocuteurs, obstacles

**Deux couches toujours distinctes**

| Couche | Titulaires | Droits à couvrir pour un streaming interactif ou une vente | Interlocuteurs FR/UE |
| --- | --- | --- | --- |
| **Master / phonogramme** | Producteur (label ou artiste autoproduit) ; artistes-interprètes | Reproduction et mise à disposition à la demande (droit exclusif) ; téléchargement ; hors ligne | Le producteur lui-même ; SCPP (répertoire des majors), SPPF (indépendants) [S23] ; Merlin pour le numérique des indépendants [S17] ; distributeurs |
| **Composition / édition** | Auteurs, compositeurs, éditeurs | Reproduction mécanique et communication au public de l'œuvre | Sacem (autorisation préalable obligatoire pour une plateforme de streaming [S22]) ; éditeurs ; Music Reports pour l'administration et le reporting aux États-Unis [S20] |

**Points juridiques clés**
1. La **licence légale** des webradios (CPI L.214-1, étendue en 2016) ne vaut que pour un flux continu identique pour tous, non choisi par l'auditeur [S23, secondaire]. Une sélection Sport personnalisée par auditeur est **probablement interactive**, donc hors licence légale [J].
2. **Art. 17.** Stocker et donner au public l'accès à un grand nombre d'œuvres envoyées par les utilisateurs, organisées et promues dans un but lucratif, fait d'atome un OCSSP qui communique au public. Il doit obtenir une autorisation ou démontrer des meilleurs efforts : obtenir une licence, empêcher les œuvres notifiées, retirer promptement [S21]. Le régime « jeune et petite plateforme » (17(6)) **allège** ces obligations mais ne supprime pas l'obligation de chercher une autorisation. Le stockage **pour son propre usage** est exclu [S21] : c'est la frontière à ne pas franchir sans licences.
3. **H5 « Les artistes ont tous les droits » : réfuté.** Un artiste autoproduit possède souvent le master, mais :
   - une reprise implique l'œuvre d'un tiers (Sacem) ;
   - un sample implique un master et une œuvre de tiers ;
   - des coauteurs et un éditeur peuvent intervenir ;
   - un contrat de distribution peut l'engager en exclusivité ;
   - un membre de la Sacem lui a **apporté** ses droits, et sa capacité à accorder seul une licence de streaming est à confirmer auprès de la Sacem [J].

   Une simple déclaration de l'artiste ne prouve rien. Il faut une chaîne de droits par titre : ISRC, ISWC si l'œuvre est déclarée, attestation, garantie et indemnisation.
4. **H6 « Pas de commission = pas de licences » : réfuté.** La licence dépend de l'acte (reproduction, communication au public), pas du modèle de revenu. Ni le statut d'hébergeur ni l'absence de commission n'en dispensent (MUS-04 ; art. 17(1)).
5. **H7 « Les majors paieront simplement l'hébergement » : réfuté par absence de preuve.** Aucune source n'indique qu'une major accepte de payer un hébergement pour diffuser son catalogue. Elle dispose déjà de canaux et de prestataires B2B qui reversent des redevances (Tuned Global, Feed.fm [S18, S19]). Garanties minimales, avances et audits sont l'usage selon la connaissance du secteur, sans source primaire ici [H].
6. **H8 « Le paiement direct supprime les intermédiaires » : réfuté.** Même si l'artiste encaisse directement, il reste :
   - la part de composition : Bandcamp prélève une « Collection Society Share » [S13] ;
   - les coauteurs et l'éditeur ;
   - le vendeur contractuel et la TVA de l'acheteur sur un service numérique (guichet OSS) [J fiscal] ;
   - les remboursements et litiges (20 € par litige chez Stripe [S28]) ;
   - le reporting.

   Un paiement direct ne vaut pas un versement à tous les ayants droit. Il faut aussi distinguer catalogue propriété d'un fournisseur, rémunération du fournisseur et versement à l'artiste (MUS-04).
7. **Intégrations existantes** :
   - Deezer non commercial [S12] ;
   - Spotify mode Développement limité à 5 utilisateurs, plus III.5 qui interdit tout produit mêlant ses flux à ceux d'un autre service [S3, S4] ;
   - Apple : pas de monétisation indirecte, pas de synchronisation [S5, S6].

   **L'architecture hybride (4), qui mélangerait Spotify et un catalogue indépendant dans une même sélection, est contractuellement exclue côté Spotify [F].**

---

## 6. Comparaison des quatre architectures

| Critère | (1) Réseau indépendant natif | (2) Réseau fédéré / stockage externe | (3) Service interactif licencié B2B | (4) Hybride progressif |
| --- | --- | --- | --- | --- |
| Investissement initial | Élevé : ingestion, vérification des droits, transcodage, diffusion, vente, reporting, modération | Moyen côté stockage, élevé en intégration et en conformité | Faible en technique, élevé en contrats (devis, garanties [H]) | Progressif |
| Coût récurrent | Infra faible [E §7], humain élevé (droits, support, litiges) | Infra reportée sur des tiers, risque de disponibilité | Redevances par écoute ou par abonné [H], plus DRM | Variable |
| Droits | Master et composition par titre ; art. 17 dès la diffusion publique | Idem, plus responsabilité sur un contenu non maîtrisé | Couverts par le fournisseur, dans les limites de son contrat | Idem (1) puis (3) |
| Délai / difficulté | 12–24 mois [E] | Plus long : protocoles, fiabilité | 3–9 mois après signature [H] | Commence par une étape locale courte |
| Maîtrise et portabilité des données | Totale | Partielle | Faible (le fournisseur contrôle) | Totale sur le local |
| UX | Cohérente avec eVe | Dégradée par l'hétérogénéité | Bonne, mais catalogue imposé | Bonne sur le local |
| Hors ligne | Possible si licencié | Incertain | Selon le contrat et le DRM ; non mentionné par Feed.fm ni Tuned Global [S18, S19] | Total sur les fichiers natifs |
| Sélection libre | Oui, sur un petit catalogue | Oui | Souvent limitée (sauts limités chez Feed.fm [S18]) | Oui sur le local |
| Effet de réseau | Nul au départ | Faible | Emprunté | Interne à eVe (créateurs → auditeurs) |
| Cohérence avec le framework | Bonne (Atomes, pipeline unique) | Moyenne (vérité externe) | Faible (SDK ou lecteur tiers ; risque de lecteur parallèle interdit) | **Forte** : moteur unique, Atomes, synchronisation |
| Montée en charge | Coûts de vérification et de contentieux en hausse | Risque de performance | Coût marginal par écoute | Maîtrisée |
| Risque principal | Droits incomplets, art. 17, acquisition | Conformité, disponibilité | Marge négative, dépendance | Faible au départ |

Le « repli stratégique » vers (4) n'autorise aucun repli technique (MUS-08) : chaque source est un propriétaire explicite, une absence d'accès donne une erreur explicite, et aucune source n'en remplace une autre.

---

## 7. Économie chiffrée, cinq simulations, sensibilités

**Hypothèses communes [E]**
- Titre moyen : 3,5 min.
- Volume livré par écoute : AAC 256 kbps = 256 × 210 / 8 = **6,72 Mo** ; AAC 128 kbps = 3,36 Mo ; FLAC ≈ 900 kbps ≈ 23,6 Mo [E].
- Stockage par titre (master FLAC + AAC 256 + AAC 128 + une copie de sauvegarde du master) ≈ **57 Mo**, soit **≈ 6 Go pour 100 titres**.
- Prix en USD, non convertis.
- Coûts fixes (droits, support, modération, comptabilité, juridique) **non sourcés**, traités en variable C_fix.

**H2 « 12 € pour ~100 titres est pertinent » : réfuté.**
- Stocker 6 Go coûte 0,09 $ (R2), 0,04 $ (B2) ou 0,14 $ (S3 Paris) par mois [E, S24, S25, S27].
- L'offre existante donne déjà 50 GiB pour 12 € (`billing_contract.js:15`), soit environ 800 titres au format ci-dessus.
- Un forfait par nombre de titres est arbitraire : le coût réel tient à la **livraison, aux opérations, à la vérification des droits et au support**, pas au nombre de fichiers.
- Ampwall facture 10 $/an pour 5 h de musique [S14].

**H3 « Le buffer rend le trafic négligeable » : réfuté.** Un buffer ne réduit pas les octets livrés, il les étale. Seul un **cache local autorisé** supprime les réécoutes. Le stockage n'est pas le trafic : 6 Go stockés peuvent générer des centaines de To livrés (simulation 3). Le coût du trafic dépend surtout du **choix du fournisseur** : sortie gratuite chez R2 contre 0,02–0,085 $/Go chez CloudFront [S24, S26].

**H4 « Deux abonnements à 12 € = deux marges nouvelles » : réfuté.** Un abonné eVe existant qui écoute de la musique n'apporte **aucun revenu nouveau** ; il ajoute seulement des coûts. Le seul gain possible est une baisse de la résiliation, à mesurer. Un artiste déjà abonné pour son stockage ne paie pas une seconde fois sans valeur distincte (MUS-03).

**Frais de paiement sur un abonnement de 12 €** : Stripe 0,43 € (3,6 %) ; Apple 1,80 € (15 %, puis 10 % après un an) ; Google EEE 1,80 € (10 % + 5 %) [S9, S11, S28].

| Simulation | Paramètres [E] | Infra mensuelle | Revenu | Lecture |
| --- | --- | --- | --- | --- |
| **1. Petit lancement indépendant** | 50 artistes × 100 titres = 300 Go ; 500 auditeurs × 30 écoutes = 15 000 écoutes = 101 Go | R2 : 4,4 $ ; CloudFront : 8,6 $ | 600 € bruts si 50 × 12 € ; moins 21 € (Stripe) à 90 € (IAP) | L'infra ne pèse rien ; **C_fix décide**. Chaque 1 000 € de coûts fixes exige ≈ 87 à 100 forfaits à 12 € |
| **2. Croissance raisonnable** | 1 000 artistes = 6 To ; 20 000 auditeurs × 300 écoutes = 6 M écoutes = 40 320 Go | R2 : 90 $ stockage + 2–9 $ d'opérations ; CloudFront : 3 277 $ de sortie | 12 000 € côté fournisseurs | Avec CloudFront, la sortie absorbe ≈ 27 % du revenu fournisseurs ; avec R2, < 1 % |
| **3. Viralité disproportionnée** | Un titre à 50 M d'écoutes dans le mois = 336 To | CloudFront ≈ **17 600 $** (870 + 3 277 + 6 144 + 7 296) ; B2 en direct ≈ 3 180 $ ; R2 : 18–72 $ d'opérations | 12 € (forfait de l'artiste) | Pire cas : marge très négative sans facturation à l'usage ou sans sortie gratuite. Avec R2, le risque devient une dépendance au prix d'un fournisseur unique. Si des œuvres Sacem sont concernées, les redevances par écoute restent dues [J] |
| **4. Abonnés déjà acquis, sans revenu nouveau** | 20 000 abonnés eVe existants × 300 écoutes | Idem simulation 2 (0 à 3 277 $) | **0 € incrémental** ; gain seulement si la résiliation baisse. Exemple : 0,5 point de moins par mois ≈ 100 abonnés conservés par mois ≈ 1 200 €/mois de plus, cumulés [E illustratif] | Ne lancer que si un pilote mesure une baisse de résiliation |
| **5. Bande passante séparée ou quotas** | Quota inclus Q Go livrés par forfait (ex. 50 Go ≈ 7 400 écoutes), puis p €/Go | CloudFront : coût ≤ 0,085 $/Go ; R2 : ≈ 0 | Le dépassement viral de la sim. 3 à p = 0,10 €/Go ferait **33 600 €** facturés à l'artiste | Facturer la viralité à l'artiste est commercialement toxique. Il faut une base sans coût de sortie, plus un plafond avec refus explicite et proposition de changement de palier, décidés à l'avance |

**Sensibilités**
- **Prix de sortie** : de 0 à 0,085 $/Go. C'est le premier levier (sim. 2 et 3).
- **Format livré** : 128 kbps divise le volume par 2 ; le FLAC le multiplie par 3,5.
- **Part d'écoutes servies par le cache local autorisé** : chaque point retire autant de trafic.
- **Canal de paiement** : 3,6 % contre 15 % sur un abonnement.
- **Montant moyen des ventes unitaires** : 26,5 % de frais à 1 €, 4 % à 10 €.

**Rentabilité.** La contribution d'un forfait à 12 € vaut environ 12 − 0,43 à 1,80 (paiement) − 0,1 à 0,3 (infra) ≈ **10 à 11,5 €**. Le point mort vaut N* = C_fix / (10 à 11,5). Avec C_fix = 5 000 €/mois [illustratif, non sourcé], il faut environ 435 à 500 fournisseurs payants. **Question centrale (MUS-03) :** l'infrastructure seule finance la diffusion technique, pas la conformité, le support ni les licences d'une diffusion publique massive. Ces coûts sont humains et contractuels, et inconnus tant que les interlocuteurs du §13 n'ont pas répondu.

---

## 8. Faisabilité BPM, Sport et hors ligne par fournisseur et sur fichiers natifs

**H10 « Téléchargé suffit pour le hors ligne » : réfuté pour les services tiers.** Un titre téléchargé dans l'app officielle reste dans un cache protégé. eVe ne peut ni le lire, ni l'analyser, ni le mixer : Apple l'interdit [S6], Spotify aussi (« ne pas analyser », III.7 [S4]), et Deezer le limite à l'usage privé [S12]. L'« accès » se limite au mieux à télécommander le lecteur officiel, ce qui reste à prouver en mode avion sur appareil réel.

| Source | BPM disponible | Accès à l'audio | Hors ligne contrôlable par eVe | Contrôle, transitions | Statut pour le Sport |
| --- | --- | --- | --- | --- | --- |
| **Fichiers natifs** (achats DRM-free, enregistrements, CC0) | Analyse locale à créer ; tag TBPM lisible si présent | Oui (Kira/Symphonia [O]) | **Oui** | Total : fin de morceau, fondus si l'utilisateur les veut | **Faisable** |
| Apple Music | Aucun champ tempo [S7] ; `beatsPerMinute` = champ saisi par l'utilisateur, souvent vide [S8 ; H] | Interdit [S6] | Lecteur Apple seulement ; pilotage hors ligne **non vérifiable sans appareil** | play/next via `SystemMusicPlayer` [O] ; synchronisation interdite [S6] | Sélection seulement sur un BPM saisi : **marginal**. Un réordonnancement automatique doit respecter « users must initiate playback » [J Apple] |
| Spotify | Audio Features fermé [S1] ; analyse interdite [S4] | Non | Non (API Web en ligne, Connect) | Aucun mélange avec d'autres sources (III.5, III.7) [S4] | **Non faisable** |
| Deezer | Non fourni par la recherche publique utilisée [O, S12] | Non | Non | Ouverture de page seulement [O] | **Non faisable** commercialement |
| B2B licencié (Feed.fm, Tuned Global) | BPM partiel (cas Lululemon [S19]) | Via SDK ou flux | Non mentionné [S18, S19] | Sauts limités (Feed.fm) | **À instruire sur devis** |

**Problèmes BPM sur fichiers natifs**
- **Identité.** Distinguer artiste, titre et version (radio, remix, live). Proposition : une empreinte du fichier comme clé locale, l'ISRC si présent.
- **Demi et double tempo.** Environ 10 à 15 % d'erreurs d'octave selon les écarts entre Acc1 et Acc2 rapportés [S32]. L'ambiguïté est bénéfique pour la course : une cadence de 160–180 pas/min correspond aussi à 80–90 bpm. Il faut donc stocker la valeur et ses multiples et choisir selon le contexte.
- **Tempo variable.** Stocker une stabilité ou une variance, et exclure les titres instables des modes d'entraînement.
- **Index.** Persistant, local d'abord, synchronisé comme propriété d'Atome. Correction manuelle discrète, conforme au Zen.

**H11 « Le tempo régule directement le cœur » : réfuté.**
- La méta-analyse ne montre aucun effet significatif de la musique sur la FC (g = 0,07) [S29].
- Effets réels : affect (0,48), performance (0,31) et effort perçu (0,22) [S29] ; la préférence de tempo suit l'intensité avec des paliers (125–140 bpm sur vélo) [S30] ; la cadence suit de petits écarts de tempo, jusqu'à 2 % pour ±3 %, et décroche au-delà de +2,5 % [S31].

Conséquences pour un futur moteur :
1. La FC sert de **contexte d'effort** (zones), jamais de cible à réguler.
2. Le tempo se choisit dans la plage préférée par intensité et s'ajuste à la cadence par pas de 2–3 % au plus.
3. Changer de cible seulement **en fin de morceau**, avec hystérésis (une durée minimale en zone avant de changer) et sans répéter un titre récent. Les valeurs sont à calibrer en pilote [E].
4. Aucune promesse médicale ; un professionnel de santé est requis pour tout usage cardiaque [J].

**Capteurs** : FC en direct pendant une séance sur iOS 26+ [O] ; latence entre le collecteur natif et la page non mesurée ; cadence instantanée non exposée (il faudra étendre le propriétaire santé, `CMPedometerData.currentCadence` [H]) ; aucun capteur sur Web ni macOS [O].

**Protocole du §6.4 (proposé, non exécuté)** : iPhone et iPad en mode avion ; 100 fichiers natifs importés et indexés ; ceinture ou AirPods via HealthKit ; démarrer la séance, sélectionner, réordonner, passer au morceau suivant ; retour du réseau ; resynchronisation des écoutes sans doublon. Mesures : erreurs BPM (Acc1/Acc2 contre annotation manuelle de 100 titres), latence de la FC, stabilité des transitions. Sur Web et macOS : mêmes étapes sans FC.

---

## 9. Choix privilégié et alternative stratégique

**Choix privilégié : (4) hybride, réduit à son étape locale, sans réseau public.**
1. Lecteur Sport sur fichiers natifs : propriétaire unique de file d'attente au-dessus de `PlayRecordCore`, index BPM local, sélection par la FC et la cadence.
2. Stockage privé des artistes, pour leur propre usage, dans les forfaits existants (50 GiB / 200 GiB / 1 TiB). Pas de nouveau forfait par titres.
3. Apple Music en télécommande, sans BPM ni lecture de fichiers, si Apple confirme la conformité.
4. Spotify et Deezer exclus du Sport.

| Recommandation | Bénéfice | Coût probable | Risque | Dépendances | Preuve manquante | Critère de validation |
| --- | --- | --- | --- | --- | --- | --- |
| Lecteur Sport local | Valeur neuve, hors ligne réel, aucune licence de diffusion | Développement interne moyen [E] | Erreurs BPM, latence de la FC | Moteur audio, santé, Atomes | Précision sur 100 vrais fichiers ; latence de la FC | Acc1 ≥ 80 % et Acc2 ≥ 95 % après correction de l'octave ; FC lue en < 5 s [seuils proposés] |
| Stockage privé des artistes | Sans art. 17 (usage propre) | ≈ 0 en plus | Glissement vers le partage public | Quota à appliquer (non trouvé [O]) | Avis d'avocat sur la frontière | Avis écrit |
| Apple en télécommande | Goûts existants de l'utilisateur | Faible | Refus d'Apple, 4.5.2 | MusicKit | Réponse d'Apple | Confirmation écrite d'Apple |

**Alternative stratégique (si le pilote prouve une demande d'auditeurs pour un catalogue Sport)** : architecture (3) à petite échelle, avec un fournisseur B2B fitness (Feed.fm ou Tuned Global). Ce n'est pas un réseau d'artistes. Condition : un devis montrant une marge positive à l'abonné, le hors ligne, la liberté de sélection et l'absence de lecteur parallèle à intégrer. Le réseau indépendant (1) ne viendrait qu'en troisième, après avis juridique, licence Sacem et entretiens prouvant que des artistes au-dessus des seuils du §4 paieraient.

---

## 10. Validation par étapes

1. **Juridique** (avant tout développement public), avec un avocat PI musique et numérique et un fiscaliste [J] :
   - qualification OCSSP selon l'usage (privé, partage restreint, public) ;
   - Sport personnalisé interactif ou non ;
   - apport des droits Sacem et licence directe ;
   - conformité des intégrations existantes (Deezer, Spotify, Apple) ;
   - vendeur contractuel et TVA ;
   - données de santé (RGPD, art. 9).
2. **Commerciale** : entretiens écrits préparés (§13) avec 20 à 30 artistes et 3 labels [E sur la taille]. Mesurer les ventes mensuelles par rapport aux seuils de 80/120/225 €, la volonté de payer et l'intérêt Sport chez les abonnés existants.
3. **Technique** : sonde locale autorisée (fichiers natifs, BPM, mode avion, FC réelle, resynchronisation) sur iPhone, iPad, macOS et Web ; Apple en télécommande en mode avion.
4. **Pilote** : stockage privé et Sport local pour des abonnés volontaires. Mesures : séances avec musique, corrections BPM, résiliation comparée.
5. **Échelle** : seulement après les étapes 1 à 4, avec quotas, plafonds et sortie sans coût, décidés avant.

---

## 11. Risques classés et conditions d'arrêt

| Criticité | Risque | Conditions d'arrêt (no-go) |
| --- | --- | --- |
| Critique | Diffusion publique sans licences master et composition (art. 17, Sacem, producteurs) | Arrêt si l'avocat classe le service comme OCSSP sans voie de licence finançable |
| Critique | Intégrations tierces non conformes dans une app payante (Deezer non commercial, Spotify mode Dév, Apple 4.5.2) | Retrait ou gel public tant qu'il n'y a pas d'accord écrit |
| Élevé | Promesse cardiaque implicite ; données de santé transmises | Arrêt si une formulation ou un flux suggère une régulation, ou si des données physiologiques quittent l'appareil sans nécessité |
| Élevé | Marge négative en viralité (sim. 3) | Pas de diffusion publique sans sortie gratuite ou plafond décidé |
| Élevé | Acquisition biface nulle | No-go réseau si moins de [proposé : 30 %] des artistes interrogés dépassent 80 €/mois de ventes et veulent payer |
| Moyen | Erreurs BPM, instabilité des transitions | No-go Sport si Acc2 < 95 % après correction ou si les transitions ressenties sont instables en pilote |
| Moyen | Fraude, usurpation, œuvres illicites, samples | No-go public sans processus de chaîne de droits, de retrait et de litiges |
| Moyen | Dépendance à un fournisseur de stockage (prix R2) | Garder la portabilité ; budget de bascule |

---

## 12. Questions essentielles et propositions de décision

1. **Construit-on une diffusion publique ?** Proposition : **non** avant l'étape juridique ; seulement privé et Sport local.
2. **Que devient le forfait 12 €/100 titres ?** Proposition : **l'abandonner**. Réutiliser les paliers de stockage existants et facturer à la capacité ou à l'usage s'il y a un jour diffusion.
3. **0 % de commission ?** Proposition : garder le principe, mais afficher les frais réels de paiement et regrouper les petits achats (panier ou solde) pour éviter les 26,5 % sur 1 € [J sur les règles de boutique].
4. **Que faire des intégrations Deezer et Spotify ?** Proposition : revue de conformité immédiate. Usage personnel ou démo seulement tant qu'il n'y a pas d'accord commercial (hors de ce lot, à arbitrer).
5. **Apple Music dans le Sport ?** Proposition : télécommande seulement, BPM seulement s'il est saisi par l'utilisateur, et uniquement si Apple confirme par écrit.
6. **Quelle physiologie ?** Proposition : la FC comme contexte de zone, locale par défaut, rien de transmis au-delà du reporting musical strictement nécessaire.
7. **Quel format livré, si diffusion un jour ?** Proposition : AAC 256 par défaut, lossless en option facturée à l'usage.
8. **Qui paie une viralité ?** Proposition : jamais l'artiste au-delà d'un plafond annoncé ; base sans coût de sortie et refus explicite au plafond.

---

## 13. Plan écrit de négociation futur (aucun contact effectué)

Ordre proposé, chaque étape conditionnée par la précédente :

1. **Avocat PI musique et numérique, et fiscaliste** (conseil, pas négociation).
   - Questions : qualification OCSSP par mode ; interactivité du Sport ; apport des droits Sacem ; conformité Deezer, Spotify et Apple ; vendeur contractuel ; TVA OSS ; santé.
   - À préparer : schéma des flux, inventaire du §2, extraits des conditions [S4–S6, S12].
2. **Apple Developer Relations.**
   - Questions : réordonnancement automatique d'une file lancée par l'utilisateur ; fonction musicale incluse dans un abonnement eVe (4.5.2) ; pilotage en mode avion ; droit Music Streaming Services ou Alternative Terms dans l'EEE [S10].
   - À préparer : captures du parcours, contrat `atome/src/squirrel/apple_music/contracts.js`.
3. **Sacem** (service des licences en ligne).
   - Questions : tarif et minima d'une offre interactive de niche ; traitement d'un artiste membre qui veut s'auto-héberger ; usages non commerciaux ; format de reporting, y compris des écoutes hors ligne.
   - À préparer : volumes des simulations 1 et 2, modèle de reporting.
4. **SPPF, puis SCPP.**
   - Questions : licence interactive pour les membres, couverture du hors ligne, conditions du Sport.
   - À préparer : liste des usages et des territoires.
5. **Feed.fm et Tuned Global** (demandes de devis).
   - Questions : prix par abonné ou par écoute, minima, territoires, liberté de sélection et sauts, métadonnées BPM, hors ligne et DRM, intégration sans lecteur parallèle (flux décodables par le moteur unique ?), indemnisation, reporting.
   - À préparer : scénario de 100 titres, volumes, exigences de confidentialité.
6. **Deezer et Spotify** (partenariats) : seulement si un intérêt utilisateur est prouvé. Questions : usage commercial, accès étendu, critères. À préparer : métriques d'usage.
7. **Merlin et distributeurs** : seulement après traction. Merlin licencie les masters des membres auprès des services, pas l'édition [S17].
8. **Majors** : en dernier, avec des preuves de traction et d'économie.

Preuves à réunir avant tout contact : inventaire, avis juridique, chiffres de pilote, processus de chaîne de droits, sécurité, plan de reporting.

---

## 14. Ébauche du futur cahier des charges — conditionnelle

**Ne s'applique que si H5, H6 et H10 sont tranchés par l'étape juridique et la sonde technique.** Elle ne vaut ni implémentation ni accord, et tout s'appuie sur les propriétaires internes existants.

- **Rôles** : auditeur ; artiste ou fournisseur (stockage privé). Les rôles label, ayant droit et distributeur sont réservés à une phase publique.
- **Modèle d'Atome** : enregistrement (master, ISRC), œuvre (ISWC, auteurs), version (remix, live), fichier (empreinte, formats dérivés) ; propriétés `tempo_bpm`, `tempo_candidates` (×½, ×2), `tempo_stability`, `tempo_source` (analyse, tag, utilisateur). Mutations via `window.Atome.commit` ; index par le moteur de conditions.
- **Ingestion** : import par l'asset box existante, puis décodage Symphonia, analyse BPM (nouvelle capacité du moteur audio unique, côté Rust), puis écriture des propriétés. Aucun dérivé public.
- **Lecture** : un propriétaire unique de file d'attente au-dessus de `PlayRecordCore` (à créer), réutilisable hors Sport.
- **Sport** : sélecteur sous forme d'outil ciblant le trait « audio lisible + tempo » ; entrées FC (moniteur `heart_rate` en direct pendant la séance) et cadence (extension de `CMPedometer`) ; hystérésis et changement en fin de morceau ; tout en local.
- **Hors ligne et synchronisation** : écoutes enregistrées comme événements, resynchronisées par `SyncEngine`, sans doublon.
- **Facturation** : paliers existants et application du quota (à créer) ; pas de vente de musique dans cette phase.
- **Confidentialité** : goûts, achats et données sportives locaux par défaut ; export et suppression.
- **Anti-abus** : quotas d'envoi, contrôle de taille et de type, aucun partage public.
- **Acceptation** : protocole du §8, seuils du §9, consoles propres, plateformes iPhone, iPad, macOS et Web.

Toute extension vers une diffusion publique (architectures 1 ou 3) exige un nouveau cahier des charges, après signature des accords du §13.
