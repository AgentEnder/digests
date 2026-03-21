import type { ParsedDependency, ParseResult, ManifestFile } from 'dependency-digest';
import { runAnalyzer, type AnalyzerOutput } from './analyzer-client.js';
import { dirname } from 'path';

const MAX_CHAIN_DEPTH = 10;

/** Package sources extracted by the analyzer, available for metrics to query */
let cachedPackageSources: string[] = [];

export function getPackageSources(): string[] {
  return cachedPackageSources;
}

function pkgKey(name: string, version: string): string {
  return `${name}@${version}`;
}

function computeIncludedByChains(
  targetKey: string,
  edges: Record<string, string[]>,
  allPackages: Map<string, AnalyzerOutput['packages'][number]>
): string[][] {
  const chains: string[][] = [];

  // Build reverse adjacency: child → parents
  const reverseEdges = new Map<string, string[]>();
  for (const [from, tos] of Object.entries(edges)) {
    for (const to of tos) {
      const existing = reverseEdges.get(to) ?? [];
      existing.push(from);
      reverseEdges.set(to, existing);
    }
  }

  // BFS upward from targetKey to find chains ending at direct deps
  const queue: Array<{ key: string; chain: string[] }> = [
    { key: targetKey, chain: [] },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || visited.has(item.key)) continue;
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
      dev: false,
      transitive: isTransitive,
      integrity: pkg.sha512 ? `sha512-${pkg.sha512}` : undefined,
    };

    if (isTransitive) {
      const chains = computeIncludedByChains(key, output.edges, allPackages);
      if (chains.length > 0) dep.includedBy = chains;
    }

    deps.push(dep);
  }

  return { dependencies: deps, edges: output.edges };
}

export async function parseDotnetDependencies(
  manifest: ManifestFile
): Promise<ParseResult> {
  const workspaceRoot = dirname(manifest.path);
  const projectFiles = [manifest.path];
  const output = runAnalyzer(workspaceRoot, projectFiles);

  if (output.errors.length > 0) {
    console.error(`DotnetAnalyzer warnings:\n${output.errors.join('\n')}`);
  }

  return parseAnalyzerOutput(output);
}
