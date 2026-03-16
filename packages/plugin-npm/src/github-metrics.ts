import { Octokit } from '@octokit/rest';
import { parseGitHubUrl } from '@digests/github-utils';
import type { Vulnerability } from 'dependency-digest';

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

export async function fetchGitHubMetrics(
  repoUrl: string | null,
  packageName: string,
  token?: string
): Promise<GitHubRepoMetrics> {
  if (!repoUrl) return EMPTY_METRICS;

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) return EMPTY_METRICS;

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
    ] = await Promise.all([
      octokit.rest.repos.get({ owner, repo }).catch(() => null),
      octokit.rest.issues
        .listForRepo({
          owner,
          repo,
          state: 'open',
          sort: 'created',
          direction: 'desc',
          per_page: 1,
        })
        .catch(() => null),
      octokit.rest.issues
        .listForRepo({
          owner,
          repo,
          state: 'closed',
          sort: 'updated',
          direction: 'desc',
          per_page: 1,
        })
        .catch(() => null),
      octokit.rest.pulls
        .list({
          owner,
          repo,
          state: 'open',
          sort: 'created',
          direction: 'desc',
          per_page: 1,
        })
        .catch(() => null),
      octokit.rest.pulls
        .list({
          owner,
          repo,
          state: 'closed',
          sort: 'updated',
          direction: 'desc',
          per_page: 1,
        })
        .catch(() => null),
      fetchAdvisories(octokit, packageName),
    ]);

    return {
      lastCommitDate: repoData?.data.pushed_at ?? null,
      lastIssueOpened:
        latestIssuesOpen?.data[0]?.created_at ?? null,
      lastIssueClosed:
        latestIssuesClosed?.data[0]?.closed_at ?? null,
      lastPrOpened: latestPrsOpen?.data[0]?.created_at ?? null,
      lastPrClosed: latestPrsClosed?.data[0]?.closed_at ?? null,
      openIssueCount: repoData?.data.open_issues_count ?? 0,
      openPrCount: latestPrsOpen?.data.length ?? 0,
      pinnedIssues: [],
      vulnerabilities: advisories,
    };
  } catch {
    return EMPTY_METRICS;
  }
}

async function fetchAdvisories(
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
