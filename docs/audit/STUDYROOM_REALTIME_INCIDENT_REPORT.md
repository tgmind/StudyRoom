# STUDYROOM REALTIME PRODUCTION INCIDENT REPORT
**Incident Report Reference:** INC-20261019-RT-RECOVERY  
**Classification:** Critical Production Reliability & UX  
**Date:** October 19, 2026  
**Auditor / Lead Investigator:** Principal Real-time Systems Engineer & Architecture Lead  
**Scope:** Android Native & WebView Shell, Service Worker, Supabase Realtime Streams, Room Sync Lifecycle, Session Timer Engine  

---

## Executive Summary

During active production operation of StudyRoom, three critical real-time failure modes were identified affecting Android users, web users, and global room participants:

1. **Incident A (Android False "You are Offline" Screen)**: Users opening the Android application on functioning Wi-Fi/mobile networks were intermittently locked out behind a full-screen "You are Offline" page.
2. **Incident B (Global Room Stuck "Syncing…" Purple Pill)**: The Global Room status pill remained stuck in an indefinite "Syncing…" state despite active WebSocket connectivity and fully populated live member cards.
3. **Incident C (Website Live Study Timer Frozen at `00:00:00`)**: Users with an active studying session on the website experienced a frozen timer displaying `00:00:00` upon page load or tab refresh instead of their actual accrued study duration.

This report provides the forensic trace, exact file locations, root cause mechanics, and impact analysis for each incident.

---

## Incident A: Android False Offline Lockout

### 1. Symptoms & Observed Behavior
- On launching the Android application (especially cold starts or under moderate cellular latency), users see the full-screen dark card stating:
  > *"You are Offline. StudyRoom requires a network connection for live group synchronization. Please check your connection and try again."*
- Tapping "Retry Connection" or waiting fails to automatically recover the app even when the device has full Wi-Fi or 5G connectivity.
- Android system logs indicate native connectivity is active (`NET_CAPABILITY_INTERNET` present), yet the WebView displays the offline page.

### 2. Forensic Trace & Code Identification

#### Location 1: `public/sw.js` (Lines 137–169)
```javascript
// HTML / App Navigation Routes: Network-First with 3s timeout and clean offline fallback
if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
  event.respondWith(
    (async () => {
      try {
        // 3-second network timeout to prevent infinite hanging on degraded mobile networks / Lie-Fi
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const networkResponse = await fetch(event.request, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (networkResponse) {
          return networkResponse;
        }
        throw new Error("Empty network response");
      } catch (fetchErr) {
        // Network failure or timeout: serve neutral precached offline fallback
        const offlineFallback = await caches.match(OFFLINE_URL);
        if (offlineFallback) return offlineFallback;
        return new Response("You are offline. Please reconnect.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }
    })()
  );
  return;
}
```

#### Location 2: `public/offline.html` (Lines 50–57)
```html
<body>
  <div class="card">
    <h1>You are Offline</h1>
    <p>StudyRoom requires a network connection for live group synchronization. Please check your connection and try again.</p>
    <button onclick="window.location.reload()">Retry Connection</button>
  </div>
</body>
```

#### Location 3: `android/app/src/main/java/com/studyroom/app/MainActivity.java` (Lines 453–460, 670–680)
```java
// WebViewClient error handler
@Override
public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
    super.onReceivedError(view, request, error);
    if (request.isForMainFrame()) {
        swipeRefreshLayout.setRefreshing(false);
        webView.setVisibility(View.GONE);
        offlineContainer.setVisibility(View.VISIBLE);
    }
}

// ConnectivityManager.NetworkCallback
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
            } else if (webView != null) { ... }
        });
    }
};
```

### 3. Root Cause Analysis
1. **Ultra-Aggressive Navigation Timeout (3000ms)**:
   In `public/sw.js`, navigation requests are aborted via `AbortController` after only 3.0 seconds. On cold mobile app startup, DNS resolution, TLS handshake to Netlify edge, and initial HTML stream delivery routinely exceed 3.0 seconds (typically 3.2s–4.5s on 4G/3G or congested Wi-Fi).
2. **HTTP 200 Masking Native Error Interception**:
   When the fetch aborts at 3000ms, the Service Worker catches `AbortError` and responds with `caches.match(OFFLINE_URL)` with HTTP 200 OK.
   Because the Service Worker returned a valid HTTP 200 response, Android's `WebViewClient.onReceivedError()` **never fires**.
   Consequently, the native `offlineContainer` is never shown; instead, the WebView itself renders `public/offline.html`.
3. **Missing Auto-Reconnect & State Lockout**:
   - `MainActivity.java`'s `networkCallback.onAvailable()` explicitly checks `if (offlineContainer.getVisibility() == View.VISIBLE)`. Since `offlineContainer` is `View.GONE`, native network reconnection events never reload the WebView.
   - `public/offline.html` contains zero JavaScript listeners (`window.addEventListener('online', ...)`, `visibilitychange`, or ping backoff). Once rendered inside the WebView, the page remains static indefinitely until manual user intervention.

---

## Incident B: Global Room View Stuck "Syncing…"

### 1. Symptoms & Observed Behavior
- Upon opening `/room`, member cards render immediately with real-time status badges, avatars, and live times.
- The status pill at the top of the room header remains purple/blue and continuously states **“Syncing…”** (or oscillates between "Syncing…" and "Live Sync") indefinitely.
- Supabase Realtime channel status is `SUBSCRIBED` and messages stream correctly, yet the UI claims the room is syncing.

### 2. Forensic Trace & Code Identification

#### Location 1: `hooks/useLiveRoom.ts` (Lines 242–246, 379, 406, 644–655)
```typescript
const fetchMembers = useCallback(async () => {
  const fetchStartMs = Date.now();
  const thisFetchGen = ++fetchGenRef.current;
  setIsReconciling(true); // <-- Set to true on EVERY fetch
  try {
    // Phase 1: Critical Live Snapshot
    ...
    setLoading(false);

    // Phase 2: Secondary Async Enrichment
    let secondaryPromise: Promise<void> | null = null; // Line 379: outer declaration
    if (shouldRunSecondary) {
      ...
      const secondaryPromise = Promise.allSettled([...]) // Line 406: SHADOWS outer variable!
    }

    if (secondaryPromise) { // Line 644: Always null due to variable shadowing!
      await secondaryPromise;
    }
  } catch (err) {
    ...
  } finally {
    if (thisFetchGen === fetchGenRef.current) { // Line 651: Skipped if newer fetch arrived!
      setIsReconciling(false);
    }
    setLoading(false);
  }
}, [...]);
```

#### Location 2: `hooks/useLiveRoom.ts` (Lines 585–608)
```typescript
// Trailing deferred trigger runs every 3 seconds:
} else {
  secondaryDeferredRef.current = true;
  if (!secondaryDeferredTimerRef.current) {
    const waitTime = Math.max(100, 3000 - timeSinceLastSecondary);
    secondaryDeferredTimerRef.current = setTimeout(() => {
      secondaryDeferredTimerRef.current = null;
      fetchMembersRef.current(); // <-- Calls fetchMembers again, flipping isReconciling back to true!
    }, waitTime);
  }
}
```

#### Location 3: `components/room/MemberList.tsx` (Lines 577–592)
```typescript
const isTrulyConnected =
  isRealtimeConnected &&
  (connectionState === "connected" || (!connectionState && isRealtimeConnected)) &&
  isOnline &&
  !isLoading &&
  !isReconciling; // <-- Blocks "Live" whenever isReconciling is true
const isSyncing = !isOffline && !isReconnecting && !isConnecting && (isLoading || Boolean(isReconciling));
const isLive = isTrulyConnected && !isSyncing && !isConnecting;
```

### 3. Root Cause Analysis
1. **Variable Shadowing Defect**:
   In `useLiveRoom.ts`, `let secondaryPromise: Promise<void> | null = null;` is declared at line 379. At line 406, `const secondaryPromise = Promise.allSettled(...)` re-declares a new block-scoped variable that shadows the outer variable. Consequently, line 644 (`if (secondaryPromise) await secondaryPromise;`) tests the outer null variable, leaving the secondary async queries as an unawaited floating background promise.
2. **Permanent Reconciliation Lock on Generation Mismatch**:
   `setIsReconciling(true)` is invoked at the start of every `fetchMembers` invocation. In `finally`, `setIsReconciling(false)` is guarded by `if (thisFetchGen === fetchGenRef.current)`. If any realtime event or subscription trigger increments `fetchGenRef.current` while a fetch is in progress, the earlier fetch's `finally` block silently skips setting `isReconciling` to `false`.
3. **Conflation of Core Live Readiness with Secondary Statistical Enrichment**:
   `MemberList.tsx` explicitly evaluates `isSyncing = ... (isLoading || Boolean(isReconciling))` and `isTrulyConnected = ... !isReconciling`.
   `isReconciling` only represents background enrichment of secondary statistical fields (past 24h session counts, leaderboard scores, rivalry history). The primary room snapshot and Supabase Realtime WebSocket are already fully connected and live. Treating background analytics reconciliation as a blocker for "Live Sync" forces the UI into a perpetual "Syncing…" false state.

---

## Incident C: Website Live Study Timer Freezing at `00:00:00`

### 1. Symptoms & Observed Behavior
- A student has an active study session in progress (e.g., started 20 minutes ago).
- When navigating to `/room` on the web or reloading the tab, the main session clock displays `00:00:00` and does not advance.
- The user appears as "studying" on peer cards, but their own controller clock remains frozen at zero.

### 2. Forensic Trace & Code Identification

#### Location 1: `hooks/useActiveSession.ts` (Lines 220–236)
```typescript
const [elapsedStudySeconds, setElapsedStudySeconds] = useState<number>(() => {
  if (profile) {
    if (profile.current_status === "studying" && !isMemberTimerCalibrating(profile)) {
      return calculateMemberElapsedStudySeconds(profile, getServerNow());
    }
    const studyState = getActiveStudyState();
    ...
  }
  return 0; // Profile is null on mount during auth hydration, returns 0!
});
```

#### Location 2: `hooks/useActiveSession.ts` (Lines 488–495)
```typescript
// Immediate elapsed study seconds sync when on break
useEffect(() => {
  if (currentStatus === "break" && profile) {
    const accrued = calculateMemberElapsedStudySeconds(profile, getServerNow());
    setElapsedStudySeconds(accrued);
  }
}, [currentStatus, profile?.active_study_seconds_snapshot, profile]);
// NOTE: MISSING CORRESPONDING EFFECT FOR currentStatus === "studying"!
```

#### Location 3: `hooks/useActiveSession.ts` (Lines 1446–1484)
```typescript
useEffect(() => {
  if (currentStatus !== "studying") return;

  const computeCurrentSeconds = (now: Date) => {
    const p = profileRef.current;
    // Tier 1: Authoritative profile timestamps (if not calibrating)
    if (p && p.current_status === "studying" && !isMemberTimerCalibrating(p)) {
      const s = calculateMemberElapsedStudySeconds(p, now);
      lastAuthoritativeElapsedRef.current = s;
      return s;
    }
    // Tier 2: Authoritative server session_blocks (unlinked active blocks)
    const b = blocksRef.current;
    if (b && b.length > 0) { ... }
    // Tier 3: Local cached study state (read-only fallback)
    const studyState = getActiveStudyState();
    if (studyState && studyState.sessionStartTime) { ... }
    // Tier 4: Memory continuity while calibrating
    if (lastAuthoritativeElapsedRef.current > 0) {
      return lastAuthoritativeElapsedRef.current;
    }
    return 0; // Calibrating fallthrough returns 0!
  };

  const tick = () => {
    setElapsedStudySeconds(computeCurrentSeconds(getServerNow()));
  };

  tick();
  const intervalId = setInterval(tick, 1000);
  ...
}, [currentStatus, localStatusOverride]);
```

### 3. Root Cause Analysis
1. **Asynchronous Auth Hydration Gap**:
   On initial render, `profile` is `null` because `useAuth()` loads credentials and profiles asynchronously. `useState(() => ...)` initializes `elapsedStudySeconds` to `0`.
2. **Missing Active Study Synchronization Effect**:
   When `profile` hydrates with `current_status: 'studying'`, `useActiveSession` has an explicit `useEffect` to sync accrued seconds for `currentStatus === "break"`, but **no corresponding effect for `currentStatus === "studying"`**.
3. **Calibrating Fallthrough Zeroing Active Timers**:
   If `isMemberTimerCalibrating(p)` returns `true` (e.g., when a profile has accrued break snapshots or pending resume updates), Tier 1 is skipped. Tier 2 (`blocksRef.current`) is empty before REST query completes, Tier 3 (`localStorage`) is empty on clean web browsers, and Tier 4 (`lastAuthoritativeElapsedRef.current`) is `0`.
   As a result, `computeCurrentSeconds()` returns `0`, overwriting `elapsedStudySeconds` with `0` every single second and freezing the active timer at `00:00:00`.
4. **Missing Profile Dependency in Tick Interval**:
   The 1-second tick interval hook depends strictly on `[currentStatus, localStatusOverride]`. When `profile` subsequently receives its authoritative timestamps from the server, the tick effect does not re-anchor, leaving the timer uncalibrated.

---

## Action Matrix & Priority Resolution

| Incident | Severity | Target Files | Primary Fix Mechanics |
| :--- | :--- | :--- | :--- |
| **Incident A** | **Critical** | `public/sw.js`<br>`public/offline.html`<br>`MainActivity.java` | 1. Expand navigation fetch timeout from 3s to 10s.<br>2. Add auto-reconnect listeners and backoff polling to `offline.html`.<br>3. Enhance native WebView network recovery to reload if offline page is rendered. |
| **Incident B** | **Critical** | `hooks/useLiveRoom.ts`<br>`components/room/MemberList.tsx` | 1. Eliminate `secondaryPromise` variable shadowing.<br>2. Guarantee `setIsReconciling(false)` in `finally` without generation lock.<br>3. Decouple background secondary enrichment from room "Live Sync" status pill. |
| **Incident C** | **Critical** | `hooks/useActiveSession.ts`<br>`lib/time/format.ts` | 1. Add immediate profile hydration effect for `currentStatus === "studying"`.<br>2. Anchor `computeCurrentSeconds()` to authoritative `session_start_time` even during calibration.<br>3. Eliminate fallthrough to `0` when active study session exists. |
