import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchVulnerabilities } from './client.js';

// Mock the cache to always call through
vi.mock('@digests/cache-utils', () => ({
  withCache: (_ns: string, _key: string, fn: () => Promise<unknown>) => fn(),
}));

const mockFetch = vi.fn();

describe('fetchVulnerabilities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return mapped vulnerabilities from OSV response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        vulns: [
          {
            id: 'GHSA-1234-5678-abcd',
            summary: 'XSS in foo',
            aliases: ['CVE-2024-1234'],
            modified: '2024-01-01T00:00:00Z',
            severity: [{ type: 'CVSS_V3', score: '7.5' }],
            affected: [
              {
                package: { name: 'foo', ecosystem: 'npm' },
                ranges: [
                  {
                    type: 'ECOSYSTEM',
                    events: [
                      { introduced: '0' },
                      { fixed: '2.0.0' },
                    ],
                  },
                ],
              },
            ],
            references: [{ type: 'ADVISORY', url: 'https://example.com' }],
          },
        ],
      }),
    });

    const result = await fetchVulnerabilities('npm', 'foo', '1.0.0');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'CVE-2024-1234',
      severity: 'high',
      title: 'XSS in foo',
      url: 'https://osv.dev/vulnerability/GHSA-1234-5678-abcd',
      vulnerableRange: '<2.0.0',
      patchedVersion: '2.0.0',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.osv.dev/v1/query',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          package: { name: 'foo', ecosystem: 'npm' },
          version: '1.0.0',
        }),
      })
    );
  });

  it('should prefer CVE alias as the vulnerability id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        vulns: [
          {
            id: 'GHSA-xxxx-yyyy-zzzz',
            summary: 'Some issue',
            aliases: ['CVE-2025-9999', 'PYSEC-2025-1'],
            modified: '2025-01-01T00:00:00Z',
            affected: [
              {
                package: { name: 'bar', ecosystem: 'npm' },
                ranges: [
                  {
                    type: 'ECOSYSTEM',
                    events: [{ introduced: '1.0.0' }, { fixed: '1.5.0' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const result = await fetchVulnerabilities('npm', 'bar', '1.2.0');
    expect(result[0].id).toBe('CVE-2025-9999');
  });

  it('should use OSV id when no CVE alias exists', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        vulns: [
          {
            id: 'GHSA-aaaa-bbbb-cccc',
            summary: 'No CVE assigned',
            modified: '2025-01-01T00:00:00Z',
            affected: [
              {
                package: { name: 'baz', ecosystem: 'npm' },
                ranges: [
                  {
                    type: 'ECOSYSTEM',
                    events: [{ introduced: '0' }, { fixed: '3.0.0' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const result = await fetchVulnerabilities('npm', 'baz', '2.0.0');
    expect(result[0].id).toBe('GHSA-aaaa-bbbb-cccc');
  });

  it('should return empty array when no vulns found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await fetchVulnerabilities('npm', 'safe-pkg', '1.0.0');
    expect(result).toEqual([]);
  });

  it('should return empty array on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchVulnerabilities('npm', 'foo', '1.0.0');
    expect(result).toEqual([]);
  });

  it('should return empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await fetchVulnerabilities('npm', 'foo', '1.0.0');
    expect(result).toEqual([]);
  });

  it('should filter out withdrawn vulnerabilities', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        vulns: [
          {
            id: 'GHSA-withdrawn',
            summary: 'Was withdrawn',
            modified: '2025-01-01T00:00:00Z',
            withdrawn: '2025-01-02T00:00:00Z',
            affected: [],
          },
          {
            id: 'GHSA-active',
            summary: 'Still active',
            modified: '2025-01-01T00:00:00Z',
            affected: [
              {
                package: { name: 'foo', ecosystem: 'npm' },
                ranges: [
                  {
                    type: 'ECOSYSTEM',
                    events: [{ introduced: '0' }, { fixed: '5.0.0' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const result = await fetchVulnerabilities('npm', 'foo', '1.0.0');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('GHSA-active');
  });

  it('should map CVSS scores to severity levels', async () => {
    const makeVuln = (score: string) => ({
      id: `GHSA-test-${score}`,
      summary: `Score ${score}`,
      modified: '2025-01-01T00:00:00Z',
      severity: [{ type: 'CVSS_V3' as const, score }],
      affected: [
        {
          package: { name: 'pkg', ecosystem: 'npm' },
          ranges: [
            {
              type: 'ECOSYSTEM' as const,
              events: [{ introduced: '0' }, { fixed: '9.0.0' }],
            },
          ],
        },
      ],
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        vulns: [
          makeVuln('9.8'),
          makeVuln('7.5'),
          makeVuln('4.3'),
          makeVuln('2.1'),
        ],
      }),
    });

    const result = await fetchVulnerabilities('npm', 'pkg', '1.0.0');
    expect(result.map((v) => v.severity)).toEqual([
      'critical',
      'high',
      'moderate',
      'low',
    ]);
  });

  it('should extract vulnerable range with introduced version', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        vulns: [
          {
            id: 'GHSA-range-test',
            summary: 'Range test',
            modified: '2025-01-01T00:00:00Z',
            affected: [
              {
                package: { name: 'pkg', ecosystem: 'npm' },
                ranges: [
                  {
                    type: 'ECOSYSTEM',
                    events: [
                      { introduced: '2.0.0' },
                      { fixed: '2.5.0' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const result = await fetchVulnerabilities('npm', 'pkg', '2.1.0');
    expect(result[0].vulnerableRange).toBe('>=2.0.0 <2.5.0');
    expect(result[0].patchedVersion).toBe('2.5.0');
  });
});
