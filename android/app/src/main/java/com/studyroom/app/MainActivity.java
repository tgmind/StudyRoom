package com.studyroom.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.splashscreen.SplashScreen;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SwipeRefreshLayout swipeRefreshLayout;
    private View offlineContainer;
    private Button btnRetry;

    private ValueCallback<Uri[]> fileChooserCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<String> notificationPermissionLauncher;
    private ActivityResultLauncher<Intent> installPermissionLauncher;

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    private String baseUrl;
    private long lastBackPressedTime = 0;
    private boolean isActivityVisible = false;

    private File pendingInstallApkFile = null;
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 1. Install 0ms native AndroidX splash screen before super.onCreate
        SplashScreen.installSplashScreen(this);

        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        baseUrl = getString(R.string.default_web_url);

        webView = findViewById(R.id.webView);
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout);
        offlineContainer = findViewById(R.id.offlineContainer);
        btnRetry = findViewById(R.id.btnRetry);

        setupPermissionLaunchers();
        setupFileChooserLauncher();
        setupSwipeRefresh();
        setupWebView();
        setupBackNavigation();
        setupNetworkMonitoring();

        btnRetry.setOnClickListener(v -> {
            offlineContainer.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.reload();
        });

        if (savedInstanceState == null) {
            webView.loadUrl(baseUrl + "/room");
        } else {
            webView.restoreState(savedInstanceState);
        }

        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent != null && StudySessionService.ACTION_RESUME_STUDY.equals(intent.getAction())) {
            if (webView != null) {
                // Programmatically trigger Resume in web app
                webView.evaluateJavascript(
                        "(function() {" +
                        "  var btns = document.querySelectorAll('button');" +
                        "  for (var i = 0; i < btns.length; i++) {" +
                        "    if (btns[i].textContent && btns[i].textContent.trim() === 'Resume') {" +
                        "      btns[i].click();" +
                        "      break;" +
                        "    }" +
                        "  }" +
                        "})();",
                        null
                );
            }
        }
    }

    private void setupPermissionLaunchers() {
        notificationPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                isGranted -> {
                    // Handled gracefully
                }
        );

        installPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (pendingInstallApkFile != null) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            if (getPackageManager().canRequestPackageInstalls()) {
                                File toInstall = pendingInstallApkFile;
                                pendingInstallApkFile = null;
                                initiateApkInstallation(toInstall);
                            } else {
                                Toast.makeText(MainActivity.this, "Installation permission not granted", Toast.LENGTH_SHORT).show();
                            }
                        }
                    }
                }
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
    }

    private void setupFileChooserLauncher() {
        fileChooserLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (fileChooserCallback != null) {
                        Uri[] results = null;
                        if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                            if (result.getData().getClipData() != null) {
                                int count = result.getData().getClipData().getItemCount();
                                results = new Uri[count];
                                for (int i = 0; i < count; i++) {
                                    results[i] = result.getData().getClipData().getItemAt(i).getUri();
                                }
                            } else if (result.getData().getData() != null) {
                                results = new Uri[]{result.getData().getData()};
                            }
                        }
                        fileChooserCallback.onReceiveValue(results);
                        fileChooserCallback = null;
                    }
                }
        );
    }

    private void setupSwipeRefresh() {
        swipeRefreshLayout.setColorSchemeColors(
                ContextCompat.getColor(this, R.color.brand_violet),
                ContextCompat.getColor(this, R.color.brand_amber)
        );
        swipeRefreshLayout.setProgressBackgroundColorSchemeColor(
                ContextCompat.getColor(this, R.color.brand_surface)
        );
        swipeRefreshLayout.setOnRefreshListener(() -> {
            webView.reload();
            // Safety timeout: auto-dismiss spinner after 8s if network lags
            swipeRefreshLayout.postDelayed(() -> {
                if (swipeRefreshLayout != null && swipeRefreshLayout.isRefreshing()) {
                    swipeRefreshLayout.setRefreshing(false);
                }
            }, 8000);
        });
        // Pull-to-refresh enabled for main page browsing
        swipeRefreshLayout.setEnabled(true);

        // Crucial: Only trigger swipe-to-refresh when the WebView is at the very top (scrollY == 0)
        // and cannot scroll up vertically. If canScrollVertically(-1) is true or getScrollY() > 0,
        // child scroll up is active, so SwipeRefreshLayout must NOT intercept!
        swipeRefreshLayout.setOnChildScrollUpCallback((parent, child) -> {
            return webView != null && (webView.canScrollVertically(-1) || webView.getScrollY() > 0);
        });
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setDisplayZoomControls(false);

        // Hide ugly native Android scrollbars completely
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Persistent Cookie Management to guarantee session cookies (Supabase auth) are never lost
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        // Custom User-Agent tag for detection
        String existingUa = settings.getUserAgentString();
        settings.setUserAgentString(existingUa + " StudyRoom-Android/1.0.8");

        // Native bridge for live notification chronometer
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            private long lastExternalIntentTime = 0;
            private String lastExternalIntentUrl = "";

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();

                // Open external links outside StudyRoom in device's default browser
                if (host != null && !host.contains("netlify.app") && !host.contains("localhost")) {
                    long now = System.currentTimeMillis();
                    String urlStr = (uri != null) ? uri.toString() : "";
                    // Suppress duplicate rapid intent launches for the exact same URL within 2.5 seconds
                    if (urlStr.equals(lastExternalIntentUrl) && (now - lastExternalIntentTime < 2500)) {
                        return true;
                    }
                    lastExternalIntentUrl = urlStr;
                    lastExternalIntentTime = now;

                    try {
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(browserIntent);
                        return true;
                    } catch (Exception ignored) {}
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                swipeRefreshLayout.setRefreshing(false);
                offlineContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);

                // Flush cookies to flash storage so session persists across process restarts
                CookieManager.getInstance().flush();

                // Inject session observer
                injectSessionStateHook(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    swipeRefreshLayout.setRefreshing(false);
                    webView.setVisibility(View.GONE);
                    offlineContainer.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Prevent app termination when OS reclaims WebView renderer memory
                if (webView != null) {
                    webView.destroy();
                    webView = null;
                }
                recreate();
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    fileChooserLauncher.launch(intent);
                } catch (Exception e) {
                    fileChooserCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 100) {
                    swipeRefreshLayout.setRefreshing(false);
                }
            }
        });
    }

    private void injectSessionStateHook(WebView view) {
        // High-precision session hook that parses epoch ms in JS and dispatches to Android
        String jsHook =
                "(function() {" +
                "  window.__STUDYROOM_NATIVE_VERSION = '1.0.8';" +
                "  if (window._studyRoomHookInstalled) return;" +
                "  window._studyRoomHookInstalled = true;" +
                "  function updateSwipeRefreshState() {" +
                "    try {" +
                "      var hasModal = Boolean(" +
                "        document.querySelector('[role=\"dialog\"]') ||" +
                "        document.querySelector('.fixed.inset-0') ||" +
                "        (document.body && document.body.style && document.body.style.overflow === 'hidden')" +
                "      );" +
                "      if (window.AndroidBridge && window.AndroidBridge.setSwipeRefreshEnabled) {" +
                "        window.AndroidBridge.setSwipeRefreshEnabled(!hasModal);" +
                "      }" +
                "    } catch(e) {}" +
                "  }" +
                "  try {" +
                "    var modalObserver = new MutationObserver(updateSwipeRefreshState);" +
                "    if (document.body) {" +
                "      modalObserver.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true });" +
                "    }" +
                "  } catch(e) {}" +
                "  window.addEventListener('touchstart', function(e) {" +
                "    try {" +
                "      var t = e.target;" +
                "      var isInnerScrolled = false;" +
                "      while (t && t !== document.body && t !== document.documentElement) {" +
                "        if (t.scrollTop > 0) { isInnerScrolled = true; break; }" +
                "        t = t.parentElement;" +
                "      }" +
                "      if (isInnerScrolled && window.AndroidBridge && window.AndroidBridge.setSwipeRefreshEnabled) {" +
                "        window.AndroidBridge.setSwipeRefreshEnabled(false);" +
                "      }" +
                "    } catch(err) {}" +
                "  }, { passive: true });" +
                "  window.addEventListener('touchend', function() {" +
                "    updateSwipeRefreshState();" +
                "  }, { passive: true });" +
                "  function checkAndNotify() {" +
                "    try {" +
                "      var study = localStorage.getItem('studyroom_active_study') || '';" +
                "      var brk = localStorage.getItem('studyroom_active_break') || '';" +
                "      var brkObj = null;" +
                "      try { brkObj = brk ? JSON.parse(brk) : null; } catch(e) {}" +
                "      var studyObj = null;" +
                "      try { studyObj = study ? JSON.parse(study) : null; } catch(e) {}" +
                "      var breakStartMs = 0;" +
                "      if (brkObj && brkObj.breakStartedAt) {" +
                "        var t = new Date(brkObj.breakStartedAt).getTime();" +
                "        if (!isNaN(t) && t > 0) breakStartMs = t;" +
                "      }" +
                "      var studyStartMs = 0;" +
                "      if (studyObj) {" +
                "        var rawTime = studyObj.lastResumedAt || studyObj.sessionStartTime;" +
                "        if (rawTime) {" +
                "          var st = new Date(rawTime).getTime();" +
                "          if (!isNaN(st) && st > 0) studyStartMs = st;" +
                "        }" +
                "      }" +
                "      var accruedSec = 0;" +
                "      if (brkObj && typeof brkObj.accruedSeconds === 'number') {" +
                "        accruedSec = Math.floor(brkObj.accruedSeconds);" +
                "      }" +
                "      var focusText = (studyObj && studyObj.focus) ? String(studyObj.focus) : '';" +
                "      if (window.AndroidBridge && window.AndroidBridge.onSessionStateResolved) {" +
                "        window.AndroidBridge.onSessionStateResolved(" +
                "          Boolean(brkObj && breakStartMs > 0)," +
                "          breakStartMs," +
                "          accruedSec," +
                "          Boolean(studyObj && studyStartMs > 0)," +
                "          studyStartMs," +
                "          focusText" +
                "        );" +
                "      } else if (window.AndroidBridge && window.AndroidBridge.onSessionStateChanged) {" +
                "        window.AndroidBridge.onSessionStateChanged(study, brk);" +
                "      }" +
                "    } catch(err) {}" +
                "  }" +
                "  var origSet = localStorage.setItem;" +
                "  var origRem = localStorage.removeItem;" +
                "  localStorage.setItem = function(k, v) {" +
                "    origSet.apply(this, arguments);" +
                "    if (k === 'studyroom_active_study' || k === 'studyroom_active_break') {" +
                "      setTimeout(checkAndNotify, 50);" +
                "    }" +
                "  };" +
                "  localStorage.removeItem = function(k) {" +
                "    origRem.apply(this, arguments);" +
                "    if (k === 'studyroom_active_study' || k === 'studyroom_active_break') {" +
                "      setTimeout(checkAndNotify, 50);" +
                "    }" +
                "  };" +
                "  checkAndNotify();" +
                "  setInterval(checkAndNotify, 4000);" +
                "})();";

        view.evaluateJavascript(jsHook, null);
    }

    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                String currentUrl = (webView != null) ? webView.getUrl() : null;
                if (currentUrl == null) {
                    finish();
                    return;
                }

                Uri uri = Uri.parse(currentUrl);
                String path = uri.getPath();

                // If on any tab other than /room, jump directly to Room tab
                if (path != null && !path.equals("/room") && !path.equals("/") && !path.isEmpty()) {
                    webView.loadUrl(baseUrl + "/room");
                    lastBackPressedTime = System.currentTimeMillis();
                    return;
                }

                // If on /room, exit only on second back press within 2.5s
                long now = System.currentTimeMillis();
                if (now - lastBackPressedTime < 2500) {
                    finish();
                } else {
                    lastBackPressedTime = now;
                    Toast.makeText(MainActivity.this, getString(R.string.exit_prompt), Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    private void setupNetworkMonitoring() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager != null) {
            NetworkRequest request = new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build();

            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(@NonNull Network network) {
                    runOnUiThread(() -> {
                        if (offlineContainer.getVisibility() == View.VISIBLE) {
                            offlineContainer.setVisibility(View.GONE);
                            if (webView != null) {
                                webView.setVisibility(View.VISIBLE);
                                webView.reload();
                            }
                        } else if (webView != null) {
                            webView.evaluateJavascript(
                                    "(function() {" +
                                    "  try {" +
                                    "    window.dispatchEvent(new Event('online'));" +
                                    "    window.dispatchEvent(new Event('focus'));" +
                                    "    document.dispatchEvent(new Event('visibilitychange'));" +
                                    "  } catch(e) {}" +
                                    "})();",
                                    null
                            );
                        }
                    });
                }
            };
            try {
                connectivityManager.registerNetworkCallback(request, networkCallback);
            } catch (Exception ignored) {}
        }
    }

    public class WebAppInterface {

        @JavascriptInterface
        public String getAppVersion() {
            return "1.0.8";
        }

        @JavascriptInterface
        public void setSwipeRefreshEnabled(boolean enabled) {
            runOnUiThread(() -> {
                if (swipeRefreshLayout != null) {
                    swipeRefreshLayout.setEnabled(enabled);
                }
            });
        }

        @JavascriptInterface
        public void downloadAndInstallApk(final String downloadUrl, final String filename) {
            startInAppApkDownload(downloadUrl, filename);
        }

        @JavascriptInterface
        public void onSessionStateResolved(boolean isBreak, long breakStartMs, long accruedSeconds,
                                           boolean isStudy, long studyStartMs, String focusText) {
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;

                if (isBreak && breakStartMs > 0) {
                    StudySessionService.startBreakSession(MainActivity.this, breakStartMs, accruedSeconds);
                    return;
                }

                if (isStudy && studyStartMs > 0) {
                    StudySessionService.startStudySession(MainActivity.this, studyStartMs, focusText);
                    return;
                }

                StudySessionService.stopSession(MainActivity.this);
            });
        }

        // Backward-compatible fallback interface
        @JavascriptInterface
        public void onSessionStateChanged(String studyJson, String breakJson) {
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                try {
                    if (breakJson != null && !breakJson.trim().isEmpty() && !breakJson.equals("{}")) {
                        JSONObject obj = new JSONObject(breakJson);
                        long accrued = obj.optLong("accruedSeconds", 0);
                        String iso = obj.optString("breakStartedAt");
                        long breakStartMs = System.currentTimeMillis();
                        if (iso != null && !iso.isEmpty()) {
                            try {
                                java.time.Instant inst = java.time.Instant.parse(iso);
                                breakStartMs = inst.toEpochMilli();
                            } catch (Exception ignored) {}
                        }
                        StudySessionService.startBreakSession(MainActivity.this, breakStartMs, accrued);
                        return;
                    }

                    if (studyJson != null && !studyJson.trim().isEmpty() && !studyJson.equals("{}")) {
                        JSONObject obj = new JSONObject(studyJson);
                        String focus = obj.optString("focus", "");
                        long startMs = System.currentTimeMillis();
                        String iso = obj.optString("lastResumedAt", obj.optString("sessionStartTime", ""));
                        if (!iso.isEmpty()) {
                            try {
                                java.time.Instant inst = java.time.Instant.parse(iso);
                                startMs = inst.toEpochMilli();
                            } catch (Exception ignored) {}
                        }
                        StudySessionService.startStudySession(MainActivity.this, startMs, focus);
                        return;
                    }

                    StudySessionService.stopSession(MainActivity.this);
                } catch (Exception ignored) {}
            });
        }
    }

    public void startInAppApkDownload(final String downloadUrl, final String filename) {
        if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
            dispatchDownloadError("Invalid download URL provided.");
            return;
        }

        final String targetFilename = (filename != null && !filename.trim().isEmpty())
                ? filename
                : "StudyRoom-update.apk";

        runOnUiThread(() -> {
            Toast.makeText(MainActivity.this, "Downloading update in-app...", Toast.LENGTH_SHORT).show();
        });

        downloadExecutor.execute(() -> {
            HttpURLConnection connection = null;
            InputStream input = null;
            FileOutputStream output = null;
            try {
                dispatchDownloadProgress(0, "Connecting to update server...");

                URL url = new URL(downloadUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setRequestProperty("User-Agent", "StudyRoom-Android/1.0.8");
                connection.connect();

                // Handle HTTP redirects (GitHub releases 302/307 to AWS S3)
                int responseCode = connection.getResponseCode();
                int redirectCount = 0;
                while ((responseCode == HttpURLConnection.HTTP_MOVED_TEMP
                        || responseCode == HttpURLConnection.HTTP_MOVED_PERM
                        || responseCode == HttpURLConnection.HTTP_SEE_OTHER
                        || responseCode == 307
                        || responseCode == 308) && redirectCount < 5) {
                    String newUrl = connection.getHeaderField("Location");
                    if (newUrl == null) break;
                    connection.disconnect();
                    url = new URL(newUrl);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setInstanceFollowRedirects(true);
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(30000);
                    connection.setRequestProperty("User-Agent", "StudyRoom-Android/1.0.8");
                    connection.connect();
                    responseCode = connection.getResponseCode();
                    redirectCount++;
                }

                if (responseCode != HttpURLConnection.HTTP_OK) {
                    dispatchDownloadError("Download failed (HTTP " + responseCode + ")");
                    return;
                }

                long fileLength = connection.getContentLengthLong();
                input = connection.getInputStream();

                File downloadsDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (downloadsDir == null) {
                    downloadsDir = new File(getFilesDir(), "Download");
                }
                if (!downloadsDir.exists()) {
                    downloadsDir.mkdirs();
                }

                File apkFile = new File(downloadsDir, targetFilename);
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                output = new FileOutputStream(apkFile);

                byte[] data = new byte[8192];
                long total = 0;
                int count;
                long lastProgressTime = 0;

                while ((count = input.read(data)) != -1) {
                    total += count;
                    output.write(data, 0, count);

                    if (fileLength > 0) {
                        int percent = (int) (total * 100 / fileLength);
                        long now = System.currentTimeMillis();
                        if (now - lastProgressTime >= 150 || percent == 100) {
                            lastProgressTime = now;
                            dispatchDownloadProgress(percent, "Downloading... " + percent + "%");
                        }
                    }
                }

                output.flush();
                output.close();
                output = null;
                input.close();
                input = null;

                dispatchDownloadProgress(100, "Download complete. Opening installer...");

                runOnUiThread(() -> initiateApkInstallation(apkFile));

            } catch (Exception e) {
                dispatchDownloadError("Download error: " + e.getMessage());
            } finally {
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                    if (connection != null) connection.disconnect();
                } catch (Exception ignored) {}
            }
        });
    }

    public void initiateApkInstallation(final File apkFile) {
        if (apkFile == null || !apkFile.exists() || apkFile.length() == 0) {
            Toast.makeText(this, "Downloaded APK is invalid or not found", Toast.LENGTH_SHORT).show();
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    pendingInstallApkFile = apkFile;
                    Toast.makeText(this, "Please allow 'Install unknown apps' to complete update", Toast.LENGTH_LONG).show();
                    Intent permissionIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                            .setData(Uri.parse("package:" + getPackageName()));
                    if (installPermissionLauncher != null) {
                        installPermissionLauncher.launch(permissionIntent);
                    } else {
                        startActivity(permissionIntent);
                    }
                    return;
                }
            }

            Uri apkUri = FileProvider.getUriForFile(
                    MainActivity.this,
                    getPackageName() + ".fileprovider",
                    apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            startActivity(installIntent);
        } catch (Exception e) {
            Toast.makeText(this, "Unable to launch package installer: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void dispatchDownloadProgress(int percent, String status) {
        runOnUiThread(() -> {
            if (webView != null && !isFinishing() && !isDestroyed()) {
                webView.evaluateJavascript(
                        "(function() {" +
                        "  try {" +
                        "    if (window.__onApkProgress) window.__onApkProgress(" + percent + ", " + JSONObject.quote(status) + ");" +
                        "  } catch(e) {}" +
                        "})();",
                        null
                );
            }
        });
    }

    private void dispatchDownloadError(String errorMessage) {
        runOnUiThread(() -> {
            Toast.makeText(MainActivity.this, errorMessage, Toast.LENGTH_SHORT).show();
            if (webView != null && !isFinishing() && !isDestroyed()) {
                webView.evaluateJavascript(
                        "(function() {" +
                        "  try {" +
                        "    if (window.__onApkError) window.__onApkError(" + JSONObject.quote(errorMessage) + ");" +
                        "  } catch(e) {}" +
                        "})();",
                        null
                );
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        isActivityVisible = true;

        if (pendingInstallApkFile != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (getPackageManager().canRequestPackageInstalls()) {
                    File toInstall = pendingInstallApkFile;
                    pendingInstallApkFile = null;
                    initiateApkInstallation(toInstall);
                }
            }
        }

        if (webView != null) {
            webView.onResume();
            // Trigger instant real-time synchronization across Web layers
            webView.evaluateJavascript(
                    "(function() {" +
                    "  try {" +
                    "    window.dispatchEvent(new Event('focus'));" +
                    "    document.dispatchEvent(new Event('visibilitychange'));" +
                    "  } catch(e) {}" +
                    "})();",
                    null
            );
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        isActivityVisible = false;
        CookieManager.getInstance().flush();
        if (webView != null) {
            webView.evaluateJavascript(
                    "(function() {" +
                    "  try {" +
                    "    window.dispatchEvent(new Event('blur'));" +
                    "    document.dispatchEvent(new Event('visibilitychange'));" +
                    "  } catch(e) {}" +
                    "})();",
                    null
            );
            webView.onPause();
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        if (downloadExecutor != null && !downloadExecutor.isShutdown()) {
            try {
                downloadExecutor.shutdownNow();
            } catch (Exception ignored) {}
        }
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
        }
        CookieManager.getInstance().flush();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
