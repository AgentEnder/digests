import type { LockfileParseResult, ResolvedDependency } from './types.js';

interface NpmLockfileV3Package {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  link?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface NpmLockfileV1Dependency {
  version: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
}

interface NpmLockfile {
  lockfileVersion?: number;
  packages?: Record<string, NpmLockfileV3Package>;
  dependencies?: Record<string, NpmLockfileV1Dependency>;
}

export function parseNpmLockfile(content: string): LockfileParseResult {
  const packages = new Map<string, ResolvedDependency[]>();
  const edges = new Map<string, string[]>();
  const rootDeps = new Map<string, 'prod' | 'dev'>();

  let lockfile: NpmLockfile;
  try {
    lockfile = JSON.parse(content);
  } catch {
    return { packages, edges, rootDeps };
  }

  // Prefer v2/v3 packages section
  if (lockfile.packages) {
    // Extract rootDeps from the root entry
    const rootEntry = lockfile.packages[''];
    if (rootEntry) {
      if (rootEntry.dependencies) {
        for (const name of Object.keys(rootEntry.dependencies)) {
          rootDeps.set(name, 'prod');
        }
      }
      if (rootEntry.devDependencies) {
        for (const name of Object.keys(rootEntry.devDependencies)) {
          rootDeps.set(name, 'dev');
        }
      }
    }

    // First pass: collect all packages
    for (const [key, pkg] of Object.entries(lockfile.packages)) {
      if (!key || !key.startsWith('node_modules/')) continue;
      if (pkg.link) continue;

      // Extract the package name from the last node_modules/ segment
      const lastNmIndex = key.lastIndexOf('node_modules/');
      const name = key.slice(lastNmIndex + 'node_modules/'.length);
      if (!pkg.version) continue;

      const version = pkg.version;
      const existing = packages.get(name) ?? [];
      if (!existing.some(e => e.version === version)) {
        existing.push({
          name,
          version,
          registryUrl: pkg.resolved,
          integrity: pkg.integrity,
          dev: pkg.dev === true,
        });
        packages.set(name, existing);
      }
    }

    // Second pass: extract edges
    for (const [key, pkg] of Object.entries(lockfile.packages)) {
      if (!key || !key.startsWith('node_modules/')) continue;
      if (pkg.link || !pkg.version) continue;
      if (!pkg.dependencies) continue;

      const lastNmIndex = key.lastIndexOf('node_modules/');
      const name = key.slice(lastNmIndex + 'node_modules/'.length);
      const nodeKey = `${name}@${pkg.version}`;

      const depEdges: string[] = [];
      for (const depName of Object.keys(pkg.dependencies)) {
        // Resolve: check nested first, then hoisted
        const nestedPath = `${key}/node_modules/${depName}`;
        const hoistedPath = `node_modules/${depName}`;

        const resolved =
          lockfile.packages[nestedPath] ?? lockfile.packages[hoistedPath];
        if (resolved?.version) {
          depEdges.push(`${depName}@${resolved.version}`);
        }
      }

      if (depEdges.length > 0) {
        const existing = edges.get(nodeKey) ?? [];
        existing.push(...depEdges);
        edges.set(nodeKey, existing);
      }
    }

    return { packages, edges, rootDeps };
  }

  // Fallback to v1 dependencies section
  if (lockfile.dependencies) {
    for (const [name, dep] of Object.entries(lockfile.dependencies)) {
      const existing = packages.get(name) ?? [];
      if (!existing.some(e => e.version === dep.version)) {
        existing.push({
          name,
          version: dep.version,
          registryUrl: dep.resolved,
          integrity: dep.integrity,
          dev: dep.dev === true,
        });
        packages.set(name, existing);
      }
    }
  }

  return { packages, edges, rootDeps };
}
