// Lightweight Realtime & Latency Diagnostics for StudyRoom Realtime 3.0
// Accessible via window.__studyRoomDiag for non-intrusive runtime telemetry.

export interface DiagEvent {
  event: string;
  timestamp: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

export interface StudyRoomDiagnostics {
  version: string;
  events: DiagEvent[];
  lastActionToUIMs?: number;
  lastBroadcastLatencyMs?: number;
  lastRestSyncDurationMs?: number;
  recordEvent: (event: string, meta?: Record<string, unknown>, durationMs?: number) => void;
  getSummary: () => Record<string, unknown>;
  clear: () => void;
}

declare global {
  interface Window {
    __studyRoomDiag?: StudyRoomDiagnostics;
  }
}

const MAX_DIAG_EVENTS = 100;

export function recordDiagEvent(
  event: string,
  meta?: Record<string, unknown>,
  durationMs?: number
): void {
  if (typeof window === "undefined") return;

  if (!window.__studyRoomDiag) {
    const diag: StudyRoomDiagnostics = {
      version: "3.0.0",
      events: [],
      recordEvent: (evt, m, d) => recordDiagEvent(evt, m, d),
      getSummary: () => {
        if (!window.__studyRoomDiag) return {};
        const events = window.__studyRoomDiag.events;
        const counts: Record<string, number> = {};
        for (const e of events) {
          counts[e.event] = (counts[e.event] || 0) + 1;
        }
        return {
          totalEvents: events.length,
          counts,
          lastActionToUIMs: window.__studyRoomDiag.lastActionToUIMs,
          lastBroadcastLatencyMs: window.__studyRoomDiag.lastBroadcastLatencyMs,
          lastRestSyncDurationMs: window.__studyRoomDiag.lastRestSyncDurationMs,
        };
      },
      clear: () => {
        if (window.__studyRoomDiag) {
          window.__studyRoomDiag.events = [];
        }
      },
    };
    window.__studyRoomDiag = diag;
  }

  const entry: DiagEvent = {
    event,
    timestamp: Date.now(),
    durationMs,
    meta,
  };

  if (event === "action_to_ui" && durationMs !== undefined) {
    window.__studyRoomDiag.lastActionToUIMs = durationMs;
  } else if (event === "broadcast_received" && meta?.latencyMs !== undefined) {
    window.__studyRoomDiag.lastBroadcastLatencyMs = meta.latencyMs as number;
  } else if (event === "rest_sync_finished" && durationMs !== undefined) {
    window.__studyRoomDiag.lastRestSyncDurationMs = durationMs;
  }

  window.__studyRoomDiag.events.push(entry);
  if (window.__studyRoomDiag.events.length > MAX_DIAG_EVENTS) {
    window.__studyRoomDiag.events.shift();
  }
}
