import fs from "fs";
import path from "path";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/env";
import { branding } from "@/config/branding";
import { executeWorkflowExecution } from "@/modules/workflows/engine";
import { prisma } from "@/lib/prisma";

/**
 * Phase 1 worker process: proves the independent-worker architecture
 * (docs/ARCHITECTURE.md §1/§7) actually runs, connected to the same Redis
 * instance as the app. No domain jobs exist yet — those arrive module by
 * module per docs/MASTER_ROADMAP.md (e.g. webhook delivery, AI agent execution,
 * scheduled renewal reminders).
 */
// BullMQ requires maxRetriesPerRequest: null on the connection it owns.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const systemWorker = new Worker(
  "system",
  async (job) => {
    if (job.name === "workflow.execute") {
      const executionId = typeof job.data?.executionId === "string" ? job.data.executionId : null;
      if (!executionId) throw new Error("workflow.execute missing executionId");
      await executeWorkflowExecution(executionId);
      return;
    }

    console.log(`[worker] processed job ${job.id} (${job.name})`);
  },
  { connection }
);

// Dockerfile's HEALTHCHECK for this image reads this file's mtime — a
// worker with a wedged event loop stops touching it and is reported
// unhealthy even though the process technically hasn't exited.
const HEARTBEAT_PATH = "/tmp/health/worker-heartbeat";
const HEARTBEAT_INTERVAL_MS = 15000;

function writeHeartbeat() {
  try {
    fs.mkdirSync(path.dirname(HEARTBEAT_PATH), { recursive: true });
    fs.writeFileSync(HEARTBEAT_PATH, String(Date.now()));
  } catch (err) {
    // Non-fatal locally (e.g. no /tmp/health outside the Docker image) —
    // the healthcheck itself only runs inside the container.
    console.error("[worker] failed to write heartbeat", err);
  }
}

let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

systemWorker.on("ready", () => {
  console.log(`[worker] ${branding.productName} worker ready, listening on queue 'system'`);
  writeHeartbeat();
  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
});

systemWorker.on("error", (err) => {
  console.error("[worker] error", err);
});

systemWorker.on("failed", async (job, err) => {
  if (!job || job.name !== "workflow.execute") return;
  const executionId = typeof job.data?.executionId === "string" ? job.data.executionId : null;
  if (!executionId) return;

  const maxAttempts = job.opts.attempts ?? 1;
  const status = job.attemptsMade >= maxAttempts ? "DEAD_LETTER" : "FAILED";
  await prisma.workflowExecution.updateMany({
    where: { id: executionId },
    data: {
      status,
      lastError: err.message,
      nextRetryAt: status === "FAILED" ? new Date(Date.now() + 5000) : null,
      finishedAt: status === "DEAD_LETTER" ? new Date() : null,
    },
  });
});

async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down gracefully`);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  try {
    // Waits for any in-flight job to finish before closing — BullMQ's
    // documented graceful-shutdown behaviour — rather than killing a job
    // mid-execution on every redeploy.
    await systemWorker.close();
  } finally {
    connection.disconnect();
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
