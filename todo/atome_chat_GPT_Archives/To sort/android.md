# Codex — atome/eVe : diffusion Android de test via Google Play (équivalent de TestFlight)

**Date :** 12 octobre 2026  
**Destination du présent document :** Bibliothèque ChatGPT, `/android.md` (racine).  
**Nature :** prompt opérationnel à transmettre à Codex, **non exécuté**.  
**Dépôt cible :** `atomecorp/a`, avec son sous-module `eVe`.

---

## 0. Mission et résultat exigé

Implémente **la distribution de la véritable application atome/eVe sur Android à travers le canal « Tests internes » de Google Play**, à l'image de la distribution de l'application iOS via TestFlight. Le nom du produit est **eVe** (e minuscule, V majuscule, e minuscule) ; le framework **atome** s'écrit entièrement en minuscules. Ne jamais utiliser « Atom F », « Eve » ou « Atome » comme nom canonique.

**Résultat utilisateur souhaité :**

1. Le développeur accomplit **une seule fois** les démarches Google qu'une API ne peut pas effectuer (compte développeur, application Play Console, Play App Signing, première mise en ligne et liste des testeurs, autorisations du compte de service).
2. Ensuite, **une seule commande depuis la racine du dépôt** construit la vraie application Android, vérifie sa signature et sa compatibilité, attribue une version valide et téléverse une **AAB release** sur le **canal Google Play « internal »**.
3. Les testeurs autorisés installent eVe à partir du **Play Store avec un lien d'inscription au test** ; les versions suivantes leur sont proposées via les mises à jour normales de Google Play.
4. Chaque opération est diagnostiquée, traçable, idempotente autant que le permet l'API et explicite en cas de blocage. **Aucune publication en production** n'est permise par cette commande.

Le canal **Google Play Tests internes** est la voie principale (jusqu'à 100 testeurs, distribution par le Play Store). Ne pas le confondre avec le **Partage interne d'application** (Internal App Sharing) : ce dernier accepte des APK/AAB et donne des liens ponctuels valables 60 jours, limités à 100 téléchargements par lien ; il peut servir à un diagnostic rapide, mais **ne doit pas devenir la voie canonique de mises à jour type TestFlight**. Firebase App Distribution est une solution tierce facultative, pas nécessaire ici.

L'objet du travail est **l'outillage de publication privée**, pas une réécriture du runtime Android ni un nouveau mode d'interface eVe.

---

## 1. Relecture obligatoire du projet et constat de départ

Avant toute modification, lire entièrement les instructions actives `AGENTS.md`, `.codex/modules/07-future-code-guardrails.md` et les modules déclenchés 01 à 06. Respecter leur ordre de priorité, leur exigence de réutilisation, les preuves de tests, les contraintes de sécurité et leur procédure d'autorisation pour une brique indispensable manquante. Lire les propriétaires et documents suivants **dans l'état réel du checkout**, puis confirmer les écarts avec GitHub et la branche de travail :

- `todo/android.md` — historique documenté des builds Android, réparations, crashes, WebGPU, certificats et pistes à tester.
- `scripts/android/apk.sh` — **propriétaire canonique unique** de la chaîne JDK / SDK / NDK / Rust / Tauri, des APK/AAB, de leur signature et des émulateurs.
- `scripts/setup/service_commands.sh`, `run.sh` — commande d'entrée et dispatch.
- `platforms/desktop-tauri/tauri.conf.json`, `tauri.android.conf.json`.
- `platforms/desktop-tauri/gen/android/app/build.gradle.kts` et configurations Gradle/manifestes existantes.
- `platforms/desktop-tauri/build.rs`, `src/android_assets.rs`, `src/lib.rs` pour les particularités natives et le lancement.
- `platforms/ios/atome-auv3/README.md` et `scripts/XCode_testflight_generator` pour s'inspirer du **parcours de release** iOS, sans modifier iOS.
- `README.md`, `maps/CODEMAP.md`, `maps/ARCHITECTURE_MAP.md`, `eVe/documentations/FRAMEWORK_STATE.md`, fichiers de tests et règles Git.

**Constats observés dans le dépôt GitHub au 12/10/2026 ; à revérifier localement :**

- La compilation Android existe déjà : `./run.sh apk` (debug), `./run.sh apk --prod` (APK release signé), `./run.sh apk --prod --aab` (construction AAB prévue par le script).
- Les outils disponibles comprennent `--doctor`, `--dry-run`, `--install`, `--device` et `--emulator`.
- Le projet Android utilise Tauri 2 et le code Android actuel définit `minSdk 29`, `targetSdk 36`.
- L'identifiant **release** déclaré est `com.squirrel.desktop` ; `com.squirrel.desktop.debug` ne concerne que le debug. L'étiquette visible de l'application est actuellement `atome`. **Ne modifier aucun identifiant ou nom sans étude de migration et autorisation explicite**.
- Le keystore release existant se trouve historiquement sous `~/.atome/android/squirrel-release.jks`, avec `~/.atome/android/keystore.properties`. La signature a déjà été vérifiée lors de builds APK antérieurs.
- `tauri.android.conf.json` comporte `bundle.android.versionCode: 1` ; le Gradle Android prend `versionCode`/`versionName` dans `tauri.properties`, avec valeurs par défaut. **La version d'une diffusion Play doit être gérée automatiquement et ne pas rester figée à 1**.
- La documentation historique signale un APK release d'environ **229 Mo** et un APK debug d'environ **505 Mo**. Les chiffres ne constituent **pas** une mesure de l'AAB actuelle ni de la taille téléchargée depuis Google Play.
- La documentation signale des difficultés de WebGPU/Bevy sur **émulateur Android** ; un échec GPU sur AVD ne prouve pas l'échec sur un téléphone réel. Ne pas déclarer la cible Android validée sans test physique.
- Le chemin AAB et surtout le **téléversement Google Play** n'ont **pas été validés de bout en bout** dans les preuves consultées. Ne pas confondre « le script contient l'option » avec « le flux Play a réussi ».

Ne **recrée pas** `apk.sh`, ne lance pas une deuxième chaîne de build via Gradle, Fastlane, un template Flutter/React, Android Studio ou un script concurrent. Commence par un audit de réutilisation avec preuves. Si une brique indispensable manque, conformément à `AGENTS.md`, nomme précisément la brique à créer/étendre et demande l'autorisation circonscrite correspondante avant son implémentation.

---

## 2. Choix de distribution et format

### Canal principal : Google Play Console → Tester et publier → Tests → Tests internes

- Distribution **privée**, uniquement aux comptes Google de la liste de testeurs (maximum 100).
- Publication d'un **Android App Bundle signé (`.aab`) en configuration release** ; Google Play génère les APK optimisés nécessaires aux appareils.
- Activation volontaire des testeurs à l'aide du **lien d'inscription** obtenu dans la Play Console, puis installation depuis Google Play.
- Mises à jour par Google Play sur le même package et la même identité de signature Play.
- Le test interne ne rend pas l'application publiquement disponible en production. Certains contrôles et délais Google restent possibles.

### Ne pas confondre les trois canaux

| Canal | Usage | Mode de distribution | À retenir |
|---|---|---|---|
| **Google Play Tests internes** | **Cible principale** | AAB release, testeurs autorisés, lien d'inscription, Play Store | Versionnage et mises à jour de test |
| Google Play Partage interne d'application | Dépannage / envoi ponctuel | APK ou AAB, lien temporaire | Limites et signature distinctes, pas le flux cible |
| Google Play Production | Diffusion publique | Publication production | **Hors périmètre ; ne jamais déclencher** |

Respecter les limites **en vigueur au moment du build**, vérifiées sur les pages officielles Google. Ne pas figer artificiellement une ancienne limite générique « AAB 200 Mo » : Google distingue taille de téléchargement compressée, modules, asset packs et limites actuelles. Mesurer la taille avec les outils appropriés et faire vérifier l'AAB par Google Play.

---

## 3. Commande utilisateur cible

**Proposition d'extension du point d'entrée existant**, à confirmer dans le code et dans les règles de dispatch avant modification :

```bash
./run.sh apk --play-internal --dry-run     # prévisualise et valide sans construire ni téléverser
./run.sh apk --play-internal               # construit, valide, signe et envoie l'AAB vers Google Play Internal Testing
```

`--play-internal` doit utiliser **exactement** la voie de build `--prod --aab` déjà existante, sans double build et sans changer le sens historique de `./run.sh apk`, `--test`, `--dev`, `--prod`, `--install` ou `--emulator`.

Sémantique requise :
- `--play-internal` choisit **uniquement** la piste API Google `internal`, jamais `production`, `beta`, `alpha` ou une piste fermée.
- Interdire et expliquer les combinaisons incompatibles avec `--dev`, `--test`, `--emulator`, `--install`, ou les APK debug.
- `--dry-run` n'écrit pas de version, ne génère aucune clé, ne construit rien, ne téléverse rien et ne crée aucune édition Google ; il peut effectuer les lectures/diagnostics autorisés. Si des requêtes réseau sont nécessaires, les distinguer des opérations locales.
- Le build et son transfert ne commencent que sur **appel explicite** de la commande, jamais à l'ouverture du projet, ni sur chaque commit sans consentement de l'utilisateur.
- Une erreur à l'étape de test, signature, version, autorisation Google ou compatibilité doit empêcher la mise en ligne.
- Fournir `--help` cohérent et un résultat final lisible : statut, app ID, canal, nom/version/versionCode, AAB envoyée, empreinte SHA-256, edit ID, résultat de commit, état Google connu, chemin des journaux et éventuelles actions manuelles.

Si le dispatch canonique impose un autre nom de flag ou une sous-commande, garder une **seule** entrée propriétaire, documenter l'arbitrage et éviter d'inventer une seconde architecture d'outillage.

---

## 4. Préparation Google Play — intervention humaine initiale et unique autant que possible

Créer un document `atome/documentations/android_play_internal_distribution.md` qui accompagne le développeur **clic par clic**, en français, avec les intitulés de menus à vérifier sur l'interface actuelle. Il doit indiquer que **Codex n'a pas le droit de prétendre avoir effectué des démarches sur le compte Google**.

### 4.1 Compte Google Play Console

L'utilisateur doit :
1. Disposer d'un compte développeur **Google Play Console** opérationnel : https://play.google.com/console/
2. Terminer l'enregistrement, l'éventuel paiement de création de compte et les vérifications d'identité/coordonnées éventuellement demandées.
3. Créer une nouvelle application **atome/eVe** dans la console si elle n'existe pas déjà, ou sélectionner l'application exacte si elle existe.
4. Vérifier le **package name définitif** associé à l'application. Le dépôt actuel propose `com.squirrel.desktop` : **ne pas le remplacer automatiquement**, et signaler qu'un changement d'ID après création/publication correspond à une autre application et peut casser les mises à jour.
5. Choisir langue, statut, catégorie et compléter les seules informations requises pour la piste de test ; expliquer explicitement celles que Google permet de différer et celles qui sont bloquantes. Ne rien remplir avec du contenu ou des données personnelles inventés.

**Première mise en ligne via l'interface Play Console** : la documentation Google Play Developer API indique qu'il faut au préalable une application existante avec au moins un premier artefact importé dans la console. La marche à suivre doit donc inclure une **première AAB valide importée manuellement** et la création du canal « Tests internes », puis la configuration de l'API pour les versions suivantes. Ne pas contourner cette étape avec une automatisation fictive.

### 4.2 Play App Signing et keystore

- Vérifier le **Play App Signing** et l'activer suivant les instructions actuelles Google, obligatoire pour les AAB diffusées via Play.
- Distinguer **clé de signature de l'application** (Google Play signe les APK livrés) et **clé d'importation/upload key** (signe l'AAB qui est transmise à Google).
- **Réutiliser le keystore release historique** si son identité/empreinte est celle attendue par Google ; ne jamais en générer un deuxième par accident. Contrôler physiquement la présence de `~/.atome/android/squirrel-release.jks`, `keystore.properties`, son alias `squirrel`, et vérifier le certificat sans imprimer les mots de passe.
- **Blocage obligatoire :** si Play est déjà configuré et que le keystore est absent, corrompu ou différent de la clé d'importation enregistrée, **STOP** et diagnostic précis. Ne pas se reposer sur la création automatique d'un keystore neuf que permet le script APK existant pour une toute première installation.
- Si l'application n'a **jamais** été enregistrée auprès de Google et qu'aucune clé de release n'existe, proposer une **création initiale explicitement autorisée**, avec sauvegarde chiffrée hors Git.
- Fournir les empreintes SHA-256/SHA-1 utiles des certificats d'upload et de signature Play (l'empreinte Play doit être relevée dans la Play Console). Signaler la nécessité éventuelle de déclarer l'empreinte Play auprès des fournisseurs Google/OAuth, des services qui épinglent le certificat et des intégrations mobiles si c'est applicable au code réel.
- Aucune clé `.jks`, `keystore.properties`, service-account JSON, secret JWT ou mot de passe ne doit être inscrit dans Git, un journal, une issue GitHub, le prompt ou la conversation ChatGPT.

### 4.3 Testeurs

- Dans Play Console → Tests internes → Testeurs, créer/sélectionner une liste d'adresses Google autorisées.
- Ajouter d'abord le développeur et un ou deux appareils/testeurs réels. Le compte utilisé sur le téléphone doit correspondre au compte invité.
- Enregistrer et récupérer le **lien d'inscription / opt-in** officiel, puis l'envoyer aux testeurs par le canal habituel.
- Décrire l'installation : ouvrir le lien avec le compte invité, accepter le test, ouvrir la fiche Play Store, installer la version, puis recevoir les mises à jour suivantes du même canal (éventuellement avec délai).
- La gestion des testeurs et du lien est **manuelle initialement** : ne pas inventer d'API de gestion des emails de testeurs si elle n'est pas disponible.

### 4.4 Compte de service pour l'automatisation

Après la première AAB manuelle :
1. Créer ou sélectionner un projet dans **Google Cloud Console** ; vérifier qu'il appartient bien à l'utilisateur.
2. Activer **Google Play Developer API (Android Publisher)** pour ce projet.
3. Créer un **service account** dédié à la distribution **de cette seule application**, dans Google Cloud.
4. Dans Play Console → **Utilisateurs et autorisations**, inviter l'email du service account et attribuer les permissions **minimales nécessaires** pour téléverser et publier une release sur le canal de test interne de cette application. **Ne pas donner les droits de production** si ceux-ci peuvent être séparés et limiter l'accès à l'application concernée.
5. Privilégier les identifiants à durée courte / Workload Identity Federation lorsque l'environnement d'exécution le permet ; sinon, utiliser un fichier JSON de service account protégé, **hors dépôt**, par exemple `~/.atome/google-play/service-account.json` avec permissions restreintes, en expliquant les risques et la rotation.
6. Expliquer **précisément** quelles informations non secrètes l'utilisateur devra fournir au script : ID de l'application/package, existence de la piste `internal`, état de la première importation, méthode d'authentification choisie, emplacement local du fichier de credentials, et droits octroyés.
7. Tester une requête API en **lecture seule**, sans déployer de nouvelle version ; signaler une erreur de permissions claire et les droits à corriger.

**Important :** Ne jamais demander au développeur de coller dans Codex/ChatGPT le JSON d'identité, une clé privée, son mot de passe, ses codes SMS, les codes 2FA ou le mot de passe de la keystore. Codex doit lire un chemin sécurisé sur la machine autorisée, sans afficher son contenu.

---

## 5. Publication automatisée via Google Play Developer Publishing API

Implémenter une petite couche de publication **strictement rattachée au propriétaire Android actuel**, avec du JavaScript Node.js pour l'orchestration/API si nécessaire (pas de Python/TypeScript, et pas de logique en double du shell existant). Réutiliser en priorité les composants auth/HTTP/outillage internes **réellement disponibles** après audit ; ne pas ajouter de dépendance externe sans l'autorisation requise par `AGENTS.md`.

### Séquence transactionnelle

1. **Préflight** : validations repository, versions Tauri/Rust/SDK, identité release, signataire et config Play ; vérification des secrets **sans les afficher** ; existence du canal `internal` et première initialisation du compte.
2. **Versionnement monotone** : voir section 6 ; résoudre le prochain `versionCode` admissible avant le build et enregistrer le plan.
3. **Build** : invoquer **une seule fois** `./run.sh apk --prod --aab` **à travers** le dispatch canonique, ou l'étape canonique interne sans récursion de commande ; récupérer le **chemin exact** du bundle produit, jamais un `.aab` ancien trouvé au hasard.
4. **Validation** : `bundletool validate` ou vérification équivalente adaptée à l'AAB ; signature AAB via `jarsigner`/les outils appropriés (**ne pas utiliser `apksigner` pour vérifier un `.aab`**, réservé aux APK) ; identifier package, code, nom de version, SDK, ABI, certificat, checksum, et vérifier le runtime natif `libc.so` + `libc++_shared.so` et les fichiers effectivement empaquetés.
5. **Tester le bundle en local** sur un appareil quand disponible : `bundletool build-apks` puis `install-apks` (éventuellement une voie non destructive dédiée) ; la validation d'un APK seul ne remplace pas ce contrôle. Ne pas réinstaller ni effacer un appareil sans autorisation.
6. **Créer une édition Google Play** via `edits.insert` pour le `packageName` release exact.
7. **Téléverser l'AAB** via `edits.bundles.upload` avec le délai de téléversement adapté à sa taille ; vérifier le `versionCode` renvoyé.
8. **Mettre à jour `internal` uniquement** via `edits.tracks.update`, avec une release du nouveau `versionCode`, notes de version si fournies, et un statut compatible avec le canal (par exemple `completed` pour la mise à disposition directe des testeurs, à confirmer contre l'API actuelle).
9. **Valider l'édition** (`edits.validate`) lorsque disponible, puis **committer** (`edits.commit`) avec une politique prudente si une autre révision/review est en cours (éviter d'annuler involontairement une révision : utiliser le comportement Google `ERROR_IF_IN_REVIEW` lorsque pertinent).
10. **Vérification après commit** : réinterroger la piste et son historique après un délai raisonnable, distinguer `upload réussi`, `commit réussi` et `version effectivement accessible aux testeurs`. Ne jamais présenter « disponible » sans retour Google et, idéalement, vérification sur Play Store côté testeur.
11. **Rapport final** enregistré sous `temp/` : package, track, versionName/versionCode, AAB et son SHA-256, statut de chaque étape, identifiants non secrets, réponses API utiles avec masquage, erreurs, action manuelle éventuelle.

**Authentification** : utiliser OAuth 2.0 avec la portée officielle `https://www.googleapis.com/auth/androidpublisher`. L'authentification serveur-à-serveur doit suivre la documentation Google. Les codes d'accès/tokens restent hors de la sortie standard et des rapports partagés.

**Robustesse** : délais et reprise sur quota/429/5xx, gestion des éditions invalidées/concurrentes, pas de répétition aveugle d'un téléversement consommant un `versionCode`, pas d'upgrade automatique de la piste `internal` vers `production`. Signaler les vérifications humaines de la console qui ne sont pas automatisables.

---

## 6. Gestion de versions, mise à jour des testeurs et identité d'application

Concevoir un **ledger de release Android vérifiable** en réutilisant les sources de version du framework, sans créer un registre produit concurrent. Vérifier la source autoritaire actuelle (`atome/version.txt`, `tauri.conf.json`, `tauri.properties`, configuration Android existante) et l'historique distant Play.

### Règles impératives

- `versionCode` est un **entier unique et strictement supérieur** aux codes précédemment chargés pour cette application. Ne pas laisser la valeur actuelle `1` bloquer la seconde release.
- `versionName` est la version affichée ; rester cohérent avec le versionnement atome/eVe existant sans imposer artificiellement l'incrément automatique de la version fonctionnelle du framework à chaque build de test.
- L'application Play et ses mises à jour doivent garder **le même package release** (`com.squirrel.desktop`, sauf choix explicite préalable à la toute première publication) et la même identité Play App Signing.
- Si une AAB a été téléversée mais que `commit` a échoué, rechercher la vérité distante avant de décider du code de reprise ; ne pas réutiliser aveuglément un code de version déjà consommé.
- Ne marquer une release **publiée sur le canal interne** qu'après confirmation de l'opération Play ; fournir une stratégie idempotente pour les commandes réexécutées.
- Lors d'une mise à jour, vérifier que les données locales, projets, médias, préférences, sessions, messages et cache autorisé ne sont **pas effacés** et que l'identité/signature reste compatible avec une mise à jour en place.
- **Aucune suppression/réinstallation silencieuse** sur les téléphones des testeurs ; ce serait contraire au but des mises à jour de Play.

Documenter le choix entre une version automatique de test (build/code incrémental) et une version marketing atome/eVe, ainsi que l'enregistrement des changements de fichier sans `git add/commit/push` (les opérations Git restent du ressort de l'utilisateur selon les règles du dépôt).

---

## 7. Vérifications techniques et fonctionnelles Android

Les tests et journaux existants du projet sont prioritaires : les lire et les réutiliser, sans fabriquer des preuves. Exécuter ce qui est possible dans l'environnement autorisé, en séparant précisément **tests statiques, compilation, émulateur, appareil physique et téléchargement Play**.

### Requis avant le premier upload

1. `./run.sh apk --doctor` et `--dry-run` : diagnostic réussi, pas de mutation lors du dry-run.
2. `./run.sh apk --prod --aab` : **AAB réellement générée et signée**, avec contrôle d'empreinte, code de version, minSdk/targetSdk, package, ABI et intégrité des modules.
3. `bundletool validate`, puis `bundletool build-apks` et test d'installation si le matériel est connecté.
4. Validation des dépendances natives : éviter les régressions historiques `__cxa_pure_virtual` (absence de `libc++_shared.so`) et `SIGSEGV getauxval` (liaison libc statique au lieu de `libc.so`).
5. Vérifier le contenu embarqué, la configuration Axum en loopback et son `network_security_config`, le temps réel de lancement et l'absence de chargement des fichiers de la machine de développement.
6. Vérifier sur téléphone **Android réel** l'accès à WebGPU/Bevy dans la WebView (pas seulement l'émulateur), l'absence de `No available adapters`, le premier rendu, la réaction aux gestes tactiles et le niveau de fluidité.
7. Vérifier les permissions réseau, microphone/STT, captation et lecture audio/vidéo, selon les modules **réellement pris en charge par Android** ; consigner explicitement ceux qui ne le sont pas.
8. Vérifier les modes utilisateur et principales fonctions eVe : accueil, connexion, sélection/projet, outils réels, Finder, Dashboard, éventuellement télévision/médias si ces fonctions existent et sont accessibles sur Android.
9. Vérifier création/récupération de session, navigation en arrière-plan, fermeture/réouverture, et **mise à jour Google Play N → N+1 sans perte de données ni reconnexion injustifiée**.
10. Vérifier téléchargement **via le lien Play Store de test interne** avec un compte testeur inscrit (distinct d'un `adb install` manuel) et confirmation de mise à jour depuis le Play Store.
11. Collecter `logcat`, diagnostics Rust/JS/Bevy, empreintes, observations visuelles sur appareil et fichiers utiles **dans `temp/`**, en éliminant toute donnée privée, token ou identifiant de session du rapport final.
12. Valider les tests du dépôt exigés par `AGENTS.md` et vérifier l'absence de régressions iOS/macOS/Web.

Une AAB produite n'est **pas** une AAB testée dans Play ; un upload accepté n'est **pas** la preuve que les testeurs peuvent l'installer ; un lancement d'émulateur sans erreur native n'est **pas** la preuve que Bevy/WebGPU fonctionne sur un téléphone réel. Rapporter ces statuts séparément.

---

## 8. Automatismes de CI : seconde étape, jamais une dépendance obligatoire

Après réussite **réelle** de la publication manuelle initiale et de la commande locale `--play-internal`, prévoir une solution d'intégration continue **sur déclenchement explicite**, pas de publication à chaque commit sans accord.

Étudier l'existant `.github/workflows`, les scripts du projet, les runners autorisés, la disponibilité JDK/SDK/NDK/Rust et les coûts/temps de compilation. Si GitHub Actions est choisi et autorisé :
- privilégier un `workflow_dispatch` manuel intitulé clairement « Android — Play internal » ;
- utiliser la **même** commande canonique que le poste local et vérifier les artefacts qui en résultent ;
- stocker les identifiants via secrets GitHub ou authentification fédérée à durée courte, **pas** dans un fichier versionné ;
- ne donner au compte technique que les permissions de piste interne nécessaires, si séparables ;
- configurer mises en cache Gradle/Cargo/SDK sans effacer les données d'autres jobs ;
- limiter les exécutions simultanées d'une même release ; définir un seuil de coût/durée et un compte rendu des étapes ;
- empêcher explicitement que cette CI puisse déclencher la piste production ;
- ne pas envoyer de secrets dans les logs/artifacts et ne jamais prétendre qu'un workflow a été exécuté s'il ne l'a pas été.

**Option par défaut après configuration :** le développeur tape `./run.sh apk --play-internal`, sans ouvrir Android Studio ni téléverser à la main à chaque fois. La CI reste une amélioration facultative, pas un détour imposé.

---

## 9. Ce que Codex doit demander à l'utilisateur, et à quel moment

Réduire les interruptions au strict indispensable. **Ne poser une question que si la réponse est bloquante et impossible à détecter**. Regrouper toutes les interventions initiales dans une liste finale courte, adaptée à ce qui manque réellement :

- « Avez-vous déjà un compte développeur Play Console utilisable et une application créée ? »
- « L'application Android sur Google Play est-elle déjà associée à `com.squirrel.desktop` ou faut-il arrêter avant le premier choix irréversible de l'identifiant ? »
- « La première AAB a-t-elle déjà été mise en ligne manuellement et Play App Signing configuré ? »
- « Avez-vous invité le compte de service limité à la piste interne et configuré son moyen d'authentification sur la machine ? »
- « Où se trouve le fichier d'identifiants Google **sur votre machine** ? Donnez uniquement le chemin (ou utilisez une variable d'environnement), jamais la clé elle-même. »

Si des informations sont manquantes, **terminer tout le travail de code/test indépendant possible**, puis signaler précisément les blocages et les clics/valeurs non secrets nécessaires. Ne pas effectuer en douce une création de compte Google, un abonnement, une rotation de clé, une modification d'autorisations ni une publication publique.

**Aucune demande de secret dans le chat.** Les données d'identité personnelles, les justificatifs, les moyens de paiement, les vérifications Google, la confirmation d'utilisation d'une nouvelle clé doivent être effectués par le propriétaire dans les interfaces sécurisées.

---

## 10. Livrables attendus et critères de réussite

### Livrables

- L'extension minimum viable de la commande Android existante (ou la structure canonique équivalente constatée à l'audit) avec support de la diffusion Google Play **`internal` uniquement**.
- Le module de publication API JS minimal et réutilisable, si nécessaire, sans nouvelle pile ni duplication de l'architecture.
- Un mécanisme de versionnement monotone fiable, sans modifier le nom du framework ou l'ID d'application à l'insu de l'utilisateur.
- Des vérifications pour le format, la signature AAB, le certificat d'importation, les ABI, et le résultat du Play Developer API.
- Des tests automatisés pertinents, y compris refus de piste autre que `internal`, secret absent, mauvais signataire, code déjà utilisé, mauvaise permission, upload interrompu, concurrence/rollback, `dry-run` non mutateur et rejouabilité.
- Le guide `atome/documentations/android_play_internal_distribution.md` décrivant les **clics manuels initiaux**, le lien testeur, les étapes de dépannage, les commandes de mise à jour et les options CI.
- Documentation README, `todo/android.md`, cartes de propriétaires et état du framework **mis à jour uniquement pour les changements réellement exécutés**, avec mention explicite `To verify` pour le reste.
- Un rapport final : fichiers modifiés, vérifications effectuées, sorties utiles, limites et instructions exactes à l'utilisateur pour débloquer Google si nécessaire.

### Critères finaux stricts

**Réussite complète** = un développeur avec une configuration Google déjà initialisée lance une commande, le programme produit une nouvelle AAB signée, l'envoie avec un `versionCode` inédit à la piste **interne** et Google confirme la modification ; un testeur autorisé installe puis met à jour eVe depuis le Play Store sans perdre son état. Toute étape non prouvée reste non validée.

**Interdits :**
- Pas de publication publique, pas d'accès production, pas de suppression ou réinstallation forcée de l'application utilisateur.
- Pas de changement de package, icône, UI ou architecture du produit sans lien indispensable et autorisation.
- Pas de régénération silencieuse de keystore, pas de secret dans Git/CI logs.
- Pas d'outil de build Android parallèle, pas de réimplémentation des vrais outils eVe, pas de réécriture en Python/TypeScript.
- Pas de `git add`, `commit`, `push`, changement de branche ou écrasement de travail local par l'agent.
- Pas de déclaration « publié », « testé », « compatible Android » sans preuve datée.

**Ordre d'exécution conseillé à Codex :** audit et preuve des propriétaires → liste des composants réellement disponibles/manquants → arbitrages/permissions strictement nécessaires → implémentation limitée → tests locaux + AAB → premier setup Google manuel → envoi API piste interne → test sur appareil réel via Play → documentation et rapport. Si les étapes Google ou les tests physiques sont bloqués, le reste doit pouvoir être livré de façon honnête et exploitable.

---

## 11. Références officielles vérifiées pour ce prompt

Pages à **reconsulter au moment de l'implémentation** en cas d'évolution des limites, tarifs ou menus :

- Google Play — **Configurer un test ouvert, fermé ou interne** : https://support.google.com/googleplay/android-developer/answer/9845334?hl=fr
- Google Play — **Partager des APK et AAB en interne** (voie secondaire et distincte) : https://support.google.com/googleplay/android-developer/answer/9844679?hl=fr
- Google Play — **Préparer et déployer une version** : https://support.google.com/googleplay/android-developer/answer/9859348?hl=fr
- Google Play — **Utiliser Play App Signing** : https://support.google.com/googleplay/android-developer/answer/9842756
- Google Play Developer API — **Getting started / compte de service** : https://developers.google.com/android-publisher/getting_started
- Google Play Developer API — **Edits / première importation et commit** : https://developers.google.com/android-publisher/edits
- Google Play Developer API — **API `edits.bundles.upload`** : https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles/upload
- Google Play Developer API — **API `edits.tracks.update`** : https://developers.google.com/android-publisher/api-ref/rest/v3/edits.tracks/update
- Google Play Developer API — **API `edits.commit`** : https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit
- Android — **Build and test your Android App Bundle** : https://developer.android.com/guide/app-bundle/test
- Android — **bundletool** : https://developer.android.com/tools/bundletool
- Android — **limites et principes des Android App Bundles** : https://developer.android.com/guide/app-bundle
- Google Play — **Conditions des nouveaux comptes personnels pour l'accès production** (ne bloque pas en soi le canal interne) : https://support.google.com/googleplay/android-developer/answer/14151465?hl=fr

**Note :** la documentation publique décrit une procédure générique ; l'accès réel à la Play Console, ses autorisations, la présence du certificat et la disponibilité de l'application eVe n'ont pas été vérifiés à partir d'un compte Google utilisateur. Ces actions font partie du premier déploiement et ne sont pas supposées accomplies.
