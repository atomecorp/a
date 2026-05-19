ThermUSS — Modèle de sécurité initial : Application → Routeur → Jail utilisateur

1. Périmètre de ce document

Ce document décrit uniquement la première partie de l’architecture ThermUSS :

Application utilisateur
        ↓
Routeur serveur
        ↓
Jail utilisateur isolée
        ↓
Stockage utilisateur

Ce document ne traite pas encore :

* de l’anonymisation ;
* de l’export statistique ;
* du partage de données ;
* de l’exploitation des résultats par ThermUSS ou par une station thermale.

L’objectif ici est uniquement de définir comment les données personnelles de l’utilisateur peuvent être collectées, transmises et stockées dans une jail cloud sans que ThermUSS puisse lire leur contenu brut.

⸻

1. Principe général

Chaque utilisateur dispose d’un environnement serveur isolé sous forme de jail.

La jail représente l’espace cloud personnel de l’utilisateur. Elle reçoit les données venant de son application, les stocke, puis permet à l’utilisateur de les relire depuis ses propres appareils.

ThermUSS ne doit pas pouvoir lire les données brutes stockées dans cette jail.

Le rôle du serveur ThermUSS est donc limité à :

* identifier la jail de destination ;
* router les flux vers la bonne jail ;
* maintenir l’infrastructure ;
* garantir l’isolation technique ;
* assurer la disponibilité du service.

Le serveur ne doit pas avoir accès au contenu lisible des données.

⸻

1. Schéma descriptif du flux initial

┌──────────────────────────────────────┐
│        Application utilisateur        │
│  iOS / Android / Web / Desktop        │
│                                      │
│  - Formulaires ThermUSS              │
│  - Logique propriétaire              │
│  - Chiffrement côté client           │
│  - Clé détenue par l’utilisateur     │
└──────────────────┬───────────────────┘
                   │
                   │ Données déjà chiffrées
                   │ TLS strict + certificate pinning
                   ▼
┌──────────────────────────────────────┐
│          Routeur ThermUSS             │
│                                      │
│  - Authentifie la session            │
│  - Identifie la jail cible           │
│  - Route le paquet chiffré           │
│  - Ne déchiffre jamais le contenu    │
│  - Ne stocke pas les données brutes  │
└──────────────────┬───────────────────┘
                   │
                   │ Paquet opaque
                   ▼
┌──────────────────────────────────────┐
│        Jail personnelle utilisateur   │
│                                      │
│  - Environnement isolé               │
│  - Stockage dédié                    │
│  - Aucun accès inter-utilisateur     │
│  - Aucun accès applicatif ThermUSS   │
│  - Données stockées chiffrées        │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│      Stockage chiffré utilisateur     │
│                                      │
│  - DB locale à la jail               │
│  - Chiffrement au repos              │
│  - Clé absente du serveur            │
│  - Lecture possible uniquement       │
│    depuis un appareil autorisé       │
└──────────────────────────────────────┘

⸻

1. Règle de sécurité centrale

La donnée doit être chiffrée avant de quitter l’application utilisateur.

Le routeur et la jail ne doivent recevoir qu’un contenu opaque, non lisible sans la clé de l’utilisateur.

Formule simple :

ThermUSS transporte et héberge.
L’utilisateur possède et lit.

⸻

1. Chiffrement zero-knowledge

Le modèle visé est un modèle zero-knowledge côté serveur.

Cela signifie que ThermUSS peut techniquement stocker et synchroniser les données, mais ne possède pas les éléments nécessaires pour les lire.

5.1. Conditions nécessaires

Pour que le modèle soit crédible :

* la clé de chiffrement principale est générée côté utilisateur ;
* la clé ne quitte jamais les appareils autorisés ;
* le serveur ne reçoit jamais la clé en clair ;
* les données sont chiffrées avant l’envoi ;
* les données restent chiffrées dans la jail ;
* la relecture se fait uniquement sur un appareil autorisé capable de déchiffrer localement.

5.2. Ce que ThermUSS ne doit pas pouvoir faire

ThermUSS ne doit pas pouvoir :

* lire le contenu des formulaires ;
* lire les réponses utilisateur ;
* lire les notes, ressentis ou commentaires ;
* reconstruire la clé utilisateur ;
* déchiffrer une base de données de jail ;
* accéder aux données par une interface d’administration ;
* injecter du code serveur pour lire les données en clair.

⸻

1. Routeur sécurisé

Le routeur est un composant critique.

Son rôle doit rester strictement limité au transport.

6.1. Responsabilités autorisées

Le routeur peut :

* vérifier l’identité de l’utilisateur ;
* vérifier que l’utilisateur a le droit d’envoyer vers cette jail ;
* identifier la jail cible ;
* transmettre un paquet chiffré ;
* journaliser des métadonnées techniques minimales.

6.2. Responsabilités interdites

Le routeur ne doit pas :

* déchiffrer les données ;
* inspecter le contenu métier ;
* stocker une copie lisible ;
* conserver les payloads ;
* modifier le contenu applicatif ;
* exécuter une logique métier ThermUSS sur les données brutes.

6.3. Logs du routeur

Les logs doivent être limités à des informations techniques non sensibles :

* identifiant technique de session ;
* identifiant opaque de jail ;
* date et heure ;
* taille du paquet ;
* statut de livraison ;
* code d’erreur technique éventuel.

Les logs ne doivent jamais contenir :

* texte de formulaire ;
* réponse utilisateur ;
* donnée de santé ;
* identifiant civil direct ;
* payload chiffré complet si cela n’est pas nécessaire.

⸻

1. Jail utilisateur

Chaque utilisateur dispose d’une jail dédiée.

La jail sert d’espace cloud personnel isolé.

7.1. Ce que garantit la jail

La jail garantit :

* une séparation forte entre utilisateurs ;
* un cloisonnement des processus ;
* un stockage dédié ;
* une limitation des accès inter-utilisateurs ;
* une réduction du risque de fuite massive ;
* une frontière claire entre l’infrastructure ThermUSS et l’espace utilisateur.

7.2. Ce que la jail ne garantit pas seule

La jail ne suffit pas, seule, à garantir que ThermUSS ne peut jamais lire les données.

Pour cela, elle doit être combinée avec :

* chiffrement côté client ;
* absence de clé serveur ;
* chiffrement au repos ;
* restriction stricte des accès admin ;
* durcissement du système hôte ;
* audit du code de routage et de stockage.

⸻

1. Code non exécutable sur les données brutes

Un point critique est d’empêcher ThermUSS d’exécuter du code serveur qui lirait les données en clair.

8.1. Règle

Aucun code propriétaire ThermUSS exécuté côté serveur ne doit avoir accès aux données déchiffrées.

La logique propriétaire peut définir :

* les formulaires ;
* les écrans ;
* les règles d’affichage ;
* les structures de données ;
* l’expérience utilisateur.

Mais cette logique ne doit pas s’exécuter côté serveur sur les données brutes en clair.

8.2. Exécution autorisée

L’exécution en clair est autorisée uniquement :

* dans l’application de l’utilisateur ;
* sur un appareil autorisé ;
* après déchiffrement local ;
* sous le contrôle de l’utilisateur.

8.3. Exécution interdite

L’exécution est interdite :

* dans le routeur ;
* dans une interface admin ThermUSS ;
* dans un service serveur global ;
* dans un worker ayant accès aux données brutes ;
* dans une jail si la clé de déchiffrement est accessible au serveur.

⸻

1. Chiffrement au repos

Les données stockées dans la jail doivent rester chiffrées.

Même si un opérateur système, une sauvegarde ou un accès disque récupère les fichiers, les données ne doivent pas être lisibles.

Exigences

* DB chiffrée ;
* fichiers chiffrés ;
* sauvegardes chiffrées ;
* clés absentes du serveur ;
* rotation possible des clés ;
* révocation possible d’un appareil compromis.

⸻

1. Accès utilisateur

L’utilisateur peut relire ses données depuis ses appareils autorisés.

Le principe est :

La jail stocke.
L’appareil utilisateur déchiffre.

La jail ne doit pas avoir besoin de connaître le contenu des données pour les restituer.

⸻

1. Gestion des appareils autorisés

Chaque appareil autorisé doit disposer d’un accès cryptographique contrôlé.

Possibilités

* clé utilisateur dérivée d’un secret local ;
* clé de données chiffrée séparément pour chaque appareil ;
* ajout d’un nouvel appareil via validation depuis un appareil déjà autorisé ;
* révocation d’un appareil perdu ou compromis ;
* stockage sécurisé dans Secure Enclave, Keychain, Android Keystore ou équivalent.

⸻

1. Sécurité réseau

Le transport doit être sécurisé même si les données sont déjà chiffrées applicativement.

Minimum requis

* TLS strict ;
* HSTS ;
* certificate pinning côté application mobile ;
* refus des certificats invalides ;
* protection contre les attaques MITM ;
* jetons de session courts ;
* renouvellement contrôlé des tokens.

⸻

1. Sécurité système des jails

Les jails doivent être durcies.

Mesures recommandées

* une jail par utilisateur ;
* permissions minimales ;
* pas d’accès root inutile dans la jail ;
* pas de montage disque partagé entre utilisateurs ;
* quotas disque ;
* limites CPU/RAM ;
* réseau filtré ;
* pare-feu par jail ;
* mises à jour système régulières ;
* réduction des services installés ;
* audit des permissions ;
* supervision des comportements anormaux.

⸻

1. Sauvegardes

Les sauvegardes ne doivent pas devenir une faille.

Règles

* sauvegardes chiffrées ;
* pas de dump en clair ;
* pas d’export admin lisible ;
* restauration possible uniquement sous forme chiffrée ;
* séparation entre sauvegarde infrastructure et déchiffrement utilisateur.

⸻

1. Administration serveur

L’administration de l’infrastructure doit être séparée de l’accès aux données.

Un administrateur ThermUSS peut maintenir :

* le serveur ;
* les jails ;
* le routeur ;
* les mises à jour ;
* la disponibilité ;
* les ressources système.

Mais il ne doit pas pouvoir lire :

* la base utilisateur ;
* les fichiers utilisateur ;
* les formulaires remplis ;
* les ressentis ;
* les données médicales ou assimilées.

⸻

1. Niveau de sécurité obtenu

Avec ce modèle, ThermUSS peut affirmer :

Les données personnelles sont stockées dans un environnement isolé propre à chaque utilisateur.
Elles sont chiffrées avant transmission.
Le serveur ne possède pas les clés de déchiffrement.
Le routeur ne lit pas le contenu.
Les données restent chiffrées dans la jail.
La lecture en clair est réservée aux appareils autorisés de l’utilisateur.

Ce modèle permet d’obtenir un niveau de sécurité très élevé.

Il ne faut toutefois pas employer l’expression “sécurité totale”, car aucun système informatique ne peut garantir une sécurité absolue.

La formulation correcte est :

Sécurité très élevée par conception, avec absence d’accès serveur aux données brutes utilisateur.

⸻

1. Synthèse courte

Le modèle initial ThermUSS repose sur quatre piliers :

1. Application utilisateur : collecte et chiffre les données localement.
2. Routeur ThermUSS : transporte sans lire.
3. Jail utilisateur : isole et stocke.
4. Clé utilisateur : permet seule la lecture en clair.

La jail apporte l’isolation.
Le chiffrement zero-knowledge apporte l’absence d’accès serveur.
Le routeur opaque garantit que le flux ne révèle pas le contenu.
Le code non exécutable côté serveur empêche ThermUSS de contourner le modèle.

⸻

1. Extension — Modèle d’anonymisation « béton » (sortie de la jail)

Ce chapitre définit le modèle cible pour extraire des informations depuis la jail sans jamais exposer de données individuelles.

18.1. Noms des composants

* OpenAnonymizer (open source, auditable)
* Stats Intake API (réception)
* Statistical Mixer (agrégation boîte noire)
* Stats Store (stockage des résultats globaux)

18.2. Schéma

Jail utilisateur (données brutes chiffrées)
        ↓
OpenAnonymizer (dans la jail)
        ↓
Contribution statistique minimale (pas de ligne individuelle)
        ↓
Stats Intake API (réception opaque)
        ↓
Statistical Mixer (agrégation + suppression des entrées)
        ↓
Stats Store (statistiques globales uniquement)

18.3. Règles non négociables

Aucune fiche individuelle persistante
Aucun identifiant utilisateur (direct ou indirect)
Aucun timestamp précis (utiliser des périodes)
Aucune donnée rare isolable
Publication uniquement si taille de groupe >= seuil (k-anonymity)
Suppression des contributions après agrégation
Aucune rétention d’historique entrée par entrée
Sortie = statistiques globales uniquement

18.4. OpenAnonymizer (exigences)

Fonctions obligatoires (open source, auditable) :

* suppression des identifiants directs ;
* généralisation (âge → tranches, date → période, lieu → zone) ;
* suppression ou transformation des textes libres (ou blocage) ;
* agrégation locale (compteurs, moyennes, distributions) ;
* seuil minimum k (refus d’envoi si groupe trop petit) ;
* randomisation / bruit contrôlé si nécessaire (ex. Laplace) ;
* génération d’un payload minimal (ex : histogrammes, compteurs) ;
* journal local auditable (sans données sensibles) ;
* signature du payload (intégrité) ;
* envoi uniquement de contributions statistiques.

18.5. Stats Intake API (réception)

Doit :

* accepter uniquement des payloads agrégés ;
* refuser tout payload contenant des champs individuels ;
* ne pas conserver d’identifiants ;
* journaliser uniquement des métadonnées techniques ;
* transmettre au mixer sans transformation métier.

18.6. Statistical Mixer (boîte noire)

Doit :

* concaténer des contributions homogènes ;
* appliquer des règles de seuil (k, l-diversity si nécessaire) ;
* produire des agrégats (moyennes, médianes, distributions) ;
* supprimer les contributions après agrégation ;
* empêcher toute reconstruction d’entrées individuelles.

18.7. Stats Store

Ne contient que :

* des statistiques globales (par période, par catégorie) ;
* des indicateurs agrégés (scores moyens, écarts, distributions) ;
* aucun identifiant, aucun log d’entrée, aucune donnée brute.

18.8. Propriété de sécurité

Aucune donnée individuelle exploitable ne quitte la jail.
Aucune donnée individuelle n’est stockée côté serveur statistique.
La ré-identification est rendue impraticable en pratique.

18.9. Positionnement réglementaire (CNIL/RGPD)

* viser une anonymisation effective (et non une pseudonymisation) ;
* documenter les techniques : généralisation, agrégation, randomisation ;
* prouver l’irréversibilité pratique (seuils, absence d’historique, suppression) ;
* auditer publiquement OpenAnonymizer.

⸻

1. Point suivant

Détailler :

* choix des métriques (ce qui est collecté) ;
* paramètres de k (seuils) par cas d’usage ;
* format exact des payloads statistiques ;
* mécanisme de consentement utilisateur.

⸻

1. Spécification CNIL / Audit Ready

Cette section transforme le modèle ThermUSS en une base directement exploitable pour un audit CNIL ou sécurité.

20.1. Modèle de menace

Le système doit être conçu pour résister aux acteurs suivants :

* attaquant externe (intrusion réseau)
* administrateur serveur malveillant
* employé interne
* compromission d’une jail
* compromission d’un device utilisateur
* interception réseau (MITM)
* tentative de ré-identification statistique

Chaque composant doit être évalué face à ces menaces.

⸻

20.2. Gestion des clés (Zero-Knowledge)

Principes

* clé générée côté utilisateur
* jamais transmise en clair au serveur
* stockage sécurisé (Secure Enclave / Keystore)

Cycle de vie

Génération → Stockage local sécurisé → Utilisation → Rotation → Révocation

Contraintes

* aucune clé serveur permettant déchiffrement
* support multi-device sécurisé
* révocation d’un appareil compromise

⸻

20.3. Authentification et accès

* authentification forte (token + refresh court)
* association stricte utilisateur → jail
* interdiction d’écriture inter-jail
* isolation stricte des sessions

⸻

20.4. Intégrité des données

* signature des payloads côté client
* vérification côté réception
* protection anti-replay
* horodatage sécurisé (fenêtre de validité)

⸻

20.5. Anti-abus (statistiques)

* limitation du nombre de contributions
* détection de patterns anormaux
* preuve d’unicité (sans identité directe)
* validation de cohérence des données

⸻

20.6. Paramètres d’anonymisation

* seuil minimum k ≥ 10 (à ajuster selon usage)
* suppression automatique des catégories faibles
* généralisation systématique
* interdiction des données rares isolées

⸻

20.7. Journalisation sécurisée

* logs techniques uniquement
* aucune donnée personnelle
* protection contre modification
* durée de rétention limitée

⸻

20.8. Mises à jour sécurisées

* signature obligatoire des mises à jour
* vérification côté client et serveur
* possibilité de rollback
* audit des versions déployées

⸻

20.9. Disponibilité et résilience

* sauvegardes chiffrées
* redondance des jails
* restauration sans accès au contenu
* tolérance aux pannes

⸻

20.10. Droits utilisateur (RGPD)

* droit d’accès aux données
* droit à la suppression
* export des données utilisateur
* gestion de la perte d’accès

⸻

20.11. Métadonnées

* minimisation stricte
* pas de stockage IP long terme
* agrégation temporelle
* suppression des patterns identifiants

⸻

20.12. Preuve d’audit

* code OpenAnonymizer open source
* build reproductible
* hash des versions déployées
* correspondance code ↔ exécution prouvable

⸻

1. Conclusion Audit

ThermUSS implémente un modèle zero-knowledge distribué.
Les données personnelles restent isolées dans des jails utilisateurs.
Le serveur ne possède aucun moyen de lecture des données brutes.
Les données sortantes sont strictement anonymisées et agrégées.
Le système est conçu pour empêcher toute ré-identification en pratique.

Ce document constitue une base solide pour :

* audit CNIL
* audit sécurité
* certification conformité RGPD

⸻
