package com.studyroom.app;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

public class SessionAlarmManager {

    private static final String TAG = "SessionAlarmManager";
    public static final String ACTION_SESSION_WARNING = "com.studyroom.app.ACTION_SESSION_WARNING";
    public static final int NOTIFICATION_ID_SESSION_WARNING = 1002;
    private static final int ALARM_REQUEST_CODE = 2001;

    // 3 hours = 10,800 seconds. Warning alert is 10 minutes prior = 10,200 seconds.
    public static final long WARNING_THRESHOLD_SECONDS = 10200L;

    private static final String PREFS_NAME = "studyroom_session_alarm_prefs";
    private static final String KEY_ALARM_SCHEDULED = "alarm_scheduled";
    private static final String KEY_TRIGGER_AT_MS = "trigger_at_ms";
    private static final String KEY_WARNING_DELIVERED = "warning_delivered";

    /**
     * Schedules the 10-minute expiry warning alert based on total accrued study time.
     * If user already accrued >= 10,200 seconds, fires alert immediately if not already delivered.
     */
    public static void scheduleWarningAlarm(Context context, long accruedSeconds) {
        if (context == null) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean alreadyDelivered = prefs.getBoolean(KEY_WARNING_DELIVERED, false);

        long remainingSeconds = WARNING_THRESHOLD_SECONDS - accruedSeconds;

        if (remainingSeconds <= 0) {
            // Reached or past 2h 50m! Deliver alert immediately if not already sent
            if (!alreadyDelivered) {
                markWarningDelivered(context, true);
                Intent warningIntent = new Intent(context, SessionWarningReceiver.class);
                warningIntent.setAction(ACTION_SESSION_WARNING);
                context.sendBroadcast(warningIntent);
            }
            return;
        }

        // Always cancel any prior scheduled alarm before arming a new deadline
        cancelWarningAlarm(context);

        // Calculate exact future timestamp based on authoritative remaining active study seconds
        long now = System.currentTimeMillis();
        long triggerAtMs = now + (remainingSeconds * 1000L);

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, SessionWarningReceiver.class);
        intent.setAction(ACTION_SESSION_WARNING);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags);

        try {
            // setAlarmClock provides highest priority wake-up, bypassing Doze and power savers
            Intent showIntent = new Intent(context, MainActivity.class);
            PendingIntent showPendingIntent = PendingIntent.getActivity(
                    context,
                    0,
                    showIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(triggerAtMs, showPendingIntent);
            alarmManager.setAlarmClock(clockInfo, pendingIntent);

            prefs.edit()
                    .putBoolean(KEY_ALARM_SCHEDULED, true)
                    .putLong(KEY_TRIGGER_AT_MS, triggerAtMs)
                    .putBoolean(KEY_WARNING_DELIVERED, false)
                    .apply();

            Log.i(TAG, "Scheduled 10-minute warning alarm in " + remainingSeconds + "s at " + triggerAtMs);
        } catch (Exception e) {
            // Fallback for restricted environments
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent);
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent);
                }
                prefs.edit()
                        .putBoolean(KEY_ALARM_SCHEDULED, true)
                        .putLong(KEY_TRIGGER_AT_MS, triggerAtMs)
                        .putBoolean(KEY_WARNING_DELIVERED, false)
                        .apply();
            } catch (Exception ex) {
                Log.e(TAG, "Failed to schedule alarm: " + ex.getMessage());
            }
        }
    }

    /**
     * Cancels any pending warning alarm and dismisses active warning notifications.
     * Called when the user takes a break, pauses, finishes, or stops the session.
     */
    public static void cancelWarningAlarm(Context context) {
        if (context == null) return;

        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager != null) {
                Intent intent = new Intent(context, SessionWarningReceiver.class);
                intent.setAction(ACTION_SESSION_WARNING);

                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }

                PendingIntent pendingIntent = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags);
                alarmManager.cancel(pendingIntent);
                pendingIntent.cancel();
            }

            // Dismiss any active warning notification
            NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(NOTIFICATION_ID_SESSION_WARNING);
            }

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putBoolean(KEY_ALARM_SCHEDULED, false)
                    .putLong(KEY_TRIGGER_AT_MS, 0)
                    .apply();

            Log.i(TAG, "Cancelled 10-minute warning alarm.");
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling warning alarm: " + e.getMessage());
        }
    }

    public static void markWarningDelivered(Context context, boolean delivered) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_WARNING_DELIVERED, delivered).apply();
    }
}
