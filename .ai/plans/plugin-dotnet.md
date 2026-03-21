# Implementation Plan: @digests/plugin-dotnet

## Overview

Build a `@digests/plugin-dotnet` package that implements the `DependencyDigestPlugin` interface to scan .NET projects for NuGet dependencies (including transitive). Uses a C# analyzer DLL with MSBuild APIs (`ProjectGraph`) and NuGet's `LockFileFormat` to read resolved dependency data from `project.assets.json`, bridged to TypeScript via `dotnet exec` + JSON stdout.

---

## Task 1: Scaffold the package structure

**Files to create:**

### `packages/plugin-dotnet/package.json`
```json
{
  "name": "@digests/plugin-dotnet",
  "version": "0.1.0",
  "description": ".NET/NuGet ecosystem plugin for dependency-digest",
  "author": {
    "name": "Craigory Coppola",
    "url": "https://craigory.dev"
  },
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "publishConfig": {
    "access": "public"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {},
  "dependencies": {
    "@digests/github-utils": "workspace:*",
    "@digests/osv": "workspace:*",
    "dependency-digest": "workspace:*",
    "semver": "^7.7.4",
    "tslib": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@types/semver": "^7.7.1",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/AgentEnder/digests.git",
    "directory": "packages/plugin-dotnet"
  },
  "bugs": {
    "url": "https://github.com/AgentEnder/digests/issues"
  }
}
```

### `packages/plugin-dotnet/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./tsconfig.lib.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

### `packages/plugin-dotnet/tsconfig.lib.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "tsBuildInfoFile": "../../dist/plugin-dotnet.lib.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"],
  "references": [
    { "path": "../dependency-digest/tsconfig.lib.json" },
    { "path": "../osv/tsconfig.lib.json" },
    { "path": "../github-utils/tsconfig.lib.json" }
  ]
}
```

### `packages/plugin-dotnet/tsconfig.spec.json`
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist-spec",
    "tsBuildInfoFile": "../../dist/plugin-dotnet.spec.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": []
}
```

### `packages/plugin-dotnet/vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

### `packages/plugin-dotnet/project.json`
```json
{
  "name": "@digests/plugin-dotnet",
  "targets": {
    "build-analyzer": {
      "executor": "nx:run-commands",
      "options": {
        "command": "dotnet publish -c Release -o ../../dist/plugin-dotnet/analyzer",
        "cwd": "packages/plugin-dotnet/analyzer"
      },
      "cache": true,
      "inputs": ["{projectRoot}/analyzer/**/*.cs", "{projectRoot}/analyzer/**/*.csproj"],
      "outputs": ["{projectRoot}/dist/analyzer"]
    },
    "build": {
      "dependsOn": ["^build", "build-analyzer"],
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "tsc --build tsconfig.json"
        ],
        "cwd": "packages/plugin-dotnet",
        "parallel": false
      },
      "cache": true,
      "inputs": ["default", "^default"],
      "outputs": ["{projectRoot}/dist"]
    }
  }
}
```

**Verification:** Run `pnpm install` to link the new package, then `npx nx show project @digests/plugin-dotnet` to confirm Nx sees it.

---

## Task 2: Build the C# Analyzer DLL

Create the C# project at `packages/plugin-dotnet/analyzer/`.

### `packages/plugin-dotnet/analyzer/DotnetAnalyzer.csproj`
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <RootNamespace>DotnetAnalyzer</RootNamespace>
    <AssemblyName>DotnetAnalyzer</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Build" Version="17.0.0" ExcludeAssets="runtime" />
    <PackageReference Include="Microsoft.Build.Framework" Version="17.0.0" ExcludeAssets="runtime" />
    <PackageReference Include="Microsoft.Build.Locator" Version="1.8.1" />
    <PackageReference Include="NuGet.ProjectModel" Version="6.12.2" />
  </ItemGroup>
</Project>
```

Key dependencies:
- `Microsoft.Build` + `Microsoft.Build.Framework` — `ProjectGraph`, `ProjectInstance`, `GetItems("PackageReference")`
- `Microsoft.Build.Locator` — Registers the correct SDK at runtime
- `NuGet.ProjectModel` — `LockFileFormat.Read()` to parse `project.assets.json` for transitive deps

### `packages/plugin-dotnet/analyzer/Program.cs`

Entry point that:
1. Reads workspace root from args[0]
2. Reads newline-separated project file paths from stdin
3. Registers MSBuild via `MSBuildLocator`
4. Calls `Analyzer.Analyze()` with the project files
5. Serializes result as JSON to stdout

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Build.Locator;
using DotnetAnalyzer;

// Parse args
if (args.Length < 1)
{
    Console.Error.WriteLine("Usage: DotnetAnalyzer <workspaceRoot>");
    Environment.Exit(1);
}

var workspaceRoot = args[0];

// Read project files from stdin
var projectFiles = new List<string>();
string? line;
while ((line = Console.ReadLine()) != null)
{
    var trimmed = line.Trim();
    if (!string.IsNullOrEmpty(trimmed))
        projectFiles.Add(Path.GetFullPath(Path.Combine(workspaceRoot, trimmed)));
}

if (projectFiles.Count == 0)
{
    Console.Error.WriteLine("No project files provided on stdin");
    Environment.Exit(1);
}

// Register MSBuild
var instances = MSBuildLocator.QueryVisualStudioInstances().ToList();
if (instances.Count == 0)
{
    Console.Error.WriteLine("No .NET SDK found. Please install the .NET SDK.");
    Environment.Exit(1);
}
MSBuildLocator.RegisterInstance(instances.OrderByDescending(i => i.Version).First());

// Run analysis
var result = Analyzer.Analyze(workspaceRoot, projectFiles);

// Output JSON
var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false
};
Console.WriteLine(JsonSerializer.Serialize(result, options));
```

### `packages/plugin-dotnet/analyzer/Analyzer.cs`

Core analysis logic:

1. **Build a `ProjectGraph`** from the provided project files — this discovers all project-to-project references and handles multi-targeting
2. **For each project node**, locate `project.assets.json` at `{projectDir}/obj/project.assets.json`
3. **If missing, run MSBuild restore** via `BuildManager` on that project. If restore fails, report error and skip.
4. **Read `project.assets.json`** via `NuGet.ProjectModel.LockFileFormat.Read()`
5. **Extract from LockFile:**
   - `Libraries` — all resolved packages (name, version, sha512 hash, type)
   - `Targets[framework].Libraries` — per-framework resolved deps with their `Dependencies` list
   - `ProjectFileDependencyGroups` — which deps are direct (listed here) vs transitive
   - `PackageSpec.RestoreMetadata.Sources` — configured NuGet package source URLs
6. **Build output model:** For each unique package across all projects:
   - `name`, `version`, `sha512` (from Libraries)
   - `dev`: false (NuGet doesn't have a dev concept like npm; test project deps could be flagged but that's a stretch)
   - `transitive`: true if not in `ProjectFileDependencyGroups` for any project
   - `includedBy`: dependency chains computed by walking `LockFileTargetLibrary.Dependencies`
   - `edges`: adjacency list from each package to its dependencies
   - `packageSources`: array of configured NuGet source URLs

**Output model (JSON):**
```json
{
  "packages": [
    {
      "name": "Newtonsoft.Json",
      "version": "13.0.3",
      "sha512": "abc123...",
      "direct": true,
      "framework": "net8.0",
      "dependencies": ["System.Runtime.Serialization.Primitives@4.3.0"]
    }
  ],
  "edges": {
    "Newtonsoft.Json@13.0.3": ["System.Runtime.Serialization.Primitives@4.3.0"]
  },
  "packageSources": ["https://api.nuget.org/v3/index.json"],
  "errors": []
}
```

### `packages/plugin-dotnet/analyzer/Models/AnalysisResult.cs`
```csharp
public class AnalysisResult
{
    public List<ResolvedPackage> Packages { get; set; } = new();
    public Dictionary<string, List<string>> Edges { get; set; } = new();
    public List<string> PackageSources { get; set; } = new();
    public List<string> Errors { get; set; } = new();
}
```

### `packages/plugin-dotnet/analyzer/Models/ResolvedPackage.cs`
```csharp
public class ResolvedPackage
{
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string? Sha512 { get; set; }
    public bool Direct { get; set; }
    public string? Framework { get; set; }
    public List<string> Dependencies { get; set; } = new();
}
```

**Verification:** Run `dotnet build packages/plugin-dotnet/analyzer/DotnetAnalyzer.csproj` to confirm it compiles. Then test manually:
```bash
echo "path/to/some.csproj" | dotnet run --project packages/plugin-dotnet/analyzer -- /path/to/workspace
```

---

## Task 3: TypeScript bridge — `analyzer-client.ts`

Create `packages/plugin-dotnet/src/analyzer-client.ts` that invokes the DLL and parses its output.

```typescript
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AnalyzerOutput {
  packages: Array<{
    name: string;
    version: string;
    sha512: string | null;
    direct: boolean;
    framework: string | null;
    dependencies: string[];
  }>;
  edges: Record<string, string[]>;
  packageSources: string[];
  errors: string[];
}

export function runAnalyzer(
  workspaceRoot: string,
  projectFiles: string[]
): AnalyzerOutput {
  const dllPath = join(__dirname, 'analyzer', 'DotnetAnalyzer.dll');

  const result = spawnSync('dotnet', [dllPath, workspaceRoot], {
    input: projectFiles.join('\n'),
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    cwd: workspaceRoot,
  });

  if (result.status !== 0) {
    throw new Error(
      `DotnetAnalyzer failed (exit ${result.status}): ${result.stderr}`
    );
  }

  return JSON.parse(result.stdout) as AnalyzerOutput;
}
```

**Key details:**
- DLL path is relative to the compiled JS (`dist/analyzer/DotnetAnalyzer.dll`)
- Project files sent via stdin (avoids ARG_MAX limits for large solutions)
- 50MB buffer for large dependency graphs
- Synchronous spawn (consistent with @nx/dotnet's pattern — analysis is a blocking prerequisite)

**Verification:** Write a small test that mocks `spawnSync` and verifies the JSON parsing.

---

## Task 4: Detect — `detect.ts`

Create `packages/plugin-dotnet/src/detect.ts`. Finds `.csproj`, `.fsproj`, `.vbproj`, and `.sln` files.

```typescript
import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import type { ManifestFile } from 'dependency-digest';

const PROJECT_EXTENSIONS = new Set(['.csproj', '.fsproj', '.vbproj']);
const SOLUTION_EXTENSION = '.sln';

export async function detectManifests(dir: string): Promise<ManifestFile[]> {
  try {
    const manifests: ManifestFile[] = [];
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      // Skip files in node_modules, bin, obj directories
      const fullPath = join(entry.parentPath ?? entry.path, entry.name);
      if (/[/\\](node_modules|bin|obj)[/\\]/.test(fullPath)) continue;

      const ext = extname(entry.name).toLowerCase();

      if (PROJECT_EXTENSIONS.has(ext)) {
        manifests.push({ path: fullPath, type: ext.slice(1) }); // "csproj", "fsproj", "vbproj"
      } else if (ext === SOLUTION_EXTENSION) {
        manifests.push({ path: fullPath, type: 'sln' });
      }
    }

    // If we found .sln files, prefer those as entry points (they encompass projects)
    const slnFiles = manifests.filter((m) => m.type === 'sln');
    if (slnFiles.length > 0) return slnFiles;

    return manifests;
  } catch {
    return [];
  }
}
```

**Key behavior:**
- Recursively scans for project and solution files
- Skips `node_modules`, `bin`, `obj` directories
- If `.sln` files found, returns only those (they reference all projects)
- Falls back to individual project files if no `.sln` exists

**Verification:** Write `detect.spec.ts` with tests for:
- Finding .csproj files
- Finding .sln and preferring it over .csproj
- Skipping bin/obj directories
- Empty directory returns []
- Filesystem error returns []

---

## Task 5: Parser — `parser.ts`

Create `packages/plugin-dotnet/src/parser.ts` that transforms analyzer output into `ParseResult`.

```typescript
import type { ParsedDependency, ParseResult, ManifestFile } from 'dependency-digest';
import { runAnalyzer, type AnalyzerOutput } from './analyzer-client.js';
import { dirname } from 'path';

const MAX_CHAIN_DEPTH = 10;

// Store package sources for metrics to use later
let cachedPackageSources: string[] = [];

export function getPackageSources(): string[] {
  return cachedPackageSources;
}

function pkgKey(name: string, version: string): string {
  return `${name}@${version}`;
}

function computeIncludedByChains(
  pkg: AnalyzerOutput['packages'][number],
  edges: Record<string, string[]>,
  allPackages: Map<string, AnalyzerOutput['packages'][number]>
): string[][] {
  // BFS backward: find all packages whose edges include this one
  const key = pkgKey(pkg.name, pkg.version);
  const chains: string[][] = [];

  // Build reverse adjacency
  const reverseEdges = new Map<string, string[]>();
  for (const [from, tos] of Object.entries(edges)) {
    for (const to of tos) {
      const existing = reverseEdges.get(to) ?? [];
      existing.push(from);
      reverseEdges.set(to, existing);
    }
  }

  // BFS from this package upward
  const queue: Array<{ key: string; chain: string[] }> = [{ key, chain: [] }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.key)) continue;
    visited.add(item.key);

    const parents = reverseEdges.get(item.key) ?? [];
    for (const parent of parents) {
      const parentPkg = allPackages.get(parent);
      if (!parentPkg) continue;

      const newChain = [parent, ...item.chain];
      if (parentPkg.direct) {
        chains.push(newChain);
      } else if (newChain.length < MAX_CHAIN_DEPTH) {
        queue.push({ key: parent, chain: newChain });
      }
    }
  }

  return chains;
}

export function parseAnalyzerOutput(output: AnalyzerOutput): ParseResult {
  cachedPackageSources = output.packageSources;

  const allPackages = new Map<string, AnalyzerOutput['packages'][number]>();
  for (const pkg of output.packages) {
    allPackages.set(pkgKey(pkg.name, pkg.version), pkg);
  }

  const deps: ParsedDependency[] = [];
  const seen = new Set<string>();

  for (const pkg of output.packages) {
    const key = pkgKey(pkg.name, pkg.version);
    if (seen.has(key)) continue;
    seen.add(key);

    const isTransitive = !pkg.direct;

    const dep: ParsedDependency = {
      name: pkg.name,
      version: pkg.version,
      dev: false, // NuGet doesn't distinguish dev deps at package level
      transitive: isTransitive,
      integrity: pkg.sha512 ? `sha512-${pkg.sha512}` : undefined,
    };

    if (isTransitive) {
      const chains = computeIncludedByChains(pkg, output.edges, allPackages);
      if (chains.length > 0) dep.includedBy = chains;
    }

    deps.push(dep);
  }

  return { dependencies: deps, edges: output.edges };
}

export async function parseDotnetDependencies(
  manifest: ManifestFile
): Promise<ParseResult> {
  const workspaceRoot = manifest.type === 'sln'
    ? dirname(manifest.path)
    : dirname(manifest.path); // For individual csproj, workspace root = project dir

  const projectFiles = [manifest.path];
  const output = runAnalyzer(workspaceRoot, projectFiles);

  if (output.errors.length > 0) {
    console.error(`DotnetAnalyzer warnings:\n${output.errors.join('\n')}`);
  }

  return parseAnalyzerOutput(output);
}
```

**Verification:** Write `parser.spec.ts` with tests covering:
- Direct dependencies parsed correctly
- Transitive dependencies flagged
- Edges built correctly
- includedBy chains computed for transitive deps
- sha512 integrity formatted with `sha512-` prefix
- Deduplication of packages across projects

---

## Task 6: NuGet Registry Client — `nuget-registry.ts`

Create `packages/plugin-dotnet/src/nuget-registry.ts`.

Hits the NuGet V3 API to get package metadata. Supports custom source URLs extracted by the analyzer.

```typescript
import { withCache } from '@digests/github-utils';

export interface NuGetRegistryData {
  latestVersion: string;
  license: string | null;
  description: string | null;
  repoUrl: string | null;
  lastMajorDate: string | null;
  lastPatchDate: string | null;
  weeklyDownloads: number | null;
  author: string | null;
}
```

**Implementation approach:**
1. Use the NuGet V3 Service Index (`{sourceUrl}/v3/index.json`) to discover resource endpoints
2. Use `RegistrationsBaseUrl` to get package metadata (versions, description, license, etc.)
3. Use `PackageBaseAddress` for download count data if available
4. Cache the service index resolution per source URL
5. Default to `https://api.nuget.org/v3/index.json` when no custom sources provided

**Key functions:**
- `resolveServiceIndex(sourceUrl)` — Fetches and caches the V3 service index
- `fetchNuGetRegistryDataUncached(packageName, sourceUrls)` — Queries registration endpoint for metadata
- `fetchNuGetRegistryData(packageName, sourceUrls)` — Cached wrapper via `withCache()`

**NuGet V3 Registration response structure:**
- `items[].items[].catalogEntry` contains: `id`, `version`, `description`, `licenseExpression`, `projectUrl`, `authors`, `published`
- Download counts available via separate search/stats endpoint

**Verification:** Write `nuget-registry.spec.ts` with tests:
- Parse NuGet V3 registration response
- Handle HTTP errors gracefully (return defaults)
- Custom source URL resolution
- Author extraction

---

## Task 7: Metrics — `metrics.ts`

Create `packages/plugin-dotnet/src/metrics.ts`. Follows the exact pattern from plugin-rust.

```typescript
import type { DependencyMetrics, ParsedDependency } from 'dependency-digest';
import { fetchGitHubMetrics } from '@digests/github-utils';
import { fetchVulnerabilities } from '@digests/osv';
import { fetchNuGetRegistryData } from './nuget-registry.js';
import { getPackageSources } from './parser.js';
import semver from 'semver';

function buildPurl(name: string, version: string): string {
  return `pkg:nuget/${name}@${version}`;
}

export async function fetchDependencyMetrics(
  dep: ParsedDependency,
  token?: string
): Promise<DependencyMetrics> {
  const sources = getPackageSources();
  const registryData = await fetchNuGetRegistryData(dep.name, sources);

  const [ghData, vulnerabilities] = await Promise.all([
    fetchGitHubMetrics(registryData.repoUrl, token),
    fetchVulnerabilities('NuGet', dep.name, dep.version),
  ]);

  return {
    name: dep.name,
    version: dep.version,
    specifier: dep.specifier,
    dev: dep.dev,
    transitive: dep.transitive,
    includedBy: dep.includedBy,
    registryUrl: dep.registryUrl,
    integrity: dep.integrity,
    ecosystem: 'nuget',
    purl: buildPurl(dep.name, dep.version),
    author: registryData.author,
    license: registryData.license,
    description: registryData.description,
    latestVersion: registryData.latestVersion,
    repoUrl: registryData.repoUrl,
    lastMajorDate: registryData.lastMajorDate,
    lastPatchDate: registryData.lastPatchDate,
    lastCommitDate: ghData.lastCommitDate,
    lastIssueOpened: ghData.lastIssueOpened,
    lastPrOpened: ghData.lastPrOpened,
    openIssueCount: ghData.openIssueCount,
    openPrCount: ghData.openPrCount,
    downloads: registryData.weeklyDownloads,
    pinnedIssues: ghData.pinnedIssues,
    vulnerabilities: filterApplicableVulnerabilities(vulnerabilities, dep.version),
  };
}
```

**Verification:** Verify types align with `DependencyMetrics` interface.

---

## Task 8: Plugin entry point — `index.ts`

Create `packages/plugin-dotnet/src/index.ts`.

```typescript
import type { DependencyDigestPlugin } from 'dependency-digest';
import { detectManifests } from './detect.js';
import { parseDotnetDependencies } from './parser.js';
import { fetchDependencyMetrics } from './metrics.js';

const plugin: DependencyDigestPlugin = {
  name: 'dotnet',
  ecosystem: 'nuget',
  detect: detectManifests,
  parseDependencies: parseDotnetDependencies,
  fetchMetrics: fetchDependencyMetrics,
};

export default plugin;
export { plugin };
```

**Verification:** `npx nx build @digests/plugin-dotnet` succeeds.

---

## Task 9: Wire into monorepo

### Update `pnpm-workspace.yaml`
The `packages/*` glob already covers the new package — no changes needed.

### Update root `package.json`
Add `"@digests/plugin-dotnet": "workspace:"` to devDependencies (matches how plugin-rust is listed).

### Run `pnpm install`
Links the new package and resolves workspace dependencies.

**Verification:**
- `pnpm install` succeeds
- `npx nx show project @digests/plugin-dotnet --json` shows the project
- `npx nx build @digests/plugin-dotnet` builds both the DLL and TypeScript
- `npx nx test @digests/plugin-dotnet` runs tests

---

## Task 10: Write unit tests

### `detect.spec.ts`
- Finds .csproj files in directory
- Finds .sln and prefers it over individual projects
- Skips bin/obj/node_modules directories
- Returns [] on empty or errored directory

### `parser.spec.ts`
- Parses direct dependencies correctly
- Marks transitive dependencies
- Builds edge graph
- Computes includedBy chains for transitive deps
- Formats sha512 integrity with prefix
- Deduplicates across projects

### `nuget-registry.spec.ts`
- Parses NuGet V3 registration response
- Returns defaults on HTTP error
- Extracts license, author, description, versions

All tests mock external dependencies (`spawnSync`, `fetch`, `fs`) using `vi.mock()`.

**Verification:** `npx nx test @digests/plugin-dotnet` — all tests pass.

---

## Execution Order

Tasks 1-2 can be done first (scaffold + C# DLL). Then tasks 3-8 are the TypeScript modules (analyzer-client → detect → parser → nuget-registry → metrics → index). Task 9 wires it together. Task 10 adds tests alongside each module.

In practice, I'll build each module with its test sequentially, verifying as I go.
