# À tester et valider (18 nov. 2026)

Ce qui reste à essayer par toi. Le code est fait pour chacun de ces points ; les sessions d'origine sont archivées (elles se désarchivent si un essai échoue).
Coche `[x]` ce qui marche ; pour ce qui ne marche pas, écris ce que tu as vu, et la discussion « À tester et valider » lance la réparation.

## iPhone

- [ ] **T01 · iPhone portrait mode layout bug** (R-230) — session `local_8b6c904e-4feb-495e-a95c-884bd5c56b51`
  Sur l'iPhone, avec une build iOS récente : ouvrir la carte Sport téléphone couché, puis tourner le téléphone debout. Le texte doit rester dans l'écran, à sa taille, sans déformation, et le flou bien cadré.

- [ ] **T02 · Assistant vocal bugs et UI** (R-224) — session `local_924bbe4b-ddad-4d09-8adc-f2d92b0ab75f`
  Sur l'iPad ou l'iPhone, en conversation avec eVe : dire « raccroche » → elle dit au revoir et ferme vraiment la session. Puis dire « Ève, écoute-moi » → elle se réveille et écoute. Vérifier aussi qu'un toucher par erreur pendant un glisser ne l'ouvre pas puis la referme seule.

- [ ] **T03 · eVe contextuelles iOS et deep linking** (R-192 (et R-157)) — session `local_1243a8b9-4b8f-43a6-b7a4-ba233c6e7ad2`
  Sur l'iPhone, après déploiement d'atome.one et une build TestFlight : suivre les tests I1–I11 de `todo/entrees_contextuelles_ios_2026-11-16.md` (un lien /eve ouvre eVe général, un lien /music ouvre eVe Musique, premier lancement compris). Dans Activité, vérifier l'ordre … Achat, Vente, Audio …

- [ ] **T04 · Double-clic pour retour dashboard** — session `local_e7ac5950-b719-4733-99e5-ff85a5c7bcba`
  iPad ou iPhone, ouvrir une rubrique du Dashboard. Un toucher simple sur le vide ne fait rien. Un double tap sur le vide revient au niveau d'avant. Glisser de côté tourne les pages, glisser vers le bas revient en arrière.

- [ ] **T05 · Sortie projet et persistance navigation iPhone** (R-180) — session `local_3c201e39-df9c-4ab5-a84a-db9120947bc3`
  iPhone : dans un projet, toucher l'outil « Projets » du coin. Attendu : la matrice des Projets vient tout de suite, sans blocage. Quitter l'app dans un projet puis la relancer : on revient dans ce projet.

- [ ] **T06 · Cohérence interface Atom et capture photo/vidéo** (R-165, R-166, R-167) — session `local_e33ec807-9575-447b-a662-f87bbdbbe11e`
  iPhone. 1) Dans un projet, les outils du ruban s'effacent en fondu avant la case de l'Atome. rec. est rouge au repos. 2) Capture › Photo prend une photo dès l'ouverture, et Enr. ferme Capture, sans ✕. Le rouge d'Enr. respire pendant une vidéo. 3) Tenir une prise vidéo : sa pellicule apparaît, et glisser le bord de fin rogne la vidéo. 4) Médias › Listes › Créer : taper le nom sur la ligne même. Ajouter coche des médias.

- [ ] **T07 · Design audio/vidéo long-press contextuel** (R-168 (repris ensuite par R-166)) — session `local_992a6b21-a4cb-40d0-a1bb-beb5d91d395d`
  iPhone, Capture › Audio : tenir une prise. Attendu : pas d'espace vide au-dessus des outils et une forme d'onde. Double toucher sur le nom : le clavier monte et le champ s'ouvre sur la ligne. Taper « Ma voix » puis Retour : le nom est gardé.

- [ ] **T08 · Messages restent non lus après lecture** — session `local_9c9e2966-6f7b-4858-98d0-d17a0b1443f8`
  iPhone ou Web : ouvrir la conversation de Godard. Attendu : ses 4 « Appel manqué » sortent du badge de l'enveloppe, qui passe d'environ 20 à 16. Un appel qui sonne encore reste non lu.

- [ ] **T09 · Rendez-vous synchronisation et suppression** (R-153) — session `local_5cb724c8-02ad-4c68-bb01-d55981a60be1`
  1) iPhone/iPad et Android : poser une alarme dans 2 min, fermer l'app. Attendu : elle sonne, avec Arrêter et Ouvrir. 2) Choisir un son dans « Mes sons » (mp3) pour une alarme : il sonne à l'heure, coupé à 30 s sur iOS. 3) Créer un rendez-vous dans eVe : il apparaît dans le calendrier « eVe » de Calendrier (iOS) ou de l'agenda Android. Le supprimer dans eVe : il disparaît du téléphone.

- [ ] **T10 · Agrandissement preview en mode enregistrement vidéo** (R-158 (bande revue ensuite par R-165 : plus de ✕ dans Capture)) — session `local_47f3e198-28cf-4efc-b290-0a3b4639d4de`
  iPhone, nouvelle build : Capture › Vidéo, lancer une prise. Attendu : le titre et la liste disparaissent, la caméra va du haut jusqu'à la bande, qui ne garde que Caméra et Arrêter. À l'arrêt, la liste revient avec la nouvelle prise.

- [ ] **T11 · Deux iPhones USB : WebDriver Agent et transferts** (R-151) — session `local_b86ac5c3-cfee-4abc-b9bc-313bf70e5487`
  Deux iPhones (Jeezs's phone et Le Sylv's Phone). D'abord, Réglages › Notifications › atome : autoriser. Verrouiller l'un, l'appeler depuis l'autre. Attendu : il sonne. Envoyer un fichier et un message vers le téléphone verrouillé : une notification arrive. Faire pareil dans l'autre sens.

- [ ] **T12 · Bugs vidéo et messagerie** (R-144 (probablement dépassé par les sessions Sport suivantes : R-208, R-209, R-213, R-214)) — session `local_6b010de0-0217-43ef-b50b-9dcdcd2a051b`
  iPhone : ouvrir une carte d'exercice Sport. Attendu : 6 outils, et le contenu ne déborde pas. Lancer une séance : elle se déroule normalement.

- [ ] **T13 · Design et focus input box recherche** — session `local_fff79b07-599a-4063-a0ca-89bbeaea616a`
  iPhone, nouvelle build. 1) Ouvrir un projet et toucher Trouver. Attendu : le champ se déplie dans le ruban, le panneau s'ouvre au-dessus et le clavier monte. 2) Taper un mot : la liste se filtre. 3) Toucher Trouver ou le ✕ du panneau : les deux se ferment ensemble.

- [ ] **T14 · Dashboard design restructure** (R-152 (FAIT au registre)) — session `local_67ee38c8-d7c4-4159-9017-c5a145fa7e2e`
  iPhone et iPad, nouvelle build, eVe Pro. 1) Haut de chaque écran du Dashboard : heure sans date, V seul, rendez-vous avec décompte (−N h, puis −90/−60/−30, puis minutes en rouge sous 30 min). 2) Toucher l'heure : panneau heure, date, fuseau sur molette. 3) Toucher ou glisser le V : heure et rendez-vous deviennent deux traits lavande, la rangée des profils défile ; un choix ou un toucher ailleurs la replie. 4) Météo seulement au 1er écran de l'accueil. 5) Téléphone couché : colonne heure + V à gauche.

- [ ] **T15 · Régression taille icônes** (R-147 (CODÉ, à vérifier sur l'iPhone)) — session `local_f7627a92-f6ff-4674-9201-5513360cab6b`
  iPhone 17 Pro, nouvelle build. Accueil du Dashboard, tourner trois fois portrait ↔ paysage : tuiles, outils de la bande et ruban gardent la même taille (case de 64 px), jamais de rétrécissement.

- [ ] **T16 · Lecture fréquence cardiaque** (R-132 (ATTENTE UTILISATEUR)) — session `local_fb90dec4-7cf5-444f-8ac4-0337f5c0c887`
  iPhone : Réglages › Confidentialité et sécurité › Santé › atome › « Autoriser la lecture » › Fréquence cardiaque → « Accès complet ». Puis ouvrir eVe › Moniteur : le pouls doit s'afficher ; aussi dans une carte Sport, Marche, Fitness. Si vide, le dire (capture des journaux à relancer).

- [ ] **T17 · Problèmes dashboard et panneaux** (R-129 (OUVERT : reste ton essai)) — session `local_5b4e742f-9f32-4313-b5fe-ff3729dea8e2`
  iPhone, build récente. Sport › Pompes niveau 1 : séries et repos s'enchaînent sans toucher jusqu'à « Terminé » ; le disque met en pause puis relance ; Stop arrête. Idem Biceps et Planche.

- [ ] **T18 · Activité sport : chaînage et bug pompe** (R-129 (même entrée que la session précédente)) — session `local_6220ff56-7ce3-42aa-86ac-bea2a69d029d`
  iPhone, nouvelle build : lancer Pompes (il démarre), les repos s'enchaînent seuls ; relancer Pompes après une séance déjà finie (chemin de reprise, non sondé).

- [ ] **T19 · Web restore: 300 objects never reach the new device** (R-127 (OUVERT)) — session `local_e2a0181a-26e9-46e2-a530-63aa40d46f61`
  iPhone avec la dernière build OTA (1.58 ou plus) : restaurer la session (SMS ou mot de passe) ; on doit voir « Je restaure votre session » avec la jauge, puis l'accueil avec la jauge dans le champ du bas ; à la fin, projets et contacts présents.

- [ ] **T20 · Assistant serveur Atom et scan code-barres** (R-124 (OUVERT), puis R-125 et R-126 (pas commencés, en attente de R-124)) — session `local_bf758b56-0069-4b32-9104-c32ba3577e26`
  iPhone, dernière build : 1) scanner un produit : bip, la caméra se ferme, la fiche s'affiche. 2) Lancer l'assistant une fois : il répond ; s'il échoue, noter le message exact.


- [ ] **T54 · Vidéo flottante sur l'iPhone** (R-207) — session `local_d7a72861-0e00-417b-8b5a-e3a8715b0636`
  Sur l'iPhone, avec une nouvelle build :
  1) Médiathèque › Vidéos : lance un film libre, puis touche ⌂. L'image flotte en haut et continue. Touchée, elle propose Ranger, Plein et Fermer. Après Ranger, le son continue et l'outil d'état la rétablit. Un double toucher la met en plein écran.
  2) Un service déclaré (ADN, Netflix…) : ouvre un titre dans sa page, lance sa vidéo, puis touche ⌂. La page flotte en haut et continue.
  3) France TV : même essai.

- [ ] **T56 · Créations cassé et lag sur l'iPhone** (R-233) — session `local_7791a8fb-301f-4962-ab48-125755edeac4`
  iPhone, build 1.59 (57) ou plus récente (renderer `a12c97d09b401efe` ; build Xcode prête dans DerivedData, ou celle publiée sur atome.one/ios/install) :
  1) Réalisations › Créations, avec plus de 24 projets : toutes les plaques sont entières, sans rangée vide, et les outils sont là. L'ouverture est immédiate.
  2) Ouvrir un projet : aucun reste de plaque en haut, et la bande d'outils est dessinée en entier.
  3) Te balader dans le Dashboard et les projets : plus de lag, même pendant qu'un autre appareil modifie quelque chose.
  4) En mode avion, créer un projet : il apparaît tout de suite. Au retour du réseau, il arrive sur le serveur (visible sur un autre appareil).
  5) Si tu vois « mix param character must be one of 5 choices » (audio_fx) : dis-le-moi. C'est une valeur hors bornes enregistrée dans le rack de ton compte, à lire sur l'iPhone branché.

- [ ] **T57 · Import d'un protocole sur iOS : CSV, Excel, PDF** (R-229) — session `local_f8b801ba-4d94-427c-943f-e009485edca4`
  Sur l'iPhone ou l'iPad, avec la prochaine build iOS (la TestFlight 1.59 n'a pas la correction) : Moniteur › Carnet › Traitements › Import › Ouvrir. Choisis dans Fichiers le CSV, puis l'Excel, puis le PDF de « complements a commander ». Chacun propose un protocole rempli. Un CSV ouvert depuis le Dashboard crée un projet à son nom.

## iPad

- [ ] **T21 · iPad audio interruptions en sport** (R-225) — session `local_5aa66468-903a-46e3-b397-92e45e8fc72b`
  Sur l'iPad atomic, avec une build contenant ce code, lancer une séance Sport. 1) Sans musique : bips, « 3, 2, 1, partez », « Repos », « Attention, série suivante » sortent propres, sans trou ni tremblement. 2) Avec ta musique : elle baisse un peu avant chaque phrase et remonte après ; pendant le « 3, 2, 1, partez » elle reste basse tout du long. 3) Dire si ça tremble sans musique (cause : moteur natif) ou seulement avec (cause : la baisse).

- [ ] **T22 · Convertisseur Loopy Pro vers atome** (R-196, R-205) — session `local_7ffd86ae-5f16-4123-b98a-e08b96dffa96`
  1) App Mac : Importer › Ouvrir, choisir un fichier puis un dossier ; un `.lpproj` ouvert hors projet crée un nouveau projet qui s'ouvre. Puis ouvrir un projet, revenir au Dashboard et y glisser un fichier : il va dans tes médias. 2) iPad : Importer › Ouvrir dans le sélecteur Fichiers, toucher réellement un `.lpproj` (taper le code de l'iPad si l'automatisation le demande) : le projet est créé et s'ouvre.

- [ ] **T23 · Optimisation des rouleaux de sélection** (R-218 (et R-230, renderer publié par 61b3)) — session `local_61b3eec7-44e6-4cc1-a798-5e4d0215d605`
  Sur l'iPad avec une souris ou un pavé : molette sur un rouleau (Sport, réglages) → le rouleau tourne, la carte ne bouge pas ; clic-glisser sur le rouleau → seul le rouleau bouge. Dire si le panneau bouge encore, et sur quel écran.

- [ ] **T24 · Scanner de code-barres** (R-124) — session `local_9e1fbc23-193e-482a-a33d-c209d7cfa100`
  Sur l'iPad, scanner un vrai produit gras ou sucré : la fiche dit « Refusé » ; toucher « Au panier » dans la bande du bas → la ligne devient « Au panier · Ajouté à ta liste ». « Éviter » le met de côté.

- [ ] **T25 · Assistant : actions à durée** (R-226) — session `local_e89170b2-4dba-4225-bfd4-a43d9fde814b`
  Sur l'iPad, dire à eVe : « filme pendant 10 secondes » → une prise de 10 s gardée ; « quelle heure est-il » → l'heure et le jour justes ; « arrête dans 2 minutes » → arrêt au bout de 2 min. Aussi « mets une alarme à 17 h 01 qui lance ma playlist Favoris » → l'alarme lance la playlist.

- [ ] **T26 · Accessibilité vocale : suppression des confirmations** (R-220) — session `local_65a43025-425d-481b-aa21-26adc8bb4cb1`
  Dans l'app (iPad ou Web), dire à eVe « enregistre le micro » → l'enregistrement démarre tout de suite, aucun panneau de confirmation. Demander une action sensible (envoyer un message) → elle redemande à l'oral seulement.

- [ ] **T27 · Boutons suivant/précédent musique** (R-216) — session `local_f803c8a8-09e3-4ca2-8614-b72b391b49d1`
  Sur l'iPad, après une build iOS : dans Musique, toucher Préc. puis Suiv. → le morceau change. Lancer une musique, faire une prise vidéo, puis une prise son → la musique reprend après chaque prise.

- [ ] **T28 · Condition et compteur de valeurs** (R-214) — session `local_20eec4bb-6472-4721-a4a0-7cad55f20046`
  Sur l'iPad, séance de développé couché avec charge : pendant une série en cours (pas un repos), les tuiles Charge / Ensuite / Niveau sont justes et le disque garde sa taille ; la voix dit le poids à mettre au début de la 1re série chargée. Toucher « Filmer » : la vidéo est bien cadrée en plein écran.

- [ ] **T29 · Prompteur eVe : import LRC/SRT/VTT/TXT** (R-211) — session `local_a3206b60-b424-4edb-894b-ac90a16966f7`
  iPad (puis Tauri) : glisser un fichier .lrc, puis un .srt sur le Dashboard. Attendu : un nouveau projet avec un prompteur dont les lignes sont minutées. Dans un projet ouvert, importer un .vtt. Attendu : un clip prompteur dans ce projet. Lancer Rec puis toucher une perle. Attendu : le texte glisse jusqu'à la perle, il ne saute plus à la fin.

- [ ] **T30 · Alignement grille tuiles et outils** (R-201) — session `local_8003e070-b92e-4005-a353-8a285874178d`
  iPad : tenir une tuile du Dashboard. Attendu : la tuile et sa bande d'outils tombent pile dans les cases de la grille des 60 px, sans décalage d'une demi-case.

- [ ] **T31 · Tuiles moniteur : masquage et cycle** (R-200) — session `local_3afc22c1-8b3c-4398-86d2-5ab0e93ed7a1`
  iPad et Tauri : ouvrir un moniteur. « Retirer » le fait disparaître du Moniteur. « Cycle » éteint le sort du cycle de l'accueil (son glyphe s'éteint). Les autres moniteurs alternent sur l'accueil avec un fondu de 1,2 s.

- [ ] **T32 · Effets vidéo et audio pour Atom** (R-184 (et le correctif R-188 d'enregistrement par tranche)) — session `local_8f56b37d-7415-4615-8639-a9cb0e1f6abb`
  iPad (AUv3/AUM) et Tauri : Capture › Effets › Ampli, choisir une capture TONE3000 et jouer au micro. Attendu : un son d'ampli plus sombre. Toucher l'Ampli pour l'éteindre : on retrouve le son sec. Essayer aussi un effet vidéo (flou, étalonnage) sur une prise.

- [ ] **T33 · Console design et stabilité** (R-171) — session `local_9c650ca2-9e63-4b9d-a884-03390f8d5536`
  iPad : ouvrir la console d'un projet pendant qu'une vidéo joue. Attendu : aucun scintillement (le défaut B1, non reproduit sur le Web). Toucher le nom d'une piste : le fond de la colonne change, sans trou ni reste.

- [ ] **T34 · Projet Eve panneau dysfonctionnel** (R-159) — session `local_5164a572-bc89-4ddf-a3bf-c299b4857826`
  iPad atomic, Boutique › Créer › Nouvelle vente. 1) Toucher plusieurs natures à la suite : rien ne bloque ni ne rame. 2) Toucher Projet eVe : tes projets s'affichent sous Nature, avec Nouveau. 3) Toucher Nouveau : un projet est créé et choisi, et le panneau reste ouvert.

- [ ] **T35 · Atome eVe improvements and debugging** (R-115 (FAIT au registre)) — session `local_b357b03c-0b5f-456a-91af-600a31df3e91`
  iPad et Mac (Tauri) : Créer › un texte avec scripts : l'outil « Scripts » après Grille, tuiles, appui long › Supprimer (1er toucher arme, 2e supprime). Sport › Journal avec un vrai compte Strava : les activités Strava sont des lignes, appui long › Supprimer les retire.


- [ ] **T46 · Dictée à eVe avec ta vraie voix** (R-228) — session `local_97364ebd-6134-4283-9982-85ef265ee8ac`
  Sur l'iPad puis l'iPhone : ouvre eVe, touche le champ, puis le micro de dictée à côté d'Envoyer. Tes mots s'écrivent dans la zone de deux rangées au-dessus de la bande. Pendant la dictée, son écoute est coupée. Un second toucher sur le micro arrête la dictée, et le texte reste dans le champ.
- [ ] **T47 · Une vidéo prise dans Capture se relit** (R-232, point ouvert `avc1`) — session `local_b37a4ff1-70c5-462b-8a37-cc90e47d7256`
  Sur l'iPhone : filme une courte prise dans Capture, puis relis-la. Dis-moi si elle ne se lit pas.
- [ ] **T48 · Effets audio sur l'appareil et dans AUM** (m7) — session `local_166feb68-5330-4985-b0da-581afe5aaa84`
  Sur l'iPad : allume un effet sur une piste et écoute-le. Puis ouvre atome dans AUM et vérifie qu'il s'y charge et sonne.

- [ ] **T52 · Étirement d'un clip audio (warp)** (R-178) — session `local_7e32074c-b1c4-4048-96f9-b211259e234f`
  Sur l'iPad, avec la nouvelle build : dans un projet, monte un clip audio de 12 demi-tons. Il sonne une octave plus haut et garde sa durée. Puis mets-le en « Suivre » et baisse le tempo de moitié : il dure deux fois plus longtemps, sans changer de hauteur, et il n'est pas coupé à la fin de sa section.

- [ ] **T53 · Rangée des réglages de cellule** (R-231, maquettes C1–C6) — session `local_291ba8f7-cf21-4392-94f8-e37115c35fda`
  Sur l'iPad, avec la nouvelle build : dans la Timeline, ouvre Réglages sur une cellule. Tu dois voir Vue, Lancement, Son (Envel., Vitesse, Pitch, Inverse, Vélocité) et Répét. Une cellule en « une seule fois » ignore un second toucher pendant qu'elle joue. Inverse la joue à l'envers. L'ADSR s'ouvre et se règle.

- [ ] **T55 · Écrans connectés : iPad, Android, Mac** (R-212) — session `local_5b377699-4b24-4d38-9ad2-674bf8f98e6a`
  Branche un écran à l'iPad (HDMI, USB-C ou AirPlay), puis à un Android (câble ou Cast), puis un second écran au Mac.
  - L'écran montre une deuxième vue du même document, en plein écran à son format : ni miroir à bandes noires, ni image étirée, ni outils.
  - Dans un projet, il suit le téléphone (même centre, même échelle, plus de place autour).
  - Sur le Dashboard, il montre le même endroit, avec plus de tuiles.
  - Débranché, rien ne change sur l'appareil, lecture comprise. Rebranché, la vue revient.

## Mac

- [ ] **T36 · Convertisseur autonome de trousseaux CXF** (R-122 (convertisseur, ATTENTE UTILISATEUR)) — session `local_074766f1-8d01-4be5-b425-e5ba2905f873`
  Mac : ouvrir tools/keychain-converter/dist/atome keychain converter.app, suivre les cinq dialogues jusqu'au bout avec un vrai export (1PUX, 1PIF ou CSV) ; le fichier chiffré doit se créer, et « verify » doit le relire sans erreur.


- [ ] **T45 · Panneau Capture sans ✕, Caméra avant Enreg.** (R-232) — session `local_b37a4ff1-70c5-462b-8a37-cc90e47d7256`
  Sur l'iPhone ou l'iPad, avec une build qui contient R-232 : ouvre Capture depuis le disque rouge du bas. Il n'y a ni ✕ ni nom au pied. Avec plusieurs caméras, l'outil Caméra est juste avant Enreg. : un premier toucher ouvre le viseur, les suivants changent de caméra, avant la prise comme pendant. Le disque rouge du bas pulse doucement tant que Capture est ouvert, et le disque rouge ferme Capture.

## Apple Watch

- [ ] **T37 · Apple Watch vérification et maquettes** (R-221) — session `local_814debf4-1d3c-42bc-b9d7-3b9723cc2c56`
  Sur une vraie Apple Watch, avec une build qui contient le nouveau design (TestFlight seulement avec ton accord) : ouvrir l'app de la montre, lancer une activité depuis la montre, vérifier les 15 écrans (fond, textes lisibles, cadran) et l'export des données vers l'iPhone.

- [ ] **T38 · Dashboard édition multipiste** (R-198 (et R-195 FAIT)) — session `local_79ac58ff-78dd-4273-bcfc-2e5c721230db`
  iPhone, Réalisations › Prises : tenir une prise, puis toucher Édition. Attendu : un trait bleu de 3 px court sous Édition, Rogner et Pistes, et disparaît quand Édition se replie. Avec 2 prises cochées, Pistes montre le coin replié. Au repos, Édition montre son coin replié.

- [ ] **T39 · Menu créer : restructuration et ergonomie** (R-156 (FAIT au registre)) — session `local_614ef0b3-bff8-4b6d-9288-1d514d4f297b`
  iPad, nouvelle build. Dashboard › Projets : 1) Créer › « Site web » crée et ouvre un projet site. 2) Toucher Type : Santé, Code, Créa, Site se posent à sa gauche, Type/Liste/Favori/Créer ne bougent pas ; retoucher Type les replie. 3) Liste : Tuiles prend exactement la case de Liste, la case de Créer reste vide. 4) Type › Site ne montre que les projets site.

- [ ] **T40 · Suppression en mode sélection** (R-131 (OUVERT : reste ton essai)) — session `local_8d6db551-b65a-4cfe-98c5-4c76865c7bfb`
  iPhone, Dashboard › Captures › Audio. 1) Appui long sur une prise › Rogner : glisser un bord cyan, la durée change et reste au lâcher. 2) Retour à la liste : l'onde et la tête de lecture ne montrent que la partie gardée. 3) Toucher la preview puis glisser : le son repart sous le doigt.

- [ ] **T41 · Application compagnon Apple Watch** (R-113 (ATTENTE UTILISATEUR)) — session `local_e3decba7-dd46-481e-ae9e-cb4f57394416`
  iPhone + vraie Apple Watch : installer le dernier build TestFlight, attendre la mise à jour de l'app montre ; ouvrir eVe sur l'iPhone puis l'app sur la montre : les tuiles d'Activité s'affichent en quelques secondes (pas seulement le glyphe d'iPhone).

- [ ] **T42 · Bugs à corriger** (— (Bugs.md, BUG-001 à BUG-070)) — session `local_ef9371fe-e2fe-4e79-94cf-3752a6b8acb7`
  iPhone et iPad : accueil (tuiles entières, rien ne défile, heure non coupée par le V) ; écran Sport v2 en séance (bips à l'heure, son entendu) ; le pouls par la montre ; la chaleur du téléphone pendant une séance.


## En voiture (CarPlay)

- [ ] **T43 · CarPlay assistant debugging** (R-223, repris le 18 nov. par `local_37801f04-9f74-4a1f-97c0-422f1e3ecec6`) — session `local_fab4e74f-1064-480b-adad-9623fd99da24`
  En voiture, iPhone branché à CarPlay, avec une build qui contient les corrections : ouvrir eVe sur CarPlay → l'assistant s'affiche, démarre et répond à la voix. Essayer aussi iPhone verrouillé. Avec la build Xcode du 18 nov. (pas la TestFlight 1.59) : un seul Atome, animé quand il écoute ou parle ; il écoute dès l'ouverture ; il se reconnecte après une coupure réseau ; il ne raccroche qu'à ta demande vocale, jamais après un silence ; le ✕ de CarPlay le ferme.


## Web ou appareil au choix

- [ ] **T44 · Restructuration écran d'accueil** (R-133 (registre : ATTENTE UTILISATEUR) — dépassé) — session `local_382304ca-476d-4af1-acad-b82fe6831a79`
  — (couvert par les essais de R-152)


- [ ] **T49 · Import de documents CSV, PDF et Médiathèque** — session `local_31f4b883-4229-4b25-af2d-86276246e70c` (code jamais lancé)
  Importe dans un projet un `.csv` exporté d'Excel (points-virgules), puis un PDF qui contient du texte. Le CSV devient un tableau en grille, le PDF un texte avec ses titres et ses listes. Depuis la Médiathèque › Importer, un Word ou un PDF est converti et rangé.
- [ ] **T50 · Sites publiés et outil QR** — session `local_493de982-5410-4612-8c4f-1ef36a28dfdf`
  En bas d'un site publié, le petit logo atome s'éclaire au survol. Dans Créer › QR, le code se dessine pendant la frappe, et « Garder » le range dans tes médias. Taper « QR » dans la recherche trouve l'outil.
- [ ] **T51 · Prompteur** — session `local_6117ee8d-22a5-4879-be00-f7625d74d36e`
  Lance le prompteur sur un texte en plein écran. Dis-moi si l'un de ces 4 manques signalés le 29 oct. est toujours là :
  - le texte ne défile pas pendant la lecture ;
  - la ligne en cours ne passe pas en jaune ;
  - glisser un repère ne montre pas d'aperçu ;
  - le libellé de la palette est coupé en « Pr… ».

- [ ] **T58 · Nouveau traitement, rappel les jours choisis** (R-229) — session `local_f8b801ba-4d94-427c-943f-e009485edca4`
  Sur le Web (ou un appareil) : Moniteur › Carnet › Traitements › Créer. Tape un nom, ajoute une Ligne, choisis Répétition « Jours choisis » et deux jours, puis ✕. Touche la cloche deux fois : le rappel doit apparaître dans l'Agenda ces deux jours-là.

- [ ] **T59 · Panneau d'un plug-in dans la console** (R-194, maquette M5/M6 option 1) — session `local_d893c4bb-c576-4660-b8ff-252888517559`
  Dans un projet, vue Mixage (console). (1) Dans Capture › Effets, enregistre une chaîne comme effet (Mes effets), puis ajoute-la à une piste par le + de la console. (2) Touche son outil : il déplie ses modules (il est à toi). (3) Pour le voir comme reçu : ouvre le même projet depuis un autre compte, ou supprime cet effet de Mes effets en gardant le projet ouvert, puis touche l'outil du plug-in. Attendu : son panneau soudé à l'outil, comme un effet ; sur la bande, le nom de l'auteur (coupé par « … » si trop long) · « N modules » ; dessous, ses réglages en outils qui montrent leur valeur et ne bougent pas au glisser ; au pied, son nom entier ; ni interrupteur ni ✕ ; touché encore, il se replie ; le son continue. Le prix et « Acheter » n'apparaissent pas encore (ils attendent R-193).

- [ ] **T70 · Instrument d'un projet reçu ; dépôt d'un .otio ou .fcpxml** (R-194) — session `local_d893c4bb-c576-4660-b8ff-252888517559`
  (1) Dans un projet, mets un Synth ou un Sampler sur une piste. Ouvre ce projet depuis un autre compte, ou retire l'instrument de ta bibliothèque en gardant le projet ouvert. Attendu : l'instrument joue toujours, et l'IN de la piste ouvre son rack en lecture seule. Pour un Sampler venu d'un autre compte, ses échantillons sont désormais partagés avec le projet, comme tu l'as choisi : ils doivent jouer aussi chez l'autre compte. Il faut le serveur redémarré, car run_fastify.sh reconstruit lui-même atome-server avec cette version. (2) Dépose un fichier .otio ou .fcpxml sur le Dashboard. Attendu : un projet au nom du fichier s'ouvre, avec sa timeline (pistes et clips).
- [ ] **T71 · CB : enregistrement des prises et signalement** (R-173 L4) — session `local_9422776b-43ad-4a36-bf74-b6a1c9a8c9c3`
  Sur un serveur isolé, avec deux comptes de test sur deux appareils ou deux navigateurs, tous deux sur le même canal du panneau CB. A appuie pour parler environ 5 s, puis relâche : B entend A. B ouvre la fiche de A et touche « Signaler ». Attendu : la prise est un fichier .ogg dans data/cb_recordings, avec sa ligne dans cb_recordings ; le signalement gèle les 13 dernières minutes du canal (cb_recording_holds). L'écoute par un admin n'a pas d'écran : elle passe seulement par les actions serveur `recordings-case` et `recording-listen`, et chaque lecture est notée dans cb_recording_listens. Écran du modérateur (maquette 29, option 2 « Frise ») : connecte-toi avec un compte admin, ouvre Contacts › Rencontre et touche le 4ᵉ choix « Modér. », le bouclier de la maquette 30. Attendu : la liste des dossiers ouverts s'affiche, puis la frise des prises d'un dossier ; chaque écoute est notée dans le journal. Avec un compte qui n'est pas admin, « Modér. » n'apparaît pas. Il faut le serveur redémarré avec cette version d'atome-server. Ajout : après un signalement sur le canal 19, ferme le canal (tout le monde part). Attendu : le dossier du modérateur affiche toujours « CB canal 19 ».
- [ ] **T72 · Calc : calcul dans le texte, imports, script Ruby, assistant limité au document ouvert** (R-236) — session `local_ee16b837-e327-4cf7-8567-6178617c193a`
  Dans Dashboard › Créer › Texte, avec Calc activé, tape « Loyer 800, courses 350. Total : loyer plus courses = ». Importe ensuite un .xlsx et un .docx (outil Modèle du projet, puis Médiathèque › Importer). Écris un script Ruby (Mod-Entrée). Enfin, demande à l'assistant, d'abord à la voix puis par écrit, de lire ou de modifier un autre document. Attendu : « 1 150 » s'écrit après le « = ». L'import s'ouvre, et un message discret dit ce qui n'a pas été repris. Le script écrit ses cellules, et un script qui s'emballe est arrêté (mémoire ou délai) sans que la page tombe. L'assistant agit tout de suite sur le texte ouvert, mais il refuse de toucher un autre document.
- [ ] **T73 · Assistant IA : réglage Économie ↔ Qualité et facturation** (R-120) — session `local_0f22a5c6-146c-4559-83b5-1513e0a8d610`
  Sur le Web, l'iPad et Tauri, ouvre Réglages › Assistant, coche « Assistant IA », fais glisser la ligne « Économie ↔ Qualité » jusqu'à 2, puis pose une question à eVe par écrit ou à la voix. Attendu : la ligne ne se montre que si « Assistant IA » est coché, et elle vaut 5 au départ. La valeur est gardée quand tu fermes et rouvres les réglages. La réponse arrive, et le grand livre montre le débit (le coût réel + 3 %). Côté serveur, il faut ANTHROPIC_SHARED_KEY_FILE, DEEPSEEK_SHARED_KEY_FILE et NOT_DIAMOND_KEY_FILE ; sans eux, seule l'IA d'OpenAI répond.
- [ ] **T74 · Inspecteur de cellule et enveloppe** (R-199) — session `local_2e6a3d96-d7d6-4e11-8bce-769c8420fce9`
  (1) Ouvre un projet, puis Timeline › Cellules ; active Réglages et touche une cellule audio. Attendu : l'inspecteur montre l'échantillon, et la partie jouée se trouve entre Début et Fin ; tu peux faire glisser Début ou Fin. (2) Dans Son › Envel. : la courbe et ses 3 points se posent sur la forme d'onde, et 4 réglettes s'affichent sur la rangée ; faire glisser un point change la forme. (3) Passe à la vue Scène en gardant la cellule choisie : l'inspecteur se place sous les tuiles, sur toute la largeur. Quand tu désactives Réglages, il disparaît.

- [ ] **T75 · Nom de domaine OVH plus rapide** (R-121) — session `local_f6799464-af7e-42a0-a42c-f623ce86b7db`
  Dans l'outil Site, cherche un nom de domaine, puis demande un devis, sans rien acheter. Attendu : la recherche répond en 1 à 2 s (elle prenait 26 s), le devis en 1 s environ (il en prenait 12), et les prix sont réels, pas simulés.
- [ ] **T76 · CarPlay : démarrage écran caché, écoute verrouillée, BFMTV** (R-223) — session `local_8fc93e15-f9cd-4c7d-9d2f-1feb2a09e167`
  À faire avec une build iOS qui contient ce code et la correction de package_ios_runtime (T57). (1) iPhone verrouillé : lance Atome depuis CarPlay et parle, puis déverrouille et ouvre l'app. Attendu : l'accueil s'affiche, et non plus « L'affichage n'a pas pu démarrer ». (2) Ouvre l'app sur l'iPhone, lance Atome sur CarPlay, puis verrouille l'iPhone. Attendu : elle continue d'écouter et de répondre. (3) CarPlay branché, l'app au premier plan sur l'iPhone, dis « mets BFMTV ». Attendu : l'écran ne s'éteint plus tout seul et la chaîne joue. (4) CarPlay branché, une conversation ouverte : verrouille l'iPhone 2 minutes, puis demande-lui quelque chose. Attendu : la conversation tient et elle répond. (5) Après l'essai, ouvre Fichiers › Sur mon iPhone › Atome et envoie carplay_journal.log par AirDrop, ou branche l'iPhone au Mac : la session le lira.
- [ ] **T77 · Démarrage : la Matrice de l'accueil sans projet** (R-237) — session `local_41ca1b22-ff9f-4e79-aeff-28418d4f710a`
  Sur l'app Tauri et sur l'iPad : lance l'app. Attendu : l'accueil s'affiche sans erreur et la Matrice y répond sans qu'aucun projet soit ouvert. Ouvre ensuite un projet et fais-y un geste sur un placeholder, un objet et un média (toucher, appui long), puis reviens à l'accueil. Attendu : tout répond, et rien ne casse au retour.
- [ ] **T78 · Appel aléatoire : rencontre à deux, au hasard** (R-173 L5) — session `local_9422776b-43ad-4a36-bf74-b6a1c9a8c9c3`
  Sur un serveur isolé, avec deux comptes de test adultes sur deux appareils ou deux navigateurs : ouvre Contacts › Rencontre › CB, accepte la mention, puis touche l'outil Appel de la bande sur les deux. Attendu : (1) Écran Prêt : le sonar est immobile. Touche Rechercher : les ondes partent du point de voix. (2) Les deux reçoivent l'invitation (le bip de la CB) et ont 21 s pour répondre. A accepte : sa ligne devient « En attente de l'autre… · 0:14 », et le temps descend. B accepte : l'appel s'ouvre, chacun entend l'autre sans tenir de bouton, et on ne voit que des pseudonymes, jamais de nom ni de pays. (3) Fin chez A : l'appel se ferme chez les deux. Couper la connexion de A en plein appel le ferme aussi chez B. (4) Si personne ne répond dans les 21 s, l'invitation tombe et la recherche reprend. (5) Si A a bloqué B, ils ne sont plus jamais mis ensemble, et un blocage en plein appel le ferme. (6) Côté serveur : les prises de l'appel sont enregistrées et chiffrées dans data/cb_recordings, comme la CB (T71), avec le type `call` dans cb_recordings. Il faut le serveur redémarré avec cette version d'atome-server. (7) Deux comptes de langues différentes : chacun entend ou lit l'autre traduit, dans les deux sens. (8) L'app de B fermée : B reçoit une notification de l'invitation. (9) Change la mention pendant l'appel : publie une nouvelle version de la mention en plein appel. Attendu : Fin raccroche quand même, et Rechercher redemande la mention. (10) Blocage pendant les 21 s : A bloque B depuis l'invitation. Attendu : l'invitation disparaît tout de suite chez les deux, sans raison affichée. (11) Second appareil : pendant l'appel, connecte le compte de A sur un 2ᵉ appareil et essaie d'entrer dans le salon. Attendu : refusé ; seul l'appareil qui a touché Accepter est dans l'appel. (12) Paires sur 21 jours : après un appel entre A et B, redémarre le serveur. Attendu : A et B ne sont plus jamais remis ensemble pendant 21 jours, et la table cb_call_pairs ne contient qu'une empreinte et une heure, aucun compte. En production sans ATOME_CB_RECORDINGS_KEY, le journal de démarrage dit « cb call pairs: no key, pairs kept in memory only ». (13) Les deux entendent dès le début : fais dix appels de suite, en touchant Accepter presque en même temps sur les deux appareils. Attendu : à chaque appel, chacun entend l'autre dès l'ouverture, jamais un seul sens pendant tout l'appel. C'était le défaut corrigé le 19 nov. dans `visio_call_runtime.js`. Il faut le client à jour sur les deux appareils.

- [ ] **T79 · Carnet « Entraînement » : Vue, Progrès, Séances, détail** (R-238) — session `local_0bf42321-9de3-4487-8767-9816b2c6238f`
  Sur le Web et sur l'iPad. (1) Fais au moins deux vraies séances du même exercice de musculation avec une charge (par exemple Extension jambes à 30 kg, puis à 34 kg) et enregistre-les. (2) Ouvre Moniteur. Attendu : une tuile « Entraîn… » ; au centre, les minutes de la semaine, avec « min · semaine » en petit dessous ; de petites barres roses dès que la semaine dépasse zéro. (3) Touche la tuile. Attendu : le carnet s'ouvre sur Vue, avec trois cartes (Séances, Minutes, Volume), chacune avec une flèche neutre et l'écart avec la semaine passée ; « 12 semaines » en barres, avec le choix Min, Volume ou Séances ; « Régularité » : 4 semaines du lundi au dimanche, les jours actifs en rose, « N jours actifs sur N ». (4) Touche Progrès. Attendu : l'exercice et « N séances depuis le … » ; le choix Charge, Rép., Séries ou Force (1RM estimé) ; la valeur en grand ; « +4 kg depuis le … » ; la courbe et la mention « record » ; puis les autres exercices avec leur petite courbe. Touche l'un d'eux : sa progression s'affiche. (5) Touche Séances. Attendu : les cartes groupées par semaine (« Cette semaine · N séances · N min »), chacune avec son pictogramme, son nom, sa date et son heure, son volume, ses minutes et l'humeur si elle a été dite. (6) Touche une carte. Attendu : son détail, avec Durée, Volume, Pouls et Énergie quand ils existent ; les barres des séries (kg au-dessus, répétitions dessous) ; le ressenti Avant → Après (Forme, Force, Humeur, la note) ; les objectifs, que tu peux cocher. (7) Glisse ⌂ de côté. Attendu : le détail se ferme d'abord, puis la liste revient. (8) Appui long sur une carte, puis « Supprimer » au second appui. Attendu : la séance disparaît. (9) Depuis la fiche d'un exercice, touche l'outil Journal. Attendu : le carnet s'ouvre sur le Progrès de cet exercice. (10) Sur ordinateur, ou sur l'iPad en paysage large. Attendu : le carnet est sur deux colonnes. Vérifie aussi que les dates sont en français (« Jeu. 19 nov. · 18:42 ») et qu'aucune couleur ne juge : pas de vert, pas de rouge. Non vérifié par la session : l'iPad, les séances importées de Strava, et les pratiques (natation, course) dans le carnet.

- [ ] **T80 · Médiathèque › Données : dossiers, imports, fichiers non lus** (R-202) — session `local_f41d2114-9344-4c85-80a5-b95c4ace5097`
  Vérifié sur le Web par la session ; à essayer sur l'iPad et sur Tauri (texte aussi dans temp/r202_partage/donnees/essai_utilisateur.md). (1) Accueil › Médiathèque. Attendu : la dernière tuile est « Données » ; touche-la. (2) Touche « Dossier » dans la bande du bas. Attendu : un dossier est créé. Tiens-le, puis relâche : Nom · Part. · Suppr. ; « Nom » le renomme. (3) « Import », puis choisis un ZIP. Attendu : il est décompressé en entier dans un dossier à son nom, y compris un ZIP contenu dans le ZIP. (4) « Import », puis choisis plusieurs fichiers d'un coup. Attendu : ils deviennent un dossier « Import <date> », visible aussi dans Créations. (5) Prends un fichier qu'atome ne lit pas (.psd, .key…). Attendu : c'est une demi-tuile, d'une tuile de large ; touché, il est enregistré sur l'appareil. (6) Tiens un fichier puis déplace-le sur un dossier. Attendu : il y entre ; relâché sur place, ses options s'ouvrent ; relâché ailleurs, il revient à sa place. (7) Touche l'outil « Nom ». Attendu : il devient « Date » et l'ordre change. (8) Dans un dossier, touche un texte ou une image. Attendu : il s'ouvre dans l'éditeur de Créer, avec ses outils dans la bande ; le ✕ ramène dans le dossier. (9) Dans un projet ouvert, dépose plusieurs fichiers. Attendu : une demi-tuile de dossier apparaît ; touchée, elle ouvre le projet qui les contient. (10) Attendu : un message discret s'écrit dans le champ du ruban, puis s'efface ; sur téléphone, au Dashboard, le champ s'ouvre le temps du message.

- [ ] **T81 · Clé des enregistrements de la CB créée sur le serveur** (R-173) — session `local_9422776b-43ad-4a36-bf74-b6a1c9a8c9c3`
  À faire à ta prochaine mise à jour du serveur (server_update.js), quand tu la décideras. Attendu : la première fois, le journal montre la phase `cb-recordings-key` avec « ATOME_CB_RECORDINGS_KEY generated in /etc/squirrel/squirrel.env (64 hex digits, mode 0600) », sans la clé elle-même ; les fois suivantes, il montre « present … kept as it is ». Après le redémarrage, le journal d'atome-server ne dit plus « cb call pairs: no key », la CB enregistre (T71), et les paires de l'Appel survivent à un redémarrage (T78). Garde une sauvegarde de /etc/squirrel/squirrel.env : si la clé est perdue, les prises chiffrées deviennent illisibles.

- [ ] **T82 · Retrait de Fastify : serveur de dev, Tauri, iPad, mise à jour du serveur, outils d'exploitation** (R-118 L3.10) — session `local_dfe5bc41-5925-4db6-9936-d834817480f0`
  (1) Serveur de dev : lance `./scripts/run_fastify.sh` (le nom est resté). Attendu : « 🚀 Démarrage d'atome-server... », puis `cargo build --release` (quelques secondes si c'est déjà compilé, sinon environ 11 min), puis le serveur écoute sur 3001 ; un ancien processus sur 3001 est arrêté (« Port 3001 déjà utilisé »). Ouvre http://localhost:3001 : l'app se charge. La connexion par téléphone envoie un vrai SMS, sauf avec `--test`, qui rend le lien directement (« 🧪 Test mode enabled… »). Une fois connecté, tes projets apparaissent, et une modification faite dans un onglet arrive dans un second onglet. Il n'y a plus de processus `node server/server.js`. (2) Tauri (`./scripts/run_tauri.sh`) et iPad, pour vérifier que rien n'a changé : Tauri démarre, se connecte et synchronise ; `--test` ne fait plus que simuler le SMS ; l'iPad s'ouvre et synchronise comme avant. (3) Mise à jour du serveur, après ton commit et ton push, selon le registre R-118 étapes 2 à 6, sur le staging d'abord (`node scripts/server_update.js --staging`). Attendu : les phases `secure-config` (`atome_admin server-identity ensure`), `cb-recordings-key` (T81), `identity-backup` et `rust-build` (qui construit aussi atome_admin) finissent en END, puis `/health`, `/api/server-info` et l'accueil répondent 200. (4) Outils d'exploitation sur le serveur : `/opt/a/target/release/atome_admin`. Ils remplacent les anciens scripts Node. Les commandes : `roles list|show --handle <h>|grant|revoke` ; `public-events reported|restore <id>|withdraw <id>` ; `ai-seats list|find --phone <n>|grant|revoke|unblock|close|open` ; `server-identity ensure|backup|generate`. (5) À vérifier à la main : un compte mail IMAP/SMTP synchronise, envoie et reçoit (sur Tauri, ouvre le mail avant le panneau des réglages : le bug du mot de passe est réparé) ; un appel visio entre deux comptes passe dans les deux sens ; la page et le lien d'installation OTA iOS fonctionnent ; les sites publiés, les domaines personnels et une recherche TONE3000 répondent. Ce qui n'existe plus : `node server/server.js` et le Fastify de référence (les sondes A/B de temp/ ne marchent plus ; pour comparer deux arbres, compile l'autre arbre dans sa propre cible et passe `PROBE_SERVER_BIN`) ; `scripts/ios/deploy.mjs` (l'OTA se déploie par server_update.js) ; les scripts Node d'exploitation et le script npm `generate-keys` ; les variables SQUIRREL_AUTH_OTP_BYPASS et SQUIRREL_AUTH_TEST_MODE ; LIBSQL_URL et TURSO_DATABASE_URL (atome-server refuse de démarrer si elles sont posées). Les 8 alertes `npm audit` sont corrigées sur ta réponse (« Oui, corrige-les ») : 0 vulnérabilité, package.json inchangé, 56 versions d'outils de dev relevées dans le lock en mineure ou en patch (vitest 4.1.12, vite 8.3.8, ws 8.23.0…). À vérifier : `npm run test:run` ou tes tests habituels tournent toujours.

- [ ] **T83 · CB : commandes à eVe** (R-173 L6) — session `local_9422776b-43ad-4a36-bf74-b6a1c9a8c9c3`
  Sur un serveur isolé, avec un compte de test adulte (et un second sur un autre appareil pour l'Appel), parle à eVe ou écris-lui. (1) Dis « Mets la CB sur le 19 » avant d'avoir accepté la mention. Attendu : la mention s'affiche, et eVe ne l'accepte pas à ta place. Accepte-la toi-même et redemande : la CB s'ouvre sur le canal 19. (2) Dis « Mets le 23 », puis « Lance un scan ». Attendu : le canal suit, comme au cadran. (3) Dis « Portée 500 km », depuis 50 km. Attendu : eVe te le demande dans la conversation, à l'oral si tu as parlé, par écrit si tu as écrit, sans aucun panneau ni bouton ; rien ne change avant ton oui, et après ton oui la portée passe à 500 km. (4) Dis « Portée 5 km ». Attendu : c'est fait tout de suite, sans question. (5) Dis « Je suis dispo pour un appel ». Attendu : l'Appel s'ouvre depuis la CB, Dispo. allumé. Quand l'autre appareil cherche et que tu es invité, « accepte » fait poser la question par eVe, et « refuse » se fait tout de suite. (6) Dis « Écris une bouteille : bonjour la mer ». Attendu : eVe relit le texte et te demande avant de la lancer. Puis « Attrape une bouteille » et « Lis-la » : eVe lit les mots. (7) Dis « Ferme la CB ». Attendu : ce qui s'affiche se ferme. Un simple « raccroche » ou « quitte » congédie eVe, comme avant. (8) Mène une longue conversation vocale, de plus de 16 actions. Attendu : eVe ne refuse pas les outils. La limite d'outils compte maintenant par tour de la personne : réparé le 19 nov., avec 27 appels sur une connexion dans la sonde.

- [ ] **T84 · Mystic au-delà de 24 entrées, commandes audio Tauri, erreur de clé IA** (R-173, lot des tests rouges) — session `local_9422776b-43ad-4a36-bf74-b6a1c9a8c9c3`
  (1) Mystic : ouvre un menu Mystic de plus de 24 entrées. Attendu : les 24 premières sont sur l'anneau ; les suivantes ne sont pas coupées, « Suivant » et « Précédent » tournent la page, et les ancres nord, est, sud et ouest restent à leur place sur chaque page. (2) App Tauri, après un nouveau build : (a) importe un son dans un projet, sa durée s'affiche ; (b) dans Réglages › audio, la liste des pilotes s'affiche ; (c) choisis un autre pilote, il est retenu ; (d) dans Multipiste, arme une piste et lance l'enregistrement ; (e) arrête-le, la prise apparaît sur la piste. Attendu : aucune erreur « not allowed ». (3) Erreur de clé IA : sans clé de texte, écris à l'assistante. Attendu : l'erreur est dite dans le dock, sans lien « Clé », et rien ne s'ouvre. Lance ensuite une génération vidéo (Runway) ou musicale (MusicGPT) sans clé. Attendu : le lien « Clé » est là et ouvre le champ de ce service.

## Ajoutés le 18 nov. : questions de test écartées (« je testerai directement tout ce qui était réparé »)

- [ ] **T60 · CB sociale avec un vrai micro** (R-173) — session `local_9422776b-43ad-4a36-bf74-b6a1c9a8c9c3`
  Sur l'iPhone et l'iPad, avec un vrai micro : rejoindre un canal de la CB, prendre la parole, et voir les sous-titres traduits.

- [ ] **T61 · PDF déposé et projet partagé** (R-202) — session `local_f41d2114-9344-4c85-80a5-b95c4ace5097`
  Sur l'iPad et Tauri : dépose un PDF dans un projet. Attendu : une tuile de fichier, et un toucher ouvre le PDF. Partage le projet avec un 2e compte en lecture-écriture : l'autre compte voit et télécharge les fichiers. Passe le partage en Lecture : il ne peut plus écrire. Arrête le partage : le projet disparaît chez lui.

- [ ] **T62 · Couleurs des pistes de la Timeline** (R-199) — session `local_2e6a3d96-d7d6-4e11-8bce-769c8420fce9`
  Sur l'iPad, dans la Timeline d'un projet : la tête de piste garde sa couleur pleine, les clips sont voilés, l'onde et les notes prennent la couleur vive de la piste, et le couloir est à peine teinté.

- [ ] **T63 · Champ Mail de la carte Invit.** (R-163) — session `local_66d86011-2ff8-4b83-9aa8-2c1d166ebbb1`
  Sur l'iPad, ouvre la carte Invit. et touche son champ Mail avec le vrai clavier. Attendu : on peut écrire l'adresse, et une vraie invitation part par mail.

- [ ] **T64 · Prise vidéo supprimée puis annulée** (R-169) — session `local_2c7d69cf-c9fa-4264-bd84-d79334febb72`
  Après le déploiement, sur l'iPhone : supprime une prise vidéo d'un projet, puis « Annuler ». Attendu : elle revient avec sa vidéo, sans cadre vide. Les anciens cadres autour de rien ont disparu après la reconnexion de la synchro.

- [ ] **T65 · Bannir et Refuser dans Contacts** (—) — session `local_41ca1b22-ff9f-4e79-aeff-28418d4f710a`
  Sur l'iPhone, dans Contacts : ouvre une demande en attente. Attendu : Bannir et Refuser sont visibles. Ouvre une demande déjà traitée ailleurs : la conversation s'ouvre, sans ces boutons. Touche Bannir une fois : il devient rouge, sans rien faire d'autre. Une 2e fois : le contact est banni. Un toucher ailleurs annule. Refuser montre un pouce vers le bas, et Bannir un signe d'interdiction. Fais un appui long sur une demande : dans la liste de l'enveloppe, puis sur sa plaque (glisse vers le haut sur l'enveloppe). Les deux ouvrent Bannir et Refuser dans la bande du bas, et Bannir demande toujours deux appuis.

- [ ] **T66 · Enr. sur tous les écrans d'eVe Basic** (R-149) — session `local_6dfc6f10-dd85-4d72-a32d-6a3d4854a7d5`
  Sur l'iPhone, dans eVe Basic : accueil, Agenda › Loisirs › Cinéma, Objectifs › Plan, Contacts › Boutiques › Achats. L'Atome, la loupe et Enr. (disque rouge, 3e case depuis le bout) sont toujours là ; toucher Enr. ouvre Capture.

- [ ] **T67 · Achat d'un complément et vrai panier** (R-119) — session `local_3cd59af8-8800-4107-b533-ef034e0d8011`
  Sur l'iPhone ou Tauri : un maintien sur un complément › Achat ouvre la boutique. Achat ouvre le vrai panier Nutri&Co, rempli, dans le navigateur du système. Le stock se met à jour, et l'événement de l'Agenda se déplace. Dans Boutiques, touche un produit d'une boutique du Web : son rouleau « Quantité » se pose au pied de la liste ; tourne-le, la quantité du panier suit.

- [ ] **T68 · Relire le parcours de tests musique** (R-188) — session `local_7c043c97-17dd-4a66-92d8-0e81fd02fdc3`
  Relis le parcours tests/parcours_musique/ (README, puis 00 à 10 : 249 cas, dont 133 P0) et dis ce qu'il faut compléter. Aucun passage à la main n'a encore été fait.

- [ ] **T69 · Effets audio sur Windows** (R-184) — session `local_166feb68`
  Sur un PC Windows : lance eVe, mets un effet sur une entrée micro et écoute au casque. ASIO : réponse donnée (« Ok pour asio »), codé, R-235 — essais ci-dessous.
  ASIO (R-235, session `local_c90c7471`) : la build Windows compile avec ASIO (Visual Studio, MSVC, LLVM libclang). Mon matériel › Audio liste tes pilotes ASIO ; choisis-en un : le son, l'effet au micro, le chemin direct et une prise marchent. Reviens à WASAPI exclusif ; relance : le pilote choisi revient. Débranche la carte, ou retire son pilote : un message le dit, rien ne passe en douce sur WASAPI. La voix : « joue en ASIO », « reviens en WASAPI ».

## À surveiller au moment du commit

- **Clé CB avant le déploiement** : quand l'arbre déployé contiendra le chiffrement CB de R-173 (9422), ATOME_CB_RECORDINGS_KEY devra déjà être dans l'environnement de la production. Sans elle, la prise de parole CB y est refusée. Le déploiement se fait par git pull et build sur le serveur (server_update.js) : il ne peut donc avoir lieu qu'après ton commit et ton push. dfe5 écrit la procédure dans le registre (R-118 L3.10).
- `atome/src/wasm/.gitignore` contient `*` : tous les fichiers de `atome/src/wasm/` sont ignorés (atome_direct_wasm.wasm, atome_lottie_wasm_bg.wasm, atome_script_wasm_bg.wasm, atome_usd_wasm_bg.wasm…). Il faut vérifier, au moment du commit, si ces wasm doivent être suivis (ils sont construits par le build) ou s'il suffit que le build les produise sur chaque plateforme.
- `eVe/domains/dashboard/dashboard_stage_cells.js` (T04, double tap) n'est pas suivi par Git d'après sa session, alors que l'archive iOS 1.59 le contient : penser à l'ajouter au prochain commit.
