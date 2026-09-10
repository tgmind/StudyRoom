# StudyRoom ProGuard Rules
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.studyroom.app.MainActivity$WebAppInterface { *; }
