---
title: dependency-digest
description: Scan repository dependencies and generate a health digest
nav:
  section: CLI Reference
  order: 0

---
# dependency-digest

Scan repository dependencies and generate a health digest

## Usage

```
dependency-digest
```

## Options

### `--dir` (`-d`)

Directory to scan (default: cwd)

**Type:** `string`

### `--plugins` (`-p`, `-plugin`)

Plugin package names to use (default: auto-detect installed)

**Type:** `string[]`

### `--format` (`-f`, `-formats`)

Output formats: markdown, html, json, cyclonedx, spdx, or all

**Type:** `string[]`

### `--output` (`-o`)

Output path. File path for single format, path/ for directory, or base name for multiple formats

**Type:** `string`

### `--token`

GitHub token (fallback: GH_TOKEN, GITHUB_TOKEN, gh auth token)

**Type:** `string`

### `--concurrency`

Max parallel fetches per plugin

**Type:** `number`

**Default:** `5`

### `--exclude`

Glob patterns for packages to skip (e.g. @types/*)

**Type:** `string[]`

### `--includeDev` (`-include-dev`)

Include devDependencies

**Type:** `boolean`

**Default:** `true`

### `--skipCache` (`-skip-cache`)

Bypass cached results and fetch fresh data

**Type:** `boolean`

**Default:** `false`

### `--allowedLicenses` (`-allowed-licenses`)

SPDX license identifiers that are allowed

**Type:** `string[]`

### `--deniedLicenses` (`-denied-licenses`)

SPDX license identifiers that are denied

**Type:** `string[]`

### `--compatibleLicenses` (`-compatible-licenses`)

SPDX license identifiers compatible with this project

**Type:** `string[]`

### `--licenseOverrides` (`-license-overrides`)

Specify overrides for specific package ids to set their license

**Type:** `object`

## Subcommands

- [`licenses`](./licenses.md) — View and manage license policies