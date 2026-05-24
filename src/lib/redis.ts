// src/lib/redis.ts
// Upstash Redis client for distributed locking and idempotency caching.
// Upstash is HTTP-based — safe to use in Next.js serverless functions.

import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ── Distributed lock helpers ──────────────────────────────────────────────────

const LOCK_TTL_MS = 5_000; // 5 seconds — long enough for the DB transaction

/**
 * Acquires a distributed lock for a given key using Redis SET NX.
 * Returns the lock token (used to release) or null if lock is already held.
 */
export async function acquireLock(key: string): Promise<string | null> {
  const token = `lock:${Date.now()}:${Math.random()}`;
  // SET key token NX PX ttl — atomic acquire
  const result = await redis.set(`lock:${key}`, token, {
    nx: true,
    px: LOCK_TTL_MS,
  });
  return result === "OK" ? token : null;
}

/**
 * Releases the lock only if the token matches (prevents releasing another
 * holder's lock in a race).  Uses a Lua script for atomic check-and-delete.
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(luaScript, [`lock:${key}`], [token]);
}
