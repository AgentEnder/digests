import type { ParsedDependency } from 'dependency-digest';

const SKIP_PROTOCOLS = ['workspace:', 'link:', 'file:', 'portal:'];

export function parsePackageJson(content: string): ParsedDependency[] {
  const pkg = JSON.parse(content);
  const deps: ParsedDependency[] = [];

  for (const group of ['dependencies', 'devDependencies'] as const) {
    const entries = pkg[group];
    if (!entries || typeof entries !== 'object') continue;

    for (const [name, versionRange] of Object.entries(entries)) {
      if (typeof versionRange !== 'string') continue;
      if (SKIP_PROTOCOLS.some((p) => versionRange.startsWith(p))) continue;
      deps.push({ name, versionRange, group });
    }
  }

  return deps;
}
