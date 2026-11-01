# Rapport global post-R-104 sur main — 2026-11-01 (soir, après l'échec de la build 1.46 (44))

Sources lues : `~/Desktop/R104_MAIN_PACKAGE_2026-11-01/` (`LISEZ_MOI.md`, `mission/00`–`05` ; le lanceur
`lancer_R104_main.sh` n'a pas été relancé, aucune fusion refaite), `todo/rapport_fusion_r104_main_2026-11-01.md`,
`todo/registre_debug_r104_2026-11-01.md` (mêmes 31 titres que `mission/03`, vérifié par `diff`),
`todo/REGISTRE_DEMANDES.md` (R-107), `temp/r104merge/design_v5/AUDIT_DESIGN_V5.md`.
Rapport du jalon iOS : `todo/rapport_incident_ios_build44.md`.

Légende des preuves : **iOS** = essai sur l'iPhone 17 Pro physique (touchers WDA, console native) ; **Web** = sonde
Chromium ; **Node** = test ou sonde de logique ; **Revue** = lecture de code ; **Son** = capture audio ;
**Guidé** = geste fait par l'utilisateur. « Statut » : CORRIGÉ-APPAREIL / CORRIGÉ-CODE (non vérifié sur appareil) /
NON REPRODUIT / ÉTUDE / À VALIDER (décision ou maquette) / BLOQUÉ.

## Commits de cette session (main, non poussés)

| Dépôt | Commit | Objet |
| --- | --- | --- |
| eVe | 552e2855 | BUG-016 : ancrage de l'horloge audio native sur l'aller-retour le plus court |
| atome | voir `git log` (sync en IndexedDB ; YouTube ordre/date ; montre E4 ; docs + gitlink eVe 552e2855) | |

## Les 32 entrées

| ID | Famille | Demande (résumé) | État avant (rapport fusion) | Preuve locale | Preuve iOS / Web / Watch | Fichiers / commit | Statut réel | Prochaine action | Validation utilisateur | Dépendances |
|---|---|---|---|---|---|---|---|---|---|---|
| REG-001 | REG | N° de série absent des réglages avancés | jamais affiché (git -S) | Revue | — | — | À VALIDER | dire quelle valeur est « le n° de série » | oui | — |
| BUG-001 | BUG | Scanner de produits | corrigé (caméra arrière) | Web 7/7 | iOS non testé ; WKWebView sans `BarcodeDetector` | eVe 83556da1 | CORRIGÉ-CODE | essai Scan sur l'iPhone | non | install. build |
| REG-002 | REG | Ajout produit par photo | non reproduit (case Photo à la racine) | Web | — | — | À VALIDER | case aussi dans catégories/recherche ? | oui (règle 16) | — |
| BUG-002 | BUG | Appui long sans menu | non reproduit Web | Web | iOS non testé | — | À VALIDER | sélection multiple = nouvelle fonction (maquette) | oui | — |
| TÂCHE-001 | TÂCHE | Corriger une mesure Santé (sommeil) | étude | Revue | — | — | ÉTUDE | maquette de saisie sommeil | oui | — |
| BUG-003 | BUG | Date de naissance en rouleaux, Rencontre | corrigé | Web 4/4 | iOS non testé | eVe fb5aa1f0, atome 668f7ead7 | CORRIGÉ-CODE | essai sur l'iPhone | non | install. build |
| BUG-004 | BUG | Poids/taille en rouleaux | conflit règle 14 | Revue | — | — | À VALIDER | arbitrer rouleau vs ligne-curseur | oui | — |
| BUG-005 | BUG | Sport impossible à arrêter après retour | cause trouvée (pas de Stop dans « En direct ») | Web 11 sondes | — | — | À VALIDER | choisir (a) ou (b) | oui | — |
| BUG-006 | BUG | Indicateur « en cours » | 2 causes corrigées, 1 à arbitrer | Web 9/9, 8/8 | iOS : outil ▶ vu sur le Dashboard (captures n1–n4) | eVe 70c845cf | CORRIGÉ-CODE + À VALIDER | case libre sous panneau ? | oui | — |
| BUG-007 | BUG | Lancement montre parfois impossible | revue | Revue + compilation montre | Watch non testée | atome (WatchSensorSession.swift, E4) | CORRIGÉ-CODE (E4) ; autres causes ouvertes | protocole montre `temp/r104merge/agents/watch/protocole_montre.md` | non | build + montre |
| BUG-008 | BUG | Arrêt impossible sur la montre | revue E1–E4 | `xcodebuild -target atomeWatch` SUCCEEDED | Watch non testée | atome (E4) | CORRIGÉ-CODE (E4) ; E1–E3 BLOQUÉS | E2 : file d'arrêts horodatés (contrat iPhone) ; E3 : geste curseur/défilement ; E1 : séance orpheline | E2/E3 : oui | build + montre |
| TÂCHE-002 | TÂCHE | Revoir l'indicateur de session | design | — | — | — | À VALIDER | maquette, liée à BUG-005 | oui | BUG-005 |
| TÂCHE-003 | TÂCHE | Maquettes Activités montre | à produire | brouillons HTML | — | — | À VALIDER | maquettes au format montre | oui | — |
| BUG-009 | BUG | Outil Web sans page | reproduit, pas régression | Web | — | — | À VALIDER | refus d'encadrement : contrôle serveur ou autre moteur | oui | TÂCHE-004 |
| TÂCHE-004 | TÂCHE | Moteur/page de départ configurable | nouvelle | Revue | — | — | ÉTUDE | préférence (`createProfilePreferenceList`) + maquette | oui | — |
| TÂCHE-005 | TÂCHE | Importer un HTML dans Web | étude | Revue | — | — | ÉTUDE | concevoir l'origine séparée | oui | — |
| TÂCHE-006 | TÂCHE | Page Web → format natif | étude | Revue | — | — | ÉTUDE | récupération serveur à concevoir | oui | — |
| TÂCHE-007 | TÂCHE | Vidéos : date de publication, plus récents d'abord | nouvelle | **Node 5/5** (`tests/server/ws_youtube_search.test.mjs`) | prod. non déployée | atome (`server/ws_youtube_search.js` : `order` date/relevance, `publishedAt`) | PARTIEL : serveur fait ; affichage de la date et choix du tri = À VALIDER | maquette de la date sur fiche/ligne ; déploiement autorisé | oui | TÂCHE-008 |
| TÂCHE-008 | TÂCHE | Tri date/alpha réutilisable | nouvelle | Revue | — | — | ÉTUDE | partager `FINDER_SORTS` | oui (UI) | — |
| TÂCHE-009 | TÂCHE | Loupe → deux dalles | design | — | — | — | À VALIDER | maquette | oui | — |
| TÂCHE-010 | TÂCHE | Vidéo : clic contrôles, double clic plein écran | interaction | Revue | — | — | À VALIDER | confirmer l'inversion | oui | — |
| TÂCHE-011 | TÂCHE | Timeline sous les outils | mise en page | Revue | — | — | À VALIDER | maquette | oui | — |
| TÂCHE-012 | TÂCHE | Transparence/flou des surcouches | style | Revue | — | — | À VALIDER | maquette verre (risque découpe média) | oui | — |
| BUG-010 | BUG | 6 outils sur une ligne | régression confirmée | Web 402/430 | — | — | À VALIDER | options (1)(2)(3) | oui | — |
| BUG-011 | BUG | Retouche : panneau vide | comportement de la règle 18 | Web | — | — | À VALIDER | Images allumé par l'appelant ? | oui | — |
| TÂCHE-013 | TÂCHE | Capture : grand aperçu + Liste | design | — | — | — | À VALIDER | maquette | oui | — |
| TÂCHE-014 | TÂCHE | Capture : bande sur une ligne | design | — | — | — | À VALIDER | maquette | oui | BUG-010 |
| BUG-012 | BUG | Ouverture projet → Dashboard | « corrigé (rendu) », réfuté par la 44 | **Node 12/12** + sonde quota | **iOS : FAIL reproduit (44)** ; cause lue sur l'appareil (`localStorage` 10,49 Mo) ; correctif non installé | atome (sync en IndexedDB) | CORRIGÉ-CODE (cause établie sur l'appareil) | installer le paquet de test, 5 ouvertures | oui (installation) | — |
| BUG-013 | BUG | Créer › Projet vide → Dashboard | même cause supposée | Revue (même chemin) | iOS non rejoué (créerait des projets réels) | atome (idem) | CORRIGÉ-CODE | 5 créations `TEST-B44-n` après accord | oui (données de test) | BUG-012 |
| BUG-014 | BUG | Le décompte ne démarre plus | non reproduit Web | — | iOS : démarre sur la 44 ; compteur avance ; arrêt sur 8/8 voulu (`confirm`) | — | NON REPRODUIT sur la 44 (évolue en BUG-016) | — | non | — |
| BUG-015 | BUG | Outils dans un projet | 18/18 Web | Web | **iOS BLOQUÉ** (aucun projet ne s'ouvre sur la 44) | — | BLOQUÉ | rejouer après installation | oui (installation) | BUG-012 |
| **BUG-016** | BUG (nouveau) | Cadence irrégulière décompte et bips (44) | — | **Node** : écart 423 → 54 ms | iOS : bips programmés (console) ; **Son : aucun bip capté** → cadence audible non mesurée | eVe 552e2855 | CORRIGÉ-CODE | mesure audio après installation (volume, micro près) | oui (installation, volume) | — |

## Design V5 (jalon C)

Audit complet déjà produit et relu : `temp/r104merge/design_v5/AUDIT_DESIGN_V5.md` (inventaire élément V5 →
composant réel → état → décision, captures réelles et références, maquette aux vrais jetons
`mockups/m1_tuiles_v5.png`). Constat inchangé ce soir : unité 60/120, disque + glyphe, pli au même rayon, opacité et
flou en constantes de thème sont **déjà conformes** ; les commandes de démo, modes 01–12, Finder simulé et Preview
fictif sont **exclus** ; tout le reste modifie un design validé ou la charte (règle 16) et attend **D1–D6** :
D1 libellé des tuiles 120 (centré ou en haut à gauche avec trait rose), D2 surface (verre teinté par rubrique ou
dégradé commun), D3 libellé des outils 60 (12 ou 9 px), D4 rayon d'un outil 60 (6 ou 12 px, règle 14), D5 heure/météo
(en-tête ou tuiles), D6 iPhone Duo (aucun appareil ni API dans le dépôt : bloqué). **Rien de V5 n'est codé.**

## Récapitulatif mesurable

- Entrées : **32** (31 du registre + BUG-016). Aucune perdue : les 31 titres de `mission/03` sont identiques à ceux
  du registre (`diff` vide), BUG-016 est ajouté à la fin sans rien effacer.
- Corrigées en code et testées (Node/Web) : BUG-001, BUG-003, BUG-006 (2 causes), BUG-007/008 (E4), BUG-012, BUG-013,
  BUG-016, TÂCHE-007 (serveur) → **8 entrées touchées**, **0 vérifiée sur appareil**.
- Reproduite sur l'iPhone physique : **BUG-012** (FAIL, cause établie sur l'appareil).
- Non reproduite : BUG-014 (sur la 44), REG-001, REG-002, BUG-002 (Web).
- À valider (décision, maquette ou arbitrage de la charte) : REG-001, REG-002, BUG-002, BUG-004, BUG-005, BUG-006 (cause 2),
  BUG-009, BUG-010, BUG-011, TÂCHE-002, 003, 007 (affichage), 009, 010, 011, 012, 013, 014, V5 D1–D6.
- Études : TÂCHE-001, 004, 005, 006, 008.
- Bloquées : BUG-015 (installation), BUG-008 E1–E3 (montre et conception), V5 D6.
- Par plateforme : iOS physique 1 reproduction + 1 séance Sport tracée ; Web : pas de nouvel essai ce soir ;
  Watch : compilation seulement ; Tauri/Android : non testés.

## Tests lancés ce soir

| Commande | Code | Résultat |
| --- | --- | --- |
| `npx vitest run tests/eve/sync_engine.test.mjs …sync_environment …home_versions …bevy_panel_home_lifecycle tests/server/sync_architecture_contract.test.mjs` | 1 | 34/35 ; l'échec (`iOS authenticates and subscribes…`) lit par expression régulière `FastifySyncClient.swift`, non modifié : antérieur à cette session |
| `npx vitest run tests/eve/sync_engine.test.mjs` | 0 | 12/12 |
| `node --test tests/server/ws_youtube_search.test.mjs` | 0 | 5/5 |
| `node temp/ios_build44_2026-11-01/headcheck/quota_probe.mjs` (HEAD / corrigé) | 0 | HEAD `QuotaExceededError` ; corrigé ok |
| `node temp/ios_build44_2026-11-01/headcheck/beep_jitter_probe.mjs` (HEAD / corrigé) | 0 | 1 823–2 246 ms → 1 994–2 048 ms |
| `xcodebuild -target atomeWatch -sdk watchos CODE_SIGNING_ALLOWED=NO` | 0 | BUILD SUCCEEDED |
| `node platforms/ios/package_ios_runtime.mjs` (paquet de test) | 0 | 1 999 fichiers, signé, non installé |

## Reprise

1. Accord de l'utilisateur → `xcrun devicectl device install app --device 00008150-000C19822140401C temp/ios_build44_2026-11-01/pkg/work/atome.app`,
   relance avec console (`devicectl … process launch --console`), touchers WDA (`temp/ios_build44_2026-11-01/w.sh`) :
   5 ouvertures (BUG-012), 5 créations `TEST-B44-n` (BUG-013), outils du projet (BUG-015), séance Sport enregistrée au
   micro (BUG-016). Retour arrière : IPA 44 de `temp/ios-adhoc.c1KgfI/export/`.
2. Décisions de R-107 et V5 D1–D6.
3. Après preuves sur l'appareil : push eVe puis atome, build Ad Hoc 1.46 (45), déploiement serveur pour TÂCHE-007 —
   chacun sur accord explicite.
