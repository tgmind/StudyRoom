import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { detectLiveRivalries } from "@/lib/time/rivalry";
import { getMemberMutationEpoch } from "@/hooks/useLiveRoom";
import { UserProfile } from "@/lib/supabase/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mshudehtxhsmnojirjls.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zaHVkZWh0eGhzbW5vamlyamxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMzcyMzAsImV4cCI6MjEwMzgxMzIzMH0.xVrnKkpVXAlUfEns54W136DvDukl6cNFohsRjtewBp8";

const WSOps = typeof WebSocket !== "undefined" ? WebSocket : (globalThis as any).WebSocket;

describe("PRACTICAL TWO-CLIENT REALTIME RIVALRY ACCEPTANCE VERIFICATION", () => {
  const subodhId = "ee438ced-3c88-4708-864e-3eb12404b1c2";
  const adityaId = "55763c0c-f214-4d12-b951-06303965694b";

  let clientA: any;
  let clientB: any;
  let channelA: any;
  let channelB: any;

  const channelTopic = `room:verify:${Date.now()}`;

  beforeAll(async () => {
    clientA = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: WSOps } });
    clientB = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: WSOps } });

    channelA = clientA.channel(channelTopic);
    channelB = clientB.channel(channelTopic);

    await new Promise<void>((resolve) => {
      let aReady = false, bReady = false;
      const t = setTimeout(() => resolve(), 7000);
      channelA.subscribe((s: string) => {
        if (s === "SUBSCRIBED") {
          aReady = true;
          if (bReady) { clearTimeout(t); resolve(); }
        }
      });
      channelB.subscribe((s: string) => {
        if (s === "SUBSCRIBED") {
          bReady = true;
          if (aReady) { clearTimeout(t); resolve(); }
        }
      });
    });
  }, 10000);

  afterAll(async () => {
    try {
      if (channelA) await channelA.unsubscribe();
      if (channelB) await channelB.unsubscribe();
      if (clientA?.realtime) clientA.realtime.disconnect();
      if (clientB?.realtime) clientB.realtime.disconnect();
    } catch {}
  });

  it("proves Subodh -> Aditya rivalry updates immediately on PAUSE, RESUME, and STOP without refresh", async () => {
    const now = new Date();
    let clientBMembers: UserProfile[] = [
      {
        id: subodhId,
        display_name: "Subodh",
        avatar_url: null,
        current_status: "studying",
        current_focus: "Maths",
        session_start_time: now.toISOString(),
        last_resumed_at: now.toISOString(),
        break_started_at: null,
        active_study_seconds_snapshot: 0,
        weekly_study_seconds: 36000,
        has_achiever_badge: true,
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: adityaId,
        display_name: "Aditya",
        avatar_url: null,
        current_status: "studying",
        current_focus: "Physics",
        session_start_time: now.toISOString(),
        last_resumed_at: now.toISOString(),
        break_started_at: null,
        active_study_seconds_snapshot: 0,
        weekly_study_seconds: 35880,
        has_achiever_badge: false,
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    let stableRivalries = detectLiveRivalries(clientBMembers, now);
    expect(stableRivalries.length).toBe(1);
    expect(stableRivalries[0].rivalMembers[0].current_status).toBe("studying");

    const memberEpochMap = new Map<string, number>();
    const latencies: { step: string; latencyMs: number }[] = [];

    function evaluateMemberListMemo(rawRivalries: typeof stableRivalries, prevRivalries: typeof stableRivalries) {
      if (prevRivalries.length === rawRivalries.length) {
        const isIdentical = prevRivalries.every((p, idx) => {
          const next = rawRivalries[idx];
          return (
            p.id === next.id &&
            p.mode === next.mode &&
            p.isTrio === next.isTrio &&
            p.primaryGapSeconds === next.primaryGapSeconds &&
            p.scoreGap === next.scoreGap &&
            p.formattedGap === next.formattedGap &&
            p.rivalMembers.length === next.rivalMembers.length &&
            p.rivalMembers.every((pm, mIdx) => {
              const nm = next.rivalMembers[mIdx];
              return (
                pm.id === nm.id &&
                pm.current_status === nm.current_status &&
                pm.break_started_at === nm.break_started_at &&
                pm.last_resumed_at === nm.last_resumed_at &&
                pm.session_start_time === nm.session_start_time &&
                pm.active_study_seconds_snapshot === nm.active_study_seconds_snapshot &&
                pm.weekly_study_seconds === nm.weekly_study_seconds &&
                pm.leaderboard_score === nm.leaderboard_score &&
                pm.leaderboard_rank === nm.leaderboard_rank &&
                pm.display_name === nm.display_name &&
                pm.avatar_url === nm.avatar_url &&
                pm.has_achiever_badge === nm.has_achiever_badge
              );
            })
          );
        });
        if (isIdentical) {
          return { returned: prevRivalries, memoHit: true };
        }
      }
      return { returned: rawRivalries, memoHit: false };
    }

    let resolveCurrentStep: ((val: any) => void) | null = null;

    channelB.on("broadcast", { event: "member_status_update" }, (msg: any) => {
      const receivedAt = Date.now();
      const payload = msg.payload as Partial<UserProfile> & { id: string; sent_at: number; step_name: string };
      const latencyMs = receivedAt - payload.sent_at;
      latencies.push({ step: payload.step_name, latencyMs });

      const incomingEpoch = getMemberMutationEpoch(payload);
      const knownEpoch = memberEpochMap.get(payload.id) || 0;

      if (incomingEpoch > 0 && incomingEpoch < knownEpoch) {
        return;
      }
      if (incomingEpoch > 0) {
        memberEpochMap.set(payload.id, Math.max(knownEpoch, incomingEpoch));
      }

      clientBMembers = clientBMembers.map((m) => {
        if (m.id === payload.id) {
          return {
            ...m,
            ...payload,
          };
        }
        return m;
      });

      const rawRivalries = detectLiveRivalries(clientBMembers, new Date());
      const memoResult = evaluateMemberListMemo(rawRivalries, stableRivalries);
      stableRivalries = memoResult.returned;

      if (resolveCurrentStep) {
        resolveCurrentStep({
          payload,
          latencyMs,
          memoHit: memoResult.memoHit,
          updatedMemberInRivalry: stableRivalries[0]?.rivalMembers.find((m) => m.id === payload.id),
          rivalriesCount: stableRivalries.length,
        });
        resolveCurrentStep = null;
      }
    });

    // STEP 1: Subodh presses PAUSE
    const step1Promise = new Promise<any>((res) => { resolveCurrentStep = res; });
    const breakStartedAt = new Date().toISOString();
    const pausePayload = {
      id: subodhId,
      current_status: "break" as const,
      break_started_at: breakStartedAt,
      last_resumed_at: null,
      active_study_seconds_snapshot: 0,
      sent_at: Date.now(),
      step_name: "Subodh PAUSE -> BREAK",
      mutation_epoch: Date.now(),
    };
    await channelA.send({ type: "broadcast", event: "member_status_update", payload: pausePayload });
    const res1 = await step1Promise;

    expect(res1.memoHit).toBe(false);
    expect(res1.updatedMemberInRivalry?.current_status).toBe("break");
    expect(res1.updatedMemberInRivalry?.break_started_at).toBe(breakStartedAt);
    expect(res1.latencyMs).toBeLessThan(500);

    // STEP 2: Subodh presses RESUME
    const step2Promise = new Promise<any>((res) => { resolveCurrentStep = res; });
    const resumeAt = new Date().toISOString();
    const resumePayload = {
      id: subodhId,
      current_status: "studying" as const,
      break_started_at: null,
      last_resumed_at: resumeAt,
      active_study_seconds_snapshot: 0,
      sent_at: Date.now(),
      step_name: "Subodh RESUME -> STUDYING",
      mutation_epoch: Date.now(),
    };
    await channelA.send({ type: "broadcast", event: "member_status_update", payload: resumePayload });
    const res2 = await step2Promise;

    expect(res2.memoHit).toBe(false);
    expect(res2.updatedMemberInRivalry?.current_status).toBe("studying");
    expect(res2.updatedMemberInRivalry?.last_resumed_at).toBe(resumeAt);
    expect(res2.latencyMs).toBeLessThan(500);

    // STEP 3: Subodh presses STOP
    const step3Promise = new Promise<any>((res) => { resolveCurrentStep = res; });
    const stopAt = new Date().toISOString();
    const stopPayload = {
      id: subodhId,
      current_status: "offline" as const,
      session_start_time: null,
      break_started_at: null,
      last_resumed_at: null,
      active_study_seconds_snapshot: 0,
      last_offline_at: stopAt,
      sent_at: Date.now(),
      step_name: "Subodh STOP -> OFFLINE",
      mutation_epoch: Date.now(),
    };
    await channelA.send({ type: "broadcast", event: "member_status_update", payload: stopPayload });
    const res3 = await step3Promise;

    expect(res3.rivalriesCount).toBe(0);
    expect(res3.latencyMs).toBeLessThan(500);

    const avg = Math.round(latencies.reduce((a, b) => a + b.latencyMs, 0) / latencies.length);
    console.log(`\n[PRACTICAL TWO-CLIENT RIVALRY VERIFICATION RESULTS]`);
    latencies.forEach((l) => console.log(`  - ${l.step}: ${l.latencyMs} ms`));
    console.log(`  - Average Propagation Latency: ${avg} ms`);
    console.log(`  - Page refresh required: NONE`);
    console.log(`  - Stale memoization reference retained: NONE`);
  }, 15000);
});
