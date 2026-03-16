import { readFile } from 'fs/promises';
import { dirname } from 'path';
import type { ManifestFile, ParsedDependency } from 'dependency-digest';
import { parseLockfile } from './lockfile/index.js';

const SKIP_PROTOCOLS = ['workspace:', 'link:', 'file:', 'portal:'];

export async function parseManifest(
  manifest: ManifestFile
): Promise<ParsedDependency[]> {
  const content = await readFile(manifest.path, 'utf-8');
  const pkg = JSON.parse(content);
  const dir = dirname(manifest.path);

  const lockfileVersions = await parseLockfile(dir, manifest.type);

  const deps: ParsedDependency[] = [];

  for (const group of ['dependencies', 'devDependencies'] as const) {
    const entries = pkg[group];
    if (!entries || typeof entries !== 'object') continue;

    for (const [name, versionRange] of Object.entries(entries)) {
      if (typeof versionRange !== 'string') continue;
      if (SKIP_PROTOCOLS.some((p) => versionRange.startsWith(p))) continue;

      const resolved = lockfileVersions.get(name);
      if (resolved) {
        deps.push({ name, versionRange: resolved.version, group });
      } else {
        if (manifest.type !== 'package.json') {
          console.warn(
            `${name} not found in lockfile, using package.json range: ${versionRange}`
          );
        }
        deps.push({ name, versionRange, group });
      }
    }
  }

  return deps;
}
