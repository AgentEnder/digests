export interface ResolvedDependency {
  name: string;
  version: string;
  registryUrl?: string;
  integrity?: string;
  dev: boolean;
}

export interface LockfileData {
  lockfileType: LockfileType;
  dependencies: Map<string, ResolvedDependency[]>;
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
