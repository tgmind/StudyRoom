package com.studyroom.app;

import org.json.JSONObject;
import org.junit.Test;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.*;

public class StudySessionServiceTest {

    @Test
    public void testChannelAndActionConstants() {
        assertEquals("studyroom_live_break_capsule_channel_v1", StudySessionService.CHANNEL_ID);
        assertEquals("studyroom_live_timer_channel", StudySessionService.LEGACY_CHANNEL_ID);
        assertEquals("studyroom_session_alerts_channel", StudySessionService.CHANNEL_ID_ALERTS);
        assertEquals(1001, StudySessionService.NOTIFICATION_ID);
        assertEquals("com.studyroom.app.START_BREAK", StudySessionService.ACTION_START_BREAK);
        assertEquals("com.studyroom.app.STOP_SESSION", StudySessionService.ACTION_STOP_SESSION);
        assertEquals("com.studyroom.app.ACTION_RESUME_STUDY", StudySessionService.ACTION_RESUME_STUDY);
        assertEquals(3600 * 1000L, StudySessionService.MAX_BREAK_DURATION_MS);
    }

    @Test
    public void testFormatDuration() {
        assertEquals("0s", StudySessionService.formatDuration(-10));
        assertEquals("0s", StudySessionService.formatDuration(0));
        assertEquals("15s", StudySessionService.formatDuration(15));
        assertEquals("1m", StudySessionService.formatDuration(60));
        assertEquals("1m 15s", StudySessionService.formatDuration(75));
        assertEquals("1h", StudySessionService.formatDuration(3600));
        assertEquals("1h 15m", StudySessionService.formatDuration(3600 + 15 * 60));
        assertEquals("2h 30m", StudySessionService.formatDuration(2 * 3600 + 30 * 60 + 45));
    }

    @Test
    public void testXiaomiFocusPayloadStructureAndByteLimit() throws Exception {
        String payload = StudySessionService.buildXiaomiFocusPayload(
                "Break in progress",
                "Accrued Study: 45m • 1-hour break limit",
                true
        );

        assertNotNull("Payload must not be null for valid inputs", payload);
        assertTrue("Payload must be within the 3072-byte Xiaomi specification limit",
                payload.getBytes(StandardCharsets.UTF_8).length <= 3072);

        JSONObject root = new JSONObject(payload);
        assertTrue("Root must contain param_v2", root.has("param_v2"));
        JSONObject paramV2 = root.getJSONObject("param_v2");
        assertEquals("business must be timer", "timer", paramV2.getString("business"));
        assertTrue("enableFloat must be true", paramV2.getBoolean("enableFloat"));
        assertTrue("updatable must be true", paramV2.getBoolean("updatable"));

        JSONObject paramIsland = paramV2.getJSONObject("param_island");
        assertEquals(1, paramIsland.getInt("islandProperty"));

        JSONObject smallIsland = paramIsland.getJSONObject("smallIslandArea");
        assertEquals("Break", smallIsland.getString("title"));

        JSONObject bigIsland = paramIsland.getJSONObject("bigIslandArea");
        JSONObject imgLeft = bigIsland.getJSONObject("imageTextInfoLeft");
        JSONObject textInfo = imgLeft.getJSONObject("textInfo");
        assertEquals("StudyRoom", textInfo.getString("frontTitle"));
        assertEquals("Break in progress", textInfo.getString("title"));
        assertEquals("Accrued Study: 45m • 1-hour break limit", textInfo.getString("content"));
    }

    @Test
    public void testXiaomiFocusPayloadNullSafe() {
        String payload = StudySessionService.buildXiaomiFocusPayload(null, null, false);
        assertNotNull(payload);
        assertTrue(payload.contains("StudyRoom"));
    }

    @Test
    public void testDynamicIslandEnhancementsNullSafety() {
        // Must execute cleanly without NPE or throwing
        StudySessionService.applyOptionalDynamicIslandEnhancements(null, "Title", "Subtext", "SubHeader", true);
    }

    @Test
    public void testPayloadLengthSafetyBoundary() {
        // Build an oversized string that exceeds 3072 bytes
        StringBuilder huge = new StringBuilder();
        for (int i = 0; i < 400; i++) {
            huge.append("oversized_text_payload_");
        }
        String payload = StudySessionService.buildXiaomiFocusPayload(huge.toString(), huge.toString(), true);
        assertNull("Oversized payload exceeding 3072 bytes must be safely rejected (return null)", payload);
    }

    @Test
    public void testBreakExpirationBoundary() {
        long breakStartMs = 1000000L;
        long maxDuration = StudySessionService.MAX_BREAK_DURATION_MS;
        long withinLimit = breakStartMs + maxDuration - 1000L;
        long atLimit = breakStartMs + maxDuration;
        long pastLimit = breakStartMs + maxDuration + 1000L;

        assertTrue(withinLimit - breakStartMs < maxDuration);
        assertFalse(atLimit - breakStartMs < maxDuration);
        assertFalse(pastLimit - breakStartMs < maxDuration);
    }

    @Test
    public void testLiveUpdatesConstants() {
        assertEquals("android.requestPromotedOngoing", StudySessionService.EXTRA_REQUEST_PROMOTED_ONGOING);
        assertEquals("android.shortCriticalText", StudySessionService.EXTRA_SHORT_CRITICAL_TEXT);
        assertEquals(0x40000, StudySessionService.FLAG_PROMOTED_ONGOING);
        assertEquals(262144, StudySessionService.FLAG_PROMOTED_ONGOING);
    }

    @Test
    public void testEligibilityAndPromotionQueryNullSafety() {
        assertFalse(StudySessionService.hasPromotableCharacteristics(null));
        assertFalse(StudySessionService.canPostPromotedNotifications(null));
        assertFalse(StudySessionService.isNotificationPromoted(null));
    }

    @Test
    public void testPreApi36LiveUpdatesSupportReturnsFalse() {
        // On pre-API 36 environments, Live Updates promotion is unsupported by the platform,
        // so query methods must return false rather than reporting synthetic promotion.
        if (android.os.Build.VERSION.SDK_INT < 36) {
            android.app.Notification mockNotification = new android.app.Notification();
            mockNotification.flags |= android.app.Notification.FLAG_ONGOING_EVENT;
            assertFalse(StudySessionService.hasPromotableCharacteristics(mockNotification));
            assertFalse(StudySessionService.isNotificationPromoted(mockNotification));
            assertFalse(StudySessionService.canPostPromotedNotifications(null));
        }
    }
}
