import { ArgumentsOf, cli } from "cli-forge";
import { mkdir, readFile, writeFile } from "fs/promises";
import { table } from "markdown-factory";
import { tmpdir } from "os";
import { join } from "path";
import { digestCLI } from "./cli.js";
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
    const licenses = args.licenses ?? [];
    if (licenses.length === 0) {
      console.error("No licenses specified.");
      process.exit(1);
    }
    await digestCLI.updateConfig((config) => {
      const existing = new Set(
        (config.allowedLicenses ?? []).map((l: string) => l.toUpperCase()),
      );
      const allowedLicenses = [...(config.allowedLicenses ?? [])];
      for (const l of licenses) {
        if (!existing.has(l.toUpperCase())) {
          allowedLicenses.push(l);
        }
      }
      return { ...config, allowedLicenses };
    });
    console.log(`Allowed licenses updated: ${licenses.join(", ")}`);
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
    const licenses = args.licenses ?? [];
    if (licenses.length === 0) {
      console.error("No licenses specified.");
      process.exit(1);
    }
    await digestCLI.updateConfig((config) => {
      const existing = new Set(
        (config.deniedLicenses ?? []).map((l: string) => l.toUpperCase()),
      );
      const deniedLicenses = [...(config.deniedLicenses ?? [])];
      for (const l of licenses) {
        if (!existing.has(l.toUpperCase())) {
          deniedLicenses.push(l);
        }
      }
      return { ...config, deniedLicenses };
    });
    console.log(`Denied licenses updated: ${licenses.join(", ")}`);
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

    const config = args as typeof args & ArgumentsOf<typeof digestCLI>;
    const allowedSet = new Set(
      (config.allowedLicenses ?? []).map((l: string) => l.toUpperCase()),
    );
    const deniedSet = new Set(
      (config.deniedLicenses ?? []).map((l: string) => l.toUpperCase()),
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

    const clack = await import("@clack/prompts");

    clack.intro("License Policy Review");

    const toAllow = await clack.multiselect({
      message: "Select licenses to ALLOW (space to toggle, enter to confirm)",
      options: unknownLicenses.map((l) => ({
        value: l,
        label: `${l} (${licenseCounts.get(l)} packages)`,
      })),
      required: false,
    });

    if (clack.isCancel(toAllow)) {
      clack.cancel("Cancelled.");
      return;
    }

    const allowedChoices = new Set(toAllow as string[]);
    const remaining = unknownLicenses.filter((l) => !allowedChoices.has(l));

    let deniedChoices: string[] = [];
    if (remaining.length > 0) {
      const toDeny = await clack.multiselect({
        message: "Select licenses to DENY (unselected will be skipped)",
        options: remaining.map((l) => ({
          value: l,
          label: `${l} (${licenseCounts.get(l)} packages)`,
        })),
        required: false,
      });

      if (clack.isCancel(toDeny)) {
        clack.cancel("Cancelled.");
        return;
      }
      deniedChoices = toDeny as string[];
    }

    if (allowedChoices.size > 0 || deniedChoices.length > 0) {
      await digestCLI.updateConfig((config) => {
        if (allowedChoices.size > 0) {
          config.allowedLicenses = [...(config.allowedLicenses ?? [])];
          for (const l of allowedChoices) {
            if (!allowedSet.has(l.toUpperCase())) {
              config.allowedLicenses.push(l);
            }
          }
        }
        if (deniedChoices.length > 0) {
          config.deniedLicenses = [...(config.deniedLicenses ?? [])];
          for (const l of deniedChoices) {
            if (!deniedSet.has(l.toUpperCase())) {
              config.deniedLicenses.push(l);
            }
          }
        }
        // return updated;
      });
      const skipped = remaining.filter((l) => !deniedChoices.includes(l));
      clack.outro(
        `Updated: ${allowedChoices.size} allowed, ${deniedChoices.length} denied, ${skipped.length} skipped.`,
      );
    } else {
      clack.outro("No changes made.");
    }
  },
});
