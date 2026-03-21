# HTML Viewer Design

## Overview

An interactive React dashboard that visualizes `DigestOutput` JSON data. Built as a standalone Vite app in `apps/html-viewer/`, compiled to a single self-contained HTML file, and shipped inside the `dependency-digest` package.

## Architecture

### Package Structure

- **`apps/html-viewer/`** — Vite + React + TypeScript app
- **`dependency-digest`** — Copies built template at build time, writes it at CLI runtime

### Build Flow

1. `apps/html-viewer/` builds via Vite → `dist/index.html` (all JS/CSS inlined via `vite-plugin-singlefile`)
2. `dependency-digest` build step copies `apps/html-viewer/dist/index.html` → `dist/html-template.html`
3. CLI `formatDigestAsHtml()` copies the template to the output location
4. React app fetches `./digest.json` on load (the CLI also writes the JSON file alongside)

### Data Flow

- No build-time data injection
- App boots → fetches relative `./digest.json` → parses as `DigestOutput` → renders
- User runs `--format html json` or `--output dir/` to get both files

## Dashboard Layout

### Summary Bar

A row of stat cards at the top:

- Total dependencies count
- Vulnerable dependencies (with severity breakdown)
- License breakdown (unique licenses)
- Dev vs Prod split

### Toolbar

- Global search input
- Quick filter toggles: "Vulnerable only", "Outdated only", "Dev only"
- Column visibility dropdown

### Table

Powered by `@tanstack/react-table` (headless):

- **Columns**: Package, Version, Latest, License, Dev, Transitive, Downloads/wk, CVEs, Ecosystem
- **Features**: Column sorting, global fuzzy search, column visibility toggle, per-column filters
- **Row expansion**: Click to show detail panel with description, repo link, version dates, activity metrics, includedBy chains, vulnerability list

## Styling

- CSS Modules for component scoping
- CSS custom properties (vars) for theming (colors, spacing, radii)
- Light theme default, dark mode via `prefers-color-scheme: dark`
- Responsive: table scrolls horizontally on narrow viewports

## Dependencies

- `react`, `react-dom`
- `@tanstack/react-table`
- `vite`, `@vitejs/plugin-react`, `vite-plugin-singlefile`

## CLI Integration

- `dependency-digest` gains no React dependency — only copies a pre-built HTML file
- `format-html.ts` reads the template from disk and writes it to the output path
- The JSON file is written by the existing `json` formatter
- When `--format html` is used, the CLI also writes the JSON automatically
