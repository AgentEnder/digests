import type { ParsedDependency, ParseResult } from 'dependency-digest';

const MAX_CHAIN_DEPTH = 10;

interface MavenCoordinate {
  groupId: string;
  artifactId: string;
  version: string;
  scope: string;
  packaging: string;
}

function pkgKey(groupId: string, artifactId: string, version: string): string {
  return `${groupId}:${artifactId}@${version}`;
}

/** Parse a Maven coordinate string like "groupId:artifactId:packaging:version:scope" */
function parseCoordinate(coord: string): MavenCoordinate | null {
  const parts = coord.split(':');

  // groupId:artifactId:packaging:version:scope (5 parts)
  if (parts.length === 5) {
    return {
      groupId: parts[0],
      artifactId: parts[1],
      packaging: parts[2],
      version: parts[3],
      scope: parts[4],
    };
  }

  // groupId:artifactId:packaging:classifier:version:scope (6 parts, with classifier)
  if (parts.length === 6) {
    return {
      groupId: parts[0],
      artifactId: parts[1],
      packaging: parts[2],
      version: parts[4],
      scope: parts[5],
    };
  }

  return null;
}

/**
 * Compute the tree depth from Maven tree markers.
 * Each indent level is a 3-character unit: "+- ", "\\- ", "|  ", "   "
 */
function computeDepth(prefix: string): number {
  let depth = 0;
  let i = 0;
  while (i + 2 < prefix.length) {
    const chunk = prefix.substring(i, i + 3);
    if (
      chunk === '+- ' ||
      chunk === '\\- ' ||
      chunk === '|  ' ||
      chunk === '   '
    ) {
      depth++;
      i += 3;
    } else {
      break;
    }
  }
  return depth;
}

interface TreeNode {
  coord: MavenCoordinate;
  key: string;
  depth: number;
  parentKey: string | null;
}

export function parseMavenDependencyTree(output: string): ParseResult {
  const lines = output.split('\n');
  const deps: ParsedDependency[] = [];
  const edges: Record<string, string[]> = {};
  const seen = new Set<string>();

  // Stack tracks parent at each depth level: depth -> key
  const parentStack: string[] = [];
  const directDeps = new Set<string>();
  const devDeps = new Set<string>();
  const includedByChains = new Map<string, string[][]>();

  const nodes: TreeNode[] = [];

  for (const line of lines) {
    // Strip [INFO] prefix
    const infoMatch = line.match(/^\[INFO\]\s?(.*)/);
    if (!infoMatch) continue;

    const content = infoMatch[1];
    if (!content || content.startsWith('---') || content.startsWith('BUILD')) {
      continue;
    }

    // Find where the coordinate starts (after tree markers)
    const coordMatch = content.match(
      /^([+\\| ]*[-\\]?\s?)?([\w][\w.\-]*:[\w][\w.\-]*:[\w][\w.\-]*:[\w][\w.\-]*(?::[\w][\w.\-]*)*)$/
    );
    if (!coordMatch) continue;

    const prefix = coordMatch[1] ?? '';
    const coordStr = coordMatch[2];

    // Root line has no prefix markers and only 3-4 parts (groupId:artifactId:packaging:version)
    const parts = coordStr.split(':');
    if (parts.length <= 4 && prefix.trim() === '') {
      // This is the root project, skip it
      continue;
    }

    const coord = parseCoordinate(coordStr);
    if (!coord) continue;

    const depth = computeDepth(prefix);
    const key = pkgKey(coord.groupId, coord.artifactId, coord.version);

    // Update parent stack
    parentStack[depth] = key;
    const parentKey = depth > 0 ? parentStack[depth - 1] ?? null : null;

    nodes.push({ coord, key, depth, parentKey });
  }

  // Build edges and classify deps
  for (const node of nodes) {
    const { coord, key, depth, parentKey } = node;

    if (depth === 1) {
      directDeps.add(key);
    }

    if (coord.scope === 'test') {
      devDeps.add(key);
    }

    // Build edges
    if (parentKey) {
      if (!edges[parentKey]) edges[parentKey] = [];
      if (!edges[parentKey].includes(key)) {
        edges[parentKey].push(key);
      }
    }

    if (!seen.has(key)) {
      seen.add(key);

      deps.push({
        name: `${coord.groupId}:${coord.artifactId}`,
        version: coord.version,
        dev: coord.scope === 'test',
        transitive: depth > 1,
      });
    }
  }

  // Compute includedBy chains for transitive deps via BFS
  for (const node of nodes) {
    if (node.depth <= 1) continue;

    const chain: string[] = [];
    let currentDepth = node.depth - 1;

    // Walk back up the tree to build the chain
    for (let i = nodes.indexOf(node) - 1; i >= 0 && currentDepth > 0; i--) {
      if (nodes[i].depth === currentDepth) {
        chain.unshift(nodes[i].key);
        currentDepth--;
      }
    }

    if (chain.length > 0 && chain.length <= MAX_CHAIN_DEPTH) {
      const existing = includedByChains.get(node.key) ?? [];
      existing.push(chain);
      includedByChains.set(node.key, existing);
    }
  }

  // Attach includedBy chains to deps
  for (const dep of deps) {
    const key = `${dep.name}@${dep.version}`;
    const chains = includedByChains.get(key);
    if (chains && chains.length > 0) {
      dep.includedBy = chains;
    }
  }

  return { dependencies: deps, edges };
}
