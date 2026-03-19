# @digests/plugin-js

JavaScript and TypeScript ecosystem plugin for [`dependency-digest`](https://www.npmjs.com/package/dependency-digest). Detects and parses dependencies from npm, yarn, pnpm, and bun projects, then fetches health metrics from the npm registry, GitHub, and OSV.dev.

## Installation

```bash
npm install @digests/plugin-js
```

This plugin is installed alongside `dependency-digest` and is loaded automatically by default.

## Supported Package Managers

| Package Manager | Lockfile | Versions |
|----------------|----------|----------|
| **npm** | `package-lock.json` | v1, v2, v3 |
| **Yarn** | `yarn.lock` | Classic, Berry |
| **pnpm** | `pnpm-lock.yaml` | v5 – v9 |
| **Bun** | `bun.lock` | All |

When multiple lockfiles are present, the plugin uses this priority: **bun > pnpm > yarn > npm**.

## How It Works

1. **Detection** — Finds `package.json` files and their associated lockfiles in the target directory
2. **Parsing** — Extracts dependency names, resolved versions, and integrity hashes from the lockfile. Falls back to manifest specifiers when no lockfile is available.
3. **Metrics** — For each dependency, fetches:
   - **npm registry** — latest version, license, description, author, download counts, release dates
   - **GitHub** — last commit, open issues/PRs, recent activity, pinned issues
   - **OSV.dev** — known vulnerabilities (CVEs and GHSAs)

## Programmatic Usage

```typescript
import plugin from '@digests/plugin-js';
import { scan } from 'dependency-digest';

const digest = await scan({
  dir: process.cwd(),
  plugins: [plugin],
  token: process.env.GITHUB_TOKEN,
});
```

The plugin can also be used standalone for its individual capabilities:

```typescript
import plugin from '@digests/plugin-js';

// Detect manifests
const manifests = await plugin.detect('/path/to/project');

// Parse dependencies from a manifest
const { dependencies, edges } = await plugin.parseDependencies(manifests[0]);

// Fetch metrics for a single dependency
const metrics = await plugin.fetchMetrics(dependencies[0], githubToken);
```

## Plugin Interface

This plugin implements the `DependencyDigestPlugin` interface from `dependency-digest`:

- **`name`**: `"js"`
- **`ecosystem`**: `"npm"`
- **`detect(dir)`** — Scans for `package.json` + lockfile combinations
- **`parseDependencies(manifest)`** — Returns parsed dependencies with version resolution from lockfiles and dependency graph edges
- **`fetchMetrics(dep, token)`** — Aggregates data from npm registry, GitHub API, and OSV.dev

## License

MIT
