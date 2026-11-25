# Inventaire — Design, charte et composants d'interface

Périmètre : La charte (AGENTS.md règles 11–16) vue comme fonctions : thèmes (Nuit, Ambre, thèmes perso), Réglages › Visuel, grille unique, taille physique, palettes et leur geste continu, rail contextuel, panneaux et leur attache, sliders, rouleaux, accordéons, listes, clavier et saisie, sélection de texte, fond d'écran.

État : **à relever**. Les cas du parcours de tests ci-dessous décrivent déjà une partie des fonctions ; les
demandes du registre listées plus bas disent ce qui a été demandé dans ce domaine. Chaque fonction relevée
est vérifiée dans le code avant d'être écrite (format dans [README.md](README.md#format-dune-fonction)).

## Sources
- Parcours : aucun pour l'instant.
- Propriétaires du code : `eVe/elements`, `eVe/intuition/ribbon`, `eVe/intuition/menu`, `eVe/intuition/mystic`, `eVe/intuition/shared`, `eVe/intuition/runtime/bevy_panel`, `atome/src/squirrel/visual_theme`, `atome/src/squirrel/wallpaper`, `atome/src/squirrel/components`.

## Fonctions

Aucune fonction relevée pour l'instant. Identifiants : `DSN-001`, `DSN-002`… dans l'ordre du relevé.

## Demandes du registre (18)

Titre et statut tels que [todo/REGISTRE_DEMANDES.md](../todo/REGISTRE_DEMANDES.md) les donne le 2026-11-25. Une demande `FAIT`
a des fonctions à relever ; les autres disent ce qui reste ouvert.

- R-359 — Rail contextuel d'une couleur légèrement différente ; étude pour la rangée au-dessus de la bande (2026-11-25) — `FAIT`
- R-308 — Palettes : appui glissé = palette sous le doigt, relâcher = choix ; touche = rail de droite (2026-11-24) — `FAIT`
- R-280 — Même taille physique des outils, tuiles et textes sur tous les appareils (2026-11-23) — `FAIT`
- R-279 — Nouveau thème « Ambre » : un gris foncé pour tout le système, textes et logos en orange, sélecteur de thème dans Réglages (2026-11-23) — `FAIT`
- R-274 — Palettes et panneaux unifiés : geste continu, contour commun outil + panneau, séparateur des Cellules, détachement et rattachement magnétique (2026-11-22) — `FAIT`
- R-261 — Une seule grille, un objet par case : ce qu'une liste ou des choix dépliés couvrent est retiré le temps du dépliage ; liste à 1 px entre rangées (2026-11-22) — `FAIT`
- R-250 — Palette en liste (½ outil × 2 outils, glyphe + texte) ; rail de la vue projet par vue : Mode, Gestes, Infos, Entrée (2026-11-21) — `FAIT`
- R-244 — Sélection de texte (suite de R-242) : glisser vers le haut = bande contextuelle (calcul, visuels, Web, Assistant) ; rail de la sélection (2026-11-19) — `FAIT`
- R-242 — Clavier iOS / Android : la saisie au-dessus du clavier et des outils ; texte en édition : clavier qui clignote, bords de sélection, glissés (2026-11-19) — `FAIT`
- R-218 — Rouleaux : molette, souris, élan physique au doigt (2026-11-17) — FAIT (Web + iPad au toucher) ; à toi : la souris sur l'iPad
- R-201 — Appui long sur une tuile : tuile et bandeau hors de la grille unique (2026-11-17) — `FAIT`
- R-198 — Une palette ouverte se lit comme un seul bloc avec ses outils, partout dans le framework (2026-11-16) — `FAIT`
- R-197 — Verre des outils illisible sur fond blanc, rendu « crade » : nouveau style (2026-11-16) — `FAIT`
- R-176 — Taxonomie du rail contextuel, contexte par contexte (2026-11-16)
- R-126 — Icônes en PNG au lieu du SVG demandé : challenger le choix, mesurer son poids en mémoire (2026-11-07) — `OUVERT`
- R-115 — Cahier D18 : améliorations 1–15 et débogages D1–D21 (2026-11-04) — `ATTENTE UTILISATEUR`
- R-015 — Curseurs : derniers curseurs hors du curseur unique — `FAIT`
- R-111 — Trois tâches du 2026-11-02 : balayages, menus + « en cours », normes design V6.1 — `ATTENTE UTILISATEUR`
