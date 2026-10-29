# Tâche accomplie sans suivi — plan et questions (28 oct. 2026)

Demande de Jeezs : pouvoir dire « c'est fait » pour une tâche que l'application n'a pas suivie (oubli de lancer le
suivi, ou refus d'être coaché), plutôt dans les objectifs que dans l'activité. À challenger, questions d'abord, maquette
validée avant tout code d'interface.

## Ce qui existe déjà (vérifié dans le code)

- `eVe/domains/programs/project_program_runtime.js` : l'opération `activity_complete` écrit un enregistrement immuable
  `program_execution` (début, fin, `provenance`, `use_in_followup`, note, minutes actives facultatives, validé par
  `project_program_model.js#validateActivityExecution`). Une correction (`program_execution_correction`) la remplace
  sans réécrire l'histoire. **C'est déjà la déclaration manuelle, mais aucun écran ne l'appelle.**
- Garde actuelle : une occurrence liée à une séance suivie (`link.session_id`) refuse `activity_complete`
  (`program_activity_session_completion_required`). Une séance de Sport commencée puis oubliée ne peut donc pas être
  déclarée faite à la main aujourd'hui.
- Sport : `training.get_exercise` ne compte que les séances terminées ou arrêtées ; Bien vieillir compte les séances de
  Sport (Q8a, 28 oct.). Une déclaration manuelle n'y entre pas encore.
- Le calendrier connaît un statut `done` sur une occurrence ; la progression du Dashboard
  (`dashboard_progression_runtime.js`) lit les exécutions.

## Mon avis (challenge)

1. **Le bon endroit est l'occurrence prévue de l'objectif**, pas la fiche d'exercice : c'est elle qui sait quoi, quand
   et pour quel objectif. On y coche « Fait » : une seule brique, quel que soit le domaine (sport, sommeil, respiration,
   repas, lecture…), comme la règle 2 le veut (un outil, des types compatibles).
2. **Une déclaration n'est pas une mesure.** Elle compte pour la régularité (jours tenus, série, objectif de la semaine),
   mais elle n'alimente ni les charges suggérées, ni la progression des tenues, ni les zones cardiaques : elle n'a pas de
   chiffres. `provenance: 'declared'` la distingue ; rien ne s'invente.
3. **Rien ne se réécrit.** Déclarer après coup ajoute un fait daté (ce qu'on dit avoir fait et quand on l'a dit) ;
   annuler est une correction. Une séance suivie et oubliée reste dans l'histoire, la déclaration se pose à côté.
4. **« Ne pas être coaché » est un réglage de l'objectif**, pas un geste répété : l'objectif passe en mode « je déclare »
   et chaque occurrence montre directement Fait, sans lancer de séance.
5. Zen : pas de bouton de plus sur l'écran normal. « Fait » vit dans l'appui long de l'occurrence (règle de l'appui long
   du Dashboard) ou dans la bande de l'occurrence passée non faite.

## Questions (une à la fois)

1. Où se déclare-t-on ? A : l'occurrence de l'objectif (calendrier / jour de l'objectif) ; B : aussi la tuile de
   l'activité (Sport, Respiration…) ; C : par la voix seulement d'abord (« j'ai fait ma séance »).
2. Une déclaration compte-t-elle comme une séance suivie pour l'objectif (même poids), ou à part (comptée, mais visible
   comme déclarée) ?
3. Peut-on déclarer une durée ou des chiffres (minutes, répétitions), ou seulement « fait » ?
4. Jusqu'à quand peut-on déclarer après coup : le jour même, 7 jours, sans limite ?
5. Le mode « je ne veux pas être coaché » : par objectif, par activité, ou global au profil ?
6. Une séance de Sport commencée puis laissée en cours (Q7, lot L3) : la déclarer faite la termine-t-elle avec ce qui a
   été mesuré, ou reste-t-elle à part ?
7. Rappel : si une occurrence passe sans rien, eVe propose-t-elle de la déclarer (une fois, discrètement), ou jamais
   (zen strict) ?

## Plan après réponses

1. Contrat : `provenance: 'declared'`, la garde `session_id` relâchée selon Q6, lecture par la progression.
2. Commande MCP / voix `program.activity.declare_done` (toute action d'écran a sa commande).
3. Maquette PNG aux vrais jetons de l'endroit choisi (Q1), validation, puis code.
4. Sonde ciblée sous `temp/` sur le vrai pipeline (commit → progression → objectif).
