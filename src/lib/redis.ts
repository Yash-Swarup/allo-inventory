// src/lib/redis.ts
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Acquire a distributed lock. Returns true if acquired, false if not.
export async function acquireLock(key: string, ttlMs = 5000): Promise<boolean> {
  const lockKey = `lock:${key}`;
  // SET key value NX PX ttl — only sets if key does not exist
  const result = await redis.set(lockKey, "1", { nx: true, px: ttlMs });
  return result === "OK";
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(`lock:${key}`);
}
