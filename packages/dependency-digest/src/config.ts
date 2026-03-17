import { readFile } from 'fs/promises';
import { join } from 'path';
import type { DigestConfig } from './types.js';

const CONFIG_FILENAMES = [
  'dependency-digest.json',
  '.dependency-digestrc.json',
];

export async function loadConfig(dir: string): Promise<DigestConfig> {
  for (const filename of CONFIG_FILENAMES) {
    try {
      const content = await readFile(join(dir, filename), 'utf-8');
      return JSON.parse(content) as DigestConfig;
    } catch {
      // file not found or invalid, try next
    }
  }
  return {};
}

export function isLicenseAllowed(
  license: string | null,
  allowedLicenses: string[] | undefined
): boolean {
  if (!allowedLicenses || allowedLicenses.length === 0) return true;
  if (!license) return false;

  const normalized = license.toUpperCase();
  return allowedLicenses.some((allowed) => allowed.toUpperCase() === normalized);
}
