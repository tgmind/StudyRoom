import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useLiveRoom } from "@/hooks/useLiveRoom";
import { detectLiveRivalries } from "@/lib/time/rivalry";
import { UserProfile } from "@/lib/supabase/types";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
  channel: mockChannel,
  removeChannel: mockRemoveChannel,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

vi.mock("@/hooks/useAdmin", () => ({
  getAdminUserId: () => null,
  isAdminUserId: () => false,
}));

describe("useLiveRoom Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    });
  });

  it("successfully fetches members when an expired break user is present without throwing TypeError on .catch", async () => {
    const sixtyFiveMinutesAgo = new Date(Date.now() - 65 * 60 * 1000).toISOString();

    const mockUsers = [
      {
        id: "user-active",
        display_name: "Alice",
        current_status: "studying",
        session_start_time: new Date().toISOString(),
        break_started_at: null,
        active_study_seconds_snapshot: 1200,
      },
      {
        id: "user-expired-break",
        display_name: "Bob",
        current_status: "break",
        session_start_time: new Date(Date.now() - 7200 * 1000).toISOString(),
        break_started_at: sixtyFiveMinutesAgo,
        active_study_seconds_snapshot: 3600,
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: mockUsers, error: null }).then(onfulfilled),
          }),
        };
      }
      if (table === "study_sessions") {
        const queryBuilder = {
          gte: vi.fn().mockReturnThis(),
          then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onfulfilled),
        };
        return {
          select: vi.fn().mockReturnValue(queryBuilder),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    // Simulate PostgrestFilterBuilder: it is a PromiseLike (has .then), but has NO .catch!
    mockRpc.mockImplementation(() => {
      return {
        then(onfulfilled?: (val: unknown) => unknown, onrejected?: (err: unknown) => unknown) {
          return Promise.resolve({ data: { success: true }, error: null }).then(onfulfilled, onrejected);
        },
      };
    });

    const { result } = renderHook(() => useLiveRoom("user-active"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.members).toHaveLength(2);
    // Active user should be first, expired break user should be treated as offline and sorted after
    expect(result.current.members[0].id).toBe("user-active");
    expect(result.current.members[1].id).toBe("user-expired-break");
    // Verify RPC was triggered for the expired break user
    expect(mockRpc).toHaveBeenCalledWith("rpc_stop_user_session", {
      p_user_id: "user-expired-break",
    });
  });

  it("handles RPC errors gracefully without failing member loading", async () => {
    const sixtyFiveMinutesAgo = new Date(Date.now() - 65 * 60 * 1000).toISOString();

    const mockUsers = [
      {
        id: "user-expired-break-2",
        display_name: "Charlie",
        current_status: "break",
        break_started_at: sixtyFiveMinutesAgo,
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: mockUsers, error: null }).then(onfulfilled),
          }),
        };
      }
      if (table === "study_sessions") {
        const queryBuilder = {
          gte: vi.fn().mockReturnThis(),
          then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onfulfilled),
        };
        return {
          select: vi.fn().mockReturnValue(queryBuilder),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    // RPC returning error object (e.g. function missing in DB)
    mockRpc.mockImplementation(() => {
      return {
        then(onfulfilled?: (val: unknown) => unknown, onrejected?: (err: unknown) => unknown) {
          return Promise.resolve({
            data: null,
            error: { message: "Could not find the function public.rpc_stop_user_session" },
          }).then(onfulfilled, onrejected);
        },
      };
    });

    const { result } = renderHook(() => useLiveRoom());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.members).toHaveLength(1);
    expect(result.current.members[0].id).toBe("user-expired-break-2");
  });

  it("calculates weekly sessions count correctly resetting older sessions from previous weeks", async () => {
    const mockUsers = [
      {
        id: "user-weekly",
        display_name: "Diana",
        current_status: "offline",
        last_offline_at: new Date().toISOString(),
      },
    ];

    const now = new Date();
    // One session 1 hour ago (clearly within current week unless exactly Monday 00:30 UTC)
    const sessionThisWeek = {
      user_id: "user-weekly",
      duration_minutes: 45,
      start_time: new Date(now.getTime() - 3600 * 1000).toISOString(),
      end_time: new Date(now.getTime() - 1800 * 1000).toISOString(),
    };
    // One session 10 days ago (definitely in a past week)
    const sessionPastWeek = {
      user_id: "user-weekly",
      duration_minutes: 60,
      start_time: new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
      end_time: new Date(now.getTime() - (10 * 24 * 3600 - 3600) * 1000).toISOString(),
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: mockUsers, error: null }).then(onfulfilled),
          }),
        };
      }
      if (table === "study_sessions") {
        const queryBuilder = {
          gte: vi.fn().mockReturnThis(),
          then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
            Promise.resolve({ data: [sessionThisWeek, sessionPastWeek], error: null }).then(onfulfilled),
        };
        return {
          select: vi.fn().mockReturnValue(queryBuilder),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const { result } = renderHook(() => useLiveRoom());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toHaveLength(1);
    const member = result.current.members[0];
    // Must track weekly session count (1 session), ignoring the 10-days-ago session
    expect(member.total_sessions_count).toBe(1);
    expect(member.weekly_sessions_count).toBe(1);
  });

  it("enriches members with leaderboard scores and ranks concurrently from rpc_get_leaderboard", async () => {
    const mockUsers = [
      {
        id: "user-alpha",
        display_name: "Alpha",
        current_status: "studying",
        session_start_time: new Date().toISOString(),
      },
      {
        id: "user-beta",
        display_name: "Beta",
        current_status: "studying",
        session_start_time: new Date().toISOString(),
      },
    ];

    const mockLeaderboard = [
      { user_id: "user-beta", score: 95.5 },
      { user_id: "user-alpha", score: 82.0 },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: mockUsers, error: null }).then(onfulfilled),
          }),
        };
      }
      if (table === "study_sessions") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnThis(),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(onfulfilled),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    mockRpc.mockImplementation((fn: string) => {
      if (fn === "rpc_get_leaderboard") {
        return {
          then(onfulfilled?: (val: unknown) => unknown, onrejected?: (err: unknown) => unknown) {
            return Promise.resolve({ data: mockLeaderboard, error: null }).then(onfulfilled, onrejected);
          },
        };
      }
      return {
        then(onfulfilled?: (val: unknown) => unknown, onrejected?: (err: unknown) => unknown) {
          return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
        },
      };
    });

    const { result } = renderHook(() => useLiveRoom());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const alpha = result.current.members.find((m) => m.id === "user-alpha");
    const beta = result.current.members.find((m) => m.id === "user-beta");

    expect(alpha?.leaderboard_score).toBe(82.0);
    expect(alpha?.leaderboard_rank).toBe(2);
    expect(beta?.leaderboard_score).toBe(95.5);
    expect(beta?.leaderboard_rank).toBe(1);
  });

  it("authoritatively overrides stale cached 'studying' peer when server snapshot returns 'offline'", async () => {
    // 1. Seed localStorage with a stale studying peer that has synthetic state_version: 2
    const cachedPeer: UserProfile = {
      id: "peer-1",
      display_name: "Rival Bob",
      avatar_url: null,
      current_status: "studying",
      current_focus: "Solving problems",
      session_start_time: new Date(Date.now() - 3600 * 1000).toISOString(),
      last_resumed_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      break_started_at: null,
      active_study_seconds_snapshot: 3600,
      weekly_study_seconds: 36000,
      total_sessions_count: 5,
      weekly_sessions_count: 5,
      leaderboard_score: 90,
      leaderboard_rank: 1,
      has_achiever_badge: false,
      created_at: "2026-09-01T00:00:00Z",
      state_version: 2,
    };

    const currentUser: UserProfile = {
      id: "user-current",
      display_name: "Alice",
      avatar_url: null,
      current_status: "studying",
      current_focus: "Math",
      session_start_time: new Date(Date.now() - 3500 * 1000).toISOString(),
      last_resumed_at: new Date(Date.now() - 3500 * 1000).toISOString(),
      break_started_at: null,
      active_study_seconds_snapshot: 3500,
      weekly_study_seconds: 35800,
      total_sessions_count: 5,
      weekly_sessions_count: 5,
      leaderboard_score: 88,
      leaderboard_rank: 2,
      has_achiever_badge: false,
      created_at: "2026-09-01T00:00:00Z",
      state_version: 1,
    };

    localStorage.setItem(
      "studyroom_cached_room_members",
      JSON.stringify([currentUser, cachedPeer])
    );

    // 2. Database returns peer as OFFLINE without state_version (as in real Supabase production DB)
    const serverUsers = [
      {
        ...currentUser,
        // In real DB, state_version column does not exist
        state_version: undefined,
      },
      {
        id: "peer-1",
        display_name: "Rival Bob",
        avatar_url: null,
        current_status: "offline", // Authoritatively finished session!
        current_focus: null,
        session_start_time: null,
        last_resumed_at: null,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
        last_offline_at: new Date().toISOString(),
        created_at: "2026-09-01T00:00:00Z",
        state_version: undefined,
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: serverUsers, error: null }),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: serverUsers, error: null }).then(onfulfilled),
          }),
        };
      }
      if (table === "study_sessions") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnThis(),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(onfulfilled),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    // 3. Render hook
    const { result } = renderHook(() => useLiveRoom("user-current"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const peerInState = result.current.members.find((m) => m.id === "peer-1");
    expect(peerInState).toBeDefined();

    // MUST be offline! Stale cache MUST NOT override authoritative server state
    expect(peerInState?.current_status).toBe("offline");
    expect(peerInState?.session_start_time).toBeNull();
    expect(peerInState?.break_started_at).toBeNull();
    expect(peerInState?.active_study_seconds_snapshot).toBe(0);

    // 4. Verify Rivalry Detection dissolves immediately
    const activeMembers = result.current.members.filter(
      (m) => m.current_status === "studying" || m.current_status === "break"
    );
    expect(activeMembers).toHaveLength(1);
    expect(activeMembers[0].id).toBe("user-current");

    const rivalries = detectLiveRivalries(activeMembers, new Date(), "user-current");
    expect(rivalries).toHaveLength(0); // Rivalry dissolved!
  });

  it("instantly dissolves rivalry when peer sends offline realtime update without version", async () => {
    const fixedNow = new Date("2026-09-24T12:00:00.000Z");

    const initialUsers = [
      {
        id: "user-current",
        display_name: "Alice",
        avatar_url: null,
        current_status: "studying",
        session_start_time: new Date(fixedNow.getTime() - 1800 * 1000).toISOString(),
        weekly_study_seconds: 36000,
        leaderboard_rank: 1,
        leaderboard_score: 95,
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "peer-1",
        display_name: "Bob",
        avatar_url: null,
        current_status: "studying",
        session_start_time: new Date(fixedNow.getTime() - 1800 * 1000).toISOString(),
        weekly_study_seconds: 35800,
        leaderboard_rank: 2,
        leaderboard_score: 93,
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    let postgresChangesCb: ((payload: any) => void) | null = null;
    mockChannel.mockReturnValue({
      on: vi.fn().mockImplementation((type: string, filter: any, callback: any) => {
        if (type === "postgres_changes" && filter.table === "users") {
          postgresChangesCb = callback;
        }
        return mockChannel();
      }),
      subscribe: vi.fn().mockReturnThis(),
      track: vi.fn().mockResolvedValue("ok"),
      send: vi.fn().mockResolvedValue("ok"),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: initialUsers, error: null }),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: initialUsers, error: null }).then(onfulfilled),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onfulfilled),
        }),
      };
    });

    const { result } = renderHook(() => useLiveRoom("user-current"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Both are studying: rivalry is active
    let activeMembers = result.current.members.filter(
      (m) => m.current_status === "studying" || m.current_status === "break"
    );
    expect(activeMembers).toHaveLength(2);
    let rivalries = detectLiveRivalries(activeMembers, fixedNow, "user-current");
    expect(rivalries).toHaveLength(1);
    expect(rivalries[0].rivalMembers.map((m) => m.id)).toEqual(
      expect.arrayContaining(["user-current", "peer-1"])
    );

    // Simulate PostgreSQL sending postgres_changes UPDATE event when peer finishes session
    // (payload has NO state_version, and last_offline_at timestamp)
    expect(postgresChangesCb).not.toBeNull();

    act(() => {
      postgresChangesCb?.({
        eventType: "UPDATE",
        new: {
          id: "peer-1",
          current_status: "offline",
          session_start_time: null,
          break_started_at: null,
          last_resumed_at: null,
          active_study_seconds_snapshot: 0,
          current_focus: null,
          last_offline_at: new Date(fixedNow.getTime() - 100).toISOString(),
          // state_version is undefined in DB
        },
      });
    });

    const updatedPeer = result.current.members.find((m) => m.id === "peer-1");
    expect(updatedPeer?.current_status).toBe("offline");
    expect(updatedPeer?.session_start_time).toBeNull();

    // Rivalry is immediately dissolved
    activeMembers = result.current.members.filter(
      (m) => m.current_status === "studying" || m.current_status === "break"
    );
    expect(activeMembers).toHaveLength(1);
    rivalries = detectLiveRivalries(activeMembers, fixedNow, "user-current");
    expect(rivalries).toHaveLength(0);
  });

  it("protects current user local active session while correctly applying peer offline snapshot", async () => {
    // Current user is locally active in this client
    const initialUsers = [
      {
        id: "user-current",
        display_name: "Alice",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 600 * 1000).toISOString(),
        active_study_seconds_snapshot: 600,
        weekly_study_seconds: 36000,
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "peer-1",
        display_name: "Bob",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 600 * 1000).toISOString(),
        weekly_study_seconds: 36000,
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: initialUsers, error: null }),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: initialUsers, error: null }).then(onfulfilled),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onfulfilled),
        }),
      };
    });

    const { result } = renderHook(() => useLiveRoom("user-current"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members[0].current_status).toBe("studying");

    // In-flight REST response arrives where server temporarily returned offline for current user,
    // and offline for peer
    const staleServerResponse = [
      {
        id: "user-current",
        display_name: "Alice",
        current_status: "offline",
        session_start_time: null,
        last_offline_at: new Date(Date.now() - 1000).toISOString(),
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "peer-1",
        display_name: "Bob",
        current_status: "offline",
        session_start_time: null,
        last_offline_at: new Date().toISOString(),
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: staleServerResponse, error: null }),
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: staleServerResponse, error: null }).then(onfulfilled),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onfulfilled),
        }),
      };
    });

    // Trigger refresh
    await act(async () => {
      await result.current.refreshMembers();
    });

    const currentInState = result.current.members.find((m) => m.id === "user-current");
    const peerInState = result.current.members.find((m) => m.id === "peer-1");

    // Current user's active session is protected from stale in-flight REST
    expect(currentInState?.current_status).toBe("studying");
    expect(currentInState?.session_start_time).not.toBeNull();

    // Peer user's authoritative offline state is accepted
    expect(peerInState?.current_status).toBe("offline");
    expect(peerInState?.session_start_time).toBeNull();
  });
});
