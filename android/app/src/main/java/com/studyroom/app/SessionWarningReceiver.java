package com.studyroom.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class SessionWarningReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;

        String action = intent.getAction();
        android.content.SharedPreferences prefs = context.getSharedPreferences("studyroom_session_alarm_prefs", Context.MODE_PRIVATE);

        if (SessionAlarmManager.ACTION_SESSION_LIMIT.equals(action)) {
            boolean isScheduled = prefs.getBoolean("limit_alarm_scheduled", false);
            if (!isScheduled) return;

            long triggerAtMs = prefs.getLong("limit_trigger_at_ms", 0);
            long now = System.currentTimeMillis();
            if (triggerAtMs > 0 && now < (triggerAtMs - 30000L)) return;

            ensureAlertNotificationChannel(context);
            SessionAlarmManager.markLimitDelivered(context, true);

            // Dismiss any earlier 10-minute warning notification
            NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(SessionAlarmManager.NOTIFICATION_ID_SESSION_WARNING);
            }

            // Intent to open app and trigger auto-finalization
            Intent openAppIntent = new Intent(context, MainActivity.class);
            openAppIntent.setAction(MainActivity.ACTION_TRIGGER_SESSION_LIMIT);
            openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent openPendingIntent = PendingIntent.getActivity(
                    context,
                    1,
                    openAppIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            String title = "🏁 Study Session Complete";
            String shortText = "Your 3-hour study session reached the maximum limit and has been automatically saved.";
            String bigText = "Your 3-hour study session reached the maximum limit. Your study progress and streak have been safely saved to your history.";
            String summaryText = "3-Hour Limit • Auto-Saved";

            int brandGreen = Color.parseColor("#10B981");

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, StudySessionService.CHANNEL_ID_ALERTS)
                    .setSmallIcon(R.drawable.ic_stat_timer)
                    .setColor(brandGreen)
                    .setContentTitle(title)
                    .setContentText(shortText)
                    .setSubText(summaryText)
                    .setStyle(new NotificationCompat.BigTextStyle()
                            .setBigContentTitle(title)
                            .bigText(bigText)
                            .setSummaryText(summaryText))
                    .setContentIntent(openPendingIntent)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setVibrate(new long[]{0, 300, 200, 300})
                    .addAction(R.drawable.ic_stat_timer, "↗ " + context.getString(R.string.open_room), openPendingIntent);

            if (notificationManager != null) {
                notificationManager.notify(SessionAlarmManager.NOTIFICATION_ID_SESSION_LIMIT, builder.build());
            }

            // Also forward intent to MainActivity to trigger instant JavaScript auto-finalization if activity is alive
            try {
                Intent forwardIntent = new Intent(MainActivity.ACTION_TRIGGER_SESSION_LIMIT);
                forwardIntent.setPackage(context.getPackageName());
                context.sendBroadcast(forwardIntent);
            } catch (Exception ignored) {}
            return;
        }

        // Default: ACTION_SESSION_WARNING (10-minute warning)
        boolean isScheduled = prefs.getBoolean("alarm_scheduled", false);
        if (!isScheduled) {
            // Alarm was cancelled (e.g. user paused, took a break, or stopped session). Discard stale alert.
            return;
        }

        long triggerAtMs = prefs.getLong("trigger_at_ms", 0);
        long now = System.currentTimeMillis();
        // If alarm fired prematurely by more than 30 seconds due to a stale system intent, ignore
        if (triggerAtMs > 0 && now < (triggerAtMs - 30000L)) {
            return;
        }

        ensureAlertNotificationChannel(context);
        SessionAlarmManager.markWarningDelivered(context, true);

        // Open Room PendingIntent
        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
                context,
                0,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // Take a Break PendingIntent
        Intent takeBreakIntent = new Intent(context, MainActivity.class);
        takeBreakIntent.setAction(MainActivity.ACTION_TRIGGER_BREAK);
        takeBreakIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent takeBreakPendingIntent = PendingIntent.getActivity(
                context,
                2,
                takeBreakIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String title = "⏳ 10 Minutes Left in Study Session";
        String shortText = "Your 3-hour study session will automatically end in 10 minutes. Wrap up your goals or take a break to save your streak!";
        String bigText = "Your 3-hour study session will automatically end in 10 minutes. Wrap up your goals or take a break to preserve your focus streak!";
        String summaryText = "3-Hour Session Limit • Auto-Save";

        // Refined brand amber accent (#F59E0B) designed for top-tier contrast in both dark and light modes
        int brandAmber = Color.parseColor("#F59E0B");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, StudySessionService.CHANNEL_ID_ALERTS)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setColor(brandAmber)
                .setContentTitle(title)
                .setContentText(shortText)
                .setSubText(summaryText)
                .setStyle(new NotificationCompat.BigTextStyle()
                        .setBigContentTitle(title)
                        .bigText(bigText)
                        .setSummaryText(summaryText))
                .setContentIntent(openPendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setVibrate(new long[]{0, 250, 150, 250})
                .addAction(R.drawable.ic_stat_timer, "☕ Take a Break", takeBreakPendingIntent)
                .addAction(R.drawable.ic_stat_timer, "↗ " + context.getString(R.string.open_room), openPendingIntent);

        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(SessionAlarmManager.NOTIFICATION_ID_SESSION_WARNING, builder.build());
        }
    }

    public static void ensureAlertNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            NotificationChannel existing = manager.getNotificationChannel(StudySessionService.CHANNEL_ID_ALERTS);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                        StudySessionService.CHANNEL_ID_ALERTS,
                        "Study Alerts & Expiry Warnings",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("High-priority alerts before 3-hour session expiration");
                channel.enableLights(true);
                channel.setLightColor(Color.parseColor("#F59E0B"));
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 250, 150, 250});
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .build();
                channel.setSound(soundUri, audioAttributes);

                manager.createNotificationChannel(channel);
            }
        }
    }
}
