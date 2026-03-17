import { randomUUID } from 'crypto';
import type { DependencyMetrics, DigestOutput } from './types.js';

/**
 * Make a string safe for use as an SPDX identifier.
 * Only alphanumeric, '.', and '-' are allowed; everything else becomes '-'.
 */
function safeSpdxId(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]/g, '-');
}

/** Build an SPDX element ID for a package. */
function toSpdxId(name: string, version: string): string {
  return `SPDXRef-Package-${safeSpdxId(name)}-${safeSpdxId(version)}`;
}

/**
 * Parse an integrity string (e.g. "sha512-abc123") into SPDX checksum format.
 * SPDX uses algorithm names without a dash, e.g. "SHA512".
 */
function parseIntegrityToSpdx(
  integrity?: string
): { algorithm: string; checksumValue: string } | null {
  if (!integrity) return null;
  const idx = integrity.indexOf('-');
  if (idx === -1) return null;
  const alg = integrity.slice(0, idx);
  const b64 = integrity.slice(idx + 1);
  if (!alg || !b64) return null;
  // SPDX requires hex-encoded checksums; npm integrity is base64
  const hex = Buffer.from(b64, 'base64').toString('hex');
  return {
    algorithm: alg.toUpperCase(),
    checksumValue: hex,
  };
}

function formatSpdxPackage(dep: DependencyMetrics) {
  const pkg: Record<string, unknown> = {
    SPDXID: toSpdxId(dep.name, dep.version),
    name: dep.name,
    versionInfo: dep.version,
    downloadLocation:
      (dep as DependencyMetrics & { registryUrl?: string }).registryUrl ??
      'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: dep.license ?? 'NOASSERTION',
    licenseDeclared: dep.license ?? 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    supplier: dep.author ? `Person: ${dep.author}` : 'NOASSERTION',
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: dep.purl,
      },
    ],
  };

  if (dep.description) {
    pkg.description = dep.description;
  }

  const checksum = parseIntegrityToSpdx(
    (dep as DependencyMetrics & { integrity?: string }).integrity
  );
  if (checksum) {
    pkg.checksums = [checksum];
  }

  return pkg;
}

function formatSpdxRelationships(
  edges: Record<string, string[]>,
  spdxIdByKey: Map<string, string>
): Array<{
  spdxElementId: string;
  relatedSpdxElement: string;
  relationshipType: string;
}> {
  const result: Array<{
    spdxElementId: string;
    relatedSpdxElement: string;
    relationshipType: string;
  }> = [];
  for (const [key, deps] of Object.entries(edges)) {
    const fromId = spdxIdByKey.get(key);
    if (!fromId) continue;
    for (const dep of deps) {
      const toId = spdxIdByKey.get(dep);
      if (!toId) continue;
      result.push({
        spdxElementId: fromId,
        relatedSpdxElement: toId,
        relationshipType: 'DEPENDS_ON',
      });
    }
  }
  return result;
}

/** Serialize a DigestOutput as an SPDX 2.3 JSON string. */
export function formatDigestAsSpdx(digest: DigestOutput): string {
  const allDeps = digest.manifests.flatMap((m) => m.dependencies);
  const allEdges: Record<string, string[]> = {};
  for (const m of digest.manifests) {
    Object.assign(allEdges, m.edges);
  }

  const spdxIdByKey = new Map<string, string>();
  for (const dep of allDeps) {
    spdxIdByKey.set(
      `${dep.name}@${dep.version}`,
      toSpdxId(dep.name, dep.version)
    );
  }

  const doc = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `dependency-digest-${digest.manifests[0]?.file ?? 'unknown'}`,
    documentNamespace: `https://spdx.org/spdxdocs/dependency-digest-${randomUUID()}`,
    creationInfo: {
      created: digest.scannedAt,
      creators: ['Tool: dependency-digest-0.1.0'],
      licenseListVersion: '3.25',
    },
    packages: allDeps.map((dep) => formatSpdxPackage(dep)),
    relationships: [
      // DESCRIBES relationships: document describes each package
      ...allDeps.map((dep) => ({
        spdxElementId: 'SPDXRef-DOCUMENT',
        relatedSpdxElement: toSpdxId(dep.name, dep.version),
        relationshipType: 'DESCRIBES' as const,
      })),
      // DEPENDS_ON relationships from edges
      ...formatSpdxRelationships(allEdges, spdxIdByKey),
    ],
  };

  return JSON.stringify(doc, null, 2);
}
