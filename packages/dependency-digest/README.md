# dependency-digest

Scan your project's dependency tree and generate health reports. Surfaces vulnerabilities, outdated packages, license issues, and maintenance signals for every dependency — then outputs as Markdown, JSON, or industry-standard SBOMs (CycloneDX 1.5, SPDX 2.3).

## Installation

```bash
npm install -g dependency-digest @digests/plugin-js
```

You need at least one ecosystem plugin installed. `@digests/plugin-js` covers npm, yarn, pnpm, and bun projects.

## CLI Usage

```bash
# Scan current directory, output Markdown to stdout
dependency-digest

# Scan a specific directory
dependency-digest --dir /path/to/project

# Output as CycloneDX SBOM
dependency-digest --format cyclonedx --output report.cdx.json

# Output as SPDX SBOM
dependency-digest --format spdx --output report.spdx.json

# Export all formats to a directory
dependency-digest --format all --output reports/

# Skip devDependencies
dependency-digest --include-dev false

# Exclude specific packages
dependency-digest --exclude "@types/*" --exclude "eslint-*"

# Increase concurrency for faster scans
dependency-digest --concurrency 10

# Bypass cache for fresh data
dependency-digest --skip-cache
```

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--dir` | `-d` | Directory to scan | Current directory |
| `--plugin` | `-p` | Plugin package names | Auto-detect |
| `--format` | `-f` | Output format(s): `markdown`, `json`, `cyclonedx`, `spdx`, `all` | `markdown` |
| `--output` | `-o` | Output path (file, `path/` for directory, or base name) | stdout |
| `--token` | | GitHub token | Auto-resolved |
| `--concurrency` | | Max parallel fetches per plugin | `5` |
| `--exclude` | | Glob patterns for packages to skip | |
| `--include-dev` | | Include devDependencies | `true` |
| `--skip-cache` | | Bypass cached results | `false` |
| `--allowed-licenses` | | SPDX identifiers that are allowed | |
| `--denied-licenses` | | SPDX identifiers that are denied | |
| `--compatible-licenses` | | SPDX identifiers compatible with this project | |

### License Management

`dependency-digest` includes a `licenses` subcommand for interactive license policy management:

```bash
# Interactively review and configure license policies from your last scan
dependency-digest licenses
```

## Configuration File

Create a `dependency-digest.config.json` (or `dependency-digest.json` / `.dependency-digest.json`) in your project root:

```json
{
  "allowedLicenses": ["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause"],
  "deniedLicenses": ["GPL-3.0"],
  "compatibleLicenses": ["0BSD", "Unlicense"],
  "licenseOverrides": {
    "some-package": "MIT",
    "other-package@1.2.3": {
      "license": "Apache-2.0",
      "reason": "Dual-licensed, confirmed with maintainer"
    }
  },
  "plugins": ["@digests/plugin-js"],
  "exclude": ["@types/*"]
}
```

## Programmatic API

```typescript
import {
  scan,
  formatDigestAsMarkdown,
  formatDigestAsJson,
  formatDigestAsCycloneDX,
  formatDigestAsSpdx,
  loadConfig,
  isLicenseAllowed,
} from 'dependency-digest';

// Load a plugin
import pluginJs from '@digests/plugin-js';

// Scan the project
const digest = await scan({
  dir: process.cwd(),
  plugins: [pluginJs],
  token: process.env.GITHUB_TOKEN,
  concurrency: 5,
  excludePatterns: ['@types/*'],
  onProgress: (event) => {
    console.log(`[${event.phase}] ${event.current}/${event.total}`);
  },
});

// Format the results
const markdown = formatDigestAsMarkdown(digest, {});
const json = formatDigestAsJson(digest);
const cyclonedx = formatDigestAsCycloneDX(digest);
const spdx = formatDigestAsSpdx(digest);

// Check license compliance
const config = await loadConfig(process.cwd());
for (const manifest of digest.manifests) {
  for (const dep of manifest.dependencies) {
    if (!isLicenseAllowed(dep.license, config)) {
      console.warn(`${dep.name}: license "${dep.license}" is not allowed`);
    }
  }
}
```

## Output Formats

### Markdown

Human-readable tables with expandable details for each dependency. Includes version info, maintenance signals, vulnerabilities, and license status.

### JSON

Raw digest data for programmatic consumption. Contains all collected metrics in a structured format.

### CycloneDX 1.5

Industry-standard Software Bill of Materials format. Includes component inventory with package URLs (purls), integrity hashes, licenses, and vulnerability references. Compatible with tools like OWASP Dependency-Track.

### SPDX 2.3

Software Package Data Exchange format for license compliance analysis. Lists all packages with SPDX license identifiers, download locations, and checksums.

## Plugin System

`dependency-digest` uses a plugin architecture. Each plugin implements the `DependencyDigestPlugin` interface:

```typescript
import type { DependencyDigestPlugin } from 'dependency-digest';

const plugin: DependencyDigestPlugin = {
  name: 'my-ecosystem',
  ecosystem: 'my-ecosystem',

  async detect(dir: string) {
    // Discover manifest files (e.g., package.json, pom.xml)
    // Return: ManifestFile[]
  },

  async parseDependencies(manifest) {
    // Parse dependencies from a manifest
    // Return: ParseResult (dependencies + graph edges)
  },

  async fetchMetrics(dep, token) {
    // Fetch health metrics for a single dependency
    // Return: DependencyMetrics
  },
};
```

## Authentication

GitHub tokens are used for fetching repository metrics. Token is resolved in order:

1. `--token` CLI flag
2. `GH_TOKEN` environment variable
3. `GITHUB_TOKEN` environment variable
4. `gh auth token` (GitHub CLI)

## License

MIT
