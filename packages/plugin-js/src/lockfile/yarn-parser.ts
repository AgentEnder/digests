import type { LockfileParseResult, ResolvedDependency } from './types.js';

export function parseYarnLockfile(content: string): LockfileParseResult {
  const packages = new Map<string, ResolvedDependency[]>();
  const edges = new Map<string, string[]>();
  const rootDeps = new Map<string, 'prod' | 'dev'>();

  if (!content.trim()) return { packages, edges, rootDeps };

  const isBerry = content.includes('__metadata:');

  if (isBerry) {
    return parseYarnBerry(content);
  }
  return parseYarnClassic(content);
}

function parseYarnClassic(content: string): LockfileParseResult {
  const packages = new Map<string, ResolvedDependency[]>();
  const edges = new Map<string, string[]>();
  const rootDeps = new Map<string, 'prod' | 'dev'>();

  // Split into blocks: each block starts with an unindented line and continues with indented lines
  const blocks = content.split(/\n(?=\S)/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const header = lines[0];
    // Skip comments
    if (header.startsWith('#')) continue;

    // Extract package name from header like: react@^19.0.0: or "react@^19.0.0", "react@^18.0.0":
    const name = extractPackageName(header);
    if (!name) continue;

    let version: string | undefined;
    let resolved: string | undefined;
    let integrity: string | undefined;
    const blockDeps: Array<{ depName: string; depRange: string }> = [];
    let inDependencies = false;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();

      // Check if we're entering or leaving a dependencies section
      if (trimmed === 'dependencies:') {
        inDependencies = true;
        continue;
      }

      // If the line is not indented enough (only 2 spaces from block level), we've left dependencies
      // In classic format, block-level fields use 2 spaces, dependency entries use 4 spaces
      if (inDependencies && !line.startsWith('    ')) {
        inDependencies = false;
      }

      if (inDependencies) {
        // Classic format: `    depName "^1.0.0"`
        const depMatch = trimmed.match(/^(.+?)\s+"(.+)"$/);
        if (depMatch) {
          blockDeps.push({ depName: depMatch[1], depRange: depMatch[2] });
        }
        continue;
      }

      if (trimmed.startsWith('version ')) {
        version = unquote(trimmed.slice('version '.length));
      } else if (trimmed.startsWith('resolved ')) {
        resolved = unquote(trimmed.slice('resolved '.length));
      } else if (trimmed.startsWith('integrity ')) {
        integrity = unquote(trimmed.slice('integrity '.length));
      }
    }

    if (name && version) {
      const existing = packages.get(name) ?? [];
      if (!existing.some(e => e.version === version)) {
        existing.push({ name, version, registryUrl: resolved, integrity, dev: false });
        packages.set(name, existing);
      }

      // Build edges for this package
      if (blockDeps.length > 0) {
        const edgeKey = `${name}@${version}`;
        const edgeList: string[] = [];
        for (const { depName } of blockDeps) {
          const depEntries = packages.get(depName);
          if (depEntries && depEntries.length > 0) {
            edgeList.push(`${depName}@${depEntries[0].version}`);
          }
        }
        if (edgeList.length > 0) {
          edges.set(edgeKey, edgeList);
        }
      }
    }
  }

  // Second pass for edges: some deps may not have been parsed yet in first pass
  rebuildEdges(content, packages, edges, 'classic');

  return { packages, edges, rootDeps };
}

function parseYarnBerry(content: string): LockfileParseResult {
  const packages = new Map<string, ResolvedDependency[]>();
  const edges = new Map<string, string[]>();
  const rootDeps = new Map<string, 'prod' | 'dev'>();

  const blocks = content.split(/\n(?=\S)/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const header = lines[0];
    if (header.startsWith('#') || header.startsWith('__metadata:')) continue;

    // Berry header: "react@npm:^19.0.0":
    const name = extractPackageName(header);
    if (!name) continue;

    let version: string | undefined;
    let checksum: string | undefined;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('version: ')) {
        version = trimmed.slice('version: '.length).trim();
      } else if (trimmed.startsWith('checksum: ')) {
        checksum = trimmed.slice('checksum: '.length).trim();
      }
    }

    if (name && version) {
      const existing = packages.get(name) ?? [];
      if (!existing.some(e => e.version === version)) {
        existing.push({ name, version, integrity: checksum, dev: false });
        packages.set(name, existing);
      }
    }
  }

  // Second pass: extract edges now that all packages are known
  rebuildEdges(content, packages, edges, 'berry');

  return { packages, edges, rootDeps };
}

function rebuildEdges(
  content: string,
  packages: Map<string, ResolvedDependency[]>,
  edges: Map<string, string[]>,
  format: 'classic' | 'berry',
): void {
  const blocks = content.split(/\n(?=\S)/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const header = lines[0];
    if (header.startsWith('#') || header.startsWith('__metadata:')) continue;

    const name = extractPackageName(header);
    if (!name) continue;

    // Find the version for this block
    let version: string | undefined;
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (format === 'classic' && trimmed.startsWith('version ')) {
        version = unquote(trimmed.slice('version '.length));
        break;
      } else if (format === 'berry' && trimmed.startsWith('version: ')) {
        version = trimmed.slice('version: '.length).trim();
        break;
      }
    }

    if (!version) continue;

    const edgeKey = `${name}@${version}`;
    const blockDeps: string[] = [];
    let inDependencies = false;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();

      if (format === 'classic') {
        if (trimmed === 'dependencies:') {
          inDependencies = true;
          continue;
        }
        if (inDependencies && !line.startsWith('    ')) {
          inDependencies = false;
        }
        if (inDependencies) {
          const depMatch = trimmed.match(/^(.+?)\s+"(.+)"$/);
          if (depMatch) {
            const depName = depMatch[1];
            const depEntries = packages.get(depName);
            if (depEntries && depEntries.length > 0) {
              blockDeps.push(`${depName}@${depEntries[0].version}`);
            }
          }
        }
      } else {
        // Berry format
        if (trimmed === 'dependencies:') {
          inDependencies = true;
          continue;
        }
        // Exit dependencies section when we hit a non-indented-enough line
        if (inDependencies && !line.startsWith('    ')) {
          inDependencies = false;
        }
        if (inDependencies) {
          // Berry format: `    depName: ^1.0.0`
          const depMatch = trimmed.match(/^(.+?):\s+(.+)$/);
          if (depMatch) {
            const depName = depMatch[1];
            const depEntries = packages.get(depName);
            if (depEntries && depEntries.length > 0) {
              blockDeps.push(`${depName}@${depEntries[0].version}`);
            }
          }
        }
      }
    }

    if (blockDeps.length > 0) {
      edges.set(edgeKey, blockDeps);
    }
  }
}

function extractPackageName(header: string): string | null {
  // Remove trailing colon
  const cleaned = header.replace(/:$/, '').trim();

  // Handle quoted entries: "@scope/pkg@npm:^1.0.0", "@scope/pkg@^1.0.0"
  // Handle unquoted entries: react@^19.0.0
  // May have multiple ranges: lodash@^4.17.0, lodash@^4.17.21

  // Take the first entry (before any comma)
  const firstEntry = cleaned.split(',')[0].trim().replace(/^"|"$/g, '');

  // Split on last @ that isn't part of a scope
  // For "@scope/pkg@^1.0.0" -> "@scope/pkg"
  // For "react@^19.0.0" -> "react"
  // For "@scope/pkg@npm:^1.0.0" -> "@scope/pkg"
  const atIndex = firstEntry.startsWith('@')
    ? firstEntry.indexOf('@', 1)
    : firstEntry.indexOf('@');

  if (atIndex === -1) return null;

  return firstEntry.slice(0, atIndex);
}

function unquote(s: string): string {
  return s.replace(/^"|"$/g, '').trim();
}
