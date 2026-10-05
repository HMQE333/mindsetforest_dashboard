import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The release key is kept out of this public repo (see README.md). Without it
// the release build is signed with the local debug key, which installs fine
// but cannot update an APK signed with the real key.
val releaseKeystore: String? = System.getenv("MF_KEYSTORE")?.takeIf { it.isNotBlank() }

android {
    namespace = "app.mindsetforest.phone"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.mindsetforest.phone"
        minSdk = 28
        targetSdk = 36
        versionCode = 3
        versionName = "1.2"
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("MF_KEYSTORE_PASSWORD")
                keyAlias = "mindsetforest"
                keyPassword = System.getenv("MF_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    // Android's org.json is a stub on the JVM; the real one lets SupabaseApi run in unit tests.
    testImplementation("org.json:json:20260814")
}
