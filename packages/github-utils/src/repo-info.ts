import { execSync } from 'child_process';
import type { GitRepoInfo } from './types.js';

export function getGitRepoInfo(): GitRepoInfo | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe'],
    }).trim();

    const patterns = [
      /git@github\.com:([^/]+)\/([^/]+)\.git$/,
      /github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/,
    ];

    for (const pattern of patterns) {
      const match = remoteUrl.match(pattern);
      if (match) {
        const owner = match[1];
        const repo = match[2];
        const currentBranch = execSync('git branch --show-current', {
          encoding: 'utf8',
          stdio: ['inherit', 'pipe'],
        }).trim();
        return { owner, repo, currentBranch };
      }
    }

    return null;
  } catch {
    return null;
  }
}
