import { Octokit } from "@octokit/rest";
import { withCache } from "@digests/cache-utils";
import { parseGitHubUrl } from "./parse-url.js";
import { checkResponseForRateLimit, isRateLimited } from "./rate-limit.js";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export interface GitHubRepoMetrics {
  lastCommitDate: string | null;
  lastIssueOpened: string | null;
  lastPrOpened: string | null;
  openIssueCount: number;
  openPrCount: number;
  pinnedIssues: string[];
}

const EMPTY_METRICS: GitHubRepoMetrics = {
  lastCommitDate: null,
  lastIssueOpened: null,
  lastPrOpened: null,
  openIssueCount: 0,
  openPrCount: 0,
  pinnedIssues: [],
};
Object.freeze(EMPTY_METRICS);

interface RepoMetricsData {
  lastCommitDate: string | null;
  lastIssueOpened: string | null;
  lastPrOpened: string | null;
  openIssueCount: number;
  openPrCount: number;
}

function rateLimitCatch(category: string) {
  return (error: unknown) => {
    checkResponseForRateLimit(error, category);
    return null;
  };
}

async function fetchRepoMetrics(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<RepoMetricsData> {
  const oldWarn = octokit.log.warn;
  octokit.log.warn = (...args) =>
    args.some(
      (arg) =>
        typeof arg === "string" &&
        arg?.includes("octokit.rest.search.issuesAndPullRequests") &&
        arg?.includes("deprecated"),
    )
      ? null
      : oldWarn.apply(octokit.log, args);
  const [repoData, latestIssuesOpen, latestPrsOpen, openPrSearch] =
    await Promise.all([
      isRateLimited("core")
        ? null
        : octokit.rest.repos.get({ owner, repo }).catch(rateLimitCatch("core")),
      isRateLimited("core")
        ? null
        : octokit.rest.issues
            .listForRepo({
              owner,
              repo,
              state: "open",
              sort: "created",
              direction: "desc",
              per_page: 1,
            })
            .catch(rateLimitCatch("core")),
      isRateLimited("core")
        ? null
        : octokit.rest.pulls
            .list({
              owner,
              repo,
              state: "open",
              sort: "created",
              direction: "desc",
              per_page: 1,
            })
            .catch(rateLimitCatch("core")),
      isRateLimited("search")
        ? null
        : octokit.rest.search
            .issuesAndPullRequests({
              q: `repo:${owner}/${repo} type:pr state:open`,
              per_page: 1,
            })
            .catch(rateLimitCatch("search")),
    ]);

  return {
    lastCommitDate: repoData?.data.pushed_at ?? null,
    lastIssueOpened: latestIssuesOpen?.data[0]?.created_at ?? null,
    lastPrOpened: latestPrsOpen?.data[0]?.created_at ?? null,
    openIssueCount: repoData?.data.open_issues_count ?? 0,
    openPrCount: openPrSearch?.data.total_count ?? 0,
  };
}

export async function fetchGitHubMetrics(
  repoUrl: string | null,
  token?: string,
): Promise<GitHubRepoMetrics> {
  if (!repoUrl)
    return { ...EMPTY_METRICS, pinnedIssues: [] };

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed)
    return { ...EMPTY_METRICS, pinnedIssues: [] };

  const { owner, repo } = parsed;
  const octokit = new Octokit({
    ...(token ? { auth: token } : {}),
    log: {
      debug: noop,
      info: noop,
      warn: console.warn,
      error: noop,
    },
  });

  try {
    const repoMetrics = isRateLimited("core")
      ? ({
          lastCommitDate: null,
          lastIssueOpened: null,
          lastPrOpened: null,
          openIssueCount: 0,
          openPrCount: 0,
        } as RepoMetricsData)
      : await withCache<RepoMetricsData>(
          "github-repo",
          `${owner}/${repo}`,
          () => fetchRepoMetrics(octokit, owner, repo),
          { shouldCache: (r) => r.lastCommitDate !== null },
        );

    return {
      ...repoMetrics,
      pinnedIssues: [],
    };
  } catch {
    return { ...EMPTY_METRICS, pinnedIssues: [] };
  }
}
