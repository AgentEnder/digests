export type {
  DependencyDigestPlugin,
  DependencyMetrics,
  DigestConfig,
  DigestOutput,
  ManifestDigest,
  ManifestFile,
  ParsedDependency,
  Vulnerability,
} from './types.js';
export { scan } from './scanner.js';
export { formatDigestAsJson, formatDigestAsMarkdown } from './formatter.js';
export { loadConfig, isLicenseAllowed } from './config.js';
export { default as cli } from './cli.js';
