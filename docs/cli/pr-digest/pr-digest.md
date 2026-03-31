---
title: "pr-digest"
description: "Generate a digest of a GitHub pull request"
nav:
  section: "CLI Reference"
  order: 1
---

# pr-digest

Generate a digest of a GitHub pull request

## Usage

```
pr-digest
```

## Options

### `--token`

GitHub token (defaults to GH_TOKEN, GITHUB_TOKEN, or gh auth token)
- **Type:** `string`

### `--output`

Output file path (defaults to stdout)
- **Type:** `string`

### `--ai-provider` (-aiProvider)

AI provider for log summarization (opencode or claude)
- **Type:** `string`
- **Default:** `"opencode"`

## Examples

- `pr-digest --url https://github.com/owner/repo/pull/123`
- `pr-digest (auto-detects from current repo)`
- `pr-digest --owner owner --repo repo --pr 123`
- `pr-digest --ai-provider claude --url https://github.com/owner/repo/pull/123`
