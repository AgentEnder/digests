import type { DependencyDigestPlugin, ManifestFile, ParseResult } from 'dependency-digest';
import { detectManifests } from './detect.js';
import { parseCargoMetadata } from './parser.js';
import { runCargoMetadata } from './cargo-metadata.js';
import { fetchDependencyMetrics, cacheCargoLicenses } from './metrics.js';

async function parseDependencies(manifest: ManifestFile): Promise<ParseResult> {
  const metadata = await runCargoMetadata(manifest);

  // Cache license info from cargo metadata so metrics can use it
  cacheCargoLicenses(metadata.packages);

  return parseCargoMetadata(metadata);
}

const plugin: DependencyDigestPlugin = {
  name: 'rust',
  ecosystem: 'cargo',

  detect: detectManifests,
  parseDependencies,
  fetchMetrics: fetchDependencyMetrics,
};

export default plugin;
export { plugin };
