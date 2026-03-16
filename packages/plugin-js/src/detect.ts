import { readdir } from 'fs/promises';
import { join } from 'path';
import type { ManifestFile } from 'dependency-digest';
import { LOCKFILE_PRIORITY } from './lockfile/types.js';

export async function detectManifests(dir: string): Promise<ManifestFile[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const fileNames = new Set(
      entries.filter((e) => e.isFile()).map((e) => e.name)
    );

    if (!fileNames.has('package.json')) return [];

    const lockfileType =
      LOCKFILE_PRIORITY.find((l) => fileNames.has(l.filename))?.filename ??
      'package.json';

    return [{ path: join(dir, 'package.json'), type: lockfileType }];
  } catch {
    return [];
  }
}
