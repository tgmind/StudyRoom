import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Ensure WebSocket transport is available
const WSOps = typeof WebSocket !== "undefined" ? WebSocket : (globalThis as any).WebSocket;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mshudehtxhsmnojirjls.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zaHVkZWh0eGhzbW5vamlyamxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMzcyMzAsImV4cCI6MjEwMzgxMzIzMH0.xVrnKkpVXAlUfEns54W136DvDukl6cNFohsRjtewBp8";

describe("INDEPENDENT REPRODUCIBLE REALTIME LATENCY & EVENT INTEGRITY SUITE", () => {
  let clientA: any;
  let clientB: any;
  let channelA: any;
  let channelB: any;
  const testChannelName = `room:latency_eval:${Date.now()}`;

  beforeAll(async () => {
    clientA = createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { transport: WSOps },
    });
    clientB = createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { transport: WSOps },
    });

    channelA = clientA.channel(testChannelName);
    channelB = clientB.channel(testChannelName);

    await new Promise<void>((resolve) => {
      let aReady = false;
      let bReady = false;
      let settled = false;

      const finish = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          resolve();
        }
      };

      const timeoutId = setTimeout(finish, 15000);

      channelA.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          aReady = true;
          if (bReady) finish();
        }
      });

      channelB.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          bReady = true;
          if (aReady) finish();
        }
      });
    });
  }, 20000);

  afterAll(async () => {
    try {
      if (channelA) await channelA.unsubscribe();
      if (channelB) await channelB.unsubscribe();
      if (clientA?.removeAllChannels) clientA.removeAllChannels();
      if (clientB?.removeAllChannels) clientB.removeAllChannels();
      if (clientA?.realtime) clientA.realtime.disconnect();
      if (clientB?.realtime) clientB.realtime.disconnect();
    } catch {
      // Ignore teardown errors
    }
  });

  it("measures expanded 50-transition distribution across Client A and Client B", async () => {
    const receivedByB: { seq: number; sent_at: number; received_at: number; latency: number }[] = [];
    const receivedByA: { seq: number; sent_at: number; received_at: number; latency: number }[] = [];

    channelB.on("broadcast", { event: "latency_probe" }, (msg: any) => {
      const now = Date.now();
      const latency = now - msg.payload.sent_at;
      receivedByB.push({
        seq: msg.payload.seq,
        sent_at: msg.payload.sent_at,
        received_at: now,
        latency,
      });
    });

    channelA.on("broadcast", { event: "latency_probe_reverse" }, (msg: any) => {
      const now = Date.now();
      const latency = now - msg.payload.sent_at;
      receivedByA.push({
        seq: msg.payload.seq,
        sent_at: msg.payload.sent_at,
        received_at: now,
        latency,
      });
    });

    // 1. Client A transmits 30 forward transitions (alternating study/break/resume/stop)
    const forwardCount = 30;
    for (let i = 1; i <= forwardCount; i++) {
      await channelA.send({
        type: "broadcast",
        event: "latency_probe",
        payload: {
          seq: i,
          status: i % 3 === 0 ? "break" : (i % 2 === 0 ? "studying" : "offline"),
          sent_at: Date.now(),
        },
      });
      // 50ms inter-message pace
      await new Promise((r) => setTimeout(r, 50));
    }

    // 2. Client B transmits 20 reverse transitions
    const reverseCount = 20;
    for (let i = 1; i <= reverseCount; i++) {
      await channelB.send({
        type: "broadcast",
        event: "latency_probe_reverse",
        payload: {
          seq: i,
          status: i % 2 === 0 ? "studying" : "break",
          sent_at: Date.now(),
        },
      });
      await new Promise((r) => setTimeout(r, 50));
    }

    // Wait for all messages to arrive over WebSocket
    const startWait = Date.now();
    while ((receivedByB.length < forwardCount || receivedByA.length < reverseCount) && Date.now() - startWait < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const allLatencies = [...receivedByB.map((x) => x.latency), ...receivedByA.map((x) => x.latency)]
      .filter((l) => typeof l === "number" && l >= 0)
      .sort((a, b) => a - b);

    const n = allLatencies.length;
    expect(n).toBeGreaterThanOrEqual(40); // At least 80% received even under adverse network

    const min = allLatencies[0];
    const max = allLatencies[n - 1];
    const median = allLatencies[Math.floor(n * 0.5)];
    const p90 = allLatencies[Math.floor(n * 0.9)];
    const p95 = allLatencies[Math.floor(n * 0.95)];
    const p99 = allLatencies[Math.floor(n * 0.99)];
    const avg = Math.round(allLatencies.reduce((a, b) => a + b, 0) / n);

    // Sequence / Duplicate verification
    const bSeqSet = new Set(receivedByB.map((x) => x.seq));
    const duplicatesB = receivedByB.length - bSeqSet.size;

    let outOfOrderB = 0;
    for (let i = 1; i < receivedByB.length; i++) {
      if (receivedByB[i].seq < receivedByB[i - 1].seq) {
        outOfOrderB++;
      }
    }

    console.log(`[GATE 1 INDEPENDENT LATENCY RESULTS]`);
    console.log(`  - Total Planned Transitions: ${forwardCount + reverseCount}`);
    console.log(`  - Total Received Transitions: ${n}`);
    console.log(`  - Client B Received (Forward): ${receivedByB.length}/${forwardCount}`);
    console.log(`  - Client A Received (Reverse): ${receivedByA.length}/${reverseCount}`);
    console.log(`  - Minimum Latency: ${min} ms`);
    console.log(`  - Median Latency (p50): ${median} ms`);
    console.log(`  - Average Latency: ${avg} ms`);
    console.log(`  - p90 Latency: ${p90} ms`);
    console.log(`  - p95 Latency: ${p95} ms`);
    console.log(`  - p99 Latency: ${p99} ms`);
    console.log(`  - Maximum Latency: ${max} ms`);
    console.log(`  - Duplicates Detected: ${duplicatesB}`);
    console.log(`  - Out-of-Order Deliveries: ${outOfOrderB}`);
    console.log(`  - Failure Rate: ${(((forwardCount + reverseCount - n) / (forwardCount + reverseCount)) * 100).toFixed(1)}%`);

    expect(median).toBeGreaterThan(0); // Never 0 ms
    expect(median).toBeLessThan(500); // Sub-second delivery
    expect(duplicatesB).toBe(0);
  }, 25000);

  it("tests rapid concurrent update bursts between Client A and Client B", async () => {
    const burstReceived: number[] = [];
    channelB.on("broadcast", { event: "burst_event" }, (msg: any) => {
      burstReceived.push(msg.payload.id);
    });

    const burstSize = 10;
    const sendPromises = [];
    const t0 = Date.now();
    for (let i = 1; i <= burstSize; i++) {
      sendPromises.push(
        channelA.send({
          type: "broadcast",
          event: "burst_event",
          payload: { id: i, t: t0 },
        })
      );
    }
    await Promise.all(sendPromises);

    // Wait for burst resolution
    const waitStart = Date.now();
    while (burstReceived.length < burstSize && Date.now() - waitStart < 3000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    console.log(`[GATE 1 BURST TEST RESULTS]`);
    console.log(`  - Burst Sent: ${burstSize}`);
    console.log(`  - Burst Received by Client B: ${burstReceived.length}/${burstSize}`);
    expect(burstReceived.length).toBeGreaterThanOrEqual(8);
  }, 10000);
});
