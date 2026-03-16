import type { ResolvedDependency } from './types.js';

interface BunLockfile {
  lockfileVersion?: number;
  workspaces?: Record<string, unknown>;
  packages?: Record<string, unknown[]>;
}

export function parseBunLockfile(
  content: string
): Map<string, ResolvedDependency> {
  const result = new Map<string, ResolvedDependency>();

  let lockfile: BunLockfile;
  try {
    lockfile = JSON.parse(content);
  } catch {
    return result;
  }

  if (!lockfile.packages) return result;

  for (const [, tuple] of Object.entries(lockfile.packages)) {
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

    // tuple[1] = tarball URL (for npm packages)
    // tuple[3] = integrity hash
    const registryUrl = typeof tuple[1] === 'string' ? tuple[1] : undefined;
    const integrity = typeof tuple[3] === 'string' ? tuple[3] : undefined;

    if (!result.has(name)) {
      result.set(name, { name, version, registryUrl, integrity });
    }
  }

  return result;
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
