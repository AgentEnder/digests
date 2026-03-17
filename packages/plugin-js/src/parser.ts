import { readFile } from 'fs/promises';
import { dirname } from 'path';
import type { ManifestFile, ParsedDependency } from 'dependency-digest';
import { parseLockfile } from './lockfile/index.js';

const SKIP_PROTOCOLS = ['workspace:', 'link:', 'file:', 'portal:'];

function shouldSkip(versionRange: string): boolean {
  return SKIP_PROTOCOLS.some((p) => versionRange.startsWith(p));
}

export async function parseManifest(
  manifest: ManifestFile
): Promise<ParsedDependency[]> {
  const content = await readFile(manifest.path, 'utf-8');
  const pkg = JSON.parse(content);
  const dir = dirname(manifest.path);

  const directDeps = new Map<string, { specifier: string; dev: boolean }>();

  for (const [name, specifier] of Object.entries(pkg.dependencies ?? {})) {
    if (typeof specifier === 'string' && !shouldSkip(specifier)) {
      directDeps.set(name, { specifier, dev: false });
    }
  }
  for (const [name, specifier] of Object.entries(pkg.devDependencies ?? {})) {
    if (typeof specifier === 'string' && !shouldSkip(specifier)) {
      directDeps.set(name, { specifier, dev: true });
    }
  }

  const lockfileVersions = await parseLockfile(dir, manifest.type);

  const deps: ParsedDependency[] = [];
  const seen = new Set<string>(); // track "name@version" to avoid dupes

  // Process all lockfile entries
  for (const [name, versions] of lockfileVersions) {
    for (const resolved of versions) {
      const key = `${name}@${resolved.version}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const direct = directDeps.get(name);
      deps.push({
        name,
        version: resolved.version,
        specifier: direct?.specifier,
        dev: direct ? direct.dev : resolved.dev,
        transitive: !direct,
        registryUrl: resolved.registryUrl,
        integrity: resolved.integrity,
      });
    }
  }

  // Add any direct deps not found in lockfile (fallback)
  for (const [name, { specifier, dev }] of directDeps) {
    if (!lockfileVersions.has(name)) {
      if (manifest.type !== 'package.json') {
        console.warn(
          `${name} not found in lockfile, using package.json range: ${specifier}`
        );
      }
      deps.push({
        name,
        version: specifier,
        specifier,
        dev,
        transitive: false,
      });
    }
  }

  return deps;
}
