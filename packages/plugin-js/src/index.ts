import type { DependencyDigestPlugin } from 'dependency-digest';
import { detectManifests } from './detect.js';
import { parseManifest } from './parser.js';
import { fetchDependencyMetrics } from './metrics.js';

const plugin: DependencyDigestPlugin = {
  name: 'js',
  ecosystem: 'npm',

  detect: detectManifests,
  parseDependencies: parseManifest,
  fetchMetrics: fetchDependencyMetrics,
};

export default plugin;
export { plugin };
