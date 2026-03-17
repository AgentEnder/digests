import { readFile } from 'fs/promises';
import { dirname } from 'path';
import type { ManifestFile, ParsedDependency } from 'dependency-digest';
import { parseLockfile } from './lockfile/index.js';
import type { LockfileParseResult } from './lockfile/index.js';

const SKIP_PROTOCOLS = ['workspace:', 'link:', 'file:', 'portal:'];

const MAX_CHAIN_DEPTH = 10;

function shouldSkip(versionRange: string): boolean {
  return SKIP_PROTOCOLS.some((p) => versionRange.startsWith(p));
}

function computeGraphInfo(
  lockfileResult: LockfileParseResult,
  directDeps: Map<string, { specifier: string; dev: boolean }>
): {
  devFlags: Map<string, boolean>;
  includedByChains: Map<string, string[][]>;
} {
  const { packages, edges, rootDeps } = lockfileResult;

  // Build set of all "name@version" keys
  const allKeys = new Set<string>();
  for (const [name, versions] of packages) {
    for (const v of versions) {
      allKeys.add(`${name}@${v.version}`);
    }
  }

  // BFS from prod roots → mark prod-reachable
  const prodReachable = new Set<string>();
  // BFS from all roots → collect includedBy chains
  const includedByChains = new Map<string, string[][]>();

  // Determine root keys using rootDeps or directDeps fallback
  const rootEntries: Array<{ key: string; dev: boolean }> = [];
  const depsSource = rootDeps.size > 0 ? rootDeps : null;

  for (const [name, versions] of packages) {
    const direct = directDeps.get(name);
    if (!direct) continue;

    for (const v of versions) {
      const key = `${name}@${v.version}`;
      const isDev = depsSource
        ? depsSource.get(name) === 'dev'
        : direct.dev;
      rootEntries.push({ key, dev: isDev });
    }
  }

  // BFS from each root
  for (const root of rootEntries) {
    const queue: Array<{ key: string; chain: string[] }> = [
      { key: root.key, chain: [] },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { key, chain } = item;

      if (visited.has(key)) {
        // Still record the chain if it's a new path (for non-root nodes)
        if (chain.length > 0 && chain.length <= MAX_CHAIN_DEPTH) {
          const existing = includedByChains.get(key) ?? [];
          existing.push(chain);
          includedByChains.set(key, existing);
        }
        continue;
      }
      visited.add(key);

      if (!root.dev) prodReachable.add(key);

      // Record chain for non-root nodes
      if (chain.length > 0) {
        const existing = includedByChains.get(key) ?? [];
        existing.push(chain);
        includedByChains.set(key, existing);
      }

      // Walk edges (cap depth)
      if (chain.length < MAX_CHAIN_DEPTH) {
        const deps = edges.get(key) ?? [];
        for (const depKey of deps) {
          if (allKeys.has(depKey)) {
            queue.push({ key: depKey, chain: [...chain, key] });
          }
        }
      }
    }
  }

  // Compute dev flags: anything not prod-reachable is dev
  const devFlags = new Map<string, boolean>();
  for (const key of allKeys) {
    devFlags.set(key, !prodReachable.has(key));
  }

  return { devFlags, includedByChains };
}

export async function parseManifest(
  manifest: ManifestFile
): Promise<ParsedDependency[]> {
  const content = await readFile(manifest.path, 'utf-8');
  const pkg = JSON.parse(content);
  const dir = dirname(manifest.path);

  const directDeps = new Map<string, { specifier: string; dev: boolean }>();

  for (const [name, specifier] of Object.entries(pkg.dependencies ?? {})) {
    if (typeof specifier === 'string' && !shouldSkip(specifier)) {
      directDeps.set(name, { specifier, dev: false });
    }
  }
  for (const [name, specifier] of Object.entries(pkg.devDependencies ?? {})) {
    if (typeof specifier === 'string' && !shouldSkip(specifier)) {
      directDeps.set(name, { specifier, dev: true });
    }
  }

  const lockfileResult = await parseLockfile(dir, manifest.type);

  const hasEdges = lockfileResult.edges.size > 0;
  const { devFlags, includedByChains } = hasEdges
    ? computeGraphInfo(lockfileResult, directDeps)
    : { devFlags: new Map<string, boolean>(), includedByChains: new Map<string, string[][]>() };

  const deps: ParsedDependency[] = [];
  const seen = new Set<string>();

  // Process all lockfile entries
  for (const [name, versions] of lockfileResult.packages) {
    for (const resolved of versions) {
      const key = `${name}@${resolved.version}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const direct = directDeps.get(name);

      // Determine dev flag: prefer graph reachability, fall back to direct/resolved
      let dev: boolean;
      if (hasEdges) {
        dev = direct
          ? (lockfileResult.rootDeps.size > 0
            ? lockfileResult.rootDeps.get(name) === 'dev'
            : direct.dev)
          : (devFlags.get(key) ?? resolved.dev);
      } else {
        dev = direct ? direct.dev : resolved.dev;
      }

      const chains = includedByChains.get(key);

      deps.push({
        name,
        version: resolved.version,
        specifier: direct?.specifier,
        dev,
        transitive: !direct,
        registryUrl: resolved.registryUrl,
        integrity: resolved.integrity,
        ...(chains && chains.length > 0 ? { includedBy: chains } : {}),
      });
    }
  }

  // Add any direct deps not found in lockfile (fallback)
  for (const [name, { specifier, dev }] of directDeps) {
    if (!lockfileResult.packages.has(name)) {
      if (manifest.type !== 'package.json') {
        console.warn(
          `${name} not found in lockfile, using package.json range: ${specifier}`
        );
      }
      deps.push({
        name,
        version: specifier,
        specifier,
        dev,
        transitive: false,
      });
    }
  }

  return deps;
}
