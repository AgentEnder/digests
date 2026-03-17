import { Octokit } from '@octokit/rest';
import type { Vulnerability } from './advisories.js';
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
      octokit.request('GET /search/issues', {
        q: `repo:${owner}/${repo} type:pr state:open`,
        per_page: 1,
      }).catch(() => null),
    ]);

    return {
      lastCommitDate: repoData?.data.pushed_at ?? null,
      lastIssueOpened: latestIssuesOpen?.data[0]?.created_at ?? null,
      lastIssueClosed: latestIssuesClosed?.data[0]?.closed_at ?? null,
      lastPrOpened: latestPrsOpen?.data[0]?.created_at ?? null,
      lastPrClosed: latestPrsClosed?.data[0]?.created_at ?? null,
      openIssueCount: repoData?.data.open_issues_count ?? 0,
      openPrCount: openPrSearch?.data.total_count ?? 0,
      pinnedIssues: [],
      vulnerabilities: advisories,
    };
  } catch {
    return { ...EMPTY_METRICS, pinnedIssues: [], vulnerabilities: [] };
  }
}
