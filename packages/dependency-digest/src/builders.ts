import { ConfigurationProviders, makeComposableBuilder } from "cli-forge";

export const withDigestOptions = makeComposableBuilder((args) =>
  args
    .option("dir", {
      type: "string",
      description: "Directory to scan (default: cwd)",
      alias: ["d"],
    })
    .option("plugins", {
      type: "array",
      items: "string",
      description:
        "Plugin package names to use (default: auto-detect installed)",
      alias: ["p", "plugin"],
    })
    .option("format", {
      type: "array",
      items: "string",
      description:
        "Output formats: markdown, html, json, cyclonedx, spdx, or all",
      alias: ["f", "formats"],
    })
    .option("output", {
      type: "string",
      description:
        "Output path. File path for single format, path/ for directory, or base name for multiple formats",
      alias: ["o"],
    })
    .option("token", {
      type: "string",
      description:
        "GitHub token (fallback: GH_TOKEN, GITHUB_TOKEN, gh auth token)",
    })
    .option("concurrency", {
      type: "number",
      description: "Max parallel fetches per plugin",
      default: 5,
    })
    .option("exclude", {
      type: "array",
      items: "string",
      description: "Glob patterns for packages to skip (e.g. @types/*)",
    })
    .option("includeDev", {
      type: "boolean",
      description: "Include devDependencies",
      default: true,
    })
    .option("skipCache", {
      type: "boolean",
      description: "Bypass cached results and fetch fresh data",
      default: false,
    })
    .option("allowedLicenses", {
      type: "array",
      items: "string",
      description: "SPDX license identifiers that are allowed",
    })
    .option("deniedLicenses", {
      type: "array",
      items: "string",
      description: "SPDX license identifiers that are denied",
    })
    .option("compatibleLicenses", {
      type: "array",
      items: "string",
      description: "SPDX license identifiers compatible with this project",
    })
    .option("licenseOverrides", {
      type: "object",
      description:
        "Specify overrides for specific package ids to set their license",
      properties: {},
      additionalProperties: "string",
    })
    .config(
      ConfigurationProviders.JsonFile([
        "dependency-digest.config.json",
        "dependency-digest.json",
        ".dependency-digest.json",
      ]),
    ),
);
