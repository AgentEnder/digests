# 1.0.0 (2026-03-19)

### 🚀 Features

- initial impl ([175580c](https://github.com/agentender/digests/commit/175580c))
- **dependency-digest:** support multiple output formats and smart path resolution ([7de62e6](https://github.com/agentender/digests/commit/7de62e6))
- **dependency-digest:** add cyclonedx and spdx format options to CLI ([7147475](https://github.com/agentender/digests/commit/7147475))
- **dependency-digest:** add CycloneDX 1.5 and SPDX 2.3 SBOM serializers ([1230302](https://github.com/agentender/digests/commit/1230302))
- pipe dependency graph edges through to DigestOutput ([b55e638](https://github.com/agentender/digests/commit/b55e638))
- add purl and author to dependency metrics ([03be527](https://github.com/agentender/digests/commit/03be527))
- **dependency-digest:** use enquirer multiselect for interactive license review ([44f2e79](https://github.com/agentender/digests/commit/44f2e79))
- **dependency-digest:** add status column to licenses table (allowed/denied/new) ([32dae2d](https://github.com/agentender/digests/commit/32dae2d))
- **dependency-digest:** add licenses subcommand for policy management ([2860ff2](https://github.com/agentender/digests/commit/2860ff2))
- **dependency-digest:** add licenses subcommand for license policy management ([a5dcabe](https://github.com/agentender/digests/commit/a5dcabe))
- **dependency-digest:** add config file support with license policy enforcement ([6f478e6](https://github.com/agentender/digests/commit/6f478e6))
- add license, description, and specifier to dependency digest output ([76b6154](https://github.com/agentender/digests/commit/76b6154))
- render includedBy chains in dependency details ([73e48ac](https://github.com/agentender/digests/commit/73e48ac))
- **dependency-digest:** add includedBy field to ParsedDependency and DependencyMetrics ([c023239](https://github.com/agentender/digests/commit/c023239))
- ⚠️  **dependency-digest:** replace group-based deps with boolean dev/transitive flags ([68ba0c4](https://github.com/agentender/digests/commit/68ba0c4))
- ⚠️  replace @digests/plugin-npm with @digests/plugin-js ([78b7914](https://github.com/agentender/digests/commit/78b7914))
- add dependency-digest CLI ([572314a](https://github.com/agentender/digests/commit/572314a))
- add dependency-digest scanner and formatter ([b34395a](https://github.com/agentender/digests/commit/b34395a))
- add dependency-digest core types and plugin interface ([f5b4965](https://github.com/agentender/digests/commit/f5b4965))

### 🩹 Fixes

- **dependency-digest:** convert base64 integrity hashes to hex for SBOM formats ([664476b](https://github.com/agentender/digests/commit/664476b))
- **dependency-digest:** add bom-ref to CycloneDX components and root application component ([498cd2d](https://github.com/agentender/digests/commit/498cd2d))
- **dependency-digest:** allow .json extension for cyclonedx/spdx formats ([0d67c93](https://github.com/agentender/digests/commit/0d67c93))
- resolve lint errors in CycloneDX test ([c5c13e5](https://github.com/agentender/digests/commit/c5c13e5))
- **dependency-digest:** replace enquirer with @clack/prompts for interactive license review ([661c727](https://github.com/agentender/digests/commit/661c727))
- **dependency-digest:** always show details section for all dependencies ([26713a9](https://github.com/agentender/digests/commit/26713a9))

### ⚠️  Breaking Changes

- **dependency-digest:** replace group-based deps with boolean dev/transitive flags  ([68ba0c4](https://github.com/agentender/digests/commit/68ba0c4))
  ParsedDependency now uses version/specifier/dev/transitive
  instead of versionRange/group. DependencyMetrics uses version instead of
  currentVersion. ManifestDigest uses flat dependencies array instead of groups.
- replace @digests/plugin-npm with @digests/plugin-js  ([78b7914](https://github.com/agentender/digests/commit/78b7914))
  @digests/plugin-npm has been replaced by @digests/plugin-js.
  The new plugin supports lockfile-based version resolution for npm, yarn, pnpm, and bun.
  Default plugin in dependency-digest CLI updated to @digests/plugin-js.

### 🧱 Updated Dependencies

- Updated @digests/github-utils to 1.0.0
- Updated @digests/cache-utils to 1.0.0

### ❤️ Thank You

- Craigory Coppola @AgentEnder