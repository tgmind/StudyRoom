import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const STAGING_URL = process.env.STAGING_SUPABASE_URL || "https://wppnfezoqpcgmowdkofp.supabase.co";
const STAGING_KEY = process.env.STAGING_SUPABASE_KEY || "sb_publishable_Jv7t8irT0s7wTNheRXMUpQ_SrNOB-0n";

const CONCURRENT_USERS_COUNT = 100;
const ROOM_CHANNEL_NAME = `room_capacity_eval_${Date.now()}`;

describe("GATE-4: 100-USER STAGING CAPACITY & REALTIME CONCURRENCY ACCEPTANCE SUITE", () => {
  let masterClient: any;
  let stagingUsers: any[] = [];
  const clients: any[] = [];
  const channels: any[] = [];
  const subscriptionResults: any[] = [];

  beforeAll(async () => {
    masterClient = createClient(STAGING_URL, STAGING_KEY);

    // Fetch up to 100 seeded staging profiles
    const { data: users, error } = await masterClient
      .from("users")
      .select("id, display_name")
      .limit(CONCURRENT_USERS_COUNT);

    if (error || !users || users.length < CONCURRENT_USERS_COUNT) {
      console.warn(`Only found ${users?.length || 0} users on staging. Required: ${CONCURRENT_USERS_COUNT}`);
    }
    stagingUsers = users || [];
  }, 30000);

  afterAll(async () => {
    try {
      await Promise.all(
        channels.map(({ channel, index }) => clients[index]?.client.removeChannel(channel))
      );
    } catch {
      // Clean teardown
    }
  }, 15000);

  it("should have at least 100 seeded student user profiles in public.users on staging", () => {
    expect(stagingUsers.length).toBeGreaterThanOrEqual(100);
  });

  it("should connect and subscribe 100 unmocked WebSocket clients concurrently with >= 98% success", async () => {
    const BATCH_SIZE = 25;
    for (let batch = 0; batch < CONCURRENT_USERS_COUNT / BATCH_SIZE; batch++) {
      const startIdx = batch * BATCH_SIZE;
      const endIdx = startIdx + BATCH_SIZE;
      const wavePromises = [];

      for (let i = startIdx; i < endIdx; i++) {
        const user = stagingUsers[i] || { id: `dummy_${i}`, display_name: `Student ${i}` };
        const client = createClient(STAGING_URL, STAGING_KEY, {
          realtime: {
            params: { eventsPerSecond: 20 },
          },
        });
        clients.push({ client, user, index: i });

        const channel = client.channel(ROOM_CHANNEL_NAME);
        channels.push({ channel, user, index: i });

        const subPromise = new Promise<{ index: number; status: string; durationMs: number }>((resolve) => {
          const t0 = Date.now();
          channel.subscribe((status: string) => {
            if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              resolve({ index: i, status, durationMs: Date.now() - t0 });
            }
          });
        });
        wavePromises.push(subPromise);
      }

      const waveResults = await Promise.all(wavePromises);
      subscriptionResults.push(...waveResults);
    }

    const successfulSubs = subscriptionResults.filter((r) => r.status === "SUBSCRIBED");
    expect(successfulSubs.length).toBeGreaterThanOrEqual(98);
  }, 30000);

  it("should deliver fanout broadcast transitions across 100 concurrent sockets with >= 95% delivery and p95 latency < 500ms", async () => {
    let receivedCount = 0;
    const latencies: number[] = [];
    const senderChannel = channels[0].channel;
    const TEST_MESSAGES = 5;

    for (let i = 0; i < channels.length; i++) {
      channels[i].channel.on("broadcast", { event: "room_pulse" }, (payload: any) => {
        const now = Date.now();
        const sentAt = payload.payload?.timestamp || 0;
        if (sentAt > 0) {
          latencies.push(now - sentAt);
        }
        receivedCount++;
      });
    }

    // Settle listeners
    await new Promise((r) => setTimeout(r, 1000));

    for (let m = 1; m <= TEST_MESSAGES; m++) {
      await senderChannel.send({
        type: "broadcast",
        event: "room_pulse",
        payload: {
          msgId: `vitest_msg_${m}`,
          timestamp: Date.now(),
          status: "studying",
        },
      });
      await new Promise((r) => setTimeout(r, 200));
    }

    // Wait for fanout delivery
    await new Promise((r) => setTimeout(r, 1500));

    const totalExpected = TEST_MESSAGES * channels.length;
    const deliveryRate = receivedCount / totalExpected;
    expect(deliveryRate).toBeGreaterThanOrEqual(0.95);

    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      expect(p95).toBeLessThan(500);
    }
  }, 15000);

  it("should gracefully recover 10 flapping clients when disconnecting and resubscribing", async () => {
    const flappingClients = channels.slice(85, 95);
    const flapPromises = flappingClients.map(async ({ channel, index }) => {
      const userClient = clients[index].client;
      await userClient.removeChannel(channel);
      await new Promise((r) => setTimeout(r, 500));

      return new Promise<{ status: string; durationMs: number }>((resolve) => {
        const t0 = Date.now();
        const freshChannel = userClient.channel(ROOM_CHANNEL_NAME);
        channels[index].channel = freshChannel;
        freshChannel.subscribe((status: string) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            resolve({ status, durationMs: Date.now() - t0 });
          }
        });
      });
    });

    const flapResults = await Promise.all(flapPromises);
    const successfulFlaps = flapResults.filter((r) => r.status === "SUBSCRIBED");
    expect(successfulFlaps.length).toBe(10);
  }, 15000);

  it("should successfully execute concurrent Leaderboard RPCs under 100 live sockets without connection errors", async () => {
    const observerClients = clients.slice(95, 100);
    const rpcPromises = observerClients.map(async ({ client }) => {
      const t0 = Date.now();
      const { data, error } = await client.rpc("rpc_get_leaderboard");
      return { error, rows: data?.length || 0, durationMs: Date.now() - t0 };
    });

    const rpcResults = await Promise.all(rpcPromises);
    for (const res of rpcResults) {
      expect(res.error).toBeNull();
      expect(res.rows).toBeGreaterThanOrEqual(100);
      expect(res.durationMs).toBeLessThan(3000);
    }
  }, 15000);
});
