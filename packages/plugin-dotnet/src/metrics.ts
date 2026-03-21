import type { DependencyMetrics, ParsedDependency } from 'dependency-digest';
import type { Vulnerability } from '@digests/osv';
import { fetchGitHubMetrics } from '@digests/github-utils';
import { fetchVulnerabilities } from '@digests/osv';
import { fetchNuGetRegistryData } from './nuget-registry.js';
import { getPackageSources } from './parser.js';
import semver from 'semver';

function isAffectedByVulnerability(
  installedVersion: string,
  vulnerableRange: string
): boolean {
  if (vulnerableRange === 'unknown') return true;

  const parsed = semver.valid(semver.coerce(installedVersion));
  if (!parsed) return true;

  return semver.satisfies(parsed, vulnerableRange);
}

function filterApplicableVulnerabilities(
  vulnerabilities: Vulnerability[],
  installedVersion: string
): Vulnerability[] {
  return vulnerabilities.filter((v) =>
    isAffectedByVulnerability(installedVersion, v.vulnerableRange)
  );
}

function buildPurl(name: string, version: string): string {
  return `pkg:nuget/${name}@${version}`;
}

export async function fetchDependencyMetrics(
  dep: ParsedDependency,
  token?: string
): Promise<DependencyMetrics> {
  const sources = getPackageSources();
  const registryData = await fetchNuGetRegistryData(dep.name, sources);

  const [ghData, vulnerabilities] = await Promise.all([
    fetchGitHubMetrics(registryData.repoUrl, token),
    fetchVulnerabilities('NuGet', dep.name, dep.version),
  ]);

  return {
    name: dep.name,
    version: dep.version,
    specifier: dep.specifier,
    dev: dep.dev,
    transitive: dep.transitive,
    includedBy: dep.includedBy,
    registryUrl: dep.registryUrl,
    integrity: dep.integrity,
    ecosystem: 'nuget',
    purl: buildPurl(dep.name, dep.version),
    author: registryData.author,
    license: registryData.license,
    description: registryData.description,
    latestVersion: registryData.latestVersion,
    repoUrl: registryData.repoUrl,
    lastMajorDate: registryData.lastMajorDate,
    lastPatchDate: registryData.lastPatchDate,
    lastCommitDate: ghData.lastCommitDate,
    lastIssueOpened: ghData.lastIssueOpened,
    lastPrOpened: ghData.lastPrOpened,
    openIssueCount: ghData.openIssueCount,
    openPrCount: ghData.openPrCount,
    downloads: registryData.weeklyDownloads,
    pinnedIssues: ghData.pinnedIssues,
    vulnerabilities: filterApplicableVulnerabilities(
      vulnerabilities,
      dep.version
    ),
  };
}
