# Moniteurs de santé (rubrique Moniteur du Dashboard)

Statut au 1er octobre 2026 : implémenté pour iOS (HealthKit + CMPedometer, app conteneur) et Android (Health Connect + capteur de pas, hôte Tauri mobile). Lecture seule. **Aucune vérification sur appareil physique n'a été faite** : voir « Procédures appareil ».

## Parcours

Dashboard → rubrique **Moniteur** (clé `monitor`) → bande « Nouveau » de l'en-tête → panneau Bevy standard `dashboard_health_monitors` → liste standard (`hierarchicalSelectableListNode`) avec le rail de cases standard (`createListSelectionRuntime`) → cellules de la ligne Moniteur (et sa vue filtrée existante).

- L'ouverture du panneau ne demande **aucune** permission. Elle lit seulement les capacités et la liaison.
- Cocher une case (ou une série au rail) : la sélection est enregistrée (`preferences.dashboard.health_monitors.ids`, propriétaire de profil privé), avec retour en arrière en cas d'échec. Ensuite la liaison locale est vérifiée, puis, **à la fin du geste**, une seule demande système est faite pour les types cochés. Enfin la lecture a lieu.
- Décocher : la cellule et l'abonnement sont retirés immédiatement. Aucune donnée n'est effacée dans Santé ou Health Connect, et la permission système n'est pas révoquée.
- Deux actions seulement s'ajoutent, en pied du même panneau et uniquement quand elles servent : « Associer » (liaison locale) et « Autoriser l'accès » (essai volontaire après refus ou autorisation manquante).

## Architecture (propriétaires)

| Rôle | Fichier |
|---|---|
| Catalogue unique (UI, adaptateurs, Conditions, tests) | `atome/src/squirrel/health/health_catalog.js` |
| Contrat de données (plages, validation, sommeil, paires, format) | `atome/src/squirrel/health/health_values.js` |
| Canal natif scellé | `atome/src/squirrel/health/health_channel.js` |
| Propriétaire unique des lectures et abonnements | `atome/src/squirrel/health/health_owner.js`, instancié au boot par `health/index.js` (importé par `conditions/bootstrap.js`) |
| Barrière MCP | `atome/src/squirrel/health/health_actor_gate.js` + `atome/mcp_handlers_conditions.js` |
| Connecteur Conditions (consommateur) | `atome/src/squirrel/conditions/native_health.js` |
| Dashboard : sélection, projection, panneau | `eVe/domains/dashboard/dashboard_health_modules.js`, `dashboard_health_card_records.js` |
| iOS | `platforms/ios/atome-auv3/Common/AppNativeHealthController.swift` (contrôleur existant étendu) |
| Android | `platforms/desktop-tauri/vendor/tauri-plugin-health` (Kotlin `HealthPlugin`, **aucune commande JS**) + `src/native_health.rs` (`health_invoke` gardé) |

## Sécurité et confidentialité

- **Canal scellé.** L'invoke natif est capturé au boot, avant tout code projet. L'hôte émet **un seul** jeton de canal par chargement de page : un second `health_channel_open` est refusé. Le jeton est remis à zéro à chaque navigation du cadre principal (iOS `didStartProvisionalNavigation`, Tauri `on_page_load`).
- **Identité vérifiée côté natif**, jamais transmise par le JS.
  - iOS : `AiSRuntime.verifyToken` avec la claim `grant` exigée, donc les invités sont refusés.
  - Android : action `me` de l'auth Axum locale, avec un téléphone vérifié exigé.
- **Liaison locale** appareil ↔ compte, jamais synchronisée.
  - iOS : Keychain, `ThisDeviceOnly`, non synchronisable.
  - Android : `noBackupFilesDir`, exclu de l'Auto Backup.
- **Changement de compte.** Génération incrémentée, valeurs purgées, réponses tardives rejetées (JS et natif), observateurs arrêtés. Le compte B ne lit rien tant qu'il n'a pas fait sa propre association.
- **Aucune valeur sur un événement global.** Le natif ne diffuse que `atome:native-health-invalidated` (liste d'ids, sans valeur). Les valeurs ne voyagent que dans la réponse de l'invoke.
- **Cadres.** iOS n'accepte les commandes `health_*` que depuis le cadre principal de la page embarquée (même contrôle que l'auth). Tauri n'accepte que la fenêtre `main`.
- **MCP.** Tout handler Conditions servi à un acteur MCP s'exécute derrière la barrière santé. La source `health` répond alors `health_access_denied_for_actor`, y compris par un jeu de conditions, une liaison ou une propriété calculée indirecte.
- **Code utilisateur.** L'éditeur de code (`new Function`, Opal) s'exécute dans le même realm que l'app. Avant d'exécuter du code, il appelle `sealHealthAccessForUntrustedCode()` : le canal est fermé côté natif et côté JS, et les valeurs sont purgées jusqu'au rechargement.
  - **Limite résiduelle documentée** : une réponse native déjà en vol au moment précis du scellement transite encore par le résolveur global du pont (`__ATOME_NATIVE_INVOKE_RESOLVE` sur iOS).
- **Projets.** Les cellules ne sont rendues que dans le Dashboard de l'utilisateur. L'instance embarquée (module Matrix dans un projet) n'a pas de moniteur santé. Une cellule santé n'est ni glissable dans un projet, ni renommable, ni copiable (Mystic bloqué).
- **Stockage.** Les valeurs restent en mémoire, sans record, sans annuler/refaire, sans synchro, sans journal. Seuls les ids sélectionnés sont persistés, dans le profil privé.

## Rafraîchissement

| Hôte | Lecture | Actualisation | Direct | Arrière-plan |
|---|---|---|---|---|
| iOS app / HealthKit | Fenêtre bornée par type (7 j à 10 ans), `earliestPermittedSampleDate` respecté et signalé « historique partiel » | `HKObserverQuery` par type (signal sans valeur, puis relecture ciblée), relecture au retour au premier plan, interrogation toutes les 60 s tant que le Dashboard est visible | Non (une notification HealthKit n'est pas une mesure live) | Désactivé (pas de Background Delivery) |
| Android / Health Connect | `aggregate` sur le jour civil, `readRecords` paginé (≤ 4 pages × 50) | Interrogation mutualisée de 60 s au premier plan, avec backoff, et relecture au retour au premier plan | Non | Désactivé (ni `READ_HEALTH_DATA_IN_BACKGROUND` ni `READ_HEALTH_DATA_HISTORY`) |
| Sources directes | iOS `CMPedometer` (pas du jour mesurés par l'iPhone) ; Android `TYPE_STEP_COUNTER` (pas depuis l'activation, remise à zéro gérée) | Mises à jour du capteur, signal limité à une fois toutes les 5 s | Oui, par capacité réelle (absence de capteur → indisponible) | Non |
| Web, desktop, AUv3 | Non | Aucune | Non | Non |

Les Changes tokens Health Connect ne sont **pas** utilisés : pour des résumés, une relecture d'agrégat à 60 s suffit (§8 de la demande).

## Matrice de couverture (catalogue)

Chaque ligne a un adaptateur natif réel, et la cohérence catalogue ↔ Swift ↔ Kotlin ↔ manifeste est vérifiée par `temp/health_native_tables.probe.mjs`. « — » signifie que la plateforme n'a pas de type de même sens. Ce n'est pas un manque d'implémentation.

| Moniteur | Famille | Stratégie | Unité (méthode) | iOS HealthKit | Android Health Connect |
|---|---|---|---|---|---|
| `steps` | activity | daily_sum | count | `HKQuantity.StepCount` | `StepsRecord` / `READ_STEPS` |
| `distance_walking_running` | activity | daily_sum | m | `HKQuantity.DistanceWalkingRunning` | — |
| `distance` | activity | daily_sum | m | — | `DistanceRecord` / `READ_DISTANCE` |
| `distance_cycling` | activity | daily_sum | m | `HKQuantity.DistanceCycling` | — |
| `distance_wheelchair` | activity | daily_sum | m | `HKQuantity.DistanceWheelchair` | — |
| `wheelchair_pushes` | activity | daily_sum | count | `HKQuantity.PushCount` | `WheelchairPushesRecord` / `READ_WHEELCHAIR_PUSHES` |
| `floors_climbed` | activity | daily_sum | count | `HKQuantity.FlightsClimbed` | `FloorsClimbedRecord` / `READ_FLOORS_CLIMBED` |
| `active_energy` | activity | daily_sum | kcal | `HKQuantity.ActiveEnergyBurned` | `ActiveCaloriesBurnedRecord` / `READ_ACTIVE_CALORIES_BURNED` |
| `basal_energy` | activity | daily_sum | kcal | `HKQuantity.BasalEnergyBurned` | — |
| `basal_metabolic_rate` | body | latest | kcal/d | — | `BasalMetabolicRateRecord` / `READ_BASAL_METABOLIC_RATE` |
| `total_energy` | activity | daily_sum | kcal | — | `TotalCaloriesBurnedRecord` / `READ_TOTAL_CALORIES_BURNED` |
| `exercise_minutes` | activity | daily_sum | min | `HKQuantity.AppleExerciseTime` | — |
| `stand_minutes` | activity | daily_sum | min | `HKQuantity.AppleStandTime` | — |
| `workout_duration` | activity | daily_sessions | min | `HKWorkoutType` | `ExerciseSessionRecord` / `READ_EXERCISE` |
| `walking_speed` | activity | latest | m/s | `HKQuantity.WalkingSpeed` | — |
| `device_steps_today` | activity | device_steps | count | `CMPedometer` (Mouvement) | — |
| `device_steps_session` | activity | device_steps | count | — | `TYPE_STEP_COUNTER` / `ACTIVITY_RECOGNITION` |
| `heart_rate` | heart | latest | bpm | `HKQuantity.HeartRate` | `HeartRateRecord` / `READ_HEART_RATE` |
| `resting_heart_rate` | heart | latest | bpm | `HKQuantity.RestingHeartRate` | `RestingHeartRateRecord` / `READ_RESTING_HEART_RATE` |
| `walking_heart_rate_average` | heart | latest | bpm | `HKQuantity.WalkingHeartRateAverage` | — |
| `hrv_sdnn` | heart | latest | ms (SDNN) | `HKQuantity.HeartRateVariabilitySDNN` | — |
| `hrv_rmssd` | heart | latest | ms (RMSSD) | — | `HeartRateVariabilityRmssdRecord` / `READ_HEART_RATE_VARIABILITY` |
| `respiratory_rate` | vitals | latest | breaths/min | `HKQuantity.RespiratoryRate` | `RespiratoryRateRecord` / `READ_RESPIRATORY_RATE` |
| `oxygen_saturation` | vitals | latest | % | `HKQuantity.OxygenSaturation` | `OxygenSaturationRecord` / `READ_OXYGEN_SATURATION` |
| `blood_pressure` | vitals | latest_pair | mmHg | `HKCorrelation.BloodPressure` | `BloodPressureRecord` / `READ_BLOOD_PRESSURE` |
| `blood_glucose` | vitals | latest | mg/dL | `HKQuantity.BloodGlucose` | `BloodGlucoseRecord` / `READ_BLOOD_GLUCOSE` |
| `body_temperature` | vitals | latest | degC | `HKQuantity.BodyTemperature` | `BodyTemperatureRecord` / `READ_BODY_TEMPERATURE` |
| `basal_body_temperature` | vitals | latest | degC | `HKQuantity.BasalBodyTemperature` | `BasalBodyTemperatureRecord` / `READ_BASAL_BODY_TEMPERATURE` |
| `sleeping_wrist_temperature` | vitals | latest | degC | `HKQuantity.AppleSleepingWristTemperature` (iOS 16.0+) | — |
| `skin_temperature_delta` | vitals | latest | degC_delta | — | `SkinTemperatureRecord` / `READ_SKIN_TEMPERATURE` (fonctionnalité FEATURE_SKIN_TEMPERATURE) |
| `vo2_max` | vitals | latest | mL/(kg*min) | `HKQuantity.VO2Max` | `Vo2MaxRecord` / `READ_VO2_MAX` |
| `weight` | body | latest | kg | `HKQuantity.BodyMass` | `WeightRecord` / `READ_WEIGHT` |
| `height` | body | latest | cm | `HKQuantity.Height` | `HeightRecord` / `READ_HEIGHT` |
| `body_fat` | body | latest | % | `HKQuantity.BodyFatPercentage` | `BodyFatRecord` / `READ_BODY_FAT` |
| `lean_body_mass` | body | latest | kg | `HKQuantity.LeanBodyMass` | `LeanBodyMassRecord` / `READ_LEAN_BODY_MASS` |
| `body_mass_index` | body | latest | kg/m2 | `HKQuantity.BodyMassIndex` | — |
| `bone_mass` | body | latest | kg | — | `BoneMassRecord` / `READ_BONE_MASS` |
| `body_water_mass` | body | latest | kg | — | `BodyWaterMassRecord` / `READ_BODY_WATER_MASS` |
| `sleep` | sleep | last_sleep | min | `HKCategory.SleepAnalysis` | `SleepSessionRecord` / `READ_SLEEP` |
| `hydration` | nutrition | daily_sum | mL | `HKQuantity.DietaryWater` | `HydrationRecord` / `READ_HYDRATION` |
| `mindful_minutes` | mind | daily_sessions | min | `HKCategory.MindfulSession` | — |

Mesures volontairement distinctes, jamais fusionnées :
- HRV SDNN (iOS) et RMSSD (Android) ;
- énergie au repos (iOS, cumul) et métabolisme de base (Android, débit kcal/j) ;
- distance marche et course (iOS) et distance toutes activités (Android) ;
- température du poignet absolue (iOS) et écart de température cutanée (Android) ;
- pas du magasin et pas du capteur du téléphone.

Pour l'IMC, seul l'échantillon natif HealthKit est lu ; aucun IMC dérivé n'est calculé.

### Exclusions motivées (aucune permission demandée)

| Donnée | Raison |
|---|---|
| clinical_records | fhir_clinical_out_of_scope |
| ecg | electrocardiogram_out_of_scope |
| exercise_route | location_route_out_of_scope |
| menstruation_and_sexual_activity | reproductive_health_special_handling_not_implemented |
| nutrition_details | nutrition_out_of_monitor_scope |
| speed_power_cadence_series | workout_series_not_a_dashboard_monitor |
| android_mindfulness_session | requires_connect_client_feature_not_in_retained_stable_sdk |

## Validation

| Preuve | Commande | Résultat |
|---|---|---|
| Contrat de données | `TZ=Europe/Paris node temp/health_values.probe.mjs` | 15/15 |
| Propriétaire, canal, MCP, comptes | `node temp/health_owner.probe.mjs` | 11/11 |
| Module Dashboard | `node temp/health_dashboard_module.probe.mjs` | 9/9 |
| Cohérence des tables natives | `node temp/health_native_tables.probe.mjs` | OK |
| Route réelle Web (clics canvas) | `HEADLESS=0 node temp/health_monitor_ui_real_app.probe.mjs` | 9/9 |
| Test Conditions du dépôt | `node --test tests/atome/src/squirrel/conditions/conditions_dynamic.probe.mjs` | 13/13 |
| Compilation desktop Tauri (app + plugin) | `cargo check --lib` | OK, sans avertissement |
| Typage Swift cible app (73 fichiers, dont le contrôleur Santé) | `swiftc -typecheck` (SDK simulateur, iOS 15.6) | OK (contrôle négatif : une erreur injectée est bien détectée) |
| Typage Swift cible AUv3 (65 fichiers) | `swiftc -typecheck` (SDK simulateur, iOS 16.6) | OK |
| Build Xcode complet (simulateur) | `xcodebuild … build` | **BLOQUÉ** : disque plein (`No space left on device`), sans rapport avec le code |
| APK Android et compilation Kotlin du plugin | `./run.sh apk --dev` / Gradle `:tauri-plugin-health:compileDebugKotlin` | **BLOQUÉ** : disque plein, rien n'a été compilé, Kotlin **non vérifié** |

## Procédures appareil (non exécutées ici)

**iOS (iPhone réel, app `atome`)**
1. Build signé avec un profil qui inclut la capacité HealthKit.
2. Ouvrir Dashboard → Moniteur → Nouveau, cocher « Fréquence cardiaque » et « Pas ».
3. Associer, puis vérifier qu'une seule feuille Santé s'affiche avec ces deux types seulement.
4. Refuser l'un des deux. Le moniteur doit rester affiché, avec « Aucune donnée lisible » et non « refusé ».
5. Ajouter une mesure dans l'app Santé. La cellule doit se mettre à jour au retour.
6. Se déconnecter puis se connecter avec un autre compte : aucune valeur, « Association requise ».

**Android (API 34+ avec Health Connect)**
1. `./run.sh apk --dev --emulator`, ou installer l'APK sur un appareil.
2. Saisir des mesures dans Health Connect.
3. Même parcours que sur iOS. Refuser un type : « Autorisation requise » sur ce type seulement, les autres restent lisibles.
4. Activer l'accès dans les réglages de Health Connect, puis revenir dans l'app : la reprise doit être automatique.

Opérations externes non faites : déclaration Health Connect dans la Play Console, page de politique de confidentialité publique, revue App Store de l'usage HealthKit.
