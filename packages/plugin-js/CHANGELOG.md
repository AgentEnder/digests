# 1.0.0 (2026-03-19)

### 🚀 Features

- initial impl ([175580c](https://github.com/agentender/digests/commit/175580c))
- **dependency-digest:** add CycloneDX 1.5 and SPDX 2.3 SBOM serializers ([1230302](https://github.com/agentender/digests/commit/1230302))
- pipe dependency graph edges through to DigestOutput ([b55e638](https://github.com/agentender/digests/commit/b55e638))
- add purl and author to dependency metrics ([03be527](https://github.com/agentender/digests/commit/03be527))
- add license, description, and specifier to dependency digest output ([76b6154](https://github.com/agentender/digests/commit/76b6154))
- render includedBy chains in dependency details ([73e48ac](https://github.com/agentender/digests/commit/73e48ac))
- **plugin-js:** rewrite parser with graph-based dev reachability and includedBy chains ([fb4cf12](https://github.com/agentender/digests/commit/fb4cf12))
- **plugin-js:** extract dependency edges and rootDeps from all lockfile parsers ([0c8fc9c](https://github.com/agentender/digests/commit/0c8fc9c))
- **plugin-js:** add LockfileParseResult type with edges and rootDeps ([a67c21b](https://github.com/agentender/digests/commit/a67c21b))
- add on-disk caching for GitHub and npm API responses ([b031599](https://github.com/agentender/digests/commit/b031599))
- **plugin-js:** emit transitive deps with boolean dev/transitive flags ([d525d3b](https://github.com/agentender/digests/commit/d525d3b))
- **plugin-js:** support multi-version + transitive deps in lockfile parsers ([f3019e9](https://github.com/agentender/digests/commit/f3019e9))
- **plugin-js:** wire up registry, metrics, and plugin export ([3456f2f](https://github.com/agentender/digests/commit/3456f2f))
- **plugin-js:** add manifest parser with lockfile version resolution ([e28e7d2](https://github.com/agentender/digests/commit/e28e7d2))
- **plugin-js:** add lockfile dispatcher with fallback warning ([8b106f6](https://github.com/agentender/digests/commit/8b106f6))
- **plugin-js:** add lockfile parsers for npm, yarn, pnpm, and bun ([fef1819](https://github.com/agentender/digests/commit/fef1819))
- **plugin-js:** add lockfile detection with priority ordering ([44e187e](https://github.com/agentender/digests/commit/44e187e))
- **plugin-js:** create @digests/plugin-js package scaffold ([e5db1b5](https://github.com/agentender/digests/commit/e5db1b5))

### 🩹 Fixes

- don't cache failed API responses, clear stale cache ([4db125e](https://github.com/agentender/digests/commit/4db125e))
- **plugin-js:** strip peer info from pnpm snapshot dependency versions ([c7828b9](https://github.com/agentender/digests/commit/c7828b9))
- resolve lint error and include missing pnpm parser update ([c96db4b](https://github.com/agentender/digests/commit/c96db4b))
- **plugin-js:** filter vulnerabilities by installed version using semver range matching ([cab4fa2](https://github.com/agentender/digests/commit/cab4fa2))
- **plugin-js:** resolve eslint errors in test files ([d69dd5d](https://github.com/agentender/digests/commit/d69dd5d))

### 🧱 Updated Dependencies

- Updated dependency-digest to 1.0.0
- Updated @digests/github-utils to 1.0.0
- Updated @digests/osv to 1.0.0

### ❤️ Thank You

- Craigory Coppola @AgentEnder