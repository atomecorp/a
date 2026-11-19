# 05 — to debug · atome/eVe

> **File active des défauts réellement constatés**. Ce fichier est initialement vide : la présente préparation ne lance aucune plateforme et ne crée aucun bug présumé. L'IA testeuse ajoute une fiche dès qu'un écart est confirmé, y compris **lisibilité, lenteur, parité, librairie et faille de sécurité**. L'IA correctrice lit et corrige. Le retest et la clôture restent indépendants.

## États

`OPEN` → `IN_PROGRESS` → `FIXED_AWAITING_RETEST` → `VERIFIED` → **ARCHIVÉ**.

`BLOCKED` et `NOT_TESTED` sont des états de test, pas des anomalies réparées. `N/A` n'est accepté qu'avec preuve d'inapplicabilité structurelle. Si un correctif échoue au retest, le ticket retourne `OPEN`.

## Politique

- Un ticket par défaut ou cause reproductible : une panne sur une plateforme peut concerner plusieurs commandes et scénarios ; lier tous les IDs impactés.
- Enregistrer l'absence d'une fonction attendue sur Web/Tauri macOS/Tauri Windows/iOS/Android/FreeBSD (si option disponible) comme **parité** ; identifier la bibliothèque, le runtime, les capacités GPU et l'adaptateur manquants.
- Les erreurs visuelles seules sont des bogues : texte coupé, contrôles cachés, panneaux masqués, libellés illisibles, geste non fluide, animation lente, zoom ou scroll cassé.
- Les failles de sécurité sont prioritaires, mais ne jamais copier un secret, une donnée médicale réelle ou un jeton dans le fichier de tickets ; preuves expurgées et accès restreint.
- Ne pas enregistrer comme bogue le refus attendu d'une autorisation médicale ou autre politique de sécurité.
- Le correcteur doit documenter la **factorisation/simplification/optimisation** menée en même temps que chaque réparation, avec performance avant/après.
- Une mise à jour de bibliothèque n'est pas justifiée par son seul âge : enregistrer advisory, compatibilité, versions résolues, résultats sur toutes les plateformes pertinentes.
- L'IA testeuse valide, retire le ticket de cette file après retest et conserve la preuve dans une archive datée ; l'IA correctrice ne supprime pas elle-même les tickets validés.

## Tickets ouverts

*Aucun ticket ouvert : campagnes non exécutées.*

## Modèle à copier au premier défaut

```yaml
id: BUG-0001
statut: OPEN
priorite: CRITIQUE | HAUTE | MOYENNE | BASSE
categorie: FONCTION | UI_LISIBILITE | UI_MASQUE | GESTE | FLUIDITE | PERFORMANCE | AUDIO_VIDEO | SECURITE | DEPENDANCE | PARITE_PLATEFORME | MCP | VOIX | PERSISTANCE
fonctions: [C0001, U0001, F001]
scenarios: [S001, X01, Q01]
version_code_et_commit: ""
plateforme: "Web | Tauri macOS | Tauri Windows | iOS | Android | FreeBSD"
appareil_os_moteur_webview: ""
canal: "souris-clavier | tactile | voix réelle | MCP direct"
donnees_test_synthetiques: ""
preconditions: ""
gestes_reproduction: ["1. ...", "2. ..."]
attendu: ""
observe: ""
impact_fonctionnel_et_visuel: ""
risque_securite_et_personnes_impactees: ""
preuve_ecran_video: "chemin vers fichier privé"
logs_expurges: ""
mesures_avant: "FPS, CPU, RAM, latence, son, GPU"
frequence: ""
proprietaire_canonique: ""
origine_du_defaut_confirmee: ""
correctif: ""
factorisation_simplification: ""
optimisation_et_mesures_apres: ""
dependances_et_versions: ""
controles_securite: ""
tests_unitaires_integration_ui: ""
regressions_cross_platform: ""
retour_ia_testeuse: ""
archive_apres_verification: ""
```

## Compte rendu par lot (à renseigner)

- Lot / Date / commit :
- Scénarios tentés :
- Fonctions réellement testées (C/U/F) :
- Parcours Web / Tauri macOS / Windows / iOS / Android / FreeBSD :
- Canaux tactile, clavier-souris, voix eVe et MCP :
- Problèmes critiques/hauts/moyens/bas :
- Temps et performances mesurés :
- Dépendances obsolètes/incompatibles/vulnérables :
- Regressions et preuves de retest :
- Ticket d'amélioration documentaire (si le catalogue était incomplet) :
