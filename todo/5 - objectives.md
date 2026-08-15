# Atome / eVe — Cahier des charges du système d’objectifs et scénarios pré-câblés

## 0. Contexte séparé : modes Liste / Matrice

Un chantier distinct restera à finaliser concernant les **modes de représentation et d’usage**, notamment pour l’audio et les médias :

- mode Liste ;
- mode Matrice ;
- comportement spécifique aux sons, morceaux, clips, pistes et autres médias ;
- règles de lecture, sélection, lancement, regroupement et navigation propres à chaque mode ;
- cohérence avec les vues Song / Structure / Piste et avec les outils temporels.

Ce sujet doit être traité dans un cahier des charges séparé après discussion détaillée afin de ne pas figer prématurément un comportement encore en réflexion.

---

# 1. Vision

Atome/eVe doit proposer un système d’objectifs beaucoup plus large qu’un gestionnaire de projets classique.

L’utilisateur ne crée pas simplement une liste de tâches.

Il exprime un résultat qu’il veut atteindre, par exemple :

- créer un album ;
- préparer un concert ;
- réaliser un film ;
- organiser une grande randonnée ;
- perdre du poids ;
- prendre de la masse ;
- mieux dormir ;
- courir un marathon ;
- monter une société ;
- financer un projet ;
- organiser un événement ;
- réunir une équipe ;
- apprendre une compétence ;
- trouver des collaborateurs ;
- préparer un voyage ;
- lancer un produit ;
- écrire un livre ;
- améliorer une habitude ;
- mener une recherche ;
- accomplir un objectif libre non prévu à l’avance.

Atome/eVe doit alors transformer cet objectif en **itinéraire structuré, adaptable et suivi dans le temps**.

Le système doit guider l’utilisateur depuis l’intention initiale jusqu’à :

1. la définition ;
2. la préparation ;
3. la planification ;
4. l’exécution ;
5. le suivi ;
6. les corrections ;
7. la validation ;
8. l’achèvement ;
9. le maintien éventuel après réussite.

Le système doit pouvoir intégrer :

- tâches ;
- sous-objectifs ;
- calendrier ;
- rappels ;
- ressources ;
- documents ;
- médias ;
- budget ;
- financement ;
- personnes ;
- équipes ;
- contacts ;
- recherche de compétences ;
- communication ;
- localisation ;
- dépendances ;
- contraintes ;
- métriques ;
- preuves d’avancement ;
- automatisations ;
- recommandations ;
- assistant IA ;
- conditions d’entrée/sortie ;
- suivi après atteinte de l’objectif.

---

# 2. Principe fondamental : un objectif n’est pas un projet figé

Un objectif doit être représenté comme un **graphe évolutif**, pas comme une simple checklist linéaire.

Un objectif peut comporter :

- plusieurs chemins possibles ;
- des étapes facultatives ;
- des étapes conditionnelles ;
- des dépendances ;
- des branches ;
- des retours en arrière ;
- des validations ;
- des étapes parallèles ;
- des personnes différentes ;
- plusieurs sources de financement ;
- plusieurs lieux ;
- plusieurs dates possibles ;
- plusieurs niveaux de réussite.

Exemple :

> Objectif : sortir un album.

Le chemin peut varier selon que l’utilisateur :

- compose seul ou avec un groupe ;
- possède déjà les morceaux ;
- doit trouver un chanteur ;
- enregistre chez lui ou en studio ;
- autoproduit ou cherche un label ;
- prévoit une sortie numérique uniquement ;
- souhaite presser un vinyle ;
- dispose déjà du financement ;
- veut préparer ensuite une tournée.

Le scénario doit donc être **pré-câblé mais jamais rigide**.

---

# 3. Modèle d’un objectif

Chaque objectif doit être un objet structuré contenant au minimum :

## 3.1 Identité

- titre ;
- description ;
- catégorie ;
- type de scénario ;
- statut ;
- priorité ;
- date de création ;
- date de début ;
- date cible éventuelle ;
- horizon temporel ;
- propriétaire ;
- participants éventuels.

## 3.2 Résultat attendu

Le système doit demander ou déduire :

- ce que signifie « réussi » ;
- le niveau minimum acceptable ;
- le niveau idéal ;
- les critères mesurables ;
- les critères qualitatifs ;
- les preuves nécessaires.

## 3.3 Étapes

Chaque étape peut contenir :

- titre ;
- explication ;
- actions ;
- dépendances ;
- durée estimative ;
- dates ;
- ressources ;
- contacts ;
- budget ;
- conditions ;
- critères de validation ;
- livrables ;
- sous-objectifs ;
- documents liés ;
- médias liés ;
- notes ;
- risques ;
- alternatives.

## 3.4 Progression

La progression ne doit pas être calculée uniquement en pourcentage de tâches cochées.

Elle peut prendre en compte :

- étapes obligatoires terminées ;
- importance relative des étapes ;
- jalons atteints ;
- métriques réelles ;
- validation manuelle ;
- validation automatique ;
- temps écoulé ;
- qualité du résultat ;
- risques restant ouverts.

Afficher au minimum :

- progression globale ;
- prochaine étape ;
- blocages ;
- retard éventuel ;
- jalons importants ;
- date cible ;
- tendance : en avance / normal / en retard / bloqué.

---

# 4. Cycle de vie générique de tous les objectifs

Tous les scénarios doivent pouvoir s’appuyer sur un cycle commun.

## Phase 1 — Intention

Questions de base :

- Que veux-tu accomplir ?
- Pourquoi ?
- Pour quand ?
- Quel niveau de résultat souhaites-tu ?
- Est-ce personnel, collectif ou professionnel ?
- Existe-t-il déjà des éléments réalisés ?

## Phase 2 — Diagnostic initial

Déterminer :

- point de départ ;
- ressources disponibles ;
- compétences ;
- temps disponible ;
- budget ;
- contraintes ;
- personnes déjà impliquées ;
- matériel ;
- documents ;
- risques ;
- prérequis.

## Phase 3 — Construction du parcours

Le système instancie le scénario choisi et supprime les branches inutiles.

Il propose :

- phases ;
- jalons ;
- actions ;
- ordre logique ;
- tâches parallèles ;
- ressources ;
- personnes à trouver ;
- budget ;
- dates.

## Phase 4 — Exécution

L’utilisateur avance dans le scénario.

Le système :

- présente la prochaine action utile ;
- évite d’afficher inutilement toute la complexité ;
- suit les dépendances ;
- détecte les blocages ;
- adapte les étapes suivantes.

## Phase 5 — Contrôle

À intervalles pertinents :

- comparer prévu / réel ;
- vérifier les métriques ;
- vérifier les livrables ;
- identifier retard ou dérive ;
- proposer une correction.

## Phase 6 — Validation

Une étape peut être validée par :

- l’utilisateur ;
- un collaborateur ;
- une donnée mesurée ;
- un fichier produit ;
- une date atteinte ;
- un événement ;
- une condition ;
- une vérification automatique.

## Phase 7 — Achèvement

Le système confirme :

- résultat obtenu ;
- éléments manquants ;
- résultat partiel éventuel ;
- livrables finaux ;
- archivage ;
- partage.

## Phase 8 — Maintien

Certains objectifs ne s’arrêtent pas lorsqu’ils sont atteints.

Exemples :

- poids ;
- forme ;
- sommeil ;
- revenus ;
- apprentissage ;
- entretien d’un équipement ;
- communauté ;
- clientèle ;
- relation ;
- habitudes.

Le scénario peut donc basculer vers un **mode maintien** avec une fréquence plus faible de suivi.

---

# 5. Architecture des scénarios pré-câblés

Les scénarios ne doivent pas être codés directement dans l’interface.

Créer un format déclaratif permettant de définir un scénario avec :

- `id`
- `name`
- `category`
- `description`
- `tags`
- `goal_type`
- `questions`
- `phases`
- `steps`
- `dependencies`
- `conditions`
- `milestones`
- `resources`
- `roles`
- `metrics`
- `funding_options`
- `maintenance`
- `recommended_tools`
- `automation_hooks`

Le moteur doit interpréter ces définitions et construire l’objectif.

Avantages :

- ajout d’un scénario sans modifier l’UI ;
- possibilité de partager des scénarios ;
- scénarios communautaires ;
- scénarios privés ;
- scénarios créés par l’utilisateur ;
- scénarios générés avec l’assistant ;
- versionnage ;
- évolution sans casser les objectifs déjà créés.

---

# 6. Bibliothèque d’objectifs pré-câblés

La bibliothèque initiale doit être large mais organisée.

Chaque entrée ci-dessous doit être considérée comme un **template de scénario**, et non comme une simple phrase.

---

# 7. Musique et audio

Prévoir au minimum :

1. Créer une chanson.
2. Composer une chanson à plusieurs.
3. Écrire des paroles.
4. Composer une musique instrumentale.
5. Produire un morceau complet.
6. Enregistrer une démo.
7. Enregistrer un single.
8. Mixer un morceau.
9. Masteriser un morceau.
10. Finaliser un morceau déjà commencé.
11. Créer un EP.
12. Créer un album.
13. Remixer un morceau.
14. Préparer une collaboration musicale.
15. Trouver un chanteur.
16. Trouver un musicien.
17. Constituer un groupe.
18. Répéter un répertoire.
19. Préparer une setlist.
20. Préparer un concert.
21. Organiser un concert.
22. Préparer une tournée.
23. Organiser une tournée.
24. Préparer un live électronique.
25. Préparer un playback / backing tracks.
26. Préparer un système de scène audio/MIDI/DMX.
27. Publier un morceau.
28. Distribuer un morceau sur les plateformes.
29. Déclarer et documenter une œuvre.
30. Préparer une sortie promotionnelle.
31. Créer un clip musical.
32. Créer une identité sonore.
33. Créer une banque de sons.
34. Créer un sample pack.
35. Créer un podcast.
36. Produire un épisode de podcast.
37. Créer un habillage sonore.
38. Préparer une session studio.
39. Préparer un rider technique.
40. Monter un home-studio.

---

# 8. Vidéo, cinéma et audiovisuel

1. Écrire un scénario.
2. Développer une idée de film.
3. Préparer un storyboard.
4. Réaliser un court métrage.
5. Réaliser un film.
6. Réaliser un documentaire.
7. Réaliser une vidéo YouTube.
8. Réaliser une publicité.
9. Réaliser un clip.
10. Réaliser une interview.
11. Préparer un tournage.
12. Constituer une équipe de tournage.
13. Trouver des acteurs.
14. Faire un casting.
15. Trouver des lieux.
16. Organiser un planning de tournage.
17. Préparer le matériel.
18. Monter une vidéo.
19. Faire l’étalonnage.
20. Faire le sound design.
21. Ajouter musique et voix.
22. Ajouter sous-titres.
23. Finaliser les exports.
24. Préparer une diffusion.
25. Soumettre un film à des festivals.
26. Chercher un financement audiovisuel.
27. Organiser une projection.
28. Créer une série de vidéos.
29. Créer une chaîne vidéo.
30. Construire un calendrier éditorial vidéo.

---

# 9. Graphisme, design et création visuelle

1. Créer un logo.
2. Créer une identité visuelle.
3. Créer une charte graphique.
4. Réaliser une affiche.
5. Réaliser une pochette d’album.
6. Créer un visuel promotionnel.
7. Créer un site visuel / maquette.
8. Créer une interface.
9. Créer une illustration.
10. Réaliser une série d’illustrations.
11. Créer un portfolio.
12. Préparer une exposition.
13. Organiser une exposition.
14. Créer une collection graphique.
15. Créer des assets pour un jeu.
16. Créer des visuels pour les réseaux sociaux.
17. Préparer des fichiers d’impression.
18. Concevoir un packaging.
19. Créer une présentation visuelle.
20. Créer un livre illustré.

---

# 10. Écriture, publication et contenu

1. Écrire un livre.
2. Écrire une nouvelle.
3. Écrire un article.
4. Écrire un essai.
5. Écrire un scénario.
6. Écrire une pièce.
7. Écrire des paroles.
8. Créer un blog.
9. Publier régulièrement.
10. Créer une newsletter.
11. Créer un dossier de presse.
12. Créer un communiqué.
13. Préparer une campagne éditoriale.
14. Traduire une œuvre.
15. Corriger un manuscrit.
16. Préparer l’édition.
17. Auto-publier un livre.
18. Chercher un éditeur.
19. Préparer une campagne de lancement.
20. Créer une documentation technique.

---

# 11. Logiciel, produit numérique et technologie

1. Créer une application.
2. Créer un site web.
3. Créer un prototype.
4. Finaliser un MVP.
5. Préparer une bêta.
6. Lancer un produit numérique.
7. Débugger un produit.
8. Optimiser les performances.
9. Sécuriser un produit.
10. Préparer un déploiement.
11. Créer une API.
12. Créer un plugin.
13. Créer un jeu.
14. Créer un outil interne.
15. Migrer une architecture.
16. Auditer un codebase.
17. Documenter un projet.
18. Organiser les tests.
19. Préparer une release.
20. Organiser la maintenance.
21. Construire une communauté open source.
22. Recruter des contributeurs.
23. Chercher des testeurs.
24. Collecter les retours utilisateurs.
25. Préparer une roadmap.

---

# 12. Entreprise, activité professionnelle et entrepreneuriat

1. Créer une entreprise.
2. Lancer une activité indépendante.
3. Valider une idée de business.
4. Construire un business model.
5. Réaliser une étude de marché.
6. Trouver un nom.
7. Créer une marque.
8. Créer une offre.
9. Fixer un prix.
10. Trouver ses premiers clients.
11. Créer une stratégie commerciale.
12. Créer une stratégie marketing.
13. Préparer un lancement.
14. Construire un site commercial.
15. Mettre en place une facturation.
16. Mettre en place une comptabilité.
17. Organiser l’administratif.
18. Trouver des partenaires.
19. Recruter.
20. Constituer une équipe.
21. Chercher des prestataires.
22. Trouver un associé.
23. Préparer une levée de fonds.
24. Chercher des investisseurs.
25. Préparer un pitch.
26. Préparer un dossier financier.
27. Chercher des subventions.
28. Organiser une campagne de crowdfunding.
29. Améliorer la rentabilité.
30. Réduire les coûts.
31. Automatiser des opérations.
32. Développer à l’international.
33. Préparer une nouvelle offre.
34. Préparer une fusion ou un partenariat.
35. Créer un réseau professionnel.

---

# 13. Financement et ressources

Cette catégorie peut être utilisée seule ou comme sous-objectif d’un autre scénario.

1. Évaluer le budget d’un projet.
2. Construire un plan de financement.
3. Réduire le coût d’un projet.
4. Trouver des aides.
5. Trouver des subventions.
6. Trouver des sponsors.
7. Trouver des investisseurs.
8. Trouver des mécènes.
9. Lancer un crowdfunding.
10. Préparer un dossier bancaire.
11. Trouver des partenaires matériels.
12. Chercher des dons.
13. Mutualiser des ressources.
14. Louer plutôt qu’acheter.
15. Identifier les dépenses obligatoires.
16. Prioriser les dépenses.
17. Suivre budget prévu / réel.
18. Préparer des échéances de paiement.
19. Prévoir une réserve.
20. Clôturer financièrement un projet.

---

# 14. Travail, carrière et compétences

1. Trouver un emploi.
2. Changer de métier.
3. Préparer un CV.
4. Créer un portfolio.
5. Préparer un entretien.
6. Chercher des offres.
7. Organiser des candidatures.
8. Développer son réseau.
9. Trouver un mentor.
10. Apprendre une compétence.
11. Obtenir une certification.
12. Préparer un examen.
13. Préparer un concours.
14. Construire une formation.
15. Suivre une formation.
16. Créer un plan de carrière.
17. Préparer une promotion.
18. Négocier une rémunération.
19. Lancer une activité parallèle.
20. Passer indépendant.
21. Reprendre des études.
22. Créer une réputation professionnelle.
23. Publier des travaux.
24. Préparer une conférence.
25. Faire une présentation publique.

---

# 15. Santé, forme et bien-être

Les scénarios de santé doivent rester des outils d’organisation et de suivi et ne pas remplacer un professionnel de santé.

1. Perdre du poids.
2. Prendre de la masse.
3. Prendre du muscle.
4. Maintenir son poids.
5. Reprendre le sport.
6. Améliorer sa condition physique.
7. Améliorer son endurance.
8. Améliorer sa force.
9. Améliorer sa mobilité.
10. Améliorer sa souplesse.
11. Mieux dormir.
12. Stabiliser ses horaires de sommeil.
13. Améliorer son alimentation.
14. Boire suffisamment.
15. Réduire une habitude alimentaire.
16. Préparer un bilan de santé.
17. Organiser ses rendez-vous médicaux.
18. Suivre des mesures de santé.
19. Suivre un traitement prescrit.
20. Organiser une rééducation prescrite.
21. Diminuer le stress.
22. Introduire une routine de relaxation.
23. Reprendre une activité après une interruption.
24. Maintenir une amélioration obtenue.

---

# 16. Sport et performance

1. Courir 5 km.
2. Courir 10 km.
3. Courir un semi-marathon.
4. Courir un marathon.
5. Préparer un trail.
6. Faire une grande randonnée.
7. Préparer une randonnée sur plusieurs jours.
8. Faire un trek.
9. Préparer une course cycliste.
10. Préparer une longue sortie vélo.
11. Améliorer une performance sportive.
12. Préparer une compétition.
13. Reprendre une saison sportive.
14. Construire un programme d’entraînement.
15. Organiser le matériel.
16. Organiser la récupération.
17. Planifier une progression.
18. Atteindre un objectif de force.
19. Atteindre un objectif d’endurance.
20. Maintenir un niveau après l’objectif.

---

# 17. Voyage, aventure et déplacement

1. Organiser un voyage.
2. Organiser un road trip.
3. Préparer un voyage longue durée.
4. Préparer une expatriation.
5. Préparer un trek.
6. Préparer une randonnée.
7. Organiser un voyage en groupe.
8. Trouver des participants.
9. Construire un itinéraire.
10. Réserver les transports.
11. Réserver les hébergements.
12. Préparer un budget.
13. Préparer les documents.
14. Préparer le matériel.
15. Préparer les assurances.
16. Organiser les étapes.
17. Partager l’itinéraire.
18. Suivre les dépenses.
19. Documenter le voyage.
20. Archiver souvenirs et médias.

---

# 18. Vie personnelle et organisation

1. Organiser sa semaine.
2. Organiser son année.
3. Mettre en place une routine.
4. Réduire la procrastination.
5. Trier ses documents.
6. Organiser ses fichiers.
7. Faire un déménagement.
8. Préparer un changement de logement.
9. Rénover une pièce.
10. Rénover un logement.
11. Organiser un budget personnel.
12. Épargner pour un achat.
13. Préparer un achat important.
14. Simplifier son quotidien.
15. Créer une routine matinale.
16. Créer une routine du soir.
17. Réduire une mauvaise habitude.
18. Installer une nouvelle habitude.
19. Réaliser une liste de projets personnels.
20. Atteindre un objectif libre.

---

# 19. Relations, groupe et communauté

1. Organiser une rencontre.
2. Réunir un groupe.
3. Constituer une équipe.
4. Trouver des personnes partageant un intérêt.
5. Créer une communauté.
6. Développer une communauté.
7. Organiser des rencontres régulières.
8. Organiser un événement.
9. Organiser une fête.
10. Organiser une réunion.
11. Organiser une conférence.
12. Organiser un atelier.
13. Trouver des intervenants.
14. Trouver des bénévoles.
15. Trouver des participants.
16. Répartir les rôles.
17. Organiser les communications.
18. Maintenir l’engagement du groupe.
19. Suivre les décisions collectives.
20. Préparer un projet collaboratif.

---

# 20. Rencontre et vie relationnelle

Ces scénarios doivent rester respectueux de la vie privée, du consentement et des choix individuels.

1. Élargir son cercle social.
2. Faire de nouvelles rencontres.
3. Organiser plus de sorties.
4. Trouver des activités sociales.
5. Développer une relation.
6. Préparer une activité à deux.
7. Organiser un voyage à deux.
8. Construire un projet commun.
9. Maintenir du temps de qualité.
10. Organiser des objectifs communs.

Le système ne doit jamais transformer une personne en « cible » à obtenir ni automatiser des comportements intrusifs.

---

# 21. Maison, matériel et environnement

1. Aménager une pièce.
2. Créer un studio.
3. Créer un atelier.
4. Créer un bureau.
5. Faire des travaux.
6. Acheter du matériel.
7. Comparer des équipements.
8. Installer un système audio.
9. Installer un système lumière.
10. Installer un réseau.
11. Organiser un inventaire.
12. Entretenir un équipement.
13. Préparer une maintenance.
14. Réduire la consommation.
15. Organiser un déménagement.
16. Concevoir un espace.
17. Planifier une rénovation.
18. Suivre artisans et prestataires.
19. Suivre budget travaux.
20. Valider la fin des travaux.

---

# 22. Recherche, science et invention

1. Explorer une question.
2. Construire une hypothèse.
3. Faire un état de l’art.
4. Organiser une veille.
5. Concevoir une expérience.
6. Collecter des données.
7. Analyser des résultats.
8. Documenter une découverte.
9. Créer un prototype.
10. Tester un prototype.
11. Améliorer une invention.
12. Chercher des collaborateurs.
13. Chercher un laboratoire.
14. Chercher un financement.
15. Préparer une publication.
16. Préparer une présentation.
17. Déposer une preuve d’antériorité.
18. Préparer une stratégie de propriété intellectuelle.
19. Construire une roadmap de recherche.
20. Transformer une recherche en produit.

---

# 23. Éducation et apprentissage

1. Apprendre une langue.
2. Apprendre un instrument.
3. Apprendre à chanter.
4. Apprendre à coder.
5. Apprendre le dessin.
6. Apprendre la vidéo.
7. Apprendre la photographie.
8. Apprendre une compétence professionnelle.
9. Préparer un examen.
10. Préparer un concours.
11. Réviser un programme.
12. Lire une série de livres.
13. Construire un programme personnel.
14. Trouver des ressources.
15. Trouver un professeur.
16. Trouver un partenaire de pratique.
17. Suivre ses heures de pratique.
18. Valider des niveaux.
19. Produire un projet final.
20. Maintenir la compétence.

---

# 24. Engagement, association et action collective

1. Créer une association.
2. Organiser une action locale.
3. Recruter des bénévoles.
4. Organiser une collecte.
5. Trouver des financements.
6. Préparer une campagne.
7. Organiser un événement caritatif.
8. Développer une communauté.
9. Gérer les participants.
10. Gérer les ressources.
11. Mesurer l’impact.
12. Communiquer les résultats.
13. Trouver des partenaires.
14. Organiser une action récurrente.
15. Maintenir le projet après son lancement.

---

# 25. Objectif libre universel

Il doit toujours exister une entrée :

> **Créer mon propre objectif**

Le système demande alors :

1. Quel résultat veux-tu obtenir ?
2. Pourquoi ?
3. Pour quand ?
4. Comment sauras-tu que c’est réussi ?
5. Que possèdes-tu déjà ?
6. Que te manque-t-il ?
7. As-tu besoin d’autres personnes ?
8. As-tu besoin d’un budget ?
9. Existe-t-il des contraintes ?
10. Quelles sont les premières étapes connues ?

L’assistant peut ensuite proposer un scénario initial en réutilisant les briques génériques.

---

# 26. Sous-objectifs réutilisables

Certaines fonctions doivent exister comme scénarios transverses appelables depuis n’importe quel objectif.

Exemples :

- trouver une personne ;
- trouver une compétence ;
- recruter ;
- trouver un prestataire ;
- obtenir un avis ;
- trouver un financement ;
- trouver du matériel ;
- acheter ;
- louer ;
- réserver ;
- comparer ;
- apprendre ;
- contacter ;
- demander une autorisation ;
- obtenir un document ;
- créer un budget ;
- créer un planning ;
- faire une recherche ;
- organiser une réunion ;
- faire valider une étape ;
- publier ;
- communiquer ;
- promouvoir ;
- mesurer ;
- tester ;
- corriger ;
- maintenir.

Ces briques doivent pouvoir être injectées automatiquement dans des scénarios différents.

---

# 27. Personnes, contacts et mise en relation

Le système d’objectifs doit pouvoir dire :

> Pour continuer, il te manque une personne ayant telle compétence.

Il peut alors :

1. chercher dans les contacts existants ;
2. chercher dans l’équipe du projet ;
3. chercher dans un annuaire interne si disponible ;
4. proposer de publier une demande ;
5. préparer un message ;
6. suivre les réponses ;
7. ajouter la personne au projet après accord.

Types de besoins :

- musicien ;
- ingénieur du son ;
- graphiste ;
- développeur ;
- acteur ;
- technicien ;
- coach ;
- expert ;
- prestataire ;
- partenaire ;
- investisseur ;
- sponsor ;
- bénévole ;
- participant ;
- mentor ;
- collaborateur.

La mise en relation doit respecter les permissions, le consentement et les règles de confidentialité.

---

# 28. Financement intégré aux objectifs

Tout scénario pouvant nécessiter de l’argent doit pouvoir activer un module financement.

Fonctions :

- budget estimatif ;
- budget disponible ;
- écart ;
- coûts obligatoires ;
- coûts optionnels ;
- échéances ;
- dépenses réelles ;
- financement manquant ;
- sources possibles ;
- suivi des demandes.

Sources possibles :

- fonds personnels ;
- revenus du projet ;
- précommandes ;
- crowdfunding ;
- aides ;
- subventions ;
- sponsoring ;
- mécénat ;
- investisseurs ;
- partenaires ;
- prêt ;
- mutualisation ;
- apport en nature.

Le système doit pouvoir proposer une action lorsque :

> financement disponible < financement nécessaire.

---

# 29. Ressources et fichiers

Chaque étape doit pouvoir attacher :

- Atomes ;
- documents ;
- images ;
- audio ;
- vidéo ;
- liens ;
- notes ;
- contacts ;
- conversations ;
- rendez-vous ;
- budgets ;
- lieux ;
- équipements ;
- versions ;
- livrables.

Le système d’objectifs ne doit pas créer un silo séparé.

Il doit orchestrer les objets déjà présents dans Atome/eVe.

---

# 30. Calendrier

Une étape peut produire :

- une date cible ;
- une échéance ;
- un rendez-vous ;
- une répétition ;
- une session de travail ;
- une période de suivi ;
- un rappel ;
- un jalon.

Les changements de planning doivent être propagés lorsqu’ils affectent des dépendances.

Exemple :

> Le mixage est retardé de 4 jours → le mastering et la date de livraison doivent être signalés comme potentiellement impactés.

---

# 31. Conditions et automatisations

Le moteur doit pouvoir exploiter des conditions.

Exemples :

- si budget >= montant requis → débloquer réservation ;
- si tous les morceaux sont validés → proposer mastering ;
- si une personne accepte l’invitation → l’ajouter à l’étape ;
- si la date approche → augmenter la priorité ;
- si un jalon est en retard → proposer replanification ;
- si la métrique cible est atteinte → passer en maintien ;
- si une ressource manque → déclencher une recherche ;
- si un fichier est validé → débloquer l’étape suivante.

Les conditions doivent être séparées des interfaces spécifiques afin de rester réutilisables dans tous les modules.

---

# 32. Assistant IA

L’assistant doit jouer le rôle de guide, mais le moteur d’objectifs ne doit pas dépendre entièrement de lui.

L’assistant peut :

- comprendre un objectif formulé naturellement ;
- proposer le meilleur scénario ;
- adapter un scénario ;
- détecter une étape manquante ;
- reformuler un objectif trop vague ;
- proposer une prochaine action ;
- expliquer un blocage ;
- aider à chercher une ressource ;
- proposer des alternatives ;
- préparer un message ;
- produire un résumé ;
- comparer progression réelle et prévue.

Les scénarios fondamentaux doivent rester exploitables sans génération IA.

---

# 33. UX : création d’un objectif

L’expérience doit être très simple.

## Entrée principale

L’utilisateur peut écrire :

> Je veux sortir un album.

ou sélectionner :

> Musique → Créer un album

Le système affiche ensuite quelques questions essentielles seulement.

Ne jamais commencer par un formulaire de 40 champs.

Utiliser une révélation progressive.

### Exemple

**Objectif : créer un album**

Questions initiales :

- Combien de morceaux ?
- Les morceaux existent-ils déjà ?
- Seul ou en équipe ?
- Date cible ?
- Budget approximatif ?

À partir de ces réponses, le moteur construit le parcours.

---

# 34. UX : écran principal d’un objectif

L’utilisateur doit voir en priorité :

1. objectif ;
2. progression ;
3. prochaine action ;
4. blocages ;
5. prochain jalon ;
6. date cible ;
7. actions urgentes.

Les détails complets doivent rester accessibles sans encombrer l’interface.

Vues possibles :

- Aujourd’hui ;
- Prochaines étapes ;
- Timeline ;
- Étapes ;
- Ressources ;
- Équipe ;
- Budget ;
- Notes ;
- Historique ;
- Maintien.

---

# 35. Adaptation dynamique

Le scénario doit évoluer.

Exemple :

Objectif initial :

> Organiser un concert.

L’utilisateur indique plus tard :

> La salle est annulée.

Le système doit :

1. rouvrir l’étape lieu ;
2. marquer les dépendances impactées ;
3. préserver le travail déjà fait ;
4. proposer de chercher une autre salle ;
5. réévaluer budget et planning ;
6. signaler les actions devenues invalides.

---

# 36. Scénarios composables

Un grand objectif doit pouvoir appeler d’autres scénarios.

Exemple :

## Créer un album

Sous-objectifs possibles :

- composer 10 titres ;
- trouver un bassiste ;
- enregistrer ;
- mixer ;
- masteriser ;
- créer la pochette ;
- financer le mastering ;
- publier ;
- promouvoir ;
- préparer un concert de lancement.

Chaque sous-objectif peut être un scénario autonome réutilisé ailleurs.

---

# 37. Progression intelligente

Ne pas utiliser une progression naïve.

Chaque étape doit pouvoir avoir :

- `weight` ;
- `required` ;
- `optional` ;
- `blocking` ;
- `validation_mode` ;
- `progress_metric`.

Exemple :

Pour un album, « choisir une couleur de dossier » ne doit pas compter autant que « terminer le mixage des 10 morceaux ».

---

# 38. Historique et traçabilité

Conserver :

- création ;
- décisions ;
- changements de dates ;
- validations ;
- annulations ;
- nouvelles branches ;
- changements de budget ;
- personnes ajoutées ;
- livrables ;
- changements de statut.

Permettre de comprendre :

> pourquoi le plan actuel est différent du plan initial.

---

# 39. États d’un objectif

Prévoir au minimum :

- idée ;
- à définir ;
- préparé ;
- actif ;
- en attente ;
- bloqué ;
- en pause ;
- en retard ;
- presque terminé ;
- terminé ;
- partiellement réussi ;
- abandonné ;
- archivé ;
- maintien.

---

# 40. Niveau d’automatisation

Pour chaque scénario, définir ce qui est :

- manuel ;
- assisté ;
- automatique ;
- conditionnel.

Exemple :

### Manuel
Valider que l’utilisateur aime le mix final.

### Assisté
Proposer une liste d’ingénieurs du son.

### Automatique
Calculer le pourcentage de morceaux masterisés.

### Conditionnel
Débloquer la distribution lorsque tous les masters obligatoires existent.

---

# 41. Notifications intelligentes

Éviter les rappels inutiles.

Notifier principalement lorsque :

- une action devient disponible ;
- une échéance approche ;
- une dépendance bloque ;
- une personne répond ;
- une condition importante change ;
- un objectif dérive ;
- un jalon est atteint ;
- une validation est nécessaire.

---

# 42. MVP du système d’objectifs

Pour la première version fonctionnelle, prioriser :

1. création d’un objectif ;
2. choix d’un scénario ;
3. questions initiales ;
4. génération des étapes ;
5. sous-objectifs ;
6. tâches ;
7. dépendances ;
8. jalons ;
9. progression ;
10. calendrier ;
11. pièces jointes / Atomes ;
12. contacts ;
13. budget simple ;
14. blocages ;
15. validation ;
16. achèvement ;
17. maintien ;
18. objectif libre ;
19. scénarios composables ;
20. architecture déclarative extensible.

La recherche externe de financement, l’annuaire public de compétences ou les systèmes avancés de recommandation peuvent être connectés progressivement sans modifier le modèle central.

---

# 43. Premiers scénarios à implémenter réellement

Ne pas essayer d’implémenter immédiatement les centaines de scénarios avec une logique entièrement spécifique.

Créer d’abord environ 15 scénarios exemplaires couvrant des structures différentes :

1. Créer une chanson.
2. Créer un album.
3. Préparer un concert.
4. Réaliser un film.
5. Finaliser un MVP logiciel.
6. Créer une entreprise.
7. Lancer un produit.
8. Organiser un événement.
9. Trouver un financement.
10. Apprendre une compétence.
11. Perdre du poids.
12. Prendre de la masse.
13. Mieux dormir.
14. Préparer un marathon.
15. Organiser une grande randonnée.
16. Objectif libre.

Ces scénarios doivent servir à valider le moteur générique.

Ensuite, enrichir la bibliothèque principalement par données déclaratives, pas par nouvelles architectures.

---

# 44. Critères de validation du moteur

Le moteur est considéré comme valide si l’on peut créer avec la même architecture :

- un album ;
- un marathon ;
- un film ;
- une entreprise ;
- une randonnée ;

sans créer cinq systèmes différents.

Il doit gérer correctement :

- étapes séquentielles ;
- étapes parallèles ;
- conditions ;
- dépendances ;
- budget ;
- personnes ;
- documents ;
- calendrier ;
- progression ;
- maintien.

---

# 45. Tests obligatoires

## Test 1 — Album

Créer un album avec :

- 10 morceaux ;
- 2 collaborateurs ;
- budget ;
- mixage externe ;
- date de sortie.

Vérifier que le scénario construit le parcours complet.

## Test 2 — Marathon

Créer un objectif marathon.

Vérifier :

- progression temporelle ;
- jalons ;
- séances ;
- adaptation ;
- maintien après la course si choisi.

## Test 3 — Film

Créer un film avec :

- scénario ;
- casting ;
- budget ;
- lieux ;
- tournage ;
- montage ;
- diffusion.

## Test 4 — Entreprise

Créer une entreprise avec :

- offre ;
- administratif ;
- financement ;
- site ;
- clients ;
- lancement.

## Test 5 — Randonnée

Créer une randonnée longue avec :

- itinéraire ;
- dates ;
- transport ;
- matériel ;
- participants ;
- budget ;
- étapes.

## Test 6 — Objectif non prévu

Entrer un objectif totalement libre.

Vérifier que le système peut construire un plan sans avoir besoin d’un nouveau développement spécifique.

---

# 46. Règle d’architecture essentielle

Le catalogue d’objectifs ne doit pas devenir une énorme collection de code spécifique.

Construire :

> un moteur générique + des briques réutilisables + des scénarios déclaratifs.

Les centaines d’objectifs doivent principalement être des combinaisons de ces briques.

---

# 47. Livrable attendu

À la fin de l’implémentation, produire :

- architecture du moteur ;
- format de scénario ;
- catalogue des scénarios ;
- scénarios effectivement implémentés ;
- briques transverses disponibles ;
- intégrations calendrier/contacts/communication/recherche/budget ;
- tests ;
- limites ;
- prochaines extensions.

---

# 48. Definition of Done

Le système est considéré comme prêt lorsque :

- l’utilisateur peut exprimer un objectif en langage naturel ou le choisir dans une bibliothèque ;
- Atome/eVe transforme l’objectif en parcours ;
- les étapes sont adaptables ;
- les dépendances fonctionnent ;
- les sous-objectifs fonctionnent ;
- la progression est significative ;
- le calendrier est relié ;
- les personnes peuvent être associées ;
- un besoin de ressource peut être représenté ;
- un budget peut être suivi ;
- un besoin de financement peut devenir une action ;
- les fichiers et Atomes peuvent être liés ;
- les conditions peuvent déclencher des évolutions ;
- un objectif peut être validé ;
- un objectif peut entrer en maintien ;
- un scénario libre peut être créé ;
- de nouveaux scénarios peuvent être ajoutés sans modifier le moteur central.

---

# 49. Instruction finale à l’agent de développement

Ne construis pas un simple gestionnaire de tâches.

Construis un **moteur universel de parcours vers un résultat**.

Un scénario pré-câblé doit être une aide de départ, pas une prison.

Le moteur doit pouvoir guider des objectifs aussi différents que :

- créer un album ;
- réaliser un film ;
- monter une entreprise ;
- courir un marathon ;
- organiser une randonnée ;
- apprendre une compétence ;
- réunir une équipe.

Utilise les mêmes primitives fondamentales :

> objectif → phases → étapes → actions → conditions → ressources → personnes → budget → preuves → validation → maintien.

Avant de créer une nouvelle fonctionnalité spécifique à un scénario, vérifier si le besoin peut être exprimé avec une brique transverse existante.

La puissance du système doit venir de la **composition**, pas de l’accumulation de code spécialisé.
