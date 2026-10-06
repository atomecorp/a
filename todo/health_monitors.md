# Moniteurs de santé iOS / Android — journal d'exécution

Source : `~/Desktop/atome_health.rtf` (v2, 1er oct. 2026). Plan : `~/.claude/plans/vas-y-o-fait-declarative-canyon.md`.

## Décisions d'audit (fixées)

- Moniteur (`monitor`) = rubrique vide, « Nouveau » no-op → aucun moniteur non médical à préserver.
- Chemin Santé existant = FC seule, iOS app seule (`native_health.js`, `live_sources.js`, `AppNativeHealthController.swift`).
- Identité native vérifiée : iOS `AiSRuntime.verifyToken` (claim `grant` = compte réel, guest refusé) ; Android `auth_local_request` action `me` sur l'axum local (même chemin que `auth_device.rs`).
- Canal scellé : jeton émis une fois par chargement de WebView (iOS : `didStartProvisionalNavigation` ; Android : `on_page_load` Started).
- Android : plugin `vendor/tauri-plugin-health` SANS commande JS ; seule la commande d'app `health_invoke` (gardée) l'appelle.

## Lots

- [x] Lot 1 — catalogue + contrat de données (JS pur) — sonde `temp/health_values.probe.mjs` 15/15
- [x] Lot 2 — propriétaire Santé JS + canal scellé + filtre MCP + scellement éditeur — `temp/health_owner.probe.mjs` 11/11, link ESM OK, test dépôt conditions 13/13
- [x] Lot 3 — iOS HealthKit + CMPedometer — typage Swift app + AUv3 OK ; build Xcode complet bloqué (disque)
- [ ] Lot 4 — Android Health Connect + capteur de pas — code écrit, `cargo check` desktop OK ; **Kotlin jamais compilé** (disque plein) → reste ouvert
- [x] Lot 5 — UI Dashboard (Moniteur → Nouveau → panneau → cellules) — module 9/9, route réelle Web 9/9 (clics canvas, captures lues)
- [x] Lot 6 — `atome/documentations/health_monitors.md` (matrice générée du catalogue), `conditions.md`, 4 maps, FRAMEWORK_STATE

## Journal

- Lot 3 iOS écrit : contrôleur HealthKit étendu (canal, identité `verifyToken`, liaison Keychain, lecture par stratégie, observers par type, CMPedometer), reset canal sur navigation, commandes health_* limitées au cadre principal de la page embarquée, AUv3 → `health_host_unsupported`, Info.plist (NSHealthUpdate retiré, NSMotion ajouté). Build simulateur en cours.
- Lot 4 Android écrit : `vendor/tauri-plugin-health` (aucune commande JS), `src/native_health.rs` (`health_invoke` gardé), permission `health-bridge`, reset sur `on_page_load`, intents de justification sur MainActivity. `cargo check` en cours.
- Cohérence catalogue ↔ Swift ↔ Kotlin ↔ manifeste : `temp/health_native_tables.probe.mjs` OK (33 iOS / 27 Android / 27 permissions).
- Abandon motivé : changes tokens Health Connect non utilisés (relecture d'agrégats toutes les 60 s au premier plan suffit pour des résumés, cf. §8).
- Lot 5 : « Nouveau » de Moniteur → panneau `dashboard_health_monitors` (liste + rail de cases standard), cellules `metadata.health_monitor` (défilent, pas épinglées ; restent dans la vue filtrée ; ni glisser vers projet, ni Mystic, ni renommage) ; instance Dashboard embarquée (Matrix) sans santé ; persistance générique `persistDashboardPreference` avec rollback ; `normalizeDashboardPreferences` garde `health_monitors`.
- Corrigé pendant la vérif réelle : module non démarré sur les chemins reprise/reciblage du Dashboard ; état tronqué « Indisponib. » → libellés à retour à la ligne.
- BLOCAGE environnement : disque plein (186 Mo libres). Les builds iOS (DerivedData temporaire) et APK Android ont échoué sur `No space left on device`, et non sur le code. J'ai supprimé uniquement mon DerivedData temporaire (3,6 Go). Rebuild iOS incrémental relancé dans le DerivedData Xcode existant, avec une garde d'espace libre.
- Fin de session : typage Swift app/AUv3 OK (contrôle négatif vérifié). Build Xcode stoppé par la garde (1,4 Go libres). Essai Gradle du plugin stoppé par la garde (577 Mo) ; il avait téléchargé ~800 Mo dans `temp/android-home/gradle` (mauvais GRADLE_USER_HOME), contenu supprimé ; `tauri.settings.gradle` restauré à l'identique.
- Reste à faire pour clore le Lot 4 : libérer de l'espace disque, puis `./run.sh apk --dev`, et corriger d'éventuelles erreurs Kotlin (`HealthConnectFeatures`, `SkinTemperatureRecord`, API 1.1.0).
- Correctif 2026-10-06 : l'upload App Store (altool) a été refusé avec l'erreur 90683 « Missing purpose string … NSHealthUpdateUsageDescription ». L'entitlement `com.apple.developer.healthkit` de l'app cible couvrant lecture **et** écriture, Apple exige les deux chaînes de finalité, même si le code reste lecture seule. Le retrait de `NSHealthUpdateUsageDescription` du Lot 3 était donc incompatible avec la validation ; la clé est rétablie dans `platforms/ios/atome-auv3/application/Info.plist` avec un texte fidèle (aucune écriture dans Santé), et la sonde `tests/probes/native_health_authorization_contract.test.mjs` vérifie désormais sa présence tout en continuant d'interdire tout `save`/`delete`.
