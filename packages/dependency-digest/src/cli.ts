#!/usr/bin/env node

import { disableCache } from "@digests/cache-utils";
import { getGitHubToken } from "@digests/github-utils";
import { cli } from "cli-forge";
import { mkdir, writeFile } from "fs/promises";
import { basename, dirname, extname, join, resolve } from "path";
import { withDigestOptions } from "./builders.js";
import { applyLicenseOverrides } from "./config.js";
import esMain from "./es-main.js";
import { formatDigestAsCycloneDX } from "./format-cyclonedx.js";
import { formatDigestAsHtml } from "./format-html.js";
import { formatDigestAsSpdx } from "./format-spdx.js";
import { formatDigestAsJson, formatDigestAsMarkdown } from "./formatter.js";
import { licensesCommand, saveLastRun } from "./licenses.js";
import { ProgressDisplay } from "./progress-display.js";
import { scan, type PluginEntry } from "./scanner.js";
import type {
  DependencyDigestPlugin,
  DigestConfig,
  DigestOutput,
} from "./types.js";

type Format = "markdown" | "html" | "json" | "cyclonedx" | "spdx";

const ALL_FORMATS: Format[] = ["markdown", "html", "json", "cyclonedx", "spdx"];

const FORMAT_EXTENSIONS: Record<Format, string> = {
  markdown: ".md",
  html: ".html",
  json: ".json",
  cyclonedx: ".cdx.json",
  spdx: ".spdx.json",
};

const EXTENSION_TO_FORMAT: Record<string, Format> = {
  ".md": "markdown",
  ".html": "html",
  ".json": "json",
  ".cdx.json": "cyclonedx",
  ".spdx.json": "spdx",
};

function detectFormatFromExtension(outputPath: string): Format | null {
  // Check compound extensions first (longest match)
  for (const [ext, fmt] of Object.entries(EXTENSION_TO_FORMAT)) {
    if (outputPath.endsWith(ext)) return fmt;
  }
  return null;
}

async function renderFormat(
  format: Format,
  digest: DigestOutput,
  config: DigestConfig,
): Promise<string> {
  switch (format) {
    case "json":
      return formatDigestAsJson(digest);
    case "html":
      return formatDigestAsHtml();
    case "cyclonedx":
      return formatDigestAsCycloneDX(digest);
    case "spdx":
      return formatDigestAsSpdx(digest);
    default:
      return formatDigestAsMarkdown(digest, config);
  }
}

function resolveFormats(
  formatArg: string[] | undefined,
  outputPath: string | undefined,
): Format[] {
  // If formats explicitly provided
  if (formatArg && formatArg.length > 0) {
    if (formatArg.includes("all")) return [...ALL_FORMATS];
    return formatArg as Format[];
  }

  // Infer from output extension
  if (outputPath && !outputPath.endsWith("/")) {
    const detected = detectFormatFromExtension(outputPath);
    if (detected) return [detected];
  }

  return ["markdown"];
}

function resolveOutputPaths(
  outputArg: string | undefined,
  formats: Format[],
): Map<Format, string | null> {
  const paths = new Map<Format, string | null>();

  if (!outputArg) {
    // stdout for all formats
    for (const f of formats) {
      paths.set(f, null);
    }
    return paths;
  }

  if (outputArg.endsWith("/")) {
    // Directory mode: create files under this folder
    const dir = outputArg;
    for (const f of formats) {
      paths.set(f, join(dir, `digest${FORMAT_EXTENSIONS[f]}`));
    }
    return paths;
  }

  if (formats.length === 1) {
    // Single format with explicit path
    const detected = detectFormatFromExtension(outputArg);
    const format = formats[0];
    // cdx/spdx are JSON subtypes, so .json is compatible with them
    const isJsonCompat =
      detected === "json" && (format === "cyclonedx" || format === "spdx");
    if (detected && detected !== format && !isJsonCompat) {
      console.error(
        `Error: output extension suggests "${detected}" but format is "${format}". ` +
          `Use a matching extension or --output path/ for multiple formats.`,
      );
      process.exit(1);
    }
    paths.set(format, outputArg);
    return paths;
  }

  // Multiple formats with a file path base: vary extensions
  const ext = extname(outputArg);
  const base = ext ? outputArg.slice(0, -ext.length) : outputArg;
  const dir = dirname(base);
  const stem = basename(base);

  for (const f of formats) {
    paths.set(f, join(dir, `${stem}${FORMAT_EXTENSIONS[f]}`));
  }
  return paths;
}

export const digestCLI = cli("dependency-digest", {
  description: "Scan repository dependencies and generate a health digest",
  builder: (args) => withDigestOptions(args).commands(licensesCommand),
  handler: async (args) => {
    if (args.skipCache) disableCache();
    const dir = resolve(args.dir ?? process.cwd());
    const token = await getGitHubToken(args.token);

    // Build config from merged CLI args + config file values
    const config: DigestConfig = {
      allowedLicenses: args.allowedLicenses,
      deniedLicenses: args.deniedLicenses,
      compatibleLicenses: args["compatibleLicenses"],
      licenseOverrides: args.licenseOverrides,
      plugins: args.plugins,
      exclude: args.exclude,
    };

    const KNOWN_PLUGINS = [
      "@digests/plugin-js",
      "@digests/plugin-rust",
      "@digests/plugin-java",
      "@digests/plugin-dotnet",
    ];

    // Resolve which plugin packages to use
    const plugins: PluginEntry[] = [];

    const candidateNames = config.plugins ?? KNOWN_PLUGINS;
    const isExplicit = !!config.plugins;

    for (const packageName of candidateNames) {
      try {
        const mod = await import(packageName);
        const plugin: DependencyDigestPlugin = mod.default ?? mod.plugin ?? mod;
        plugins.push({
          packageName,
          displayName: plugin.name,
          ecosystem: plugin.ecosystem,
        });
      } catch (err) {
        if (isExplicit) {
          console.error(`Failed to load plugin "${packageName}": ${err}`);
          process.exit(1);
        }
        // Auto-detect mode: not installed — skip silently
      }
    }

    if (plugins.length === 0) {
      console.error(
        "No plugins found. Install at least one plugin package " +
          "(e.g. @digests/plugin-js) or specify --plugins explicitly.",
      );
      process.exit(1);
    }

    const excludePatterns = config.exclude ?? [];
    const isTTY = process.stderr.isTTY;
    const display = new ProgressDisplay({ isTTY: isTTY ?? false });
    if (isTTY) {
      display.startInteractive();
    }

    let digest: DigestOutput;
    try {
      digest = await scan({
        dir,
        plugins,
        token,
        concurrency: args.concurrency,
        excludePatterns,
        skipCache: args.skipCache,
        display,
      });
    } finally {
      display.destroy();
    }

    const finalDigest = applyLicenseOverrides(digest, config.licenseOverrides);
    await saveLastRun(finalDigest);

    const formats = resolveFormats(args.format, args.output);
    const outputPaths = resolveOutputPaths(args.output, formats);

    // When html format is used, ensure json is also written alongside
    const needsJsonForHtml =
      formats.includes("html") && !formats.includes("json");

    if (needsJsonForHtml) {
      const htmlPath = outputPaths.get("html");
      if (htmlPath) {
        const jsonPath = join(dirname(htmlPath), "digest.json");
        await mkdir(dirname(jsonPath), { recursive: true }).catch(
          () => undefined,
        );
        await writeFile(jsonPath, formatDigestAsJson(finalDigest), "utf-8");
        console.log(`json → ${jsonPath} (companion for html viewer)`);
      }
    }

    for (const [format, outputPath] of outputPaths) {
      const rendered = await renderFormat(format, finalDigest, config);

      if (outputPath) {
        await mkdir(dirname(outputPath), { recursive: true }).catch(
          () => undefined,
        );
        await writeFile(outputPath, rendered, "utf-8");
        console.log(`${format} → ${outputPath}`);
      } else {
        if (formats.length > 1) {
          console.log(`\n--- ${format} ---\n`);
        }
        console.log(rendered);
      }
    }
  },
});

export default digestCLI;

if (esMain(import.meta)) {
  digestCLI.forge();
}
