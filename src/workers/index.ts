import { Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/env";
import { branding } from "@/config/branding";

/**
 * Phase 1 worker process: proves the independent-worker architecture
 * (docs/ARCHITECTURE.md §1/§7) actually runs, connected to the same Redis
 * instance as the app. No domain jobs exist yet — those arrive module by
 * module per docs/ROADMAP.md (e.g. webhook delivery, AI agent execution,
 * scheduled renewal reminders).
 */
// BullMQ requires maxRetriesPerRequest: null on the connection it owns.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const systemWorker = new Worker(
  "system",
  async (job) => {
    console.log(`[worker] processed job ${job.id} (${job.name})`);
  },
  { connection }
);

systemWorker.on("ready", () => {
  console.log(`[worker] ${branding.productName} worker ready, listening on queue 'system'`);
});

systemWorker.on("error", (err) => {
  console.error("[worker] error", err);
});

process.on("SIGTERM", async () => {
  await systemWorker.close();
  connection.disconnect();
  process.exit(0);
});
