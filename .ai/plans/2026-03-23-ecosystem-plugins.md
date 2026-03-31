# New Ecosystem Plugins: Python, Go, Ruby, PHP

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** The unified plugin interface refactor (`.ai/plans/2026-03-24-unified-plugin-interface.md`) must be completed first. All plugins below implement `DigestPlugin` with `detect()` → `async *scan()`.

**Goal:** Add four new ecosystem plugins (Python, Go, Ruby, PHP) to reach parity with Trivy's language coverage.

**Architecture:** Each plugin implements `DigestPlugin` — `detect()` returns `ScanTarget[]`, `scan()` is an `AsyncGenerator` that yields `ProgressEvent`s and returns `ScanResult[]`. Each plugin is its own package under `packages/`, discovered via the `KNOWN_PLUGINS` list in the CLI.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest

---

### Task 1: Scaffold plugin-python package

**Files to create:**
- `packages/plugin-python/package.json`
- `packages/plugin-python/tsconfig.json`
- `packages/plugin-python/src/index.ts`

**Step 1: Create `package.json`**

Follow the exact pattern from `@digests/plugin-js`:

```json
{
  "name": "@digests/plugin-python",
  "version": "1.0.0",
  "description": "Python ecosystem plugin for dependency-digest (pip, poetry, uv, pipenv)",
  "author": { "name": "Craigory Coppola", "url": "https://craigory.dev" },
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "publishConfig": { "access": "public" },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {},
  "dependencies": {
    "@digests/github-utils": "workspace:*",
    "@digests/osv": "workspace:*",
    "dependency-digest": "workspace:*",
    "semver": "^7.7.4",
    "smol-toml": "^1.3.1",
    "tslib": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@types/semver": "^7.7.1",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/AgentEnder/digests.git",
    "directory": "packages/plugin-python"
  },
  "bugs": { "url": "https://github.com/AgentEnder/digests/issues" }
}
```

**Step 2: Create `tsconfig.json`**

Copy from any existing plugin (e.g., `packages/plugin-js/tsconfig.json`). Extends root config with `NodeNext` module resolution.

**Step 3: Create `src/index.ts`**

```typescript
import type { DigestPlugin, PluginContext, ScanTarget, ProgressEvent, ScanResult, DependencyResult } from 'dependency-digest';
import { detectManifests } from './detect.js';
import { parseManifest } from './parser.js';
import { fetchDependencyMetrics } from './metrics.js';

const plugin: DigestPlugin = {
  name: 'python',

  async detect(dir: string, _context: PluginContext): Promise<ScanTarget[]> {
    return detectManifests(dir);
  },

  async *scan(target: ScanTarget, context: PluginContext): AsyncGenerator<ProgressEvent, ScanResult[]> {
    yield { phase: 'parse', message: target.type };
    const { dependencies, edges } = await parseManifest(target);

    const metrics = [];
    for (let i = 0; i < dependencies.length; i++) {
      yield { phase: 'fetch', current: i + 1, total: dependencies.length, message: dependencies[i].name };
      metrics.push(await fetchDependencyMetrics(dependencies[i], context.token));
    }

    return [{
      kind: 'dependency',
      manifest: target.path,
      ecosystem: 'PyPI',
      dependencies: metrics,
      edges,
    } satisfies DependencyResult];
  },
};

export default plugin;
export { plugin };
```

**Verification:** `npx nx build plugin-python` compiles without error.

---

### Task 2: Python detection (`detect.ts`)

**Files to create:**
- `packages/plugin-python/src/detect.ts`

**Detect the following manifest files:**

| File | Type | Notes |
|------|------|-------|
| `requirements.txt` | `requirements.txt` | Flat dep list, most common |
| `Pipfile.lock` | `Pipfile.lock` | Pipenv lockfile (JSON) |
| `poetry.lock` | `poetry.lock` | Poetry lockfile (TOML) |
| `uv.lock` | `uv.lock` | uv lockfile (TOML) |
| `pdm.lock` | `pdm.lock` | PDM lockfile (TOML) |

**Detection strategy:**
- Search for `pyproject.toml` or `requirements.txt` in the target directory (non-recursive, matching plugin-rust/java pattern).
- If `pyproject.toml` exists, check for associated lockfiles (`poetry.lock`, `uv.lock`, `pdm.lock`).
- If only `requirements.txt` exists, return that.
- If `Pipfile` exists, check for `Pipfile.lock`.
- Prefer lockfiles over requirements.txt when both exist.

```typescript
import type { ScanTarget } from 'dependency-digest';
import { readdir } from 'fs/promises';

export async function detectManifests(dir: string): Promise<ScanTarget[]> {
  const entries = await readdir(dir);
  const has = (name: string) => entries.includes(name);
  const targets: ScanTarget[] = [];

  if (has('poetry.lock'))   targets.push({ path: `${dir}/poetry.lock`, type: 'poetry.lock' });
  if (has('uv.lock'))       targets.push({ path: `${dir}/uv.lock`, type: 'uv.lock' });
  if (has('pdm.lock'))      targets.push({ path: `${dir}/pdm.lock`, type: 'pdm.lock' });
  if (has('Pipfile.lock'))  targets.push({ path: `${dir}/Pipfile.lock`, type: 'Pipfile.lock' });

  if (targets.length === 0 && has('requirements.txt')) {
    targets.push({ path: `${dir}/requirements.txt`, type: 'requirements.txt' });
  }

  return targets;
}
```

**Verification:** Unit test with mock directories containing various Python manifest combinations.

---

### Task 3: Python parsers

**Files to create:**
- `packages/plugin-python/src/parser.ts`
- `packages/plugin-python/src/parsers/requirements-parser.ts`
- `packages/plugin-python/src/parsers/poetry-parser.ts`
- `packages/plugin-python/src/parsers/pipfile-parser.ts`
- `packages/plugin-python/src/parsers/uv-parser.ts`

**Step 1: Route parser by target type**

`parser.ts` dispatches based on `target.type`:

```typescript
import type { ScanTarget } from 'dependency-digest';

interface ParseResult {
  dependencies: ParsedDep[];
  edges: Record<string, string[]>;
}

export async function parseManifest(target: ScanTarget): Promise<ParseResult> {
  switch (target.type) {
    case 'poetry.lock':      return parsePoetryLock(target);
    case 'uv.lock':          return parseUvLock(target);
    case 'pdm.lock':         return parsePdmLock(target);
    case 'Pipfile.lock':     return parsePipfileLock(target);
    case 'requirements.txt': return parseRequirements(target);
    default: return { dependencies: [], edges: {} };
  }
}
```

**Step 2: requirements.txt parser**

Parse line-by-line:
- `package==1.2.3` → exact version
- `package>=1.2.3` → specifier, no resolved version
- Skip comments (`#`), empty lines, `-r` includes, `--index-url` directives
- Handle extras: `package[extra]==1.2.3` → strip `[extra]` from name
- All deps are `direct: true`, `transitive: false` (no dependency graph)
- No edges (flat file, no graph info)

**Step 3: poetry.lock parser**

Poetry lockfiles are TOML. Use `smol-toml` (lightweight, zero-dependency TOML parser).

Structure: array of `[[package]]` entries with `name`, `version`, `description`, `optional`, `python-versions`, and `[package.dependencies]`.

- Parse all `[[package]]` entries
- Build edges from `[package.dependencies]` sections
- Mark as `dev` if package appears only in `[package.extras]` with `dev` group
- Cross-reference with `pyproject.toml` `[tool.poetry.dependencies]` to mark direct vs transitive

**Step 4: Pipfile.lock parser**

JSON format with `default` and `develop` sections. Each key is a package name, value has `version` (prefixed with `==`).

- `default` section → `dev: false`
- `develop` section → `dev: true`
- All are direct (Pipfile.lock doesn't distinguish transitive)

**Step 5: uv.lock parser**

TOML format similar to poetry.lock. Parse `[[package]]` entries with `name`, `version`, `source`. Build edges from `[package.dependencies]`.

**Verification:** Unit tests for each parser with fixture lockfiles.

---

### Task 4: Python metrics (`metrics.ts`)

**Files to create:**
- `packages/plugin-python/src/metrics.ts`
- `packages/plugin-python/src/pypi-registry.ts`

**Step 1: PyPI registry client**

Endpoint: `https://pypi.org/pypi/{package}/json`

Extract:
- `info.version` → latest version
- `info.license` → license (SPDX when available)
- `info.summary` → description
- `info.author` → author
- `info.project_urls.Source` or `info.project_urls.Repository` → repo URL
- `info.home_page` → fallback repo URL
- Release dates from `releases` object (keys are version strings, values are arrays with `upload_time_iso_8601`)

Weekly downloads: `https://pypistats.org/api/packages/{package}/recent` (returns `last_day`, `last_week`, `last_month`).

**Step 2: Metrics aggregation**

Same pattern as existing plugins:
1. Fetch PyPI registry data (with cache)
2. Fetch GitHub metrics if repo URL points to GitHub
3. Fetch OSV vulnerabilities (ecosystem: `PyPI`)
4. Build purl: `pkg:pypi/{name}@{version}`
5. Assemble `DependencyMetrics`

**Verification:** Unit test with mocked PyPI/GitHub/OSV responses.

---

### Task 5: Scaffold plugin-go package

**Files to create:**
- `packages/plugin-go/package.json`
- `packages/plugin-go/tsconfig.json`
- `packages/plugin-go/src/index.ts`

Same scaffold pattern as Task 1, with:
- `name: "@digests/plugin-go"`
- Plugin `name: 'go'`, ecosystem in results: `'Go'`

**Verification:** `npx nx build plugin-go` compiles.

---

### Task 6: Go detection and parsing

**Files to create:**
- `packages/plugin-go/src/detect.ts`
- `packages/plugin-go/src/parser.ts`

**Detection:**
- Look for `go.mod` in target directory
- Return `ScanTarget` with type `'go.mod'`

**Parsing strategy — use `go list`:**

Run `go list -m -json all` in the project directory. Outputs JSON objects (one per module):
- `Path` → name, `Version` → version (strip `v` prefix)
- `Main: true` → skip (root module)
- `Indirect: true` → transitive

**Edges:** Run `go mod graph` — outputs `module@version module@version` pairs per line.

**Fallback:** If `go` not on PATH, parse `go.mod` directly with regex for `require` blocks (direct deps only).

**Verification:** Unit tests with mock `go list` output.

---

### Task 7: Go metrics

**Files to create:**
- `packages/plugin-go/src/metrics.ts`
- `packages/plugin-go/src/go-proxy-registry.ts`

**Go module proxy:** `https://proxy.golang.org/{module}/@latest` for latest version. Version list from `/@v/list`.

- License: GitHub API (most Go modules are on GitHub — module path often IS the repo URL)
- Downloads: Not available from Go proxy. Set to `null`.
- Release dates: From `/@v/list` endpoint timestamps

**OSV ecosystem:** `Go`
**Purl:** `pkg:golang/{module}@{version}`

**Verification:** Unit tests with mocked responses.

---

### Task 8: Scaffold plugin-ruby package

**Files to create:**
- `packages/plugin-ruby/package.json`
- `packages/plugin-ruby/tsconfig.json`
- `packages/plugin-ruby/src/index.ts`

Same scaffold pattern. Plugin `name: 'ruby'`, ecosystem in results: `'RubyGems'`.

---

### Task 9: Ruby detection, parsing, and metrics

**Files to create:**
- `packages/plugin-ruby/src/detect.ts`
- `packages/plugin-ruby/src/parser.ts`
- `packages/plugin-ruby/src/metrics.ts`
- `packages/plugin-ruby/src/rubygems-registry.ts`

**Detection:** `Gemfile.lock` → `ScanTarget` with type `'Gemfile.lock'`.

**Parsing Gemfile.lock:**
- Parse `DEPENDENCIES` section for direct deps (with specifiers)
- Parse `GEM > specs` section for all resolved deps with versions
- Build edges from indented sub-dependencies under each gem
- Cross-reference to mark `direct` vs `transitive`

**Registry:** `https://rubygems.org/api/v1/gems/{name}.json`
- `version`, `licenses`, `info`, `authors`, `source_code_uri`/`homepage_uri`, `downloads`

**OSV ecosystem:** `RubyGems`
**Purl:** `pkg:gem/{name}@{version}`

---

### Task 10: Scaffold plugin-php package

**Files to create:**
- `packages/plugin-php/package.json`
- `packages/plugin-php/tsconfig.json`
- `packages/plugin-php/src/index.ts`

Plugin `name: 'php'`, ecosystem in results: `'Packagist'`.

---

### Task 11: PHP detection, parsing, and metrics

**Files to create:**
- `packages/plugin-php/src/detect.ts`
- `packages/plugin-php/src/parser.ts`
- `packages/plugin-php/src/metrics.ts`
- `packages/plugin-php/src/packagist-registry.ts`

**Detection:** `composer.lock` → `ScanTarget` with type `'composer.lock'`.

**Parsing composer.lock:**
- JSON with `packages` (prod) and `packages-dev` (dev) arrays
- Build edges from `require` field of each entry
- Cross-reference with `composer.json` `require` for direct vs transitive

**Registry:** `https://repo.packagist.org/p2/{vendor}/{package}.json`
**Downloads:** `https://packagist.org/packages/{vendor}/{package}/stats.json`

**OSV ecosystem:** `Packagist`
**Purl:** `pkg:composer/{vendor}/{package}@{version}`

---

### Task 12: Register all new plugins in CLI

**Files to modify:**
- `packages/dependency-digest/src/cli.ts`

Update the `KNOWN_PLUGINS` array:

```typescript
const KNOWN_PLUGINS = [
  "@digests/plugin-js",
  "@digests/plugin-rust",
  "@digests/plugin-java",
  "@digests/plugin-dotnet",
  "@digests/plugin-python",
  "@digests/plugin-go",
  "@digests/plugin-ruby",
  "@digests/plugin-php",
];
```

**Verification:** `npx nx run-many -t build` succeeds. `npx nx run-many -t test` passes.
