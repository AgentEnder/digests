#!/usr/bin/env node

import { cli } from 'cli-forge';
import { mkdir, writeFile } from 'fs/promises';
import { basename, dirname, extname, join, resolve } from 'path';
import { getGitHubToken } from '@digests/github-utils';
import { scan } from './scanner.js';
import { formatDigestAsJson, formatDigestAsMarkdown } from './formatter.js';
import { formatDigestAsCycloneDX } from './format-cyclonedx.js';
import { formatDigestAsSpdx } from './format-spdx.js';
import { loadConfig } from './config.js';
import { saveLastRun, licensesCommand } from './licenses.js';
import type { DigestConfig, DigestOutput, DependencyDigestPlugin } from './types.js';

type Format = 'markdown' | 'json' | 'cyclonedx' | 'spdx';

const ALL_FORMATS: Format[] = ['markdown', 'json', 'cyclonedx', 'spdx'];

const FORMAT_EXTENSIONS: Record<Format, string> = {
  markdown: '.md',
  json: '.json',
  cyclonedx: '.cdx.json',
  spdx: '.spdx.json',
};

const EXTENSION_TO_FORMAT: Record<string, Format> = {
  '.md': 'markdown',
  '.json': 'json',
  '.cdx.json': 'cyclonedx',
  '.spdx.json': 'spdx',
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
    case 'json':
      return formatDigestAsJson(digest);
    case 'cyclonedx':
      return formatDigestAsCycloneDX(digest);
    case 'spdx':
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
    if (formatArg.includes('all')) return [...ALL_FORMATS];
    return formatArg as Format[];
  }

  // Infer from output extension
  if (outputPath && !outputPath.endsWith('/')) {
    const detected = detectFormatFromExtension(outputPath);
    if (detected) return [detected];
  }

  return ['markdown'];
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

  if (outputArg.endsWith('/')) {
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
    if (detected && detected !== format) {
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
  const base = ext
    ? outputArg.slice(0, -ext.length)
    : outputArg;
  const dir = dirname(base);
  const stem = basename(base);

  for (const f of formats) {
    paths.set(f, join(dir, `${stem}${FORMAT_EXTENSIONS[f]}`));
  }
  return paths;
}

const digestCLI = cli('dependency-digest', {
  description: 'Scan repository dependencies and generate a health digest',
  builder: (args) =>
    args
      .option('dir', {
        type: 'string',
        description: 'Directory to scan (default: cwd)',
        alias: ['d'],
      })
      .option('plugin', {
        type: 'array',
        items: 'string',
        description:
          'Plugin package names to use (default: auto-detect installed)',
        alias: ['p'],
      })
      .option('format', {
        type: 'array',
        items: 'string',
        description:
          'Output formats: markdown, json, cyclonedx, spdx, or all',
        alias: ['f', 'formats'],
      })
      .option('output', {
        type: 'string',
        description:
          'Output path. File path for single format, path/ for directory, or base name for multiple formats',
        alias: ['o'],
      })
      .option('token', {
        type: 'string',
        description:
          'GitHub token (fallback: GH_TOKEN, GITHUB_TOKEN, gh auth token)',
      })
      .option('concurrency', {
        type: 'number',
        description: 'Max parallel fetches per plugin',
        default: 5,
      })
      .option('exclude', {
        type: 'array',
        items: 'string',
        description: 'Glob patterns for packages to skip (e.g. @types/*)',
      })
      .option('include-dev', {
        type: 'boolean',
        description: 'Include devDependencies',
        default: true,
      })
      .commands(licensesCommand),
  handler: async (args) => {
    const dir = resolve(args.dir ?? process.cwd());
    const token = await getGitHubToken(args.token);
    const config = await loadConfig(dir);

    const pluginNames = args.plugin ?? config.plugins ?? ['@digests/plugin-js'];
    const plugins: DependencyDigestPlugin[] = [];

    for (const name of pluginNames) {
      try {
        const mod = await import(name);
        const plugin: DependencyDigestPlugin =
          mod.default ?? mod.plugin ?? mod;
        plugins.push(plugin);
      } catch (err) {
        console.error(`Failed to load plugin "${name}": ${err}`);
        process.exit(1);
      }
    }

    const excludePatterns = args.exclude ?? config.exclude ?? [];

    const digest = await scan({
      dir,
      plugins,
      token,
      concurrency: args.concurrency,
      excludePatterns,
    });

    await saveLastRun(digest);

    const formats = resolveFormats(args.format, args.output);
    const outputPaths = resolveOutputPaths(args.output, formats);

    for (const [format, outputPath] of outputPaths) {
      const rendered = renderFormat(format, digest, config);

      if (outputPath) {
        await mkdir(dirname(outputPath), { recursive: true }).catch(
          () => undefined,
        );
        await writeFile(outputPath, rendered, 'utf-8');
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
