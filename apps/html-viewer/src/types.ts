export interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  title: string;
  url: string | null;
  vulnerableRange: string;
  patchedVersion: string | null;
}

export interface DependencyMetrics {
  name: string;
  version: string;
  specifier?: string;
  dev: boolean;
  transitive: boolean;
  ecosystem: string;
  registryUrl?: string;
  integrity?: string;
  purl: string;
  author: string | null;
  license: string | null;
  description: string | null;
  latestVersion: string;
  repoUrl: string | null;
  lastMajorDate: string | null;
  lastPatchDate: string | null;
  lastCommitDate: string | null;
  lastIssueOpened: string | null;
  lastPrOpened: string | null;
  openIssueCount: number;
  openPrCount: number;
  downloads: number | null;
  pinnedIssues: string[];
  vulnerabilities: Vulnerability[];
  includedBy?: string[][];
}

export interface ManifestDigest {
  file: string;
  ecosystem: string;
  dependencies: DependencyMetrics[];
  edges: Record<string, string[]>;
}

export interface DigestOutput {
  scannedAt: string;
  manifests: ManifestDigest[];
}
