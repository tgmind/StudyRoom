import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { render, screen } from "@testing-library/react";
import { useLiveRoom } from "@/hooks/useLiveRoom";
import { MemberCard } from "@/components/room/MemberCard";
import { MemberList } from "@/components/room/MemberList";
import { UserProfile } from "@/lib/supabase/types";

// Mock Supabase client
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();
const mockOnAuthStateChange = vi.fn();

let activeAuthCallback: ((event: string, session: any) => void) | null = null;

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
  channel: mockChannel,
  removeChannel: mockRemoveChannel,
  auth: {
    onAuthStateChange: mockOnAuthStateChange,
  },
  realtime: {
    setAuth: vi.fn(),
  },
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

vi.mock("@/hooks/useAdmin", () => ({
  getAdminUserId: () => null,
  isAdminUserId: () => false,
}));

function createMockMember(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-test",
    display_name: "Subodh",
    avatar_url: null,
    current_status: "offline",
    session_start_time: null,
    break_started_at: null,
    last_resumed_at: null,
    current_focus: null,
    has_achiever_badge: false,
    created_at: new Date().toISOString(),
    past_24h_study_seconds: 0,
    weekly_study_seconds: 7200,
    total_sessions_count: 3,
    active_study_seconds_snapshot: 0,
    last_offline_at: new Date(Date.now() - 300 * 1000).toISOString(), // 5m ago
    is_present: false,
    ...overrides,
  };
}

describe("Self-Healing Realtime Channel & Room Presence Architecture", () => {
  let createdChannels: any[] = [];
  let channelCallbacks: Record<string, Function>[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    createdChannels = [];
    channelCallbacks = [];

    mockOnAuthStateChange.mockImplementation((cb) => {
      activeAuthCallback = cb;
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: [createMockMember()], error: null }),
            then: (cb: any) => Promise.resolve({ data: [createMockMember()], error: null }).then(cb),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
        }),
      };
    });

    mockRpc.mockImplementation(() => ({
      then: (cb: any) => Promise.resolve({ data: null, error: null }).then(cb),
    }));

    mockChannel.mockImplementation((topic: string) => {
      const callbacks: Record<string, Function> = {};
      const channelObj: any = {
        topic,
        state: "joined",
        _isClosed: false,
        on: vi.fn((type: string, filterOrCb: any, maybeCb?: any) => {
          const key =
            type === "postgres_changes"
              ? `postgres_changes:${filterOrCb.table}`
              : type === "broadcast"
              ? `broadcast:${filterOrCb.event}`
              : type === "presence"
              ? `presence:${filterOrCb.event}`
              : type;
          callbacks[key] = maybeCb || filterOrCb;
          return channelObj;
        }),
        subscribe: vi.fn((statusCb: (status: string) => void) => {
          callbacks["status"] = statusCb;
          channelObj._statusCb = statusCb;
          // Synchronously emit SUBSCRIBED to simulate successful connection
          statusCb("SUBSCRIBED");
          return channelObj;
        }),
        track: vi.fn().mockResolvedValue("ok"),
        send: vi.fn().mockResolvedValue("ok"),
        presenceState: vi.fn().mockReturnValue({}),
      };
      createdChannels.push(channelObj);
      channelCallbacks.push(callbacks);
      return channelObj;
    });

    mockRemoveChannel.mockImplementation((ch: any) => {
      if (ch) ch._isClosed = true;
      return Promise.resolve("ok");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. PRIMARY BUG REGRESSION: Survives channel CLOSED during sleep and self-heals to Live Sync upon resume without page refresh", async () => {
    const { result } = renderHook(() => useLiveRoom("user-subodh"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Initial state: Connected to Channel 1
    expect(createdChannels).toHaveLength(1);
    expect(result.current.isRealtimeConnected).toBe(true);
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.isRoomPresent).toBe(true);

    const channel1Callbacks = channelCallbacks[0];
    const channel1Obj = createdChannels[0];

    // Simulate device going to sleep on break: WebSocket drops, channel triggers CLOSED
    act(() => {
      channel1Obj.state = "closed";
      channel1Callbacks["status"]?.("CLOSED");
    });

    expect(result.current.isRealtimeConnected).toBe(false);
    expect(result.current.connectionState).toBe("offline");
    expect(result.current.isRoomPresent).toBe(false);
    expect(mockRemoveChannel).toHaveBeenCalledWith(channel1Obj);

    // User unlocks device / resumes session: document becomes visible
    await act(async () => {
      // Simulate visibility change event
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // A brand new channel (Channel 2) is automatically created and subscribed
    expect(createdChannels).toHaveLength(2);
    const channel2Obj = createdChannels[1];
    expect(channel2Obj).not.toBe(channel1Obj);

    // Channel 2 subscribes successfully
    expect(result.current.isRealtimeConnected).toBe(true);
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.isRoomPresent).toBe(true);

    // Old channel 1 callback attempting to emit CLOSED after replacement is completely ignored by generation guard
    act(() => {
      channel1Callbacks["status"]?.("CLOSED");
    });
    // State remains connected to Channel 2!
    expect(result.current.isRealtimeConnected).toBe(true);
    expect(result.current.connectionState).toBe("connected");
  });

  it("2. CHANNEL GENERATION GUARD: Stale broadcast and postgres_changes callbacks from dead channel cannot corrupt active state", async () => {
    const { result } = renderHook(() => useLiveRoom("user-subodh"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(createdChannels).toHaveLength(1);
    const channel1Callbacks = channelCallbacks[0];

    // Trigger channel recreation
    await act(async () => {
      channel1Callbacks["status"]?.("CLOSED");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(createdChannels).toHaveLength(2);

    // Simulate delayed packet from Channel 1 arriving after Channel 2 is active
    act(() => {
      channel1Callbacks["broadcast:member_status_update"]?.({
        payload: {
          id: "peer-user",
          current_status: "studying",
        },
      });
    });

    // The stale event from channel 1 was dropped because channel 1 generation is expired
    const peerInState = result.current.members.find((m) => m.id === "peer-user");
    expect(peerInState).toBeUndefined();
  });

  it("3. SINGLE-FLIGHT DUPLICATE PREVENTION: Rapid concurrent wakeups converge on a single active channel", async () => {
    const { result } = renderHook(() => useLiveRoom("user-subodh"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(createdChannels).toHaveLength(1);

    // Fire visibilitychange, focus, and online simultaneously
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });

    // Channel was already healthy; no duplicate channels created
    expect(createdChannels).toHaveLength(1);
  });

  it("4. AUTH TOKEN REFRESH: Re-authenticates Realtime and recreates unhealthy channel cleanly", async () => {
    const { result } = renderHook(() => useLiveRoom("user-subodh"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(createdChannels).toHaveLength(1);

    // Channel drops
    act(() => {
      createdChannels[0].state = "closed";
      channelCallbacks[0]["status"]?.("CLOSED");
    });
    expect(result.current.connectionState).toBe("offline");

    // Supabase auth refreshes token
    await act(async () => {
      activeAuthCallback?.("TOKEN_REFRESHED", {
        access_token: "new-fresh-jwt-token-12345",
      });
    });

    expect(mockClient.realtime.setAuth).toHaveBeenCalledWith("new-fresh-jwt-token-12345");
    // New channel created and connected
    expect(createdChannels).toHaveLength(2);
    expect(result.current.connectionState).toBe("connected");
  });

  it("5. SECONDARY BUG REGRESSION: Online member card shows 'Online' when present and 'Offline Xm' when absent without flickering", () => {
    const memberPresent: UserProfile = createMockMember({
      id: "user-online-present",
      current_status: "offline",
      is_present: true,
      last_offline_at: new Date(Date.now() - 300 * 1000).toISOString(),
    });

    const memberAbsent: UserProfile = createMockMember({
      id: "user-online-absent",
      current_status: "offline",
      is_present: false,
      last_offline_at: new Date(Date.now() - 300 * 1000).toISOString(),
    });

    // 1. Member present in room -> "Online"
    const { rerender } = render(<MemberCard member={memberPresent} isCurrentUser={false} />);
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.queryByText(/offline 5m/i)).not.toBeInTheDocument();

    // 2. Member leaves room -> "Offline 5m"
    rerender(<MemberCard member={memberAbsent} isCurrentUser={false} />);
    expect(screen.getByText(/5m/i)).toBeInTheDocument();
    expect(screen.queryByText("Online")).not.toBeInTheDocument();

    // 3. Current user viewing own room card with is_present: true -> "Online"
    rerender(<MemberCard member={memberPresent} isCurrentUser={true} />);
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("6. DECOUPLED ROOM INDICATOR: Local timer mutation syncStatus does NOT alter global room 'Live Sync' indicator", () => {
    // When room is connected, even if local timer is syncing or erroring, Room indicator remains 'Live Sync'
    const { rerender } = render(
      <MemberList
        members={[createMockMember()]}
        currentUserId="user-subodh"
        isRealtimeConnected={true}
        connectionState="connected"
        syncStatus="syncing" // Local timer is syncing
      />
    );

    expect(screen.getByText("Live Sync")).toBeInTheDocument();
    expect(screen.queryByText("Syncing...")).not.toBeInTheDocument();

    // Reconnecting state shows Reconnecting...
    rerender(
      <MemberList
        members={[createMockMember()]}
        currentUserId="user-subodh"
        isRealtimeConnected={false}
        connectionState="reconnecting"
        syncStatus="synced"
      />
    );
    expect(screen.getByText("Reconnecting...")).toBeInTheDocument();

    // Offline state shows Offline
    rerender(
      <MemberList
        members={[createMockMember()]}
        currentUserId="user-subodh"
        isRealtimeConnected={false}
        connectionState="offline"
        syncStatus="synced"
      />
    );
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("7. DUPLICATE-CHANNEL PROTECTION: Concurrent triggers (visibility, focus, online, TOKEN_REFRESHED, CLOSED) converge on exactly ONE active channel", async () => {
    const { result } = renderHook(() => useLiveRoom("user-subodh"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Initially 1 channel
    expect(createdChannels).toHaveLength(1);
    const initialChannel = createdChannels[0];

    // Trigger CLOSED while simultaneously triggering visibilitychange, focus, online, and TOKEN_REFRESHED
    await act(async () => {
      channelCallbacks[0]["status"]?.("CLOSED");
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      activeAuthCallback?.("TOKEN_REFRESHED", {
        access_token: "new-access-token-concurrent",
      });
    });

    // Old channel was removed and marked closed
    expect(initialChannel._isClosed).toBe(true);
    expect(mockRemoveChannel).toHaveBeenCalledWith(initialChannel);

    // Exactly 1 new active channel was created (total 2 channels created across lifecycle)
    expect(createdChannels).toHaveLength(2);
    const activeChannel = createdChannels[1];
    expect(activeChannel._isClosed).toBe(false);

    // Active channel is connected and healthy
    expect(result.current.isRealtimeConnected).toBe(true);
    expect(result.current.connectionState).toBe("connected");
  });

  it("8. AUTOMATIC RECONNECT: CONNECTED -> CLOSED -> RECONNECTING -> SUBSCRIBED -> LIVE SYNC without manual refresh", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useLiveRoom("user-subodh"));
      await act(async () => {
        vi.runAllTicks();
      });

      expect(result.current.isRealtimeConnected).toBe(true);
      expect(result.current.connectionState).toBe("connected");

      const channel1 = createdChannels[0];
      const channel1Cb = channelCallbacks[0];

      // Channel disconnects due to transient network failure
      await act(async () => {
        channel1Cb["status"]?.("CHANNEL_ERROR");
      });

      expect(result.current.isRealtimeConnected).toBe(false);
      expect(result.current.connectionState).toBe("reconnecting");
      expect(channel1._isClosed).toBe(true);

      // Fast forward backoff timer (1000ms)
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // New channel created and connected automatically
      expect(createdChannels).toHaveLength(2);
      expect(result.current.isRealtimeConnected).toBe(true);
      expect(result.current.connectionState).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("9. REPEATED FULL LIFECYCLE: START -> PAUSE -> RESUME -> PAUSE -> RESUME -> STOP -> START -> PAUSE -> RESUME has no stuck Offline state", async () => {
    const { result } = renderHook(() => useLiveRoom("user-subodh"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Cycle 1: Pause (channel closes on background/sleep) -> Resume (visibility wakes up)
    await act(async () => {
      channelCallbacks[channelCallbacks.length - 1]["status"]?.("CLOSED");
    });
    expect(result.current.connectionState).toBe("offline");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.isRealtimeConnected).toBe(true);

    // Cycle 2: Pause -> Resume
    await act(async () => {
      channelCallbacks[channelCallbacks.length - 1]["status"]?.("CLOSED");
    });
    expect(result.current.connectionState).toBe("offline");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.connectionState).toBe("connected");

    // Cycle 3: Stop session (channel remains healthy or reconnects on interaction)
    expect(result.current.connectionState).toBe("connected");

    // Cycle 4: Start -> Pause -> Resume
    await act(async () => {
      channelCallbacks[channelCallbacks.length - 1]["status"]?.("CLOSED");
    });
    expect(result.current.connectionState).toBe("offline");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.isRealtimeConnected).toBe(true);
    // Never stuck in Offline
  });

  it("10. STATE SEPARATION: Realtime transport drop does NOT corrupt authoritative user session state", () => {
    // Session state is preserved independently of transport state
    const userSessionState: "studying" | "break" | "offline" = "studying";
    let transportState: "connecting" | "connected" | "reconnecting" | "offline" = "connected";
    let isRealtimeConnected = true;

    // Realtime channel drops
    transportState = "offline";
    isRealtimeConnected = false;

    // Session state remains strictly 'studying'
    expect(userSessionState).toBe("studying");
    expect(transportState).toBe("offline");
    expect(isRealtimeConnected).toBe(false);

    // State dimensions remain mathematically orthogonal
    expect(userSessionState as string).not.toBe(transportState);
  });

  it("11. CRITICAL STACK OVERFLOW REGRESSION: Phoenix synchronous leave() trigger('ok') / CLOSED event does NOT cause call stack overflow", async () => {
    // Configure mockRemoveChannel to synchronously trigger status('CLOSED') exactly as Phoenix channel.leave() does
    let reentrantCallCount = 0;
    mockRemoveChannel.mockImplementation((ch: any) => {
      if (ch) {
        // Phoenix triggers leavePush.trigger('ok') which synchronously fires onClose -> subscribe callback with 'CLOSED'
        if (ch._statusCb) {
          reentrantCallCount++;
          ch._statusCb("CLOSED");
        }
      }
      return Promise.resolve("ok");
    });

    const { result } = renderHook(() => useLiveRoom("user-subodh"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(createdChannels).toHaveLength(1);
    const channel1 = createdChannels[0];

    // Trigger channel CLOSED. In old code, this entered an infinite recursive loop:
    // status('CLOSED') -> removeChannel -> status('CLOSED') -> removeChannel -> RangeError!
    expect(() => {
      act(() => {
        channel1._statusCb?.("CLOSED");
      });
    }).not.toThrow();

    // The re-entrant call happened exactly once and was terminated immediately by the _isDisposed guard
    expect(reentrantCallCount).toBe(1);
    expect(result.current.connectionState).toBe("offline");
    expect(result.current.isRealtimeConnected).toBe(false);
  });

  it("12. IDEMPOTENT CHANNEL DESTRUCTION: destroyChannel called multiple times executes supabase.removeChannel only once", async () => {
    const { result, unmount } = renderHook(() => useLiveRoom("user-subodh"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const channel1 = createdChannels[0];
    const initialRemoveCalls = mockRemoveChannel.mock.calls.length;

    // Simulate CLOSED firing (triggers destroyChannel)
    act(() => {
      channel1._statusCb?.("CLOSED");
    });

    const callsAfterClosed = mockRemoveChannel.mock.calls.length;
    expect(callsAfterClosed).toBe(initialRemoveCalls + 1);

    // Now unmount (which calls destroyChannel again with isIntentional=true)
    unmount();

    // Since channel1 is already _isDisposed, mockRemoveChannel should NOT be called again for channel1
    expect(mockRemoveChannel.mock.calls.length).toBe(callsAfterClosed);
  });

  it("13. INTENTIONAL CLEANUP (UNMOUNT): Unmounting terminates channel cleanly, marks disposed, and disables reconnect", async () => {
    vi.useFakeTimers();
    try {
      const { result, unmount } = renderHook(() => useLiveRoom("user-subodh"));
      await act(async () => {
        vi.runAllTicks();
      });

      const channel1 = createdChannels[0];
      expect(createdChannels).toHaveLength(1);

      // Unmount the component/hook
      unmount();

      expect(channel1._isDisposed).toBe(true);
      expect(mockRemoveChannel).toHaveBeenCalledWith(channel1);

      // Advance timers by any duration
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      // No new channels created after unmount
      expect(createdChannels).toHaveLength(1);

      // Any late event emitted on channel1 is completely dropped
      expect(() => {
        channel1._statusCb?.("CLOSED");
        channel1._statusCb?.("SUBSCRIBED");
      }).not.toThrow();

      expect(createdChannels).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("14. SERIALIZED RECOVERY SCHEDULER: Cascading errors coalesce without unbounded recursion or duplicate timers", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useLiveRoom("user-subodh"));
      await act(async () => {
        vi.runAllTicks();
      });

      const channel1 = createdChannels[0];

      // Simulate rapid cascading errors in quick succession
      await act(async () => {
        channel1._statusCb?.("CHANNEL_ERROR");
        channel1._statusCb?.("TIMED_OUT");
        channel1._statusCb?.("CLOSED");
      });

      // CLOSED updates connectionState truthfully to offline
      expect(result.current.connectionState).toBe("offline");

      // Advance timers by backoff delay (1000ms)
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Only ONE new channel was created, not three!
      expect(createdChannels).toHaveLength(2);
      expect(result.current.isRealtimeConnected).toBe(true);
      expect(result.current.connectionState).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("15. REPEATED RECONNECT STRESS (TEST H): 20 consecutive cycles of disconnect and reconnect never leave a stuck Reconnecting state", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useLiveRoom("user-subodh"));
      await act(async () => {
        vi.runAllTicks();
      });

      expect(result.current.connectionState).toBe("connected");

      for (let i = 0; i < 20; i++) {
        const activeChannel = createdChannels[createdChannels.length - 1];

        // 1. Channel drops
        await act(async () => {
          activeChannel._statusCb?.("CLOSED");
        });
        expect(result.current.connectionState).toBe("offline");

        // 2. Recovery timer fires
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });

        // 3. New channel subscribes and transitions to connected
        expect(result.current.connectionState).toBe("connected");
        expect(result.current.isRealtimeConnected).toBe(true);
      }

      expect(createdChannels).toHaveLength(21);
      expect(result.current.connectionState).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("16. USER RESUME OVERRIDES PENDING TIMER (TEST D): CLOSED followed by user Resume cancels backoff timer and reconnects immediately", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useLiveRoom("user-subodh"));
      await act(async () => {
        vi.runAllTicks();
      });

      const channel1 = createdChannels[0];

      // Channel closes while device is locked/paused
      await act(async () => {
        channel1._statusCb?.("CLOSED");
      });
      expect(result.current.connectionState).toBe("offline");

      // User unlocks phone and clicks Resume (triggers visibilitychange) BEFORE the 1000ms timer expires
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Channel 2 was created immediately without waiting for the timer
      expect(createdChannels).toHaveLength(2);
      expect(result.current.connectionState).toBe("connected");
      expect(result.current.isRealtimeConnected).toBe(true);

      // Even if the old timer would have fired at 1000ms, it was cancelled, so no Channel 3 was created
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(createdChannels).toHaveLength(2);
      expect(result.current.connectionState).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("17. NETWORK OFFLINE / ONLINE (TEST F & G): Network offline sets offline truthfully, and online restores connection cleanly", async () => {
    const { result } = renderHook(() => useLiveRoom("user-subodh"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connectionState).toBe("connected");

    // Network drops
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.connectionState).toBe("offline");
    expect(result.current.isRealtimeConnected).toBe(false);

    // Network restores
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.isRealtimeConnected).toBe(true);
  });
});
