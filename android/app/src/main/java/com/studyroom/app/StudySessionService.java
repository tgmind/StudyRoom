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
import androidx.core.content.ContextCompat;

public class StudySessionService extends Service {

    private static final String TAG = "StudySessionService";

    public static final String CHANNEL_ID = "studyroom_live_timer_channel";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START_STUDY = "com.studyroom.app.START_STUDY";
    public static final String ACTION_START_BREAK = "com.studyroom.app.START_BREAK";
    public static final String ACTION_STOP_SESSION = "com.studyroom.app.STOP_SESSION";
    public static final String ACTION_RESUME_STUDY = "com.studyroom.app.ACTION_RESUME_STUDY";

    public static final String EXTRA_START_TIME_MS = "extra_start_time_ms";
    public static final String EXTRA_FOCUS_NAME = "extra_focus_name";
    public static final String EXTRA_ACCRUED_SECONDS = "extra_accrued_seconds";

    // Track active notification state to prevent redundant re-alerting & chronometer oscillation
    private String lastAction = "";
    private long lastBaseTimeMs = 0;
    private long lastAccruedSec = -1;
    private String lastFocus = "";
    private boolean isForegroundRunning = false;

    public static void startStudySession(Context context, long startTimeMs, String focusName) {
        try {
            Intent intent = new Intent(context, StudySessionService.class);
            intent.setAction(ACTION_START_STUDY);
            intent.putExtra(EXTRA_START_TIME_MS, startTimeMs);
            intent.putExtra(EXTRA_FOCUS_NAME, focusName != null ? focusName : "");
            ContextCompat.startForegroundService(context, intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start study foreground service: " + e.getMessage());
        }
    }

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
        if (intent == null || intent.getAction() == null) {
            return START_NOT_STICKY;
        }

        String action = intent.getAction();

        if (ACTION_STOP_SESSION.equals(action)) {
            lastAction = "";
            lastBaseTimeMs = 0;
            lastAccruedSec = -1;
            lastFocus = "";
            isForegroundRunning = false;
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_START_STUDY.equals(action)) {
            long startTimeMs = intent.getLongExtra(EXTRA_START_TIME_MS, System.currentTimeMillis());
            String focus = intent.getStringExtra(EXTRA_FOCUS_NAME);
            if (focus == null) focus = "";

            // Deduplication: if already running with matching state and base time within 2s, skip re-posting
            if (isForegroundRunning && ACTION_START_STUDY.equals(lastAction)
                    && Math.abs(startTimeMs - lastBaseTimeMs) < 2000
                    && focus.equals(lastFocus)) {
                return START_STICKY;
            }

            lastAction = ACTION_START_STUDY;
            lastBaseTimeMs = startTimeMs;
            lastFocus = focus;
            lastAccruedSec = -1;

            String title = (focus.trim().isEmpty()) ? "Deep Focus Active" : "Studying • " + focus.trim();
            String subtext = "Live accountability timer ticking in background";

            Notification notification = buildModernNotification(title, subtext, startTimeMs, false, 0);
            try {
                startForeground(NOTIFICATION_ID, notification);
                isForegroundRunning = true;
            } catch (Exception e) {
                Log.e(TAG, "startForeground failed: " + e.getMessage());
            }
            return START_STICKY;
        }

        if (ACTION_START_BREAK.equals(action)) {
            long breakStartTimeMs = intent.getLongExtra(EXTRA_START_TIME_MS, System.currentTimeMillis());
            long accrued = intent.getLongExtra(EXTRA_ACCRUED_SECONDS, 0);

            // Deduplication: if already running with matching break start time within 2s and same accrued time
            if (isForegroundRunning && ACTION_START_BREAK.equals(lastAction)
                    && Math.abs(breakStartTimeMs - lastBaseTimeMs) < 2000
                    && accrued == lastAccruedSec) {
                return START_STICKY;
            }

            lastAction = ACTION_START_BREAK;
            lastBaseTimeMs = breakStartTimeMs;
            lastAccruedSec = accrued;
            lastFocus = "";

            String formattedAccrued = formatDuration(accrued);
            String title = "Break in Progress — Recharge";
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

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setColor(accentColor)
                .setColorized(true)
                .setContentTitle(title)
                .setContentText(subtext)
                .setSubText(isBreak ? "Break • 1h Max" : "Live Study")
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setUsesChronometer(true)
                .setWhen(baseTimeMs)
                .setShowWhen(true)
                .addAction(R.drawable.ic_stat_timer, getString(R.string.open_room), pendingIntent);

        // On break, add direct "Resume Study" action button for instant one-tap resume
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
            builder.addAction(R.drawable.ic_stat_timer, "Resume Study", resumePendingIntent);
        }

        return builder.build();
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
            return hours + "h " + (minutes > 0 ? minutes + "m" : "");
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
            int importance = NotificationManager.IMPORTANCE_LOW;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
