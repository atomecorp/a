# Rapport d'incident — iOS 1.46 (44) — 2026-11-01

Jalon A (incident iOS). **Ce n'est pas la clôture de la mission globale** : voir
`todo/rapport_global_post_R104_MAIN_2026-11-01.md` pour les 31 entrées et le design V5.

Journal de la session et preuves : `temp/ios_build44_2026-11-01/` (console native, captures, enregistrements
audio, sondes). Sauvegarde hors dépôt avant édition : `~/Documents/Sauvegarde-Claude-2026-10-31/ios-build44-incident-20261101/`
(diffs non commités, copies, `SHA256SUMS.txt`, `inventory.txt`).

## 1. Appareil et build testés (preuves)

| Élément | Valeur | Preuve |
| --- | --- | --- |
| Appareil | iPhone 17 Pro « Jeezs's phone » (iPhone18,1), iOS 27.2, UDID `00008150-000C19822140401C`, **branché en USB** (`Transport Type: wired`) | `xcrun devicectl device info details` |
| App installée | `one.atome.app` **1.46 (44)** | `xcrun devicectl device info apps` |
| Outils | Xcode 27.0 (27A266a) ; WebDriverAgent déjà installé sur l'iPhone (`one.atome.WebDriverAgentRunner.xctrunner`), relancé par `xcodebuild test-without-building` + `iproxy 8102 8100` ; console native par `devicectl … process launch --console` | `temp/ios_build44_2026-11-01/wda.log`, `console_run1.log` |
| Inspecteur Web | **indisponible** sur la 44 (Release : `FeatureFlags.webInspectorEnabled = false`) | `platforms/ios/atome-auv3/Common/FeatureFlags.swift` |

Les gestes ci-dessous sont de **vrais touchers WDA sur l'iPhone** (pas des sondes Web).

## 2. BUG-012 / BUG-013 — retour au Dashboard

### Reproduction sur l'iPhone physique (build 44)

20:13:48 toucher l'Atome → Dashboard ; 20:13:56 « Projets » → grille des projets ; **20:14:07.882 toucher
« Projet 2026-11… »** → fond seul ~2,5 s → **Dashboard** (captures `o1_1..4.png`, bande `o1_strip.png`).
Console native pendant ce temps : scènes projetées `40 → 0 → 43` (aucun record), `workspace_resume_publish`,
aucune erreur explicite hormis `QuotaExceededError` (répétée 47 fois depuis le lancement).

### Cause confirmée (sur l'appareil + chaîne de code)

1. **`localStorage` de l'app est plein.** Copie en lecture seule de
   `Library/WebKit/WebsiteData/Default/…/LocalStorage/localstorage.sqlite3` (devicectl `copy from`) :
   10 485 108 octets (≈ 5,24 M caractères UTF-16, le quota WebKit), dont `squirrel_sync_cursors_v1` 5 297 094 o
   et `squirrel_sync_streams_v1` 5 171 102 o — **66 295 flux de sync** (un UUID d'atome chacun) et leurs curseurs,
   réécrits en entier par `persistScope` (`atome/src/squirrel/apis/unified/sync_engine.js`).
2. Toute autre écriture `localStorage` lève alors `QuotaExceededError`. L'ouverture passe par
   `project_workspace_activation_runtime.js#runProjectActivation` → `api.projects.setCurrent(…, persist=true)` →
   `adole_api/session.js#setCurrentProjectCache` → `storage.js#writeStorage` → `localStorage.setItem` **sans
   try/catch** → l'activation lève → retour au Dashboard.
3. La création d'un projet vide (`ui.new_project`, « Create and open ») crée puis ouvre par la même activation :
   même rupture. Les projets « Projet 2026-11… » de la grille sont vraisemblablement les créations qui ont abouti
   avant l'échec de l'ouverture (non vérifié individuellement).
4. Pourquoi les sondes Web étaient vertes : profil neuf, quelques flux seulement. L'hypothèse précédente
   (`bevy_renderer_diff_present_timeout`) n'est pas la cause sur la 44.

### Correctif (cause racine)

- Nouvelle brique `atome/src/squirrel/apis/unified/sync_scope_store.js` : les flux et curseurs de sync sont
  gardés dans **IndexedDB**, un enregistrement par périmètre (serveur | principal). Au premier chargement, les
  périmètres encore dans `localStorage` y sont **déplacés une fois**, puis les deux clés sont libérées (l'appareil
  retrouve ses ~10 Mo de quota sans perdre ses 66 295 flux).
- `sync_engine.js` : chargement du périmètre asynchrone ; les flux observés pendant le chargement sont fusionnés ;
  **aucune écriture avant l'arrivée du périmètre stocké** (sinon il serait remplacé) ; la connexion attend le
  périmètre avant d'ouvrir la socket ; erreurs de chargement/écriture explicites (`sync_scope_load_failed`,
  `sync_scope_save_failed`) dans `error` + statut publié.
- Aucun try/catch ajouté autour de `setCurrent` : l'écriture du projet courant reste une erreur explicite si elle
  échoue ; c'est le remplissage du quota qui est supprimé.

### Tests

| Test | Type | Résultat |
| --- | --- | --- |
| `npx vitest run tests/eve/sync_engine.test.mjs` | test du dépôt, adapté (IndexedDB réel via fake-indexeddb) + nouveau test « 70 000 flux hors du quota » | **12/12** (exit 0) |
| `temp/ios_build44_2026-11-01/headcheck/quota_probe.mjs` (moteur HEAD vs corrigé, quota simulé 5 M car.) | sonde de logique | HEAD : `persist: QuotaExceededError` ; corrigé : `persist ok`, 119 car. restent en `localStorage` |
| Ouverture de projet sur iPhone avec le correctif | **essai iOS physique** | **NON TESTÉ** — installation à autoriser (voir §6) |

## 3. BUG-014 / BUG-016 — cadence du décompte et des bips

### Essai sur l'iPhone (build 44, toucher réel)

Séance « Barre au front · 12 rép. » trouvée en pause (5 sur 8, échauffement 1/2). 20:22:11.365 toucher
« Suite » → le compteur repart : 5 → 6 → 8 (captures `sport2/f1..f14.png`, bande `sport2/strip.png`), puis
**reste sur « 8 sur 8 »** pendant que le chrono avance (0:27 → 0:42) et que la durée estimée dérive
(≈ 5:21 → ≈ 5:39). Le code dit qu'une série en répétitions se termine par `confirm` (« Série terminée ») : l'arrêt
sur 8/8 est voulu ; la dérive de l'estimation en découle.

Console native : 3 lots `audio_render_clock` + `audio_schedule_instances` (tous `success=true`) et 3 paires
`audio_duck_start/stop` : les bips sont bien programmés dans Kira.

### Son réellement émis

Enregistrement au micro du MacBook pendant 40 s (`sport2/rec.wav`, spectrogramme `sport2/spec.png`, analyse
`tone_track.py`) : **aucune tonalité à 1 320 Hz ni à 880 Hz** (les bips de `training_sound.js`), seulement des
clics et du bruit. Soit l'iPhone était silencieux ou au volume bas, soit trop loin du micro.
**Cadence audible non mesurée.** Aucune conclusion « corrigée » n'est tirée pour le son.

### Défaut de code trouvé (cause probable de l'irrégularité, non mesurée sur l'appareil)

`eVe/domains/training/training_sound.js` (natif) ancrait l'horloge audio sur `clockAnchor`, qui date la trame
jouée (`played_frame_now`, lue par Rust) avec `performance.now()` **au moment où la réponse du pont natif arrive
en JS**. Le délai pont → page varie (fil principal occupé par Bevy, la sync, les erreurs de quota…) et chaque lot
de bips était placé avec un ancrage différent : des bips avancés de plus ou moins le délai, donc des intervalles
trop courts ou trop longs, et des bips rapprochés.

Correctif : la lecture est datée au **milieu de son aller-retour mesuré**, et la séance garde la lecture dont
l'aller-retour est le plus court (renouvelée après 60 s, ou si le débit ou les discontinuités changent) : tous les
bips sont placés sur une seule correspondance. Pas de minuterie JS : la précision reste au moteur audio.

| Mesure (sonde `headcheck/beep_jitter_probe.mjs`, vraie `createTrainingBeeps`, pont simulé 10–460 ms) | HEAD | corrigé |
| --- | --- | --- |
| Intervalles entre bips de répétition (attendu 2 000 ms) | 1 823 → 2 246 ms | 1 994 → 2 048 ms |
| Écart max-min | 423 ms | 54 ms |

C'est une **sonde de logique**, pas une mesure de l'appareil.

## 4. BUG-015 — outils dans un projet

**NON TESTÉ sur iOS** : aucun projet ne s'ouvre sur la 44. Il dépend de l'installation du correctif.

## 5. Tableau AVANT / APRÈS

| Bug | Web (sonde) | Simulateur | iOS physique AVANT (44) | iOS physique APRÈS | Capture sonore | Test guidé utilisateur |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-012 | vert avant (profil neuf, non représentatif) ; sonde quota corrigée verte | non utilisé (pas de WebGPU) | **FAIL** reproduit (1 essai tracé, touchers WDA) | NON TESTÉ (installation à autoriser) | — | non fait |
| BUG-013 | idem | non utilisé | non rejoué (créerait un projet réel ; même chemin de code établi) | NON TESTÉ | — | non fait |
| BUG-014/016 | sonde de cadence : 423 → 54 ms | non utilisé | compteur avance ; bips programmés (console) ; arrêt sur 8/8 voulu | NON TESTÉ | **aucun bip capté** : cadence audible non mesurée | non fait |
| BUG-015 | 18/18 (rapport précédent) | non utilisé | BLOQUÉ (aucun projet ouvert) | NON TESTÉ | — | non fait |

## 6. Ce qui bloque la validation sur l'appareil — une seule intervention utilisateur

Paquet de test **prêt et non installé** : `temp/ios_build44_2026-11-01/pkg/work/atome.app` = l'app 1.46 (44) de
l'archive (`temp/ios-adhoc.c1KgfI/Atome-1.46-44.xcarchive`, natif identique à la build installée) avec seulement
le runtime JS reconstruit depuis HEAD + les 3 fichiers corrigés, re-signé avec l'identité de développement
(le profil intégré couvre l'iPhone). Les données de l'app sont conservées par une installation au même identifiant.
Retour arrière : réinstaller l'IPA 44 (`temp/ios-adhoc.c1KgfI/export/`).

Il faut l'accord de l'utilisateur pour : (1) installer ce paquet sur l'iPhone ; (2) créer 5 projets vides de test
nommés `TEST-B44-n` (BUG-013) ; (3) monter le volume de l'iPhone et le poser près du micro du Mac pendant la
séance de Sport (mesure audible).

## 7. Git et fichiers de l'utilisateur

atome `main` c441befc2 et eVe `main` 8dfc88ed au départ (= remote). Modifications non commitées préexistantes
(version 1.46/44 : `atome/src/version.json`, `atome/version.txt`, `project.pbxproj`, `eVe/version.txt`)
sauvegardées et laissées intactes. Commits de cette session : voir le rapport global. **Aucun push, aucune
publication.** Aucune donnée de l'iPhone modifiée (copie de `localStorage` en lecture seule ; l'app a seulement
été relancée).

## 8. Demande de validation

Après l'essai sur l'appareil : autoriser le push des commits eVe puis atome et la publication d'une build Ad Hoc
1.46 (45). Rien n'est poussé ni publié sans cet accord.
