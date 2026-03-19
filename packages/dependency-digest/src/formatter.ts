import {
  bold,
  h1,
  h2,
  h3,
  h4,
  lines,
  link,
  table,
  unorderedList,
} from "markdown-factory";
import type { DependencyMetrics, DigestConfig, DigestOutput } from "./types.js";
import { isLicenseAllowed } from "./config.js";

export function formatDigestAsJson(digest: DigestOutput): string {
  return JSON.stringify(digest, null, 2);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.substring(0, 10);
}

function formatDownloads(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatLicense(
  license: string | null,
  config: DigestConfig,
): string {
  if (!license) return "⚠️ Unknown";
  if (!isLicenseAllowed(license, config)) {
    return `⚠️ ${license}`;
  }
  return license;
}

function npmUrl(packageName: string): string {
  return `https://www.npmjs.com/package/${packageName}`;
}

function isLicenseDenied(
  license: string | null,
  config: DigestConfig,
): boolean {
  if (!license) return true;
  if (config.deniedLicenses?.some(
    (d) => d.toUpperCase() === license.toUpperCase(),
  )) return true;
  return false;
}

function isLicenseNew(
  license: string | null,
  config: DigestConfig,
): boolean {
  if (!license) return false;
  if (!config.allowedLicenses?.length && !config.deniedLicenses?.length) return false;
  const upper = license.toUpperCase();
  const inAllowed = config.allowedLicenses?.some((a) => a.toUpperCase() === upper) ?? false;
  const inDenied = config.deniedLicenses?.some((d) => d.toUpperCase() === upper) ?? false;
  return !inAllowed && !inDenied;
}

function sortDependencies(
  deps: DependencyMetrics[],
  config: DigestConfig,
): DependencyMetrics[] {
  return [...deps].sort((a, b) => {
    // Tier 0: has vulnerabilities (more vulns first)
    const aVuln = a.vulnerabilities.length > 0 ? 1 : 0;
    const bVuln = b.vulnerabilities.length > 0 ? 1 : 0;
    if (aVuln !== bVuln) return bVuln - aVuln;
    if (aVuln && bVuln) {
      const diff = b.vulnerabilities.length - a.vulnerabilities.length;
      if (diff !== 0) return diff;
    }

    // Tier 1: invalid/denied license
    const aDenied = isLicenseDenied(a.license, config) ? 1 : 0;
    const bDenied = isLicenseDenied(b.license, config) ? 1 : 0;
    if (aDenied !== bDenied) return bDenied - aDenied;

    // Tier 2: new/uncategorized license
    const aNew = isLicenseNew(a.license, config) ? 1 : 0;
    const bNew = isLicenseNew(b.license, config) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;

    // Tier 3: download count descending
    return (b.downloads ?? 0) - (a.downloads ?? 0);
  });
}

function summaryTable(
  deps: DependencyMetrics[],
  config: DigestConfig,
): string {
  const sorted = sortDependencies(deps, config);
  const rows = sorted.map((d) => ({
    Package: link(npmUrl(d.name), d.name),
    Version: d.specifier ? `${d.version} (${d.specifier})` : d.version,
    Latest: d.latestVersion,
    License: formatLicense(d.license, config),
    Dev: d.dev ? "✓" : "",
    Transitive: d.transitive ? "✓" : "",
    "Downloads/wk": formatDownloads(d.downloads),
    CVEs:
      d.vulnerabilities.length > 0
        ? `${d.vulnerabilities.length} ⚠️`
        : "0",
  }));

  return table(rows, [
    "Package",
    "Version",
    "Latest",
    "License",
    "Dev",
    "Transitive",
    "Downloads/wk",
    "CVEs",
  ]);
}

function detailSection(
  dep: DependencyMetrics,
  config: DigestConfig,
): string {
  const parts: string[] = [];

  parts.push(h4(`${link(npmUrl(dep.name), dep.name)}@${dep.version}`));

  if (dep.description) {
    parts.push(`> ${dep.description}`);
  }

  const infoItems: string[] = [];
  infoItems.push(
    `${bold("License")}: ${formatLicense(dep.license, config)}`,
  );
  if (dep.specifier) {
    infoItems.push(
      `${bold("Specifier")}: ${dep.specifier} → ${dep.version}`,
    );
  }
  if (dep.repoUrl) {
    infoItems.push(`${bold("Repo")}: ${link(dep.repoUrl, dep.repoUrl)}`);
  }
  infoItems.push(
    `${bold("Latest")}: ${dep.latestVersion} | ${bold("Last major")}: ${formatDate(dep.lastMajorDate)} | ${bold("Last patch")}: ${formatDate(dep.lastPatchDate)}`,
  );
  infoItems.push(
    `${bold("Last commit")}: ${formatDate(dep.lastCommitDate)} | ${bold("Last issue")}: ${formatDate(dep.lastIssueOpened)} | ${bold("Last PR")}: ${formatDate(dep.lastPrOpened)}`,
  );
  infoItems.push(
    `${bold("Open issues")}: ${dep.openIssueCount} | ${bold("Open PRs")}: ${dep.openPrCount} | ${bold("Downloads/wk")}: ${formatDownloads(dep.downloads)}`,
  );
  parts.push(unorderedList(infoItems));

  if (dep.includedBy && dep.includedBy.length > 0) {
    const maxChains = 5;
    const chains = dep.includedBy.slice(0, maxChains).map(
      (chain) => chain.join(" → ") + ` → ${dep.name}@${dep.version}`,
    );
    if (dep.includedBy.length > maxChains) {
      chains.push(`+ ${dep.includedBy.length - maxChains} more`);
    }
    parts.push("", bold("Included by"), unorderedList(chains));
  }

  if (dep.vulnerabilities.length > 0) {
    parts.push(
      "",
      bold("Vulnerabilities"),
      unorderedList(
        dep.vulnerabilities.map((v) => {
          const urlPart = v.url ? ` — ${link(v.url, "Advisory")}` : "";
          return `${bold(v.id)} (${v.severity.toUpperCase()}): ${v.title}${urlPart}`;
        }),
      ),
    );
  }

  if (dep.pinnedIssues.length > 0) {
    parts.push("", bold("Pinned Issues"), unorderedList(dep.pinnedIssues));
  }

  return parts.join("\n");
}

function licenseIssuesSection(
  allDeps: DependencyMetrics[],
  config: DigestConfig,
): string {
  const hasPolicy = (config.allowedLicenses && config.allowedLicenses.length > 0) ||
    (config.compatibleLicenses && config.compatibleLicenses.length > 0);
  if (!hasPolicy) {
    return "";
  }

  const policyList = [
    ...(config.allowedLicenses ?? []),
    ...(config.compatibleLicenses ?? []),
  ].join(", ");

  const disallowed = allDeps.filter(
    (d) => !isLicenseAllowed(d.license, config),
  );

  if (disallowed.length === 0) return "";

  const rows = disallowed.map((d) => ({
    Package: `${d.name}@${d.version}`,
    License: d.license ?? "Unknown",
    Dev: d.dev ? "✓" : "",
    Transitive: d.transitive ? "✓" : "",
  }));

  return [
    h3("⚠️ License Policy Violations"),
    `${disallowed.length} package(s) have licenses not in the allowed list: ${policyList}`,
    "",
    table(rows, ["Package", "License", "Dev", "Transitive"]),
  ].join("\n\n");
}

export function formatDigestAsMarkdown(
  digest: DigestOutput,
  config: DigestConfig = {},
): string {
  const sections: string[] = [h1("Dependency Digest")];

  // License policy violations summary (if configured)
  const allDeps = digest.manifests.flatMap((m) => m.dependencies);
  const licenseSection = licenseIssuesSection(allDeps, config);
  if (licenseSection) {
    sections.push(licenseSection);
  }

  for (const manifest of digest.manifests) {
    sections.push(h2(manifest.file));
    sections.push(summaryTable(manifest.dependencies, config));

    const sorted = sortDependencies(manifest.dependencies, config);
    const details = sorted
      .map((d) => detailSection(d, config))
      .filter(Boolean);
    if (details.length > 0) {
      sections.push("", ...details);
    }
  }

  return lines(sections);
}
