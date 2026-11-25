# Inventaire — Dashboard et accueil

Périmètre : L'accueil (eVe Pro, eVe Basic), le bandeau du haut, les rubriques et leurs niveaux, le Moniteur comme rubrique, la navigation (⌂, pages au glisser), la bande du bas du Dashboard (assistant, champ, Enr., outil d'état), les profils de vie, les activités en cours, le premier lancement guidé.

État : **à relever**. Les cas du parcours de tests ci-dessous décrivent déjà une partie des fonctions ; les
demandes du registre listées plus bas disent ce qui a été demandé dans ce domaine. Chaque fonction relevée
est vérifiée dans le code avant d'être écrite (format dans [README.md](README.md#format-dune-fonction)).

## Sources
- Parcours : [tests/parcours/transverse/01_parcours_croises.md](../tests/parcours/transverse/01_parcours_croises.md)
- Propriétaires du code : `eVe/domains/dashboard`, `eVe/domains/life_profiles`, `eVe/domains/live_activity`, `eVe/domains/matrix`, `atome/src/squirrel/dashboard_progression`, `atome/src/squirrel/life_profiles`.

## Fonctions

Aucune fonction relevée pour l'instant. Identifiants : `DSH-001`, `DSH-002`… dans l'ordre du relevé.

## Demandes du registre (21)

Titre et statut tels que [todo/REGISTRE_DEMANDES.md](../todo/REGISTRE_DEMANDES.md) les donne le 2026-11-25. Une demande `FAIT`
a des fonctions à relever ; les autres disent ce qui reste ouvert.

- R-287 — Ouverture d'un projet depuis le Dashboard : une fois sur deux, des morceaux du Dashboard restent visibles à droite (2026-11-23) — `EN COURS`
- R-281 — Logo V central : dalles collées autour ; glisser vers le bas = Réglages directement (2026-11-23) — `FAIT`
- R-252 — Accueil eVe Pro : le dernier projet modifié au-dessus du logo V (2026-11-21) — `FAIT`
- R-219 — Créations / Projets : tri par date ou par nom, nom entier à l'appui long, aspect du dernier projet utilisé (2026-11-17) — `FAIT`
- R-217 — Suite de R-208 : le « < » des panneaux autonomes, qui n'ont pas de ⌂ (2026-11-17) — `FAIT`
- R-208 — Bande du bas : plus de ← ; Sport sans « Suivant » ; musique : voix qui baisse plus tôt et plus longtemps, plus de bips sous la musique (2026-11-17) — `FAIT`
- R-207 — Outil d'état : séance finie non enregistrée qui disparaît ; ⌂ qui marche mal ; médias en fond dans l'outil d'état et l'aperçu (2026-11-17)
- R-176 — Appui long sur un projet : projet centré, nom entier au-dessus des outils, outil Nom, renommer sur place (2026-11-15) — `FAIT`
- R-172 — Accueil du Dashboard : l'outil V deux fois (bandeau + centre) ; rendez-vous sur 4 unités au 1er écran (2026-11-15) — `FAIT`
- R-164 — Taxonomie complète des Dashboards : Activité, Objectifs, Dossiers (2026-11-14) — `FAIT`
- R-162 — ⌂ glissé : retour au panneau précédent, plus à l'accueil (2026-11-14) — `FAIT`
- R-154 — Bande du bas : un seul outil messages + activité en cours ; ← seul, pages au glisser (2026-11-13) — `FAIT`
- R-152 — Dashboard : bandeau permanent en haut (heure · outil V des profils · prochain rendez-vous) (2026-11-13) — `FAIT`
- R-149 — Dashboard : l'outil Enr. sur tous les écrans, avec l'Atome et la recherche (2026-11-13) — `FAIT`
- R-150 — eVe Basic : Enr. et la loupe permanents aussi (2026-11-13) — `FAIT`
- R-147 — Dashboard : tuiles et outils rétrécis (cellule 64 → 42 px sur iPhone 17 Pro) après un aller-retour paysage (2026-11-13) — `CODÉ`
- R-144 — Accueil eVe Pro debout : l'heure, la météo et l'Agenda trop loin du haut (2026-11-13) — `CODÉ`
- R-143 — Dashboard : les tuiles changent de taille quand le téléphone passe en paysage (2026-11-13) — `FAIT`
- R-133 — Accueil eVe Pro : la tuile Capture devient l'outil « Enr. » de la bande ; bande « Finder » élargie corrigée (2026-11-12) — `ATTENTE UTILISATEUR`
- R-117 — Écran guidé « deux façons » : textes superposés, prononciation d'eVe (2026-11-04) — `FAIT`
- R-114 — Tuiles de l'accueil adaptées à l'écran (iPhone, Android, iPad) — `FAIT`
