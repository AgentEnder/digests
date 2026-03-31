import { loadTypedocContext } from 'vike-plugin-typedoc/server';
import type { ApiExport } from 'vike-plugin-typedoc';
import type { GlobalContextServer } from 'vike/types';
import {
  buildDocsNavigation,
  getDocsDir,
  hydrateDocs,
  scanDocs,
} from '../server/utils/docs.js';
import type { NavigationItem } from '../vike-types.js';

const INTERNAL_PACKAGES = new Set(['cache-utils', 'github-utils', 'osv']);
const DIGEST_PACKAGES = new Set([
  'dependency-digest',
  'plugin-js',
  'plugin-rust',
  'plugin-java',
  'plugin-dotnet',
]);

function sortNavigationItems(items: NavigationItem[]): NavigationItem[] {
  for (const item of items) {
    if (item.children) {
      item.children = sortNavigationItems(item.children);
    }
  }
  return items.sort((a, b) => {
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Build API sidebar navigation grouped into:
 *  - Dependency Digest (dependency-digest + plugin-*)
 *  - PR Digest (pr-digest)
 *  - Internal (cache-utils, github-utils, osv)
 */
function buildApiNavigation(allExports: ApiExport[]): NavigationItem[] {
  const byPackage = new Map<string, ApiExport[]>();
  for (const exp of allExports) {
    const pkg = exp.package ?? 'Other';
    if (!byPackage.has(pkg)) byPackage.set(pkg, []);
    byPackage.get(pkg)!.push(exp);
  }

  function packageNavItem(pkg: string): NavigationItem {
    const exports = byPackage.get(pkg) ?? [];
    // path already includes /api/internal/ prefix for internal packages
    // (set by buildUrl in +typedoc.ts)
    const firstExport = exports[0];
    const basePath = firstExport?.path?.replace(/\/[^/]+$/, '') ?? `/api/${pkg}`;
    return {
      title: pkg,
      path: basePath,
      children: exports
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((exp) => ({ title: exp.name, path: exp.path })),
    };
  }

  const groups: NavigationItem[] = [];

  // Dependency Digest group (expandable container, no landing page)
  const digestPkgs = Array.from(byPackage.keys())
    .filter((p) => DIGEST_PACKAGES.has(p))
    .sort();
  if (digestPkgs.length > 0) {
    groups.push({
      title: 'Dependency Digest',
      children: digestPkgs.map(packageNavItem),
    });
  }

  // PR Digest (standalone)
  if (byPackage.has('pr-digest')) {
    groups.push(packageNavItem('pr-digest'));
  }

  // Internal packages (expandable container, no landing page)
  const internalPkgs = Array.from(byPackage.keys())
    .filter((p) => INTERNAL_PACKAGES.has(p))
    .sort();
  if (internalPkgs.length > 0) {
    groups.push({
      title: 'Internal',
      children: internalPkgs.map(packageNavItem),
    });
  }

  return groups;
}

export async function onCreateGlobalContext(
  context: Partial<GlobalContextServer>,
): Promise<void> {
  // Phase 1: Load TypeDoc context (injected by vike-plugin-typedoc)
  const typedoc = await loadTypedocContext(context);

  // Phase 2: Scan docs and render markdown to HTML
  const docsDir = await getDocsDir();
  const rawDocs = await scanDocs(docsDir);
  const docs = await hydrateDocs(rawDocs);

  // Phase 3: Build navigation
  const docsNavigation = buildDocsNavigation(docs);
  const navigation: NavigationItem[] = sortNavigationItems([
    ...docsNavigation,
    {
      title: 'Tools',
      path: '/viewer',
      order: 100,
      children: [
        {
          title: 'Dependency Viewer',
          path: '/viewer',
        },
      ],
    },
    {
      title: 'API',
      path: '/api',
      order: 200,
      children: buildApiNavigation(typedoc.apiDocs.allExports),
    },
  ]);

  context.docs = docs;
  context.navigation = navigation;
}
