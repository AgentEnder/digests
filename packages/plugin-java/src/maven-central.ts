import { withCache } from '@digests/github-utils';

export interface MavenCentralData {
  latestVersion: string;
  license: string | null;
  description: string | null;
  repoUrl: string | null;
  lastMajorDate: string | null;
  lastPatchDate: string | null;
  weeklyDownloads: number | null;
  author: string | null;
}

interface SolrDoc {
  id: string;
  g: string;
  a: string;
  v: string;
  p: string;
  timestamp: number;
  ec?: string[];
}

interface SolrResponse {
  response: {
    numFound: number;
    docs: SolrDoc[];
  };
}

function findLastMajorDate(
  versions: Array<{ version: string; timestamp: number }>
): string | null {
  const majorVersions = versions.filter((v) => {
    const parts = v.version.split('.');
    return (
      parts.length >= 3 &&
      !v.version.includes('-') &&
      parts[1] === '0' &&
      parts[2] === '0'
    );
  });

  if (majorVersions.length === 0) return null;

  const sorted = majorVersions.sort((a, b) => b.timestamp - a.timestamp);
  return new Date(sorted[0].timestamp).toISOString();
}

function findLastPatchDate(
  versions: Array<{ version: string; timestamp: number }>,
  latestVersion: string
): string | null {
  const match = versions.find((v) => v.version === latestVersion);
  return match ? new Date(match.timestamp).toISOString() : null;
}

/** Fetch the POM XML to extract license and SCM info */
async function fetchPomMetadata(
  groupId: string,
  artifactId: string,
  version: string
): Promise<{ license: string | null; repoUrl: string | null; description: string | null }> {
  const groupPath = groupId.replace(/\./g, '/');
  const url = `https://repo1.maven.org/maven2/${groupPath}/${artifactId}/${version}/${artifactId}-${version}.pom`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'dependency-digest (https://github.com/AgentEnder/digests)',
      },
    });

    if (!response.ok) return { license: null, repoUrl: null, description: null };

    const xml = await response.text();

    // Extract license name
    const licenseMatch = xml.match(
      /<licenses>\s*<license>\s*<name>([^<]+)<\/name>/
    );
    const license = licenseMatch?.[1]?.trim() ?? null;

    // Extract SCM URL (prefer scm > url > project url)
    const scmMatch = xml.match(/<scm>\s*<url>([^<]+)<\/url>/);
    const projectUrlMatch = xml.match(
      /<url>([^<]*github\.com[^<]*)<\/url>/
    );
    const repoUrl = scmMatch?.[1]?.trim() ?? projectUrlMatch?.[1]?.trim() ?? null;

    // Extract description
    // Match top-level <description> only (not nested inside <license> etc.)
    const descMatch = xml.match(
      /<project[^>]*>[\s\S]*?<description>([^<]+)<\/description>/
    );
    const description = descMatch?.[1]?.trim() ?? null;

    return { license, repoUrl, description };
  } catch {
    return { license: null, repoUrl: null, description: null };
  }
}

async function fetchMavenCentralDataUncached(
  groupId: string,
  artifactId: string
): Promise<MavenCentralData> {
  // Fetch latest version info
  const searchUrl = `https://search.maven.org/solrsearch/select?q=g:${encodeURIComponent(`"${groupId}"`)
  }+AND+a:${encodeURIComponent(`"${artifactId}"`)}&rows=1&wt=json`;

  const response = await fetch(searchUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'dependency-digest (https://github.com/AgentEnder/digests)',
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

  const data = (await response.json()) as SolrResponse;

  if (data.response.numFound === 0) {
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

  const latest = data.response.docs[0];
  const latestVersion = latest.v;

  // Fetch version history for date calculations
  const gavUrl = `https://search.maven.org/solrsearch/select?q=g:${encodeURIComponent(`"${groupId}"`)
  }+AND+a:${encodeURIComponent(`"${artifactId}"`)}&core=gav&rows=50&wt=json`;

  let versions: Array<{ version: string; timestamp: number }> = [];

  try {
    const gavResponse = await fetch(gavUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'dependency-digest (https://github.com/AgentEnder/digests)',
      },
    });

    if (gavResponse.ok) {
      const gavData = (await gavResponse.json()) as SolrResponse;
      versions = gavData.response.docs.map((d) => ({
        version: d.v,
        timestamp: d.timestamp,
      }));
    }
  } catch {
    // Version history is best-effort
  }

  // Fetch POM for license, repo URL, and description
  const pomData = await fetchPomMetadata(groupId, artifactId, latestVersion);

  return {
    latestVersion,
    license: pomData.license,
    description: pomData.description,
    repoUrl: pomData.repoUrl,
    lastMajorDate: findLastMajorDate(versions),
    lastPatchDate: findLastPatchDate(versions, latestVersion),
    weeklyDownloads: null, // Maven Central doesn't expose download stats in the search API
    author: null, // POM developers list is complex; GitHub metrics provide better author info
  };
}

export async function fetchMavenCentralData(
  name: string
): Promise<MavenCentralData> {
  const parts = name.split(':');
  if (parts.length !== 2) {
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

  const [groupId, artifactId] = parts;

  return withCache<MavenCentralData>(
    'maven-central',
    name,
    () => fetchMavenCentralDataUncached(groupId, artifactId),
    { shouldCache: (result) => result.latestVersion !== 'unknown' }
  );
}
