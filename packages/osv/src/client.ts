import { withCache } from '@digests/cache-utils';
import type { OsvQueryResponse, OsvVulnerability, OsvSeverity } from './types.js';

const OSV_API_URL = 'https://api.osv.dev/v1/query';

/** Security vulnerability record for a package. */
export interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  title: string;
  url: string | null;
  vulnerableRange: string;
  patchedVersion: string | null;
}

/**
 * Query OSV.dev for vulnerabilities affecting a specific package version.
 */
export async function fetchVulnerabilities(
  ecosystem: string,
  packageName: string,
  version: string
): Promise<Vulnerability[]> {
  return withCache('osv', `${ecosystem}:${packageName}@${version}`, () =>
    queryOsv(ecosystem, packageName, version)
  );
}

async function queryOsv(
  ecosystem: string,
  packageName: string,
  version: string
): Promise<Vulnerability[]> {
  try {
    const response = await fetch(OSV_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: packageName, ecosystem: mapEcosystem(ecosystem) },
        version,
      }),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as OsvQueryResponse;
    if (!data.vulns?.length) return [];

    return data.vulns
      .filter((v) => !v.withdrawn)
      .map((v) => mapVulnerability(v));
  } catch {
    return [];
  }
}

function mapVulnerability(vuln: OsvVulnerability): Vulnerability {
  const cveAlias = vuln.aliases?.find((a) => a.startsWith('CVE-'));
  const id = cveAlias ?? vuln.id;

  return {
    id,
    severity: extractSeverity(vuln),
    title: vuln.summary ?? vuln.id,
    url: `https://osv.dev/vulnerability/${vuln.id}`,
    vulnerableRange: extractVulnerableRange(vuln),
    patchedVersion: extractPatchedVersion(vuln),
  };
}

function extractSeverity(
  vuln: OsvVulnerability
): 'critical' | 'high' | 'moderate' | 'low' {
  const cvss = vuln.severity?.find(
    (s): s is OsvSeverity => s.type === 'CVSS_V3' || s.type === 'CVSS_V4'
  );

  if (cvss) {
    const score = parseCvssScore(cvss.score);
    if (score !== null) return cvssToSeverity(score);
  }

  // Fall back to database_specific severity (e.g., GitHub's severity field)
  const dbSeverity =
    vuln.database_specific?.['severity'] as string | undefined;
  if (dbSeverity) return mapSeverityString(dbSeverity);

  return 'moderate';
}

function parseCvssScore(vectorOrScore: string): number | null {
  // CVSS vectors end with score-bearing metrics; try parsing as number first
  const asNumber = parseFloat(vectorOrScore);
  if (!isNaN(asNumber)) return asNumber;

  // Extract base score from CVSS vector string (last numeric segment is not reliable)
  // Vectors don't contain the score directly — we'd need a full parser.
  // For now, return null to fall back to database_specific.
  return null;
}

function cvssToSeverity(
  score: number
): 'critical' | 'high' | 'moderate' | 'low' {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'moderate';
  return 'low';
}

function mapSeverityString(
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

function extractVulnerableRange(vuln: OsvVulnerability): string {
  const affected = vuln.affected?.[0];
  if (!affected?.ranges?.length) return 'unknown';

  const range = affected.ranges[0];
  const parts: string[] = [];

  for (const event of range.events) {
    if (event.introduced && event.introduced !== '0') {
      parts.push(`>=${event.introduced}`);
    }
    if (event.fixed) {
      parts.push(`<${event.fixed}`);
    }
    if (event.last_affected) {
      parts.push(`<=${event.last_affected}`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : 'unknown';
}

function extractPatchedVersion(vuln: OsvVulnerability): string | null {
  const affected = vuln.affected?.[0];
  if (!affected?.ranges?.length) return null;

  for (const range of affected.ranges) {
    for (const event of range.events) {
      if (event.fixed) return event.fixed;
    }
  }

  return null;
}

/** Map internal ecosystem names to OSV ecosystem identifiers. */
function mapEcosystem(ecosystem: string): string {
  switch (ecosystem) {
    case 'npm':
      return 'npm';
    case 'maven':
      return 'Maven';
    case 'nuget':
      return 'NuGet';
    case 'pypi':
      return 'PyPI';
    case 'cargo':
      return 'crates.io';
    default:
      return ecosystem;
  }
}
