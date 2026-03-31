---
title: Digests
description: Dependency health analysis toolkit
path: /docs
nav:
  section: Getting Started
  order: 0
---

# Digests

Digests is a toolkit for analyzing the health of your software dependencies. It scans your project's dependency manifests, fetches metrics from package registries and vulnerability databases, and generates comprehensive reports.

## Packages

| Package | Description |
|---------|------------|
| `dependency-digest` | Core CLI scanner for dependency health reports |
| `pr-digest` | GitHub PR digest generator |
| `@digests/plugin-js` | JavaScript/TypeScript ecosystem plugin |
| `@digests/plugin-rust` | Rust/Cargo ecosystem plugin |
| `@digests/plugin-dotnet` | .NET/NuGet ecosystem plugin |
| `@digests/plugin-java` | Java ecosystem plugin (Maven + Gradle) |

## Output Formats

- **Markdown** — Human-readable reports
- **JSON** — Programmatic consumption
- **HTML** — Interactive dashboard
- **CycloneDX** — Supply chain security (SBOM)
- **SPDX** — License compliance
