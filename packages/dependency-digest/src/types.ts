export interface ManifestFile {
  /** Absolute path to the manifest file */
  path: string;
  /** e.g. "package.json", "pom.xml" */
  type: string;
}

export interface ParsedDependency {
  /** Package name as it appears in the manifest */
  name: string;
  /** Resolved version (e.g. "19.0.0") */
  version: string;
  /** Original version range from manifest (e.g. "^19.0.0"), absent for transitives */
  specifier?: string;
  /** Whether this is a development dependency */
  dev: boolean;
  /** Whether this is a transitive (indirect) dependency */
  transitive: boolean;
  /** Registry URL from lockfile (e.g. tarball URL) */
  registryUrl?: string;
  /** Integrity hash from lockfile */
  integrity?: string;
}

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
  /** Resolved version */
  version: string;
  /** Original specifier from manifest */
  specifier?: string;
  dev: boolean;
  transitive: boolean;
  ecosystem: string;
  latestVersion: string;
  repoUrl: string | null;
  lastMajorDate: string | null;
  lastPatchDate: string | null;
  lastCommitDate: string | null;
  lastIssueOpened: string | null;
  lastIssueClosed: string | null;
  lastPrOpened: string | null;
  lastPrClosed: string | null;
  openIssueCount: number;
  openPrCount: number;
  downloads: number | null;
  pinnedIssues: string[];
  vulnerabilities: Vulnerability[];
}

export interface DependencyDigestPlugin {
  /** Plugin name, e.g. "npm" */
  name: string;
  /** Ecosystem identifier, e.g. "npm", "maven", "nuget" */
  ecosystem: string;

  /** Detect manifest files for this ecosystem in the given directory */
  detect(dir: string): Promise<ManifestFile[]>;

  /** Parse dependency entries from a manifest file */
  parseDependencies(manifest: ManifestFile): Promise<ParsedDependency[]>;

  /** Fetch health metrics for a single dependency */
  fetchMetrics(
    dep: ParsedDependency,
    token?: string
  ): Promise<DependencyMetrics>;
}

export interface ManifestDigest {
  file: string;
  ecosystem: string;
  dependencies: DependencyMetrics[];
}

export interface DigestOutput {
  scannedAt: string;
  manifests: ManifestDigest[];
}
