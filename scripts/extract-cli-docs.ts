/**
 * Generates markdown documentation for a single CLI by invoking
 * `cli-forge generate-documentation --format json` and transforming
 * the output with markdown-factory.
 *
 * Usage:
 *   tsx scripts/extract-cli-docs.ts <cliPath> [--export name] [--nav-section name] [--nav-order n]
 *
 * Called from each CLI package's `extract-docs` script.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bold,
  code,
  codeBlock,
  frontMatter,
  h1,
  h2,
  h3,
  link,
  lines,
  ul,
} from 'markdown-factory';

// ── Types matching cli-forge's JSON output ─────────────────────────────────

interface Documentation {
  name: string;
  description?: string;
  epilogue?: string;
  usage: string;
  examples: string[];
  options: Record<string, NormalizedOption>;
  positionals: NormalizedOption[];
  subcommands: Documentation[];
}

interface NormalizedOption {
  key: string;
  type: string;
  items?: string;
  description?: string;
  default?: unknown;
  alias?: string[];
  choices?: string[];
  required?: boolean;
}

// ── Markdown rendering ─────────────────────────────────────────────────────

function formatOptionType(opt: NormalizedOption): string {
  if (opt.type === 'array' && opt.items) return `${opt.items}[]`;
  return opt.type;
}

function renderOption(opt: NormalizedOption): string {
  const aliases = opt.alias?.length
    ? ` (${opt.alias.map((a) => code(`-${a}`)).join(', ')})`
    : '';

  const details = [
    opt.description,
    `${bold('Type:')} ${code(formatOptionType(opt))}`,
    opt.default !== undefined
      ? `${bold('Default:')} ${code(JSON.stringify(opt.default))}`
      : undefined,
    opt.choices?.length
      ? `${bold('Choices:')} ${opt.choices.map((c) => code(c)).join(', ')}`
      : undefined,
    opt.required ? bold('Required') : undefined,
  ].filter(Boolean) as string[];

  return h3(`${code(`--${opt.key}`)}${aliases}`, ...details);
}

function renderDocs(
  docs: Documentation,
  fm?: { navSection?: string; navOrder?: number },
): string {
  const sections: string[] = [];

  if (fm) {
    sections.push(
      frontMatter({
        title: docs.name,
        ...(docs.description ? { description: docs.description } : {}),
        ...(fm.navSection
          ? { nav: { section: fm.navSection, order: fm.navOrder ?? 999 } }
          : {}),
      }),
    );
  }

  const body: (string | undefined)[] = [
    docs.description,
    h2('Usage', codeBlock(docs.usage)),
  ];

  if (docs.positionals.length > 0) {
    body.push(h2('Arguments', ...docs.positionals.map(renderOption)));
  }

  const optionKeys = Object.keys(docs.options).filter(
    (k) => k !== 'help' && k !== 'version',
  );
  if (optionKeys.length > 0) {
    body.push(
      h2('Options', ...optionKeys.map((k) => renderOption(docs.options[k]))),
    );
  }

  if (docs.examples.length > 0) {
    body.push(
      h2('Examples', ...docs.examples.map((ex) => codeBlock(ex, 'shell'))),
    );
  }

  if (docs.epilogue) {
    body.push(lines('---', '', docs.epilogue));
  }

  if (docs.subcommands.length > 0) {
    body.push(
      h2(
        'Subcommands',
        ul(
          ...docs.subcommands.map((sub) =>
            `${link(`./${sub.name}.md`, code(sub.name))} — ${sub.description ?? ''}`,
          ),
        ),
      ),
    );
  }

  sections.push(
    h1(docs.name, ...(body.filter(Boolean) as string[])),
  );

  return sections.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const cliPath = args[0];

  if (!cliPath) {
    console.error(
      'Usage: tsx scripts/extract-cli-docs.ts <cliPath> [--export name] [--nav-section name] [--nav-order n]',
    );
    process.exit(1);
  }

  // Parse named args
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const exportName = getArg('--export');
  const navSection = getArg('--nav-section');
  const navOrder = getArg('--nav-order');
  const outputDir = getArg('--output') ?? 'docs';

  // Build cli-forge command
  const cliForgeArgs = [
    'cli-forge',
    'generate-documentation',
    cliPath,
    '--format',
    'json',
    '--output',
    outputDir,
    '--llms',
    'false',
  ];
  if (exportName) cliForgeArgs.push('--export', exportName);

  console.log(`Extracting CLI docs: ${cliPath} → ${outputDir}`);
  execSync(cliForgeArgs.join(' '), { stdio: 'inherit' });

  // Read the generated JSON — cli-forge writes <name>.json in the output dir
  const jsonFiles = require('node:fs')
    .readdirSync(outputDir)
    .filter((f: string) => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.error('No JSON output found');
    process.exit(1);
  }

  const docs: Documentation = JSON.parse(
    readFileSync(join(outputDir, jsonFiles[0]), 'utf-8'),
  );

  // Overwrite JSON with markdown
  mkdirSync(outputDir, { recursive: true });

  const mainFile = join(outputDir, `${docs.name}.md`);
  writeFileSync(
    mainFile,
    renderDocs(docs, {
      navSection,
      navOrder: navOrder ? parseInt(navOrder, 10) : undefined,
    }),
  );
  console.log(`  Wrote ${mainFile}`);

  for (const sub of docs.subcommands) {
    const subFile = join(outputDir, `${sub.name}.md`);
    writeFileSync(subFile, renderDocs(sub));
    console.log(`  Wrote ${subFile}`);
  }

  // Clean up JSON files
  for (const f of jsonFiles) {
    require('node:fs').unlinkSync(join(outputDir, f));
  }
}

main();
