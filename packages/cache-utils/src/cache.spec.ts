import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withCache } from './cache.js';

describe('withCache', () => {
  beforeEach(() => {
    // Use a unique namespace per test to avoid cross-test cache hits
    vi.useFakeTimers();
  });

  it('should call fetchFn and return its result', async () => {
    vi.useRealTimers();
    const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });
    const result = await withCache(
      'test-ns-' + Date.now(),
      'key',
      fetchFn
    );
    expect(result).toEqual({ data: 'test' });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('should respect shouldCache predicate', async () => {
    vi.useRealTimers();
    const ns = 'test-should-cache-' + Date.now();
    const fetchFn = vi.fn().mockResolvedValue(null);

    await withCache(ns, 'key', fetchFn, {
      shouldCache: (result) => result !== null,
    });

    // Second call should still invoke fetchFn since null wasn't cached
    await withCache(ns, 'key', fetchFn, {
      shouldCache: (result) => result !== null,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
