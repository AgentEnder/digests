export interface NpmRegistryData {
  latestVersion: string;
  repoUrl: string | null;
  lastMajorDate: string | null;
  lastPatchDate: string | null;
  weeklyDownloads: number | null;
}

interface NpmPackageMetadata {
  'dist-tags'?: { latest?: string };
  repository?: { url?: string };
  time?: Record<string, string>;
}

function findLastMajorDate(
  time: Record<string, string>,
  _latestVersion: string
): string | null {
  const versions = Object.keys(time).filter(
    (k) => k !== 'created' && k !== 'modified'
  );
  const majorVersions = versions.filter((v) => {
    const parts = v.split('.');
    return (
      parts.length >= 3 &&
      !v.includes('-') &&
      (parts[1] === '0' && parts[2] === '0')
    );
  });

  if (majorVersions.length === 0) return null;

  const sorted = majorVersions.sort(
    (a, b) =>
      new Date(time[b]).getTime() - new Date(time[a]).getTime()
  );
  return time[sorted[0]] ?? null;
}

function findLastPatchDate(
  time: Record<string, string>,
  latestVersion: string
): string | null {
  return time[latestVersion] ?? null;
}

function cleanRepoUrl(url: string | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^ssh:\/\/git@/, 'https://');
}

export async function fetchNpmRegistryData(
  packageName: string
): Promise<NpmRegistryData> {
  const url = `https://registry.npmjs.org/${packageName}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return {
      latestVersion: 'unknown',
      repoUrl: null,
      lastMajorDate: null,
      lastPatchDate: null,
      weeklyDownloads: null,
    };
  }

  const data = (await response.json()) as NpmPackageMetadata;
  const latestVersion = data['dist-tags']?.latest ?? 'unknown';
  const time = data.time ?? {};

  const downloadsUrl = `https://api.npmjs.org/downloads/point/last-week/${packageName}`;
  let weeklyDownloads: number | null = null;
  try {
    const dlResponse = await fetch(downloadsUrl);
    if (dlResponse.ok) {
      const dlData = await dlResponse.json();
      weeklyDownloads = (dlData as { downloads?: number }).downloads ?? null;
    }
  } catch {
    // Ignore download fetch errors
  }

  return {
    latestVersion,
    repoUrl: cleanRepoUrl(data.repository?.url),
    lastMajorDate: findLastMajorDate(time, latestVersion),
    lastPatchDate: findLastPatchDate(time, latestVersion),
    weeklyDownloads,
  };
}
