import { withCache } from '@digests/github-utils';

export interface NuGetRegistryData {
  latestVersion: string;
  license: string | null;
  description: string | null;
  repoUrl: string | null;
  lastMajorDate: string | null;
  lastPatchDate: string | null;
  weeklyDownloads: number | null;
  author: string | null;
}

const DEFAULT_SOURCE = 'https://api.nuget.org/v3/index.json';

interface ServiceIndex {
  resources: Array<{
    '@id': string;
    '@type': string;
  }>;
}

interface RegistrationPage {
  items?: Array<{
    catalogEntry?: CatalogEntry;
  }>;
}

interface RegistrationIndex {
  items: Array<{
    '@id': string;
    items?: Array<{
      catalogEntry?: CatalogEntry;
    }>;
  }>;
}

interface CatalogEntry {
  id: string;
  version: string;
  description?: string;
  licenseExpression?: string;
  projectUrl?: string;
  authors?: string;
  published?: string;
}

interface SearchResult {
  data: Array<{
    id: string;
    version: string;
    totalDownloads: number;
  }>;
}

const serviceIndexCache = new Map<string, ServiceIndex>();

async function resolveServiceIndex(sourceUrl: string): Promise<ServiceIndex> {
  const cached = serviceIndexCache.get(sourceUrl);
  if (cached) return cached;

  const response = await fetch(sourceUrl, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch service index from ${sourceUrl}: ${response.status}`);
  }

  const index = (await response.json()) as ServiceIndex;
  serviceIndexCache.set(sourceUrl, index);
  return index;
}

function findResource(index: ServiceIndex, typePrefix: string): string | null {
  // Resources can have versioned types like "RegistrationsBaseUrl/3.6.0"
  const resource = index.resources.find((r) =>
    r['@type'].startsWith(typePrefix)
  );
  return resource?.['@id'] ?? null;
}

function findLastMajorDate(
  entries: CatalogEntry[]
): string | null {
  const majorVersions = entries.filter((e) => {
    const parts = e.version.split('.');
    return (
      parts.length >= 3 &&
      !e.version.includes('-') &&
      parts[1] === '0' &&
      parts[2] === '0'
    );
  });

  if (majorVersions.length === 0) return null;

  const sorted = majorVersions.sort(
    (a, b) =>
      new Date(b.published ?? 0).getTime() -
      new Date(a.published ?? 0).getTime()
  );
  return sorted[0].published ?? null;
}

function findLastPatchDate(
  entries: CatalogEntry[],
  latestVersion: string
): string | null {
  const match = entries.find((e) => e.version === latestVersion);
  return match?.published ?? null;
}

async function fetchNuGetRegistryDataUncached(
  packageName: string,
  sourceUrls: string[]
): Promise<NuGetRegistryData> {
  const defaults: NuGetRegistryData = {
    latestVersion: 'unknown',
    license: null,
    description: null,
    repoUrl: null,
    lastMajorDate: null,
    lastPatchDate: null,
    weeklyDownloads: null,
    author: null,
  };

  const sources = sourceUrls.length > 0 ? sourceUrls : [DEFAULT_SOURCE];

  for (const sourceUrl of sources) {
    try {
      const index = await resolveServiceIndex(sourceUrl);

      // Find registration base URL
      const registrationBase = findResource(index, 'RegistrationsBaseUrl');
      if (!registrationBase) continue;

      // Fetch registration index for the package
      const regUrl = `${registrationBase.replace(/\/$/, '')}/${packageName.toLowerCase()}/index.json`;
      const regResponse = await fetch(regUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!regResponse.ok) continue;

      const regIndex = (await regResponse.json()) as RegistrationIndex;

      // Collect all catalog entries across pages
      const allEntries: CatalogEntry[] = [];
      for (const page of regIndex.items) {
        let pageItems = page.items;

        // If items aren't inlined, fetch the page
        if (!pageItems) {
          const pageResponse = await fetch(page['@id'], {
            headers: { Accept: 'application/json' },
          });
          if (pageResponse.ok) {
            const pageData = (await pageResponse.json()) as RegistrationPage;
            pageItems = pageData.items;
          }
        }

        if (pageItems) {
          for (const item of pageItems) {
            if (item.catalogEntry) {
              allEntries.push(item.catalogEntry);
            }
          }
        }
      }

      if (allEntries.length === 0) continue;

      // Find the latest stable version
      const stableEntries = allEntries.filter(
        (e) => !e.version.includes('-')
      );
      const latestEntry =
        stableEntries.length > 0
          ? stableEntries[stableEntries.length - 1]
          : allEntries[allEntries.length - 1];

      const latestVersion = latestEntry.version;

      // Try to get download counts from search endpoint
      let weeklyDownloads: number | null = null;
      const searchBase = findResource(index, 'SearchQueryService');
      if (searchBase) {
        try {
          const searchUrl = `${searchBase}?q=packageid:${packageName}&take=1`;
          const searchResponse = await fetch(searchUrl, {
            headers: { Accept: 'application/json' },
          });
          if (searchResponse.ok) {
            const searchData = (await searchResponse.json()) as SearchResult;
            if (searchData.data.length > 0) {
              weeklyDownloads = searchData.data[0].totalDownloads;
            }
          }
        } catch {
          // Download count is optional
        }
      }

      return {
        latestVersion,
        license: latestEntry.licenseExpression ?? null,
        description: latestEntry.description ?? null,
        repoUrl: latestEntry.projectUrl ?? null,
        lastMajorDate: findLastMajorDate(allEntries),
        lastPatchDate: findLastPatchDate(allEntries, latestVersion),
        weeklyDownloads,
        author: latestEntry.authors ?? null,
      };
    } catch {
      // Try next source
      continue;
    }
  }

  return defaults;
}

export async function fetchNuGetRegistryData(
  packageName: string,
  sourceUrls: string[] = []
): Promise<NuGetRegistryData> {
  return withCache<NuGetRegistryData>(
    'nuget-registry',
    packageName,
    () => fetchNuGetRegistryDataUncached(packageName, sourceUrls),
    { shouldCache: (result) => result.latestVersion !== 'unknown' }
  );
}
