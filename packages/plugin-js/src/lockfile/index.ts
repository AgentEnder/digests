import { readFile } from 'fs/promises';
import { join } from 'path';
import type { ResolvedDependency } from './types.js';
import { parseNpmLockfile } from './npm-parser.js';
import { parseYarnLockfile } from './yarn-parser.js';
import { parsePnpmLockfile } from './pnpm-parser.js';
import { parseBunLockfile } from './bun-parser.js';

export type { ResolvedDependency, LockfileData, LockfileType } from './types.js';

export async function parseLockfile(
  dir: string,
  lockfileType: string
): Promise<Map<string, ResolvedDependency[]>> {
  if (lockfileType === 'package.json') {
    return new Map();
  }

  try {
    const content = await readFile(join(dir, lockfileType), 'utf-8');

    switch (lockfileType) {
      case 'package-lock.json':
        return parseNpmLockfile(content);
      case 'yarn.lock':
        return parseYarnLockfile(content);
      case 'pnpm-lock.yaml':
        return parsePnpmLockfile(content);
      case 'bun.lock':
      case 'bun.lockb':
        return parseBunLockfile(content);
      default:
        return new Map();
    }
  } catch {
    console.warn(
      `Could not parse lockfile (${lockfileType}), falling back to package.json versions`
    );
    return new Map();
  }
}
