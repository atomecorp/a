# Questions à répondre pour finir les tâches (18 nov. 2026)

Chaque bloc est une tâche bloquée par une décision qui n'appartient qu'à toi.

Règle de l'utilisateur (18 nov.) : les questions sur des essais à mener (tests, appareil, relecture d'un parcours de tests, toucher à faire, installation pour essayer) et les lignes « À essayer aussi » sont écartées, jamais posées : « Je testerai directement tout ce qui était réparé… je ferai une passe après de tout ce qui va pas. » La session qui porte la tâche reste ouverte : la discussion « Questions à répondre » lui transmet ta réponse.

## Q01 · Panneau cellules : lecture musicale et options (R-231) — RÉPONDU le 18 nov. : C1–C6 validées ; demande en plus dans Vélocité : un minimum, un maximum et un aléatoire (maquette à faire)
Session : `local_291ba8f7-cf21-4392-94f8-e37115c35fda`  
Où en est la tâche : Lecture des cellules et réglages faits (Rust 93/93, clippy propre) ; WASM Web en file chez l'orchestrateur ; rangée d'outils attend la validation des maquettes.

**Questions :** Toucher une cellule de la Timeline la fait jouer ; il reste la rangée d'outils de lancement. Valides-tu les maquettes C1 à C6 (C1 Réglages allumé, Vue, traits, 6 palettes ; C2 Lancement ; C3 Son : Envel., Vitesse, Pitch, Inverse, Vélocité ; C4 Répét. ; C5 Vue ouverte ; C6 l'ADSR), ou que faut-il changer ? Maquettes : `temp/cell_play_2026-11-17/mockups/`

## Q02 · Atome prompt convertisseurs (R-194) — RÉPONDU le 18 nov. : maquettes M5/M6 validées, « pour le convertisseur, tu peux y aller » (outil Dossier aussi)
Session : `local_d893c4bb-c576-4660-b8ff-252888517559`  
Où en est la tâche : Convertisseurs universels (Office, DAWproject, OTIO, OpenUSD, Lottie) faits ; mise à jour rusqlite et test 2D en attente ; plug-ins M5/M6 à valider.

**Questions :** 1) Valides-tu les maquettes M5/M6 des plug-ins de conversion (`temp/converters_audit_2026-11-16/mockups/planche_plugins.png`) ? Leur UI ne sera codée qu'après. 2) Pour choisir un projet Loopy (`.lpproj` est un dossier, aujourd'hui seulement par dépôt), ajoute-t-on un outil « Dossier » dans l'import de la Médiathèque (oui / non) ?

## Q03 · Création traitement Moniteur Santé (R-229) — RÉPONDU le 18 nov. : 1) 2A, une cloche par ligne ; 2) maquettes 1, 3, 4 validées ; 3) iPhone et iPad (import iOS réparé, essai T57)
Session : `local_f8b801ba-4d94-427c-943f-e009485edca4`  
Où en est la tâche : Import de protocole réparé sur le Web ; harnais de sonde réparé (jamais plus de cargo) ; « Nouveau traitement » attend les maquettes.

**Questions :** 1) Carnet › Traitements, rappel par ligne d'un traitement : 2A (une cloche au bout de chaque ligne) ou 2B (le rappel réglé dans la fiche de la ligne, plus « Rappel » pour toutes) ? 2) Valides-tu les maquettes 1 (Traitements avec « Créer »), 3 (fiche d'une ligne : Genre, Forme, Par prise, Répétition, Heures, Début, Fin) et 4 ? 3) Sur quel appareil l'import du protocole n'a-t-il rien donné ? Maquettes : `temp/health_treatment_2026-11-17/mockups/`

## Q04 · Taxonomie des outils de projet (R-176) — RÉPONDU le 18 nov., directement dans sa session (les 6 questions tranchées au registre R-176 ; Supprimer dans le Mystic de l'élément ; Communiquer et Téléport notés, la session prépare les maquettes Téléporter)
Session : `local_f33b266a-48be-4c5e-9f4f-5bbf75de8dea`  
Où en est la tâche : Revue du rail contextuel contexte par contexte ; page 08 « vues du projet » posée ; rien de R-176 codé.

**Questions :** Page `temp/taxonomie_rail/08_vues.html` (+ PNG). 1) Timeline : Zoom, Hauteur, Côte à côte et Plein écran vont dans le groupe Vue ? 2) Section choisie : groupe « Morceau » (Section, Marqueur, Tempo, Rampe, Signature, Dupl.), ou un autre nom de 7 lettres au plus ? 3) Bloc choisi : Normal. et Inverser dans Son, Titre et Isoler dans Vidéo, et un nouveau groupe Fondu (Entrée, Sortie, Transition, Bord) ? 4) Supprimer une piste, section, boucle ou bloc : une case Suppr. dans le rail, ou par le Mystic de l'élément (à créer où il manque) ? 5) Cellule, Réglages ouverts : le rail ne montre que la cellule, avec les groupes Lancer et Fondu ? 6) Actualités : rail à 6 cases (Lire, Sélect. +, Texte, Tags, Style, Place) ?

## Q05 · Mockups Bouteille à la mer (R-173) — 1) RÉPONDU le 18 nov. : « Oui lance » (lot enregistrement) ; 2) maquettes 21–26 déjà validées le 17 nov. dans sa session (CONCEPT_TRADUCTION_TEMPS_REEL.md §12 ; symbole personne → D « Ondes »)
Session : `local_9422776b-43ad-4a36-bf74-b6a1c9a8c9c3`  
Où en est la tâche : CB sociale : L0–L3, Bouteille et traduction codés et sondés (52/52, 39/39) ; lot suivant « enregistrement » attend ton feu vert.

**Questions :** 1) Je lance le lot suivant, l'enregistrement (il apporte le son au serveur, donc les sous-titres sur de vraies voix) : oui / pas maintenant ? 2) Valides-tu les maquettes 21 à 26 du lot TR (la mer, attraper, ouvrir, lancer) ? Maquettes : `temp/cb_sociale_2026-11-15/mockups/`

À essayer aussi : Essayer la CB sur iPhone et sur iPad avec un vrai micro : rejoindre un canal, prendre la parole, voir les sous-titres traduits.

## Q06 · Tests timeline & sequencer (R-188 (aussi R-196 FAIT ; a lancé la session Prompteur R-211)) — 1) ÉCARTÉE le 18 nov. (question de test : l'utilisateur testera tout lui-même) ; 2) RÉPONDU : « Oui, on les arrête » (5 orphelins, arrêt confié à l'orchestrateur local_bd90a208)
Session : `local_7c043c97-17dd-4a66-92d8-0e81fd02fdc3`  
Où en est la tâche : Le parcours de tests Timeline/musique est écrit (249 cas, 133 P0, dans tests/parcours_musique/). Les sondes automatiques ont tourné. Aucun passage à la main n'a été fait.

**Questions :** 1) Tu relis le parcours tests/parcours_musique/ (README, 00 à 10) et tu dis ce qu'il faut compléter, comme tu l'avais annoncé (« on complètera ce workflow de tests ») ? 2) Une cinquantaine de serveurs atome-server orphelins, laissés par des sondes mortes, occupent les ports 3100 à 4100. On les arrête ? (Oui / Non)

À essayer aussi : iPad atomic dans AUM : recharger la session « Atome Atome recette » (le greffon est hachuré après l'installation), lancer la lecture d'AUM. Résultat attendu : Atome suit la position d'AUM. Aujourd'hui elle reste figée à 2,06 s et le serveur local répond « Request timeout ». Ensuite, faire un premier passage P0 complet, Web + iPad.

## Q07 · Messan panneau UI adjustments (R-208, R-209 (probable : Sport sous la musique, outil « Voix », plus de « Suivant », plus de ← dans « Mes sons »)) — RÉPONDU le 18 nov. : phrases gardées, les deux sur la ← fusionnées en une (garder celle de la bande, retirer le doublon de « An element opened… ») ; retouche confiée à 9774, couloir demandé à l'orchestrateur
Session : `local_9774a7a0-954c-48b5-b0de-8946d74e620f`  
Où en est la tâche : Code fini, manifeste des tests réparé (521 entrées). Il reste l'essai iPhone et une décision sur la charte.

**Questions :** Cette session a ajouté trois phrases à la charte (AGENTS.md, règles 11 à 16) sans ton accord. On les garde ou on les retire ? L'orchestrateur (local_95efc289) doit te présenter le texte exact.

À essayer aussi : iPhone, nouvelle build installée. Lancer une séance de Sport avec ta musique. Attendu : le disque pulse à chaque bip et son chiffre grossit, la voix reste audible, la musique baisse plus tôt et plus longtemps. L'outil « Voix » coupe la voix. Il n'y a plus de « Suivant » dans la bande. Dans « Mes sons », aucune flèche ← : ⌂ glissé de côté revient en arrière.

## Q08 · Partage de projets et stockage fichiers (R-202) — RÉPONDU le 18 nov. : dans un projet, le fichier déposé devient son objet, sans tuile ; un PDF montre sa 1re page et se feuillette sur place une fois ouvert (double toucher), sans lecteur ; un fichier illisible va dans une tuile « Données » de la Médiathèque (dossiers façon Dropbox) ; un ZIP est décompressé dans un dossier à son nom, en vrac (maquettes d'abord, tâche confiée à f41d) ; le filtre « Fichiers » est abandonné ; un projet (ou dossier) partagé porte une petite pastille ou un glyphe, maquette à faire par f41d (et l'appui long le dit aussi) ; aucune limite de 3 Go / 21 Go, seule borne l'espace payé ; dépôt sur une tuile de Projets validé
Session : `local_f41d2114-9344-4c85-80a5-b95c4ace5097`  
Où en est la tâche : Lots L1 à L8 codés (dossier partagé = le projet, tuile de fichier, quotas), et un PDF reste maintenant un PDF.

**Questions :** 1) Un filtre « Fichiers » dans la Médiathèque est un élément nouveau. On le maquette pour validation, ou on s'en passe ? 2) Valides-tu les choix pris par défaut ? Rien sur la tuile d'un projet reçu, seulement une légende dans l'appui long. Limite de 3 Go par fichier et 21 Go par compte. Dépôt possible directement sur une tuile de Projets. Maquettes : temp/r202_partage/mockups/1…6_*.png.

À essayer aussi : iPad et Tauri : déposer un PDF dans un projet. Attendu : une tuile de fichier, et un toucher ouvre le PDF. Partager le projet avec un 2e compte en lecture/écriture : l'autre compte voit et télécharge les fichiers. Passer le partage en Lecture : il ne peut plus écrire. Arrêter le partage : le projet disparaît chez lui.

## Q09 · Partage fichiers vers administrateur et assistant (R-210) — RÉPONDU le 18 nov. : 1) Atome = contact intégré, rapports dans une base du serveur, pièces jointes purgées une fois traitées ; 2) b, Claude classe ; 3) oui, eVe aussi en contact avec une fiche (toucher = l'assistante de la bande, appui long = sa fiche) ; maquettes à suivre
Session : `local_455afb76-feb1-46f9-aae3-eb2603190a5f`  
Où en est la tâche : Plan rendu pour un contact « Atome » qui reçoit des rapports avec pièces jointes. Rien n'est codé.

**Questions :** 1) Qui est « Atome » ? (a) un contact intégré à l'app, dont les messages vont directement dans le dossier des rapports (recommandé), ou (b) ton vrai compte administrateur, dont les messages arrivent dans ta messagerie. 2) Qui choisit l'étiquette Bug / Demande ? (a) la personne, avec un outil au moment de l'envoi, ou (b) personne à l'envoi, Claude trie ensuite (le plus zen). 3) Met-on aussi l'assistant dans les contacts ? On lui parle déjà par le champ du bas, donc la proposition est de ne mettre que « Atome ». Les maquettes (carte Atome, fil, partage vers Atome) suivront tes réponses.

## Q09b · Contacts Atome et eVe : maquettes (R-210, session `local_455afb76-feb1-46f9-aae3-eb2603190a5f`) — RÉPONDU le 18 nov. : glyphe d'eVe = V au point central ; toucher eVe = son fil, micro seul ; fiches refaites avec explications ; textes eVe et Atome rédigés (eveT) ; Atome d'office dans Publier pour tout le monde ; M1, M2, M2b, M3, M4 validées (« Parfait, c'est validé »)
Maquettes `temp/r210_atome_contact/mockups/` M1 à M4. **Questions :** 1) M1–M4 validées ? 2) glyphes : logo atome blanc pour Atome, glyphe rose de l'assistante pour eVe ? 3) textes des fiches et infos sur la société : les tiens, ou la session propose ? 4) dans Publier, Atome présent d'office comme destination (M4), ou seulement dans la liste des personnes ?

## Q10 · Workflow pistes multitrack (R-199) — RÉPONDU le 18 nov. : 1) g1 validé (a) ; 2) peindre en glissant sur M/S sans tenir ; 3) Mute/Solo exclusifs, un dérapage dans un glissé est ignoré, un toucher explicite alterne ; 4) a, dépliée sur place, inspecteur caché, pas de double toucher, idem pour les clips et cellules (Cellules/Scène : Réglages allumé = toucher sélectionne et déplie sans jouer ; session R-231 local_291ba8f7 ARCHIVÉE, travail confié à 2e6a) ; 5) a, tout garder même après réouverture ; 6) a, une seule jauge, la dernière mémorisée
Session : `local_2e6a3d96-d7d6-4e11-8bce-769c8420fce9`  
Où en est la tâche : Couleurs des pistes faites (maquette v4_valide). Les gestes d'en-tête et l'état de la console attendent tes réponses aux 6 questions.

**Questions :** (texte exact des Q1 à Q6 dans la session, résumé tiré du registre)
1) Toucher l'en-tête d'une piste : seule cette piste déplie ses touches M/S (maquette g1) ? Aujourd'hui l'appui long déplie tous les en-têtes.
2) Peindre M/S : un appui tenu puis glissé mute plusieurs pistes d'un trait (g2). Ça contredit la règle 20, où « tenu puis bougé » veut dire déplacer. Laquelle gagne ?
3) Passer de Mute à Solo sans relever le doigt corrige la visée (le Mute est enlevé). OK ?
4) Toucher une piste ou un clip : la déplier sur place, en accordéon de 4 outils de haut (g3), ou garder l'inspecteur, caché par défaut ? Et un double toucher pour l'ouvrir en grand ?
5) État de la console : le garder après un changement de vue ET après fermeture/réouverture du projet (écrit dans le projet) ?
6) « Tous les volumes ouverts par défaut » contredit la règle R-171/20 (une seule jauge ouverte dans toute la console). Laquelle gagne ?
Maquettes : temp/r199_track_headers/mockups/ (g1_toucher_entete.png, g2_peindre_mute.png, g3_piste_depliee.png, v4_valide.png).

À essayer aussi : iPad, Timeline d'un projet. La tête de piste garde sa couleur pleine, les clips sont voilés, l'onde et les notes prennent la couleur vive de la piste, le couloir est à peine teinté.

## Q11 · Contact panel bugs et restructuration (R-163) — ÉCARTÉ le 18 nov. (questions de test : l'utilisateur testera tout lui-même)
Session : `local_66d86011-2ff8-4b83-9aa8-2c1d166ebbb1`  
Où en est la tâche : Rubrique Contacts réparée. Deux points restent bloqués : le clavier réel de l'iPad sur Invit. et l'envoi réel d'une invitation.

**Questions :** 1) Peux-tu faire ce toucher sur Mail ? Il faut un vrai doigt, WDA ne démarre pas. 2) Pour vérifier l'envoi réel d'une invitation, un vrai mail part : es-tu d'accord, et à quelle adresse ?

À essayer aussi : iPad atomic, la carte Invit. est ouverte : touche son champ Mail avec le vrai clavier, puis dis « fait » à la session. Elle relit son enregistreur, corrige la cause et vérifie sur l'iPad.

## Q12 · Objets fantômes dans les projets (R-169) — RÉPONDU le 18 nov. : « Oui » ; vérifié par 2c7d : atome.one fait déjà tourner la corbeille (binaire du 15 nov., fcf4b9867), rien à déployer
Session : `local_2c7d69cf-c9fa-4264-bd84-d79334febb72`  
Où en est la tâche : 13 fantômes supprimés en production (suppression réversible). Une corbeille de 30 jours remplace l'effacement immédiat.

**Questions :** Je pousse les changements et je mets à jour atome.one, puis je prépare la version iOS ? Tant que ce n'est pas déployé, la production tourne sur l'ancien code et les suppressions y effacent encore les fichiers. (Oui / Plus tard)

À essayer aussi : Après le déploiement, sur iPhone : supprimer une prise vidéo d'un projet puis « Annuler ». Attendu : elle revient avec sa vidéo, sans cadre vide. Les anciens cadres autour de rien ont disparu après la reconnexion de la synchro.

## Q13 · Bouton « bannir » et « refuser » — RÉPONDU le 18 nov. : « Ok pour le pouce » + maquette des glyphes à faire (pouce et interdiction) avant code ; maquette validée le 18 nov. (au standard de trait et de taille des autres outils), codée par 41ca (ban.svg, dashboard_contact_request.js), rendu à vérifier par 41ca
Session : `local_41ca1b22-ff9f-4e79-aeff-28418d4f710a`  
Où en est la tâche : Refuser n'apparaît plus que sur une demande vraiment en attente. Bannir demande un double appui (rouge, puis action).

**Questions :** Changer les glyphes : Refuser passe de ↺ à un pouce vers le bas, Bannir de ✕ à un signe d'interdiction ? (Oui / Garder les actuels.) S'il faut un nouveau glyphe, une maquette est à valider d'abord (règle 16).

À essayer aussi : iPhone, Contacts : ouvrir une demande en attente. Attendu : Bannir et Refuser sont visibles. Ouvrir une demande déjà traitée ailleurs : la conversation s'ouvre, sans ces boutons. Toucher Bannir une fois : il devient rouge sans rien faire. Une 2e fois, le contact est banni. Un toucher ailleurs annule.

## Q14 · Outil enregistrement sur tous les dashboards (R-149, R-150 (FAIT au registre)) — RÉPONDU le 18 nov. : (a) retirer la tuile Capture de l'accueil Basic
Session : `local_6dfc6f10-dd85-4d72-a32d-6a3d4854a7d5`  
Où en est la tâche : Enr., l'Atome et la loupe sur tous les écrans eVe Pro et eVe Basic ; réglage « Champ de saisie (Basic) » retiré.

**Questions :** Dans eVe Basic, la tuile Capture de l'accueil est restée (dans eVe Pro elle est devenue l'outil Enr. de la bande). Faut-il aussi la retirer de l'accueil Basic, comme dans Pro ? Options : (a) la retirer, (b) la garder. (Le point « le micro cède sa case » est dépassé : la règle 13, R-224 du 17 nov., garde le micro tant que l'assistante est là.)

À essayer aussi : iPhone, eVe Basic : accueil, Agenda › Loisirs › Cinéma, Objectifs › Plan, Contacts › Boutiques › Achats : l'Atome, la loupe et Enr. (disque rouge, 3e case depuis le bout) sont toujours là ; toucher Enr. ouvre Capture.

## Q15 · Prompt audit refonte Rust WASM Atome Eve (R-118 (EN COURS, code fait)) — RÉPONDU le 18 nov. : « A », la session copie elle-même les coffres sur le serveur, fait l'essai, puis déploie et retire Fastify
Session : `local_dfe5bc41-5925-4db6-9936-d834817480f0`  
Où en est la tâche : refonte Rust-first étapes 1 à 7 codées ; reste la bascule L3.10 en production (retrait de Fastify/Node).

**Questions :** La bascule L3.10 (atome.one servi par le seul serveur Rust, Fastify et la visio Node retirés) attend une copie des coffres de production pour la vérifier, puis le déploiement. Veux-tu la lancer maintenant ? Options : (a) oui, je fournis la copie des coffres et j'autorise le déploiement, (b) plus tard.

À essayer aussi : — (les régressions iOS/Tauri du 7 nov. ont été traitées depuis par R-127/R-128)

## Q16 · Recurring purchase lists and shop management (R-119 (CODÉ, L1–L5)) — RÉPONDU le 18 nov. : 1) b, pas d'affiliation pour l'instant ; 2) quantité à l'écran avec le rouleau du Sport, codée directement sans maquette
Session : `local_3cd59af8-8800-4107-b533-ef034e0d8011`  
Où en est la tâche : achats récurrents : stock des compléments, 28 boutiques, plans par boutique, panier Nutri&Co rempli ; sondes OK.

**Questions :** 1) Comptes d'affiliation : veux-tu ouvrir Amazon Partenaires, Awin, Effiliation et Nutri&Co ? Sans eux, Amazon reste « rappel + lien » et la mention « lien affilié » n'apparaît pas. 2) Régler la quantité d'un produit à l'écran (aujourd'hui seulement à la voix ou par MCP) : veux-tu une maquette (règle 16) ? Options : (a) oui, (b) la voix suffit.

À essayer aussi : iPhone ou Tauri : maintien d'un complément › Achat ouvre la boutique ; Achat ouvre le vrai panier Nutri&Co rempli dans le navigateur du système ; le stock se met à jour et l'événement Agenda se déplace.

## Q16b · Achats récurrents : deux nouvelles questions (R-119, session `local_3cd59af8-8800-4107-b533-ef034e0d8011`) — RÉPONDU le 18 nov. : 3) C, rien depuis Mes courses ; 4) B, phrase coupée « … »
**Questions :** 3) Mes courses, maintien d'un article : remettre « Achat » après Fiche (A), passer par « Web » au-dessus de la liste (B), ou rien (C) ? Capture `temp/achats_recurrents/code/m2b_real.png`. 4) La phrase d'eVe coupée dans le champ du bas d'un téléphone debout (« Multivitami… ») : des mots plus courts « Multivitamines ? » (A), garder « … » (B), autre chose (C) ? Capture `temp/achats_recurrents/code/home_proposal_folded_band.png`.

## Q17 · Évaluation de tâche et faisabilité (R-120 (ATTENTE UTILISATEUR, rien codé)) — RÉPONDU le 18 nov. : partie argent close, remplacée par R-193 ; (a) coder seulement le routage IA serveur avec Not Diamond + grand livre R-193 ; « Il y aura un réglage à l'écran » → maquette à faire par la session
Session : `local_0f22a5c6-146c-4559-83b5-1513e0a8d610`  
Où en est la tâche : IA unifiée, Not Diamond et facturation : évaluée, 2 maquettes et 12 questions posées le 5 nov.

**Questions :** Déjà tranché : Rust dans atome-server, clé Not Diamond dans private/. Reste : 1) valider les maquettes M1 (tuile « Offre » et panneau Abonnement) et M2 (tuile admin « Budget IA », fournisseurs, alertes, interrupteur « Payants ») ; 2) feu vert pour coder d'abord les lots sans dépendance externe (C réservations, B routage, D quota de stockage), le lot E (Stripe, stores) attendant tes comptes et tes prix ; 3) les autres questions posées une à une dans la session (non lisibles ici : les relire dans la session).
Maquettes: temp/notdiamond_billing/mockups/m1_abonnement.png, m2_budget_ia.png

## Q18 · Audit système de paiement Atom (R-121 (ATTENTE R-120)) — RÉPONDU ; 1) le 18 nov. : clé OVH PLUS TARD (« je la créerai plus tard… Tu m'appelleras le workflow… à ce moment-là ») ; domaines simulés d'ici là ; marche à suivre écrite au registre par f679 ; 2) « A », la session crée sites.atome.one maintenant (DNS + nginx/certbot), couloir demandé à l'orchestrateur
Session : `local_f6799464-af7e-42a0-a42c-f623ce86b7db`  
Où en est la tâche : site + domaine + hébergement : OVH registraire retenu ; attend l'API de débit de R-120.

**Questions :** 1) Fournir les clés API de ton compte OVH (à déposer dans private/) ? 2) Feu vert pour créer sites.atome.one et configurer nginx/certbot sur le serveur ? (oui / plus tard). Dépend aussi des réponses de R-120.

## Q19 · Thèmes personnalisés Atom Ev (— (aucune entrée)) — RÉPONDU le 18 nov. : (b) non, les réglages visuels suffisent
Session : `local_d34884dd-44e7-4dd3-b031-0f3e57725c7f`  
Où en est la tâche : demande de thèmes (glace, givre, nuit, jour) jamais traitée : limite hebdomadaire atteinte.

**Questions :** Depuis le 4 nov., Réglages › Visuel règle l'opacité et le flou du verre, le rayon et six couleurs de référence (règle 14). Veux-tu en plus des thèmes complets prêts à choisir (Glace, Givre, Nuit, Jour), le thème actuel restant identique comme « Base » ? Options : (a) oui, avec maquettes d'abord (règle 16), (b) non, les réglages visuels suffisent.

## Q20 · TestFlight installation permissions issue (R-101 (ATTENTE UTILISATEUR)) — RÉPONDU le 18 nov. : (b) Sylvain reste sur TestFlight, rien à inscrire
Session : `local_b91c2c60-3d37-49a5-a62d-e66262f60c8a`  
Où en est la tâche : --adhoc refuse l'iPhone 13 Pro de Sylvain, non inscrit au profil (UDID absent) ; TestFlight marche.

**Questions :** L'iPhone 13 Pro de Sylvain ne peut pas installer les builds Ad Hoc (atome.one) : son UDID n'est pas inscrit. Options : (a) il envoie son UDID (Finder › iPhone › ligne d'infos › UDID › Copier) et on l'inscrit au compte développeur, (b) il reste sur TestFlight, qui marche déjà chez lui (1.39 installée). Peut-être dépassé si le canal TestFlight lui suffit.
## Q21 · chrono remplacé par jiff : deux détails de dates (R-234) — RÉPONDU le 18 nov. : 1) forme JavaScript, 2) garder chrono
Session : `local_9aa2ef10-4ba7-425d-be61-441a9c42f417`  
Où en est la tâche : tout est fait et vérifié (check:rust vert, alerte de sécurité supprimée) ; restent deux choix.

**Questions :** 1) Une date d'année hors de 0 à 9999 (rarissime) s'écrit maintenant comme JavaScript (`+010000`) au lieu de la forme de chrono (`+10000`, que JavaScript refuse) : garder la forme JavaScript (conseillé) ou revenir à chrono ? 2) Une heure locale ambiguë au changement d'heure (ex. 2 h 30 la nuit du passage à l'heure d'hiver, qui existe deux fois) : garder le choix de chrono, la seconde (conseillé : les dates déjà stockées gardent leur sens), ou passer au choix de JavaScript, la première ?


## Q22 · Invitations sur atome.one : réglages du serveur (session archivée `local_0467d00d`) — RÉPONDU le 18 nov. : (c) ne sait plus ; vérification de la seule présence des noms (prod + staging) demandée à l'orchestrateur ; autorisée par l'utilisateur à l'orchestrateur le 18 nov. à 18:47, à faire par dfe5 ou l'orchestrateur (pas par cette discussion)
**Résultat (dfe5, 18 nov., noms seulement, aucune valeur lue) :** prod `/etc/squirrel/squirrel.env` a `ATOME_SIGNUP_CLOSED`, mais PAS `ATOME_SITE_ORIGIN`, `ATOME_MAIL_FROM`, `ATOME_MAIL_SMTP_HOST`, `ATOME_MAIL_SMTP_PASSWORD` ; staging `/etc/squirrel-staging/squirrel.env` a `ATOME_SITE_ORIGIN`, mais PAS `ATOME_SIGNUP_CLOSED` ni les trois `ATOME_MAIL_*`. (`TONE3000_SECRET_KEY` : staging seulement, copie en prod confiée à dfe5.) Question posée à l'utilisateur : qui ajoute les réglages manquants.
Le code est fini, et le vrai mail d'invitation est bien arrivé. **À faire par toi :** ajoute dans `/etc/squirrel/squirrel.env` (et dans l'env de staging) `ATOME_SIGNUP_CLOSED=1`, `ATOME_SITE_ORIGIN`, `ATOME_MAIL_FROM`, `ATOME_MAIL_SMTP_HOST` et `ATOME_MAIL_SMTP_PASSWORD`, puis commit, push et déploiement. **Question :** est-ce déjà fait ?

## Q23 · Calc, le tableur dans le texte (session `local_ee16b837-e327-4cf7-8567-6178617c193a`) — RÉPONDU le 18 nov. : 1) rapport d'import = message discret ; outil « Format » (maquette de son panneau) ; outil Template ; éditeur de code en mode script, Ruby ou assistant IA ; 2) profil MCP accordé (« Oui ajoute ce profile… voix ou… input de prompt »)
Le code est fini sur le Web. Restent : 4 panneaux sans maquette (rapport d'import, réglage d'une cellule, choix d'un modèle, édition d'un script), et le profil de sécurité MCP qui limiterait l'IA au document. **Questions :** 1) Je fais les maquettes de ces 4 panneaux ? 2) Ton accord pour ce profil de sécurité ? Les défauts d'affichage relevés (« 1 225 € », grille coupée, noms en « _2 ») seront réparés avec.

## Q24 · Audit : push, TestFlight, audit (session `local_f27cfc4e-f32f-43aa-a4fe-356e5af0c7b0`, 29 oct.) — RÉPONDU le 18 nov. : (a) dépassée, session archivée le 18 nov.
Elle attend ton « vas-y » pour pousser, faire une build TestFlight, puis l'audit. Depuis, d'autres sessions ont poussé et publié. **Question :** je l'archive comme dépassée (conseillé), ou elle repart ?

## Q25 · Effets audio : ce qui reste à toi (session archivée `local_166feb68`) — RÉPONDU le 18 nov. ; essai Windows ÉCARTÉ (test) ; 1) : clé TONE3000 à copier de private/ vers le serveur (autorisé par l'utilisateur, confié à l'orchestrateur ; TONE3000 est déjà porté en Rust) ; 2) « Ok pour asio » (kit Steinberg accepté) ; session 166feb68 rouverte le 18 nov. et tâche ASIO transmise ; copie de la clé TONE3000 confiée par l'orchestrateur à dfe5 (même redémarrage que R-118 L3.10)
**Questions :** 1) Ton accord pour mettre la clé TONE3000 et `server/ws_tone3000.js` sur atome.one ? 2) Windows : fais-tu l'essai, et la décision ASIO (oui ou non) ?

## Q26 · Installer la nouvelle build sur ton iPhone (session `local_731f62e4-c840-4cd6-993c-f526184eee1b`) — ÉCARTÉ le 18 nov. (installation pour essai : l'utilisateur testera tout lui-même)
La build Debug 1.59 (57) du 18 nov. est prête dans la DerivedData. Elle contient le renderer a12c97d09b401efe (grille des Créations, iPhone qui ne rame plus), l'audio-wasm (lecture à l'envers, warp) et la correction CarPlay. Tu as dit « laisse tomber l'installation iPhone pour le moment ». **Question :** dis « installe » quand ton iPhone est rebranché, et 731f l'installe.

## Q27–Q31 · Dernière série (19 nov.) — RÉPONDU : « 1A, 2B, 3a-3, 3b oui, 3c les deux, 4B, 5A »
- Données (R-202) : A, A, A (dernière tuile, outil Dossier, Suppr. → corbeille 30 j) ; pastille « partagé » : 3. Transmis à f41d (rouverte).
- Q27 message discret dans un projet : A, dans le champ de la bande du projet (maquette 7), le champ s'ouvre sur téléphone. Transmis à f41d et ee16 (un seul propriétaire).
- Q28 palette Template sur téléphone (R-236) : B, ranger les modèles autrement, maquette d'abord. Transmis à ee16 (rouverte).
- Q29 inspecteur de cellule (R-199) : ADSR « forme » (maquette 3) ; enveloppe sur la forme d'onde quand l'inspecteur est ouvert ; Début/Fin et Ratchet tous les deux. Transmis à 2e6a (rouverte).
- Q30 réglages mail des invitations : B, copie depuis `private/mail atome` (local, ignoré par git) vers prod et staging, sans afficher les valeurs. Transmis à dfe5 (rouverte).
- Q31 message à l'équipe Atome dans Publier : A, il part tout de suite (comportement actuel gardé, rien à faire).
- Reste à l'utilisateur : l'enregistrement DNS `sites` chez o2switch.
