// Single catalog of health monitors. The Dashboard selector, the native
// request builder, the Conditions `health` source and the coverage test all
// read this table; no second list may exist. Native hosts keep their own
// allow-list keyed by the same ids (Swift/Kotlin) and a probe checks both stay
// identical.
//
// Shapes:     quantity | correlation | category | session
// Strategies: latest        last sample by measurement end, bounded lookback
//             daily_sum     native cumulative statistic over the civil day
//             latest_pair   one correlated measurement (blood pressure)
//             last_sleep    last sleep session, asleep intervals merged
//             daily_sessions union of session intervals over the civil day
//             device_steps  direct phone sensor (distinct meaning, see label)

const freeze = (value) => Object.freeze(value);

const monitor = (id, definition) => freeze({
    id,
    labelKey: `eve.health.monitor.${id}`,
    ...definition,
    ios: definition.ios ? freeze({ ...definition.ios }) : null,
    android: definition.android ? freeze({ ...definition.android }) : null,
    direct: definition.direct ? freeze({ ...definition.direct }) : null
});

const HC = 'android.permission.health.';
const DAY = 24 * 60 * 60 * 1000;

export const HEALTH_FAMILIES = freeze(['activity', 'heart', 'vitals', 'body', 'sleep', 'nutrition', 'mind']);

export const HEALTH_MONITORS = freeze([
    // Activity — cumulative over the civil day. Native statistics dedupe sources.
    monitor('steps', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'count', meaning: 'steps_today_all_sources',
        ios: { type: 'HKQuantityTypeIdentifierStepCount', unit: 'count' },
        android: { record: 'StepsRecord', permission: `${HC}READ_STEPS`, metric: 'COUNT_TOTAL' }
    }),
    monitor('distance_walking_running', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'm', meaning: 'distance_walking_running_today',
        ios: { type: 'HKQuantityTypeIdentifierDistanceWalkingRunning', unit: 'm' }
    }),
    monitor('distance', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'm', meaning: 'distance_all_activities_today',
        android: { record: 'DistanceRecord', permission: `${HC}READ_DISTANCE`, metric: 'DISTANCE_TOTAL' }
    }),
    monitor('distance_cycling', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'm', meaning: 'distance_cycling_today',
        ios: { type: 'HKQuantityTypeIdentifierDistanceCycling', unit: 'm' }
    }),
    monitor('distance_wheelchair', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'm', meaning: 'distance_wheelchair_today',
        ios: { type: 'HKQuantityTypeIdentifierDistanceWheelchair', unit: 'm' }
    }),
    monitor('wheelchair_pushes', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'count', meaning: 'wheelchair_pushes_today',
        ios: { type: 'HKQuantityTypeIdentifierPushCount', unit: 'count' },
        android: { record: 'WheelchairPushesRecord', permission: `${HC}READ_WHEELCHAIR_PUSHES`, metric: 'COUNT_TOTAL' }
    }),
    monitor('floors_climbed', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'count', meaning: 'floors_climbed_today',
        ios: { type: 'HKQuantityTypeIdentifierFlightsClimbed', unit: 'count' },
        android: { record: 'FloorsClimbedRecord', permission: `${HC}READ_FLOORS_CLIMBED`, metric: 'FLOORS_CLIMBED_TOTAL' }
    }),
    monitor('active_energy', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'kcal', meaning: 'active_energy_today',
        ios: { type: 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'kcal' },
        android: { record: 'ActiveCaloriesBurnedRecord', permission: `${HC}READ_ACTIVE_CALORIES_BURNED`, metric: 'ACTIVE_CALORIES_TOTAL' }
    }),
    // Basal energy (iOS: energy burned at rest, cumulative) and basal metabolic
    // rate (Health Connect: a rate in kcal/day) are different measures.
    monitor('basal_energy', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'kcal', meaning: 'resting_energy_today',
        ios: { type: 'HKQuantityTypeIdentifierBasalEnergyBurned', unit: 'kcal' }
    }),
    monitor('basal_metabolic_rate', {
        family: 'body', shape: 'quantity', strategy: 'latest', unit: 'kcal/d', meaning: 'basal_metabolic_rate', lookbackMs: 365 * DAY,
        android: { record: 'BasalMetabolicRateRecord', permission: `${HC}READ_BASAL_METABOLIC_RATE` }
    }),
    monitor('total_energy', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'kcal', meaning: 'total_energy_today',
        android: { record: 'TotalCaloriesBurnedRecord', permission: `${HC}READ_TOTAL_CALORIES_BURNED`, metric: 'ENERGY_TOTAL' }
    }),
    monitor('exercise_minutes', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'min', meaning: 'apple_exercise_time_today',
        ios: { type: 'HKQuantityTypeIdentifierAppleExerciseTime', unit: 'min' }
    }),
    monitor('stand_minutes', {
        family: 'activity', shape: 'quantity', strategy: 'daily_sum', unit: 'min', meaning: 'apple_stand_time_today',
        ios: { type: 'HKQuantityTypeIdentifierAppleStandTime', unit: 'min' }
    }),
    monitor('workout_duration', {
        family: 'activity', shape: 'session', strategy: 'daily_sessions', unit: 'min', meaning: 'workout_sessions_duration_today',
        ios: { type: 'HKWorkoutType' },
        android: { record: 'ExerciseSessionRecord', permission: `${HC}READ_EXERCISE` }
    }),
    monitor('walking_speed', {
        family: 'activity', shape: 'quantity', strategy: 'latest', unit: 'm/s', meaning: 'walking_speed', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierWalkingSpeed', unit: 'm/s' }
    }),
    // Direct phone sensors: distinct meaning from the store totals above.
    monitor('device_steps_today', {
        family: 'activity', shape: 'quantity', strategy: 'device_steps', unit: 'count', meaning: 'steps_today_this_iphone_motion_sensor',
        direct: { host: 'ios', api: 'CMPedometer', permission: 'motion', live: true }
    }),
    monitor('device_steps_session', {
        family: 'activity', shape: 'quantity', strategy: 'device_steps', unit: 'count', meaning: 'steps_since_monitor_started_this_phone_sensor',
        direct: { host: 'android', api: 'TYPE_STEP_COUNTER', permission: 'android.permission.ACTIVITY_RECOGNITION', live: true }
    }),

    // Heart — point samples. HRV methods are kept apart (SDNN ≠ RMSSD).
    monitor('heart_rate', {
        family: 'heart', shape: 'quantity', strategy: 'latest', unit: 'bpm', meaning: 'heart_rate', lookbackMs: 7 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierHeartRate', unit: 'count/min' },
        android: { record: 'HeartRateRecord', permission: `${HC}READ_HEART_RATE` }
    }),
    monitor('resting_heart_rate', {
        family: 'heart', shape: 'quantity', strategy: 'latest', unit: 'bpm', meaning: 'resting_heart_rate', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierRestingHeartRate', unit: 'count/min' },
        android: { record: 'RestingHeartRateRecord', permission: `${HC}READ_RESTING_HEART_RATE` }
    }),
    monitor('walking_heart_rate_average', {
        family: 'heart', shape: 'quantity', strategy: 'latest', unit: 'bpm', meaning: 'walking_heart_rate_average', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierWalkingHeartRateAverage', unit: 'count/min' }
    }),
    monitor('hrv_sdnn', {
        family: 'heart', shape: 'quantity', strategy: 'latest', unit: 'ms', meaning: 'heart_rate_variability', method: 'sdnn', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', unit: 'ms' }
    }),
    monitor('hrv_rmssd', {
        family: 'heart', shape: 'quantity', strategy: 'latest', unit: 'ms', meaning: 'heart_rate_variability', method: 'rmssd', lookbackMs: 30 * DAY,
        android: { record: 'HeartRateVariabilityRmssdRecord', permission: `${HC}READ_HEART_RATE_VARIABILITY` }
    }),

    // Vitals.
    monitor('respiratory_rate', {
        family: 'vitals', shape: 'quantity', strategy: 'latest', unit: 'breaths/min', meaning: 'respiratory_rate', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierRespiratoryRate', unit: 'count/min' },
        android: { record: 'RespiratoryRateRecord', permission: `${HC}READ_RESPIRATORY_RATE` }
    }),
    // HealthKit reports a fraction (0.98), Health Connect a percentage (98).
    monitor('oxygen_saturation', {
        family: 'vitals', shape: 'quantity', strategy: 'latest', unit: '%', meaning: 'oxygen_saturation', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierOxygenSaturation', unit: '%', scale: 'fraction' },
        android: { record: 'OxygenSaturationRecord', permission: `${HC}READ_OXYGEN_SATURATION`, scale: 'percent' }
    }),
    monitor('blood_pressure', {
        family: 'vitals', shape: 'correlation', strategy: 'latest_pair', unit: 'mmHg', meaning: 'blood_pressure_systolic_diastolic', lookbackMs: 90 * DAY,
        ios: { type: 'HKCorrelationTypeIdentifierBloodPressure', unit: 'mmHg' },
        android: { record: 'BloodPressureRecord', permission: `${HC}READ_BLOOD_PRESSURE` }
    }),
    monitor('blood_glucose', {
        family: 'vitals', shape: 'quantity', strategy: 'latest', unit: 'mg/dL', meaning: 'blood_glucose', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierBloodGlucose', unit: 'mg/dL' },
        android: { record: 'BloodGlucoseRecord', permission: `${HC}READ_BLOOD_GLUCOSE` }
    }),
    monitor('body_temperature', {
        family: 'vitals', shape: 'quantity', strategy: 'latest', unit: 'degC', meaning: 'body_temperature', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierBodyTemperature', unit: 'degC' },
        android: { record: 'BodyTemperatureRecord', permission: `${HC}READ_BODY_TEMPERATURE` }
    }),
    monitor('basal_body_temperature', {
        family: 'vitals', shape: 'quantity', strategy: 'latest', unit: 'degC', meaning: 'basal_body_temperature', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierBasalBodyTemperature', unit: 'degC' },
        android: { record: 'BasalBodyTemperatureRecord', permission: `${HC}READ_BASAL_BODY_TEMPERATURE` }
    }),
    // Absolute sleeping wrist temperature (iOS) vs skin temperature DELTA to a
    // baseline (Health Connect): never the same monitor.
    monitor('sleeping_wrist_temperature', {
        family: 'vitals', shape: 'quantity', strategy: 'latest', unit: 'degC', meaning: 'sleeping_wrist_temperature_absolute', lookbackMs: 30 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature', unit: 'degC', minOS: '16.0' }
    }),
    monitor('skin_temperature_delta', {
        family: 'vitals', shape: 'quantity', strategy: 'latest', unit: 'degC_delta', meaning: 'skin_temperature_delta_from_baseline', lookbackMs: 30 * DAY,
        android: { record: 'SkinTemperatureRecord', permission: `${HC}READ_SKIN_TEMPERATURE`, feature: 'FEATURE_SKIN_TEMPERATURE' }
    }),
    monitor('vo2_max', {
        family: 'vitals', shape: 'quantity', strategy: 'latest', unit: 'mL/(kg*min)', meaning: 'vo2_max', lookbackMs: 365 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierVO2Max', unit: 'mL/(kg*min)' },
        android: { record: 'Vo2MaxRecord', permission: `${HC}READ_VO2_MAX` }
    }),

    // Body.
    monitor('weight', {
        family: 'body', shape: 'quantity', strategy: 'latest', unit: 'kg', meaning: 'body_mass', lookbackMs: 365 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierBodyMass', unit: 'kg' },
        android: { record: 'WeightRecord', permission: `${HC}READ_WEIGHT` }
    }),
    monitor('height', {
        family: 'body', shape: 'quantity', strategy: 'latest', unit: 'cm', meaning: 'height', lookbackMs: 3650 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierHeight', unit: 'cm' },
        android: { record: 'HeightRecord', permission: `${HC}READ_HEIGHT` }
    }),
    monitor('body_fat', {
        family: 'body', shape: 'quantity', strategy: 'latest', unit: '%', meaning: 'body_fat_percentage', lookbackMs: 365 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierBodyFatPercentage', unit: '%', scale: 'fraction' },
        android: { record: 'BodyFatRecord', permission: `${HC}READ_BODY_FAT`, scale: 'percent' }
    }),
    monitor('lean_body_mass', {
        family: 'body', shape: 'quantity', strategy: 'latest', unit: 'kg', meaning: 'lean_body_mass', lookbackMs: 365 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierLeanBodyMass', unit: 'kg' },
        android: { record: 'LeanBodyMassRecord', permission: `${HC}READ_LEAN_BODY_MASS` }
    }),
    // Native BMI sample only (HealthKit). No derived BMI is computed here.
    monitor('body_mass_index', {
        family: 'body', shape: 'quantity', strategy: 'latest', unit: 'kg/m2', meaning: 'body_mass_index_native_sample', lookbackMs: 365 * DAY,
        ios: { type: 'HKQuantityTypeIdentifierBodyMassIndex', unit: 'count' }
    }),
    monitor('bone_mass', {
        family: 'body', shape: 'quantity', strategy: 'latest', unit: 'kg', meaning: 'bone_mass', lookbackMs: 365 * DAY,
        android: { record: 'BoneMassRecord', permission: `${HC}READ_BONE_MASS` }
    }),
    monitor('body_water_mass', {
        family: 'body', shape: 'quantity', strategy: 'latest', unit: 'kg', meaning: 'body_water_mass', lookbackMs: 365 * DAY,
        android: { record: 'BodyWaterMassRecord', permission: `${HC}READ_BODY_WATER_MASS` }
    }),

    // Sleep — last session, asleep intervals merged (never in-bed + stages).
    monitor('sleep', {
        family: 'sleep', shape: 'session', strategy: 'last_sleep', unit: 'min', meaning: 'last_sleep_session', lookbackMs: 3 * DAY,
        ios: { type: 'HKCategoryTypeIdentifierSleepAnalysis' },
        android: { record: 'SleepSessionRecord', permission: `${HC}READ_SLEEP` }
    }),

    // Nutrition / mind.
    monitor('hydration', {
        family: 'nutrition', shape: 'quantity', strategy: 'daily_sum', unit: 'mL', meaning: 'water_intake_today',
        ios: { type: 'HKQuantityTypeIdentifierDietaryWater', unit: 'mL' },
        android: { record: 'HydrationRecord', permission: `${HC}READ_HYDRATION`, metric: 'VOLUME_TOTAL' }
    }),
    monitor('mindful_minutes', {
        family: 'mind', shape: 'session', strategy: 'daily_sessions', unit: 'min', meaning: 'mindful_sessions_duration_today',
        ios: { type: 'HKCategoryTypeIdentifierMindfulSession' }
    })
]);

// Documented exclusions: never requested, not even "for later".
export const HEALTH_EXCLUDED = freeze([
    freeze({ id: 'clinical_records', reason: 'fhir_clinical_out_of_scope' }),
    freeze({ id: 'ecg', reason: 'electrocardiogram_out_of_scope' }),
    freeze({ id: 'exercise_route', reason: 'location_route_out_of_scope' }),
    freeze({ id: 'menstruation_and_sexual_activity', reason: 'reproductive_health_special_handling_not_implemented' }),
    freeze({ id: 'nutrition_details', reason: 'nutrition_out_of_monitor_scope' }),
    freeze({ id: 'speed_power_cadence_series', reason: 'workout_series_not_a_dashboard_monitor' }),
    freeze({ id: 'android_mindfulness_session', reason: 'requires_connect_client_feature_not_in_retained_stable_sdk' })
]);

const byId = new Map(HEALTH_MONITORS.map((entry) => [entry.id, entry]));

export const getHealthMonitor = (id) => byId.get(String(id || '')) || null;

// Hosts: 'ios' | 'android'. A monitor is offered on a host only when its
// adapter exists there; the host's runtime capability answer refines this.
export const healthMonitorsForHost = (host) => HEALTH_MONITORS.filter((entry) => (
    host === 'ios' ? Boolean(entry.ios || entry.direct?.host === 'ios')
        : host === 'android' ? Boolean(entry.android || entry.direct?.host === 'android')
            : false
));

export const androidReadPermissions = () => Array.from(new Set(
    HEALTH_MONITORS.map((entry) => entry.android?.permission).filter(Boolean)
)).sort();
