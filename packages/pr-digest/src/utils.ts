import { Octokit } from '@octokit/rest';
import type { PrDigestInput } from './types.js';

export { getGitHubToken, getGitRepoInfo } from '@digests/github-utils';
export type { GitRepoInfo } from '@digests/github-utils';

export async function getPRFromBranch(
  owner: string,
  repo: string,
  branch: string,
  token?: string
): Promise<number | undefined> {
  const octokit = new Octokit(token ? { auth: token } : undefined);

  try {
    const { data: pulls } = await octokit.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state: 'open',
      per_page: 1,
    });

    if (pulls.length > 0) {
      return pulls[0].number;
    }
    return undefined;
  } catch (error) {
    console.error(`Failed to find PR for branch ${branch}: ${error}`);
    return undefined;
  }
}

export function parseGitHubUrl(
  url: string
): { owner: string; repo: string; prNumber: number } | null {
  const patterns = [
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
    /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
        prNumber: parseInt(match[3], 10),
      };
    }
  }

  return null;
}

export function validateOptions(options: PrDigestInput): {
  valid: boolean;
  error?: string;
} {
  if (options.url) {
    const parsed = parseGitHubUrl(options.url);
    if (!parsed) {
      return {
        valid: false,
        error: `Invalid GitHub URL: ${options.url}`,
      };
    }
  }

  return { valid: true };
}
