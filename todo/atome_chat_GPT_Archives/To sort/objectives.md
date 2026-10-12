# Atome / eVe — Cahier des charges du système d’objectifs et scénarios pré-câblés

## 0. Contexte séparé : modes Liste / Matrice

Un chantier distinct restera à finaliser concernant les **modes de représentation et d’usage**, notamment pour l’audio et les médias :

- mode Liste ;
- mode Matrice ;
- comportement spécifique aux sons, morceaux, clips, pistes et autres médias ;
- règles de lecture, sélection, lancement, regroupement et navigation propres à chaque mode ;
- cohérence avec les vues Song / Structure / Piste et avec les outils temporels.

Ce sujet doit être traité dans un cahier des charges séparé après discussion détaillée afin de ne pas figer prématurément un comportement encore en réflexion.

**Décision complémentaire du 11 octobre 2026.** Ce chantier séparé concerne les comportements spécialisés Liste/Matrice des médias et de l’audio. Il ne remet pas en cause la décision désormais actée pour les **projets, les objectifs et les activités** : leur création, leur exploration et leurs réglages utilisent une **même grammaire de matrices de carrés imbriquées**. Les règles détaillées et les tests correspondants figurent en section 50.

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

**Règle de présentation actée le 11 octobre 2026 :** cette révélation progressive se fait par **matrices de carrés imbriquées** et **extension temporaire d’un carré** pour ses réglages (section 50), et non par un empilement de panneaux ou de formulaires rectangulaires sans cohérence avec la matrice.

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

**Présentation commune :** les projets, les entrées d’activité et les composants consultables depuis cet écran restent organisés dans la matrice native d’atome ; les sous-niveaux et les paramètres suivent les interactions décrites en section 50. Les vues de travail spécialisées restent possibles si leur fonction le justifie, sans créer un second langage d’interface.

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

---

# 50. Décision du 11 octobre 2026 — Une seule interface matricielle pour tous les projets et activités

**Statut : décision de concept et cahier des charges à mettre en œuvre, pas attestation d'implémentation.** Cette décision précise les sections 0, 33 et 34. Elle concerne **tous** les projets d'atome/eVe (santé ou non), les scénarios proposés et les activités accessibles indépendamment d'un projet. Elle doit s'appuyer sur les vrais composants, objets, outils et comportements d'atome après inventaire de l'existant ; ne pas prétendre qu'un composant ou une API non vérifiés sont disponibles.

## 50.1. Principe visuel universel : la matrice d'atome

- **Une même matrice, faite de carrés**, sert à présenter les projets, à créer un nouveau projet, à choisir un objectif, à sélectionner une brique, à explorer des sous-catégories et à accéder aux activités.
- Chaque **carré** correspond à un objet ou une action réelle et identifiable : projet, objectif, activité, brique réutilisable, choix ou réglage. Sa position suit la grille, pas un placement arbitraire de cartes, fenêtres ou rectangles.
- Les **mêmes carrés, proportions, teintes, icônes et composants natifs** sont réutilisés d'un contexte à l'autre. Le contenu change selon l'objectif, mais **pas la grammaire d'interface**.
- **Une sélection peut ouvrir une nouvelle matrice plus profonde** : objectif → briques proposées → catégorie → activité → paramètres. On doit pouvoir revenir au niveau précédent, reprendre une configuration et retrouver le contexte sans perdre les choix déjà validés.
- Il ne faut pas substituer une interface de gestion conventionnelle, des panneaux de réglages autonomes ou des formulaires rectangulaires hétérogènes à la matrice. Les autres modes d'affichage spécialisés (Liste, Timeline, etc.) peuvent exister lorsqu'ils remplissent un besoin fonctionnel précis ; **le flux commun de sélection, de composition et de configuration repose sur la matrice**.

## 50.2. Interaction normalisée d'un carré : ouvrir, régler, refermer

Deux comportements complémentaires utilisent **le même élément de matrice**.

**A. Carré de navigation ou de composition**

1. À l'état de repos, l'élément est un **carré de la matrice**.
2. Un appui sur le carré ouvre la **matrice fille** liée à son véritable objet ou outil (par exemple Sport → Natation).
3. Les choix sont conservés pendant la navigation ; retour et validation ne créent pas de doublon.

**B. Carré portant une valeur ajustable** (par exemple **Effort souhaité / rythme**, **Temps disponible**, puis durée, fréquence et paramètres pertinents de l'activité)

1. À l'état de repos, le réglage est présenté par **un carré**, cohérent avec toutes les autres briques.
2. Au toucher/clic, **le carré lui-même s'agrandit dans la grille** et devient temporairement **rectangulaire** en occupant deux, voire **trois emplacements de carrés** selon l'espace nécessaire ; dimensions et alignements restent calculés en unités de la matrice, pas au pixel arbitraire.
3. **Le curseur (slider) natif** ou le réglage réellement disponible apparaît **à l'intérieur de cette brique agrandie**, sans ouvrir un panneau flottant, une fenêtre modale ni un duplicata du réglage.
4. L'utilisateur ajuste la valeur, puis valide/termine l'interaction. Le contrôle **enregistre la valeur sur le véritable objet concerné** et **se referme pour redevenir un carré** dans la matrice. La valeur retenue reste consultable lors d'une nouvelle ouverture ; un affichage synthétique peut être présent seulement s'il est utile.
5. Les autres carrés doivent se **repositionner proprement** lorsque la cellule s'étend et se referme, sans chevauchement, saut incohérent, perte de sélection ou déformation de la grille.

**Règle d'unification :** les carrés ne sont pas des icônes décoratives. Ils contiennent ou ouvrent **les outils et options réels d'atome**. Les paramètres natifs restent associés à leur outil, pas recréés dans une interface parallèle.

Pour un projet, les deux réglages transversaux de départ sont notamment **Effort souhaité / rythme** et **Temps disponible**. Ils emploient la même interaction d'extension du carré ; ne pas créer de troisième curseur obligatoire sans besoin validé. La correspondance exacte des valeurs, des unités (jour/semaine), des bornes et de l'effet du réglage doit être raccordée aux règles communes du projet, puis vérifiée.

## 50.3. Entrée commune : voir ses projets et en créer un

- **Les projets existants sont présentés sous forme de carrés dans une matrice.** Le projet sélectionné permet d'entrer dans sa propre matrice.
- La **création d'un nouveau projet** emprunte la même matrice que les projets existants ; ses propositions, objectifs, paramètres initiaux et étapes de configuration ne sont pas dispersés en rectangles sur l'écran.
- La matrice reste la structure perceptible sur téléphone, tablette et ordinateur. L'extension d'un carré s'adapte à la largeur disponible sans abandonner les unités de grille. Les états sélectionné, ouvert, en cours et validé sont explicites sans surcharger l'écran.
- Navigation et réglages doivent rester accessibles via les moyens d'interaction pris en charge (toucher, souris, clavier et technologies d'assistance selon plateforme). Pas de fonctionnalité réservée à une animation purement visuelle.

## 50.4. Scénarios des objectifs de santé : partir du besoin, composer, puis agir

**Référence de départ : les neuf objectifs de santé convenus dans nos échanges.** Les 24 propositions de la section 15 restent un **catalogue de possibilités** et ne doivent pas être confondues avec cette sélection initiale. La liste de travail est :

1. **Perdre du poids**.
2. **Mieux dormir et retrouver de l'énergie**.
3. **Prendre de la masse musculaire**.
4. **Gérer une douleur**.
5. **Repérer un trouble et orienter vers un professionnel**, sans diagnostic autonome.
6. **Préserver du temps pour soi**.
7. **Retrouver le calme intérieur** (dont méditation).
8. **Tenir un journal personnel** (expression, ressenti, création).
9. **Améliorer sa condition physique**.

Pour **chacun** de ces neuf projets-objectifs, le scénario devra préciser les mêmes phases et objets réutilisables, mais des briques, activités et observations adaptées au but :

1. **Entrée dans l'objectif.** Le choix de l'objectif se fait depuis une matrice ; l'utilisateur peut aussi exprimer un besoin libre. Reprendre un projet existant ne le recrée pas.
2. **Point de départ.** Collecter uniquement les données déjà disponibles et autorisées ; si elles sont insuffisantes pour proposer un programme pertinent, demander progressivement les quelques informations utiles. Ne pas imposer un questionnaire complet.
3. **Implication.** Proposer les carrés ajustables **Effort souhaité / rythme** et **Temps disponible**, puis leurs curseurs par extension dans la grille. Respecter ce que la personne accepte réellement.
4. **Composition.** Proposer une **matrice de briques transversales** pertinentes (par exemple détente, méditation, nutrition, mouvement et habitudes pour Mieux dormir), sans déclarer ces activités universellement nécessaires ni cliniquement efficaces.
5. **Approfondissement.** Un carré sélectionné peut ouvrir une matrice plus précise, jusqu'à une activité concrète et ses paramètres. Exemple : **Mieux dormir → Activité physique → Sport → Natation → Durée / fréquence → Validation**. Les contenus exacts restent dépendants de la situation ; Natation est une démonstration de navigation, pas une recommandation sommeil universelle.
6. **Validation.** L'utilisateur accepte, modifie ou refuse les briques et la charge. Une brique acceptée devient une activité réelle du programme, avec sa configuration conservée et une identité stable.
7. **Projet Dashboard.** Une fois le programme validé, le projet se présente dans un **mode Dashboard**, regroupant les activités à réaliser, notamment pour **Aujourd'hui**. Ce n'est ni un deuxième projet sans lien ni une application de santé séparée : il s'agit d'une présentation du projet-objectif et de ses activités.
8. **Calendrier.** Les occurrences acceptées sont proposées au **calendrier commun d'atome** avec horaires, durées, rappels, récurrences et possibilité de modification ; aucune planification définitive sans choix/autorisation de l'utilisateur. Une action n'existe qu'une fois même si plusieurs objectifs la partagent.
9. **Au moment de l'activité.** Le rappel doit permettre d'ouvrir le **projet et l'activité concernée au premier plan**. Lorsque le système d'exploitation le permet et après les autorisations requises, déclencher les capteurs pertinents **au démarrage effectif de l'activité** et suivre les données disponibles ; ne pas inventer de mesure. Sur iOS notamment, une notification ne doit pas être documentée comme capable d'ouvrir arbitrairement une app sans action de l'utilisateur si l'OS ne le permet pas.
10. **Résultat et adaptation.** Enregistrer réalisation, données mesurées autorisées, ressenti et contexte avec leur provenance. Le **Moniteur commun** rapproche ces observations, propose un bilan nuancé et permet d'ajuster, alléger, suspendre ou reprendre le programme sans effacer l'historique.

**État documentaire :** `Scenario_Sommeil.docx` est la référence détaillée du premier scénario (concept, visuels et garde-fous). **Les huit autres scénarios doivent encore être décrits individuellement** en réutilisant le même socle, avec leur logique propre. Les éléments ci-dessus sont une règle transversale, pas une prétention à neuf scénarios complets.

## 50.5. Entrée indépendante « Activités » : mêmes briques, même matrice

- Prévoir un **espace « Activités »** accessible directement, sans obligation de passer par un objectif ou son Dashboard.
- L'espace présente une **matrice de catégories de briques** : notamment **Sport**, **Nutrition**, **Compléments alimentaires**, **Méditation** et **Relaxation**, selon les activités réellement disponibles. Exemple : **Activités → Sport → Natation → Durée / paramètres → Démarrer**. « Compléments alimentaires » constitue une entrée explicite ; elle peut aussi être atteinte depuis Nutrition sans dupliquer la brique.
- Chaque niveau ouvre la matrice plus spécifique correspondante ; les valeurs se règlent dans les **carrés temporairement étendus** décrits en 50.2.
- L'activité **utilise exactement la même brique fonctionnelle** que dans le scénario Mieux dormir, Perdre du poids ou Condition physique. Ne pas créer de version « natation sommeil » et une autre « natation libre » avec deux implémentations.
- Elle peut être démarrée librement ou associée à un projet après accord. Le suivi et les éventuelles données personnelles suivent les autorisations de l'utilisateur, même hors projet.
- Les **compléments alimentaires** suivent ce même fonctionnement : choisir une proposition facultative ou **saisir manuellement** un complément, le configurer dans la matrice, puis l'utiliser de manière autonome ou le rattacher à un projet. Les modalités détaillées et les garde-fous figurent en **50.8**.

## 50.6. Transversalité des briques et responsabilité des outils

- **Une bibliothèque de briques fonctionnelles réutilisables** est la source de vérité. Une brique peut servir plusieurs projets, et certaines briques peuvent contenir d'autres briques ; elle n'est jamais une collection de copies d'écrans indépendants.
- Les **scénarios** sélectionnent, configurent et assemblent ces briques ; la **matrice** les rend accessibles ; les **outils natifs** exécutent l'action ; le **calendrier** possède les occurrences ; le **Moniteur** interprète les observations. Ces responsabilités ne doivent pas être dupliquées.
- Une activité partagée n'est **réalisée ni comptée deux fois** ; ses relations à plusieurs projets sont explicites et révocables. Deux projets peuvent toutefois conserver des critères de réussite distincts. Ce principe vaut aussi pour le suivi d'un complément alimentaire utilisé dans plusieurs objectifs.
- Les modules de santé restent privés par défaut ; collecte de capteurs, partage et transmission nécessitent les permissions adaptées. Aucune suggestion d'IA ne vaut validation implicite d'une activité, d'un achat, d'un rendez-vous ou d'un partage.
- Conserver les composants et connexions réellement présents dans atome/eVe ; inventorier la matrice, les outils, les curseurs, les calendriers, alarmes, capteurs et le Moniteur avant de les connecter. Privilégier **JavaScript** dans le code eVe existant ; ne pas introduire une architecture d'interface concurrente.

## 50.7. Ordre de réalisation et tests de validation

**Ordre de travail :**

1. **Inventaire réel** des composants de matrice, de carrés sélectionnables, de curseurs natifs, de projets, d'activités, du calendrier, des alarmes, des capteurs disponibles et du Moniteur. Noter toute capacité manquante ; ne pas inventer une API.
2. Définir ou raccorder **une seule interaction matricielle réutilisable** : carré stable, extension sur deux à trois cellules, curseur natif, validation, rétraction, navigation en profondeur et retour.
3. Raccorder cette interaction à la **matrice des projets** et au parcours de **création d'un projet** ; ne pas conserver un second flux de rectangles dispersés.
4. Mettre en œuvre et tester le scénario pilote **Mieux dormir**, en préservant le document source et en réutilisant calendrier, activités, alarmes, capteurs autorisés et Moniteur réellement existants.
5. Exposer les mêmes briques depuis la **matrice autonome Activités**, puis vérifier leur réutilisation dans un deuxième objectif sans duplication d'exécution ou de données.
6. Détailler et implémenter progressivement les **huit autres scénarios** avec leur configuration propre, sans recréer l'interface ni le moteur à chaque fois.
7. Réaliser les **tests d'usage et de régression** sur iOS/iPad, web et macOS selon les plateformes prises en charge.

**Critères d'acceptation spécifiques à cette décision :**

- Un carré de réglage **devient temporairement un rectangle aligné** occupant deux ou trois unités de grille ; son slider fonctionne, sa valeur est sauvegardée, puis il **redevient un carré** ; l'ouverture suivante restitue la valeur.
- Les autres carrés se réorganisent sans chevauchement, déformation, saut intempestif ni perte de focus/sélection, y compris sur petit écran et lors des changements d'orientation.
- Les carrés de navigation font apparaître la **bonne matrice fille** et permettent retour, reprise et validation sans créer des doublons.
- La vue de **création de projet**, les projets existants, les neuf objectifs de santé et la bibliothèque **Activités** présentent le **même langage visuel** et des modules réels, non des simulations décoratives.
- Une même activité (par exemple Natation) fonctionne depuis un projet et depuis **Activités** avec les mêmes paramètres et outils ; sa planification et son suivi ne dupliquent ni occurrence ni comptage.
- Les rappels ouvrent le contexte pertinent seulement selon les **capacités autorisées de la plateforme** ; aucun capteur indisponible ou non autorisé n'est présenté comme actif.
- Le Moniteur sépare activité réalisée, bénéfice observé, déclaration utilisateur et mesure instrumentée ; pause, reprise et modifications n'effacent pas l'historique.
- Depuis **Activités → Compléments alimentaires**, l'utilisateur peut consulter des **suggestions facultatives**, **ajouter manuellement** un produit absent des suggestions, retrouver sa configuration, planifier ou enregistrer une prise s'il le décide, sans création d'un deuxième moteur ni recommandation de dosage automatique.

**Décision de design à conserver : une seule grammaire visuelle matricielle dans atome/eVe, des carrés comme unité de base, des expansions temporaires pour régler, et des matrices imbriquées pour approfondir.**

## 50.8. Compléments alimentaires — brique transversale avec propositions et saisie manuelle

**Décision complémentaire du 11 octobre 2026.** Ajouter « **Compléments alimentaires** » parmi les briques accessibles dans la **matrice du panneau Activités**, au même titre que Sport, Nutrition, Méditation et les autres catégories. Cette brique n'est ni limitée à un objectif de santé ni un outil indépendant recréé pour chaque projet. Une entrée Nutrition peut pointer vers cette **même brique**.

**Deux façons d'entrer dans cette brique :**

1. **Proposition facultative.** eVe peut afficher des compléments à envisager ou à consulter, selon le contexte et les informations disponibles. Une proposition n'est pas une prescription ni un ajout automatique au programme : l'utilisateur choisit de l'examiner, de l'ignorer ou de la valider. Le système ne suppose pas qu'un complément est nécessaire ou bénéfique en l'absence d'éléments suffisants.
2. **Saisie manuelle.** L'utilisateur peut enregistrer **n'importe quel complément qu'il utilise ou souhaite suivre**, même absent des propositions, en saisissant au minimum son **nom**. Si nécessaire, il peut préciser le produit, la forme, les composants, la quantité réellement prise et son unité, les horaires, la fréquence, les notes et la date de début/fin. Les informations non connues restent facultatives ou « non renseignées » ; ne pas inventer une composition ni une quantité.

**Parcours matriciel commun :** `Activités → Compléments alimentaires → Proposition / Saisie manuelle → Complément choisi → Paramètres → Validation`. Chaque élément part d'un carré de la matrice ; si un réglage nécessite davantage de place, le **carré s'étend sur deux ou trois cellules**, révèle les options **réelles** dans sa surface, puis revient à un carré après validation, comme en 50.2. Pour du texte libre (nom d'un produit), employer le composant de saisie natif existant dans cette même grammaire visuelle ; ne pas forcer un slider pour saisir un nom.

**Après validation**, la brique peut :

- être retrouvée dans les **Activités personnelles**, sans nécessiter la création d'un objectif ;
- être liée, avec l'accord de l'utilisateur, à un ou plusieurs projets-objectifs pertinents, **sans duplication de la même fiche ni double comptage** ;
- créer, **uniquement si l'utilisateur le souhaite**, des occurrences dans le calendrier commun, des rappels et un moyen de consigner les **prises effectivement déclarées** (distinctes des prises seulement prévues ou des notifications envoyées) ;
- faire remonter au Moniteur les déclarations et observations autorisées, en conservant source, date, contexte et incertitudes, **sans attribuer automatiquement un effet positif ou négatif** au complément.

**Limites et sécurité :** ne pas proposer de dosage personnalisé, de traitement, d'augmentation de dose ou d'achat automatisé. Distinguer clairement une fiche enregistrée par l'utilisateur d'une suggestion du système, et les informations établies de celles qui sont incertaines. Lorsqu'un risque de contre-indication, d'interaction avec un médicament, de grossesse ou de maladie est pertinent, inviter à une vérification auprès d'un professionnel de santé plutôt que d'automatiser la décision. Le contenu et les historiques restent **privés par défaut**, avec les mêmes règles de consentement que les autres données de santé. Les connexions à une base de données produits, au calendrier et au Moniteur doivent être **vérifiées** avant de déclarer ces capacités implémentées.

## 50.9. Activités sportives — matrices spécialisées, paramètres et exécution interactive

**Décision complémentaire du 11 octobre 2026.** Le fonctionnement détaillé de « Musculation » n'est **pas une exception ni une démonstration sans suite** : chaque discipline proposée dans **Activités → Sport** doit être déclinée en **matrices de sous-activités réellement configurables**, avec des pictogrammes adaptés et des paramètres spécifiques à sa pratique. Le même modèle s'applique aux activités sportives intégrées à un objectif et à celles démarrées librement. Il faut **décrire et réaliser progressivement chaque discipline**, sans prétendre que le catalogue exhaustif ou les pictogrammes existent déjà.

**Navigation commune, toujours matricielle :**

`Activités / Projet → Sport → Discipline → Séance ou mouvement → Équipement / exercice / variante → Paramètres → Valider / Planifier / Démarrer`

- Chaque niveau part de **carrés alignés dans la matrice d'atome** ; un carré de sélection ouvre la matrice fille. Un carré de paramètre s'étend temporairement en rectangle de **deux ou trois unités de grille**, affiche le véritable contrôle natif (curseur, sélecteur, saisie), enregistre la valeur puis redevient carré.
- Chaque activité ou mouvement possède un **pictogramme reconnaissable et cohérent** avec le vocabulaire graphique existant ; le pictogramme correspond à l'exercice réel et non à une icône générique décorative. Les ressources visuelles à concevoir sont des livrables, pas des composants supposés déjà disponibles.
- Les choix de mouvements, de machines et de positions reposent sur des **éléments réutilisables** et des références stables : une séance peut assembler plusieurs exercices et les ordonner, sans créer une copie de l'outil pour chaque usage.
- Un **socle commun d'activité** conserve identité, objectifs associés, variantes, durée, fréquence/récurrence, horaire, conditions, contraintes, suivi, provenance, historique et paramètres effectivement pertinents. Les **paramètres spécifiques** ne s'affichent que pour les disciplines auxquelles ils s'appliquent. Une mesure facultative inconnue reste « non renseignée ».

**Déclinaison par pratique — première grille de spécifications à approfondir discipline par discipline :**

| Discipline / contexte | Matrices et briques spécialisées | Réglages pertinents, selon la pratique | Suivi d'exécution |
| --- | --- | --- | --- |
| **Musculation / machines / poids libres** | Séance (par ex. bras) → groupes musculaires → machine ou mouvement (par ex. triceps) → série. Variantes possibles : appareil, haltères, barre, poids du corps. | Charge et unité (kg), **nombre de séries**, **répétitions par série**, durée de repos, durée totale, périodicité, progression/objectif sur une période. Éventuellement unilatéral/bilatéral, résistance, assistance, tempo si disponibles et utiles. | Afficher le mouvement courant et la série courante. **Un appui tactile valide la série réalisée et affiche la suivante**, sans ressaisie inutile ; possibilité de corriger le nombre réel de répétitions/la charge, de passer, de mettre en pause ou d'annuler. Enregistrer la réalisation effective de chaque série et de la séance. |
| **Natation / piscine** | Natation → nage / type de séance → bassin / exercice → longueur ou intervalle. | Longueur du bassin (m), **nombre de longueurs**, distance totale, durée, cadence/allure, séries et récupérations, fréquence ; unités explicites. | Avancer à la longueur ou à l'intervalle suivant, consigner longueurs et temps réels, distinguer saisie tactile de données de montre/capteur réellement disponible. |
| **Course / marche / tapis** | Course ou marche → environnement (extérieur, piste, tapis) → séance / intervalle. | **Distance (km ou m)**, **durée**, vitesse (**km/h**), allure (min/km), fractionnés/répétitions, récupération, fréquence ; GPS facultatif en extérieur, vitesse du tapis déclarée si applicable. | Départ, pause, reprise, arrivée ; distance, durée et allure selon source réelle ; correction manuelle et enregistrement d'un parcours uniquement si autorisé. |
| **Cyclisme / vélo d'intérieur** | Vélo → extérieur / appareil → séance / segment. | Distance, durée, vitesse, dénivelé, résistance ou puissance uniquement si l'équipement et ses données existent, intervalles et cadence facultatifs. | Suivi des segments, interruptions, provenance des données et bilan. |
| **Mobilité / étirements / yoga / exercices au sol** | Discipline → zone ou objectif → **position / mouvement**, accompagné de son pictogramme → séquence. | Tenue de position, nombre de passages, côté du corps, répétitions, repos, intensité ressentie et durée, lorsque pertinent. | Passer à la position suivante, enregistrer durée réellement tenue, adaptations et ressenti. |
| **Autres sports / activités non cataloguées** | Même matrice, discipline configurable par briques disponibles ; extension du catalogue après validation des critères propres. | Paramètres choisis **selon la discipline**, pas formulaire universel imposant charge/séries/distance à tous. | Démarrage et journal d'activité utilisables même sans capteur ni modèle spécialisé ; ne pas afficher une fonctionnalité non implémentée. |

**Exemple musculation demandé, non prescriptif :** `Sport → Musculation → Bras → Triceps → Appareil / mouvement → Charge : 10 kg → 5 séries × 5 répétitions → Programme d'un mois → Valider`. Ces valeurs **illustrent le paramétrage** et ne sont pas des recommandations d'entraînement. Les charges, répétitions, séries, volumes et progressions restent modifiables et enregistrent leurs changements dans le temps.

**Lancement depuis le calendrier et interaction en séance :**

1. Une activité acceptée est reliée à une **occurrence du calendrier commun** (date/heure, durée, récurrence, notification selon les autorisations). Le projet Dashboard affiche la même activité, sans doublon.
2. Un rappel peut **ouvrir directement l'activité ou son contexte** lorsqu'on l'active ; ne pas promettre qu'une notification iOS impose automatiquement l'ouverture de l'application au premier plan sans intervention de l'utilisateur.
3. L'**outil réel de séance** se place au premier plan dans l'environnement d'atome avec l'exercice courant, son pictogramme et les réglages déjà validés ; conserver le design natif, sans nouveau logiciel de fitness parallèle.
4. Pendant la séance, une action **simple et accessible au toucher** fait avancer d'une série, d'une longueur, d'un intervalle, d'une position ou d'une étape à la suivante. Permettre pause, retour/correction et arrêt sans perdre l'historique. L'action tactile ne doit pas valider une réalisation fictive en cas de contact accidentel ; confirmation/annulation ou correction selon les interactions natives.
5. Si le capteur ou l'appareil associé existe et si les autorisations sont accordées, utiliser ses **données réelles**. Sinon proposer un suivi manuel. Distinguer **planifié, démarré, déclaré accompli et mesuré**.
6. En fin de séance, conserver les valeurs **prévues et effectivement réalisées** (ex. charge et séries, longueurs, durée, distance), la provenance, la date et le ressenti. Le Moniteur exploite l'évolution sans confondre **activité réalisée** et **bénéfice démontré**.

**Exigence éditoriale pour la suite :** chaque discipline ajoutée doit disposer d'une fiche descriptive de ses **matrices successives, mouvements/positions, pictogrammes, paramètres spécifiques, unités, contrôle en cours d'activité, mesures récupérables, suivi manuel alternatif et tests**. Les pictogrammes et l'inventaire exhaustif des mouvements seront construits et vérifiés par lots, pas inventés comme déjà disponibles.

## 50.10. Examens, bilans et résultats de toute nature — une brique « Résultats » universelle

**Décision complémentaire du 11 octobre 2026 : il ne s'agit pas uniquement de bilans sanguins.** Créer ou raccorder **une brique fonctionnelle transversale « Résultats »**, utilisable par les projets de santé **et, lorsque pertinent, par les autres projets et activités**. Un bilan est un cas particulier d'un résultat, pas une nouvelle base de données propre au sang.

**Exemples non exhaustifs de contenus à mémoriser :** analyses sanguines, urinaires ou autres analyses biologiques ; comptes rendus médicaux ; résultats d'imagerie et documents associés (radiologie, échographie, IRM, etc.) ; explorations cardiaques ou respiratoires ; évaluations physiques et sportives ; poids, tension et autres mesures ponctuelles ; relevés de capteurs ; questionnaires, scores, observations et ressentis ; résultats d'un test, d'un examen, d'une consultation ou de toute autre activité. **Les données qualitatives, les textes et les documents sont aussi des résultats**, même lorsqu'aucune valeur numérique ou tableau CSV n'existe.

**Deux responsabilités distinctes et reliées :**

1. **Agenda** — proposer des dates et rappels pour analyses, examens, bilans périodiques, consultations, bilans avec le médecin et revues de programme ; gérer répétitions, reports et annulations **selon les choix de l'utilisateur**. Un examen planifié **n'est pas** un résultat reçu.
2. **Résultats** — lorsqu'un document ou une mesure est reçu, **enregistrer et retrouver durablement le contenu et son historique**, qu'il soit lié ou non à un événement du calendrier. Ce stockage ne se réduit pas à l'alarme, au rendez-vous ni au projet Dashboard.

**Parcours matriciel de la brique :**

`Activités / Projet → Examens et résultats → Type de résultat / examen → Planifier OU Ajouter un résultat → Source / fichier / valeurs → Vérifier → Enregistrer → Consulter les évolutions`

- Accès à cette **même brique** depuis plusieurs objectifs (sommeil, condition physique, prise de masse, etc.) et par la matrice autonome Activités ; aucune base de résultats indépendante par scénario.
- **Import possible d'un fichier reçu** (ex. PDF, CSV, document, image, selon formats réellement pris en charge), ou **saisie manuelle** des valeurs et observations. Conserver **l'original sans altération** en plus de toute extraction structurée. Les documents complexes, visuels et annexes doivent rester consultables, sans tentative de les réduire artificiellement à une cellule CSV.
- Pour les **données structurables**, mémoriser chaque observation avec au minimum : identifiant stable ; date et heure de mesure ou prélèvement ; date de réception si différente ; type d'examen/activité ; paramètre ou nature du résultat ; **valeur et unité si applicable** ; intervalle de référence et méthode lorsque disponibles ; contexte ; source et auteur/professionnel quand connus ; document d'origine ; type de saisie (manuelle, importée, instrumentée) ; statut de vérification ; rattachement facultatif à un ou plusieurs projets.
- Pour les **résultats non numériques**, conserver le document, le texte, l'image, la pièce jointe ou la qualification avec ses métadonnées, sans inventer de valeur. Une extraction automatique éventuelle reste une **proposition à vérifier**, jamais une donnée médicale « certifiée » par simple lecture automatique.
- Offrir un **format structuré exportable en CSV** pour les séries et tableaux qui s'y prêtent, avec colonnes explicites, unités, dates et références de source ; un autre format structuré peut être nécessaire en stockage natif pour préserver les types, métadonnées, références et pièces jointes. **CSV n'est ni le seul format ni un substitut au document original.** Pas de conversion destructive.
- Conserver **tous les résultats successifs et leurs versions** afin d'afficher l'évolution d'un même paramètre ou d'une même performance dans le temps. Vérifier **unités, méthodes, conditions et comparabilité** avant toute courbe ou comparaison ; présenter une incertitude ou une rupture de série lorsqu'elle existe. Un changement de document ou une correction ne doit pas effacer silencieusement la valeur historique.
- Le **Moniteur commun** agrège les observations **autorisées**, garde la provenance de chaque donnée et sépare fait observé, ressenti, interprétation et hypothèse. Un résultat hors normes peut justifier une invitation à consulter ; **aucun diagnostic ni changement de traitement ou de complément n'est décidé automatiquement**.
- **Données privées par défaut** : autorisations de collecte et d'import, contrôle d'accès par document/valeur, partage explicite vers un professionnel ou un proche, traçabilité des corrections et export, respect des capacités et garanties réelles de stockage/chiffrement d'atome à auditer. Une notification ne révèle pas un résultat médical sensible sur écran verrouillé.

**Lien avec les activités sportives :** une séance de natation peut générer des résultats de longueurs, de temps et de distance ; une séance de musculation des séries, répétitions et charges ; un laboratoire un compte rendu et plusieurs paramètres. Ils sont de **natures différentes mais suivent le même principe de traçabilité, d'import éventuel, de stockage et d'historique**. Réutiliser les objets d'observation existants si leur modèle le permet, sans fabriquer une API ou un système concurrent.

## 50.11. Compléments alimentaires, agenda et bilans réguliers — règles de liaison

Cette sous-section complète **50.8** et **50.10** sans créer une troisième application de suivi.

- **Compléments alimentaires** : depuis leur carré dans Activités, l'utilisateur peut sélectionner un produit proposé **ou le saisir manuellement**, renseigner **quantité/dose et unité** telles qu'indiquées par le produit, le prescripteur éventuel ou l'utilisateur, ainsi qu'horaires, jours, fréquence, durée et notes. Distinguer **dose déclarée**, **prise planifiée** et **prise réellement notée** ; pas de posologie imposée par défaut par l'IA.
- **Calendrier commun** : après accord, créer des occurrences pour les horaires de prise, ainsi que des rendez-vous de suivi, **bilans périodiques et consultations médicales**. Le rappel n'atteste ni la prise d'un complément ni la réalisation d'un examen. Reporter une occurrence modifie les rappels liés sans perdre les prises et bilans antérieurs.
- **Réception du bilan** : au retour d'un médecin, laboratoire ou autre prestataire, importer le **compte rendu original** et/ou saisir les observations dans la **brique Résultats**, avec date de réalisation, type d'examen, valeurs mesurées, unités et source lorsque disponibles. Le lien avec l'événement du calendrier est facultatif mais conservé s'il existe.
- **Suivi longitudinal** : le Moniteur peut rapprocher l'historique des prises **déclarées** et celui des résultats (biologiques ou non) pour les présenter côte à côte. **Une concomitance ne démontre pas une causalité** et ne déclenche pas automatiquement une recommandation de dosage ou de traitement. Les professionnels restent responsables des décisions médicales.
- **Scénarios transversaux** : la même brique Résultats peut documenter une prise de masse, une amélioration du sommeil, une évaluation de douleur, un contrôle périodique ou un projet hors santé, dans les limites des autorisations et sans compter deux fois le même examen.

## 50.12. Ordre de développement et critères d'acceptation complémentaires

1. **Inventorier** les véritables outils atome/eVe : composants carrés/matrice, exercices existants, pictogrammes, contrôles de valeurs, calendrier/rappels, outils d'exécution, capteurs/permissions, stockage de fichiers et mesures, import/export, Moniteur et accès aux données. Documenter leurs API et manques avant développement ; **JavaScript** pour les composants eVe, sans introduire TypeScript par défaut.
2. **Définir les briques réutilisables** : type de discipline, séance, mouvement, paramètres et unités ; occurrence de calendrier ; résultat typé et source ; référence au fichier d'origine ; liens entre projets. Réutiliser les objets et connexions réels plutôt que dupliquer leurs responsabilités.
3. **Réaliser les disciplines par lots**, avec au moins les démonstrateurs complets Musculation, Natation et Course : matrices approfondies, pictogrammes adaptés, réglages natifs, planification, lancement, avancement tactile, stockage de réalisations et retour Moniteur. Étendre ensuite sport par sport / position par position selon un inventaire priorisé.
4. **Réaliser le suivi des compléments** et les rendez-vous de bilan avec données saisies manuellement, horaires et rappels, sans prescrire automatiquement.
5. **Réaliser la brique Résultats universelle** : saisie manuelle, import d'un document, conservation de l'original, normalisation non destructive des valeurs applicables, historique, export CSV pertinent et réutilisation par plusieurs objectifs ; étendre progressivement les connecteurs réels.
6. **Valider en conditions réelles sur les plateformes prises en charge**, notamment iPad/iOS, web et macOS, dans le respect des limites des systèmes d'exploitation, capteurs et permissions.

**Tests à passer :**

- **Musculation** : configurer `10 kg, 5 × 5` sur un mouvement, l'insérer dans une séance, exécuter cinq séries avec l'appui tactile, modifier la troisième série réellement accomplie, interrompre/reprendre puis retrouver chaque série et l'historique sans duplication.
- **Natation** : définir taille du bassin, longueurs et durée cible ; enregistrer longueurs et temps réels sans montre ; associer un capteur seulement si disponible et autorisé ; retrouver unités et distance totale cohérentes.
- **Course** : afficher et enregistrer durée, distance et vitesse en km/h (ou allure explicitement convertie) ; gérer une mesure GPS absente ou refusée sans inventer de parcours.
- **Compléments** : choisir un produit proposé puis ajouter un autre produit par saisie libre ; régler une quantité déclarée et les horaires ; vérifier que l'agenda et le Moniteur ne confondent pas rappel, prise déclarée et observation médicale.
- **Résultats multi-formats** : importer un compte rendu sanguin avec plusieurs mesures, puis un résultat **non sanguin** (par exemple compte rendu d'imagerie ou d'examen fonctionnel), une donnée sportive et un questionnaire qualitatif ; conserver chaque original et ses métadonnées, exporter la série tabulaire en CSV quand possible et restituer correctement les résultats non tabulaires.
- **Évolution** : enregistrer deux bilans datés d'un même paramètre, gérer des unités non directement comparables, afficher une courbe uniquement après harmonisation validée, conserver provenance, corrections, et lier sans doublon le résultat à deux projets.
- **Vie privée / limites OS** : pas de partage implicite de bilan, pas de données fictives, pas d'ouverture forcée non autorisée depuis une notification, pas de changement automatisé de dosage ou de prise en charge médicale.

**Statut de ces sections : spécification fonctionnelle, non preuve que les modules, pictogrammes, connecteurs et capteurs sont déjà implémentés.**


---

# 51. Cursus transversal de santé, de bien-être et d'activités — spécification clinique et fonctionnelle consolidée (11 octobre 2026)

> **Statut : cahier des charges de conception, à valider médicalement et techniquement avant exploitation.** Cette section **complète et précise la section 50**, mais **remplace sa liste initiale de neuf objectifs par douze objectifs** : les neuf originaux sont maintenus ; **Rajeunissement / vieillir en bonne santé**, **Bien-être** et **Santé mentale** sont ajoutés. Elle redéfinit aussi le scénario « Mieux dormir », dont les propositions initiales étaient exploratoires. Aucun exemple, dose, temps ou paramètre ci-dessous ne constitue une prescription personnalisée. Le système n'est ni un médecin, ni un diagnostic, ni un dispositif médical homologué. Les hypothèses fonctionnelles nécessitent un inventaire des vrais outils d'atome/eVe ; aucune API n'est présumée existante.

## 51.1. Les douze objectifs officiels et leurs frontières

| Code stable | Objectif choisi dans la matrice | Finalité et frontière |
| --- | --- | --- |
| OBJ-01 | **Perdre du poids** | Démarche nutritionnelle et comportementale adaptée lorsqu'une réduction du poids est indiquée et librement souhaitée ; pas de restriction automatique. |
| OBJ-02 | **Mieux dormir et retrouver de l'énergie** | Qualité du sommeil, rythme et fonctionnement diurne ; orientation vers le soin si suspicion d'insomnie chronique ou d'un trouble du sommeil. |
| OBJ-03 | **Prendre de la masse musculaire** | Progression musculaire et fonctionnelle, entraînement, alimentation et récupération. |
| OBJ-04 | **Gérer une douleur** | Mieux vivre avec une douleur et accéder à une prise en charge adaptée ; aucune affirmation sur la cause. |
| OBJ-05 | **Repérer un trouble et être orienté** | Organiser des symptômes, examens et consultations ; pas de diagnostic autonome ni d'examen systématique sans justification. |
| OBJ-06 | **Préserver du temps pour soi** | Rétablir de l'espace personnel, du repos choisi et des limites de disponibilité. |
| OBJ-07 | **Retrouver le calme intérieur** | Détente, respiration confortable, méditation facultative, régulation du stress ordinaire. |
| OBJ-08 | **Tenir un journal personnel** | Expression et réflexion intime ; non assimilé à un dossier médical obligatoire. |
| OBJ-09 | **Améliorer sa condition physique** | Endurance, force, mobilité et autonomie, selon niveau réel et contraintes. |
| OBJ-10 | **Rajeunissement / vieillir en bonne santé** | Préserver les capacités et, si demandé, l'apparence cutanée ; ne jamais promettre un rajeunissement biologique mesuré ou une inversion de l'âge. |
| OBJ-11 | **Améliorer son bien-être** | Satisfaction de vie, énergie vécue, loisirs, liens, équilibre quotidien ; distinct d'un diagnostic psychiatrique. |
| OBJ-12 | **Prendre soin de sa santé mentale** | Reconnaissance des difficultés, soutien, habitudes aidantes et accès à des professionnels ; pas de diagnostic ni de traitement automatisé. |

Ces objectifs **ne sont pas douze applications** : chacun est un **assemblage de briques transversales** du même moteur d'atome. Par exemple, `BR-ACT-MARCHE` peut contribuer au sommeil, au bien-être, à la condition physique et au vieillissement en bonne santé, avec **une seule occurrence réellement effectuée** et des résultats interprétés séparément pour chaque objectif. Les fonctions Santé mentale et Calme intérieur peuvent proposer certaines activités communes mais elles ne sont pas interchangeables.

**Périmètre initial des repères chiffrés : adultes**, principalement adultes en bonne santé. Les adolescents, femmes enceintes, personnes fragiles, personnes atteintes de maladies chroniques, personnes ayant des troubles du comportement alimentaire ou personnes suivant un traitement peuvent avoir besoin de règles spécifiques et d'une validation clinique. Ni un curseur d'effort élevé ni un désir de résultats rapides ne lève ces conditions.

## 51.2. Le parcours unique de l'utilisateur (douze objectifs, même interface)

**Matrice d'entrée :** `Projets → Créer / Reprendre → Objectif → [carrés des 12 objectifs]`. Un objectif déjà commencé s'ouvre sans duplication. Chaque phase ci-dessous reste une matrice de **carrés** ; les carrés ayant une valeur ajustable s'étendent **sur deux ou trois unités de grille** pour montrer leur commande native puis se referment.

1. **Choix de l'intention :** choisir un objectif ou formuler son propre but. Éviter un score ou un plan médical automatique à l'écran d'entrée.
2. **État de départ minimal :** réutiliser uniquement les données déjà présentes **avec permission** ; sinon demander quelques éléments *pertinents pour cette décision* (situation, habitudes, contraintes, accessibilité, activité ou symptômes). La personne peut choisir « je ne sais pas » ou « plus tard ».
3. **Vérification de faisabilité / précautions :** chercher les contre-indications pertinentes, le besoin d'orientation médicale et les contraintes matérielles. Une difficulté sérieuse peut suspendre *une activité spécifique*, pas verrouiller tout le projet.
4. **Deux réglages communs et visibles :** `Effort que je souhaite consacrer` puis `Temps réellement disponible`. Les deux sont des carrés extensibles à curseur ; les règles sont détaillées en 51.3.
5. **Proposition de briques :** présenter une **petite sélection expliquée** (deux à quatre au départ, pas l'ensemble du catalogue) ; pour chacune, afficher l'intérêt plausible, la charge requise, les éventuels prérequis et le niveau de confiance scientifique.
6. **Approfondissement matriciel :** `Domaine → Brique → Activité → Variante / Matériel → Paramètres → Prévisualisation`. Un réglage est édité **dans le carré étendu**, pas dans une fenêtre flottante.
7. **Consentement brique par brique :** `Accepter`, `Modifier`, `Refuser`, `Reporter` ; aucune nutrition, complément, examen, séance, collecte ni partage n'est imposé. L'utilisateur choisit le nombre de briques actives.
8. **Validation du programme :** afficher la somme **réelle des minutes par semaine**, l'horaire possible et les conflits ; proposer une réduction lorsqu'il y a surcharge. Les actions transverses comptent une seule fois.
9. **Projet Dashboard :** synthèse `Aujourd'hui / À venir / Bilan`, issue du **projet atome existant**. La vue calendrier propose les occurrences à autoriser : récurrence, alarmes, rappels, visites, repos ; pas de second agenda.
10. **Exécution :** au déclenchement de l'occurrence, ouvrir l'outil **réel** de l'activité depuis le contexte du calendrier quand la plateforme le permet. Capteur autorisé s'il existe, sinon saisie manuelle. L'outil marque les étapes (série, longueur, repas, note, exercice, etc.).
11. **Résultats :** stocker valeurs prévues et réalisées, date, unité, instrument/source, observations subjectives et documents originaux ; l'absence de mesure vaut « non renseigné ». Le Moniteur rapproche les tendances **sans faire passer une association pour une causalité**.
12. **Bilan et adaptation :** mini-retour après l'activité si la personne le souhaite ; révision après 7 jours, puis 4 semaines, puis à intervalle libre. Conserver toutes les versions, permettre pause, reprise, retrait de brique et objectif terminé/maintenu.

**Règle centrale :** c'est l'utilisateur qui pilote l'effort, l'organisation et les décisions ; le système compose et aide à observer, il ne prescrit pas en silence.

## 51.3. Curseurs : effort voulu, temps disponible et progression tolérable

### A. Carré « Effort souhaité » — un seul curseur commun, cinq paliers

Le mot **effort** exprime ici la **charge d'engagement que l'utilisateur accepte** : fréquence, complexité, nécessité de changer des habitudes et temps réellement mobilisé. **Ce n'est pas une autorisation de séance physiquement intense**, ni un score de maladie, ni une estimation automatique de condition cardiorespiratoire.

| Palier affiché | Sens pour l'utilisateur | Construction initiale proposée (configuration, pas prescription) |
| --- | --- | --- |
| **1 · Minimum** | Je veux le plus facile à tenir | **1 brique prioritaire**, micro-action de **2–5 min** aux jours choisis, sans culpabilisation en cas d'absence. |
| **2 · Doux** | Je commence tranquillement | **1–2 briques**, activités de **5–15 min**, progression lente et réversible. |
| **3 · Régulier** | Je peux m'engager de façon stable | **2–3 briques**, une organisation dans la semaine, revue hebdomadaire. |
| **4 · Soutenu** | J'accepte plusieurs changements | **3–4 briques**, créneaux structurés, récupération et charge hebdomadaire surveillées. |
| **5 · Ambitieux** | Je souhaite un projet exigeant | **Jusqu'à 4–5 briques**, mais seulement si elles sont compatibles avec le temps, les capacités et les précautions ; **aucune intensité maximale induite**. |

Les durées de ce tableau sont des **tailles de briques UX** pour amorcer le parcours ; elles ne constituent pas un volume d'entraînement médicalement recommandé. Si la personne a 10 minutes disponibles, le palier 5 n'invente pas une heure de sport. Si une seule brique suffit, aucun objectif n'oblige à en ajouter quatre.

### B. Carré « Temps disponible » — réglage réutilisable et transparent

- Deux vues du **même budget** (pas deux exigences supplémentaires) : `minutes / jour habituel` **ou** `minutes / semaine`. Valeur initiale **à demander**, jamais devinée. `0` signifie « je prépare sans programmer ». Exemple d'amplitude **UI configurable** : 0 à 120 min/j, 0 à 840 min/sem, par pas de 5 min ; au-delà, permettre une saisie explicite, sans limites médicales déguisées en règles d'interface.
- Un carré s'ouvre, s'élargit en **rectangle aligné 2–3 carrés**, montre le curseur natif et une conversion lisible (ex. `20 min/j, 5 jours = 100 min/sem`), puis se referme en mémorisant **100 min/semaine et la distribution choisie**.
- Le nombre de jours réellement libres (`lundi…dimanche`), les fenêtres horaires, contraintes de déplacements, repos et fuseau horaire se choisissent **uniquement si nécessaires à la planification**, dans des carrés de matrice plus profonds ; pas de questionnaire affiché d'emblée.
- Tous les modules communs débitent **un même budget** : le suivi de la séance bras partagé entre OBJ-03 et OBJ-09 n'est compté qu'une fois. Les minutes de trajet, de préparation, de repos **occupant réellement le planning** peuvent être affichées séparément, avec choix utilisateur.
- Afficher `prévu : X min / disponible : Y min` et les conflits **avant validation**, sans glissement silencieux des horaires. `X > Y` entraîne une proposition de simplifier ou reporter, jamais un dépassement imposé.

### C. Capacité actuelle, obstacles, récupération — paramètres séparés et non obligatoires

- **« Qu'est-ce que je peux faire aujourd'hui ? »** : réponse minimale *sans difficulté / limité / besoin d'un avis / je ne sais pas*. Pour le sport, demander le **niveau réellement pratiqué**, les restrictions physiques et le matériel disponible **au moment d'activer Sport**. Une forte motivation **n'augmente jamais les capacités physiologiques présumées**.
- **« Aller doucement / progresser / maintenir »** : préférence **optionnelle** qui module l'**évolution du programme**, pas un troisième curseur imposé. « Récupérer des résultats plus vite » n'autorise pas à supprimer les jours de récupération, à raccourcir une thérapie ou à augmenter une dose.
- **« Ma priorité »**, **« Mes obstacles »** (fatigue, coût, transport, handicap, douleur, horaires, alimentation), **« Je préfère… »** (matin/soir, intérieur/extérieur, autonome/accompagné) : carrés facultatifs révélés en profondeur. Possibilité de personnaliser un module sans dévoiler un dossier de santé entier.
- **Intensité sportive réelle** : uniquement dans les activités sportives, via effort perçu **RPE 0–10** / test de conversation lorsque pertinent, **distinct du curseur d'engagement**. Débutant : pas de test de charge maximale, de « challenge » extrême ni de hausse automatisée.
- **Règle d'adaptation** : journaliser `réalisé / non commencé / reporté`, difficulté ressentie, fatigue, douleur, tolérance ; proposer **maintenir, réduire, déplacer** ou **augmenter graduellement après validation**. Ne pas calculer une « charge médicale sûre » à partir des seuls curseurs.

### D. Exemple de partage du temps

`Mieux dormir · Effort 2 · 90 min/semaine` : l'utilisateur accepte **10 min de lumière matinale extérieure, 5 jours (50 min)** + **10 min de rituel apaisant, 4 soirs (40 min)**. Total proposé **90 min**, sous réserve de son contexte, sans ajout arbitraire de natation, de régime ni de complément. Un temps de journal sommeil facultatif peut remplacer une autre activité ou être explicitement ajouté au budget. En cas de travail posté, de contre-indication d'exposition extérieure, ou de gêne, la proposition change.

## 51.4. Répertoire initial des briques transversales — source de vérité

**Toute brique a un ID stable**, une catégorie, une finalité, un ensemble de paramètres pertinents, des activités possibles, les prérequis de sécurité, une durée estimée, des résultats et une politique de confidentialité. Un ID représente **une fonction réutilisable**, pas une capture d'écran ni une promesse qu'un outil existe déjà. Les `BR-` ci-dessous sont des **identifiants de spécification à mapper après audit**, pas des noms d'API atome actuellement certifiées.

| Domaine matriciel | Briques à inventorier / développer | Données ou décisions associées |
| --- | --- | --- |
| **Démarrage** | `BR-COM-01` intention ; `BR-COM-02` situation de départ ; `BR-COM-03` effort souhaité ; `BR-COM-04` temps disponible ; `BR-COM-05` contraintes/préférences ; `BR-COM-06` consentements ; `BR-COM-07` validation et adaptation | But, tolérance, créneaux, besoins, source des données et autorisations. |
| **Sommeil** | `BR-SOM-01` journal sommeil ; `BR-SOM-02` régularité lever/coucher ; `BR-SOM-03` lumière/rythme ; `BR-SOM-04` environnement/rituel ; `BR-SOM-05` stimulants et horaires ; `BR-SOM-06` orientation TCC-I / évaluation clinique | Heures de sommeil déclarées, horaires, réveils, somnolence, facteurs, consultations ; données des montres facultatives, non certifiées. |
| **Nutrition** | `BR-NUT-01` habitudes / bilan alimentaire ; `BR-NUT-02` choix de repas ; `BR-NUT-03` qualité des aliments et variété ; `BR-NUT-04` protéines ; `BR-NUT-05` légumes/fruits/fibres ; `BR-NUT-06` énergie/alimentation suffisante ; `BR-NUT-07` hydratation ; `BR-NUT-08` courses/préparation ; `BR-NUT-09` allergies, intolérances et adaptation | Aliments choisis, portions facultatives, fréquence, contraintes, éventuels objectifs nutritionnels **justifiés et consentis**. |
| **Activité physique** | `BR-ACT-01` marche ; `BR-ACT-02` endurance/course ; `BR-ACT-03` musculation ; `BR-ACT-04` natation ; `BR-ACT-05` rameur ; `BR-ACT-06` vélo ; `BR-ACT-07` mobilité/étirements ; `BR-ACT-08` yoga/pilates ; `BR-ACT-09` équilibre ; `BR-ACT-10` autres sports extensibles ; `BR-ACT-11` récupération/repos ; `BR-ACT-12` mouvement du quotidien | Sport → discipline → exercice → paramètres ; matériel réel ; durée, distance, charge, séries, positions, capteurs autorisés, ressenti et progression. |
| **Calme et émotions** | `BR-MEN-01` respiration confortable ; `BR-MEN-02` relaxation ; `BR-MEN-03` méditation/attention ; `BR-MEN-04` pauses et stress ; `BR-MEN-05` repérage de l'humeur ; `BR-MEN-06` activation comportementale ; `BR-MEN-07` soutien et aide professionnelle ; `BR-MEN-08` plan de sécurité personnalisé *avec professionnel lorsque nécessaire* | Ressenti volontaire, contextes, activités aidantes, rendez-vous ; **aucun diagnostic calculé automatiquement**. |
| **Vie personnelle** | `BR-VIE-01` temps pour soi ; `BR-VIE-02` loisirs/création ; `BR-VIE-03` journal privé ; `BR-VIE-04` liens sociaux ; `BR-VIE-05` limites/disponibilité ; `BR-VIE-06` organisation des routines | Créneaux choisis, activités, écrits privés, invitations explicites, objectifs qualitatifs. |
| **Santé et suivi** | `BR-SUI-01` symptômes ; `BR-SUI-02` douleur ; `BR-SUI-03` consultations/rendez-vous ; `BR-SUI-04` examens / prévention ; `BR-SUI-05` résultats multi-formats ; `BR-SUI-06` mesures / capteurs ; `BR-SUI-07` traitements déclarés ; `BR-SUI-08` compléments déclarés/proposés ; `BR-SUI-09` suivi longitudinal ; `BR-SUI-10` orientation et signaux d'alerte | Distinction prévue/effectuée/mesurée, documents originaux, unités, professionnel/source, corrections, historique, vie privée. |
| **Prévention et vieillissement** | `BR-AGE-01` prévention et suivi adapté ; `BR-AGE-02` santé fonctionnelle/autonomie ; `BR-AGE-03` peau et photoprotection ; `BR-AGE-04` capacités cognitives / activités enrichissantes ; `BR-AGE-05` santé bucco-dentaire ; `BR-AGE-06` prévention chutes/équilibre | Résultats pertinents et professionnels impliqués ; ne jamais produire « âge biologique » ou rajeunissement en années sans méthode cliniquement validée. |
| **Orchestration (déjà unifiée conceptuellement)** | `BR-SYS-01` matrice de sélection ; `BR-SYS-02` projet Dashboard ; `BR-SYS-03` calendrier/occurrences ; `BR-SYS-04` alarmes ; `BR-SYS-05` outil de séance ; `BR-SYS-06` Moniteur ; `BR-SYS-07` stockage/export ; `BR-SYS-08` consentements/partage | **Raccorder les vrais outils d'atome/eVe** plutôt que recréer un calendrier, un Moniteur, une boîte de dialogue ou une base de données par objectif. |

**Catalogue « Activités » autonome :** les mêmes domaines **Nutrition**, **Sport**, **Sommeil/Repos**, **Calme/Méditation**, **Bien-être**, **Journal**, **Suivi/Résultats**, **Compléments alimentaires** sont navigables sans projet-objectif. Un utilisateur peut par exemple lancer `Activités → Sport → Rameur`, consigner `Activités → Nutrition → Repas`, enregistrer `Activités → Suivi → Mesure`, ou créer une prise déclarée dans `Compléments`, puis **associer l'activité a posteriori** à un objectif, avec consentement et sans double comptage.

**Structure minimalement requise d'une fiche de brique :** `brick_id`, version, catégorie, nom court, pictogramme (référence vérifiée), outil natif réel associé, sous-matrices, variantes, paramètres typés + unités/bornes, valeur proposée et **statut preuve**, risques/prérequis, durée estimée, états, événements de suivi, sources de mesures, données facultatives, droits/consentements, objectifs reliés. Les réglages ne doivent pas être proposés lorsque leur discipline ne les utilise pas.

## 51.5. Repères scientifiques communs et politique des valeurs

Les valeurs suivantes sont **des références de santé publique ou des exemples d'interface**, jamais un programme délivré sans contexte. Chaque valeur affichée par eVe doit porter un **type** : `repère scientifique`, `exemple de saisie`, `préférence utilisateur`, `recommandation du professionnel`, `mesure enregistrée` ou `hypothèse à confirmer`.

| Sujet | Repère utilisable avec ses limites | Source et règle d'usage |
| --- | --- | --- |
| **Sommeil adulte** | **7–9 heures par nuit** comme ordre de grandeur populationnel ; variations selon âge et situation. | NIH/NHLBI [S03] ; ne pas pousser artificiellement une personne à « faire » neuf heures ni extrapoler un stade profond de montre grand public. |
| **Activité aérobie adulte** | **150–300 min/semaine modérée**, ou **75–150 min soutenue**, et **renforcement ≥2 jours/semaine** à terme ; **toute activité compte** au départ. | OMS [S01] ; **objectif de population, pas minimum imposé à un débutant** ou une personne malade. |
| **Alimentation générale >10 ans** | **≥400 g de fruits et légumes/jour**, **≥25 g de fibres alimentaires/jour** comme repères de population. | OMS [S02] ; attention aux régimes thérapeutiques, troubles digestifs et tolérance. |
| **Perte de poids** | Adaptation nutritionnelle individualisée ; si réduction calorique indiquée, déficit approprié et suivi ; aucun seuil standard d'apport énergétique ou cadence automatique. | NICE NG246 [S04] ; dépister restrictions dangereuses et troubles alimentaires avant le scénario. |
| **Entraînement de résistance** | Activités progressives, adaptées aux préférences et aux capacités ; force et hypertrophie possibles avec plusieurs stratégies. | ACSM **2026** [S05] ; ne pas imposer 5×5, l'échec musculaire, le test de charge maximale, ni la même dose à tous. |
| **Protéines et activité** | Chez les **adultes physiquement actifs en bonne santé**, plage de référence pour gains/maintien musculaires **1,4–2,0 g/kg de masse corporelle/jour**. | ISSN [S06] ; pas de cible universelle, prudence et validation pour maladie rénale ou autres contraintes médicales. L'alimentation demeure prioritaire. |
| **Créatine** | **Créatine monohydrate**, parmi les suppléments ayant des données sur la performance de force/effort bref ; **3–5 g/j** est une quantité *étudiée* chez des adultes, **pas une dose prescrite par atome**. | NIH ODS [S07]. Présenter seulement comme **option à examiner**, avec contre-indications/interactions et validation appropriée. |
| **Vitamines/minéraux** | Corriger une insuffisance identifiée ou un risque nutritionnel documenté ; **B12** si alimentation végétalienne inadaptée sans supplémentation, **fer** seulement avec indication, **vitamine D** selon situation clinique. | NIH ODS [S08] ; éviter les tests biologiques et suppléments systématiques, surdosage et interactions. |
| **Douleur chronique** | Évaluation centrée sur la personne ; exercice *adapté* et approches psychologiques peuvent contribuer dans des contextes choisis. | NICE NG193 [S09] ; douleur nouvelle/intense ou drapeau rouge → soins, pas exercices automatiques. |
| **Insomnie chronique** | **TCC-I multicomposante** recommandée comme prise en charge de première intention ; l'« hygiène du sommeil » isolée n'est pas suffisante. | AASM [S10] ; les restrictions de sommeil thérapeutiques nécessitent un cadre approprié, pas un calcul autonome de l'app. |
| **Santé mentale** | Activités, accompagnement psychologique et, selon le trouble, traitements médicaux ; chemin de soin selon symptômes/gravité. | NICE [S11] / OMS [S12]. Une app ne remplace pas une évaluation clinique. |
| **Vieillissement cutané** | Photoprotection large spectre **SPF ≥30** et mesures contre les UV utiles pour limiter le photovieillissement. | AAD [S13] ; les traitements dermatologiques plus actifs relèvent d'une discussion spécialisée. |
| **Vieillir en bonne santé** | Préserver **capacités fonctionnelles**, autonomie, santé sociale et mentale ; pas d'équivalence avec « retrouver un âge biologique de 25 ans ». | OMS [S14]. Les produits anti-âge expérimentaux ne deviennent pas des routines recommandées. |

**Règles complémentaires :** vérifier unité et contexte de chaque mesure ; ne jamais convertir une estimation d'IA en donnée de laboratoire ; ne jamais afficher un objectif de poids, une dose de supplément, une intensité d'exercice ou une fréquence d'examen médical comme « adaptée » sans les informations requises. Un programme sérieux peut ne contenir **aucun complément alimentaire** et **aucun bilan sanguin ajouté**.

## 51.6. Règles de personnalisation des douze scénarios

Pour chacun : **Entrée → données minimales → briques suggérées → matrices de configuration → validation → programme daté → action au premier plan → résultat → adaptation**. Les questions dépendent des briques effectivement envisagées ; l'application n'oblige pas à saisir le poids pour méditer ni son humeur pour courir. Le programme propose en priorité des changements **observables, réalisables et réversibles**. Les activités et mesures importantes doivent pouvoir être importées ou saisies manuellement sans capteur ni abonnement à un fabricant.

Les niveaux de recommandation visibles *sur demande* (pas nécessairement en texte sur chaque carré) : **A — pratique soutenue par recommandations solides pour la situation** ; **B — option raisonnable mais bénéfice ou application variable** ; **C — expérimental, efficacité non établie, non proposé comme routine** ; **P — prescrit par un professionnel identifié**. La provenance scientifique et la date de vérification sont conservées. Un classement A sur une activité générale ne prouve jamais qu'elle est indiquée pour cet utilisateur. Une nouvelle étude ou un avis professionnel peut entraîner la révision de la bibliothèque sans effacer les programmes historiques.

**Sorties communes** : chaque scénario détaille son critère principal (*par exemple amélioration de la fonction diurne pour le sommeil plutôt que « HRV parfaite »*), un ou deux indicateurs facultatifs, des conditions d'alerte et un rendez-vous de revue. L'utilisateur peut arrêter son projet sans perdre les données qu'il choisit de conserver.

## 51.7. OBJ-01 — Perdre du poids

**But clinique :** améliorer durablement le comportement alimentaire, la santé et, si approprié, la composition corporelle **sans créer de restriction dangereuse ni de culpabilisation**.

**Matrice de départ** : `Objectif → Perdre du poids → Mes besoins → Effort → Temps → Alimentation / Mouvement / Sommeil / Accompagnement → Activités → Calendrier`.

**Questions minimales :** l'objectif est-il demandé librement ? Existe-t-il un avis médical pertinent, une variation de poids inexpliquée, un antécédent de trouble du comportement alimentaire, une grossesse, une maladie ou des traitements affectant l'alimentation ? Explorer plutôt habitudes de repas, environnement, faim/satiété, mobilité et disponibilité que saisir un poids cible automatique. Mesures de poids/tour de taille **facultatives**, sensibles et consenties. En cas de poids déjà insuffisant ou restriction excessive, **ne pas générer un parcours de perte de poids** ; proposer une évaluation professionnelle et des activités de santé non amaigrissantes.

**Briques proposées** (maximum 2–4 actives au début) : `BR-NUT-01` identifier une habitude modifiable ; `BR-NUT-02/03/05` composition/qualité des repas et végétaux ; `BR-NUT-08` courses/cuisine ; `BR-ACT-01/12` marche ou activité appréciée ; `BR-ACT-03` renforcement pour préserver la fonction ; `BR-SOM-01/02` sommeil si difficulté ; `BR-SUI-03` diététicien ou médecin si besoin. La brique hydratation n'est pas un substitut systématique au repas.

**Déclinaisons** : `Nutrition → Repas → Petit-déjeuner / Déjeuner / Dîner / Collation → Composer / Substituer / Préparer → Fréquence` ; `Activités → Marche → Durée / Terrain / Jour`. Si un suivi énergétique est réellement utile, ses données et calculs restent **optionnels**, limités et revus ; **pas de seuil calorique extrême, régime « détox », jeûne prolongé ou pesée compulsive imposés**. Aucune pilule « brûle-graisse » n'est suggérée.

**Parcours exemple selon le curseur** : niveau 1 = préparer **un repas habituel légèrement plus équilibré** une fois dans la semaine ; niveau 2 = organiser 2–3 repas et ajouter une petite marche confortable si acceptée ; niveau 3 = planifier cuisine et mouvements compatibles avec le budget ; niveaux 4–5 = augmenter la **régularité et le nombre de briques** sans automatiser une restriction calorique plus forte. Les événements restent modifiables dans l'agenda.

**Pendant l'action** : au créneau « Préparer le dîner », la brique Nutrition affiche le repas choisi et une validation simple ; au créneau Marche, l'outil physique suit durée/distance réelle si disponibles. `Fait` ne signifie pas « déficit calorique confirmé ».

**Résultats et revue** : satisfaction, habitudes acceptées, facilité à tenir, fonction et données corporelles consenties ; évaluation toutes les 2–4 semaines puis maintien. Alerter pour malaise, épuisement, alimentation insuffisante, obsession des chiffres ou perte de poids rapide non intentionnelle : arrêter la progression et orienter. **Repère de preuve : NICE NG246 [S04].**

## 51.8. OBJ-02 — Mieux dormir et retrouver de l'énergie (scénario **refait**)

**But clinique réel :** se sentir plus reposé et fonctionner mieux le jour, en traitant la cause probable lorsqu'une évaluation est nécessaire. **Le sport matinal, la natation, la méditation, la nutrition modifiée et les compléments ne sont pas un paquet universel « sommeil »** ; ils ne figurent que si une donnée ou une préférence le justifie.

**Matrice du scénario** : `Sommeil → Ce qui me gêne → [Endormissement / Réveils / Horaires / Fatigue diurne / Autre] → Effort → Temps → [Rythme / Rituel / Stimulants / Journal / Avis professionnel] → Régler → Accepter → Agenda → Moniteur`.

**Phase 1 : informations utiles (en une ou deux questions à la fois)** : âge ou tranche d'âge ; difficulté principale ; depuis combien de temps ; rythme de travail (horaires réguliers/postés) ; sieste ; quantité et horaire approximatif de caféine si pertinent ; douleur/stress/médicaments ou autres facteurs **si la personne accepte de les indiquer**. Demander explicitement s'il existe **ronflement important avec pauses respiratoires, suffocations nocturnes ou somnolence dangereuse au volant** ; une suspicion conduit à une orientation, **sans diagnostic d'apnée par l'IA**. Troubles persistants, aggravation notable, somnolence sévère ou usages de sédatifs justifient un contact professionnel.

**Phase 2 : observer sans fabriquer un problème** : proposer un **journal très léger sur 7–14 jours**, facultatif, contenant heure de coucher, heure de lever, réveils approximatifs, repos ressenti au matin et gêne dans la journée ; noter les horaires réels plutôt que forcer 7–9 h d'emblée. Montre/Withings/autre : enregistrer leur provenance mais **ne pas interpréter les estimations de sommeil profond/REM comme équivalentes à une polysomnographie**. L'absence de capteur n'empêche rien.

**Phase 3 : proposer les briques réellement pertinentes** :

| Situation relevée | Brique proposée dans la matrice | Activité configurée / limite |
| --- | --- | --- |
| Horaires changeants, réveils difficiles | `BR-SOM-02` régularité | Choisir une **heure de lever praticable** et des jours cibles ; ajuster progressivement si souhaité, tenir compte des équipes de nuit. |
| Très peu de lumière du jour, rythme irrégulier | `BR-SOM-03` exposition à la lumière | Programmer une **sortie ou période à la lumière extérieure** (exemple UX 5–15 min selon situation), sans conseiller l'observation directe du soleil ni affirmer que le bénéfice est garanti. |
| Stimulants tardifs pertinents | `BR-SOM-05` caféine et horaires | Déplacer progressivement la **dernière prise** à une heure choisie ; aucune suppression arbitraire de café ni calcul simpliste de durée d'action. |
| Hyperéveil avant le coucher | `BR-SOM-04` / `BR-MEN-02` | Rituel au calme/relaxation confortable (exemple 5–10 min), si la personne le trouve agréable ; ne pas exiger de méditation. |
| Difficulté installée/retentissement important | `BR-SOM-06` / `BR-SUI-03` | **Orientation vers une TCC-I** ou professionnel compétent ; agenda du rendez-vous, documents préparés, suivi, **sans protocole autonome de restriction de sommeil**. |
| Exercice souhaité ou sédentarité | `BR-ACT-01` ou sport choisi | Activité physique pour la santé générale, **pas comme condition obligatoire pour dormir**, horaire choisi avec la personne. |
| Aucun besoin nutritionnel identifié | **Pas de brique nutrition ni complément par défaut** | Une question ciblée peut être posée si repas tardifs, inconfort digestif ou autre donnée expliquent la pertinence. |

**Phase 4 : validation individuelle** : ne proposer initialement que deux ou trois briques. Exemple réalisable : `Rythme → Heures habituelles → Modifier à mon rythme → Valider` et `Rituel → Activité douce → Durée 10 min → 4 soirs → Valider`. Le curseur « temps » impose le plafond commun. Aucun ajout de mélatonine, antihistaminique, magnésium, complément « sommeil » ou séance à 9 h **sans indication appropriée**. La brique Compléments permet seulement d'**enregistrer une prise existante** et d'organiser un avis médical si besoin.

**Phase 5 : agenda et action** : horaire de lever/rituel selon préférence ; au rappel, ouvrir la brique et guider l'activité acceptée. Le système peut envoyer une notification sans imposer l'ouverture d'iOS en tâche de fond. Le journal demande au maximum un retour simple le lendemain ; `reporté` et `non renseigné` restent distincts.

**Phase 6 : vérifier et corriger** : après 7 nuits comparer surtout **repos ressenti, gêne diurne, régularité et adhésion** ; après 2–4 semaines questionner l'évolution, ajuster une seule variable à la fois si possible, éviter les conclusions causales hâtives. Une aggravation de somnolence, des éveils respiratoires ou une insomnie persistante appellent une évaluation. L'objectif de **7–9 h** est un repère adulte [S03] ; pour l'insomnie chronique la **TCC-I** possède une recommandation forte [S10]. **Ce scénario est la référence clinique actualisée** ; les chiffres et compositions de `Scenario_Sommeil.docx` sont des maquettes historiques, non le protocole par défaut.

## 51.9. OBJ-03 — Prendre de la masse musculaire

**Matrice** : `Masse musculaire → Expérience / Restrictions → Effort → Temps → [Force / Nutrition / Récupération / Suivi] → Force → Zone musculaire → Mouvement / Machine → Séries / Charge / Répétitions → Séance → Calendrier`.

**Départ** : pratique réelle et ancienneté, blessures, accès au matériel, préférences, horaires et contraintes alimentaires. Si perte de poids involontaire, fatigue inexpliquée, dénutrition, maladie rénale connue ou autre situation médicale, proposer un avis professionnel ; ne pas imposer une consommation protéique élevée.

**Briques essentielles à proposer, sans obligation** : `BR-ACT-03` résistance **progressive** ; `BR-NUT-04/06` apport alimentaire suffisant et protéines si adapté ; `BR-ACT-11/BR-SOM-02` récupération et sommeil ; `BR-SUI-06/09` journal de force et ressenti. **La brique Suppléments n'est pas essentielle** : whey/protéine uniquement pour compléter l'alimentation si utile ; créatine monohydrate comme **option** pour adultes appropriés après vérification des risques, sans effet « anti-âge » promis.

**Plan illustratif débutant sain, personnalisable** : deux séances non consécutives de **20–45 min/semaine chacune** selon le budget, couvrant à terme les grands groupes (poussée, tirage, membres inférieurs, tronc). Pour un mouvement, interface initiale **1–3 séries** et **6–15 répétitions** comme *exemples UX modifiables* ; charge choisie après apprentissage de la technique, jamais imposée en kg ni par 1RM. Le protocole 5×5 cité en section 50 est un **test fonctionnel**, pas une prescription par défaut. Utiliser effort perçu/RPE et récupération uniquement si la personne sait les interpréter. La progression dépend de la qualité des répétitions et de la tolérance, jamais du seul niveau du curseur d'engagement. À capacité différente : programme professionnel adapté ou activité de renforcement moins exigeante.

**Scénario séance** : `Sport → Musculation → Séance complète / Bras / Jambes → Triceps → Machine sélectionnée / Bande / Haltère → Charge (kg ou niveau de résistance) → Séries → Répétitions → Repos → Valider`. À l'heure du calendrier, le véritable outil de séance ouvre le **mouvement actuel** ; chaque série validée par appui passe à la suivante. L'utilisateur corrige une charge ou un nombre de répétitions réel, suspend la séance ou saute le mouvement. Après la dernière série, enregistrer la séance et les observations, pas des performances déduites.

**Suivi** : charges **effectives**, répétitions, nombre de séries achevées, volume facultatif, ressenti/technique, capacités quotidiennes et récupération ; évolution toutes les 4–8 semaines, jamais victoire uniquement sur la balance. Chez les personnes en bonne santé physiquement actives, 1,4–2,0 g/kg/j de protéines est une plage scientifique de référence à **discuter dans le contexte**, pas une dose délivrée automatiquement [S06]. Référentiel force ACSM 2026 [S05].

## 51.10. OBJ-04 — Gérer une douleur

**Matrice** : `Douleur → Type / Localisation / Évolution → Précautions → Effort → Temps → [Journal / Mouvement adapté / Relaxation / Professionnel] → Activité → Suivi`.

**Entrée** : localisation, apparition/évolution, retentissement fonctionnel, ce qui aggrave/soulage selon le ressenti, antécédents suivis par un médecin. Évaluer d'abord si la douleur est **nouvelle, intense, inhabituelle ou associée à des signes alarmants** (traumatisme majeur, déficit neurologique brutal, douleur thoracique, etc.) ; déclencher orientation urgente **sans diagnostic** au lieu d'afficher des étirements. Une douleur persistante ou inexpliquée nécessite une évaluation. Ne pas prendre une valeur de douleur `6/10` comme indication automatique à faire plus ou moins de sport.

**Briques envisagées** : `BR-SUI-02` journal de douleur, `BR-SUI-03` consultation/kiné selon situation, `BR-ACT-07` mouvement doux **si approprié**, `BR-ACT-01` marche adaptée, `BR-MEN-02` relaxation, `BR-SOM-01` observation du sommeil si impact, `BR-SUI-05` compte rendu thérapeutique. Pour douleur chronique primaire, les recommandations peuvent comprendre exercice supervisé et approches psychologiques [S09]. Aucun antalgique ni supplément n'est automatiquement conseillé.

**Programme** : un débutant peut seulement consigner son retentissement et préparer un rendez-vous ; une personne déjà suivie peut reprendre **la séquence prescrite** (ex. mouvements de kiné, amplitude autorisée, répétitions indiquées). Chaque exercice doit conserver `autorisé par`, `date`, `restrictions` et `arrêter si...` lorsque cela vient d'un professionnel.

**Exécution** : rappel du soin ou de l'exercice validé, séance ouverte avec positions et répétitions **approuvées** ; un appui passe à l'étape suivante et enregistre l'exécution. Toute aggravation inhabituelle entraîne proposition de suspendre et de contacter le professionnel. **Bilan : fonction vécue et activités réalisables**, pas seulement suppression complète de douleur. Ne pas interpréter une simple corrélation « sport → douleur » comme un diagnostic causal.

## 51.11. OBJ-05 — Repérer un trouble et orienter vers le bon professionnel

**Matrice** : `Comprendre ce qui m'arrive → Ce que j'observe → Depuis quand / Retentissement → [Urgence ? / Journal / Consultation / Résultats] → Planifier → Préparer → Suivre`.

**Départ** : recueil **facultatif et limité** des symptômes, début, évolution, facteurs contextuels, traitements déclarés et documents existants. En cas de détresse aiguë, douleur thoracique, difficulté respiratoire sévère, déficit neurologique soudain, confusion aiguë ou autre signe alarmant, **recommander les services d'urgence** plutôt que lancer un parcours d'auto-observation. La liste complète des urgences doit être validée par un professionnel ; les symptômes typés ne suffisent pas à établir un diagnostic.

**Briques** : `BR-SUI-01` observations structurées, `BR-SUI-05` résultats (PDF/image/texte/valeurs) et provenance, `BR-SUI-03` prise de rendez-vous, `BR-SUI-10` orientation/contextualisation, `BR-VIE-03` note privée si demandée, `BR-SUI-09` évolution. L'outil n'ordonne **aucun bilan sanguin ni examen d'imagerie** de sa propre initiative ; il peut préparer une liste de questions pour le médecin et stocker les examens recommandés par celui-ci.

**Programme exemple** : `Observation → Type / Intensité ressentie / Fréquence / Date → Enregistrer` (sans inventer de valeur normale) ; `Rendez-vous → Professionnel → Date/lieu confirmés par l'utilisateur → Rappel` ; `Résultat reçu → Importer le compte rendu original → Valider extraction facultative → Lier au rendez-vous`. L'utilisateur peut partager **une sélection** de données avec le professionnel après accord, pas tout le journal personnel.

**Bilan** : suivi des consultations et de la symptomatologie ; `avis médical reçu`, `examen demandé`, `examen planifié`, `résultat reçu` et `interprétation du médecin` sont **cinq états distincts**. L'IA n'attribue jamais une maladie à un indicateur isolé. La périodicité des bilans est décidée selon le risque et les recommandations, non « tous les mois » par défaut.

## 51.12. OBJ-06 — Préserver du temps pour soi

**Matrice** : `Temps pour soi → Sources d'encombrement → Effort → Budget de temps → [Repos / Activité plaisante / Limites / Organisation] → Créneau → Valider`.

**Départ** : demander à quels moments la personne souhaite être disponible ou indisponible ; ne pas supposer des problèmes psychologiques. Option pour repérer des engagements non déplaçables, aidance familiale, travail, contraintes de transport.

**Briques** : `BR-VIE-01` espace personnel ; `BR-VIE-02` loisir/création ; `BR-VIE-05` limites à poser ; `BR-VIE-06` simplifier une routine ; `BR-MEN-04` pause facultative ; `BR-VIE-04` relation choisie. Exemples UI : **5, 10, 15, 30 ou 60 min**, valeurs librement ajustables.

**Parcours** : effort 1 → un créneau de **5–10 min, une fois dans la semaine** ; effort 2 → quelques courtes pauses ; effort 3+ → créneaux structurés avec choix d'activités, sans surestimer du temps disponible. `Activité → Musique / Lecture / Promenade / Ne rien faire / Autre` ouvre la matrice native correspondante. `Ne rien faire` est une **activité valide**, pas une omission fautive.

**Agenda/exécution** : proposition de réservation douce et révocable, rappel facultatif ; si le temps est réaffecté, l'app demande si la personne préfère reporter, jamais considérer cela comme un échec. **Résultat** : satisfaction, temps réellement protégé, ressenti de contrôle, contraintes découvertes ; la synthèse reste privée, sans mesure clinique imposée.

## 51.13. OBJ-07 — Retrouver le calme intérieur

**Matrice** : `Calme intérieur → Ce qui me convient → Effort → Temps → [Respiration / Relaxation / Méditation / Marche apaisante / Musique] → Variante → Durée → Valider`.

**Départ** : demander **ce que la personne cherche** (réduire une tension passagère, prendre du recul, trouver un moment calme) et **si certaines pratiques sont désagréables**. La méditation focalisée sur le corps peut être mal vécue par certaines personnes (anxiété, trauma) ; toujours prévoir `arrêter`, `passer`, `choisir autre chose`. Le projet n'a pas à étiqueter une personne comme « anxieuse ».

**Briques** : `BR-MEN-01` respiration *naturelle et confortable* (sans apnée forcée, hyperventilation ou objectif de saturation), `BR-MEN-02` détente musculaire facultative, `BR-MEN-03` méditation guidée non obligatoire, `BR-VIE-02` musique ou création, `BR-ACT-01` promenade tranquille, `BR-MEN-04` micro-pause. Exemple de curseur propre à la brique : durée **2–20 minutes**, librement ajustable et sans allégation de dose-thérapie.

**Parcours** : effort 1 → **2–3 minutes** d'activité plaisante lorsqu'un moment se présente ; effort 2 → **5 minutes** plusieurs jours choisis ; effort 3+ → séances un peu plus longues si souhaitées, ou variété de briques, **sans imposer une progression de durée**. `Méditation → Guidée / Silencieuse / Attention à l'environnement → Durée → Démarrer`, l'outil utilise l'audio existant d'atome si réellement disponible.

**Exécution** : minuteur ou audio avec démarrage, pause, fin ; `terminé`, `interrompu`, `trop difficile`, `à refaire` ; aucun score de qualité de méditation prétendument mesuré. **Résultat** : calme perçu avant/après de **0 à 10 si volontaire**, utilité personnelle et choix de poursuivre. Si la souffrance est intense/persistante, proposer aussi `OBJ-12` et un professionnel, sans assimiler relaxation à un traitement.

## 51.14. OBJ-08 — Tenir un journal personnel

**Matrice** : `Journal → [Écrire / Dicter / Photo / Dessiner / Humeur / Bilan libre] → Fréquence souhaitée → Confidentialité → Commencer`.

**Départ** : demander si le journal vise mémoire, expression artistique, gratitude, réflexion ou événements de santé, et **quel contenu la personne accepte de partager avec le Moniteur**. **Par défaut : journal intégralement privé**, pas de lecture automatique par l'IA ni d'exploitation à des fins de performance. Une note intime ne devient pas une observation de santé par défaut.

**Briques** : `BR-VIE-03` note/son/image/dessin natif, `BR-MEN-05` humeur si choisie, `BR-VIE-02` création, `BR-SYS-07` archive/export, `BR-SYS-08` consentement sélectif. Réutiliser les véritables outils Texte, Audio, Photo, Dessin et leurs formats d'atome quand vérifiés, plutôt qu'une imitation de prise de notes.

**Programme** : effort 1 → page libre **1–2 fois par semaine** ; effort 2 → **2–5 min** par session choisie ; effort supérieur → pages thématiques et bilans rétrospectifs, sans « streak » culpabilisant. `Journal → Nouvelle note → Texte / Audio / Dessin → Enregistrer` ; possibilité de trier sans exiger une nomenclature.

**Exécution / résultat** : ouverture au premier plan de l'outil natif à l'heure choisie ou à la demande ; sauvegarde datée avec modification, suppression et export contrôlés. **Bilan** facultatif : fréquence, utilité ressentie, thématiques **uniquement si l'utilisateur demande une analyse et désigne les notes concernées**. Éviter de transformer automatiquement une mention négative en diagnostic.

## 51.15. OBJ-09 — Améliorer sa condition physique

**Matrice** : `Condition physique → Priorité [Endurance / Force / Souplesse / Équilibre / Fonction au quotidien] → Capacité actuelle → Effort → Temps → Sport → Discipline → Séance → Paramètres → Planifier`.

**Départ** : pratique habituelle, limitations, symptômes d'effort, environnement, équipement, aisance à nager/courir/etc., objectifs opérationnels (`marcher sans être essoufflé`, `remonter des escaliers`, `parcourir une distance choisie`). Ne pas imposer un test maximal au début. Des symptômes d'effort suspects conduisent à une évaluation avant exercice intense.

**Briques proposées** : `BR-ACT-01` marche, `BR-ACT-02/05/06` activité aérobie appréciée, `BR-ACT-03` renforcement, `BR-ACT-07/08` mobilité, `BR-ACT-09` équilibre si pertinent, `BR-ACT-11` repos, `BR-SUI-06` mesures consenties. Choisir **une ou deux familles** au départ, puis diversifier en tenant compte de la récupération.

**Parcours illustratif** : effort 1 / condition faible → mouvement confortable **5–10 min** les jours choisis ; effort 2 → durée légèrement plus longue ou activité fractionnée ; effort 3 → répartition dans la semaine avec renforcement adapté ; effort 4–5 → davantage de variété/fréquence **si capacités et temps le permettent**. Les **150–300 min/sem modérées + renforcement ≥2 fois/sem** constituent une orientation de santé publique à atteindre si possible dans la durée, **pas un minimum déclenchant un échec** [S01].

**Exécution** : `Course → Extérieur / Tapis → Temps / Distance / Vitesse ou allure` ; `Natation → Piscine → Longueur de bassin / Nage / Longueurs` ; `Rameur → Ergometer → Durée / Distance / Résistance / Cadence si connue`. Démarrer, pause, terminer, corriger ; source GPS/montre/machine/manual clairement affichée.

**Bilan** : progression d'une capacité utile (durée de marche ressentie comme confortable, régularité, temps réel, distance réellement mesurée, qualité du mouvement), fatigue et plaisir. Pas de VO₂max ou vitesse inventés à partir d'un temps saisi sans mesures valables.

## 51.16. OBJ-10 — Rajeunissement / vieillir en bonne santé

**Définition honnête :** l'objectif couvre **(a) préserver l'autonomie et les capacités** et **(b) prendre soin de l'apparence**, selon le souhait de l'utilisateur. Il **n'annonce pas une inversion du vieillissement humain**. L'âge biologique estimé par un test commercial, s'il est importé, est une **estimation dépendante de la méthode**, non un résultat de rajeunissement validé.

**Matrice** : `Rajeunissement → [Capacités / Peau et apparence / Prévention / Cognition / Liens sociaux] → Effort → Temps → Briques choisies → Activités / Rendez-vous → Suivi`.

**Départ** : choisir si la priorité est **forme, mobilité, aspect cutané, prévention ou autonomie** ; demander les habitudes et limites uniquement pour les briques choisies. En cas de demande d'acte esthétique médical, proposer un **rendez-vous dermatologique / médical**, non une procédure automatisée.

**Briques de première intention soutenues** :

- **Capacités** : `BR-ACT-03/02/09/11` force, endurance, équilibre et récupération individualisés ; `BR-AGE-02` fonction au quotidien. **Critère : conserver ou améliorer une fonction**, pas revenir fictivement à l'âge X.
- **Nutrition / sommeil** : `BR-NUT-03/04/05`, `BR-SOM-02` si un besoin réel existe ; repères du 51.5 sans diète « rajeunissante » unique.
- **Peau/apparence** : `BR-AGE-03 → Photoprotection → SPF 30+ large spectre / habitudes d'exposition → Rappel si souhaité`. Dermatologue si maladie de peau, tache évolutive, traitement demandé. Un traitement topique actif (ex. rétinoïde) n'est **pas programmé par l'IA** ; ses contre-indications nécessitent vérification.
- **Prévention / autonomie** : `BR-AGE-01/05/06` bilans de prévention et soins bucco-dentaires *selon âge, facteurs de risque, antécédents et professionnel*, dépistages recommandés, activité cognitive plaisante `BR-AGE-04`, liens sociaux `BR-VIE-04`.

**Briques explicitement non recommandées par défaut** : prétendus « anti-âge » garantis, **NMN/NAD boosters, resvératrol, fisétine, sénolytiques, peptides, hormone de croissance, rapamycine hors indication, protocole de « détox »**. Si l'utilisateur veut seulement **documenter** un produit déjà utilisé, `BR-SUI-08` conserve sa déclaration et sa source ; l'interface le marque `preuve clinique insuffisante / expérimental` quand c'est le cas et peut orienter vers un professionnel pour interactions/sécurité. L'application ne convertit pas ces intérêts en prescription ni en score de gain d'années.

**Exemple de programme** : effort 2 → une sortie/marche adaptée, deux sessions de force convenables **si déjà autorisées**, protection solaire choisie lors des expositions ; temps additionné et respecté. `Prévention → Rendez-vous selon indication → Agenda`, puis `Résultats → Import original → Historique`. Le suivi est sur plusieurs mois, avec mesures comparables et conséquences fonctionnelles/subjectives distinctes.

**Indicateurs possibles** : force/fonction, équilibre, activité et confort de peau rapporté, habitudes UV et rendez-vous, mais **pas de promesse de « peau rajeunie de 10 ans »**. Références OMS vieillissement en bonne santé [S14] et AAD photoprotection [S13].

## 51.17. OBJ-11 — Améliorer son bien-être

**Matrice** : `Bien-être → Ce qui manque [Repos / Plaisir / Social / Énergie / Mouvement / Temps libre] → Effort → Temps → Choix de 2–3 briques → Calendrier`.

**Départ** : question libre `Qu'est-ce qui rendrait vos journées meilleures ?` ; option `Bien-être ressenti aujourd'hui 0–10` clairement **subjective**, sans se substituer à une échelle clinique. Éviter de médicaliser automatiquement solitude, fatigue ordinaire ou baisse de motivation.

**Briques** : `BR-VIE-01` temps personnel, `BR-VIE-02` activité plaisante, `BR-VIE-04` lien social choisi, `BR-ACT-01/12` mouvement, `BR-SOM-02` rythme si besoin, `BR-MEN-04` pauses, `BR-NUT-03` cuisine plaisir/qualité, `BR-MEN-05` notes subjectives. L'utilisateur peut sélectionner **une activité sociale, créative, corporelle ou contemplative**, sans plan stéréotypé.

**Programme** : palier 1 = **une activité appréciée** et facile ; paliers 2–3 = une activité et un créneau de récupération ; paliers 4–5 = un programme varié mais compatible avec les autres projets. `Social → Appeler un ami / Partager un moment / Autre → Quand` : ne jamais contacter un tiers sans acte explicite. `Création → Musique / Vidéo / Graphisme → Outil natif`.

**Bilan** : utilité ressentie, satisfaction et désir de poursuivre ; le Moniteur peut rapprocher le bien-être et les autres objectifs avec accord, sans affirmer l'effet de chaque brique. Si tristesse, anxiété ou altération fonctionnelle persistantes, proposer un accompagnement adapté et `OBJ-12`, pas augmenter le nombre de loisirs comme traitement automatique. Les relations sociales font partie du bien-être global [S15].

## 51.18. OBJ-12 — Prendre soin de sa santé mentale

**Matrice** : `Santé mentale → Mon besoin [Stress / Humeur / Anxiété ressentie / Isolement / Difficulté persistante / Je cherche de l'aide] → Besoin urgent ? → Effort → Temps → [Soutien / Routine / Journal sélectif / Activité agréable / Professionnel] → Planifier`.

**Point de départ essentiel :** l'application pose seulement les questions indispensables pour distinguer **soutien de bien-être ordinaire** et **nécessité d'aide clinique**. Elle permet de dire `je préfère ne pas répondre`. Ne jamais inférer dépression, bipolarité, trouble anxieux ou risque suicidaire à partir d'un score de montre, d'une habitude ou d'un texte intime. Si elle propose un questionnaire de dépistage reconnu, le présenter comme **dépistage facultatif**, avec limites, interprétation professionnelle et consentement ; **un score ne décide pas seul d'une orientation ou d'un niveau de risque** [S16].

**Sécurité prioritaire** : détresse aiguë, danger immédiat ou intention de se faire du mal → **afficher des possibilités de contact humain/urgence adaptées à la localisation**, accessibles et discrètes, sans demander d'attendre le prochain rappel. En France : **15 / 112** en cas de danger immédiat ; le **3114** est une ressource de prévention du suicide à vérifier au moment de l'implémentation. Le système n'essaie ni de gérer une crise grave par méditation, ni de prédire les comportements individuels.

**Briques au choix** : `BR-MEN-07` rendez-vous avec médecin/psychologue/structure d'aide ; `BR-MEN-06` micro-actions/plaisirs/activation comportementale si appropriées ; `BR-VIE-04` soutien d'un proche **sur initiative explicite** ; `BR-SOM-01` sommeil si lien vécu ; `BR-ACT-01` mouvement accessible si souhaité ; `BR-MEN-02/03` détente facultative ; `BR-MEN-05` notes d'humeur **volontaires** ; `BR-MEN-08` plan de sécurité dans le cadre adapté. **Aucune modification de traitement, arrêt de psychotrope ou supplément psychotrope par l'IA**.

**Programme** : effort 1 = prendre rendez-vous ou choisir **une seule action de soutien très accessible** ; effort 2 = contact/soutien + routine légère ; effort 3–5 = activités supplémentaires **sur demande**, sans remplacer un traitement nécessaire par « davantage d'effort ». L'IA ne dit jamais qu'une personne va mieux parce qu'elle a validé des cases. Les rendez-vous, tâches prescrites par le praticien et observations déclarées sont datés séparément.

**Exécution** : lien vers contact/rendez-vous, activité choisie, bouton `arrêter/passer`, accès rapide à l'aide. **Résultats** : ressenti volontaire, retentissement au quotidien, accès aux soins, préférence pour ajuster, avec confidentialité renforcée (pas de notification révélant un diagnostic ni analyse automatique d'un journal privé). Évaluation et traitements relèvent des professionnels ; NICE NG222 et OMS [S11, S12].

## 51.19. Correspondance : objectif → briques communes et briques facultatives

Cette vue permet de construire les programmes par référence aux **mêmes composants**, non en recopiant des scénarios complets ; `C` signifie « proposition prioritaire selon contexte » et `O` signifie « option à activer selon le besoin », **jamais obligation**.

| Objectif | Briques candidates en priorité (C) | Options selon besoins (O) | Suivi central |
| --- | --- | --- | --- |
| OBJ-01 Poids | NUT-01/02/03/05, ACT-01 | ACT-03, SOM-02, NUT-08, SUI-03 | Habitudes, adhésion, éventuelles mesures consenties. |
| OBJ-02 Sommeil | SOM-01/02/04 ou SOM-05 selon cause | SOM-03, MEN-02, SOM-06, ACT-01 | Sommeil déclaré, fonctionnement diurne, tolérance. |
| OBJ-03 Masse | ACT-03, NUT-04/06, ACT-11 | SUI-08, SOM-02, SUI-03 | Séances, séries/charges réellement effectuées, récupération. |
| OBJ-04 Douleur | SUI-02/03, observation | ACT-07, MEN-02, SOM-01 | Retentissement et fonction. |
| OBJ-05 Repérer trouble | SUI-01/03/05/10 | SUI-06/07/09 | Évolution datée, avis/résultats documentés. |
| OBJ-06 Temps personnel | VIE-01/05 | VIE-02/04, MEN-04 | Temps réellement préservé, satisfaction. |
| OBJ-07 Calme | MEN-01/02/03 **au choix** | VIE-02, ACT-01 | Tolérance et calme perçu volontaire. |
| OBJ-08 Journal | VIE-03, SYS-07/08 | MEN-05, VIE-02 | Notes privées, fréquence facultative. |
| OBJ-09 Condition | ACT-01/02, ACT-03 selon capacité | ACT-04/05/06/07/09 | Durée/distance/force réellement mesurées. |
| OBJ-10 Vieillir en santé | AGE-01/02/03, ACT-03 ou ACT-09 selon cible | NUT-03/04, SOM-02, AGE-04/05/06 | Fonction, prévention, habitudes choisies. |
| OBJ-11 Bien-être | VIE-01/02/04 **selon souhait** | ACT-01, MEN-04, SOM-02 | Satisfaction et plaisir vécus. |
| OBJ-12 Santé mentale | MEN-07 si besoin, MEN-06 selon contexte | VIE-04, SOM-01, ACT-01, MEN-02/05 | Accès au soutien, ressenti et retentissement ; sécurité prioritaire. |

Les préfixes `BR-` sont omis dans ce tableau pour le rendre lisible (`ACT-03` signifie `BR-ACT-03`). Le Moniteur applique les contraintes de confidentialité **par résultat**. Si plusieurs objectifs sélectionnent la même séance ou consultation, il propose **une occurrence unique avec plusieurs liens d'objectifs**.

## 51.20. Sport : taxonomie extensive, matrices et catalogue évolutif

**Objectif d'implémentation :** « Sport » est une **bibliothèque de vraies activités interactives** partagée entre tous les projets, non neuf outils différents. Décliner les sports courants en **familles → disciplines → sous-disciplines → exercices/positions/machines → paramètres → exécution → mesures**. Le catalogue initial est détaillé ci-dessous, mais **l'extension est illimitée** : de nouveaux sports, mouvements et machines doivent pouvoir être ajoutés **sans modifier le moteur ni le dessin des matrices**. Aucune liste ne peut prétendre couvrir a priori « tous les sports du monde ».

### 51.20.1. La matrice racine « Sport »

`Activités / Objectif → Sport → [Marche, Course, Musculation, Natation, Rameur, Vélo, Fitness, Mobilité, Sports collectifs, Raquettes, Plein air, Danse, Combat, Autre]`. Chaque carré ouvre sa **propre matrice d'options**, non un formulaire générique commun à toutes les disciplines. Catégories, images et paramètres restent rattachés à l'objet réel.

| Famille sportive | Navigation matricielle proposée | Paramètres principaux et événements enregistrés |
| --- | --- | --- |
| **Marche** | Intérieur / Extérieur / Tapis / Marche rapide / Nordic walking | Minutes, distance et vitesse/allure si mesurées, inclinaison si tapis, terrain, pauses ; passage étape suivante si parcours fractionné. |
| **Course** | Extérieur / Piste / Tapis / Trail → Libre / Distance / Temps / Intervalles | Durée, distance, allure min/km, vitesse km/h, segments, récupération, dénivelé réel si disponible, GPS consenti. |
| **Rameur** | Salle / Maison / Eau → Ergometer / Bateau → Libre / Intervalles | Durée, distance (m), cadence coups/min, résistance ou niveau propre à l'appareil, puissance (W) uniquement si émise, intervalles, pauses. |
| **Vélo** | Route / VTT / Urbain / Vélo d'intérieur / Spinning | Durée, distance, vitesse, cadence, zones de résistance, puissance seulement si appareil compatible, segments et récupérations. |
| **Natation** | Piscine / Eau libre → Crawl / Brasse / Dos / Papillon / Éducatifs / Aquagym | Bassin (m), longueurs, distance, durée, nage, série, pauses, temps d'intervalle ; montre étanche si compatible et autorisée, sinon validation manuelle. |
| **Musculation** | Corps entier / Haut / Bas / Bras / Dos / Pectoraux / Jambes / Épaules → Groupe → Mouvement → Matériel | Machine, poids libre, élastique, poids du corps ; charge, assistance/résistance, côté, séries/répétitions, repos et progression. |
| **Cardio indoor** | Elliptique / Stepper / Tapis / Escaliers / Corde à sauter / Ski-erg | Durée, intervalles, cadence, résistance, vitesse/inclinaison selon matériel ; pas de distance fictive si impossible à mesurer. |
| **Fitness et circuits** | Renforcement léger / Circuit / Cardio-danse / Intervalles / HIIT (avancé) | Exercices ordonnés, durée exercice et repos, tours, répétitions, niveau d'effort ; **HIIT jamais suggéré par défaut à un novice**. |
| **Mobilité et souplesse** | Zone du corps → Mouvement / Étirement → Variante / Position | Amplitude non chiffrée si non mesurable, durée tenue, séries/côté, respiration confortable et inconfort déclaré ; pas d'étirement imposé en cas de douleur aiguë. |
| **Yoga / Pilates / Gym douce** | Discipline → Niveau → Posture / Séquence → Variante | Nom de posture, tenue (secondes), transitions, répétitions, latéralité, adaptations, suivi séquence ; positions choisies selon capacité. |
| **Équilibre / autonomie** | Debout / Assis / Avec appui → Mouvement de stabilité | Durée, répétitions, supports, sécurité anti-chute, besoin d'encadrement, confort ; personnes à risque de chute → exercices encadrés si indiqué. |
| **Plein air** | Randonnée / Trail / Escalade / Ski / Raquettes neige / Patinage / Roller / Kayak / Paddle | Durée, dénivelé, distance, difficulté déclarée, conditions météo/accessibilité, équipements de sécurité, GPS facultatif ; besoins spécifiques par discipline. |
| **Sports de raquette** | Tennis / Padel / Badminton / Squash / Tennis de table | Match / Entraînement / Technique, durée, sets/points si pertinents, partenaire, nombre d'échanges facultatif. |
| **Sports collectifs** | Football / Basket / Volley / Handball / Rugby / Hockey, etc. | Entraînement / Match, poste/participation, temps de jeu, phases, score facultatif, efforts mesurés si outils réels. |
| **Danse** | Libre / Classique / Contemporaine / Salsa / Hip-hop / Autre | Durée, chorégraphie / séquence, pas ou mouvements, répétitions et ressenti ; musique native réutilisée si disponible. |
| **Arts martiaux / combat** | Boxe / Judo / Karaté / Taekwondo / Aïkido / Autre | Travail technique, sac, kata/formes, partenaire/sparring, rounds, repos, équipement et précautions ; pas de sparring automatique sans encadrement. |
| **Autres** | Catégorie créée par l'utilisateur / importée d'un catalogue validé | Paramètres choisis par type, fiche d'exécution manuelle minimale, unités et représentation déclarées, icône provisoire avec libellé. |

**Distinguer** : activité sportive de loisir (durée/résultat), exercice technique (répétitions/positions), séance composée (liste d'exercices ordonnés), épisode dans un sport (match/longueur/intervalle) et prescription de rééducation portée par un professionnel. Une séance peut contenir plusieurs briques spécialisées ; chaque sous-activité renvoie un état au même historique.

### 51.20.2. Catalogue Musculation : groupes, mouvements, positions et variantes

Les exercices suivants sont des **entrées de bibliothèque à construire**, pas des programmes recommandés à tous. Les libellés courts seront associés à des **pictogrammes distinctifs** et leurs variantes ne dupliqueront pas la logique. Chaque mouvement accepte, selon sa nature : *machine / haltères / barre / câble / élastique / poids du corps*, *assis / debout / allongé / à genoux*, *bilatéral / unilatéral*, *charge ou résistance et unité*, *nombre de séries*, *répétitions par série*, *repos*, *amplitude/consigne validée*, *charge réellement effectuée*.

| Groupe principal | Exemples de mouvements à indexer (adaptations selon niveau / matériel) | Matrices spécialisées |
| --- | --- | --- |
| **Biceps / avant-bras** | Curl barre, curl haltères, curl marteau, curl pupitre, curl câble, curl concentré, flexion/extension poignet, préhension | Bras → Biceps / Avant-bras → Mouvement → Machine/outil → Charge / Séries / Répétitions / Côté. |
| **Triceps** | Extension à la poulie haute, extension corde, extension au-dessus de la tête, extension haltère, barre front, extension triceps machine, pompes prise rapprochée, dips **avec adaptations** | Bras → Triceps → Extension / Poussée → Machine / câble / poids du corps → Paramètres. |
| **Pectoraux** | Développé couché ou guidé, développé incliné, chest press assise, pompes adaptées, écartés aux câbles ou machines | Haut du corps → Pectoraux → Poussée / Écarté → Variante → Série. |
| **Dos** | Tirage vertical, tirage horizontal, rowing unilatéral, rowing machine, tractions **assistées**, pullover, extension dorsale **appropriée** | Haut du corps → Dos → Tirage vertical / horizontal / autre → Matériel → Paramètres. |
| **Épaules** | Développé épaules guidé ou haltères, élévation latérale, oiseau/écarté arrière, face-pull, rotation externe **légère adaptée** | Épaules → Deltoïdes / Coiffe → Mouvement → Position / Matériel → Paramètres. |
| **Quadriceps** | Presse à cuisses, squat adapté, squat guidé, extension de genou machine, fente, split squat, montée sur marche | Bas du corps → Cuisses avant → Poussée / Extension → Position → Charge / Répétitions. |
| **Ischio-jambiers** | Leg curl assis/couché, charnière de hanche, soulevé de terre roumain **si compétence appropriée** | Jambes → Ischio-jambiers → Flexion / Charnière → Matériel → Paramètres. |
| **Fessiers / hanches** | Hip thrust, pont fessier, abduction machine/élastique, extension de hanche, fente adaptée, extension sur banc **appropriée** | Bas du corps → Fessiers / Hanche → Mouvement / Machine → Paramètres. |
| **Adducteurs / mollets** | Adduction machine/élastique, élévations mollets debout ou assis, machine mollets | Jambes → Adducteurs / Mollets → Mouvement → Charge / Répétitions. |
| **Tronc / gainage** | Planche adaptée, gainage latéral, bird dog, dead bug, Pallof press, flexion du tronc **si adaptée** | Tronc → Stabilisation / Rotation contrôlée → Position → Durée / Répétitions / Côté. |
| **Composés / corps entier** | Squat, soulevé de terre, développé, tirage, farmer carry, circuit polyarticulaire ; variantes techniques sous encadrement | Séance complète → Mouvement → Prérequis technique → Matériel → Paramètres. |

**Modèle de séance réutilisable :** `Séance bras` peut assembler **Curl biceps → Extension triceps → Curl marteau → Tirage adapté** ; ordre, charge, nombre de séries et repos sont configurables **par exercice**, non globalement imposés. `Série 1/3` et `Exercice 2/4` sont des états réels de l'outil de séance. Certains mouvements ont des répétitions ; d'autres, des secondes de maintien ou une distance (ex. portés). Il est interdit de forcer « poids × répétitions » sur une posture de gainage.

**Exemple de série précise demandé** : `Sport → Musculation → Bras → Triceps → Extension poulie → Machine : Triceps #1 → Charge prévue 10 kg → 5 séries → 5 répétitions → Repos choisi → Séance récurrente durant un mois → Valider`. Après démarrage : `Exercice Triceps · 1/5 · 10 kg · 5 rép prévues` → appui `Série réalisée` → `2/5`, etc. Une correction sur la série 3 (`8 kg, 4 répétitions`) enregistre **prévu 10 kg × 5 / réalisé 8 kg × 4**, sans réécrire les autres séries. Ces chiffres **testent le moteur**, pas la pertinence de ce volume pour une personne réelle.

**Progression :** proposer une augmentation de charge ou de volume **seulement après retour du pratiquant** sur la technique, la tolérance et plusieurs séances, avec validation explicite ; pas de pourcentage automatique applicable à tous. Une hausse de douleur inhabituelle, un vertige, une gêne thoracique ou une dégradation de capacité entraîne arrêt/orientation selon la situation. Les méthodes d'intensité avancées et l'échec musculaire ne sont ni nécessaires ni prioritaires pour un utilisateur débutant [S05].

### 51.20.3. Les machines particulières ajoutées par l'utilisateur

Une **machine est une fiche d'équipement**, pas un nouveau type de projet : l'utilisateur peut la créer dans `Sport → Musculation → Matériel → Ajouter machine` à partir des vrais outils de création disponibles, en mode expert si nécessaire. Les informations non connues restent facultatives.

**Schéma conceptuel de fiche** (à adapter aux véritables objets et API d'atome ; pas de contrat d'API affirmé) :

```yaml
id: equipement-utilisateur-001
nom: "Machine triceps de ma salle"
type: machine_guidée
mouvements_associes: [extension_triceps_poulie]
localisation: "Salle A"     # facultatif
photo_ou_picto: "reference_média_autorisée"  # pas une icône décorative isolée
position: assise
resistance:
  type: charge_affichee
  unite: kg
  increments_disponibles: [2.5, 5]  # exemple; à confirmer sur l'appareil
reglage_machine:
  siege: "valeur_declaree"
  position_poignee: "valeur_declaree"
source: utilisateur
partage: prive
```

Ne pas confondre la **charge indiquée par la machine** avec une force biomécanique comparable à celle d'une autre machine (poulies/leviers). Pour les équipements à assistance (tractions assistées), la valeur peut représenter **une assistance** plutôt qu'une résistance croissante. L'utilisateur règle la machine **dans le carré étendu** ; les paramètres de l'exercice restent associés à la même brique native. Possibilité d'éditer/archiver un appareil sans supprimer les séances historiques qui l'utilisaient ; les identifiants de machine et de mouvement restent indépendants. Les machines fournissant des données électroniques ne les transmettent qu'après **connecteur identifié, compatible et autorisé**.

**Pictogrammes à produire et à intégrer** : créer/associer pour chaque discipline et mouvement courant une icône réellement reconnaissable (silhouette et direction du geste ou équipement pertinent), cohérente avec la DA des carrés d'atome, version claire/sombre et contraste accessible, tailles cohérentes avec le gabarit, texte alternatif. **Privilégier les SVG existants** ; produire uniquement les références manquantes, valider les droits, les variantes et la compréhension. Une machine personnelle peut réutiliser le pictogramme du mouvement et une photo autorisée ; **ne pas inventer un pictogramme spécifique à toutes les marques**. Aucun visuel n'est considéré déjà généré à ce stade.

### 51.20.4. Paramètres par activité et erreurs à éviter

| Type de paramètre | Exemples et unité | Quand le montrer / ne pas le montrer |
| --- | --- | --- |
| **Séries / répétitions** | 1, 2, 3… séries ; 1… répétitions, entier | Musculation, circuits, certains exercices de mobilité ; **pas** pour une course libre. |
| **Charge / assistance** | kg, lb, résistance `niveau`, élastique caractérisé | Exercice avec charge ou machine ; préserver les valeurs natives, ne pas assimiler les « niveaux » de machines différentes. |
| **Durée / repos** | s/min/h ; récupération entre séries/intervalles | Presque toutes les disciplines, selon type. |
| **Longueur du bassin** | 25 m, 50 m ou valeur réellement choisie | Natation **en piscine seulement** ; ne pas l'inventer pour eau libre. |
| **Longueurs / tours** | entier ; distance = longueurs × longueur si données fiables | Natation bassin, piste ou circuit défini ; enregistrer modifications de longueur de bassin. |
| **Distance** | m, km, autre unité convertible | Course, marche, vélo, rameur et natation avec capteur ou saisie ; ne pas afficher de mesure comme instrumentée si seulement estimée. |
| **Vitesse / allure** | km/h ; min/km ; éventuellement m/500m sur rameur | Course/marche/rameur/vélo quand temps **et** distance sont compatibles ; distinguer objectif, saisie appareil et calcul dérivé. |
| **Cadence / puissance** | foulées/min, coups/min, tr/min, W | Seulement si appareil/capteur mesure ou si l'utilisateur peut renseigner correctement. |
| **Position / latéralité** | debout, assis, dos, ventre, genou, côté gauche/droit | Mobilité, yoga, rééducation, exercices unilatéraux et machines. |
| **Intensité perçue** | RPE 0–10, option | Sport uniquement ; ne jamais l'utiliser comme mesure objective ou autorisation d'effort extrême. |
| **Environnement / sécurité** | piscine, extérieur, tapis, risque de chute, supervision | Lorsque la pratique le requiert ; conditions météo et lieu ne sont pas des justificatifs médicaux universels. |

**Calculs de suivi autorisés si les données existent** : `distance en piscine = longueurs × bassin (m)`, `vitesse moyenne (km/h) = distance (km) / durée (h)`, `allure (min/km) = durée (min) / distance (km)`, `volume externe indicatif = somme [charge affichée × répétitions réalisées]` **uniquement à charge comparable et exercice identifié**. Prévoir cas zéro, unité inconnue, temps de pause non inclus, reprise de séance, changement d'appareil, erreurs de GPS et déclarations corrigées. Afficher la provenance et éviter de transformer une estimation en mesure physiologique.

### 51.20.5. Exécution interactive commune aux sports

- L'**occurrence acceptée dans l'agenda** lance l'outil d'activité selon les permissions et restrictions de la plateforme ; une notification iOS **ne peut pas ouvrir arbitrairement l'application en premier plan sans intervention** de l'utilisateur.
- L'outil affiche **l'étape réelle** : `Exercice 2/4 – Série 3/5`, `Longueur 7/20`, `Intervalle 2/6`, `Posture 3/8`, `Segment de course 4/5`, ou `Fin de séance`, selon sa discipline.
- **Toucher / clic sur la surface de validation de l'outil** : passe à l'étape suivante et note `terminé par l'utilisateur`, avec heure ; un geste de correction ou bouton natif permet **annuler la dernière validation, modifier répétitions/charge/distance/temps ou reporter**. Supporter lecteurs d'écran/commande vocale accessibles quand disponibles ; ne pas exiger de viser un petit point précis.
- Interactions `Démarrer`, `Pause`, `Reprendre`, `Passer`, `Corriger`, `Terminer` doivent être liées à des actions **réelles et testées**, pas des pictogrammes inertes. L'utilisateur garde le contrôle des déclenchements audio, capteurs et notifications.
- Capteurs : chaque échantillon indique source, précision si disponible, horodatage et permission ; si capteur absent, basculer vers **saisie manuelle**, pas des chiffres fictifs. Considérer les intégrations système (HealthKit, autres si la plateforme les fournit) **uniquement après vérification des capacités et autorisations**.
- Plusieurs sports dans une séance (`échauffement rameur → renforcement → marche`) sont **une seule session composée** avec trois segments horodatés, indépendamment des objectifs reliés.
- Repos et récupération sont de **vraies étapes configurables** : sans repos forcé par l'application, ni comptage comme exercice accompli.

## 51.21. Nutrition : une matrice d'alimentation adaptée au but, sans « régime magique »

**Navigation** : `Activités / Objectif → Nutrition → [Mes habitudes / Composer un repas / Courses / Protéines / Fibres / Hydratation / Contraintes / Suppléments si utiles] → Sous-brique → Paramètres → Valider`. **Nutrition** et **Compléments alimentaires** sont deux catégories reliées mais **différentes** : on ne suggère pas une pilule lorsqu'un aliment ou un changement de pratique suffit.

### 51.21.1. Structure détaillée d'un repas

`Nutrition → Repas → [Petit-déjeuner / Déjeuner / Dîner / Collation / Avant effort / Après effort / Autre] → [Plat / Protéine / Végétaux / Accompagnement / Boisson / Contraintes] → Choix → Portions facultatives → Temps de préparation → Jours → Agenda`.

- Le carré **repas** peut représenter une activité de cuisine, un **rappel de repas choisi** ou une observation déclarée. Il ne présume ni trois repas obligatoires ni horaires universels.
- Les sous-briques `Céréales/féculents`, `Légumes`, `Fruits`, `Légumineuses`, `Produits protéiques`, `Produits laitiers ou alternatives`, `Matières grasses`, `Boissons` sont des **éléments alimentaires reconfigurables**, pas des injonctions de manger un produit déterminé. Allergies, culture, convictions, budget, textures et tolérance sont pris en compte.
- Réglages à exposer **seulement si l'utilisateur les veut** : portions ou unité, grammes estimés, fréquence, durée de préparation, liste d'achats, origine de recette et éventuelles valeurs nutritionnelles **sourcées**. Un nombre d'énergie/protéines estimé depuis une photo n'est pas traité comme un dosage clinique mesuré.
- `BR-NUT-03/05` peut proposer, si pertinent, l'augmentation graduelle de la variété végétale et des fibres avec les **repères OMS ≥400 g de fruits/légumes et ≥25 g de fibres/jour** pour la population concernée [S02], **sans imposer ce palier** à une personne ayant une contre-indication digestive ou un régime prescrit.
- `BR-NUT-07` demande si un besoin spécifique existe (forte chaleur, exercice prolongé, restriction médicale hydrique, etc.) ; **ne pas imposer « boire X litres » à tout le monde**. Pour certaines maladies, fluides et électrolytes relèvent d'un conseil médical.

### 51.21.2. Adaptation nutritionnelle selon l'objectif

| Objectif pertinent | Focus nutritionnel scientifiquement justifiable | Briques à ne pas imposer |
| --- | --- | --- |
| **OBJ-01 Poids** | Habitudes soutenables, équilibre alimentaire, portions et contexte ; déficit énergétique **individualisé uniquement si indiqué**, soutien diététique si besoin [S04]. | Jeûne intermittent, apport calorique universel, restriction drastique, « brûle-graisse ». |
| **OBJ-03 Masse musculaire** | Énergie suffisante, protéines alimentaires ; référence scientifique 1,4–2,0 g/kg/j chez adulte sain actif **si pertinent et validé** [S06]. | Whey si apport alimentaire suffisant, hyperprotéine en cas de contre-indication, suppléments anabolisants. |
| **OBJ-02 Sommeil** | Si inconfort ou stimulant pertinent : horaires et nature des consommations, caféine, gêne digestive nocturne. | Régime du sommeil, coupure arbitraire de glucides, suppléments soporifiques. |
| **OBJ-09 Condition** | Repas variés et appropriés à l'activité ; récupération énergétique proportionnée si pratique sportive. | Régimes d'endurance extrêmes, compléments « booster » systématiques. |
| **OBJ-10 Vieillir en santé** | Qualité, variété, éventuels besoins liés à l'âge ou déficits identifiés, maintien des capacités. | « Nutrition anti-âge » garantissant un rajeunissement, hormones, produits expérimentaux. |
| **OBJ-04 Douleur / OBJ-05 Trouble** | Seulement les adaptations nutritionnelles **réellement indiquées** par la situation et un professionnel. | « Régime anti-inflammatoire universel », bilan nutritionnel sans motif. |
| **OBJ-11 Bien-être / OBJ-12 Santé mentale** | Alimentation équilibrée soutenable si la personne le souhaite ; prise en compte des difficultés alimentaires et des soins. | Promesse de traiter une dépression par un régime ou complément seul. |

**Exemple de composition** : `Prise de muscle → Nutrition → Protéines → Sources alimentaires / Préparation de repas → Nombre de jours → Valider`. Si l'apport estimé paraît insuffisant, la personne peut demander des alternatives culinaires ou **examiner une protéine en poudre** ; le programme distingue clairement `repère général`, `consommation déclarée`, `recommandation du diététicien`, `supplément choisi`. L'application n'invente ni son poids, ni ses besoins, ni son bilan biologique.

**Exécution** : au rappel « préparer le repas », ouvrir la fiche réelle de la recette/liste ; au retour « je l'ai préparé » ou « remplacé par… », consigner uniquement la déclaration, sans inventer une ingestion. Les personnes avec trouble alimentaire connu ou suspecté doivent recevoir un parcours adapté, supervisé ; éviter la gamification des calories ou du poids.

## 51.22. Compléments alimentaires : catalogue facultatif, saisie libre et suivi sûr

**Parcours matriciel :** `Activités → Compléments alimentaires → [Ajouter / Déjà utilisé / Consulter / Planifier / Historique] → Famille → Produit réel → Dose déclarée → Heure/jour/fréquence → Vérifier / Valider → Agenda`.

**Distinguer toujours quatre états** : `(a) produit présent dans le catalogue`, `(b) produit envisagé`, `(c) produit réellement utilisé selon déclaration`, `(d) produit recommandé/prescrit par professionnel documenté`. Un nom de produit dans une matrice **n'est pas une recommandation** et n'entraîne jamais de prise.

| Famille/fonction possible | Comportement du moteur | Condition médicale ou état des preuves à montrer |
| --- | --- | --- |
| **Protéines en poudre (whey, végétales)** | Saisir portion et contenu **selon étiquette** ; proposer uniquement si un besoin nutritionnel est identifié et non couvert commodément par l'alimentation. | Aliment/supplément pratique, **pas indispensable** ; tenir compte d'allergies/intolérances et pathologies. |
| **Créatine monohydrate** | Fiche pédagogique consultable, suivi d'une prise choisie ; plage **3–5 g/j dans des études adultes** uniquement en information sourcée [S07]. | Option possible pour certains efforts de force ; vérifier médicaments, problèmes rénaux, grossesse et autres risques via un professionnel si pertinent. **Pas d'effet de rajeunissement humain démontré.** |
| **Vitamine B12** | Proposer l'examen de l'adéquation alimentaire dans certains régimes végétaliens ou situations cliniques, avec orientation. | Prévenir/corriger un déficit ; quantités choisies selon contexte et conseils professionnels, pas un dosage unique [S08]. |
| **Vitamine D** | Fiche d'information et éventuel suivi d'un traitement/complément existant. | Pas de dépistage biologique universel chez adulte sain, ni de supplémentation forte non justifiée [S08]. |
| **Fer** | Enregistrer ordonnance/prise si besoin ; préparer un rendez-vous pour suspicion de carence. | **Ne pas recommander de fer sans indication** : risque de surcharge et d'interactions [S08]. |
| **Oméga-3** | Examiner en priorité les habitudes alimentaires et objectifs ; enregistrer une prise choisie. | Preuves dépendant de l'indication, du produit et de la dose ; pas de promesse cardiovasculaire ou anti-âge universelle. |
| **Fibres / psyllium** | Saisie manuelle possible avec heure et quantité. | Tolérance digestive, interactions médicamenteuses et eau adaptée à discuter ; ne pas présumer un besoin. |
| **Magnésium, zinc, cuivre, folates, autres micronutriments** | Saisie depuis étiquette, contrôle des **doublons de produits** et rappels. | Déficits/indications propres, plafonds et interactions ; excès possibles, ne jamais recommander un empilement systématique. |
| **Mélatonine / produits du sommeil** | Enregistrer uniquement utilisation/avis déjà établi, et noter risques/interactions. | **Pas de protocole automatique de traitement de l'insomnie** ; orientation TCC-I en cas d'insomnie chronique [S10]. |
| **Collagène, probiotiques, plantes, antioxydants** | Inventaire et observation facultatifs, sans attribution automatique d'efficacité. | Preuves dépendant de la formulation et de l'indication, risques d'interactions/contaminants. |
| **NMN, resvératrol, fisétine, sénolytiques et autres « longévité »** | Catégorie `expérimental / efficacité clinique de rajeunissement non établie`, consignation d'un usage déclaré seulement. | **Ne pas générer de cure ni de dose « anti-âge »**, renvoyer vers un professionnel et des sources rigoureuses. |

**Fiche de produit** : `produit_id`, fabricant, composition **par portion**, forme, unité et concentration, lot/dates facultatifs, source et date d'information, contre-indications signalées, médicaments/suppléments déclarés potentiellement interactifs, **dose inscrite sur l'emballage ou prescrite** (jamais une dose devinée), horaires, fréquence, plage de dates, rappel, prise *confirmée manuellement* et éventuel ressenti. Une saisie libre doit fonctionner pour un produit absent du catalogue ; les champs incertains restent inconnus. Si la personne change de marque/concentration, **créer une nouvelle version de la fiche** et ne pas recopier silencieusement une ancienne quantité.

**Sécurité d'orchestration** : proposer un **contrôle des doublons d'ingrédient actif** entre produits, un signal d'interaction potentielle et une **vérification humaine** — cela ne prouve jamais l'absence d'interactions. **Pas d'achat, d'arrêt de médicament, de dosage personnalisé, de cure de charge, de changement de traitement ni de bilan biologique obligatoire** déclenchés par l'IA. Toutes ces décisions relèvent de la personne et des professionnels appropriés. Le NIH ODS rappelle que « naturel » ne veut pas dire sans danger, en particulier avec les associations et médicaments [S08].

**Agenda et résultats** : une occurrence de prise proposée avec horaire et récurrence ; l'app enregistre `rappel envoyé` puis uniquement si signalé `prise déclarée`, jamais une absorption présumée. Bilan médical si indiqué → rendez-vous distinct ; document reçu → `BR-SUI-05 Résultats`. Pour le Moniteur, une évolution survenue pendant une cure est **associée dans le temps**, sans déduction automatique de causalité.

## 51.23. Examens, prévention, compte-rendus et résultats : prolongement universel

- **Brique `BR-SUI-04`** : `Prévention / Examen demandé par médecin / Consultation / Contrôle personnalisé → Choisir créneau → Confirmer → Agenda`. En France, le dispositif **« Mon bilan prévention »** propose des plages d'âge spécifiques (18–25, 45–50, 60–65 et 70–75 ans), **non une analyse sanguine annuelle imposée à toute personne** [S17]. Les recommandations de dépistage et périodicités doivent être reliées à la situation et aux recommandations officielles à jour.
- **Brique `BR-SUI-05`** : `Résultats → Importer [PDF / image / CSV / données instrumentées / texte / audio / autre format accepté] OU Saisir → Vérifier → Enregistrer → Lier à un examen / activité / objectif`. Conserver le **fichier source inchangé**, son propriétaire, la date, le professionnel ou appareil, les unités et méthodes, puis les valeurs structurées **lorsqu'elles existent**. Conserver aussi les rapports *qualitatifs* (diagnostic rédigé par un professionnel, commentaires, descriptions d'imagerie), sans tenter de les « réduire à un CSV ».
- **Séparer les niveaux** : compte rendu original / valeurs extraites automatiquement **non vérifiées** / valeurs relues par l'utilisateur / observation instrumentée / avis signé d'un professionnel. Ne pas mettre « normal » ou « anormal » sans plage adaptée et origine clairement reliées au laboratoire/clinicien ; la plage peut dépendre du sexe biologique, de l'âge, de la méthode et de la situation.
- **Export** : CSV UTF-8 structuré pour données tabulaires (`observation_id`, `patient_id_local`, `recorded_at`, `measured_at`, `test_name`, `analyte_or_metric`, `value`, `unit`, `reference_interval`, `method`, `source_id`, `verification_status`, `project_links`, `original_document_id`) ; ne pas supposer qu'un CSV est une base de données de santé suffisante. Utiliser un stockage natif typé pour versions, documents, métadonnées et droits. Ne jamais inclure de données personnelles identifiantes dans une exportation non demandée.
- **Vie privée** : chiffrement et permissions **à auditer dans l'architecture réelle**, accès privé par défaut, suppression/export réglementaires, absence de partage implicite, journal des corrections. Les résultats associés à plusieurs objectifs **ne sont pas copiés**, ce sont des références vers un résultat unique avec droits indépendants.
- **Moniteur** : séries temporelles comparables seulement quand unités, méthodes et conditions permettent l'analyse ; séparation **mesuré / déclaré / calculé / interprété**. « Absence de résultat » ≠ « résultat négatif ». Une anomalie, une variation ou un rapport complexe **n'est pas un diagnostic automatique**. Dépistages et décisions thérapeutiques nécessitent des professionnels.

**Exemple complet** : une consultation est proposée pour un contrôle indiqué, acceptée dans l'agenda ; le médecin prescrit un examen ; l'utilisateur importe ensuite un PDF de laboratoire et, s'il le souhaite, une mesure de tension issue d'un appareil. Le système **conserve les deux sources d'origine**, normalise seulement les données approuvées, propose un graphique des valeurs comparables et permet un export CSV de la série. Il **n'en déduit pas automatiquement** une dose de zinc ou de vitamine D.

## 51.24. Trois parcours de démonstration de bout en bout et multi-objectifs

### Parcours A — Sommeil, effort doux, sans hypothèses arbitraires

1. Dans la matrice des projets, choisir `OBJ-02 Mieux dormir`.
2. Préciser `réveils fréquents`, puis `travail à horaires habituels` si réel ; accepter de consigner le sommeil sur quelques jours, refuser toutes les autres questions facultatives.
3. Sélectionner `Effort 2` dans son **carré extensible** ; régler `Temps disponible : 90 min/semaine`, cinq jours + quatre soirs dans la configuration de l'exemple (51.3).
4. eVe propose `Lumière matinale : 10 min × 5` et `Rituel apaisant : 10 min × 4`, plus `Journal léger` en option. **Aucune natation, régime ou mélatonine par défaut**.
5. Chaque choix ouvre une sous-matrice ; réglage du temps dans le carré étendu, validation et réduction en carré. L'utilisateur peut refuser le rituel et choisir une autre brique.
6. Le **calendrier commun** affiche les propositions ; après confirmation, les occurrences nourrissent `Aujourd'hui`. À la notification, l'utilisateur ouvre l'activité ciblée si son appareil le permet.
7. Le Moniteur conserve heures de lever, perception du repos, observance et provenance ; une insomnie persistante donne accès à une matrice `Aide → Professionnel / TCC-I`, pas à une escalade arbitraire d'effort.

### Parcours B — Prise de muscle et appareil personnel

1. `OBJ-03 → Masse → Effort 3 → Temps 120 min/semaine` ; choisir en connaissance de cause **2 séances de 40 min** et **2 créneaux préparation de repas de 20 min** (total **120 min**, sans compter un trajet non renseigné).
2. `Musculation → Bras → Triceps → Extension → Ma machine`; l'utilisateur crée/choisit une **fiche machine** si nécessaire, puis configure charge, séries, répétitions et repos par carrés extensibles.
3. Une séance réutilise les mêmes mouvements et paramètres que `Activités → Sport → Musculation`; le programme est une composition, pas une nouvelle bibliothèque de machines.
4. Lors de la séance, écran d'exercice au premier plan, appui pour chaque série, correction d'une répétition, pause, reprise ; enregistrement du réalisé et du prévu.
5. Si un autre objectif (`OBJ-09 Condition physique`) est actif, **la séance de bras apparaît une fois dans l'agenda** et peut alimenter deux bilans, sans double comptage.
6. La Nutrition propose les **sources alimentaires** ; un complément protéique ou de créatine reste une **option** évaluée selon le contexte et éventuellement par le professionnel.

### Parcours C — Sport libre, résultats et suivi de prévention

1. Sans projet, ouvrir `Activités → Sport → Natation → Piscine → 25 m → Crawl → 12 longueurs → Valider` ; les valeurs sont **saisies par la personne**, pas un exercice imposé.
2. Au démarrage réel, le compteur avance **1/12…12/12** par appui ; la distance calculée est **300 m** uniquement si les 12 longueurs et la taille de bassin sont confirmées ; la durée est chronométrée ou saisie selon disponibilité.
3. Le résultat sportif rejoint `Résultats`, source `saisie utilisateur`, et peut ensuite être **lié volontairement** à `OBJ-09`.
4. Par ailleurs, un contrôle médical indiqué par un professionnel est programmé dans le **même agenda**. Lorsque le rapport est reçu, son PDF original et les mesures vérifiées sont stockés dans `Résultats`, séries CSV possibles si adaptées.
5. Le Moniteur affiche séparément la progression en piscine et le résultat médical ; **il n'en déduit pas qu'un changement biologique est causé par la natation**.


## 51.25. Contrats de données et événements : assemblage de modules existants, sans duplication

**Ce tableau est un modèle conceptuel à confronter au code et aux outils réels**. Il ne déclare ni endpoint, ni protocole, ni méthode d'API d'atome/eVe disponible.

| Entité | Champs indispensables ou comportements | Relations et source de vérité |
| --- | --- | --- |
| **Projet-objectif** | `id`, `objective_code`, intention, propriétaire, état, critères, versions du programme, confidentialité | Un projet peut relier plusieurs briques ; la matrice du projet le présente. |
| **Brique référentielle** | `brick_id`, version, paramètres admis, unités, risques, références, outil natif compatible | Fiche unique commune au projet et au panneau **Activités**. |
| **Activité configurée** | `activity_id`, `brick_id`, paramètres enregistrés, préférences, provenance et version | Peut être indépendante ou associée à plusieurs objectifs. |
| **Séance composée** | `session_id`, activités ordonnées, segments, état, horaires, pauses, corrections | Réutilise les activités configurées, sans copies de programmes par discipline. |
| **Occurrence de calendrier** | `occurrence_id`, `activity_id`, date, heure, durée, récurrence, fuseau, état, rappel | **Calendrier commun** ; événement planifié ≠ activité accomplie. |
| **Événement d'exécution** | `event_id`, `session_id`, étape, horodatage, action `start/pause/complete/correct/stop`, auteur | Une série ou longueur achevée par appui n'est pas une mesure automatique. Historique append-only ou journal d'audit équivalent à vérifier. |
| **Observation / mesure** | `observation_id`, `source`, type `déclaré/mesuré/calculé`, valeur et unité facultatives, contexte, date, précision si disponible | Résultats partagés par références, **provenance obligatoire**. |
| **Document original** | `document_id`, type, intégrité, version, source, date, autorisations | PDF, image, texte, audio, compte-rendu, rapport sport ; conservation non destructive. |
| **Produit/complément** | `product_id`, concentration, portion, composition, source, dose déclarée, horaires, lots et changements | Occurrences et prises déclarées distinctes, pas de conseil clinique implicite. |
| **Professionnel / rendez-vous** | Relation contact existante, rôle, horaire, statut rendez-vous, partage permis | Réutilise Contacts + Calendrier, sans inventer de prise de rendez-vous externe. |
| **Moniteur** | Agrégation de résultats autorisés et historisés, objectifs correspondants, comparabilité, réserves d'interprétation | Ne crée pas de données biologiques et n'effectue pas de diagnostic. |

**Règles d'intégrité** : une occurrence ne peut pas être simultanément `non démarrée` et `terminée` ; une correction conserve l'ancienne valeur et son auteur ; une même longueur, série ou prise ne doit pas compter deux fois ; dédoublement entre import Health et saisie utilisateur à examiner avec consentement, sans supprimer silencieusement un élément. Une action planifiée partagée entre deux objectifs conserve **un seul identifiant d'événement** et plusieurs rattachements de projet. Une modification rétroactive d'une fiche machine n'altère pas l'exercice historiquement réalisé sur cette machine.

**Adaptation UI** : carrés de matrice **natifs**, pas cards génériques ; extension 2–3 unités, slider ou contrôle natif dans le carré, fermeture puis conservation de la valeur ; hiérarchie navigable avec retour, reprise, focus accessible et commandes de véritable outil. Sur petit écran, le redéploiement doit conserver lisibilité, surfaces tactiles et grille. Aucun pop-up requis pour un réglage courant. Dans un état d'exécution (natation, musculation, journal), afficher **l'outil fonctionnel** avec ses contrôles, pas une simple icône de projet.

**Contraintes d'implémentation** : utiliser **JavaScript** et l'architecture vérifiée d'eVe ; composants Bevy/Canvas, calendrier, Moniteur, Finder, outils texte/audio/vidéo, permissions et connexions MCP à inventorier avant raccordement. Ne pas créer un « moteur santé » concurrent du calendrier ou du stockage atome. Ne pas prétendre que HealthKit, Health Connect, les capteurs sous WebView, les alarmes profondes iOS, une base nutrition ou une API médicale sont opérationnels tant que l'environnement ne l'a pas confirmé. Supporter fonctionnement dégradé sans ces intégrations.

## 51.26. Ordre de réalisation : une bibliothèque unique avant les douze programmes

**Lot 0 — Inventaire réel :** examiner les objets et outils existants, API, permissions, formats et comportement sur Web, macOS, iPad/iOS ; dresser la matrice `réutilisable / à adapter / absent`. Exemples de composants à auditer : matrice carrée, extension de cellule, curseur, outil de séance, calendrier/alarme, Dashboard, Finder, Moniteur, capteurs, import/export et fichiers d'atome.

**Lot 1 — Contrats et accessibilité :** arrêter identifiants, paramètres typés et unités, provenance, correction, consentement et confidentialité ; valider la matrice imbriquée, le carré extensible, le suivi de focus et l'interface touch/VoiceOver. Prévoir tests hors ligne et sans capteur.

**Lot 2 — Première bibliothèque de briques :** rendre utilisables `Effort`, `Temps`, `Marche`, `Rythme sommeil`, `Rituel`, `Nutrition repas`, `Séance de musculation`, `Résultats`, `Rendez-vous`, `Journal`, `Moniteur`. **Même objet réutilisable** en projet et en `Activités`.

**Lot 3 — Trois pilotes complets :** `OBJ-02 Sommeil` **refait médicalement**, `OBJ-03 Masse musculaire` avec machines personnelles, séries et correction, `OBJ-09 Condition physique` avec rameur/course/natation. Tests réels sur **iPad de préférence** puis Web et macOS selon disponibilité, sans affirmer pouvoir ouvrir automatiquement une application iOS en arrière-plan.

**Lot 4 — Nutrition et santé :** compléter repas, catalogue suppléments facultatifs, suivi des prises déclarées, agenda de rendez-vous et stockage des résultats multi-formats (CSV pour séries tabulaires et **original conservé**), puis les modules de prudence clinique et d'aide professionnelle.

**Lot 5 — Compléter les autres objectifs :** `OBJ-01`, `OBJ-04` à `OBJ-08`, `OBJ-10` à `OBJ-12` par **assemblage et configuration**, pas par duplication de scènes, de tableaux de bord ou de systèmes d'alarme.

**Lot 6 — Étendre le sport** : pictogrammes référencés, mouvements machine/poids du corps, variantes, piscine, rameur, tapis, vélo, yoga/mobilité, puis autres disciplines du catalogue 51.20 ; enrichissement **par fiches de données et outils réutilisés**. Un sport non catalogué doit rester lançable en suivi manuel minimal.

**Lot 7 — Revue médicale et maintenance scientifique** : validation par des professionnels compétents des scénarios et conseils, documentation de leur niveau de preuve, contre-indications et mises à jour de recommandations ; possibilité de retirer une proposition dangereuse sans corrompre l'historique des utilisateurs. Chaque valeur « par défaut » médicale devra faire l'objet d'une validation spécifique ; en l'absence de validation, demander la préférence ou afficher « pas de valeur recommandée ».

## 51.27. Tests de réception spécifiques et obligatoires

| Cas de test | Procédure de bout en bout | Réussite exigée |
| --- | --- | --- |
| **Matrice universelle** | Entrer par Projets, Créer, Sommeil, revenir, ouvrir Activités puis Sport. | Mêmes carrés, proportions, navigation profonde et retour cohérents, sans panneaux génériques. |
| **Carré de temps** | Cliquer `Temps`, étendre sur 2–3 cellules, régler 90 min/semaine, refermer, rouvrir. | Valeur préservée, grille réorganisée sans recouvrement, focus/lecteur d'écran conservé. |
| **Effort vs capacité** | Mettre Effort 5 et indiquer une capacité très limitée ou un besoin d'avis médical. | **Aucune** séance intense, charge lourde, régime restrictif ou cure générée automatiquement. |
| **Budget et partage** | Activer OBJ-03 + OBJ-09, partager une séance de 40 min dans les deux. | Temps compté **une fois**, occurrence unique, résultats distincts par objectif. |
| **Sommeil refait** | Déclarer difficultés d'endormissement, temps 90 min, refuser nutrition et sport. | Parcours court, aucune natation/mélatonine ajoutée ; orientation TCC-I possible en cas d'insomnie chronique. |
| **Douleur / anomalie** | Signaler un symptôme potentiellement grave, puis essayer de lancer une activité aggravante. | Affichage prudent d'orientation et blocage de **la recommandation inappropriée**, sans diagnostic affiché. |
| **Musculation avec machine créée** | Ajouter machine personnelle, sélectionner triceps, configurer test 5×5 et 10 kg, valider chaque série, corriger série 3. | Machine enregistrée comme équipement ; série suivante au toucher ; valeurs prévues/réelles historisées, modification rétroactive non destructive. |
| **Natation** | Choisir bassin 25 m, 12 longueurs, terminer à la main sans montre. | 12 étapes et 300 m calculés **seulement après validation** ; source « déclarée », pas « mesure capteur ». |
| **Rameur / course** | Enregistrer distance, durée, résistance ou cadence selon discipline ; afficher km/h ou m/500m seulement si possible. | Valeurs dérivées cohérentes, nulls et unités gérés, aucun champ inventé. |
| **Positions et variantes** | Passer d'une extension triceps machine à une planche statique et un étirement. | Paramètres propres : charge/répétitions **ou** durée/position, pas formulaire universel incohérent. |
| **Activités libres** | Lancer natation depuis Activités, puis lier après coup le résultat à OBJ-09. | **Même brique fonctionnelle**, pas de création d'une deuxième performance. |
| **Complément** | Ajouter vitamine B12 manuellement, modifier concentration, renseigner un horaire, ignorer un rappel. | Ni dose proposée comme prescription, ni prise inférée du rappel, historique conservé. |
| **Résultats** | Importer PDF biologique, image d'examen non chiffré, observation sportive et note personnelle autorisée. | Originaux conservés, exports CSV seulement si pertinents, unités et droits distincts. |
| **Rendez-vous** | Créer rendez-vous médical, reporter, puis importer un compte rendu quelques jours après. | Statuts séparés planifié/effectué/document reçu ; lien facultatif, audit disponible. |
| **Bien-être et santé mentale** | Sélectionner loisirs, puis signaler une détresse importante ; refuser une collecte d'humeur. | Pas de diagnostic ni analyse forcée du journal ; ressources d'aide accessibles, confidentialité respectée. |
| **Rajeunissement** | Choisir amélioration de l'apparence, examiner un « booster NAD » et préférer photoprotection. | Photoprotection plausible ; produit expérimental **non présenté comme rajeunissant prouvé**. |
| **Historique / retour arrière** | Ajuster une séance après trois semaines, désactiver une brique, restaurer un ancien programme. | Activités passées et résultats restent datés ; la version active évolue sans réécrire le passé. |
| **iPad et OS** | Vérifier navigation tactile/VoiceOver et rappel calendrier en écran verrouillé, permissions refusées. | Pas d'ouverture iOS forcée illicite ni capteur « actif » fictif ; accès alternatif manuel. |

La **réussite médicale** ne se mesure pas uniquement à l'ouverture d'un projet : les conseils doivent être traçables, proportionnés, sans promesses trompeuses et révisables après intervention humaine. La **réussite produit** exige que les vrais outils d'atome/eVe exécutent réellement la planification, les étapes et l'enregistrement.

## 51.28. Sources scientifiques et référentiels de conception (vérification : 11/10/2026)

La bibliographie est **publique et accessible** pour revue clinique ultérieure. Les lignes citées ne valident pas un protocole individualisé ni chaque valeur purement UX de ce cahier. Les recommandations évoluent ; la date de révision doit rester attachée à la brique concernée.

- **[S01] OMS** — *Guidelines on physical activity and sedentary behaviour* (2020) ; recommandations adultes et renforcement. https://www.who.int/europe/news-room/fact-sheets/item/physical-activity
- **[S02] OMS** — *Alimentation saine* (fiche révisée en 2026, alimentation et fibres). https://www.who.int/fr/news-room/fact-sheets/detail/healthy-diet
- **[S03] NIH/NHLBI** — *How Much Sleep Is Enough?* (2022). https://www.nhlbi.nih.gov/health/sleep/how-much-sleep
- **[S04] NICE** — *Overweight and obesity management, NG246*, recommandations sur l'alimentation et les approches durables (2025). https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet
- **[S05] American College of Sports Medicine (ACSM)** — *Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews* (2026). https://pubmed.ncbi.nlm.nih.gov/41843416/
- **[S06] International Society of Sports Nutrition** — *Position stand: protein and exercise* (2017). https://pubmed.ncbi.nlm.nih.gov/28642676/
- **[S07] NIH Office of Dietary Supplements** — *Dietary Supplements for Exercise and Athletic Performance*, fiche professionnelle, créatine et preuves. https://ods.od.nih.gov/factsheets/ExerciseAndAthleticPerformance-HealthProfessional/
- **[S08] NIH Office of Dietary Supplements** — *Dietary Supplements: What You Need to Know* (risques et interactions) ; fiches B12, D et fer. https://ods.od.nih.gov/HealthInformation/healthinformation.aspx ; https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/ ; https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/ ; https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/
- **[S09] NICE** — *Chronic pain (primary and secondary) in over 16s, NG193* (2021). https://www.nice.org.uk/guidance/ng193/chapter/recommendations
- **[S10] American Academy of Sleep Medicine** — *Behavioral and psychological treatments for chronic insomnia disorder in adults: clinical practice guideline* (2021), recommandation forte de TCC-I. https://pmc.ncbi.nlm.nih.gov/articles/PMC7853203/
- **[S11] NICE** — *Depression in adults: treatment and management, NG222* (2022). https://www.nice.org.uk/guidance/ng222/chapter/Recommendations
- **[S12] OMS** — *Principaux repères sur la dépression* (consultation et traitements psychologiques). https://www.who.int/fr/news-room/fact-sheets/detail/depression
- **[S13] American Academy of Dermatology** — *11 ways to reduce premature skin aging*, photoprotection. https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/reduce-premature-aging-skin
- **[S14] OMS** — *Healthy ageing: functional ability*, objectif de vieillissement en bonne santé. https://www.who.int/health-topics/ageing/transforming-health-and-social-services-towards-a-more-person-centred-and-integrated-care
- **[S15] OMS** — *From loneliness to social connection* (rapport, 2025). https://www.who.int/publications/b/79027
- **[S16] NICE** — *Self-harm: assessment, management and preventing recurrence, NG225* (2022) ; **ne pas utiliser de scores pour prédire le suicide**. https://www.nice.org.uk/guidance/ng225/chapter/recommendations
- **[S17] Assurance maladie (France)** — *Mon bilan prévention*, tranches d'âge couvertes. https://www.ameli.fr/assure/sante/mon-bilan-prevention

**Conclusion opérationnelle de cette section :** douze objectifs **entièrement scénarisés au niveau fonctionnel**, une bibliothèque initiale de briques identifiées et transversales, une matrice Sport extensible aux disciplines/machines/mouvements, un espace Nutrition et Compléments facultatif, et un module commun de Résultats documentés. **Les fiches détaillées de tous les sports mondiaux, les pictogrammes définitifs, les protocoles médicaux individualisés et les intégrations natives restent des travaux de développement/validation**, explicitement listés plutôt que supposés terminés.
