import { describe, it, expect } from 'vitest';
import { formatDigestAsCycloneDX } from './format-cyclonedx.js';
import type { DigestOutput } from './types.js';

const sampleDigest: DigestOutput = {
  scannedAt: '2026-03-17T00:00:00.000Z',
  manifests: [
    {
      file: 'package.json',
      ecosystem: 'npm',
      edges: {
        'express@4.18.2': ['debug@4.3.4'],
        'debug@4.3.4': [],
      },
      dependencies: [
        {
          name: 'express',
          version: '4.18.2',
          specifier: '^4.18.0',
          dev: false,
          transitive: false,
          ecosystem: 'npm',
          purl: 'pkg:npm/express@4.18.2',
          author: 'TJ Holowaychuk',
          license: 'MIT',
          description: 'Fast web framework',
          latestVersion: '4.18.2',
          repoUrl: 'https://github.com/expressjs/express',
          lastMajorDate: null,
          lastPatchDate: null,
          lastCommitDate: null,
          lastIssueOpened: null,
          lastPrOpened: null,
          openIssueCount: 0,
          openPrCount: 0,
          downloads: 1000000,
          pinnedIssues: [],
          vulnerabilities: [],
        },
        {
          name: 'debug',
          version: '4.3.4',
          dev: false,
          transitive: true,
          ecosystem: 'npm',
          purl: 'pkg:npm/debug@4.3.4',
          author: null,
          license: 'MIT',
          description: 'Debug utility',
          latestVersion: '4.3.4',
          repoUrl: null,
          lastMajorDate: null,
          lastPatchDate: null,
          lastCommitDate: null,
          lastIssueOpened: null,
          lastPrOpened: null,
          openIssueCount: 0,
          openPrCount: 0,
          downloads: null,
          pinnedIssues: [],
          vulnerabilities: [],
          integrity: 'sha512-abc123',
          includedBy: [['express@4.18.2']],
        },
      ],
    },
  ],
};

describe('formatDigestAsCycloneDX', () => {
  it('should produce valid CycloneDX 1.5 structure', () => {
    const output = JSON.parse(formatDigestAsCycloneDX(sampleDigest));
    expect(output.bomFormat).toBe('CycloneDX');
    expect(output.specVersion).toBe('1.5');
    expect(output.serialNumber).toMatch(/^urn:uuid:/);
    expect(output.metadata.timestamp).toBe('2026-03-17T00:00:00.000Z');
  });

  it('should include components with purl and license', () => {
    const output = JSON.parse(formatDigestAsCycloneDX(sampleDigest));
    const express = output.components.find((c: Record<string, unknown>) => c.name === 'express');
    expect(express.purl).toBe('pkg:npm/express@4.18.2');
    expect(express.licenses[0].license.id).toBe('MIT');
    expect(express.scope).toBe('required');
    expect(express.author).toBe('TJ Holowaychuk');
  });

  it('should mark dev deps as optional scope', () => {
    const devDigest = structuredClone(sampleDigest);
    devDigest.manifests[0].dependencies[0].dev = true;
    const output = JSON.parse(formatDigestAsCycloneDX(devDigest));
    expect(output.components[0].scope).toBe('optional');
  });

  it('should include dependency graph', () => {
    const output = JSON.parse(formatDigestAsCycloneDX(sampleDigest));
    const expressDep = output.dependencies.find(
      (d: Record<string, unknown>) => d.ref === 'pkg:npm/express@4.18.2',
    );
    expect(expressDep.dependsOn).toContain('pkg:npm/debug@4.3.4');
  });

  it('should parse integrity into hash', () => {
    const output = JSON.parse(formatDigestAsCycloneDX(sampleDigest));
    const debug = output.components.find((c: Record<string, unknown>) => c.name === 'debug');
    expect(debug.hashes).toEqual([{ alg: 'SHA-512', content: 'abc123' }]);
  });
});
