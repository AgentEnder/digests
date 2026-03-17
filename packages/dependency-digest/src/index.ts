export type {
  DependencyDigestPlugin,
  DependencyMetrics,
  DigestConfig,
  DigestOutput,
  ManifestDigest,
  ManifestFile,
  ParsedDependency,
  ParseResult,
  Vulnerability,
} from './types.js';
export { scan } from './scanner.js';
export { formatDigestAsJson, formatDigestAsMarkdown } from './formatter.js';
export { formatDigestAsCycloneDX } from './format-cyclonedx.js';
export { formatDigestAsSpdx } from './format-spdx.js';
export { loadConfig, isLicenseAllowed, saveConfig } from './config.js';
export { default as cli } from './cli.js';
