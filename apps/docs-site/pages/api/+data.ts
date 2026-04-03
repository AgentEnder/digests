/// <reference types="vike-plugin-typedoc/config" />
import fs from "node:fs/promises";
import path from "node:path";
import type { LinkedApiExport } from "vike-plugin-typedoc";
import type { PageContextServer } from "vike/types";
import { renderMarkdown } from "../../server/utils/markdown.js";

const INTERNAL_PACKAGES = new Set(["cache-utils", "github-utils", "osv"]);

interface PackageGroup {
  title: string;
  packages: Array<{ slug: string; path: string }>;
}

export interface ApiDataLanding {
  type: "landing";
  groups: PackageGroup[];
}

export interface ApiDataPackage {
  type: "package";
  packageSlug: string;
  isInternal: boolean;
  readmeHtml: string | null;
  exports: Array<{ slug: string; name: string; kind: string; path: string }>;
}

export interface ApiDataExport {
  type: "export";
  isInternal: boolean;
  export: LinkedApiExport;
}

export type ApiData =
  | ApiDataLanding
  | ApiDataPackage
  | ApiDataExport
  | { type: "not-found" };

async function loadReadmeHtml(packageSlug: string): Promise<string | null> {
  // Resolve from repo root: ../../packages/{slug}/README.md
  const repoRoot = path.resolve(process.cwd(), "..", "..");
  const readmePath = path.join(repoRoot, "packages", packageSlug, "README.md");
  try {
    let content = await fs.readFile(readmePath, "utf-8");
    // Strip the leading h1 — the component already renders the package name
    content = content.replace(/^#\s+.+\n+/, "");
    return renderMarkdown(content);
  } catch {
    return null;
  }
}

export async function data(pageContext: PageContextServer): Promise<ApiData> {
  const typedoc = pageContext.globalContext.$$VIKE_PLUGIN_TYPEDOC$$;
  if (!typedoc) return { type: "not-found" };

  const parts = pageContext.urlPathname.split("/").filter(Boolean);
  // /api → ['api']
  // /api/dependency-digest → ['api', 'dependency-digest']
  // /api/dependency-digest/scan → ['api', 'dependency-digest', 'scan']
  // /api/internal/cache-utils → ['api', 'internal', 'cache-utils']
  // /api/internal/cache-utils/with-cache → ['api', 'internal', 'cache-utils', 'with-cache']

  const isInternal = parts[1] === "internal";
  const packageSlug = isInternal ? parts[2] : parts[1];
  const symbolSlug = isInternal ? parts[3] : parts[2];

  // Landing: /api
  if (!packageSlug) {
    const allSlugs = Object.keys(typedoc.apiDocs.packages);

    const digestPkgs = allSlugs.filter(
      (s) => !INTERNAL_PACKAGES.has(s) && s !== "pr-digest",
    );
    const groups: PackageGroup[] = [];

    if (digestPkgs.length > 0) {
      groups.push({
        title: "Dependency Digest",
        packages: digestPkgs
          .sort()
          .map((s) => ({ slug: s, path: `/api/${s}` })),
      });
    }
    if (allSlugs.includes("pr-digest")) {
      groups.push({
        title: "PR Digest",
        packages: [{ slug: "pr-digest", path: "/api/pr-digest" }],
      });
    }
    const internalPkgs = allSlugs.filter((s) => INTERNAL_PACKAGES.has(s));
    if (internalPkgs.length > 0) {
      groups.push({
        title: "Internal",
        packages: internalPkgs.sort().map((s) => ({
          slug: s,
          path: `/api/internal/${s}`,
        })),
      });
    }

    return { type: "landing", groups };
  }

  // Package overview: /api/:package or /api/internal/:package
  if (!symbolSlug) {
    const pkg = typedoc.getPackage(packageSlug);
    if (!pkg) return { type: "not-found" };

    const readmeHtml = await loadReadmeHtml(packageSlug);
    const prefix = isInternal
      ? `/api/internal/${packageSlug}`
      : `/api/${packageSlug}`;

    return {
      type: "package",
      packageSlug,
      isInternal,
      readmeHtml,
      exports: pkg.exports.map((e) => ({
        slug: e.slug,
        name: e.name,
        kind: e.kind,
        path: `${prefix}/${e.slug}`,
      })),
    };
  }

  // Export detail: /api/:package/:symbol or /api/internal/:package/:symbol
  const linked = typedoc.getLinkedExport(packageSlug, symbolSlug);
  if (!linked) return { type: "not-found" };
  delete (linked as unknown as Record<string, unknown>)["_typeRef"];

  return { type: "export", isInternal, export: linked };
}
