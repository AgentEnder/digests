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
  dev?: boolean;
}

interface NpmLockfile {
  lockfileVersion?: number;
  packages?: Record<string, NpmLockfileV3Package>;
  dependencies?: Record<string, NpmLockfileV1Dependency>;
}

export function parseNpmLockfile(content: string): Map<string, ResolvedDependency[]> {
  const result = new Map<string, ResolvedDependency[]>();

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

      // Extract the package name from the last node_modules/ segment
      const lastNmIndex = key.lastIndexOf('node_modules/');
      const name = key.slice(lastNmIndex + 'node_modules/'.length);
      if (!pkg.version) continue;

      const version = pkg.version;
      const existing = result.get(name) ?? [];
      if (!existing.some(e => e.version === version)) {
        existing.push({
          name,
          version,
          registryUrl: pkg.resolved,
          integrity: pkg.integrity,
          dev: pkg.dev === true,
        });
        result.set(name, existing);
      }
    }
    return result;
  }

  // Fallback to v1 dependencies section
  if (lockfile.dependencies) {
    for (const [name, dep] of Object.entries(lockfile.dependencies)) {
      const existing = result.get(name) ?? [];
      if (!existing.some(e => e.version === dep.version)) {
        existing.push({
          name,
          version: dep.version,
          registryUrl: dep.resolved,
          integrity: dep.integrity,
          dev: dep.dev === true,
        });
        result.set(name, existing);
      }
    }
  }

  return result;
}
