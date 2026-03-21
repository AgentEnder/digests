import { withCache } from '@digests/github-utils';

export interface CratesRegistryData {
  latestVersion: string;
  license: string | null;
  description: string | null;
  repoUrl: string | null;
  lastMajorDate: string | null;
  lastPatchDate: string | null;
  weeklyDownloads: number | null;
  author: string | null;
}

interface CrateResponse {
  crate?: {
    max_version?: string;
    max_stable_version?: string;
    description?: string;
    repository?: string;
    recent_downloads?: number;
  };
  versions?: Array<{
    num: string;
    created_at: string;
    published_by?: { name?: string; login?: string } | null;
  }>;
}

function findLastMajorDate(
  versions: Array<{ num: string; created_at: string }>
): string | null {
  const majorVersions = versions.filter((v) => {
    const parts = v.num.split('.');
    return (
      parts.length >= 3 &&
      !v.num.includes('-') &&
      parts[1] === '0' &&
      parts[2] === '0'
    );
  });

  if (majorVersions.length === 0) return null;

  const sorted = majorVersions.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sorted[0].created_at;
}

function findLastPatchDate(
  versions: Array<{ num: string; created_at: string }>,
  latestVersion: string
): string | null {
  const match = versions.find((v) => v.num === latestVersion);
  return match?.created_at ?? null;
}

async function fetchCratesRegistryDataUncached(
  crateName: string
): Promise<CratesRegistryData> {
  const url = `https://crates.io/api/v1/crates/${crateName}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'dependency-digest (https://github.com/AgentEnder/digests)',
    },
  });

  if (!response.ok) {
    return {
      latestVersion: 'unknown',
      license: null,
      description: null,
      repoUrl: null,
      lastMajorDate: null,
      lastPatchDate: null,
      weeklyDownloads: null,
      author: null,
    };
  }

  const data = (await response.json()) as CrateResponse;
  const latestVersion =
    data.crate?.max_stable_version ?? data.crate?.max_version ?? 'unknown';

  const versions = data.versions ?? [];

  // Find the author from the latest version's publisher
  const latestVersionEntry = versions.find((v) => v.num === latestVersion);
  const author =
    latestVersionEntry?.published_by?.name ??
    latestVersionEntry?.published_by?.login ??
    null;

  // Get license from the latest version — crates.io doesn't expose it on the crate object directly,
  // so we rely on cargo metadata's license field (passed through from the package).
  // For the registry, we just return null and let the metrics layer prefer cargo metadata's value.

  return {
    latestVersion,
    license: null,
    description: data.crate?.description ?? null,
    repoUrl: data.crate?.repository ?? null,
    lastMajorDate: findLastMajorDate(versions),
    lastPatchDate: findLastPatchDate(versions, latestVersion),
    weeklyDownloads: data.crate?.recent_downloads ?? null,
    author,
  };
}

export async function fetchCratesRegistryData(
  crateName: string
): Promise<CratesRegistryData> {
  return withCache<CratesRegistryData>(
    'crates-registry',
    crateName,
    () => fetchCratesRegistryDataUncached(crateName),
    { shouldCache: (result) => result.latestVersion !== 'unknown' }
  );
}
