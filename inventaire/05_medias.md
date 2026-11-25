# Inventaire — Médias, capture, import et écrans

Périmètre : Le panneau d'import unique (règle 18) et où va un import ; les convertisseurs (DAWproject, OTIO, Office, Lottie…) ; Capture (photo, vidéo, son) et les listes de prises ; la Médiathèque et ses listes ; la lecture d'une vidéo, d'une photo, d'un son ; la musique écoutée (Apple Music, Spotify) ; TV, YouTube, PeerTube, films, livres et livres audio ; les écrans connectés (HDMI, AirPlay, Cast, second moniteur).

État : **à relever**. Les cas du parcours de tests ci-dessous décrivent déjà une partie des fonctions ; les
demandes du registre listées plus bas disent ce qui a été demandé dans ce domaine. Chaque fonction relevée
est vérifiée dans le code avant d'être écrite (format dans [README.md](README.md#format-dune-fonction)).

## Sources
- Parcours : [tests/parcours/medias/01_medias.md](../tests/parcours/medias/01_medias.md)
- Propriétaires du code : `eVe/domains/media`, `eVe/domains/capture`, `eVe/domains/screens`, `eVe/domains/books`, `eVe/domains/apple_music`, `eVe/domains/news`, `eVe/domains/page_preview`, `atome/src/squirrel/media_import`, `atome/src/squirrel/media_lists`, `atome/src/squirrel/capture`, `atome/src/squirrel/films`, `atome/src/squirrel/tv`, `atome/src/squirrel/youtube`, `atome/src/squirrel/online_video`, `atome/src/squirrel/peertube`, `atome/src/squirrel/books`, `atome/src/squirrel/apple_music`, `atome/src/squirrel/music`.

## Fonctions

Aucune fonction relevée pour l'instant. Identifiants : `MED-001`, `MED-002`… dans l'ordre du relevé.

## Demandes du registre (20)

Titre et statut tels que [todo/REGISTRE_DEMANDES.md](../todo/REGISTRE_DEMANDES.md) les donne le 2026-11-25. Une demande `FAIT`
a des fonctions à relever ; les autres disent ce qui reste ouvert.

- R-357 — Projet : un outil « Médias » qui liste les assets du projet par type (supprimer, remplacer, ajouter) (2026-11-25) — `FAIT`
- R-350 — Second moniteur de l'iPad : formes d'onde floues, mouvement en différé, bande du bas absente (2026-11-24) — `FAIT`
- R-248 — AirPlay et Chromecast : un bouton et la voix pour envoyer la vue sur un écran nommé (2026-11-20) — `ATTENTE UTILISATEUR`
- R-232 — Capture : un ✕ pour fermer le panneau, et Caméra à côté d'Enreg. avant la prise (2026-11-18) — `FAIT`
- R-212 — Écrans connectés : HDMI / USB-C, AirPlay / Cast, second écran du Mac (2026-11-17) — `FAIT`
- R-205 — Import universel : dans un projet tout va dans le projet ; hors projet média → Médiathèque, fichier complexe → nouveau projet ouvert (2026-11-17) — `FAIT`
- R-216 — Musique : Préc./Suiv. changent de morceau ; la musique reprend après une prise (2026-11-17)
- R-194 — Convertisseurs universels : registre unique d'import, DAWproject, OTIO, SFZ, OpenUSD, Lottie, Office ; export plus tard (2026-11-16) — `FAIT`
- R-185 — Réalisations › Prises : filtre par type, aperçu qui ne s'affiche pas (iPhone), aperçu et liste jusqu'en haut (2026-11-15) — `OUVERT`
- R-168 — Appui long sur une prise : espace vide au-dessus des outils, glyphe Atome du son, renommer sur place, aperçu vidéo (2026-11-14) — `FAIT`
- R-167 — Listes : outil « Liste » partout (appui long, sélection multiple, médias) ; Médias › Listes : Créer, Ajouter, Envoi, nom en place (2026-11-14) — `FAIT`
- R-166 — Liste des prises (son, vidéo) : toucher ou tenir une ligne reste dans le panneau, outils dépliés, rognage vidéo (2026-11-14) — `FAIT`
- R-165 — Ruban projet : outils qui passent sous l'Atome ; Capture : prise dès l'ouverture, Enr. rouge qui devient ✕ (2026-11-14) — `FAIT`
- R-158 — Vidéo : pendant une prise, l'aperçu caméra prend presque tout l'écran ; la liste revient à l'arrêt (2026-11-14) — `FAIT`
- R-131 — Listes de prises : tête de lecture, appui long (onde, rognage, renommer), Aucun, Préc./Suiv., une seule logique (2026-11-12) — `OUVERT`
- R-130 — Listes Captures : rangées qui se défont au glisser, Suppr. inutile, suppression des cases cochées ; rouleaux Sport (2026-11-12) — `OUVERT`
- R-011 — TV et YouTube : restes ouverts — `FAIT`
- R-012 — Musique en cours : recherche de position Spotify — `FAIT`
- R-212 (suite) — iPad : double écran, Trackpad sans sortie, déconnexions (2026-11-24)
- R-212 (souris iPad) — la souris de l'iPad se fige dès qu'elle entre sur le moniteur externe (2026-11-24) — CODÉ, À ESSAYER PAR TOI (build ≥ 60)
