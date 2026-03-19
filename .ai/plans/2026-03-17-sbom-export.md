# SBOM Export (CycloneDX + SPDX) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add purl, author to the data model, pipe dependency edges through to DigestOutput, and implement CycloneDX 1.5 and SPDX 2.3 JSON serializers.

**Architecture:** Add `purl` and `author` to `DependencyMetrics` (generated in plugin-js metrics.ts). Change `parseDependencies` to return `{ dependencies, edges }` so the scanner can store edges on `ManifestDigest`. Add two new formatters in dependency-digest that produce standard SBOM JSON.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest, CycloneDX 1.5 JSON, SPDX 2.3 JSON

---

### Task 1: Add purl + author to data model and npm registry

**Files:**
- Modify: `packages/dependency-digest/src/types.ts`
- Modify: `packages/plugin-js/src/npm-registry.ts`
- Modify: `packages/plugin-js/src/metrics.ts`

**Step 1: Add fields to `DependencyMetrics`**

In `types.ts`, add to `DependencyMetrics`:

```typescript
  /** Package URL (purl) — e.g. "pkg:npm/%40babel/core@7.29.0" */
  purl: string;
  /** Package author from registry */
  author: string | null;
```

**Step 2: Add `author` to `NpmRegistryData` and extraction**

In `npm-registry.ts`, add `author: string | null` to `NpmRegistryData` interface.

Add `author?: string | { name?: string; email?: string }` to `NpmPackageMetadata`.

In `fetchNpmRegistryDataUncached`, extract author:

```typescript
const author = typeof data.author === 'string'
  ? data.author
  : data.author?.name
    ? (data.author.email ? `${data.author.name} <${data.author.email}>` : data.author.name)
    : null;
```

Add `author` to both return objects (ok and error paths — `null` for error).

**Step 3: Add purl helper and pass through in metrics.ts**

In `metrics.ts`, add:

```typescript
function buildPurl(ecosystem: string, name: string, version: string): string {
  if (ecosystem === 'npm') {
    const encoded = name.startsWith('@')
      ? name.replace('@', '%40').replace('/', '%2F')
      : name;
    return `pkg:npm/${encoded}@${version}`;
  }
  return `pkg:${ecosystem}/${name}@${version}`;
}
```

Add to the return object:

```typescript
purl: buildPurl('npm', dep.name, dep.version),
author: npmData.author,
```

**Step 4: Update formatter test fixture**

In `formatter.spec.ts`, add `purl: 'pkg:npm/react@19.0.0'` and `author: 'Meta'` to `sampleDigest`.

**Step 5: Build and test**

Run: `npx nx run-many -t build` and run vitest in each package.

**Step 6: Commit**

```bash
git commit -m "feat: add purl and author to dependency metrics"
```

---

### Task 2: Pipe dependency edges through to DigestOutput

**Files:**
- Modify: `packages/dependency-digest/src/types.ts`
- Modify: `packages/dependency-digest/src/scanner.ts`
- Modify: `packages/plugin-js/src/parser.ts`
- Modify: `packages/plugin-js/src/index.ts`

**Step 1: Update types**

In `types.ts`, change `ManifestDigest`:

```typescript
export interface ManifestDigest {
  file: string;
  ecosystem: string;
  dependencies: DependencyMetrics[];
  /** Dependency graph edges: "name@version" → ["dep@version", ...] */
  edges: Record<string, string[]>;
}
```

Change `DependencyDigestPlugin.parseDependencies` return type:

```typescript
export interface ParseResult {
  dependencies: ParsedDependency[];
  edges: Record<string, string[]>;
}

export interface DependencyDigestPlugin {
  // ...existing
  parseDependencies(manifest: ManifestFile): Promise<ParseResult>;
  // ...existing
}
```

**Step 2: Update parser.ts to return edges**

Change `parseManifest` return type from `Promise<ParsedDependency[]>` to `Promise<ParseResult>`.

Convert `lockfileResult.edges` (Map) to a plain `Record<string, string[]>`:

```typescript
// At the end of parseManifest, convert edges Map to Record
const edgeRecord: Record<string, string[]> = {};
for (const [key, deps] of lockfileResult.edges) {
  edgeRecord[key] = deps;
}

return { dependencies: deps, edges: edgeRecord };
```

**Step 3: Update plugin index.ts**

No change needed — `parseDependencies: parseManifest` already delegates, the return type just changes.

**Step 4: Update scanner.ts**

In the scan loop, destructure the parse result:

```typescript
const { dependencies: allDeps, edges } = await plugin.parseDependencies(manifest);

// ... filtering stays the same ...

manifests.push({
  file: manifest.path,
  ecosystem: plugin.ecosystem,
  dependencies,
  edges,
});
```

**Step 5: Update formatter.spec.ts**

Add `edges: {}` to the sampleDigest manifest fixture.

**Step 6: Update parser.spec.ts**

All tests that check the return of `parseManifest` need to access `result.dependencies` instead of `result` directly (since the return is now `{ dependencies, edges }`).

**Step 7: Build and test**

Run: `npx nx run-many -t build` and vitest in each package.

**Step 8: Commit**

```bash
git commit -m "feat: pipe dependency graph edges through to DigestOutput"
```

---

### Task 3: Implement CycloneDX 1.5 serializer

**Files:**
- Create: `packages/dependency-digest/src/format-cyclonedx.ts`
- Create: `packages/dependency-digest/src/format-cyclonedx.spec.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { formatDigestAsCycloneDX } from './format-cyclonedx.js';
import type { DigestOutput } from './types.js';

const sampleDigest: DigestOutput = {
  scannedAt: '2026-03-17T00:00:00.000Z',
  manifests: [{
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
        lastMajorDate: null, lastPatchDate: null, lastCommitDate: null,
        lastIssueOpened: null, lastPrOpened: null,
        openIssueCount: 0, openPrCount: 0,
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
        lastMajorDate: null, lastPatchDate: null, lastCommitDate: null,
        lastIssueOpened: null, lastPrOpened: null,
        openIssueCount: 0, openPrCount: 0,
        downloads: null,
        pinnedIssues: [],
        vulnerabilities: [],
        integrity: 'sha512-abc123',
        includedBy: [['express@4.18.2']],
      },
    ],
  }],
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
    const express = output.components.find((c: any) => c.name === 'express');
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
      (d: any) => d.ref === 'pkg:npm/express@4.18.2'
    );
    expect(expressDep.dependsOn).toContain('pkg:npm/debug@4.3.4');
  });

  it('should parse integrity into hash', () => {
    const output = JSON.parse(formatDigestAsCycloneDX(sampleDigest));
    const debug = output.components.find((c: any) => c.name === 'debug');
    expect(debug.hashes).toEqual([{ alg: 'SHA-512', content: 'abc123' }]);
  });
});
```

**Step 2: Implement the serializer**

```typescript
import { randomUUID } from 'crypto';
import type { DependencyMetrics, DigestOutput } from './types.js';

export function formatDigestAsCycloneDX(digest: DigestOutput): string {
  const allDeps = digest.manifests.flatMap((m) => m.dependencies);
  const allEdges: Record<string, string[]> = {};
  for (const m of digest.manifests) {
    Object.assign(allEdges, m.edges);
  }

  // Build purl lookup for edge resolution
  const purlByKey = new Map<string, string>();
  for (const dep of allDeps) {
    purlByKey.set(`${dep.name}@${dep.version}`, dep.purl);
  }

  const bom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    serialNumber: `urn:uuid:${randomUUID()}`,
    metadata: {
      timestamp: digest.scannedAt,
      tools: [
        { vendor: 'digests', name: 'dependency-digest', version: '0.1.0' },
      ],
    },
    components: allDeps.map((dep) => formatComponent(dep)),
    dependencies: formatDependencies(allEdges, purlByKey),
  };

  return JSON.stringify(bom, null, 2);
}

function formatComponent(dep: DependencyMetrics) {
  const component: Record<string, unknown> = {
    type: 'library',
    name: dep.name,
    version: dep.version,
    purl: dep.purl,
    scope: dep.dev ? 'optional' : 'required',
  };

  if (dep.description) component.description = dep.description;
  if (dep.author) component.author = dep.author;

  if (dep.license) {
    component.licenses = [{ license: { id: dep.license } }];
  }

  const hashes = parseIntegrity(dep.integrity);
  if (hashes) component.hashes = [hashes];

  const externalRefs: Array<Record<string, string>> = [];
  if (dep.repoUrl) externalRefs.push({ type: 'vcs', url: dep.repoUrl });
  if (dep.registryUrl) externalRefs.push({ type: 'distribution', url: dep.registryUrl });
  if (externalRefs.length > 0) component.externalReferences = externalRefs;

  return component;
}

function parseIntegrity(integrity?: string): { alg: string; content: string } | null {
  if (!integrity) return null;
  const match = integrity.match(/^(sha\d+)-(.+)$/i);
  if (!match) return null;
  return {
    alg: match[1].toUpperCase().replace('SHA', 'SHA-'),
    content: match[2],
  };
}

function formatDependencies(
  edges: Record<string, string[]>,
  purlByKey: Map<string, string>
): Array<{ ref: string; dependsOn: string[] }> {
  const result: Array<{ ref: string; dependsOn: string[] }> = [];
  for (const [key, deps] of Object.entries(edges)) {
    const ref = purlByKey.get(key);
    if (!ref) continue;
    result.push({
      ref,
      dependsOn: deps
        .map((d) => purlByKey.get(d))
        .filter((p): p is string => p !== undefined),
    });
  }
  return result;
}
```

**Step 3: Run tests, commit**

---

### Task 4: Implement SPDX 2.3 serializer

**Files:**
- Create: `packages/dependency-digest/src/format-spdx.ts`
- Create: `packages/dependency-digest/src/format-spdx.spec.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { formatDigestAsSpdx } from './format-spdx.js';
import type { DigestOutput } from './types.js';

// Same sampleDigest as CycloneDX tests

describe('formatDigestAsSpdx', () => {
  it('should produce valid SPDX 2.3 structure', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    expect(output.spdxVersion).toBe('SPDX-2.3');
    expect(output.dataLicense).toBe('CC0-1.0');
    expect(output.SPDXID).toBe('SPDXRef-DOCUMENT');
    expect(output.documentNamespace).toMatch(/^https:\/\/spdx\.org\/spdxdocs\//);
  });

  it('should include packages with purl external ref', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    const express = output.packages.find((p: any) => p.name === 'express');
    expect(express.versionInfo).toBe('4.18.2');
    expect(express.licenseConcluded).toBe('MIT');
    expect(express.externalRefs).toContainEqual({
      referenceCategory: 'PACKAGE-MANAGER',
      referenceType: 'purl',
      referenceLocator: 'pkg:npm/express@4.18.2',
    });
  });

  it('should include DEPENDS_ON relationships from edges', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    const depRel = output.relationships.find(
      (r: any) => r.spdxElementId === 'SPDXRef-Package-express-4.18.2' &&
        r.relationshipType === 'DEPENDS_ON'
    );
    expect(depRel.relatedSpdxElement).toBe('SPDXRef-Package-debug-4.3.4');
  });

  it('should include DESCRIBES relationships from document', () => {
    const output = JSON.parse(formatDigestAsSpdx(sampleDigest));
    const describes = output.relationships.filter(
      (r: any) => r.relationshipType === 'DESCRIBES'
    );
    expect(describes.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Implement the serializer**

```typescript
import { randomUUID } from 'crypto';
import type { DependencyMetrics, DigestOutput } from './types.js';

export function formatDigestAsSpdx(digest: DigestOutput): string {
  const allDeps = digest.manifests.flatMap((m) => m.dependencies);
  const allEdges: Record<string, string[]> = {};
  for (const m of digest.manifests) {
    Object.assign(allEdges, m.edges);
  }

  const spdxIdByKey = new Map<string, string>();
  for (const dep of allDeps) {
    spdxIdByKey.set(`${dep.name}@${dep.version}`, toSpdxId(dep.name, dep.version));
  }

  const doc = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `dependency-digest-${digest.manifests[0]?.file ?? 'unknown'}`,
    documentNamespace: `https://spdx.org/spdxdocs/dependency-digest-${randomUUID()}`,
    creationInfo: {
      created: digest.scannedAt,
      creators: ['Tool: dependency-digest-0.1.0'],
      licenseListVersion: '3.25',
    },
    packages: allDeps.map((dep) => formatSpdxPackage(dep)),
    relationships: [
      // DESCRIBES relationships
      ...allDeps.map((dep) => ({
        spdxElementId: 'SPDXRef-DOCUMENT',
        relatedSpdxElement: toSpdxId(dep.name, dep.version),
        relationshipType: 'DESCRIBES',
      })),
      // DEPENDS_ON relationships from edges
      ...formatSpdxRelationships(allEdges, spdxIdByKey),
    ],
  };

  return JSON.stringify(doc, null, 2);
}

function toSpdxId(name: string, version: string): string {
  const safe = `${name}-${version}`.replace(/[^a-zA-Z0-9.-]/g, '-');
  return `SPDXRef-Package-${safe}`;
}

function formatSpdxPackage(dep: DependencyMetrics) {
  const pkg: Record<string, unknown> = {
    SPDXID: toSpdxId(dep.name, dep.version),
    name: dep.name,
    versionInfo: dep.version,
    downloadLocation: dep.registryUrl ?? 'NOASSERTION',
    licenseConcluded: dep.license ?? 'NOASSERTION',
    licenseDeclared: dep.license ?? 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    supplier: dep.author ? `Person: ${dep.author}` : 'NOASSERTION',
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: dep.purl,
      },
    ],
  };

  if (dep.description) pkg.description = dep.description;

  const checksum = parseIntegrityToSpdx(dep.integrity);
  if (checksum) pkg.checksums = [checksum];

  return pkg;
}

function parseIntegrityToSpdx(integrity?: string): { algorithm: string; checksumValue: string } | null {
  if (!integrity) return null;
  const match = integrity.match(/^(sha\d+)-(.+)$/i);
  if (!match) return null;
  return {
    algorithm: match[1].toUpperCase(),
    checksumValue: match[2],
  };
}

function formatSpdxRelationships(
  edges: Record<string, string[]>,
  spdxIdByKey: Map<string, string>
): Array<{ spdxElementId: string; relatedSpdxElement: string; relationshipType: string }> {
  const result: Array<{ spdxElementId: string; relatedSpdxElement: string; relationshipType: string }> = [];
  for (const [key, deps] of Object.entries(edges)) {
    const fromId = spdxIdByKey.get(key);
    if (!fromId) continue;
    for (const dep of deps) {
      const toId = spdxIdByKey.get(dep);
      if (!toId) continue;
      result.push({
        spdxElementId: fromId,
        relatedSpdxElement: toId,
        relationshipType: 'DEPENDS_ON',
      });
    }
  }
  return result;
}
```

**Step 3: Run tests, commit**

---

### Task 5: Wire up CLI and exports

**Files:**
- Modify: `packages/dependency-digest/src/cli.ts`
- Modify: `packages/dependency-digest/src/index.ts`

**Step 1: Update CLI format option and handler**

Change format description to: `'Output format: markdown, json, cyclonedx, or spdx'`

Update the handler output selection:

```typescript
import { formatDigestAsCycloneDX } from './format-cyclonedx.js';
import { formatDigestAsSpdx } from './format-spdx.js';

// In the handler:
let output: string;
switch (args.format) {
  case 'json':
    output = formatDigestAsJson(digest);
    break;
  case 'cyclonedx':
    output = formatDigestAsCycloneDX(digest);
    break;
  case 'spdx':
    output = formatDigestAsSpdx(digest);
    break;
  default:
    output = formatDigestAsMarkdown(digest, config);
    break;
}
```

**Step 2: Update index.ts exports**

```typescript
export { formatDigestAsCycloneDX } from './format-cyclonedx.js';
export { formatDigestAsSpdx } from './format-spdx.js';
```

**Step 3: Build and test all, commit**

---

### Task 6: Full workspace verification

**Step 1:** `npx nx run-many -t build`
**Step 2:** Run vitest in each package
**Step 3:** `npx nx run-many -t lint`
**Step 4:** Commit any fixes
