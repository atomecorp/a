plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

fun publicConfig(name: String) = "\"" + (System.getenv(name) ?: "")
    .replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\""

android {
    namespace = "one.atome.mobile"
    compileSdk = 36
    defaultConfig {
        minSdk = 29
        consumerProguardFiles("consumer-rules.pro")
        for ((field, variable) in mapOf("FIREBASE_APP_ID" to "ATOME_ANDROID_FIREBASE_APP_ID",
            "FIREBASE_API_KEY" to "ATOME_ANDROID_FIREBASE_API_KEY",
            "FIREBASE_SENDER_ID" to "ATOME_ANDROID_FIREBASE_SENDER_ID",
            "FIREBASE_PROJECT_ID" to "ATOME_ANDROID_FIREBASE_PROJECT_ID")) {
            buildConfigField("String", field, publicConfig(variable))
        }
        // FirebaseInitProvider initializes the same public options on a cold
        // FCM wake, before FirebaseMessagingService runs; auto-init stays off.
        for ((resource, variable) in mapOf("google_app_id" to "ATOME_ANDROID_FIREBASE_APP_ID",
            "google_api_key" to "ATOME_ANDROID_FIREBASE_API_KEY",
            "gcm_defaultSenderId" to "ATOME_ANDROID_FIREBASE_SENDER_ID",
            "project_id" to "ATOME_ANDROID_FIREBASE_PROJECT_ID")) {
            val value = System.getenv(variable) ?: ""
            require(value.matches(Regex("[A-Za-z0-9_:.\\-]*"))) { "Invalid public Firebase option: $variable" }
            resValue("string", resource, value)
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions { jvmTarget = "1.8" }
}

dependencies {
    implementation("com.google.firebase:firebase-messaging:25.1.3")
    implementation("androidx.core:core-ktx:1.9.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation(project(":tauri-android"))
}
