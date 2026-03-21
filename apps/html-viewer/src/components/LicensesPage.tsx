import { useMemo, useState } from 'react';
import type { DependencyMetrics } from '../types.js';
import styles from './LicensesPage.module.css';

interface LicensesPageProps {
  deps: DependencyMetrics[];
}

interface LicenseGroup {
  license: string;
  deps: DependencyMetrics[];
}

export function LicensesPage({ deps }: LicensesPageProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groups = useMemo<LicenseGroup[]>(() => {
    const map = new Map<string, DependencyMetrics[]>();
    for (const dep of deps) {
      const key = dep.license ?? 'Unknown';
      const list = map.get(key) ?? [];
      list.push(dep);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([license, deps]) => ({ license, deps }))
      .sort((a, b) => b.deps.length - a.deps.length);
  }, [deps]);

  const maxCount = groups[0]?.deps.length ?? 1;

  const unknownCount = groups
    .filter((g) => g.license === 'Unknown')
    .reduce((sum, g) => sum + g.deps.length, 0);

  const toggleGroup = (license: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(license)) {
        next.delete(license);
      } else {
        next.add(license);
      }
      return next;
    });
  };

  const scrollToGroup = (license: string) => {
    setExpandedGroups((prev) => new Set(prev).add(license));
    // Small delay to let the DOM expand before scrolling
    requestAnimationFrame(() => {
      const el = document.getElementById(`license-${license}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className={styles.page}>
      {unknownCount > 0 && (
        <div className={styles.warning}>
          <strong>{unknownCount}</strong> {unknownCount === 1 ? 'dependency has' : 'dependencies have'} no
          detected license.
        </div>
      )}

      <h2 className={styles.sectionTitle}>License Distribution</h2>
      <div className={styles.chart}>
        {groups.map((group) => (
          <button
            key={group.license}
            className={styles.chartRow}
            onClick={() => scrollToGroup(group.license)}
          >
            <span className={styles.chartLabel}>{group.license}</span>
            <div className={styles.chartBarTrack}>
              <div
                className={`${styles.chartBar} ${group.license === 'Unknown' ? styles.chartBarWarning : ''}`}
                style={{ width: `${(group.deps.length / maxCount) * 100}%` }}
              />
            </div>
            <span className={styles.chartCount}>{group.deps.length}</span>
          </button>
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Dependencies by License</h2>
      <div className={styles.groups}>
        {groups.map((group) => {
          const isExpanded = expandedGroups.has(group.license);
          return (
            <div
              key={group.license}
              id={`license-${group.license}`}
              className={styles.group}
            >
              <button
                className={styles.groupHeader}
                onClick={() => toggleGroup(group.license)}
              >
                <span className={styles.groupExpand}>
                  {isExpanded ? '▼' : '▶'}
                </span>
                <span
                  className={`${styles.groupLicense} ${group.license === 'Unknown' ? styles.groupWarning : ''}`}
                >
                  {group.license}
                </span>
                <span className={styles.groupBadge}>{group.deps.length}</span>
              </button>
              {isExpanded && (
                <table className={styles.groupTable}>
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Version</th>
                      <th>Dev</th>
                      <th>Transitive</th>
                      <th>Ecosystem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.deps.map((dep) => (
                      <tr key={`${dep.name}@${dep.version}`}>
                        <td className={styles.packageName}>{dep.name}</td>
                        <td>
                          <code className={styles.code}>{dep.version}</code>
                        </td>
                        <td>{dep.dev ? 'Yes' : 'No'}</td>
                        <td>{dep.transitive ? 'Yes' : 'No'}</td>
                        <td>{dep.ecosystem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
