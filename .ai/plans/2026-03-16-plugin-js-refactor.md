# plugin-npm → plugin-js Refactor + GitHub Utils Consolidation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate GitHub utilities into `@digests/github-utils`, rewrite `@digests/plugin-npm` as `@digests/plugin-js` with lockfile parsers for npm/yarn/pnpm/bun, and prefer resolved lockfile versions over package.json ranges.

**Architecture:** The plugin detects lockfiles (priority: bun > pnpm > yarn > npm > package.json fallback), parses them into a `Map<packageName, ResolvedDependency>` with resolved versions + registry URLs, then cross-references with package.json to determine dependency groups. GitHub metrics and advisory fetching move to `@digests/github-utils` as shared utilities. The `parseGitHubUrl` function is unified to optionally return PR/issue numbers.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest, pnpm workspaces, Nx, Octokit

---

### Task 1: Extend `parseGitHubUrl` in github-utils to support PR/issue URLs

**Files:**
- Modify: `packages/github-utils/src/types.ts`
- Modify: `packages/github-utils/src/parse-url.ts`
- Modify: `packages/github-utils/src/parse-url.spec.ts`

**Step 1: Write failing tests for PR/issue URL parsing**

Add these tests to `packages/github-utils/src/parse-url.spec.ts`:

```typescript
it('should parse PR number from pull request URLs', () => {
  const result = parseGitHubUrl('https://github.com/owner/repo/pull/123');
  expect(result).toEqual({ owner: 'owner', repo: 'repo', prNumber: 123 });
});

it('should parse issue number as prNumber from issue URLs', () => {
  const result = parseGitHubUrl('https://github.com/owner/repo/issues/456');
  expect(result).toEqual({ owner: 'owner', repo: 'repo', prNumber: 456 });
});

it('should not include prNumber for plain repo URLs', () => {
  const result = parseGitHubUrl('https://github.com/facebook/react');
  expect(result).toEqual({ owner: 'facebook', repo: 'react' });
  expect(result).not.toHaveProperty('prNumber');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test github-utils`
Expected: FAIL — `prNumber` not returned

**Step 3: Update types**

In `packages/github-utils/src/types.ts`, add:

```typescript
export interface GitHubUrlRef extends GitHubRepoRef {
  prNumber?: number;
}
```

**Step 4: Update `parseGitHubUrl` to return `GitHubUrlRef`**

Replace `packages/github-utils/src/parse-url.ts` with:

```typescript
import type { GitHubUrlRef } from './types.js';

export function parseGitHubUrl(url: string): GitHubUrlRef | null {
  const cleaned = url.replace(/^git\+/, '');

  // Try PR/issue URL first (more specific)
  const prPattern = /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/(?:pull|issues)\/(\d+)/;
  const prMatch = cleaned.match(prPattern);
  if (prMatch) {
    return {
      owner: prMatch[1],
      repo: prMatch[2],
      prNumber: parseInt(prMatch[3], 10),
    };
  }

  // Plain repo URL patterns
  const repoPatterns = [
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/,
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/.*$/,
  ];

  for (const pattern of repoPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }

  return null;
}
```

**Step 5: Update index.ts exports**

In `packages/github-utils/src/index.ts`, add `GitHubUrlRef` to the type export:

```typescript
export type { GitHubRepoRef, GitHubUrlRef, GitRepoInfo } from './types.js';
```

**Step 6: Run tests to verify they pass**

Run: `npx nx test github-utils`
Expected: All PASS

**Step 7: Commit**

```bash
git add packages/github-utils/src/
git commit -m "feat(github-utils): extend parseGitHubUrl to support PR/issue URLs"
```

---

### Task 2: Move GitHub metrics + advisories into github-utils

**Files:**
- Create: `packages/github-utils/src/github-metrics.ts`
- Create: `packages/github-utils/src/advisories.ts`
- Modify: `packages/github-utils/src/index.ts`
- Modify: `packages/github-utils/package.json`

**Step 1: Create `packages/github-utils/src/advisories.ts`**

Move `fetchAdvisories` and `mapSeverity` from `packages/plugin-npm/src/github-metrics.ts`:

```typescript
import { Octokit } from '@octokit/rest';
import type { Vulnerability } from 'dependency-digest';

export async function fetchAdvisories(
  octokit: Octokit,
  packageName: string
): Promise<Vulnerability[]> {
  try {
    const response = await octokit.request('GET /advisories', {
      ecosystem: 'npm',
      affects: packageName,
      per_page: 10,
    });

    const advisories = response.data as Array<{
      ghsa_id: string;
      severity: string;
      summary: string;
      html_url: string;
      vulnerabilities: Array<{
        vulnerable_version_range: string;
        first_patched_version: { identifier: string } | null;
      }>;
    }>;

    return advisories.map((a) => ({
      id: a.ghsa_id,
      severity: mapSeverity(a.severity),
      title: a.summary,
      url: a.html_url,
      vulnerableRange:
        a.vulnerabilities[0]?.vulnerable_version_range ?? 'unknown',
      patchedVersion:
        a.vulnerabilities[0]?.first_patched_version?.identifier ?? null,
    }));
  } catch {
    return [];
  }
}

function mapSeverity(
  s: string
): 'critical' | 'high' | 'moderate' | 'low' {
  switch (s.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'moderate':
    case 'medium':
      return 'moderate';
    default:
      return 'low';
  }
}
```

**Step 2: Create `packages/github-utils/src/github-metrics.ts`**

Move `fetchGitHubMetrics` from `packages/plugin-npm/src/github-metrics.ts`:

```typescript
import { Octokit } from '@octokit/rest';
import type { Vulnerability } from 'dependency-digest';
import { parseGitHubUrl } from './parse-url.js';
import { fetchAdvisories } from './advisories.js';

export interface GitHubRepoMetrics {
  lastCommitDate: string | null;
  lastIssueOpened: string | null;
  lastIssueClosed: string | null;
  lastPrOpened: string | null;
  lastPrClosed: string | null;
  openIssueCount: number;
  openPrCount: number;
  pinnedIssues: string[];
  vulnerabilities: Vulnerability[];
}

const EMPTY_METRICS: GitHubRepoMetrics = {
  lastCommitDate: null,
  lastIssueOpened: null,
  lastIssueClosed: null,
  lastPrOpened: null,
  lastPrClosed: null,
  openIssueCount: 0,
  openPrCount: 0,
  pinnedIssues: [],
  vulnerabilities: [],
};
Object.freeze(EMPTY_METRICS);

export async function fetchGitHubMetrics(
  repoUrl: string | null,
  packageName: string,
  token?: string
): Promise<GitHubRepoMetrics> {
  if (!repoUrl) return { ...EMPTY_METRICS, pinnedIssues: [], vulnerabilities: [] };

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) return { ...EMPTY_METRICS, pinnedIssues: [], vulnerabilities: [] };

  const { owner, repo } = parsed;
  const octokit = new Octokit(token ? { auth: token } : undefined);

  try {
    const [
      repoData,
      latestIssuesOpen,
      latestIssuesClosed,
      latestPrsOpen,
      latestPrsClosed,
      advisories,
      openPrSearch,
    ] = await Promise.all([
      octokit.rest.repos.get({ owner, repo }).catch(() => null),
      octokit.rest.issues
        .listForRepo({ owner, repo, state: 'open', sort: 'created', direction: 'desc', per_page: 1 })
        .catch(() => null),
      octokit.rest.issues
        .listForRepo({ owner, repo, state: 'closed', sort: 'updated', direction: 'desc', per_page: 1 })
        .catch(() => null),
      octokit.rest.pulls
        .list({ owner, repo, state: 'open', sort: 'created', direction: 'desc', per_page: 1 })
        .catch(() => null),
      octokit.rest.pulls
        .list({ owner, repo, state: 'closed', sort: 'updated', direction: 'desc', per_page: 1 })
        .catch(() => null),
      fetchAdvisories(octokit, packageName),
      octokit.rest.search
        .issuesAndPullRequests({ q: `repo:${owner}/${repo} type:pr state:open`, per_page: 1 })
        .catch(() => null),
    ]);

    return {
      lastCommitDate: repoData?.data.pushed_at ?? null,
      lastIssueOpened: latestIssuesOpen?.data[0]?.created_at ?? null,
      lastIssueClosed: latestIssuesClosed?.data[0]?.closed_at ?? null,
      lastPrOpened: latestPrsOpen?.data[0]?.created_at ?? null,
      lastPrClosed: latestPrsClosed?.data[0]?.closed_at ?? null,
      openIssueCount: repoData?.data.open_issues_count ?? 0,
      openPrCount: openPrSearch?.data.total_count ?? 0,
      pinnedIssues: [],
      vulnerabilities: advisories,
    };
  } catch {
    return { ...EMPTY_METRICS, pinnedIssues: [], vulnerabilities: [] };
  }
}
```

**Step 3: Update `packages/github-utils/src/index.ts`**

```typescript
export { parseGitHubUrl } from './parse-url.js';
export { getGitHubToken } from './token.js';
export { getGitRepoInfo } from './repo-info.js';
export { fetchGitHubMetrics } from './github-metrics.js';
export { fetchAdvisories } from './advisories.js';
export type { GitHubRepoRef, GitHubUrlRef, GitRepoInfo } from './types.js';
export type { GitHubRepoMetrics } from './github-metrics.js';
```

**Step 4: Add `dependency-digest` as a dependency in `packages/github-utils/package.json`**

Add to `dependencies`:
```json
"dependency-digest": "workspace:*"
```

**Step 5: Add tsconfig reference**

In `packages/github-utils/tsconfig.lib.json`, add to `references`:
```json
{ "path": "../dependency-digest/tsconfig.lib.json" }
```

**Step 6: Build and verify**

Run: `npx nx build github-utils`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add packages/github-utils/
git commit -m "feat(github-utils): move GitHub metrics and advisories from plugin-npm"
```

---

### Task 3: Update pr-digest to use shared `parseGitHubUrl`

**Files:**
- Modify: `packages/pr-digest/src/utils.ts`
- Modify: `packages/pr-digest/src/index.spec.ts`

**Step 1: Update `packages/pr-digest/src/utils.ts`**

Remove the local `parseGitHubUrl` function. Import from `@digests/github-utils` instead. The shared version returns `prNumber` as optional, so `validateOptions` needs to check for its presence:

```typescript
import { Octokit } from '@octokit/rest';
import type { PrDigestInput } from './types.js';

export { getGitHubToken, getGitRepoInfo, parseGitHubUrl } from '@digests/github-utils';
export type { GitRepoInfo } from '@digests/github-utils';

export async function getPRFromBranch(
  owner: string,
  repo: string,
  branch: string,
  token?: string
): Promise<number | undefined> {
  const octokit = new Octokit(token ? { auth: token } : undefined);

  try {
    const { data: pulls } = await octokit.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state: 'open',
      per_page: 1,
    });

    if (pulls.length > 0) {
      return pulls[0].number;
    }
    return undefined;
  } catch (error) {
    console.error(`Failed to find PR for branch ${branch}: ${error}`);
    return undefined;
  }
}

export function validateOptions(options: PrDigestInput): {
  valid: boolean;
  error?: string;
} {
  if (options.url) {
    const { parseGitHubUrl } = await import('@digests/github-utils');
    const parsed = parseGitHubUrl(options.url);
    if (!parsed || !parsed.prNumber) {
      return {
        valid: false,
        error: `Invalid GitHub PR/issue URL: ${options.url}`,
      };
    }
  }

  return { valid: true };
}
```

**Important:** `validateOptions` is sync. Since `parseGitHubUrl` is a sync re-export, just import at the top:

```typescript
import { Octokit } from '@octokit/rest';
import type { PrDigestInput } from './types.js';
import { parseGitHubUrl } from '@digests/github-utils';

export { getGitHubToken, getGitRepoInfo, parseGitHubUrl } from '@digests/github-utils';
export type { GitRepoInfo } from '@digests/github-utils';

export async function getPRFromBranch(
  owner: string,
  repo: string,
  branch: string,
  token?: string
): Promise<number | undefined> {
  const octokit = new Octokit(token ? { auth: token } : undefined);

  try {
    const { data: pulls } = await octokit.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state: 'open',
      per_page: 1,
    });

    if (pulls.length > 0) {
      return pulls[0].number;
    }
    return undefined;
  } catch (error) {
    console.error(`Failed to find PR for branch ${branch}: ${error}`);
    return undefined;
  }
}

export function validateOptions(options: PrDigestInput): {
  valid: boolean;
  error?: string;
} {
  if (options.url) {
    const parsed = parseGitHubUrl(options.url);
    if (!parsed || !parsed.prNumber) {
      return {
        valid: false,
        error: `Invalid GitHub PR/issue URL: ${options.url}`,
      };
    }
  }

  return { valid: true };
}
```

**Step 2: Update test imports**

In `packages/pr-digest/src/index.spec.ts`, the import `from './utils.js'` still works since `parseGitHubUrl` is re-exported. No change needed — just verify.

**Step 3: Check for other usages of `parseGitHubUrl` in pr-digest**

Search `packages/pr-digest/src/` for any direct usage of `parseGitHubUrl` that expects `prNumber` to always be present. Update callers to handle the optional `prNumber` field (e.g., with `!parsed.prNumber` guards).

Key files to check:
- `packages/pr-digest/src/cli.ts` — likely calls `parseGitHubUrl(url)` and accesses `.prNumber`
- `packages/pr-digest/src/digest.ts` — may use it

**Step 4: Run tests**

Run: `npx nx test pr-digest`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/pr-digest/src/
git commit -m "refactor(pr-digest): use shared parseGitHubUrl from github-utils"
```

---

### Task 4: Create plugin-js package scaffold

**Files:**
- Create: `packages/plugin-js/package.json`
- Create: `packages/plugin-js/tsconfig.json`
- Create: `packages/plugin-js/tsconfig.lib.json`
- Create: `packages/plugin-js/tsconfig.spec.json`
- Create: `packages/plugin-js/vitest.config.ts`
- Create: `packages/plugin-js/src/index.ts` (minimal)

**Step 1: Create `packages/plugin-js/package.json`**

```json
{
  "name": "@digests/plugin-js",
  "version": "0.1.0",
  "description": "JavaScript/TypeScript ecosystem plugin for dependency-digest (npm, yarn, pnpm, bun)",
  "author": {
    "name": "Craigory Coppola",
    "url": "https://craigory.dev"
  },
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "publishConfig": {
    "access": "public"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.lib.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "dependency-digest": "workspace:*",
    "@digests/github-utils": "workspace:*",
    "tslib": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/AgentEnder/digests.git",
    "directory": "packages/plugin-js"
  }
}
```

**Step 2: Create `packages/plugin-js/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./tsconfig.lib.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

**Step 3: Create `packages/plugin-js/tsconfig.lib.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "tsBuildInfoFile": "../../dist/plugin-js.lib.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"],
  "references": [
    { "path": "../github-utils/tsconfig.lib.json" },
    { "path": "../dependency-digest/tsconfig.lib.json" }
  ]
}
```

**Step 4: Create `packages/plugin-js/tsconfig.spec.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist-spec",
    "tsBuildInfoFile": "../../dist/plugin-js.spec.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": []
}
```

**Step 5: Create `packages/plugin-js/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

**Step 6: Create minimal `packages/plugin-js/src/index.ts`**

```typescript
import type { DependencyDigestPlugin } from 'dependency-digest';

const plugin: DependencyDigestPlugin = {
  name: 'js',
  ecosystem: 'npm',

  async detect(_dir) {
    return [];
  },

  async parseDependencies(_manifest) {
    return [];
  },

  async fetchMetrics(dep) {
    return {
      name: dep.name,
      ecosystem: 'npm',
      currentVersion: dep.versionRange,
      latestVersion: 'unknown',
      repoUrl: null,
      lastMajorDate: null,
      lastPatchDate: null,
      lastCommitDate: null,
      lastIssueOpened: null,
      lastIssueClosed: null,
      lastPrOpened: null,
      lastPrClosed: null,
      openIssueCount: 0,
      openPrCount: 0,
      downloads: null,
      pinnedIssues: [],
      vulnerabilities: [],
    };
  },
};

export default plugin;
export { plugin };
```

**Step 7: Install dependencies**

Run: `pnpm install` (from workspace root)

**Step 8: Build to verify scaffold**

Run: `npx nx build plugin-js`
Expected: Build succeeds

**Step 9: Commit**

```bash
git add packages/plugin-js/
git commit -m "feat(plugin-js): scaffold new JS ecosystem plugin package"
```

---

### Task 5: Implement lockfile types and detection

**Files:**
- Create: `packages/plugin-js/src/lockfile/types.ts`
- Create: `packages/plugin-js/src/detect.ts`
- Create: `packages/plugin-js/src/detect.spec.ts`

**Step 1: Create `packages/plugin-js/src/lockfile/types.ts`**

```typescript
export interface ResolvedDependency {
  name: string;
  version: string;
  registryUrl?: string;
  integrity?: string;
}

export interface LockfileData {
  lockfileType: LockfileType;
  dependencies: Map<string, ResolvedDependency>;
}

export type LockfileType = 'npm' | 'yarn' | 'pnpm' | 'bun';

export const LOCKFILE_PRIORITY: Array<{ filename: string; type: LockfileType }> = [
  { filename: 'bun.lock', type: 'bun' },
  { filename: 'bun.lockb', type: 'bun' },
  { filename: 'pnpm-lock.yaml', type: 'pnpm' },
  { filename: 'yarn.lock', type: 'yarn' },
  { filename: 'package-lock.json', type: 'npm' },
];
```

**Step 2: Write failing tests for detection**

Create `packages/plugin-js/src/detect.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectManifests } from './detect.js';
import * as fs from 'fs/promises';
import { join } from 'path';

vi.mock('fs/promises');

describe('detectManifests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect package.json with pnpm-lock.yaml', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'package.json', isFile: () => true },
      { name: 'pnpm-lock.yaml', isFile: () => true },
      { name: 'src', isFile: () => false },
    ] as any);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'pnpm-lock.yaml' },
    ]);
  });

  it('should prefer bun.lock over other lockfiles', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'package.json', isFile: () => true },
      { name: 'bun.lock', isFile: () => true },
      { name: 'package-lock.json', isFile: () => true },
    ] as any);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'bun.lock' },
    ]);
  });

  it('should fall back to package.json type when no lockfile found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'package.json', isFile: () => true },
    ] as any);

    const result = await detectManifests('/project');

    expect(result).toEqual([
      { path: join('/project', 'package.json'), type: 'package.json' },
    ]);
  });

  it('should return empty array when no package.json found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'README.md', isFile: () => true },
    ] as any);

    const result = await detectManifests('/project');
    expect(result).toEqual([]);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx nx test plugin-js`
Expected: FAIL — `detectManifests` not found

**Step 4: Implement `packages/plugin-js/src/detect.ts`**

```typescript
import { readdir } from 'fs/promises';
import { join } from 'path';
import type { ManifestFile } from 'dependency-digest';
import { LOCKFILE_PRIORITY } from './lockfile/types.js';

export async function detectManifests(dir: string): Promise<ManifestFile[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const fileNames = new Set(
      entries.filter((e) => e.isFile()).map((e) => e.name)
    );

    if (!fileNames.has('package.json')) return [];

    const lockfileType =
      LOCKFILE_PRIORITY.find((l) => fileNames.has(l.filename))?.filename ??
      'package.json';

    return [{ path: join(dir, 'package.json'), type: lockfileType }];
  } catch {
    return [];
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx nx test plugin-js`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/plugin-js/src/lockfile/types.ts packages/plugin-js/src/detect.ts packages/plugin-js/src/detect.spec.ts
git commit -m "feat(plugin-js): add lockfile detection with priority ordering"
```

---

### Task 6: Implement npm lockfile parser (package-lock.json)

**Files:**
- Create: `packages/plugin-js/src/lockfile/npm-parser.ts`
- Create: `packages/plugin-js/src/lockfile/npm-parser.spec.ts`

**Step 1: Write failing tests**

Create `packages/plugin-js/src/lockfile/npm-parser.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseNpmLockfile } from './npm-parser.js';

describe('parseNpmLockfile', () => {
  it('should parse v3 lockfile (packages section)', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'my-app', version: '1.0.0' },
        'node_modules/react': {
          version: '19.0.0',
          resolved: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
          integrity: 'sha512-abc123',
        },
        'node_modules/typescript': {
          version: '5.7.2',
          resolved: 'https://registry.npmjs.org/typescript/-/typescript-5.7.2.tgz',
          integrity: 'sha512-def456',
          dev: true,
        },
      },
    });

    const result = parseNpmLockfile(lockfile);

    expect(result.get('react')).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      integrity: 'sha512-abc123',
    });
    expect(result.get('typescript')).toEqual({
      name: 'typescript',
      version: '5.7.2',
      registryUrl: 'https://registry.npmjs.org/typescript/-/typescript-5.7.2.tgz',
      integrity: 'sha512-def456',
    });
  });

  it('should parse v2 lockfile (packages section preferred)', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 2,
      packages: {
        '': { name: 'my-app' },
        'node_modules/lodash': {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          integrity: 'sha512-xyz',
        },
      },
      dependencies: {
        lodash: { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz' },
      },
    });

    const result = parseNpmLockfile(lockfile);
    expect(result.get('lodash')?.version).toBe('4.17.21');
  });

  it('should parse v1 lockfile (dependencies section)', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      dependencies: {
        express: {
          version: '4.18.2',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
          integrity: 'sha512-v1',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    expect(result.get('express')).toEqual({
      name: 'express',
      version: '4.18.2',
      registryUrl: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
      integrity: 'sha512-v1',
    });
  });

  it('should handle scoped packages', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/@octokit/rest': {
          version: '21.0.1',
          resolved: 'https://registry.npmjs.org/@octokit/rest/-/rest-21.0.1.tgz',
          integrity: 'sha512-scoped',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    expect(result.get('@octokit/rest')?.version).toBe('21.0.1');
  });

  it('should skip nested (transitive) dependencies', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/express': {
          version: '4.18.2',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
        },
        'node_modules/express/node_modules/debug': {
          version: '2.6.9',
          resolved: 'https://registry.npmjs.org/debug/-/debug-2.6.9.tgz',
        },
        'node_modules/debug': {
          version: '4.3.4',
          resolved: 'https://registry.npmjs.org/debug/-/debug-4.3.4.tgz',
        },
      },
    });

    const result = parseNpmLockfile(lockfile);
    // Should get hoisted debug (4.3.4), not nested one (2.6.9)
    expect(result.get('debug')?.version).toBe('4.3.4');
    expect(result.get('express')?.version).toBe('4.18.2');
  });

  it('should return empty map for invalid JSON', () => {
    const result = parseNpmLockfile('not valid json');
    expect(result.size).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test plugin-js`
Expected: FAIL — module not found

**Step 3: Implement `packages/plugin-js/src/lockfile/npm-parser.ts`**

```typescript
import type { ResolvedDependency } from './types.js';

interface NpmLockfileV3Package {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  link?: boolean;
}

interface NpmLockfileV1Dependency {
  version: string;
  resolved?: string;
  integrity?: string;
}

interface NpmLockfile {
  lockfileVersion?: number;
  packages?: Record<string, NpmLockfileV3Package>;
  dependencies?: Record<string, NpmLockfileV1Dependency>;
}

export function parseNpmLockfile(content: string): Map<string, ResolvedDependency> {
  const result = new Map<string, ResolvedDependency>();

  let lockfile: NpmLockfile;
  try {
    lockfile = JSON.parse(content);
  } catch {
    return result;
  }

  // Prefer v2/v3 packages section
  if (lockfile.packages) {
    for (const [key, pkg] of Object.entries(lockfile.packages)) {
      if (!key || !key.startsWith('node_modules/')) continue;
      if (pkg.link) continue;

      // Only take top-level (hoisted) deps: "node_modules/name" not "node_modules/x/node_modules/name"
      const withoutPrefix = key.slice('node_modules/'.length);
      if (withoutPrefix.includes('node_modules/')) continue;

      const name = withoutPrefix;
      if (!pkg.version) continue;

      result.set(name, {
        name,
        version: pkg.version,
        registryUrl: pkg.resolved,
        integrity: pkg.integrity,
      });
    }
    return result;
  }

  // Fallback to v1 dependencies section
  if (lockfile.dependencies) {
    for (const [name, dep] of Object.entries(lockfile.dependencies)) {
      result.set(name, {
        name,
        version: dep.version,
        registryUrl: dep.resolved,
        integrity: dep.integrity,
      });
    }
  }

  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx nx test plugin-js`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/plugin-js/src/lockfile/npm-parser.ts packages/plugin-js/src/lockfile/npm-parser.spec.ts
git commit -m "feat(plugin-js): add npm lockfile parser (package-lock.json v1/v2/v3)"
```

---

### Task 7: Implement yarn lockfile parser

**Files:**
- Create: `packages/plugin-js/src/lockfile/yarn-parser.ts`
- Create: `packages/plugin-js/src/lockfile/yarn-parser.spec.ts`

**Step 1: Write failing tests**

Create `packages/plugin-js/src/lockfile/yarn-parser.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseYarnLockfile } from './yarn-parser.js';

describe('parseYarnLockfile', () => {
  it('should parse yarn classic lockfile', () => {
    const content = `
# yarn lockfile v1

react@^19.0.0:
  version "19.0.0"
  resolved "https://registry.yarnpkg.com/react/-/react-19.0.0.tgz#abc123"
  integrity sha512-abc123

typescript@^5.7.2:
  version "5.7.2"
  resolved "https://registry.yarnpkg.com/typescript/-/typescript-5.7.2.tgz#def456"
  integrity sha512-def456
`;

    const result = parseYarnLockfile(content);

    expect(result.get('react')).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.yarnpkg.com/react/-/react-19.0.0.tgz#abc123',
      integrity: 'sha512-abc123',
    });
    expect(result.get('typescript')?.version).toBe('5.7.2');
  });

  it('should handle scoped packages', () => {
    const content = `
# yarn lockfile v1

"@octokit/rest@^21.0.1":
  version "21.0.1"
  resolved "https://registry.yarnpkg.com/@octokit/rest/-/rest-21.0.1.tgz#hash"
  integrity sha512-scoped
`;

    const result = parseYarnLockfile(content);
    expect(result.get('@octokit/rest')?.version).toBe('21.0.1');
  });

  it('should handle multiple version ranges for same package (take first)', () => {
    const content = `
# yarn lockfile v1

lodash@^4.17.0, lodash@^4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#hash"
  integrity sha512-lodash
`;

    const result = parseYarnLockfile(content);
    expect(result.get('lodash')?.version).toBe('4.17.21');
  });

  it('should parse yarn berry lockfile', () => {
    const content = `
__metadata:
  version: 8
  cacheKey: 10c0

"react@npm:^19.0.0":
  version: 19.0.0
  resolution: "react@npm:19.0.0"
  checksum: 10c0/abc123
  languageName: node
  linkType: hard

"typescript@npm:^5.7.2":
  version: 5.7.2
  resolution: "typescript@npm:5.7.2"
  checksum: 10c0-def456
  languageName: node
  linkType: hard
`;

    const result = parseYarnLockfile(content);
    expect(result.get('react')?.version).toBe('19.0.0');
    expect(result.get('typescript')?.version).toBe('5.7.2');
  });

  it('should return empty map for empty content', () => {
    const result = parseYarnLockfile('');
    expect(result.size).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test plugin-js`
Expected: FAIL

**Step 3: Implement `packages/plugin-js/src/lockfile/yarn-parser.ts`**

```typescript
import type { ResolvedDependency } from './types.js';

export function parseYarnLockfile(content: string): Map<string, ResolvedDependency> {
  const result = new Map<string, ResolvedDependency>();
  if (!content.trim()) return result;

  const isBerry = content.includes('__metadata:');

  if (isBerry) {
    return parseYarnBerry(content);
  }
  return parseYarnClassic(content);
}

function parseYarnClassic(content: string): Map<string, ResolvedDependency> {
  const result = new Map<string, ResolvedDependency>();

  // Split into blocks: each block starts with an unindented line and continues with indented lines
  const blocks = content.split(/\n(?=\S)/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const header = lines[0];
    // Skip comments
    if (header.startsWith('#')) continue;

    // Extract package name from header like: react@^19.0.0: or "react@^19.0.0", "react@^18.0.0":
    const name = extractPackageName(header);
    if (!name) continue;

    let version: string | undefined;
    let resolved: string | undefined;
    let integrity: string | undefined;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('version ')) {
        version = unquote(trimmed.slice('version '.length));
      } else if (trimmed.startsWith('resolved ')) {
        resolved = unquote(trimmed.slice('resolved '.length));
      } else if (trimmed.startsWith('integrity ')) {
        integrity = unquote(trimmed.slice('integrity '.length));
      }
    }

    if (name && version && !result.has(name)) {
      result.set(name, { name, version, registryUrl: resolved, integrity });
    }
  }

  return result;
}

function parseYarnBerry(content: string): Map<string, ResolvedDependency> {
  const result = new Map<string, ResolvedDependency>();
  const blocks = content.split(/\n(?=\S)/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const header = lines[0];
    if (header.startsWith('#') || header.startsWith('__metadata:')) continue;

    // Berry header: "react@npm:^19.0.0":
    const name = extractPackageName(header);
    if (!name) continue;

    let version: string | undefined;
    let checksum: string | undefined;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('version: ')) {
        version = trimmed.slice('version: '.length).trim();
      } else if (trimmed.startsWith('checksum: ')) {
        checksum = trimmed.slice('checksum: '.length).trim();
      }
    }

    if (name && version && !result.has(name)) {
      result.set(name, { name, version, integrity: checksum });
    }
  }

  return result;
}

function extractPackageName(header: string): string | null {
  // Remove trailing colon
  const cleaned = header.replace(/:$/, '').trim();

  // Handle quoted entries: "@scope/pkg@npm:^1.0.0", "@scope/pkg@^1.0.0"
  // Handle unquoted entries: react@^19.0.0
  // May have multiple ranges: lodash@^4.17.0, lodash@^4.17.21

  // Take the first entry (before any comma)
  const firstEntry = cleaned.split(',')[0].trim().replace(/^"|"$/g, '');

  // Split on last @ that isn't part of a scope
  // For "@scope/pkg@^1.0.0" -> "@scope/pkg"
  // For "react@^19.0.0" -> "react"
  // For "@scope/pkg@npm:^1.0.0" -> "@scope/pkg"
  const atIndex = firstEntry.startsWith('@')
    ? firstEntry.indexOf('@', 1)
    : firstEntry.indexOf('@');

  if (atIndex === -1) return null;

  return firstEntry.slice(0, atIndex);
}

function unquote(s: string): string {
  return s.replace(/^"|"$/g, '').trim();
}
```

**Step 4: Run tests to verify they pass**

Run: `npx nx test plugin-js`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/plugin-js/src/lockfile/yarn-parser.ts packages/plugin-js/src/lockfile/yarn-parser.spec.ts
git commit -m "feat(plugin-js): add yarn lockfile parser (classic + berry)"
```

---

### Task 8: Implement pnpm lockfile parser

**Files:**
- Create: `packages/plugin-js/src/lockfile/pnpm-parser.ts`
- Create: `packages/plugin-js/src/lockfile/pnpm-parser.spec.ts`

**Step 1: Write failing tests**

Create `packages/plugin-js/src/lockfile/pnpm-parser.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parsePnpmLockfile } from './pnpm-parser.js';

describe('parsePnpmLockfile', () => {
  it('should parse pnpm v9 lockfile', () => {
    const content = `
lockfileVersion: '9.0'

importers:
  '.':
    dependencies:
      react:
        specifier: ^19.0.0
        version: 19.0.0
    devDependencies:
      typescript:
        specifier: ^5.7.2
        version: 5.7.2

packages:
  react@19.0.0:
    resolution: {integrity: sha512-abc123, tarball: https://registry.npmjs.org/react/-/react-19.0.0.tgz}
    engines: {node: '>=16'}

  typescript@5.7.2:
    resolution: {integrity: sha512-def456}
    engines: {node: '>=14'}
`;

    const result = parsePnpmLockfile(content);

    expect(result.get('react')).toEqual({
      name: 'react',
      version: '19.0.0',
      integrity: 'sha512-abc123',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
    });
    expect(result.get('typescript')?.version).toBe('5.7.2');
  });

  it('should parse pnpm v6 lockfile', () => {
    const content = `
lockfileVersion: '6.0'

dependencies:
  express:
    specifier: ^4.18.0
    version: 4.18.2

packages:
  /express@4.18.2:
    resolution: {integrity: sha512-expr}
    engines: {node: '>= 0.10.0'}
`;

    const result = parsePnpmLockfile(content);
    expect(result.get('express')?.version).toBe('4.18.2');
  });

  it('should handle scoped packages', () => {
    const content = `
lockfileVersion: '9.0'

importers:
  '.':
    dependencies:
      '@octokit/rest':
        specifier: ^21.0.1
        version: 21.0.1

packages:
  '@octokit/rest@21.0.1':
    resolution: {integrity: sha512-octo}
`;

    const result = parsePnpmLockfile(content);
    expect(result.get('@octokit/rest')?.version).toBe('21.0.1');
  });

  it('should return empty map for invalid YAML', () => {
    const result = parsePnpmLockfile('{{invalid yaml}}');
    expect(result.size).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test plugin-js`
Expected: FAIL

**Step 3: Implement `packages/plugin-js/src/lockfile/pnpm-parser.ts`**

Note: We'll use a simple YAML parser approach since pnpm lockfiles have a consistent structure. We avoid adding a YAML dependency by parsing the key patterns we need.

```typescript
import type { ResolvedDependency } from './types.js';

export function parsePnpmLockfile(content: string): Map<string, ResolvedDependency> {
  const result = new Map<string, ResolvedDependency>();

  try {
    const packagesSection = extractPackagesSection(content);
    if (!packagesSection) return result;

    // Parse each package entry
    // v9: "react@19.0.0:" or "@scope/pkg@1.0.0:"
    // v5-v6: "/react@19.0.0:" or "/@scope/pkg@1.0.0:"
    const packagePattern = /^  ['/]?(@?[^@\s]+)@([^:(]+)/gm;
    let match: RegExpExecArray | null;

    while ((match = packagePattern.exec(packagesSection)) !== null) {
      const name = match[1];
      const version = match[2];

      if (result.has(name)) continue;

      // Extract resolution metadata from subsequent lines
      const entryStart = match.index;
      const nextEntry = packagesSection.indexOf('\n  ', entryStart + 1);
      // Find the next top-level entry (2-space indent, not 4+)
      let entryEnd = packagesSection.length;
      const lines = packagesSection.slice(entryStart).split('\n');
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].match(/^  \S/)) {
          entryEnd = entryStart + lines.slice(0, i).join('\n').length;
          break;
        }
      }

      const entryBlock = packagesSection.slice(entryStart, entryEnd);

      const integrity = extractValue(entryBlock, 'integrity');
      const tarball = extractValue(entryBlock, 'tarball');

      result.set(name, {
        name,
        version,
        integrity: integrity ?? undefined,
        registryUrl: tarball ?? undefined,
      });
    }
  } catch {
    // Return whatever we've parsed so far
  }

  return result;
}

function extractPackagesSection(content: string): string | null {
  // Find the "packages:" line at root level (no indentation)
  const packagesIndex = content.indexOf('\npackages:\n');
  if (packagesIndex === -1) return null;

  const afterPackages = content.slice(packagesIndex + '\npackages:\n'.length);

  // The packages section ends at the next root-level key or EOF
  const nextRootKey = afterPackages.search(/^\S/m);
  return nextRootKey === -1 ? afterPackages : afterPackages.slice(0, nextRootKey);
}

function extractValue(block: string, key: string): string | null {
  // Match patterns like: integrity: sha512-abc or {integrity: sha512-abc, tarball: https://...}
  const patterns = [
    new RegExp(`${key}:\\s*([^,}\\s]+)`),
    new RegExp(`${key}: '([^']+)'`),
    new RegExp(`${key}: "([^"]+)"`),
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match) return match[1];
  }

  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx nx test plugin-js`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/plugin-js/src/lockfile/pnpm-parser.ts packages/plugin-js/src/lockfile/pnpm-parser.spec.ts
git commit -m "feat(plugin-js): add pnpm lockfile parser (v5-v9)"
```

---

### Task 9: Implement bun lockfile parser

**Files:**
- Create: `packages/plugin-js/src/lockfile/bun-parser.ts`
- Create: `packages/plugin-js/src/lockfile/bun-parser.spec.ts`

**Step 1: Write failing tests**

Create `packages/plugin-js/src/lockfile/bun-parser.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseBunLockfile } from './bun-parser.js';

describe('parseBunLockfile', () => {
  it('should parse bun.lock text format', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      workspaces: {
        '': { name: 'my-app', dependencies: { react: '^19.0.0' } },
      },
      packages: {
        'react': ['react@19.0.0', 'https://registry.npmjs.org/react/-/react-19.0.0.tgz', {}, 'sha512-abc123'],
        'typescript': ['typescript@5.7.2', 'https://registry.npmjs.org/typescript/-/typescript-5.7.2.tgz', {}, 'sha512-def456'],
      },
    });

    const result = parseBunLockfile(lockfile);

    expect(result.get('react')).toEqual({
      name: 'react',
      version: '19.0.0',
      registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      integrity: 'sha512-abc123',
    });
    expect(result.get('typescript')?.version).toBe('5.7.2');
  });

  it('should handle scoped packages', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      workspaces: { '': {} },
      packages: {
        '@octokit/rest': ['@octokit/rest@21.0.1', 'https://registry.npmjs.org/@octokit/rest/-/rest-21.0.1.tgz', {}, 'sha512-octo'],
      },
    });

    const result = parseBunLockfile(lockfile);
    expect(result.get('@octokit/rest')?.version).toBe('21.0.1');
  });

  it('should skip workspace packages', () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 1,
      workspaces: {
        '': { name: 'root' },
        'packages/core': { name: '@my/core' },
      },
      packages: {
        '@my/core': ['@my/core@workspace:packages/core'],
        'react': ['react@19.0.0', 'https://registry.npmjs.org/react/-/react-19.0.0.tgz', {}, 'sha512-abc'],
      },
    });

    const result = parseBunLockfile(lockfile);
    expect(result.has('@my/core')).toBe(false);
    expect(result.has('react')).toBe(true);
  });

  it('should return empty map for invalid JSON', () => {
    const result = parseBunLockfile('not json');
    expect(result.size).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test plugin-js`
Expected: FAIL

**Step 3: Implement `packages/plugin-js/src/lockfile/bun-parser.ts`**

```typescript
import type { ResolvedDependency } from './types.js';

interface BunLockfile {
  lockfileVersion?: number;
  workspaces?: Record<string, unknown>;
  packages?: Record<string, unknown[]>;
}

export function parseBunLockfile(content: string): Map<string, ResolvedDependency> {
  const result = new Map<string, ResolvedDependency>();

  let lockfile: BunLockfile;
  try {
    lockfile = JSON.parse(content);
  } catch {
    return result;
  }

  if (!lockfile.packages) return result;

  for (const [key, tuple] of Object.entries(lockfile.packages)) {
    if (!Array.isArray(tuple) || tuple.length < 1) continue;

    const spec = tuple[0] as string;

    // Skip workspace packages: ["name@workspace:path"]
    if (spec.includes('@workspace:')) continue;
    // Skip file/link packages
    if (spec.includes('@file:') || spec.includes('@link:')) continue;

    // Parse "name@version" from spec
    const parsed = parsePackageSpec(spec);
    if (!parsed) continue;

    const { name, version } = parsed;

    // tuple[1] = tarball URL (for npm packages)
    // tuple[3] = integrity hash
    const registryUrl = typeof tuple[1] === 'string' ? tuple[1] : undefined;
    const integrity = typeof tuple[3] === 'string' ? tuple[3] : undefined;

    if (!result.has(name)) {
      result.set(name, { name, version, registryUrl, integrity });
    }
  }

  return result;
}

function parsePackageSpec(spec: string): { name: string; version: string } | null {
  // Handle "@scope/pkg@1.0.0" and "pkg@1.0.0"
  const atIndex = spec.startsWith('@')
    ? spec.indexOf('@', 1)
    : spec.indexOf('@');

  if (atIndex === -1) return null;

  const name = spec.slice(0, atIndex);
  const version = spec.slice(atIndex + 1);

  if (!name || !version) return null;

  return { name, version };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx nx test plugin-js`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/plugin-js/src/lockfile/bun-parser.ts packages/plugin-js/src/lockfile/bun-parser.spec.ts
git commit -m "feat(plugin-js): add bun lockfile parser (bun.lock text format)"
```

---

### Task 10: Create lockfile dispatcher

**Files:**
- Create: `packages/plugin-js/src/lockfile/index.ts`
- Create: `packages/plugin-js/src/lockfile/index.spec.ts`

**Step 1: Write failing tests**

Create `packages/plugin-js/src/lockfile/index.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseLockfile } from './index.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('parseLockfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should dispatch to npm parser for package-lock.json', async () => {
    const lockContent = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/react': {
          version: '19.0.0',
          resolved: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
        },
      },
    });
    vi.mocked(fs.readFile).mockResolvedValue(lockContent);

    const result = await parseLockfile('/project', 'package-lock.json');
    expect(result.get('react')?.version).toBe('19.0.0');
  });

  it('should dispatch to bun parser for bun.lock', async () => {
    const lockContent = JSON.stringify({
      lockfileVersion: 1,
      workspaces: { '': {} },
      packages: {
        'react': ['react@19.0.0', 'https://registry.npmjs.org/react/-/react-19.0.0.tgz', {}, 'sha512-abc'],
      },
    });
    vi.mocked(fs.readFile).mockResolvedValue(lockContent);

    const result = await parseLockfile('/project', 'bun.lock');
    expect(result.get('react')?.version).toBe('19.0.0');
  });

  it('should return empty map for package.json type (no lockfile)', async () => {
    const result = await parseLockfile('/project', 'package.json');
    expect(result.size).toBe(0);
  });

  it('should return empty map and warn when lockfile read fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await parseLockfile('/project', 'package-lock.json');
    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not parse lockfile'));
    warnSpy.mockRestore();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test plugin-js`
Expected: FAIL

**Step 3: Implement `packages/plugin-js/src/lockfile/index.ts`**

```typescript
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import type { ResolvedDependency } from './types.js';
import { parseNpmLockfile } from './npm-parser.js';
import { parseYarnLockfile } from './yarn-parser.js';
import { parsePnpmLockfile } from './pnpm-parser.js';
import { parseBunLockfile } from './bun-parser.js';

export type { ResolvedDependency, LockfileData, LockfileType } from './types.js';

export async function parseLockfile(
  dir: string,
  lockfileType: string
): Promise<Map<string, ResolvedDependency>> {
  if (lockfileType === 'package.json') {
    return new Map();
  }

  try {
    const content = await readFile(join(dir, lockfileType), 'utf-8');

    switch (lockfileType) {
      case 'package-lock.json':
        return parseNpmLockfile(content);
      case 'yarn.lock':
        return parseYarnLockfile(content);
      case 'pnpm-lock.yaml':
        return parsePnpmLockfile(content);
      case 'bun.lock':
      case 'bun.lockb':
        return parseBunLockfile(content);
      default:
        return new Map();
    }
  } catch {
    console.warn(
      `Could not parse lockfile (${lockfileType}), falling back to package.json versions`
    );
    return new Map();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx nx test plugin-js`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/plugin-js/src/lockfile/index.ts packages/plugin-js/src/lockfile/index.spec.ts
git commit -m "feat(plugin-js): add lockfile dispatcher with fallback warning"
```

---

### Task 11: Implement the main parser with lockfile integration

**Files:**
- Create: `packages/plugin-js/src/parser.ts`
- Create: `packages/plugin-js/src/parser.spec.ts`

**Step 1: Write failing tests**

Create `packages/plugin-js/src/parser.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseManifest } from './parser.js';
import * as fs from 'fs/promises';
import * as lockfileModule from './lockfile/index.js';

vi.mock('fs/promises');
vi.mock('./lockfile/index.js');

describe('parseManifest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should use lockfile versions when available', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0' },
        devDependencies: { typescript: '^5.7.2' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(
      new Map([
        ['react', { name: 'react', version: '19.0.0', registryUrl: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz' }],
        ['typescript', { name: 'typescript', version: '5.7.2' }],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    expect(result).toEqual([
      { name: 'react', versionRange: '19.0.0', group: 'dependencies' },
      { name: 'typescript', versionRange: '5.7.2', group: 'devDependencies' },
    ]);
  });

  it('should fall back to package.json range when dep not in lockfile', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0', lodash: '^4.17.21' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(
      new Map([
        ['react', { name: 'react', version: '19.0.0' }],
      ])
    );

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package-lock.json',
    });

    expect(result).toContainEqual(
      { name: 'lodash', versionRange: '^4.17.21', group: 'dependencies' }
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lodash'));
    warnSpy.mockRestore();
  });

  it('should use package.json ranges when type is package.json (no lockfile)', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: { react: '^19.0.0' },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(new Map());

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package.json',
    });

    expect(result).toEqual([
      { name: 'react', versionRange: '^19.0.0', group: 'dependencies' },
    ]);
  });

  it('should skip workspace/link/file/portal protocols', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        dependencies: {
          'local-pkg': 'workspace:*',
          'linked-pkg': 'link:../other',
          react: '^19.0.0',
        },
      })
    );

    vi.mocked(lockfileModule.parseLockfile).mockResolvedValue(new Map());

    const result = await parseManifest({
      path: '/project/package.json',
      type: 'package.json',
    });

    expect(result).toEqual([
      { name: 'react', versionRange: '^19.0.0', group: 'dependencies' },
    ]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test plugin-js`
Expected: FAIL

**Step 3: Implement `packages/plugin-js/src/parser.ts`**

```typescript
import { readFile } from 'fs/promises';
import { dirname } from 'path';
import type { ManifestFile, ParsedDependency } from 'dependency-digest';
import { parseLockfile } from './lockfile/index.js';

const SKIP_PROTOCOLS = ['workspace:', 'link:', 'file:', 'portal:'];

export async function parseManifest(
  manifest: ManifestFile
): Promise<ParsedDependency[]> {
  const content = await readFile(manifest.path, 'utf-8');
  const pkg = JSON.parse(content);
  const dir = dirname(manifest.path);

  const lockfileVersions = await parseLockfile(dir, manifest.type);

  const deps: ParsedDependency[] = [];

  for (const group of ['dependencies', 'devDependencies'] as const) {
    const entries = pkg[group];
    if (!entries || typeof entries !== 'object') continue;

    for (const [name, versionRange] of Object.entries(entries)) {
      if (typeof versionRange !== 'string') continue;
      if (SKIP_PROTOCOLS.some((p) => versionRange.startsWith(p))) continue;

      const resolved = lockfileVersions.get(name);
      if (resolved) {
        deps.push({ name, versionRange: resolved.version, group });
      } else {
        if (manifest.type !== 'package.json') {
          console.warn(
            `${name} not found in lockfile, using package.json range: ${versionRange}`
          );
        }
        deps.push({ name, versionRange, group });
      }
    }
  }

  return deps;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx nx test plugin-js`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/plugin-js/src/parser.ts packages/plugin-js/src/parser.spec.ts
git commit -m "feat(plugin-js): add manifest parser with lockfile version resolution"
```

---

### Task 12: Port npm-registry.ts and metrics.ts, wire up the plugin

**Files:**
- Create: `packages/plugin-js/src/npm-registry.ts` (copy from plugin-npm, unchanged)
- Create: `packages/plugin-js/src/metrics.ts`
- Modify: `packages/plugin-js/src/index.ts`

**Step 1: Copy `npm-registry.ts` from plugin-npm**

Copy `packages/plugin-npm/src/npm-registry.ts` to `packages/plugin-js/src/npm-registry.ts` — unchanged.

**Step 2: Create `packages/plugin-js/src/metrics.ts`**

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
    ecosystem: 'npm',
    currentVersion: dep.versionRange,
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

**Step 3: Update `packages/plugin-js/src/index.ts`**

```typescript
import type { DependencyDigestPlugin } from 'dependency-digest';
import { detectManifests } from './detect.js';
import { parseManifest } from './parser.js';
import { fetchDependencyMetrics } from './metrics.js';

const plugin: DependencyDigestPlugin = {
  name: 'js',
  ecosystem: 'npm',

  detect: detectManifests,
  parseDependencies: parseManifest,
  fetchMetrics: fetchDependencyMetrics,
};

export default plugin;
export { plugin };
```

**Step 4: Build to verify**

Run: `npx nx build plugin-js`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/plugin-js/src/
git commit -m "feat(plugin-js): wire up registry, metrics, and plugin export"
```

---

### Task 13: Delete plugin-npm package

**Files:**
- Delete: `packages/plugin-npm/` (entire directory)
- Modify: any references to `@digests/plugin-npm` in the workspace

**Step 1: Search for references to plugin-npm**

Run: `grep -r "plugin-npm" /Users/agentender/repos/digests/ --include='*.ts' --include='*.json' -l`

Check each file and update references to `@digests/plugin-js`.

**Step 2: Delete the package**

```bash
rm -rf packages/plugin-npm
```

**Step 3: Run pnpm install to update workspace**

Run: `pnpm install`

**Step 4: Build the whole workspace**

Run: `npx nx run-many -t build`
Expected: All builds pass

**Step 5: Run all tests**

Run: `npx nx run-many -t test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: replace @digests/plugin-npm with @digests/plugin-js

BREAKING CHANGE: @digests/plugin-npm has been replaced by @digests/plugin-js.
The new plugin supports lockfile-based version resolution for npm, yarn, pnpm, and bun."
```

---

### Task 14: Final verification

**Step 1: Full workspace build**

Run: `npx nx run-many -t build`
Expected: All projects build successfully

**Step 2: Full test suite**

Run: `npx nx run-many -t test`
Expected: All tests pass

**Step 3: Lint**

Run: `npx nx run-many -t lint`
Expected: No lint errors
