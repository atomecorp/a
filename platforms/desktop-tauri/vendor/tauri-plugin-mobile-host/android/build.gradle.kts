plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

fun publicConfig(name: String) = "\"" + (System.getenv(name) ?: "")
    .replace("\\", "\\\\").replace("\"", "\\\"") + "\""

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
