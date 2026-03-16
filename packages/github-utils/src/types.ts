export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface GitHubUrlRef extends GitHubRepoRef {
  prNumber?: number;
}

export interface GitRepoInfo {
  owner: string;
  repo: string;
  currentBranch: string;
}
