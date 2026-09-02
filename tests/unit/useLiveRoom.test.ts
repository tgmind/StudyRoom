import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLiveRoom } from "@/hooks/useLiveRoom";

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
        return {
          select: vi.fn().mockReturnValue({
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(onfulfilled),
          }),
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
        return {
          select: vi.fn().mockReturnValue({
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(onfulfilled),
          }),
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
});
