plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "one.atome.billing"
    compileSdk = 36

    defaultConfig {
        // Play Billing Library 8 requires API 21; the app ships API 29+.
        minSdk = 21
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    // Google Play Billing Library (merges the com.android.vending.BILLING permission).
    implementation("com.android.billingclient:billing:8.0.0")
    implementation(project(":tauri-android"))
}
