import type { DependencyMetrics, ParsedDependency } from 'dependency-digest';
import type { Vulnerability } from '@digests/osv';
import { fetchGitHubMetrics } from '@digests/github-utils';
import { fetchVulnerabilities } from '@digests/osv';
import { fetchMavenCentralData } from './maven-central.js';
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
  const [groupId, artifactId] = name.split(':');
  return `pkg:maven/${groupId}/${artifactId}@${version}`;
}

export async function fetchDependencyMetrics(
  dep: ParsedDependency,
  token?: string
): Promise<DependencyMetrics> {
  const centralData = await fetchMavenCentralData(dep.name);
  const [ghData, vulnerabilities] = await Promise.all([
    fetchGitHubMetrics(centralData.repoUrl, token),
    fetchVulnerabilities('Maven', dep.name, dep.version),
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
    ecosystem: 'maven',
    purl: buildPurl(dep.name, dep.version),
    author: centralData.author,
    license: centralData.license,
    description: centralData.description,
    latestVersion: centralData.latestVersion,
    repoUrl: centralData.repoUrl,
    lastMajorDate: centralData.lastMajorDate,
    lastPatchDate: centralData.lastPatchDate,
    lastCommitDate: ghData.lastCommitDate,
    lastIssueOpened: ghData.lastIssueOpened,
    lastPrOpened: ghData.lastPrOpened,
    openIssueCount: ghData.openIssueCount,
    openPrCount: ghData.openPrCount,
    downloads: centralData.weeklyDownloads,
    pinnedIssues: ghData.pinnedIssues,
    vulnerabilities: filterApplicableVulnerabilities(
      vulnerabilities,
      dep.version
    ),
  };
}
