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
    Version: d.version,
    Latest: d.latestVersion,
    Dev: d.dev ? "✓" : "",
    Transitive: d.transitive ? "✓" : "",
    "Last Major": formatDate(d.lastMajorDate),
    "Last Patch": formatDate(d.lastPatchDate),
    "Last Commit": formatDate(d.lastCommitDate),
    "Downloads/wk": formatDownloads(d.downloads),
    CVEs: d.vulnerabilities.length > 0 ? `${d.vulnerabilities.length} ⚠️` : "0",
  }));

  return table(rows, [
    "Package",
    "Version",
    "Latest",
    "Dev",
    "Transitive",
    "Last Major",
    "Last Patch",
    "Last Commit",
    "Downloads/wk",
    "CVEs",
  ]);
}

function detailSection(dep: DependencyMetrics): string {
  const hasNotableFindings =
    dep.vulnerabilities.length > 0 || dep.pinnedIssues.length > 0;

  if (!hasNotableFindings) return "";

  const parts: string[] = [];

  parts.push(h4(`${dep.name} — Details`));

  const infoItems: string[] = [];
  if (dep.repoUrl) {
    infoItems.push(`${bold("Repo")}: ${link(dep.repoUrl, dep.repoUrl)}`);
  }
  infoItems.push(
    `${bold("Last issue opened")}: ${formatDate(dep.lastIssueOpened)}`,
  );
  infoItems.push(
    `${bold("Last PR opened")}: ${formatDate(dep.lastPrOpened)}`,
  );
  infoItems.push(
    `${bold("Open issues")}: ${dep.openIssueCount} | ${bold("Open PRs")}: ${dep.openPrCount}`,
  );
  parts.push(unorderedList(infoItems));

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
