import type { ResolvedDependency } from './types.js';

export function parsePnpmLockfile(content: string): Map<string, ResolvedDependency[]> {
  const result = new Map<string, ResolvedDependency[]>();

  try {
    const packagesSection = extractPackagesSection(content);
    if (!packagesSection) return result;

    // Parse each package entry
    // v9: "react@19.0.0:" or "@scope/pkg@1.0.0:"
    // v5-v6: "/react@19.0.0:" or "/@scope/pkg@1.0.0:"
    const packagePattern = /^  '?[/]?(@?[^@\s']+)@([^:('"\s]+)/gm;
    let match: RegExpExecArray | null;

    while ((match = packagePattern.exec(packagesSection)) !== null) {
      const name = match[1];
      const version = match[2];

      // Extract resolution metadata from subsequent lines
      const entryStart = match.index;
      const lines = packagesSection.slice(entryStart).split('\n');
      let entryEnd = packagesSection.length;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].match(/^  \S/)) {
          entryEnd = entryStart + lines.slice(0, i).join('\n').length;
          break;
        }
      }

      const entryBlock = packagesSection.slice(entryStart, entryEnd);

      const integrity = extractValue(entryBlock, 'integrity');
      const tarball = extractValue(entryBlock, 'tarball');

      const existing = result.get(name) ?? [];
      if (!existing.some(e => e.version === version)) {
        existing.push({
          name,
          version,
          integrity: integrity ?? undefined,
          registryUrl: tarball ?? undefined,
          dev: false,
        });
        result.set(name, existing);
      }
    }
  } catch {
    // Return whatever we've parsed so far
  }

  return result;
}

function extractPackagesSection(content: string): string | null {
  // Find the "packages:" line at root level (no indentation)
  const packagesIndex = content.indexOf('\npackages:\n');
  if (packagesIndex === -1) return null;

  const afterPackages = content.slice(packagesIndex + '\npackages:\n'.length);

  // The packages section ends at the next root-level key or EOF
  const nextRootKey = afterPackages.search(/^\S/m);
  return nextRootKey === -1 ? afterPackages : afterPackages.slice(0, nextRootKey);
}

function extractValue(block: string, key: string): string | null {
  // Match patterns like: integrity: sha512-abc or {integrity: sha512-abc, tarball: https://...}
  const patterns = [
    new RegExp(`${key}:\\s*([^,}\\s]+)`),
    new RegExp(`${key}: '([^']+)'`),
    new RegExp(`${key}: "([^"]+)"`),
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match) return match[1];
  }

  return null;
}
