import { readFile } from 'fs/promises';
import type { DependencyDigestPlugin } from 'dependency-digest';
import { detectPackageJsonFiles } from './detect.js';
import { parsePackageJson } from './parser.js';
import { fetchDependencyMetrics } from './metrics.js';

const plugin: DependencyDigestPlugin = {
  name: 'npm',
  ecosystem: 'npm',

  detect: detectPackageJsonFiles,

  async parseDependencies(manifest) {
    const content = await readFile(manifest.path, 'utf-8');
    return parsePackageJson(content);
  },

  fetchMetrics: fetchDependencyMetrics,
};

export default plugin;
export { plugin };
