import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

const CACHE_DIR = join(tmpdir(), 'digests-cache');
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(namespace: string, key: string): string {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return `${namespace}-${hash}.json`;
}

async function ensureCacheDir(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // directory already exists or can't be created
  }
}

export async function getCached<T>(
  namespace: string,
  key: string,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T | null> {
  try {
    const filePath = join(CACHE_DIR, cacheKey(namespace, key));
    const fileStat = await stat(filePath);
    const age = Date.now() - fileStat.mtimeMs;
    if (age > ttlMs) return null;

    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function setCache<T>(
  namespace: string,
  key: string,
  data: T
): Promise<void> {
  try {
    await ensureCacheDir();
    const filePath = join(CACHE_DIR, cacheKey(namespace, key));
    await writeFile(filePath, JSON.stringify(data), 'utf-8');
  } catch {
    // cache write failures are non-fatal
  }
}

export async function withCache<T>(
  namespace: string,
  key: string,
  fetchFn: () => Promise<T>,
  options?: {
    ttlMs?: number;
    shouldCache?: (result: T) => boolean;
  }
): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const cached = await getCached<T>(namespace, key, ttlMs);
  if (cached !== null) return cached;

  const result = await fetchFn();
  if (!options?.shouldCache || options.shouldCache(result)) {
    await setCache(namespace, key, result);
  }
  return result;
}
