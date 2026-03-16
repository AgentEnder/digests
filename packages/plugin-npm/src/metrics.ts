import type { DependencyMetrics, ParsedDependency } from 'dependency-digest';
import { fetchNpmRegistryData } from './npm-registry.js';
import { fetchGitHubMetrics } from './github-metrics.js';

export async function fetchDependencyMetrics(
  dep: ParsedDependency,
  token?: string
): Promise<DependencyMetrics> {
  const npmData = await fetchNpmRegistryData(dep.name);
  const ghData = await fetchGitHubMetrics(
    npmData.repoUrl,
    dep.name,
    token
  );

  return {
    name: dep.name,
    ecosystem: 'npm',
    currentVersion: dep.versionRange,
    latestVersion: npmData.latestVersion,
    repoUrl: npmData.repoUrl,
    lastMajorDate: npmData.lastMajorDate,
    lastPatchDate: npmData.lastPatchDate,
    lastCommitDate: ghData.lastCommitDate,
    lastIssueOpened: ghData.lastIssueOpened,
    lastIssueClosed: ghData.lastIssueClosed,
    lastPrOpened: ghData.lastPrOpened,
    lastPrClosed: ghData.lastPrClosed,
    openIssueCount: ghData.openIssueCount,
    openPrCount: ghData.openPrCount,
    downloads: npmData.weeklyDownloads,
    pinnedIssues: ghData.pinnedIssues,
    vulnerabilities: ghData.vulnerabilities,
  };
}
