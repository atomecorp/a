ThermUSS — Architecture Sécurité, Données & Conformité (Version Complète Audit Ready)

⸻

1. Objet du document

Ce document décrit l’architecture complète du système ThermUSS incluant :

* la collecte des données utilisateur
* leur transport
* leur stockage
* leur protection
* leur anonymisation
* leur exploitation statistique
* leur conformité RGPD / CNIL / RIPH3

Ce document constitue une base exploitable pour :

* audit CNIL
* audit sécurité
* dossier CPP (RIPH3)

⸻

1. Architecture globale

Application utilisateur
        ↓
Routeur ThermUSS
        ↓
Jail utilisateur isolée
        ↓
Stockage chiffré utilisateur
        ↓
OpenAnonymizer (dans la jail)
        ↓
Contribution statistique
        ↓
Stats Intake API
        ↓
Statistical Mixer
        ↓
Stats Store

⸻

1. Principe fondamental

ThermUSS transporte et héberge.
L’utilisateur possède et lit.

Aucune donnée brute ne doit être lisible côté serveur.

⸻

1. Flux détaillé des données

1. Saisie utilisateur dans l’application
1. Chiffrement local
1. Transmission sécurisée (TLS)
1. Routeur identifie la jail
1. Transmission opaque
1. Stockage chiffré dans la jail
1. Déchiffrement uniquement côté utilisateur

⸻

1. Modèle de chiffrement (end-to-end)

5.1 Principes

* chiffrement avant sortie du device
* serveur sans accès aux clés
* données toujours chiffrées au repos

5.2 Gestion des clés

* génération côté utilisateur
* stockage sécurisé (Secure Enclave / Keystore)
* jamais transmises au serveur

5.3 Cycle de vie

Génération → Stockage → Utilisation → Rotation → Révocation

5.4 Contraintes

* aucune clé serveur
* multi-device sécurisé
* révocation possible

⸻

1. Routeur ThermUSS

6.1 Rôle

* authentification
* identification de la jail
* routage des paquets

6.2 Interdictions

* déchiffrement
* inspection métier
* stockage des données

6.3 Logs autorisés

* identifiant technique
* timestamp
* taille
* statut

⸻

1. Jail utilisateur

7.1 Objectif

* isolation forte par utilisateur
* stockage dédié

7.2 Garanties

* séparation inter-utilisateur
* cloisonnement des processus

7.3 Sécurité

* quotas CPU/RAM
* réseau filtré
* permissions minimales
* pas d’accès inter-jail

7.4 Limite

La jail seule ne protège pas sans chiffrement.

⸻

1. Stockage

* chiffrement obligatoire
* aucune donnée en clair
* sauvegardes chiffrées
* clés absentes du serveur

⸻

1. Exécution du code

Autorisé

* côté client uniquement
* après déchiffrement

Interdit

* routeur
* serveur global
* admin

⸻

1. Sécurité réseau

* TLS strict
* HSTS
* certificate pinning
* protection MITM
* tokens courts

⸻

1. Gestion des appareils

* ajout sécurisé
* révocation
* stockage sécurisé des clés

⸻

1. Sauvegardes

* chiffrées
* non lisibles
* restauration sans accès aux données

⸻

1. Administration

Autorisé

* maintenance
* supervision

Interdit

* lecture des données

⸻

1. Séparation des niveaux de données

Niveau 1 — Données personnelles

* données brutes
* santé
* stockage chiffré
* accès utilisateur uniquement

Niveau 2 — Données pseudonymisées

* usage recherche encadré
* accès limité

Niveau 3 — Données anonymisées

* agrégats uniquement
* irréversibilité pratique

⸻

1. OpenAnonymizer

15.1 Objectif

Transformation locale en données non identifiantes.

15.2 Fonctions

* suppression identifiants
* généralisation
* agrégation
* suppression données rares
* bruit statistique possible

15.3 Contraintes

* seuil k ≥ 10
* refus envoi si groupe trop petit

⸻

1. Pipeline statistique

Jail
 ↓
OpenAnonymizer
 ↓
Stats Intake API
 ↓
Statistical Mixer
 ↓
Stats Store

Règles

* aucune donnée individuelle
* suppression après agrégation
* aucune traçabilité utilisateur

⸻

1. Protection contre la ré-identification

* k-anonymity
* suppression catégories faibles
* interdiction croisements fins
* audit du risque

⸻

1. Gestion des textes libres

* interdits en sortie brute
* traitement local obligatoire

⸻

1. RGPD — Registre des traitements

Responsable

Université Clermont Auvergne (à confirmer)

Finalité

* recherche santé publique
* prévention

Données

* santé perçue
* habitudes
* environnement

Durée

à définir

Destinataires

* chercheurs habilités

⸻

1. Consentement RIPH3

* information préalable obligatoire
* non-opposition tracée
* retrait possible

⸻

1. Droits utilisateur

* accès
* suppression
* export

⸻

1. Modèle de menace

Protégé contre :

* attaquant externe
* admin malveillant
* fuite
* MITM
* ré-identification

⸻

1. Niveau de sécurité

“Sécurité très élevée par conception avec absence d’accès serveur aux données brutes utilisateur.”

⸻

1. Conclusion

ThermUSS implémente :

* chiffrement end-to-end
* isolation forte
* anonymisation locale
* agrégation statistique sécurisée

Objectif :

* confidentialité maximale
* conformité réglementaire
* exploitation scientifique sécurisée
