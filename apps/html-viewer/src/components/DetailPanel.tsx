import type { DependencyMetrics } from '../types.js';
import styles from './DetailPanel.module.css';

interface DetailPanelProps {
  dep: DependencyMetrics;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function formatNumber(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString();
}

export function DetailPanel({ dep }: DetailPanelProps) {
  return (
    <div className={styles.panel}>
      {dep.description && <p className={styles.description}>{dep.description}</p>}

      <div className={styles.grid}>
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Package Info</h4>
          <dl className={styles.dl}>
            <dt>Ecosystem</dt>
            <dd>{dep.ecosystem}</dd>
            <dt>PURL</dt>
            <dd><code className={styles.code}>{dep.purl}</code></dd>
            {dep.author && (
              <>
                <dt>Author</dt>
                <dd>{dep.author}</dd>
              </>
            )}
            {dep.repoUrl && (
              <>
                <dt>Repository</dt>
                <dd>
                  <a href={dep.repoUrl} target="_blank" rel="noopener noreferrer">
                    {dep.repoUrl}
                  </a>
                </dd>
              </>
            )}
            {dep.registryUrl && (
              <>
                <dt>Registry</dt>
                <dd>
                  <a href={dep.registryUrl} target="_blank" rel="noopener noreferrer">
                    {dep.registryUrl}
                  </a>
                </dd>
              </>
            )}
          </dl>
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Activity</h4>
          <dl className={styles.dl}>
            <dt>Last commit</dt>
            <dd>{formatDate(dep.lastCommitDate)}</dd>
            <dt>Last issue</dt>
            <dd>{formatDate(dep.lastIssueOpened)}</dd>
            <dt>Last PR</dt>
            <dd>{formatDate(dep.lastPrOpened)}</dd>
            <dt>Open issues</dt>
            <dd>{formatNumber(dep.openIssueCount)}</dd>
            <dt>Open PRs</dt>
            <dd>{formatNumber(dep.openPrCount)}</dd>
          </dl>
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Versions</h4>
          <dl className={styles.dl}>
            <dt>Installed</dt>
            <dd><code className={styles.code}>{dep.version}</code></dd>
            {dep.specifier && (
              <>
                <dt>Specifier</dt>
                <dd><code className={styles.code}>{dep.specifier}</code></dd>
              </>
            )}
            <dt>Latest</dt>
            <dd><code className={styles.code}>{dep.latestVersion}</code></dd>
            <dt>Last major</dt>
            <dd>{formatDate(dep.lastMajorDate)}</dd>
            <dt>Last patch</dt>
            <dd>{formatDate(dep.lastPatchDate)}</dd>
          </dl>
        </div>
      </div>

      {dep.vulnerabilities.length > 0 && (
        <div className={styles.vulnSection}>
          <h4 className={styles.sectionTitle}>Vulnerabilities</h4>
          <div className={styles.vulnList}>
            {dep.vulnerabilities.map((v) => (
              <div key={v.id} className={`${styles.vuln} ${styles[v.severity]}`}>
                <span className={styles.vulnSeverity}>{v.severity}</span>
                <span className={styles.vulnTitle}>
                  {v.url ? (
                    <a href={v.url} target="_blank" rel="noopener noreferrer">
                      {v.id}: {v.title}
                    </a>
                  ) : (
                    `${v.id}: ${v.title}`
                  )}
                </span>
                {v.patchedVersion && (
                  <span className={styles.vulnPatch}>
                    Fixed in {v.patchedVersion}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {dep.includedBy && dep.includedBy.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Included By</h4>
          <ul className={styles.chainList}>
            {dep.includedBy.map((chain, i) => (
              <li key={i} className={styles.chain}>
                {chain.join(' → ')} → <strong>{dep.name}@{dep.version}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
