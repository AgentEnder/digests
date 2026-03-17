import { describe, it, expect } from 'vitest';
import { formatDigestAsJson, formatDigestAsMarkdown } from './formatter.js';
import type { DigestOutput } from './types.js';

const sampleDigest: DigestOutput = {
  scannedAt: '2026-03-16T00:00:00.000Z',
  manifests: [
    {
      file: 'package.json',
      ecosystem: 'npm',
      dependencies: [
        {
          name: 'react',
          ecosystem: 'npm',
          version: '19.0.0',
          specifier: '^19.0.0',
          dev: false,
          transitive: false,
          latestVersion: '19.2.4',
          repoUrl: 'https://github.com/facebook/react',
          lastMajorDate: '2024-11-15T00:00:00.000Z',
          lastPatchDate: '2025-01-20T00:00:00.000Z',
          lastCommitDate: '2025-03-14T00:00:00.000Z',
          lastIssueOpened: '2025-03-15T00:00:00.000Z',
          lastPrOpened: '2025-03-13T00:00:00.000Z',
          openIssueCount: 42,
          openPrCount: 8,
          downloads: 24100000,
          pinnedIssues: [],
          vulnerabilities: [],
        },
      ],
    },
  ],
};

describe('formatDigestAsJson', () => {
  it('should return valid JSON string matching the digest structure', () => {
    const json = formatDigestAsJson(sampleDigest);
    const parsed = JSON.parse(json);
    expect(parsed.scannedAt).toBe('2026-03-16T00:00:00.000Z');
    expect(parsed.manifests).toHaveLength(1);
    expect(parsed.manifests[0].dependencies[0].name).toBe('react');
  });
});

describe('formatDigestAsMarkdown', () => {
  it('should include the dependency name in the summary table', () => {
    const md = formatDigestAsMarkdown(sampleDigest);
    expect(md).toContain('react');
    expect(md).toContain('19.2.4');
    expect(md).toContain('package.json');
  });

  it('should include vulnerability warnings when present', () => {
    const digestWithCve: DigestOutput = {
      ...sampleDigest,
      manifests: [
        {
          ...sampleDigest.manifests[0],
          dependencies: [
            {
              ...sampleDigest.manifests[0].dependencies[0],
              vulnerabilities: [
                {
                  id: 'CVE-2024-0001',
                  severity: 'high',
                  title: 'XSS vulnerability',
                  url: 'https://example.com/advisory',
                  vulnerableRange: '<19.1.0',
                  patchedVersion: '19.1.0',
                },
              ],
            },
          ],
        },
      ],
    };
    const md = formatDigestAsMarkdown(digestWithCve);
    expect(md).toContain('CVE-2024-0001');
    expect(md).toContain('XSS vulnerability');
  });
});
