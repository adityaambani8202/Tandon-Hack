import java.util.Properties

plugins {
    id("com.android.application")
}

// Server address comes from local.properties (not shared in git):
//   medly.serverUrl=http://10.0.2.2:3000      <- Android emulator talking to your laptop
//   medly.serverUrl=http://192.168.1.23:3000  <- real phone on the same Wi-Fi as your laptop
//   medly.serverUrl=https://your-app.onrender.com
// The AI key (ANTHROPIC_API_KEY or GEMINI_API_KEY) stays on the server, never in the app.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val serverUrl: String = localProps.getProperty("medly.serverUrl") ?: "http://10.0.2.2:3000"

android {
    namespace = "com.homestretch.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.homestretch.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"

        buildConfigField("String", "SERVER_URL", "\"$serverUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.activity:activity:1.9.3")
    implementation("androidx.fragment:fragment:1.8.5")
    implementation("androidx.core:core:1.15.0")
}
