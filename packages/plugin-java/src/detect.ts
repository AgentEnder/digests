import { readdir } from 'fs/promises';
import { join } from 'path';
import type { ManifestFile } from 'dependency-digest';

export async function detectManifests(dir: string): Promise<ManifestFile[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const fileNames = new Set(
      entries.filter((e) => e.isFile()).map((e) => e.name)
    );

    const manifests: ManifestFile[] = [];

    if (fileNames.has('pom.xml')) {
      manifests.push({ path: join(dir, 'pom.xml'), type: 'pom.xml' });
    }

    if (fileNames.has('build.gradle.kts')) {
      manifests.push({
        path: join(dir, 'build.gradle.kts'),
        type: 'build.gradle.kts',
      });
    } else if (fileNames.has('build.gradle')) {
      manifests.push({
        path: join(dir, 'build.gradle'),
        type: 'build.gradle',
      });
    }

    return manifests;
  } catch {
    return [];
  }
}
