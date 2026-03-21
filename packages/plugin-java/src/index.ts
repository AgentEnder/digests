import type {
  DependencyDigestPlugin,
  ManifestFile,
  ParseResult,
} from 'dependency-digest';
import { detectManifests } from './detect.js';
import { runMavenDependencyTree } from './maven-runner.js';
import { parseMavenDependencyTree } from './maven-parser.js';
import { runGradleDependencies } from './gradle-runner.js';
import { parseGradleDependencies } from './gradle-parser.js';
import { fetchDependencyMetrics } from './metrics.js';

async function parseDependencies(
  manifest: ManifestFile
): Promise<ParseResult> {
  if (manifest.type === 'pom.xml') {
    const output = await runMavenDependencyTree(manifest);
    return parseMavenDependencyTree(output);
  }

  // build.gradle or build.gradle.kts
  const output = await runGradleDependencies(manifest);
  return parseGradleDependencies(output);
}

const plugin: DependencyDigestPlugin = {
  name: 'java',
  ecosystem: 'maven',

  detect: detectManifests,
  parseDependencies,
  fetchMetrics: fetchDependencyMetrics,
};

export default plugin;
export { plugin };
