import { readdir } from 'fs/promises';
import { join, extname } from 'path';
import type { ManifestFile } from 'dependency-digest';

const PROJECT_EXTENSIONS = new Set(['.csproj', '.fsproj', '.vbproj']);

export async function detectManifests(dir: string): Promise<ManifestFile[]> {
  try {
    const manifests: ManifestFile[] = [];
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const parentDir = entry.parentPath ?? entry.path;
      const fullPath = join(parentDir, entry.name);

      // Skip files in node_modules, bin, obj directories
      if (/[/\\](node_modules|bin|obj)[/\\]/.test(fullPath)) continue;

      const ext = extname(entry.name).toLowerCase();

      if (PROJECT_EXTENSIONS.has(ext)) {
        manifests.push({ path: fullPath, type: ext.slice(1) });
      } else if (ext === '.sln') {
        manifests.push({ path: fullPath, type: 'sln' });
      }
    }

    // If we found .sln files, prefer those as entry points (they encompass projects)
    const slnFiles = manifests.filter((m) => m.type === 'sln');
    if (slnFiles.length > 0) return slnFiles;

    return manifests;
  } catch {
    return [];
  }
}
