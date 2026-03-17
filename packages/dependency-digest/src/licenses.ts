import { cli } from "cli-forge";
import { mkdir, readFile, writeFile } from "fs/promises";
import { table } from "markdown-factory";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { createInterface } from "readline/promises";
import { loadConfig, saveConfig } from "./config.js";
import type { DigestOutput } from "./types.js";

const CACHE_DIR = join(tmpdir(), "digests-cache");
const LAST_RUN_PATH = join(CACHE_DIR, "last-run.json");

export async function saveLastRun(digest: DigestOutput): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(LAST_RUN_PATH, JSON.stringify(digest), "utf-8");
  } catch {
    // cache write failures are non-fatal
  }
}

async function loadLastRun(): Promise<DigestOutput | null> {
  try {
    const content = await readFile(LAST_RUN_PATH, "utf-8");
    return JSON.parse(content) as DigestOutput;
  } catch {
    return null;
  }
}

function collectLicenseCounts(digest: DigestOutput): Map<string, number> {
  const counts = new Map<string, number>();
  for (const manifest of digest.manifests) {
    for (const dep of manifest.dependencies) {
      const license = dep.license ?? "Unknown";
      counts.set(license, (counts.get(license) ?? 0) + 1);
    }
  }
  return counts;
}

const allowCommand = cli("allow", {
  description: "Add licenses to the allowed list",
  builder: (args) =>
    args
      .positional("licenses", {
        type: "array",
        items: "string",
        description: "License identifiers to allow",
      })
      .option("dir", {
        type: "string",
        description: "Project directory (default: cwd)",
        alias: ["d"],
      }),
  handler: async (args) => {
    const dir = resolve(args.dir ?? process.cwd());
    const licenses = args.licenses ?? [];
    if (licenses.length === 0) {
      console.error("No licenses specified.");
      process.exit(1);
    }
    const config = await loadConfig(dir);
    const existing = new Set(
      (config.allowedLicenses ?? []).map((l) => l.toUpperCase()),
    );
    for (const l of licenses) {
      if (!existing.has(l.toUpperCase())) {
        config.allowedLicenses = config.allowedLicenses ?? [];
        config.allowedLicenses.push(l);
      }
    }
    await saveConfig(dir, config);
    console.log(
      `Allowed licenses updated: ${config.allowedLicenses?.join(", ")}`,
    );
  },
});

const denyCommand = cli("deny", {
  description: "Add licenses to the denied list",
  builder: (args) =>
    args
      .positional("licenses", {
        type: "array",
        items: "string",
        description: "License identifiers to deny",
      })
      .option("dir", {
        type: "string",
        description: "Project directory (default: cwd)",
        alias: ["d"],
      }),
  handler: async (args) => {
    const dir = resolve(args.dir ?? process.cwd());
    const licenses = args.licenses ?? [];
    if (licenses.length === 0) {
      console.error("No licenses specified.");
      process.exit(1);
    }
    const config = await loadConfig(dir);
    const existing = new Set(
      (config.deniedLicenses ?? []).map((l) => l.toUpperCase()),
    );
    for (const l of licenses) {
      if (!existing.has(l.toUpperCase())) {
        config.deniedLicenses = config.deniedLicenses ?? [];
        config.deniedLicenses.push(l);
      }
    }
    await saveConfig(dir, config);
    console.log(
      `Denied licenses updated: ${config.deniedLicenses?.join(", ")}`,
    );
  },
});

export const licensesCommand = cli("licenses", {
  description: "View and manage license policies",
  builder: (args) =>
    args
      .option("interactive", {
        type: "boolean",
        default: false,
        alias: ["i"],
        description: "Interactively approve or deny unknown licenses",
      })
      .option("dir", {
        type: "string",
        description: "Project directory (default: cwd)",
        alias: ["d"],
      })
      .commands(allowCommand, denyCommand),
  handler: async (args) => {
    const digest = await loadLastRun();
    if (!digest) {
      console.error(
        "No scan data found. Run `dependency-digest` first to generate a scan.",
      );
      process.exit(1);
    }

    const licenseCounts = collectLicenseCounts(digest);

    if (!args.interactive) {
      const rows = [...licenseCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([license, count]) => ({
          License: license,
          "Package Count": String(count),
        }));

      console.log(table(rows, ["License", "Package Count"]));
      return;
    }

    // Interactive mode
    const dir = resolve(args.dir ?? process.cwd());
    const config = await loadConfig(dir);
    const allowedSet = new Set(
      (config.allowedLicenses ?? []).map((l) => l.toUpperCase()),
    );
    const deniedSet = new Set(
      (config.deniedLicenses ?? []).map((l) => l.toUpperCase()),
    );

    const unknownLicenses = [...licenseCounts.keys()].filter(
      (l) =>
        !allowedSet.has(l.toUpperCase()) && !deniedSet.has(l.toUpperCase()),
    );

    if (unknownLicenses.length === 0) {
      console.log("All licenses are already categorized.");
      return;
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      for (const license of unknownLicenses) {
        const count = licenseCounts.get(license) ?? 0;
        const answer = await rl.question(
          `License "${license}" (${count} package${count !== 1 ? "s" : ""}): (a)llow / (d)eny / (s)kip? `,
        );

        const choice = answer.trim().toLowerCase();
        if (choice === "a" || choice === "allow") {
          config.allowedLicenses = config.allowedLicenses ?? [];
          config.allowedLicenses.push(license);
        } else if (choice === "d" || choice === "deny") {
          config.deniedLicenses = config.deniedLicenses ?? [];
          config.deniedLicenses.push(license);
        }
      }
    } finally {
      rl.close();
    }

    await saveConfig(dir, config);
    console.log("Config updated.");
  },
});
