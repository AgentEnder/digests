import { readFile } from 'fs/promises';
import { join } from 'path';
import type { LockfileParseResult } from './types.js';
import { parseNpmLockfile } from './npm-parser.js';
import { parseYarnLockfile } from './yarn-parser.js';
import { parsePnpmLockfile } from './pnpm-parser.js';
import { parseBunLockfile } from './bun-parser.js';

export type { ResolvedDependency, LockfileParseResult, LockfileType } from './types.js';

const EMPTY_RESULT: LockfileParseResult = {
  packages: new Map(),
  edges: new Map(),
  rootDeps: new Map(),
};

export async function parseLockfile(
  dir: string,
  lockfileType: string
): Promise<LockfileParseResult> {
  if (lockfileType === 'package.json') {
    return { ...EMPTY_RESULT, packages: new Map(), edges: new Map(), rootDeps: new Map() };
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
        return { ...EMPTY_RESULT, packages: new Map(), edges: new Map(), rootDeps: new Map() };
    }
  } catch {
    console.warn(
      `Could not parse lockfile (${lockfileType}), falling back to package.json versions`
    );
    return { ...EMPTY_RESULT, packages: new Map(), edges: new Map(), rootDeps: new Map() };
  }
}
