export { default as cli } from "./cli.js";
export { applyLicenseOverrides, isLicenseAllowed } from "./config.js";
export { formatDigestAsCycloneDX } from "./format-cyclonedx.js";
export { formatDigestAsHtml } from "./format-html.js";
export { formatDigestAsSpdx } from "./format-spdx.js";
export { formatDigestAsJson, formatDigestAsMarkdown } from "./formatter.js";
export { ProgressDisplay } from "./progress-display.js";
export { scan } from "./scanner.js";
export type { PluginEntry, ProgressEvent, ScanOptions } from "./scanner.js";
export type {
  DependencyDigestPlugin,
  DependencyMetrics,
  DigestConfig,
  DigestOutput,
  LicenseOverride,
  ManifestDigest,
  ManifestFile,
  ParsedDependency,
  ParseResult,
  Vulnerability,
} from "./types.js";
