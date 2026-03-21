import { readdir } from 'fs/promises';
import { join } from 'path';
import type { ManifestFile } from 'dependency-digest';

export async function detectManifests(dir: string): Promise<ManifestFile[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const fileNames = new Set(
      entries.filter((e) => e.isFile()).map((e) => e.name)
    );

    if (!fileNames.has('Cargo.toml')) return [];

    const type = fileNames.has('Cargo.lock') ? 'Cargo.lock' : 'Cargo.toml';

    return [{ path: join(dir, 'Cargo.toml'), type }];
  } catch {
    return [];
  }
}
