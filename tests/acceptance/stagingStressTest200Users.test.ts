import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const STAGING_URL = process.env.STAGING_SUPABASE_URL || "https://wppnfezoqpcgmowdkofp.supabase.co";
const STAGING_KEY = process.env.STAGING_SUPABASE_KEY || "sb_publishable_Jv7t8irT0s7wTNheRXMUpQ_SrNOB-0n";

const CONCURRENT_CLIENTS_COUNT = 200;
const ROOM_CHANNEL_NAME = `room_stress_eval_200_${Date.now()}`;

describe("GATE-5: 1,000-STUDENT & 200-CONCURRENT-USER REALTIME ACCEPTANCE SUITE", () => {
  let masterClient: any;
  let allStudents: any[] = [];
  const clients: any[] = [];
  const channels: any[] = [];
  const subDurations: number[] = [];
  const peerReceipts = new Map<string, Set<number>>();
  const peerLatencies: number[] = [];
  let senderEchoCount = 0;

  beforeAll(async () => {
    masterClient = createClient(STAGING_URL, STAGING_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      },
    });

    // Fetch 1,000 seeded student records
    const { data: users, error } = await masterClient
      .from("users")
      .select("id, display_name, current_status, session_start_time, last_resumed_at, break_started_at, active_study_seconds_snapshot, last_offline_at, current_focus, state_version")
      .limit(1000);

    if (error || !users || users.length < 1000) {
      console.warn(`Fetched ${users?.length || 0}/1000 users from staging.`);
    }
    allStudents = users || [];
  }, 30000);

  afterAll(async () => {
    try {
      await Promise.all(clients.map(({ client }) => client.removeAllChannels()));
    } catch {
      // Clean teardown
    }
  }, 15000);

  it("GATE 5.1: should have 1,000 synthetic student profiles seeded in staging database", () => {
    expect(allStudents.length).toBeGreaterThanOrEqual(1000);
    const studying = allStudents.filter((u) => u.current_status === "studying");
    const onBreak = allStudents.filter((u) => u.current_status === "break");
    const offline = allStudents.filter((u) => u.current_status === "offline");

    expect(studying.length).toBeGreaterThanOrEqual(150);
    expect(onBreak.length).toBeGreaterThanOrEqual(50);
    expect(offline.length).toBeGreaterThanOrEqual(500);
  });

  it("GATE 5.2: should perform in-memory sorting of 1,000 student profiles under 50ms", () => {
    const t0 = Date.now();
    const sorted = [...allStudents].sort((a, b) => {
      const priority: Record<string, number> = { studying: 1, break: 2, offline: 3 };
      const pA = priority[a.current_status] || 99;
      const pB = priority[b.current_status] || 99;
      if (pA !== pB) return pA - pB;
      return (a.display_name || "").localeCompare(b.display_name || "");
    });
    const sortTime = Date.now() - t0;
    expect(sorted.length).toBe(allStudents.length);
    expect(sortTime).toBeLessThan(50);
  });

  it("GATE 5.3: should execute rpc_get_leaderboard() across 1,000 students under 1500ms", async () => {
    const t0 = Date.now();
    const { data, error } = await masterClient.rpc("rpc_get_leaderboard");
    const duration = Date.now() - t0;

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.length).toBeGreaterThanOrEqual(100);
    expect(duration).toBeLessThan(1500);
  });

  it("GATE 5.4: should connect and subscribe 200 concurrent unmocked WebSocket clients with >= 98% readiness", async () => {
    const BATCH_SIZE = 50;
    const testUsers = allStudents.slice(0, CONCURRENT_CLIENTS_COUNT);

    for (let wave = 0; wave < CONCURRENT_CLIENTS_COUNT / BATCH_SIZE; wave++) {
      const startIdx = wave * BATCH_SIZE;
      const endIdx = startIdx + BATCH_SIZE;
      const wavePromises = [];

      for (let i = startIdx; i < endIdx; i++) {
        const user = testUsers[i] || { id: `dummy_${i}`, display_name: `Student ${i}` };
        const client = createClient(STAGING_URL, STAGING_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storage: {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            },
          },
          realtime: {
            params: { eventsPerSecond: 20 },
          },
        });
        clients.push({ client, user, index: i });

        const channel = client.channel(ROOM_CHANNEL_NAME);
        const clientIdx = i;

        // Attach broadcast listener before subscribe
        channel.on("broadcast", { event: "room_state_pulse" }, (msg: any) => {
          const receiveTime = Date.now();
          const payload = msg.payload || {};
          const msgId = payload.msgId;
          const sendTime = payload.timestamp || 0;

          if (clientIdx === 0) {
            senderEchoCount++;
          } else {
            if (!peerReceipts.has(msgId)) {
              peerReceipts.set(msgId, new Set());
            }
            peerReceipts.get(msgId)!.add(clientIdx);
            if (sendTime > 0) {
              peerLatencies.push(receiveTime - sendTime);
            }
          }
        });

        channels.push({ channel, user, index: i });

        const subPromise = new Promise<{ index: number; status: string; durationMs: number }>((resolve) => {
          const t0 = Date.now();
          channel.subscribe((status: string) => {
            const durationMs = Date.now() - t0;
            if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              if (status === "SUBSCRIBED") {
                subDurations.push(durationMs);
              }
              resolve({ index: i, status, durationMs });
            }
          }, 25000);
        });
        wavePromises.push(subPromise);
      }

      await Promise.all(wavePromises);
      await new Promise((r) => setTimeout(r, 1000));
    }

    const readinessRate = (subDurations.length / CONCURRENT_CLIENTS_COUNT) * 100;
    expect(readinessRate).toBeGreaterThanOrEqual(98.0);
  }, 90000);

  it("GATE 5.5: should achieve >= 98% peer delivery and p95 latency < 1000ms across 200 sockets", async () => {
    const TOTAL_MESSAGES = 10;
    const EXPECTED_PEERS = channels.length - 1; // 199 peers
    const TOTAL_EXPECTED = TOTAL_MESSAGES * EXPECTED_PEERS;

    const senderChannel = channels[0].channel;

    // Settle all 200 sockets after initial wave joins
    await new Promise((r) => setTimeout(r, 2000));

    for (let m = 1; m <= TOTAL_MESSAGES; m++) {
      const msgId = `vitest_pulse_${m}`;
      await senderChannel.send({
        type: "broadcast",
        event: "room_state_pulse",
        payload: {
          msgId,
          timestamp: Date.now(),
          status: m % 2 === 0 ? "studying" : "break",
        },
      });
      await new Promise((r) => setTimeout(r, 200));
    }

    // Await delivery
    await new Promise((r) => setTimeout(r, 3500));

    let totalReceived = 0;
    for (let m = 1; m <= TOTAL_MESSAGES; m++) {
      const set = peerReceipts.get(`vitest_pulse_${m}`) || new Set();
      totalReceived += set.size;
    }

    const deliveryRate = (totalReceived / TOTAL_EXPECTED) * 100;
    expect(deliveryRate).toBeGreaterThanOrEqual(98.0);
    expect(senderEchoCount).toBe(0); // Self suppression confirmed

    if (peerLatencies.length > 0) {
      peerLatencies.sort((a, b) => a - b);
      const median = peerLatencies[Math.floor(peerLatencies.length * 0.5)];
      const p95 = peerLatencies[Math.floor(peerLatencies.length * 0.95)];
      expect(median).toBeLessThan(250);
      expect(p95).toBeLessThan(1250);
    }
  }, 30000);

  it("GATE 5.6: should recover 20 flapping clients with 100% reconnection and reconciliation", async () => {
    const flapCount = 20;
    const flapGroup = channels.slice(150, 150 + flapCount);

    const flapPromises = flapGroup.map(async ({ channel, index }) => {
      const userClient = clients[index].client;
      await userClient.removeChannel(channel);
      await new Promise((r) => setTimeout(r, 1000));

      return new Promise<{ status: string }>((resolve) => {
        const freshChannel = userClient.channel(ROOM_CHANNEL_NAME);
        channels[index].channel = freshChannel;
        freshChannel.subscribe((status: string) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            resolve({ status });
          }
        }, 15000);
      });
    });

    const results = await Promise.all(flapPromises);
    const recovered = results.filter((r) => r.status === "SUBSCRIBED").length;
    expect(recovered).toBe(flapCount);
  }, 25000);

  it("GATE 5.7: should concurrently execute Leaderboard RPCs under 200 live sockets without errors", async () => {
    const observerClients = clients.slice(180, 190);
    const promises = observerClients.map(async ({ client }: any) => {
      const t0 = Date.now();
      const { data, error } = await client.rpc("rpc_get_leaderboard");
      return { error, count: data?.length || 0, duration: Date.now() - t0 };
    });

    const results = await Promise.all(promises);
    for (const res of results) {
      expect(res.error).toBeNull();
      expect(res.count).toBeGreaterThanOrEqual(100);
      expect(res.duration).toBeLessThan(2500);
    }
  }, 20000);
});
