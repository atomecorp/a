import java.util.Properties

// The Wear OS recorder of eVe sessions (src/main/java/one/atome/wear): the wrist's raw motion, sent to
// the phone at the end of each session. Same application id and signing as the phone app (:app), which
// the data layer requires to pair them. Built on its own: ./gradlew :wear:assembleRelease.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val tauriProperties = Properties().apply {
    val propFile = rootProject.file("app/tauri.properties")
    if (propFile.exists()) propFile.inputStream().use { load(it) }
}
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.isFile) keystorePropertiesFile.inputStream().use { load(it) }
}

android {
    compileSdk = 36
    namespace = "one.atome.wear"
    defaultConfig {
        applicationId = "one.atome.app"
        // Wear OS 3 and later.
        minSdk = 30
        targetSdk = 36
        // A watch build carries its own version code, above every phone build of the same version.
        versionCode = 1_000_000_000 + tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        if (keystorePropertiesFile.isFile) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            // Paired with the phone's debug build (:app debug carries the same suffix).
            applicationIdSuffix = ".debug"
        }
        getByName("release") {
            if (keystorePropertiesFile.isFile) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    // The sensor recording writer and specs, shared with the phone recorder (tauri-plugin-health).
    sourceSets {
        getByName("main") {
            java.srcDir("../../../vendor/sensor-recording/android")
        }
    }
}

dependencies {
    implementation("com.google.android.gms:play-services-wearable:18.2.0")
}
