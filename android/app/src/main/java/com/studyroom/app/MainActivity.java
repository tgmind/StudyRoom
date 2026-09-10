package com.studyroom.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
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
import androidx.core.splashscreen.SplashScreen;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SwipeRefreshLayout swipeRefreshLayout;
    private View offlineContainer;
    private Button btnRetry;

    private ValueCallback<Uri[]> fileChooserCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    private String baseUrl;
    private long lastBackPressedTime = 0;

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

        setupNotificationPermissions();
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
        }
    }

    private void setupNotificationPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                registerForActivityResult(new ActivityResultContracts.RequestPermission(), isGranted -> {
                    // Permission result handled gracefully
                }).launch(Manifest.permission.POST_NOTIFICATIONS);
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

        // Append custom user agent tag
        String existingUa = settings.getUserAgentString();
        settings.setUserAgentString(existingUa + " StudyRoom-Android/1.0.0");

        // Add native Javascript Interface for notification chronometer integration
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();

                // Open external links outside StudyRoom in device's default browser
                if (host != null && !host.contains("netlify.app") && !host.contains("localhost")) {
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

                // Inject lightweight native session observer into WebView (zero web codebase changes)
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
        String jsHook =
                "(function() {" +
                "  if (window._studyRoomHookInstalled) return;" +
                "  window._studyRoomHookInstalled = true;" +
                "  function checkAndNotify() {" +
                "    try {" +
                "      var study = localStorage.getItem('studyroom_active_study') || '';" +
                "      var brk = localStorage.getItem('studyroom_active_break') || '';" +
                "      if (window.AndroidBridge && window.AndroidBridge.onSessionStateChanged) {" +
                "        window.AndroidBridge.onSessionStateChanged(study, brk);" +
                "      }" +
                "    } catch(e) {}" +
                "  }" +
                "  var origSet = localStorage.setItem;" +
                "  var origRem = localStorage.removeItem;" +
                "  localStorage.setItem = function(k, v) {" +
                "    origSet.apply(this, arguments);" +
                "    if (k === 'studyroom_active_study' || k === 'studyroom_active_break') {" +
                "      checkAndNotify();" +
                "    }" +
                "  };" +
                "  localStorage.removeItem = function(k) {" +
                "    origRem.apply(this, arguments);" +
                "    if (k === 'studyroom_active_study' || k === 'studyroom_active_break') {" +
                "      checkAndNotify();" +
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
                String currentUrl = webView.getUrl();
                if (currentUrl == null) {
                    finish();
                    return;
                }

                Uri uri = Uri.parse(currentUrl);
                String path = uri.getPath();

                // 1. If on any tab/page other than /room, jump directly to Room tab
                if (path != null && !path.equals("/room") && !path.equals("/") && !path.isEmpty()) {
                    webView.loadUrl(baseUrl + "/room");
                    lastBackPressedTime = System.currentTimeMillis();
                    return;
                }

                // 2. If already on /room, exit only on second back press within 2.5s
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
                            webView.setVisibility(View.VISIBLE);
                            webView.reload();
                        } else {
                            // Signal online event to web app for smooth realtime WebSocket resync
                            webView.evaluateJavascript(
                                    "if (window.dispatchEvent) { window.dispatchEvent(new Event('online')); }",
                                    null
                            );
                        }
                    });
                }
            };
            connectivityManager.registerNetworkCallback(request, networkCallback);
        }
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void onSessionStateChanged(String studyJson, String breakJson) {
            try {
                if (breakJson != null && !breakJson.trim().isEmpty() && !breakJson.equals("{}")) {
                    JSONObject obj = new JSONObject(breakJson);
                    String breakStartedAtIso = obj.optString("breakStartedAt");
                    long accrued = obj.optLong("accruedSeconds", 0);
                    long breakStartMs = parseIsoToMs(breakStartedAtIso);
                    StudySessionService.startBreakSession(MainActivity.this, breakStartMs, accrued);
                    return;
                }

                if (studyJson != null && !studyJson.trim().isEmpty() && !studyJson.equals("{}")) {
                    JSONObject obj = new JSONObject(studyJson);
                    String lastResumedAtIso = obj.optString("lastResumedAt");
                    String sessionStartIso = obj.optString("sessionStartTime");
                    long startMs = parseIsoToMs(lastResumedAtIso.isEmpty() ? sessionStartIso : lastResumedAtIso);
                    StudySessionService.startStudySession(MainActivity.this, startMs, "");
                    return;
                }

                // If neither active, session has stopped
                StudySessionService.stopSession(MainActivity.this);
            } catch (Exception e) {
                // Fallback silently
            }
        }
    }

    private long parseIsoToMs(String isoTimestamp) {
        if (isoTimestamp == null || isoTimestamp.isEmpty()) {
            return System.currentTimeMillis();
        }
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            return sdf.parse(isoTimestamp).getTime();
        } catch (Exception e) {
            try {
                SimpleDateFormat sdf2 = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
                sdf2.setTimeZone(TimeZone.getTimeZone("UTC"));
                return sdf2.parse(isoTimestamp).getTime();
            } catch (Exception ignored) {
                return System.currentTimeMillis();
            }
        }
    }

    @Override
    protected void onDestroy() {
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
        }
        super.onDestroy();
    }
}
