# OSV Vulnerability Integration

## Overview

Replace GitHub Advisory API with OSV.dev as the sole vulnerability data source. This catches CVEs that GitHub hasn't indexed as advisories, reduces GitHub API rate limit pressure, and simplifies the architecture.

## Design Decisions

- **OSV.dev over cvelistV5/NVD**: OSV aggregates CVEs + GHSAs, supports query-by-package-name + version, free/no auth
- **Replace GitHub Advisories (not supplement)**: OSV includes GHSA data, so one source covers both
- **Separate `packages/osv` package**: Clean separation, reusable across ecosystems
- **Extract `packages/cache-utils`**: Prevents circular deps between `osv` and `github-utils`
- **Call OSV from plugin-js**: Decouples vulnerability checking from GitHub metrics

## OSV API

**Endpoint:** `POST https://api.osv.dev/v1/query`

**Request:**
```json
{
  "package": { "name": "express", "ecosystem": "npm" },
  "version": "4.17.1"
}
```

**Response:** Returns `{ vulns: [...] }` with matched vulnerabilities including CVE/GHSA IDs, severity (CVSS), affected version ranges, and references.

## Implementation Plan

### Task 1: Create `packages/cache-utils`

Extract caching from `github-utils` into a standalone package.

**Files to create:**
- `packages/cache-utils/package.json`
- `packages/cache-utils/tsconfig.json`
- `packages/cache-utils/tsconfig.lib.json`
- `packages/cache-utils/tsconfig.spec.json`
- `packages/cache-utils/src/index.ts`
- `packages/cache-utils/src/cache.ts` — move contents from `github-utils/src/cache.ts`

**Files to modify:**
- `packages/github-utils/package.json` — add `@digests/cache-utils: workspace:*` dependency
- `packages/github-utils/src/cache.ts` — replace with re-export from `@digests/cache-utils`
- `packages/github-utils/src/index.ts` — keep exporting cache (backwards compat for now)
- `packages/plugin-js/package.json` — add `@digests/cache-utils: workspace:*` if it imports cache directly

**Verify:** `npx nx build cache-utils && npx nx build github-utils && npx nx test github-utils`

### Task 2: Create `packages/osv`

New package for OSV.dev API client.

**Files to create:**
- `packages/osv/package.json`
- `packages/osv/tsconfig.json`
- `packages/osv/tsconfig.lib.json`
- `packages/osv/tsconfig.spec.json`
- `packages/osv/src/index.ts`
- `packages/osv/src/types.ts` — OSV API response types
- `packages/osv/src/client.ts` — `fetchVulnerabilities(ecosystem, packageName, version): Promise<Vulnerability[]>`
- `packages/osv/src/client.spec.ts` — tests with mocked HTTP

**Implementation details for `client.ts`:**
- POST to `https://api.osv.dev/v1/query` with `{ package: { name, ecosystem }, version }`
- Map OSV response to existing `Vulnerability` interface:
  - `id`: Prefer CVE alias, fall back to OSV ID
  - `severity`: Extract from `severity[].score` (CVSS) or `database_specific`
  - `title`: From `summary`
  - `url`: Construct `https://osv.dev/vulnerability/{id}`
  - `vulnerableRange`: From `affected[].ranges[].events`
  - `patchedVersion`: From range events (the "fixed" event)
- Cache results using `withCache` from `cache-utils`

**Verify:** `npx nx build osv && npx nx test osv`

### Task 3: Remove advisories from `github-utils`

**Files to modify:**
- `packages/github-utils/src/github-metrics.ts`:
  - Remove `fetchAdvisories` import and call
  - Remove `vulnerabilities` from `GitHubRepoMetrics` interface
  - Remove `vulnerabilities` from the returned object and `EMPTY_GITHUB_METRICS`
- `packages/github-utils/src/index.ts` — remove advisory exports
- Delete `packages/github-utils/src/advisories.ts`

**Files to update tests:**
- Any tests in `github-utils` that reference advisories/vulnerabilities

**Verify:** `npx nx build github-utils && npx nx test github-utils`

### Task 4: Wire OSV into `plugin-js`

**Files to modify:**
- `packages/plugin-js/package.json` — add `@digests/osv: workspace:*` dependency
- `packages/plugin-js/src/metrics.ts`:
  - Import `fetchVulnerabilities` from `@digests/osv`
  - Call `fetchVulnerabilities('npm', name, version)` instead of reading from GitHub metrics
  - Keep `filterApplicableVulnerabilities` as safety check (OSV version-matches but belt-and-suspenders)
  - Assemble into `DependencyMetrics.vulnerabilities`

**Verify:** `npx nx build plugin-js && npx nx test plugin-js`

### Task 5: Update `dependency-digest` types

**Files to modify:**
- `packages/dependency-digest/src/types.ts`:
  - The `Vulnerability` type here should stay as-is (it's the consumer interface)
  - Verify it still matches what OSV client returns

**Verify:** `npx nx run-many -t build -t test`

### Task 6: End-to-end verification

- Run full build: `npx nx run-many -t build`
- Run full tests: `npx nx run-many -t test`
- Run lint: `npx nx run-many -t lint`
- Manual test: run the CLI against a project known to have CVEs and verify they show up
