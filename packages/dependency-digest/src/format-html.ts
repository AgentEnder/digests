import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedTemplate: string | null = null;

async function loadTemplate(): Promise<string> {
  if (cachedTemplate) return cachedTemplate;
  const templatePath = join(__dirname, "html-template.html");
  cachedTemplate = await readFile(templatePath, "utf-8");
  return cachedTemplate;
}

/**
 * Returns the HTML viewer template as a string.
 * The viewer expects a `digest.json` file in the same directory.
 */
export async function formatDigestAsHtml(): Promise<string> {
  return loadTemplate();
}
