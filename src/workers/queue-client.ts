import { JobsOptions, Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/env";

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const systemQueue = new Queue("system", { connection });

export async function enqueueSystemJob(name: string, data: Record<string, unknown>, opts?: JobsOptions) {
  return systemQueue.add(name, data, opts);
}
