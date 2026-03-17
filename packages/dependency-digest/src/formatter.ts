import {
  bold,
  h1,
  h2,
  h4,
  lines,
  link,
  table,
  unorderedList,
} from "markdown-factory";
import type { DependencyMetrics, DigestOutput } from "./types.js";

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

function summaryTable(deps: DependencyMetrics[]): string {
  const rows = deps.map((d) => ({
    Package: d.name,
    Version: d.specifier ? `${d.version} (${d.specifier})` : d.version,
    Latest: d.latestVersion,
    License: d.license ?? "—",
    Dev: d.dev ? "✓" : "",
    Transitive: d.transitive ? "✓" : "",
    "Downloads/wk": formatDownloads(d.downloads),
    CVEs: d.vulnerabilities.length > 0 ? `${d.vulnerabilities.length} ⚠️` : "0",
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

function detailSection(dep: DependencyMetrics): string {
  const parts: string[] = [];

  parts.push(h4(`${dep.name}@${dep.version}`));

  if (dep.description) {
    parts.push(`> ${dep.description}`);
  }

  const infoItems: string[] = [];
  infoItems.push(`${bold("License")}: ${dep.license ?? "Unknown"}`);
  if (dep.specifier) {
    infoItems.push(`${bold("Specifier")}: ${dep.specifier} → ${dep.version}`);
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

export function formatDigestAsMarkdown(digest: DigestOutput): string {
  const sections: string[] = [h1("Dependency Digest")];

  for (const manifest of digest.manifests) {
    sections.push(h2(manifest.file));
    sections.push(summaryTable(manifest.dependencies));

    const details = manifest.dependencies.map(detailSection).filter(Boolean);
    if (details.length > 0) {
      sections.push("", ...details);
    }
  }

  return lines(sections);
}
