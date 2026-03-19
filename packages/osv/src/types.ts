/** OSV API query request body. */
export interface OsvQuery {
  package: {
    name: string;
    ecosystem: string;
  };
  version: string;
}

/** A single affected range event from the OSV response. */
export interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

/** An affected range from the OSV response. */
export interface OsvRange {
  type: 'SEMVER' | 'ECOSYSTEM' | 'GIT';
  events: OsvEvent[];
}

/** An affected entry from the OSV response. */
export interface OsvAffected {
  package: {
    name: string;
    ecosystem: string;
    purl?: string;
  };
  ranges?: OsvRange[];
  versions?: string[];
  ecosystem_specific?: Record<string, unknown>;
  database_specific?: Record<string, unknown>;
}

/** CVSS severity from the OSV response. */
export interface OsvSeverity {
  type: 'CVSS_V2' | 'CVSS_V3' | 'CVSS_V4';
  score: string;
}

/** A reference link from the OSV response. */
export interface OsvReference {
  type: 'ADVISORY' | 'ARTICLE' | 'DETECTION' | 'DISCUSSION' | 'REPORT' | 'FIX' | 'INTRODUCED' | 'PACKAGE' | 'EVIDENCE' | 'WEB';
  url: string;
}

/** A single vulnerability from the OSV response. */
export interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  modified: string;
  published?: string;
  withdrawn?: string;
  severity?: OsvSeverity[];
  affected?: OsvAffected[];
  references?: OsvReference[];
  database_specific?: Record<string, unknown>;
}

/** OSV API query response. */
export interface OsvQueryResponse {
  vulns?: OsvVulnerability[];
}
