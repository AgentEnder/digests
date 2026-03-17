import { cli } from "cli-forge";
import { mkdir, readFile, writeFile } from "fs/promises";
import { table } from "markdown-factory";
import { tmpdir } from "os";
import { join, resolve } from "path";
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

    const dir = resolve(args.dir ?? process.cwd());
    const config = await loadConfig(dir);
    const allowedSet = new Set(
      (config.allowedLicenses ?? []).map((l) => l.toUpperCase()),
    );
    const deniedSet = new Set(
      (config.deniedLicenses ?? []).map((l) => l.toUpperCase()),
    );

    function licenseStatus(license: string): string {
      const upper = license.toUpperCase();
      if (allowedSet.has(upper)) return "allowed";
      if (deniedSet.has(upper)) return "denied";
      return "new";
    }

    if (!args.interactive) {
      const rows = [...licenseCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([license, count]) => ({
          License: license,
          Status: licenseStatus(license),
          "Package Count": String(count),
        }));

      console.log(table(rows, ["License", "Status", "Package Count"]));
      return;
    }

    // Interactive mode
    const unknownLicenses = [...licenseCounts.keys()].filter(
      (l) =>
        !allowedSet.has(l.toUpperCase()) && !deniedSet.has(l.toUpperCase()),
    );

    if (unknownLicenses.length === 0) {
      console.log("All licenses are already categorized.");
      return;
    }

    // enquirer's types don't expose MultiSelect, but it exists at runtime
    const enquirer = await import("enquirer");
    const MultiSelect = (enquirer as Record<string, unknown>)
      .MultiSelect as new (opts: {
      name: string;
      message: string;
      choices: Array<{ name: string; message: string }>;
    }) => { run(): Promise<string[]> };

    const choices = unknownLicenses.map((l) => ({
      name: l,
      message: `${l} (${licenseCounts.get(l)} packages)`,
    }));

    const toAllow: string[] = await new MultiSelect({
      name: "allow",
      message: "Select licenses to ALLOW (space to toggle, enter to confirm)",
      choices,
    }).run();

    const remaining = unknownLicenses.filter((l) => !toAllow.includes(l));

    let toDeny: string[] = [];
    if (remaining.length > 0) {
      toDeny = await new MultiSelect({
        name: "deny",
        message:
          "Select licenses to DENY (space to toggle, enter to confirm, unselected will be skipped)",
        choices: remaining.map((l) => ({
          name: l,
          message: `${l} (${licenseCounts.get(l)} packages)`,
        })),
      }).run();
    }

    if (toAllow.length > 0) {
      config.allowedLicenses = config.allowedLicenses ?? [];
      for (const l of toAllow) {
        if (!allowedSet.has(l.toUpperCase())) {
          config.allowedLicenses.push(l);
        }
      }
    }

    if (toDeny.length > 0) {
      config.deniedLicenses = config.deniedLicenses ?? [];
      for (const l of toDeny) {
        if (!deniedSet.has(l.toUpperCase())) {
          config.deniedLicenses.push(l);
        }
      }
    }

    if (toAllow.length > 0 || toDeny.length > 0) {
      await saveConfig(dir, config);
      const skipped = remaining.filter((l) => !toDeny.includes(l));
      console.log(
        `\nUpdated: ${toAllow.length} allowed, ${toDeny.length} denied, ${skipped.length} skipped.`,
      );
    } else {
      console.log("No changes made.");
    }
  },
});
