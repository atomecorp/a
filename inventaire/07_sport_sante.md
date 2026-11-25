# Inventaire — Sport, santé, objectifs et bien-être

Périmètre : Sport (cartes d'exercice, disque, séries, progression, voix, mode zen), Séances, Réalisations (Objectifs, Parcours, Prises), Résultats, le Carnet de santé et ses traitements, le pouls et les mesures (Apple Health, Health Connect), GPS et Strava, coachs, la montre ; Bien-être (beauté, thalasso, souffle) et l'alimentation.

État : **à relever**. Les cas du parcours de tests ci-dessous décrivent déjà une partie des fonctions ; les
demandes du registre listées plus bas disent ce qui a été demandé dans ce domaine. Chaque fonction relevée
est vérifiée dans le code avant d'être écrite (format dans [README.md](README.md#format-dune-fonction)).

## Sources
- Parcours : [tests/parcours/objectifs/01_objectifs.md](../tests/parcours/objectifs/01_objectifs.md)
- Propriétaires du code : `eVe/domains/training`, `eVe/domains/health_record`, `eVe/domains/health_protocol`, `eVe/domains/prescription`, `eVe/domains/objectives`, `eVe/domains/programs`, `eVe/domains/gps`, `eVe/domains/strava`, `eVe/domains/coaches`, `eVe/domains/video_train`, `eVe/domains/watch`, `eVe/domains/results_send`, `eVe/domains/journal`, `eVe/domains/beauty`, `atome/src/squirrel/training`, `atome/src/squirrel/health`, `atome/src/squirrel/objective_network`, `atome/src/squirrel/objective_program`, `atome/src/squirrel/brick_sessions`, `atome/src/squirrel/thalasso`, `atome/src/squirrel/food`, `atome/src/squirrel/beauty`.

## Fonctions

Aucune fonction relevée pour l'instant. Identifiants : `SAN-001`, `SAN-002`… dans l'ordre du relevé.

## Demandes du registre (30)

Titre et statut tels que [todo/REGISTRE_DEMANDES.md](../todo/REGISTRE_DEMANDES.md) les donne le 2026-11-25. Une demande `FAIT`
a des fonctions à relever ; les autres disent ce qui reste ouvert.

- R-298 — Sport : mode zen par appui long sur le disque (2026-11-23) — `FAIT`
- R-302 — Carnet de santé : fichiers importés dans les listes, visionneuse, Éditer / Envoyer / Suppr. (2026-11-24) — `FAIT`
- R-301 — Objectifs définis dans Réalisations › Objectifs ; Créer = créations seulement (2026-11-23) — `FAIT`
- R-300 — « Séance » (nom choisi 24 nov.) : macro-activité assemblée dans Réalisations › Parcours (2026-11-23)
- R-259 — Moniteur : appui long « Favori » remplacé par « Accueil » ; mode Duo supprimé (2026-11-21) — `FAIT`
- R-238 — Carnet d'entraînement du Sport, dans le Moniteur (2026-11-18) — `FAIT`
- R-230 — Carte Sport tournée paysage → portrait : texte décalé, étiré, hors écran ; flou mal cadré (2026-11-17) — `ATTENTE UTILISATEUR`
- R-229 — Carnet › Traitements : « Nouveau traitement » et import CSV / Excel / PDF d'un protocole (2026-11-17) — `FAIT`
- R-225 — Sport sur l'iPad atomic : voix et sons entrecoupés, qui tremblent (2026-11-17) — `FAIT`
- R-221 — Apple Watch : vérifier les grandes lignes (lancer une activité…) et maquettes pour revoir le design (2026-11-17) — `FAIT`
- R-214 — Sport : poids d'échauffement entiers et dans l'ordre, voix du poids à mettre (2026-11-17) — `FAIT`
- R-213 — Sport : tri alphabétique, voix « série suivante », phrases entières, Filmer avec choix de caméra (2026-11-17) — `FAIT`
- R-209 — Sous la musique : bip visuel (le disque pulse avec le chiffre en gros), voix toujours présente, outil « Voix » pour la couper (2026-11-17) — `FAIT`
- R-200 — Moniteur : retirer un moniteur, le sortir du cycle de l'accueil, fondu du cycle à 1,2 s (2026-11-16) — `FAIT`
- R-160 — Moniteur : « Résultats » et « Carnet » deviennent des outils, plus des tuiles (2026-11-14) — `FAIT`
- R-146 — Sport : choix « un côté après l'autre / les deux à la fois » pour tout exercice de bras ou de jambes (2026-11-13) — `CODÉ`
- R-145 — Sport : pouvoir choisir « 0 / ne pas augmenter » dans le pas de progression (2026-11-13) — `CODÉ`
- R-144 — Sport : carte d'exercice trop serrée, options invisibles, titre en double (2026-11-13)
- R-142 — Sport : pouls figé (96 au lieu de 130) puis « Aucune mesure » pendant Sprint HIIT (2026-11-13) — `CODÉ`
- R-141 — Sport : recherche « HIT » sans résultat, tuiles muettes ensuite, Sprint HIIT impossible à ouvrir dans Cardio (2026-11-13) — `CODÉ`
- R-140 — Sport : rappel vocal à chaque fin de série d'augmenter la charge selon la progression choisie (2026-11-13) — `CODÉ`
- R-139 — Sport : bips ratés, sautés ou en rafale quand Atome n'est plus au premier plan (2026-11-13) — `CODÉ`
- R-138 — Sport : après un changement de Forme ou de Force, le panneau suivant bloque ; vérifier tout le parcours (2026-11-13) — `OUVERT`
- R-137 — Sport : total des durées d'exercice de la journée, à jour en continu, consultable à tout moment (2026-11-13) — `CODÉ`
- R-136 — Sport : lag au réglage de la Force juste après la Forme, au lancement d'une activité (2026-11-13) — `CODÉ`
- R-132 — Pouls illisible (Moniteur, Sport) et absent des cartes Marche / Fitness (2026-11-12) — `ATTENTE UTILISATEUR`
- R-129 — Sport : Pompes ne se lance pas, séries et repos à enchaîner seuls, rappel « ajoute N kilos » (2026-11-11) — `OUVERT`
- R-005 — Activités : cahier des charges jamais coché — `FAIT`
- R-016 — Résultats : lots après le lot A — `ATTENTE UTILISATEUR`
- R-113 — Montre : tuiles jamais reçues (glyphe iPhone seul) — `ATTENTE UTILISATEUR`
