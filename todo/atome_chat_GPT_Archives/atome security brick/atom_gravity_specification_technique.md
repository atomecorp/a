# Atom Gravity — Le problème à trois corps
## Spécification technique du Gravity Reactor

**Statut :** document de conception technique  
**Projet :** Atom / eVe / Gravity  
**Objet :** architecture de collecte statistique sans conservation durable des données individuelles  
**Version :** 0.1 — base de travail

---

# 1. Résumé technique

Atom Gravity est une architecture tripartite conçue pour produire des statistiques utiles à partir de données sensibles sans constituer une base centrale contenant les données individuelles des participants.

Le système repose sur trois entités séparées :

- **eVe** : instance privée de l’utilisateur. Elle conserve les données brutes et décide ce qui peut sortir.
- **Atom** : couche d’orchestration et de transport. Elle relie les acteurs et transporte les messages sans devenir un entrepôt de données personnelles.
- **Gravity** : moteur statistique sécurisé. Il reçoit des contributions minimales, les agrège dans des structures statistiques prédéfinies, supprime les données individuelles, et ne publie un résultat que si les conditions de confidentialité, de taille d’échantillon et de qualité scientifique sont satisfaites.

Le cœur de Gravity est le **Gravity Reactor**.

Son principe est :

```text
recevoir
→ vérifier
→ classifier le risque
→ normaliser
→ agréger
→ détruire la contribution individuelle
→ attendre le seuil
→ contrôler le risque de divulgation
→ publier uniquement l’agrégat
```

Le système ne cherche pas à « anonymiser une base existante ».

Il cherche à empêcher qu’une telle base n’existe.

---

# 2. Objectifs

Gravity doit satisfaire simultanément plusieurs objectifs qui sont habituellement contradictoires.

## 2.1 Confidentialité forte

Le système doit réduire au maximum la possibilité de retrouver une personne à partir des données collectées ou des statistiques produites.

## 2.2 Précision scientifique

La confidentialité ne doit pas dégrader inutilement la qualité des statistiques.

Le recours à du bruit statistique n’est donc pas la première ligne de défense.

Gravity privilégie d’abord :

- la non-conservation des données individuelles ;
- l’agrégation immédiate ;
- la généralisation contrôlée ;
- les seuils de population ;
- la limitation des croisements ;
- la suppression de certaines dimensions ;
- les règles anti-différentiation ;
- les restrictions de requêtes.

## 2.3 Auditabilité

Les règles de Gravity doivent être inspectables.

Le code, le registre de risque, les politiques de publication et les algorithmes doivent pouvoir être audités.

## 2.4 Reproductibilité

Une même règle de risque appliquée aux mêmes métadonnées doit produire le même résultat.

Les décisions doivent être déterministes autant que possible.

## 2.5 Évolutivité

Le moteur doit pouvoir traiter :

- quelques milliers de participants ;
- des millions de participants ;
- plusieurs familles de données ;
- des projets scientifiques différents ;
- des règles de confidentialité différentes selon le contexte.

---

# 3. Principe architectural

## 3.1 eVe

eVe est le coffre individuel.

Il peut contenir par exemple :

- données de santé ;
- mesures physiologiques ;
- activité sportive ;
- sommeil ;
- poids ;
- nutrition ;
- données environnementales ;
- données comportementales ;
- questionnaires ;
- données générées par des capteurs.

Les données brutes restent localement dans l’instance eVe.

Avant toute émission, eVe applique une politique locale :

```text
donnée brute
→ consentement
→ sélection
→ réduction
→ transformation
→ enveloppe sécurisée
→ envoi
```

eVe ne transmet que les champs autorisés et nécessaires.

---

## 3.2 Atom

Atom est l’orchestrateur.

Il ne doit pas devenir un centre de stockage analytique.

Ses fonctions peuvent inclure :

- découverte de services ;
- routage ;
- authentification ;
- autorisation ;
- distribution des requêtes ;
- négociation de protocoles ;
- vérification des versions ;
- gestion des sessions ;
- transmission chiffrée ;
- coordination entre eVe et Gravity ;
- diffusion des résultats agrégés.

Atom doit manipuler le minimum de métadonnées nécessaire.

---

## 3.3 Gravity

Gravity est le réacteur statistique.

Il possède :

- un moteur de validation ;
- un moteur de classification du risque ;
- un registre de risque ;
- un moteur de généralisation ;
- un moteur d’agrégation ;
- un moteur de seuils ;
- un moteur anti-réidentification ;
- un moteur anti-requêtes différentielles ;
- un moteur de publication ;
- un système d’audit ;
- un mécanisme de destruction des contributions transitoires.

Gravity ne doit pas posséder une table telle que :

```text
user_id | age | poids | fréquence_cardiaque | localisation | ...
```

Le modèle de données interne doit être conçu pour rendre cette table inutile.

---

# 4. Modèle de menace

Le système doit être conçu contre plusieurs familles d’attaques.

## 4.1 Attaquant externe

Objectifs possibles :

- interception ;
- exfiltration ;
- injection de données ;
- déni de service ;
- compromission d’un nœud ;
- observation des flux ;
- rejeu de messages.

## 4.2 Administrateur malveillant

Un administrateur de Gravity pourrait tenter de :

- lire les contributions en mémoire ;
- activer des logs détaillés ;
- modifier un binaire ;
- diminuer un seuil ;
- ajouter une requête cachée ;
- contourner l’effacement.

## 4.3 Chercheur malveillant

Un chercheur pourrait tenter de :

- multiplier les requêtes ;
- comparer deux populations presque identiques ;
- isoler un individu ;
- reconstruire des sous-groupes ;
- récupérer indirectement une information rare.

## 4.4 Participant malveillant

Un utilisateur peut :

- envoyer de fausses données ;
- soumettre plusieurs fois la même contribution ;
- créer de faux comptes ;
- manipuler une statistique ;
- tenter un empoisonnement de données.

## 4.5 Collusion

Deux acteurs peuvent coopérer :

- Atom + chercheur ;
- administrateur + chercheur ;
- plusieurs participants ;
- opérateur réseau + opérateur Gravity.

L’architecture doit limiter les informations accessibles à chaque acteur.

---

# 5. Principes de sécurité

## 5.1 Minimisation

Toute donnée qui n’est pas nécessaire à une statistique ne doit pas entrer dans Gravity.

## 5.2 Pas d’identifiant utilisateur persistant dans le réacteur

Les identifiants permanents sont incompatibles avec le principe de non-conservation.

Si un mécanisme anti-doublon est requis, il doit utiliser un identifiant dérivé et limité au contexte.

Exemple :

```text
token_contribution =
HMAC(
    secret_epoch,
    project_id || metric_id || participant_pseudonym
)
```

Ce token :

- ne doit pas permettre de retrouver l’identité ;
- doit être différent entre projets ;
- peut expirer par époque ;
- sert uniquement à empêcher les doublons.

---

## 5.3 Durée de vie minimale

Une contribution individuelle doit exister le moins longtemps possible.

Objectif :

```text
réception
→ parsing
→ validation
→ agrégation
→ destruction mémoire
```

Elle ne doit pas être écrite dans :

- logs ;
- fichiers temporaires ;
- journaux de crash ;
- métriques d’observabilité ;
- swap ;
- caches persistants.

---

## 5.4 Séparation des rôles

Les fonctions suivantes doivent être séparées :

- administration système ;
- modification du registre de risque ;
- publication d’une nouvelle version ;
- validation scientifique ;
- audit ;
- signature d’une release.

---

## 5.5 Défense en profondeur

Gravity ne repose pas sur un unique seuil.

La confidentialité provient de plusieurs protections combinées.

---

# 6. Le registre de risque Gravity

Le registre de risque est central.

Il ne contient pas de données personnelles.

Il contient les règles qui déterminent ce que Gravity a le droit de faire.

---

## 6.1 Exemple de structure logique

```yaml
metric:
  id: resting_heart_rate
  domain: health
  sensitivity: high
  identifiability: medium
  rarity_risk: medium
  base_threshold: 5000

allowed_aggregates:
  - mean
  - median
  - percentile
  - histogram

forbidden_aggregates:
  - raw_values
  - ordered_individual_values

dimensions:
  age:
    type: quasi_identifier
    min_bucket_width: 5_years
  weight:
    type: quasi_identifier
    min_bucket_width: 5_kg
  sex:
    type: sensitive_dimension
  location:
    type: high_risk_quasi_identifier
    minimum_resolution: region

interaction_rules:
  - when:
      dimensions: [age, weight, location]
    action:
      threshold_multiplier: 4
      max_location_resolution: region
```

---

## 6.2 Dimensions de risque

Chaque donnée peut recevoir plusieurs scores.

Exemple :

```text
S = sensibilité
I = identifiabilité
R = rareté
G = granularité
C = risque de croisement
Q = risque lié à la requête
T = risque temporel
P = risque de population
```

Chaque score peut être normalisé sur une échelle, par exemple :

```text
0.0 = négligeable
1.0 = maximal
```

---

# 7. Calcul du risque

Une première fonction de risque peut être :

```text
risk =
wS*S
+ wI*I
+ wR*R
+ wG*G
+ wC*C
+ wQ*Q
+ wT*T
+ wP*P
```

avec :

```text
Σ wi = 1
```

Mais une simple somme n’est pas suffisante pour les cas critiques.

Certaines combinaisons doivent produire des multiplicateurs ou des interdictions.

Exemple :

```text
si localisation_précise ET maladie_rare :
    requête interdite

si âge_exact ET poids_exact ET localisation :
    granularité forcée à la hausse

si population_estimée < seuil_minimal_absolu :
    publication impossible
```

Le moteur doit donc être hybride :

```text
règles déterministes
+
score continu
+
seuils durs
```

---

# 8. Calcul du seuil adaptatif

Le seuil n’est pas une constante.

On définit :

```text
Nbase = seuil de base
Mrisque = multiplicateur de risque
Mprecision = multiplicateur lié à la précision demandée
Mrareté = multiplicateur de rareté
Mcroisement = multiplicateur de croisement
Mtemps = multiplicateur temporel
```

Puis :

```text
Nrequired =
ceil(
    Nbase
    * Mrisque
    * Mprecision
    * Mrareté
    * Mcroisement
    * Mtemps
)
```

Exemple :

```text
Nbase = 5000
Mrisque = 1.5
Mprecision = 1.2
Mrareté = 2
Mcroisement = 1.5
Mtemps = 1

Nrequired = 27 000
```

Gravity ne publie rien tant que :

```text
Ncell < Nrequired
```

---

# 9. Le seuil par cellule

La protection ne doit jamais être calculée uniquement sur la taille totale du projet.

Exemple :

```text
Population totale = 100 000
```

Une cellule peut pourtant être :

```text
Femmes
42 ans
maladie rare
code postal précis
traitement spécifique
N = 3
```

Même avec 100 000 participants globaux, cette cellule est extrêmement identifiable.

Donc le seuil est toujours calculé au niveau de la **cellule réellement publiée**.

---

# 10. Généralisation dynamique

Si une cellule n’atteint pas le seuil requis, Gravity peut essayer de réduire la granularité.

Exemple initial :

```text
âge = 47 ans
poids = 68 kg
ville = Clermont-Ferrand
N = 312
```

Gravity peut généraliser :

```text
âge = 45–49 ans
poids = 65–69 kg
département = 63
N = 1 480
```

Puis :

```text
âge = 45–54 ans
poids = 60–74 kg
région = Auvergne-Rhône-Alpes
N = 8 920
```

Si :

```text
Nrequired = 5000
```

la troisième forme devient publiable.

---

# 11. Algorithme de généralisation

Pseudo-code :

```text
function find_publishable_cell(query, registry):

    current = query

    while true:

        risk = compute_risk(current, registry)
        threshold = compute_threshold(current, risk, registry)
        population = estimate_population(current)

        if forbidden(current, registry):
            return REJECTED

        if population >= threshold:
            return current

        candidate = generalize_one_dimension(current, registry)

        if candidate == NONE:
            return NOT_PUBLISHABLE

        current = candidate
```

La fonction `generalize_one_dimension` doit choisir la modification qui réduit le plus le risque tout en détruisant le moins de précision scientifique.

---

# 12. Fonction de coût de généralisation

Pour éviter une généralisation arbitraire, Gravity peut minimiser :

```text
cost =
α * information_loss
+
β * privacy_risk
+
γ * scientific_distortion
```

Avec :

```text
privacy_risk doit rester sous une limite stricte
```

Le moteur cherche donc :

```text
la représentation la plus précise
qui satisfait les contraintes de confidentialité
```

---

# 13. Structures statistiques internes

Gravity ne doit pas stocker les valeurs individuelles.

Il peut maintenir des structures agrégées.

Exemples :

## 13.1 Compteurs

```text
count[cell] += 1
```

## 13.2 Sommes

```text
sum[cell] += value
count[cell] += 1

mean = sum / count
```

## 13.3 Variance

Utilisation d’un algorithme en ligne, par exemple une variante de Welford.

```text
count += 1
delta = x - mean
mean += delta / count
delta2 = x - mean
M2 += delta * delta2
```

Variance :

```text
variance = M2 / (count - 1)
```

La valeur individuelle `x` n’a pas besoin d’être conservée.

## 13.4 Histogrammes

```text
bucket[value_range] += 1
```

## 13.5 Percentiles

Utiliser une structure de quantiles approximatifs en streaming, par exemple :

- t-digest ;
- KLL sketch ;
- histogrammes hiérarchiques.

Ces structures permettent de produire des percentiles sans garder chaque mesure.

---

# 14. Agrégation irréversible

Le terme « irréversible » signifie ici :

> l’état statistique interne ne doit pas permettre de reconstruire simplement la liste originale des contributions.

Exemple acceptable :

```text
count = 8422
sum = 517991
mean = 61.50
variance_state = ...
```

Exemple non acceptable :

```text
values = [61, 64, 58, 62, ...]
```

Même un tableau pseudonymisé resterait une base individuelle.

---

# 15. Pipeline d’ingestion

Pipeline recommandé :

```text
[Transport chiffré]
        ↓
[Authentification]
        ↓
[Vérification du projet]
        ↓
[Validation du schéma]
        ↓
[Anti-rejeu]
        ↓
[Anti-doublon]
        ↓
[Normalisation]
        ↓
[Classification du risque]
        ↓
[Mapping vers cellule]
        ↓
[Mise à jour agrégat]
        ↓
[Destruction contribution]
        ↓
[Mise à jour métriques techniques non sensibles]
```

---

# 16. Format d’une contribution

Exemple :

```json
{
  "protocol_version": "1.0",
  "project_id": "cardio-study-001",
  "metric_id": "resting_heart_rate",
  "epoch": "2026-W36",
  "dimensions": {
    "age_bucket": "45-49",
    "weight_bucket": "65-69",
    "region": "ARA"
  },
  "value": 61,
  "anti_replay_token": "...",
  "contribution_token": "...",
  "signature": "..."
}
```

Ne doivent pas apparaître :

```text
nom
email
adresse
numéro de téléphone
identifiant permanent
identifiant appareil stable
IP conservée
identifiant médical
```

---

# 17. Destruction des données individuelles

Après agrégation :

```text
zeroize(contribution_buffer)
release_memory()
```

Le système doit également :

- désactiver les core dumps contenant des données ;
- éviter le swap pour les zones sensibles ;
- interdire les logs du payload ;
- filtrer les traces d’erreur ;
- contrôler les outils APM ;
- chiffrer les dumps techniques nécessaires ;
- tester l’absence de persistance accidentelle.

---

# 18. Protection contre les requêtes différentielles

Un risque majeur est le suivant :

```text
requête A = groupe de 5001 personnes
requête B = même groupe moins une personne

A - B = information de la personne isolée
```

Gravity doit donc analyser les relations entre requêtes.

---

# 19. Empreinte de requête

Chaque requête peut être transformée en représentation canonique :

```text
QueryFingerprint = H(
    metric
    + dimensions
    + filters
    + time_range
    + aggregation
)
```

Gravity conserve un historique de requêtes **sans données individuelles**.

Il peut détecter :

- requêtes presque identiques ;
- sous-populations imbriquées ;
- différences d’une seule dimension ;
- rafales de requêtes ;
- attaques par soustraction.

---

# 20. Distance entre deux requêtes

On peut définir :

```text
D(A,B)
```

selon :

- différence de filtres ;
- différence de plage temporelle ;
- différence de population ;
- nombre de dimensions communes ;
- proximité des bornes.

Si :

```text
D(A,B) < Dmin
```

et que leur différence pourrait isoler une petite population :

```text
publication bloquée
```

---

# 21. Budget de divulgation

Même sans bruit, on peut introduire un budget de divulgation logique.

Exemple :

```text
project
metric
population_partition
time_window
```

Chaque publication consomme une partie d’un budget.

Lorsque trop de requêtes proches ont été publiées :

```text
nouvelle requête refusée
ou
granularité réduite
ou
fenêtre temporelle élargie
```

---

# 22. Protection temporelle

Des statistiques répétées dans le temps peuvent révéler une entrée ou une sortie de population.

Exemple :

```text
12:00 → N = 5001
12:01 → N = 5002
```

Si une seule personne vient d’entrer, certaines métriques pourraient fuiter.

Solutions :

- fenêtres temporelles ;
- publication par batch ;
- délai minimum ;
- seuil d’évolution ;
- gel de certaines cellules ;
- agrégation par époque.

---

# 23. Époques

Gravity peut fonctionner par périodes :

```text
heure
jour
semaine
mois
```

Une cellule n’est publiée qu’à la clôture ou selon une cadence contrôlée.

Exemple :

```text
epoch_id = 2026-W36
```

Les tokens anti-doublons peuvent être liés à l’époque.

---

# 24. Gestion des valeurs rares

Certaines valeurs sont intrinsèquement identifiantes.

Exemples :

- maladie très rare ;
- âge extrême ;
- combinaison clinique inhabituelle ;
- localisation très précise ;
- traitement très rare.

Gravity doit posséder une politique `rare_value`.

Exemple :

```text
if estimated_prevalence < 0.001:
    force_generalization()
    raise_threshold()
```

---

# 25. Interdiction de certaines requêtes

Certaines requêtes ne doivent jamais être publiées, même avec un grand nombre de participants.

Exemples possibles :

- combinaisons permettant une réidentification évidente ;
- groupes fondés sur identifiants directs ;
- listes de valeurs individuelles ;
- statistiques permettant de reconstruire des séquences ;
- trajectoires temporelles individuelles ;
- exports ordonnés ligne par ligne.

Le registre doit pouvoir répondre :

```text
ALLOW
GENERALIZE
DELAY
BLOCK
```

---

# 26. Modèle de décision

Une décision Gravity peut contenir :