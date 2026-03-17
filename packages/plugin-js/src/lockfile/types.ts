export interface ResolvedDependency {
  name: string;
  version: string;
  registryUrl?: string;
  integrity?: string;
  dev: boolean;
}

export interface LockfileParseResult {
  /** All resolved packages, keyed by name */
  packages: Map<string, ResolvedDependency[]>;
  /** Dependency edges: "name@version" → ["dep-name@version", ...] */
  edges: Map<string, string[]>;
  /** Root-level dependency classification from importers/workspace section */
  rootDeps: Map<string, 'prod' | 'dev'>;
}

export type LockfileType = 'npm' | 'yarn' | 'pnpm' | 'bun';

export const LOCKFILE_PRIORITY: Array<{
  filename: string;
  type: LockfileType;
}> = [
  { filename: 'bun.lock', type: 'bun' },
  { filename: 'bun.lockb', type: 'bun' },
  { filename: 'pnpm-lock.yaml', type: 'pnpm' },
  { filename: 'yarn.lock', type: 'yarn' },
  { filename: 'package-lock.json', type: 'npm' },
];
