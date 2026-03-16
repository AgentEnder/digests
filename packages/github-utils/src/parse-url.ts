import type { GitHubUrlRef } from './types.js';

export function parseGitHubUrl(url: string): GitHubUrlRef | null {
  const cleaned = url.replace(/^git\+/, '');

  // Try PR/issue URL first (more specific)
  const prPattern =
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/(?:pull|issues)\/(\d+)/;
  const prMatch = cleaned.match(prPattern);
  if (prMatch) {
    return {
      owner: prMatch[1],
      repo: prMatch[2],
      prNumber: parseInt(prMatch[3], 10),
    };
  }

  // Plain repo URL patterns
  const repoPatterns = [
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/,
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/.*$/,
  ];

  for (const pattern of repoPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }

  return null;
}
