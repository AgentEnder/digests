#!/usr/bin/env node

import { cli } from 'cli-forge';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { resolve } from 'path';
import { getGitHubToken } from '@digests/github-utils';
import { scan } from './scanner.js';
import { formatDigestAsJson, formatDigestAsMarkdown } from './formatter.js';
import { loadConfig } from './config.js';
import { licensesCommand, saveLastRun } from './licenses.js';
import type { DependencyDigestPlugin } from './types.js';

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
        type: 'string',
        description: 'Output format: markdown or json',
        default: 'markdown',
        alias: ['f'],
      })
      .option('output', {
        type: 'string',
        description: 'Output file path (default: stdout)',
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
      .command('licenses', licensesCommand),
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

    const output =
      args.format === 'json'
        ? formatDigestAsJson(digest)
        : formatDigestAsMarkdown(digest, config);

    if (args.output) {
      await mkdir(dirname(args.output), { recursive: true }).catch(
        () => undefined
      );
      await writeFile(args.output, output, 'utf-8');
      console.log(`Digest written to ${args.output}`);
    } else {
      console.log(output);
    }
  },
});

export default digestCLI;

digestCLI.forge();
