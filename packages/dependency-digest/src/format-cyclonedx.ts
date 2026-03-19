import { randomUUID } from 'crypto';
import type { DependencyMetrics, DigestOutput, Vulnerability } from './types.js';

export function formatDigestAsCycloneDX(digest: DigestOutput): string {
  const allDeps = digest.manifests.flatMap((m) => m.dependencies);
  const allEdges: Record<string, string[]> = {};
  for (const m of digest.manifests) {
    Object.assign(allEdges, m.edges);
  }

  // Build purl lookup for edge resolution
  const purlByKey = new Map<string, string>();
  for (const dep of allDeps) {
    purlByKey.set(`${dep.name}@${dep.version}`, dep.purl);
  }

  // Root application component
  const rootRef = `urn:uuid:${randomUUID()}`;
  const directDepPurls = allDeps
    .filter((d) => !d.transitive)
    .map((d) => d.purl);

  const vulnerabilities = allDeps.flatMap((dep) =>
    dep.vulnerabilities.map((v) => formatVulnerability(v, dep.purl))
  );

  const bom: Record<string, unknown> = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    serialNumber: `urn:uuid:${randomUUID()}`,
    metadata: {
      timestamp: digest.scannedAt,
      tools: [
        { vendor: 'digests', name: 'dependency-digest', version: '0.1.0' },
      ],
      component: {
        type: 'application',
        name: digest.manifests[0]?.file ?? 'unknown',
        'bom-ref': rootRef,
      },
    },
    components: allDeps.map((dep) => formatComponent(dep)),
    dependencies: [
      // Root application depends on direct deps
      { ref: rootRef, dependsOn: directDepPurls },
      // Package-level dependency graph
      ...formatDependencies(allEdges, purlByKey),
    ],
  };

  if (vulnerabilities.length > 0) {
    bom.vulnerabilities = vulnerabilities;
  }

  return JSON.stringify(bom, null, 2);
}

function formatComponent(dep: DependencyMetrics) {
  const component: Record<string, unknown> = {
    type: 'library',
    'bom-ref': dep.purl,
    name: dep.name,
    version: dep.version,
    purl: dep.purl,
    scope: dep.dev ? 'optional' : 'required',
  };

  if (dep.description) component.description = dep.description;
  if (dep.author) component.author = dep.author;

  if (dep.license) {
    component.licenses = [{ license: { id: dep.license } }];
  }

  const hashes = parseIntegrity(dep.integrity);
  if (hashes) component.hashes = [hashes];

  const externalRefs: Array<Record<string, string>> = [];
  if (dep.repoUrl) externalRefs.push({ type: 'vcs', url: dep.repoUrl });
  if (dep.registryUrl)
    externalRefs.push({ type: 'distribution', url: dep.registryUrl });
  if (externalRefs.length > 0) component.externalReferences = externalRefs;

  return component;
}

function parseIntegrity(
  integrity?: string,
): { alg: string; content: string } | null {
  if (!integrity) return null;
  const idx = integrity.indexOf('-');
  if (idx === -1) return null;
  const algo = integrity.slice(0, idx);
  const b64 = integrity.slice(idx + 1);
  // CycloneDX expects hex-encoded hash content; npm integrity is base64
  const hex = Buffer.from(b64, 'base64').toString('hex');
  return {
    alg: algo.toUpperCase().replace('SHA', 'SHA-'),
    content: hex,
  };
}

function formatDependencies(
  edges: Record<string, string[]>,
  purlByKey: Map<string, string>,
): Array<{ ref: string; dependsOn: string[] }> {
  const result: Array<{ ref: string; dependsOn: string[] }> = [];
  for (const [key, deps] of Object.entries(edges)) {
    const ref = purlByKey.get(key);
    if (!ref) continue;
    result.push({
      ref,
      dependsOn: deps
        .map((d) => purlByKey.get(d))
        .filter((p): p is string => p !== undefined),
    });
  }
  return result;
}

const SEVERITY_TO_CVSS: Record<Vulnerability['severity'], number> = {
  critical: 9.5,
  high: 7.5,
  moderate: 5.0,
  low: 2.5,
};

function formatVulnerability(vuln: Vulnerability, componentPurl: string) {
  const entry: Record<string, unknown> = {
    id: vuln.id,
    source: {
      name: 'OSV',
      url: 'https://osv.dev',
    },
    ratings: [
      {
        severity: vuln.severity === 'moderate' ? 'medium' : vuln.severity,
        score: SEVERITY_TO_CVSS[vuln.severity],
        method: 'other',
      },
    ],
    description: vuln.title,
    affects: [{ ref: componentPurl }],
  };

  const advisories: Array<Record<string, string>> = [];
  if (vuln.url) advisories.push({ url: vuln.url });
  if (advisories.length > 0) entry.advisories = advisories;

  if (vuln.patchedVersion) {
    entry.recommendation = `Upgrade to version ${vuln.patchedVersion} or later`;
  }

  return entry;
}
