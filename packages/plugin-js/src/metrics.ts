import type { DependencyMetrics, ParsedDependency } from 'dependency-digest';
import type { Vulnerability } from '@digests/github-utils';
import { fetchGitHubMetrics } from '@digests/github-utils';
import { fetchNpmRegistryData } from './npm-registry.js';
import semver from 'semver';

function isAffectedByVulnerability(
  installedVersion: string,
  vulnerableRange: string
): boolean {
  if (vulnerableRange === 'unknown') return true;

  const parsed = semver.valid(semver.coerce(installedVersion));
  if (!parsed) return true; // can't determine, include to be safe

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

function buildPurl(ecosystem: string, name: string, version: string): string {
  if (ecosystem === 'npm') {
    const encoded = name.startsWith('@')
      ? name.replace('@', '%40').replace('/', '%2F')
      : name;
    return `pkg:npm/${encoded}@${version}`;
  }
  return `pkg:${ecosystem}/${name}@${version}`;
}

export async function fetchDependencyMetrics(
  dep: ParsedDependency,
  token?: string
): Promise<DependencyMetrics> {
  const npmData = await fetchNpmRegistryData(dep.name);
  const ghData = await fetchGitHubMetrics(npmData.repoUrl, dep.name, token);

  return {
    name: dep.name,
    version: dep.version,
    specifier: dep.specifier,
    dev: dep.dev,
    transitive: dep.transitive,
    includedBy: dep.includedBy,
    ecosystem: 'npm',
    purl: buildPurl('npm', dep.name, dep.version),
    author: npmData.author,
    license: npmData.license,
    description: npmData.description,
    latestVersion: npmData.latestVersion,
    repoUrl: npmData.repoUrl,
    lastMajorDate: npmData.lastMajorDate,
    lastPatchDate: npmData.lastPatchDate,
    lastCommitDate: ghData.lastCommitDate,
    lastIssueOpened: ghData.lastIssueOpened,
    lastPrOpened: ghData.lastPrOpened,
    openIssueCount: ghData.openIssueCount,
    openPrCount: ghData.openPrCount,
    downloads: npmData.weeklyDownloads,
    pinnedIssues: ghData.pinnedIssues,
    vulnerabilities: filterApplicableVulnerabilities(
      ghData.vulnerabilities,
      dep.version
    ),
  };
}
