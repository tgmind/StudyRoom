import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useLiveRoom, getMemberMutationEpoch } from "@/hooks/useLiveRoom";
import { generateStableRivalryId, detectLiveRivalries, evaluateRivalryResolution } from "@/lib/time/rivalry";
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

function createMockUser(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: "user-default",
    display_name: "Default User",
    avatar_url: null,
    current_status: "offline",
    session_start_time: null,
    break_started_at: null,
    last_resumed_at: null,
    current_focus: null,
    has_achiever_badge: false,
    created_at: new Date().toISOString(),
    past_24h_study_seconds: 0,
    weekly_study_seconds: 0,
    total_sessions_count: 0,
    active_study_seconds_snapshot: 0,
    ...overrides,
  };
}

describe("Realtime Synchronization & Race Condition Guard", () => {
  let channelCallbacks: Record<string, Function> = {};
  let mockChannelObj: any;

  const defaultMockSetup = (users: UserProfile[] = []) => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: users, error: null }),
            then: (onfulfilled: any) => Promise.resolve({ data: users, error: null }).then(onfulfilled),
          }),
        };
      }
      if (table === "study_sessions") {
        const queryBuilder = {
          gte: vi.fn().mockReturnThis(),
          then: (onfulfilled: any) => Promise.resolve({ data: [], error: null }).then(onfulfilled),
        };
        return {
          select: vi.fn().mockReturnValue(queryBuilder),
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
      then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
    }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    channelCallbacks = {};

    mockChannelObj = {
      on: vi.fn((type: string, filterOrCb: any, maybeCb?: any) => {
        const key = type === "postgres_changes" ? `postgres_changes:${filterOrCb.table}` :
                    type === "broadcast" ? `broadcast:${filterOrCb.event}` :
                    type === "presence" ? `presence:${filterOrCb.event}` : type;
        const cb = maybeCb || filterOrCb;
        channelCallbacks[key] = cb;
        return mockChannelObj;
      }),
      subscribe: vi.fn((statusCb: (status: string) => void) => {
        channelCallbacks["status"] = statusCb;
        statusCb("SUBSCRIBED");
        return mockChannelObj;
      }),
      track: vi.fn().mockResolvedValue("ok"),
      send: vi.fn().mockResolvedValue("ok"),
      presenceState: vi.fn().mockReturnValue({}),
    };

    mockChannel.mockReturnValue(mockChannelObj);
    defaultMockSetup();
  });

  describe("1. Monotonic Versioning & Mutation Epochs", () => {
    it("extracts the highest epoch timestamp from multiple date fields", () => {
      const t1 = "2026-09-19T08:00:00.000Z";
      const t2 = "2026-09-19T09:30:00.000Z";
      const t3 = "2026-09-19T09:15:00.000Z";

      const epoch = getMemberMutationEpoch({
        session_start_time: t1,
        last_resumed_at: t2,
        break_started_at: t3,
      });

      expect(epoch).toBe(new Date(t2).getTime());
    });

    it("returns 0 when no valid timestamps are provided", () => {
      expect(getMemberMutationEpoch({})).toBe(0);
    });

    it("prevents stale in-flight REST response from overwriting newer realtime status", async () => {
      const oldTimestamp = "2026-09-19T08:00:00.000Z";
      const newTimestamp = "2026-09-19T09:00:00.000Z";

      const initialMember = createMockUser({
        id: "peer-user-1",
        display_name: "Aditya",
        current_status: "offline",
        last_offline_at: oldTimestamp,
        created_at: oldTimestamp,
        weekly_study_seconds: 7200,
        total_sessions_count: 5,
      });

      defaultMockSetup([initialMember]);

      const { result } = renderHook(() => useLiveRoom("my-user-id"));

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1);
      });

      // 1. Peer broadcasts new "studying" state via realtime
      act(() => {
        channelCallbacks["broadcast:member_status_update"]({
          payload: {
            id: "peer-user-1",
            display_name: "Aditya",
            current_status: "studying",
            session_start_time: newTimestamp,
            last_resumed_at: newTimestamp,
            weekly_study_seconds: 7200,
          },
        });
      });

      // Peer member is now studying in local state
      expect(result.current.members.find((m) => m.id === "peer-user-1")?.current_status).toBe("studying");

      // 2. Simulate a delayed REST fetch resolving with the older offline state
      await act(async () => {
        await result.current.refreshMembers();
      });

      // Monotonic check MUST protect the newer "studying" status from being overwritten by stale REST!
      const memberAfterRest = result.current.members.find((m) => m.id === "peer-user-1");
      expect(memberAfterRest?.current_status).toBe("studying");
      expect(memberAfterRest?.last_resumed_at).toBe(newTimestamp);
    });

    it("rejects delayed out-of-order broadcast packets with older epochs", async () => {
      const initialMember = createMockUser({
        id: "peer-user-2",
        display_name: "Subodh",
        current_status: "offline",
        created_at: "2026-09-19T07:00:00.000Z",
      });

      defaultMockSetup([initialMember]);

      const { result } = renderHook(() => useLiveRoom("my-user-id"));

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1);
      });

      const t1 = "2026-09-19T08:00:00.000Z";
      const t2 = "2026-09-19T08:30:00.000Z";

      // 1. Apply newer event first (t2)
      act(() => {
        channelCallbacks["broadcast:member_status_update"]?.({
          payload: {
            id: "peer-user-2",
            display_name: "Subodh",
            current_status: "studying",
            session_start_time: t2,
            last_resumed_at: t2,
          },
        });
      });

      expect(result.current.members.find((m) => m.id === "peer-user-2")?.current_status).toBe("studying");

      // 2. Now receive an out-of-order delayed packet from an earlier timestamp (t1)
      act(() => {
        channelCallbacks["broadcast:member_status_update"]?.({
          payload: {
            id: "peer-user-2",
            display_name: "Subodh",
            current_status: "offline",
            last_offline_at: t1,
          },
        });
      });

      // Out-of-order packet must be dropped; member remains "studying"
      expect(result.current.members.find((m) => m.id === "peer-user-2")?.current_status).toBe("studying");
    });
  });

  describe("2. Multi-Tab Presence Aggregation", () => {
    it("keeps user marked as is_present when Tab A leaves but Tab B remains connected", async () => {
      const initialMember = createMockUser({
        id: "user-multitab",
        display_name: "Multitab User",
        current_status: "offline",
        created_at: "2026-09-19T07:00:00.000Z",
      });

      defaultMockSetup([initialMember]);

      const { result } = renderHook(() => useLiveRoom("my-user-id"));

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1);
      });

      // 1. Two tabs connected for user-multitab
      mockChannelObj.presenceState.mockReturnValue({
        "presence-tab-1": [{ user_id: "user-multitab" }],
        "presence-tab-2": [{ user_id: "user-multitab" }],
      });

      act(() => {
        channelCallbacks["presence:sync"]?.();
      });

      expect(result.current.presentUserIds.has("user-multitab")).toBe(true);
      expect(result.current.members.find((m) => m.id === "user-multitab")?.is_present).toBe(true);

      // 2. Tab 1 leaves, but Tab 2 is still present
      mockChannelObj.presenceState.mockReturnValue({
        "presence-tab-2": [{ user_id: "user-multitab" }],
      });

      act(() => {
        channelCallbacks["presence:leave"]?.({ leftPresences: [{ user_id: "user-multitab" }] });
      });

      // User must STILL be present
      expect(result.current.presentUserIds.has("user-multitab")).toBe(true);
      expect(result.current.members.find((m) => m.id === "user-multitab")?.is_present).toBe(true);

      // 3. Tab 2 also leaves
      mockChannelObj.presenceState.mockReturnValue({});

      act(() => {
        channelCallbacks["presence:leave"]?.({ leftPresences: [{ user_id: "user-multitab" }] });
      });

      // User is now absent
      expect(result.current.presentUserIds.has("user-multitab")).toBe(false);
      expect(result.current.members.find((m) => m.id === "user-multitab")?.is_present).toBe(false);
    });
  });

  describe("3. Rivalry Identity Invariance & Leader Overtake", () => {
    it("generates deterministic and symmetric rivalry IDs regardless of argument order", () => {
      const idA = "user-aditya";
      const idB = "user-subodh";

      const id1 = generateStableRivalryId([idA, idB]);
      const id2 = generateStableRivalryId([idB, idA]);

      expect(id1).toBe(id2);
      expect(id1).toBe("rivalry-pair-user-aditya-user-subodh");
    });

    it("maintains stable rivalry identity and avoids false win when Subodh overtakes Aditya", () => {
      // Use a fixed Wednesday timestamp to guarantee outside Monday warm-up protection window
      const now = new Date("2026-09-16T10:00:00.000Z");

      const aditya = createMockUser({
        id: "user-aditya",
        display_name: "Aditya",
        current_status: "studying",
        session_start_time: new Date(now.getTime() - 1800 * 1000).toISOString(),
        weekly_study_seconds: 7200, // 2h 00m
      });

      const subodh = createMockUser({
        id: "user-subodh",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: new Date(now.getTime() - 1800 * 1000).toISOString(),
        weekly_study_seconds: 7000, // 1h 56m 40s (gap = 200s <= 600s, qualified)
      });

      // Round 1: Aditya leads
      const rivalriesRound1 = detectLiveRivalries([aditya, subodh], now);
      expect(rivalriesRound1).toHaveLength(1);
      const r1 = rivalriesRound1[0];
      expect(r1.id).toBe("rivalry-pair-user-aditya-user-subodh");
      expect(r1.rivalMembers[0].id).toBe("user-aditya"); // Aditya is leader

      // Round 2: Subodh studies more and overtakes Aditya (Subodh weekly = 7400, Aditya = 7200)
      const subodhLeading = createMockUser({
        ...subodh,
        weekly_study_seconds: 7400,
      });

      const rivalriesRound2 = detectLiveRivalries(
        [aditya, subodhLeading],
        now,
        undefined,
        undefined,
        rivalriesRound1
      );

      expect(rivalriesRound2).toHaveLength(1);
      const r2 = rivalriesRound2[0];
      // Rivalry ID MUST NOT CHANGE!
      expect(r2.id).toBe(r1.id);
      // New leader is Subodh
      expect(r2.rivalMembers[0].id).toBe("user-subodh");

      // During overtake, rivalry remains active (stillActive is true in MemberList)
      const stillActiveRound2 = rivalriesRound2.some((r) => r.id === r1.id);
      expect(stillActiveRound2).toBe(true);

      // And evaluateRivalryResolution must NOT emit a WON resolution!
      const resolution = evaluateRivalryResolution(r2, [aditya, subodhLeading], now);
      expect(resolution?.resolutionType).not.toBe("WON");

      // Round 3: Aditya overtakes Subodh again (Aditya = 7600)
      const adityaReclaimsLead = createMockUser({
        ...aditya,
        weekly_study_seconds: 7600,
      });

      const rivalriesRound3 = detectLiveRivalries(
        [adityaReclaimsLead, subodhLeading],
        now,
        undefined,
        undefined,
        rivalriesRound2
      );

      expect(rivalriesRound3).toHaveLength(1);
      const r3 = rivalriesRound3[0];
      expect(r3.id).toBe(r1.id);
      expect(r3.rivalMembers[0].id).toBe("user-aditya");

      // Still no false win
      const stillActiveRound3 = rivalriesRound3.some((r) => r.id === r1.id);
      expect(stillActiveRound3).toBe(true);
      const resolutionRound3 = evaluateRivalryResolution(r3, [adityaReclaimsLead, subodhLeading], now);
      expect(resolutionRound3?.resolutionType).not.toBe("WON");
    });
  });

  describe("4. Connection State Transitions", () => {
    it("transitions connectionState between connected, reconnecting, and offline truthfully", () => {
      const { result } = renderHook(() => useLiveRoom("my-user-id"));

      // Initial status callback fired SUBSCRIBED
      expect(result.current.connectionState).toBe("connected");
      expect(result.current.isRealtimeConnected).toBe(true);

      // Channel error / reconnecting
      act(() => {
        channelCallbacks["status"]?.("CHANNEL_ERROR");
      });
      expect(result.current.connectionState).toBe("reconnecting");
      expect(result.current.isRealtimeConnected).toBe(false);

      // Timeout / reconnecting
      act(() => {
        channelCallbacks["status"]?.("TIMED_OUT");
      });
      expect(result.current.connectionState).toBe("reconnecting");

      // Closed / offline
      act(() => {
        channelCallbacks["status"]?.("CLOSED");
      });
      expect(result.current.connectionState).toBe("offline");
      expect(result.current.isRealtimeConnected).toBe(false);

      // Re-subscribed / connected
      act(() => {
        channelCallbacks["status"]?.("SUBSCRIBED");
      });
      expect(result.current.connectionState).toBe("connected");
      expect(result.current.isRealtimeConnected).toBe(true);
    });
  });
});
