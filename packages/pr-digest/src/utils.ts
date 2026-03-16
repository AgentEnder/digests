import { Octokit } from '@octokit/rest';
import { parseGitHubUrl } from '@digests/github-utils';
import type { PrDigestInput } from './types.js';

export { getGitHubToken, getGitRepoInfo, parseGitHubUrl } from '@digests/github-utils';
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

export function validateOptions(options: PrDigestInput): {
  valid: boolean;
  error?: string;
} {
  if (options.url) {
    const parsed = parseGitHubUrl(options.url);
    if (!parsed || !parsed.prNumber) {
      return {
        valid: false,
        error: `Invalid GitHub PR/issue URL: ${options.url}`,
      };
    }
  }

  return { valid: true };
}
