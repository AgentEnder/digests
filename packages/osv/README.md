# @digests/osv

Client for the [OSV.dev](https://osv.dev) vulnerability database. Queries for known CVEs and GitHub Security Advisories (GHSAs) affecting a specific package and version.

## Installation

```bash
npm install @digests/osv
```

## Usage

```typescript
import { fetchVulnerabilities } from '@digests/osv';

const vulns = await fetchVulnerabilities('npm', 'lodash', '4.17.20');

for (const vuln of vulns) {
  console.log(`${vuln.id} [${vuln.severity}]: ${vuln.title}`);
  console.log(`  Vulnerable: ${vuln.vulnerableRange}`);
  console.log(`  Patched: ${vuln.patchedVersion ?? 'No patch available'}`);
}
```

## API

### `fetchVulnerabilities(ecosystem, name, version): Promise<Vulnerability[]>`

Query OSV.dev for vulnerabilities affecting a package at a specific version.

**Parameters:**
- `ecosystem` — Package ecosystem (e.g., `"npm"`, `"PyPI"`, `"Go"`)
- `name` — Package name
- `version` — Resolved version string

**Returns** an array of `Vulnerability` objects:

```typescript
interface Vulnerability {
  id: string;                    // e.g., "GHSA-xxxx-xxxx-xxxx" or "CVE-2024-1234"
  severity: 'critical' | 'high' | 'moderate' | 'low';
  title: string;
  url: string | null;            // Link to advisory
  vulnerableRange: string;       // Affected version range
  patchedVersion: string | null; // Version that fixes the issue
}
```

Results are cached to disk to avoid redundant API calls on repeated scans.

## License

MIT
