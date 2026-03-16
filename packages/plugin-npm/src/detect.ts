import { readdir } from 'fs/promises';
import { join } from 'path';
import type { ManifestFile } from 'dependency-digest';

export async function detectPackageJsonFiles(
  dir: string
): Promise<ManifestFile[]> {
  const manifests: ManifestFile[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'package.json' && entry.isFile()) {
        manifests.push({
          path: join(dir, entry.name),
          type: 'package.json',
        });
      }
    }
  } catch {
    // Directory not readable
  }

  return manifests;
}
