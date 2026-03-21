import type { DependencyDigestPlugin } from 'dependency-digest';
import { detectManifests } from './detect.js';
import { parseDotnetDependencies } from './parser.js';
import { fetchDependencyMetrics } from './metrics.js';

const plugin: DependencyDigestPlugin = {
  name: 'dotnet',
  ecosystem: 'nuget',
  detect: detectManifests,
  parseDependencies: parseDotnetDependencies,
  fetchMetrics: fetchDependencyMetrics,
};

export default plugin;
export { plugin };
