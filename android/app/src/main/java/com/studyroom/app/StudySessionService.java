package com.studyroom.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import android.content.SharedPreferences;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;

public class StudySessionService extends Service {

    private static final String TAG = "StudySessionService";

    public static final String CHANNEL_ID = "studyroom_live_break_capsule_channel_v1";
    public static final String LEGACY_CHANNEL_ID = "studyroom_live_timer_channel";
    public static final String CHANNEL_ID_ALERTS = "studyroom_session_alerts_channel";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START_BREAK = "com.studyroom.app.START_BREAK";
    public static final String ACTION_STOP_SESSION = "com.studyroom.app.STOP_SESSION";
    public static final String ACTION_RESUME_STUDY = "com.studyroom.app.ACTION_RESUME_STUDY";

    public static final String EXTRA_START_TIME_MS = "extra_start_time_ms";
    public static final String EXTRA_ACCRUED_SECONDS = "extra_accrued_seconds";

    public static final String PREFS_NAME = "studyroom_break_service_prefs";
    public static final String KEY_IS_BREAK_ACTIVE = "is_break_active";
    public static final String KEY_BREAK_START_MS = "break_start_ms";
    public static final String KEY_ACCRUED_SECONDS = "accrued_seconds";
    public static final long MAX_BREAK_DURATION_MS = 3600 * 1000L; // 1 hour max break limit

    // Official Android 16+ Live Updates / Promoted Ongoing Notification constants
    public static final String EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing";
    public static final String EXTRA_SHORT_CRITICAL_TEXT = "android.shortCriticalText";
    /**
     * System-owned flag indicating the notification has been promoted by the OS.
     * Value matches Notification.FLAG_PROMOTED_ONGOING (0x40000 / 262144).
     * Applications NEVER set this flag directly; it is exclusively set by the system.
     */
    public static final int FLAG_PROMOTED_ONGOING = 0x40000;

    // Track active notification state to prevent redundant re-alerting & chronometer oscillation
    private String lastAction = "";
    private long lastBaseTimeMs = 0;
    private long lastAccruedSec = -1;
    private boolean isForegroundRunning = false;

    public static void startBreakSession(Context context, long breakStartTimeMs, long accruedSeconds) {
        try {
            Intent intent = new Intent(context, StudySessionService.class);
            intent.setAction(ACTION_START_BREAK);
            intent.putExtra(EXTRA_START_TIME_MS, breakStartTimeMs);
            intent.putExtra(EXTRA_ACCRUED_SECONDS, accruedSeconds);
            ContextCompat.startForegroundService(context, intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start break foreground service: " + e.getMessage());
        }
    }

    public static void stopSession(Context context) {
        try {
            Intent intent = new Intent(context, StudySessionService.class);
            intent.setAction(ACTION_STOP_SESSION);
            context.startService(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop session service: " + e.getMessage());
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Handle service recreation after Android process death / restart
        if (intent == null || intent.getAction() == null) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean isBreakActive = prefs.getBoolean(KEY_IS_BREAK_ACTIVE, false);
            long breakStartMs = prefs.getLong(KEY_BREAK_START_MS, 0);
            long accrued = prefs.getLong(KEY_ACCRUED_SECONDS, 0);
            long now = System.currentTimeMillis();

            if (isBreakActive && breakStartMs > 0 && (now - breakStartMs < MAX_BREAK_DURATION_MS)) {
                lastAction = ACTION_START_BREAK;
                lastBaseTimeMs = breakStartMs;
                lastAccruedSec = accrued;

                String formattedAccrued = formatDuration(accrued);
                String title = "Break in progress";
                String subtext = "Accrued Study: " + formattedAccrued + " • 1-hour break limit";

                Notification notification = buildModernNotification(title, subtext, breakStartMs, true, accrued);
                try {
                    startForeground(NOTIFICATION_ID, notification);
                    isForegroundRunning = true;
                    Log.i(TAG, "Restored active break notification on service recreation.");
                    return START_STICKY;
                } catch (Exception e) {
                    Log.e(TAG, "Failed to restore startForeground: " + e.getMessage());
                }
            }

            // Stale or expired break: clean up
            prefs.edit().clear().apply();
            lastAction = "";
            lastBaseTimeMs = 0;
            lastAccruedSec = -1;
            isForegroundRunning = false;
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();

        if (ACTION_STOP_SESSION.equals(action)) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().clear().apply();

            lastAction = "";
            lastBaseTimeMs = 0;
            lastAccruedSec = -1;
            isForegroundRunning = false;
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_START_BREAK.equals(action)) {
            long breakStartTimeMs = intent.getLongExtra(EXTRA_START_TIME_MS, System.currentTimeMillis());
            long accrued = intent.getLongExtra(EXTRA_ACCRUED_SECONDS, 0);

            // Persist native break state for recreation across process death & task removal
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putBoolean(KEY_IS_BREAK_ACTIVE, true)
                    .putLong(KEY_BREAK_START_MS, breakStartTimeMs)
                    .putLong(KEY_ACCRUED_SECONDS, accrued)
                    .apply();

            // Deduplication: if already running with matching break start time within 2s and same accrued time
            if (isForegroundRunning && ACTION_START_BREAK.equals(lastAction)
                    && Math.abs(breakStartTimeMs - lastBaseTimeMs) < 2000
                    && accrued == lastAccruedSec) {
                return START_STICKY;
            }

            lastAction = ACTION_START_BREAK;
            lastBaseTimeMs = breakStartTimeMs;
            lastAccruedSec = accrued;

            String formattedAccrued = formatDuration(accrued);
            String title = "Break in progress";
            String subtext = "Accrued Study: " + formattedAccrued + " • 1-hour break limit";

            Notification notification = buildModernNotification(title, subtext, breakStartTimeMs, true, accrued);
            try {
                startForeground(NOTIFICATION_ID, notification);
                isForegroundRunning = true;
            } catch (Exception e) {
                Log.e(TAG, "startForeground failed: " + e.getMessage());
            }
            return START_STICKY;
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // CRITICAL ANDROID LIFECYCLE PERSISTENCE RULE:
        // Do NOT call stopSelf()! When the user swipes StudyRoom out of Android Recents,
        // the break notification must remain ongoing, ticking, and visible in the notification shade.
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean isBreakActive = prefs.getBoolean(KEY_IS_BREAK_ACTIVE, false);
        long breakStartMs = prefs.getLong(KEY_BREAK_START_MS, 0);
        long accrued = prefs.getLong(KEY_ACCRUED_SECONDS, 0);
        long now = System.currentTimeMillis();

        if (isBreakActive && breakStartMs > 0 && (now - breakStartMs < MAX_BREAK_DURATION_MS)) {
            String formattedAccrued = formatDuration(accrued);
            String title = "Break in progress";
            String subtext = "Accrued Study: " + formattedAccrued + " • 1-hour break limit";

            Notification notification = buildModernNotification(title, subtext, breakStartMs, true, accrued);
            try {
                startForeground(NOTIFICATION_ID, notification);
                isForegroundRunning = true;
                Log.i(TAG, "onTaskRemoved: Break notification preserved ongoing.");
            } catch (Exception e) {
                Log.e(TAG, "onTaskRemoved startForeground error: " + e.getMessage());
            }
        } else {
            // Break expired while task removed
            prefs.edit().clear().apply();
            stopForeground(true);
            stopSelf();
        }
    }

    private Notification buildModernNotification(String title, String subtext, long baseTimeMs, boolean isBreak, long accruedSeconds) {
        // Open Room PendingIntent
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        int accentColor = ContextCompat.getColor(this, isBreak ? R.color.brand_amber : R.color.brand_violet);
        String subHeader = isBreak ? "Recharge Break • 1h Max" : "Live Study • Deep Focus";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setColor(accentColor)
                // Omit setColorized(true) so the notification renders on the native dark theme surface
                // rather than flooding the entire card background with a solid neon color
                .setContentTitle(title)
                .setContentText(subtext)
                .setSubText(subHeader)
                .setStyle(new NotificationCompat.BigTextStyle()
                        .setBigContentTitle(title)
                        .bigText(subtext)
                        .setSummaryText(subHeader))
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(isBreak ? NotificationCompat.CATEGORY_STOPWATCH : NotificationCompat.CATEGORY_WORKOUT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setUsesChronometer(true)
                .setChronometerCountDown(false)
                .setWhen(baseTimeMs)
                .setShowWhen(true);

        // On break, put primary "Resume Study" action first, followed by "Open Room"
        if (isBreak) {
            Intent resumeIntent = new Intent(this, MainActivity.class);
            resumeIntent.setAction(ACTION_RESUME_STUDY);
            resumeIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent resumePendingIntent = PendingIntent.getActivity(
                    this,
                    1,
                    resumeIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );
            builder.addAction(R.drawable.ic_stat_timer, "▶ Resume Study", resumePendingIntent);
            builder.addAction(R.drawable.ic_stat_timer, "↗ " + getString(R.string.open_room), pendingIntent);
        } else {
            builder.addAction(R.drawable.ic_stat_timer, "↗ " + getString(R.string.open_room), pendingIntent);
        }

        // Apply optional OS-level Dynamic Island & status bar promotion enhancements (guarded against failures)
        applyOptionalDynamicIslandEnhancements(builder, title, subtext, subHeader, isBreak);

        return builder.build();
    }

    /**
     * Checks whether the notification satisfies the platform's promotable characteristics.
     * On Android 16+ (API 36+), delegates directly to Notification.hasPromotableCharacteristics().
     * On pre-Android 16 devices (API < 36), returns false because Live Updates
     * promotion is unsupported by the OS.
     */
    public static boolean hasPromotableCharacteristics(Notification notification) {
        if (notification == null) return false;
        if (Build.VERSION.SDK_INT >= 36) {
            return notification.hasPromotableCharacteristics();
        }
        return false;
    }

    /**
     * Checks whether the user/system permits promoted notifications for this app.
     * On Android 16+ (API 36+), queries NotificationManager.canPostPromotedNotifications().
     * On earlier API levels, returns false because Live Updates promotion is not supported by the OS.
     */
    public static boolean canPostPromotedNotifications(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT >= 36) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            return manager != null && manager.canPostPromotedNotifications();
        }
        return false;
    }

    /**
     * Inspects whether a notification has actually been promoted by the system to a Live Update.
     * The system assigns Notification.FLAG_PROMOTED_ONGOING when it promotes the notification.
     * Applications NEVER set this flag directly; this method is strictly a query against system-owned state.
     */
    public static boolean isNotificationPromoted(Notification notification) {
        if (notification == null) return false;
        if (Build.VERSION.SDK_INT >= 36) {
            return (notification.flags & Notification.FLAG_PROMOTED_ONGOING) != 0;
        }
        return false;
    }

    /**
     * Optional Dynamic Island and status-bar chip enhancements for compatible OEM/OS surfaces.
     * All calls are guarded with exception boundaries so unsupported devices fall back seamlessly
     * to the standard Android notification.
     */
    public static void applyOptionalDynamicIslandEnhancements(
            NotificationCompat.Builder builder,
            String title,
            String subtext,
            String subHeader,
            boolean isBreak) {
        if (builder == null) return;

        // 1. Official Android 16+ Live Updates (Status-Bar Chip & Promoted Ongoing Notification Request)
        try {
            // Official AndroidX NotificationCompat API (backed by EXTRA_REQUEST_PROMOTED_ONGOING)
            builder.setRequestPromotedOngoing(true);
            builder.setShortCriticalText(isBreak ? "Break" : "Study");
        } catch (Throwable t) {
            Log.d(TAG, "NotificationCompat promotion request skipped: " + t.getMessage());
            // Fallback to documented extra keys if running on earlier AndroidX library
            try {
                builder.getExtras().putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true);
                builder.getExtras().putString(EXTRA_SHORT_CRITICAL_TEXT, isBreak ? "Break" : "Study");
            } catch (Throwable ignored) {}
        }

        // 2. Xiaomi HyperOS Super Island / Focus Notification payload (experimental OEM layer)
        try {
            String manufacturer = Build.MANUFACTURER;
            if (manufacturer != null && (manufacturer.equalsIgnoreCase("Xiaomi")
                    || manufacturer.equalsIgnoreCase("Redmi")
                    || manufacturer.equalsIgnoreCase("POCO"))) {
                String payload = buildXiaomiFocusPayload(title, subtext, isBreak);
                if (payload != null) {
                    builder.getExtras().putString("miui.focus.param", payload);
                }
            }
        } catch (Throwable t) {
            Log.d(TAG, "Optional Xiaomi HyperIsland payload skipped: " + t.getMessage());
        }
    }

    /**
     * Builds a compliant Xiaomi HyperOS Super Island JSON payload conforming to the focus parameter specification.
     * Keeps payload under the mandatory 3072-byte limit.
     */
    public static String buildXiaomiFocusPayload(String title, String subtext, boolean isBreak) {
        try {
            JSONObject param = new JSONObject();
            JSONObject paramV2 = new JSONObject();
            paramV2.put("business", "timer");
            paramV2.put("enableFloat", true);
            paramV2.put("updatable", true);

            JSONObject paramIsland = new JSONObject();
            paramIsland.put("islandProperty", 1);

            JSONObject smallIslandArea = new JSONObject();
            smallIslandArea.put("title", isBreak ? "Break" : "Study");
            paramIsland.put("smallIslandArea", smallIslandArea);

            JSONObject bigIslandArea = new JSONObject();
            JSONObject imageTextInfoLeft = new JSONObject();
            imageTextInfoLeft.put("type", 1);
            JSONObject textInfo = new JSONObject();
            textInfo.put("frontTitle", "StudyRoom");
            textInfo.put("title", title != null ? title : "Break in progress");
            textInfo.put("content", subtext != null ? subtext : "");
            textInfo.put("useHighLight", false);
            imageTextInfoLeft.put("textInfo", textInfo);
            bigIslandArea.put("imageTextInfoLeft", imageTextInfoLeft);
            paramIsland.put("bigIslandArea", bigIslandArea);

            paramV2.put("param_island", paramIsland);
            param.put("param_v2", paramV2);

            String jsonPayload = param.toString();
            if (jsonPayload.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 3072) {
                return jsonPayload;
            }
        } catch (Exception e) {
            Log.d(TAG, "Error building Xiaomi focus payload: " + e.getMessage());
        }
        return null;
    }

    /**
     * Formats elapsed study duration precisely (e.g. "17s", "15m 30s", "1h 25m").
     */
    public static String formatDuration(long totalSeconds) {
        if (totalSeconds <= 0) return "0s";
        long hours = totalSeconds / 3600;
        long minutes = (totalSeconds % 3600) / 60;
        long seconds = totalSeconds % 60;

        if (hours > 0) {
            return (hours + "h" + (minutes > 0 ? " " + minutes + "m" : "")).trim();
        } else if (minutes > 0) {
            return minutes + "m" + (seconds > 0 ? " " + seconds + "s" : "");
        } else {
            return seconds + "s";
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = getString(R.string.notification_channel_name);
            String description = getString(R.string.notification_channel_desc);
            // Upgrade importance to DEFAULT to qualify for system status-bar capsule and Live Updates,
            // while strictly silencing audio and vibration so the user experiences zero disruptive alerts.
            int importance = NotificationManager.IMPORTANCE_DEFAULT;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
            SessionWarningReceiver.ensureAlertNotificationChannel(this);
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
