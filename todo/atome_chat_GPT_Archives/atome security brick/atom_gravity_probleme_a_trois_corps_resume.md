# Atom Gravity — Le problème à trois corps

## 1. L’idée en une phrase

**Atom Gravity** est une architecture à trois entités conçue pour permettre l’exploitation statistique de données sensibles — notamment de santé — **sans créer de base centrale contenant les données individuelles des utilisateurs**.

Le principe est simple :

- **eVe** garde les données personnelles de l’utilisateur.
- **Atom** transporte et orchestre les échanges sans avoir besoin de lire le contenu.
- **Gravity** reçoit uniquement ce qui est nécessaire au calcul statistique, l’agrège dans un **réacteur statistique hermétique**, puis détruit les données individuelles.

L’objectif est d’obtenir des statistiques très précises et utiles à la recherche tout en réduisant fortement le risque de réidentification.

---

## 2. Les trois corps

### eVe — le coffre privé

eVe est l’instance personnelle de l’utilisateur.

Les données brutes restent chez lui : santé, activité, mesures physiologiques, habitudes, etc.

eVe décide quelles informations peuvent être utilisées et prépare uniquement les données autorisées avant leur sortie.

### Atom — le tuyau et l’orchestrateur

Atom organise les échanges entre les différentes instances.

Son rôle est de :

- transmettre les données ;
- gérer les demandes ;
- relier utilisateurs, chercheurs et services ;
- appliquer les règles du protocole.

Atom doit être conçu pour **ne pas devenir un centre de stockage des données personnelles**.

### Gravity — le réacteur statistique

Gravity est la troisième entité.

Elle ne doit pas devenir une nouvelle base de données.

Son rôle est de recevoir des contributions individuelles, de les transformer immédiatement en information statistique agrégée, puis de **supprimer les données d’origine**.

Gravity ne publie ensuite une statistique que lorsqu’elle estime que le groupe est suffisamment grand et suffisamment sûr.

---

## 3. Le principe du Gravity Reactor

Le cœur du système est un moteur d’agrégation irréversible.

Exemple simplifié :

10 000 personnes transmettent :

- tranche d’âge ;
- poids ;
- rythme cardiaque ;
- activité physique.

Gravity ne conserve pas 10 000 fiches individuelles.

À mesure que les informations arrivent, elles alimentent uniquement des compteurs, distributions, moyennes, histogrammes, percentiles ou autres structures statistiques prévues à l’avance.

La contribution individuelle est ensuite détruite.

Gravity pourrait ainsi conserver par exemple :

> Hommes 40–50 ans, 65–75 kg, activité physique régulière :  
> fréquence cardiaque médiane = 61 bpm  
> population = 8 432 personnes

Mais aucune ligne ne permettrait de retrouver une personne précise.

---

## 4. Un seuil de publication adaptatif

Le système ne doit pas utiliser un nombre arbitraire identique pour toutes les statistiques.

Un moteur de risque détermine le **nombre minimal de personnes nécessaire avant qu’une statistique puisse exister publiquement**.

Exemple :

| Type d’information | Exemple de seuil |
|---|---:|
| Information banale et peu identifiable | quelques dizaines |
| Donnée personnelle modérément sensible | centaines / milliers |
| Donnée de santé sensible | plusieurs milliers |
| Croisement très précis ou sujet très sensible | 10 000, 20 000 ou davantage |

Ces chiffres sont illustratifs : ils doivent être déterminés scientifiquement.

Le principe fondamental est :

> **Plus une donnée est sensible, rare, précise ou facilement recoupable, plus la population minimale exigée augmente.**

---

## 5. Le registre de risque Gravity

Gravity possède une base de règles, et non une base de personnes.

Ce **registre de risque** décrit notamment :

- la sensibilité d’un type de donnée ;
- son potentiel d’identification ;
- les risques liés au croisement avec d’autres variables ;
- la granularité autorisée ;
- la taille minimale de population ;
- les statistiques qui peuvent ou non être produites.

Le registre est **versionné, auditable et ouvert**.

Exemple :

```text
rythme_cardiaque
sensibilité : élevée
seuil_base : 5 000

+ localisation précise
risque : très élevé
seuil_requis : 20 000
granularité localisation : élargie

+ âge exact + poids exact
croisement interdit
=> utiliser tranches d'âge et de poids
```

Gravity ne demande donc pas seulement :

> « Combien de personnes avons-nous ? »

Il demande :

> « Cette statistique est-elle suffisamment sûre pour être produite avec ce niveau de précision ? »

---

## 6. Algorithme simplifié

```text
1. Une contribution arrive depuis eVe.

2. Gravity vérifie :
   - le type de donnée ;
   - sa sensibilité ;
   - les variables croisées ;
   - la granularité demandée.

3. Le registre de risque calcule :
   - le seuil minimal nécessaire ;
   - la granularité maximale autorisée ;
   - les croisements interdits.

4. La contribution alimente uniquement
   une structure statistique prédéfinie.

5. La donnée individuelle est détruite.

6. Tant que le seuil n'est pas atteint :
   aucune statistique n'est publiée.

7. Lorsque le seuil est atteint :
   Gravity vérifie une dernière fois le risque
   de réidentification.

8. Seule la statistique agrégée peut sortir.
```

---

## 7. Pourquoi cette approche est différente

La logique habituelle consiste souvent à :

> collecter → stocker → anonymiser → analyser.

Gravity cherche à inverser cette logique :

> **recevoir → agréger → détruire → publier uniquement ce qui est statistiquement sûr.**

La donnée individuelle devient donc transitoire au lieu de devenir un actif stocké pendant des années.

L’innovation principale n’est pas seulement l’anonymisation.

C’est la création d’un moteur qui décide **si une information statistique a le droit d’exister**, à quelle précision, et à partir de quelle population.

---

## 8. Précision scientifique sans bruit systématique

Pour certaines méthodes de confidentialité, on ajoute volontairement du bruit aux résultats.

Gravity vise une autre priorité : **préserver autant que possible la précision réelle des statistiques**, particulièrement importante dans le domaine médical.

La première ligne de défense repose donc sur :

- l’absence de stockage individuel ;
- l’agrégation irréversible ;
- des seuils de population élevés ;
- la limitation de la granularité ;
- l’interdiction de certains croisements ;
- le contrôle des requêtes répétées ;
- le registre de risque.

Des techniques ajoutant du bruit pourraient rester disponibles lorsque cela devient nécessaire, mais ne seraient pas utilisées systématiquement si elles réduisent inutilement la valeur scientifique.

---

## 9. Open source et confiance

Gravity doit être **open source et auditable**.

Dans un système qui affirme ne pas conserver les données individuelles, la confiance ne doit pas reposer uniquement sur une promesse.

Chercheurs, universités, organismes de santé et experts en sécurité doivent pouvoir vérifier :

- le code ;
- les règles de risque ;
- la destruction des données ;
- les mécanismes d’agrégation ;
- les conditions de publication.

Gravity devient ainsi une **infrastructure de confiance vérifiable**.

---

## 10. Finalité

Atom Gravity permettrait à des milliers ou millions d’utilisateurs de contribuer à la recherche sans créer un gigantesque fichier contenant leur vie personnelle.

À terme, le système pourrait permettre de répondre à des questions telles que :

- Comment évolue un indicateur cardiaque selon l’âge et l’activité ?
- Quels comportements sont statistiquement associés à une meilleure récupération ?
- Quels effets apparaissent dans certaines populations ?
- Quelles tendances de santé sont invisibles dans les études traditionnelles de petite taille ?

Le but est de rendre possible une recherche à très grande échelle tout en faisant de la **non-conservation des données individuelles** une propriété fondamentale de l’architecture.

---

## Résumé

**eVe protège.  
Atom transporte.  
Gravity transforme.**

Gravity ne construit pas une base de données d’humains.

Il construit progressivement **une connaissance statistique collective**, tout en cherchant à empêcher que cette connaissance puisse être utilisée pour remonter jusqu’aux individus.