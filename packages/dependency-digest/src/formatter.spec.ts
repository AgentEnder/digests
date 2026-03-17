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
          license: 'MIT',
          description: 'A JavaScript library for building user interfaces',
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
  it('should include the dependency name, license, and specifier in output', () => {
    const md = formatDigestAsMarkdown(sampleDigest);
    expect(md).toContain('react');
    expect(md).toContain('19.2.4');
    expect(md).toContain('package.json');
    expect(md).toContain('MIT');
    expect(md).toContain('^19.0.0');
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

  it('should render includedBy chains in details', () => {
    const digestWithChains: DigestOutput = {
      ...sampleDigest,
      manifests: [
        {
          ...sampleDigest.manifests[0],
          dependencies: [
            {
              ...sampleDigest.manifests[0].dependencies[0],
              name: 'debug',
              transitive: true,
              includedBy: [
                ['express@4.18.2'],
                ['morgan@1.10.0'],
              ],
            },
          ],
        },
      ],
    };
    const md = formatDigestAsMarkdown(digestWithChains);
    expect(md).toContain('Included by');
    expect(md).toContain('express@4.18.2');
    expect(md).toContain('morgan@1.10.0');
  });

  it('should flag disallowed licenses when config has allowedLicenses', () => {
    const md = formatDigestAsMarkdown(sampleDigest, {
      allowedLicenses: ['Apache-2.0'],
    });
    // MIT is not in allowed list, should be flagged
    expect(md).toContain('⚠️ MIT');
    expect(md).toContain('License Policy Violations');
  });

  it('should not flag licenses when no allowedLicenses configured', () => {
    const md = formatDigestAsMarkdown(sampleDigest);
    expect(md).not.toContain('⚠️ MIT');
    expect(md).not.toContain('License Policy Violations');
  });
});
