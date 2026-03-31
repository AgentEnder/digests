/**
 * Generates markdown documentation for a single CLI using cli-forge's
 * programmatic API. Works around a pnpm strict isolation + relative
 * path resolution bug in `cli-forge generate-documentation`.
 *
 * Usage:
 *   tsx scripts/extract-cli-docs.ts <modulePath> <exportName> <outputDir> [navSection] [navOrder]
 *
 * Called from each CLI package's `extract-docs` script.
 */

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Internal API — not publicly exported but stable enough for build tooling.
// Use createRequire to bypass the package exports map.
const require = createRequire(
  join(process.cwd(), 'packages/dependency-digest/package.json'),
);
const cliForgeRoot = require
  .resolve('cli-forge/package.json')
  .replace('/package.json', '');
const { generateDocumentation } = require(
  join(cliForgeRoot, 'dist/lib/documentation.js'),
);

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
  description?: string;
  default?: unknown;
  alias?: string[];
  choices?: string[];
  required?: boolean;
}

interface FrontmatterOptions {
  navSection?: string;
  navOrder?: number;
}

// ── Markdown generation ─────────────────────────────────────────────────────

function renderOption(opt: NormalizedOption): string {
  const parts: string[] = [];
  const aliases = opt.alias?.length
    ? ` (${opt.alias.map((a) => `-${a}`).join(', ')})`
    : '';
  parts.push(`### \`--${opt.key}\`${aliases}`);
  parts.push('');
  if (opt.description) parts.push(opt.description);
  if (opt.type) parts.push(`- **Type:** \`${opt.type}\``);
  if (opt.default !== undefined)
    parts.push(`- **Default:** \`${JSON.stringify(opt.default)}\``);
  if (opt.choices?.length)
    parts.push(
      `- **Choices:** ${opt.choices.map((c) => `\`${c}\``).join(', ')}`,
    );
  if (opt.required) parts.push('- **Required**');
  parts.push('');
  return parts.join('\n');
}

function renderDocs(
  docs: Documentation,
  frontmatter?: FrontmatterOptions,
): string {
  const lines: string[] = [];

  if (frontmatter) {
    lines.push('---');
    lines.push(`title: "${docs.name}"`);
    if (docs.description) {
      lines.push(`description: "${docs.description.replace(/"/g, '\\"')}"`);
    }
    if (frontmatter.navSection) {
      lines.push('nav:');
      lines.push(`  section: "${frontmatter.navSection}"`);
      lines.push(`  order: ${frontmatter.navOrder ?? 999}`);
    }
    lines.push('---');
    lines.push('');
  }

  lines.push(`# ${docs.name}`);
  lines.push('');
  if (docs.description) {
    lines.push(docs.description);
    lines.push('');
  }

  lines.push('## Usage');
  lines.push('');
  lines.push('```');
  lines.push(docs.usage);
  lines.push('```');
  lines.push('');

  if (docs.positionals.length > 0) {
    lines.push('## Arguments');
    lines.push('');
    for (const pos of docs.positionals) {
      lines.push(renderOption(pos));
    }
  }

  const optionKeys = Object.keys(docs.options).filter(
    (k) => k !== 'help' && k !== 'version',
  );
  if (optionKeys.length > 0) {
    lines.push('## Options');
    lines.push('');
    for (const key of optionKeys) {
      lines.push(renderOption(docs.options[key]));
    }
  }

  if (docs.examples.length > 0) {
    lines.push('## Examples');
    lines.push('');
    for (const ex of docs.examples) {
      lines.push(`- \`${ex}\``);
    }
    lines.push('');
  }

  if (docs.epilogue) {
    lines.push('---');
    lines.push('');
    lines.push(docs.epilogue);
    lines.push('');
  }

  if (docs.subcommands.length > 0) {
    lines.push('## Subcommands');
    lines.push('');
    for (const sub of docs.subcommands) {
      lines.push(
        `- [\`${sub.name}\`](./${sub.name}.md) — ${sub.description ?? ''}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [modulePath, exportName, outputDir, navSection, navOrderStr] =
    process.argv.slice(2);

  if (!modulePath || !exportName || !outputDir) {
    console.error(
      'Usage: tsx scripts/extract-cli-docs.ts <modulePath> <exportName> <outputDir> [navSection] [navOrder]',
    );
    process.exit(1);
  }

  const navOrder = navOrderStr ? parseInt(navOrderStr, 10) : undefined;

  console.log(`Extracting CLI docs: ${modulePath} → ${outputDir}`);
  // Resolve relative to cwd (the calling package), not this script's location
  const absoluteModulePath = pathToFileURL(resolve(modulePath)).href;
  const mod = await import(absoluteModulePath);
  const cli = mod[exportName] ?? mod.default;
  if (!cli) {
    console.error(`  Export "${exportName}" not found in ${modulePath}`);
    process.exit(1);
  }

  const docs = generateDocumentation(cli) as Documentation;
  mkdirSync(outputDir, { recursive: true });

  // Main command — gets frontmatter for docs site navigation
  const mainFile = join(outputDir, `${docs.name}.md`);
  writeFileSync(
    mainFile,
    renderDocs(docs, { navSection, navOrder }),
  );
  console.log(`  Wrote ${mainFile}`);

  // Subcommands
  for (const sub of docs.subcommands) {
    const subFile = join(outputDir, `${sub.name}.md`);
    writeFileSync(subFile, renderDocs(sub));
    console.log(`  Wrote ${subFile}`);
  }
}

main();
