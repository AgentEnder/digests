import type { LockfileParseResult, ResolvedDependency } from './types.js';

export function parsePnpmLockfile(content: string): LockfileParseResult {
  const packages = new Map<string, ResolvedDependency[]>();
  const edges = new Map<string, string[]>();
  const rootDeps = new Map<string, 'prod' | 'dev'>();

  try {
    // Parse packages section
    const packagesSection = extractSection(content, 'packages');
    if (packagesSection) {
      const packagePattern = /^  '?[/]?(@?[^@\s']+)@([^:('"\s]+)/gm;
      let match: RegExpExecArray | null;

      while ((match = packagePattern.exec(packagesSection)) !== null) {
        const name = match[1];
        const version = match[2];

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

        const existing = packages.get(name) ?? [];
        if (!existing.some(e => e.version === version)) {
          existing.push({
            name,
            version,
            integrity: integrity ?? undefined,
            registryUrl: tarball ?? undefined,
            dev: false,
          });
          packages.set(name, existing);
        }
      }
    }

    // Parse importers section for rootDeps
    const importersSection = extractSection(content, 'importers');
    if (importersSection) {
      parseImporters(importersSection, rootDeps);
    }

    // Parse snapshots section for edges
    const snapshotsSection = extractSection(content, 'snapshots');
    if (snapshotsSection) {
      parseSnapshots(snapshotsSection, edges);
    }
  } catch {
    // Return whatever we've parsed so far
  }

  return { packages, edges, rootDeps };
}

function extractSection(content: string, sectionName: string): string | null {
  const marker = `\n${sectionName}:\n`;
  const index = content.indexOf(marker);
  if (index === -1) return null;

  const afterSection = content.slice(index + marker.length);
  const nextRootKey = afterSection.search(/^\S/m);
  return nextRootKey === -1 ? afterSection : afterSection.slice(0, nextRootKey);
}

function parseImporters(
  section: string,
  rootDeps: Map<string, 'prod' | 'dev'>
): void {
  const lines = section.split('\n');
  let inRoot = false;
  let currentType: 'prod' | 'dev' | null = null;

  for (const line of lines) {
    // Look for '.':" at 2-space indent
    if (line.match(/^  '?\.['"]?:/)) {
      inRoot = true;
      continue;
    }

    if (!inRoot) continue;

    // A new 2-space indent entry means we left the root importer
    if (line.match(/^  \S/) && !line.match(/^  '?\.['"]?:/)) {
      break;
    }

    // 4-space indent: dependencies or devDependencies
    if (line === '    dependencies:') {
      currentType = 'prod';
      continue;
    }
    if (line === '    devDependencies:') {
      currentType = 'dev';
      continue;
    }

    // Another 4-space key means end of current block
    if (line.match(/^    \S/) && currentType !== null) {
      // Check if it's neither dependencies nor devDependencies
      if (
        !line.startsWith('    dependencies:') &&
        !line.startsWith('    devDependencies:')
      ) {
        currentType = null;
        continue;
      }
    }

    // 6-space indent: package name (under dependencies/devDependencies)
    if (currentType !== null) {
      const pkgMatch = line.match(/^      '?(@?[^:'\s]+)'?:/);
      if (pkgMatch) {
        rootDeps.set(pkgMatch[1], currentType);
      }
    }
  }
}

function parseSnapshots(
  section: string,
  edges: Map<string, string[]>
): void {
  const lines = section.split('\n');
  let currentKey: string | null = null;
  let inDeps = false;

  for (const line of lines) {
    // 2-space indent: snapshot entry key
    const entryMatch = line.match(/^  '?([^'\s][^']*?)'?:\s*(\{\})?$/);
    if (entryMatch) {
      // Clean the key: strip peer info in parens and quotes
      const rawKey = entryMatch[1];
      const cleanKey = rawKey.replace(/\(.*\)$/, '');
      currentKey = cleanKey;
      inDeps = false;

      // If entry is `{}`, it has no deps
      if (entryMatch[2] === '{}') {
        edges.set(currentKey, edges.get(currentKey) ?? []);
        currentKey = null;
        continue;
      }

      // Initialize edges for this key if not present
      if (!edges.has(currentKey)) {
        edges.set(currentKey, []);
      }
      continue;
    }

    if (currentKey === null) continue;

    // 4-space indent: sub-section
    if (line === '    dependencies:') {
      inDeps = true;
      continue;
    }

    // Another 4-space key ends the dependencies block
    if (line.match(/^    \S/) && line !== '    dependencies:') {
      inDeps = false;
      continue;
    }

    // 6-space indent within dependencies: dep entry
    if (inDeps) {
      const depMatch = line.match(/^      '?(@?[^:'\s]+)'?:\s*'?([^'\s]+)'?$/);
      if (depMatch) {
        const depName = depMatch[1];
        // Strip peer info in parens: "7.29.0(@babel/core@7.29.0)" → "7.29.0"
        const depVersion = depMatch[2].replace(/\(.*\)$/, '');
        const depKey = `${depName}@${depVersion}`;
        const existing = edges.get(currentKey) ?? [];
        existing.push(depKey);
        edges.set(currentKey, existing);
      }
    }
  }
}

function extractValue(block: string, key: string): string | null {
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
