import matter from "gray-matter";
import fs from "node:fs/promises";
import path from "node:path";
import type { DocMetadata, NavigationItem } from "../../vike-types.js";
import { renderMarkdown } from "./markdown.js";

async function walkDir(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(fullPath)));
    } else if (entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function filePathToUrlPath(filePath: string, docsRoot: string): string {
  const relative = path.relative(docsRoot, filePath);
  let urlPath = relative.replace(/\.md$/, "");

  if (urlPath === "index") {
    return "/docs";
  }

  urlPath = urlPath.replace(/\/index$/, "");
  return "/docs/" + urlPath;
}

export async function scanDocs(
  docsRoot: string,
): Promise<Record<string, DocMetadata>> {
  const docs: Record<string, DocMetadata> = {};

  try {
    const files = await walkDir(docsRoot);

    for (const filePath of files) {
      const rawContent = await fs.readFile(filePath, "utf-8");
      const { data: frontmatter, content } = matter(rawContent);

      const derivedPath = filePathToUrlPath(filePath, docsRoot);
      const urlPath = frontmatter.path || derivedPath;

      docs[urlPath] = {
        path: urlPath,
        filePath,
        title: frontmatter.title || path.basename(filePath, ".md"),
        description: frontmatter.description,
        nav: frontmatter.nav,
        content,
        renderedHtml: "",
      };
    }
  } catch (error) {
    const isNotFound =
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";
    if (!isNotFound) {
      throw error;
    }
  }

  return docs;
}

export function buildDocsNavigation(
  docs: Record<string, DocMetadata>,
): NavigationItem[] {
  const sections: Record<
    string,
    Array<{ title: string; path: string; order: number }>
  > = {};

  for (const doc of Object.values(docs)) {
    let { section, order } = doc.nav ?? {};
    section ??= "Docs";
    order ??= 999;
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push({
      title: doc.title,
      path: doc.path,
      order,
    });
  }

  const navigation: NavigationItem[] = [];

  for (const [sectionName, items] of Object.entries(sections).sort()) {
    const sectionPath =
      "/docs/" + sectionName.toLowerCase().replace(/\s+/g, "-");

    const children = items
      .filter((item) => item.path !== sectionPath)
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        title: item.title,
        path: item.path,
        order: item.order,
      }));

    navigation.push({
      title: sectionName,
      children,
    });
  }

  return navigation;
}

export async function hydrateDocs(
  docs: Record<string, DocMetadata>,
): Promise<Record<string, DocMetadata>> {
  const hydrated: Record<string, DocMetadata> = {};

  for (const [urlPath, doc] of Object.entries(docs)) {
    let renderedHtml = "";
    try {
      renderedHtml = await renderMarkdown(doc.content);
    } catch (err) {
      console.warn(
        `[docs] Markdown render failed for "${urlPath}":`,
        (err as Error).message,
      );
    }

    hydrated[urlPath] = { ...doc, renderedHtml };
  }

  return hydrated;
}

export async function getDocsDir(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "../../docs"),
    path.resolve(process.cwd(), "../docs"),
    path.resolve(process.cwd(), "docs"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue
    }
  }

  return candidates[0];
}
