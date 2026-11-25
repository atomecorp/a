# Inventaire — Projets, objets et vues hors multipiste

Périmètre : Créer, ouvrir, fermer, renommer, dupliquer, supprimer un projet ; ses vues Liste, Matrice, Disposition ; les objets du canevas (formes, dessin, texte, images, 3D), leur sélection et leurs gestes ; le rail du fond ; les interactions et conditions ; annuler / rétablir et l'Historique ; le Finder du projet ; la bande du bas d'un projet.

État : **à relever**. Les cas du parcours de tests ci-dessous décrivent déjà une partie des fonctions ; les
demandes du registre listées plus bas disent ce qui a été demandé dans ce domaine. Chaque fonction relevée
est vérifiée dans le code avant d'être écrite (format dans [README.md](README.md#format-dune-fonction)).

## Sources
- Parcours : [tests/parcours/projets/01_projets.md](../tests/parcours/projets/01_projets.md)
- Parcours : [tests/parcours/dessin/01_dessin.md](../tests/parcours/dessin/01_dessin.md)
- Propriétaires du code : `eVe/domains/projects`, `eVe/domains/creation`, `eVe/domains/templates`, `eVe/domains/scene3d`, `eVe/domains/code_projects`, `eVe/domains/script`, `atome/src/squirrel/projects`, `atome/src/squirrel/creation`, `atome/src/squirrel/conditions`, `atome/src/squirrel/interactions`.

## Fonctions

Aucune fonction relevée pour l'instant. Identifiants : `PRJ-001`, `PRJ-002`… dans l'ordre du relevé.

## Demandes du registre (15)

Titre et statut tels que [todo/REGISTRE_DEMANDES.md](../todo/REGISTRE_DEMANDES.md) les donne le 2026-11-25. Une demande `FAIT`
a des fonctions à relever ; les autres disent ce qui reste ouvert.

- R-358 — Rail d'un projet : Annuler persistant dans la colonne contextuelle (2026-11-25) — `FAIT`
- R-341 — Bande du bas d'un projet : Vue (Enr., Créer) ne réagit plus (iPad, 2026-11-24) — `FAIT`
- R-317 — Annuler profond et rapide ; outil Historique (film des étapes d'un objet ou du projet) (2026-11-24) — `FAIT`
- R-302 — Bande du bas Enr. · Créer · Activité · Vue ; rail par rubriques ; grille de l'aperçu Timeline (2026-11-23) — `FAIT`
- R-292 — Aperçu ne se ferme plus (palette Affichage) sur l'iPhone ; vérifier aussi Inspecteur et Plein écran (2026-11-23) — `FAIT`
- R-257 — Supprimer un projet prend 38 s dans l'app Tauri du Mac (2026-11-21) — `FAIT`
- R-255 — Mode projet : Utilisateur, Aide et Vue hors de la bande du bas ; Vue à la place de Niveau dans Utilitaires (2026-11-21) — `FAIT`
- R-240 — Rail du fond : palette « Visu », Tout voir, outil Texte qui reste, Grille et Verrou (2026-11-19) — `FAIT`
- R-204 — Ouvrir / fermer un projet sans passer par Disposition, vignette = vue laissée, splash iOS, rubriques du Dashboard rangées (2026-11-17) — `FAIT`
- R-180 — iPhone : l'outil « Projets » du coin ne sort plus du projet ; relancer eVe revient où j'en étais (2026-11-15) — `FAIT`
- R-174 — Projet : l'outil du coin ramène à la matrice des Projets ; Dashboard : Enr. sans libellé (2026-11-15) — `FAIT`
- R-169 — Objets fantômes dans les projets (cadres de sélection autour de rien) ; prises vidéo qui disparaissent (2026-11-14) — `OUVERT`
- R-148 — Projet : Trouver déplie son champ dans le ruban, le Finder au-dessus sans champ ; clavier iOS absent (2026-11-13) — `FAIT`
- R-116 — Ruban du projet sur l'iPad : outil Vue disparu, outil du Dashboard qui se décale (2026-11-04) — `FAIT`
- R-007 — Finder du projet : maquette à six états jamais validée — `FAIT`
