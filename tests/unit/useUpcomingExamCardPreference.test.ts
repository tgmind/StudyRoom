import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useUpcomingExamCardPreference,
  resolvePreferenceValue,
  getStorageKey,
  UPCOMING_EXAM_CARD_PREF_EVENT,
} from "@/hooks/useUpcomingExamCardPreference";
import * as useAuthModule from "@/hooks/useAuth";
import * as supabaseClientModule from "@/lib/supabase/client";

describe("useUpcomingExamCardPreference Hook & Resolvers", () => {
  const mockUpdateUser = vi.fn();
  const mockGetSession = vi.fn();
  const mockSupabase = {
    auth: {
      updateUser: mockUpdateUser,
      getSession: mockGetSession,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-abc" } } },
      error: null,
    });
    mockUpdateUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.spyOn(supabaseClientModule, "createClient").mockReturnValue(mockSupabase as any);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("resolvePreferenceValue helper", () => {
    it("defaults to true when both metadata and storage are empty or undefined", () => {
      expect(resolvePreferenceValue(undefined, null)).toBe(true);
      expect(resolvePreferenceValue(null, null)).toBe(true);
    });

    it("respects cloud metadata value false", () => {
      expect(resolvePreferenceValue(false, null)).toBe(false);
      expect(resolvePreferenceValue("false", null)).toBe(false);
      expect(resolvePreferenceValue(false, "true")).toBe(false); // cloud metadata overrides local
    });

    it("respects cloud metadata value true", () => {
      expect(resolvePreferenceValue(true, null)).toBe(true);
      expect(resolvePreferenceValue(true, "false")).toBe(true); // cloud metadata overrides local
    });

    it("falls back to local storage when cloud metadata is undefined", () => {
      expect(resolvePreferenceValue(undefined, "false")).toBe(false);
      expect(resolvePreferenceValue(undefined, "true")).toBe(true);
    });
  });

  describe("Hook behavior", () => {
    it("initializes with default true when user has no metadata set", () => {
      vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
        user: { id: "user-abc", user_metadata: {} } as any,
        profile: null,
        loading: false,
        error: null,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        updateProfileOptimistic: vi.fn(),
      });

      const { result } = renderHook(() => useUpcomingExamCardPreference());
      expect(result.current.showRoomUpcomingCard).toBe(true);
    });

    it("initializes with false when user_metadata.show_room_upcoming_card is false", () => {
      vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
        user: {
          id: "user-abc",
          user_metadata: { show_room_upcoming_card: false },
        } as any,
        profile: null,
        loading: false,
        error: null,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        updateProfileOptimistic: vi.fn(),
      });

      const { result } = renderHook(() => useUpcomingExamCardPreference());
      expect(result.current.showRoomUpcomingCard).toBe(false);
    });

    it("toggleShowRoomUpcomingCard toggles from true to false and calls supabase.auth.updateUser", async () => {
      vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
        user: { id: "user-abc", user_metadata: {} } as any,
        profile: null,
        loading: false,
        error: null,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        updateProfileOptimistic: vi.fn(),
      });

      const { result } = renderHook(() => useUpcomingExamCardPreference());
      expect(result.current.showRoomUpcomingCard).toBe(true);

      await act(async () => {
        await result.current.toggleShowRoomUpcomingCard();
      });

      expect(result.current.showRoomUpcomingCard).toBe(false);
      expect(mockUpdateUser).toHaveBeenCalledWith({
        data: { show_room_upcoming_card: false },
      });
      expect(localStorage.getItem(getStorageKey("user-abc"))).toBe("false");
    });

    it("toggleShowRoomUpcomingCard toggles back from false to true", async () => {
      vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
        user: {
          id: "user-abc",
          user_metadata: { show_room_upcoming_card: false },
        } as any,
        profile: null,
        loading: false,
        error: null,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        updateProfileOptimistic: vi.fn(),
      });

      const { result } = renderHook(() => useUpcomingExamCardPreference());
      expect(result.current.showRoomUpcomingCard).toBe(false);

      await act(async () => {
        await result.current.toggleShowRoomUpcomingCard();
      });

      expect(result.current.showRoomUpcomingCard).toBe(true);
      expect(mockUpdateUser).toHaveBeenCalledWith({
        data: { show_room_upcoming_card: true },
      });
      expect(localStorage.getItem(getStorageKey("user-abc"))).toBe("true");
    });

    it("syncs state when window broadcast event is dispatched", () => {
      vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
        user: { id: "user-abc", user_metadata: {} } as any,
        profile: null,
        loading: false,
        error: null,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        updateProfileOptimistic: vi.fn(),
      });

      const { result } = renderHook(() => useUpcomingExamCardPreference());
      expect(result.current.showRoomUpcomingCard).toBe(true);

      act(() => {
        window.dispatchEvent(
          new CustomEvent(UPCOMING_EXAM_CARD_PREF_EVENT, { detail: false })
        );
      });

      expect(result.current.showRoomUpcomingCard).toBe(false);
    });
  });
});
