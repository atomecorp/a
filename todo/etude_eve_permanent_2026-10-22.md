# Étude — eVe permanent, notifications et centre de contrôle (lot L24, PERM-01..05)

Date : 2026-10-22. Nature : **étude seule**. Aucun code modifié, aucun service activé, aucune surveillance lancée, aucun contact externe, aucune opération Git.
Sources du besoin : `todo/!!!!!!_Urgent_big _task_to implement.md` §1.14 (PERM-01..05), §1.15, lot L24, §4.2 (ligne « Agent permanent »), §6.4 (protocole « Permanent »), §7.4 (dix livrables).

Étiquettes utilisées pour chaque recommandation :
- **[Vérifié]** : constaté dans le code (fichier:ligne) ou dans une documentation officielle consultée le 2026-10-22 ;
- **[Hypothèse]** : inférence raisonnée, non démontrée ;
- **[Prototype requis]** : ne peut être tranché que par un essai réel sur appareil ou machine, à autoriser plus tard.

Sources externes (toutes consultées le 2026-10-22 ; les pages Apple ont été lues via leur version JSON `developer.apple.com/tutorials/data/documentation/...`) :

| Id | Source | Point utilisé |
| --- | --- | --- |
| S1 | Apple, `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` — developer.apple.com/documentation/uikit/uiapplicationdelegate/application(_:didreceiveremotenotification:fetchcompletionhandler:) | Pas de lancement automatique après fermeture forcée ; 30 s |
| S2 | Apple, « Pushing background updates to your app » — developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app | Priorité basse, non garanti, « 2 ou 3 par heure », notification retenue détruite si l'app est tuée |
| S3 | Apple, « Declaring your actionable notification types » — developer.apple.com/documentation/usernotifications/declaring-your-actionable-notification-types | Action → lancement en arrière-plan ; actions sur appareil verrouillé |
| S4 | Apple, `UNNotificationActionOptions` | `authenticationRequired`, `foreground`, `destructive` |
| S5 | Apple, « Modifying content in newly delivered notifications » | Extension de service : `mutable-content`, alerte obligatoire, ~30 s |
| S6 | Apple, « Sending notification requests to APNs » | Stockage 1 notification/bundle, ≤ 30 jours, `apns-expiration`, `apns-collapse-id`, priorités 10/5/1, types de push |
| S7 | Apple, `UNNotificationInterruptionLevel` (iOS 15+) | passive / active / timeSensitive / critical |
| S8 | Apple, « Choosing background strategies for your app » | `BGAppRefreshTask` 30 s, moment choisi par le système ; `BGProcessingTask` |
| S9 | Apple, `BGContinuedProcessingTask` (iOS 26+) | Tâche démarrée au premier plan, progression en Live Activity |
| S10 | Apple, « Starting and updating Live Activities with ActivityKit push notifications » | Push-to-start impossible ≤ iOS 17.1 ; budget horaire ; `liveactivity` |
| S11 | Apple, « Displaying live data with Live Activities » | 8 h actives, 12 h max à l'écran verrouillé, 4 Ko, boutons via App Intents |
| S12 | Apple, `IntentAuthenticationPolicy` (iOS 16+) | alwaysAllowed / requiresAuthentication / requiresLocalDeviceAuthentication |
| S13 | Apple WWDC26 session 345 « Discover new capabilities in the App Intents framework » | `LongRunningIntent`, `CancellableIntent`, `ExecutionTargets` `.appIntentsExtension` (« 2027 releases ») |
| S14 | Apple WWDC26 session 343 « Explore advanced App Intents features for Siri and Apple Intelligence » | `UNMutableNotificationContent.appEntityIdentifiers`, réponse vocale sur AirPods, confirmations |
| S15 | Apple Newsroom, « Major updates for Apple's software platforms are now available » (2026-09) | Sortie iOS 27 |
| S16 | Apple Support 149076 « About iOS 27 Updates » (publiée 2026-09-29) | iOS 27.0 et 27.0.1 listés |
| S17 | Apple Developer, « Releases » | iOS 27.2 RC (24B115) le 2026-10-19 ; iOS 27.0.1 le 2026-09-28 ; Xcode 27.1 le 2026-10-15 |
| S18 | Apple Developer « What's New — iOS » | App Intents/Siri, widgets, Foundation Models ; rien sur push/arrière-plan |
| S19 | Tauri v2, plugin Notification — v2.tauri.app/plugin/notification | Pas de push documenté ; actions mobiles seulement |
| S20 | Tauri v2, « Mobile Plugin Development » — v2.tauri.app/develop/plugins/develop-mobile | Plugin Swift, `invoke`, `trigger`/`addPluginListener` |
| S21 | Apple, PushKit `pushRegistry(_:didReceiveIncomingPushWith:for:completion:)` | Push VoIP à signaler à CallKit sinon terminaison |
| S22 | Apple, `SMAppService` (macOS 13+) | Login item / agent / daemon soumis à approbation |
| S23 | Apple Support 103253 « Mac mini power consumption » | Ordre de grandeur de consommation au repos (lu via extrait de recherche, à relire) |

---

## 1. État des capacités réellement disponibles dans atome/eVe

Statuts : **Disponible et compatible** / **Existant mais inadapté** / **Indisponible** / **Non trouvé après investigation** / **Non vérifiable faute d'accès**. Les cartes `maps/` n'ont servi qu'à la navigation ; tout est prouvé par le code.

| Brique | Preuve | Statut | Commentaire |
| --- | --- | --- | --- |
| Assistant vocal JS (orchestrateur, session, planificateur IA) | `atome/src/squirrel/voice/` (orchestrator*.js, session_runtime*.js, ai_planner*.js) | Disponible et compatible | S'exécute dans la page : il meurt quand l'app iOS est suspendue. Réutilisable par une instance permanente seulement si le runtime tourne hors page (à prouver). |
| Planificateur proactif (briefing, déclencheurs, anti-répétition) | `atome/src/squirrel/ai/proactive_scheduler.js:104` `buildStartupBriefing`, `:169` `evaluateProactiveNotifications`, `:224` `coalesceProactiveNotifications` ; exposé par `atome/src/squirrel/voice/service.js:401-416` | Existant mais inadapté | Bonne logique (cooldown par domaine, mise en sourdine, seuil de confiance 0.8, fenêtre de regroupement 60 s). Aucun autre appelant que `service.js` n'a été trouvé, et aucune boucle serveur : rien ne l'exécute en permanence. |
| Gateway agent : niveaux de risque et décision | `atome/src/squirrel/ai/agent_gateway_state.js:8-20` (`ALLOW / REQUIRE_CONFIRM / DENY`, tiers `read, low, moderate, high, irreversible`) | Disponible et compatible | Socle direct des niveaux d'autonomie (§8). |
| Politique MCP : confirmation, quotas, idempotence, journal | `atome/src/squirrel/atome/mcp_security_policy.js:17-48` (quota `mail.send` 3/min), `:128-132` (`mail.send`, `calendar.*` = `confirm`) ; `mcp_security.js:108` `pushSecurityJournal`, `:201-216` idempotence, `:230` `createConfirmationRecord` | Disponible et compatible | La confirmation est un enregistrement en mémoire de processus (`mcp_confirm_${++seq}`), donc non persistant et non lié à un appareil. Il faudra l'étendre pour des décisions prises à distance. |
| Outils mail | `atome/src/squirrel/ai/default_tools_mail.js:3-208` (`mail.list/read/search/next_unread/summarize/reply_draft/mark_read/mark_unread/archive/delete/send`) | Disponible et compatible | Le découpage lire / préparer (`reply_draft`) / exécuter (`send`) existe déjà. |
| Client IMAP/SMTP interne | `atome/src/squirrel/mail/node_protocol_clients.js:15-31` (`NodeImapClient`, `LOGIN` utilisateur/mot de passe) ; `mail_trust_scoring.js` (phrases d'hameçonnage FR/EN, seuils 0.7/0.4) | Existant mais inadapté | Synchronisation à la demande seulement. Ni IMAP IDLE, ni minuterie de surveillance : sur le serveur, les seuls `setInterval` sont `githubSync.js:294` et `wsSyncRuntime.js:47`. Pas d'OAuth. |
| Routes HTTP mail Fastify | `server/mailRoutes.js:274-317` (`/api/eve/mail/sync|send|mark-read|archive|delete`) ; identifiants transmis dans le corps par le client (`atome/src/squirrel/mail/bootstrap_connector.js:128-189`) et résolus par `scripts/icloud_live_credentials.mjs:144` (lecture du trousseau macOS : `:79`) | Existant mais inadapté | REST pour des données applicatives : c'est l'écart connu du module 05. Aucune authentification de principal n'a été trouvée dans ces routes ; le hook `onRequest` de `server/http_server_hooks.js:142` sert à la journalisation. À confirmer, mais c'est un point de sécurité à traiter avant tout usage permanent. |
| Envoi APNs serveur | `server/apns_transport.js:7-30` (HTTP/2, JWT ES256, `alert`/`voip`, priorité 10/5, `apns-expiration`, `apns-collapse-id`, exige `APNS_KEY_ID/TEAM_ID/KEY_PATH/TOPIC`) ; FCM `server/fcm_transport.js` | Disponible et compatible | Les pushes `background`, `liveactivity`, `mutable-content` et `category` ne sont pas gérés. |
| Composition et livraison des pushes | `server/communication_push.js:39-85` : charge utile neutre `title:'Atome'`, `loc-key:'ATOME_NOTIFICATION'` (`:66-71`, avec le commentaire « No message, phone, bearer, photo or caller name is exposed on the lock screen ») ; `interruption-level: passive` pour une demande de contact ; envoi seulement aux installations liées à une session et à une clé non révoquées (`:47-52`) ; dédoublonnage `delivery_id` (`:62-64`) | Disponible et compatible | Base exacte du « push bref non sensible » de PERM-03. |
| Pile de notifications par utilisateur | `server/notificationStack.js:17` (`message_stack`/`notification_stack` dans les propriétés de l'Atome utilisateur), `:123` livraison push ; panneau `eVe/intuition/tools/communication_notifications.js` ; priorités `normal/priority/urgent` dans `atome/src/shared/communication_contract.js:4` ; outil `communication.notification.publish` `:63` | Disponible et compatible | Les trois priorités recouvrent la distinction ordinaire / important / décision. |
| iOS natif : APNs, PushKit, CallKit, délégué de notifications | `platforms/ios/atome-auv3/application/AppNativeCommunication.swift:10-44` (enregistrement), `:46-53` (principal lu depuis l'autorisation locale déverrouillée), `:65-71` (boîte de ≤ 32 références opaques, « never payload content/credentials »), `:205-213` (`willPresent` filtré par principal, `didReceive` → `open`) | Disponible et compatible | Ouverture contextuelle déjà câblée vers JS (`atome/src/squirrel/security/communication_push_client.js:15-24`). |
| Modes d'arrière-plan iOS | `platforms/ios/atome-auv3/application/Info.plist:151-157` (`voip`, `remote-notification`, `audio`, `location`) ; `aps-environment` = `development` dans `application/atome.entitlements:7` (fichier de release distinct `atomeRelease.entitlements:7`) | Existant mais inadapté | `remote-notification` est déclaré, mais aucun `didReceiveRemoteNotification` n'a été trouvé : un push silencieux ne ferait rien aujourd'hui. |
| Catégories et actions de notification | `platforms/ios/atome-auv3/Common/NotificationNudge.swift:10` (`actions: []`) | Indisponible | Aucune action interactive n'est déclarée. |
| Extension de service ou de contenu, Live Activity, widget | `atome.xcodeproj/project.pbxproj` : seul `atomeAudioUnit.appex` ; aucune occurrence de ActivityKit, WidgetKit ou NotificationService | Non trouvé après investigation | |
| App Intents | `platforms/ios/atome-auv3/application/AssistantSiriIntent.swift:5-23` (`OpenAssistantIntent`, `openAppWhenRun = true`, `.foreground(.immediate)`) | Disponible mais limité | Ouvre l'app ; aucune intention ne s'exécute sans ouverture. |
| Alarmes locales | `platforms/ios/atome-auv3/application/NativeCalendarAlarm.swift:109,275` | Disponible et compatible | Brique naturelle pour « Rappeler plus tard ». |
| Arrière-plan court | `platforms/ios/atome-auv3/application/AppBackgroundLifecycle.swift:19` (`beginBackgroundTask` pour la base) | Disponible et compatible | Fin propre d'écriture seulement. |
| Cible de déploiement iOS | `project.pbxproj:483` (16.6), `:578` (recommandée) | Vérifié | Les capacités iOS 17.2+, 26+ et 27 imposent `@available` (le code le fait déjà pour 26.4 : `AppNativeCommunication.swift:120`). |
| Tauri (macOS, Android) | `platforms/desktop-tauri/Cargo.toml:68` (`tauri = "2"`, verrouillé à 2.12.1 : `Cargo.lock:8218-8219`), extensions `:69-74` (opener, clipboard, stt, health, billing, mobile-host) ; `gen/` ne contient qu'`android` | Vérifié | **L'app iOS n'est pas une app Tauri** : c'est une app Swift + WKWebView avec serveur local Swift (`Common/LocalHTTPServer.swift`, `AiSRuntime*.swift`). Sous Tauri, les notifications natives ne sont prises en charge que sur Android : `native_communication.rs:10` renvoie `notifications_host_unsupported` ailleurs. Aucun `tauri-plugin-notification`. |
| Serveur Axum (Tauri) | `platforms/desktop-tauri/src/server/` (local_atome_sync_worker.rs, ws_api.rs, remote_control.rs:9-30 avec jeton de contrôle distant) | Disponible et compatible | Candidat d'hébergement de l'instance permanente sur Mac. |
| Appareils, sessions, révocation | `server/auth_devices.js:6-7` (`APPROVE_ASSURANCE='hardware_uv'`, probation 72 h) ; `server/auth_sessions.js:12,67` (`revoked_ms`) ; sessions liées à la clé `cnf.kid` (`communication_push.js:23,28`) | Disponible et compatible | Un appareil « agent » peut réutiliser ce modèle. |
| Commande distante et autorisations de surface | `server/remoteCommandRelay.js:1-12` (« The server never executes anything », la cible exécute par son propre MCP) ; `server/surfaceGrants.js:15-25` (`REMOTE_COMMAND`, …), `:147` `revokeSurfaceGrant` | Disponible et compatible | Canal exact pour « iPhone → instance permanente : exécute l'outil X ». |
| Journal d'événements | `eVe/intuition/runtime/command_bus.js` ; `atome/src/squirrel/ai/trace_store.js:60` ; pipeline `eVe/core/atome_commit.js` (événements en ajout seul) | Disponible et compatible | Le journal d'autorité doit rester l'historique d'Atomes, pas un nouveau registre. |
| File de mutations hors ligne | `atome/src/squirrel/ai/offline_mutation_queue.js:29` | Disponible et compatible | |
| Chiffrement de contenu de bout en bout entre appareils | Seul `atome/src/squirrel/security/token_vault.js` (stockage local) | Non trouvé après investigation | Transport : TLS et sessions liées à une clé d'appareil. Pas de chiffrement applicatif du contenu destiné au téléphone. |
| Keycloak | Mentionné seulement dans `todo/` (dont « new authentication scheme.md ») | Non trouvé après investigation | Absent du code. |
| Matrix (protocole) | Aucune trace de `matrix-js-sdk`, `/_matrix/` ou Synapse ; `eVe/domains/matrix/matrix_grid_model.js:1` est une grille de mise en page | Non trouvé après investigation | Ne pas confondre avec le module Matrix de grille. |
| Visio mediasoup | `server/visio.js`, `eVe/domains/visio/visio_call_runtime.js`, `package.json:180-181` | Disponible et compatible | Hors du chemin critique de l'étude. |
| Dashboard | `eVe/domains/dashboard/*` (cartes, tuiles, appui long contextuel) | Disponible et compatible | Surface du centre de contrôle (§7). |
| Configuration APNs de production, état du serveur atome.one, Mac mini réel | — | Non vérifiable faute d'accès | Clé `.p8`, sujet, environnement production et ressources serveur : pas consultés, et ce n'est pas autorisé. |

**Synthèse [Vérifié]** : les briques de **livraison** (push neutre, pile, ouverture contextuelle, sessions révocables, relais de commande, politique de confirmation) existent. Les briques de **permanence** (surveillance continue, instance hors page, décisions distantes persistantes, actions de notification, extension de service) manquent.

---

## 2. Tableau iOS par état, version et mécanisme

Version courante au 2026-10-22 **[Vérifié]** : iOS 27 existe. La sortie publique date du 14 septembre 2026 (S15 ; date tirée des résultats de recherche Apple Newsroom). La page Support liste iOS 27.0 et 27.0.1 (S16). La page Releases liste iOS 27.0.1 (2026-09-28) et **iOS 27.2 RC (24B115, 2026-10-19)** (S17). Le statut exact d'iOS 27.1 n'a pas été confirmé par mes lectures : **à vérifier**. Pour ce qui nous concerne, iOS 27 apporte surtout : les schémas App Intents pour Siri (S18), `LongRunningIntent`, `CancellableIntent` et l'exécution dans une extension App Intents (S13), ainsi que l'annotation des notifications par entités `appEntityIdentifiers` pour que Siri agisse dessus via les AirPods (S14). Les pages lues ne mentionnent **aucune** nouveauté sur le push, l'exécution en arrière-plan ou la relance après fermeture forcée. Siri AI est en bêta, en anglais d'abord (S15) ; une indisponibilité initiale dans l'UE est rapportée par des sources secondaires seulement : **à vérifier** avant tout parcours vocal français.

Légende : **P** possible ; **C** possible sous conditions ; **I** impossible ; **V** à vérifier (prototype).

| Mécanisme \ état de l'app | Premier plan | Arrière-plan / suspendue | Terminée par le système | Fermée de force par l'utilisateur | Verrouillé | Éteint ou hors réseau |
| --- | --- | --- | --- | --- | --- | --- |
| Push alerte visible (`alert`) | P (via `willPresent`, déjà filtré par principal) | P | P | **P (inférence forte)** : c'est le système qui affiche (S1) ; seul le lancement de l'app est interdit. Prototype requis | P ; le contenu dépend du réglage « Aperçus » de l'utilisateur | Rien ne s'affiche ; APNs stocke **une** notification par bundle pour ≤ 30 jours selon `apns-expiration` (S6) |
| Push silencieux (`content-available`, priorité 5) | C | C : non garanti, « 2 ou 3 par heure », 30 s (S2, S1) | C : le système relance l'app (S1) | **I** : pas de lancement tant que l'utilisateur ne relance pas l'app ou ne redémarre pas l'appareil (S1) ; la notification retenue est détruite (S2) | C (accès aux fichiers protégés limité) | I |
| Extension de service (`mutable-content:1` + alerte) | P | P | P | V : processus séparé, non couvert par S1/S2 | C | I |
| Action sans `.foreground` | P | C : le système lance l'app en arrière-plan (S3) | C | **V** : la doc dit « launches your app in the background » sans traiter le cas de la fermeture forcée | C : possible sauf `authenticationRequired` (S4) ; fichiers chiffrés en protection « complete » indisponibles (S3) | I |
| Action `.foreground` (ouvre le bon outil) | P | P | P | P (lancement explicite par l'utilisateur) | Déverrouillage exigé | I |
| Action `authenticationRequired` | P | C | C | V | Déverrouillage exigé (S4) | I |
| Action de saisie texte (`UNTextInputNotificationAction`) | P | C (S3) | C | V | C | I |
| Tap sur la notification → contexte | P (chemin existant `didReceive` → `open` → `communication_push_client.js`) | P | P | P | Déverrouillage | I |
| `BGAppRefreshTask` | — | C : moment choisi par le système, 30 s (S8) | C | V (non documenté dans S8) | C | I |
| `BGContinuedProcessingTask` (iOS 26+) | Démarre ici (S9) | C : progression en Live Activity, annulable, peut être interrompue | — | V | C | I |
| Push VoIP (PushKit) | **Appels réels seulement** | Doit être signalé à CallKit, sinon l'app est terminée et les livraisons peuvent cesser (S21) | idem | idem | idem | I |
| Live Activity mise à jour par push | P | P | P | V | P : écran verrouillé, 8 h actives, 12 h max, 4 Ko (S11) | I |
| Live Activity démarrée par push (push-to-start) | iOS ≥ 17.2 (impossible ≤ 17.1, S10) | C (budget horaire, S10) | C | V | P | I |
| Bouton App Intent dans une Live Activity ou un widget | P (S11) | P | P | V | Selon `authenticationPolicy` (S12) | I |
| App Intent sans ouverture, en extension (iOS 27) | P | C (S13) | C | V | Selon `authenticationPolicy` | I |
| Notification annotée par entité, réponse via Siri/AirPods (iOS 27) | V | V | V | V | V : la confirmation sur appareil verrouillé n'est pas couverte par S14 | I |
| Exécution continue d'un agent sur l'iPhone | I | **I [Hypothèse fondée]** : aucun mécanisme documenté ; chaque mode d'arrière-plan est borné à un usage (S1, S2, S8, S9, S21) | I | I | I | I |
| Relance automatique après fermeture forcée | — | — | — | **I** sauf relance par l'utilisateur ou redémarrage de l'appareil (S1) | — | — |

Conclusions **[Vérifié]** :
1. Le travail permanent ne peut pas avoir lieu sur l'iPhone. Il doit se faire sur une instance distante (Mac ou serveur). L'iPhone reçoit et décide.
2. Le seul canal fiable vers un iPhone dont l'app a été fermée de force est la **notification visible**. Le silencieux est exclu. Le VoIP est réservé aux appels et ne doit pas être détourné.
3. Un téléphone éteint ne reçoit qu'une notification gardée par APNs (la dernière, en général). La vérité doit donc rester côté serveur, dans la pile et dans les Atomes ; le push n'est qu'une **sonnette**.

**Tauri iOS [Vérifié + Hypothèse]** : l'app iOS actuelle n'est pas Tauri, donc les restrictions Tauri iOS ne s'appliquent qu'à un éventuel portage. Dans ce cas : le plugin Notification ne documente pas le push (S19) ; il faudrait un plugin Swift (`Plugin`, commandes `@objc` appelées par `invoke`, événements vers JS par `trigger`/`addPluginListener`, S20) qui porte délégué, catégories et jetons APNs. L'extension de service resterait une cible Xcode séparée. La WebView étant suspendue en arrière-plan, la logique d'action doit être en Swift/Rust, pas en JS (S20 mentionne l'appel Rust « even when the application WebView is suspended »). C'est déjà le principe de l'app Swift actuelle : `AppNativeCommunication` persiste des références opaques et JS les consomme au réveil.

---

## 3. Comparaison : (A) ordinateur permanent, (B) serveur atome, (C) hybride

| Critère | A — Mac mini/ordinateur personnel allumé | B — serveur atome (atome.one) | C — hybride : instance sur machine de l'utilisateur + serveur atome en relais |
| --- | --- | --- | --- |
| Disponibilité | Dépend du courant, de la box, des mises à jour macOS, des redémarrages. Accès entrant difficile (NAT) | Élevée (datacenter), une seule machine à surveiller | Analyse disponible quand le Mac est allumé ; relais et pile toujours disponibles ; indisponibilité du Mac **signalée**, pas masquée |
| Confidentialité | Meilleure : identifiants mail et contenu restent chez l'utilisateur (trousseau macOS déjà lu par `icloud_live_credentials.mjs:79`) | Le serveur détient identifiants et contenu de tous les utilisateurs : cible de grande valeur | Identifiants et contenu restent sur la machine de l'utilisateur ; le serveur ne voit que des références opaques et des métadonnées minimales |
| Sécurité | Compromission = un utilisateur. Dépend de l'hygiène du Mac (FileVault, compte dédié) | Compromission = tous les utilisateurs ; exige un coffre de secrets par utilisateur et une isolation forte | Compromission du serveur = métadonnées et possibilité de spam de sonnettes, sans lecture des mails (si le contenu n'y transite pas en clair) |
| APNs | La clé `.p8` ne doit pas être distribuée sur chaque Mac **[Hypothèse : risque d'abus de la clé d'équipe]** → le Mac ne peut pas envoyer seul | Déjà en place (`apns_transport.js`) | Le serveur envoie (déjà fait) ; le Mac demande l'envoi par le WS authentifié |
| Énergie | Mac mini M4 de base : ~4 W au repos selon Apple (S23, à relire), soit ~35 kWh/an au repos, plus les pics d'inférence locale | Mutualisée, mais l'inférence IA par utilisateur coûte côté fournisseur | Comme A, plus un relais léger côté serveur |
| Coût | Matériel déjà possédé ou achat unique, électricité, appels au fournisseur IA | Hébergement qui croît avec le nombre d'utilisateurs, stockage des secrets, conformité | A + relais faible |
| Maintenance | Mises à jour, reprise après coupure, surveillance par l'utilisateur | Centralisée chez l'opérateur | Code unique (même runtime eVe), deux hébergements |
| Synchronisation | Le moteur de sync existe (`local_atome_sync_worker.rs`, `/ws/sync`) | Natif côté serveur | Sync existante ; l'instance est un appareil du même principal |
| Utilisateurs sans ordinateur | Exclus | Couverts | Mode B possible en option explicite, avec consentement séparé pour confier ses identifiants |
| Accord avec la préférence d'auto-hébergement (PERM-01) | Fort | Faible | Fort |

---

## 4. Architecture recommandée et justification

**Recommandation : C (hybride)**, avec B comme mode explicite et consenti pour qui n'a pas de machine permanente. Jamais de bascule silencieuse de C vers B : ce serait un repli interdit par les règles du projet.

1. **Instance permanente = un appareil eVe du principal**, de classe « agent », appairé par le mécanisme existant (`auth_devices.js`, assurance `hardware_uv`, probation 72 h) et doté d'une session révocable (`auth_sessions.js:67`). [Vérifié pour les briques ; Prototype requis pour la classe « agent »]
2. **Hébergement sur Mac** : le runtime Tauri/Axum existant (`platforms/desktop-tauri/src/server/`), lancé à l'ouverture de session via `SMAppService` (macOS 13+, approbation de l'utilisateur, S22). Ou bien un runtime Node sans interface qui réutilise `atome/src/squirrel/mail/*` et `ai/*`. [Hypothèse : il faut prouver que le planificateur et les outils tournent hors page ; Prototype requis]
3. **Connexion uniquement sortante** de l'instance vers `/ws/api` du serveur atome : aucun port ouvert à domicile. [Hypothèse ; cohérente avec `remoteCommandRelay.js`]
4. **Surveillance mail** : extension interne de `NodeImapClient` (IMAP IDLE ou interrogation bornée), identifiants dans le trousseau du Mac, jamais dans le corps HTTP ni sur le serveur en mode C. [Prototype requis]
5. **Analyse** : `mail_trust_scoring` (filtre), puis `mail.summarize`, puis `evaluateProactiveNotifications` (cooldown, regroupement), puis classement en `normal / priority / urgent`. Le contenu entrant reste une **donnée** : aucune instruction d'un mail ne devient un appel d'outil (§4.2). [Vérifié pour les briques ; Hypothèse pour l'enchaînement]
6. **Résultat = Atome « proposition »** créé par le pipeline canonique (`Atome.commit`), avec sa provenance (identifiant du message), le brouillon préparé, les actions permises et une échéance. L'historique en ajout seul sert de journal. [Hypothèse de contrat, à définir avec le module 06]
7. **Sonnette** : entrée dans `notificationStack`, puis `communicationPush.deliver` avec la charge utile neutre existante, enrichie d'une `category` et de `mutable-content`. [Vérifié pour l'existant ; Prototype requis pour l'extension]
8. **Décision sur l'iPhone** : ouverture contextuelle (chemin existant) ou action de notification. Une décision d'exécution est signée par la session de l'iPhone et relayée par `remote-control command` vers l'instance, **qui contrôle à nouveau** la permission au moment d'exécuter (posture de `remoteCommandRelay.js:6-12`). [Vérifié pour le relais ; Prototype requis pour la signature et la persistance]

Justification : c'est la seule option qui respecte à la fois la limite iOS (aucun travail permanent sur le téléphone, §2), la souveraineté des données et le réemploi maximal (push, pile, relais, sessions, MCP). Elle ajoute peu de briques nouvelles, toutes internes.

---

## 5. Communication instance permanente ↔ applications mobiles

| Flux | Canal | Existant | À créer (futur) |
| --- | --- | --- | --- |
| Instance → serveur : présence et état | `/ws/api`, session d'appareil | Oui (sessions, surfaces) | Battement de cœur de l'agent et état « en ligne / hors ligne » visible dans le Dashboard |
| Instance → serveur : proposition | Commit d'Atome + `/ws/sync` | Oui (pipeline) | Type « proposition » et schéma versionné strict |
| Serveur → iPhone : sonnette | APNs `alert` neutre | Oui (`communication_push.js:66-71`) | `category`, `thread-id`, `mutable-content`, `apns-collapse-id` = identifiant de proposition (déjà passé en `collapseId`, `:76`) |
| iPhone : contenu enrichi local | Extension de service : récupère et déchiffre un résumé court | Non | Cible d'extension, clé de déchiffrement partagée par groupe d'apps et Trousseau. Prototype requis (accès hors déverrouillage) |
| iPhone → instance : décision | `remote-control command` (`remoteCommandRelay.js`) ou mutation de la proposition | Relais présent | Confirmation persistante, signée, à usage unique, avec expiration (remplace l'enregistrement en mémoire de `mcp_security.js:230`) |
| Instance → iPhone : résultat | Mise à jour de l'Atome + pile ; Live Activity pour une opération longue | Partiel | Push `liveactivity` (S10/S11), plus tard |
| Hors ligne | iPhone hors réseau : la décision part dans la file (`offline_mutation_queue.js`) ; instance hors ligne : la proposition reste « en attente d'exécution », l'interface l'affiche | Partiel | Règle d'expiration : une décision arrivée après l'échéance est refusée explicitement |
| Anti-doublon et anti-rejeu | `delivery_id` (`communication_push.js:62`), idempotence MCP (`mcp_security.js:201-216`), `notifications_ack` | Oui | Clé d'idempotence = (proposition, action, génération) ; le relais n'accepte que la surface cible (`remoteCommandRelay.js:10-12`) |

Chiffrement : TLS et sessions liées à une clé d'appareil existent [Vérifié]. Aucun chiffrement de bout en bout du contenu entre l'instance et l'iPhone n'a été trouvé (§1). Pour le mode C, il faut une **enveloppe chiffrée pour les appareils du principal**, afin que le serveur ne voie jamais le contenu. [Prototype requis ; brique interne à créer, sans dépendance externe non auditée]

---

## 6. Notifications, actions et ouverture contextuelle (parcours PERM-03)

Exemple : un client écrit « pouvez-vous confirmer vendredi ? ».

1. L'instance détecte le mail et le classe « décision nécessaire » (`urgent` ou `priority`). Elle crée une proposition contenant : le résumé, le brouillon (`mail.reply_draft`) et les actions candidates. [Hypothèse]
2. Le serveur envoie la sonnette. Sur l'écran verrouillé, on lit seulement « Atome — 1 décision » via une clé localisée. **Ni expéditeur, ni objet, ni extrait.** Le niveau est `active` pour une décision et `passive` pour une information (S7). `timeSensitive` est à réserver aux échéances proches : l'entitlement nécessaire n'est pas couvert par S7, à vérifier. [Vérifié pour la neutralité existante ; Hypothèse pour la gradation]
3. Une fois l'appareil déverrouillé, l'extension de service peut remplacer le texte par un résumé court déchiffré localement. L'utilisateur garde la main via le réglage « Aperçus ». [Prototype requis]
4. Actions de la catégorie (exemples fonctionnels, **pas un design validé ni un envoi autorisé**) :
   - **Consulter** : `.foreground`, qui ouvre eVe sur le message exact (identifiant de proposition, puis l'outil mail via le chemin `open` existant). Aucune recherche manuelle. [Vérifié pour le chemin ; Prototype requis pour la cible d'ouverture]
   - **Préparer une réponse** : sans `.foreground`, avec `authenticationRequired`. L'instance prépare ou affine le brouillon, mais **n'envoie rien**. [C : fonctionnement après fermeture forcée à vérifier]
   - **Rappeler plus tard** : sans `.foreground`. Alarme locale (`NativeCalendarAlarm`) et report de la proposition. [Hypothèse]
   - **Envoyer** : jamais depuis la notification au niveau 2. Au niveau 3 seulement, si une permission couvre exactement ce destinataire et ce type de réponse, et toujours en `.foreground` avec confirmation visible. Recommandation : ne pas l'exposer en V1. [Hypothèse prudente]
5. Si iOS impose l'ouverture (action non lancée en arrière-plan, données protégées indisponibles sur appareil verrouillé), l'action devient une **ouverture directe du contexte** : c'est le comportement de repli décrit dans le besoin et assumé comme tel, sans succès fictif. [Vérifié pour la contrainte de protection des fichiers (S3)]
6. Réduction du bruit [Vérifié pour les briques] : seules les décisions sonnent. Les informations importantes arrivent en `passive`. L'ordinaire va dans la pile et le Dashboard, sans push. Cooldown par domaine et regroupement (`proactive_scheduler.js`), puis `apns-collapse-id`.
7. Live Activity : réservée aux **opérations en cours** (« préparation de 12 réponses en cours sur le Mac »), pas aux mails (8 h maximum, 4 Ko, budget, S10/S11). [Hypothèse d'usage]
8. iOS 27 : annoter la notification avec l'entité « proposition » (`appEntityIdentifiers`, S14) permettrait « Réponds que c'est d'accord » via Siri sur AirPods. La gestion de la confirmation et du verrouillage n'est pas documentée (S14), et Siri AI n'est pas en français au lancement (S15). [À vérifier ; hors V1]

Limites [Vérifié] : pas de garantie de délai (APNs fait au mieux, S6) ; une seule notification stockée si l'iPhone est éteint (S6) ; aucune action fiable sans interaction humaine après fermeture forcée (S1, S2).

---

## 7. Réemploi pour le centre de contrôle transversal

Il n'y a **ni app distincte ni nouveau panneau de gestion par réflexe** (PERM-04). Correspondances :

| Besoin | Brique réutilisée | Preuve |
| --- | --- | --- |
| Événements importants et propositions | Pile de notifications + panneau communication | `server/notificationStack.js:17,123` ; `eVe/intuition/tools/communication_notifications.js` |
| Classement ordinaire / important / décision | Priorités `normal/priority/urgent` | `atome/src/shared/communication_contract.js:4` |
| Valider / refuser / reporter | Actions de la proposition, rendues par les cellules BevyUI du Dashboard, avec outils contextuels à l'appui long (pas le Mystic complet) | `eVe/domains/dashboard/*` |
| Interventions passées | Historique d'Atomes, bus de commandes, traces | `eVe/core/atome_commit.js` ; `eVe/intuition/runtime/command_bus.js` ; `ai/trace_store.js:60` |
| Opérations en cours machine/serveur | État de l'agent (en ligne, en cours, en échec) dans une tuile du Dashboard ; plus tard en Live Activity | À créer à partir des cellules existantes |
| Continuité entre appareils | Sync `/ws/sync`, surfaces, commande distante | `server/remoteCommandRelay.js`, `server/surfaceGrants.js` |
| Définition des situations notifiables | Préférences proactives (cooldown, sourdine par domaine) | `proactive_scheduler.js` (cooldown `proactive.<domaine>.cooldown_ms`) |
| Confirmation et quotas | Politique MCP | `mcp_security_policy.js:17-48,128-132` |

Le design visuel d'éventuelles nouvelles cellules relève de la validation panneau par panneau (section 5 du besoin) et n'est pas acquis. Tout libellé passe par `eveT()`, en mode zen.

---

## 8. Niveaux d'autonomie, permissions, révocation et journal

| Niveau | Autorisé | Correspondance existante | Exige |
| --- | --- | --- | --- |
| 1 — Information | Lire, classer, résumer | Tier `read` ; `mail.list/read/summarize` | Consentement d'accès au compte mail, révocable |
| 2 — Proposition préparée + décision | Préparer un brouillon ou une action, présenter et attendre | `mail.reply_draft` ; `REQUIRE_CONFIRM` ; `access:'confirm'` | Décision explicite, signée par un appareil, à usage unique, avec expiration |
| 3 — Action préalablement autorisée | Exécuter sans demander, dans un périmètre strict | `ALLOW` selon une règle | **Permission permanente** : outil, contraintes (destinataires, dossiers, nombre maximum par jour, plage horaire), expiration, plafond de risque ≤ `moderate` ; jamais `irreversible` |
| 4 — Orchestration multi-services/appareils | Plan en plusieurs étapes (mail + calendrier + appareil) | Relais de commandes, autorisations de surface | Approbation du **plan** entier, journal par étape, arrêt possible à chaque étape |

Modèle proposé [Hypothèse, à contractualiser] :
- **Permission = Atome** (description, jamais une vue) modifié par le pipeline canonique. Accorder, restreindre ou révoquer = nouvel événement en ajout seul : le journal est l'historique lui-même.
- **Vérification au moment d'exécuter, sur l'hôte qui exécute** (comme `remoteCommandRelay.js:6-8`), jamais seulement à la création de la proposition.
- **Révocation à trois niveaux** : une permission ; tout l'agent (révocation de la session d'appareil, `auth_sessions.js:67`, qui coupe aussi ses pushes, `communication_push.js:47-52`) ; un appareil décideur compromis (révocation de sa clé).
- **Arrêt d'urgence** visible dans le Dashboard : il suspend les niveaux 3 et 4 et laisse les niveaux 1 et 2.
- **Journal** : qui (principal, appareil), quoi (outil, entrée hachée), pourquoi (proposition, permission), quand, résultat. `pushSecurityJournal` (`mcp_security.js:108`) en est l'amorce, mais il est en mémoire ; il faut le rendre durable via les Atomes.
- **Lire / préparer / exécuter / orchestrer** restent des capacités distinctes, jamais déduites l'une de l'autre (§4.2).

---

## 9. Contraintes : sécurité, confidentialité, disponibilité, énergie, maintenance, coûts

**Sécurité, par menace (§4.2 « Agent permanent »)**

| Menace | Gravité / probabilité (hypothèses) | Protection |
| --- | --- | --- |
| Exécution non consentie (injection d'instructions dans un mail) | Élevée / moyenne | Contenu = donnée ; aucun outil dérivé d'un mail ; niveau 3 limité à des actions réversibles ; `mail_trust_scoring` reste un filtre, jamais une preuve |
| Décision rejouée ou doublée | Élevée / moyenne | Confirmation à usage unique, expirée, liée à la session ; idempotence ; acquittement |
| Push sensible sur écran verrouillé | Moyenne / élevée si rien n'est fait | Charge utile neutre (existante) ; enrichissement seulement après déverrouillage, par l'extension |
| iPhone volé ou compromis | Élevée / faible | Actions d'exécution en `authenticationRequired` ou `.foreground` ; révocation de la clé ; assurance `hardware_uv` |
| Serveur atome compromis | Élevée / faible | Mode C : ni identifiants ni contenu en clair ; il peut au pire envoyer des sonnettes ou retarder ; l'instance re-vérifie les permissions |
| Mac compromis | Très élevée pour l'utilisateur / faible | FileVault, compte macOS dédié, trousseau ; révocation de l'agent depuis l'iPhone ; portée minimale du compte mail (mot de passe d'application) |
| Routes mail sans principal visible | À évaluer / à confirmer | Avant tout usage permanent : passer par `/ws/api` authentifié et ne plus transmettre d'identifiants dans le corps (`bootstrap_connector.js:128-189`). Ce point dépasse l'étude et appelle un lot autorisé |
| Détournement du VoIP pour réveiller l'app | Élevée (risque d'interdiction) | Interdit (S21) |

**Confidentialité** : le minimum dans le push ; les métadonnées serveur limitées à identifiant opaque, priorité et horodatage ; une durée de conservation pour les propositions ; l'export et l'effacement des propositions et du journal.

**Disponibilité** : APNs fait au mieux (S6) ; le Mac peut s'éteindre (coupure, mise à jour). L'état de l'agent doit être visible. Le redémarrage automatique après coupure de courant et le maintien en éveil sont des réglages macOS **à vérifier** [Prototype requis]. En mode C, il n'y a pas de bascule automatique vers le serveur.

**Énergie** : sur l'iPhone, rien de permanent, seulement des pushes visibles en faible nombre. Sur le Mac, ~4 W au repos pour un Mac mini M4 de base (S23, lu via extrait de recherche), plus des pics d'inférence. L'IA distante a un coût par appel : il faut des quotas (`ai/quota_tracker.js` existe, non audité ici).

**Maintenance** : un seul runtime pour deux hébergements ; mises à jour de l'instance ; compatibilité iOS 16.6 → 27 par `@available` ; deux environnements APNs (`development` / production).

**Coûts** : A et C, matériel et électricité côté utilisateur ; B, hébergement et coffre de secrets par utilisateur ; dans tous les cas, appels au fournisseur IA. **Aucun chiffre tarifaire n'est avancé** : il faudrait consulter les tarifs du fournisseur choisi au moment de décider.

---

## 10. Plan progressif futur — composants et tests, **sans exécution**

Aucune étape n'est autorisée par ce document. Chacune exige une demande humaine couvrant le lot et ses validations (§1.15).

**Phase 0 — Prototypes de faisabilité (pas de production)**
- P0.1 [Prototype requis] Matrice d'états iOS sur iPhone physique (iOS 27.x, et une version plus ancienne si disponible) : push alerte après fermeture forcée (affichage) ; action sans `.foreground` après fermeture forcée (l'app est-elle lancée ?) ; action sur appareil verrouillé avec la base SQLite du groupe d'apps (classe de protection) ; extension de service avant et après le premier déverrouillage ; téléphone éteint, puis rallumé (quelle notification arrive ?).
- P0.2 [Prototype requis] Runtime sans interface sur Mac : `NodeImapClient` en lecture seule sur une boîte de test, identifiants dans le trousseau, aucun envoi.
- P0.3 [Prototype requis] Connexion sortante de l'agent vers `/ws/api` et commande distante de lecture seule depuis l'iPhone.

**Phase 1 — Niveau 1 (information)**
- Composants : classe d'appareil « agent » ; surveillance mail (IDLE ou interrogation) ; type d'Atome proposition et information ; tuile d'état de l'agent dans le Dashboard.
- Tests : un mail de test important produit une entrée `priority` sans push ; un mail ordinaire ne produit aucun push ; un mail piégé (injection d'instructions) ne déclenche aucun outil ; avec l'agent hors ligne, l'état est visible.

**Phase 2 — Niveau 2 (proposition et décision)**
- Composants : catégories `UNNotificationCategory` dans `AppNativeCommunication` ; extension du payload serveur (`category`, `mutable-content`, `thread-id`) ; cible d'extension de service ; confirmation persistante, signée et à usage unique ; enveloppe chiffrée vers les appareils.
- Tests (§6.4) : simulation d'un mail important **sans aucune divulgation** sur l'écran verrouillé (capture) ; Consulter ouvre le bon message en moins de 1 s, sans recherche ; Préparer ne produit aucun envoi (vérifié dans le journal SMTP de test) ; Reporter crée l'alarme ; double tap ou rejeu → une seule exécution ; décision arrivée après l'échéance → refus explicite.

**Phase 3 — Niveau 3 (actions préautorisées)**
- Composants : Atome permission (périmètre, expiration, plafond) ; vérification à l'exécution ; arrêt d'urgence ; journal durable.
- Tests : action hors périmètre → refus ; permission révoquée entre la proposition et l'exécution → refus ; agent révoqué → plus aucun push ni exécution ; Mac éteint pendant une exécution → reprise sans doublon.

**Phase 4 — Niveau 4 (orchestration)**
- Composants : plan multi-étapes approuvé en bloc ; suivi d'avancement (éventuellement Live Activity par push, iOS ≥ 17.2) ; arrêt à chaque étape.
- Tests : interruption au milieu du plan → état cohérent et visible ; scénarios de compromission (iPhone, serveur, Mac) rejoués avec les révocations.

**Hors plan tant que non vérifié** : actions Siri/AirPods iOS 27 sur notifications (S14) ; `LongRunningIntent` (S13) ; mode B (identifiants sur le serveur) ; portage Tauri iOS.

**Conclusion.** Une permanence réaliste se fait **hors de l'iPhone** : une instance eVe sur une machine contrôlée par l'utilisateur (mode C), avec le serveur atome comme relais et émetteur APNs. L'iPhone ne reçoit que des sonnettes neutres et sert à décider. Les briques de livraison existent déjà ; les briques de permanence et de permission restent à créer en interne, après des prototypes qui trancheront les points « V » du tableau iOS, en premier lieu le comportement des actions de notification après fermeture forcée.
