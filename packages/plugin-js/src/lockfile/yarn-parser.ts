import type { ResolvedDependency } from './types.js';

export function parseYarnLockfile(content: string): Map<string, ResolvedDependency[]> {
  const result = new Map<string, ResolvedDependency[]>();
  if (!content.trim()) return result;

  const isBerry = content.includes('__metadata:');

  if (isBerry) {
    return parseYarnBerry(content);
  }
  return parseYarnClassic(content);
}

function parseYarnClassic(content: string): Map<string, ResolvedDependency[]> {
  const result = new Map<string, ResolvedDependency[]>();

  // Split into blocks: each block starts with an unindented line and continues with indented lines
  const blocks = content.split(/\n(?=\S)/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const header = lines[0];
    // Skip comments
    if (header.startsWith('#')) continue;

    // Extract package name from header like: react@^19.0.0: or "react@^19.0.0", "react@^18.0.0":
    const name = extractPackageName(header);
    if (!name) continue;

    let version: string | undefined;
    let resolved: string | undefined;
    let integrity: string | undefined;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('version ')) {
        version = unquote(trimmed.slice('version '.length));
      } else if (trimmed.startsWith('resolved ')) {
        resolved = unquote(trimmed.slice('resolved '.length));
      } else if (trimmed.startsWith('integrity ')) {
        integrity = unquote(trimmed.slice('integrity '.length));
      }
    }

    if (name && version) {
      const existing = result.get(name) ?? [];
      if (!existing.some(e => e.version === version)) {
        existing.push({ name, version, registryUrl: resolved, integrity, dev: false });
        result.set(name, existing);
      }
    }
  }

  return result;
}

function parseYarnBerry(content: string): Map<string, ResolvedDependency[]> {
  const result = new Map<string, ResolvedDependency[]>();
  const blocks = content.split(/\n(?=\S)/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const header = lines[0];
    if (header.startsWith('#') || header.startsWith('__metadata:')) continue;

    // Berry header: "react@npm:^19.0.0":
    const name = extractPackageName(header);
    if (!name) continue;

    let version: string | undefined;
    let checksum: string | undefined;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('version: ')) {
        version = trimmed.slice('version: '.length).trim();
      } else if (trimmed.startsWith('checksum: ')) {
        checksum = trimmed.slice('checksum: '.length).trim();
      }
    }

    if (name && version) {
      const existing = result.get(name) ?? [];
      if (!existing.some(e => e.version === version)) {
        existing.push({ name, version, integrity: checksum, dev: false });
        result.set(name, existing);
      }
    }
  }

  return result;
}

function extractPackageName(header: string): string | null {
  // Remove trailing colon
  const cleaned = header.replace(/:$/, '').trim();

  // Handle quoted entries: "@scope/pkg@npm:^1.0.0", "@scope/pkg@^1.0.0"
  // Handle unquoted entries: react@^19.0.0
  // May have multiple ranges: lodash@^4.17.0, lodash@^4.17.21

  // Take the first entry (before any comma)
  const firstEntry = cleaned.split(',')[0].trim().replace(/^"|"$/g, '');

  // Split on last @ that isn't part of a scope
  // For "@scope/pkg@^1.0.0" -> "@scope/pkg"
  // For "react@^19.0.0" -> "react"
  // For "@scope/pkg@npm:^1.0.0" -> "@scope/pkg"
  const atIndex = firstEntry.startsWith('@')
    ? firstEntry.indexOf('@', 1)
    : firstEntry.indexOf('@');

  if (atIndex === -1) return null;

  return firstEntry.slice(0, atIndex);
}

function unquote(s: string): string {
  return s.replace(/^"|"$/g, '').trim();
}
