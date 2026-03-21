import type { ParsedDependency, ParseResult } from 'dependency-digest';
import type { GradleDependencyOutput } from './gradle-runner.js';

const MAX_CHAIN_DEPTH = 10;

interface GradleCoordinate {
  groupId: string;
  artifactId: string;
  requestedVersion: string;
  resolvedVersion: string;
}

function pkgKey(groupId: string, artifactId: string, version: string): string {
  return `${groupId}:${artifactId}@${version}`;
}

/** Parse a Gradle dependency line like "org.example:foo:1.0 -> 2.0" or "org.example:foo:1.0 (*)" */
function parseGradleCoordinate(text: string): GradleCoordinate | null {
  // Strip trailing (*) or (c) markers
  const cleaned = text.replace(/\s+\([*cn]\)$/, '').trim();

  // Handle version conflict: "group:artifact:requested -> resolved"
  const conflictMatch = cleaned.match(
    /^([\w.\-]+):([\w.\-]+):([\w.\-]+)\s+->\s+([\w.\-]+)$/
  );
  if (conflictMatch) {
    return {
      groupId: conflictMatch[1],
      artifactId: conflictMatch[2],
      requestedVersion: conflictMatch[3],
      resolvedVersion: conflictMatch[4],
    };
  }

  // Standard format: "group:artifact:version"
  const standardMatch = cleaned.match(
    /^([\w.\-]+):([\w.\-]+):([\w.\-]+)$/
  );
  if (standardMatch) {
    return {
      groupId: standardMatch[1],
      artifactId: standardMatch[2],
      requestedVersion: standardMatch[3],
      resolvedVersion: standardMatch[3],
    };
  }

  return null;
}

/**
 * Compute tree depth from Gradle indent markers.
 * Each indent level is a 5-character unit: "+--- ", "\\--- ", "|    ", "     "
 */
function computeDepth(prefix: string): number {
  let depth = 0;
  let i = 0;
  while (i + 4 < prefix.length) {
    const chunk = prefix.substring(i, i + 5);
    if (
      chunk === '+--- ' ||
      chunk === '\\--- ' ||
      chunk === '|    ' ||
      chunk === '     '
    ) {
      depth++;
      i += 5;
    } else {
      break;
    }
  }
  return depth;
}

interface TreeNode {
  groupId: string;
  artifactId: string;
  version: string;
  key: string;
  depth: number;
}

function parseTreeOutput(output: string): TreeNode[] {
  const lines = output.split('\n');
  const nodes: TreeNode[] = [];

  for (const line of lines) {
    // Skip empty lines, header lines, and "No dependencies" lines
    if (
      !line.trim() ||
      line.includes('No dependencies') ||
      line.includes('FAILED')
    ) {
      continue;
    }

    // Match lines with tree markers followed by a coordinate
    const treeMatch = line.match(
      /^([+\\| ]*[-\\]*\s?)([\w.\-]+:[\w.\-]+:[\w.\-]+.*)$/
    );
    if (!treeMatch) continue;

    const prefix = treeMatch[1];
    const coordStr = treeMatch[2];

    const coord = parseGradleCoordinate(coordStr);
    if (!coord) continue;

    const depth = computeDepth(prefix);
    const key = pkgKey(
      coord.groupId,
      coord.artifactId,
      coord.resolvedVersion
    );

    nodes.push({
      groupId: coord.groupId,
      artifactId: coord.artifactId,
      version: coord.resolvedVersion,
      key,
      depth,
    });
  }

  return nodes;
}

export function parseGradleDependencies(
  output: GradleDependencyOutput
): ParseResult {
  const runtimeNodes = parseTreeOutput(output.runtimeClasspath);
  const testNodes = parseTreeOutput(output.testRuntimeClasspath);

  const runtimeKeys = new Set(runtimeNodes.map((n) => n.key));

  const deps: ParsedDependency[] = [];
  const edges: Record<string, string[]> = {};
  const seen = new Set<string>();

  // Process all nodes from both trees, building edges and deps
  const allNodeSets: Array<{ nodes: TreeNode[]; isDev: boolean }> = [
    { nodes: runtimeNodes, isDev: false },
    { nodes: testNodes, isDev: true },
  ];

  for (const { nodes, isDev } of allNodeSets) {
    const parentStack: string[] = [];
    const nodeList: Array<TreeNode & { parentKey: string | null }> = [];

    for (const node of nodes) {
      parentStack[node.depth] = node.key;
      const parentKey =
        node.depth > 0 ? parentStack[node.depth - 1] ?? null : null;
      nodeList.push({ ...node, parentKey });

      // Build edges
      if (parentKey) {
        if (!edges[parentKey]) edges[parentKey] = [];
        if (!edges[parentKey].includes(node.key)) {
          edges[parentKey].push(node.key);
        }
      }

      if (!seen.has(node.key)) {
        seen.add(node.key);

        // A dep is dev-only if it appears in testRuntimeClasspath but NOT in runtimeClasspath
        const isDevOnly = isDev && !runtimeKeys.has(node.key);

        deps.push({
          name: `${node.groupId}:${node.artifactId}`,
          version: node.version,
          dev: isDevOnly,
          transitive: node.depth > 1,
        });
      }
    }

    // Compute includedBy chains for transitive deps
    for (let idx = 0; idx < nodeList.length; idx++) {
      const node = nodeList[idx];
      if (node.depth <= 1) continue;

      const chain: string[] = [];
      let currentDepth = node.depth - 1;

      for (let i = idx - 1; i >= 0 && currentDepth > 0; i--) {
        if (nodeList[i].depth === currentDepth) {
          chain.unshift(nodeList[i].key);
          currentDepth--;
        }
      }

      if (chain.length > 0 && chain.length <= MAX_CHAIN_DEPTH) {
        const dep = deps.find(
          (d) =>
            d.name === `${node.groupId}:${node.artifactId}` &&
            d.version === node.version
        );
        if (dep) {
          if (!dep.includedBy) dep.includedBy = [];
          dep.includedBy.push(chain);
        }
      }
    }
  }

  return { dependencies: deps, edges };
}
