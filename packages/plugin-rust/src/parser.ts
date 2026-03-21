import type { ParsedDependency, ParseResult } from 'dependency-digest';
import type { CargoMetadata } from './cargo-metadata.js';

const MAX_CHAIN_DEPTH = 10;

interface GraphInfo {
  devFlags: Map<string, boolean>;
  includedByChains: Map<string, string[][]>;
}

function pkgKey(name: string, version: string): string {
  return `${name}@${version}`;
}

/** Extract name@version from a cargo package id like "serde 1.0.210 (registry+https://...)" */
function parsePackageId(id: string): { name: string; version: string } | null {
  const match = id.match(/^([^\s]+)\s+([^\s]+)/);
  if (!match) return null;
  return { name: match[1], version: match[2] };
}

function computeGraphInfo(
  metadata: CargoMetadata,
  workspaceIds: Set<string>
): GraphInfo {
  const devFlags = new Map<string, boolean>();
  const includedByChains = new Map<string, string[][]>();

  // Build a lookup from package id → node
  const nodeById = new Map(
    metadata.resolve.nodes.map((n) => [n.id, n])
  );

  // Build a set of all non-workspace package keys
  const allKeys = new Set<string>();
  const idToKey = new Map<string, string>();
  for (const pkg of metadata.packages) {
    if (pkg.source !== null) {
      const key = pkgKey(pkg.name, pkg.version);
      allKeys.add(key);
      idToKey.set(pkg.id, key);
    }
  }

  // Find workspace root nodes and classify their direct deps as prod or dev
  const rootEntries: Array<{ key: string; dev: boolean }> = [];

  for (const wsId of workspaceIds) {
    const node = nodeById.get(wsId);
    if (!node) continue;

    for (const dep of node.deps) {
      const depKey = idToKey.get(dep.pkg);
      if (!depKey) continue;

      const hasNormal = dep.dep_kinds.some(
        (k) => k.kind === null || k.kind === 'normal' || k.kind === 'build'
      );
      const isDevOnly = !hasNormal && dep.dep_kinds.some((k) => k.kind === 'dev');

      rootEntries.push({ key: depKey, dev: isDevOnly });
    }
  }

  // BFS from prod roots → mark prod-reachable
  const prodReachable = new Set<string>();

  // Build adjacency list from resolve graph (excluding workspace nodes)
  const adjacency = new Map<string, string[]>();
  for (const node of metadata.resolve.nodes) {
    const nodeKey = idToKey.get(node.id);
    if (!nodeKey) continue;

    const edges: string[] = [];
    for (const dep of node.deps) {
      const depKey = idToKey.get(dep.pkg);
      if (depKey) edges.push(depKey);
    }
    adjacency.set(nodeKey, edges);
  }

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
        if (chain.length > 0 && chain.length <= MAX_CHAIN_DEPTH) {
          const existing = includedByChains.get(key) ?? [];
          existing.push(chain);
          includedByChains.set(key, existing);
        }
        continue;
      }
      visited.add(key);

      if (!root.dev) prodReachable.add(key);

      if (chain.length > 0) {
        const existing = includedByChains.get(key) ?? [];
        existing.push(chain);
        includedByChains.set(key, existing);
      }

      if (chain.length < MAX_CHAIN_DEPTH) {
        const deps = adjacency.get(key) ?? [];
        for (const depKey of deps) {
          if (allKeys.has(depKey)) {
            queue.push({ key: depKey, chain: [...chain, key] });
          }
        }
      }
    }
  }

  for (const key of allKeys) {
    devFlags.set(key, !prodReachable.has(key));
  }

  return { devFlags, includedByChains };
}

export function parseCargoMetadata(metadata: CargoMetadata): ParseResult {
  const workspaceIds = new Set(metadata.workspace_members);

  // Identify direct dependencies of workspace members
  const directDeps = new Set<string>();
  const nodeById = new Map(
    metadata.resolve.nodes.map((n) => [n.id, n])
  );
  for (const wsId of workspaceIds) {
    const node = nodeById.get(wsId);
    if (!node) continue;
    for (const dep of node.deps) {
      const parsed = parsePackageId(dep.pkg);
      if (parsed) directDeps.add(pkgKey(parsed.name, parsed.version));
    }
  }

  const { devFlags, includedByChains } = computeGraphInfo(metadata, workspaceIds);

  const deps: ParsedDependency[] = [];
  const seen = new Set<string>();

  // Build edges from resolve graph
  const edgeRecord: Record<string, string[]> = {};
  const idToKey = new Map<string, string>();
  for (const pkg of metadata.packages) {
    if (pkg.source !== null) {
      idToKey.set(pkg.id, pkgKey(pkg.name, pkg.version));
    }
  }

  for (const node of metadata.resolve.nodes) {
    const nodeKey = idToKey.get(node.id);
    if (!nodeKey) continue;

    const depKeys: string[] = [];
    for (const dep of node.deps) {
      const depKey = idToKey.get(dep.pkg);
      if (depKey) depKeys.push(depKey);
    }
    if (depKeys.length > 0) {
      edgeRecord[nodeKey] = depKeys;
    }
  }

  for (const pkg of metadata.packages) {
    // Skip workspace members (local crates)
    if (pkg.source === null) continue;

    const key = pkgKey(pkg.name, pkg.version);
    if (seen.has(key)) continue;
    seen.add(key);

    const isDirect = directDeps.has(key);
    const dev = devFlags.get(key) ?? false;
    const chains = includedByChains.get(key);

    const registryUrl = pkg.source?.startsWith('registry+')
      ? pkg.source.replace(/^registry\+/, '')
      : undefined;

    deps.push({
      name: pkg.name,
      version: pkg.version,
      dev,
      transitive: !isDirect,
      registryUrl,
      ...(chains && chains.length > 0 ? { includedBy: chains } : {}),
    });
  }

  return { dependencies: deps, edges: edgeRecord };
}
