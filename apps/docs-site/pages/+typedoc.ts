import path from 'node:path';
import rehypeShiki from '@shikijs/rehype';
import { remarkPrettier } from '../server/utils/remark-prettier.js';

// process.cwd() during build = apps/docs-site/, so ../../ = repo root
const repoRoot = path.resolve(process.cwd(), '..', '..');

const INTERNAL_PACKAGES = new Set([
  'cache-utils',
  'github-utils',
  'osv',
]);

export default {
  // .typedoc/ at the repo root contains one JSON per package
  typedocDir: path.join(repoRoot, '.typedoc'),
  // Map each JSON file stem → npm package name
  packageNames: {
    'cache-utils': '@digests/cache-utils',
    'github-utils': '@digests/github-utils',
    osv: '@digests/osv',
    'dependency-digest': 'dependency-digest',
    'plugin-js': '@digests/plugin-js',
    'plugin-rust': '@digests/plugin-rust',
    'plugin-java': '@digests/plugin-java',
    'plugin-dotnet': '@digests/plugin-dotnet',
    'pr-digest': 'pr-digest',
  },
  // Route internal packages under /api/internal/:pkg
  buildUrl: (packageSlug: string, symbolSlug?: string) => {
    const prefix = INTERNAL_PACKAGES.has(packageSlug) ? '/api/internal' : '/api';
    if (symbolSlug) return `${prefix}/${packageSlug}/${symbolSlug}`;
    return `${prefix}/${packageSlug}`;
  },
  // Shiki theme for API signatures (built-in syntax highlighting)
  theme: 'github-dark',
  // Format code blocks with prettier before Shiki highlights them
  remarkPlugins: [remarkPrettier],
  // Syntax highlighting for markdown code blocks
  rehypePlugins: [
    [rehypeShiki, { theme: 'github-dark', addLanguageClass: true }],
  ],
};
