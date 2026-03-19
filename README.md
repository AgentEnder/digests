# Digests

A toolkit for generating health digests of your software dependencies and pull requests. Scan your project's dependency tree to surface vulnerabilities, outdated packages, license concerns, and maintenance signals — then export as Markdown reports or industry-standard SBOMs.

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`dependency-digest`](./packages/dependency-digest) | Core scanning engine and CLI for dependency health reports | ![npm](https://img.shields.io/npm/v/dependency-digest) |
| [`pr-digest`](./packages/pr-digest) | CLI for generating GitHub PR digests with full timeline context | ![npm](https://img.shields.io/npm/v/pr-digest) |
| [`@digests/plugin-js`](./packages/plugin-js) | JavaScript ecosystem plugin (npm, yarn, pnpm, bun) | ![npm](https://img.shields.io/npm/v/@digests/plugin-js) |
| [`@digests/github-utils`](./packages/github-utils) | Shared GitHub API utilities | ![npm](https://img.shields.io/npm/v/@digests/github-utils) |
| [`@digests/osv`](./packages/osv) | OSV.dev vulnerability database client | ![npm](https://img.shields.io/npm/v/@digests/osv) |
| [`@digests/cache-utils`](./packages/cache-utils) | Filesystem caching utilities | ![npm](https://img.shields.io/npm/v/@digests/cache-utils) |

## Quick Start

### Dependency Digest

Scan a project's dependencies and generate a health report:

```bash
# Install globally
npm install -g dependency-digest @digests/plugin-js

# Scan current directory → Markdown to stdout
dependency-digest

# Export as CycloneDX SBOM
dependency-digest --format cyclonedx --output report.cdx.json

# Export all formats to a directory
dependency-digest --format all --output reports/
```

### PR Digest

Generate a summary of a GitHub pull request:

```bash
npm install -g pr-digest

# Auto-detect PR from current branch
pr-digest

# Specify a PR URL
pr-digest --url https://github.com/owner/repo/pull/123
```

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                     dependency-digest                         │
│                  (orchestrator + CLI)                         │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │   Detect     │──▶│    Parse     │──▶│  Fetch Metrics   │  │
│  │  manifests   │   │ dependencies │   │  per dependency  │  │
│  └─────────────┘   └──────────────┘   └──────────────────┘  │
│        │                   │                    │             │
│        ▼                   ▼                    ▼             │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                   Plugin System                       │    │
│  │  @digests/plugin-js  (npm, yarn, pnpm, bun)          │    │
│  │  Future: plugin-python, plugin-go, plugin-rust, ...   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Output: Markdown │ JSON │ CycloneDX 1.5 │ SPDX 2.3        │
└──────────────────────────────────────────────────────────────┘

Supporting packages:
  @digests/github-utils  ─  GitHub API, rate limiting, token resolution
  @digests/osv           ─  Vulnerability lookups via OSV.dev
  @digests/cache-utils   ─  Filesystem caching to avoid redundant API calls
```

`dependency-digest` uses a **plugin architecture**. Each plugin knows how to detect manifest files, parse dependencies, and fetch ecosystem-specific metrics. The core engine orchestrates the scanning pipeline and handles output formatting.

## Output Formats

| Format | Extension | Use Case |
|--------|-----------|----------|
| **Markdown** | `.md` | Human-readable reports, PR comments |
| **JSON** | `.json` | Programmatic consumption, custom tooling |
| **CycloneDX 1.5** | `.cdx.json` | Supply chain security, compliance workflows |
| **SPDX 2.3** | `.spdx.json` | License compliance, software composition analysis |

## Metrics Collected

For each dependency, `dependency-digest` collects:

- **Version info** — resolved version, latest available, version specifier
- **Maintenance signals** — last commit, last patch release, last major release
- **Community health** — open issues, open PRs, last issue/PR activity
- **Security** — known vulnerabilities from OSV.dev (CVEs and GHSAs)
- **License** — SPDX identifier with configurable allow/deny lists
- **Provenance** — registry URL, integrity hash, package URL (purl)

## Configuration

Create a `dependency-digest.config.json` in your project root:

```json
{
  "allowedLicenses": ["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause"],
  "deniedLicenses": ["GPL-3.0"],
  "licenseOverrides": {
    "some-package": "MIT",
    "other-package": { "license": "Apache-2.0", "reason": "Dual-licensed, using Apache" }
  },
  "plugins": ["@digests/plugin-js"],
  "exclude": ["@types/*"]
}
```

## Authentication

Both tools use GitHub tokens for API access. Token is resolved in order:

1. `--token` CLI flag
2. `GH_TOKEN` environment variable
3. `GITHUB_TOKEN` environment variable
4. `gh auth token` (GitHub CLI)

## Writing a Plugin

Plugins implement the `DependencyDigestPlugin` interface:

```typescript
import type { DependencyDigestPlugin } from 'dependency-digest';

const plugin: DependencyDigestPlugin = {
  name: 'my-ecosystem',
  ecosystem: 'my-ecosystem',

  async detect(dir) {
    // Return manifest files found in dir
  },

  async parseDependencies(manifest) {
    // Parse dependencies from a manifest file
  },

  async fetchMetrics(dep, token) {
    // Fetch health metrics for a single dependency
  },
};

export default plugin;
```

## Development

```bash
# Prerequisites: Node.js 18+, pnpm 9.12.2

# Install dependencies
pnpm install

# Build all packages
npx nx run-many -t build

# Run all tests
npx nx run-many -t test

# Build a specific package
npx nx build dependency-digest

# Test a specific package
npx nx test @digests/plugin-js
```

## License

MIT
