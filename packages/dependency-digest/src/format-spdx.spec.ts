import { describe, it, expect } from 'vitest';
import { formatDigestAsSpdx } from './format-spdx.js';
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
        } as DigestOutput['manifests'][0]['dependencies'][0] & {
          integrity: string;
        },
      ],
    },
  ],
};

describe('formatDigestAsSpdx', () => {
  it('should produce valid SPDX 2.3 structure', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    expect(output.spdxVersion).toBe('SPDX-2.3');
    expect(output.dataLicense).toBe('CC0-1.0');
    expect(output.SPDXID).toBe('SPDXRef-DOCUMENT');
    expect(output.documentNamespace).toMatch(
      /^https:\/\/spdx\.org\/spdxdocs\//
    );
    expect(output.creationInfo.created).toBe('2026-03-17T00:00:00.000Z');
    expect(output.creationInfo.creators).toContain(
      'Tool: dependency-digest-0.1.0'
    );
  });

  it('should include packages with purl external ref', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    const express = output.packages.find(
      (p: Record<string, unknown>) => p.name === 'express'
    );
    expect(express.versionInfo).toBe('4.18.2');
    expect(express.licenseConcluded).toBe('MIT');
    expect(express.licenseDeclared).toBe('MIT');
    expect(express.supplier).toBe('Person: TJ Holowaychuk');
    expect(express.externalRefs).toContainEqual({
      referenceCategory: 'PACKAGE-MANAGER',
      referenceType: 'purl',
      referenceLocator: 'pkg:npm/express@4.18.2',
    });
  });

  it('should use NOASSERTION for missing fields', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    const debug = output.packages.find(
      (p: Record<string, unknown>) => p.name === 'debug'
    );
    expect(debug.supplier).toBe('NOASSERTION');
    expect(debug.downloadLocation).toBe('NOASSERTION');
  });

  it('should include DEPENDS_ON relationships from edges', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    const depRel = output.relationships.find(
      (r: Record<string, unknown>) =>
        r.spdxElementId === 'SPDXRef-Package-express-4.18.2' &&
        r.relationshipType === 'DEPENDS_ON'
    );
    expect(depRel).toBeDefined();
    expect(depRel.relatedSpdxElement).toBe('SPDXRef-Package-debug-4.3.4');
  });

  it('should include DESCRIBES relationships from document', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    const describes = output.relationships.filter(
      (r: Record<string, unknown>) => r.relationshipType === 'DESCRIBES'
    );
    expect(describes).toHaveLength(2);
    expect(describes[0].spdxElementId).toBe('SPDXRef-DOCUMENT');
    expect(describes.map((d: Record<string, string>) => d.relatedSpdxElement)).toContain(
      'SPDXRef-Package-express-4.18.2'
    );
    expect(describes.map((d: Record<string, string>) => d.relatedSpdxElement)).toContain(
      'SPDXRef-Package-debug-4.3.4'
    );
  });

  it('should parse integrity into checksum', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    const debug = output.packages.find(
      (p: Record<string, unknown>) => p.name === 'debug'
    );
    expect(debug.checksums).toEqual([
      { algorithm: 'SHA512', checksumValue: '69b735db' },
    ]);
  });

  it('should not include checksums when integrity is absent', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    const express = output.packages.find(
      (p: Record<string, unknown>) => p.name === 'express'
    );
    expect(express.checksums).toBeUndefined();
  });
});
