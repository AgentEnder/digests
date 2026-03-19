# pr-digest

Generate a comprehensive digest of a GitHub pull request — including the full timeline, review comments, CI status, and file changes — formatted as Markdown. Designed for handing off PR context to AI agents or for human review.

## Installation

```bash
npm install -g pr-digest
```

## CLI Usage

```bash
# Auto-detect PR from current git branch
pr-digest

# Specify a PR by URL
pr-digest --url https://github.com/owner/repo/pull/123

# Specify owner/repo/pr explicitly
pr-digest --owner owner --repo repo --pr 123

# Write output to a file
pr-digest --url https://github.com/owner/repo/pull/123 --output digest.md

# Use Claude as the AI provider for log summarization
pr-digest --ai-provider claude --url https://github.com/owner/repo/pull/123
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--url` | GitHub PR URL | Auto-detect from branch |
| `--owner` | Repository owner | From git remote |
| `--repo` | Repository name | From git remote |
| `--pr` | PR number | From current branch |
| `--token` | GitHub token | Auto-resolved |
| `--output` | Output file path | stdout |
| `--ai-provider` | AI provider for log summarization (`opencode` or `claude`) | `opencode` |

### Auto-Detection

When run without arguments inside a git repository, `pr-digest` will:

1. Read the GitHub remote from git config
2. Detect the current branch
3. Find the open PR associated with that branch
4. Generate the digest

You can still override individual values — `--owner` and `--repo` override the detected repository, `--pr` overrides the detected PR number.

## Digest Contents

The generated Markdown includes:

- **PR metadata** — title, number, author, branch info, status, labels
- **Description** — the full PR body
- **Review summary** — approval statistics and review states
- **Timeline** — full conversation history in chronological order:
  - Review comments with approval/changes-requested/commented states
  - General comments with threaded replies
  - File-specific comments grouped by file with line numbers
  - CI links (Nx Cloud and other CI providers detected and highlighted)
- **Check runs** — CI status with links to logs
- **AI agent instructions** — context-aware guidelines based on timeline analysis, optimized for AI handoff workflows

## Programmatic API

```typescript
import { fetchPrData, formatDigest } from 'pr-digest';

const { pr, timeline, checkRuns } = await fetchPrData(
  'owner',
  'repo',
  123,
  process.env.GITHUB_TOKEN,
  'opencode'
);

const markdown = formatDigest(pr, timeline, checkRuns);
console.log(markdown);
```

### Exports

| Export | Description |
|--------|-------------|
| `fetchPrData(owner, repo, pr, token, aiProvider)` | Fetch PR data and timeline from GitHub |
| `formatDigest(pr, timeline, checkRuns)` | Format fetched data as Markdown |
| `getGitHubToken(token?)` | Resolve GitHub token from args/env/CLI |
| `parseGitHubUrl(url)` | Parse a GitHub PR/issue URL |
| `validateOptions(options)` | Validate CLI input options |

### Types

```typescript
import type {
  PrDigestInput,
  PrDigestOptions,
  PrInfo,
  TimelineEvent,
} from 'pr-digest';
```

## Authentication

GitHub tokens are used for API access. Token is resolved in order:

1. `--token` CLI flag
2. `GH_TOKEN` environment variable
3. `GITHUB_TOKEN` environment variable
4. `gh auth token` (GitHub CLI)

## License

MIT
