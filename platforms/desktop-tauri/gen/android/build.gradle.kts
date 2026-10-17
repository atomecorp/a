buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// Inspect the existing AGP dependency graph; never download a second bundletool.
// The release validator invokes BundleToolMain with this exact resolved classpath.
val atomeAndroidTools = buildscript.configurations.getByName("classpath")
tasks.register("atomeBundletoolClasspath") {
    doLast {
        println("ATOME_BUNDLETOOL_CLASSPATH=" + atomeAndroidTools.asPath)
    }
}

tasks.register("clean").configure {
    delete("build")
}

