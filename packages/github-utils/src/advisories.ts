import { Octokit } from '@octokit/rest';

/** Security vulnerability record for a package. */
export interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  title: string;
  url: string | null;
  vulnerableRange: string;
  patchedVersion: string | null;
}

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
