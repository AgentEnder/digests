#!/usr/bin/env node

import { disableCache } from "@digests/cache-utils";
import { getGitHubToken } from "@digests/github-utils";
import { cli, ConfigurationProviders } from "cli-forge";
import { mkdir, writeFile } from "fs/promises";
import { basename, dirname, extname, join, resolve } from "path";
import { applyLicenseOverrides } from "./config.js";
import { formatDigestAsCycloneDX } from "./format-cyclonedx.js";
import { formatDigestAsSpdx } from "./format-spdx.js";
import { formatDigestAsJson, formatDigestAsMarkdown } from "./formatter.js";
import { licensesCommand, saveLastRun } from "./licenses.js";
import { scan } from "./scanner.js";
import type {
  DependencyDigestPlugin,
  DigestConfig,
  DigestOutput,
  LicenseOverride,
} from "./types.js";

type Format = "markdown" | "json" | "cyclonedx" | "spdx";

const ALL_FORMATS: Format[] = ["markdown", "json", "cyclonedx", "spdx"];

const FORMAT_EXTENSIONS: Record<Format, string> = {
  markdown: ".md",
  json: ".json",
  cyclonedx: ".cdx.json",
  spdx: ".spdx.json",
};

const EXTENSION_TO_FORMAT: Record<string, Format> = {
  ".md": "markdown",
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

function renderFormat(
  format: Format,
  digest: DigestOutput,
  config: DigestConfig,
): string {
  switch (format) {
    case "json":
      return formatDigestAsJson(digest);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const configProvider: any = ConfigurationProviders.JsonFile([
  "dependency-digest.config.json",
  "dependency-digest.json",
  ".dependency-digest.json",
]);

const digestCLI = cli("dependency-digest", {
  description: "Scan repository dependencies and generate a health digest",
  builder: (args) =>
    args
      .option("dir", {
        type: "string",
        description: "Directory to scan (default: cwd)",
        alias: ["d"],
      })
      .option("plugin", {
        type: "array",
        items: "string",
        description:
          "Plugin package names to use (default: auto-detect installed)",
        alias: ["p"],
      })
      .option("format", {
        type: "array",
        items: "string",
        description: "Output formats: markdown, json, cyclonedx, spdx, or all",
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
      .option("include-dev", {
        type: "boolean",
        description: "Include devDependencies",
        default: true,
      })
      .option("skip-cache", {
        type: "boolean",
        description: "Bypass cached results and fetch fresh data",
        default: false,
      })
      .option("allowed-licenses", {
        type: "array",
        items: "string",
        description: "SPDX license identifiers that are allowed",
      })
      .option("denied-licenses", {
        type: "array",
        items: "string",
        description: "SPDX license identifiers that are denied",
      })
      .option("compatible-licenses", {
        type: "array",
        items: "string",
        description: "SPDX license identifiers compatible with this project",
      })
      .config(configProvider)
      .commands(licensesCommand),
  handler: async (args) => {
    if (args["skip-cache"]) disableCache();
    const dir = resolve(args.dir ?? process.cwd());
    const token = await getGitHubToken(args.token);

    // Build config from merged CLI args + config file values
    const rawArgs = args as Record<string, unknown>;
    const config: DigestConfig = {
      allowedLicenses: (args["allowed-licenses"] ??
        rawArgs["allowedLicenses"]) as string[] | undefined,
      deniedLicenses: (args["denied-licenses"] ?? rawArgs["deniedLicenses"]) as
        | string[]
        | undefined,
      compatibleLicenses: (args["compatible-licenses"] ??
        rawArgs["compatibleLicenses"]) as string[] | undefined,
      licenseOverrides: rawArgs["licenseOverrides"] as
        | Record<string, LicenseOverride>
        | undefined,
      plugins: (args.plugin ?? rawArgs["plugins"]) as string[] | undefined,
      exclude: (args.exclude ?? rawArgs["exclude"]) as string[] | undefined,
    };

    const pluginNames = config.plugins ?? ["@digests/plugin-js"];
    const plugins: DependencyDigestPlugin[] = [];

    for (const name of pluginNames) {
      try {
        const mod = await import(name);
        const plugin: DependencyDigestPlugin = mod.default ?? mod.plugin ?? mod;
        plugins.push(plugin);
      } catch (err) {
        console.error(`Failed to load plugin "${name}": ${err}`);
        process.exit(1);
      }
    }

    const excludePatterns = config.exclude ?? [];

    const isTTY = process.stderr.isTTY;
    let lastProgressLine = "";

    // Patch process.stdout.write and process.stderr.write so ANY output
    // (console.*, octokit logger, direct stream writes) clears the
    // progress line first, then re-renders it after the message.
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    const origStderrWrite = process.stderr.write.bind(process.stderr);

    if (isTTY) {
      const wrapWrite = (
        origWrite: typeof process.stdout.write,
        isStderr: boolean,
      ): typeof process.stdout.write => {
        return function (
          this: typeof process.stdout,
          ...args: Parameters<typeof process.stdout.write>
        ): boolean {
          const chunk = args[0];
          const str = typeof chunk === "string" ? chunk : chunk.toString();
          // Let our own progress writes through untouched
          if (str.startsWith("\r\x1b[K")) {
            return origWrite.apply(this, args);
          }
          // Clear progress, print message, re-render progress
          origStderrWrite("\r\x1b[K");
          const result = origWrite.apply(this, args);
          if (lastProgressLine && isStderr) {
            origStderrWrite(lastProgressLine);
          }
          return result;
        } as typeof process.stdout.write;
      };

      process.stdout.write = wrapWrite(origStdoutWrite, false);
      process.stderr.write = wrapWrite(origStderrWrite, true);
    }

    const digest = await scan({
      dir,
      plugins,
      token,
      concurrency: args.concurrency,
      excludePatterns,
      onProgress: isTTY
        ? (event) => {
            if (event.phase === "detect") {
              lastProgressLine = `\r\x1b[KDetecting ${event.plugin} manifests…`;
            } else if (event.phase === "parse") {
              lastProgressLine = `\r\x1b[KParsing dependencies…`;
            } else if (event.phase === "fetch") {
              lastProgressLine = `\r\x1b[KFetching metrics [${event.current}/${event.total}] ${event.dependency ?? ""}`;
            }
            origStderrWrite(lastProgressLine);
          }
        : undefined,
    });
    if (isTTY) {
      origStderrWrite(`\r\x1b[K`);
    }
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;

    const finalDigest = applyLicenseOverrides(digest, config.licenseOverrides);
    await saveLastRun(finalDigest);

    const formats = resolveFormats(args.format, args.output);
    const outputPaths = resolveOutputPaths(args.output, formats);

    for (const [format, outputPath] of outputPaths) {
      const rendered = renderFormat(format, finalDigest, config);

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

digestCLI.forge();
