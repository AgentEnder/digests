import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { DigestConfig, DigestOutput, LicenseOverride } from './types.js';

const CONFIG_FILENAMES = [
  'dependency-digest.config.json',
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

export async function saveConfig(
  dir: string,
  config: DigestConfig
): Promise<void> {
  const filePath = join(dir, 'dependency-digest.config.json');
  await writeFile(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function isLicenseAllowed(
  license: string | null,
  config: DigestConfig
): boolean {
  const allowed = config.allowedLicenses;
  const compatible = config.compatibleLicenses;
  const hasPolicy = (allowed && allowed.length > 0) || (compatible && compatible.length > 0);
  if (!hasPolicy) return true;
  if (!license) return false;

  const normalized = license.toUpperCase();
  if (allowed?.some((a) => a.toUpperCase() === normalized)) return true;
  if (compatible?.some((c) => c.toUpperCase() === normalized)) return true;
  return false;
}

function resolveLicenseOverride(override: LicenseOverride): string {
  return typeof override === 'string' ? override : override.license;
}

export function applyLicenseOverrides(
  digest: DigestOutput,
  overrides: Record<string, LicenseOverride> | undefined
): DigestOutput {
  if (!overrides || Object.keys(overrides).length === 0) return digest;

  return {
    ...digest,
    manifests: digest.manifests.map((m) => ({
      ...m,
      dependencies: m.dependencies.map((dep) => {
        // Check "name@version" first, then "name"
        const exactKey = `${dep.name}@${dep.version}`;
        const override = overrides[exactKey] ?? overrides[dep.name];
        if (!override) return dep;
        return { ...dep, license: resolveLicenseOverride(override) };
      }),
    })),
  };
}
