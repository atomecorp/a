# Nombre d'or — tâche transverse (brief, 28 oct. 2026)

À lancer comme session « Nombre d'or » depuis l'app de bureau (Remote Control ne permet pas de démarrer une session).

## Norme

AGENTS.md règle 19, « Golden numbers » (validée par Jeezs le 28 oct. 2026) : toute valeur proposée par eVe est un
nombre de Fibonacci ou un multiple de 3 (3, 6, 9…), jamais un 4, 10, 20, 25 arbitraire. Le temps en base 60 est déjà
naturel (30, 45, 60, 90, 120 s). Les quantités liées au monde (poids de salle, emballages, normes) gardent leur pas, une
valeur naturelle étant préférée à un pas près. Une progression va d'un nombre naturel au suivant. Ce que la personne
règle reste à elle.

## Périmètre du code : valeurs de l'alimentation et de toutes les activités

- Alimentation : `atome/src/squirrel/food/`, `atome/src/shared/food_*`, `atome/src/shared/shopping_list_contract.js`,
  `atome/src/squirrel/shopping/`, menus.
- Activités et santé : briques `program_brick_catalog.js`, sommeil, sieste et méditation, respiration, marche, objectifs
  et routines (`objective_routine_model.js`), programmes santé et leurs durées.
- Méthode : chaque valeur classée (déjà naturelle / à changer, nombre naturel le plus proche, Fibonacci à égalité / liée
  au monde), changement chez le propriétaire canonique, sonde ciblée sous `temp/` sur le vrai mécanisme.

## Interface : audit seulement, pas de code pour l'instant

Mesurer jusqu'où l'interface suit déjà la norme et comment elle pourrait la suivre mieux : tailles, espacements, nombre
d'éléments par rangée, durées d'animations et de minuteries, pas des contrôles, aimantation des curseurs sur les valeurs
naturelles (décrite par la règle 19). Résultat et propositions concrètes dans ce fichier.

## Hors périmètre

- Sport (`atome/src/shared/training_catalog.js`, `eVe/domains/training/*`, `eVe/domains/dashboard/dashboard_training*.js`) :
  traité par la session Activités/Sport avec la session « Catégories manquantes en musculation ».
- Les 11 écrans que la session « Valeurs restantes vers le curseur transverse » migre : ne pas les éditer pendant qu'elle tourne.

Pas de commit ni de push. Mettre à jour FRAMEWORK_STATE §5 et `maps/` avec les faits vérifiés.

## Audit des valeurs

(à remplir)

## Audit de l'interface

(à remplir)

## Brique disponible (28 oct., session Activités/Sport)

`atome/src/shared/natural_numbers.js` : `isNaturalNumber`, `nearestNaturalNumber`, `nextNaturalNumber`,
`naturalReachableValue(value, step)`, `nextNaturalReachableValue(value, step)` — à réutiliser, jamais recopier. Le Sport
(catalogue, progression, charges) est déjà appliqué. L'« i » des nombres d'or est livré dans la carte Sport
(`dashboard_band_sliders.js#grid({ infoKey: 'eve.training.golden_numbers' })`, outil « i » de `matrix_slider_info.js`) ; l'alimentation
le réutilise de la même façon (son propre texte, même brique).
