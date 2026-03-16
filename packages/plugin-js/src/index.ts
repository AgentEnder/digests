import type { DependencyDigestPlugin } from 'dependency-digest';

const plugin: DependencyDigestPlugin = {
  name: 'js',
  ecosystem: 'npm',

  async detect(_dir) {
    return [];
  },

  async parseDependencies(_manifest) {
    return [];
  },

  async fetchMetrics(dep) {
    return {
      name: dep.name,
      ecosystem: 'npm',
      currentVersion: dep.versionRange,
      latestVersion: 'unknown',
      repoUrl: null,
      lastMajorDate: null,
      lastPatchDate: null,
      lastCommitDate: null,
      lastIssueOpened: null,
      lastIssueClosed: null,
      lastPrOpened: null,
      lastPrClosed: null,
      openIssueCount: 0,
      openPrCount: 0,
      downloads: null,
      pinnedIssues: [],
      vulnerabilities: [],
    };
  },
};

export default plugin;
export { plugin };
