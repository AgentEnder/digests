import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMavenCentralData } from './maven-central.js';

vi.mock('@digests/github-utils', () => ({
  withCache: vi.fn(
    (_ns: string, _key: string, fn: () => Promise<unknown>) => fn()
  ),
}));

describe('fetchMavenCentralData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse Maven Central search response and POM data', async () => {
    const searchResponse = {
      response: {
        numFound: 1,
        docs: [
          {
            id: 'com.google.guava:guava:31.1-jre',
            g: 'com.google.guava',
            a: 'guava',
            v: '31.1-jre',
            p: 'jar',
            timestamp: 1650000000000,
          },
        ],
      },
    };

    const gavResponse = {
      response: {
        numFound: 3,
        docs: [
          {
            g: 'com.google.guava',
            a: 'guava',
            v: '31.1-jre',
            timestamp: 1650000000000,
          },
          {
            g: 'com.google.guava',
            a: 'guava',
            v: '31.0.0',
            timestamp: 1640000000000,
          },
          {
            g: 'com.google.guava',
            a: 'guava',
            v: '30.0.0',
            timestamp: 1600000000000,
          },
        ],
      },
    };

    const pomXml = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <description>Guava is a suite of core and expanded libraries</description>
  <licenses>
    <license>
      <name>Apache License, Version 2.0</name>
    </license>
  </licenses>
  <scm>
    <url>https://github.com/google/guava</url>
  </scm>
</project>`;

    let fetchCallCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      fetchCallCount++;
      const urlStr = url.toString();

      if (urlStr.includes('solrsearch') && !urlStr.includes('core=gav')) {
        return { ok: true, json: () => Promise.resolve(searchResponse) } as Response;
      }
      if (urlStr.includes('core=gav')) {
        return { ok: true, json: () => Promise.resolve(gavResponse) } as Response;
      }
      if (urlStr.includes('repo1.maven.org')) {
        return { ok: true, text: () => Promise.resolve(pomXml) } as Response;
      }

      return { ok: false } as Response;
    });

    const result = await fetchMavenCentralData('com.google.guava:guava');

    expect(result.latestVersion).toBe('31.1-jre');
    expect(result.license).toBe('Apache License, Version 2.0');
    expect(result.description).toBe(
      'Guava is a suite of core and expanded libraries'
    );
    expect(result.repoUrl).toBe('https://github.com/google/guava');
    expect(result.lastMajorDate).toBeDefined();
    expect(result.lastPatchDate).toBeDefined();
    expect(fetchCallCount).toBe(3);
  });

  it('should return defaults on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const result = await fetchMavenCentralData('nonexistent:package');

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

  it('should return defaults when no results found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          response: { numFound: 0, docs: [] },
        }),
    } as Response);

    const result = await fetchMavenCentralData('nonexistent:package');

    expect(result.latestVersion).toBe('unknown');
  });

  it('should return defaults for invalid package name format', async () => {
    const result = await fetchMavenCentralData('invalid-name');

    expect(result.latestVersion).toBe('unknown');
  });

  it('should handle POM fetch failure gracefully', async () => {
    const searchResponse = {
      response: {
        numFound: 1,
        docs: [
          {
            id: 'org.example:lib:1.0',
            g: 'org.example',
            a: 'lib',
            v: '1.0',
            p: 'jar',
            timestamp: 1650000000000,
          },
        ],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('repo1.maven.org')) {
        return { ok: false, status: 404 } as Response;
      }
      return {
        ok: true,
        json: () => Promise.resolve(searchResponse),
      } as Response;
    });

    const result = await fetchMavenCentralData('org.example:lib');

    expect(result.latestVersion).toBe('1.0');
    expect(result.license).toBeNull();
    expect(result.repoUrl).toBeNull();
  });
});
