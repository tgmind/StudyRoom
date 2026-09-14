# Android Deep Linking Roadmap for Next APK Release

> **CRITICAL INSTRUCTION FOR NEXT APK BUILD ON GITHUB:**
> When the user requests to build the APK and release the next version on GitHub, the agent MUST implement Android App Linking for `https://studyalive.netlify.app/room` inside `android/app/src/main/AndroidManifest.xml` and `MainActivity.java`.

## Target Requirements
1. **Domain**: `studyalive.netlify.app`
2. **Path**: `/room` (and `/login`)
3. **Behavior**: When a user clicks the "Continue Studying in Room →" button in an email on an Android phone with StudyRoom installed, Android will automatically open the native StudyRoom app directly to the `/room` view without opening the browser.

## Required Modifications for Next APK Release:
### 1. `android/app/src/main/AndroidManifest.xml`
Add an intent filter to `MainActivity`:
```xml
<activity
    android:name=".MainActivity"
    android:theme="@style/Theme.StudyRoom.Splash"
    android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboardHidden|uiMode"
    android:windowSoftInputMode="adjustResize"
    android:exported="true">

    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>

    <!-- Deep Link Intent Filter for studyalive.netlify.app/room -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="studyalive.netlify.app" android:pathPrefix="/room" />
        <data android:scheme="https" android:host="studyalive.netlify.app" android:pathPrefix="/login" />
    </intent-filter>
</activity>
```

### 2. `android/app/src/main/java/com/studyroom/app/MainActivity.java`
In `onCreate` and `onNewIntent`, handle incoming intent URIs:
```java
@Override
protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleIncomingDeepLink(intent);
}

private void handleIncomingDeepLink(Intent intent) {
    Uri data = intent.getData();
    if (data != null && webView != null) {
        String targetUrl = data.toString();
        if (targetUrl.startsWith(baseUrl)) {
            webView.loadUrl(targetUrl);
        }
    }
}
```
