# @digests/github-utils

Shared GitHub API utilities for the [digests](https://github.com/AgentEnder/digests) ecosystem. Handles token resolution, URL parsing, repository metrics, and rate limit management.

## Installation

```bash
npm install @digests/github-utils
```

## API

### `getGitHubToken(explicit?): Promise<string>`

Resolve a GitHub token from multiple sources, in order:

1. Explicitly passed value
2. `GH_TOKEN` environment variable
3. `GITHUB_TOKEN` environment variable
4. `gh auth token` (GitHub CLI)

```typescript
import { getGitHubToken } from '@digests/github-utils';

const token = await getGitHubToken();
```

### `parseGitHubUrl(url): GitHubUrlRef | null`

Parse a GitHub URL into its components. Supports repository, pull request, and issue URLs.

```typescript
import { parseGitHubUrl } from '@digests/github-utils';

const ref = parseGitHubUrl('https://github.com/owner/repo/pull/123');
// { owner: 'owner', repo: 'repo', prNumber: 123 }
```

### `getGitRepoInfo(): GitRepoInfo | null`

Read the current git repository's remote URL and branch from `.git/config`.

```typescript
import { getGitRepoInfo } from '@digests/github-utils';

const info = getGitRepoInfo();
// { owner: 'owner', repo: 'repo', currentBranch: 'main' }
```

### `fetchGitHubMetrics(owner, repo, token): Promise<GitHubRepoMetrics>`

Fetch repository health metrics: last commit date, open issue/PR counts, and recent activity.

```typescript
import { fetchGitHubMetrics } from '@digests/github-utils';

const metrics = await fetchGitHubMetrics('owner', 'repo', token);
```

### Rate Limiting

```typescript
import { isRateLimited, markRateLimited, resetRateLimitState } from '@digests/github-utils';

if (isRateLimited()) {
  // Skip GitHub API calls
}
```

### Caching (re-exported from `@digests/cache-utils`)

```typescript
import { withCache, getCached, setCache } from '@digests/github-utils';
```

## Types

```typescript
import type {
  GitHubRepoRef,
  GitHubUrlRef,
  GitRepoInfo,
  GitHubRepoMetrics,
} from '@digests/github-utils';
```

## License

MIT
