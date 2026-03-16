import type { ResolvedDependency } from './types.js';

interface NpmLockfileV3Package {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  link?: boolean;
}

interface NpmLockfileV1Dependency {
  version: string;
  resolved?: string;
  integrity?: string;
}

interface NpmLockfile {
  lockfileVersion?: number;
  packages?: Record<string, NpmLockfileV3Package>;
  dependencies?: Record<string, NpmLockfileV1Dependency>;
}

export function parseNpmLockfile(content: string): Map<string, ResolvedDependency> {
  const result = new Map<string, ResolvedDependency>();

  let lockfile: NpmLockfile;
  try {
    lockfile = JSON.parse(content);
  } catch {
    return result;
  }

  // Prefer v2/v3 packages section
  if (lockfile.packages) {
    for (const [key, pkg] of Object.entries(lockfile.packages)) {
      if (!key || !key.startsWith('node_modules/')) continue;
      if (pkg.link) continue;

      // Only take top-level (hoisted) deps: "node_modules/name" not "node_modules/x/node_modules/name"
      const withoutPrefix = key.slice('node_modules/'.length);
      if (withoutPrefix.includes('node_modules/')) continue;

      const name = withoutPrefix;
      if (!pkg.version) continue;

      result.set(name, {
        name,
        version: pkg.version,
        registryUrl: pkg.resolved,
        integrity: pkg.integrity,
      });
    }
    return result;
  }

  // Fallback to v1 dependencies section
  if (lockfile.dependencies) {
    for (const [name, dep] of Object.entries(lockfile.dependencies)) {
      result.set(name, {
        name,
        version: dep.version,
        registryUrl: dep.resolved,
        integrity: dep.integrity,
      });
    }
  }

  return result;
}
