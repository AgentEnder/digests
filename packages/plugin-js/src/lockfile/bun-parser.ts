import type { LockfileParseResult, ResolvedDependency } from './types.js';

interface BunLockfile {
  lockfileVersion?: number;
  workspaces?: Record<string, unknown>;
  packages?: Record<string, unknown[]>;
}

type WorkspaceEntry = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export function parseBunLockfile(content: string): LockfileParseResult {
  const packages = new Map<string, ResolvedDependency[]>();
  const edges = new Map<string, string[]>();
  const rootDeps = new Map<string, 'prod' | 'dev'>();

  let lockfile: BunLockfile;
  try {
    lockfile = JSON.parse(content);
  } catch {
    return { packages, edges, rootDeps };
  }

  if (!lockfile.packages) return { packages, edges, rootDeps };

  // Extract rootDeps from the root workspace entry
  if (lockfile.workspaces) {
    const root = lockfile.workspaces[''] as WorkspaceEntry | undefined;
    if (root) {
      if (root.dependencies) {
        for (const depName of Object.keys(root.dependencies)) {
          rootDeps.set(depName, 'prod');
        }
      }
      if (root.devDependencies) {
        for (const depName of Object.keys(root.devDependencies)) {
          rootDeps.set(depName, 'dev');
        }
      }
    }
  }

  // Build a lookup from package key to resolved "name@version"
  const keyToResolved = new Map<string, string>();

  for (const [key, tuple] of Object.entries(lockfile.packages)) {
    if (!Array.isArray(tuple) || tuple.length < 1) continue;

    const spec = tuple[0] as string;

    // Skip workspace packages: ["name@workspace:path"]
    if (spec.includes('@workspace:')) continue;
    // Skip file/link packages
    if (spec.includes('@file:') || spec.includes('@link:')) continue;

    // Parse "name@version" from spec
    const parsed = parsePackageSpec(spec);
    if (!parsed) continue;

    const { name, version } = parsed;

    keyToResolved.set(key, `${name}@${version}`);

    // tuple[1] = tarball URL (for npm packages)
    // tuple[3] = integrity hash
    const registryUrl = typeof tuple[1] === 'string' ? tuple[1] : undefined;
    const integrity = typeof tuple[3] === 'string' ? tuple[3] : undefined;

    const existing = packages.get(name) ?? [];
    if (!existing.some(e => e.version === version)) {
      existing.push({ name, version, registryUrl, integrity, dev: false });
      packages.set(name, existing);
    }
  }

  // Extract edges from tuple[2] (dependency map)
  for (const [key, tuple] of Object.entries(lockfile.packages)) {
    if (!Array.isArray(tuple) || tuple.length < 3) continue;

    const sourceKey = keyToResolved.get(key);
    if (!sourceKey) continue;

    const deps = tuple[2] as Record<string, string> | undefined;
    if (!deps || typeof deps !== 'object') continue;

    const depEdges: string[] = [];
    for (const depName of Object.keys(deps)) {
      // Look up the resolved version from the packages map
      const resolvedVersions = packages.get(depName);
      if (resolvedVersions && resolvedVersions.length > 0) {
        depEdges.push(`${depName}@${resolvedVersions[0].version}`);
      }
    }

    if (depEdges.length > 0) {
      edges.set(sourceKey, depEdges);
    }
  }

  return { packages, edges, rootDeps };
}

function parsePackageSpec(
  spec: string
): { name: string; version: string } | null {
  // Handle "@scope/pkg@1.0.0" and "pkg@1.0.0"
  const atIndex = spec.startsWith('@')
    ? spec.indexOf('@', 1)
    : spec.indexOf('@');

  if (atIndex === -1) return null;

  const name = spec.slice(0, atIndex);
  const version = spec.slice(atIndex + 1);

  if (!name || !version) return null;

  return { name, version };
}
