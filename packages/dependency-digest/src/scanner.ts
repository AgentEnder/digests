import type {
  DependencyDigestPlugin,
  DependencyMetrics,
  DigestOutput,
  ManifestDigest,
  ParsedDependency,
} from './types.js';

interface ScanOptions {
  dir: string;
  plugins: DependencyDigestPlugin[];
  token?: string;
  concurrency?: number;
  excludePatterns?: string[];
}

async function fetchWithConcurrency(
  deps: ParsedDependency[],
  plugin: DependencyDigestPlugin,
  token: string | undefined,
  concurrency: number
): Promise<DependencyMetrics[]> {
  const results: DependencyMetrics[] = [];
  const queue = [...deps];

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
  } = options;

  const manifests: ManifestDigest[] = [];

  for (const plugin of plugins) {
    const manifestFiles = await plugin.detect(dir);

    for (const manifest of manifestFiles) {
      const allDeps = await plugin.parseDependencies(manifest);

      const filteredDeps = allDeps.filter(
        (d) => !matchesExclude(d.name, excludePatterns)
      );

      const dependencies = await fetchWithConcurrency(
        filteredDeps,
        plugin,
        token,
        concurrency
      );

      manifests.push({
        file: manifest.path,
        ecosystem: plugin.ecosystem,
        dependencies,
      });
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    manifests,
  };
}
