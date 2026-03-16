import {
  h1,
  h2,
  h4,
  bold,
  link,
} from 'markdown-factory';
import type { DependencyMetrics, DigestOutput } from './types.js';

export function formatDigestAsJson(digest: DigestOutput): string {
  return JSON.stringify(digest, null, 2);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.substring(0, 10);
}

function formatDownloads(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function summaryTable(deps: DependencyMetrics[]): string {
  const header =
    '| Package | Version | Latest | Last Major | Last Patch | Last Commit | Downloads/wk | CVEs |';
  const separator =
    '|---------|---------|--------|------------|------------|-------------|--------------|------|';
  const rows = deps.map((d) => {
    const cveCount = d.vulnerabilities.length;
    const cveCell = cveCount > 0 ? `${cveCount} ⚠️` : '0';
    return `| ${d.name} | ${d.currentVersion} | ${d.latestVersion} | ${formatDate(d.lastMajorDate)} | ${formatDate(d.lastPatchDate)} | ${formatDate(d.lastCommitDate)} | ${formatDownloads(d.downloads)} | ${cveCell} |`;
  });
  return [header, separator, ...rows].join('\n');
}

function detailSection(dep: DependencyMetrics): string {
  const hasNotableFindings =
    dep.vulnerabilities.length > 0 || dep.pinnedIssues.length > 0;

  if (!hasNotableFindings) return '';

  const parts: string[] = [];

  parts.push(h4(`${dep.name} — Details`));

  if (dep.repoUrl) {
    parts.push(`- ${bold('Repo')}: ${link(dep.repoUrl, dep.repoUrl)}`);
  }

  parts.push(
    `- ${bold('Last issue opened')}: ${formatDate(dep.lastIssueOpened)} | ${bold('Last closed')}: ${formatDate(dep.lastIssueClosed)}`
  );
  parts.push(
    `- ${bold('Last PR opened')}: ${formatDate(dep.lastPrOpened)} | ${bold('Last closed')}: ${formatDate(dep.lastPrClosed)}`
  );
  parts.push(
    `- ${bold('Open issues')}: ${dep.openIssueCount} | ${bold('Open PRs')}: ${dep.openPrCount}`
  );

  if (dep.vulnerabilities.length > 0) {
    parts.push(
      '',
      bold('Vulnerabilities'),
      ...dep.vulnerabilities.map((v) => {
        const urlPart = v.url ? ` — ${link(v.url, 'Advisory')}` : '';
        return `- **${v.id}** (${v.severity.toUpperCase()}): ${v.title}${urlPart}`;
      })
    );
  }

  if (dep.pinnedIssues.length > 0) {
    parts.push(
      '',
      bold('Pinned Issues'),
      ...dep.pinnedIssues.map((title) => `- ${title}`)
    );
  }

  return parts.join('\n');
}

export function formatDigestAsMarkdown(digest: DigestOutput): string {
  const sections: string[] = [h1('Dependency Digest')];

  for (const manifest of digest.manifests) {
    for (const [group, deps] of Object.entries(manifest.groups)) {
      sections.push(h2(`${manifest.file} (${group})`));
      sections.push(summaryTable(deps));

      const details = deps.map(detailSection).filter(Boolean);
      if (details.length > 0) {
        sections.push('', ...details);
      }
    }
  }

  return sections.join('\n\n');
}
