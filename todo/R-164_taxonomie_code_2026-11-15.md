# R-164 — Coder la taxonomie validée (15 nov. 2026)

Source : atelier V12 (`temp/taxonomie_r164/atelier/build.mjs`), planches validées `temp/taxonomie_r164/mockups_v11/`.
Registre des demandes : R-164. Validé par l'utilisateur le 15 nov. : « je valide tout l'ensemble de la tâche ».

## Lots

- [x] L1 Accueil Pro : Activité · V · Réalisations / Médiathèque · Contact / Moniteur (Projets quitte l'accueil, Média devient Médiathèque).
- [x] L2 Tuile Moniteur de l'accueil : la valeur d'un moniteur choisi au centre, puis la suivante (fondu doux).
- [x] L3 Activité : page 1 Sport, Bien-être, Santé, Naviguer, Se déplacer, Achat, Audio, Vidéo, Image ; page 2 Sorties, Vente, Bureautique, Mise en page, Présenter, Code ; outils Récent, Favori ; sortent Compléments, Médicaments (Moniteur › Carnet), Briques, Créer une activité.
- [x] L4 Réalisations : Parcours, Créations, Prises ; outils Récent, Nouv.
- [x] L5 Nouveau : 9 familles (Santé, Écrire, Musique, Image, Vidéo, Scène, Présenter, Apprendre, Vivre) et leurs objectifs.
- [x] L6 Un parcours : où j'en suis (jauge seulement avec une fin), tuiles de ses activités ; outils Étapes, Relier ; Briques disparaît.
- [x] L7 Médiathèque : Films, Vidéos, Télévision, Audio, Musique, Livre, Livre audio (sortent : Images → Prises, Web → Naviguer, Service indisponible).
- [x] L8 Contacts : Réseaux (Réseau Sommeil, forums), Coachs, personnes ; outils Rencontre, Répertoire, Moi, Ajout.
- [x] L9 Moniteur : mesures puis avancée des parcours, tuiles « valeur » ; outils Résultats, Carnet, Ajout.
- [x] L10 Bouton bas-droit d'un projet : retour à Réalisations › Créations, ou au parcours du projet.
- [x] L11 Enr. : entrées rapides QR code et Scanner en plus.
- [x] L12 Une seule liste d'activités : palette Activité d'un projet = Activité › Créer (Présenter, sans Divertissement).
- [x] L13 Registre reconstruit (`npm run registry:build`), cartes, sondes, registre des demandes.

## Fait (15 nov. 2026)

Tous les lots codés et validés. Preuves : `temp/r164_code/levels.probe.mjs` (28/28, niveaux réels du registre bâtis par leurs vrais propriétaires), `monitor_turn.probe.mjs` (9/9), `i18n.probe.mjs` (67 clés × fr/en), `ui.probe.mjs` (app Web réelle, compte neuf, eVe Pro téléphone : 19/19 ; captures `temp/r164_code/ui/`). `npm run registry:check` ok (4535 entrées).

Écarts à valider (registre R-164) : « Où j'en suis » est une tuile valeur 2×2 (la grille n'a pas de carte large) ; Médiathèque sans outils Récent/Favori (seul Liste est devenu un outil) ; Réalisations › Récent liste les projets, pas les prises ; Image ouvre le Dessin du Dashboard ; Réseaux n'apparaît qu'avec un Réseau Sommeil ou un forum ; le retour d'un parcours s'ouvre sur sa page 0.
