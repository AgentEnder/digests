# Unified Plugin Interface Refactor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dependency-specific `DependencyDigestPlugin` interface with a generic `DigestPlugin` interface that supports any scan type (dependencies, secrets, IaC, containers). This is a prerequisite for all four parallel workstreams.

**Key design decisions:**
- A plugin is a domain expert — `plugin-js` can return dependency results AND secret findings (e.g., npm tokens in `.npmrc`)
- `scan()` is an `AsyncGenerator` that yields `ProgressEvent`s and returns `ScanResult[]`
- The worker harness iterates the generator, forwarding progress events over IPC
- `ScanResult` is a discriminated union — the result carries its own type via `kind`
- The scanner/CLI is a dumb orchestrator — it doesn't know or care what kind of results plugins produce
- **All plugin methods receive a `PluginContext`** with the resolved config, token, and other shared state — plugins can read config to customize their behavior (e.g., container plugin reads `images` from config)

**Architecture:**

```
Plugin (worker process)              Scanner (main process)
─────────────────────               ────────────────────────
detect(dir, ctx) → ScanTarget[]     CLI resolves config → PluginContext
                                     Calls detect, collects targets
                                     │
async *scan(target, ctx)             Iterates generator via IPC:
  ctx.config.images → [...]          (container reads config for images)
  yield { phase: 'parse' }    ──►     Forward to ProgressDisplay
  yield { phase: 'fetch',             Forward to ProgressDisplay
           current: 1,
           total: 50 }        ──►
  ...
  return ScanResult[]          ──►   Collect into DigestOutput
```

**Tech Stack:** TypeScript (NodeNext ESM), Vitest

---

### Task 1: Define the new types

**Files to modify:**
- `packages/dependency-digest/src/types.ts`

**Replace `DependencyDigestPlugin` with `DigestPlugin`. Keep old types for backwards compat during migration.**

Add the following new types:

```typescript
// ── Scan targets ────────────────────────────────────────────────────────

export interface ScanTarget {
  /** Absolute path to the detected file or directory */
  path: string;
  /** Plugin-defined type identifier (e.g. "package-lock.json", "Dockerfile", ".env") */
  type: string;
}

// ── Progress events ─────────────────────────────────────────────────────

export interface ProgressEvent {
  /** Phase name (e.g. "parse", "fetch", "scan") */
  phase: string;
  /** Current item index (for progress bars) */
  current?: number;
  /** Total items (for progress bars) */
  total?: number;
  /** Human-readable status message */
  message?: string;
}

// ── Scan results (discriminated union) ──────────────────────────────────

export interface DependencyResult {
  kind: 'dependency';
  /** Manifest file this result came from */
  manifest: string;
  /** Ecosystem identifier (e.g. "npm", "PyPI", "Go") */
  ecosystem: string;
  dependencies: DependencyMetrics[];
  /** Dependency graph edges: "name@version" → ["dep@version", ...] */
  edges: Record<string, string[]>;
}

export interface SecretResult {
  kind: 'secret';
  findings: SecretFinding[];
  filesScanned: number;
}

export interface IaCResult {
  kind: 'iac';
  findings: IaCFinding[];
  filesScanned: number;
}

export interface ContainerResult {
  kind: 'container';
  imageRef: string;
  os: { name: string; version: string } | null;
  packages: OSPackage[];
  vulnerabilities: ContainerVulnerability[];
}

export type ScanResult = DependencyResult | SecretResult | IaCResult | ContainerResult;

// ── Secret finding types ────────────────────────────────────────────────

export interface SecretFinding {
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  file: string;
  line: number;
  column: number;
  /** Matched text with secret redacted */
  match: string;
  /** Full line with secret redacted */
  context: string;
}

// ── IaC finding types ───────────────────────────────────────────────────

export interface IaCFinding {
  ruleId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  file: string;
  line: number | null;
  iacType: string;
  resource?: string;
  remediation: string;
  url?: string;
}

// ── Container types ─────────────────────────────────────────────────────

export interface OSPackage {
  name: string;
  version: string;
  packageManager: string;
  arch?: string;
  sourcePackage?: string;
  sourceVersion?: string;
}

export interface ContainerVulnerability {
  id: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  packageName: string;
  installedVersion: string;
  fixedVersion: string | null;
  title: string;
  url: string | null;
}

// ── Plugin context ──────────────────────────────────────────────────────

export interface PluginContext {
  /** Resolved configuration from config file + CLI args */
  config: DigestConfig;
  /** GitHub token (resolved from flag, env, or gh CLI) */
  token?: string;
  /** Whether to skip cache */
  skipCache: boolean;
}

// ── Plugin interface ────────────────────────────────────────────────────

export interface DigestPlugin {
  /** Plugin display name (e.g. "js", "python", "secrets") */
  name: string;

  /** Detect scan targets in the given directory */
  detect(dir: string, context: PluginContext): Promise<ScanTarget[]>;

  /**
   * Scan a target. Yields progress events and returns results.
   * A single plugin can return multiple result kinds (e.g. deps + secrets).
   */
  scan(target: ScanTarget, context: PluginContext): AsyncGenerator<ProgressEvent, ScanResult[]>;
}
```

**Extend `DigestConfig`** to support new plugin config (add to existing interface):

```typescript
export interface DigestConfig {
  // ... existing fields ...
  /** Container images to scan (e.g. ["node:20-slim", "postgres:16"]) */
  images?: string[];
}
```

**Keep the old interfaces temporarily** with `@deprecated` JSDoc tags so existing plugins compile during migration:

```typescript
/** @deprecated Use DigestPlugin instead */
export interface DependencyDigestPlugin { ... }
```

**Update `DigestOutput`:**

```typescript
export interface DigestOutput {
  scannedAt: string;
  /** All scan results from all plugins, grouped by kind */
  results: ScanResult[];
  /** @deprecated Use results.filter(r => r.kind === 'dependency') */
  manifests: ManifestDigest[];
}
```

**Verification:** Types compile. Existing code still works with deprecated interfaces.

---

### Task 2: Update worker message protocol

**Files to modify:**
- `packages/dependency-digest/src/worker-messages.ts`

**Replace the dependency-specific messages with generic ones:**

```typescript
import type { PluginContext, ProgressEvent, ScanResult, ScanTarget } from './types.js';

export type PluginWorkerMessages = {
  init: {
    input: { pluginName: string; skipCache: boolean };
    output: { name: string };
  };
  detect: {
    input: { dir: string; context: PluginContext };
    output: { targets: ScanTarget[] };
  };
  /** Start scanning a target. Returns results. Progress events buffered and returned. */
  scan: {
    input: { target: ScanTarget; context: PluginContext };
    output: { results: ScanResult[]; progress: ProgressEvent[] };
  };
  flushLogs: {
    input: Record<string, never>;
    output: { logs: LogEntry[] };
  };
};
```

**Verification:** Types compile.

---

### Task 3: Update plugin worker to iterate AsyncGenerator

**Files to modify:**
- `packages/dependency-digest/src/plugin-worker.ts`

**The worker's `scan` handler must iterate the plugin's AsyncGenerator**, forwarding `yield`ed progress events to the main process and collecting the final return value:

```typescript
async function handleScan(
  plugin: DigestPlugin,
  target: ScanTarget,
  context: PluginContext,
): Promise<{ results: ScanResult[]; progress: ProgressEvent[] }> {
  const progress: ProgressEvent[] = [];
  const generator = plugin.scan(target, context);

  let iterResult = await generator.next();
  while (!iterResult.done) {
    progress.push(iterResult.value);
    iterResult = await generator.next();
  }

  return { results: iterResult.value, progress };
}
```

**Note on IPC:** The `isolated-workers` library uses structured cloning for messages. Rather than trying to stream progress events across IPC in real-time, we buffer them in the worker and return them with the scan response. The scanner replays them for display. This is simpler and works with the current `isolated-workers` implementation. Can optimize to streaming later if needed.

**Verification:** Worker compiles. Can load a plugin and iterate its generator.

---

### Task 4: Update scanner orchestration

**Files to modify:**
- `packages/dependency-digest/src/scanner.ts`

**Replace the dependency-specific `scanPlugin` with a generic version:**

```typescript
async function scanPlugin(options: {
  plugin: PluginEntry;
  dir: string;
  context: PluginContext;
  display: ProgressDisplay;
}): Promise<ScanResult[]> {
  const { plugin, dir, context, display } = options;
  let name = plugin.displayName;

  const worker = await createWorker<PluginWorkerMessages>({ ... });

  try {
    const initResult = await worker.send('init', {
      pluginName: plugin.packageName,
      skipCache: context.skipCache,
    });
    name = initResult.name;

    // Detect — pass context so plugins can read config
    display.updatePhase(name, 'detect');
    const { targets } = await worker.send('detect', { dir, context });
    display.updatePhase(name, 'detect', { manifestCount: targets.length });

    const allResults: ScanResult[] = [];

    for (const target of targets) {
      display.updatePhase(name, 'scan', { message: target.type });
      const { results, progress } = await worker.send('scan', { target, context });

      // Replay buffered progress events
      for (const event of progress) {
        display.updatePhase(name, event.phase, {
          current: event.current,
          total: event.total,
          message: event.message,
        });
      }

      allResults.push(...results);
    }

    display.updatePhase(name, 'done', {
      summary: `${allResults.length} results`,
    });

    return allResults;
  } catch (err) {
    display.updatePhase(name, 'error', { summary: String(err) });
    return [];
  } finally {
    await worker.close();
  }
}
```

**Update `ScanOptions` and `scan()`:**

```typescript
export interface ScanOptions {
  dir: string;
  plugins: PluginEntry[];
  context: PluginContext;  // Replaces token, skipCache, excludePatterns
  display: ProgressDisplay;
}

export async function scan(options: ScanOptions): Promise<DigestOutput> {
  const { dir, plugins, context, display } = options;

  // Launch all plugins in parallel
  const results = await Promise.all(
    plugins.map(plugin => scanPlugin({ plugin, dir, context, display }))
  );

  const allResults = results.flat();

  // Build backwards-compat manifests from dependency results
  const manifests = allResults
    .filter((r): r is DependencyResult => r.kind === 'dependency')
    .map(r => ({
      file: r.manifest,
      ecosystem: r.ecosystem,
      dependencies: r.dependencies,
      edges: r.edges,
    }));

  return {
    scannedAt: new Date().toISOString(),
    results: allResults,
    manifests, // backwards compat
  };
}
```

**Remove:** `fetchWithConcurrency` from scanner.ts — plugins now own their own concurrency internally.

**Verification:** Existing dependency plugins still work through the new pipeline. `npx nx run-many -t test` passes.

---

### Task 5: Migrate existing plugins to new interface

**Files to modify:**
- `packages/plugin-js/src/index.ts`
- `packages/plugin-rust/src/index.ts`
- `packages/plugin-java/src/index.ts`
- `packages/plugin-dotnet/src/index.ts`

**Each plugin needs to:**

1. Change from `DependencyDigestPlugin` to `DigestPlugin`
2. Rename `detect` to return `ScanTarget[]` instead of `ManifestFile[]` (same shape, just renamed type)
3. Replace `parseDependencies` + `fetchMetrics` with a single `async *scan()` generator

**Example migration for plugin-js:**

```typescript
import type { DigestPlugin, PluginContext, ScanTarget, ProgressEvent, ScanResult, DependencyResult } from 'dependency-digest';
import { detectManifests } from './detect.js';
import { parseManifest } from './parser.js';
import { fetchDependencyMetrics } from './metrics.js';

const plugin: DigestPlugin = {
  name: 'js',

  async detect(dir: string, _context: PluginContext): Promise<ScanTarget[]> {
    const manifests = await detectManifests(dir);
    return manifests.map(m => ({ path: m.path, type: m.type }));
  },

  async *scan(target: ScanTarget, context: PluginContext): AsyncGenerator<ProgressEvent, ScanResult[]> {
    yield { phase: 'parse', message: target.type };
    const { dependencies, edges } = await parseManifest({ path: target.path, type: target.type });

    const metrics = [];
    for (let i = 0; i < dependencies.length; i++) {
      yield { phase: 'fetch', current: i + 1, total: dependencies.length, message: dependencies[i].name };
      const m = await fetchDependencyMetrics(dependencies[i], context.token);
      metrics.push(m);
    }

    const result: DependencyResult = {
      kind: 'dependency',
      manifest: target.path,
      ecosystem: 'npm',
      dependencies: metrics,
      edges,
    };

    return [result];
  },
};

export default plugin;
export { plugin };
```

**Note:** The internal files (`detect.ts`, `parser.ts`, `metrics.ts`) stay unchanged. Only `index.ts` changes to implement the new interface.

**Repeat for all four existing plugins.** Each migration is mechanical — wrap `parseDependencies` + `fetchMetrics` into the generator, yield progress events between fetches.

**Verification:** `npx nx run-many -t build` succeeds. `npx nx run-many -t test` passes. Running `dependency-digest` against a project produces identical output.

---

### Task 6: Update CLI for new interface

**Files to modify:**
- `packages/dependency-digest/src/cli.ts`

**Changes:**

1. Remove the `PluginEntry.ecosystem` field — plugins don't declare a single ecosystem anymore (results carry it)
2. Plugin loading now imports and checks for `DigestPlugin` interface (has `detect` and `scan`)
3. Remove `--scanners` flag concept — all plugins run by default, users select plugins via `--plugins`

```typescript
const KNOWN_PLUGINS = [
  "@digests/plugin-js",
  "@digests/plugin-rust",
  "@digests/plugin-java",
  "@digests/plugin-dotnet",
];

// Plugin loading (unchanged pattern, just check for new interface)
const mod = await import(packageName);
const plugin: DigestPlugin = mod.default ?? mod.plugin ?? mod;
if (typeof plugin.detect !== 'function' || typeof plugin.scan !== 'function') {
  throw new Error(`${packageName} does not export a valid DigestPlugin`);
}
```

**Verification:** CLI works identically to before. `--plugins` flag still works.

---

### Task 7: Update formatters for generic results

**Files to modify:**
- `packages/dependency-digest/src/formatter.ts`
- `packages/dependency-digest/src/format-cyclonedx.ts`
- `packages/dependency-digest/src/format-spdx.ts`
- `packages/dependency-digest/src/format-html.ts`

**Each formatter needs to handle `DigestOutput.results` grouped by kind:**

```typescript
export function formatDigestAsMarkdown(digest: DigestOutput, config: DigestConfig): string {
  const sections: string[] = [];

  // Dependency results (existing logic)
  const depResults = digest.results.filter((r): r is DependencyResult => r.kind === 'dependency');
  if (depResults.length > 0) {
    sections.push(formatDependencySection(depResults, config));
  }

  // Secret results
  const secretResults = digest.results.filter((r): r is SecretResult => r.kind === 'secret');
  if (secretResults.length > 0) {
    sections.push(formatSecretSection(secretResults));
  }

  // IaC results
  const iacResults = digest.results.filter((r): r is IaCResult => r.kind === 'iac');
  if (iacResults.length > 0) {
    sections.push(formatIaCSection(iacResults));
  }

  // Container results
  const containerResults = digest.results.filter((r): r is ContainerResult => r.kind === 'container');
  if (containerResults.length > 0) {
    sections.push(formatContainerSection(containerResults));
  }

  return sections.join('\n\n');
}
```

**For now:** Only implement the dependency section (matches current behavior). Secret/IaC/container formatters are stubs that will be fleshed out by their respective workstreams.

**Verification:** Output is identical to current behavior. `npx nx run-many -t test` passes.

---

### Task 8: Clean up deprecated types

**Files to modify:**
- `packages/dependency-digest/src/types.ts`

**After all plugins are migrated and tests pass:**

1. Remove `DependencyDigestPlugin` interface
2. Remove `ManifestFile` type (replaced by `ScanTarget`)
3. Remove `ParseResult` type (internal to plugins now)
4. Remove `ParsedDependency` type (internal to plugins now)
5. Keep `DependencyMetrics` — it's used in `DependencyResult`
6. Keep `ManifestDigest` — used in backwards-compat `manifests` field
7. Keep `Vulnerability` — used in `DependencyMetrics`

**Update exports** in `packages/dependency-digest/src/index.ts` (or wherever types are re-exported).

**Verification:** `npx nx run-many -t build` and `npx nx run-many -t test` both pass. No references to removed types remain.
