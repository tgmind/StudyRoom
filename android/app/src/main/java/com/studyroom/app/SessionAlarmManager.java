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
    public static final String ACTION_SESSION_LIMIT = "com.studyroom.app.ACTION_SESSION_LIMIT";
    public static final int NOTIFICATION_ID_SESSION_WARNING = 1002;
    public static final int NOTIFICATION_ID_SESSION_LIMIT = 1003;
    private static final int ALARM_REQUEST_CODE = 2001;
    private static final int ALARM_REQUEST_CODE_LIMIT = 2002;

    // 3 hours = 10,800 seconds. Warning alert is 10 minutes prior = 10,200 seconds.
    public static final long WARNING_THRESHOLD_SECONDS = 10200L;
    public static final long LIMIT_THRESHOLD_SECONDS = 10800L;

    private static final String PREFS_NAME = "studyroom_session_alarm_prefs";
    private static final String KEY_ALARM_SCHEDULED = "alarm_scheduled";
    private static final String KEY_TRIGGER_AT_MS = "trigger_at_ms";
    private static final String KEY_WARNING_DELIVERED = "warning_delivered";

    private static final String KEY_LIMIT_ALARM_SCHEDULED = "limit_alarm_scheduled";
    private static final String KEY_LIMIT_TRIGGER_AT_MS = "limit_trigger_at_ms";
    private static final String KEY_LIMIT_DELIVERED = "limit_delivered";

    /**
     * Schedules the 10-minute expiry warning alert and the 3-hour session completion limit alert.
     * Guarantees exact wake-up even when phone is locked or backgrounded in Android Doze mode.
     */
    public static void scheduleWarningAlarm(Context context, long accruedSeconds) {
        if (context == null) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean warningDelivered = prefs.getBoolean(KEY_WARNING_DELIVERED, false);
        boolean limitDelivered = prefs.getBoolean(KEY_LIMIT_DELIVERED, false);

        long now = System.currentTimeMillis();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        // Cancel prior alarms before arming new deadlines
        cancelWarningAlarm(context);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        // 1. WARNING ALARM (10,200 seconds)
        long remainingWarningSeconds = WARNING_THRESHOLD_SECONDS - accruedSeconds;
        if (remainingWarningSeconds <= 0) {
            if (!warningDelivered) {
                markWarningDelivered(context, true);
                Intent warningIntent = new Intent(context, SessionWarningReceiver.class);
                warningIntent.setAction(ACTION_SESSION_WARNING);
                context.sendBroadcast(warningIntent);
            }
        } else {
            long warningTriggerAtMs = now + (remainingWarningSeconds * 1000L);
            Intent warningIntent = new Intent(context, SessionWarningReceiver.class);
            warningIntent.setAction(ACTION_SESSION_WARNING);
            PendingIntent warningPendingIntent = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, warningIntent, flags);

            try {
                Intent showIntent = new Intent(context, MainActivity.class);
                PendingIntent showPendingIntent = PendingIntent.getActivity(
                        context, 0, showIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                );
                AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(warningTriggerAtMs, showPendingIntent);
                alarmManager.setAlarmClock(clockInfo, warningPendingIntent);

                prefs.edit()
                        .putBoolean(KEY_ALARM_SCHEDULED, true)
                        .putLong(KEY_TRIGGER_AT_MS, warningTriggerAtMs)
                        .putBoolean(KEY_WARNING_DELIVERED, false)
                        .apply();
                Log.i(TAG, "Scheduled 10-minute warning alarm in " + remainingWarningSeconds + "s");
            } catch (Exception e) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, warningTriggerAtMs, warningPendingIntent);
                    } else {
                        alarmManager.setExact(AlarmManager.RTC_WAKEUP, warningTriggerAtMs, warningPendingIntent);
                    }
                    prefs.edit()
                            .putBoolean(KEY_ALARM_SCHEDULED, true)
                            .putLong(KEY_TRIGGER_AT_MS, warningTriggerAtMs)
                            .putBoolean(KEY_WARNING_DELIVERED, false)
                            .apply();
                } catch (Exception ex) {
                    Log.e(TAG, "Failed to schedule warning alarm: " + ex.getMessage());
                }
            }
        }

        // 2. LIMIT ALARM (10,800 seconds / 3 hours)
        long remainingLimitSeconds = LIMIT_THRESHOLD_SECONDS - accruedSeconds;
        if (remainingLimitSeconds <= 0) {
            if (!limitDelivered) {
                markLimitDelivered(context, true);
                Intent limitIntent = new Intent(context, SessionWarningReceiver.class);
                limitIntent.setAction(ACTION_SESSION_LIMIT);
                context.sendBroadcast(limitIntent);
            }
        } else {
            long limitTriggerAtMs = now + (remainingLimitSeconds * 1000L);
            Intent limitIntent = new Intent(context, SessionWarningReceiver.class);
            limitIntent.setAction(ACTION_SESSION_LIMIT);
            PendingIntent limitPendingIntent = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE_LIMIT, limitIntent, flags);

            try {
                Intent showIntent = new Intent(context, MainActivity.class);
                PendingIntent showPendingIntent = PendingIntent.getActivity(
                        context, 1, showIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                );
                AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(limitTriggerAtMs, showPendingIntent);
                alarmManager.setAlarmClock(clockInfo, limitPendingIntent);

                prefs.edit()
                        .putBoolean(KEY_LIMIT_ALARM_SCHEDULED, true)
                        .putLong(KEY_LIMIT_TRIGGER_AT_MS, limitTriggerAtMs)
                        .putBoolean(KEY_LIMIT_DELIVERED, false)
                        .apply();
                Log.i(TAG, "Scheduled 3-hour limit alarm in " + remainingLimitSeconds + "s");
            } catch (Exception e) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, limitTriggerAtMs, limitPendingIntent);
                    } else {
                        alarmManager.setExact(AlarmManager.RTC_WAKEUP, limitTriggerAtMs, limitPendingIntent);
                    }
                    prefs.edit()
                            .putBoolean(KEY_LIMIT_ALARM_SCHEDULED, true)
                            .putLong(KEY_LIMIT_TRIGGER_AT_MS, limitTriggerAtMs)
                            .putBoolean(KEY_LIMIT_DELIVERED, false)
                            .apply();
                } catch (Exception ex) {
                    Log.e(TAG, "Failed to schedule limit alarm: " + ex.getMessage());
                }
            }
        }
    }

    /**
     * Cancels any pending warning and limit alarms, dismissing active warning notifications.
     */
    public static void cancelWarningAlarm(Context context) {
        if (context == null) return;

        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            if (alarmManager != null) {
                // Cancel warning alarm
                Intent warningIntent = new Intent(context, SessionWarningReceiver.class);
                warningIntent.setAction(ACTION_SESSION_WARNING);
                PendingIntent warningPending = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, warningIntent, flags);
                alarmManager.cancel(warningPending);
                warningPending.cancel();

                // Cancel limit alarm
                Intent limitIntent = new Intent(context, SessionWarningReceiver.class);
                limitIntent.setAction(ACTION_SESSION_LIMIT);
                PendingIntent limitPending = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE_LIMIT, limitIntent, flags);
                alarmManager.cancel(limitPending);
                limitPending.cancel();
            }

            // Dismiss active warning notification
            NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(NOTIFICATION_ID_SESSION_WARNING);
            }

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putBoolean(KEY_ALARM_SCHEDULED, false)
                    .putLong(KEY_TRIGGER_AT_MS, 0)
                    .putBoolean(KEY_LIMIT_ALARM_SCHEDULED, false)
                    .putLong(KEY_LIMIT_TRIGGER_AT_MS, 0)
                    .apply();

            Log.i(TAG, "Cancelled session alarms.");
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling alarms: " + e.getMessage());
        }
    }

    public static void markWarningDelivered(Context context, boolean delivered) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_WARNING_DELIVERED, delivered).apply();
    }

    public static void markLimitDelivered(Context context, boolean delivered) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_LIMIT_DELIVERED, delivered).apply();
    }
}
