# Transitive Dependencies + Multi-Version Support

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Include transitive dependencies and support multiple versions per package, using boolean `dev`/`transitive` flags instead of string group names.

**Architecture:** Lockfile parsers return `Map<string, ResolvedDependency[]>` with ALL packages (not just direct). The parser cross-references with package.json to set `dev`/`transitive`/`specifier` flags. Core types in `dependency-digest` change from group-based to flag-based. Scanner, formatter, and tests update accordingly.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest, pnpm workspaces, Nx

---

### Task 1: Update core types in dependency-digest

**Files:**
- Modify: `packages/dependency-digest/src/types.ts`

**Step 1: Update `ParsedDependency`**

Replace the current `ParsedDependency` interface:

```typescript
export interface ParsedDependency {
  /** Package name as it appears in the manifest */
  name: string;
  /** Resolved version (e.g. "19.0.0") */
  version: string;
  /** Original version range from manifest (e.g. "^19.0.0"), absent for transitives */
  specifier?: string;
  /** Whether this is a development dependency */
  dev: boolean;
  /** Whether this is a transitive (indirect) dependency */
  transitive: boolean;
  /** Registry URL from lockfile (e.g. tarball URL) */
  registryUrl?: string;
  /** Integrity hash from lockfile */
  integrity?: string;
}
```

**Step 2: Update `DependencyMetrics`**

Replace `currentVersion` with `version`, add flags:

```typescript
export interface DependencyMetrics {
  name: string;
  /** Resolved version */
  version: string;
  /** Original specifier from manifest */
  specifier?: string;
  dev: boolean;
  transitive: boolean;
  ecosystem: string;
  latestVersion: string;
  repoUrl: string | null;
  lastMajorDate: string | null;
  lastPatchDate: string | null;
  lastCommitDate: string | null;
  lastIssueOpened: string | null;
  lastIssueClosed: string | null;
  lastPrOpened: string | null;
  lastPrClosed: string | null;
  openIssueCount: number;
  openPrCount: number;
  downloads: number | null;
  pinnedIssues: string[];
  vulnerabilities: Vulnerability[];
}
```

**Step 3: Update `ManifestDigest`**

Replace `groups` with flat `dependencies`:

```typescript
export interface ManifestDigest {
  file: string;
  ecosystem: string;
  dependencies: DependencyMetrics[];
}
```

**Step 4: Update `DependencyDigestPlugin`**

The `fetchMetrics` signature stays the same — it receives the updated `ParsedDependency` and returns updated `DependencyMetrics`.

**Step 5: Verify build fails (expected — downstream consumers break)**

Run: `npx nx build dependency-digest`
Expected: PASS (types only, no implementation references `currentVersion` in this package... but formatter and scanner do)

**Step 6: Commit**

```bash
git add packages/dependency-digest/src/types.ts
git commit -m "feat(dependency-digest)!: replace group-based deps with boolean dev/transitive flags"
```

---

### Task 2: Update scanner to use flat dependencies

**Files:**
- Modify: `packages/dependency-digest/src/scanner.ts`

**Step 1: Update scanner to use flat dependencies array**

Replace the groups logic with flat collection:

```typescript
import type {
  DependencyDigestPlugin,
  DependencyMetrics,
  DigestOutput,
  ManifestDigest,
  ParsedDependency,
} from './types.js';

interface ScanOptions {
  dir: string;
  plugins: DependencyDigestPlugin[];
  token?: string;
  concurrency?: number;
  excludePatterns?: string[];
}

async function fetchWithConcurrency(
  deps: ParsedDependency[],
  plugin: DependencyDigestPlugin,
  token: string | undefined,
  concurrency: number
): Promise<DependencyMetrics[]> {
  const results: DependencyMetrics[] = [];
  const queue = [...deps];

  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const dep = queue.shift();
        if (!dep) break;
        try {
          const metrics = await plugin.fetchMetrics(dep, token);
          results.push(metrics);
        } catch (err) {
          console.error(
            `Failed to fetch metrics for ${dep.name}@${dep.version}:`,
            err
          );
        }
      }
    }
  );

  await Promise.all(workers);
  return results;
}

function matchesExclude(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('*')) {
      return name.startsWith(pattern.slice(0, -1));
    }
    return name === pattern;
  });
}

export async function scan(options: ScanOptions): Promise<DigestOutput> {
  const {
    dir,
    plugins,
    token,
    concurrency = 5,
    excludePatterns = [],
  } = options;

  const manifests: ManifestDigest[] = [];

  for (const plugin of plugins) {
    const manifestFiles = await plugin.detect(dir);

    for (const manifest of manifestFiles) {
      const allDeps = await plugin.parseDependencies(manifest);

      const filteredDeps = allDeps.filter(
        (d) => !matchesExclude(d.name, excludePatterns)
      );

      const dependencies = await fetchWithConcurrency(
        filteredDeps,
        plugin,
        token,
        concurrency
      );

      manifests.push({
        file: manifest.path,
        ecosystem: plugin.ecosystem,
        dependencies,
      });
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    manifests,
  };
}
```

**Step 2: Build**

Run: `npx nx build dependency-digest`

**Step 3: Commit**

```bash
git add packages/dependency-digest/src/scanner.ts
git commit -m "refactor(dependency-digest): update scanner to use flat dependencies array"
```

---

### Task 3: Update formatter and its tests

**Files:**
- Modify: `packages/dependency-digest/src/formatter.ts`
- Modify: `packages/dependency-digest/src/formatter.spec.ts`

**Step 1: Update `summaryTable` to use `version` instead of `currentVersion`**

In `formatter.ts`, change the row template:

```typescript
function summaryTable(deps: DependencyMetrics[]): string {
  const header =
    '| Package | Version | Latest | Dev | Transitive | Last Major | Last Patch | Last Commit | Downloads/wk | CVEs |';
  const separator =
    '|---------|---------|--------|-----|------------|------------|------------|-------------|--------------|------|';
  const rows = deps.map((d) => {
    const cveCount = d.vulnerabilities.length;
    const cveCell = cveCount > 0 ? `${cveCount} ⚠️` : '0';
    const devCell = d.dev ? '✓' : '';
    const transitiveCell = d.transitive ? '✓' : '';
    return `| ${d.name} | ${d.version} | ${d.latestVersion} | ${devCell} | ${transitiveCell} | ${formatDate(d.lastMajorDate)} | ${formatDate(d.lastPatchDate)} | ${formatDate(d.lastCommitDate)} | ${formatDownloads(d.downloads)} | ${cveCell} |`;
  });
  return [header, separator, ...rows].join('\n');
}
```

**Step 2: Update `formatDigestAsMarkdown` to use flat dependencies**

Replace the groups iteration:

```typescript
export function formatDigestAsMarkdown(digest: DigestOutput): string {
  const sections: string[] = [h1('Dependency Digest')];

  for (const manifest of digest.manifests) {
    sections.push(h2(manifest.file));
    sections.push(summaryTable(manifest.dependencies));

    const details = manifest.dependencies.map(detailSection).filter(Boolean);
    if (details.length > 0) {
      sections.push('', ...details);
    }
  }

  return sections.join('\n\n');
}
```

**Step 3: Update `formatter.spec.ts` test fixtures**

Update `sampleDigest` to use new types:

```typescript
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
          lastIssueClosed: '2025-03-14T00:00:00.000Z',
          lastPrOpened: '2025-03-13T00:00:00.000Z',
          lastPrClosed: '2025-03-12T00:00:00.000Z',
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
```

Update test assertions:
- `parsed.manifests[0].groups.dependencies[0].name` → `parsed.manifests[0].dependencies[0].name`
- Vulnerability test: same structure change

**Step 4: Run tests**

Run: `npx nx test dependency-digest`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/dependency-digest/src/formatter.ts packages/dependency-digest/src/formatter.spec.ts
git commit -m "refactor(dependency-digest): update formatter for flag-based dependencies"
```

---

### Task 4: Update lockfile types and parsers for multi-version + transitives

**Files:**
- Modify: `packages/plugin-js/src/lockfile/types.ts`
- Modify: `packages/plugin-js/src/lockfile/npm-parser.ts`
- Modify: `packages/plugin-js/src/lockfile/npm-parser.spec.ts`
- Modify: `packages/plugin-js/src/lockfile/yarn-parser.ts`
- Modify: `packages/plugin-js/src/lockfile/yarn-parser.spec.ts`
- Modify: `packages/plugin-js/src/lockfile/pnpm-parser.ts`
- Modify: `packages/plugin-js/src/lockfile/pnpm-parser.spec.ts`
- Modify: `packages/plugin-js/src/lockfile/bun-parser.ts`
- Modify: `packages/plugin-js/src/lockfile/bun-parser.spec.ts`
- Modify: `packages/plugin-js/src/lockfile/index.ts`
- Modify: `packages/plugin-js/src/lockfile/index.spec.ts`

**Step 1: Update `ResolvedDependency` in types.ts**

Add `dev` field:

```typescript
export interface ResolvedDependency {
  name: string;
  version: string;
  registryUrl?: string;
  integrity?: string;
  dev: boolean;
}
```

**Step 2: Update all parsers to return `Map<string, ResolvedDependency[]>`**

Each parser's return type changes from `Map<string, ResolvedDependency>` to `Map<string, ResolvedDependency[]>`.

When adding to the map:
```typescript
// Old:
if (!result.has(name)) {
  result.set(name, { name, version, ... });
}

// New:
const existing = result.get(name) ?? [];
// Only add if this exact version isn't already tracked
if (!existing.some(e => e.version === version)) {
  existing.push({ name, version, dev: false, ... });
  result.set(name, existing);
}
```

**Step 3: npm-parser specific changes**

- Remove the `node_modules/x/node_modules/y` skip filter — include ALL entries
- Read `dev: true` from the package entry and set it on `ResolvedDependency.dev`
- For v1: read `dev` field from dependency entries

**Step 4: pnpm-parser specific changes**

- All packages already included — no filter to remove
- Default `dev: false` for all entries (accurate dev-tracing would require graph traversal)

**Step 5: yarn-parser + bun-parser specific changes**

- All entries already included — no filter to remove
- Default `dev: false` for all entries

**Step 6: Update dispatcher (index.ts)**

Change return type to `Map<string, ResolvedDependency[]>`.

**Step 7: Update ALL test files**

- Assertions change from `result.get('name')` to `result.get('name')?.[0]` or check array contents
- Add tests for multi-version scenarios (same package, different versions)
- Add tests verifying transitive deps ARE included
- npm parser: test that `dev: true` flag is read from lockfile

**Step 8: Run tests**

Run: `npx nx test plugin-js`
Expected: All PASS

**Step 9: Commit**

```bash
git add packages/plugin-js/src/lockfile/
git commit -m "feat(plugin-js): support multi-version + transitive deps in lockfile parsers"
```

---

### Task 5: Update parser.ts for transitive deps + boolean flags

**Files:**
- Modify: `packages/plugin-js/src/parser.ts`
- Modify: `packages/plugin-js/src/parser.spec.ts`

**Step 1: Rewrite `parseManifest`**

```typescript
import { readFile } from 'fs/promises';
import { dirname } from 'path';
import type { ManifestFile, ParsedDependency } from 'dependency-digest';
import { parseLockfile } from './lockfile/index.js';

const SKIP_PROTOCOLS = ['workspace:', 'link:', 'file:', 'portal:'];

function shouldSkip(versionRange: string): boolean {
  return SKIP_PROTOCOLS.some((p) => versionRange.startsWith(p));
}

export async function parseManifest(
  manifest: ManifestFile
): Promise<ParsedDependency[]> {
  const content = await readFile(manifest.path, 'utf-8');
  const pkg = JSON.parse(content);
  const dir = dirname(manifest.path);

  const directDeps = new Map<string, { specifier: string; dev: boolean }>();

  for (const [name, specifier] of Object.entries(pkg.dependencies ?? {})) {
    if (typeof specifier === 'string' && !shouldSkip(specifier)) {
      directDeps.set(name, { specifier, dev: false });
    }
  }
  for (const [name, specifier] of Object.entries(pkg.devDependencies ?? {})) {
    if (typeof specifier === 'string' && !shouldSkip(specifier)) {
      directDeps.set(name, { specifier, dev: true });
    }
  }

  const lockfileVersions = await parseLockfile(dir, manifest.type);

  const deps: ParsedDependency[] = [];
  const seen = new Set<string>(); // track "name@version" to avoid dupes

  // Process all lockfile entries
  for (const [name, versions] of lockfileVersions) {
    for (const resolved of versions) {
      const key = `${name}@${resolved.version}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const direct = directDeps.get(name);
      deps.push({
        name,
        version: resolved.version,
        specifier: direct?.specifier,
        dev: direct ? direct.dev : resolved.dev,
        transitive: !direct,
        registryUrl: resolved.registryUrl,
        integrity: resolved.integrity,
      });
    }
  }

  // Add any direct deps not found in lockfile (fallback)
  for (const [name, { specifier, dev }] of directDeps) {
    if (!lockfileVersions.has(name)) {
      if (manifest.type !== 'package.json') {
        console.warn(
          `${name} not found in lockfile, using package.json range: ${specifier}`
        );
      }
      deps.push({
        name,
        version: specifier,
        specifier,
        dev,
        transitive: false,
      });
    }
  }

  return deps;
}
```

**Step 2: Update parser tests**

Update mocks to return `Map<string, ResolvedDependency[]>` and add tests for:
- Transitive deps are included from lockfile
- Direct deps get `transitive: false` and their specifier
- Multi-version packages produce multiple entries
- Dev flag is set correctly for direct vs transitive

**Step 3: Run tests**

Run: `npx nx test plugin-js`

**Step 4: Commit**

```bash
git add packages/plugin-js/src/parser.ts packages/plugin-js/src/parser.spec.ts
git commit -m "feat(plugin-js): emit transitive deps with boolean dev/transitive flags"
```

---

### Task 6: Update metrics.ts and index.ts in plugin-js

**Files:**
- Modify: `packages/plugin-js/src/metrics.ts`
- Modify: `packages/plugin-js/src/index.ts`

**Step 1: Update `fetchDependencyMetrics` in metrics.ts**

```typescript
import type { DependencyMetrics, ParsedDependency } from 'dependency-digest';
import { fetchGitHubMetrics } from '@digests/github-utils';
import { fetchNpmRegistryData } from './npm-registry.js';

export async function fetchDependencyMetrics(
  dep: ParsedDependency,
  token?: string
): Promise<DependencyMetrics> {
  const npmData = await fetchNpmRegistryData(dep.name);
  const ghData = await fetchGitHubMetrics(npmData.repoUrl, dep.name, token);

  return {
    name: dep.name,
    version: dep.version,
    specifier: dep.specifier,
    dev: dep.dev,
    transitive: dep.transitive,
    ecosystem: 'npm',
    latestVersion: npmData.latestVersion,
    repoUrl: npmData.repoUrl,
    lastMajorDate: npmData.lastMajorDate,
    lastPatchDate: npmData.lastPatchDate,
    lastCommitDate: ghData.lastCommitDate,
    lastIssueOpened: ghData.lastIssueOpened,
    lastIssueClosed: ghData.lastIssueClosed,
    lastPrOpened: ghData.lastPrOpened,
    lastPrClosed: ghData.lastPrClosed,
    openIssueCount: ghData.openIssueCount,
    openPrCount: ghData.openPrCount,
    downloads: npmData.weeklyDownloads,
    pinnedIssues: ghData.pinnedIssues,
    vulnerabilities: ghData.vulnerabilities,
  };
}
```

**Step 2: No changes needed to index.ts** (detect, parseDependencies, fetchMetrics signatures unchanged)

**Step 3: Build and test**

Run: `npx nx build plugin-js && npx nx test plugin-js`

**Step 4: Commit**

```bash
git add packages/plugin-js/src/metrics.ts
git commit -m "refactor(plugin-js): pass dev/transitive flags through to DependencyMetrics"
```

---

### Task 7: Full workspace verification

**Step 1: Build all**

Run: `npx nx run-many -t build`

**Step 2: Test all**

Run: `npx nx run-many -t test`

**Step 3: Lint all**

Run: `npx nx run-many -t lint`

**Step 4: Commit any remaining fixes**
