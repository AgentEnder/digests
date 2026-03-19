import type {
  DependencyDigestPlugin,
  DependencyMetrics,
  DigestOutput,
  ManifestDigest,
  ParsedDependency,
} from './types.js';

export interface ScanOptions {
  dir: string;
  plugins: DependencyDigestPlugin[];
  token?: string;
  concurrency?: number;
  excludePatterns?: string[];
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  phase: 'detect' | 'parse' | 'fetch';
  plugin: string;
  manifest?: string;
  current: number;
  total: number;
  dependency?: string;
}

async function fetchWithConcurrency(
  deps: ParsedDependency[],
  plugin: DependencyDigestPlugin,
  token: string | undefined,
  concurrency: number,
  onProgress?: (current: number, total: number, name: string) => void
): Promise<DependencyMetrics[]> {
  const results: DependencyMetrics[] = [];
  const queue = [...deps];
  let completed = 0;
  const total = deps.length;

  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const dep = queue.shift();
        if (!dep) break;
        try {
          const metrics = await plugin.fetchMetrics(dep, token);
          results.push(metrics);
        } catch (err) {
          console.error(
            `Failed to fetch metrics for ${dep.name}@${dep.version}:`,
            err
          );
        }
        completed++;
        onProgress?.(completed, total, dep.name);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

function matchesExclude(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('*')) {
      return name.startsWith(pattern.slice(0, -1));
    }
    return name === pattern;
  });
}

export async function scan(options: ScanOptions): Promise<DigestOutput> {
  const {
    dir,
    plugins,
    token,
    concurrency = 5,
    excludePatterns = [],
    onProgress,
  } = options;

  const manifests: ManifestDigest[] = [];

  for (const plugin of plugins) {
    onProgress?.({ phase: 'detect', plugin: plugin.name, current: 0, total: 0 });
    const manifestFiles = await plugin.detect(dir);

    for (const manifest of manifestFiles) {
      onProgress?.({ phase: 'parse', plugin: plugin.name, manifest: manifest.path, current: 0, total: 0 });
      const { dependencies: allDeps, edges } = await plugin.parseDependencies(manifest);

      const filteredDeps = allDeps.filter(
        (d) => !matchesExclude(d.name, excludePatterns)
      );

      const dependencies = await fetchWithConcurrency(
        filteredDeps,
        plugin,
        token,
        concurrency,
        onProgress
          ? (current, total, name) =>
              onProgress({ phase: 'fetch', plugin: plugin.name, manifest: manifest.path, current, total, dependency: name })
          : undefined
      );

      manifests.push({
        file: manifest.path,
        ecosystem: plugin.ecosystem,
        dependencies,
        edges,
      });
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    manifests,
  };
}
