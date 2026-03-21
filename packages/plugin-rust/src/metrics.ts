import type { DependencyMetrics, ParsedDependency } from 'dependency-digest';
import type { Vulnerability } from '@digests/osv';
import { fetchGitHubMetrics } from '@digests/github-utils';
import { fetchVulnerabilities } from '@digests/osv';
import { fetchCratesRegistryData } from './crates-registry.js';
import type { CargoPackage } from './cargo-metadata.js';
import semver from 'semver';

/** Stored license info from cargo metadata, keyed by "name@version" */
const cargoLicenseCache = new Map<string, string | null>();

export function cacheCargoLicenses(packages: CargoPackage[]): void {
  for (const pkg of packages) {
    if (pkg.source !== null) {
      cargoLicenseCache.set(`${pkg.name}@${pkg.version}`, pkg.license);
    }
  }
}

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
  return `pkg:cargo/${name}@${version}`;
}

export async function fetchDependencyMetrics(
  dep: ParsedDependency,
  token?: string
): Promise<DependencyMetrics> {
  const cratesData = await fetchCratesRegistryData(dep.name);
  const [ghData, vulnerabilities] = await Promise.all([
    fetchGitHubMetrics(cratesData.repoUrl, token),
    fetchVulnerabilities('cargo', dep.name, dep.version),
  ]);

  // Prefer license from cargo metadata (more reliable) over registry
  const cargoLicense = cargoLicenseCache.get(`${dep.name}@${dep.version}`);
  const license = cargoLicense ?? cratesData.license;

  return {
    name: dep.name,
    version: dep.version,
    specifier: dep.specifier,
    dev: dep.dev,
    transitive: dep.transitive,
    includedBy: dep.includedBy,
    registryUrl: dep.registryUrl,
    integrity: dep.integrity,
    ecosystem: 'cargo',
    purl: buildPurl(dep.name, dep.version),
    author: cratesData.author,
    license,
    description: cratesData.description,
    latestVersion: cratesData.latestVersion,
    repoUrl: cratesData.repoUrl,
    lastMajorDate: cratesData.lastMajorDate,
    lastPatchDate: cratesData.lastPatchDate,
    lastCommitDate: ghData.lastCommitDate,
    lastIssueOpened: ghData.lastIssueOpened,
    lastPrOpened: ghData.lastPrOpened,
    openIssueCount: ghData.openIssueCount,
    openPrCount: ghData.openPrCount,
    downloads: cratesData.weeklyDownloads,
    pinnedIssues: ghData.pinnedIssues,
    vulnerabilities: filterApplicableVulnerabilities(
      vulnerabilities,
      dep.version
    ),
  };
}
