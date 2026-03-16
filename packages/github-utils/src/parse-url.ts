import type { GitHubRepoRef } from './types.js';

export function parseGitHubUrl(url: string): GitHubRepoRef | null {
  const patterns = [
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/,
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/.*$/,
  ];

  const cleaned = url.replace(/^git\+/, '');

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }

  return null;
}
