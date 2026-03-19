/**
 * Syncs `repository`, `license`, `author`, and `bugs` fields from the root
 * package.json into every packages/* /package.json.
 *
 * The per-package `repository.directory` is derived from the package path.
 *
 * Usage:  npx tsx scripts/sync-package-metadata.ts [--check]
 *   --check   Report drift without writing (exits 1 if any package is out of sync)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYNCED_FIELDS = ["license", "author", "bugs"] as const;

interface PackageJson {
  name: string;
  license?: string;
  author?: unknown;
  bugs?: unknown;
  repository?: {
    type: string;
    url: string;
    directory?: string;
  };
  [key: string]: unknown;
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const repoRoot = join(__dirname, "..");
const checkOnly = process.argv.includes("--check");

const rootPkg = readJson(join(repoRoot, "package.json"));
const packagesDir = join(repoRoot, "packages");

const packageDirs = readdirSync(packagesDir).filter((entry) =>
  statSync(join(packagesDir, entry)).isDirectory()
);

let driftFound = false;

for (const dir of packageDirs) {
  const pkgPath = join(packagesDir, dir, "package.json");

  let pkg: PackageJson;
  try {
    pkg = readJson(pkgPath);
  } catch {
    continue; // skip directories without a package.json
  }

  const diffs: string[] = [];

  // Sync simple fields
  for (const field of SYNCED_FIELDS) {
    const rootValue = rootPkg[field];
    if (rootValue === undefined) continue;

    if (!deepEqual(pkg[field], rootValue)) {
      diffs.push(field);
      pkg[field] = rootValue;
    }
  }

  // Sync repository (with per-package directory)
  if (rootPkg.repository) {
    const expectedRepo = {
      ...rootPkg.repository,
      directory: relative(repoRoot, join(packagesDir, dir)),
    };

    if (!deepEqual(pkg.repository, expectedRepo)) {
      diffs.push("repository");
      pkg.repository = expectedRepo;
    }
  }

  if (diffs.length === 0) {
    console.log(`✅ ${pkg.name} — in sync`);
    continue;
  }

  driftFound = true;

  if (checkOnly) {
    console.log(`❌ ${pkg.name} — out of sync: ${diffs.join(", ")}`);
  } else {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`🔧 ${pkg.name} — synced: ${diffs.join(", ")}`);
  }
}

if (checkOnly && driftFound) {
  console.log("\nRun `npx tsx scripts/sync-package-metadata.ts` to fix.");
  process.exit(1);
}
