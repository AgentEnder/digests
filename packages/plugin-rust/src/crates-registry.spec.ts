import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCratesRegistryData } from './crates-registry.js';

vi.mock('@digests/github-utils', () => ({
  withCache: vi.fn(
    (_ns: string, _key: string, fn: () => Promise<unknown>) => fn()
  ),
}));

describe('fetchCratesRegistryData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse crate metadata from crates.io response', async () => {
    const mockResponse = {
      crate: {
        max_stable_version: '1.0.210',
        max_version: '1.0.210',
        description: 'A framework for serializing and deserializing Rust data structures',
        repository: 'https://github.com/serde-rs/serde',
        recent_downloads: 25_000_000,
      },
      versions: [
        {
          num: '1.0.210',
          created_at: '2024-09-01T00:00:00Z',
          published_by: { name: 'David Tolnay', login: 'dtolnay' },
        },
        {
          num: '1.0.0',
          created_at: '2017-04-20T00:00:00Z',
          published_by: { name: 'David Tolnay', login: 'dtolnay' },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await fetchCratesRegistryData('serde');

    expect(result).toEqual({
      latestVersion: '1.0.210',
      license: null,
      description: 'A framework for serializing and deserializing Rust data structures',
      repoUrl: 'https://github.com/serde-rs/serde',
      lastMajorDate: '2017-04-20T00:00:00Z',
      lastPatchDate: '2024-09-01T00:00:00Z',
      weeklyDownloads: 25_000_000,
      author: 'David Tolnay',
    });
  });

  it('should return defaults on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const result = await fetchCratesRegistryData('nonexistent-crate');

    expect(result).toEqual({
      latestVersion: 'unknown',
      license: null,
      description: null,
      repoUrl: null,
      lastMajorDate: null,
      lastPatchDate: null,
      weeklyDownloads: null,
      author: null,
    });
  });

  it('should use login when name is not available', async () => {
    const mockResponse = {
      crate: {
        max_stable_version: '0.5.0',
      },
      versions: [
        {
          num: '0.5.0',
          created_at: '2024-01-01T00:00:00Z',
          published_by: { login: 'someuser' },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await fetchCratesRegistryData('some-crate');

    expect(result.author).toBe('someuser');
  });
});
