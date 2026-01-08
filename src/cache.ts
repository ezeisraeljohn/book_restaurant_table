import Redis from "ioredis";

// Lazy Redis with in-memory fallback for tests/dev
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
let useMemory = false;
type MemoryEntry = { value: any; expiresAt: number };
const memory = new Map<string, MemoryEntry>();

redis.on("error", () => {
  useMemory = true;
});
redis.on("connect", () => {
  useMemory = false;
});

function memoryGet<T>(key: string): T | undefined {
  const e = memory.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    memory.delete(key);
    return undefined;
  }
  return e.value as T;
}

export async function getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  if (useMemory) {
    const hit = memoryGet<T>(key);
    if (hit !== undefined) return hit;
    const val = await loader();
    memory.set(key, { value: val, expiresAt: Date.now() + ttlSeconds * 1000 });
    return val;
  }
  const cached = await redis.get(key);
  if (cached !== null) return JSON.parse(cached) as T;
  const value = await loader();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}

export async function invalidatePrefix(prefix: string) {
  if (useMemory) {
    for (const k of Array.from(memory.keys())) {
      if (k.startsWith(prefix)) memory.delete(k);
    }
    return;
  }
  const stream = redis.scanStream({ match: `${prefix}*`, count: 100 });
  const keys: string[] = [];
  for await (const resultKeys of stream) {
    keys.push(...(resultKeys as string[]));
    if (keys.length >= 100) {
      await redis.del(...keys.splice(0, keys.length));
    }
  }
  if (keys.length > 0) await redis.del(...keys);
}

export async function clearAll() {
  if (useMemory) {
    memory.clear();
  } else {
    await redis.flushall();
  }
}
