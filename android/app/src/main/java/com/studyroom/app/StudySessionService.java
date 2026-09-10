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
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class StudySessionService extends Service {

    public static final String CHANNEL_ID = "studyroom_live_timer_channel";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START_STUDY = "com.studyroom.app.START_STUDY";
    public static final String ACTION_START_BREAK = "com.studyroom.app.START_BREAK";
    public static final String ACTION_STOP_SESSION = "com.studyroom.app.STOP_SESSION";

    public static final String EXTRA_START_TIME_MS = "extra_start_time_ms";
    public static final String EXTRA_FOCUS_NAME = "extra_focus_name";
    public static final String EXTRA_ACCRUED_SECONDS = "extra_accrued_seconds";

    public static void startStudySession(Context context, long startTimeMs, String focusName) {
        Intent intent = new Intent(context, StudySessionService.class);
        intent.setAction(ACTION_START_STUDY);
        intent.putExtra(EXTRA_START_TIME_MS, startTimeMs);
        intent.putExtra(EXTRA_FOCUS_NAME, focusName);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void startBreakSession(Context context, long breakStartTimeMs, long accruedSeconds) {
        Intent intent = new Intent(context, StudySessionService.class);
        intent.setAction(ACTION_START_BREAK);
        intent.putExtra(EXTRA_START_TIME_MS, breakStartTimeMs);
        intent.putExtra(EXTRA_ACCRUED_SECONDS, accruedSeconds);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stopSession(Context context) {
        Intent intent = new Intent(context, StudySessionService.class);
        intent.setAction(ACTION_STOP_SESSION);
        context.startService(intent);
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
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_START_STUDY.equals(action)) {
            long startTimeMs = intent.getLongExtra(EXTRA_START_TIME_MS, System.currentTimeMillis());
            String focus = intent.getStringExtra(EXTRA_FOCUS_NAME);
            String title = (focus != null && !focus.trim().isEmpty()) ? "Studying: " + focus : "Live Study Session Active";
            String subtext = "Session timer ticking live • StudyRoom";

            Notification notification = buildChronometerNotification(title, subtext, startTimeMs, false);
            startForeground(NOTIFICATION_ID, notification);
            return START_STICKY;
        }

        if (ACTION_START_BREAK.equals(action)) {
            long breakStartTimeMs = intent.getLongExtra(EXTRA_START_TIME_MS, System.currentTimeMillis());
            long accrued = intent.getLongExtra(EXTRA_ACCRUED_SECONDS, 0);
            long accruedMinutes = accrued / 60;
            String title = "Break in Progress — StudyRoom";
            String subtext = "Accrued study: " + accruedMinutes + "m • 1-hour break limit";

            Notification notification = buildChronometerNotification(title, subtext, breakStartTimeMs, true);
            startForeground(NOTIFICATION_ID, notification);
            return START_STICKY;
        }

        return START_NOT_STICKY;
    }

    private Notification buildChronometerNotification(String title, String subtext, long baseTimeMs, boolean isBreak) {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setColor(ContextCompat.getColor(this, isBreak ? R.color.brand_amber : R.color.brand_violet))
                .setContentTitle(title)
                .setContentText(subtext)
                .setSubText(isBreak ? "Break" : "Studying")
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setUsesChronometer(true)
                .setWhen(baseTimeMs)
                .setShowWhen(true)
                .addAction(R.drawable.ic_stat_timer, getString(R.string.open_room), pendingIntent);

        return builder.build();
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
