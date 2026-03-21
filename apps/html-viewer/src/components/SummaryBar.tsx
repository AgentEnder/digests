import type { DependencyMetrics } from '../types.js';
import styles from './SummaryBar.module.css';

interface SummaryBarProps {
  deps: DependencyMetrics[];
}

export function SummaryBar({ deps }: SummaryBarProps) {
  const total = deps.length;
  const prodCount = deps.filter((d) => !d.dev).length;
  const devCount = deps.filter((d) => d.dev).length;
  const directCount = deps.filter((d) => !d.transitive).length;
  const transitiveCount = deps.filter((d) => d.transitive).length;

  const vulnDeps = deps.filter((d) => d.vulnerabilities.length > 0);
  const vulnCount = vulnDeps.length;
  const criticalCount = deps.reduce(
    (acc, d) => acc + d.vulnerabilities.filter((v) => v.severity === 'critical').length,
    0,
  );
  const highCount = deps.reduce(
    (acc, d) => acc + d.vulnerabilities.filter((v) => v.severity === 'high').length,
    0,
  );

  const licenses = new Set(deps.map((d) => d.license).filter(Boolean));

  const outdatedCount = deps.filter(
    (d) => d.latestVersion && d.version !== d.latestVersion && d.latestVersion !== 'unknown',
  ).length;

  return (
    <div className={styles.bar}>
      <div className={styles.card}>
        <div className={styles.value}>{total}</div>
        <div className={styles.label}>Dependencies</div>
        <div className={styles.detail}>
          {prodCount} prod / {devCount} dev
        </div>
        <div className={styles.detail}>
          {directCount} direct / {transitiveCount} transitive
        </div>
      </div>

      <div className={`${styles.card} ${vulnCount > 0 ? styles.cardDanger : ''}`}>
        <div className={styles.value}>{vulnCount}</div>
        <div className={styles.label}>Vulnerable</div>
        {(criticalCount > 0 || highCount > 0) && (
          <div className={styles.detail}>
            {criticalCount > 0 && <span className={styles.critical}>{criticalCount} critical</span>}
            {criticalCount > 0 && highCount > 0 && ' / '}
            {highCount > 0 && <span className={styles.high}>{highCount} high</span>}
          </div>
        )}
      </div>

      <div className={`${styles.card} ${outdatedCount > 0 ? styles.cardWarning : ''}`}>
        <div className={styles.value}>{outdatedCount}</div>
        <div className={styles.label}>Outdated</div>
      </div>

      <div className={styles.card}>
        <div className={styles.value}>{licenses.size}</div>
        <div className={styles.label}>Licenses</div>
      </div>
    </div>
  );
}
