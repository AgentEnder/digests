import { useMemo } from 'react';
import { useDigestData } from './use-digest-data.js';
import { useHashRoute } from './use-hash-route.js';
import { NavTabs } from './components/NavTabs.js';
import { SummaryBar } from './components/SummaryBar.js';
import { DataTable } from './components/DataTable.js';
import { LicensesPage } from './components/LicensesPage.js';
import { GraphPage } from './components/GraphPage.js';
import { UploadPrompt } from './components/UploadPrompt.js';
import type { DependencyMetrics, DigestOutput } from './types.js';
import styles from './App.module.css';

export function App() {
  const { state, loadFromFile } = useDigestData();
  const [route, navigate] = useHashRoute();

  const allDeps = useMemo<DependencyMetrics[]>(() => {
    if (state.status !== 'loaded') return [];
    return state.data.manifests.flatMap((m) => m.dependencies);
  }, [state]);

  const allEdges = useMemo<Record<string, string[]>>(() => {
    if (state.status !== 'loaded') return {};
    const merged: Record<string, string[]> = {};
    for (const manifest of state.data.manifests) {
      for (const [key, deps] of Object.entries(manifest.edges)) {
        merged[key] = deps;
      }
    }
    return merged;
  }, [state]);

  if (state.status === 'loading') {
    return (
      <div className={styles.loading}>
        <p>Loading digest data...</p>
      </div>
    );
  }

  if (state.status === 'needs-upload') {
    return (
      <UploadPrompt
        fetchError={state.fetchError}
        onFileSelect={loadFromFile}
      />
    );
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dependency Digest</h1>
        <span className={styles.timestamp}>
          Scanned {new Date(state.data.scannedAt).toLocaleDateString()}
        </span>
      </header>
      <NavTabs active={route} onNavigate={navigate} />
      {route === 'deps' && (
        <>
          <SummaryBar deps={allDeps} />
          <DataTable deps={allDeps} />
        </>
      )}
      {route === 'licenses' && <LicensesPage deps={allDeps} />}
      {route === 'graph' && <GraphPage deps={allDeps} edges={allEdges} />}
    </div>
  );
}
