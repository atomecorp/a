# GPS — intégration Valhalla dans atome

## Tâche
Intégrer dans **atome** un système GPS/navigation basé sur **OpenStreetMap**, avec **Valhalla comme moteur de navigation favori à ce stade**, conçu comme une base extensible vers une expérience proche de Waze : navigation routière, guidage vocal, trafic lorsqu’une source est disponible, puis fonctions communautaires/sociales.

## Prompt Codex

Tu travailles dans le projet **atome/eVe**. Implémente une première intégration GPS fondée sur **OpenStreetMap** pour les données/cartes.

**Valhalla est le moteur de routage favori à ce stade et doit être utilisé par défaut.** Toutefois, au moment de l’intégration, commence par vérifier rapidement si une solution open-source réellement plus pertinente existe compte tenu de l’architecture actuelle d’atome/eVe et des besoins décrits dans cette tâche. Ne remplace Valhalla que si l’alternative apporte un avantage concret et vérifiable. Documente alors la comparaison et la raison du choix. À défaut d’un avantage net, conserve Valhalla.

### Règles impératives
- Respecter l’architecture existante d’atome/eVe et commencer par auditer le dépôt.
- Réutiliser exclusivement les composants, outils, API, comportements et connexions internes déjà disponibles lorsqu’ils répondent au besoin.
- Ne pas créer de panneau générique, de système parallèle ou de duplication d’une capacité existante.
- L’interface doit rester modulaire, zen et minimale, construite avec les outils/atomes existants.
- JavaScript côté atome ; ne pas introduire TypeScript.
- Ne pas modifier des fonctions sans rapport avec cette tâche.
- Si une brique interne indispensable n’existe pas, s’arrêter sur ce point, expliquer précisément ce qui manque et demander une décision avant d’inventer un remplacement.
- Ne pas commit/push sans demande explicite.

### Étape 1 — Audit obligatoire
Avant toute modification :
1. identifier les composants existants pouvant servir à la carte, au GPS/localisation, aux requêtes réseau, à la voix, au Finder/recherche, aux interactions et aux données temps réel ;
2. identifier l’endroit exact où intégrer le module GPS ;
3. vérifier les conventions et API internes d’atome/eVe ;
4. vérifier comment la localisation est actuellement obtenue sur Web, iOS/Tauri et macOS ;
5. produire un plan court indiquant les fichiers à modifier/créer et les composants internes réutilisés.

Ne commencer l’implémentation qu’après cet audit.

### Architecture cible
Séparer les responsabilités en modules réutilisables :

**1. Carte**
- données cartographiques OpenStreetMap ;
- cartes principalement en ligne ;
- affichage de la position courante ;
- déplacement/zoom et suivi de position ;
- tracé de l’itinéraire retourné par Valhalla ;
- marqueurs nécessaires : départ, destination, étapes et événements.

**2. Navigation / Valhalla**
Créer une couche d’accès à Valhalla indépendante de l’interface.

Elle doit pouvoir gérer au minimum :
- calcul d’itinéraire ;
- origine et destination ;
- étapes intermédiaires si Valhalla les supporte dans l’API retenue ;
- alternatives lorsqu’elles sont disponibles ;
- distance et durée ;
- géométrie de l’itinéraire ;
- instructions/manœuvres ;
- recalcul après sortie de route ;
- informations nécessaires au guidage vocal.

L’URL du serveur Valhalla doit être configurable et ne jamais être codée en dur dans la logique métier.

### 3. Navigation active
Pendant un trajet :
- suivre la position ;
- déterminer la progression sur l’itinéraire ;
- afficher la prochaine instruction utile ;
- détecter une sortie significative de l’itinéraire et demander un nouveau calcul ;
- conserver une séparation claire entre moteur de navigation, rendu cartographique et interface.

Éviter les requêtes réseau inutiles : ne pas recalculer l’itinéraire à chaque mise à jour GPS.

### 4. Voix
La voix doit être un module séparé du moteur GPS.

Prévoir deux directions :

**Sortie vocale**
- lire les instructions de navigation ;
- annoncer les informations importantes ;
- utiliser en priorité la capacité de synthèse vocale déjà présente dans atome/eVe si elle existe.

**Entrée vocale / Assistant**
Préparer une API interne permettant ultérieurement des commandes telles que :
- « emmène-moi à … »
- « trouve une station-service sur le trajet »
- « combien de temps reste-t-il ? »
- « quel est le prochain changement de direction ? »
- « signale un accident ici »

La couche conversationnelle ne doit pas être intégrée dans Valhalla : elle consomme les données du module GPS et déclenche ses actions.

### 5. Trafic
Ne pas considérer Valhalla comme fournisseur de données trafic.

Créer une interface abstraite `traffic provider` permettant d’injecter ultérieurement :
- une source trafic externe ;
- des données produites par les utilisateurs d’atome/eVe ;
- ou plusieurs sources fusionnées.

Si aucune source trafic temps réel n’est actuellement disponible, le GPS doit fonctionner normalement sans trafic.

Ne pas inventer de fournisseur ni d’API trafic.

### 6. Couche communautaire — préparation
Prévoir une architecture permettant d’ajouter sans modifier le moteur GPS :
- accident ;
- danger ;
- route fermée ;
- ralentissement ;
- contrôle ou événement routier si légalement applicable ;
- commentaire/message ;
- position d’un événement ;
- auteur ;
- horodatage ;
- confirmation/invalidation par d’autres utilisateurs.

Cette couche doit rester indépendante de Valhalla et exploiter les mécanismes sociaux/communication existants d’atome/eVe s’ils sont adaptés.

### 7. Recherche de destination
Réutiliser le Finder ou le mécanisme de recherche existant si possible.

La recherche d’adresse/POI et le géocodage doivent être isolés derrière une interface de provider. Ne pas supposer que Valhalla fournit tout le géocodage nécessaire et ne pas ajouter arbitrairement un service tiers.

### 8. API interne attendue
Concevoir une API simple et agnostique permettant à d’autres outils d’atome d’effectuer des actions du type :
- définir destination ;
- calculer route ;
- démarrer navigation ;
- arrêter navigation ;
- obtenir état du trajet ;
- obtenir prochaine instruction ;
- obtenir ETA/distance restante ;
- signaler un événement ;
- interroger les événements proches ou présents sur l’itinéraire.

Adapter les noms exacts aux conventions réelles du dépôt après audit.

### 9. Robustesse
Prévoir :
- perte réseau ;
- serveur Valhalla indisponible ;
- permission GPS refusée ;
- localisation temporairement indisponible ;
- réponse Valhalla invalide ;
- absence de route ;
- recalcul interrompu.

Aucune erreur ne doit bloquer l’application entière.

### 10. Sécurité et confidentialité
- ne transmettre que les données nécessaires ;
- ne pas exposer de clé ou secret côté client ;
- distinguer position nécessaire à la navigation et éventuel partage social ;
- aucun partage de position avec d’autres utilisateurs par défaut sans action/autorisation prévue par atome/eVe.

### 11. Tests
Ajouter des tests adaptés à l’architecture existante pour vérifier au minimum :
1. calcul A → B ;
2. décodage/affichage d’un itinéraire ;
3. extraction des manœuvres ;
4. démarrage et arrêt de navigation ;
5. progression GPS simulée ;
6. sortie de route et recalcul ;
7. perte réseau ;
8. Valhalla indisponible ;
9. guidage vocal sans duplication excessive des annonces ;
10. fonctionnement sans fournisseur de trafic ;
11. ajout ultérieur d’un faux provider trafic sans modifier le moteur GPS.

### Première livraison
La première version doit rester ciblée :
1. connexion configurable à Valhalla ;
2. carte OpenStreetMap en ligne ;
3. position utilisateur ;
4. recherche/définition d’une destination avec les capacités réellement disponibles ;
5. calcul et affichage de l’itinéraire ;
6. instructions de navigation ;
7. guidage vocal en utilisant les capacités existantes ;
8. architecture prête pour trafic et communauté.

Ne construis pas immédiatement une copie complète de Waze. Construis les briques internes réutilisables permettant d’étendre progressivement atome vers cette fonction.

### Livrable Codex
À la fin, fournir :
- résumé de l’audit ;
- architecture retenue ;
- composants internes réutilisés ;
- fichiers créés/modifiés ;
- fonctionnalités réellement opérationnelles ;
- tests exécutés et résultats ;
- limitations connues ;
- éléments restant à connecter, notamment fournisseur de trafic et couche communautaire ;
- aucune affirmation qu’une fonction existe si elle n’a pas été vérifiée ou testée.
